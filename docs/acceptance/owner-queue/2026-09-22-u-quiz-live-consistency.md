---
kind: walk
date: 2026-09-22
because: direction
serves: now
---
# The quiz on air: a fixed answer key lights with Reveal, and presses reach air as fast as Take

Your production test on 2026-09-22 found three things. Here is what changed.

- **A correct answer changed during the show now lights with Reveal.** Before, the key you picked
  in the cue editor only reached air when you pressed Update. If you went straight to Reveal, the
  board lit the OLD answer. That was true on all fifteen catalog quizzes and on the imported docs
  quiz, not just one. Reveal now sends the key with it, the same way Select sends the pick. Update
  after a reveal still moves the verdict, as before. Hovering Reveal says "carrying this cue's
  Correct answer". The wizard still offers Correct answer when you build a quiz.
- **Select, Lock and Reveal on a published production should now feel as quick as Take.** The
  slowness was not the templates. Offline every press reaches the monitor in 20 to 70 ms, the
  same as an Update. On a published production, every quiz button took the slow, durable road
  through the database, which is 350 ms to about a second. Take and Update took the fast road, at
  about 90 ms. Only a clock needs the slow road, so every graphic without a clock now sends its
  buttons on the fast road. Arcade's three flashes and its blinking cursor are the design. The
  answer is readable on the first frame.
- **Arcade's buttons were not changed.** Arcade uses the same buttons as Sticker and Showtime, its
  two siblings in the quiz show set: Pick A to Pick D, Clear pick, and Reveal correct answer, with
  no lock. The other twelve quizzes and the docs quiz use Select answer, Lock it in and Reveal
  correct. Moving Arcade across would need a lock look drawn for it and would split it from its
  set, so it waits for the controls review after Friday. The handoff has the details.

- **One thing outside the quiz changed with it.** The nominee reveal (an award graphic) now offers
  **Winner (1-based)** in the wizard's setup step, next to its other build-time values. It is the
  number Continue reveals, and it was previously reachable only after the graphic was made. Nothing
  about how it plays on air changed.

**One thing to know.** A graphic carries its own buttons inside it, so a quiz that was already
saved in your library keeps the old Reveal. Build the quiz again from the catalog (or re-import the
SVG) to get the carried key. On an older copy the old habit still works: press Update, then Reveal.

## The route, under a minute

1. Make a quiz from the catalog (Arcade, or any other), add it to a production, publish it, and
   open the output link in a second tab. A quiz built today, not one saved earlier - see above.
2. Take the quiz. Press Pick B (Arcade) or pick B and press Select answer (the others). The
   output tab should light B about as quickly as a Take appears.
3. In the cue editor, change **Correct answer** to another letter. Do NOT press Update. Press
   **Reveal**. The new letter should light, on your monitor and on the output tab.
4. Change the key back and press **Update**. The verdict should move back.
5. For the one change outside the quiz: press **+ New graphic**, pick a nominee reveal design
   (House Nominees), and look at the Fields step. It should offer **Winner (1-based)**.

## What to look at

- Whether step 2 still feels slower than a Take. If it does, say which browser and whether the
  output tab was in the background.
- The Reveal tooltip, which should name Correct answer.
