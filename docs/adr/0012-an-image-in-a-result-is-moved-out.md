# 0012. An image in a tool result is moved out with the result

- Status: Accepted
- Date: 2026-10-01

## Context

A conversation holding one image or document is left to the built-in
compaction (ADR 0001, decision 8): a rebuilt message carries text and tool
blocks only, and a message kept with Claude Code's handle makes a resumed
session restore the whole history. The built-in summary drops images as
well, so the image is lost either way, and with it the text and the results
the plugin would have kept or moved out.

Counted over local transcripts on 2026-10-01 (#25, `docs/measurements.md`),
17 of the 20 automatic compactions that would be handed to the built-in
summary are handed over for an image, and each of them would have fitted
once its results were moved out. Every image in those transcripts, 621 in
618 results, stands in a tool result: a screenshot a tool returned, an image
file read with `Read`. None was pasted into a message, and no document was
found.

The messages a `session.compact` hook is handed hold the image as well, in
the tool's record on both sides of the call.

## Decision

1. A tool result that holds an image is always moved out, whatever its age
   or size, before any other result is chosen: the result's text and its
   images are stored as one entry, in the order the result held them and
   without what the host put after them (a reminder), and
   the result becomes one ticket, in the wording every ticket has. The call
   and the result are rebuilt as for any moved-out result, without the
   tool's record. That an entry holds an image is told by how it begins,
   not by what is noted beside it.
2. When such a result cannot be stored, nothing is rebuilt: the
   conversation goes to the built-in compaction as it was handed over.
3. `recall` returns the result's text and its images in the order they were
   stored, the images as image blocks in the form the Messages API takes,
   and adds nothing; an image's bytes are never returned as text. Measured:
   that form reaches the model as an image, and the two MCP forms do not
   (`docs/measurements.md`). With nothing added, the recalled result read
   from the conversation again is the same stored text, so a later
   compaction writes nothing for it.
7. A stored text is taken for one that holds images only when it begins as
   such an entry does and every image in it is bytes in base64 that begin
   as their kind does. A tool's output that only has the shape stays text.
4. `find` neither sends nor returns an entry that holds an image.
5. The size of a conversation is counted without its images on both sides:
   their bytes are not among its characters, and their tokens are taken off
   what the breakdown says the messages come to.
6. An image or a document outside a tool result, and an image that is not
   held as bytes, are left to the built-in compaction as before.

## Alternatives Considered

- **A line for the image after the result's text.** A ticket is read only
  when it is the whole of a result; two lines are read as neither by the
  four places that read tickets.
- **Placing images of a person's message by matching text.** No such image
  is in the transcripts to measure against, and two messages with the same
  text would be told apart by nothing.
- **Keeping the handle on a message that holds an image.** Measured in ADR
  0001: a resumed session restores the whole history.
- **Dropping the image, as thinking is dropped.** An image is something a
  tool returned or a person gave; dropped, nothing brings it back.

## Consequences

- A result that holds an image is not offered by `find`, text included.
- The newest image leaves the conversation at a compaction, where the
  newest results stay.
- The store grows by the images: 120.8 MB for the 621 in those transcripts.
- An image counts for about 1,500 tokens whatever its size: an estimate,
  since the breakdown gives no figure for one.
