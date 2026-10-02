# R1.2b.2: typography and fit

Base: the anchor correction to R1.2b.1 landed through PR #609 as `7d83ced0`; this branch,
`claude/editor-r1-2b-2-typography`, started from fetched `origin/main` at that commit. The plan's
order puts R1.2b.2 next ([EDITOR_PLAN.md](../../EDITOR_PLAN.md), the R1.2b row).

## Why

E05 asks the editor to "edit text content, font, size, weight, colour, alignment and supported
wrapping/fit; long content remains legible", and B04 to "change title/font/colour; test a long
title". R1.1a's usable-artwork follow-up shipped content, font, size, solid colour and opacity
([brief](../editor-artwork-basics/README.md)). Nothing else about type can be changed in the new
editor, and a long operator value has no answer there: point text runs on, a text box wraps past
its own height, and the box's size is only typeable, hidden under "Edit base values". The old
editor's Style tab already writes weight, alignment, line height, letter spacing and long-text fit
for placed lines (`setLineTextStyle`, `setLineFit` in `src/blocks/designLayout.ts`), so this phase
brings those into the new editor, on the same operations, with honest refusals where a design owns
the decision.

Goal: on created and imported text, set weight, alignment, line spacing, letter spacing and what a
long value does (Shrink to fit, Wrap, Run on, with its width), each as one undo that previews while
editing and survives save, reopen and export; resize a text box on the canvas without stretching
its letters.

Non-goals: italic, all caps, text shadow and outline; typing on the canvas; images, assets and
import (R1.2b.3); Pen (R1.2b.4); align and distribute (R1.2b.5); groups (R1.2b.6); bins (R1.2b.7);
loops (R1.2c); animating any of these properties; anything from the backlog.

## Reproduction (before any change)

A probe queued on unmodified `origin/main` `4b2f81a6` from a snapshot worktree (j-2861,
`e2e/zz-probe-r1-2b-2.spec.ts`, not kept) selected each kind of text in the editor at 1920 and set a
61-character value through `text.set`:

| Text | Type controls shown | Fit in the source | A 61-character value |
|---|---|---|---|
| Created point text (Hairline) | Text, Font, Font size, Text colour, Opacity | Run on (no cap, `nowrap`) | one row, 1389 px wide |
| Created text box, 400 x 120 | the same, plus Box width and Box height under "Edit base values" | Wrap at 400 | four rows, 249 px tall, past the box's 120 |
| Hairline's name (catalog line) | Text, Font, Font size, Text colour, Opacity | none (the design's own) | the design wraps it |
| Frosted Panel's title (catalog line) | the same | none | the design wraps it |
| Imported SVG text (fixture-svg) | the same | the import's fit ladder | one row, 1281 px wide in this fixture |

No kind offers weight, alignment, line spacing, letter spacing or a long-text choice, and every
side handle scales, stretching a text box's letters.

## Owner decisions (2026-10-02)

Asked one at a time, with a recommendation each time:

- **The everyday type set.** Weight (only the weights the chosen font really has), Left, Center
  and Right, line spacing, letter spacing, and Long text (Shrink to fit, Wrap, Run on) with its
  width. Full on created and imported placed text; on catalog lines, weight and spacing, which the
  line's own rule can carry, while alignment and fit stay the design's with the reason shown.
  Italic, all caps, shadow, outline and typing on the canvas wait.
- **On a text box the sides resize and the corners scale.** A text box is text with a width, in
  Wrap or Shrink to fit. Its side, top and bottom handles resize the box: the text reflows or
  refits and its letters never stretch. Corners and the numeric Scale still scale the whole layer.
  Point text (Run on) keeps every handle scaling. Width and Height move into the type section
  beside Long text.

## Decisions made here (revertible)

