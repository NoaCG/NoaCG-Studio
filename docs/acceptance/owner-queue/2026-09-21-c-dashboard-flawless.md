---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# A quiz night runs from the dashboard, start to finish

You said on 2026-09-21 that the playout dashboard has to work flawlessly for Friday. A new test
now walks one production that holds an imported quiz board and an imported scoreboard through
every press a student makes. It covers take, select, lock, reveal, +1, -1, a typed update, the
next question and out, then a reload and a cold boot. Any console error fails it. The walk found
three things worth fixing, and all three are fixed.

- **The activity log names the button you pressed.** It used to print the machine's internal id,
  so pressing "Reveal correct" logged `Fired "judge"`. It now logs `Pressed "Reveal correct"`.
  When two buttons share a label, like the "+1" per panelist on a score panel, the section comes
  first: `Pressed "Panelist 2 · +1"`.
- **The PROGRAM label stays on one line.** With two graphics on air at 1280 pixels, the cue names
  beside "PROGRAM - ON AIR" pushed the label onto two lines and PROGRAM's frame dropped below
  PREVIEW's. The names now end in "..." instead.
- **"Edit graphic" on a graphic's control page opens the new editor.** In the default studio it
  used to open the old one. Advanced mode still opens the code editor.

## The route, under a minute

1. Open the studio, choose Import, and drop `docs/svg-samples/quiz-board.svg`. Click through to
   Finish and add it to a new production called "Friday Quiz".
2. Import `docs/svg-samples/scorebug.svg` the same way, and on Finish pick "Friday Quiz".
3. On the dashboard, select Quiz board, take it, and press Select answer, Lock it in and Reveal
   correct. Then select Team score, take it, and press Home score + twice.

## What to look at

- **Both graphics on air at once.** The rundown shows ON AIR on both rows, the quiz is on layer
  20 and the score on layer 21, and the quiz's verdict stays up while the score moves.
- **Activity** at the bottom of the cue editor. Open it and read the reveal line. It should say
  `Pressed "Reveal correct"`.
- **The PROGRAM heading** at a 1280-pixel window. It should be one line, level with PREVIEW's.
- **Reload the page.** This production is not published, so nothing ever left the laptop, and
  the dashboard correctly says "nothing on air". The figures you moved and typed are all still
  there. On a published production, air lives on the server and survives the reload. The
  configured suite now walks that case with two hosted control tabs.
