import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FIRST_WAIT_MS,
  GC_EVERY_MS,
  GRACE_MS,
  YOUNG_MS,
  collect,
  dayOf,
  idsIn,
  liveIds,
  noteRoot,
  noteRun,
  planGc,
  restore,
  RETRY_MS,
  SENTINEL_ID,
  noteTried,
  rootFor,
  sentinelOf,
  stateIn,
  ticketIds,
  trashIn,
  whyNotNow,
  writeSentinel,
} from '../src/lifetime.ts';
import { idOf, ticketText } from '../src/store.ts';
import type { DirEntry, Exec } from '../src/types.ts';
import { MemoryFiles, output } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const DIR = '/home/u/.claude/lossless-compaction';
const ROOT = '/home/u/.claude/projects';

const blobEntry = (id: string, age: number): DirEntry => ({ name: `${id}.txt`, kind: 'file', mtimeMs: NOW - age, isLink: false });
const hex = (seed: string) => seed.repeat(64).slice(0, 64);

/** The host's commands, run against `files` the way grep, mv, mkdir and rm treat them. */
function commands(
  files: MemoryFiles,
  options: { grepExit?: number; truncated?: boolean; refuse?: readonly string[]; dropSentinel?: boolean; mvExit?: number } = {},
) {
  const ran: string[][] = [];
  const exec: Exec = async (argv) => {
    ran.push([...argv]);
    const [program = '', ...args] = argv;
    const name = program.slice(program.lastIndexOf('/') + 1);
    if (options.refuse?.includes(name)) throw new Error(`cannot start ${program}`);
    const operands = args.slice(args.indexOf('--') + 1);
    if (name === 'grep') {
      // Each operand is a directory searched below, or a file read as it is.
      const lines: string[] = [];
      for (const [path, text] of files.files) {
        const named = operands.some((operand) => path === operand || path.startsWith(`${operand}/`));
        if (named && path.endsWith('.jsonl')) lines.push(...(text.match(/[0-9a-f]{64}/g) ?? []));
      }
      if (options.dropSentinel) lines.splice(0, lines.length, ...lines.filter((line) => line !== SENTINEL_ID));
      return { exitCode: options.grepExit ?? (lines.length > 0 ? 0 : 1), stdout: lines.map((line) => `${line}\n`).join(''), truncated: options.truncated === true };
    }
    if (name === 'mkdir') {
      // -p: every directory up to it, as the real one makes them.
      for (const dir of operands) {
        for (let cut = dir.length; cut > 0; cut = dir.lastIndexOf('/', cut - 1)) files.dirs.add(dir.slice(0, cut));
      }
      return { exitCode: 0, stdout: '', truncated: false };
    }
    if (name === 'mv') {
      // A mv that fails on every path, as a full disk or a refused permission makes BSD mv exit 1.
      if (options.mvExit !== undefined) return { exitCode: options.mvExit, stdout: '', truncated: false };
      const dest = (operands.pop() ?? '').replace(/\/$/, '');
      let exitCode = 0;
      for (const source of operands) {
        const text = files.files.get(source);
        const target = `${dest}/${source.slice(source.lastIndexOf('/') + 1)}`;
        if (text === undefined || !files.dirs.has(dest)) {
          exitCode = 1;
          continue;
        }
        if (files.files.has(target)) continue;
        files.files.delete(source);
        files.files.set(target, text);
        const mtime = files.mtimes.get(source);
        if (mtime !== undefined) files.mtimes.set(target, mtime);
      }
      return { exitCode, stdout: '', truncated: false };
    }
    if (name === 'rm') {
      for (const path of operands) files.files.delete(path);
      return { exitCode: 0, stdout: '', truncated: false };
    }
    return { exitCode: 127, stdout: '', truncated: false };
  };
  return { exec, ran };
}

const list = (files: MemoryFiles) => (path: string) => files.list(path);
const existsIn = (files: MemoryFiles) => async (path: string) => files.stat(path).then(() => true, () => false);
const SENTINEL = sentinelOf(DIR);

/** A store holding `texts` as moved-out results, each `age` old. */
async function storeWith(files: MemoryFiles, texts: readonly string[], age: number): Promise<string[]> {
  const ids: string[] = [];
  for (const text of texts) {
    const id = await idOf(text);
    await files.write(`${DIR}/blobs/${id}.txt`, text);
    await files.write(`${DIR}/index/${id}.json`, JSON.stringify({ bytes: text.length, tool: 'Read' }));
    files.mtimes.set(`${DIR}/blobs/${id}.txt`, NOW - age);
    ids.push(id);
  }
  files.dirs.add(`${DIR}/blobs`);
  files.dirs.add(`${DIR}/index`);
  return ids;
}