- **SVG text keeps alignment and fit with its import.** An imported SVG's fit ladder writes each
  line's `text-anchor` and `x` from the box it measured (`svgApplyAnchor` in
  `src/templates/importedDesign/svg.ts`), so an alignment or fit written in the editor would be
  replaced at the next update. Weight and letter spacing apply; line spacing refuses, since each SVG
  line is its own element. Each refusal shows its reason where the control would be.
- **Alignment follows After Effects' point and paragraph text.** On a line that hugs its text
  (point text, or a slot with only a maximum width) alignment says which edge sits at its X: the
  wrapper's existing shift (`translateX(-50%)`, `-100%`), as the old Style tab writes. On a box with
  a fixed width it aligns the rows inside the box: `text-align` on the wrapper, inherited by the
  line.
- **Canvas resizing is for boxes with their own size.** The handles resize a text box that has its
  own width and height: what the Text tool's drag makes, or any placed line given a Width and
  Height. An imported design's slot has only a maximum width while its visible box hugs the text,
  so a handle on it could not show what it changes: its Width is typed beside Long text, and its
  handles keep scaling as point text's do. Revert by giving slots side handles that set their
  maximum width.
- **Weights come from the font.** A bundled font offers its range in steps of 100, named (Thin to
  Black); a font the editor does not bundle offers Regular to Extra bold, as the old Style tab did,
  plus the current value if it is something else.
- **The preview refits after a style change.** Shrink to fit measures the slot from the stylesheet,
  and the editor preview swaps stylesheets without rerunning the graphic's script, so a typed Width
  or spacing left the line at its old size. The preview now calls the design's `fitPlacedText()`
  after each stylesheet change, as the graphic's own `update()` does after every value.
- **Width and Height go through `style.set`.** They join the type controls in the inspector, so the
  box's size is one more style value (`editArtworkStyle` with `setSlotSize` and `setLineFit`), and
  the `box.resize` operation the hidden fields used is gone. A canvas resize writes the same values
  and, where the box is turned, a base Position that keeps the opposite side.
- **Long text's labels** are Shrink to fit, Wrap and Run on (the old tab's "Free" reads as a
  price). Run on removes the cap and keeps the box's authored size, so switching back restores the
  same width.

## Acceptance

| Portion | Observable result | Refusal (source and history byte-identical, reason where the control would be) |
|---|---|---|
| Weight | On created text in Inter, Weight lists Regular to Extra bold only; Bold writes `font-weight: 700` on the line's own rule, previews while choosing, one undo; the rendered line grows wider. Bebas Neue offers Regular alone. On Hairline's name and on SVG text, Bold writes the same declaration on the line's rule and nothing else. | |
| Alignment | Point text set to Center keeps its X as the centre of its rendered bounds (within 0.5 px) for a short and a long value; Right keeps its right edge there. A text box set to Center centres every row inside the box's width (row midpoints within 0.5 px of the box's). One undo each. | Catalog lines (the design's layout) and SVG text (the import's fit). |
| Line spacing | In a wrapping box, 1.4 makes the rows' pitch 1.4 x the font size (within 0.5 px); one undo. On a catalog line it writes `line-height` on the line's rule. | SVG text. |
| Letter spacing | 2 px widens a one-row line by about 2 px per character (within 1 px per character); one undo; written in the line's own idiom (`calc(... * var(--scale))` where its placement scales). | |
| Long text | The 61-character value on created point text (1389 px at 48 px): Shrink to fit with width 800 stays on one row within 800 px and never below 55% of the design size (at that floor it needs 764 px, so a narrower slot overflows by design); Wrap with 800 wraps inside 800; Run on runs on. A width typed later refits at once. Each choice is one undo; Shrink adds the fit runtime to the script once and only once. | Catalog lines and SVG text. |
| Box on the canvas | A created text box's right handle dragged 100 screen px widens it by 100 / zoom with the left side within 0.5 px, the font size and Scale unchanged and the text reflowed, one undo; Escape cancels. The left handle keeps the right side; the bottom handle changes only the height. Turned 30 degrees, the right handle still widens it along its own sides with the opposite side's midpoint within 0.5 px. Its corners scale as before. Point text's side handles still scale, and so do a width-only slot's, whose Width is typed beside Long text. | |
| Preserved | Untouched source byte-identical; one history step per edit; saved graphics reopen exactly; SPX, CasparCG and OGraf exports render the edited line as the editor does; the editor regressions pass except the assertions named below. | |

