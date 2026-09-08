# The wave-plan check cannot tell a CI job from a separate workflow

**Filed:** 2026-09-08. **Source:** the 2026-09-02 orchestrator live run, friction 4 (handoff since
drained)

## Why
The 2026-09-02 day-wave plan told a row to confirm `configured-suite` among `ci.yml`'s jobs. It is
not a job there - it is `.github/workflows/configured-suite.yml` - so the instruction could never
be satisfied, and the row had to discover that for itself. `scripts/wave-plan-check.mjs` checks
that paths exist and that a command lives where its kind lives; a claim about which workflow owns
which job is neither shape, so nothing catches it. A prompt that names an unreachable gate costs
the row the time to find out, and it happens where a planner is most confident.

## What it would take
Read `.github/workflows/*.yml` once in the plan check, build a map of workflow to job names, and
refuse a prompt naming a job under a workflow that does not define it. The parse is a `jobs:` key
walk, not a schema.

## Evidence
`scripts/wave-plan-check.mjs` reads no workflow or job names today;
`.github/workflows/configured-suite.yml`.
