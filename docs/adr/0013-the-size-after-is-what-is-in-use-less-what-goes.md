# 0013. The size after a compaction is what is in use, less what goes

- Status: Accepted
- Date: 2026-10-02
- Replaces the way of counting in [0011](0011-the-size-after-is-what-stays.md);
  what 0011 decided the size is for, and when the breakdown is relied on,
  stands.

## Context

0011 counts what stays at the session's own tokens a character: the
`Messages` row over the characters of the conversation as it was sent,
signatures included, and at no less than one token to three characters.
The benchmark of #28 and the measurements for #37 (`docs/measurements.md`)
showed three ways that goes wrong, with the plugin saying itself what it
counted with:

- The floor counts too much where text runs to more characters a token.
  Pasted English prose came to 0.22 to 0.25 tokens a character and was
  counted at a third: 37 % and 49 % over where nothing could be moved, and
  39 % over in a conversation of prose with results moved out of it, which
  was handed to the built-in summary at an estimated 86 % of the window when
  103,634 tokens, 62 %, were in use afterwards.
- The characters the figure is made from are not the characters it is
  applied to. Signatures and the ids of calls are in the first and not in
  the second: a conversation of many short results was 22 % under.
- What is moved out and what stays are not equally dense. Japanese left
  after English logs were moved out came 20 % under on Haiku and 18 % on
  Opus.

What makes the figure hard is that two things in the `Messages` row are
gone once the messages are rebuilt, whatever is moved out, and neither can
be read in tokens.

The thinking: the breakdown has no row for it and a message carries no
usage. What can be read is each thinking block's signature. Measured per
response, its length is a line in the thinking's tokens: about 560
characters a block and 2.2 a token on Haiku 4.5, about 1,030 to 1,090 and
1.95 to 2.1 on Opus 5.5.

What Claude Code adds to the conversation as it sends it: reminders after
results and after what the person said, the text of commands and of what
was attached. None of it is in the messages a hook is handed, so none is in
the messages it hands back. In the benchmark's made-up conversations it is
little: 1.5 % of the characters of `results`. In two long working sessions
on Opus 5.5 it was half and three quarters as much again as the messages
held.

## Decision

A size is what is in use less what goes.

- The thinking that goes is estimated from the signatures: their length,
  less the shortest of them for every block, at 2.3 characters a token.
- The `Messages` row less images less that thinking is spread over the
  characters of the conversation as it was sent: what was said, the calls'
  inputs and the results, with what Claude Code added to them, which
  counts at four fifths. A digit counts as two characters and a character
  that is not ASCII as three. That is the density.
- What is in use after is what is not the conversation, plus the rebuilt
  messages' weighted characters at that density. What is in use before is
  counted the same way from the messages the hook was handed, so what
  Claude Code added is in neither. The goal, what is needed, what a round
  of moving out saved and what a summary could take away are all counted
  the same way.
- There is no floor.
- When the conversation cannot be read as it was sent, the thinking comes
  out at more than nine tenths of `Messages`, or the density outside 0.05
  to 3, the breakdown is not relied on: the decision is made as before
  0011, and the line names no token count.

`keepTokens` stays at three characters a token, as the README says.

## Alternatives Considered

- **Keep 0011 and drop the floor.** Takes the errors over away and leaves
  the ones under: 20 % under where Japanese stays.
- **Two figures, with and without the signatures, and decide by the lower.**
  The truth lay between them in six conversations on Haiku; on Opus, where a
  signature is twice as long, they are too far apart to decide by.
- **Spread the row over the messages the hook is handed.** What this
  record decided first. It was within 8 % on every conversation of the
  benchmark compacted by the model that built it, where Claude Code adds
  next to nothing, and 68 % over on the first working session it was tried
  on: it counts what Claude Code added as staying.
- **What Claude Code added counted as the messages are.** What this record
  decided next, once what was added had been found. In five working
  sessions it came to 0.75 to 0.88 times the tokens as many weighted
  characters of the messages did: reminders in plain English, lighter than
  the code and JSON the messages hold. Counted alike, the sizes were 4 % to
  10 % under. Four fifths was chosen on four of the sessions, and the
  fifth, measured with it, came 1 % under.
- **Fixed tokens a character by kind of character, without the `Messages`
  row.** Does not depend on thinking, but ASCII alone runs from 0.22
  (prose) to 0.5 (logs of numbers), and a tokenizer changes with the model.
  The weights are taken from it; the density is still the session's.
- **A table of signature lengths per model.** Right until the next model.
  The shortest signature of the session stands in for what every block
  carries.
- **Count the thinking's tokens turn by turn.** Needs state across hooks,
  and misses a session the plugin was enabled in half way.
- **The token-count API.** Sends the conversation (0011).

## Consequences

- Measured against the next request where results were moved out, in the
  benchmark's conversations: 3 % over (results), 7 % over (prose with
  results), 1 % and 2 % under (Japanese with results, Haiku and Opus). In
  five long working sessions on Opus 5.5, 172 to 235 thinking blocks: 2 %
  under to 3 % over, the four the four fifths was chosen on and the fifth
  measured with it. Where nothing could be moved there is no next request of
  what would have been rebuilt; against what was in use before less the
  thinking, which still holds what Claude Code added, up to 7 % under.
- It runs over where what is moved out is denser than what stays (logs out
  of prose: the 7 %), and off where what Claude Code added is lighter or
  heavier than four fifths of the messages: in the five sessions that
  figure ran from 0.75 to 0.88, and what was added was half to four fifths
  as much again as the messages. One density for what was sent and one
  share for what was added, whatever the model and the session.
- The thinking is estimated at 0.6 to 1.5 times what it was. The shortest
  signature is not what every block carries. In the benchmark's
  conversations the estimate was 0.95 to 1.5 times the tokens the building
  session counted, the 1.5 being 500 tokens; in the five working sessions
  0.64 to 1.16 times. None of these had fewer than
  four blocks. With one block, or blocks whose signatures are all as long,
  the estimate is nothing, and the size is over by the thinking.
- The breakdown is of the last response. Right after the model is changed
  it is the count of the model before: a conversation built with Haiku and
  compacted by Sonnet before Sonnet had answered came 20 % under where
  English prose stayed, which Sonnet counts a third more tokens for. No
  way of counting from what a hook is handed mends that.
- An image is still taken off at a rough 1,500 tokens. Two of the working
  sessions held 29 and 11 images in their results and came within 3 %; a
  conversation that is mostly images was not measured with this count.
- Four constants: 2.3, two and three, chosen on five made-up conversations
  and the signatures of the built traces; four fifths, chosen on four
  working sessions.
