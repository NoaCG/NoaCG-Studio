---
v: 2
source: derived
kind: finding
raised: 2026-09-08
state: unstarted
found: "scripts/auto-merge.mjs, scripts/safe-merge-preflight.mjs and scripts/main-health.mjs are the retired laptop lander, still on disk because 25 scripts, three workflows and package.json import or name them"
serves: NOW
size: standard
touches: scripts/auto-merge.mjs, scripts/safe-merge-preflight.mjs, scripts/main-health.mjs, scripts/jobs.mjs, scripts/jobs-store.mjs, scripts/hooks/guard-command.mjs, scripts/hooks/warn-command.mjs, .github/workflows/ci.yml, .github/workflows/configured-suite.yml, .github/workflows/hosted-latency.yml
needs-owner: none
---

# Delete the laptop lander scripts once nothing imports them

`contracts/retired.json` retired the laptop lander on 2026-09-06: GitHub's merge queue lands every
branch, and `scripts/check-retired-names.mjs` refuses an instruction that still names
`auto-merge.mjs`. The scripts themselves are still on disk because they are load-bearing for
readers that are not instructions: `scripts/jobs.mjs` and `scripts/jobs-store.mjs` import helpers
from `safe-merge-preflight.mjs`, the command hooks match its command shapes, `ci.yml`,
`configured-suite.yml` and `hosted-latency.yml` call `main-health.mjs`, and `auto-merge.test.mjs`,
`safe-merge-preflight.test.mjs` and `main-health.test.mjs` pin behaviour nobody runs any more.

## Why

Dead code that a live module imports is the shape that comes back: the next session that reads
`jobs.mjs` follows the import, reads a header describing a lander that integrates and pushes
`main` on this machine, and believes it. The retired-names gate cannot see a code comment. Deleting
the scripts is the only mechanism that makes the description disappear with the mechanism.

## What the row does

1. Move the helpers `jobs.mjs` and `jobs-store.mjs` still use (`parseWorktrees`, `selectCiRun`,
   `onlyMainIntegrationsBetween`, the cancelled-run readers) into a module named for what they do,
   with their tests.
2. Decide what `main-health.mjs` still answers now that a red `main` answers itself
   (`docs/VERIFICATION.md`); keep it only if a workflow reads its verdict for something the
   quarantine and revert bots do not cover.
3. Delete `auto-merge.mjs`, `safe-merge-preflight.mjs`, their tests, and the `--onto-red-main`,
   `--accept`, `--after` and `--attempts` flags `add-merge` accepts as ignored.
4. `npm run build`, then the hook tests, because `guard-command.mjs` and `warn-command.mjs` match
   command shapes by name.
