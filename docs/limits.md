# Limits

What the plugin does not do, and what a repository or a version can change.

## When the built-in compaction runs instead

The promise holds for a conversation whose last compaction was this plugin's.
Claude Code's built-in compaction runs instead when the conversation holds an
image, a document or any block of a kind the plugin does not know, has 4096
messages or more, belongs to a subagent, has nothing that can be moved out,
or is still too full afterwards and a summary could change that. After it,
earlier tickets may be gone from the conversation. The files remain.

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

Files are plain text under `~/.claude/jev-lossless-compaction/`, or under
`CLAUDE_CONFIG_DIR` when that is set. The plugin creates them readable by
other users of the machine, which `mkdir -p -m 700` beforehand prevents, and
never cleans them up. A secret in a tool result stays there until you delete
it.

`recall` and `find` look where results are kept now. After the setting or
the variables above change, results kept elsewhere are not found until they
change back.

## What a repository can change

A repository you open can put a key into the environment through its own
`.claude/settings.json`. Then what `find` sends goes to the account that key
belongs to. A key in the plugin's settings is read first and rules this out.
The same file can change `HOME` and `CLAUDE_CONFIG_DIR`, and with them where
moved-out results are written; the `storeDir` setting rules that out.

## `find`

`find` offers Jev the tickets it finds in the conversation, so after the
built-in compaction has run it may find none, though the files remain and
`recall` reads them by id; and of a conversation longer than 4096 messages,
the oldest tickets are not offered. Jev sees the first lines of a result and
little of its middle, and of a result over 256 KB only the first 8 KB. A
subagent's call is answered with nothing to find: the plugin moves nothing
out of a subagent's conversation. A result over about 50 KB comes back the
way Claude Code returns any large tool output: saved to a file whose path is
shown, which the agent reads. A request to Jev is given up after twenty
seconds.

When Claude Code loads tools on demand, the agent has to load `recall` or
`find` by name before calling it. It did so on its own in the measured runs.

## Sizes and older versions

Tokens are estimated from characters, three to a token, so more can leave
the conversation than the target asks for; and since source code runs nearer
2.2 characters a token, `keepTokens` keeps more than its number says. The
`keepNewest` setting of 0.1.0 is gone and ignored; where the host still hands
its value to the plugin, every compaction of the main conversation says so.

Tickets written by 0.1.0 begin `[jev-lossless-compaction] This … result`;
those written now begin `[moved out]`. Both are recognised.
