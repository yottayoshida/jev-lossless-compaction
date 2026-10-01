# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A write that fails — the disk is full, say — loses nothing. A stored result and its index entry are written to `tmp/` first, read back and moved into place with `mv`, so a write the disk refuses no longer cuts short a result another write had stored (measured on a full 2 MB disk image: the host's write cuts the file it fails on short); where `mv` cannot be started (Windows) they are written in place as before. When a failed write leaves nothing kept before Claude Code's summary, the summary does not run: the compaction is skipped with `nothing could be kept (could not write: ENOSPC), so the summary did not run; free some space and compact again`, and the conversation stays as it is. The line a compaction prints names what the system said (`could not write: ENOSPC`). An index entry, or a record of where transcripts are, that a refused write left empty is written again instead of being taken as done. There is no limit on how much is kept (ADR 0008). Measured on a full disk image with Claude Code 2.1.286: the compaction was skipped with that line, the conversation kept every message, and no empty file was left; each move took about 4 ms.

### Security

- The plugin makes the directory it writes moved-out results to readable by its owner alone before it writes anything: `mkdir -m 700` when the directory is not there, `chmod 700` on it either way, from `/bin` or else `/usr/bin`. A link or a file in its place, a directory `chmod` fails on, or a host that cannot run either command means nothing is moved out and the compaction says why. Each other directory it reads from that is there as a directory, `~/.claude/jev-lossless-compaction/` of earlier versions among them, is closed the same way; when that fails, the compaction says so and goes on. With `storeDir` set, only that directory is read and closed: a `~/.claude/jev-lossless-compaction/` an earlier version made stays as it was, so `chmod 700` it yourself. The README's `mkdir -p -m 700` step is gone. On Windows no mode is set. Measured on macOS with the place missing, of mode 755, a link and a file: made 700, closed to 700 and three results moved out in 63 ms, refused with the link's target left empty, refused.
- A repository's own settings files (`.claude/settings.json`, `.claude/settings.local.json`) no longer decide where moved-out results are written or where `find` sends. Before either is used, the plugin reads both files; a value it would use that one of them holds stops it, and the line it prints names the value and the file. A place from them (`HOME`, `USERPROFILE` or `CLAUDE_CONFIG_DIR` without a `storeDir` of yours, or a `storeDir`) means nothing is moved out and the built-in compaction runs; a key variable without a key in the plugin's settings, the plugin's provider settings, or a proxy or certificate variable means there is no `find`. Measured on Claude Code 2.1.286, a key variable and `HTTPS_PROXY` from those files did reach the plugin, and `HTTPS_PROXY` routed its requests; the place variables and `pluginConfigs` did not (ADR 0005). Set the key and `storeDir` in your user settings.

### Added

- Moved-out results no conversation holds any more are cleaned up. At most once a week, after a session starts and without holding it up, the plugin reads every 64-hex string out of Claude Code's transcripts, which already hold the ids of forked, rewound and earlier conversations; a result over a day old that none of them names moves to `trash/<day>/`, and one the trash has held over a week, still named by none, is removed. `recall`, `find` and a compaction put back from the trash what they read. Where transcripts are is recorded at a compaction, in the store's `roots/`; nothing is collected until one is, nor in the week after. A collection that cannot read every recorded place to the end (each search also reads a file holding one known id, so a search cut short is told from one that found nothing) stops before anything moves and says why; one cut off by a short session is tried again a day later. Measured on macOS: results named by a transcript stayed, one named by none went to the trash and came back byte for byte on `recall`, a trash entry nine days old was removed and one from that day was not, an unreadable place stopped the collection and a removed one was skipped (ADR 0006).
- What Claude Code's own summary replaces is kept. When moving out is not enough, when nothing can be moved out, and when the conversation holds an image, a document or 4096 messages or more, the built-in summary runs as before; now the plugin first moves out every result of 400 bytes or more still in the conversation and writes the conversation as text in parts of at most 40,000 bytes, and one message right after the summary names each part, so `recall` returns what was summarized unchanged and `find` offers the parts and the results inside them. Images, documents, thinking and messages older than the 4096 Claude Code shows are not kept, nor is a subagent's conversation; when the place results are kept in is not an absolute path, cannot be made private, or a part cannot be written, nothing is kept and the compaction says so. A clean-up keeps every result a kept part names, through the parts of earlier summaries: those are named in the part, not in a transcript; a part it cannot read stops the clean-up (ADR 0007).

