---
v: 2
source: agent
kind: finding
raised: 2026-10-03
state: unstarted
---
# A late Take in the Presence-close spec has no named cause yet

**Filed:** 2026-10-03, from the flaky-tests row. **Source:** measurement.

## Why

`e2e/configured/command-sequence.spec.ts` "a Presence channel closed by the server mid-burst
costs the renderer no Take" failed once on main (configured-suite run 37110685912, on 579d12bc4)
with one Take at 3148 ms from press to air against its 2 s bound, and passed on the retry. A
flake in the configured suite opens the rolling red-main issue. If the cause is a real product
race on the renderer's road, it is exactly what the spec exists to catch; if it is a slow send,
the bound is measuring the database rather than the road.

## What was seen

- CI: `press to air per Take: 110, 3148, 79, 102, 80 ms`. The late Take was the FIRST one after
  the Presence close.
- Locally, against a freshly started stack (all migrations applied just before), the first run of
  `--repeat-each 12 --workers 2` failed 2 of 12, both on Take 1, BEFORE the close:
  `2080, 248, 284, 140, 154` and `2040, 252, 298, 277, 154`. Both were in the first two repeats of the run.
- Then 23 further runs with the operator page's `control_send_seq` attempts recorded passed: on a
  warm stack, after restarting the database and PostgREST, and after a stop and start of the
  stack. Every send answered in 16 to 216 ms; press to air 64 to 278 ms.

## The leading hypothesis, not proven

2040 and 2080 ms is the abandon-and-resend signature of `src/control/failedSends.ts`: an attempt
is abandoned at `ATTEMPT_TIMEOUT_MS` (1500 ms) and sent again after `RESEND_DELAYS_MS[0]`
(400 ms), plus one ordinary round trip. A first send on a cold server, or any send on a loaded CI
runner, that takes longer than 1.5 s therefore airs at about 2 s whatever the renderer does. CI's
3148 ms fits a resend that was itself slow. None of this was observed with the send record on, so
it stays a hypothesis.

## What it would take

The spec now puts every send attempt into its failure message (`sends: Take 2: +80ms answered
after 1720ms ...`), so the next failure names which half was late. Then:

- if an attempt was abandoned or slow, measure the renderer's share from the attempt the server
  answered rather than from the click, since the property under test is the road to air, and the
  send path has its own spec (`scripts/failed-sends.test.mjs`);
- if every send answered quickly, the delay is on the renderer's side after a Presence close, and
  that is a product bug in `src/output/main.ts` or `src/control/seqFollow.ts` to reproduce under
  load with the debug overlay recorded.
