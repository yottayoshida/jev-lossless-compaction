// Making the directory results are kept in readable by its owner alone, before
// anything is written to it.
//
// The host's file system has no mkdir and no chmod, so both are run as
// commands. A directory of mode 0700 lets no other user reach what is in it,
// whatever the modes of the files inside (as with ~/.ssh), so the files are
// left as the host writes them: a command per file would cost more than a
// compaction does. What cannot be made private is not written to.

import { firstOf, type Start } from './commands.ts';
import type { FileStat, Files } from './types.ts';

/** Runs a command by its argument vector and resolves with its exit code; rejects when it cannot be started. */
export type Run = Start<{ exitCode: number }>;

const WINDOWS = /^[A-Za-z]:[\\/]/;

async function statOf(files: Files, path: string): Promise<FileStat | null> {
  try {
    return await files.stat(path);
  } catch {
    return null;
  }
}

/** The exit code of the first of `/bin/<name>`, `/usr/bin/<name>` that starts, or null when neither does. */
async function runFirst(run: Run, name: string, args: readonly string[]): Promise<number | null> {
  return (await firstOf(run, name, args))?.exitCode ?? null;
}

const parentOf = (dir: string): string => dir.slice(0, Math.max(dir.lastIndexOf('/'), 1));

/**
 * Makes `dir` a directory of mode 0700, creating it when it is not there.
 * Resolves with null when it is one, or with why it could not be made one.
 *
 * Whether the mode is 0700 afterwards cannot be read back: the host's stat has
 * no mode. That `chmod` succeeded is what says so, and that it succeeds only
 * for the owner is what says the directory is yours. On Windows nothing is
 * changed: the profile's access control is what keeps others out.
 */
export async function ensurePrivate(files: Files, run: Run, dir: string): Promise<string | null> {
  if (WINDOWS.test(dir)) return null;
  const found = await statOf(files, dir);
  if (found?.isLink === true) return `${dir} is a symbolic link`;
  if (found && found.kind !== 'dir') return `${dir} is not a directory`;
  if (!found) {
    const parent = await runFirst(run, 'mkdir', ['-p', '--', parentOf(dir)]);
    if (parent === null) return 'no mkdir could be run to make it';
    const made = await runFirst(run, 'mkdir', ['-m', '700', '--', dir]);
    // Another session may have made it meanwhile; what counts is what is there now.
    const now = await statOf(files, dir);
    if (made !== 0 && (now === null || now.isLink === true || now.kind !== 'dir')) return `${dir} could not be made`;
  }
  // `--` before the mode: BSD chmod stops reading options at the mode and takes a `--` after it for a file.
  const closed = await runFirst(run, 'chmod', ['--', '700', dir]);
  if (closed === null) return 'no chmod could be run to make it readable by you alone';
  if (closed !== 0) return `${dir} could not be made readable by you alone (not yours?)`;
  const after = await statOf(files, dir);
  if (after === null || after.isLink === true || after.kind !== 'dir') return `${dir} changed while it was being made private`;
  return null;
}

/** What `closeStore` found: why nothing may be written, if so, and what could not be closed besides. */
export type Closed = { refused: string | null; warnings: string[] };

/**
 * The directory written to, made private or refused: nothing is written
 * unless it is. Each other directory read from that is there as a plain
 * directory is closed too, and when that fails it is said and nothing else
 * changes: whether results can be written safely depends on the one written
 * to alone. A file or a link where an old directory was is left alone; it
 * is read from as it always was.
 */
export async function closeStore(files: Files, run: Run, store: { write: string; read: readonly string[] }): Promise<Closed> {
  const refused = await ensurePrivate(files, run, store.write);
  if (refused !== null) return { refused, warnings: [] };
  const warnings: string[] = [];
  for (const dir of store.read) {
    if (dir === store.write) continue;
    const found = await statOf(files, dir);
    if (found === null || found.isLink === true || found.kind !== 'dir') continue;
    const why = await ensurePrivate(files, run, dir);
    if (why !== null) warnings.push(why);
  }
  return { refused: null, warnings };
}