### Existing assertions this changes

- `e2e/editor-base-edits.spec.ts`, "B04 tools create real text fields ... box reflows": it typed
  "Box width" under "Edit base values"; Width now sits in the type section beside Long text, so it
  types Width there. What it asserts (the box reflows taller and the glyphs keep 48 px) is
  unchanged.

## Limits

Recorded rather than changed here:

- **A value too long at the fit's floor overflows.** Shrink to fit never goes below 55% of the
  design size (`templates/shared/textFit.ts`), so a value that needs more room than that runs past
  the slot by design; the 61-character test name needs 800 px at 48 px.
- **An imported SVG's fit ladder refits at its next value, not after a style change in the editor
  preview.** Playout runs it on every update; in the editor a weight or letter-spacing change shows
  unfitted until the text changes or the graphic reopens. Calling the ladder after each stylesheet
  swap is the fix, held back because nothing here can observe it yet.
- **A narrower font keeps the weight it had.** Choosing a font whose range stops below the current
  weight leaves the weight as written (the browser draws the nearest face it has); the list shows
  it as a number until a listed weight is chosen.
- **Catalog lines' letter spacing follows the line's font size idiom.** It is written in plain pixels
  unless the line's own font size scales with `--scale`, as R1.1a writes its font size.
- **A text box set to Run on keeps its authored size**, so its text runs past the box on one row,
  and switching back to Wrap restores the same width.

## Implementation

- [artworkEdits.ts](../../../src/blocks/artworkEdits.ts): `ArtworkStyle` gains weight, alignment,
  line and letter spacing, Long text and the box's Width and Height; `typeReasons` says which a layer
  cannot take and why; `editArtworkStyle` writes a placed line's through `setLineTextStyle`,
  `setSlotSize` and `setLineFit`, and a catalog line's or SVG text's on its own rule.
- [designLayout.ts](../../../src/blocks/designLayout.ts): alignment on a box with its own size is
  `text-align` on the wrapper (read and written); `resizableTextBox` names a box the canvas resizes.
- [fonts.ts](../../../src/model/fonts.ts): `fontWeights`, the weights a face really draws.
- [transformGestures.ts](../../../src/components/editorFoundation/transformGestures.ts): `resizeBox`,
  a side's new size in the box's own axes and the Position change that keeps the opposite side.
- [useArtworkGesture.ts](../../../src/components/editorFoundation/useArtworkGesture.ts): a text box's
  side handles resize it, never asking for a writable scale; corners scale as before.
- [ArtworkAppearance.tsx](../../../src/components/editorFoundation/ArtworkAppearance.tsx): the type
  controls on the shared `FieldControl`, previewing while editing, one undo each, Escape cancels; a
  control a layer cannot take is absent and its reason shows.
- [runtime.ts](../../../src/components/editorFoundation/runtime.ts): the preview reports the
  rendered weight, line spacing and letter spacing, and refits placed text after a stylesheet swap.
- [Inspector.tsx](../../../src/components/editorFoundation/Inspector.tsx) and
  [operations.ts](../../../src/components/editorFoundation/operations.ts): the hidden Box width and
  height and `box.resize` are removed.

## Verification plan

Pure parts in Node: the weights a font offers, the alignment writer's choice between shift and
`text-align`, and the resize geometry (width from the pointer in the layer's own axes, the Position
change that keeps the opposite side), each guard mutation-tested. `e2e/editor-typography.spec.ts`
is written first and queued on the unmodified code from a snapshot worktree, then the editor
regressions as one job, the full affected run, build, `/check`, `/queue-merge` and the deployed
`/version.json`. A desktop owner-queue item is filed only once the whole task works in the real UI,
on a catalog template from the template search and a created layer.

