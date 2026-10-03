# 0014. After a summary, the plugin names the files that changed on disk since they were read

- Status: Accepted
- Date: 2026-10-02
- An alternative not taken here, a note in place of the changed file as it
  is shown again, is taken up in
  [0018](0018-a-changed-file-shown-again-gives-way-to-a-line.md).

## Context

When a conversation goes to Claude Code's summary, Claude Code shows the
files read most recently again in the first request afterwards (three, in
what was measured), each framed as `Called the Read tool with the following input: …`
and `Result of calling the Read tool:`, with the file as it is on disk at
that moment. A file that changed after the conversation read it is shown
as it is now, in the words of a result.

The benchmark of #28 asked what such a file said when it was read. With
Haiku 4.5, in the four conversations where the file is shown again, the
agent answered with what the file says now twelve times of twelve, calling
no tool. The plugin held the earlier reading: before a summary it keeps the
conversation, and every result of 400 bytes or more in it is stored under
an id. #14 was reopened on this. What #14 was written for, a rule stated
once and forgotten, did not happen: 36 of 36 in the benchmark, and 24 of 24
after five summaries in a measurement recorded on the issue.

Measured before anything was built, in a copy of the plugin, with five
askings of one summary of `short` (`docs/measurements.md` has the figures
of the benchmark run on what was built):

| What was done | Haiku 4.5 | Sonnet 5.5 |
| --- | ---: | ---: |
| Nothing | 0 of 5 | 5 of 5 |
| A line after the summary saying files shown again are as they are now | 0 of 1 | |
| A line listing the files read and the ids of their results | 0 of 1 | |
| A line naming the file as changed, with the id of its reading | 2 to 3 of 5 | 5 of 5 |
| The same, put in front of the file as it is shown again | 2 of 5 | |
| The line, and the changed file not shown again | 5 of 5 | 5 of 5 |

In those askings Sonnet went back for the reading unprompted every time;
with the line it needed one `recall` where it had needed two.

## Decision

The message the plugin already puts right after a summary names each file
the conversation read whole whose text on disk is no longer what the last
such `Read` returned, with the id that reading comes back by.

- A `Read` counts when it has no `offset`, `limit` or `pages`, did not
  fail, and returned text whose every line begins with a number and a tab.
  The last such one of a path is taken, and dropped when the conversation
  wrote to that path afterwards with Edit, Write, MultiEdit or
  NotebookEdit, unless that write failed.
- The plugin reads the file from disk and sets it against the result with
  the numbers and tabs taken off, a carriage return at the end of a line
  and a byte order mark at the head left out on both sides. A file that is
  missing, not a regular file, over 256 KB, or not readable says nothing.
- At most twenty files are read, newest first, and at most ten are named.
- A line the plugin wrote after an earlier summary is a candidate again at
  the next one, by its path and id. It is read in the plugin's own message
  after a summary and nowhere else: the same words pasted by the person or
  put into a turn by the host name no file the plugin will look at.
- A path of over 512 characters, or holding a control character, a line
  separator or a mark that turns the direction of text, is not named, and
  a file that does not read as text is not set against its reading.

This is the first time the plugin reads a file of the work rather than its
own store, its settings and Claude Code's transcripts. It reads only paths
the conversation read, sends nothing and writes nothing but a result
shorter than 400 bytes that has to be stored to be named.

It is also the first time a line of the plugin's holds words it did not
write. A ticket names a tool out of a fixed list; this line carries a
path, which the model put into the call, in a message of the person's
role. The path is needed to say which file, and is held to that length
and to characters that leave the line one line, shown as it is.

## Alternatives Considered

- **Leaving the changed file out of what is shown again, or putting a
  short note in its place**, through a `prompt.attachment` hook. The only
  form that brought Haiku to five of five. It needs to know which paths
  the conversation read in a process that may be a fork of the one that
  summarized, it cannot tell a file shown again from one the person
  mentioned, and an event name a Claude Code does not have stops every
  hook of the plugin when it is registered, whether inside a `try` or in a
  second module (measured on 2.1.287 with a name that does not exist).
  Sonnet gains nothing by it. Not taken.
- **Saying it in front of the file as it is shown again**: no better than
  the line after the summary, and it needs the same hook.
- **A general line, or a list of files and ids without saying which
  changed**: measured, and neither moved the answer.
- **The ledger of constraints, the retrieval cues and the retrieval before
  an action that #14 proposed**: what they guard against did not occur in
  what was measured.

## Consequences

- With Haiku the agent still answers with the file as it is now about half
  the time. The line says what is so and how to get the reading; whether
  the agent does is its own.
- The comparison rests on the form Claude Code gives a `Read` result. When
  that form loses its numbers, nothing is named. One that kept them and
  cut the text short would name files that did not change. The benchmark
  is what notices either.
- The line stays in the conversation until the next summary. It says "as
  of this summary", which is just before the summary ran, and a file that
  changes again or back is set against its reading again at the next one.
  A file that had not changed by one summary and changes after it is not
  taken up at the next: nothing in the conversation names its reading.
- A file the agent wrote to under another spelling of its path (a link in
  it, another case) is still a reading, and is named.
- An agent copying the 64 characters of an id gets them wrong now and then
  (4 of 103 calls in the records of the benchmark's sessions, which are
  not published), and `recall` refuses it.
  Not addressed here. Since #54, `recall` takes such an id for the one id
  written in the conversation that begins with its first 16 characters
  (`docs/measurements.md`, "The id that was meant").
