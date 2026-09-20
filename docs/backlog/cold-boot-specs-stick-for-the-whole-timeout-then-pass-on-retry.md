---
v: 2
source: derived
kind: finding
raised: 2026-09-20
state: unstarted
found: "The hosted cold-boot specs hang for their ENTIRE test timeout on the first attempt (4-5 minutes) and pass in ~28 seconds on the retry, which may mean the retry is passing on the leftovers of the attempt that failed."
serves: NOW
size: medium
touches: e2e/configured/relay-cold-boot.spec.ts, e2e/configured/output-cold-boot.spec.ts, e2e/configured/quiz-output.spec.ts
needs-owner: none
---

# The hosted cold-boot specs stick for the whole timeout, then pass in 28 seconds

**Filed:** 2026-09-20. **Source:** issue #341 and three `hosted-latency` runs read end to end.

## Why

It is the only thing keeping issue #341 open, and the shape of it says the retry may be hiding a
real defect rather than absorbing a flake. A suite that goes green on the second attempt because
the FIRST attempt left the state the second one needs is not testing the cold path at all, and the
cold path is the whole point of a spec called `relay-cold-boot`.

## The shape, which is the finding

Every failure is the same and none of them is slow. The first attempt hangs for its **entire**
test timeout, and the retry finishes in about half a minute.

| run | spec | first attempt | retry |
|---|---|---|---|
| 35498134985 | `output-cold-boot.spec.ts:24` | **4.0m** (timeout 240s) | **28.7s** pass |
| 35498134985 | `quiz-output.spec.ts:13` | 38.0s fail | 35.5s pass |
| 35498134985 | `relay-cold-boot.spec.ts:31` | **5.0m** (timeout 300s) | **29.9s** pass |
| 35516988408 | `relay-cold-boot.spec.ts:31` | **5.0m** (timeout 300s) | **28.0s** pass |

A 10x gap between a timeout and its own retry is not latency. Latency was measured in the same
runs and is fine: **154 ms** on the last green run (2026-09-16), **194 ms** and **171 ms** on the
two red ones, against a documented ~207 ms baseline. The database is not the problem.

What the failures say on screen is identical in all three specs: the dashboard sits on
**"not on air"** and every verb stays **disabled**. `output-cold-boot` waited 240s for
`verb-update` to enable; `relay-cold-boot` waited 300s for `verb-out`; `quiz-output` asserted the
state chip and got `"not on air"` where it wanted `"Question"`. So one thing is wrong, not three:
**the live state never arrives, and waiting does not help.**

## The hypothesis worth testing first

`relay-cold-boot` is "an exported graphic loaded after the take airs it, **from the real log**" -
the cue is written first and the renderer is expected to replay the control log when it boots. If
the retry finds the FIRST attempt's rows already in that log, it would air immediately and finish
in ~28 seconds regardless of whether the cold path works. That would make the retry a false green
and the suite's real state worse than "1 flaky" suggests.

Two observations fit it and neither proves it: the retry time is suspiciously constant across
runs (28.0s, 28.7s, 29.9s), and the specs that fail are exactly the ones whose names say they
exercise a cold start.

## What it would take

Run `relay-cold-boot` twice against staging with the control log cleared between the attempts. If
the second attempt then takes five minutes too, the retry was passing on leftovers and the cold
path is broken; if it passes in 28 seconds, the first attempt is losing a race and the log is not
the mechanism.

The other half is to make the failure legible rather than a 300-second hang.
`followControlLog` already reports channel status separately (`onStatus`, `onCommandStatus` in
`src/control/hostedControl.ts`) precisely so a surface can say "not joined - polling". Nothing in
these specs reads it. Capturing those statuses on failure would say in one line whether the
channel joined, which is the question every one of these hangs leaves open.

## Evidence

- Issue #341, open since 2026-09-20 07:54.
- Runs 35498134985 (scheduled, 3 flaky) and 35516988408 (on demand, 1 flaky), both at `53bd2f0e`
  or earlier; run 35070863910 on 2026-09-16 was the last clean one, **43 tests in 7.0m, 0 flaky**.
- The suite is serial - `playwright.live.config.ts` sets `workers: 1` and `fullyParallel: false` -
  so nothing here is tests competing with each other.
- Between the green run and the red one the suite grew from 43 to 49 tests, gaining
  `e2e/configured/deep-link-boot.spec.ts` and `e2e/configured/hosted-space-modes.spec.ts`. That
  accounts for more wall time but not for a spec hanging on its whole budget.
