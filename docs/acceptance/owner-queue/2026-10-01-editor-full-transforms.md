---
kind: desktop
date: 2026-10-01
because: taste
serves: now
answered: false
---
# Edit a catalog graphic's own motion in the new editor

The new editor now edits the motion catalog designs come with (R1.2a.6). Until now a catalog
row's bar could not move or trim and its position or scale could not be keyed: the rows slide in
with a channel the editor refused. Now dragging a row, typing its position or dragging a panel's
corner at the playhead keys that motion, and the Step and Out edits from R1.2a.4 and R1.2a.5 work on
catalog rows too.

## The route, about ten minutes

After `claude/editor-r1-2a-6-transforms-dca229` lands and deploys, open
[/app](https://noacg.studio/app) at 1920×1080 with a real mouse and keyboard. Click
**+ New graphic**, **Start from a template**, search for **Clean Steps**, pick it, click
**Skip to finish**, then **Edit this graphic**.

1. Drag the **Step 2** row's bar in the timeline a little to the right, past the Step 4 flag. The
   row now appears a moment later and its slide-in carries on across the flag. Undo.
2. Click the ruler at about 0.8 s, while the **Heading** is still sliding in, and select it. Its
   **Layout offset Y** shows where it is right now. Drag the heading down a little on the canvas:
   a key appears at the playhead and the field follows the drag. Undo.
3. Save, open the graphic's control page from Home, and press Play, Next four times, then Stop.
4. Click **+ New graphic**, **Start from a template**, search for **Frosted Panel**, pick it, click
   **Skip to finish**, then **Edit this graphic**. Put the playhead at about 0.3 s, select the
   **Panel**, and drag a corner handle: its Scale is keyed at the playhead. Hold Shift and drag a
   corner: it refuses and says why, since the panel's scale is one value for both axes.

Two things to judge on purpose:

- **A drag while a row is sliding in keys the slide.** Dragging the heading at 0.8 s changes where
  its slide-in goes at that moment, as a keyed Position does in After Effects. Moving the whole
  animated row stays under **Edit base values**. Is that what you expected?
- **Some refusals stay.** A panel whose exit ends with Out cannot move its bar (a move never
  lengthens Out), and an accent line that stretches on one axis refuses a linked corner drag. Do
  these read clearly where they appear?

This is an asynchronous clarity and taste review, not a landing gate. The
[engineering receipt](../../research/editor-r1-2a-6/README.md) records the reproduction, the
catalog sweep, the refusals, history and save/reopen evidence.
