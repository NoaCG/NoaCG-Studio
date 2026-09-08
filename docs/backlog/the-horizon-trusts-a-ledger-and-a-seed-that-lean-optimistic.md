# The horizon trusts a ledger and a seed that both lean optimistic

**Filed:** 2026-09-08. **Source:** the 2026-09-05 refill-loop live run (handoff since drained)

## Why
The 2026-09-05 day wave measured both inputs wrong in the same, dangerous direction: the horizon
saying "a small still fits" late in an unattended window.

A repair launch overwrites the real record. `wave-launch` keeps one record per BRANCH and takes the
newest (`scripts/wave-launch.mjs:18`), so two repair launches replaced their rows' entries, and the
ledger reported a standard unit that took 128 minutes as a small one that took 5. Found and removed
by hand the same day; nothing stops the next one.

And the seeds are optimistic on their own: every standard came in under its 160-minute seed, while
both smalls came in at or over the 80-minute one, at 76 and 106 (`scripts/wave-horizon.mjs:37`).

## What it would take
Either `wave-launch record` refuses a branch that already has a record, or a repair carries a
distinct kind the join ignores. Raise the small seed to the measured p90 before another wave trusts
a late-window fit, and keep the seed labelled with the night it came from.

## Evidence
The launch-to-queued table measured for the five rows of the 2026-09-05 day wave.
