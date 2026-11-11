# Phase cf17: one bounded three-plan trial

Plan run #1967 (cicd-followup), phase cf17. Builder session on branch
`claude/plan-cicd-followup-cf17-build`, from `main` at `9afdd04df93279429089666e2fb399ddf10854ad`.
Stage 1 (this file, before execution): the cohort, the success criteria, the stop thresholds and
the resource and spend ceiling. It changes no workflow, gate, budget, limit or test, and turns
nothing on. Stage 2 (a second PR) records the trial, or that it did not run, against these
criteria.

## Acceptance, verbatim

(a) "Before execution, the brief names the three plans and their work, each already authorized in
`plan-run.md`'s Runnable plans, together with the success criteria, the stop thresholds for
contention and failure rate, and a resource and spend ceiling within existing capacity and budget
constraints. If fewer than three such plans can run when cf17 starts, the coordinator asks the
owner once on the run issue, recommending a cohort. If no cohort is authorized within 7 days, the
phase records the trial as not run, with the reason, and PASSES; permanent three-plan concurrency
stays off, and cf20(b) reports decision E as open."
(b) "One bounded three-plan trial measures completed work per unit time, queue delay, contention,
retries and CI cost, and stops if contention or failure rates cross the thresholds written in
(a)."
(c) "Permanent three-plan concurrency is enabled only if the trial meets the success criteria
written in (a)."

## 1. The cohort

