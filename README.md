# lossless-compaction

[![CI](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml/badge.svg)](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml)

> A Claude Code plugin that compacts a conversation by moving old tool results to files on your machine, and gives the agent the exact result back when it asks.

Claude Code's built-in compaction replaces a full conversation with a
summary, and what the summary leaves out is gone. This plugin moves old tool
results out instead and leaves a one-line ticket for each. Where tool results
are not what fills the conversation it has nothing to move, and a full
conversation still goes to Claude Code's summary, the plugin keeping it first
([limits](docs/limits.md)).

## Demo

![Built-in compaction turns a conversation into one summary. lossless-compaction moves tool results out of the conversation into a local store of files named by the SHA-256 of their content, and recall brings an exact result back. Measured: a compaction in 61 ms; find answered 13 of 13.](docs/assets/lossless-compaction-animated.svg)

Each figure is from one recorded session
([how each was taken](docs/measurements.md)), and shows the plugin where it
does best.

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
through the plugin. It is not on npm; it installs from this repository
([more ways to set it up](docs/limits.md#setting-it-up)).

## What it does

- **Moves tool results out, each stored whole.** A result is written to a
  file named by the SHA-256 of its content, read back and compared before a
  ticket takes its place. Where that makes room no summary is written, and a
  compaction sends nothing anywhere ([how it works](docs/how-it-works.md)).
- **Gives a result back unchanged.** `recall` takes the id on a ticket and
  needs no key. `find` is optional: with a Jev key it takes a question in
  words and has [Jev](https://typesafe.ai) choose the result, sending
  excerpts of the conversation to the Jev provider you choose
  ([usage](docs/usage.md)).
- **Says what it did.** A line starting `lossless-compaction:` follows each
  compaction. A `/compact` with nothing to move out and room left says so
  and does nothing. Where Claude Code's summary runs, the plugin keeps what
  it replaces first, except images, documents and thinking
  ([limits](docs/limits.md)).

## Against the built-in compaction

Six made-up conversations, each given `/compact` by hand with the plugin and
without, three times with Haiku 4.5. The plugin's figure is first, the
built-in compaction's second:

| The conversation is mostly      | The summary ran | `/compact` took     | Output of a script since removed: right, of 6 |
| ------------------------------- | --------------- | ------------------- | --------------------------------------------- |
| Large tool results              | 0 of 3 · 3 of 3 | 0.1 s · 20–26 s     | 6 · 2                                         |
| Files the agent wrote           | 0 of 3 · 3 of 3 | 0.05 s · 27–31 s    | 5 · 1                                         |
| Text pasted into messages       | 0 of 3 · 3 of 3 | 0.05 s · 20–26 s    | 4 · 4                                         |
| Many short results              | 0 of 3 · 3 of 3 | 0.05 s · 25–30 s    | 6 · 1                                         |
| Text filling most of the window | 3 of 3 · 3 of 3 | 25–31 s · 22–26 s   | 6 · 3                                         |
| Thinking                        | 0 of 3 · 3 of 3 | 0.04 s · 29–34 s    | 6 · 1                                         |

Only the first kind did the plugin compact by itself. Four it left as they
were, with nothing to move out and room to go on, and an automatic compaction
of those still ends in Claude Code's summary. Where it compacted, more is
left to send: 43,995 tokens a request against 8,313. Opus 5.5, asked once,
searched Claude Code's own record of the session after the built-in
compaction, and one run does not tell the answers apart: 13 of 17 counted
right with the plugin, 15 without
([all of it](docs/comparison.md), [every table](docs/measurements.md#the-benchmark)).

## Docs

- [Usage](docs/usage.md) — what a compaction prints, `recall`, `find` and what it sends
- [How it works](docs/how-it-works.md) — what is stored, what leaves and in what order, what is deleted
- [Limits](docs/limits.md) — when Claude Code's summary still runs, what is not kept, setting it up
- [Against the built-in compaction](docs/comparison.md), and every [measurement](docs/measurements.md)
- [Development](docs/development.md), [CHANGELOG](CHANGELOG.md), [settings](.claude-plugin/plugin.json) and [decision records](docs/adr/)

The idea of putting Jev beside a compaction comes from
[fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction);
this project shares no code with it and is not affiliated with TypeSafe AI or
Anthropic.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.
