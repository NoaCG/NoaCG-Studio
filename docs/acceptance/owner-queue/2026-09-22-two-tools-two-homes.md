---
kind: walk
date: 2026-09-22
because: direction
serves: now
---
# Two tools, two homes: the NoaCG CLI on npm, NoaCG Bridge on GitHub Releases

To the people who use them, the NoaCG CLI (making graphics from a coding agent or a terminal)
and NoaCG Bridge (connecting NoaCG Playout to CasparCG) are two products with nothing in
common. They are built from one package, and nothing a user reads says so any more.

- **The repository's Releases page is the Bridge's page.** A Bridge release is a `bridge-vX.Y.Z`
  tag; `release-bridge.yml` builds the exe on a clean Windows runner, proves it starts, and
  creates "NoaCG Bridge X.Y.Z" with the exe and its checksum. The page is short: what it is,
  what changed, three install steps, the guide, and one line pointing graphics makers to the
  CLI on npm. The CLI's npm publish no longer creates a GitHub Release; its notes ship in the
  package and show on npm. The old `@noacg/cli` releases stay as history.
- **The app links each tool to its own home.** Settings -> Playout's "Download NoaCG Bridge"
  is the newest Bridge release, and no longer offers `npx @noacg/cli bridge` beside it; the
  hop sentences say "double-click NoaCG-Bridge.exe". The docs' CasparCG guide sends operators to
  the same download, and the agent-door guide sends graphics makers to `npm i -g @noacg/cli`.
  The repository README says both in four lines.
- **The preview for the first production test** is
  https://github.com/NoaCG/NoaCG-Studio/releases/tag/bridge-v0.4.0-preview, its notes rewritten
  to the same page. The normal `bridge-v0.4.0` release follows once that test has run.

## Look at it in under a minute

1. https://github.com/NoaCG/NoaCG-Studio/releases - the newest entry reads as a program to
   download, not as a package version.
2. In the studio, **Settings -> Playout**: one download link, no terminal command.
3. https://noacg.studio/docs#casparcg-connect - the Bridge paragraph says download, warn once,
   double-click; the only command left on the page is the CasparCG one.

## What to watch for

- The Settings link resolves to `releases/latest`, which is the newest **non-preview** release,
  so it answers 404 until `bridge-v0.4.0` is released. Tomorrow's test downloads from the
  preview page above.
- The Releases page still lists the five old `@noacg/cli` entries below the Bridge ones.
  Deleting them is a click each on GitHub if you want the page to be Bridge-only from the top.
