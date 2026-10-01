# lossless-compaction

A Claude Code plugin that compacts a conversation by moving old tool output to
local files instead of summarizing or deleting it. One line stays behind for
each result. The agent reads a result back by its id with `recall`, or by
what it is about with `find`, which asks [Jev](https://typesafe.ai) to choose.

![A conversation compacted by lossless-compaction: three large Read results move out of the context into content-addressed files under ~/.claude/lossless-compaction/, one ticket line stays behind for each, and recall by id or find by meaning brings the exact result back. Recorded figures: 6 of 21 results moved in 61 ms; find answered 13 of 13.](docs/assets/readme-header.svg)

A recorded session, not a drawing: [how each figure was taken](docs/measurements.md).

> **Before you install**
>
> - A compaction sends nothing anywhere. With a key set, `find` sends the Jev
>   provider you choose, each time the agent calls it, the agent's question
>   and, for every result moved out of the conversation, the call that made
>   it and a 400-character digest of it. Shapes of secrets are blanked first,
>   which is a courtesy and not a guarantee. Without a key there is no `find`,
>   and nothing is sent.
> - A repository's own settings files do not decide where results are written
>   or where `find` sends: a key, proxy or place from them stops the plugin
>   instead. See [what a repository can change](docs/limits.md#what-a-repository-can-change).
> - It needs Claude Code's function hooks, which are early access and off by
>   default. It is not on npm; it installs from this repository.

## Demo

What a compaction reports, and the line that stands in a result's place,
from a real session of `Read` results:

```text
lossless-compaction: moved 6 of 21 tool results out (844544 -> 548237 chars, about 52357 of 167000 tokens in use) in 61 ms

[moved out] Read result, 83261 bytes; recall with mcp__lossless-compaction__recall id ed8701f23087852c07ee8eb0b91b9335cc94cc8b21e42826c6b684299e8008e3
```

Asked in other words which of thirteen moved-out results reported a refusal
on an unsupported kernel call, the agent called `find` and got it back:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

|                                             | This plugin | Built-in compaction |
| ------------------------------------------- | ----------- | ------------------- |
| Time a compaction took                      | 43 ms       | 69.6 s              |
| "What was on line N of that file?", 20 asked | 16 answered | 0 answered          |
| "Which result is about …?", 13 asked        | 13 answered | —                   |

Every figure, with how it was taken: [docs/measurements.md](docs/measurements.md).

## Quick start

```sh
# In your shell profile, or under "env" in a repository's .claude/settings.local.json:
# function hooks are off without it.
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1

claude plugin marketplace add yottayoshida/lossless-compaction
claude plugin install lossless-compaction@lossless-compaction
```

Then give it a key with
`/plugin configure lossless-compaction@lossless-compaction` inside Claude
Code. For Jev on Cloudflare Workers AI, set `provider` to `cloudflare` there,
and the account id next to the key. With nothing set there, the key is read
from the environment: `TYPESAFE_API_KEY`, or `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, unless a repository's settings set it. To use it in
one repository only, add `--scope local` to the install and run it there;
set the key without `--scope`.

From then on `/compact` and automatic compaction go through the plugin.

Coming from `jev-lossless-compaction` (0.3.0 and before)? An installed copy
does not follow the rename: see [moving from the old name](docs/limits.md#moving-from-the-old-name).

## What it does

- **Nothing is deleted that a recorded transcript still names.** A tool
  result is written to a file named by the SHA-256 of its content, read back,
  and compared. Only then is it replaced by a ticket. The tool call itself
  stays in the conversation, and `recall` checks the content against its name
  again before returning it. A file is removed only when no transcript in a
  place the plugin recorded named it at two weekly clean-ups a week apart.
- **No summary is written, and nothing is sent.** A compaction takes the
  time of writing a few files. Rules decide the order results leave in: those
  a later call replaced first, then those sharing the least with what you are
  working on, then the oldest. The newest results stay, up to `keepTokens`
  tokens of them (20,000 by default); every older one is a candidate to
  leave, and a result a later call made obsolete is a candidate even when it
  is the newest.
- **`find` brings a result back by what it is about.** Asked in words,
  `find` returns the moved-out result of this conversation that the question
  is about, or lists the likeliest few when Jev is not sure which. Jev is
  shown the call that made each result and a digest of it, with "none of
  these" among the choices; a phrase of twelve characters or more in double
  quotes is looked for as written first.

## Limits

- Claude Code's built-in compaction still runs when the conversation holds an
  image or a document, has 4096 messages or more, belongs to a subagent, or
  is still too full after moving out. Earlier tickets may then be gone from
  the conversation; the files remain.
- Files are plain text under `~/.claude/lossless-compaction/` — or under
  `~/.claude/jev-lossless-compaction/` while that exists — in a directory the
  plugin makes or closes to mode 700 before writing, or else writes nothing.
  Once a week the transcripts are read; a file none of them names goes to a
  trash, and is removed a week later if still named by none. A transcript
  outside the places recorded, from another machine say, is not counted. A result
  moved out by an earlier version is read back after the rename, by the same
  id, from where it was written; a `storeDir` set under the old id has to be
  set again under the new.
- `find` offers the tickets it sees in the conversation, shows Jev the first
  lines of each result, answers a subagent with nothing to find, and gives a
  request to Jev up after twenty seconds.
- Tokens are estimated at three characters each, so more may leave than the
  target asks for.

The full list: [docs/limits.md](docs/limits.md).

## Docs

- [ADR 0001](docs/adr/0001-move-out-and-order.md): why results are moved out
  instead of deleted. [ADR 0002](docs/adr/0002-keep-the-newest-by-size.md):
  why the newest results are kept by size.
  [ADR 0003](docs/adr/0003-jev-picks-what-comes-back.md): why Jev chooses
  what comes back, not what leaves.
  [ADR 0004](docs/adr/0004-the-plugin-is-named-lossless-compaction.md): the
  rename, and how what the old name wrote is still read.
  [ADR 0005](docs/adr/0005-a-repository-does-not-decide-where-results-go.md):
  why a repository's settings do not decide where results go.
  [ADR 0006](docs/adr/0006-results-live-as-long-as-a-transcript-names-them.md):
  why results are kept as long as a transcript names them.
- [Measurements](docs/measurements.md), [Limits](docs/limits.md),
  [Development](docs/development.md), [CHANGELOG](CHANGELOG.md), and the
  settings with their defaults in
  [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).

The idea of putting Jev beside a compaction comes from
[fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction). This
project shares no code with it.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.

This project is not affiliated with TypeSafe AI or Anthropic.
