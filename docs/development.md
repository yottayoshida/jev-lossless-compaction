# Development

Node 24 or later. There are no runtime dependencies: the plugin runs inside
Claude Code, which has no Node, so `src/` and `hooks/` use web standards only.

```sh
npm ci
npm run typecheck   # src/ and test/
npm test            # node:test, no network and no real files
```

Everything that decides something is in `src/` and is tested there with a file
system and an HTTP client held in memory. `hooks/move-out.ts` only connects
Claude Code's events to `src/`.

## Checks that need Claude Code

These are not run in CI.

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
npm run validate          # the manifest, and which host calls the hook makes
npm run typecheck:hooks   # hooks/ against Claude Code's own type declarations
```

To try a change, load the working tree as a plugin for one session:

```sh
claude --plugin-dir .
```

`typecheck:hooks` reads `.claude-plugin/types/claude-code/index.d.ts`, which
is not in the repository. Claude Code writes it, from the version you have,
the first time it loads the plugin as above.

Run `npm run validate` after every change to `src/` or `hooks/`. When the hook
file or anything it imports does not parse, Claude Code still lists the plugin
as installed but loads no hook from it: the `recall` tool is missing from the
tools, and a `/compact` is held by `hooks/notice.sh`.

`hooks/notice.sh` leans on two things Claude Code's type declarations do not
promise: a classic hook sees a variable the module set with `$.env.set`, and
it is handed `CLAUDE_PID`; and it reads its input by its text
(`"trigger":"manual"`, `"source":"compact"`, `"session_id":"…"`, as 2.1.286
writes them); and that a `systemMessage` from `UserPromptSubmit` is shown and
not sent to the model. No test in CI can see any of these. With every version,
two runs, each a new conversation that has used no tool, so that the module
hands it to the built-in compaction and `PreCompact` runs (when the module
compacts by itself, that hook does not run at all):

```sh
# The module runs: no line at the first message, /compact is not held, and no
# "was not running" line follows.
env -u LOSSLESS_COMPACTION_RUNNING claude --plugin-dir . --settings on.json --debug
# The module does not run, with another process's mark handed down: the first
# message is followed by the line and the second is not, /compact is held, and
# run again in that session it is followed by the line.
env LOSSLESS_COMPACTION_RUNNING=99999 claude --plugin-dir . --settings off.json
```

`on.json` is `{ "enabledPlugins": { "lossless-compaction@lossless-compaction":
false } }`, so that an installed copy does not run next to the working tree;
`off.json` adds `"env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "0" }`, since a
value in settings wins over one set in the shell. The second run's mark is
not its own, so being held there shows the hook telling a mark handed down
from its own.

## What Claude Code requires of the hook file

- `$` may be handed only to a function declared at the top of the file, and
  whole: not `$.fs` on its own.
- Every host call is written out as `$.noun.verb(...)`.
- The tool name a `tool.call` hook matches is written as a literal. A test
  holds it equal to the name the tickets carry.
