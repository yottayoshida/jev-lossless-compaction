# 0015. A `/compact` with nothing to move out and room left is not summarized

- Status: Accepted
- Date: 2026-10-03

## Context

The plugin moves one kind of thing out of a conversation: a tool result of
`minChars` characters or more. When a conversation asked to compact holds
none, the plugin keeps the conversation (0007) and hands it to Claude Code's
own summary, whoever asked and however full the conversation is.

In the benchmark (`docs/measurements.md`) that is five of the six
conversations, and four of the five were at 17 to 41 % of the size at which
Claude Code compacts on its own. The summary took 25 to 40 seconds, cost
what a summary costs, and put its own words where the conversation was.
Nothing was lost by it, since the conversation is kept first: what it costs
is the wait, the tokens, and a rewritten conversation nobody needed.

Counted over the transcripts of one machine (#44; 124 compactions of working
sessions over thirty days, with the sessions run in a box for measuring told
apart), a `/compact` run by hand found nothing to move out in 6 of 30. The
size of the window is in none of the six records. Three were of one project
used to try the plugin out. Of the other three, one was a `/compact` right
after a summary, one a conversation of 400 characters under 90,000 tokens of
system prompt and tools, and one held 78,000 characters pasted into messages
and was full if its window was 200,000. So it is rare in use, and where it
happens there is mostly nothing a summary could take away.

A probe on Claude Code 2.1.287: a hook that answers a `/compact` run by hand
with `{ skip }` ends it in 35 ms. The session prints
`Not compacted · <reason>`, records `compact_result: failed` with the reason
after `skipped:`, writes no boundary, and exits 0. The next request was what
was in use before, and the line. A classic `PreCompact` hook does not run.

## Decision

On `session.compact`, when nothing was moved out, the compaction is skipped
and Claude Code's summary does not run, if all four hold:

1. the compaction was run by hand (`trigger` is `manual`);
2. there was no candidate to move out — a candidate that could not be
   written goes on as before;
3. `/compact` was given no instructions, or only white space;
4. what is in use is no more than `maxAfterPercent` of the size at which
   Claude Code compacts on its own.

What is in use is the figure Claude Code gives, thinking included: a skipped
compaction rebuilds nothing, so the thinking stays. When Claude Code gives
none, it is the conversation's characters over three, as it already is for
every other size.

Nothing is remembered between compactions. Someone who wants the summary
runs `/compact` with instructions, and the line says so. The line is the
reason Claude Code shows for not compacting; the plugin shows none of its
own beside it, which in a terminal said the same thing twice. It names what
is in use only when that is Claude Code's figure.

The four conditions are one function under `src/`; the hook calls it with
the trigger, the instructions, Claude Code's figure and the count of
candidates, and a test holds that call to those four.

## Alternatives Considered

- **Let a second `/compact` through, remembered in the process.**
  `claude -p --resume … "/compact"` is a new process each time and would
  never go through, which is why 0010 did not remember a held `/compact` by
  process either; and there is no moment at which to forget.
- **Skip an automatic compaction too.** It runs because the conversation is
  full. Stopped, the conversation overflows.
- **A setting of its own for the line.** It would mean what
  `maxAfterPercent` means: how much may stay in use to go on with.
- **Draw the line at the estimated size.** That figure is less the thinking
  and the images, which a rebuilt conversation drops and a skipped one
  keeps: a conversation at 80 % would be read as under 75 %.
- **Hand back the rebuilt messages with nothing moved.** The thinking would
  go, and nothing brings it back.
- **Move more kinds of thing out** (text pasted into messages, the inputs of
  `Write` and `Edit`). Another decision. In the six above it would have
  changed none, and where it may matter — a conversation still too full
  after results are moved out — it has not been counted with the plugin's
  own figures.

## Consequences

- A `/compact` on a conversation with room and nothing to move out does
  nothing but say so. Claude Code shows it as not compacted and records it
  as failed.
- In the benchmark, four of the five conversations that were handed over are
  left as they are; the next request there is larger than after the built-in
  compaction, which summarized. What happens after a hand-over is measured
  with `maxAfterPercent` at 1, where the line is under any conversation.
- What is handed over before anything could be moved — no place to keep
  results in, an image pasted into a message, 4096 messages or more — is
  summarized as before, with room or without.
- With no figure from Claude Code, a conversation that is large by its
  tokens and small by its characters is left as it is when a summary would
  have made room. It is by hand only, and `/compact` with instructions
  summarizes.
