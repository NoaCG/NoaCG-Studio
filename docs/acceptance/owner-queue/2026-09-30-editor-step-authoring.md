---
kind: desktop
date: 2026-09-30
because: taste
serves: now
answered: false
---
# Add, name, move and delete Steps in the new editor

The new editor's timeline now authors Steps (R1.2a.4): Add Step at the playhead, rename a Step
inline, drag or nudge its flag, and delete it. Keys and bars keep their times on the ruler, each
change is one undo, and a flag that cannot land somewhere says why while you hold it. With
R1.2a.3's Out from any step, the Step/Next workflow is complete enough to try as a whole.

## The route, about ten minutes

After `claude/editor-r1-2a-4-steps` lands and deploys, open [/app](https://noacg.studio/app) at
1920×1080 with a real mouse and keyboard. Click **+ New graphic**, **Start from a template**,
search for **Clean Steps**, pick it, click **Skip to finish**, then **Edit this graphic**. The
timeline shows In, four Step flags and Out above the layers; each Step reveals one row.

1. Double-click the first Step flag, type a name and press Enter.
2. Click the ruler in the middle of a Step, after its row has finished appearing, and click
   **Add Step at playhead**. A new flag appears there with the playhead on it. Try the same
   during the entrance, around 0.5 s: it refuses and says why beside the button.
3. Drag a flag a little either way: it snaps to frames and nearby keys and shows its time. Drag it
   past its neighbour: it shows as refused with the reason while you hold it, and letting go
   changes nothing. The arrow keys nudge a focused flag by a frame.
4. Press Play from the start: the graphic enters and stops at the first Step.
5. Focus a flag and press Delete (or right-click it), then Undo.
6. Save, open the graphic's control page from Home, and press Play, then Next a few times, then
   Stop: it waits at each Step, Next reveals the next row, and Stop takes it out from wherever it
   is.

Are the flags easy to find and handle, and are double-click to rename and the right-click menu
discoverable? Do the refusals read clearly? Two things to judge on purpose:

- **A flag moves, the animation stays.** Moving a Step flag later than the start of the next
  row's reveal parks the graphic partway into that reveal, because keys keep their times on the
  ruler (the 2026-09-29 contract). Moving a key or a reveal across a flag is R1.2a.5.
- **Refusal wording.** A refusal names the layer and property by their code names, for example
  `.info-card-box clipPath` when a Step would cut the entrance's reveal, as Set Out's refusals
  already do.

This is an asynchronous clarity and taste review, not a landing gate. The
[engineering receipt](../../research/editor-r1-2a-4/README.md) records the parity, refusals,
history and save/reopen evidence.
