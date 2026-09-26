# Usable basic artwork editing

Implementation brief, 2026-09-26. Branch `codex/editor-artwork-basics`, based on
`19518e21`. PR #335 merged September 20 as `2eb1942f`; its earlier `8bcde771`
is an ancestor of this baseline. The previous owner-queue item was closed on
September 26 and its feedback retained in the R1.1a receipt, not lost.

## Goal and sequence

Make an imported or catalog graphic customizable through the Alpha editor.
The owner authorized pulling basic R1.2b tools ahead of R1.1b: text content,
font/size/solid colour, layer order/duplicate/delete, marquee and multi-object
movement. Match the current NoaCG logo, typography and theme tokens.
Then resume R1.1b, R1.1c and R1.1d; remaining R1.2b tools stay in R1.2b.

## Boundaries and decisions

Keep SpxTemplate canonical, with pure source writers behind the shared operation
registry. Use existing field, CSS and bundled-font writers. Text edits change
artwork/defaults, not operator sample overrides. Preserve existing identifiers,
unrelated source, assets and motion. Reference-sensitive structural edits must
either preserve references or refuse atomically with an actionable explanation.
One completed edit or group drag is one undo transaction. Escape and stale
revisions discard draft edits. Reorder only within the existing parent.

No keyframe authoring, Out changes, grouping, advanced typography, Pen, image
tools, project system or default-editor switch. Direct production, Alpha entry
and phone viewing remain supported. Owner acceptance is still open.

## Observable acceptance

- Catalog and Illustrator SVG: double-click text and edit it in Properties;
  change font, size and text colour, and a solid shape fill.
- Add shapes; duplicate/delete and reorder supported layers within their parent;
  retain fields and existing motion, with clear atomic refusals for unsafe sources.
- Ctrl/Shift select, marquee select, and move multiple objects together; nested
  parent transforms do not distort the shared canvas displacement.
- Cancel changes without source mutation; undo/redo each operation as one step;
  save/reopen and relevant exports reproduce the result.
- Inspect desktop, laptop, equivalent 125% viewport and phone rendering. Use the
  shared BrandLogo and theme tokens; canvas and inspector remain usable.
- Measure multi-object drag using correlated preview acknowledgements and record
  results against B11. Map browser tests for B01/B02/B03/B04/B11/B13 preservation.

## Evidence

Pending implementation and verification. No new acceptance pass is claimed yet.
