---
v: 2
source: derived
kind: finding
raised: 2026-09-07
state: unstarted
found: "A production data table's armed row/column delete disarms on blur, so a second click can
  re-arm instead of confirming. Seen once as an e2e flake in production-data.spec.ts during the
  src/blocks contract migration row; the spec then passed twice on the same tree."
---
# An armed delete on a production data table disarms on blur, and the second click re-arms

**Filed:** 2026-09-07. **Source:** an e2e flake during the `src/blocks` contract migration row.

## Why

`ProductionDataWorkspace.tsx` arms its three destructive controls - the table delete, a row delete
and a column delete - so each asks twice. All three also carry
`onBlur={() => setArmed((a) => (a === '<this>' ? null : a))}`, so the pending state is dropped the
moment focus leaves the button.

That makes the confirm click order-dependent in a way nothing tells the operator. If anything takes
focus between the two clicks - a React re-render that remounts the button, a durable write settling,
a click that lands on the row rather than exactly on the button - the arm is gone, and the second
click silently re-arms rather than confirming. The control looks identical in both states except for
the ✕ / ✓ glyph, so the operator's experience is "I clicked twice and nothing happened".

This is a table an operator may be reading rows from during a show (the reason arming was added in
`16e322c0`), so a delete that sometimes needs three clicks and sometimes two is worth removing as a
class rather than living with.

The test cost is the visible half. `e2e/production-data.spec.ts:142` failed exactly this way once -
`thead th` count 5 where 4 was expected, meaning the confirm click re-armed - and the whole spec file
then passed twice on the identical tree. Nothing in `e2e/quarantine.json` covers it, so the next
occurrence will read as a new break.

## What it would take

Small, in `src/components/home/ProductionDataWorkspace.tsx` around lines 300-410. Two shapes worth
weighing:

1. **Drop the blur handler and disarm on a real cancel instead** - Escape, a click elsewhere in the
   card, or a timeout. Arming any control already clears the others (one `armed` state), so the
   stale-arm risk the blur guard exists for is mostly covered.
2. **Keep the blur but make the armed state survive a re-render** - the failure is that focus is lost
   involuntarily, not that the operator looked away. Keying the arm to the control's identity and
   restoring focus after the write settles removes the involuntary case without changing the
   deliberate one.

Whichever is chosen, the spec should assert the confirmed state rather than re-clicking blind, so a
future regression fails for the right reason.

## Evidence

The run is on branch `claude/migrate-agents-contract-rules-5ab9fc`. It cannot be that branch's doing:
across the whole integration window the only `src/` changes are three `AGENTS.md` files and two
TypeScript comment blocks in `src/blocks/`. The nightly at `93001bc7` had every spec job green - its
failure was the E2E time budget (issue #85), not a spec.

`e2e/quarantine.json` is empty, and CI's fail-then-pass quarantine only records what fails inside a
CI run, so a local flake with a known mechanism leaves no trace unless it is written down.
