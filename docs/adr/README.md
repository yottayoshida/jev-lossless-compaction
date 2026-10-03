# Decision records

Why the plugin is built the way it is, one record a decision.

- [0001](0001-move-out-and-order.md): why results are moved out instead of
  deleted.
- [0002](0002-keep-the-newest-by-size.md): why the newest results are kept
  by size.
- [0003](0003-jev-picks-what-comes-back.md): why Jev chooses what comes
  back, not what leaves.
- [0004](0004-the-plugin-is-named-lossless-compaction.md): the rename, and
  how what the old name wrote is still read.
- [0005](0005-a-repository-does-not-decide-where-results-go.md): why a
  repository's settings do not decide where results go.
- [0006](0006-results-live-as-long-as-a-transcript-names-them.md): why
  results are kept as long as a transcript names them.
- [0007](0007-keep-what-the-summary-replaces.md): why what Claude Code's
  summary replaces is kept first.
- [0008](0008-no-limit-and-nothing-lost-to-a-failed-write.md): why nothing
  is lost to a failed write, and there is no limit.
- [0009](0009-an-account-id-is-enough-to-choose-cloudflare.md): why an
  account id is enough to choose Cloudflare.
- [0010](0010-a-mark-says-the-plugin-is-running.md): how a session learns
  that the plugin is enabled and not running.
- [0011](0011-the-size-after-is-what-stays.md): why the size after a
  compaction is counted from what stays.
- [0012](0012-an-image-in-a-result-is-moved-out.md): why an image in a tool
  result is moved out with the result.
- [0013](0013-the-size-after-is-what-is-in-use-less-what-goes.md): how the
  size after a compaction is counted, which replaces the way of 0011.
- [0014](0014-after-a-summary-files-changed-on-disk-are-named.md): why the
  plugin reads the files a conversation read, and names the changed ones
  after a summary.
- [0015](0015-a-compact-with-nothing-to-move-and-room-left-is-not-summarized.md):
  why a `/compact` with nothing to move out and room left is not summarized.
