---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "`ci-failure-set.mjs` now says WHY a failure set came back empty, and the rolling red-main issue the owner actually reads is the one caller that drops the answer on the floor."
serves: NOW
size: small
touches: scripts/red-main-issue.mjs
needs-owner: none
---

# The red-main alarm drops the reason the gate now gives it

**Filed:** 2026-09-10. **Source:** row AT, 2026-09-09 -
`git show 4f95444b:docs/handoffs/2026-09-09-at-flakes-nobody-sees.md`, "What is left". Re-derived
against the working tree on 2026-09-10.

## Why

Row AT taught `ci-failure-set.mjs` to say why a failure set is empty: `no run id`, `no repository`,
`GitHub listed no jobs`, `ran out of clock`, `only the derived gate failed`, `nothing failed`. Before
that, all six were one sentence - "something this gate could not name - open the run" - and that
sentence is what the owner reads when `main` goes red.

The rolling issue still prints it. `scripts/red-main-issue.mjs:198` destructures
`{ items, hash, exhausted, cancelled }` from `fetchFailureSet` and does not take `reason`, and both
calls to `describeFailureSet` (`:158` and `:219`) pass only `{ max }`. `describeFailureSet` already
accepts `{ reason }` and looks it up in `WHY_EMPTY` (`scripts/ci-failure-set.mjs:190`), so the
information exists, travels as far as this file, and stops there.

The alarm is not blind today - `planRedMainComment` handles `exhausted` separately - but every other
emptiness reads as the one uninformative sentence.

## What it would take

Take `reason` off `fetchFailureSet`'s result and pass it into both `describeFailureSet` calls. The
bodies of that issue are pinned by `scripts/red-main-issue.test.mjs`, so the change is two lines and
whatever those assertions need. Row AT left it alone deliberately because it sits outside that
branch's diff, and said so.

## Also open on the same instrument

**Nobody has read a Monday report yet.** `weekly-audit.yml` runs `ci-repeat-failures.mjs` at 06:00
UTC on Monday, report-only, and the first real one is 2026-09-15. Until then the only evidence the
wiring works is that the script gives the right answer by hand. One `workflow_dispatch` from `main`
shows whether the step summary renders, and it is the only way to prove `checks: read` is sufficient
- that permission is the one thing in row AT's change that cannot be tested from a laptop.

## Evidence

The measurement that made the instrument worth building, from row AT: over the seven days to
2026-09-09, `job: Configured E2E (authenticated, local Supabase)` had **seven reds on seven distinct
commits of `main`**, not one of them naming a spec. That was the largest single source of unexplained
red in the repository and it was structurally un-nameable until
`scripts/configured-verdict.mjs` began emitting one `::error file=<spec>` per genuinely failed spec.
