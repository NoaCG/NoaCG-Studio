# Canvas and timeline review study

2026-09-18. Latest focused interaction study under [EDITOR_PLAN.md](../../EDITOR_PLAN.md).
Start the independent review at the [review brief](../editor-review-brief-2026-09-18.md).
Open `editor-review-canvas-preview.html` locally. This is not application implementation.

## New visible interactions

- Add Out opens its reverse/manual choice immediately above the invoking button, clamped
  inside the available width. It overlays instead of moving the canvas. Escape retains the
  flag without adding keys. Keyboard focus enters the prompt.
- The canvas toolbar has Select, Text, Rectangle and Ellipse. Click to place point text;
  drag to draw shapes, holding Shift for a square/circle. New layers appear on the timeline.
- Selection has eight scale handles. Drag a corner/edge; Shift constrains a corner. Artwork,
  including text, scales as a layer. The scale readout and Undo reflect the gesture.

## Retained scope and limits

The whole workspace/gallery, full transforms and earlier timeline studies remain linked
from the review brief. Their accepted product capabilities have not disappeared from the
plan. This small study inherits the timeline study's four-second/linear/single-axis limits.
Its canvas scale is static and opposite-handle based, not a proof of animated Scale, parent
coordinates, rotation, anchor gestures or geometry/layout resizing. Full linked-scale and
modifier behavior is specified in the mechanism contract; this study uses free scale with
Shift constraint. Point text is shown; drag text-box creation and inline canvas typography
editing are requirements, not implemented here. Image import is planned, not simulated.
Existing SVG wizard behaviors, real operator schemas, precompositions, source patches,
save/export, AI and production have no implementation in this study. Browser checks do not
close product acceptance tasks. The HTML uses illustrative source and artwork only.

## Verification

Browser j-1348 passed 31 checks, including reproduction of the
previous distant prompt, adjacent placement at 1920/1366/1024/320, no canvas reflow, shape/text
creation, constrained circle, scale/undo, cancelled drawing, Escape and focus restoration.
Browser j-1350 passed 34 retained timeline checks on this revised study.
Both have zero runtime errors. Desktop prompt/tools screenshots were visually inspected.

Build j-1347 exited 0: 121 test files, 1798 passed and 1 skipped, followed by TypeScript,
lint, dependency, bundle, prerender and after-build checks. Final receipts and prototype
focus correction were saved after the planning build; no application code was changed.
The prior timeline preview is retained here solely to reproduce the before-state placement.
This is a review checkpoint, not product completion or permission to start implementation.

Regression pilot j-1349 stopped before assertions because its copied root selector was wrong.
The selector was corrected for the replacement run; no application failure was involved.
