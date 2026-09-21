---
kind: walk
because: direction
date: 2026-09-21
serves: now
---

# The Friday demo, walked as a student on the live site

You asked on 2026-09-21 for anything we need to fix before Friday. I walked the whole road on
`https://noacg.studio` the way a student will, with nobody helping and the docs open: the Quiz
and Scoreboard docs pages, the two example files, import, bind, behaviour, Finish, one production
holding both, and then the dashboard run. The site served commit `da821d84` (built 18:25 UTC),
which was `main` at the time, so the live walk and the merged-main walk were one walk. The
published part (Start production, the output URL in OBS) needs your account and was not walked.

The road works end to end. Nothing blocks Friday. Six things need a workaround or a word from
you at the desk, listed under "Before you press" below.

## What changed on this branch

- **The wizard footer stays on one line at a laptop size.** Once a production exists, the footer
  offers its look as a Brand chooser. At 1366x768 that chooser pushed "Back", "Skip to finish"
  and "Next" into two-line buttons. The buttons now keep their words and the chooser is the one
  thing that shrinks. `e2e/wizard-brand.spec.ts` pins it. The fix is on this branch only; the
  live site shows the wrap until this lands and deploys.

## The route, under ten minutes

Use the one-per-type examples, `quiz.svg` and `scoreboard.svg`. The lower-third variants are
being removed tonight.

1. **Docs, one minute.** Open `noacg.studio/docs#quiz`, read the Layer names and Buttons lists,
   and press "Download quiz.svg". Do the same on `noacg.studio/docs#scoreboards` for
   `scoreboard.svg`.
2. **The quiz, two minutes.** Open `noacg.studio/app`. Press "No thanks" on the telemetry card.
   Choose Import graphic and drop `quiz.svg`. The card says "9 text layers found". Press Next.
   The Fields step says Quiz under What it does, with every answer's selected, correct and wrong
   layer and the Locked layer filled in. Press Skip to finish. Name it "Quiz board", leave the
   production on "New production" and type "Friday", then press "Add to the production" and
   "Add it and go there".
3. **The scoreboard, ninety seconds.** On the production page press "+ New graphic" in the
   header, choose Import graphic and drop `scoreboard.svg`. The Fields step says Score tracker
   with both teams, both scores, both Goal flashes and Full time filled in. Press Skip to finish,
   name it "Scoreboard", check the production reads "Friday", and add it.
4. **Quiz on air, two minutes.** Quiz board is selected. Press TAKE. In the cue editor pick B
   under Selected answer, then press "Select answer": B lights on PROGRAM. Press "Lock it in": the
   LOCKED badge appears. Press "Reveal correct": A turns green, the rest red. For the next
   question type the new question and answers, set Correct answer, and press **Re-take**. Not
   Update, not Next (see below).
5. **Scoreboard on air, one minute.** Select the Scoreboard row and press TAKE. Under Graphic
   actions press Team A "+1" twice and "-1" once: the score goes 2, 3, 4, 3 and the Goal flash
   shows on the first press. Type a new name under Team B and press Update. Press Out.
6. **Reload, thirty seconds.** Reload the page. The production is not published, so PROGRAM says
   "Nothing on air", which is right. The question you typed and the score you moved are still
   in the cues.

## Before you press, at the desk

1. **Out leaves the graphic painted in the PROGRAM monitor.** After Out on either imported
   graphic, alone or with the other on air, the header says "nothing on air" and TAKE is armed
   again, but the picture stays in the monitor for as long as I watched. The wizard preview's
   own OUT clears the same graphic, so the template is fine and the monitor is not. Whether the
   OBS output clears was not measurable without an account. Workaround: after Out, trust the
   header and the OBS picture, not the monitor. Row G owns the dashboard files tonight and has
   the pointer.
2. **Update after a reveal carries the reveal onto the next question.** Typing the next
   question and pressing Update puts the new question on air with the old verdict still shown.
   Workaround: press Re-take, which resets the board to the question state with the new text.
3. **Next after a reveal does nothing you can see.** It logs "Next step" and the board stays on
   the reveal. Workaround: Re-take, as above.
4. **Reveal from a reloaded hosted control tab did not reach air** in row C's testing. Row G is
   fixing it. Workaround: reveal from the dashboard or from a control tab you have not reloaded.
5. **A graphic you do not name is called "Imported SVG design"**, and a second unnamed import
   into the same production replaces the first. The Finish step warns in words. Workaround: name
   both graphics, as the docs say.
6. **The wizard preview is blank for three to five seconds after every step change** while the
   entrance waits for the embedded fonts. Nothing is lost; wait for the fade.

## What to look at

- On the Fields step for `quiz.svg`, the four `static:` letter rows are listed first, unticked,
  under group headings "Rows 1" to "Rows 4", and the same headings repeat for the answers below.
  A student reads the top of the list before the real fields. Row L owns that step and has it.
- The PROGRAM monitor after step 5's Out (item 1 above).
- The footer at 1366x768 on any wizard step with the preview beside it, once this branch is
  live: one line, "Next" one line tall.
