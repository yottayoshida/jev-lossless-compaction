// The host's own commands, as the plugin runs them: by an absolute path, so
// that no `PATH` a repository sets picks the program. The hook spells out the
// host call that starts one (`$.process.run`) and hands it in; what is done
// with what it returns is here.

import type { FileStat, Mover } from './types.ts';

/** `/bin` first; NixOS has only `/usr/bin`, or neither. */
export const PLACES = ['/bin', '/usr/bin'] as const;

/** Starts a command by its argument vector; rejects when it cannot be started. */
export type Start<R> = (argv: readonly string[]) => Promise<R>;

/** What `program` came to, run from the first of `PLACES` it starts in; null when it starts in neither. */
export async function firstOf<R>(start: Start<R>, program: string, args: readonly string[]): Promise<R | null> {
  for (const place of PLACES) {
    try {
      return await start([`${place}/${program}`, ...args]);
    } catch {
      // Not there, or no commands at all on this host: the next place, then none.
    }
  }
  return null;
}

// That `mv` can be started on this host, once it has been (ADR 0008). That it could not is not kept:
// a start refused once, by load or by another hook, is asked again at the next write.
let canMove = false;

/**
 * How a stored result is moved into place with `mv`, so that a write the disk
 * refuses never cuts short what is already there (ADR 0008). `start` runs a
 * command, `stat` looks at a path without following a link.
 */
export function moverOf(start: Start<{ exitCode: number }>, stat: (path: string) => Promise<FileStat>): Mover {
  const exitOf = async (program: string, args: readonly string[]) => (await firstOf(start, program, args))?.exitCode ?? null;
  return {
    // Started at all is enough: without operands `mv` only prints its usage.
    available: async () => (canMove ||= (await exitOf('mv', [])) !== null),
    rename: async (from, to) => {
      if ((await exitOf('mv', ['-f', '--', from, to])) !== 0) return false;
      const there = await stat(to).catch(() => null);
      if (there !== null && there.kind === 'file' && there.isLink !== true) return true;
      // A directory at `to` takes `from` inside it and still exits 0: take it out again.
      await exitOf('rm', ['-f', '--', `${to}/${from.slice(from.lastIndexOf('/') + 1)}`]);
      return false;
    },
    makeDir: async (path) => void (await exitOf('mkdir', ['-p', '--', path])),
    // What cannot be removed stays in tmp/.
    remove: async (path) => void (await exitOf('rm', ['-f', '--', path])),
  };
}

/** For tests: forgets that `mv` was seen to start. */
export function forgetMove(): void {
  canMove = false;
}
