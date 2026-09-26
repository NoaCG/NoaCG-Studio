# A control page can offer a grid of number buttons, for bingo and board games

**Filed:** 2026-09-26. **Source:** owner-queue cleanup; the bingo caller board's review item asked
whether a bingo night runs from a typed box or wants a clickable grid.

## Why

The imported bingo caller board works today: the operator types a number into **Number to call**
and presses **Call it** (pinned by `e2e/import-svg-behaviour.spec.ts`, "bingo caller"). Every bingo
caller program an operator is likely to have used shows the numbers as a clickable grid instead,
because a caller reads a ball and taps it without typing, and a Jeopardy-style board wants the same
thirty-odd buttons. That is a defensible general answer, so it is a design default rather than a
question for the owner.

## What it would take

A control shape for "one button per value of a row-set field": the control page lays the values out
as a grid, a press adds the value exactly as **Call it** does, and a called value shows as pressed.
It must come from the graphic's declared machine (`docs/STATE_MACHINE_SCHEMA.md`,
`docs/CONTROL_PANEL_ANY_GRAPHIC.md`), not from a bingo-specific code path, so the same shape serves
any board with numbered cells. The exported controller and the hosted page need it too.

## Evidence

The fixture is `e2e/fixtures/svg-shows/bingo-board.svg` (25 numbers). The row-set field kind and
its one-press control are in `docs/SVG_BEHAVIOUR_PLAN.md`.