test('a result over a day old that no transcript names goes to the trash; a young one and a named one stay', () => {
  const [old, young, named] = [hex('a'), hex('b'), hex('c')];
  const plan = planGc([blobEntry(old, 2 * DAY), blobEntry(young, YOUNG_MS - 1), blobEntry(named, 30 * DAY)], [], new Set([named]), NOW);
  assert.deepEqual(plan, { toTrash: [old], toRestore: [], toRemove: [] });
});

test('the trash is aged by the day of its directory, not by the file: a move keeps a file old', () => {
  const id = hex('d');
  // Moved today, though written a month ago: not removed.
  assert.deepEqual(planGc([], [{ day: dayOf(NOW), id }], new Set(), NOW).toRemove, []);
  // Moved more than the grace period ago, and named by none: removed.
  assert.deepEqual(planGc([], [{ day: dayOf(NOW - GRACE_MS - DAY), id }], new Set(), NOW).toRemove, [{ day: dayOf(NOW - GRACE_MS - DAY), id }]);
  // Named again: put back, whatever its day.
  assert.deepEqual(planGc([], [{ day: dayOf(NOW - GRACE_MS - DAY), id }], new Set([id]), NOW), {
    toTrash: [],
    toRestore: [{ day: dayOf(NOW - GRACE_MS - DAY), id }],
    toRemove: [],
  });
});

test('a link or a stray name in blobs/ is never a result to move', () => {
  const link: DirEntry = { name: `${hex('e')}.txt`, kind: 'other', mtimeMs: 0, isLink: true };
  const stray: DirEntry = { name: 'notes.txt', kind: 'file', mtimeMs: 0, isLink: false };
  assert.deepEqual(planGc([link, stray], [], new Set(), NOW).toTrash, []);
});

test('the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all', async () => {
  const files = new MemoryFiles();
  const [a, b] = [hex('1'), hex('2')];
  await files.write(`${ROOT}/-proj-one/s1.jsonl`, `{"text":"recall with x id ${a}"}`);
  await files.write(`${ROOT}/-proj-two/s2.jsonl`, `{"text":"[found] id ${b}"}`);
  await files.write(`${ROOT}/-proj-two/s2.txt`, `${hex('9')}`);
  await writeSentinel(files, DIR);
  const live = await liveIds(files, list(files), commands(files).exec, existsIn(files), [ROOT, '/gone/projects'], SENTINEL);
  assert.ok(!('stop' in live));
  assert.deepEqual([...live.ids].sort(), [a, b], 'the sentinel is not an id in use');
  assert.deepEqual(live.roots, [ROOT]);

  const stopsWith = async (options: Parameters<typeof commands>[1]) =>
    JSON.stringify(await liveIds(files, list(files), commands(files, options).exec, existsIn(files), [ROOT], SENTINEL));
  assert.match(await stopsWith({ grepExit: 2 }), /did not read all/);
  // A grep ended by a signal reads as 1, which is also "nothing matched": with the sentinel, nothing-matched cannot happen.
  assert.match(await stopsWith({ grepExit: 1 }), /did not read all/);
  assert.match(await stopsWith({ dropSentinel: true }), /did not read all/);
  assert.match(await stopsWith({ truncated: true }), /more than one search/);
  assert.match(await stopsWith({ refuse: ['grep'] }), /grep did not run to the end.*cannot start/);
});

test('a place that is there but cannot be looked at or listed stops it all: its conversations may still be resumed', async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-proj/s.jsonl`, hex('3'));
  await writeSentinel(files, DIR);
  const refusing = async (path: string) => {
    if (path === ROOT) throw new Error('EACCES');
    return files.list(path);
  };
  assert.deepEqual(await liveIds(files, refusing, commands(files).exec, existsIn(files), [ROOT], SENTINEL), { stop: `${ROOT} could not be listed` });
  // There, by exists, but stat fails as it would on EACCES or a disk gone away: not taken for gone.
  const blind = Object.assign(Object.create(files) as MemoryFiles, { stat: async () => Promise.reject(new Error('EACCES')) });
  assert.deepEqual(await liveIds(blind, list(files), commands(files).exec, existsIn(files), [ROOT], SENTINEL), { stop: `${ROOT} could not be looked at` });
});

test('with every recorded place gone, nothing is collected: an empty set would name nothing in use', async () => {
  const files = new MemoryFiles();
  await writeSentinel(files, DIR);
  assert.match(JSON.stringify(await liveIds(files, list(files), commands(files).exec, existsIn(files), ['/gone/a', '/gone/b'], SENTINEL)), /none of the places/);
});

test('a project directory that is a link stops it all: a search does not follow it', async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-real/s.jsonl`, hex('4'));
  files.links.set(`${ROOT}/-linked`, '/elsewhere');
  await writeSentinel(files, DIR);
  assert.match(JSON.stringify(await liveIds(files, list(files), commands(files).exec, existsIn(files), [ROOT], SENTINEL)), /is a link/);
});

