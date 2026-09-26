# The hosted-latency suite stays red on timeouts, and its floor is 33 of 54 tests

**Filed:** 2026-09-26. **Source:** handoff of `claude/d-advisors-agent-access` (2026-09-24),
re-checked against `.github/workflows/hosted-latency.yml` and issue #382 on 2026-09-26.

## Why

The hosted-latency suite is the only gate that runs the configured specs against a real hosted
backend (staging), which is where published productions, the hosted control page and the output
page live (outcome 5 in `docs/GOALS.md`). It has been red on every run since 2026-09-23, and the
rolling issue #382 stays open. A gate that is always red stops being read, so a real hosted
regression would now land unnoticed.

The failures look like latency, not defects: each spec timed out waiting on `.auth-status` (20 s),
`.sync-status.sync-synced` (30 s), `production-mode` or a class on the output page, passed on
retry, and a different set fails on each run. On 2026-09-24 it was `dashboard-hosted-walk`,
`deep-link-boot`, `moderator` and `production-links`; earlier main runs lost `relay-cold-boot`,
`output-cold-boot` and `quiz-output` the same way.

Separately, the job's floor is `MIN_TESTS: 33` against 54 real tests, so up to 21 specs could stop
running without the floor noticing.

## What it would take

1. Read the traces of the timed-out specs on one red run and decide, per wait, whether staging is
   slower than the budget (raise that one wait, with the measured number beside it) or the page
   is genuinely waiting on something it should not (fix the page).
2. Once one run is green, raise `MIN_TESTS` to the real count in the same change, so the floor
   catches a dropped spec again. `ALLOWED_SKIPS` is already empty.

## Evidence

- Issue #382 "Hosted-latency suite is red", open.
- `gh run list --workflow hosted-latency.yml`: failure on 2026-09-23 (schedule) and on every
  dispatch on 2026-09-24, including one on `main`.
- `.github/workflows/hosted-latency.yml`: `MIN_TESTS: 33`.
