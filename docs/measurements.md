# Measurements

Every figure the README quotes, with how it was taken. Except for the last
two sections, they were recorded when the plugin was named
`jev-lossless-compaction`, and the lines quoted are as they appeared then.
One run each unless said otherwise, all on 2026-09-30, Claude Code 2.1.285
with Claude Haiku 4.5.
The plugin was run on 2.1.284 and 2.1.285; function hooks are early access,
and another version may have changed them.

## A compaction, and a result read back

A conversation of sixteen `Read` results, 179,353 tokens, compacted by the
plugin. What the compaction reported, and the line that stands in a result's
place:

```text
jev-lossless-compaction: moved 14 of 16 tool results out (408174 -> 30293 chars, about 51909 of 167000 tokens in use) in 44 ms

[moved out] Read result, 36925 bytes; recall with mcp__jev-lossless-compaction__recall id a55c9850d2e336adcaf429cc720b2d070c2452bce2023e886c648b546ff96944
```

Asked on the next turn for the first heading of one of the moved-out files,
without rereading it, the agent called `recall` with the id from the ticket
and quoted the heading exactly.

## Against the built-in compaction

Another conversation, 76,490 tokens, compacted once by the plugin (no key
set) and once by Claude Code itself. The file the question asks about had
been deleted in between.

|                                     | This plugin, no key         | Built-in compaction |
| ----------------------------------- | --------------------------- | ------------------- |
| Time the compaction took            | 43 ms                       | 69.6 s              |
| Tokens sent on the next turn        | 55,449                      | 70,259              |
| "What was on line 5 of that file?"  | Quoted the line, via recall | Could not answer    |

The sixteen-read conversation above, compacted both ways, then asked twenty
questions of the form "what was on line N of that file", one fresh turn per
question: the built-in compaction answered none of the twenty; the plugin's
answered sixteen through `recall`, the four misses being the agent
misreading a line it had recalled. The next turn was about 7,000 tokens
larger after the plugin's compaction (66,000 against 59,000): that is the
tickets and the newest results kept.

## Jev at compaction time

Over twenty automatic compactions of a real session (a 200k window, Opus
4.6) and four more of the conversation above, the order Jev gave the
candidates never changed which results left: the size target was far enough
below the conversation that every candidate left every time. Jev's "still
needed" scores moved as a block from one compaction to the next (0.83–1.38
at one, 2.19–2.38 at the next) with a spread of 0.2–0.5 within a compaction.
A `choice` question at compaction time, "which of these does the rest of the
task most need", ranked the two results the session read again afterwards
seventh and tenth of thirteen. This is why a compaction asks Jev nothing
(ADR 0003).

## `find`

