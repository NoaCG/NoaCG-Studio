# Pin the combined control with two operators, a long step list and a reload

**Filed:** 2026-09-26. **Source:** owner-queue cleanup; three live-verify steps the combined-control
review items left to a hand walk.

## Why

A combined control (one press, several steps, one of them delayed) is pinned on the hosted control
page with one operator by `e2e/configured/hosted-control-profile.spec.ts`. Three behaviours have
only ever been reasoned about, and they are the ones that matter when two people run one show:

- **Two operators.** The countdown runs only in the tab that pressed, but every row it sends must
  land in both feeds, and a delayed `+1` must carry the other operator's newer figure plus one,
  because it reads the wire at the moment it fires.
- **The batch cap.** A control whose steps expand past eight wire items must send in several
  batches rather than lose the whole press.
- **A reload mid-countdown** drops the unsent tail by design (`docs/CONTROL_PANEL_ANY_GRAPHIC.md`
  §6d); the spec should pin that it drops cleanly and that the button's hover says so.

An agent can drive all three with two browser contexts against the configured suite's backend, so
none of it needs a person.

## What it would take

Extend `e2e/configured/hosted-control-profile.spec.ts` (or a sibling) with two contexts on one
published production, a combined control of more than eight items, and a reload during the wait.
Read every claim back off the durable command log, as the existing walk does.

## Evidence

`docs/CONTROL_LAYER.md`, the live-verify checklist, step 10.
