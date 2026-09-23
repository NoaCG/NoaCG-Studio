---
kind: walk-p
date: 2026-09-23
because: direction
---
# One version, two channels: the CLI on npm, the Bridge on GitHub Releases

The NoaCG CLI and NoaCG Bridge keep ONE version number, `cli/package.json`'s, because the Bridge
is the CLI's `noacg bridge` packed into an exe. What is separate is the channel: a `cli-vX.Y.Z` tag
publishes to npm, and a `bridge-vX.Y.Z` tag publishes the exe to GitHub Releases. Either may skip
a version the other ships. "Latest" is resolved per channel: every Bridge release is now marked
as the repository's latest release, so the old `cli-v0.3.x` releases on that page can never be
offered as the Bridge, and the Downloads page looks each one up separately.

Checked before anything shipped: nothing in `cli/` has changed since the commit tagged
`bridge-v0.4.1`, so the published Bridge 0.4.1 exe is exactly the CLI 0.4.1 code and needs no
rebuild. CLI 0.4.1 goes to npm from `main` once this lands (the unreleased 0.4.1 section of
`cli/CHANGELOG.md`: `noacg bridge`, pairing by link, the server's own templates and clips).

## The route, under a minute

1. <https://www.npmjs.com/package/@noacg/cli> - the version reads 0.4.1.
2. <https://noacg.studio/downloads> - the Bridge card and the CLI card both read 0.4.1.

**What to look at.** Nothing to decide unless you wanted separate numbers after all; the reasoning
is in `docs/BRIDGE.md` §6. Branch `claude/intelligent-gates-rlo5fp`.
