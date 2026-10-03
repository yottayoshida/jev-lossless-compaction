# How it works

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
  trash, and is removed a week later if still named by none. `/lossless-store`
  says how much is kept and how the clean-up went, without opening a result.
