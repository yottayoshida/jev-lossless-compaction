# 0005. A repository's settings do not decide where results go

- Status: Accepted
- Date: 2026-10-01

## Context

Moved-out results are exact copies of tool output: source, logs, API
responses, and secrets a tool happened to print. `find` sends a digest of each
to the Jev provider it is set up for. Two things decide where all this goes:
the directory results are written to, and the key, account and route of
`find`'s requests.

A repository you open brings `.claude/settings.json`, and can bring
`.claude/settings.local.json` in its tree as well. Claude Code puts the `env`
of both into its process. Up to 0.4.0 the plugin read `HOME`,
`USERPROFILE` and `CLAUDE_CONFIG_DIR` for the default place, and
`TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` when no
key was set, from that environment, and did not ask where a value came from.

Measured on Claude Code 2.1.286, with both files set in a throwaway
repository and a plugin that printed what it saw:

- `HOME`, `USERPROFILE` and `CLAUDE_CONFIG_DIR` from either file did not reach
  the plugin; `$.env.get` returned the real ones.
- `pluginConfigs` from either file did not reach the plugin's options; the
  same `pluginConfigs` through `--settings` did.
- `TYPESAFE_API_KEY` and `HTTPS_PROXY` did reach it. With `HTTPS_PROXY` set to
  a local listener, the plugin's `$.http.fetch` and Claude Code's own API
  request both went to the listener.
- `NODE_EXTRA_CA_CERTS` reached the environment, and a request still
  succeeded with the file it named missing. That does not tell whether the
  host's requests read it, so it is judged with the other certificate
  variables.

`$.settings.read({ source })` returns each file as it is, `env` and
`pluginConfigs` included.

## Decision

1. Before the place or the provider is used, the plugin reads the `project`
   and `local` files. A value counts as the repository's when one of them
   holds it and the plugin sees that same value.
2. It stops something only where the value would be used. The place
   variables count when no `storeDir` is set; a `storeDir` of the repository's
   always does. The key variables count when the plugin's settings hold no
   key; the provider settings of the repository's and the proxy and
   certificate variables (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` in either
   case, `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`,
   `SSL_CERT_FILE`, `SSL_CERT_DIR`) always do. This replaces, for the key,
   the reasoning of [ADR 0001](0001-move-out-and-order.md) that a key read
   from the settings first is enough: the route of the request is the
   repository's to change too.
3. A value of the repository's for the place means nothing is moved out, and
   `recall` and `find` read nothing; for `find`, that it is not registered, or
   answers that it cannot ask. The line printed names the value and the file.
4. When the files cannot be read, both are refused. The project file of a
   session started in the home directory is the user's own; while it holds
   the same as the user file, it is not counted.

## Alternatives considered

- **Take the real home another way** (the password database). The command
  differs by platform, and a repository that sets `HOME` has no reason to
  that would be lost by refusing it.
- **Refuse whenever a file holds one of these names**, used or not. A
  repository with `CLOUDFLARE_API_TOKEN` for its own deploys would lose `find`
  for someone whose key is in the plugin's settings, where the variable
  decides nothing.
- **Let an opt-in setting allow the repository's values.** A setting that a
  repository can write too cannot be the one that trusts the repository.
- **Check only what reaches the plugin today.** Measured, the place variables
  and `pluginConfigs` do not; the checks cost nothing when nothing matches,
  and keep a later version that hands them over from changing the place
  quietly.

## Consequences

- A key or `storeDir` set with `/plugin configure --scope local` is not used
  when it came through the repository's files (on 2.1.286 it does not reach
  the plugin at all). The README says to set them in the user settings.
- What a repository you trust can run is not covered: its settings hooks,
  MCP servers and the plugins or function hooks it enables run code, and can read the files or
  set the environment directly. `docs/limits.md` says so.
- A value taken out of a file mid-session that Claude Code keeps in the
  environment is not seen. Whether Claude Code keeps it was not measured.
- A value that equals the repository's by chance, set by you too, counts as
  the repository's. The printed line says which, and where to set it instead.
