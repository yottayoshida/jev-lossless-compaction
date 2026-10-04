# 0020. Long inputs of the tools that write leave, and a ticket is not handed to a tool

- Status: Accepted
- Date: 2026-10-04
- Takes up what [0007](0007-keep-what-the-summary-replaces.md) set aside
  ("Moving out `Write` and `Edit` inputs at every compaction"), and amends
  [0001](0001-move-out-and-order.md) (decision 2): a call stays in the
  conversation, but a long value it was handed may leave it.

## Context

The plugin moved one kind of thing out of a conversation: a tool result of
`minChars` characters or more. 0007 set the inputs of `Write` and `Edit`
aside because, counted in hand-overs to the summary, moving them out changed
none.

Counted in what stays, they are large (`docs/measurements.md`, "What a
conversation is made of"). Over the automatic compactions of working
sessions on one machine, 104 of them: with every result that can leave moved
out, a median 79 % of the conversation's characters stayed. Long values
handed to the tools that write a file and to Bash were 19.3 % of all the
characters, in 81 of the 104; a median of 46 of them, 241,857 characters,
where there were any. Moved out with an allowance of their own for the
newest, what stays came to a median 62 %.

A long input moved out stands as one line where the value was. A model that
takes that line for the value can write it into a file, run it, or send it
on: the line is what lands, and the file is overwritten with it. On Claude
Code 2.1.288 with Sonnet 5.5, a `tool.call` hook with no matcher stands in
front of every call, built-in, in a subagent and of an MCP server, and a
call it refuses with `{ deny }` does not run; one it lets through goes on to
Claude Code's own permission prompt as before.

## Decision

1. While what is in use is still over the target once results are moved
   out, long string values handed to `Write`, `Edit`, `MultiEdit`,
   `NotebookEdit` and `Bash` leave, however deep in the input they stand.
   Each is stored as a result is and replaced by one line:
   `[moved out] the "<field>" <tool> ran with, <bytes> bytes; recall with … id <id>`.
   The call's other values stay as they were. The line says the call ran with
   the value: worded as a value of the input, Sonnet 5.5 read three such lines
   as calls that had written the line itself, and said the files might hold it.
2. The tools are named, not told by shape: Claude Code reads back what some
   tools were handed (a plan, a list of tasks), and a tool of another's keeps
   its input.
3. The inputs have an allowance of their own for the newest, `keepTokens`,
   counted over the long values alone: the newest stays whatever its size,
   the ones before it while they and it fit. The results' allowance is as it
   was (0002). Counted over the whole conversation instead, 80 of the 104
   compactions above moved out results that stay now.
4. Values leave after results, those of the tools that write a file first,
   oldest first, then Bash commands, which `find` and the check for a
   repeated call read. The first message, a call that failed and a value
   that is a ticket already stay.
5. Every tool call is looked at, whatever the tool, in a subagent too, but
   those of this plugin under either name and the built-in tools known only
   to read (`Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `ToolSearch`).
   A call whose input holds the shape of a ticket anywhere, behind an indent
   or a comment mark as well, is refused when the id is one this store holds
   or this conversation names. The model is told, in fixed words, to recall
   the id and use what comes back. Which tools go through is a list of what
   is let through, so that a tool the plugin has never heard of is looked at.
   Nothing turns it off.
6. `find` offers a value that left as one of the results it chooses among,
   told by the call as it stands now, the ticket in place of the value.
   `recall` takes an id copied wrong when an input ticket is the only one it
   can be.

## Alternatives Considered

- **Every long string of every tool's input.** Claude Code reads back the
  input of some tools; a value it reads back as a ticket would break it.
- **Count the newest over the whole conversation.** Simpler, one allowance:
  measured above, it moved out results that stay now in 77 % of automatic
  compactions.
- **Refuse only the tools that write.** Tools that write come and go faster
  than this plugin does, an MCP server's among them, and a Bash command
  writes as well as `Write` does.
- **Refuse a call only where the ticket is the whole of a line.** A model
  copying a file writes the line where it stood, indented or after a comment
  mark.
- **Refuse calls to the tools that read too.** A ticket handed to `Grep`
  puts nothing anywhere, and the refusal would have the agent recall the
  value to search by it, which undoes the compaction.

## Consequences

- A compaction moves out more where it has to, and says so:
  `moved 3 of 21 tool results out and 5 tool inputs (…)`.
- The store holds what the agent wrote as well as what tools returned; it is
  kept and cleaned up as results are (0006), and a clean-up reads the ids of
  input tickets too.
- A model can still get a ticket past the guard by building it in a script,
  or by writing one whose id nothing holds; `docs/limits.md` says so.
- A hook that runs past its time is left out by Claude Code and the call goes
  on: the guard reads nothing unless the shape of a ticket is in the input.
- What the guard counts as this conversation's is what the plugin put there:
  a whole result, a whole value of an input, a part's line. A ticket's shape
  inside a file the agent wrote, and the input of the call being looked at,
  are not: counted, a document holding an example ticket would have every
  later call that touches it refused. A clean-up reads more widely, since
  there an id too many keeps a result a while and one too few loses it.
- A Bash command that left is a ticket in its call, and the same command run
  again later no longer makes the earlier result obsolete: the commands are
  compared as they stand. Commands leave last for this reason.
- Where the store cannot be read, the shape of a ticket is enough to refuse.
