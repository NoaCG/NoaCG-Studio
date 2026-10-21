# Trial kit: install the Companion module and pair it

For H0 AC-1's new-operator walk (owner decision D, 2026-10-20): someone who has never set up the
NoaCG panel follows only the module's guide. The kit never gates a phase; it is run when there is
time, and each finding becomes an issue.

## What you need

- A Windows or Mac computer with Bitfocus Companion 4.3 or later installed (a fresh connection
  list is best; no Stream Deck is needed, Companion's on-screen buttons work).
- The module file `noacg-studio-0.1.2.tgz`, built from `companion-module/` with `yarn package`
  (or the newest version), and nothing else from this repository.
- A NoaCG account with a published production of at least two cues, open on its production page.
- The guide: Companion shows it as the module's help (the **?** beside the NoaCG Studio
  connection). Print `companion-module/companion/HELP.md` if the participant needs it before the
  module is installed.
- A timer, and this page for notes. Do not help, point, or explain while the clock runs; if the
  participant is stuck for two minutes, note where and help, and count that task as not done.

## Tasks

Read each task aloud. Start the timer at task 1 and note the time at the end of each.

1. Install the NoaCG Studio module from the file.
2. Pair Companion with the production that is open in NoaCG.
3. Put a Take key, an Out key and one key per cue on Companion's buttons.
4. Air the first cue from Companion, then take it off again from Companion.
5. Open the production on a second computer or a phone and make the panel work there instead.
6. Stop this Companion from controlling the production.

For each task write down: the time, each wrong turn (a menu opened and closed, a field filled
wrongly, a question asked), and the words of anything that confused the participant.

## Comprehension questions

Ask after the tasks, without the guide open. Write down the answer in the participant's words.

1. The production page is closed and you press Take on the deck. What happens, and what happens
   when you open the page again a minute later? (Right: refused, keys say "No operator page",
   nothing airs later.)
2. Two laptops have the production open. Which one runs your presses, and how do you change that?
   (Right: the one that has the panel, shown by "Panel ✓"; "Use here" on the other moves it.)
3. A key has grey text. What does that mean? (Right: the page would not run that action now.)
4. What is the difference between a cue's Take key and its Trigger key? (Right: Take airs or
   takes off; Trigger plays or restarts it; neither moves the selection.)
5. Someone else got hold of your Companion file. How do you lock them out? (Right: Revoke the
   panel in the page's panel list.)

## Reading the results: four of five

Run the kit with five participants who have not set up a NoaCG panel before. Read it as passed
when at least four of the five finish tasks 1 to 4 without help, in 10 minutes or less in total,
and answer at least four of the five questions right. A single participant is a pilot: note the
findings, do not read a verdict. When a task fails for two or more participants, that task fails
the kit whatever the totals say.

## Where findings go

One GitHub issue per finding, titled `Companion trial: <what went wrong>`, labelled `control` and a
priority (`P1` to `P3`), quoting the participant's words and the time lost.
Link each issue below. A guide wording fix is a change to `companion-module/companion/HELP.md`
and its test `companion-module/src/__tests__/guide.test.ts`; a product change goes through the
usual spec route.

| Run | Date | Participants | Passed tasks 1-4 | Questions right | Issues |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
