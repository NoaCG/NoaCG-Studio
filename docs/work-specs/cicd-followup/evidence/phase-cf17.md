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

## 1. The cohort the owner chose, and whether it can run

Owner decision, 2026-11-10T17:31Z (#1967, comment 6774413052): "vMix + interaction + editor
(Recommended)", one bounded window of about 3 days. Read again at 2026-11-10T18:00Z:

| Plan | Runnable plans entry | Run issue and state | Work left for the window | Coordinator |
| --- | --- | --- | --- | --- |
| interaction | `interaction` | #2312, **finished** 2026-11-10T15:19Z, 6 of 6 phases passed, issue closed | none: every phase has landed (#2314, #2315, #2321, #2330, #2338, #2341, #2343, #2349) | cloud session `session_017SdbwNbcWHHiCYRSNvTcqR`, no phase left |
| vMix | `vmix` (`bridge-vmix-adapter`) | #2289, **blocked**, no open block since 2026-11-10T16:01Z | V2 (draft #2293) to V8; V2 "waits for authorization to address the remaining findings" | a Codex coordinator on Windows (#2289), not a Claude Code Cloud session |
| editor | `editor` names `docs/EDITOR_REBUILD_PLAN.md`; the run is editor-r1-5, whose spec is not on `main` | #2295, **blocked** since 2026-11-08T20:18Z | E1 to E8; E1 needs a native Windows file picker and download check | a Codex coordinator on Windows (#2295) |

So when cf17 starts, none of the three can run a phase in the window: one has no work left and
two wait on the owner or on a Windows device. Giving interaction new work to fill the window is
forbidden (no filler work). Under (a) that is "fewer than three such plans can run": the
coordinator asks the owner once on #1967, recommending a cohort. Asked: see section 6.

## 2. What is measured, and the solo reference

Each figure comes from GitHub Actions history and `main`'s merge commits, with n stated, using
cf03's definitions (phase-cf03.md section 2) and its comparability rule and spread (section 5).

- **Completed work per unit time (W).** Phases landed per plan per window day: a phase counts when
  its build or repair PR merges and its independent check records PASS. A repair PR of the same
  phase is not a second phase.
- **Queue delay (Q).** M2 waiting time of each trial landing (merge group created to its run's
  first job start), and M1 of each landing, by cf03 group.
- **Contention (C).** For trial PRs: merge-queue removals that were not the PR's own failure (a
  conflict, or a combined-tree failure caused by another PR in the group); merges of `origin/main`
  into a trial branch forced by a conflict with another trial plan's landing; jobs of a trial run
  queued more than 10 minutes for a runner; and the peak of concurrent jobs repository-wide.
- **Retries (R).** M4: the share of trial landings with a fail-then-pass or hang job (cf03
  section 3.4), plus re-run attempts and post-landing failures per PR (cf21's
  `phase-cf21-review.mjs` counts).
- **CI cost (K).** M3 per trial landing, and runner-minutes per day per tier read the way the
  weekly growth report reads them (`scripts/growth-ceilings.json`).

**Solo reference, per plan.** A plan's recent rate is its phases landed per day over its own last
run segment with one plan phase in flight, from its first launch to its last landing, with n:

