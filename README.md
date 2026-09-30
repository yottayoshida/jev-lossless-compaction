# jev-lossless-compaction

A Claude Code plugin that compacts a conversation by moving old tool output to
local files instead of summarizing or deleting it. One line stays behind for
each result, and the agent reads the result back when it needs it.

> **Before you install**
>
> - With a key set, parts of your conversation are sent to the
>   [Jev](https://typesafe.ai) provider you choose: your latest messages, and
>   for each tool result that may leave, the call and the result's first
>   lines, last lines and lines that look like failures. Shapes of secrets are
>   blanked first, which is a courtesy and not a guarantee. With no key in the
>   plugin's settings and none in the environment, nothing is sent.
> - A repository you open can put a key into the environment through its own
>   `.claude/settings.json`. Then what is sent goes to the account that key
>   belongs to. A key in the plugin's settings is read first and rules this
>   out. The same file can change `HOME` and `CLAUDE_CONFIG_DIR`, and with
>   them where moved-out results are written; the `storeDir` setting rules
>   that out.
> - It needs Claude Code's function hooks, which are early access and off by
>   default. Without `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` the plugin installs,
>   shows in the list, and does nothing.
> - It is not on npm. It installs from this repository.

## Demo

What a compaction reports, and the line that stands in a result's place, from
one real session (Claude Code 2.1.285, Claude Haiku 4.5, sixteen `Read`
results, 179,353 tokens):

```text
jev-lossless-compaction: moved 14 of 16 tool results out (408174 -> 30293 chars, about 51909 of 167000 tokens in use) in 44 ms; order by rules

[moved out] Read result, 36925 bytes; recall with mcp__jev-lossless-compaction__recall id a55c9850d2e336adcaf429cc720b2d070c2452bce2023e886c648b546ff96944
```

Asked on the next turn for the first heading of one of the moved-out files,
without rereading it, the agent called `recall` with the id from the ticket
and quoted the heading exactly.

Another conversation, compacted once by the plugin and once by Claude Code
itself. The file the question asks about had been deleted in between.

|                                     | This plugin, no key         | Built-in compaction |
| ----------------------------------- | --------------------------- | ------------------- |
| Time the compaction took            | 43 ms                       | 69.6 s              |
| Tokens sent on the next turn        | 55,449                      | 70,259              |
| "What was on line 5 of that file?"  | Quoted the line, via recall | Could not answer    |

One run each, on 2026-09-30, Claude Code 2.1.285 with Claude Haiku 4.5, a
conversation of 76,490 tokens. With a key, a compaction of a ten-result
conversation ran three times and took 3.0 s, 1.2 s and 0.3 s, Jev on
Cloudflare Workers AI included; the next turn sent 31,948 tokens where 49,951
were in use before.

Not measured: a conversation of the size where compaction usually runs, and
whether Jev's order is better than the order by rules. In these runs
everything that could leave had to leave, so the order made no difference.

## Quick start

Run on Claude Code 2.1.284 and 2.1.285. Function hooks are early access, and
another version may have changed them.

```sh
# In your shell profile: function hooks are off without it.
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1

# Where results will be kept, made before the first compaction so that only
# you can read them. The plugin cannot set the mode of what it creates.
mkdir -p -m 700 ~/.claude/jev-lossless-compaction

claude plugin marketplace add yottayoshida/jev-lossless-compaction
claude plugin install jev-lossless-compaction@jev-lossless-compaction
```

Then give it a key with
`/plugin configure jev-lossless-compaction@jev-lossless-compaction` inside
Claude Code. For Jev on Cloudflare Workers AI, set `provider` to `cloudflare`
there, and the account id next to the key. With nothing set there, the key is
read from the environment: `TYPESAFE_API_KEY`, or `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

To use it in one repository only, add `--scope local` to both commands and run
them in that repository.

From then on `/compact` and automatic compaction go through the plugin.

## What it does

- **Nothing is deleted.** A tool result is written to a file named by the
  SHA-256 of its content, read back, and compared. Only then is it replaced by
  a ticket. The tool call itself stays in the conversation. The `recall` tool
  checks the content against its name again before returning it.
- **No summary is written.** A compaction takes the time of writing a few
  files, plus the time Jev takes to answer, which is cut off at five seconds.
- **Jev decides the order and nothing else.** It is asked one question per
  result, with a digest of the result in the question, and its scores decide
  which results leave first. Results that a later call replaced leave first
  without being asked about. Of the tool results that could leave — long
  enough, not failed, not a ticket, not in the first message, not made
  obsolete by a later call, and with the same text on both sides of the call —
  a compaction keeps the newest whatever its size, and keeps the ones before
  it while they and the newest together add up to at most `keepTokens` tokens
  (three characters to a token, 20,000 by default); every older one is a
  candidate to leave, whatever message it is in. A result a later call made
  obsolete is a candidate even when it is the newest. When Jev fails or is
  late, rules decide the order.

## Limits

- The promise holds for a conversation whose last compaction was this
  plugin's. Claude Code's built-in compaction runs instead when the
  conversation holds an image, a document or any block of a kind the plugin
  does not know, has 4096 messages or more, belongs to a subagent, has nothing
  that can be moved out, or is still too full afterwards and a summary could
  change that. After it, earlier tickets may be gone from the conversation.
  The files remain.
- Every message is rebuilt, so older thinking blocks are not carried over, and
  a tool that was loaded on demand has to be loaded again. The built-in
  compaction drops both as well.
- Files are plain text under `~/.claude/jev-lossless-compaction/`, or under
  `CLAUDE_CONFIG_DIR` when that is set. The plugin creates them readable by
  other users of the machine, which the `mkdir` above prevents, and never
  cleans them up. A secret in a tool result stays there until you delete it.
- `recall` looks where results are kept now. After the setting or the
  variables above change, results kept elsewhere are not found until they
  change back.
- Tokens are estimated from characters, three to a token, so more can leave
  the conversation than the target asks for; and since source code runs
  nearer 2.2 characters a token, `keepTokens` keeps more than its number
  says. The `keepNewest` setting of 0.1.0 is gone and ignored; where the host
  still hands its value to the plugin, every compaction of the main
  conversation says so.
- Tickets written by 0.1.0 begin `[jev-lossless-compaction] This … result`;
  those written now begin `[moved out]`. Both are recognised.
- When Claude Code loads tools on demand, the agent has to load `recall` by
  name before calling it. It did so on its own in the runs above.

## Docs

- [ADR 0001](docs/adr/0001-move-out-and-order.md): why results are moved out
  instead of deleted, why Jev only orders them, and what was measured on a
  real Claude Code before the design was fixed.
- [Development](docs/development.md): running the tests and the checks.
- [CHANGELOG](CHANGELOG.md)
- Settings and their defaults: [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)

The idea of asking Jev what to keep comes from
[fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction). This
project shares no code with it.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.

This project is not affiliated with TypeSafe AI or Anthropic.
