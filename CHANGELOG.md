# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- The plugin makes the directory it writes moved-out results to readable by its owner alone before it writes anything: `mkdir -m 700` when the directory is not there, `chmod 700` on it either way, from `/bin` or else `/usr/bin`. A link or a file in its place, a directory `chmod` fails on, or a host that cannot run either command means nothing is moved out and the compaction says why. Each other directory it reads from that is there as a directory, `~/.claude/jev-lossless-compaction/` of earlier versions among them, is closed the same way; when that fails, the compaction says so and goes on. With `storeDir` set, only that directory is read and closed: a `~/.claude/jev-lossless-compaction/` an earlier version made stays as it was, so `chmod 700` it yourself. The README's `mkdir -p -m 700` step is gone. On Windows no mode is set. Measured on macOS with the place missing, of mode 755, a link and a file: made 700, closed to 700 and three results moved out in 63 ms, refused with the link's target left empty, refused.
- A repository's own settings files (`.claude/settings.json`, `.claude/settings.local.json`) no longer decide where moved-out results are written or where `find` sends. Before either is used, the plugin reads both files; a value it would use that one of them holds stops it, and the line it prints names the value and the file. A place from them (`HOME`, `USERPROFILE` or `CLAUDE_CONFIG_DIR` without a `storeDir` of yours, or a `storeDir`) means nothing is moved out and the built-in compaction runs; a key variable without a key in the plugin's settings, the plugin's provider settings, or a proxy or certificate variable means there is no `find`. Measured on Claude Code 2.1.286, a key variable and `HTTPS_PROXY` from those files did reach the plugin, and `HTTPS_PROXY` routed its requests; the place variables and `pluginConfigs` did not (ADR 0005). Set the key and `storeDir` in your user settings.

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
