# Limits

What the plugin does not do, and what a repository or a version can change.

## When the built-in compaction runs instead

Claude Code's built-in compaction runs instead when the conversation holds an
image, a document or any block of a kind the plugin does not know, has 4096
messages or more, belongs to a subagent, has nothing that can be moved out,
or is still too full afterwards and a summary could change that.

## What a summary replaces

Before the built-in summary runs on the main conversation, the plugin keeps
the conversation it summarizes (ADR 0007): every result of 400 bytes or more
still in it is moved out as usual, a shorter one staying in the text, and the conversation is written as text in parts of at most
40,000 bytes, each stored like a result. Right after the summary, one message
names each part:

```text
[lossless-compaction] The conversation this summary replaces is kept, in 2 parts; recall a part by its id.
[moved out] conversation before the summary, part 1 of 2, messages 1-40, 38211 bytes; recall with mcp__lossless-compaction__recall id …
```

A part writes each message as `--- user` or `--- assistant`, then its text,
then for each call `[call <tool> <id>]` with a one-line form of its input
and, below it, every field of the input as `<name>:` followed by its value
with its own line breaks, then `[result <id>]` (`[result <id> error]` for a
failed one) followed by the result or its ticket. An input value too long
for a part leaves as a ticket named for the call and the field, such as
`Write.content`, whose wording still says "result". A message too long for
a part is cut at a line, and a line too long at a character. Read in order,
the parts are the messages in order.

What is not kept: images and documents, which leave `[image not kept]` or
`[document not kept]`; thinking; messages older than the 4096 Claude Code
shows a plugin; the conversation of a subagent. Nothing is kept when the
place results are kept in is not an absolute path or cannot be read, or when
a part cannot be written, and the compaction says
so; the summary is then Claude Code's alone, as before, and earlier tickets
may be gone from the conversation, the files remaining. A block of a kind
the plugin does not know is kept as its JSON.

`find` offers the parts and the results their tickets stand for, reading at
most 64 parts, parts of an earlier summary included; of the results found in
parts, it offers no more than make 1,200 tickets in all, and `recall` still
reads the others by id. Whether the agent goes
back to what was kept rather than trusting the summary is up to it.

Every summary keeps the whole conversation, so the directory grows faster
than moving out alone makes it grow.

Every message is rebuilt, so older thinking blocks are not carried over, and
a tool that was loaded on demand has to be loaded again. The built-in
compaction drops both as well.

## Which results leave

Of the tool results that could leave — long enough, not failed, not a
ticket, not in the first message, not made obsolete by a later call, and with
the same text on both sides of the call — a compaction keeps the newest
whatever its size, and keeps the ones before it while they and the newest
together add up to at most `keepTokens` tokens (three characters to a token,
20,000 by default); every older one is a candidate to leave, whatever message
it is in. A result a later call made obsolete is a candidate even when it is
the newest.

## Function hooks

The plugin needs Claude Code's function hooks, which are early access and off
by default. Without `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` the plugin
installs, shows in the list, and does nothing.

## The files

Files are plain text under `~/.claude/lossless-compaction/`, or under
`CLAUDE_CONFIG_DIR` when that is set. A secret in a tool result stays there
until no conversation holds it any more, as below, or until you delete it.

## How long results are kept

A result is kept while a conversation Claude Code can still resume names
it, and a week after (ADR 0006). The conversations Claude Code can resume
are its transcripts under `<config>/projects/`; a forked conversation, a
rewound branch and one compacted by an earlier version keep the ids in them
too, so they are counted without the plugin keeping a list of its own.

- The place transcripts are in is recorded at a compaction, in the store
  (`roots/`), when a directory under `<config>/projects/` holds this
  session's transcript. Nothing is collected until one is recorded, nor in
  the week after the first was.
- At most once a week, after a session starts and without holding it up, the
  plugin reads every 64-hex string out of those transcripts (`grep` from
  `/usr/bin`, else `/bin`; measured: 81 s for 2.9 GB). A result over a day
  old that none of them names moves, with its index entry, to
  `trash/<day>/`. One the trash has held over a week, still named by none,
  is removed; one named again goes back.
- `recall`, `find` and a compaction put back from the trash what the
  conversation names before reading it. A result moved there while a session
  used it is not lost.
