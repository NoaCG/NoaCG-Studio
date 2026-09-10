---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "on the bingo caller fixture a called tile draws a white numeral on its amber plate, which is the one pairing on that board below ordinary contrast, and a called number is the one a player scans for across a room"
---
# A called bingo tile keeps a white numeral on amber

**Filed:** 2026-09-10, during the owner-queue drain against the four reasons. **Source:**
`docs/acceptance/owner-queue/2026-09-06-bingo-caller-board.md`, which noticed it and offered the
choice to the owner. It is a contrast default, so it was decided instead.

## Why

The board lights an amber plate under each called number. The numeral stays white, which is right
against the board's dark ground and wrong against amber - it is the only pairing on that artwork
below ordinary contrast, and it lands on exactly the tile a player in the room is looking for. A
bingo board's whole job in the last second of a call is to be legible from the back.

**Decided: the numeral goes dark once its plate lights.** Nothing else on the board changes.

## What it would take

A fill on the numeral tied to the same state that lights the plate, in
`e2e/fixtures/svg-shows/bingo-board.svg` and in whatever the recipe emits for a `row-set` tile. It
is a fixture and a paint rule rather than a product change, which is why it did not travel with
the queue item. Check it against the same route the item gives: call 7, call 12, take one back,
new game.

## Evidence

**The file is `e2e/fixtures/svg-shows/bingo-board.svg`**: twenty-five tiles, a hidden amber plate
and a hidden white ring per number, the numerals named `Number 1` to `Number 25`. A called tile
shows its amber plate with the numeral drawn white on top - white on the board's dark ground is
right, and the same white on amber is the one pairing there below ordinary contrast. The board and
the `row-set` recipe behind it landed on 2026-09-06 on branch
`claude/add-control-row-set-field-d1d013`, and the route that shows it is the wizard's Import
graphic door with `Call it` pressed on any number. Filed to the owner queue the same day as
`bingo-caller-board`, which raised it as a question and had it decided on 2026-09-10.

The decorative-numerals trap the same board avoided is
`docs/backlog/decorative-numerals-arrive-as-fields.md`.
