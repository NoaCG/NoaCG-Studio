# Phase 13: Review midpoint evidence and remaining scope

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-11: "Midpoint evidence, elapsed time, spend, unresolved defects and remaining scope are
  reconciled without weakening gates."
- Row 13: "Independent cumulative rehearsal of all preceding product rows; five-line checkpoint
  with defects, elapsed time, spend (zero paid calls expected) and remaining risks. This is an
  early behavior checkpoint after reordering, not the chronological midpoint. Keep scope/checks
  intact; no silent file expansion."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. This row built none of rows 1 to 12. No product,
test, workflow or limit file changed: this file is the whole diff. No model call; the holdout was
not read.

## Pinned main

Worktree created from `b2f335fb353f799dc7866f23ca9200168205faad` (PR #1913, cicd-improvement
ci09) after a fresh fetch. Previous verified main for this plan: `a961bec` (row 12, PR #1909):
merge-group CI, push CI, configured-suite, Post-landing and Quarantine all succeeded on it.

## Checkpoint

1. **Defects:** the rehearsal found no defect in rows 1 to 12. It found two new flaky tests in the
   already quarantined `e2e/import-svg.spec.ts`, in code no row changed (#1915, P3, area:e2e). Twelve tracked follow-ups were
   reconciled (table below): two closed as moved, ten stay open, three of them P2. Nine of the ten have no later row that can fix them (six product defects, three outside
   the plan); #1884 item 2 could be fixed only in row 24 with a reconciled boundary.
2. **Elapsed time:** 26 h 26 min of 336 h (8%), measured at 2026-11-01T12:45:51Z when this row started. Run start
   2026-10-31T10:19:44Z. Row 12 reached main at 2026-11-01T12:19:01Z (merge commit dated 12:06:46Z). 12 of 40 rows are done (30%).
3. **Spend:** $0, no paid call. No inference path exists yet (rows 31 to 36), and the only
   workflow holding the evaluation key ran twice in the window, each time only the free credits
   check.
4. **Remaining scope:** rows 13 to 40, unchanged in order, files and checks. At the pace so far
   (about 2.2 h per row) that is roughly 60 to 70 h. 309 h of the window remain.
5. **Risks:** the main import spec is quarantined and does not block merges; a score board
   reloaded from its report shows no team's flash (#1908 item 2); imported clock verbs get no wire
   stamp on the fast road or in exported panels (#1886, #1887); configured stacks sometimes fail
   to start (#1865); the Gateway balance is about $1.94 above the $5 ceiling.

## Rows 1 to 12 at their exact landings

| Row | PR | Merge | Push CI | configured-suite | Post-landing |
|---|---|---|---|---|---|
| 1 | #1851 | `0b4e403d` | success | success | success |
| 2 | #1853 | `7f0a00ba` | success | success | success |
| 3 | #1858 | `aa84e1e4` | success | success | success |
| 4 | #1860 | `aa14e865` | success | success | success |
| 5 | #1864 | `e99aa2d4` | success | success | success |
| 6 | #1870 | `874c589b` | success | success | success |
| 7 | #1878 | `c469facb` | see below | see below | see below |
| 8 | #1883 | `56245296` | success | success | success |
| 9 | #1888 | `e6eadadc` | success | success | success |
| 10 | #1893 | `2518b429` | success | success | success |
| 11 | #1899 | `7030eb18` | success | success | success |
| 12 | #1909 | `a961bec0` | success | success | success |

Merge-group CI succeeded on every merge. Row 7's push runs were superseded 77 s later by quarantine
PR #1879 (`d06974d`). A CI dispatch on `c469facb` succeeded (41247810144). On `d06974d`,
configured-suite 41247602152 failed in shard 4 before any test ran: the local Supabase stack could
not bind port 54322 (#1865). The next landing that included row 7 (`5624529`, row 8) passed
configured-suite. That is reconciled as infrastructure, not a row 7 defect.

## Rehearsal on current main (`b2f335f`)

Every row's own checks, run again by this worker on one tree, plus one probe no row builder wrote.
Rows 1 and 2 are records and fixtures. Their bytes are what rows 3 to 12 consume, so they are
rehearsed through those checks.

| Covers rows | Check | Result |
|---|---|---|
| 4, 7 | `node --test scripts/jev-svg-contract.test.mjs` | 24/24 pass |
| 3 | `node --test scripts/jev-svg-baseline.test.mjs` | 19 pass, 1 skipped: the text comparison runs only on the recorded Chromium 149; this image has 153, so CI compares it |
| 5 | `node --test scripts/jev-svg-apply.test.mjs` | 12/12 pass |
| 6 | `node --test scripts/import-drop.test.mjs` | 11/11 pass |
| 8 | `node --test scripts/imported-match-clock.test.mjs` | 5/5 pass |
| 9, 11 | `node --test scripts/imported-clock-wire.test.mjs` | 8/8 pass |
| 9, 11 | `node --test scripts/air-state.test.mjs` | 27/27 pass |
| 10, 11 | `node --test scripts/clock-target.test.mjs` | 19/19 pass |
| 12 | `node --test scripts/imported-score-event.test.mjs` | 12/12 pass |
| 3, 12 | `node --test scripts/svg-import-passes.test.mjs` | 18 pass, 4 fail (inventory, bind, emit, runtime records): the known #1647 image difference that rows 3, 5, 8 and 9 recorded. push CI on `a961bec` passed it on the pinned browser |
| 12 | `node scripts/check-catalog-emit.mjs` | PASS, 528 designs equal to baseline |
| 6, 7, 8, 10, 11, 12 | `e2e/jev-svg-preparation.spec.ts`, `e2e/import-svg-behaviour.spec.ts`, `e2e/playout-clock.spec.ts` through the job queue | 61/61 pass (4.5 min), job j-0001 |
| 5 to 12 | `e2e/import-svg.spec.ts` through the job queue (quarantined, so no PR gate reads it) | 66 pass, 2 fail (job j-0002); the two alone on the same commit pass (job j-0003). A fail-then-pass on one commit, so flakes: filed as #1915 (P3, area:e2e) |
| 9, 12 | `e2e/configured/scorebug-output.spec.ts` | not run here (needs the local Supabase stack). configured-suite passed on `a961bec` and `b2f335f` |

**An independent probe on a fixture no builder used.** Every score+clock test in rows 8 to 12 uses
`score-clock-1.svg`. This worker ran row 12's two-output harness on `score-clock-3.svg`, a frozen
row 2 fixture that none of them used. It is built to mislead: a text layer with the id `timer`
reads "TOURNAMENT 24", and its "19:30" is labelled as a next fixture time. Only fixture-specific
inputs changed: the team names and figures (Amber 3, Indigo 4), the bound field ids (`f2`, `f4`)
and the expected figures that follow from them. The run used a count-up clock and one flash group
per team, added in memory as row 12 does. All 12 tests passed: an award, corrections, illegal
events, clock rows against scores, catch-up, bound figures, snap, the interpreter wrap, and the
three surface send outcomes. The probe file was deleted after the run and is not in this PR.
Row 12's harness cannot identify `score-clock-2.svg`'s two figures, because both show `0`, so
that fixture was not probed.

## Follow-ups, reconciled on 2026-11-01

All were read again just before this PR. "Later row" means a row whose file list could repair the
cause. Rows 29 and 38 only test: they will run into a cause but cannot change it.

| Issue | Labels | What is open | Later row that can fix it | Will run into it |
|---|---|---|---|---|
| #1908 item 2 | P2, area: output | A score board rebooted from its report shows the flag up but no team's flash. Items 1 and 3 were fixed in row 12 | none: the report's shape (`output/main.ts`, receivers) is outside every row | 29, 38 (output recovery) |
| #1886 | P2, area:playout | Imported clock Take or correction on the hosted fast road is stamped by each output's arrival | none | 29 (hosted clock recovery) |
| #1887 | P2, area:playout | Exported control panel and production controller send imported clock verbs without a wire stamp | none | 29 (exports) |
| #1890 | P2, area:playout | Second half fixed by row 11. First half moved to #1903. Still open because the `Closes` line was in an early branch commit | closed in this row (completed): nothing left in it | n/a |
| #1891 | P3, area:playout | Moved whole to #1906. Still open for the same reason | closed in this row as a duplicate of #1906 | n/a |
| #1903 | P3, area: control | A Reset or Pause before a duration's first Take keeps the old length | none (row 9 owned `matchClockWire.ts`) | 38 |
| #1906 | P3, area: control | The program monitor forgets an off-air imported clock on reload | none (`hostedControl.ts`) | 38 |
| #1884 items 1, 2 | P3, create | 1: should an off-air Take count the clock's length or the field's last sent value? An owner product decision. 2: the clock's text is not re-fitted as it ticks (`svg.ts` `importedClockJs`) | 1: owner. 2: row 24 lists `svg.ts`, but for linked data only; fixing it there would need a reconciled boundary | 38 |
| #1898 | P3, area: control | An undated target passing into a DST fold before the build counts to 0:00 | none (row 10 owned `clockTarget.ts`) | none |
| #1889 | P3, area:playout | Native scorebug clock: a score Update after a Pause pulls the clock back. Native, not imported | outside this plan | none |
| #1897 | P3, area:e2e | The export window sometimes takes over 7 s to open under load | outside this plan (test infrastructure) | 29 |
| #1865 | P3, ci, area:e2e | The configured suite's local Supabase stack sometimes fails to start (port in use). One start retry exists | cicd-improvement run | every row with a configured selection |

Also read, as row 1 asked: #1833 (question fit changes after attaching quiz behaviour) is still open
and unlabelled. Rows 14 and 15 own `quiz.ts` and should read it first. Quarantine PR #1834 for
`e2e/import-svg-corpus.spec.ts` has been open since 2026-10-30, but that spec is no longer in
`e2e/quarantine.json` (it is in the release history), so the PR looks stale. It belongs to
cicd-improvement and was not touched here.

**A gap in the gates, recorded rather than worked around.** `e2e/import-svg.spec.ts` (68 tests,
the main import spec) has been quarantined since 2026-10-31T22:01Z, between rows 7 and 8, with
five entries. Quarantine incident #1907 records it: changes to `src/templates/**` and
`src/components/wizard/import/**` merge without it blocking. Its repair is due 2026-11-14, the
day this run ends, and cicd-improvement owns it. Rows 8 to 12 landed while it was out of the
blocking gate, and most of rows 14 to 27 change the same code. This row reran it above: 66 of 68 passed, and the two failures were flakes (#1915). Until it is
released, each row touching import or behaviour code should run it locally through the queue as
part of its targeted checks. That restores no gate and changes no limit.

## Spend evidence

- Paid calls: zero. Cumulative inference spend: $0 of the $5 ceiling ($2 development, $3
  holdout), unchanged since run start.
- `src/ai/svgInterpretation/` holds only `contract.ts`, `validate.ts` and `apply.ts`. None of them
  calls a provider. The server decision adapter is row 31, and the paid rows are 33 and 34.
- `jev-svg-qualification.yml` is the only workflow that reads the evaluation environment. It ran
  twice in the window, both times on main: 41196682798 (`0b4e403d`) and 41204801130 (`7f0a00ba`).
  Each ran its one job, which checks the sealed archive digest and makes a free GET to
  `/v1/credits`. Neither asked for inference.
- The Gateway balance was not read again here (that needs the protected key). Readiness recorded
  6.94 on 2026-10-31 with automatic top-up off, about $1.94 above the ceiling. Row 32's receipts
  count other consumers' spend conservatively, as the spec designs.

## Remaining scope (rows 13 to 40)

Order, file lists and checks are as registered in `phases.json`; nothing here changes them.

- Quiz: 14, 15. Credits: 16 to 23. Linked data and ticker: 24, 25. Preservation and reimport: 26
  to 28. Exports and hosts: 29. Naming docs: 30.
- Model route: 31, 32 (mocked, no paid call), 33 and 34 (paid, protected main-only Actions,
  $2 and $3 caps), 35 to 37. A no-go verdict keeps the route off and the later rows still run.
- Journey, matrix and release: 38 to 40.
- Criteria not yet accepted by any row: AC-6, AC-7, AC-12 to AC-19, AC-22 to AC-26, and AC-11
  until this row lands.

## Decisions and traps

- **Nothing was fixed.** The row allows acceptance records only. The only new failures (#1915)
  are flakes in code that predates the run. Their issue names the quarantine owner (#1907), not a
  row, and says the drag one may be a discarded-gesture defect worth fault injection. Closing #1890 and #1891 here is tidying, not a fix: each one's
  own comment already said what was left and where it moved, and the close comment points there.
- **The quarantined import spec was rehearsed, not released.** Releasing it belongs to
  cicd-improvement (#1907). Running it here gives evidence without touching the quarantine.
- **The probe reused row 12's harness rather than a new one,** with only the fixture inputs
  changed. A probe that shares no code would re-derive the same outputs and test nothing new. A
  fixture the builders never saw tests whether their rules depend on `score-clock-1.svg`.
- Trap: `node scripts/jobs.mjs add` refuses a second broader job on the same source state. Commit
  between broader selections, or fold them into one.
- Trap (#1647, still true): `svg-import-passes` fails four records on this image's Chromium 153.
  Read CI on the pinned browser, and never re-record on this image.

## Revert

Docs only. On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-13-build')"
