# 0004. The plugin is named lossless-compaction

- Status: Accepted
- Date: 2026-09-30

## Context

The plugin was named `jev-lossless-compaction` on the day it was started,
when Jev was to decide what left a compaction. ADR 0003 measured that Jev's
order changed nothing at compaction time and moved Jev to the `find` tool.
Since then a compaction uses no Jev at all, `find` is registered only when a
key is set, and Jev is one provider behind it. For someone without a key, the
plugin does nothing with Jev; with the old name it looks as if a Jev key were
required, and the name says nothing of what the plugin does. The owner chose
`lossless-compaction` from three names put to them on 2026-09-30.

A rename touches what other things are named after the plugin: the tools the
model calls (`mcp__<plugin>__recall`, `mcp__<plugin>__find`), the directory
results are kept in (`~/.claude/<plugin>/`), the wording of every ticket
(`recall with mcp__<plugin>__recall id …`), the plugin's id in marketplaces
and in the settings (which hold the key and `storeDir` under that id), and
the repository's address. Results moved out under the old name exist on this
and other machines, and conversations hold tickets that name the old tool.

## Decision

1. The plugin, its repository, its marketplace and its tools are named
   `lossless-compaction`, from version 0.4.0. The repository's old address is
   redirected by GitHub once it is renamed.
2. Tickets written under the old name, in either of its wordings, are read
   as tickets: they are recognised by `isStored`, offered by `find`, and
   read back by `recall` with the same id. A ticket that stands for a result
   of the old `recall` or `find` tool, spelled out in full as 0.1.0 spelled
   it, counts as one of this plugin's own.
3. A compaction that moves something out and hands the conversation back
   (not one that leaves it to the built-in compaction) rewrites the tickets
   already in the conversation to the current wording, on both sides of each
   call, when they stand for a stored result, keeping the id and the size.
   Decision 10 of ADR 0001 (the same content, the same wording) is read as
   "the current wording": a conversation compacted again points its old
   tickets at the tool that exists now, at the cost of one change to the
   early part of the conversation, which moves the prompt cache's cut once.
   A tool result whose text happens to be, character for character, an old
   ticket of a stored id is rewritten with them. A conversation not
   compacted again keeps tickets that name the old tool; the README says to
   call `recall` with the same id.
4. Results are read from two places and written to one. The default place
   is `~/.claude/lossless-compaction/` (under `CLAUDE_CONFIG_DIR` when set);
   the old default, `~/.claude/jev-lossless-compaction/`, is read as well.
   When the old default exists — a symbolic link to it counts — results are
   written there, whether or not the new one exists too: that is where the
   results are, and where a directory made readable to its owner alone was
   made. A plain file where the old directory was does not count. A
   `storeDir` setting is used as given, alone. So a result moved out under
   the old name is read back from where it was written, and someone who
   follows the new README's `mkdir` while holding the old directory loses
   nothing — and gains nothing from the `mkdir` either, since the old
   directory is the one written to: one the plugin made, readable to others,
   is closed by hand with `chmod 700`, which the README says.
5. An installed copy is not carried across the rename by `claude plugin
   update`. What an update under the old id does with 0.4.0 was measured
   before the merge, on a marketplace of the old name pointing at the
   branch: it fails with "Plugin not found", since the marketplace no longer
   lists a plugin of that name, and changes nothing. The README and the
   CHANGELOG carry the steps — uninstall, remove the old marketplace, add
   the new one, install, set the key and any `storeDir` again under the new
   id — and say that until then there is no hook and Claude Code's own
   compaction runs, and that the two are not to be installed side by side.

## Alternatives considered

- **Keep the old directory as the default.** Rejected: the README's
  `mkdir -p -m 700 ~/.claude/jev-lossless-compaction` would keep the brand
  in front, which is what the rename is for.
- **A new default directory with the old one read as a fallback, written
  to no more.** Rejected: someone who had made the old directory readable
  to themselves alone would have their new results written to a directory
  the host makes readable to others.
- **Write to the new directory whenever it exists.** Rejected: both places
  would still be read, so nothing would be lost; but the results of one
  machine would then be split between two directories, on whether a `mkdir`
  had run, and a directory the owner had closed to others would be left for
  one the host opens.
- **Register the tools under the old name as well.** Not possible: the
  host prefixes a tool's name with the plugin's.
- **Leave old tickets as they are.** Rejected: a conversation that is
  compacted again can be pointed at the tool that exists, at no loss; the
  id and the file are the same.
- **Rename the repository before the code change.** Rejected: the pull
  request's address and the marketplace's would change under the work;
  renamed right after the merge, the minutes in which the README's new
  address does not yet answer are few.

## Consequences

- Installed copies are installed again under the new id, and the key and
  any `storeDir` set again; the steps are in the README.
- The old marketplace cache directory stays on disk, unused.
- ADRs 0001 to 0003 keep the old name in their text; they are records of
  their time, and each says so in one line at the top. Descriptions of the
  0.1.0 ticket wording keep the old name too, since that is the wording.
