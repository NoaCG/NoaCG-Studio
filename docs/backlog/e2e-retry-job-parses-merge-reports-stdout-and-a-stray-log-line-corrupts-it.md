# The E2E retry job parses `merge-reports`' stdout, and a stray log line corrupts it

**Filed:** 2026-09-24, out of `docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md` ("Left, and
why"), which hit this once (run 35663497961) and could not reproduce it locally, so it was left
rather than guessed at.

## Why

`scripts/e2e-retry.mjs`'s `mergeBlobReports` (line 72) runs
`npx playwright merge-reports --reporter=json <dir>` and `JSON.parse`s the whole of `res.stdout`.
The observed crash was:

    Expected double-quoted property name in JSON at position 146163

146 KB into the stream, not at the start - so whatever wrote the offending bytes is not the first
thing that ran, and the exact writer is unconfirmed. `merge-reports` loads `playwright.config.ts`
to resolve the report, and both the offline guard and `scripts/e2e-workers.mjs` `console.log` -
either could be landing output on the same stdout stream the JSON parse assumes is exclusively
its own.

A crash here does not fail the run silently - it fails the retry job outright, which is worse: the
job whose whole purpose is telling a red run apart from a flake stops naming the failed specs, and
whoever reads that run has to do the retry job's work by hand.

## What it would take

The robust fix named in the g2 handoff: have `merge-reports` write the JSON reporter to a FILE
(`PLAYWRIGHT_JSON_OUTPUT_FILE`) and have `mergeBlobReports` read and parse that file instead of
`res.stdout`. That removes the assumption that nothing else on the process ever writes to stdout
during the merge, which is the assumption that broke.

Not attempted here because the crash could not be reproduced locally (g2: "I could not reproduce
it here, and a wrong guess would silence the retry job") - the fix wants a run that hits it again,
or a deliberate repro (inject a `console.log` into `scripts/e2e-workers.mjs` or the offline guard
and see whether `mergeBlobReports` breaks the same way), before landing a change to a job whose
whole job is telling a real regression from a flake.

## Evidence

Hit once, in CI run 35663497961, described in `docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md`
("Left, and why"). No other occurrence found as of this filing.