| Plan | Segment | Phases landed (n) | Rate |
| --- | --- | ---: | --- |
| interaction | 2026-11-09T11:16Z to 2026-11-10T14:41Z (27.4 h; cicd-followup ran beside it) | 6 | 5.3 per day |
| vMix | 2026-11-08 to 2026-11-10T18:00Z | 1 (V1, #2291) | 0.4 per day, blocked since V2 |
| editor-r1-5 | 2026-11-08 to 2026-11-10T18:00Z | 0 | 0, blocked on E1 |

A plan whose reference n is below 3 phases has no usable solo rate: its W is reported, not
judged, and the trial cannot meet S1 for it. That alone means the chosen cohort could not meet
the criteria even if it ran.

## 3. Success criteria (all must hold to enable permanent three-plan concurrency)

Taken from cicd-improvement AC-6 (the owner-approved target for this trial) and the existing
timing limits in `scripts/growth-ceilings.json`; none is new or looser.

- **S1, completed work.** Combined W over the window at least 2x the matched serial rate (the
  mean of the three plans' solo rates), and each plan's W at least 0.8x its own solo rate (no
  starvation). Each plan has a solo reference with n of at least 3 and lands at least 3 phases in
  the window (AC-6 asked for four rows per plan; three is the minimum that makes a rate).
- **S2, queue delay.** Trial landings' M2 waiting p50 at most 10 and p90 at most 20 minutes
  (`timing.queue`); M1 median per cf03 group no more than 25% above cf03's reference median for
  that group (section 5.1), judged only for a group with at least cf03's minimum n.
- **S3, contention.** No starvation (S1); no duplicate repair owner and no admission before a
  prerequisite PASS in any of the three ledgers; at most one contention event per 10 trial
  landings, and none left unrecovered; the repository-wide peak stays under 57 concurrent jobs
  (95% of the measured 60-job Team ceiling, `refuseShare`).
- **S4, retries.** M4 share of trial landings not higher than cf03's side A (5 of 34) by a
  one-sided Fisher exact test at p below 0.05 (cf03's own M4 test); no post-landing failure on
  `main` caused by a trial landing.
- **S5, CI cost.** M3 per trial landing within cf03's spread of its group's reference median, and
  no tier's per-day runner-minutes above its value in the last weekly growth report before the
  window (the backend and graphics tiers are already over their per-landing ceilings; the trial
  may not add to that).
- **S6, pause and resume.** At least one coordinator pause and resume happens or is exercised in
  the window without losing a phase's state (AC-6).

## 4. Stop thresholds

The cf17 builder measures every 6 hours from Actions history. Crossing either line pauses all
three runs: the builder messages each coordinator to pause launches (in-flight PRs keep their
repair owner), records the reason here and ends the trial.

- **Contention.** Any of: two contention events (section 2, C) within 24 hours; trial landings'
  M2 waiting p90 above 20 minutes over a rolling 24 hours with at least 5 landings; any required
  check of a trial PR queued more than 30 minutes for a runner; the repository-wide peak reaches
  57 concurrent jobs.
- **Failure rate.** Any of: M4 share of trial landings at or above 2x cf03 side A (29%) with at
  least 5 landings; two post-landing failures on `main` attributed to trial landings; any
  quarantine added because of a trial landing.

## 5. Resource and spend ceiling

Inside existing capacity and budgets. No ceiling is raised, no exception or extension is written,
and nothing is bought.

- **Actions.** Standard GitHub-hosted runners only (the repository is public, so they are not
  billed). Each tier's per-day runner-minutes stay at or below the last weekly growth report's
  value (S5), and total runner-minutes per day stay inside `envelopeRunnerMinutesPerDay` (28,800).
  Concurrent jobs stay under 57 (section 4).
- **Sessions.** Each plan keeps its own procedure: one coordinator and at most one phase in flight
  (build, repair or check), plus that phase's `/so` reviews. No extra builders are started for the
  trial, and no second coordinator.
- **Spend.** Each plan's reported session cost per landed phase may not exceed 1.25x its own solo
  cost per phase. Interaction's solo cost was about $400 over 48 sessions for 5 phases, about $80
  per phase (#2312, retro note of 2026-11-10); vMix and editor-r1-5 run on Codex and report their
  own. Over the 3-day window the ceiling is the sum, over the three plans, of solo rate x 3 days x
  1.25x solo cost per phase; crossing it is a stop.
- **Window.** One bounded window of 72 hours from the start message to the three coordinators.
  No extension.

## 6. Status

Stage 1 is written before any execution. The chosen cohort cannot run (section 1), so the trial
waits on one owner answer on #1967, asked by the coordinator with a recommended cohort. If no
runnable cohort is authorized within 7 days of that ask, stage 2 records the trial as not run,
with this reason, and cf17 passes under (a); permanent three-plan concurrency stays off and cf20(b)
reports decision E as open.