Thirteen results whose calls say nothing of their content — `git show
<hash>`, `gh issue view <number>`, `git cat-file -p <blob>` — moved out of a
conversation of eighteen, and thirteen questions about them in other words
("which result reports a refusal on an unsupported kernel call for event
polling before the thread rule applies?"), one fresh turn per question.

| Arm                                                  | Right | Results pulled back into the context |
| ---------------------------------------------------- | ----- | ------------------------------------ |
| The agent with `recall` alone                        | 6/13  | 41 recalls, 388,301 characters       |
| Jev's `choice` over the digests, asked from a script | 13/13 | —                                    |
| Word overlap between question and digest, no Jev     | 10/13 | —                                    |
| The agent with the registered `find` tool            | 13/13 | 13 `find` calls, no `recall`         |

The agent's misses were three answers given without recalling anything and
one wrong after twelve recalls. The `find` run was made twice, before and
after "none of these" was added to the choices, 13/13 both times; what the
agent saw for one of them:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

Asked about a result that had *not* been moved out, `find` answered
`[not sure]` with the two likeliest at 0.24 and below and "or none of them;
probability 0.36". On twenty questions that quote a line of a `Read` result
whose path is in the call, the agent with `recall` alone answered 18 of 20
(2.5 recalls a question); Jev's choice over the digests 14 of 20, 19 of 20
among its three likeliest. That is why a quoted phrase is looked for as
written before Jev is asked.

With a hundred stored results of 60 KB and three of 4 MB, `find`'s own work
took 96 ms. A `choice` with 95 options of 750 characters, 71,219 characters
in all, went through the Cloudflare route in 1.5 seconds.

## The README's demo, after the rename

A fresh conversation under 0.4.0, on a machine holding
`~/.claude/jev-lossless-compaction/` with 153 results from earlier
versions: the agent made thirty-seven `Read` calls over sixteen Zig source
files and was then asked to `/compact`. What the compaction reported, and
the line that stands in a result's place:

```text
lossless-compaction: moved 6 of 21 tool results out (844544 -> 548237 chars, about 52357 of 167000 tokens in use) in 61 ms

[moved out] Read result, 83261 bytes; recall with mcp__lossless-compaction__recall id ed8701f23087852c07ee8eb0b91b9335cc94cc8b21e42826c6b684299e8008e3
```

Six left because six reached the target. A compaction had already run on
its own while the files were being read (`moved 2 of 16 tool results out
(708754 -> 612172 chars, about 23251 of 167000 tokens in use) in 23 ms`),
so eight results in all left this conversation: 83,261 bytes (contract.zig),
77,743 (boundary.zig), 65,420 (oracle.zig), 50,064, 47,963, 42,670, 13,974
and 13,896. Four of the eight had the text of results that earlier sessions
had stored, so the old directory's index grew from 153 to 157 entries, and
no `~/.claude/lossless-compaction/` was made. The README's header image
draws the three largest.
In the same setting, a conversation compacted by 0.3.0 was compacted again:
its thirteen old tickets were rewritten to the current wording, none left
out, and three more results left; `find`, asked about one of the thirteen in
a copy of that conversation not compacted again, returned it at probability
0.99; and with an empty `~/.claude/lossless-compaction/` made by hand,
`recall` of an old ticket's id returned the result, and the new directory
stayed empty.

## The size after a compaction

On 2026-10-01, Claude Code 2.1.286 with Claude Opus 5.5 at medium effort, a
967,000-token window. Three new sessions each read source files or Markdown
with `Read`, one at a time, then ran `/compact`, then sent one line asking
for a one-word answer. The size estimated at the compaction is set against
the input tokens of that answer, cache reads and writes included. The
estimate counted from what stays is what Claude Code's breakdown put outside
the conversation (42,495 tokens in each: the rows in use other than
`Messages`, and the tokens in use less `Messages` came within 3 of it) plus
the rebuilt conversation, at three characters a token and at the session's
own tokens a character (the `Messages` row over the characters of the
conversation as sent: 0.375 and 0.450).

| Session | Next request | Before (`tokens` less moved out) | At 3 characters a token | At the session's figure |
| ------- | -----------: | -------------------------------: | ----------------------: | ----------------------: |
| Eight source files, one word on each | 53,305 | 91,829 (+72 %) | 60,088 (+12.7 %) | 62,278 (+16.8 %) |
| Twelve Markdown files, a summary in Japanese of each | 67,682 | 103,021 (+52 %) | 60,003 (−11.3 %) | 66,102 (−2.3 %) |
| Eight source files, a sentence on each | 53,513 | 97,740 (+83 %) | 60,207 (+12.5 %) | — |

The third session's breakdown was not recorded; its figure at three
characters a token takes the 42,495 of the other two. The sessions held little thinking (908 and 27,834
characters, signatures included, in the two recorded). The figure before
was off with almost none: three characters a token underestimates what
source code that was moved out took. The session of #24, which held
228,230 characters of thinking, was 72 % over; its breakdown was not
recorded.

## An image in a tool result

On 2026-10-01, Claude Code 2.1.286 with Claude Haiku 4.5, in throwaway
sessions with the installed copy of the plugin disabled.

What a `session.compact` hook is handed for a `Read` of a PNG: the result's
`text` is empty, and the tool's record holds the bytes on both sides of the
call (`result.file.base64`, with `type` and the dimensions). Read with its
blocks, the same result is a `tool_result` whose `content` is an `image`
block with a `base64` source, and after it, where the host added one, a
text block beginning `<system-reminder>`. Of the 621 images in the local
transcripts of #25, every one stands in a tool result (618 results, 109 of
them with text as well); none was pasted into a message, and there was no
document.