test('a collection moves what no transcript names to the trash, and a week later removes it', async () => {
  const files = new MemoryFiles();
  const [kept, dropped] = await storeWith(files, [output('kept', 40), output('dropped', 40)], 3 * DAY);
  const { exec } = commands(files);

  const first = await collect(list(files), exec, DIR, new Set([kept as string]), NOW);
  assert.deepEqual(first, { trashed: 1, restored: 0, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${kept}.txt`) && files.files.has(`${DIR}/index/${kept}.json`));
  const day = dayOf(NOW);
  assert.ok(files.files.has(`${DIR}/trash/${day}/${dropped}.txt`) && files.files.has(`${DIR}/trash/${day}/${dropped}.json`));
  assert.ok(!files.files.has(`${DIR}/blobs/${dropped}.txt`) && !files.files.has(`${DIR}/index/${dropped}.json`));

  // Still in the trash the next day: not removed yet.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([kept as string]), NOW + DAY), { trashed: 0, restored: 0, removed: 0 });
  // A week and a day later, named by none: removed, blob and entry.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([kept as string]), NOW + GRACE_MS + DAY), {
    trashed: 0,
    restored: 0,
    removed: 1,
  });
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes('/trash/')), []);
});

test('a result in the trash that a transcript names again goes back at the next collection', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('back', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + GRACE_MS + DAY), { trashed: 0, restored: 1, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`) && files.files.has(`${DIR}/index/${id}.json`));
});

test('a result written again while its old copy sat in the trash leaves no copy behind there', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('again', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  // A compaction moved the same text out again: the blob is back in place, the old copy still in the trash.
  await storeWith(files, [output('again', 40)], 0);
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + DAY), { trashed: 0, restored: 1, removed: 0 });
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes('/trash/')), []);
  // And the next collection has nothing more to say about it.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + 2 * DAY), { trashed: 0, restored: 0, removed: 0 });
});

test('an entry whose move back failed stays in the trash, though its blob went back', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('entry', 40)], 3 * DAY);
  const day = dayOf(NOW);
  const base = commands(files);
  await collect(list(files), base.exec, DIR, new Set(), NOW);
  // Putting back: the blob moves, the entry's mv fails and exits 1, as BSD mv does on any failure.
  const failingEntry: Exec = async (argv, timeoutMs) =>
    argv[0]?.endsWith('/mv') && argv.some((arg) => arg.endsWith('.json')) ? { exitCode: 1, stdout: '', truncated: false } : base.exec(argv, timeoutMs);
  await collect(list(files), failingEntry, DIR, new Set([id as string]), NOW + DAY);
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`), 'the blob is back');
  assert.ok(files.files.has(`${DIR}/trash/${day}/${id}.json`), 'the entry is not lost');
  // The next time it can be put back.
  assert.equal(await restore(list(files), base.exec, DIR, new Set([id as string])), 1);
  assert.ok(files.files.has(`${DIR}/index/${id}.json`));
});

test('what a collection reports is what moved: a mv that exits 1 having moved nothing reports nothing', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('stuck', 40)], 3 * DAY);
  assert.deepEqual(await collect(list(files), commands(files, { mvExit: 1 }).exec, DIR, new Set(), NOW), { trashed: 0, restored: 0, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`));
});

test('a collection cut off before its end is tried again a day later, not a week', async () => {
  const files = new MemoryFiles();
  files.dirs.add(`${DIR}/roots`);
  await noteRoot(files, DIR, ROOT, NOW - FIRST_WAIT_MS);
  const before = await stateIn(files, list(files), [DIR]);
  await noteTried(files, DIR, before, NOW);
  const tried = await stateIn(files, list(files), [DIR]);
  assert.match(whyNotNow(tried, NOW + RETRY_MS - 1) ?? '', /tried less than a day ago/);
  assert.equal(whyNotNow(tried, NOW + RETRY_MS), null);
});

