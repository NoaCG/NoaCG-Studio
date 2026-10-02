---
kind: desktop
date: 2026-10-01
because: taste
serves: now
answered: true
---
# Rotate, scale one side and set the anchor on the canvas

The new editor's canvas now has the rest of the familiar transform tools (R1.2b.1): a rotation
handle, a scale handle in the middle of each side, and the anchor point that rotation and scale
turn about. The anchor is set by typing it, by **Center anchor**, or by dragging it with the
**Anchor** tool, and each of them moves only that point, never the layer's Position (your answer
below). As you decided on 2026-10-01, the anchor is not animated yet.

## The route, about ten minutes

After `claude/editor-r1-2b-anchor-typography-bf62be` lands and deploys, open
[/app](https://noacg.studio/app) at 1920×1080 with a real mouse and keyboard. Click
**+ New graphic**, **Start from a template**, search for **Hairline**, pick it, click
**Skip to finish**, then **Edit this graphic**.

1. Pick the **Rectangle** tool and draw a rectangle in the empty space above the name. Drag the
   small hollow circle above it round: it turns about the crosshair in its middle, and the
   Rotation field follows. Hold Shift: it steps by 15°. Undo.
2. Drag the hollow dot in the middle of its right side outward: only its width grows and its left
   side stays put. Hold Shift: both directions grow. Hold Alt: it grows about the crosshair.
3. Rotate it again a little. In the inspector's **Anchor point**, type 0 and 0: the crosshair moves
   to its top-left corner and the rectangle turns about that corner now, so it shifts. Click
   **Center anchor**: the crosshair is back in the middle and the rectangle turns about it again.
   Position X and Y never change.
4. Pick the **Anchor** tool and drag the crosshair onto a corner: it stays under the pointer. Since
   the rectangle is turned, it now turns about that point and shifts, so the crosshair ends up off
   the corner. Back on **Select**, drag the rotation handle: it turns about the crosshair.
5. Click **+ New graphic**, **Start from a template**, search for **Frosted Panel**, pick it, click
   **Skip to finish**, then **Edit this graphic**. Click the ruler at about 0.3 s, while the panel
   is still growing in, select the **Panel**, pick the **Anchor** tool and drag the crosshair to the
   panel's left edge. No key appears. Press Play from the start: the panel now grows from its left
   edge.
6. Save, open the graphic's control page from Home, and press Play, then Stop.

Do the three handles read as what they do, without a tooltip? **Center anchor** now moves only the
pivot too, like typing and the Anchor tool. That was decided for you, so say if you want it to keep
the layer where it is instead, as After Effects' Center Anchor Point does.

Known and recorded: an SVG element (an imported design's own text or shapes) refuses an anchor,
since GSAP places its pivot itself, and the Rotation field shows plain degrees (720 stays 720)
rather than turns plus degrees. This is an asynchronous clarity and taste review, not a landing
gate. The [engineering receipt](../../research/editor-r1-2b-1/README.md) records the reproduction,
the catalog sweep, the refusals, history and save/reopen evidence.

## Owner answer, 2026-10-01

Typing an anchor and moving only the pivot is right, and the Anchor tool must not move Position
either: the anchor is only the point rotation, scale and the rest of the transform turn about.

The correction lands on `claude/editor-r1-2b-anchor-typography-bf62be`: typing, Center anchor and
the Anchor tool write only the anchor, and the Anchor tool's crosshair stays under the pointer. The
[receipt](../../research/editor-r1-2b-1/README.md) records the answer, the changed tests and their
verification.
