---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
note: "The mechanism this ask needs landed: 0040657c compiled a behaviour from a declaration
  through one binding table and runtime, and eea00820, 1908b7a4, 19285fd7 and 47b7b1dc took the
  registry to fourteen recipes (src/templates/behaviours/registry.ts), so imported artwork now
  gets the logic of a score board, a countdown, a vote, a lineup, a puzzle or a bingo caller
  rather than fields that only accept text. STILL OPEN, and it is the whole of what he asked
  for: level 1, a ranking that reorders its rows and renumbers its positions when a score moves.
  Nothing in src/templates/behaviours/ reorders anything - grep for reorder or sort returns
  nothing - so the reordering half is untouched, as are levels 2 and 3."
asked: "when we have a ranking, we should be able to reorder them by their position ... it would be quite amazing if we could have a ranking that would also reorder the names and the position number just by adding or subtracting points. That is the future we want to come to."
---
# A graphic needs the logic its kind implies, not just fields that accept text

**Filed:** 2026-09-03, from the walk of the practice library's `results-board.svg`.

## Why

He walked the results board and liked it: *"everything seems nice. It's very logical; it makes
sense, and it finds all the lines, and it's all good."* The gap is what happens after the fields
exist.

> All these designs need custom logic to be really useful. Now it's quite useful because you can
> just change it manually, and it will fix, but when we have a ranking, we should be able to
> reorder them by their position.

> You can now change the position number, but it doesn't affect the order they show, and this is
> probably something we need to fix later because it's quite a big ask that we would understand
> the logic for each different graphic. But this is somewhere I want to get to.

> Of course, in the long run, this should be automated through an API or something where we can
> read the actual points and positions. Even without an API, it would be quite amazing if we could
> have a ranking that would also reorder the names and the position number just by adding or
> subtracting points. That is the future we want to come to.

And the shape he expects the answer to take:

> it might mean that we need to create this through Claude code and the CLI, where we actually can
> explain what we want. The control panel can then be exactly as the user wants, and we will do
> this kind of control panel when we get there, but right now, it's not the top priority. We need
> to get the basics done.

**He explicitly parked it**: *"Let's not try to find a solution to that right now, but let's write
it down so we remember this."*

## What this is really asking

Three levels, cheapest first, and the first one is worth doing on its own:

1. **A ranking sorts itself.** Change a score and the rows reorder, the position numbers renumber.
   No API, no external data - the graphic understands that it is a ranking. This is the one he
   called amazing and it is a behaviour, in the sense `docs/GRAPHIC_TYPES.md` already means.
2. **External data drives it** - `docs/DATA_API.md` already lands external rows in the control log,
   so the wiring exists; what is missing is the graphic knowing what to do with them.
3. **The control panel is authored per graphic**, described in words through the CLI and the agent
   door (`docs/AGENT_CLI.md`), so an operator gets exactly the controls their show needs. This is
   the ambitious end and it is parked.

## Evidence

Owner walk, verbatim in this file. Related: `docs/backlog/playout-logic-for-all-common-graphics.md`
covers the same instinct for other graphic kinds; the behaviour model is
`docs/STATE_MACHINE_SCHEMA.md` and `docs/CONTROL_LAYER.md`.
