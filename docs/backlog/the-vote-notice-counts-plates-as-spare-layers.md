# The import notice tells a vote author about "layers nothing is using" that are background plates

**Filed:** 2026-09-09. **Source:** measured by the 2026-09-06 mapping-step row, named in its handoff
as a known gap and never filed; re-verified against the code during the handoff drain.

## Why

The unmatched notice in the SVG mapping step is copy the reader is asked to act on: it says how many
boxes are empty and how many layers the file has that nothing is using, then tells them to go and
rename those layers. On a vote graphic the second number is wrong, and wrong in the direction that
sends somebody hunting for layers that do not exist.

`fillGap` in `src/components/wizard/import/fieldAutoMap.ts:117-132` collects the pools of the empty
roles and counts every unclaimed candidate in each. For a vote, an empty gauge role pools every
plain drawn rectangle in the file, so background plates, rules and panel furniture all count as
"layers nothing is using". A file with a full-bleed plate behind the board inflates the number by
however many rectangles the designer drew.

The notice is deliberately gated at three empty boxes precisely so it only appears when the reader
should act, which makes an inflated count worse rather than harmless: it fires exactly when they
will follow it.

## What it would take

The count needs geometry at notice time, which it does not have today. The cheapest honest version
is to exclude a candidate whose box contains most of the artwork's frame, or whose area is above
some share of it - a plate is the thing that is bigger than what sits on it. That is a rule about
drawing, so it wants a measurement over the SVG corpus rather than a guessed threshold, the same way
the three-empty-boxes line was chosen.

The alternative, cheaper and less good, is to soften the copy so the number is not something to
count against the file - but the whole point of the sentence is that the names, not the drawing, are
what fell short, and a vague version of it says nothing.

## Evidence

- `src/components/wizard/import/fieldAutoMap.ts:117-132` - `fillGap`, and `spareIds` built from
  `candidatesFor(pool, text, drawn)`.
- `src/components/wizard/import/MapSvgFieldsStep.tsx:1850` (where `gap` is computed) and
  `:2548-2556` (the `map-svg-unmatched` notice and the comment stating the three-box line).
- The behaviour landed in `cddb75be`, PR merge for `claude/c-mapping-step-explains`.