test('recall puts back from the trash what it is asked for, even a result whose move stopped halfway', async () => {
  const files = new MemoryFiles();
  const [whole, half] = await storeWith(files, [output('whole', 40), output('half', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  // As if the second move had not happened: the entry went to the trash, the blob stayed.
  const day = dayOf(NOW);
  files.files.set(`${DIR}/blobs/${half}.txt`, files.files.get(`${DIR}/trash/${day}/${half}.txt`) as string);
  files.files.delete(`${DIR}/trash/${day}/${half}.txt`);
  assert.deepEqual(
    (await trashIn(list(files), DIR))?.map((item) => item.id).sort(),
    [whole, half].sort(),
    'an entry alone counts as in the trash',
  );

  assert.equal(await restore(list(files), exec, DIR, new Set([whole as string, half as string])), 2);
  for (const id of [whole, half]) {
    assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`), `blob ${id}`);
    assert.ok(files.files.has(`${DIR}/index/${id}.json`), `entry ${id}`);
  }
});

test('a collection that cannot move, empty or make the trash stops and says so, and leaves results where they are', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('stays', 40)], 3 * DAY);
  const refused = await collect(list(files), commands(files, { refuse: ['mv', 'mkdir'] }).exec, DIR, new Set(), NOW);
  assert.ok('stop' in refused);
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`));
});

test('the commands are run by absolute path, with -- before every path', async () => {
  const files = new MemoryFiles();
  await storeWith(files, [output('x', 40)], 3 * DAY);
  const { exec, ran } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  for (const argv of ran) {
    assert.match(argv[0] ?? '', /^\/(usr\/)?bin\//);
    assert.ok(argv.includes('--'), argv.join(' '));
  }
});

test('nothing is collected until a place is known, for a week after the first was found, or within a week of the last run', async () => {
  const files = new MemoryFiles();
  files.dirs.add(DIR);
  assert.match(whyNotNow(await stateIn(files, list(files), [DIR]), NOW) ?? '', /no place/);

  await noteRoot(files, DIR, ROOT, NOW);
  await noteRoot(files, DIR, ROOT, NOW + DAY); // Written once: the first time stands.
  files.dirs.add(`${DIR}/roots`);
  const state = await stateIn(files, list(files), [DIR]);
  assert.deepEqual(state, { roots: [ROOT], firstSeen: NOW, lastRun: 0, tried: 0 });
  assert.match(whyNotNow(state, NOW + FIRST_WAIT_MS - 1) ?? '', /first week/);
  assert.equal(whyNotNow(state, NOW + FIRST_WAIT_MS), null);

  await noteRun(files, DIR, NOW + FIRST_WAIT_MS);
  const ran = await stateIn(files, list(files), [DIR]);
  assert.match(whyNotNow(ran, NOW + FIRST_WAIT_MS + GC_EVERY_MS - 1) ?? '', /less than a week/);
  assert.equal(whyNotNow(ran, NOW + FIRST_WAIT_MS + GC_EVERY_MS), null);
});

test('places recorded by every configuration that shares the store are read, from each directory read', async () => {
  const files = new MemoryFiles();
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  for (const dir of [DIR, OLD]) files.dirs.add(`${dir}/roots`);
  await noteRoot(files, DIR, ROOT, NOW);
  await noteRoot(files, OLD, '/other/config/projects', NOW - DAY);
  const state = await stateIn(files, list(files), [DIR, OLD]);
  assert.deepEqual(state.roots.sort(), ['/home/u/.claude/projects', '/other/config/projects']);
  assert.equal(state.firstSeen, NOW - DAY);
});

test("the place of this session's transcript is recorded only when a project directory holds it", async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-repo/abc-123.jsonl`, '{}');
  files.dirs.add(ROOT);
  assert.equal(await rootFor(files, list(files), '/home/u/.claude', 'abc-123'), ROOT);
  assert.equal(await rootFor(files, list(files), '/home/u/.claude', 'other'), null);
  assert.equal(await rootFor(files, list(files), '/home/u/.claude', '../x'), null);
  assert.equal(await rootFor(new MemoryFiles(), list(new MemoryFiles()), '/home/u/.claude', 'abc-123'), null);
});

test('the ids of tickets in a conversation, in either place a ticket stands', async () => {
  const id = await idOf('x');
  const line = ticketText({ tool: 'Read', bytes: 1, id });
  const ids = ticketIds([
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't', tool: 'Read', input: {}, text: line }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: line, isError: false }] },
    { role: 'user', text: `not a ticket ${hex('f')}`, toolUses: [] },
  ]);
  assert.deepEqual([...ids], [id]);
});

test('what grep prints is read a line at a time, and only 64-hex lines count', () => {
  assert.deepEqual([...idsIn(`${hex('a')}\nnot\n${hex('b')}\n${hex('a')}\n`)].sort(), [hex('a'), hex('b')]);
});
