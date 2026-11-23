# Follow-up: end credits that roll the whole artwork

Owner ask, 2026-11-23: "We need one more template for the end credits. We have a place for the
logo at the beginning and the end, and also we should be able to just scroll anything that is in
the file. You can just put everything in one picture, and that scrolls. Right now, it acts weird
because you add a logo, and it's not in the text layer. So a template that scrolls ANYTHING that is
in the svg...."

Review class: Risky (a saved-binding change). Rules first, then code.

## Reproduced on `main` (90b813d)

`docs/tutorials/template-library/SVG/end-credits-full-roll.svg` (a plate, two rules, an `f:Logo`
and an `f:End logo` picture, and one Credits text object) imported through the real door, saved,
taken. Positions on the program output (frame 0..1080), the roll posed at 0, 0.5 and 1:

| | start | middle | end |
| --- | --- | --- | --- |
| Credits text | 1080..2436 | -138..1218 | -1356..0 |
| Logo | 120..280 | 120..280 | 120..280 |
| End logo | 1776..1936 | 1776..1936 | 1776..1936 |
| Plate | 60..1996 | 60..1996 | 60..1996 |

Only the text moves: it rolls up through the logo, and the end logo, drawn below the artboard, is
never seen.

## Design

A fixed-artwork credits binding may say that the WHOLE artwork rolls (`wholeArtwork: true` on the
saved recipe binding, additive). The roll engine then moves one wrapper around everything the file
draws instead of the Credits text alone. The Fields step asks it as **Rolls**: *The credits text*
or *Everything in the file*. Nothing else changes: the same take, pace, Scroll speed, Out and
exports.

## Rules (stated before code)

- R1. A credits binding with `options.artwork: true` and `wholeArtwork: true` rolls everything
  drawn in the artwork (texts, pictures, shapes, groups) as one piece. At the start of the roll
  the top of the drawn content is at the frame's bottom edge; at the end its bottom is at the
  frame's top edge; the distance between any two drawn elements never changes during the roll.
- R2. A binding without `wholeArtwork`, which is every binding saved before this change, builds
  exactly the template it built before (the frozen fixtures and the imported-credits model tests
  stay byte-identical).
- R3. `wholeArtwork` changes nothing unless the binding builds the fixed-artwork engine; styled and
  editable credits ignore it.
- R4. The pace is today's: 90 px a second in a 1080-high frame at Scroll speed 100, over the
  frame height plus the drawn content's height; a Scroll speed change on air applies without a
  restart.
- R5. Out cancels a pending or running roll and hides the rolled content until the next Take;
  Take again starts it from the bottom, the same as the text roll.
- R6. The extent is measured once per Take, after the entrance and the fonts settle. A picture
  the operator replaces during the roll moves with the rest, and does not restart the roll.
- R7. "Everything" is every child of the artwork's root `<svg>` except what never draws (`defs`,
  `style`, `title`, `desc`, `metadata`, `script`); an element that is not displayed adds nothing
  to the measured extent.
- R8. In the Fields step, credits that build as fixed artwork offer **Rolls** with *The credits
  text* and *Everything in the file*. Its default is *Everything in the file* when at least one
  picture layer is a field, otherwise *The credits text*. Only *Everything in the file* saves
  `wholeArtwork: true`. Editable credits do not show the choice.
- R9. The choice is baked into the emitted roll runtime, outside the `NOACG_BEHAVIOUR` table, so
  no table word is added and `READS_ADDED` does not change.
- R10. Every export the fixed-artwork credits ship in today carries the same runtime and plays the
  whole roll; the OGraf non-real-time gate is unchanged.
