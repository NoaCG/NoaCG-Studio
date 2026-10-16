# Reconciliation: the plan against main abe2b6167 (2026-10-16)

Read-only comparison of this spec (written against `70fad3a94`, 2026-10-11) with `origin/main`
`abe2b6167`, 839 commits later. Commands: `git log 70fad3a94..HEAD -- <path>`, `git diff --stat
70fad3a94 HEAD -- src/control/ src/components/home/ e2e/ scripts/`, `wc -l`, `grep -n` for each
anchor at both revisions, an existence check for every file the plan names.

## Modules (§2)

- Every planned `src/control/` module (storePart, playoutSession, liveCue, cueItems, takeBlockers,
  serverVerbs, bridgeWatch, productionDataSession, cueArmEngine, folderPlayout, airState,
  sessionWire, graphicVerbs, verbDispatch, verbView, cueDraft) and every planned
  `components/home/` file (useStorePart, ProductionShell, CueActions, CueEditor,
  useProductionPublish, useRundownAuthoring) is still missing: no duplicate work for phases 2-13.
- Cited sources unchanged: `serverPlayoutStore.ts` (storePart at :39), `commandRoads.ts`
  (createAppliedOnce at :193), PlayoutMonitors, CueRundown, FolderEditor, ProductionDataWorkspace.
- `hostedControl.ts` moved 15 lines up (readLiveCue 893, withLiveCue 912, leftAlone 1376,
  takeCueItems 1581, clearCueItems 1598, clearAllCueBatches 1635).
- New since the plan, from #1057: `control/outputRecovery.ts` (`airedAfter`, `AiredMap`,
  `ReplayItem`) and `hostedControl.ts` `bootMonitorReplay`. Phase 11's `rememberAired`,
  `restoreItems` and `seedFromResolve` reuse these rather than rebuilding them.

## ProductionPage.tsx

5,744 lines (5,676 at the plan's base), 7 commits since: c17b2a007 PROGRAM rebuilt from the report,
68c9fb6da and 243d2cd76 the signed-out "Opening production" flow (phase 4's area), 693ebec47 boot
replay and record digest, 6ecdac9f8 shared monitor boot read, d38a63385 picture link, 7d03393b4.
Anchors moved +5 to +68 lines (runVerb 2306, restore 1940, serverVerb 2925, takeGraphicCue 3028,
fireEvent 3947, folderRuns 540, the S3 register at 3586). Every page line number in the spec is
of `70fad3a94`; a builder finds code by name.

## Phase 1 files

- Already exist: `scripts/check-file-budgets.mjs` and its test (3e51f5430, 2026-10-13, built for
  the wizard and naming this plan's D8), `check:file-budgets` in `package.json`,
  `e2e/configured/expected-run.json` (floor now 100, not 96), `dashboard-operator-walk.spec.ts`
  (still `covers: none`). Budgets now live as `scripts/file-budgets/<name>.json`, two wizard
  entries; there is no `scripts/file-budgets.json`.
- Still to write: `e2e/playout-air-contract.spec.ts`, the four `e2e/configured/` race and dispatch
  specs, `scripts/command-roads.test.mjs`, this `evidence/` folder's other receipts.
- §5.3's quarantine facts changed: `production-data-key.spec.ts` is quarantined again (since
  2026-10-16), with `deep-link-boot` and `editor-arrangement`; `late-send-abandoned` and
  `dashboard-hosted-walk` are released. `allowedSkips` lists eight files, not four.

## D8 against the owner's ruling

`docs/work-specs/codebase-health/spec.md` records the owner's requirement (2026-10-15): "No new
hard ceiling or blocking size policy; an arbitrary number must not block a valuable change", says
not to add ProductionPage to a size policy, keeps only the two existing wizard budgets, and leaves
the exact D8 and AC-11 change to the owner. As written, D8 would also install 5,676 on a page of
5,744 and fail on its first run. No rule in `contracts/rules/` covers size gates.

## For the phase 1 builder

Trust: the planned module list, the reused specs and Node tests the matrix names (all present),
the D1 and D3 sources. Do not trust: page and `hostedControl.ts` line numbers, D8 and phase 1's
gate file list until the owner answers, §5.3's quarantine and floor facts, and §2's placement of
the aired-state logic that #1057 moved.
