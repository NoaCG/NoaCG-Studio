---
kind: desktop
date: 2026-09-30
because: taste
serves: now
answered: false
---
# Drag keys and bars across Steps, and move Out with its exit

The new editor's timeline now moves keys and layer bars across Step and Out flags (R1.2a.5), and
the Out flag follows your 2026-09-30 decision: the exit belongs to the flag. Moving Out later or
into settled air keeps the exit's own timing from the press. Moving it into motion that has not
finished carries that motion into Out, where it plays first and the exit starts as it ends.

## The route, about ten minutes

After `claude/editor-r1-2a-5-cross-cue-196874` lands and deploys, open [/app](https://noacg.studio/app)
at 1920×1080 with a real mouse and keyboard. Click **+ New graphic**, **Start from a template**,
search for **Clean Steps**, pick it, click **Skip to finish**, then **Edit this graphic**.

1. Drag the Accent line's key at 0.60 s right, past the Step 2 flag. It follows the pointer by
   whole frames and shows its time; let go and it sits on the other side at the same place on the
   ruler. Undo. With a key focused, the arrow keys move it a frame.
2. Drag a key past another key of the same row. It shows hollow with the reason while you hold
   it, and letting go changes nothing.
3. Put the playhead inside the last Step's row reveal, around 2.6 s, and click **Set Out at
   playhead**. Save, open the graphic's control page from Home, press Play and Next until the last
   Step: the graphic parks partway into that row. Press Stop: the row finishes, then the exit
   starts at once. Press Play and Stop straight away too.
4. Click **+ New graphic**, **Start from a template**, search for **Hairline**, pick it, click
   **Skip to finish**, then **Edit this graphic**. Drag the Out flag about a second later: the
   exit's keys move with it. Drag it back into the box's reveal, before 1 s: it refuses and says
   why, since a clip-path cannot be cut exactly.
5. Put the playhead in the settled air after the entrance, around 1.8 s, and click **Add Step at
   playhead**. Draw a rectangle with the Rectangle tool and drag its bar in In to the right, past
   the Step flag: the rectangle now appears during the Step. Undo.

Two things to judge on purpose:

- **Out moved into a reveal.** Does "the rest of the reveal plays first, then the exit" read as
  intended from the control page, and is parking partway into a reveal useful at all?
- **A dragged key or bar is always the whole thing on the ruler.** A bar that runs across a flag
  moves as one bar, and a key dropped on a flag stays on the side it came from. Is that what you
  expected to see?

Known and recorded: the catalog's own rows cannot have their bars dragged yet (they animate a
channel this editor does not author), and a Step only a frame long lets its label overlap Out's.
This is an asynchronous clarity and taste review, not a landing gate. The
[engineering receipt](../../research/editor-r1-2a-5/README.md) records the parity, refusals,
history and save/reopen evidence.
