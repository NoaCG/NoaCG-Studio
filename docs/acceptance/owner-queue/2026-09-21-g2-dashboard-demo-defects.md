---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# The dashboard's demo-walk defects: Next, Update, the state chip and the band names

The rehearsal walk on 2026-09-21 found several things on the production dashboard that read as
broken in front of students. These are the ones fixed here.

- **» Next greys on a last step.** On a quiz's Reveal only Out is left, so Next did nothing on air
  while the log still said "Next step". It now greys, and its tooltip says the graphic is on its
  last step and that Out takes it off and Re-take starts it again.
- **Update after a reveal says what it keeps.** Update only sends values and never moves a state,
  so typing the next question over a reveal aired the new words under the old verdict. I kept
  Update data only, because the same button must not undo a scoreboard's Final when you fix a
  team name. Instead, with edits pending on a graphic that has moved on, the note under the cue
  reads "Update keeps Reveal on air, Re-take starts over with these values", and Update's tooltip
  reads "Sends the values. Stays on Reveal."
- **The score tracker's state chip reads words.** It printed "main: On air · flag: No flag ·
  result: Live". It now prints the state names only, like the quiz's chip does. The exported
  control panel does the same.
- **Both scoreboard bands carry their team.** The cue editor headed one band "OTAVA" and the other
  "Side B", because the away side's first field is its score. Both now show the team name.
- The two "+ New graphic" tooltips now use the same plain dash.
- **Out and the PROGRAM monitor: please look with your own eyes.** The rehearsal saw a graphic stay
  painted in PROGRAM after Out. I could not make that happen in a real browser: on this branch and
  on https://noacg.studio itself, with the docs quiz and scoreboard, alone and side by side, after
  select, lock and reveal, every Out faded the graphic away and its machine went to Off. The walk
  test now reads that off the monitor's own document after each Out. My best reading is that the
  rehearsal's automated browser pane stopped repainting the monitor while it was hidden. On your
  laptop, Out should clear PROGRAM within about half a second.

## The route, under a minute

1. Open a production that holds the imported quiz and the imported scoreboard (the Friday Quiz
   from the walk, or build one from `docs/svg-samples/quiz-board.svg` and
   `docs/svg-samples/scorebug.svg`).
2. Select the scoreboard cue and press Take. Look at the state chip and at the two band headings
   in the cue editor.
3. Select the quiz cue, Take, then Select answer, Lock it in and Reveal correct. Hover » Next.
4. Type a new question into the on-air quiz cue. Read the note beside the cue name, then hover
   ✎ Update.
5. Press ■ Out on each layer and watch the PROGRAM monitor empty.

## What to look at

- The chip on the scoreboard has no "main:" or "flag:" in it.
- Both band headings are team names, never "Side B".
- On the reveal, » Next is grey and its tooltip explains why.
- The note names Reveal as the state Update keeps and points at Re-take.
