# Owner decision 2026-11-11: growth ceilings version 3

Decided by miwco on 2026-11-11 in the cicd-followup coordinator session (run issue #1967), and
relayed by the coordinator to the builder of the growth-gate work.

## The question put to the owner

The proposal in `growth-ceilings-proposal-2026-11.md` (on the growth-gate branch, PR #2379),
quoted to him:

- offline per landing 720;
- backend per landing 235 and per day 88;
- graphics per landing 20, net of the active exception;
- the rest unchanged.

The dated reduction steps:

- offline: 600 by 2026-12-14, 535 by 2027-01-11;
- backend per landing: 180 by 2026-12-14, 140 by 2027-01-11, 117 by 2027-02-08;
- graphics: 10 by 2027-01-11, after the once-per-commit catalog gate and #2165.

A step lowers a line only if the latest complete report supports it; otherwise it comes back to
the owner. No new exceptions. The two catalog exceptions end on schedule.

## The answer, verbatim

> Approve v3 and plan (Recommended)

## What it changes

`scripts/growth-ceilings.json` version 3:

- **offline per landing:** 535 to 720;
- **backend per landing:** 117 to 235;
- **backend per day:** 78 to 88;
- **graphics per landing:** 10 to 20.

Nothing else moves, and no exception is added, edited or renewed.

The dated steps are recorded in `reductionPlan` in the same file. The weekly growth report
checks them each week against its own measurement. A step that is due and not met becomes an
owned action in the report's rolling issue, assigned to miwco. It never moves a line by itself.
Each lower line is its own reviewed version.

The proposal also gave backend per day steps of 82 by 2026-12-14 and 78 by 2027-01-11, and a
graphics step of 19 per landing (raw) by 2026-12-14, when the catalog extension ends. They are in
the plan the owner approved as "v3 and plan", and in `reductionPlan` too.
