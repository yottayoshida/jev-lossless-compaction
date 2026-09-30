# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The newest tool results stay by size, not by count of messages: of the results that could leave, the newest stays whatever its size, the ones before it stay while they and the newest add up to at most `keepTokens` tokens (20,000 by default), and every older one is a candidate. A result a later call made obsolete is a candidate even when it is the newest. The `keepNewest` setting is gone and ignored; where the host still hands its value to the plugin, every compaction of the main conversation says so. Measured on a real session, the old rule kept the newest two files, 100,000 to 150,000 characters, after every compaction; on the same conversations the new rule keeps about half of that.
- The ticket left in a result's place is shorter: `[moved out] <tool> result, <bytes> bytes; recall with mcp__jev-lossless-compaction__recall id <id>`, 154 characters for a `Read` where the old wording took 258. Tickets in the old wording are still recognised. A result of the `recall` tool itself is named `recall` in its ticket.

### Added

- The plugin. On a compaction, old tool results are written to local files, read back and compared, and replaced in the conversation by a one-line ticket. The tool calls themselves stay.
- A `recall` tool that returns a moved-out result unchanged, after checking it against the SHA-256 it is stored under.
- Ordering by Jev: one `score` question per tool result, with a digest of the result in the question. TypeSafe and Cloudflare Workers AI are supported as providers. Without a key nothing is sent and rules decide the order.
- Fallbacks: rules decide the order when Jev fails or takes longer than five seconds; Claude Code's built-in compaction runs when the conversation holds an image, a document or a block of a kind the plugin does not know, has 4096 messages or more, belongs to a subagent, has nothing that can be moved out, or is still too full afterwards and a summary could change that.
