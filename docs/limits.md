# Limits

What the plugin does not do, and what a repository or a version can change.

## When the built-in compaction runs instead

Claude Code's built-in compaction runs instead when the conversation holds an
image or a document outside a tool result, or any block of a kind the plugin
does not know, has 4096 messages or more, belongs to a subagent, has nothing
that can be moved out, or is still too full afterwards and a summary could
change that. An image in a tool result is moved out with the result: a line
stands in its place, and the conversation is compacted by the plugin (see
[images](#images)).

How full it is afterwards is counted as what is in use less what goes (ADR
0013). What Claude Code's breakdown says is not the conversation (the system
prompt, the tools' definitions and the like) stays as it is. Of the
conversation, the breakdown's `Messages` row, three things are gone once the
messages are rebuilt, whatever is moved out: images, taken off at about
1,500 tokens each; thinking, whose tokens a plugin cannot read, and which is
estimated from how long the signatures of the thinking blocks are; and what
Claude Code added to the conversation as it sent it — reminders after
results and after what you said, the text of commands and attachments —
which is in no message a plugin is handed. What is left of the row is spread
over the characters that were sent, a digit counting as two and a character
that is not ASCII as three, and what Claude Code added at four fifths of
what the messages' characters count; the rebuilt conversation is counted at
that rate. What a result saves by leaving is counted at it too.

Where the plugin moved results out, the size it goes by came within 20 % of
what was in use afterwards, and no more than 5 % under it, in every
conversation it was measured on, compacted by the model that had built it.
On Haiku 4.5, in the made-up conversations of
[the benchmark](measurements.md#the-size-after-a-compaction-counted-again):
mostly tool results, pasted English prose with logs, and Japanese with logs.
On Opus 5.5: Japanese with logs, made up, and five long working sessions
with 172 to 235 thinking blocks.

Where nothing could be moved, the conversation goes to the summary and
nothing the plugin would have rebuilt is sent, so there is no afterwards to
measure. Set against what was in use before less its thinking, the size came
up to 7 % under in the five such conversations of the benchmark (files
written, pasted prose, many short results, a full window, a third
thinking), where 0.6.0 ran from 49 % over to 22 % under.

Which way it is off, where that is known:

- Over where what leaves comes to more tokens a character than what stays:
  3 % and 7 % with logs moved out, the 7 % out of English prose.
- What Claude Code added comes to fewer tokens than the same weight of the
  messages: 0.75 to 0.88 of them in the five working sessions, where it
  was half to four fifths as much again as the messages themselves. It is
  counted at four fifths, chosen on the first four of those sessions; the
  fifth, measured with that, came 1 % under. A session whose own figure
  lies further from four fifths is off by the difference, times the share
  that was added: 3 % at most in the five.
- The thinking is estimated at 0.6 to 1.5 times what it was, in
  conversations of four thinking blocks or more. With one block, or with
  blocks whose signatures are all as long, it comes out at nothing, and the
  size over by as much.
- Right after the model is changed, the breakdown is still of the last
  response, which the model before gave. A conversation built with Haiku
  and compacted by Sonnet before Sonnet had answered came 20 % under where
  English prose stayed, for which Sonnet counts a third more tokens, and
  5 % over where logs did. Once the new model has answered, the figures are
  its own.
- Two of the working sessions held 29 and 11 images in their results,
  taken off at about 1,500 tokens each, and came within 3 %. A conversation
  that is mostly images was not measured with this count; with the one
  before it, five images among four text files came 29 % over.

When the breakdown cannot be relied on, the line a compaction shows names
no token count, and what was in use less what was moved out is measured
instead, at three characters a token: that still counts the thinking, and
with no response since the last compaction, what was in use is the
conversation's characters over three, without the system prompt or the
tools. It is not relied on either when the conversation cannot be read as
it was sent, when the thinking comes out at more than nine tenths of the
`Messages` row, or when the row comes to fewer than 0.05 or more than 3
tokens a weighted character.

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

What is not kept: images and documents still in the conversation, which
leave `[image not kept]` or `[document not kept]` (an image the plugin moved
out with its result is a ticket by then, and is kept as one); thinking;
messages older than the 4096 Claude Code
shows a plugin; the conversation of a subagent. Nothing is kept when the
place results are kept in is not an absolute path or cannot be read, or when
a part cannot be written for a reason other than a write the
system refused, and the compaction says so; the summary is then Claude
Code's alone, as before, and earlier tickets may be gone from the
conversation, the files remaining. A write the system refused stops the
summary instead: see [the files](#the-files). A block of a kind
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

## Images

A tool result that holds an image — a screenshot a tool returned, an image
file read with `Read` — is moved out at every compaction, whatever its age
or size and before any other result: a rebuilt message cannot carry an
image, so the newest one leaves too. The result's text and its images are
stored together, in the order the result held them, and one line stands in
the result's place, worded as any other. What the host added after the
result's own blocks is not stored. `recall` returns the text and the
images in that order, as images and with nothing added; the bytes of an
image are never returned as text. Recalled and compacted again, the result
comes to the same stored text and nothing is written a second time. A
tool's output that is, to the character, a stored result holding an image
— the store's own file printed by a command — is returned as that image
too, and is not offered by `find`.

When such a result cannot be stored — it is over about 4 MB with its images
in base64, the write fails, or the store refuses it for any other reason
it refuses a result — nothing is rebuilt, and the conversation goes to the
built-in compaction as it was, which the line says. So does a conversation
with an image that is not held as its bytes, whose bytes do not begin as a
PNG, JPEG, GIF or WebP does, or next to a block that is not text; with an
image pasted into a message; and with a document. No pasted image and no
document was in the transcripts this was measured on. If the compaction
says `cannot carry: image` or `document` for yours, that is the next thing
to build.

`find` does not offer a result that holds an image: nothing of it is sent
to Jev, its text included. `recall` reads it by the id in its line.

Images make the store grow faster: 621 of them in two months of one
person's transcripts came to 120.8 MB in base64. They are kept and cleaned
up as results are.

## Function hooks

The plugin needs Claude Code's function hooks, which are early access.
Whether they are on is decided by `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` — `1`,
`true`, `yes` or `on` turns them on, `0`, `false`, `no` or `off` turns them
off — and, when it is not set, by Claude Code's own rollout for your account.
With them off the plugin installs, shows in the list, and moves nothing
out: there is no `recall` tool, and a compaction is Claude Code's own.
Measured on Claude Code 2.1.286: on one account they were off without the
variable, and `1` in `~/.claude/settings.json` under `env` turned them on;
a value there wins over one set in the shell.

A compaction in such a session does not go by unsaid. When the module runs,
it sets `LOSSLESS_COMPACTION_RUNNING` to the id of its process. Three classic
hooks, which run whether or not function hooks are on, compare it with the
id Claude Code hands them:

- At the first message sent in a process without the mark, one line says
  that the plugin is not running in this session, that a compaction there
  would be Claude Code's own, which setting to add, and to start a new
  session. It is said once in a process, and again in the conversation
  reopened in another, where the plugin may still not run. The line is shown
  on the screen and is not part of the conversation: measured on Claude Code
  2.1.286, the tokens sent were the same with and without it, and `claude -p`
  printed the same bytes. The processes told are one line each in `told`
  next to `held` (below), kept the same way. The hook runs at every message;
  in a session where the plugin runs it reads no file and takes about 10 ms
  (0.3 s for a message of 1 MB, most of it reading its input).
- Before a `/compact` without the mark, the compaction is held: nothing is
  compacted, and a line says that the plugin is not running, which setting
  to add, how to reopen the conversation, and that running `/compact` again
  in that session goes ahead with the built-in summary. A process is held
  once. The conversation reopened in another process is held once more, so
  that a setting that did not take is noticed before the summary runs, and
  from the third process on it goes through: `claude -p --resume … "/compact"`
  is a new process each time. What was held is one line each in `held` under
  the plugin's data directory (`~/.claude/plugins/data/`), written for its
  owner alone and started again past fifty lines, after which an earlier
  conversation is held again.
- After a compaction that went ahead without the mark, a `/compact` run
  again or an automatic one, a line says it was Claude Code's own.
  An automatic compaction is never held: stopped, it would leave the
  conversation to overflow.

Not reached:

- A session that was already open when the plugin was installed or enabled.
  Its hooks are not loaded there either.
- A setup that turns all hooks off.
- A module that ran and was unloaded later in the same process: the mark
  stays.
- A system without `/bin/sh` or `/usr/bin/sh`: the mark is then `any`, which
  a `claude` started from the session inherits and counts as its own.
- A Claude Code that hands a classic hook no `CLAUDE_PID`: nothing is held,
  nothing is said at the first message, and any mark counts.
- A `held` that cannot be written, cannot be read, or is a link: nothing is
  held; the line after the compaction is still said. The same for `told`:
  nothing is said at the first message, since it would then be said at every
  one.
- A slash command does not pass the hook that runs at a message: in a session
  where only slash commands are sent, the line comes at the first message
  that is not one. A `/compact` among them is held as above.
- A process id used again by a later session, as where every run gets the
  same id: its first `/compact` is not held, and it is not told at its first
  message, since `told` keeps process ids alone. After `/clear`, the new
  conversation is in a process already held and told, and is neither held
  nor told.
- `LOSSLESS_COMPACTION_RUNNING` set by hand, or by the `env` of a
  repository's settings: `any`, or the process's own id, counts as the
  plugin's mark and silences all three hooks, which leaves a session as it
  was before them. It is not among the values in
  [What a repository can change](#what-a-repository-can-change), since it
  decides neither where results are written nor where `find` sends.

The other way round, where `sh` is started through something that stands
between it and Claude Code, the id the module reads would not be the one the
hooks are handed, and a running session would be told it is not; this was
not met, and was measured on one machine.

Someone who keeps function hooks off with the plugin enabled is told and
held as above in every conversation; `LOSSLESS_COMPACTION_RUNNING` set to
`any` in their own settings' `env` ends it. The variable is in the
environment of everything the session starts, as every variable a plugin
sets is. Measured on Claude Code 2.1.286, interactively and with `-p`: the
line at the first message, the held `/compact`, the line after one that went
ahead, and an automatic compaction with `CLAUDE_CODE_AUTO_COMPACT_WINDOW`
lowered. With function hooks on, the mark was in place by the first message
in 30 of 30 interactive starts (with a prompt on the command line, typed as
soon as the input box showed, and right after `--resume`), and after
`/reload-plugins` loaded the module into a session that had started without
it; a `/compact` there was not held.

## Setting it up

The README's quick start puts the variable in `~/.claude/settings.json`
(under `CLAUDE_CONFIG_DIR` when that is set). It can also be exported in your
shell profile, `export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, or set under
`env` in one repository's `.claude/settings.local.json`.

To use the plugin in one repository only, add `--scope local` to the install
and run it there; set the key without `--scope`.

The key for `find` is set with
`/plugin configure lossless-compaction@lossless-compaction`. `provider` is
`auto` unless you change it: an account id entered there chooses Cloudflare
and none chooses TypeSafe. When the account id is not 32 hexadecimal
characters, or `provider` is `typesafe` while an account id is entered,
nothing is sent: with a key for the provider chosen, `find` is not
registered and a line at the start of the session says why; with none,
nothing is said, as for any setup without a key. With no key set there, the key of the
provider chosen is read from the environment, unless a repository's settings
set it: `TYPESAFE_API_KEY`, or `CLOUDFLARE_API_TOKEN` once Cloudflare is
chosen, by the account id or by `provider` set to `cloudflare`; only the
latter also reads `CLOUDFLARE_ACCOUNT_ID`. The two Cloudflare variables alone
choose nothing ([ADR 0009](adr/0009-an-account-id-is-enough-to-choose-cloudflare.md)).

Coming from `jev-lossless-compaction` (0.3.0 and before), an installed copy
does not follow the rename: see [moving from the old
name](#moving-from-the-old-name).

## The files

Files are plain text under `~/.claude/lossless-compaction/`, or under
`CLAUDE_CONFIG_DIR` when that is set. A secret in a tool result stays there
until no conversation holds it any more, as below, or until you delete it.

A write that fails — the disk is full, say — loses nothing: a result is
ticketed only once all of it is written, a stored result or its entry is
never written over by a failed write, and when a failed write leaves nothing
kept before Claude Code's summary, the summary does not run and the
compaction says why (ADR 0008):

- A stored result and its entry are written to `tmp/` first, read back, and
  moved into place with `mv` (`/bin`, else `/usr/bin`; when the move fails,
  `mkdir -p` makes the directory and it is moved once more, which is what
  the first result in a new place takes), so the file at a result's name is
  always whole. The host's own write cuts a file short when
  the disk refuses it (measured), which is why. Where `mv` cannot be started
  (Windows), they are written in place, and a write the disk refuses can
  still cut short a result another write stored at the same moment. Each
  move took about 4 ms on macOS; a stored result takes two.
- What the system said is in the line the compaction prints:
  `could not write: ENOSPC`. A result that could not be written stays in
  the conversation as it was.
- When nothing could be kept before Claude Code's summary because a write
  failed, the compaction is skipped:
  `nothing could be kept (could not write: ENOSPC), so the summary did not
  run; free some space and compact again`; for a refusal other than a full
  disk it names what the system said and asks for nothing to be freed. The conversation stays as it is,
  and one that reaches its limit cannot go on until there is room. A place
  that cannot be made private, because the disk is too full to make it, is
  not that case: nothing is kept and the summary runs.
- An entry, or a record of where transcripts are, that a refused write left
  empty is written again the next time.
- A part of a kept conversation written before a later one failed stays
  until the clean-up; a file in `tmp/` that a process left when it stopped
  partway stays until removed by hand.
- There is no limit on how much is kept, by default or by setting: past a
  limit nothing could be moved out, and the summary that followed could not
  be undone. How much stays is what the conversations Claude Code keeps
  (`cleanupPeriodDays`) name, below. On the machine this was measured on,
  two days of use left 157 files, 4.9 MB, before every summary kept the
  conversation (ADR 0007). The trash is on the same disk: space comes back
  when it is emptied, up to about fifteen days after a result stops being
  named. A full disk can keep the clean-up from running too, since it
  writes a few small files first.

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
  `/usr/bin` on the files under `blobs/`, `index/` and `trash/` only; a
  write runs `mv` from `tmp/` into `blobs/` and `index/`, `mkdir -p` on those
  two, and `rm` on a part of its own in `tmp/` that it could not move. A
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

`keepTokens` is turned into characters at three to a token, and since
source code runs nearer 2.2 characters a token, it keeps more than its
number says. How full the conversation is afterwards is counted as said
[above](#when-the-built-in-compaction-runs-instead); where the breakdown
cannot be relied on, tokens are estimated at three characters each, and
more can leave the conversation than the target asks for. The
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
