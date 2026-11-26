# Route: stops on a track, Next and Back

Owner, 2026-11-26: a restyled Milestone track (a station map on a rail, a show that moves from
stop to stop) imports as the goal meter, so the operator gets Current, Target and a Milestones box
of `Label | figure` lines. What the show needs is a name per stop, Next and Back.

## Goal

An SVG with stops on a track imports, with no setup, as a **Route**: one name box per stop, Next
stop and Previous stop. When Next is pressed the travelled track draws itself along the rail to the
next stop and that stop then fills in; Previous runs it in reverse.

## Non-goals

- Adding or removing stops after import (parked as a `later` issue: an empty stop would be hidden
  and skipped).
- A moving marker that travels along the rail.
- Changing the goal meter or its Milestone track starter.

## Decisions (owner, 2026-11-26)

- A new behaviour recipe, `route`, beside the goal meter and the lineup, not a rename onto either.
- The bottom of the track is an unnamed **start** the route sits at on air; the first Next
  reaches stop 1. A text layer named `Start` is an optional name box for it.
- Motion: the track draws in (a stroke draw-on, about a second), then the stop's reached look
  pops; Back retracts. Instant when the viewer asks for reduced motion.
- The Template Library gains a clean studio **Route** starter; the Milestone track stays as the
  meter. The owner's own file is fixed separately and stays out of the repository.

## Design

- Layers: `Stop 1..8` (the name, a field), `Reached 1..8` (shown once the route is at or past the
  stop), `Track 1..8` (the travelled piece from the stop before, drawn as a line, drawn in on
  arrival), `Here 1..8` (optional, shown only on the stop the route is at), `Start` (optional).
- The position is one number field, `At stop` (0 = the start), read by the existing `row-pick`
  kind, so a controller can set it by number. Next and Previous ride `adjust` like the lineup's.
- Runtime: a new look entrance, `draw`, recorded in `READS_ADDED`; a row's pop waits for its own
  draw. GSAP only, so OGraf seeking lands on the same frame.

## Acceptance criteria

1. The library Route starter and the owner's fixed file both import as Route with no change in the
   mapping step; the control page shows one box per stop, Next stop and Previous stop, and nothing
   else from the behaviour.
2. On air, Next from the start draws Track 1 and then shows Reached 1; Previous hides both; Next is
   greyed on the last stop and Previous on the start.
3. Renaming a stop in its box changes the label on air.
4. A graphic saved before this change reads the same (READS gate green).
5. `docs/SVG_AUTHORING.md` teaches the names, generated from `words.json`.
