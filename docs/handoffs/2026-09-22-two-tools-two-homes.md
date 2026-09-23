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

## 2026-09-23: verified in a real production, and released

The owner ran the preview Bridge in a real production on 2026-09-23: paired on noacg.studio
from the exe (Chrome's local-network prompt answered), Test connection against a Linux
CasparCG, Put on air, cues taken, a second production put on air and the first re-taken. The
one failure was not the Bridge: the hosting's bot check served "Failed to verify your browser"
(checkpoint code 11) to CasparCG's built-in browser when it fetched the output page. Fixed
once for everyone by a published Vercel firewall rule on the noacg-studio project, "Playout
output page": Request Path starts with `/output`, action Bypass. Attack Mode and system
mitigations were untouched. The troubleshooting row is in `docs/PLAYOUT_INTEGRATION.md`.

Two observations for the road ahead, neither a defect: the first graphic after Put on air took
about five seconds to appear (the page loading from the internet on the server; Put on air a
minute early), and one production on air per layer is by design. The long-term direction the
day confirmed: the playout server should not need the internet at all, which is milestone 3 in
`docs/BRIDGE.md` (the Bridge serves the production to CasparCG over the LAN and follows the
command log on its behalf).

This commit dates the 0.4.0 section of `cli/BRIDGE_CHANGELOG.md`; the `bridge-v0.4.0` tag
follows its landing, per the owner's word that the release may be published once verified.
