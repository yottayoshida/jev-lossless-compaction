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
   automatic compaction is not the first time it is said. (Done:
   see "The notice at the first prompt" below.)

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
  (Since #56 those runs are one command, `npm run check:host`, and "not
  running" is made by a hook file Claude Code does not load.)

## The notice at the first prompt

Decision 6, as it was made:

- A classic `UserPromptSubmit` hook runs `hooks/notice.sh prompt`. Not
  running, judged as in decision 2: it returns one `systemMessage` naming the
  setting and saying to start a new session, and exits 0, so the prompt goes
  on. Once in a process: the hook writes its process id to `told` next to
  `held`, kept by the same rules (a link is not followed; a file that cannot
  be read or written means nothing is said; past fifty lines it is written
  again). Without `CLAUDE_PID`, or without the data directory, nothing is
  said, since it would then be said at every prompt.
- `told` is not `held`: a process told at a prompt is still held at its first
  `/compact`, and a process held is still told at a prompt.
- `/reload-plugins` is not offered as the way out: a session open before the
  plugin was enabled has none of its hooks either, and whether a reload reads
  a setting added under `env` was not measured.

Measured on Claude Code 2.1.286 before it was written:

- The `systemMessage` is shown on the interactive screen ("UserPromptSubmit
  says: …"), kept in the transcript as an attachment, and not sent to the
  model: in `-p` runs with and without it, the input tokens of runs that hit
  the cache were the same (57,142), and the printed result was the same bytes
  in text and JSON output.
- With function hooks on, the mark was in place by the first
  `UserPromptSubmit` in 30 of 30 interactive starts: ten with the prompt on
  the command line, ten typed as soon as the input box showed, ten right
  after `--resume`.
- A session started with a copy of the plugin whose `hooks.json` listed no
  module was told at its first prompt. With the module put back and
  `/reload-plugins` run, the next prompt saw the session's own id as the
  mark, and a `/compact` went through the plugin without being held. So the
  question this ADR left open, the moment after `/reload-plugins`, has its
  answer for that case: `session.start` runs again and sets the mark.
- In a session where the plugin runs, the hook takes about 10 ms for a
  prompt of 500 bytes, 30 ms for 100 KB and 0.3 s for 1 MB, with its input
  piped in as Claude Code hands it: `read` takes a pipe a byte at a time.
- Not measured: an account where the rollout turns function hooks on without
  the variable (the one measured has them off). The hook does not read the
  variable, and a test holds that it says nothing with the mark of its
  process whether the variable is unset, `0` or `1`.
