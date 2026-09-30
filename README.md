# jev-lossless-compaction

A Claude Code plugin that compacts a conversation by moving old tool output to
local files instead of summarizing or deleting it. One line stays behind for
each result, and the agent reads the result back when it needs it.

> **Before you install**
>
> - A compaction sends nothing anywhere. With a key set, the `find` tool sends
>   to the [Jev](https://typesafe.ai) provider you choose, each time the agent
>   calls it: the question the agent asked, and for every result moved out of
>   the conversation, the call that made it and the first 400 characters of a
>   digest of the result (its first lines, then lines that look like failures
>   and its last lines as far as they fit). Shapes of secrets are blanked
>   first, which is a courtesy and not a guarantee. With no key in the
>   plugin's settings and none in the environment, there is no `find` and
>   nothing is sent.
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
jev-lossless-compaction: moved 14 of 16 tool results out (408174 -> 30293 chars, about 51909 of 167000 tokens in use) in 44 ms

[moved out] Read result, 36925 bytes; recall with mcp__jev-lossless-compaction__recall id a55c9850d2e336adcaf429cc720b2d070c2452bce2023e886c648b546ff96944
```

Asked on the next turn for the first heading of one of the moved-out files,
without rereading it, the agent called `recall` with the id from the ticket
and quoted the heading exactly. In another conversation, thirteen results of
calls that say nothing of their content (`git show <hash>`, `gh issue view
<number>`, `git cat-file -p <blob>`) had been moved out. Asked in other words
which one reported a refusal on an unsupported kernel call, the agent called
`find` and got the result back under one line:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

Over thirteen such questions it answered all thirteen, one `find` call each
and no `recall`; the same agent with `recall` alone had answered six,
recalling 41 results on the way.

Another conversation, compacted once by the plugin and once by Claude Code
itself. The file the question asks about had been deleted in between.

|                                     | This plugin, no key         | Built-in compaction |
| ----------------------------------- | --------------------------- | ------------------- |
| Time the compaction took            | 43 ms                       | 69.6 s              |
| Tokens sent on the next turn        | 55,449                      | 70,259              |
| "What was on line 5 of that file?"  | Quoted the line, via recall | Could not answer    |

One run each, on 2026-09-30, Claude Code 2.1.285 with Claude Haiku 4.5, a
conversation of 76,490 tokens. Asked twenty questions of the form "what was
on line N of that file" after compacting a sixteen-read conversation, the
built-in compaction answered none; this plugin's answered sixteen, through
`recall`, with the next turn 7,000 tokens larger.

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
- **No summary is written, and nothing is sent.** A compaction takes the
  time of writing a few files. Rules decide the order results leave in:
  those a later call replaced first, then those sharing the least with what
  you are working on, then the oldest. Of the tool results that could leave —
  long enough, not failed, not a ticket, not in the first message, not made
  obsolete by a later call, and with the same text on both sides of the call —
  a compaction keeps the newest whatever its size, and keeps the ones before
  it while they and the newest together add up to at most `keepTokens` tokens
  (three characters to a token, 20,000 by default); every older one is a
  candidate to leave, whatever message it is in. A result a later call made
  obsolete is a candidate even when it is the newest.
- **`find` brings a result back by what it is about.** Asked in words,
  `find` returns the moved-out result of this conversation that the question
  is about, or lists the likeliest few when Jev is not sure which. Jev is
  shown the call that made each result and a digest of it, with "none of
  these" among the choices, and chooses; a phrase of twelve characters or
  more that the question puts in double quotes is looked for as written
  first, and narrows the choice to the results that hold it.
  Measured on thirteen results whose calls said nothing of their content
  (`git show <hash>`, `gh issue view <number>`, `git cat-file -p <blob>`),
  with questions in other words: an agent with `recall` alone found 6 of 13,
  recalling 41 results on the way; `find` named 13 of 13, one request each.

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
- `recall` and `find` look where results are kept now. After the setting or
  the variables above change, results kept elsewhere are not found until they
  change back.
- `find` offers Jev the tickets it finds in the conversation, so after the
  built-in compaction has run it may find none, though the files remain and
  `recall` reads them by id; and of a conversation longer than 4096
  messages, the oldest tickets are not offered. Jev sees the first lines of
  a result and little of its middle, and of a result over 256 KB only the
  first 8 KB.
  A subagent's call is answered with nothing to find: the plugin moves
  nothing out of a subagent's conversation. A result over about 50 KB comes
  back the way Claude Code returns any large tool output: saved to a file
  whose path is shown, which the agent reads. A request to Jev is given up
  after twenty seconds.
- Tokens are estimated from characters, three to a token, so more can leave
  the conversation than the target asks for; and since source code runs
  nearer 2.2 characters a token, `keepTokens` keeps more than its number
  says. The `keepNewest` setting of 0.1.0 is gone and ignored; where the host
  still hands its value to the plugin, every compaction of the main
  conversation says so.
- Tickets written by 0.1.0 begin `[jev-lossless-compaction] This … result`;
  those written now begin `[moved out]`. Both are recognised.
- When Claude Code loads tools on demand, the agent has to load `recall` or
  `find` by name before calling it. It did so on its own in the runs above.

## Docs

- [ADR 0001](docs/adr/0001-move-out-and-order.md): why results are moved out
  instead of deleted, and what was measured on a real Claude Code before the
  design was fixed. [ADR 0002](docs/adr/0002-keep-the-newest-by-size.md): why
  the newest results are kept by size. [ADR 0003](docs/adr/0003-jev-picks-what-comes-back.md):
  why Jev chooses what comes back, not what leaves, with the measurements.
- [Development](docs/development.md): running the tests and the checks.
- [CHANGELOG](CHANGELOG.md)
- Settings and their defaults: [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)

The idea of putting Jev beside a compaction comes from
[fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction). This
project shares no code with it.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.

This project is not affiliated with TypeSafe AI or Anthropic.
