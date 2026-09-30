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
as installed but loads no hook from it and says nothing: `/compact` quietly
runs the built-in compaction, and the `recall` tool is missing from the tools.

## What Claude Code requires of the hook file

- `$` may be handed only to a function declared at the top of the file, and
  whole: not `$.fs` on its own.
- Every host call is written out as `$.noun.verb(...)`.
- The tool name a `tool.call` hook matches is written as a literal. A test
  holds it equal to the name the tickets carry.
