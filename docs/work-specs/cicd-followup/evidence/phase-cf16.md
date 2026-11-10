# Phase cf16: assess the coverage model for catalog narrowing

Plan run #1967 (cicd-followup), phase cf16. Builder session on branch
`claude/plan-cicd-followup-cf16-build`, from `main` at `74102c14a69818a3426323f01b83ff7a5da626c0`.
A study: this phase changes no workflow, selector, gate, budget, limit or test. It adds this file,
the per-landing records ([phase-cf16-records.json](phase-cf16-records.json)) and two read-only
scripts that rebuild them ([phase-cf16-collect.mjs](phase-cf16-collect.mjs),
[phase-cf16-analyze.mjs](phase-cf16-analyze.mjs)).

## Acceptance, verbatim

(a) "Whether merge-queue validation already gives equivalent evidence for each exact merged
revision is established."
(b) "Total CI cost and capacity are estimated for full validation of every exact merged revision
within 24 hours, with the capacity and monitoring needed to meet that deadline, with latency and
CI-minute tradeoffs reported both ways."
(c) "A recommendation: adopt that model, or keep full pre-merge coverage and optimize its
execution. Full pre-merge testing stays until cf18 qualifies."
(d) "This phase changes no coverage. Its recommendation is re-read against cf18's result before
cf19 acts on it."

## Summary

- **(a) Same commit, not the same coverage.** All 184 landings of 2026-11-03 to 11-10 were the
  exact commit of a green merge-group run: the queue moves `main` to the commit it tested, so the
  tree is identical, not merely equivalent. But that run is a pull-request-sized check. It ran
  the full E2E suite on 0 of 184, the configured (backend) suite on 0 (exempt by design), the
  whole-catalog gate on 77 (only when the change can move a design) and engine-floor on 0. It is
  equivalent evidence for no landing. After the merge, 127 landings got a green full E2E run on
  their own commit and 3 a red one. 54 got no complete full E2E run of their own: 33 runs
  cancelled themselves when superseded (by design), 1 run was red before every shard finished,
  and 20 landings reached `main` in the same push as the next one and so had no push run of
  their own.