## Review and simplification

The review read the whole diff against the acceptance above and found no defect beyond those the
tests had already exposed. Tests and mutation testing found four, all fixed: the preview did not
refit Shrink to fit after a typed Width (now `fitPlacedText()` after each stylesheet swap); the
spec's 600 px slot could never hold its 61-character name at the fit's floor (now 800 px, and the
floor is a recorded limit); the spacing checks read the field's own typing draft rather than the
rendered value (now re-selected first); and the simulator check compared fitted sizes across pages
whose glyph widths differ (now it checks the fit's guarantee). Simplification removed what earned
nothing: the `box.resize` operation (Width and Height are style values), a whole-template preview
for Long text (a choice commits at once), a scale-refusal exception for text boxes that no box
can reach, a list of fields to coerce that number fields never needed, and an SVG ladder refit that
nothing could observe (a recorded limit instead).

## Verification receipt

- Reproduction: the probe on unmodified `origin/main` (j-2861) recorded the table above, and
  `e2e/editor-typography.spec.ts`, written first and queued on the unmodified code from a snapshot
  worktree at `7d83ced0` (j-2863), failed 7 of 7 where expected: no Weight, Alignment, spacing or
  Long text control, and a side handle that scaled the box.
- Node: `scripts/typography.test.mjs` (2 tests) with `canvas-transforms` pass. Mutation: 17 of 17
  guard mutations of the pure parts fail a test (the weights a font offers and their names; the
  resize's side arithmetic, opposite side, minimum, origin share, axes and Position change), and
  29 of 29 DOM guards in the browser spec (j-2873, j-2887): every refusal and its reason, every
  validation the spec names, each writer, alignment's box branch read and written, the canvas
  resize and its Position change, the inspector's hidden controls, and the preview's reported
  weight and spacings and its refit.
- Browser: the editor regressions (typography, canvas-transforms, transforms, cross-cue, steps,
  out-step, key-ease, ease, out, keys, fidelity-trim, base-edits, usability, foundation,
  alpha-entry), anim-engine and inspector as one job (j-2888): 225 passed, 20 skipped, 2 failed:
  the simulator check above, and `editor-steps` "keeps playback on the ruler in ograf", which timed
  out on a loaded machine; both passed in the re-run of typography and steps (j-2892, 20 of 20).
  The base-edits "Box width" assertion changed as named above.
- Real UI (j-2889), headless at 1920 on this worktree's dev server: Hairline from the template
  search; its name offered Regular to Extra bold, took Extra bold and 1 px letter spacing, and
  showed the design's reason for alignment and long text. A box drawn with the Text tool (Wrap,
  460.8 x 194.4) took a sentence, Bold, Center and line spacing 1.3; its right side dragged 120 px
  widened it to 715.3 with the letters at 48 px and Scale X 100, in one undo. Shrink to fit with
  the 61-character name settled at the 26.4 px floor and ran to 797 px, the recorded limit. Undo and
  redo, save and reopen kept weight, alignment and fit; the control page played and stopped; no page
  errors.
- Full affected run: a change to `src/model/fonts.ts` counts as core, so it ran the whole suite. The
  first attempt (j-2893) hit the queue's 45-minute cap with 1312 passed and none failed; the rerun
  with a longer cap (j-2905) finished: 1313 passed and 544 skipped, none failed; catalog gate 35 of
  35.
- Not checked: a physical desktop at 125% scaling, a phone, the receiving CasparCG and OGraf hosts
  (the type is CSS and the fit script ships in the graphic, which every export carries; the
  simulator fits the long value in its slot), and an imported raster design's placed line beyond
  the created lines that share its writers.
