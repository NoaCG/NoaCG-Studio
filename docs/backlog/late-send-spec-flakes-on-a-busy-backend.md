---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "e2e/configured/late-send-abandoned.spec.ts fails whenever other productions write to the same backend, because an old-protocol page skips its own monitor update during a log refill walk."
serves: NOW
size: small
touches: e2e/configured/late-send-abandoned.spec.ts, src/control/logFollow.ts, src/control/hostedControl.ts
covered-by: e2e/configured/late-send-abandoned.spec.ts
needs-owner: none
---

# The late-send spec fails on a busy shared backend

**Filed:** 2026-09-30, by the Phase 6 night session (Step 2 implementer's note K7, confirmed by the
second adversarial review).

## Why

`late-send-abandoned` (added for research §16 item 4, #559) presses a Take and asserts the operator
page's chip. On the unmigrated protocol, a follower that is mid-refill stands its fast road down,
and the sending page then skips applying its own press to its monitor (`recovering` in
`hostedControl.ts`, `onWalk` in `logFollow.ts`). Global log ids make almost every row look like it
follows a hole whenever another production writes, so on a busy shared backend the Take is often
pressed mid-walk. It failed 3 of 3 on main's own code and 3 of 3 on the Step 2 branch against the
busy preview branch A, and passed 3 of 3 on branch B (protocol 2 has per-production numbering and
no stand-down). Air is not affected: the held Take is abandoned in the browser either way and air
ends on the Out. It is the operator page's own monitor that is late, which is the research §5.1
busy-instance behaviour.

## What it would take

- Make the spec independent of other writers (assert air and the send outcome, and read the chip
  only after the follower is idle), or run it on protocol 2 once Step 2 lands.
- The product behaviour goes away for every page on protocol 2; no change to the old path.

## Evidence

- Step 2 implementer's jobs j-2523 and j-2524 (fail on branch A), branch B runs passing; second
  review (oldclients lens): "K7 is pre-existing and not an on-air regression".
