// What `/lossless-store` says of the places results are kept in (ADR 0016):
// how much is kept, by what it was kept from, in the trash and left in
// `tmp/`, and how the clean-up has gone. It is counted from what the host
// lists of the directories, with sizes and times, from the index entries,
// which hold a size and a tool's name and nothing of a result, and from the
// clean-up's own record. No stored result is opened.

import { listed, whyNotNow, FIRST_WAIT_MS, type GcState, type List, type StopKind } from './lifetime.ts';
import { PART, PLUGIN, isOwnTool } from './store.ts';
import type { DirEntry, Files } from './types.ts';

export type Tally = { count: number; bytes: number };

/** What one place results are read from holds. */
export type Counted =
  | {
      dir: string;
      results: Tally & { oldest: number | null; newest: number | null };
      /** By what each result was kept from, as its entry says. */
      from: { results: Tally; parts: Tally; own: Tally; unknown: Tally };
      entries: Tally;
      trash: (Tally & { day: string })[];
      /** What a write left in `tmp/`, and of it, what is over a day old. */
      tmp: Tally & { stale: number };
    }
  | { dir: string; missing: true };

/** A place the clean-up skips is not counted either: not there, a link, or not a directory. */
export function skipped(dir: string): Counted {
  return { dir, missing: true };
}

const DAY = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const filesIn = (entries: readonly DirEntry[] | null) => (entries ?? []).filter((entry) => entry.kind === 'file' && !entry.isLink);
const tally = (entries: readonly DirEntry[]): Tally => ({ count: entries.length, bytes: entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0) });

/** Counts one place. An entry that cannot be read is counted as from nothing known; a result is never read. */
export async function countStore(files: Files, list: List, dir: string, now: number): Promise<Counted> {
  const top = await listed(list, dir);
  if (top === null) return { dir, missing: true };
  const blobs = filesIn(await listed(list, `${dir}/blobs`)).filter((entry) => entry.name.endsWith('.txt'));
  const entries = filesIn(await listed(list, `${dir}/index`)).filter((entry) => entry.name.endsWith('.json'));
  const from = { results: zero(), parts: zero(), own: zero(), unknown: zero() };
  const sizeOf = new Map(blobs.map((entry) => [entry.name.slice(0, -'.txt'.length), entry.size ?? 0]));
  for (const entry of entries) {
    const id = entry.name.slice(0, -'.json'.length);
    const bytes = sizeOf.get(id);
    if (bytes === undefined) continue;
    let tool: unknown;
    try {
      tool = (JSON.parse(await files.read(`${dir}/index/${entry.name}`)) as { tool?: unknown }).tool;
    } catch {
      tool = undefined;
    }
    const into = typeof tool !== 'string' ? from.unknown : tool === PART ? from.parts : isOwnTool(tool) ? from.own : from.results;
    into.count += 1;
    into.bytes += bytes;
  }
  // A result without an entry is counted too: a write may have stopped between the two.
  const entered = new Set(entries.map((entry) => entry.name.slice(0, -'.json'.length)));
  for (const [id, bytes] of sizeOf) {
    if (entered.has(id)) continue;
    from.unknown.count += 1;
    from.unknown.bytes += bytes;
  }
  const times = blobs.map((entry) => entry.mtimeMs);
  const trash: (Tally & { day: string })[] = [];
  for (const day of await listed(list, `${dir}/trash`) ?? []) {
    if (day.kind !== 'dir' || day.isLink || !DATE.test(day.name)) continue;
    trash.push({ day: day.name, ...tally(filesIn(await listed(list, `${dir}/trash/${day.name}`))) });
  }
  const tmp = filesIn(await listed(list, `${dir}/tmp`));
  return {
    dir,
    results: { ...tally(blobs), oldest: times.length > 0 ? Math.min(...times) : null, newest: times.length > 0 ? Math.max(...times) : null },
    from,
    entries: tally(entries),
    trash: trash.sort((a, b) => a.day.localeCompare(b.day)),
    tmp: { ...tally(tmp), stale: tmp.filter((entry) => now - entry.mtimeMs > DAY).length },
  };
}

