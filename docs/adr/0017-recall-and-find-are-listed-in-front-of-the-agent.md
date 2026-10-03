# 0017. `recall` and `find` are listed in front of the agent

- Status: Accepted
- Date: 2026-10-03

## Context

A result the plugin moved out comes back only when the agent asks for it.
Where Claude Code loads tools on demand, a plugin's tools wait behind its
tool search: the agent is given their names, and reads a tool's description
only once it has loaded the tool. #38 put a sentence about `find` into
`recall`'s description for that reason. Haiku 4.5 still called neither tool
for 9 of 21 questions about a result that had been moved out, and answered
that it saw no such result (#54).

Two changes were measured against that before either was built
(`docs/measurements.md`, "The tools in front of the agent"), by a rule set
beforehand: a change is built if, with a key, 7 more of the 21 questions
have a call to `recall` or `find` and 7 more are answered right, and the
two other conversations asked lose no more than 2 right answers. Haiku 4.5,
three runs, the same buildings of the conversations for all three:

| Plugin                                  | Questions with a call | Right    |
| --------------------------------------- | --------------------: | -------: |
| Baseline                                |              12 of 21 | 11 of 21 |
| `recall` and `find` listed              |              19 of 21 | 19 of 21 |
| A line after a compaction by the plugin |              18 of 21 | 17 of 21 |

## Decision

A `tool.describe` hook answers `isDeferred: false` for `recall` and for
`find`, and hands on the description Claude Code computed as it is. The two
stand in the list of tools the agent is given; no other tool is moved.

## Alternatives Considered

- **A message after a compaction by the plugin**, saying how many results
  were moved out, that what they held is not in the conversation, and how
  one comes back. One short of the rule on both counts. It also adds a
  message to the conversation at every compaction, the agent still searched
  for the tool (27 of 30 questions), and the two other conversations came
  out lower with it than the baseline (18 of 24 and 10 of 15 right with a
  key, against 19 and 12). Not taken.
- **Other words on the ticket.** Not measured. A ticket is read back by the
  next compaction, by `find`, and in the wordings of three earlier versions:
  a change to it touches all of them.
- **Other words in `find`'s description.** Three were measured for #38 (8,
  13 and 11 of 21). A description is not read while its tool waits behind
  the search.

## Consequences

- With no key nothing is gained. There is no `find`, and with `recall`
  listed Haiku recalled no more often (right on 3 of 21 questions, where it
  was on 4): nothing in the conversation says which of thirteen tickets is
  the one asked about.
- With a key, `find` is called more often, and every call sends the
  provider the question and, of each result moved out, its call and a
  digest of it. Over the three conversations measured it was called in 51
  of 69 questions, where the baseline called it in 27, and in 18 of 24
  where every call names the file it read, where the baseline called it in
  5; and in 55 of 69 as merged, with `find` looking for a value as well
  (#55). Without a key nothing is sent, as before: how much goes to the
  provider is decided with the key.
- The two tools are in the list of tools of every request. In what was
  measured a question's first request was no larger for it.
- `tool.describe` is one more event the plugin hooks, and an event name a
  Claude Code does not have stops every hook of the plugin
  ([0014](0014-after-a-summary-files-changed-on-disk-are-named.md)).
  `claude plugin validate` takes this one on Claude Code 2.1.285 to 2.1.288;
  an earlier one was not tried. CI runs that check on the version it names,
  and once a week on the newest.
- Where a tool waits is Claude Code's to decide. Where it lists every tool
  anyway, the hook changes nothing.
- `recall`'s description still names `find` (#38): on a Claude Code that
  keeps the two behind the search all the same, that sentence is where an
  agent learns of `find`.
