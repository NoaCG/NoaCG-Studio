# The AI door can propose a motion preset the design cannot perform

**Filed:** 2026-09-08. **Source:** the 2026-09-05 offer-nothing-dead session (handoff since drained)

## Why
Every human-facing surface now asks `presetMovesSomething` before offering a motion card - the
wizard's Animation step, the Inspector, the legacy timeline - and the wizard contract carries that
as a rule. `src/ai/spec/specDesign.ts:106` does not: it accepts any preset in
`swappablePresetsForType(template.type)`. An AI spec that proposes the layer stagger for a Figma
frame export (one unnamed group, no named layers) is accepted, and the graphic plays a whole-unit
fade with nothing saying the pick was dropped. The offer rule holds; the AI path is the one hole in
it, and it is silent in the same way the dead controls were.

## What it would take
Filter the accepted preset with `presetMovesSomething(template.html, presetId)` the way
`swappablePresetsForTemplate` does, and decide what the spec reports when a proposal is refused.
Falling back silently is the failure that round was about.

## Evidence
`src/blocks/presetRegistry.ts:49` and `:126`; the human-facing filters landed in `e6bdabce`.