What a plugin's tool may return: an array holding
`{ type: 'image', source: { type: 'base64', media_type, data } }` reached
the model as an image (it named the colour of a plain blue one). The same
bytes as an MCP result (`{ content: [...], isError }`) were refused as not
a string, and as `{ type: 'image', data, mimeType }` in an array made the
request fail with "an image in the conversation could not be processed".

With this change loaded as the plugin (`claude --plugin-dir`):

- A conversation of one image and one text file, compacted with `/compact`:
  `moved 1 of 2 tool results out, 1 image with them`, where 0.5.2 said
  `built-in compaction: … cannot carry: image`. The next turn was answered;
  `recall` with the id in the line returned the image and the model said
  what it showed; the session closed and resumed answered from the line.
  Of the rows written after the compaction and before that `recall`, none
  held the image's bytes. Compacted again after the `recall`, the recalled
  result left under the same id (`moved 1 of 4 tool results out, 1 image
  with them`), and the store held as many files as before.
- Five PNG files of 1,000 by 700 pixels, which Claude Code held as JPEG
  (131,028 characters in base64 for the one read back), between four text
  files of 48,643 characters: `moved 8 of 9 tool
  results out, 5 images with them (209371 -> 54171 chars, about 72046 of
  167000 tokens in use)` in 68 ms, from 134,981 tokens. The next request
  sent 55,699: the estimate was 29 % over. No row after the compaction held
  an image's bytes. `recall` of the first returned it as an image, and the
  model described it.

Not measured: an image pasted into a message, and a document.

## Moving out tool inputs, counted in hand-overs

On 2026-10-01, offline: no model was called and nothing was sent. The
transcripts Claude Code keeps on one machine held 492 compactions, 227 of
them distinct (a forked session copies the ones before it). For 84 of
those, 81 of them run by hand in forks made for other measurements, the
message before the compaction is in no file, and the conversation cannot be
put together. That leaves 143: 102 automatic ones from 56 sessions in 5
projects, 75 of them in one project, and 41 run by hand.

Each conversation was put together as it stood before the compaction: the
messages back to the compaction before it, with what that one left in
place put after its summary. (In the 42 conversations where that applies,
the first request plus the characters over three comes to a median 79 % of
the tokens Claude Code recorded with them and 78 % without; left out, two
more of the 102 have nothing to move out.) It was then given to `compact()`
as it is at the default settings, with the tokens Claude Code recorded
before the compaction. The window is the one the plugin stated where it ran
(29 conversations), 967,000 where the session went over 200,000 tokens, and
167,000 otherwise. For 7 automatic ones (and 12 run by hand) the window is
not known; those 7 were compacted at 67,000 to 77,000 tokens. What is not the conversation is taken as the session's
first request, which was 6 to 10 % over the breakdown's figure in the three
sessions where both are known; the tokens a character are the rest over the
conversation's characters, at no less than one in three (21 of the 102 are
at that floor). Where the plugin itself ran, its line gave the same number
of results and characters before as this reconstruction in 17 of 29
conversations: 13 of one session with the small window and 4 short ones
made for measuring. In the other 12 the characters were off by 0.2 to
8.4 % in ten, and by 30 % and 41 % in two; six of the 12 were run by hand,
all with the large window, and six are of the session with the small one.
How many results were moved out is not compared: the versions that ran then
moved fewer.

What the 102 automatic compactions come to:

| | Conversations |
| --- | ---: |
| Compacted by moving results out | 85 |
| Handed over: holds an image, a document or another block that is not rebuilt | 15 |
| Handed over: nothing could be moved out | 2 |
| Handed over: still too full afterwards | 0 |

No conversation was handed over for being too full, so moving inputs out
had none to save. The two with nothing to move out held no input of
`minChars` or more either. Measuring against the tokens before each
compaction as the window instead changes no row.

Three automatic compactions are not among the 102, the message before them
being in no file. Put together from the order of the rows instead, two held
a block that is not rebuilt. The third is the one compaction where the
plugin itself said "too much is still in use" (2026-09-30: 3 of 39 results
moved out, about 136,867 of 167,000 tokens by the estimate of that
version, the 82 % in ADR 0007). Its 39 results and 238,392 characters
agree with the line (39 and 236,225), and it held no input of `minChars`
or more: the one hand-over for being too full that there is, moving inputs
out would not have changed. Whether `compact()` as it is would hand it over
is not told: Claude Code recorded fewer tokens for it than the session's
first request, so the size afterwards cannot be counted the way it is
above.

