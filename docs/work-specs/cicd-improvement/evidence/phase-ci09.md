# Phase ci09: maintenance candidate two, the repeated playout setup

Row ci09 of the [cicd-improvement spec](../spec.md) (P3; AC-5). Built 2026-11-01 by the ci09
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`23742966784b3c8a46858524ca7a8037a373e0b7` (ci08 merge, #1910).

## 1. The choice

The spec names three candidates from the suite-budget inventory
([candidates.md](../../e2e-suite-budget/evidence/candidates.md)). ci08 took the geometry cases
(`e2e/editor-arrangement.spec.ts`); its saving is not counted here. This row takes the **repeated
playout setup**, in `e2e/playout-folders.spec.ts` (inventory item 5). Why this one and not the
editor qualification walks:

- It is the largest single setup cost left in the playout family: 4.27 table-minutes, 52 tests, the
  biggest playout spec, and every test pays the same setup. Remeasured on current `main` (section 2),
  setup is about two thirds of the file's time.
- The inventory's action for the editor walks (items 1 to 3) is to move them to a scheduled walk.
  This row may not move protection to scheduled cadence, so that candidate needs its own design
  that keeps the walks pre-merge; it is left whole for ci10.
- The JEV plan changes SVG import, the wizard, match clocks and score flash. The editor walks go
  through the wizard; this spec does not. Its only open PR (#1909, files read 2026-11-01) touches
  `src/templates/importedDesign/`, a fixture, a Node test and its evidence, none of them here, and
  the JEV recovery ref carries plan state only.

Production-page studio acceptance: this spec covers `ProductionPage.tsx` and the folder air logic
against a faked NoaCG Bridge. The production-page plan's pending rows that touch folders (C6/C7:
failed group child, conflicting layers, connection loss, actual CasparCG/Bridge and OBS receipts)
are actual-output receipts this offline spec never gave. This change keeps every assertion of the
spec and moves nothing out of it, so it opens no new gap there and claims nothing for that plan.

## 2. Inventory: where the time went, and what the setup protected (acceptance a)

Profile on this machine (main `23742966`, the spec instrumented per phase, 52 tests, one run):

| Setup step, per test | Median | Range |
|---|---|---|
| Boot `/app`, create the Hairline graphic (`bootstrapGraphic`) | 4.4 s | 2.9 to 6.1 s |
| Create the production, open its page (`openProductionWithCurrent`) | 0.22 s | 0.16 to 0.35 s |
| Seed media, graphics, playback and folders through the model writers | 0.22 s | 0.09 to 0.50 s |
| **Reload, then wait for the production page and its first row** | **2.7 s** | 1.4 to 4.2 s |

Every one of the 52 tests passes media or a seed, so every test reloaded. The reload is a
second boot of the app, there only to re-read what the seed had just written. The fixed first boot
stays: a fresh browser context per test is what keeps the tests independent, and the inventory's
idea of a pre-serialised store through `addInitScript` would only shave the seed, which is not
where the time is.

What the reload protected, as a side effect of setup (no test named it):

| Behaviour | Failure it would show | Boundary |
|---|---|---|
| R1 the seeded rundown survives the disk: folders and each cue's folder | a hydration or write fault that loses folders | durable store, browser (IndexedDB) |
| R2 a folder's collapse survives the disk | collapsed folders open after a reload | same |
| R3 a Play-through folder's end and slot survive the disk | the loop or the slot lost | same |
| R4 a cue's playback (loop, fades) survives the disk | clip endings lost | same |
| R5 a pool graphic's layer survives the disk | graphics move layers after a reload | same |
| R6 the production page boots straight onto its route (`#/production/<id>`) | a reload lands somewhere else | router, browser |
| R7 nothing from the first boot is still pending when the test starts | a late write counted by a test, or meeting the storage failure a test arms | template autosave, browser |

## 3. The change

- `production()` (the spec's local setup helper) does `openProductionWithCurrent`'s steps itself
  with the seed between them: create the show, add the graphic, seed, flush the new graphic's
  pending autosave (`flushPendingProject`, the store's own export, already used by
  `new-graphic-guard` and `template-insert`), commit the durable writes, then navigate. The page
  mounts once, on the seeded rundown. The shared helper `e2e/_create.ts` is untouched, so the change
  does not select the whole suite.
- R1 to R5 move from 52 implicit reloads to one explicit test, `a seeded rundown reads back whole
  after a reload: graphics, layers, playback and every kind of folder`. It seeds a graphic on its
  own layer, clip playback, and three folders (All together and collapsed; Play through with loop
  and layer; One by one), checks the seed reached the record, reloads, and requires the stored
  record, the drawn rows and every folder's kind label to be identical. It is stricter than the old
  side effect: the old tests compared what they happened to assert, this one the whole record.
- R6 stays with the spec's own reload tests (collapse kept, folder kept, loop, split folder, failed
  writes), which boot straight onto the production route, and with the new test.
- R7 is the autosave flush. Without it, the first version failed four tests: two counted one extra
  write, and two met a storage-failure dialog raised by that autosave. That is why the reload looked
  like setup and was also hiding a pending write.
- Every other line of the spec is unchanged: no assertion, timeout or test was edited or removed.

## 4. Fault replay (acceptance a)

No recorded defect exists for this setup to replay, so each failure mode R1 to R7 was injected as a
source patch, plus two behaviour faults as controls (F8, F9). For each, the old spec (`main`'s file
run from a copy beside it) and the new spec ran on this machine in two shards with
`--max-failures=2`, one queued `--cap 5` job each, and the patch was reverted afterwards (tree clean
at the end). F0 is the fix: no patch. "Catches" names the tests that failed before the run stopped,
so it is a sample of the catching tests, not all of them.

| Fault | Patch | Old spec | New spec |
|---|---|---|---|
| F0 none (the fix) | none | pass (52) | pass (53) |
| F1 hydration loses folders (R1) | `durableStore.ts` hydrate: shows read with no `folders` and no cue `folderId` | **fail** (shift-click, arrow keys, menus, Remove folder, ...) | **fail** (shift-click, arrow keys, round trip, §18 20/21, ...) |
| F2 hydration loses `collapsed` (R2) | same, folders without `collapsed` | **fail** (range over a collapsed header, arrow keys, list follows the air) | **fail** (arrow keys, round trip) |
| F3 hydration loses `end` and `slot` (R3) | same, folders without `end`/`slot` | **fail** (three Play-through loop and slot tests) | **fail** (round trip) |
| F4 hydration loses cue `playback` (R4) | same, cues without `playback` | **fail** (step not taken, All together refused, own fade out, Play through endings) | **fail** (round trip) |
| F5 hydration loses graphic `layer` (R5) | same, graphics without `layer` | pass | **fail** (round trip) |
| F6 shows with folders never reach disk (R1) | `durableStore.ts` `idbWrite`: skip the put of a shows record holding a folder | **fail** | **fail** (shift-click, arrow keys, menus, failed writes, ...) |
| F7 boot drops the production route (R6) | `router.ts`: the first route `production` becomes Home | **fail** | **fail** (shift-click, arrow keys, round trip, folders never leave, ...) |
| F8 control: a folder's kind label wrong | `FolderRow.tsx`: "One by one" to "One-by-one" | **fail** (shift-click) | **fail** (shift-click) |
| F9 control: a folder's mode never stored | `shows.ts` `setFolderMode` stores One by one | **fail** (Play-through tests, drop refusal) | **fail** (same tests) |

Every fault the old spec catches, the new one catches. F5 is caught only by the new test: no old
test read a seeded graphic's layer after the reload. R7 has no row: its fault is the absence of
the flush, which the four failures in section 3 already show.

Blind spot, said plainly: `scripts/check-e2e-protection.mjs` counts `test(` lines and does not
count tests declared inside a loop (#1911). This spec declares none in a loop and its count goes
from 52 to 53, so the check is accurate here, but its green is not the proof: the per-line review
of the diff (only `production()`, its import and one added test change) and this matrix are.

## 5. Before and after: time and runner cost (acceptance a)

Per-test time is the sum of the spec's test durations (Playwright JSON or blob report), so it does
not depend on how workers share the tests.

| Sample | Before (52 tests) | After (53 tests) |
|---|---|---|
| This machine, profile run (before) and first green run (after) | 496.0 s | 340.1 s |
| This machine, sample 2, before and after alternating per shard | 468.8 s | 326.0 s |
| Actions, main run 41294635431 (`23742966`), shard 8/15 | 227.5 s | |
| Actions, main run 41287750200 (`7030eb18`), shard 8/15 | 275.9 s | |
| Actions, main run 41287297459 (`06d3836c`), shard 8/15 | 269.0 s | |
| Actions, this PR's CI run | | ACTIONS-AFTER-1 |
| Actions, second after sample | | ACTIONS-AFTER-2 |

ACTIONS-NOTE

Runner cost. The offline shards run on standard Linux runners, so a runner-second saved is a
billed second saved. RUNNER-COST

Growth controls: `node scripts/e2e-capacity.mjs --changed origin/main` adds no spec and no
exception (the table reads the spec at 4.27 min until the next durations refresh); with this PR's
shard report (`--report`) CAPACITY-REPORT. The tier warnings it prints (no weekly growth report yet,
durations table 13 days old, backend evidence partial) are the plan's existing ones, not this
change.

## 6. Integration kept (acceptance b)

- **UI and rendering**: every test still boots the real app in its own browser context and drives
  the real production page; only the second boot is gone.
- **Persistence**: kept and made explicit. The round-trip test reads the whole seeded record back
  after a reload, and the spec's reload tests (collapse kept, folder kept, failed writes keep what
  was saved) are unchanged. The durable store's own tests and `e2e/cross-tab.spec.ts` are untouched.
- **Scheduled cadence**: nothing moves to a scheduled or nightly run. The spec runs where it ran:
  every full main run and every PR plan that selects it.
- **Critical set and contract map**: `playout-folders.spec.ts` is not a `// critical` journey and is
  not named in `scripts/e2e-contracts.mjs`; neither changes. Its `// covers` and `// focus` lines
  are unchanged.

## 7. Selection and the audit reset (acceptance b)

Classification: **no audit reset.** The change touches no selector code, no header or list, no
critical/shared membership and no dependency mapping, and moves protection only inside the same
spec file, so no existing contract changes selection. `node scripts/e2e-affected.mjs --list --files
e2e/playout-folders.spec.ts` names the same one spec on base and head. `node
scripts/e2e-selection-misses.mjs resets --ref HEAD` still reads the latest reset as `06d3836c` (ci07,
2026-11-01T07:53:03Z), and no commit here carries a `Selection-audit-reset` trailer.

## 8. Decisions and traps

- The spec does the helper's steps itself rather than adding a hook to `openProductionWithCurrent`:
  an edit to `e2e/_create.ts` would select the full suite (any `e2e/_*` edit does; 89 specs import it) for a
  change that only this spec needs.
- **No test-maintenance entry.** No test is removed (52 to 53), so none is owed; writing one would
  also cover every later change to this file.
- Trap for ci10: a reload in setup can be hiding pending work from the first boot (here the new
  graphic's 800 ms autosave). Removing one, check write counters and storage-failure tests first.
- Trap: a queued job is killed at its cap. The old spec runs about 4.5 minutes alone on this
  machine, so every run of it here was split into two `--shard` jobs.
- The other playout specs (`playout-cues`, `playout-clock`, ...) have their own setups; they were
  not changed, and no saving is claimed for them.

## 9. Verification

VERIFICATION

## 10. Phase notes

- Previous verified main: `23742966784b3c8a46858524ca7a8037a373e0b7` (ci08 merge #1910; its full CI
  run 41294635431 passed).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It restores
  the setup reload and removes the round-trip test. It changes no selection, so it is not a reset.
