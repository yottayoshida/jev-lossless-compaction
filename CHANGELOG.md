# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The plugin. On a compaction, old tool results are written to local files, read back and compared, and replaced in the conversation by a one-line ticket. The tool calls themselves stay.
- A `recall` tool that returns a moved-out result unchanged, after checking it against the SHA-256 it is stored under.
- Ordering by Jev: one `score` question per tool result, with a digest of the result in the question. TypeSafe and Cloudflare Workers AI are supported as providers. Without a key nothing is sent and rules decide the order.
- Fallbacks: rules decide the order when Jev fails or takes longer than five seconds; Claude Code's built-in compaction runs when the conversation holds an image, a document or a block of a kind the plugin does not know, has 4096 messages or more, belongs to a subagent, has nothing that can be moved out, or is still too full afterwards and a summary could change that.
