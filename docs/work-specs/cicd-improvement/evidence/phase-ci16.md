# Phase ci16: retain full catalog protection (no activation)

Row ci16 of the [cicd-improvement spec](../spec.md) (P3; AC-4/AC-5). Built 2026-11-02 by the ci16
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`5f60ce9774dae4e618837591fde32c7b8d160cec` (ci15 merge, PR #1943). This row adds this file only.
It changes no code, workflow, selector, header, list or quarantine entry.

Acceptance, verbatim:

- (a) "Before any activation PR, require ci15 independent PASS and its qualified verdict on
  still-current evidence; a later reset or invalidated receipt refuses activation."
- (b) "Qualified: reuse the existing scoped path, preserve unknown/shared broad fallback and cheap
  whole-catalog emit, prove representative selected/full equivalence and actual merge-group
  behavior. Reversal restores full scope without undoing hardening or integrity fixes."
- (c) "Not qualified: land no narrowing or cadence reduction; record retained protection and
  blocker. Independent PASS proves the chosen safe outcome, not that AC-4/AC-5 were achieved."

## Outcome: no activation, full protection retained

ci15 recorded **NOT QUALIFIED** ([phase-ci15.md](phase-ci15.md), merge `5f60ce97`), and its
independent checker gave that disposition PASS (PR #1943, comment 6566279334, 2026-11-02T00:36Z).
So (a) is not met for activation, (b) does not apply, and this row takes (c): nothing narrows, no
check moves to a schedule, and no schedule runs less often.

**This PASS, if given, proves only that the safe outcome was chosen and recorded accurately. It
does not mean AC-4 or AC-5 was achieved.** Both stay open.

## 1. The gate in (a), read now

| Check | Reading | Result |
| --- | --- | --- |
| ci15 independent PASS | Checker comment 6566279334 on PR #1943: PASS on merge `5f60ce97` | present |
| ci15 verdict | NOT QUALIFIED (section "Verdict" of phase-ci15.md) | **refuses activation** |
| Reset since ci15 | `node scripts/e2e-selection-misses.mjs resets --ref origin/main` at `5f60ce97`: latest reset is still `8e84002d` (2026-11-01T18:14:35Z). `5f60ce97` added one evidence file | no new reset |

No activation PR may start. Even a qualified verdict would not be enough on its own: it would have
to be on receipts still current when the activation PR starts.

## 2. Retained protection, at `5f60ce97`

All of the following stay exactly as they are. Line numbers are from `.github/workflows/ci.yml`
at `5f60ce97`.

| What | Where | What it keeps |
| --- | --- | --- |
| `plan` job, `catalog` output | ci.yml:234, output at :248 | The planner (`scripts/e2e-affected.mjs`) raises the catalog flag for any change that can move catalog output or the bench, including unknown reach (`catalogReachUnknown`: an unreadable reach raises the gate on every escalation). No narrower catalog rule is added |
| Full suite on every push to `main` | ci.yml:420-422, `e2e-affected.mjs --json --all --catalog-since=<push base>` | Every landing runs the full E2E suite. An unusable push base raises the catalog gate |
| No usable diff base means the full suite | ci.yml:427-430, `--all` | The last-resort fallback runs everything |
| `--integration` on pull requests and the merge group | ci.yml:431-441 | The plan reads from the fork point, so it can only plan more |
| `e2e-catalog` job, "Catalog calibration gate" | ci.yml:920-949 | Runs when the flag is raised. Step `Catalog emit fingerprints` (`npm run check:catalog-emit`) checks every design's emit; step `Catalog calibration tripwire` (`npm run test:e2e:catalog`, `playwright.catalog.config.ts`) benches the **whole catalog**. No scope variable or `--only` is passed, and this row adds none |
| `gate` job ("CI gate") | ci.yml:1410, needs at :1427, `optional "Catalog calibration gate"` at :1533 | A failed or cancelled catalog gate holds the PR or merge group back. Skipped is accepted only when the plan did not raise the flag |
| `nightly.yml`, cron `20 0 * * *` | nightly.yml:30, `catalog` and `catalog-gates` jobs, `engine-floor.mjs --fail` at :269 | The whole-catalog nightly and its engine-floor gate keep their daily cadence |
| `catalog-gates.yml`, cron `50 11 * * *` | catalog-gates.yml:78 | The scoped midday battery stays as it is. It adds coverage on top of the full gates and does not replace them |

The scoped path in `catalog-gates.yml` (`scripts/catalog-affected.mjs`, with the scope guard in
`e2e/catalog/_bench-scope.mjs`) stays untouched. It is the path a later activation would reuse.

## 3. Blockers, each with its tracking

From ci15, re-read 2026-11-02:

| Blocker | Tracking | State |
| --- | --- | --- |
| Deadline receipt fails: the nightly is the only carrier for engine-floor and the full E2E suite. Over 14 days, 128 landings waited more than 24 hours for a complete green E2E verdict and 11 for engine-floor | [phase-ci13.md](phase-ci13.md) (NOT QUALIFIED, checker PASS on `d26c0ba0`, PR #1930); nightly cause #1622 | #1622 open |
| Pre-reset unexplained miss: `video-hyperframes`, culprit `aa2717b3` | #1900 | open |
| Pre-reset unexplained miss: `editor-foundation`, culprit `b0331ecb` | #1942 | open |
| Pre-reset unexplained miss: `editor-base-edits`, culprit `97311f15` | #1944 | open |
| 14 clean days since reset `8e84002d` | earliest close 2026-11-15T18:14:35Z, only if no reset lands and no unexplained miss appears | open |
| Open quarantine incidents in `e2e/quarantine.json` at `5f60ce97` | `late-send-abandoned` (since 2026-10-28), `import-svg` (2026-10-31), `production-chat-intake` (#1924), `production-data` (#1940 landed, cause #1603) | four open |
| Pending quarantine | `import-svg-corpus`, PR #1834 | open |
| Bench gap: `imported-design` (`imp01`, `svg01`) is declared, not benched | #1926 | open |

Other known faults in this run, which do not change this outcome: #1946 (a `production-controls`
failure on a docs-only PR), #1865 and #1829 (configured-suite stack start).

## 4. What must change before a later activation PR can start

1. Each blocker in section 3 is cleared. The ci13 failure needs a second complete carrier for
   engine-floor and for the E2E specs a scoped selection would omit, or those checks stay before
   the merge. A mapping fix for a miss is a reset.
2. 14 clean calendar days pass after the last reset.
3. A fresh ci15-style verdict says **qualified** on receipts still current, and an independent
   checker PASSes it. Any later reset or invalidated receipt refuses activation again.
4. The activation PR itself then does what (b) names:
   - reuse the scoped path in `catalog-gates.yml` and `catalog-affected.mjs`, with the
     `_bench-scope.mjs` guard, instead of writing a new selector;
   - keep the broad fallback for unknown and shared changes, and keep `check:catalog-emit` on the
     whole catalog;
   - prove that representative scoped runs match full runs, and show real merge-group runs;
   - ship a reversal that puts the whole-catalog tripwire back without undoing the hardening and
     integrity fixes from ci04, ci05 and ci12.

## 5. Verification

- `git log --first-parent 8e84002d..origin/main`: four landings after ci15's base read
  (#1936, #1938, #1940, #1943). None is a reset.
- `node scripts/e2e-selection-misses.mjs resets --ref origin/main` at `5f60ce97`: `8e84002d`.
- `e2e/quarantine.json` at `5f60ce97`: four entries, as tabled.
- Read ci.yml, nightly.yml and catalog-gates.yml at `5f60ce97` for section 2.
- GitHub REST: ci15 checker comment 6566279334 and issues/PRs #1900, #1942, #1944, #1924, #1926,
  #1603, #1940, #1946, #1865, #1829, #1834 and #1622, about 15 calls. No log URL or credential is
  recorded here.

Out of scope: the production-page studio acceptance stays pending under its own plan.

## 6. Phase notes

- Previous verified main: `5f60ce9774dae4e618837591fde32c7b8d160cec` (ci15, PR #1943). Its CI
  push run 41366379777 and configured-suite push run 41366379639 passed (per the ci15 checker).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It removes
  this file only. Nothing else changed, so nothing else needs restoring.
- Decisions:
  - Record the outcome now, not after the window. ci15's failures are demonstrated, and waiting
    does not turn them into a qualified verdict.
  - Name the exact protection that stays, at its line numbers, so a later row can see whether
    anything has moved since.
- Traps for later rows:
  - A green ledger event or a merged ci15 is not qualification. Read its verdict word and check
    for resets since.
  - The midday `catalog-gates.yml` scoped run is extra coverage. It does not stand in for the
    whole-catalog tripwire in ci.yml or the nightly.
