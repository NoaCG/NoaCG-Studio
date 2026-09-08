# The night report spells out two queue commands the job store already owns

**Filed:** 2026-09-08. **Source:** the 2026-09-04 night-report session, simplify leg (handoff since
drained)

## Why
`refusalGuidance` (`scripts/jobs-store.mjs`) is the single vocabulary for what a refusal means and
which command answers it, and the night report was built to print what that function says rather
than grow a second one. Two commands escape the rule: `logCommand` and `requeueCommand` are
module-private, so the report builds `node scripts/jobs.mjs requeue <branch>` and
`node scripts/jobs.mjs log <id>` by hand. A rename of either subcommand now has to be made twice,
or the morning list prints a command that does not exist.

## What it would take
Export both helpers and import them in the report. It was left undone on 2026-09-04 only because
`jobs-store.mjs` was the most contended file on the machine that night; that reason has expired.

## Evidence
`scripts/jobs-store.mjs:1015-1017`, the two private helpers; `scripts/night-report.mjs:94,159,168`,
the three duplicated strings.
