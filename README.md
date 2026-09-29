# jev-lossless-compaction

Context compaction for coding agents that moves old tool output out of the
conversation instead of deleting it.

## Status

Design phase. This repository has no working code yet, and nothing here has
been measured. The design below is a plan, not a description of what exists.

## Why

A coding agent resends its whole conversation on every request. Most of that
history is old tool output the agent no longer needs. Compaction by summary
rewrites the history and can lose an exact path, error, or command.
[fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction)
showed another way: ask [Jev](https://typesafe.ai), a decision model, which
tool calls are still needed, remove the rest, and keep everything else
verbatim.

This project starts from that idea and changes what happens to the part that
is removed.

## Planned design

- **Nothing is deleted.** A tool result that leaves the conversation is
  written to a local file, and one line stays behind saying where it went.
  The agent can read it back.
- **The judge sees what it judges.** Each question about a tool result
  includes the content of that result, not only a note that it exists.
- **Narration keeps its evidence trail.** When a tool call leaves the
  conversation, the assistant text that described it is marked, so the
  remaining history does not read as work done without tools.

## First step

Before any plugin is written, the judgments are replayed against recorded
agent sessions and compared with orderings that cost nothing, such as oldest
first. If the judgments do not beat those, the project stops there and says
so here.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.

This project is not affiliated with TypeSafe AI.