### Fixed

- A blob a write left half done, whose text no longer has the hash it is named by, is written over the next time the same result moves out, instead of keeping that result in the conversation for good.

## [0.4.0] - 2026-09-30

### Changed

- The plugin is named `lossless-compaction`: the repository (`yottayoshida/lossless-compaction`, the old address redirects), the marketplace and plugin id (`lossless-compaction@lossless-compaction`), the tools (`mcp__lossless-compaction__recall` and `__find`), the default directory (`~/.claude/lossless-compaction/`) and the ticket. Jev no longer names the plugin: a compaction does not use it, and it is one provider behind `find`. An installed copy does not follow the rename (`claude plugin update` under the old id fails with "Plugin not found" and changes nothing): uninstall it, remove the old marketplace, add and install the new one, and set the key and any `storeDir` again under the new id; until then there is no hook and Claude Code's own compaction runs. Do not keep both installed.
- What the old name wrote is still read. Tickets in every wording so far are recognised, offered by `find` and read back by `recall` with the same id. Results are read from `~/.claude/jev-lossless-compaction/` as well, and while that directory exists new results are written there too, so that results stay where they are and a directory made readable to its owner alone stays the one written to. A compaction that moves something out rewrites the old tickets in the conversation to the current wording, same id and size, so that they name the tool that exists.

## [0.3.0] - 2026-09-30

### Added

- A `find` tool, registered when a Jev key is set: asked in words, it returns the moved-out result of this conversation that the question is about, or lists the likeliest few when Jev is not sure which, or says that none of them seems to be about it. Jev is shown the call that made each result and a digest of it, with "none of these" among the choices; a phrase of twelve characters or more that the question puts in double quotes is looked for as written first. Measured on thirteen results whose calls said nothing of their content, an agent with `recall` alone found 6 of 13 after 41 recalls; Jev's choice over the digests named 13 of 13, one request each.

### Changed

- A compaction asks Jev nothing and waits for nothing: rules alone decide the order results leave in (those a later call replaced, then those sharing the least with the goal, then the oldest). Measured on twenty-four real compactions, Jev's order had never changed which results left. The report line no longer says `order by`.
- The README is shorter; the measurements and the full list of limits moved to `docs/measurements.md` and `docs/limits.md`.

### Removed

- The `score` questions at compaction time, and the five second wait for their answers. The `provider`, `apiKey`, `cloudflareAccountId` and `model` settings now serve the `find` tool alone; without a key there is no `find`, and `recall` works as before.

## [0.2.0] - 2026-09-30

### Changed

- The newest tool results stay by size, not by count of messages: of the results that could leave, the newest stays whatever its size, the ones before it stay while they and the newest add up to at most `keepTokens` tokens (20,000 by default), and every older one is a candidate. A result a later call made obsolete is a candidate even when it is the newest. The `keepNewest` setting is gone and ignored; where the host still hands its value to the plugin, every compaction of the main conversation says so. Measured on a real session, the old rule kept the newest two files, 100,000 to 150,000 characters, after every compaction; on the same conversations the new rule keeps about half of that.
- The ticket left in a result's place is shorter: `[moved out] <tool> result, <bytes> bytes; recall with mcp__jev-lossless-compaction__recall id <id>`, 154 characters for a `Read` where the old wording took 258. Tickets in the old wording are still recognised. A result of the `recall` tool itself is named `recall` in its ticket.

## [0.1.0] - 2026-09-30

### Added

- The plugin. On a compaction, old tool results are written to local files, read back and compared, and replaced in the conversation by a one-line ticket. The tool calls themselves stay.
- A `recall` tool that returns a moved-out result unchanged, after checking it against the SHA-256 it is stored under.
- Ordering by Jev: one `score` question per tool result, with a digest of the result in the question. TypeSafe and Cloudflare Workers AI are supported as providers. Without a key nothing is sent and rules decide the order.
- Fallbacks: rules decide the order when Jev fails or takes longer than five seconds; Claude Code's built-in compaction runs when the conversation holds an image, a document or a block of a kind the plugin does not know, has 4096 messages or more, belongs to a subagent, has nothing that can be moved out, or is still too full afterwards and a summary could change that.
