# 0021. One line installs the plugin, and nothing is to be set

- Status: Accepted
- Date: 2026-10-04
- Amends [0010](0010-a-mark-says-the-plugin-is-running.md): its notices
  named a setting to add; they name what the plugin needs instead. When and
  how they are said is as 0010 decided.

## Context

The quick start was two shell commands, a line under `env` in
`~/.claude/settings.json` setting `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, and a
new session. The line was needed while function hooks were early access.
Claude Code's mods overview now says that mods require Claude Code 2.1.287
or later and are on by default, and that 2.1.287 and later ignore the
variable, so that `0` does not keep them off.

Measured on Claude Code 2.1.289:

- Started with the environment emptied, only project settings read
  (`--setting-sources project`) in a directory that has none, and the plugin
  loaded from a directory (`--plugin-dir`), the module loaded with the variable unset, at `0` and at
  `1`: `recall` was registered and nothing was told at the first message.
- `/plugin install <name> --marketplace <source>` typed in a session, with a
  copy of the plugin under another name and a marketplace in a directory:
  once before the first message, and once after two in another session. It
  asked to add the marketplace (the first time only), offered three scopes
  with **Install for you (user scope)** chosen by default, opened the
  plugin's options, which Esc closed, and ended with `Installed … Plugin is
  now active.` `/plugin` said one mod was active, and a `/compact` in the
  same session went through the plugin. `recall` was among the agent's tools
  after the install: in the session where it was installed before the first
  message, the first request offered it through tool search and the next
  listed it in front; in the other, the first request after the install
  listed it in front.
- `claude plugin test`, in a directory that holds no mod, printed
  `no hooks module to load`, its line for "mods can load".

Claude Code's page on troubleshooting a mod lists what still keeps mods off:
Anthropic turning installed mods off remotely, `disableAllHooks` or an
organization's policy (`claude plugin test` says which), an organization's
`allowManagedModsOnly` (it does not say), a directory whose trust prompt is
not answered, and a version before 2.1.287.

## Decision

1. The README installs with one line typed at the prompt of a session,
   `/plugin install lossless-compaction --marketplace yottayoshida/lossless-compaction`,
   on Claude Code 2.1.287 or later, choosing **Install for you** and closing
   the options. The two shell commands stay in `docs/limits.md`, for a
   script and for `--scope local`.
2. Nothing is to be set. The README and the notices do not name the
   variable; `docs/limits.md` says it is ignored and can be removed.
3. The notices of 0010 name what the plugin needs: Claude Code 2.1.287 or
   later (`claude --version`), and mods not turned off (`claude plugin
   test`, run in an empty directory: run where a mod is, it runs that mod's
   tests instead); then `claude --debug`, for what that command does not say. The mark, `told` and `held` are as 0010
   decided, and the words `npm run check:host` tells a notice by stay.
4. `npm run check:host` starts every session without the variable, and one
   more with it at `0`, and checks that the plugin runs in both.

## Alternatives Considered

- **Keep the setting, and have the first message ask the agent to add it to
  `settings.json`.** What it would add is ignored from 2.1.287 on.
- **A hook that writes the setting itself.** Ignored as above, and a plugin
  changing a person's settings unasked; enabling function hooks also enables
  every other mod installed.
- **Publish to npm, and install with
  `claude plugin install lossless-compaction@npm`.** One line in the shell,
  but the form is in `claude plugin install --help` alone, not in Claude
  Code's documentation; every release would go to npm as well, and a version
  published there cannot be published again. To look at again if the form is
  documented.
- **Keep the two shell commands in the README.** They install without a
  session, but the plugin loads in the next one or after `/reload-plugins`.
  Installed in a session it runs at once, unless Claude Code holds the
  reload (below), and the person sees what it adds before choosing where it
  goes.
- **Name the variable as the fix on 2.1.285 and 2.1.286.** Those are the
  versions it was measured to help on (earlier ones were not tried);
  updating helps there too, and on every
  later version the variable sends the reader to a setting that changes
  nothing.

## Consequences

- On Claude Code 2.1.287 or later the plugin is installed with one line and
  nothing is set; on an earlier version the notices say to update.
- Claude Code's documentation says it holds an install whose reload would
  make the next request read the conversation again uncached, and asks for
  `/reload-plugins --force`. That was not met in the two sessions measured;
  where it is, the plugin runs after that command or in the next session.
- The README's line names this repository: a copy published elsewhere
  changes it.
