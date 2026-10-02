# lossless-compaction

![Built-in compaction turns a conversation into one summary. lossless-compaction moves tool results out of the conversation into a local store of files named by the SHA-256 of their content, and recall brings an exact result back. Measured: a compaction in 61 ms; find answered 13 of 13.](docs/assets/lossless-compaction-animated.svg)

The two figures in the picture are each from one recorded session
([how each was taken](docs/measurements.md)), and show the plugin where it
does best. Of six kinds of conversation measured, five ended in Claude
Code's summary with the plugin as without it, in about the same time, and
with `find` registered the agent did not call it:
[against the built-in compaction](#against-the-built-in-compaction).

When a Claude Code conversation fills up, the built-in compaction replaces it
with a summary, and what the summary leaves out is gone from the conversation.
This plugin compacts by moving old tool results to files on your machine
instead. One line, a ticket, stays behind for each result, and the agent gets
the exact result back when it needs it: by the id on the ticket with `recall`,
or by saying what it is about with `find`, which asks
[Jev](https://typesafe.ai) to choose. Where tool results are not what fills
the conversation, Claude Code's summary still runs, and the plugin keeps the
conversation first ([Limits](#limits)).

A compaction sends nothing anywhere. `find` is optional and needs a Jev key;
with one set, it sends [excerpts of the conversation](#usage) to the Jev
provider you choose. A repository's own settings files do not decide where
results are written or where `find` sends: a key, proxy or place from them
stops the plugin instead
([what a repository can change](docs/limits.md#what-a-repository-can-change)).

## Quick start

```sh
claude plugin marketplace add yottayoshida/lossless-compaction
claude plugin install lossless-compaction@lossless-compaction
```

Then turn Claude Code's function hooks on, once, in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

Function hooks are early access. Unless your account already has them on,
the plugin installs and shows in the list without this line, and moves
nothing out.

Start a new session. From then on `/compact` and automatic compaction go
through the plugin. It is not on npm; it installs from this repository. More
ways to set it up — one repository only, the key from the environment, coming
from `jev-lossless-compaction` — are in
[docs/limits.md](docs/limits.md#setting-it-up).

## Usage

Three things, in the order you will meet them.

**A compaction.** A line starting `lossless-compaction:` says what each one
did. From a real session of `Read` results:

```text
lossless-compaction: moved 6 of 21 tool results out (844544 -> 548237 chars, about 52357 of 167000 tokens in use) in 61 ms
```

Each result that left has a ticket in its place:

```text
[moved out] Read result, 83261 bytes; recall with mcp__lossless-compaction__recall id ed8701f23087852c07ee8eb0b91b9335cc94cc8b21e42826c6b684299e8008e3
```

In a session where the plugin is enabled and is not running, a line says so
at the first message you send, naming the setting to add
([what else it does, and what it does not reach](docs/limits.md#function-hooks)).

**`recall`.** The agent calls it with the id on a ticket and gets the result
back unchanged. It needs no key.

**`find`.** Optional. Asked in words, it returns the moved-out result of this
conversation that the question is about, or lists the likeliest few when Jev
is not sure which. Asked in other words which of thirteen moved-out results
reported a refusal on an unsupported kernel call, in a session where the
calls said nothing of what they returned, the agent called `find` and got it
back:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

It needs a Jev key: set it with
`/plugin configure lossless-compaction@lossless-compaction` inside Claude
Code. For Jev on Cloudflare Workers AI, enter the account id there as well:
with `provider` left on `auto`, an account id entered there sends the key to
Cloudflare, and none sends it to TypeSafe.

With a key set, each call to `find` sends the provider:

- the agent's question;
- for every result moved out of the conversation, the call that made it and
  a 400-character digest of it;
- for every part of the conversation kept before a summary, the head of what
  was said in it.

Jev chooses among them, with "none of these" among the choices; a phrase of
twelve characters or more in double quotes is looked for as written first.
Shapes of secrets are blanked before anything is sent, which is a courtesy
and not a guarantee. A result that holds an image is not offered, and nothing
of it is sent. Without a key there is no `find`, and nothing is sent.

## Against the built-in compaction

Six made-up conversations, each compacted by the plugin and by Claude Code
itself, three times with Haiku 4.5. In every cell the plugin's figure is
first and the built-in compaction's second:

| The conversation is mostly      | The summary ran | A compaction took | Output of a script since removed: right, of 6 |
| ------------------------------- | --------------- | ----------------- | --------------------------------------------- |
| Large tool results              | 0 of 3 · 3 of 3 | 0.1 s · 23–30 s   | 4 · 1                                         |
| Files the agent wrote           | 3 of 3 · 3 of 3 | 27–30 s · 27–36 s | 4 · 2                                         |
| Text pasted into messages       | 3 of 3 · 3 of 3 | 26–32 s · 22–29 s | 5 · 2                                         |
| Many short results              | 3 of 3 · 3 of 3 | 26–29 s · 24–29 s | 6 · 1                                         |
| Text filling most of the window | 3 of 3 · 3 of 3 | 34–40 s · 31–43 s | 5 · 2                                         |
| Thinking                        | 3 of 3 · 3 of 3 | 30–38 s · 25–29 s | 6 · 1                                         |

- **The plugin compacted by itself in one kind of the six**, the one where
  tool results are what fills the conversation. In the other five it had
  nothing to move that would make room: it kept the conversation and handed
  over to Claude Code's summary.
- **After a hand-over, a script's output that no file held any more was
  still answered** 26 times of 30, through `recall` of the conversation
  kept, against 8 of 30 after the built-in compaction alone.
- **What goes the other way.** Where the plugin compacted by itself, the
  next request was 37,139 tokens against 8,313 after the summary, and later
  requests carry that. What a file said before it changed was answered
  wrong by both, mostly, with nothing fetched: 5 right of 18 against 0. With
  Sonnet 5.5, in one run on three of the conversations, both answered every
  such question, the built-in compaction by searching Claude Code's own
  record of the session, and the plugin's questions cost more to ask (1.29
  USD against 0.17 for the nine, where it had compacted by itself).
- **`find` was compared apart**, on seven distinct questions about what a
  result was and six about a value in it. Asked what a result was about, it
  gave or listed first the right one 16 times of 19; asked by a value
  further down a result, it said 13 times of 14 that none was about that,
  where one was.
  With the tool registered and no question naming it, the agent did not
  call it.

The protocol, every table and what they do not show:
[docs/measurements.md](docs/measurements.md#the-benchmark).

## How it works

- **A result is stored before it is replaced.** It is written to a file named
  by the SHA-256 of its content, read back, and compared. Only then does a
  ticket take its place. The tool call itself stays in the conversation, and
  `recall` checks the content against its name again before returning it. A
  write that fails loses nothing: a result is ticketed only once all of it is
  written.
- **Rules decide what leaves. On this path no summary is written, and
  nothing is sent.** Where moving results out makes room, a compaction takes
  the time of writing a few files. Results leave in this
  order until the conversation is estimated to be under the target size
  (`targetPercent`): those a later call replaced, then those sharing the
  least with what you are working on, then the oldest. The newest results
  stay, up to `keepTokens` tokens of them (20,000 by default). A result a
  later call made obsolete can leave even when it is the newest, and a result
  that holds an image always leaves.
- **Nothing is deleted that a recorded transcript still names.** Files are
  plain text under `~/.claude/lossless-compaction/`, in a directory closed to
  mode 700 before anything is written. Once a week the transcripts are read.
  A file that neither they nor a part kept before a summary names goes to a
  trash, and is removed a week later if still named by none.

## Limits

- **Claude Code's own summary still runs** when moving results out is not
  enough, or nothing can be moved out, which was five of the six kinds of
  conversation above; when the conversation holds
  an image or a document outside a tool result, a block of a kind the plugin
  does not know, or 4096 messages or more; and in a subagent.
- **What a summary replaces is kept first**, on the main conversation, and
  `recall` returns it unchanged by the ids left right after the summary. Not
  kept: images, documents, thinking, and messages older than the 4096 Claude
  Code shows.
- **`find` does not see everything.** It offers the tickets it sees in the
  conversation and in the parts kept before a summary, shows Jev the first
  lines of each result, and gives a request to Jev up after twenty seconds.
- **Sizes are not capped, and are estimates.** There is no limit on how much
  is kept. How full the conversation is afterwards is counted from Claude
  Code's own figures: where results were moved out it came within 20 % of
  what the next request sent, and within 3 % in five long working
  sessions. `keepTokens` is turned into characters at three to a token.

Each of these in full, and the rest: [docs/limits.md](docs/limits.md).

## Documentation

- [Limits](docs/limits.md), [Measurements](docs/measurements.md),
  [Development](docs/development.md), [CHANGELOG](CHANGELOG.md), and the
  settings with their defaults in
  [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).
- Why it is built this way: the decision records in [docs/adr/](docs/adr/).

The idea of putting Jev beside a compaction comes from
[fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction). This
project shares no code with it.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.

This project is not affiliated with TypeSafe AI or Anthropic.
