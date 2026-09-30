# Measurements

Every figure the README quotes, with how it was taken. Except for the last
section, they were recorded when the plugin was named
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

Six left because six reached the target. They were written to the old
directory, whose index grew from 153 to 157 entries (two of the six repeated
a text already written), and no `~/.claude/lossless-compaction/` was made.
In the same setting, a conversation compacted by 0.3.0 was compacted again:
its thirteen old tickets were rewritten to the current wording, none left
out, and three more results left; `find`, asked about one of the thirteen in
a copy of that conversation not compacted again, returned it at probability
0.99; and with an empty `~/.claude/lossless-compaction/` made by hand,
`recall` of an old ticket's id returned the result, and the new directory
stayed empty.