Of the 41 run by hand, 28
were compacted, 3 held a block that is not rebuilt, and 10 had nothing to
move out, 9 of them with no tool result at all; none of those 10 held a
long input.

How near the 85 came to 75 % of the window, and what moving inputs out
would leave: `Write`, `Edit`, `MultiEdit` and `NotebookEdit` inputs of
`minChars` or more, older than the newest `keepTokens` of the conversation,
each counted as a ticket's length.

| | As it is | `Write`, `Edit` moved | and `Bash` |
| --- | ---: | ---: | ---: |
| Fullest afterwards, share of the window | 72.8 % | 68.0 % | 66.9 % |
| Median, share of the window | 50.0 % | 43.3 % | 39.7 % |
| Conversations over half the window | 43 | 27 | 23 |
| 967,000-token window (61): median share | 48.4 % | 41.4 % | 38.1 % |
| 167,000-token window (24): median share | 58.3 % | 58.3 % | 58.3 % |

In the 61 with the large window, inputs were a median 57.5 % of the
characters left; in the 24 with the small one, 6.8 %, and no input was long
enough to move. All 60 conversations in which an input would have been
moved are of one project (40 sessions), as are 60 of the 61 with the large
window: what the two right-hand columns take off comes from that project
alone (a median 41.4 % over its 60 conversations, where it was 48.5 %).

Nineteen of the 24 with the small window are one session that the plugin
itself compacted again and again, each starting from what its last
compaction left. Over them the results in the conversation went from 6 to
117, the share of the window in use afterwards from 53 % to as much as
67 %, and inputs from 1 % to 12 % of what was left, none of them long.

Why results stay, over the 34,631 results of the 102 conversations: 29,617
are under `minChars`, 1,155 are among the newest `keepTokens`, 804 failed,
and all 3,055 others were candidates. A ticket an earlier compaction left
is counted with the short ones here, since the store was empty.

What this does not show. Of the 61 conversations with the large window, 34
start at the beginning of a session and 27 from what the built-in summary
left: none comes after compactions by the plugin in a row, where inputs
that are never moved out add up, and the one run of those there is held no
long input. And the size afterwards is an
estimate: with what is not the conversation taken from the first request,
as here, a conversation near the line can fall on either side of it.

## When Claude Code's summary runs

On 2026-10-01, Claude Code 2.1.286 with Claude Haiku 4.5, before the
clean-up (ADR 0006) and the private directory were merged. A conversation of
four turns: a first message giving seven details (a codename, a reviewer's
name, a deadline, a build number, a port, a dependency not to add, a
colour), then four `Read`s of 2,200-line data files, two runs of a script
printing 401 lines, and an answer giving three numbered reasons. It was
copied twice and compacted with `/compact`, once by 0.4.0 and once by this
change, both set so that nothing could be moved out (`minChars` at its
largest), so that Claude Code's own summary ran each time. Before the
questions, the data files and the script were taken out of the working
directory, and `Bash`, `Glob` and `Grep` were refused; `Read` was allowed,
since a `recall` result over about 50 KB comes back as a file to read.
Twenty questions, one fresh copy of the compacted conversation each.

|                                                         | 0.4.0 | This change |
| ------------------------------------------------------- | ----- | ----------- |
| A row of a data file or a line of the script's output, 10 asked | 1 | 8 |
| What was said in the conversation, 10 asked             | 10    | 10          |

Every one of the eight came back through `recall`: three in what `recall`
returned, five in the file Claude Code saved a large `recall` result to.
The one 0.4.0 answered, the agent found by reading Claude Code's own
transcript of the session from disk. The ten about what was said were
mostly in the summary itself (seven were answered with no tool at all, by
both); one answer in Japanese is counted right by hand. The summary ran in
21.5 s after 0.4.0 and in 27.5 s after this change.

A conversation holding an image (`Read` of a PNG and of a text file),
compacted by this change: the kept part held `[image not kept]` and the
text file's ticket, and asked for a line of the text file after it was
taken away, the agent recalled the part, then the result, and answered.
In both conversations the message holding the tickets stood right after
the summary, and a further turn and a resumed session read it; the
conversation handed back was no larger than the summary and what Claude
Code kept.
