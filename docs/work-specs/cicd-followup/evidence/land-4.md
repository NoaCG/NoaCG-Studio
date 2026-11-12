# Land-4: one push per review round (Rules)

Owner, 2026-11-12 (run issue #1967, step 4): "Fewer runs per pull request. [...] propose how the
review loop can batch its fixes into one head before CI. [...] This is waste with no coverage loss,
so treat it as a straightforward win."

## Rules this change makes true

- R1. A worker fixes every finding of a review round, from every reviewer, in one push
  (`.agent-workflows/queue-merge.md`, cloud step 2).
- R2. A worker does not push while its head's CI is running; after it finishes red, one push fixes
  every failure it reported. The plan-run review loop (`docs/plan-runs/known-traps.md`, Review
  checkpoints) commits locally between rounds instead of pushing each fix as a backup.
- R3. A red run is read whole before a repair is pushed: every job finished, every failure
  collected, one push (`.agent-workflows/verify.md`, section 3).
- R4. CI still runs on every head pushed, with the same selection. No workflow, test, check, limit
  or retry policy changes.

## Measured basis (2026-10-29..11-12, Actions API)

| Figure | Measured |
|---|---|
| Pull request runs cancelled | 464 of 1018 (45.6%) |
| Follow-up heads pushed while the previous run was still going | 467 of 698 (66.9%), 320 branches, 3.18 heads per branch |
| Cost of a cancelled run | 77.5 runner-minutes, 19.8 jobs started (random sample of 60) |

How it is measured, so the two-week check compares the same thing: every `pull_request` run of
ci.yml, fetched per day with
`gh api "repos/noacg/noacg-studio/actions/workflows/ci.yml/runs?event=pull_request&created=<day>&per_page=100&page=<n>"`
until a page is empty; runs grouped by `head_branch` and ordered by `created_at`; a follow-up head
is a run whose `head_sha` differs from the previous run's on that branch; it was pushed mid-run
when the previous run's `updated_at` is no earlier than 5 s before the follow-up's `created_at`.
Job minutes from `.../actions/runs/<id>/jobs` (completed_at minus started_at). Pushes the rule does
not govern (Auto-fix, a merge of main) are counted too; the check names them if they dominate.

## Why a rule first, and the fallback

A draft-only CI (#2423, kept open as a draft and not queued) would cut more runs, but it puts the
last review round in series before the full CI, which adds waiting time, and the owner optimises
waiting time. The rule keeps CI on every head and removes only the pushes that cancel a running
run. Check after two weeks (2026-11-26) with the same query: if the share of follow-up heads
pushed while the previous run was still going has not fallen to half (33% or less), #2423 is the
fallback.

## What it gives up

Nothing: CI runs on every head as before.

## Revert

    git revert <merge commit of this pull request>

## Review

Independent `/so` on head 1834b0df: AGREE WITH CORRECTIONS, grade B. Answered: the plan-run review
loop told builders to keep pushing each fix as a backup (known-traps.md, now one push per round);
the push exception in queue-merge.md now matches verify.md (wait for the run to finish); the
measurement is defined above so the 2026-11-26 check repeats it.
