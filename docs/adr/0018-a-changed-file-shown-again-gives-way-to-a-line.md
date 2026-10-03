# 0018. A changed file shown again after a summary gives way to a line with the id of its reading

- Status: Accepted
- Date: 2026-10-03
- Takes up an alternative
  [0014](0014-after-a-summary-files-changed-on-disk-are-named.md) did not
  take: something else in place of the changed file as Claude Code shows it
  again. What 0014 decided stands, and this rests on it.

## Context

After a summary Claude Code shows the files read last again, as they are on
disk then and in the words of a `Read` result. A file that changed since the
conversation read it is shown as it is now, and an agent takes that for what
it read. 0014 has the plugin name such files in its own message after the
summary, each with the id its reading comes back by. With that line alone
Haiku 4.5 answered right six times of twelve in what 0014 measured. With the
two tools listed in front of the agent
([0017](0017-recall-and-find-are-listed-in-front-of-the-agent.md)), in the
four conversations measured for #54, it is 9 of 12, and 6 of 9 in the three
where the file is shown again; each miss called nothing and gave another
text.

0014 measured leaving the changed file out of what is shown again, 5 of 5,
and a line in front of the file as it is shown, 2 of 5, and took neither,
for three reasons. Each was looked at again for #54:

- **An event name a Claude Code does not have stops every hook.** It still
  does. `claude plugin validate` takes `prompt.attachment` on Claude Code
  2.1.285 to 2.1.288, as it takes `tool.describe` (0017), and CI runs that
  check.
- **Which paths the conversation read is not known in a process that is a
  fork of the one that summarized.** It need not be: the plugin's message
  after the summary names the changed files and their ids, and that message
  is in the conversation any process has.
- **A file shown again cannot be told from a file the person mentions.** It
  cannot, by the event: both are an attachment of the kind `file` whose
  origin is the engine. Nor does the conversation say whether the summary
  was just now, since Claude Code keeps the last messages from before a
  summary behind the plugin's own.

Measured before it was built (`docs/measurements.md`, "A note in place of a
file shown again" and "The note, narrowed"), four conversations sent to the
summary, Haiku 4.5, three runs:

| Plugin                                                        | What the file said when it was read |
| ------------------------------------------------------------- | ----------------------------------: |
| The line after the summary alone, the tools behind the search |                             7 of 12 |
| and the two tools listed (0017)                               |                             9 of 12 |
| and a line in the file's place                                |                            12 of 12 |

The 12 are 9 in the three conversations where the file is shown again and
the line stood, and 3 in the one where it is not.

## Decision

A `prompt.attachment` hook on attachments of the kind `file` answers a line
of the plugin's in place of the file when the plugin's message after the
last summary names that file as changed: that it changed on disk since the
conversation read it, the id its reading comes back by, and that the file as
it is now is read by reading it again.

Not once a file of that name has been handed over with an `@`, in anything
typed that stands behind the plugin's message, a command's arguments
included. The file is then shown as it was asked for, where Claude Code
shows it again as well. How Claude Code reads an `@` is its own, so the
plugin errs on the side of showing: the name anywhere in what follows the
`@` counts.

Any other file is left as it is shown, and nothing is put in a subagent's
conversation. A conversation that cannot be read leaves the file as shown.

## Alternatives Considered

- **The line wherever the plugin named the file**, as first measured. It
  stands in place of a file handed over later too, until the next summary:
  what the person asked to be read would not be shown. Not taken.
- **The line at the first request after the summary only**, told by whether
  an answer has come since the plugin's message. Claude Code keeps answers
  from before the summary behind that message, so the first request has one
  already: built that way, the hook put the line in place of nothing in 12
  units.
- **The line once for each path in a process.** Claude Code asks of each
  attachment again when a session is resumed, and whenever a hook asks for
  it: a line given once would be withdrawn the second time for the same
  file, with nothing in the conversation changed. The answer has to rest on
  the conversation alone.
- **Matching what follows the `@` to the file's path**, whole or by its last
  parts. Built that way first: `@log.txtを見て`, a path from another
  directory and a command's arguments were not matched, and the line would
  stand where the person had meant the file to be shown. A miss on that side
  hides what was asked for. Not taken.
- **Leaving the file out**, with nothing in its place. 0014 measured it at 5
  of 5. A line in the place says where the reading is and how the file is
  read as it is now, at the place the agent looks.

## Consequences

- Asked what the file says now, the agent reads it again: once in each of 12
  answers, all right. Where the file was shown it mostly needed no call.
- Once a file of that name is handed over, it is shown as it is from then
  on: also where the line stood, the next time Claude Code asks of that
  attachment, as it does when a session is resumed. Whether the agent then
  fetches the reading is as it was with the line after the summary alone.
- What stands behind the plugin's message is what was typed since the
  summary and the last messages Claude Code kept from before it. A file
  handed over just before the summary may be shown as it is as well, and so
  may this file when another whose name holds its name is handed over.
- The file is told by how Claude Code frames it, the call that would have
  read it as the first line, and matched to what the plugin named by its
  path as written. Framed otherwise, or shown by another spelling of the
  path, nothing is put in its place, and the benchmark is what notices.
- For each file Claude Code attaches, the plugin reads the conversation. The
  hook's own part of that takes 1.8 ms on a conversation of 4096 messages
  and 5.8 million characters; what Claude Code takes to hand the
  conversation over was not measured.
- `prompt.attachment` is one more event the plugin hooks, with what 0017
  says of an event a Claude Code does not have.
