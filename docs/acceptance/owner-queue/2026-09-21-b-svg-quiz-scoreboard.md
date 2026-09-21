---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# Illustrator's own quiz and scoreboard files keep their type and their plates

I drew two files the way Illustrator really writes them for Friday's demo. One is a quiz saved
through Save As. The other is a scoreboard drawn as a lower third on slanted plates. Walking them
to air found two faults, and both are fixed.

- **A kerned or accented word lost its look the moment the operator's value reached it.**
  Illustrator puts the colour, face and size on each `<tspan>` run and nothing on the `<text>`.
  Our update replaced the runs, so "Tampere" (a hand-kerned T) came out at the browser's default
  16px in black. In the wizard's preview it read as three dots on a dark row. The scoreboard's
  "2. ERÄ", split at the Ä, did the same. The import now copies the first run's look onto the text.
- **A slanted plate was not a box.** Illustrator writes a slanted plate as a `<polygon>`. The
  Fields step knew only rectangles, so both club names said "no box of their own, so nothing grows
  around them" on the plate they sit on. A polygon plate is now a box, and "gets wider" grows it
  by its corners, so the slant stays the one you drew.

## The route, under a minute

1. Open the studio, choose Import graphic, and drop
   `e2e/fixtures/svg-corpus/illustrator-scoreboard-lower-third.svg`.
2. On the Fields step, each club name sits under its own "Strap" box, with no "no box of their
   own" line anywhere.
3. Go back, drop `e2e/fixtures/svg-corpus/illustrator-save-as-quiz-board.svg` instead, and step to
   Finish. In the preview, answer B reads "Tampere" in the same white type as Helsinki.

## What to look at

- **Answer B and the period.** Same size and colour as their neighbours, in the preview and on
  air.
- **A long club name.** Type KIEKKO-ESPOO AKATEMIA as Team 1 and press Update. It shrinks to fit
  its slanted plate and stays clear of the crest and the score block.
- **The four letter tiles on the quiz.** A, B, C and D arrive as operator fields called "Letters",
  "Letters 2" and so on, because they are live text. Untick them on the Fields step if the
  operator should not see them. I left this as it is. Say if it should change.
