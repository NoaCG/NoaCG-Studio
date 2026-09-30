# The morning brief should print every capability observation that failed its re-probe

**Filed:** 2026-10-01. **Source:** measurement (the 2026-09-30 capability re-probe, row AC).

## Why

`npm run harness:reprobe -- run` now re-runs the cheap capability probes and writes each verdict
to `<git-common-dir>/noacg-reprobe.jsonl`, and `npm run harness:usage` prints a
`FAILED RE-PROBE` block for every observation whose re-probe on the installed build contradicted
it. The first run found three (docs/HARNESS_ROUTING.md, "The second capability re-probe"). But
neither scheduled routine that runs before a wave reads that block: `daily-morning-brief` runs the
CI verdict and `npm run night:report`, and `codex-update-check` runs `harness-usage.mjs --landed`
only to count unverified observations after an upgrade. A failure the morning never sees is still
a wave routing on a claim that was measured false. The scheduled-task prompts live outside the
repository, so a row may not edit them; this is the exact change, for the owner or the weekly
session to paste.

## What it would take

Add this line to the `daily-morning-brief` task prompt, beside the night report step:

> Run `node scripts/harness-usage.mjs --landed --hours 1` in the orchestrator checkout and quote
> every `FAILED RE-PROBE` block it prints, with its evidence lines. Say nothing when there is none.

Optionally, in `codex-update-check`, after a version moves:

> After an upgrade, run `npm run harness:reprobe -- run --free` and report its summary line.

`--free` spends no model call, so it is safe to run unattended. The Antigravity probes cost about
eight subscription calls and belong to a session.

## Evidence

- `scripts/harness-reprobe.mjs` and `scripts/harness-usage.mjs` (`capabilityLines`).
- 2026-09-30: 16 of 22 observations unverified before the run; three failed, five held, three
  held in part, five not probed (four for the Codex usage cap).
