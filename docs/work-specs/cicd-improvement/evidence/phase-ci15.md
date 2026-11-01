# Phase ci15: independent qualification of the audit evidence

Row ci15 of the [cicd-improvement spec](../spec.md) (P2/P3; activation gate). Built 2026-11-01 by
the ci15 builder (Claude Code Cloud worker of plan run #1842) from `main` at
`5ca8b87ad19f22184346fc8e205c73e7fe0b3e0f` (ci14 merge, PR #1936). This row is evidence only: it
changes no code, workflow, selector, header, list or quarantine entry. It adds this file.

Acceptance, verbatim:

- (a) "A qualified verdict requires at least 14 clean calendar days after the last defined reset,
  original-culprit and adversarial replays, zero unexplained misses and independently accepted
  ci12/ci13 integrity and deadline receipts."
- (b) "Publish qualified only when every condition is proved. A demonstrated failed qualification
  may be reported immediately as not qualified with retained protection; incomplete observation
  alone waits under until-complete authority. Owner pause or cancellation stops dependent work;
  the planning target does not shorten the audit."
- (c) "A fresh independent checker PASS on this evidence-only merge gates ci16. A not-qualified
  disposition permits only ci16's documented no-activation outcome, never narrowing."

## Verdict: NOT QUALIFIED

**Not qualified, reported now, because two conditions have demonstrated failures that no amount of
waiting changes.** Full pre-merge protection stays as it is. ci16 may take only its documented
no-activation outcome: no narrowing, no cadence reduction.

The demonstrated failures:

1. **The deadline receipt (ci13) is NOT QUALIFIED, and I accept it.** Engine-floor and the full E2E
   suite have one carrier, the nightly. Over 14 days (337 landings) 128 landings waited more than
   24 hours for a complete green E2E verdict and 11 for engine-floor (5 if the clock stops at the
   end of the job that carries engine-floor rather than the run; the ci13 checker found breaches on
   all-green nights either way). Waiting does not fix this; a
   second complete carrier or keeping those checks pre-merge would.
2. **Three unexplained misses are still open against today's selection.** ci07 left five
   unexplained misses from before its reset. I replayed each culprit's files through the planner
   as CI runs it, one culprit landing at a time (section 4). Two are now selected for every
   culprit. `video-hyperframes` (culprit `aa2717b3`, #1900), `editor-foundation` (culprit
   `b0331ecb`, #1942) and `editor-base-edits` (culprit `97311f15`, #1944) are still not selected. A reset
   restarts the clock; it does not explain a miss whose gap is still there.

The incomplete one, which would wait on its own but does not decide this verdict:

3. **The 14 clean calendar days have not passed.** The latest reset is `8e84002d` (ci11) at
   2026-11-01T18:14:35Z, so the window cannot close before 2026-11-15T18:14:35Z, and only if no
   later reset lands and nothing unexplained appears in it.

## 1. Conditions, receipts and verdicts

| Condition | Receipt | My reading | Verdict |
| --- | --- | --- | --- |
| 14 clean calendar days after the last defined reset | `e2e-selection-misses.mjs resets` on a full clone (section 2). Reset chain `06d3836c` (ci07) then `c2ca020a` (ci10) then `8e84002d` (ci11) | 0 days elapsed at this row's base. No landing since `8e84002d` is a reset (section 2). The audit also reads `blocked`: three quarantine incidents are open (section 3) | **not met, incomplete** (earliest 2026-11-15T18:14:35Z) |
| Original-culprit replay | ci07 replay of 42 days of red full runs, 126 items, none `unknown` ([phase-ci07-replay.json](phase-ci07-replay.json)); checker PASS on `06d3836c` (PR #1896, comment 6555493937) | The replay exists and I re-read the current 7 days with the same tool (section 3). ci13 adds no historical exact-commit Actions replay; its checker counts that as a missing drill receipt | **receipt accepted**, with one disagreement on its reading (section 4) |
| Continuing comparison | `weekly-audit.yml` runs the miss audit each week since ci07 | Re-run here on `main` (section 3) | in place |
| Adversarial replays | ci11 faults F1 to F10 ([phase-ci11.md](phase-ci11.md), [phase-ci11-faults.json](phase-ci11-faults.json)); checker PASS on `8e84002d` (PR #1922, comment 6562405562) | Each fault fails its guard and the correction passes; two historical replays did not reproduce and are reported as such; physical playout devices and vendor builds stay unproved | **accepted**, with those stated limits |
| Zero unexplained misses | ci07's five pre-reset unexplained misses; the current audit (section 3) | Since the reset: none unexplained. Before it: three still not selected by today's planner (section 4) | **not met, demonstrated** |
| ci12 scope-integrity receipt | Guard S1 to S13 in `e2e/catalog/_bench-scope.mjs`, scoped and full comparison runs; checker PASS on `2314eeec` (PR #1927, comment 6563361149) | Agrees. One disclosed gap: `imported-design` (`imp01`, `svg01`) is declared, not benched (#1926), so the bench says nothing about those two designs | **accepted** |
| ci13 deadline receipt | `scripts/schedule-coverage.mjs`, NOT QUALIFIED; checker PASS on `d26c0ba0` (PR #1930, comment 6564468198) | Agrees. The checker also notes a survived mutation (`scopeDecision` ignores missed slots), the missing exact-commit replay and nightly cause #1622 still open; each would block a later qualified record | **accepted; its content fails the condition** |

## 2. The audit reset, read on a full clone

The clone was shallow at first (three culprit ranges failed to read), so I ran
`git fetch --unshallow origin` before every reading below.

`node scripts/e2e-selection-misses.mjs resets --ref <sha>`:

| Ref | Latest reset | Reason |
| --- | --- | --- |
| `06d3836c` | `06d3836c` 2026-11-01T07:53:03Z | selector code `e2e-lists.mjs`; 10 critical/shared header lines |
| `c2ca020a` | `c2ca020a` 2026-11-01T14:12:39Z | protection removed or changed: 1 covers line |
| `8e84002d` | `8e84002d` 2026-11-01T18:14:35Z | selector code `e2e-affected.mjs`; declared mapping correction after ci11 F2 |
| `5ca8b87a` (this row's base) | `8e84002d` 2026-11-01T18:14:35Z | same |

The eight first-parent landings after `8e84002d` (#1923, #1927, #1919, #1929, #1931, #1930, #1933,
#1936) touch none of the six selector files and carry no `Selection-audit-reset` trailer. ci12 and
ci13 each classified their own merge as not a reset; I agree.

## 3. The miss audit on current `main`

`node scripts/e2e-selection-misses.mjs --days 7 --ref origin/main --json`, full clone, 90 API
calls. Status **`blocked`**: 4 misses, 0 unknown, 19 failing items on 13 red full runs.

| Red run | Workflow | Spec or job | Culprit | Audit says | My reading |
| --- | --- | --- | --- | --- | --- |
| 40501378385 | ci.yml | `import-svg` | `55621f97` | selected, flake | Selected. Not a miss |
| 40653478764 | ci.yml | job: Factory gates | `6dd736c1` | not-a-spec | Not a spec failure |
| 41027970852 | ci.yml | `editor-transform-qualification` | `b5652ae6` (#1822) | miss, flake | **Explained**: the culprit changed plan-run docs and scripts only (`scripts/project-authorization.mjs` and two tests), no product code |
| 41134775210 | ci.yml | `import-svg-corpus` | `0df77f74` (#1827) | miss, unmarked | **Explained**: the culprit changed plan-run docs, skills and plan-run tooling scripts only (`scripts/plan-*`, `run-*`, `project-*`, `wave-plan-store.mjs` and tests). The fail-then-pass is quarantine PR #1834, open since 2026-10-30 and not landed, so the store does not mark it |
| 41244292482 | ci.yml | `import-svg` | `af39c249` (#1877) | miss, flake | **Explained**: the culprit changed `e2e/quarantine.json` only. Its quarantine entry names this very run (same-run receipt) |
| 41336665950 | ci.yml | `production-chat-intake` | `8e84002d` | selected, flake | Selected. Fail-then-pass, now quarantined (#1923), tracked in #1924 |
| 41359365006 | ci.yml | `production-data` | `5ca8b87a` (#1936) | miss, unmarked | **Explained**: the culprit is ci14's evidence file only. Fail-then-pass on that commit, quarantine PR #1940 open; the spec has a known open failure, #1603 |
| 40289330116, 40724937287, 41134775201, 41205531471, 41247602152, 41339116445 | configured-suite.yml | shard and verdict jobs | various | not-a-spec | No spec really failed in the verdict; lost shards or stack starts (#1865, #1829) |

All four misses the audit names are explained by their culprits' file lists: none changed product
code. Two of the four (`import-svg-corpus`, `production-data`) are fail-then-pass flakes whose
quarantine PRs have not landed (#1834, #1940).

**Open quarantine incidents** (`e2e/quarantine.json` at the base), each blocking narrowing and
expansion under ci07 Rule Q5 and the runbook:

| Spec | Since | Set | Tracking |
| --- | --- | --- | --- |
| `e2e/configured/late-send-abandoned.spec.ts` | 2026-10-28 | configured | count 16 |
| `e2e/import-svg.spec.ts` | 2026-10-31 | mapped | count 5 |
| `e2e/production-chat-intake.spec.ts` | 2026-11-01 | `// focus` (shared-change set) | #1924 |

Pending entries: `import-svg-corpus` (#1834) and `production-data`, also `// focus` (#1940). Zero
unexplained misses is necessary, not sufficient: these incidents block on their own.

## 4. The pre-reset unexplained misses, replayed on today's planner

ci07 listed five unexplained misses, all before its reset, and left to ci15 whether they block.
They block when today's selection still leaves the failed spec out for the culprit's files: the
gap that may have let the fault in is still open, and the 14-day window cannot observe it, because
the culprit landed before the window started.

I ran each culprit's first-parent diff through the planner the way CI does
(`node scripts/e2e-affected.mjs --json --files <files>`, which applies the shared-change escalation,
the traced map and the header index):

| Spec | Culprit | Today's plan | Selected |
| --- | --- | --- | --- |
| `video-hyperframes` | `aa2717b3` | subset, 133 specs | **no** (#1900) |
| `editor-foundation` | `b0331ecb` (#538) | subset, 88 specs (`CueRundown.tsx` and `FolderRow.tsx` escalate to the shared-change set) | **no** (#1942) |
| `editor-base-edits` | `4abaa4a5` (#603) | subset, 153 specs | yes |
| `editor-base-edits` | `97311f15` (#607) | subset, 26 specs | **no** (#1944) |
| `wizard-shell` | `7d83ced0` (#609) | subset, 149 specs | yes |
| `wizard-shell` | `74b2ed37` (#615) | subset, 140 specs | yes |
| `layout` | `696f122e` | subset, 76 specs | yes |

**Where I disagree with the ci07 checker.** Its comment says "`planFor` on `4abaa4a5` and
`b0331ecb` plans `full` today (claim holds)". Called bare, `planFor` defaults to
`sprintFocus: false` and does return `full` for both; I reproduced that. CI does not call it that
way. The CLI that ci.yml runs sets the shared-change escalation (`e2e-affected.mjs` around line
2119), so a broad change plans the `// focus` set plus the header mapping, not the whole suite. For
`b0331ecb` that set leaves `editor-foundation` out. The checker also read `layout` as unselected
on `696f122e`; the CI path selects it. Each culprit is a separate landing that CI planned on its
own, so each is replayed alone. Net: three misses stay open, not one.

## 5. What would lift each blocker (none of it done here)

- Scheduled coverage: the ci13 named blocker. A second complete carrier for engine-floor and for
  the E2E specs a scoped selection omits, or keep them pre-merge. ci16 decides, on no-activation
  terms while this verdict stands.
- Misses: a mapping or shared-set correction for #1900, #1942 and #1944, or evidence that clears each
  culprit. Either correction is a reset.
- Incidents: the three open quarantine entries back in the blocking gate, and #1834 and #1940
  resolved.
- Window: 14 clean days after the last of those resets.
- Then a fresh ci15 qualification on still-current receipts. Any reset or stale receipt refuses
  narrowing.

## 6. Verification

- `git fetch --unshallow origin`, then `node scripts/e2e-selection-misses.mjs resets --ref` on the
  four SHAs in section 2: results as tabled.
- A scan of the eight landings after `8e84002d` for selector-file changes and reset trailers: none.
- `node scripts/e2e-selection-misses.mjs --days 7 --ref origin/main --json`: section 3 (90 calls).
- `git diff --name-only <culprit>^1 <culprit>` for each culprit in sections 3 and 4.
- `node scripts/e2e-affected.mjs --json --files ...` per culprit, and bare `planFor` with
  `sprintFocus` false and true, for section 4.
- GitHub REST: the five checker comments, the CI runs on `5ca8b87a`, issues #1834, #1900,
  #1924, #1926, #1940, #1603, #1865 and #1829. About 30 calls, below the 100-call bound. No log URL
  or credential is recorded here.

Out of scope: the production-page studio acceptance stays pending under its own plan; nothing here
reads or changes it.

Stated limits: the miss audit reads 7 days; earlier red runs come from ci07's 42-day replay, not a
re-read. Job logs expire after 90 days.

## 7. Phase notes

- Previous verified main: `5ca8b87ad19f22184346fc8e205c73e7fe0b3e0f` (ci14, PR #1936). Its CI push
  run 41359365006 failed on `production-data.spec.ts`, a fail-then-pass the quarantine bot picked
  up as #1940; its configured-suite push run 41359364992 passed.
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It removes
  this file only. Reverting it does not make anything qualified.
- Decisions:
  - Report now, not after the window. Two failures are demonstrated, so (b) allows reporting
    immediately; waiting cannot change them.
  - A pre-reset unexplained miss counts when today's CI selection still leaves its spec out for
    the culprit's files. It was never explained, and the window after the reset cannot see it.
  - The selection to judge is the one CI runs (`e2e-affected.mjs` CLI), not `planFor`'s defaults.
  - Accept each receipt as accurate, then judge whether its content meets the condition. ci13 is
    accepted and fails the condition.
- Traps for later rows:
  - Unshallow the clone before reading misses; a shallow clone silently skips culprit ranges.
  - `planFor(files)` with default options plans `full` for a broad change; CI plans the
    shared-change set, and `planFor` with `sprintFocus: true` still differs from the CLI (it
    lacks the traced map and header readers the CLI passes). Use the CLI to replay what CI
    selected, one culprit landing at a time.
  - The miss audit counts an unlanded quarantine PR's spec as an unmarked miss. Read the open
    `quarantine/enter-*` PRs before calling it a real miss.