**First choice, could not run.** Owner decision, 2026-11-10T17:31Z (#1967, comment 6774413052):
"vMix + interaction + editor (Recommended)", one bounded window of about 3 days. Read again at
2026-11-10T17:35Z, none of the three could run a phase: interaction had finished at 15:19Z (#2312,
6 of 6 phases passed, issue closed; giving it new work to fill the window is forbidden), vMix
(#2289) was blocked waiting for the owner's authorization on V2's remaining findings, and
editor-r1-5 (#2295) was blocked since 2026-11-08 on Windows device work (a native file picker and
download check). Under (a) the coordinator asked the owner once on #1967.

**The cohort, owner answer verbatim** (#1967, comment 6774704765, 2026-11-10T17:43Z): "I will try
to run some planned runs here at the same time. If it doesn't work out tonight, then we can record
it as not run. I will start a new run now called live-publishing and continue VMix and editor runs
if I have enough RAM."

| Plan            | Runnable plans entry                                                                                                                                                                       | Run issue                                                | Work in the window                                                                   | Coordinator                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| live-publishing | `live-publishing` (`docs/work-specs/live-publishing/`, phase 1 is `retire-hosted-control`); preparation-only until the owner says start, and the owner said at 17:43Z they are starting it | the run issue its coordinator opens (none yet at 17:50Z) | its phases in `phases.json` order, from phase 1                                      | the owner's machine                                |
| vMix            | `vmix` (`docs/work-specs/bridge-vmix-adapter/spec.md`)                                                                                                                                     | #2289                                                    | V2 (draft #2293), then V3 onward, after the owner authorizes V2's remaining findings | a Codex coordinator on the owner's Windows machine |
| editor-r1-5     | `editor` names `docs/EDITOR_REBUILD_PLAN.md`, whose R1.5 this run carries out; the run's own spec (`docs/work-specs/editor-r1-5/`) is **not on `main`**                                    | #2295                                                    | E1 (blocked on the Windows file picker), then E2 onward                              | a Codex coordinator on the owner's Windows machine |

None of the three coordinators is a Claude Code Cloud session the cf17 builder can message. So
the builder watches from GitHub only (the run issues, the runs' PRs and Actions history), and a
stop is a message to the cicd-followup coordinator, which tells the owner on #1967; the owner
pauses the runs.

**When the trial starts, and its bound.** The trial starts when all three are running: each has
a phase in flight, shown by its run issue's heartbeat or a pushed branch or PR of that phase. If
they are not all running by 2026-11-11T06:00Z (the end of "tonight", the coordinator's bound),
stage 2 records the trial as not run, with the reason, and cf17 passes under (a): permanent
three-plan concurrency stays off and cf20(b) reports decision E as open.

## 2. What is measured, and the solo reference

Each figure comes from GitHub Actions history and `main`'s merge commits, with n stated, using
cf03's definitions (phase-cf03.md section 1) and its comparability rule and spread (section 5).

- **Completed work per unit time (W).** Phases landed per plan per window day: a phase counts when
  its build or repair PR merges and its independent check records PASS. A repair PR of the same
  phase is not a second phase.
- **Queue delay (Q).** Queue to landing of each trial PR, from its first merge-queue entry to its
  merge, so a requeue never restarts it: the clock the existing limit uses (`queueClock` in
  `scripts/growth-controls.mjs`). cf03's M2 (from the last entry, section 1) is reported beside it
  with its waiting and execution parts, and M1 of each landing by cf03 group.
- **Contention (C).** For trial PRs: merge-queue removals that were not the PR's own failure (a
  conflict, or a combined-tree failure caused by another PR in the group); merges of `origin/main`
  into a trial branch forced by a conflict with another trial plan's landing; jobs of a trial run
  queued more than 10 minutes for a runner; and the peak of concurrent jobs repository-wide.
- **Retries (R).** M4: the share of trial landings with a fail-then-pass or hang job (cf03
  section 3.4), plus re-run attempts and post-landing failures per PR (cf21's
  `phase-cf21-review.mjs` counts).
- **CI cost (K).** M3 per trial landing, and each tier's runner-minutes per landing over the
  window's landing runs (pull request, merge group and main push), computed the way the weekly
  growth report computes `perLanding` (`scripts/growth-report.mjs`). Per day is per landing times
  landings per day plus the tier's scheduled minutes, as the report's aggregate line computes it.

**Solo reference, per plan.** A plan's recent rate is its phases landed per day over its own last
run segment with one plan phase in flight, from its first launch to its last landing, with n:

| Plan            | Segment                             | Phases landed (n) | Rate                          |
| --------------- | ----------------------------------- | ----------------: | ----------------------------- |
| live-publishing | none: a new run, started 2026-11-10 |                 0 | none                          |
| vMix            | 2026-11-08 to 2026-11-10T17:35Z     |     1 (V1, #2291) | 0.4 per day, blocked since V2 |
| editor-r1-5     | 2026-11-08 to 2026-11-10T17:35Z     |                 0 | 0, blocked on E1              |

For comparison, interaction, which finished just before cf17, landed 6 phases in 27.4 hours
(2026-11-09T11:16Z to 2026-11-10T14:41Z, cicd-followup beside it): 5.3 per day.

A plan whose reference n is below 3 phases has no usable solo rate: its W is reported, not judged,
and the trial cannot meet S1 for it. None of the three plans has such a reference today, so this
trial can at best give operating evidence on S2 to S6: unless S1 can be judged, permanent
three-plan concurrency stays off whatever the other figures show. This is stated before the trial
starts so nobody reads its result as a near miss.

## 3. Success criteria (all must hold to enable permanent three-plan concurrency)

Taken from cicd-improvement AC-6 (the target that authorized spec set for a three-plan cohort) and
the existing timing limits in `scripts/growth-ceilings.json`; none is new or looser. A criterion
that cannot be judged (too few samples for its test, or data missing) counts as not met.

- **S1, completed work.** Combined W over the window at least 2x the matched serial rate (the
  mean of the three plans' solo rates), and each plan's W at least 0.8x its own solo rate (no
  starvation). Each plan has a solo reference with n of at least 3 and lands at least 3 phases in
  the window (AC-6 asked for four rows per plan; three is the minimum that makes a rate).
- **S2, queue delay.** Trial PRs' queue to landing (Q, first entry to merge) p50 at most 10 and
  p90 at most 20 minutes, and none over 30 (`timing.queue` and its per-item age, AC-6's
  queue-to-landing limit); M1 median per cf03 group no more than 25% above cf03's reference median for
  that group (section 5.1), each trial landing's group needing at least cf03's minimum n (below
  it, S2 cannot be judged).
- **S3, contention.** No starvation (S1); no duplicate repair owner and no admission before a
  prerequisite PASS in any of the three ledgers; at most one contention event per 10 trial
  landings, and none left unrecovered; the repository-wide peak stays under 57 concurrent jobs
  (95% of the measured 60-job Team ceiling, `refuseShare`).
- **S4, retries.** M4 share of trial landings not higher than cf03's side A (5 of 34) by a
  one-sided Fisher exact test at p below 0.05 (cf03's own M4 test); no post-landing failure on
  `main` caused by a trial landing.
- **S5, CI cost.** M3 per trial landing within cf03's spread of its group's reference median, and
  no tier's runner-minutes per landing over the window (K) above that tier's `perLanding` in the
  last weekly growth report before the window (the backend and graphics tiers are already over
  their per-landing ceilings; the trial may not add to that).
- **S6, pause and resume.** At least one coordinator pause and resume happens or is exercised in
  the window without losing a phase's state (AC-6).

## 4. Stop thresholds

The cf17 builder measures at least every 6 hours from Actions history and the runs' PRs.
Crossing either line stops the trial: the builder messages the cicd-followup coordinator, which
tells the owner on #1967, and the owner pauses launches in all three runs (in-flight PRs keep their
repair owner). The builder records the reason and the figures in stage 2.

- **Contention.** Any of: two contention events (section 2, C) within 24 hours; trial landings'
  queue to landing (Q) p90 above 20 minutes over a rolling 24 hours with at least 5 landings; any
  trial PR in the queue over 30 minutes (the existing per-item age alarm); any required
  check of a trial PR queued more than 30 minutes for a runner; the repository-wide peak reaches
  57 concurrent jobs.
- **Failure rate.** Any of: M4 share of trial landings at or above 2x cf03 side A (29%) with at
  least 5 landings; two post-landing failures on `main` attributed to trial landings; any
  quarantine added because of a trial landing.
- **Spend.** The per-phase spend line in section 5.

## 5. Resource and spend ceiling

Inside existing capacity and budgets. No ceiling is raised, no exception or extension is written,
and nothing is bought.

- **Actions.** Standard GitHub-hosted runners only (the repository is public, so they are not
  billed). Each tier's runner-minutes per landing stay at or below the last weekly growth report's
  `perLanding` (S5), and total runner-minutes per day (K) stay inside
  `envelopeRunnerMinutesPerDay` (28,800).
  Concurrent jobs stay under 57 (section 4).
- **Sessions.** Each plan keeps its own procedure: one coordinator and at most one phase in flight
  (build, repair or check), plus that phase's reviews. No extra builders are started for the
  trial, and no second coordinator. The trial adds no Claude Code Cloud session beyond this
  builder's monitoring.
- **Spend.** The three runs use the owner's own machine and existing subscriptions: no API key,
  paid overage or new plan is added for the trial. Where a run reports session cost, a landed phase
  may cost at most 1.25x the one measured figure, interaction's about $80 per phase (about $400
  over 48 sessions for 5 phases, #2312 retro note of 2026-11-10): above $100 per landed phase for
  two phases in a row is a stop. A subscription usage limit reached is recorded, not worked around.
  This builder's monitoring is bounded to 100 GitHub API calls per pass.
- **Window.** One bounded window: from the moment all three are running (section 1) for at most
  72 hours, or shorter if the owner ends it. No extension.

## 6. Status

**Result: the trial ran for 21.6 hours and was ended early by the owner. Permanent three-plan
concurrency stays off.** Stage 1 landed before the trial counted (#2359, merged
2026-11-10T18:05Z). Stage 2 is section 7. **Addendum (section 8): the trial did not stop when two stop lines
were crossed, and the owner ended it on a status that said none had been; the owner closed cf17
with the missed stop recorded.**

## 7. Result (stage 2)

### 7.1 The window

- **Start:** 2026-11-10T19:38:54Z, when the last of the three runs showed a phase in flight
  (editor-r1-5 heartbeat on #2295; vMix and live-publishing were already in flight, #2289, #2361).
- **End:** 2026-11-11T17:17:33Z, ended early by the owner (#1967, comment 6802438629). The owner
  was told the trial cannot turn on permanent concurrency (S1 cannot be judged, section 2) and that
  ending it lets cf22 start about two days sooner. Answer, verbatim: "ok, end the trial". Only the
  measurement stopped; the three runs on the owner's machine were not paused.
- **Measured with** [phase-cf17-measure.mjs](phase-cf17-measure.mjs) over the whole window: 375
  workflow runs, the jobs of every one read, 9 trial PRs and their timelines, and the
  `e2e/quarantine.json` commits. Output: [phase-cf17-records.json](phase-cf17-records.json).
  Passes ran at 01:36Z, 06:05Z, 12:05Z and 17:20Z, each under 100 API calls.

### 7.2 Figures

| Plan | Phases landed (merged build PRs) | PRs |
| --- | ---: | --- |
| live-publishing | 3 | #2362 (1), #2376 (2), #2380 (3) |
| vMix | 2 | #2293 (V2), #2368 (V3); V4 #2378 open at the end |
| editor-r1-5 | 3 | #2369 (E1), #2374 (E2), #2386 (E3) |

- **W, completed work:** 8 phases in 21.6 hours, 8.9 a day combined. A phase is counted when its
  build PR merged; the runs' independent checks are recorded on the owner's machine and were not
  read.
- **Q, queue to landing** (first queue entry to merge, n = 8): p50 13.8, p90 18.2, max 18.2
  minutes. No PR was removed from the queue before merging. cf03's M2 split into waiting and
  execution, and M1 by cf03 group, were not computed (section 2 asked for them beside Q).
- **C, contention:** 0 dequeues; merges of `origin/main` into a trial branch forced by another
  trial plan's landing not measured; longest wait of a trial job for a runner 2.0 minutes;
  **repository-wide peak of 60 concurrent jobs at 2026-11-11T12:38:00Z**. Of the 60: 16 from
  editor E2's landing on `main` (CI 43020316776, configured suite 43020316884, code scan), 13 from
  live-publishing phase 3's PR (CI 43021936320 and its code scan), 31 from non-trial PRs (CI and
  code scans, 23 of them one growth-gate PR's CI run).
- **R, retries:** by cf03's job definition, 0 of 8 landings had a fail-then-pass job, and there was
  1 real re-run attempt: live-publishing phase 3 (#2380), run 43050146650, where attempt 2 re-ran
  E2E 11/15 after it failed and that re-run was cancelled (Reviewed-only re-runs after the stamp are
  review wait). Hangs (a job ending at its timeout cap) were not detected by the script. But two landings' own main
  push runs met a flaky spec that the quarantine route then recorded:
  `e2e/configured/operator-outage-not-unpublished.spec.ts`, quarantined 2026-11-11T02:40:17Z
  (d3777803) from editor E1's configured-suite run 42945843116, and `e2e/output-debate-clock.spec.ts`,
  quarantined 12:47:48Z (2e254476) from editor E2's CI run 43020316776, which failed E2E 15/15 and
  is the one red post-landing run of the window. E2 changed `src/model/animLoopClock.ts` and
  animation timing, so a link to the debate-clock flake is plausible; E1 and the configured outage
  spec look unrelated. Neither cause is established.
- **K, CI cost per landing** (every run in the window of the 8 landed trial PRs, their merge groups
  and main pushes, n = 8; the open V4 PR #2378 and runs before the start are left out): offline
  854.5, backend 258.2, graphics 51.1, overhead 91.0 runner-minutes. The last weekly
  growth report before the window (2026-11-09, run 42647874522, evidence partial, so its figures
  are lower bounds): offline 375.6, backend 148.2, graphics 25.2, overhead 93.4. M3 per landing:
  median 634, range 588 to 2,688.
- **Spend:** no run reported session cost on GitHub; not measured.

### 7.3 Stop lines

Both were crossed, and neither was raised in time:

- **Failure rate**, "any quarantine added because of a trial landing": on its wording, at
  02:40:17Z (first quarantine) and again at 12:47:48Z. The script did not read quarantines until
  the final pass, so the 06:05Z and 12:05Z passes reported no stop. That was a gap in the
  measurement, now fixed in the script (section 4b of it).
- **Contention**, a repository-wide peak of 57 jobs: reached at 12:38:00Z, between the 12:05Z pass
  and the next one due at 18:05Z. With the stop rule's 6-hour cadence, it would have been raised
  at 18:05Z; the owner ended the trial at 17:17Z.

Both were reported to the coordinator after the final pass, for the owner, because the three runs
keep running side by side.

### 7.4 Each criterion

| Criterion | Result | Why |
| --- | --- | --- |
| S1 completed work | not met | cannot be judged: no plan has a solo reference with n of at least 3 (section 2) |
| S2 queue delay | not met | queue to landing p50 13.8 against at most 10; M1 by cf03 group not computed (cannot be judged) |
| S3 contention | not met | repository peak 60, at or above 57; repair-owner and admission rules in the three ledgers not read |
| S4 retries | not met | one post-landing failure on `main` (#2374's push run); M4 by cf03's definition 0 of 8, but two quarantines followed trial landings |
| S5 CI cost | not met | per-landing minutes above the last report's in three tiers (offline 855 against 376, backend 258 against 148, graphics 51 against 25); overhead 91 against 93 is below; M3 by cf03 group not computed |
| S6 pause and resume | not met | not exercised in the window |

### 7.5 Decision

Permanent three-plan concurrency is **not** enabled (acceptance (c)): no success criterion is met.
Nothing in `plan-run.md` changes; plan runs of different plans may still run side by side as
before, with no three-plan setting turned on. For cf20(b): decision E's trial ran, ended early by
the owner after 21.6 hours with 8 landings, and showed no benefit it could measure. Small samples
are operating evidence, not statistical proof.

What it does show, for whoever plans concurrency next: at three plans plus ordinary work the
repository reached the 60-job ceiling once, and landings queued about 14 minutes (over the
10-minute target, inside the 20-minute p90). Per-landing CI cost was above the last weekly report
in three tiers, but that compares large plan phases with the repository's average landing (#2362
and #2380 each above 2,000 runner-minutes over 14 and 18 PR CI runs), so it reflects the size of
these phases; it does not show that running them together raised cost.

### 7.6 Phase notes

- Previous verified main SHA: `27d50cc14fffffdabaa4df70adf0ed65bb3105c2` (result branch base).
- Revert: `git revert -m 1 <merge sha>` (evidence and a read-only script only).
- Decisions: the window ended at the owner's decision time, 17:17:33Z, not at the next pass.
  Quarantines count against the failure-rate line on its wording, with the cause stated as
  unestablished, rather than being excused. Unread ledger rules and uncomputed cf03 groups count
  as not met (section 3).
- Traps: a re-run attempt copies jobs with their original end times, and skipped jobs can carry a
  start after their end; GitHub logs a queue removal about a second before each merge. A
  6-hour measurement cadence can miss a short peak by hours; a stop line that matters for a
  running system needs a check that runs when the event happens (the quarantine route and the
  weekly report already do).

## 8. Addendum: the missed stop

Added after the independent check of the result (#2390, merge `ada1c781`) failed criterion (b)
([checker comment](https://github.com/NoaCG/NoaCG-Studio/pull/2390#issuecomment-6803951305)).
Sections 1 to 7 stand as written; this section corrects how the trial ended.

- **Both stop lines were crossed while the trial ran, and the trial did not stop.** Failure rate:
  a spec was quarantined from a trial landing's own run at 2026-11-11T02:40:17Z
  (`e2e/configured/operator-outage-not-unpublished.spec.ts`, after editor E1 #2369) and again at
  12:47:48Z (`e2e/output-debate-clock.spec.ts`, after editor E2 #2374). Contention: the
  repository-wide peak reached 60 concurrent jobs at 12:38:00Z, against the 57 line. Section 4
  says crossing a line stops the trial; the runs were not paused at any of these times.
- **Why it did not stop.** The stop rule was checked by measurement passes every 6 hours
  (01:36Z, 06:05Z, 12:05Z, then the final pass). The script did not read quarantines until the
  final pass, so the 06:05Z and 12:05Z passes reported no stop although the first quarantine had
  landed at 02:40Z; and the 12:38Z peak fell between the 12:05Z pass and the next one. Both
  crossings were first found in the final pass at about 17:20Z, after the window had ended.
- **The owner ended the trial on a wrong status.** The coordinator's status, on which the owner
  ended it ([#1967, comment 6802438629](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6802438629)),
  said: "After about 18 hours it had 3 landings and no stop limit crossed." By then 8 phases had
  landed and both lines had been crossed. The coordinator corrected it on #1967
  ([comment 6803963699](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6803963699)).
- **The owner's decision**, 2026-11-11, verbatim
  ([#1967, comment 6804043344](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6804043344)):
  "Record missed stop, close (Recommended)". The option read: "the trial is closed with the missed
  stop and its cause recorded as a finding for cf20. No re-trial, since a re-run still could not
  turn three-plan running on (no solo baseline). cf22 starts right away."
- **What follows.** No re-trial. Permanent three-plan concurrency stays off. For cf20(b): decision
  E's trial ran, its stop lines were crossed and missed, and the cause (6-hourly passes;
  quarantines not read until the final pass) is a finding. A stop line meant to protect running
  work needs a check that fires when the event happens, not a periodic pass.