- **(b) Validating every exact commit in full costs about 272 runner-minutes per landing, 82
  more than today** (15,150 over the window, 2,164 a day). Most of that, 75 per landing, closes
  gaps that exist today with or without narrowing (full E2E, configured suite and engine-floor on
  every exact commit); 7.1 is the whole catalog that narrowing itself moves after the merge.
  Narrowing saves at most 17.8 per landing pre-merge. So narrowing alone could save up to 10.7
  per landing, but the model the owner set for it (decision C, cf19(a)) costs at least 64.5 more.
  It fits the 60-job Team ceiling (about 10 jobs on average at the busiest day's rate) and meets
  24 hours with large margin (one run takes 19 minutes median, 38 at p95), but only with a new
  carrier that starts one run per landed commit, a per-commit ledger and an hourly alarm. The
  latency gain is small: the gate never set the pull request's critical path in cf03's after
  side, and it lengthened the merge-queue run only when it was the last job (10 of 35 runs, 2.5
  minutes median, 0.7 per landing on average).
- **(c) Recommendation: keep full pre-merge catalog coverage and optimize its execution.** Full
  pre-merge testing stays until cf18 qualifies, and cf19 re-reads this against cf18's result.
- **(d)** Nothing changed here. cf19 re-reads section 6 against cf18 before it acts.

## 1. Method and data

**Window.** Every landing on `main`'s first-parent line with a committer time from
2026-11-03T00:00Z to 2026-11-10T00:00Z: **184 landings**, all through the merge queue (38, 54,
26, 30, 7, 8 and 21 a day; at most 10 in one clock hour). The window is after ci04 put the
catalog gate on the merge group (2026-10-31) and before #2353 (2026-11-10).

**Data.** GitHub Actions history only, no log read. Run lists of `ci.yml` (merge group and push),
`configured-suite.yml` (push), `quarantine.yml` (push), `nightly.yml` and `catalog-gates.yml`,
and the jobs (every attempt) of every run whose `head_sha` is a landing, plus every nightly and
midday catalog run. Eleven passes of at most 100 API calls each; four stopped early on a GitHub
error (one logged as HTTP 502) and the next pass resumed from the cache. Completed runs' jobs are
cached; run lists are read again each pass. Runner-minutes are job start to end, every
attempt, a job a re-run attempt only copied counted once (cf03's rule). The cf03 per-merge
records ([phase-cf03-records.json](phase-cf03-records.json), 201 merges 2026-10-24 to 11-03)
supply the critical-path figures, and cf14 the pull-request catalog gate cost.

**Identity.** A run speaks for the commit it requested (`head_sha`), never for an ancestor
(the ci13 rule R2). A landing's time is its push run's creation; a landing without its own push
run takes the next landing's time (ci13 R1).

**Trap met.** The session checkout was shallow, and `git log --first-parent` silently listed 95
of the 184 landings. The collector now refuses a shallow clone.

**Rebuild.** From a full clone: `node phase-cf16-collect.mjs --since 2026-11-03T00:00:00Z
--until 2026-11-10T00:00:00Z --cache <dir>` until it prints COMPLETE (at most 100 calls a pass),
then the same with `--report > phase-cf16-records.json`, then `node phase-cf16-analyze.mjs`.

### What "full validation" of one commit means here

The checks that exist on some carrier today, read from the workflows at `74102c14`:

| Contract | Pull request and merge group (`ci.yml`) | Push to `main` (`ci.yml`, `configured-suite.yml`) | Nightly (`nightly.yml`, latest `main` only) |
| --- | --- | --- | --- |
| Build, unit and factory gates | every run | every run | |
| Offline E2E suite | the change's selection (`e2e-affected.mjs --integration`) | the full suite (`--all`), unless superseded (ci.yml:348-369 cancels a run whose commit `main` has passed) | the full suite |
| Configured (backend) E2E | the change's selection on a PR; **exempt** on the merge group (ci.yml:520-542) | the full suite on every pushed commit (`configured-suite.yml` groups by sha, never cancels) | |
| Whole-catalog gate (emit fingerprints and calibration tripwire) | when the planner raises the catalog flag | when the push's own diff raises it (`--catalog-since`) | every night |
| Type floor, overflow, field coverage, engine-floor | never | never | every night |

`catalog-gates.yml` also runs at midday on `main`: the battery `catalog-affected.mjs` plans for
what landed since its last green run (emit, catalog specs, type floor, overflow, field coverage,
numerals), scoped to those designs and without engine-floor. It is range evidence on a later
commit, like the nightly, and adds coverage on top of the full gates rather than replacing them
(ci16 section 2). 8 runs in the window, 22.9 runner-minutes each on average.

Catalog narrowing (ci16 section 4) would make the pre-merge catalog gate bench only the designs a
change can move. The owner's decision C asks that, if narrowing goes ahead, every exact merged
revision gets full validation within 24 hours. This phase prices that for the whole table (the bar
cf19(a) names) and, for comparison, for the catalog rows alone.

## 2. (a) What the merge-queue run already proves, per landing

| Reading (n = 184) | Count |
| --- | ---: |
| A `merge_group` run of `ci.yml` exists whose `head_sha` is the landed commit | **184** |
| Its `CI gate` passed | 184 |
| More than one merge-group run on that commit | 0 |
| Its E2E selection: subset / none / full | 127 / 57 / **0** |
| Its catalog gate: ran green / skipped (flag not raised) | 77 / 107 |
| Configured jobs in it | **0** on every landing |
| Engine-floor in it | 0 (no pre-merge carrier) |

The queue (ruleset `22389043`, merge method MERGE, build and merge up to 5 entries; phase-ci01.md
line 17) builds one temporary commit per entry on top of the entries ahead of it, tests it, and
moves `main` to that same commit. So every landed revision is exactly a tested revision, also when
several land in one push: none of the 184 needed an ancestry argument. That settles identity.

Coverage is the gap. The merge-group run is planned like a pull request: from the group's base,
so it selects what the change can affect. On no landing did it carry the full E2E suite, the
configured suite or engine-floor, and on 107 it did not run the catalog gate. **Merge-queue
validation is not equivalent evidence of full validation for any landing in the window.** It
is equivalent to the pre-merge selection, which is exactly what a narrowing would shrink.

### What ran on the exact commit after the merge

| Reading (n = 184) | Count |
| --- | ---: |
| Own `ci.yml` push run with the full suite, every shard finished | 130 (127 green, 3 red) |
| Own push run superseded and cancelled (by design) | 33 |
| Own push run red before every shard finished | 1 |
| No push run of its own (landed in the same push as the next landing) | **20** |
| Own `configured-suite.yml` run: green / red / none | 163 / 1 / **20** |
| Whole-catalog gate green on the exact commit (merge group or push) | 86 |
| Green full E2E **and** green configured suite on the exact commit | 127 (69%) |
| Engine-floor on the exact commit | 0 |

The 20 commits without a push run also have no configured-suite run of their own: GitHub fires
one `push` event per push, for its head commit, so when the queue merges two entries at once the
first is never pushed alone. This window has 33 superseded and 20 unpushed.

**Range coverage is quick; exact coverage is not universal.** Every landing was inside a green
full-E2E push run within 157 minutes (median 21, p95 65.5; the earliest-finishing green run on
it or a later landing), but that run tested a later tree. The
owner's decision C says a later run "does not prove that every intervening merge was tested". The
nightly is range evidence only, and its start drifted from the `00:20` UTC cron to 06:03 to 07:23
UTC on all nine nights.

**Duplicate work on the same commit.** On 52 landings the merge group and the push run both ran
the whole-catalog gate green on the identical commit: the push side spent 548 runner-minutes in
the week (3.0 per landing) answering the same question twice. That is the one place where the
merge queue already gives equivalent evidence: the same job on the same commit, unscoped. This
answers #2165 item 3 ("cf16 decides whether the merge group's run is equivalent evidence"): for
the catalog gate, a green merge-group gate on the landed commit is equivalent evidence for that
commit. It is not for the 9 landings where the push diff raised the gate and the merge group's
did not, nor for the 20 commits the push never ran on its own.

## 3. (b) Cost of validating every exact merged revision

### 3.1 Unit costs (window means)

| Part | Runner-minutes | n | Note |
| --- | ---: | ---: | --- |
| Full E2E push run, less its catalog gate | 195.1 | 130 | median wall time 18.6 min, p95 38.3 |
| Configured suite push run | 54.2 | 164 | |
| Whole-catalog gate job | 10.6 | 138 | merge group and push |
| Type floor, overflow, field coverage, engine-floor (nightly job) | 12.1 | 9 | the only engine-floor carrier |
| **One complete validation of one commit** | **272** | | |

### 3.2 Two models, one week (184 landings)

The pre-merge gate on pull request runs is not collected here; cf14 measured it at 13.4 per
landing on 2026-11-04 (n = 42 landings), and that figure is used as given.

| | Full pre-merge (today) | Post-merge model (decision C) |
| --- | --- | --- |
| Pre-merge catalog gate | whole catalog when flagged: 812 min on the merge group (4.4 per landing) plus 13.4 per landing on PR runs | scoped |
| Saved pre-merge, upper bound (a scoped run costing nothing) | | 17.8 per landing |
| Added post-merge, caused by narrowing: whole catalog on the 123 commits without it after the merge | | 1,304 (7.1 per landing) |
| Added post-merge, the rest of the per-commit bar: full E2E on 54 commits (10,535), configured on 20 (1,084), floor on 184 (2,226) | | 13,845 (75.2 per landing) |
| Net CI minutes per landing | 0 | **at least +64.5** (narrowing's own part: at best -10.7) |
| Merge-queue execution (M2) | unchanged | at most 0.7 min less on average; 2.5 min median less on the 29% of runs where the gate is last (cf03 after side, 10 of 35) |
| Ready to green checks (M1) | unchanged | about 0: the gate never set the PR run's end in cf03's after side (0 of 35); the configured selection does |
| Time to a full verdict on the exact commit | before merge for the catalog; 69% get full E2E and configured on their own commit after merge | after merge for everything: 19 min median, 38 min p95 when started at once; up to 24 h by contract |

The saving is an upper bound because a scoped bench still costs its setup. The bar's 75.2 is not
caused by narrowing: those gaps exist today under full pre-merge catalog coverage. They count
against the model because decision C and cf19(a) make full validation of every exact commit the
condition for narrowing, so adopting narrowing means paying them. Narrowing with only a
post-merge whole catalog per commit (the 7.1) would leave the 54 commits without their own full
E2E run and the 20 without their own configured run as today; that is not the model the owner
set, and it is shown only so cf19 sees where the cost sits.

**Graphics tier.** cf14 measured the catalog gate at 23.6 runner-minutes per landing against the
graphics tier's ceiling of 10 (2026-11-04, n = 42 landings), 10.2 of it on the merge queue and
the main push alone, and recorded the dated extension `cf14-catalog-gate-extension` to
2026-12-14 (phase-cf14.md, Result; #2165). Under the post-merge model the per-commit
whole-catalog run alone is 10.6 per landing, plus 12.1 for the floor job if it is counted in the
tier, so the model does not bring the tier under its ceiling. The full model also adds 5.9 per
landing to the backend tier (the 20 unpushed configured runs), which the weekly growth report of
2026-11-03 put at 164.7 of 117 per landing, 141% of its ceiling (phase-cf13.md section 1).

### 3.3 Capacity

- **Ceiling.** The organisation is on GitHub Team: phase-ci01.md measured at least 60 concurrent
  standard jobs with none waiting. In this window the landing-related runs alone (merge group,
  push, configured, quarantine, nightly, midday catalog; pull request runs not collected) peaked
  at 56 concurrent jobs (2026-11-03T12:55Z) and were at 20 or fewer for 74% of the time any of
  them ran. The 20-job figure still quoted in `ci.yml` comments is out of date.
- **Average load.** At the busiest day's rate (54 landings), full per-commit validation is
  54 x 272 = 14,688 runner-minutes, about 10 jobs on average over 24 hours. Of that, 4,446 is new
  (82.3 x 54), about 3 jobs on average: 5% of the ceiling.
- **Bursts.** 10 landings in one hour would ask for 2,720 runner-minutes in that hour, about 45
  jobs if all start at once, on top of pull request and queue runs. Started at once, that would
  delay the pre-merge runs everyone waits on. The 24-hour bound allows deferring: run the
  per-commit validations at low priority (one or two at a time, or in quiet hours), which still
  clears a 54-landing day in well under 24 hours (54 x 19 min wall is 17 hours serially, under 9
  with two at a time).
- **Deadline margin.** A validation that fails or dies needs a second attempt inside the bound.
  With a 38-minute p95 wall and deferral, a start within 20 hours of landing leaves room for one
  re-run.

### 3.4 What the carrier and its monitoring need

These are the conditions under which the 24-hour bound is real. None exists today; this phase
builds none.

1. **One run per landed commit.** A carrier triggered per landed commit, not per push: the push
   handler (or post-land) walks `before..after` on the first-parent line and requests one
   validation per commit, keyed by sha so nothing supersedes or cancels it (as
   `configured-suite.yml` already does). Today's `ci.yml` push run cannot be it: it cancels itself
   when superseded, and the unpushed commits never get one.
2. **Complete means complete.** Every contract of section 1's table reached success or failure
   on that sha, every shard present, the catalog unscoped; a cancelled, skipped or timed-out job
   leaves it incomplete (ci13 R4).
3. **A per-commit ledger and an hourly check.** `scripts/schedule-coverage.mjs` measures range
   coverage from the nightly; it would need an exact-identity mode that lists, for every landing,
   its own complete green run per contract and the oldest landing without one. Run hourly (a few
   runner-minutes a day) on `main`, not on a cron the carrier depends on: in this window the
   nightly, due at 00:20 UTC, started between 06:03 and 07:23 UTC.
4. **Alarms.** A landing with no validation requested within 1 hour (missed), a red or
   incomplete validation (failed: the culprit is that exact commit, no bisect), and any landing
   still uncovered at 20 hours (late, leaving 4 hours for a re-run). Each opens or updates one
   issue routed as #1951 routes the existing growth, age and quarantine alarms.
5. **Owner.** The primary owner is `miwco`, with the weekly owner session as backup (launch.md,
   decision A). Agents repair; they do not own the alarm.
6. **Rollback.** A red per-commit validation restores whole-catalog pre-merge scope until it is
   green again (ci16 section 4, the reversal).

## 4. Latency and CI-minute tradeoffs, both ways

| | Keep full pre-merge coverage | Narrow pre-merge, validate every exact commit after merge |
| --- | --- | --- |
| Merge latency | unchanged: M1 cap+cfg 14.6 min, M2 execution 11.7 (cf03) | M1 about the same; M2 execution 0.7 min less on average, 2.5 less where the gate is last (cf03 spread 0.62) |
| When a catalog regression is caught | before it reaches `main` | up to 24 hours after, with a revert of an exact commit |
| CI minutes | today's | at least 64.5 more per landing; narrowing's own part at best 10.7 fewer |
| New moving parts | none | per-commit carrier, ledger, hourly alarm, owner routing, rollback |
| Exact-commit full coverage | still 69% (section 2), unchanged | 100% by construction, if the carrier runs |

## 5. (c) Recommendation

**Keep full pre-merge catalog coverage and optimize its execution. Do not adopt the post-merge
model now.** Full pre-merge testing stays until cf18 qualifies.

Why:

1. The merge queue already proves identity, not coverage (section 2), so the model needs a new
   carrier and alarm; there is no existing evidence to reuse beyond the duplicate catalog gate.
2. It costs more CI minutes than it saves: at least 64.5 more per landing. Narrowing's own part
   could save up to 10.7 per landing, but only together with the per-commit bar the owner set,
   which costs 75.2. This reads "full validation" as the whole contract table (section 1), as
   cf19(a) does; if cf18 or the owner reads it as the catalog alone, this reason falls away, and
   reasons 3 to 5 still hold.
3. It buys little latency: the pull request's critical path is the configured selection, not the
   catalog gate, and the merge queue gains 0.7 minutes per landing on average.
4. It trades a pre-merge catch for a catch up to a day later on a branch that deploys.
5. It does not fix the graphics tier: the per-commit whole catalog alone exceeds the ceiling.

What would change the answer (cf19 re-reads these against cf18):

- cf18 qualifies **and** the pull request's critical path changes so the catalog gate sets it:
  if cf13's rank-1 candidate (more configured stacks per PR) or another change makes the
  configured selection shorter than the 11-minute gate, narrowing saves real M1, above the spread.
- The pre-merge gate cost grows (more landings that move a design, more superseded PR gate
  runs), so that the saving passes the per-commit carrier's cost.
- A per-commit carrier is built for another reason (for example to close the 31% of landings
  without their own green full E2E and configured run), so its cost no longer counts against
  narrowing. Then narrowing's own part, up to 10.7 fewer runner-minutes per landing and up to
  2.5 minutes off the merge-queue run where the gate is last, decides it, and adoption may then
  be worth it.

Optimizations of full pre-merge coverage, measured here:

1. **Do not run the whole-catalog gate twice on one commit.** On 52 of 184 landings the push
   run repeated a gate the merge group had just passed on the identical commit: about 3.0
   runner-minutes per landing, about 30% of cf14's 10.2 merge-queue-plus-push gate figure. The
   push run could reuse a green merge-group gate on the same sha and run it only where the push
   diff raised the flag and the merge group did not (9 landings). This keeps every commit's
   whole-catalog answer. It is #2165 item 3; changing what the push run runs is a workflow change
   with its own rules and review, not made here.
2. **Pull request heads re-running the gate.** #2165 item 1 measured 13.4 per landing (57% of
   the gate) on PR heads, 131.7 minutes of it cancelled by a newer push on 2026-11-04. That is
   the largest pre-merge cost that can shrink without narrowing anything.

## 6. (d) For cf19

This phase changed no coverage: no file outside this evidence folder. cf19 acts only on a
qualified cf18 PASS with still-current evidence **and** a recommendation, re-read against cf18's
result, to adopt the model. As written, the recommendation is not to adopt it, so unless cf18's
result or the conditions in section 5 change it, cf19 takes the no-activation outcome with full
pre-merge protection retained. cf19 should re-run the two scripts on a fresh window before
relying on any figure here.

## 7. Phase notes

- **Previous verified main SHA:** `74102c14a69818a3426323f01b83ff7a5da626c0` (PR #2355), its
  `ci.yml` push run 42846040050, configured-suite 42846039998, post-land 42846039919 and
  quarantine 42846039921 all green.
- **Revert:** `git revert -m 1 <merge commit of this PR>`; it removes only these evidence files.
- **Decisions.** The window is the last full week before #2353, after ci04 (n = 184). "Full
  validation" is the whole table in section 1, the bar cf19(a) sets; the catalog-only variant is
  reported beside it. The PR-run catalog cost is cf14's measured day rather than a fresh PR-run
  collection, to stay inside the 100-call passes. Capacity uses the measured Team ceiling (60),
  not the 20 in `ci.yml` comments.
- **Traps.** A shallow session clone made `git log --first-parent` list 95 of 184 landings with no
  error; the collector refuses one now (`git fetch --unshallow origin` first). Four passes stopped on
  GitHub errors; the cache let the next pass resume, and the final report pass made 2 calls.
