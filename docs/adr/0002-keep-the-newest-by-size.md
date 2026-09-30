# 0002. Keep the newest results by size, not by count, and shorten the ticket

- Status: Accepted
- Date: 2026-09-30
- Amends: 0001 (decision 5, what rules leave alone; decision 10, the ticket's wording)

## Context

The first version left alone every tool result in the newest six messages
(`keepNewest: 6`). Measured on a real session on 2026-09-30 (Claude Code
2.1.285, Opus 4.6, a 200k window compacting at 167k, twenty automatic
compactions in thirty minutes):

- Reading one file is three messages (the call, the result, one line about
  it), so six messages were the newest two files. When the files were large,
  50,000 to 60,000 characters each, 100,000 to 150,000 characters stayed in
  the conversation after every compaction, on top of some 60,000 tokens of
  system prompt and tool definitions that no compaction touches. The next
  file read brought the conversation back to the threshold, and the plugin
  compacted once a minute.
- Each ticket was 258 characters. After 95 results had left, the tickets
  alone were 24,000 characters.
- What was left after a compaction came to 16,000 to 54,000 tokens; the
  built-in summary of the same conversations came to 4,000 to 5,000.
- In all twenty compactions every candidate left: the amount to move out (half
  of what was in use) was never reached. What stayed was what the rules kept.

Across 322 local sessions, 99.3% of `Read` results of 2,000 characters or more
are 60,000 characters or shorter (the 95th percentile is 30,176, the 99th
52,359); `Bash` results reach 10,000 at the 99th percentile.

## Decision

1. What is left alone at the newest end is decided by size, with one result
   kept whatever its size. Walking the results that could otherwise leave
   (long enough, not failed, not a ticket, not in the first message, not made
   obsolete by a later call, and with the same text on both sides of the
   call) from the newest: the newest stays; the ones before it stay while
   they and the newest together add up to at most `keepTokens` tokens, at
   three characters a token; from the first that goes over, every older one
   is a candidate to leave, whatever message it is in. Short results, failed
   calls, tickets and the first message stay as before and do not count
   toward the total. A result a later call made obsolete is a candidate
   wherever it is, the newest included, and does not count either. Results of
   one message are counted one by one, in order. The default is 20,000
   tokens: one large `Read` result, or half a dozen large `Bash` results.
2. What this promises is which results are candidates, not how much stays: a
   compaction still moves out only what brings the context to its target, so
   in a conversation with more candidates than that, older candidates stay and
   Jev's order decides which. That is decision 4 of ADR 0001 unchanged.
   (Amended by ADR 0003: the order is rules', not Jev's.)
3. The `keepNewest` setting is removed and ignored. Where the host still hands
   its value to the plugin, every compaction of the main conversation says so
   in one line, before anything else is decided; whether the host does hand
   over a key the manifest no longer declares has not been measured.
4. The ticket reads `[moved out] <tool> result, <bytes> bytes; recall with
   mcp__jev-lossless-compaction__recall id <64 hex>`: about 150 characters
   plus the tool's name, 154 for a `Read`. The id and the tool's exact name
   stay: the id is the ticket, and the agent was seen loading the tool by that
   name through `ToolSearch`.
5. A ticket in the first version's wording is still recognised as a ticket, so
   that a conversation compacted before this change is compacted again without
   its old tickets being taken for ordinary results. This matters only below
   the default `minChars`, where a 258-character line is a candidate.
6. When the result that leaves is one this plugin's own `recall` tool
   returned, the ticket names the tool `recall`.

## Alternatives considered

- **Keep the count and add a size cap on top.** Rejected: two knobs for one
  intent, and the count was seen to mean nothing about size.
- **Lower `keepNewest` to 3.** Rejected: one file's worth of messages, still
  blind to size; a 200,000-character result stays, and nothing older does.
- **Keep the newest K results (default 1), counted in results rather than
  messages.** Rejected: after a run of small `Bash` results, the large `Read`
  before them would leave; size keeps it.
- **Size alone, without the newest kept unconditionally.** Rejected: a newest
  result over the allowance would leave, and the allowance could keep nothing.
- **The newest kept outside the allowance, the allowance counted after it.**
  Rejected: in the measured session, where large results follow one another,
  two of them would stay as before and nothing would change.
- **A default of 10,000 tokens.** Rejected for now: the second-newest large
  result is often the one the next step works on. To be revisited with the
  `recall` round trips measured.
- **Promise how much stays after a compaction.** Rejected: how much leaves is
  bounded by the target, not by the allowance, so the promise would be false
  whenever candidates outnumber the need.
- **Drop the tool's name from the ticket** (about 120 characters). Rejected:
  the agent needs the exact name to load the tool on demand.
- **Merge old tickets into one line.** Rejected: every tool call needs its own
  result in the conversation.
- **Count short and failed results toward the total.** Rejected: a
  conversation with many short results would then use up the allowance and
  lose the newest large results.
- **Move out failed results outside the allowance too.** Deferred: 2 results
  and 19,000 characters in the measured session, 9% of what stayed. To be
  measured again once the allowance is in; it would change the README's
  "failed calls stay" and needs a mark on the ticket.

## Consequences

- In a compaction where every candidate leaves, as all twenty measured ones
  did, what stays of the tool results is the newest one and whatever fits
  with it in the allowance: for large files read one after another, one file
  instead of two. Run over the conversations just before the measured
  session's compactions 18 and 19 with both rules, the results left in the
  conversation went from 113,711 to 60,340 characters and from 104,525 to
  52,283. Where candidates outnumber the need, older ones stay too.
- A result read and then edited stays a candidate even when it is the newest:
  the newest result of an edited file is the stale one.
- The estimate errs toward keeping more: source code measured 2.2 to 2.3
  characters a token, so `keepTokens: 20000` keeps about 26,000 to 27,000
  tokens of it.
- A result read just before the compaction may now leave when it is neither
  the newest nor within the allowance. Getting it back is one `recall` call.
- Two wordings of the ticket exist in conversations from now on. Both are
  read; only the new one is written.
