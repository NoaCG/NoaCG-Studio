# The E2E protection check gives each listing its own Playwright cache

## The fault

`scripts/check-e2e-protection.mjs` counts runtime tests with `playwright test --list`, one process
per Playwright config, all at once (`listCounts`, `Promise.all`), and for the head and the base at
once. A change that touches a Playwright config or an e2e helper lists every config in both trees.
All of those processes shared one compile cache (`/tmp/playwright-transform-cache-<uid>`).
Playwright writes a cache entry in place (`fs.writeFileSync`) and another process reads it with
`readFileSync`, so a listing could load a module another listing was still writing. Node then
failed the importer with a missing export, because the later exports were cut off.

Seen in CI on pull request #2424, which edits a comment in `playwright.config.ts`:

- run 43205358671, head 9224f4504: `scripts/e2e-workers.mjs:36` could not import
  `cloudBrowserAdmission` from `./execution-profile.mjs`.
- run 43221277323, head 850ad093: `scripts/worktree-cleanup-lib.mjs:18` could not import
  `recoveryCheckpointBranch` from `./recovery-branch.mjs`.

Both exports exist on both sides of each merge. The CI runner starts with an empty cache, so every
listing compiles, which is where the race happens.

## Reproduction on main alone

`protection-cache-race.sh <checkout> <rounds> shared|separate` lists every config of a checkout at
once from an empty cache, as the check does, and counts the rounds where a listing failed on a
missing export.

| Checkout | Cache | Rounds failed | Errors seen |
|---|---|---|---|
| main 8b1a55c9 | shared | 1 of 12 | `'../_interaction' does not provide an export named 'addQuestion'` |
| main 8b1a55c9 | shared | 1 of 20 | `'./recovery-branch.mjs' does not provide an export named 'recoveryCheckpointBranch'` (the CI error) |
| main 8b1a55c9 | separate | 0 of 20 | |
| this branch | shared | 3 of 20 | `isFeatureKey`, `commandSegments` (twice) |
| this branch | separate | 0 of 20 | |

Machine: the cloud worker, 4 CPUs, Node 22. CI runs Node 24; that was not tried here.

## The change

`runToFile` already creates a temporary directory for each listing and removes it afterwards. The
listing's environment now sets `PWTEST_CACHE_DIR` to a folder inside it (`listingEnv`), so no two
listings share a cache and each cache goes with its directory. Nothing else changes: the same
configs, files, arguments and counting.

## Counts unchanged

`listCounts(<this checkout>, null)` (every spec under every config) with main's
`check-e2e-protection.mjs` and with this branch's: 320 spec files and 2795 tests from each, 0
files with a different count. The fixed check run five times from an empty cache on a broad diff
(the merge base of this checkout and #2424's branch, 21 changed e2e or Playwright files, every spec
counted): 5 of 5 `OK - 18 changed spec file(s) and 320 counted`.

## Revert

    git revert <merge commit of this pull request>
