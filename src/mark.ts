// The mark the plugin leaves in its process, so that a classic hook, which
// runs whether or not function hooks are on, can tell that it runs (ADR 0010).

import type { Exec } from './types.ts';

/** The variable the mark is in. `hooks/notice.sh` reads the same name. */
export const MARK = 'LOSSLESS_COMPACTION_RUNNING';

/** The mark when the process's id could not be read: counted as running, by this process and by any it starts. */
export const ANY = 'any';

/**
 * The id of the process the plugin runs in, as the mark holds it: the parent
 * of a command the plugin starts, which is what a classic hook is handed as
 * `CLAUDE_PID`. The module's own `CLAUDE_PID` is its parent session's when one
 * `claude` starts another, and a mark that a child inherits must not count
 * for the child. `ANY` when no `sh` starts or what it prints is not an id.
 */
export async function ownProcessId(exec: Exec, places: readonly string[]): Promise<string> {
  for (const place of places) {
    try {
      const { exitCode, stdout } = await exec([`${place}/sh`, '-c', 'echo "$PPID"'], 2000);
      const id = stdout.trim();
      if (exitCode === 0 && /^[1-9][0-9]*$/.test(id)) return id;
    } catch {
      // The next place.
    }
  }
  return ANY;
}
