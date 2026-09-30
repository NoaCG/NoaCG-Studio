---
v: 2
source: owner
kind: ask
raised: 2026-09-30
state: unstarted
asked: "The NoaCG version number for the bridge is not shown in the filename on the EXE. I have three different NoaCG EXEs that are different builds and I can't tell them apart by the name."
serves: NOW
size: small
touches: cli/, .github/workflows/
needs-owner: none
---

# The NoaCG Bridge download names its version

## Why

Every release asset is called `NoaCG-Bridge.exe`, so an owner with 0.4.2, 0.5.0 and 0.6.0 in the
Downloads folder cannot tell which is which, nor whether the one running is the latest. On
2026-09-30 the latest GitHub release was `bridge-v0.6.0` (2026-09-28) with the asset
`NoaCG-Bridge.exe`; the npm package `@noacg/cli` was still at 0.4.2 although the repository says
0.6.0, which is worth checking in the same pass.

## What it would take

- Name the release asset with its version (for example `NoaCG-Bridge-0.6.1.exe`) in the release
  workflow, and keep the sha256 file beside it under the matching name.
- Update every place that links or documents the old fixed name (the downloads page, `docs/BRIDGE.md`,
  any "latest" redirect), so a stable "latest" link still works.
- Say the version in the Bridge's own window and in the production page's Bridge status, if either
  does not already.