- A recorded place that is gone is skipped: nothing can be resumed from it.
  A place on a disk that is not mounted at the time looks gone too, and what
  only its transcripts name can go to the trash; it comes back from there if
  the disk is back within the week.
  One that is there but cannot be looked at or read in full, a project
  directory that is a link (a search does not follow it), a search that does
  not reach its end — every search also reads a file of the plugin's own that
  holds one known id, and one that does not print it did not finish — a
  search whose output is too long, all recorded places gone, or commands that
  cannot be run, stop the collection before anything moves, and the line it
  prints says why. A transcript that is itself a link inside a project
  directory is not followed and not counted.
- A collection stopped while moving leaves what it moved in the trash, where
  `recall` and the next collection put it back when it is named. What it
  reports is counted on disk afterwards.
- A collection that a short session cuts off is tried again a day later;
  only one that went to the end waits a week.
- A transcript outside a recorded place — copied from another machine, or of
  a `CLAUDE_CONFIG_DIR` that shares a `storeDir` and has not compacted since
  — is not counted. Resuming it can find a result gone. Starting a session
  and compacting once under each configuration records its place.
- Any 64-hex string counts, a git object id or another hash as well; that
  keeps more, never less.
- The trash and the removal run `mkdir`, `mv` and `rm` from `/bin` or
  `/usr/bin` on the files under `blobs/`, `index/` and `trash/` only. A
  guard that sits in `PATH` does not see them.
- A copy of 0.4.0 or earlier, on the same store, does not put back from the
  trash: a result moved there while it ran is read again once a current copy
  puts it back, which the next collection does for any result a transcript
  names.

Before a compaction writes anything, the plugin makes the directory it writes
to readable by its owner alone: it runs `mkdir -m 700` when the directory is
not there and `chmod 700` on it either way (from `/bin`, else `/usr/bin`,
never through `PATH`). A link or a file in its place, a directory `chmod`
fails on (someone else's), or a host where neither command can be run —
NixOS without `/bin` and `/usr/bin`, a surface of Claude Code that runs no
commands — means nothing is moved out, and the line the compaction prints
says why. Each other directory it reads from that is there as a directory is
closed the same way; when that fails, the compaction says so and goes on. A
`storeDir` you point at an existing directory is made mode 700 too: point it
at a directory of its own.

What that covers and what it does not:

- The files inside keep the mode the host writes them with; no other user can
  reach them through a directory of mode 700.
- That the mode is 700 afterwards is known from `chmod` succeeding: the host's
  file information has no mode. It proves less for root, whose `chmod`
  succeeds on anyone's directory, and on a file system without modes (exFAT,
  some network mounts), where `chmod` can succeed and change nothing. An
  access control list on macOS (one that lets everyone read, say) is not
  removed by `chmod`. Another plugin's hook on the host's command runner could
  answer for `chmod` without running it.
- Between the check that a path is a plain directory and the write, only a
  process of your own user can put a link in a directory of mode 700 that you
  own. That is outside what the plugin guards against.
- On Windows (a place starting with a drive letter) no mode is set: the
  profile directory's access control is what keeps others out.
- A blob a write left half done, whose text no longer has the hash it is
  named by, is written over the next time the same result moves out.

Up to 0.3.0 the plugin was named `jev-lossless-compaction`, and the directory
with it. Results are read from both places; while the old directory exists — a
link to it counts — new results are written there too, whether or not the new
directory exists, since that is where the results are. It is made mode 700
like the new one. With `storeDir` set, the old directory is neither read nor
closed: `chmod 700 ~/.claude/jev-lossless-compaction` if an earlier version
made it. If the old directory is a link, writing is refused as
before and the built-in compaction runs, which the compaction says; a plain
file in its place is not written to. A `storeDir` setting is used alone.
Settings are kept under the plugin's id, so a `storeDir` set under the old id
has to be set again.

`recall` and `find` look where results are kept now. After the setting or
the variables above change, results kept elsewhere are not found until they
change back.

A part kept before a summary (see above) names the results it holds, which
no transcript names: the ids a collection keeps are those the transcripts
name and every id written in a part they name, through the parts of earlier
summaries. A part that cannot be read stops the collection before anything
moves.

## What a repository can change