function zero(): Tally {
  return { count: 0, bytes: 0 };
}

/** What each kind of stop is said as: no path, nothing a command printed. */
export const STOP_SAID: Record<StopKind, string> = {
  unread: 'the transcripts could not be read to the end',
  'too-many': 'one directory of transcripts held more ids than one search can return',
  place: 'a place transcripts are kept in is gone, or could not be looked at or listed',
  part: 'a kept part of a conversation could not be read',
  trash: 'the trash could not be listed, made or emptied',
  move: 'results could not be moved to or from the trash',
  unexpected: 'an error the clean-up does not name',
};

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const timeText = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const dayText = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const tallyText = (one: Tally) => `${one.count} (${sizeText(one.bytes)})`;

/**
 * What `/lossless-store` answers: each place results are read from, then the
 * clean-up. `setByStoreDir` says the place was chosen by the `storeDir`
 * setting, so no other place is read. Claude Code puts the plugin's name in
 * front of it, so it does not.
 */
export function storeReport(counted: readonly Counted[], gc: GcState, now: number, setByStoreDir: boolean): string {
  const lines: string[] = [`Results are kept in ${counted.length === 1 ? 'one place' : `${counted.length} places`}${setByStoreDir ? ', set by storeDir' : ''}:`];
  for (const one of counted) {
    lines.push('', one.dir);
    if ('missing' in one) {
      lines.push('  not there, or not a plain directory');
      continue;
    }
    const span = one.results.oldest === null || one.results.newest === null ? '' : `, ${dayText(one.results.oldest)} to ${dayText(one.results.newest)}`;
    lines.push(`  results: ${tallyText(one.results)}${span}; their entries: ${tallyText(one.entries)}`);
    lines.push(
      `  kept from: tool results ${tallyText(one.from.results)}, conversations before a summary ${tallyText(one.from.parts)}, ` +
        `${PLUGIN}'s own tools ${tallyText(one.from.own)}` +
        (one.from.unknown.count > 0 ? `, no readable entry ${tallyText(one.from.unknown)}` : ''),
    );
    const trashed = one.trash.reduce((sum, day) => ({ count: sum.count + day.count, bytes: sum.bytes + day.bytes }), zero());
    lines.push(
      `  trash: ${one.trash.length === 0 ? 'empty' : `${tallyText(trashed)} files, by day moved there: ${one.trash.map((day) => `${day.day} ${tallyText(day)}`).join(', ')}`}`,
    );
    lines.push(
      `  tmp/: ${one.tmp.count === 0 ? 'empty' : `${tallyText(one.tmp)} files` + (one.tmp.stale > 0 ? `, ${one.tmp.stale} over a day old, left by a write that stopped; those can be removed by hand` : '')}`,
    );
  }
  lines.push('', 'clean-up:');
  lines.push(`  last ended: ${gc.lastRun > 0 ? timeText(gc.lastRun) : 'never'}; last tried: ${gc.tried > 0 ? timeText(gc.tried) : 'never'}`);
  lines.push(`  tried since it last ended: ${gc.tries}${gc.stopped === null ? '' : `; last stopped ${timeText(gc.stopped.at)}: ${STOP_SAID[gc.stopped.kind]}`}`);
  const why = whyNotNow(gc, now);
  if (why === 'the first week after transcripts were found is waited out') {
    lines.push(`  next: not before ${timeText(gc.firstSeen + FIRST_WAIT_MS)}, the first week after transcripts were found`);
  } else {
    lines.push(`  next: ${why ?? 'tried when a session starts, once the place results are kept in is made private'}`);
  }
  lines.push('', 'Results are plain text on this machine (docs/limits.md, "The files").');
  return lines.join('\n');
}
