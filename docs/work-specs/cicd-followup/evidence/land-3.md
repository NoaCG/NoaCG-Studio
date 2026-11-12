# Land-3: the nightly does not re-run a tree main already tested in full (Rules)

Owner, 2026-11-12 (run issue #1967, step 3): "Settle the full-run and nightly question. [...] The
answer should be one scheme, not two overlapping ones, with a stated and bounded window during
which a bad merge could sit on main undetected." The coordinator's recommendation, after this
builder's re-check (below): main's push run stays the one full-suite carrier, and the nightly skips
its E2E shards when that run is green on the same commit. The re-run watcher in the original
recommendation was dropped, and no alarm replaces it (coordinator, after the study's corrected
figures in PR #2420).

## Rules this change makes true

- R1. main's push run records the traced spec map (`NOACG_E2E_TRACE`) and uploads one
  `e2e-trace-<n>` per shard, beside the `blob-report-<n>` it already uploads. Pull request, merge
  group and dispatch runs are unchanged: the variable is empty there, which leaves tracing off.
- R2. A scheduled nightly, or a dispatch on main without `full_e2e`, looks for ci.yml's push run on
  main at its own commit. If that run is still going, it waits, up to 45 minutes.
- R3. It skips its E2E shards only when that run's `CI gate` job concluded `success`, it ran the
  full plan (`E2E n/N (full)` jobs), every one of those shards passed on its first run (a gate made
  green by the same-commit retry does not count: its reports still hold the first failure), every
  shard's blob report and trace is present, and quarantine.yml's push run on the same commit
  concluded `success` (ci.yml leaves the quarantined specs to it). Anything else (no run, a run
  still going after 45 minutes, a red, retried, cancelled or partial run, a missing artifact, a
  quarantine run that is missing or not green) runs the shards exactly as before.
- R4. When skipped, the report job merges that run's blob reports and traces, and the time budget,
  triage, traced map pull request and uploads (`nightly-report-json` included, so the next night's
  shard plan and budget comparison keep their input) work as before. The traced map names the push
  run as its source.
- R5. The catalog tripwire and the five catalog gates (engine floor included) always run.
- R6. The verdict counts skipped shards as a pass only when R3 held, and so does the landing
  coverage measurement (`scripts/schedule-coverage.mjs`, read by nightly-drift.yml): a night whose
  `covered` job succeeded with the plan skipped is complete. A `covered` job that fails or hits its
  cap falls back to running the shards: `plan` and `e2e` carry `!cancelled()`, because the implied
  `success()` reads every job upstream. No test, spec, check, limit or retry policy changes.

## Measured basis (2026-10-29..11-12, Actions API, re-verified by this builder)

- Nightly cost: 16 runs, mean 207 runner-minutes, of which the E2E shards 183 and the rest 24
  (plan, catalog, catalog gates, report, verdict). Skipping saves about 182 runner-minutes a night
  (the study's corrected figure, PR #2420; 183 here).
- Cost of recording traces on the push run, measured on the same commit both ways (nightly
  traced, push run untraced, first attempt of each test): 11-12 (08467b36) 11352 vs 10849
  test-seconds, +4.6%; 11-11 (6bbe6c1f) +1.1%. Per spec file the median ratio is 1.025 and 1.002,
  so the spread between files is runner noise. Push shards over 50 random green push runs (750
  shards): median 11.4, p95 14.6, p99 16.1 minutes, one at the 20-minute cap. Scaled by 1.046, or
  even 1.10, no further shard reaches the cap. So traces stay on, and the cap is not raised.
- 16 of 16 nightlies (15 scheduled, one dispatch) tested a commit whose push run on main was
  green. 12 of 16 found it already finished when they started; 4 (11-01 dispatch, 11-02, 11-10,
  11-12) started 4 to 14 minutes before it finished. Hence the bounded wait: with it, 16 of 16
  would have skipped.
- What the second sample caught: one nightly in 16 (11-04, 134413ba, run 41786048464) went red
  where the push run on the same commit was green: `e2e/imported-credits-live-data.spec.ts` failed
  once. The push run's own same-commit retry put it in quarantine on 11-06. So the skip gives up a
  second sample of an identical tree, which in this window found one flake two days early and no
  defect.
- Quarantined specs: the push run leaves them out of its shards and `quarantine.yml` runs them on
  every push to main; the nightly ran them inside its shards. A night is skipped only when that
  quarantine run is green on the same commit; they are then absent from the night's report and
  budget. Under the full rule (first-run green shards, green quarantine run, the 45-minute wait)
  all 16 nights of the window would still have skipped.
- Bad-merge window today (a landing to the first completed, not cancelled push run on main that
  contains it), 303 landings: median 18.8, p95 43.8, max 229.7 minutes (92e581a7). This change
  does not move it: the nightly is not in that window. The 229.7 case was not a cancelled run with
  nothing after it: attempt 1 of run 43092663612 had its `CI gate` conclude failure at 22 minutes,
  then the E2E retry job hung until a person re-ran it. Read per attempt, the study's corrected
  maximum is 74.0 minutes (PR #2420).
- The original watcher figure (about 14 re-runs a day) did not hold: of 40 cancelled push runs, 39
  without a verdict all had a newer push run created before they ended, and the 40th is the case
  above. Its gate had concluded.

Sources: `gh api repos/noacg/noacg-studio/actions/workflows/{nightly,ci}.yml/runs` per day,
`.../actions/runs/<id>/jobs` and `.../attempts/<n>/jobs` for job minutes and gate conclusions.

## What it gives up

The daily whole-suite sample without retries, on nights main's push run was green on that
commit. In this window it caught one flake (11-04) that the push run passed, two days before the
quarantine took the spec, and nothing else. The push run uses its same-commit retry; the nightly
does not. No spec loses a run on the landed tree.

## Rules-first review

Independent `/so` on head f7dfc7d5d: AGREE WITH CORRECTIONS, grade B. Answered: the landing
coverage measurement now accepts a covered night (R6, with a test), and `plan` runs when `covered`
fails. Not changed: `e2e/_trace.ts` still says its map is "the nightly's" (a comment). The review's
alternative to the capacity refusal, folding the lookup into `plan` with a 50-minute cap, would
remove the new job only by widening another job's limit; the refusal is reported instead (below).
Final `/so` on head 9224f4504: AGREE WITH CORRECTIONS, grade B. Answered: `e2e` now runs after a
failed `covered` job too (its implied `success()` read `covered` as well). The automated code
review on 9224f4504 raised two P2 findings: a gate made green by the retry, and quarantined specs
outside ci.yml's shards. Both are now conditions of R3.

## The capacity gate

`node scripts/e2e-capacity.mjs --changed origin/main` refuses this change in its overhead tier: it
prices the new `covered` job at 6 runner-minutes a day (140% of the tier's 95% line) and credits
nothing for the shards it skips. No budget exception is written (owner, 2026-11-12). It lands
after step 2c, which turns a still-correct refusal into a dated repayment item.

## Revert

    git revert <merge commit of this pull request>

One merge commit; ci.yml, nightly.yml and the two comments go back together. Until it lands, the
nightly runs its shards every night as before (no push run has `e2e-trace-*` artifacts yet).