A repository you open brings `.claude/settings.json` and can bring
`.claude/settings.local.json`, and Claude Code puts the `env` of both into
the process. Neither decides where moved-out results are written or where
`find` sends. Before either is used, the plugin reads both files, and a
value it would use that one of them holds stops it:

- `HOME`, `USERPROFILE` or `CLAUDE_CONFIG_DIR`, when no `storeDir` of yours
  is set, or a `storeDir` under this plugin's `pluginConfigs`: nothing is
  moved out and the built-in compaction runs; `recall` and `find` read
  nothing.
- `TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`,
  when the plugin's settings hold no key; `apiKey`, `provider`,
  `cloudflareAccountId` or `model` under its `pluginConfigs`; or a proxy or
  certificate variable (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` in either
  case, `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`,
  `SSL_CERT_FILE`, `SSL_CERT_DIR`): there is no `find`.

Each time, the line the plugin prints names the value and the file. Set the
key and `storeDir` in your user settings (`/plugin configure` without
`--scope`). If the files cannot be read — a Claude Code without
`$.settings.read` among them — the plugin does neither. A session started in
your home directory reads `~/.claude/settings.json` as its project file too;
while the two are the same, it counts as yours.

What is compared is the file as it is now and the environment as the plugin
sees it. If a value taken out of the file during a session stayed in the
environment, it would not be seen as the repository's (whether Claude Code
keeps it was not measured); start the session again.

Measured on Claude Code 2.1.286: `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`
and `pluginConfigs` from those files did not reach the plugin, and a key
variable and `HTTPS_PROXY` did, the latter for the plugin's requests and
Claude Code's own. The checks above stay for a version that hands the rest
over.

This covers what a repository's settings change quietly, not what a
repository you trust can run: its settings hooks, MCP servers, and the
plugins or function hooks it enables run code of their own, which can read
the files directly or change the environment without a settings file.

## `find`

`find` offers Jev the tickets it finds in the conversation, so after the
built-in compaction has run it may find none, though the files remain and
`recall` reads them by id; and of a conversation longer than 4096 messages,
the oldest tickets are not offered. Jev sees the first lines of a result and
little of its middle, and of a result over 256 KB only the first 8 KB. A
subagent's call is answered with nothing to find: the plugin moves nothing
out of a subagent's conversation. A result over about 50 KB comes back the
way Claude Code returns any large tool output: saved to a file whose path is
shown, which the agent reads; what `recall` returns is unchanged, but a line
of it longer than the agent's reading tool takes (Claude Code's `Read` cuts
lines over 2,000 characters) may reach the agent cut. A request to Jev is
given up after twenty seconds.

When Claude Code loads tools on demand, the agent has to load `recall` or
`find` by name before calling it. It did so on its own in the measured runs.

## Sizes and older versions

Tokens are estimated from characters, three to a token, so more can leave
the conversation than the target asks for; and since source code runs nearer
2.2 characters a token, `keepTokens` keeps more than its number says. The
`keepNewest` setting of 0.1.0 is gone and ignored; where the host still hands
its value to the plugin, every compaction of the main conversation says so.

Tickets written by 0.1.0 begin `[jev-lossless-compaction] This … result`;
those written by 0.2.0 and 0.3.0 begin `[moved out]` and name the old tool,
`mcp__jev-lossless-compaction__recall`; those written now name
`mcp__lossless-compaction__recall`. All three are recognised. A conversation
compacted again has its old tickets rewritten in the current wording, same
id and size (only when the compaction moves something out and hands the
conversation back; when it leaves the conversation to the built-in
compaction, nothing of it survives). In a conversation not compacted again,
the tickets name a tool that no longer exists: call `recall` with the same id.

## Moving from the old name

Up to 0.3.0 the plugin was named `jev-lossless-compaction`, and an installed
copy does not follow the rename: `claude plugin update` under the old id
fails with "Plugin not found" and changes nothing. Uninstall it, remove the
marketplace `jev-lossless-compaction`, then add and install as the README
says, and set the key — and `storeDir`, if you had set it — again under the
new id. Until then there is no hook, and Claude Code's own compaction runs;
do not keep both installed. Your results stay where they are:
`~/.claude/jev-lossless-compaction/` goes on being read and written to while
it exists, and the plugin makes it mode 700 before it writes there. Tickets
in old conversations name the old tool; call `recall` with the same id, or
compact once more and they are rewritten.
