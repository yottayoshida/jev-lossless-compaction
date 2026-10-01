# 0010. A mark says the plugin is running, and classic hooks say when it is missing

- Status: Accepted
- Date: 2026-10-01

## Context

The plugin runs through function hooks. With them off, or with its module not
loaded for any other reason, a compaction is Claude Code's own: the
conversation is replaced by a summary, and nothing on the screen says the
plugin did not run. The README answered with "No such line after a compaction
means function hooks are off", which relies on noticing a line that is not
there. On 2026-10-01 a session compacted that way at about 967,000 tokens,
took 74.3 s, and showed nothing.

What a module cannot do, a classic hook can: it runs whether or not function
hooks are on. It has to be told that the module runs.

Measured on Claude Code 2.1.286 with a probe plugin, in `claude -p` runs:

- A variable a module sets with `$.env.set` in `session.start` is seen by the
  classic `UserPromptSubmit`, `PreCompact` and post-compaction `SessionStart`
  hooks of the same process, and still after `/clear`. The classic
  `SessionStart` at startup runs before the module and does not see it.
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` does not tell: unset, Claude Code's
  rollout decides.
- The variable is inherited by a `claude` started from the session. With the
  value `1`, a child whose module is off looks as if it ran.
- In the module, `$.env.get('CLAUDE_PID')` is the parent session's id when
  nested, and `process` is not available. The parent id of a command the
  module runs (`sh -c 'echo $PPID'`) is the process's own id, and equals the
  `CLAUDE_PID` a classic hook is handed.
- A classic `PreCompact` hook that exits 2 stops the compaction: nothing is
  compacted, and its stderr is shown. Its input holds `trigger` and
  `session_id`. Its stdout is added to the instructions of the built-in
  summary: a line written there ended up in the summary.
- A `systemMessage` returned by the `SessionStart` hook that follows a
  compaction is shown as a notice, the same kind of line as the plugin's own,
  and is not in the summary.

Measured afterwards with the hook itself, interactively and with `-p`: a
held `/compact` and the line after one that went ahead are shown on the
screen; an automatic compaction, brought about by lowering
`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, hands `PreCompact` the trigger `auto` and
is followed by the `SessionStart` with the source `compact`. When the module
compacts by itself the classic `PreCompact` hook does not run at all; it
runs when the module hands the conversation to the built-in compaction, and
then finds the mark. The `SessionStart` that follows runs after either, and
finds the mark too.

Not measured: the moments right after `/reload-plugins` or an enable.

## Decision

1. In `session.start`, before anything else, the module sets
   `LOSSLESS_COMPACTION_RUNNING` to the id of its process, read as the parent
   id of `sh -c 'echo $PPID'`. When that cannot be read as a number the value
   is `any`. A failure here stops nothing else.
2. A classic hook, `hooks/notice.sh`, written in POSIX sh with no external
   command, judges "running": with `CLAUDE_PID` handed to it, the mark equals
   it or is `any`; without, the mark is not empty.
3. On `PreCompact`, not running and `trigger` is `manual`: the `/compact` is
   held. The hook writes its process id and the session id to `held` under
   the plugin's data directory, says on stderr what to change and that
   running `/compact` again in that session goes ahead, and exits 2. A
   `/compact` goes through when its process id is in `held`, or its session
   id is there twice: the conversation reopened once is held once more, since
   that is what the notice tells its reader to do after adding the setting,
   and a setting that did not take must not let the summary run on that
   path. Without `CLAUDE_PID`, when `held` cannot be written or read or is a
   link, and for any other trigger, nothing is held. Nothing is written to
   stdout.
4. On the `SessionStart` that follows a compaction (matcher `compact`), not
   running: one `systemMessage` says the compaction was Claude Code's own and
   names the setting.
5. `held` is one file; past fifty lines it is emptied and written again.
6. A second change adds the same notice at the first prompt, so that an
   automatic compaction is not the first time it is said.

## Alternatives Considered

- **Decide by `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`.** Wrong in both directions
  when it is unset.
- **The mark as `1`.** A child `claude` inherits it and stays silent. (That a
  repository's settings can set the mark holds for any value, `any` and the
  process's own id included; it silences the hooks and decides nothing
  else.)
- **The id from `CLAUDE_PID` in the module.** The parent's when nested, so a
  running child would be held.
- **The mark as a file per session id.** `/clear` changes the id and
  `session.start` does not fire again.
- **Remember a held `/compact` by process id alone.** `claude -p --resume …
  "/compact"` is a new process each time and would never go through.
- **Let a conversation through once it was held anywhere.** The notice says to
  add the setting, reopen the conversation and run `/compact`: reopened, it
  would go through whether or not the plugin runs by then.
- **Fall back to `$PPID` in the hook.** Not measured, and when it differs
  every `/compact` is held.
- **Say it on `PreCompact`'s stdout.** It becomes part of the summary.
- **Hold every `/compact`, or hold automatic compactions.** The first leaves
  no way to go ahead, the second lets the conversation overflow.
- **Say it only at the first prompt.** A session resumed and compacted at once
  is past it before a prompt is sent; slash commands do not pass
  `UserPromptSubmit`.

## Consequences

- In a session where the plugin is enabled and not running, a `/compact` is
  held the first time, and a compaction that goes ahead is followed by a line.
- Not reached: a session that was open before the plugin was installed (its
  hooks are not loaded there either), a setup that turns all hooks off, a
  module that ran and was unloaded later, and a mark of `any` inherited by a
  child where no `sh` was found.
- Someone who keeps function hooks off on purpose is held in every
  conversation, once in a process and once more when it is reopened, unless
  they set the mark to `any` themselves.
- One more variable is in the environment of everything the session starts.
- The plugin leans on two things the type definitions do not promise: that a
  classic hook sees what `$.env.set` wrote, and that it is handed
  `CLAUDE_PID`. If the first goes, a running session is told after every
  compaction that the plugin was not running, and a `/compact` it hands to
  the built-in compaction is held; if the second goes, nothing is held and
  the line after a compaction is all that is said. The same holds where `sh`
  is started through something that stands between it and Claude Code, which
  was not met. None of it can be tested in CI, so two live runs go with
  every version (`docs/development.md`).
