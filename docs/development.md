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

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1   # for typecheck:hooks and claude --plugin-dir; validate needs it not
npm run validate          # Claude Code's own check of the manifest and the hook file
npm run typecheck:hooks   # hooks/ against Claude Code's own type declarations
```

A change that passes `$` to a function imported from another file, or takes a
noun of `$` out to call it, fails CI: CI runs `claude plugin validate --strict`
with the Claude Code version `.github/workflows/ci.yml` names, and checks on
every run that a copy of the hook file broken that way fails it.
`npm run validate` runs the same (`test/validate.sh`) with the `claude` on
your `PATH`, or the command in `CLAUDE`: the working tree must pass, and each
patch under `test/fixtures/validate/` applied to a copy must fail, where a
copy with none applied passes. It needs no sign-in and no setting. Once a week `.github/workflows/claude-code-latest.yml` runs it
with the newest Claude Code; when that turns red, raise
`CLAUDE_CODE_VERSION` in `ci.yml`. GitHub stops a schedule in a repository
with no activity for 60 days. A patch that no longer applies to the hook file
fails the check: make it again.

What `validate` does not see is held by `npm test` (the tool name a
`tool.call` hook matches, below). `typecheck:hooks` is not run in CI.

To try a change, load the working tree as a plugin for one session:

```sh
claude --plugin-dir .
```

`typecheck:hooks` reads `.claude-plugin/types/claude-code/index.d.ts`, which
is not in the repository. Claude Code writes it, from the version you have,
the first time it loads the plugin as above.

Run `npm run validate` after a change to `src/` or `hooks/` as well, before CI does. When the hook
file or anything it imports does not parse, Claude Code still lists the plugin
as installed but loads no hook from it: the `recall` tool is missing from the
tools, and a `/compact` is held by `hooks/notice.sh`.

`npm run check:host` loads the working tree into the Claude Code you have and
checks, without a person watching, that `recall` is registered, that a
`/compact` of a made-up conversation moves results out and `recall` returns
one of them as it was, and that with the plugin enabled and not running the
first message is told and a `/compact` is held; it prints the version it ran
on. Run it with every new Claude Code and before a release. It signs in as you
do and spends a few cents of Haiku. `node bench/host.ts --plugin-dir <copy>`
runs the checks of the running plugin on another copy (the copy that is not
running is always made from the working tree); given the copy
`test/fixtures/validate/` breaks, they fail.

"Not running" is made the way it was met in #51: a copy of the working tree
whose hook file Claude Code does not load (`pass-to-import.patch` applied),
which still lists the plugin as installed. On Claude Code 2.1.288,
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` set to `0`, in the shell or in the settings
a session is started with, no longer turned function hooks off.

What `hooks/notice.sh` leans on that Claude Code's type declarations do not
promise: a classic hook sees a variable the module set with `$.env.set`, and is
handed `CLAUDE_PID`; it reads its input by its text (`"trigger":"manual"`,
`"source":"compact"`, `"session_id":"…"`); and a `systemMessage` from
`UserPromptSubmit` is shown and not sent to the model. The command sees the
first two: in a running session nothing is told, and in one not running, with
another process's mark handed down, the line comes and the `/compact` is held.
It also checks that every session ran on one Claude Code version and loaded
the plugin once, from the copy checked, not an installed one. What it reads is a session started with
`-p` and `--include-hook-events`. Still for a person to look at, in an
interactive session (`claude --plugin-dir .`): that the line is shown on the
screen, and is not in what the model is sent.

## What Claude Code requires of the hook file

- `$` may be handed only to a function declared at the top of the file, and
  whole: not `$.fs` on its own.
- Every host call is written out as `$.noun.verb(...)`.
- The tool name a `tool.call` hook matches is written as a literal. A test
  holds it equal to the name the tickets carry.

## The README

The README is where a reader decides whether to install the plugin, and it
grows. `test/readme.test.ts` holds it to a page: 120 lines, 850 words, 7
headings under the title and 1 table, the words counted as `wc -w` counts
them. What does not fit goes to `docs/`, and a link stays. It is written in
Markdown alone, with no HTML and no heading made by underlining, so that
nothing in it is left out of the count.

The same test checks what a machine can: that the README's links reach a
file, and a heading where they name one; that links to its headings from
other documents do; and that the names it gives are the ones the code has
(the plugin and marketplace to install, the setting that turns function hooks
on, the tools, the mark of the plugin's lines). The figures it gives are held
to the published units in `test/bench.test.ts`.

What a machine cannot check is read at each release. The line below names
the version the README was last read against. The test fails unless
`package.json`, `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` all name that version, so a version is not
raised without coming here. The test cannot tell that the README was read,
only that this line was set.

README read against version: `0.6.1`

To read it, for the release being made:

1. Go through that release's entries in the CHANGELOG. Does one make a
   sentence of the README false, or call for one that is not there?
2. Do the quick start as written, in a new session. `npm run check:host`
   shows the plugin working in the Claude Code you have; it does not run the
   two commands that install it.
3. For each figure, find the measurement it is from and the model it was
   taken with. The README gives figures of the models people work with, which
   were Sonnet 5.5 and Opus 5.5 when this was written, and says so where a
   figure is of a smaller one. A figure of code that has changed since is
   measured again or taken out.
4. Then set the line above to the new version.
