# Phase ci11: critical contract fault detection

Row ci11 of the [cicd-improvement spec](../spec.md) (P2; AC-3). Built 2026-11-01 by the ci11
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`c2ca020a7670ac6a7f2e99150aec9a5108d1e6c6` (ci10 merge, #1918).

Acceptance, verbatim:

- (a) "For each changed or replaced protection class, observe a historical or realistic boundary
  fault fail and its correction pass; cover identity, persistence, export lifecycle and asset
  loading at faithful boundaries."
- (b) "A fresh reviewer checks the oracle and discloses unproved device boundaries; ordinary
  additive tests do not reset the audit, but a discovered mapping or set correction does."

## Summary

- Nine boundary faults were injected on this machine (F1 to F9), seven of them replays of a
  recorded defect. Each one, at its faithful layer, fails the check that guards it, and the
  correction passes. The four areas the acceptance names are covered: cross-tab identity (F1, F2,
  F6), persistence (F3, F7), export lifecycle (F4) and asset loading (F5, F8), plus one catalog
  fault (F9) for the catalog selection class.
- One fault exposed a **mapping gap**: a change to a CORE file (`src/store/`, `src/model/`,
  `src/preview/` and the rest of the `CORE` list) planned the shared-change set alone and dropped
  every spec whose own `covers:` header names that file. For `src/model/project.ts`, the file of
  the #1402 fix, that dropped `save-transaction.spec.ts`, the only spec that fails on the #1402
  regression (F2); no shared-change spec reads a reservation at all. This row corrects the
  mapping: a CORE file keeps its header specs beside the shared-change set. That is a selector-code
  change, so **its merge is an audit reset** (section 4).
- The critical set (the 10 `// critical:` specs) catches none of F2 to F5 (section 5), which is
  evidence for #1895: running the critical set on every product change would not have closed this gap; the
  header mapping does.
- Two historical replays no longer reproduce on today's code and are reported as such, not as
  passes (section 6). Physical playout devices and vendor builds stay unproved (section 7).

## 1. Protection classes this run changed or replaced

| Class | Row and merge | Fault evidence | Where |
| --- | --- | --- | --- |
| Broad/shared escalation and catalog gate coupling | ci04, `b666f302` | Each fix reverted alone with its tests run (mutation check); replay of 56 landings. End to end here: F1, F2 and F3 (CORE files reach the shared-change set), F9 (catalog gate and slice) | [phase-ci04.md](phase-ci04.md) sections 3 and 4; this file F1 to F3, F9 |
| Path selection (renames, deletions, `test.only`, fixtures, copy edits) | ci05, `11523106` | Each fix reverted alone with its tests run; replay of 150 landings | [phase-ci05.md](phase-ci05.md) sections 3 and 4 |
| Selected configured specs as a required check | ci06, `26095c82` | Mutation check of the planner flag and verdict. End to end here: F6 and F7 are selected by today's configured plan (`configured: all`) for the file that carries them and fail on the local stack | [phase-ci06.md](phase-ci06.md) section 4; this file F6, F7 |
| Growth controls | ci18, `fb15e6b8` | Every rule line mutation-checked; each earlier escape replayed in `Rule replay:` tests | [phase-ci18.md](phase-ci18.md) sections 2 and 5 |
| Contract map, critical set, quarantine incidents, miss audit | ci07, `06d3836c` | 33 mutations, all fail; replay of every red full run on `main` for 42 days | [phase-ci07.md](phase-ci07.md) sections 4 and 5 |
| Arrangement geometry (replaced test stretch one) | ci08, `23742966` | Nine injected faults; the replacement fails on every one the old tests catch | [phase-ci08.md](phase-ci08.md) section 3, PR #1910 |
| Rundown seeding and the durable store round trip (stretch two; persistence) | ci09, `b2f335fb` | Faults F1 to F9, including hydration and write faults in `durableStore.ts` | [phase-ci09.md](phase-ci09.md) section 4, PR #1913 |
| Editor command and proposal walks (stretch three) | ci10, `c2ca020a` | Faults F1 to F6 on the command, proposal, review, Cancel, history and UI paths | [phase-ci10.md](phase-ci10.md) section 4, PR #1918 |

ci04 to ci07 and ci18 proved their own tooling by mutation: the checker fails when its rule is
broken. What they had not shown is the end-to-end chain this row adds: a product fault in a file,
today's planner selecting a check for that file, and that check failing. Every class above now has
an observed fault, cited or added here. The classes still without an end-to-end product fault
before this row were broad/shared escalation, the catalog slice and the configured selection; F1
to F3, F6, F7 and F9 cover them.

## 2. The fault matrix (acceptance a)

Each fault is a source patch (or, for F7, a policy in the local database) applied on this machine,
run in one queued job (`scripts/jobs.mjs`, `--cap 5`), then reverted; the correction is the
unpatched tree in the next job. The exact find and replace for every patch is in
[phase-ci11-faults.json](phase-ci11-faults.json), so a reviewer can re-apply any of them. The
tree was clean after every pair. "PR plan" is what `node scripts/e2e-affected.mjs --json --files
<file>` plans today for the faulted file, on `main` (before this row's correction) unless noted.

| Fault | Area, contract | Layer | Source | Patch | PR plan today | Fault | Correction | Oracle (the failing assertion) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 a tab never adopts another tab's write | identity, edit-save-reopen | browser | replay of `f68362db1` | `durableStore.ts`: no `startCrossTabInvalidation()` | shared-change set, `cross-tab` selected | **fail** 3/3 | pass 3/3 | "the first tab never adopted the second tab's table"; a pin in one tab not shown in the other |
| F2 a reserved id honoured by the wrong tab (#1402) | identity, edit-save-reopen | browser | replay of `c2aedf447` | `project.ts` `reservedGraphicId`: drop the `graphicIdTaken` guard | shared-change set; `save-transaction` **not selected** before this row, selected after | **fail** 5/8 (`--grep "reservation owner"`) | pass 8/8 | `matrix reservation owner: tab/duplicate; A first-saves the draft B has open; B edits (reloads) and saves`, and `a restored slot names a record holding other work` |
| F3 a refused save of a clean graphic reads as landed | persistence, edit-save-reopen | browser | replay of `eb09063fe` (both halves) | `saveActions.ts` `saveBeforeLeave` and `SaveDialogs.tsx` `unsaved` ignore a failed status | `SaveDialogs.tsx` selects `save-transaction-leave`; `saveActions.ts` alone did not before this row | **fail** 1/19 | pass 19/19 | "a refused save read as landed" (`matrix in-flight leave: topbar / L refused on a clean graphic`) |
| F4 `dispose()` leaves the template's timers and listeners running (#989, #998) | export lifecycle, export-portability | artifact (exported `graphic.mjs` in a renderer page) | replay of `c48a1ac27` and the #989 fix | `ograf.ts` `_dispose`: no `_endTemplate()` | `ograf-lifecycle` selected | **fail** 2/2 (`--grep dispose`) | pass 2/2 | the countdown keeps counting; the listeners and observers fire after `dispose()` |
| F5 a font that never answers holds the frame off air | asset loading, graphics-runtime | browser (output stage) | replay of `100d43a22` | `stage.ts`: the held message no longer releases the frame | `output-font-hold` selected | **fail** 1/2 | pass 2/2 | `that never answers: every graphic still airs, on a fallback face, and the debug line says why` |
| F6 every open tab runs a library sync pass for one edit | identity, edit-save-reopen | configured (local Supabase) | replay of `2f64ce14f` | `syncController.ts` `scheduleSync`: an adopted change also schedules a pass | `configured: all` (67 specs), `sync-one-pass-per-edit` selected | **fail** 2/2 | pass 2/2 | "the tab that only adopted the edit runs no pass"; "one open tab took the pass, not each" |
| F7 a policy lets any account read every library row | persistence and tenancy, access-durability | configured (local Supabase) | realistic: a migration widening a select policy | local database only: `create policy ... on public.documents for select to authenticated using (true)` | a new migration plans `configured: all`, `shared-lab-computer` selected | **fail** 1/1 | pass 1/1 | student 2's library after signing in is `["Lab student 1 ..."]`, expected `[]` |
| F8 a single-file export ships no font bytes | asset loading, export-portability | artifact (packages over `file://`) | replay of the 2026-07-20 defect (`src/export/AGENTS.md`, dangling-refs instance 1) | `bundledFonts.ts` `inlineBundledFonts`: returns the CSS unchanged | `exports` selected (and the catalog gate) | **fail** 3/18 | pass 18/18 | `no export target ships a relative reference its own package cannot resolve`; `every export target carries the fonts its own code references`; the baked logo stays inlined |
| F9 a lower third's text leaves the safe area | graphics-runtime (catalog) | catalog, scoped to the affected slice | realistic (the historical replay is in section 6) | `lt63.ts`: band padding 0 | `catalog-affected`: slice `lt63` (1 design) | **fail** (`long-value-containment`, scoped and unscoped) | pass | "1 of 104 lower thirds put text outside the safe area ... lt63 Broadsheet Band: text 0,919 -> 1732,961" |

The configured runs (F6, F7) used the same local stack the CI job uses: Supabase CLI 2.111.0,
`supabase start -x studio,edge-runtime`, every migration applied, the CLI's local default
accounts; no hosted project or credential was read. F9's catalog runs are the battery command
`catalog-affected` prints for the slice (`node scripts/catalog-specs.mjs --only lt63`).

Selection held for every fault but F2: today's planner plans a check that fails on the fault. F2
is the CORE gap of section 4. F3's `saveActions.ts` half alone sits in the same gap, but it does
not fail the spec on its own (section 6), so only F2 is a fault the old plan missed.

## 3. Oracles: why each failure is for the right reason

- Each fault's failing assertion names the broken behaviour itself (the table's last column), not
  a timeout or an unrelated locator. F2's five failures are exactly the reservation-owner rows; the
  three other rows in that grep pass under the fault.
- F7 fails at the line that reads student 2's library, with student 1's graphic in it.
- F9's oracle was checked against selection: the gross fault fails the scoped run naming `lt63`, so
  the scoped slice really measures the design it selects. The byte-identical baseline
  (`catalog-baseline.spec.ts`) also fails on every lt63 edit, faulted or not, so it is not counted
  as the oracle.

## 4. The mapping gap and its correction (audit reset)

**Gap.** `planFor` in `scripts/e2e-affected.mjs` handled a CORE file with `escalate(file);
continue;`, before the header lookup. Under the shared-change escalation that planned the 77
`// focus` specs and nothing the file's own headers name, although the comment above the
escalation says the shared set is planned "union with whatever the mapped rules already named".
ci05 recorded the behaviour ("CORE drops header specs under sprint focus") and worked around it for
one file (`ESCALATES_WITH_HEADERS`); it was never measured against a fault. F2 measured it: for
`src/model/project.ts`, the six specs whose `covers:` header names the file were dropped
(`save-transaction`, `save-transaction-holds`, `-leave`, `-leave-modal`, `-leave-shortcut`,
`-wizard`), no shared-change spec mentions a reservation, and the critical set passes under F2 (section 5). The #1402 regression would have
been found only by the full run after landing.

**Correction.** A CORE file now keeps the specs its `covers:` headers name, beside the
shared-change set, like `ESCALATES_WITH_HEADERS`. It does not add the specs that read a CORE file
by path or route (`readersOf`): every spec opens `app.html`, so that would plan 223 specs for one
file, a cost decision outside this row (#1921). Test: `ci11: a CORE file keeps the
specs its covers headers name beside the shared-change set` in `scripts/e2e-affected.test.mjs`;
with the one added line removed, it fails. Nothing narrows: the plan only grows.

**Cost.** Of 181 tracked files under a CORE pattern, 44 gain specs (`planFor` per file, before
and after). The largest additions, in measured test-minutes from the durations table:
`src/templates/contract.ts` 40 specs, 30.2; `gsap.min.js` 22.9 (through its `?raw` importers);
`router.ts` 16.3; `durableStore.ts` 15.6; `saveActions.ts` 15.5; `templateStore.ts` 14.0;
`structure.ts` 13.7; `project.ts` 12.8. The median CORE file adds nothing and the 90th percentile
1.3, against about 53 minutes of the shared-change set. The plan stays at 15 shards; the slowest
predicted shard grows from 4.9 to 6.0 minutes for `contract.ts`, 5.6 for `saveActions.ts` and
`project.ts`, 7.2 to 7.6 for `gsap.min.js`; no plan goes over the shard cap (`overCap` 0). Runner
minutes grow by the added test-minutes on those changes.

**Reset.** This is a dependency mapping corrected because of a miss, and it changes selector code
(`SELECTION_CODE`), so under the runbook's "Audit reset and coverage rules" its merge **is an audit
reset**: the miss audit reads it from git (Rule A4) and the 14-day window restarts at this PR's
merge commit. The commit also carries a `Selection-audit-reset:` trailer naming the reason.

## 5. What this says about the critical set (#1895)

#1895 asks whether the critical set should run on every product change; that is an owner decision
for ci17, not taken here. Evidence from this row:

- The critical set catches F1 (`cross-tab`) and F8 (`exports`): their catching specs are members,
  and their headers already select them.
- It catches **none of F2, F3, F4 and F5**. With each fault in place, all 92 tests of the 10
  critical specs pass, in complete runs (two halves of one queued `--cap 5` job each, so the cap
  cut nothing short):

  | Run | Half A (`production-controls`, `cross-tab`, `offline`, `flows`, `project`) | Half B (`exports`, `production-persistence`, `playout-drills`, `snap-recovery`, `storage-full`) |
  | --- | --- | --- |
  | control, no fault | 57 passed (4.0 min) | 35 passed (2.2 min) |
  | F2 | 57 passed | 35 passed |
  | F3 | 57 passed | 35 passed |
  | F4 | 57 passed | 35 passed |
  | F5 | 57 passed | 35 passed |

  So "run the critical set on every product change" would not have caught F2 or F3, the gap this
  row found; the header mapping does. F4 and F5 are caught by their own header specs, which the
  plan already selects. The critical set is a smoke layer over the journeys, not a substitute for
  a file's own covers.
- An earlier single-job run of the whole critical set stopped at the 5-minute cap with 15 tests
  unrun; it is not counted.

## 6. Historical replays that no longer reproduce

Reported, not counted as passes:

- **F3, the `saveActions.ts` half alone** (`saveBeforeLeave` ignoring a failed status): the full
  `save-transaction-leave` spec passes. The dialog half (`SaveDialogs.tsx`) alone fails it, and both
  together fail it, so the recorded defect is still caught; the `saveActions.ts` line is covered by
  a later guard on this path.
- **`43ead1042` on lt63** (the trailing 8px reserve and `min-width: 0`): the
  `long-value-containment` gate passes, scoped to lt63 with either edit alone or both, and unscoped
  with both. The spec header still says "Removing
  lt63's trailing reserve turns this red naming lt63"; on today's code it does not, so that
  mutation claim is stale. Filed in #1921. F9 uses a realistic fault instead.

## 7. Boundaries not proved here (acceptance b)

- **Physical playout hardware**: CasparCG servers, vision mixers, vMix and OBS hosts, SPX servers
  and LiveOS. F4 and F8 run exported packages in in-repo harnesses and a Chromium renderer page,
  not the vendors' builds; F5 runs the output stage in Chromium, not a CasparCG CEF.
- **Hosted backend**: F6 and F7 ran on the local stack, not hosted Supabase (the configured suite's
  own boundary). The merge group still skips the configured job (#1846).
- **Browsers and fonts**: Chromium only; one design for the catalog fault.
- **Production-page studio acceptance** stays pending under its own plan. F1, F2 and F6 touch the
  production page's cross-tab behaviour; this row proves the faults are caught by those specs, not
  that page's acceptance.
- **Loop-declared tests** (#1911): `save-transaction*.spec.ts` declares most of its matrix in
  loops, which `check-e2e-protection` does not count; the F2 and F3 oracles are named tests in
  those files and ran by name here.
- **Quarantine**: `import-svg` and two configured specs are quarantined (#1907). None was an
  oracle here; while quarantined they are coverage gaps, not passes.

## 8. Verification

- Fault matrix: F1 to F9 and their corrections, queued jobs on this machine; logs kept in the
  session scratchpad, results above. `git status --porcelain` was clean of fault patches after
  every pair.
- `node --test scripts/e2e-affected.test.mjs scripts/configured-selection.test.mjs
  scripts/e2e-*.test.mjs`: 311 pass, 0 fail. The new test fails with the correction removed.
- `/check` review (delegated, medium): 9 findings, all checked. Fixed: the cost figures (they
  missed `contract.ts`, the largest addition), the dropped-spec count (six, not eight), the
  section 2 claim about F3's `saveActions.ts` half, a dead `CENTRAL` loop, a stale #1349 test
  comment, the `docs/TEST_SELECTION.md` row and a circular test loop. Not fixed, filed in #1921:
  CORE files still plan no reader specs (a cost decision). Not taken: folding CORE into the
  ordinary mapping path, which would bring readers with it.
- Simplify (inline; the code diff is four lines): `covering` is computed once and used by both
  branches.
- `npm run gates -- run --changed origin/main`, `npx eslint` on the changed scripts,
  `node scripts/check-e2e-protection.mjs --changed origin/main`: clean.

## 9. Phase notes

- Follow-ups: #1921 (CORE files plan no reader specs; the stale lt63 mutation claim).
- Previous verified main: `c2ca020a7670ac6a7f2e99150aec9a5108d1e6c6` (ci10 merge, #1918).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. The revert
  changes selector code too, so it is itself an audit reset.
- Decisions: start from the recorded defects (seven of nine faults are replays); fix the CORE
  mapping gap here because the fault exposed it and the correction only widens a plan; inject the
  tenancy fault in the local database rather than a migration file, so no fault ever sits on the
  branch.
- Traps: the critical set takes more than the 5-minute browser cap on a cloud worker (a `--cap 5`
  run stopped with 15 tests unrun), and a `--cap 12` job needs a clean committed tree, so a fault
  in the working tree cannot use it: split the set into two `--cap 5` halves. A configured run beside a running
  Supabase stack drops the browser to one worker on a 13 GiB machine. A historical fix with two
  halves can be masked by later code: replay every half, then each alone.
