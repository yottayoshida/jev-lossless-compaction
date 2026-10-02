# 0011. The size after a compaction is counted from what stays

- Status: Accepted
- Date: 2026-10-01
- The way of counting is replaced by
  [0013](0013-the-size-after-is-what-is-in-use-less-what-goes.md); what the
  size is for, and when the breakdown is relied on, stand.

## Context

A compaction estimated the context afterwards as the tokens in use before,
less what was moved out: `tokens - saved / 3`. The tokens in use before count
earlier thinking blocks. Every message is rebuilt and none carries thinking,
so the thinking is gone afterwards whatever is moved out. On 2026-10-01 a
compaction said "about 398639 of 967000 tokens in use" and the next request
sent 231,902 (#24).

The same estimate decides whether the conversation is still too full and goes
to the built-in summary, which is the one compaction that cannot be undone.
A conversation that fits once its thinking is gone could be handed over.

The goal and what is needed were tied to the same number: the goal is at most
half of what is in use, so what is needed was always above zero. A size after
that leaves thinking out, set against a goal that counts it, can need nothing,
move nothing out, and hand the conversation over for that.

## Decision

When Claude Code's breakdown can be relied on, a size is what is not the
conversation plus the conversation's characters at the session's own tokens
a character: the `Messages` row over the characters of the conversation as
it was sent, thinking and signatures included, and at no less than one in
three. What a summary could take away is counted the same way. The size
after counts the rebuilt messages; the goal is half of the same estimate of
the messages before, so what is needed stays above zero.

The breakdown is relied on only when the tokens in use are Claude Code's
measured figure, the breakdown carries the last response's usage, it has a
`Messages` row among the rows in use, and what is not the conversation comes
out between zero and the tokens in use. Otherwise the decision is made as
before, and the line names no token count it cannot stand behind.

"What is not the conversation" is the rows in use other than `Messages`.
Measured, the tokens in use less `Messages` came within 3 tokens of it.

Measured against the next request (`docs/measurements.md`), the size
counted this way came 17 % over and 2 % under, where the one before was 52
to 83 % over. At three characters a token throughout it came within 11 to
13 %, but low for Japanese, where it could say a conversation fits at a
third of its size; the session's own figure was taken so that the size
errs high, as the one before did, and never as far. The aim in #24 was
10 %; it was set at 20 %, the decision moving only near `maxAfterPercent`.

## Alternatives Considered

- **Subtract the thinking's characters at some ratio.** The thinking and its
  signatures can be counted, but not their tokens: the figures of #24 put
  them near 1.5 characters a token, and one session does not fix a ratio.
- **Remember per session how far the last estimate was.** Does nothing for
  the first compaction, and needs state across hooks.
- **Count with the token-count API (`breakdown: 'full'`).** Sends the
  conversation to count it; a compaction sends nothing.
- **Write "at most" and keep the number.** The old number is not an upper
  bound (English prose runs near four characters a token), and the decision
  would stay wrong.

## Consequences

- The session's figure is an average over all it sent, thinking, results
  moved out and signatures included. What stays at a lower figure than that
  average (code, English) comes out high, and what is not the conversation can
  be smaller after a compaction (a tool loaded on demand is loaded again):
  near `maxAfterPercent`, a conversation that would have fitted can still be
  handed to the built-in summary, less often than before. What stays denser
  than the average (Japanese left after code was moved out) comes out low, at
  worst at the figure of the thinnest part of what was sent, no longer at a
  third of its size.
- Without a usable breakdown — right after a compaction, before a response —
  the line shows characters only.
