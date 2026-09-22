# Two tools, two homes: the Bridge release path

Branch `claude/bridge-release-shape`, worktree `.claude/worktrees/svg-behaviour-game-shows-518d88`,
forked from `436020abb`. Owner walk: `docs/acceptance/owner-queue/2026-09-22-two-tools-two-homes.md`.
What it does and why: `docs/BRIDGE.md` §6 and the header of `.github/workflows/release-bridge.yml`.

## What's next

1. **The owner tests the preview Bridge in a real production** (2026-09-23) from
   https://github.com/NoaCG/NoaCG-Studio/releases/tag/bridge-v0.4.0-preview. That exe is the
   local build that walked the real 2.5.0 on 2026-09-22 (`docs/handoffs/2026-09-22-noacg-bridge.md`).
   What nobody has done yet: the pairing click on the hosted studio (Chrome's local-network
   prompt), a Linux CasparCG with its scanner, SmartScreen on a machine that never saw the file.
2. **Then release it for real**, once. The owner said the release may be published when the
   Bridge has been verified, so a session does this without asking:
   ```
   git fetch origin && git tag bridge-v0.4.0 origin/main && git push origin bridge-v0.4.0
   ```
   `release-bridge.yml` refuses a tag off main, a tag that disagrees with `cli/package.json`, a
   version already released, or a version with no `cli/BRIDGE_CHANGELOG.md` section. Before
   tagging, change that section's heading from `unreleased` to the date, on main. After it,
   Settings -> Playout's download link resolves to the release and the preview can be deleted.
   If the test found something to fix, land the fix first and release from that commit.
3. **Rehearse the workflow before the real tag.** `workflow_dispatch` only appears once the
   file is on main; then `gh workflow run release-bridge.yml` (dry run by default) builds the
   exe on a clean Windows runner and keeps it as an artifact. UNVERIFIED as of this handoff: the
   workflow has never run. Its steps are the ones `release-cli.yml`'s `bridge-exe` job ran on
   2026-09-22 (that job built and proved the exe; it is deleted now), plus `gh release create`
   with assets and the bash `TAG` check. Read the run before believing it.
4. *Optional.* Delete the five old `@noacg/cli` GitHub Releases so the page is Bridge-only from
   the top. Their notes are in `cli/CHANGELOG.md`; the npm versions are untouched by it.
5. *Optional.* Code signing, so the "Windows protected your PC" step disappears. Needs an
   identity the project has to buy (`needs: money`); Azure Trusted Signing is the cheap route.

## Landed or not

Not landed at the time of writing; queued through `/queue-merge` from this session. Files:
`.github/workflows/release-bridge.yml` (new), `.github/workflows/release-cli.yml`,
`cli/BRIDGE_CHANGELOG.md` (new), `cli/BRIDGE_RELEASE.md` (new), `cli/scripts/release-notes.mjs`,
`cli/test/release-notes.test.mjs`, `cli/CHANGELOG.md`, `cli/README.md`, `README.md`, `docs.html`,
`docs/BRIDGE.md`, `docs/AGENT_CLI.md`, `docs/PLAYOUT_INTEGRATION.md`,
`src/control/playoutLink.ts`, `src/components/SettingsDialog.tsx`,
`src/components/home/PlayoutItemPicker.tsx`, `e2e/bridge-connect.spec.ts`, and the two docs
files above. Blocks nothing; blocked by nothing.
