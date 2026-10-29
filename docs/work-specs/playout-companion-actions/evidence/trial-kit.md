# Trial kit: custom and foreign buttons on a Companion deck

For E6's trial task (owner decision D, 2026-10-20): someone who has not set up a NoaCG graphic
key before follows only the module's guide, with no Windows command scripting, and makes a
graphic's own live controls work on Companion buttons. The kit never gates a phase (the physical
deck's acceptance is H0.2); it is run when there is time, and each finding becomes an issue.

## What you need

- A Windows or Mac computer with Bitfocus Companion 4.3 or later, the NoaCG Studio module
  `noacg-studio-0.2.0.tgz` (or newer) built from `companion-module/` with `yarn package`, already
  paired with the production below (the install and pairing tasks are the H0 kit's,
  `docs/work-specs/playout-companion-qualification/evidence/trial-kit.md`). No Stream Deck is
  needed; Companion's on-screen buttons work.
- A published production open on its production page, with a browser output open beside it:
  - a scorebug with a goal action and a ± home score, pinned on the page;
  - a quiz graphic with a reveal and an answer pick, not pinned;
  - an imported OGraf package with a declared action that takes an argument (the repository's
    `e2e/fixtures/foreign-ograf/rundown/` package and its Mark action work), with one cue.
- The guide: Companion's help for the connection (`companion-module/companion/HELP.md`).
- A timer, and this page for notes. Do not help, point, or explain while the clock runs; if the
  participant is stuck for two minutes, note where and help, and count that task as not done.

## Tasks

Read each task aloud. Start the timer at task 1 and note the time at the end of each.

1. Put the scorebug's goal key and its +1 and -1 score keys on Companion's buttons.
2. Take the scorebug's cue and press the goal key once. Say what the score should read now.
3. Put a key for the quiz's reveal on a button. (The quiz is not pinned: there is no preset.)
4. Put a key for the package's Mark action on a button, and make it write "from the deck" without
   typing in the production page.
5. Take the package's cue and press that key. Then type "from the page" in the cue's Mark form on
   the production page and make a second key that sends whatever the cue's form says.
6. On the production page, unpin the scorebug. Press its goal key again.

For each task write down: the time, each wrong turn (a menu opened and closed, a field filled
wrongly, a question asked), and the words of anything that confused the participant.

## Comprehension questions

Ask after the tasks, without the guide open. Write down the answer in the participant's words.

1. A goal key turns amber with a "?" after a press. What does that mean, and should you press it
   again? (Right: not known whether it ran; it is never sent again by itself; look at the output
   before pressing again.)
2. The scorebug's cue is taken off and another scorebug cue is taken while you press. Which cue
   does the key act on? (Right: neither; it is refused, because the key acts only on the cue that
   was on air when it was drawn.)
3. A key shows "?" before its name and stays dark. What happened? (Right: the graphic no longer
   has that control; drag the new preset onto the key.)
4. Why is the package's key never grey while its cue is on air, when the quiz reveal sometimes is?
   (Right: the package decides itself whether it takes an action.)

## Reading the results: four of five

Run the kit with five participants. Read it as passed when at least four of the five finish tasks
1 to 5 without help, in 12 minutes or less in total, and answer at least three of the four
questions right. A single participant is a pilot: note the findings, do not read a verdict. When a
task fails for two or more participants, that task fails the kit whatever the totals say.

## Where findings go

One GitHub issue per finding, titled `Companion graphic keys trial: <what went wrong>`, labelled
`control` and a priority (`P1` to `P3`), quoting the participant's words and the time lost. A
guide wording fix is a change to `companion-module/companion/HELP.md` and its test
`companion-module/src/__tests__/guide.test.ts`; a product change goes through the usual spec route.

| Run | Date | Participants | Passed tasks 1-5 | Questions right | Issues |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
