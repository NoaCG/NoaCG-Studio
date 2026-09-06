---
name: noacg-graphic-local
description: >-
  Run the NoaCG graphic-making loop INSIDE this repository, against this checkout's own dev
  server and locally built CLI, to dogfood the product skill. Use when a session in the NoaCG
  Studio repo is making or fixing a graphic to test the skill, the CLI or the contract itself.
  For making a graphic against noacg.studio, the published `noacg` plugin's skill is the one to
  use - this variant exists only to exercise the local build.
---

Read `.agent-workflows/noacg-graphic-local.md` (relative to the repo root) now and follow it
in full - it points at the canonical product skill under `cli/skill/noacg-graphic/`, shared
with the Codex skill of the same name. Nothing here overrides it.
