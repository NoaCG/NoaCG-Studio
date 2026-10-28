# Trial kit: live data, pinned controls and adjustments for newcomers

For E8 AC-3's added tasks (owner decision D, 2026-10-20), with L1 AC-11's two-graphic task and L2
AC-11's adjustment task: someone who has not run these NoaCG features before does each task
unaided. The kit never gates a phase. The owner runs it when there is time and reports; each
finding becomes an issue. The physical part of these tasks (CasparCG, OBS and the Stream Deck in
the real studio) is the dress rehearsal's, in parent phase S, not this kit's.

Earlier kits stay as they are and are not repeated here: content tasks (paste, Sheet, feed,
messages) in [`data-sources/evidence/trial-kit.md`](../../data-sources/evidence/trial-kit.md),
Companion install and pairing in
[`playout-companion-qualification/evidence/trial-kit.md`](../../playout-companion-qualification/evidence/trial-kit.md),
and custom and foreign Companion buttons in
[`playout-companion-actions/evidence/trial-kit.md`](../../playout-companion-actions/evidence/trial-kit.md).
Task 5 below borrows the last one's setup.

## What you need

- **The build.** Write its commit (or, for noacg.studio, the date and time) in the results
  table. Until [#1734](https://github.com/NoaCG/NoaCG-Studio/issues/1734) is fixed, tasks 1 to 4
  need a development build (`npm run dev`) on a known commit, because registering the replay
  source needs one. Tasks 5 to 7 run on noacg.studio.
- **Production E (election), new for each participant**, prepared by the proctor as
  [`playout-election-package/rehearsal.md`](../../playout-election-package/rehearsal.md),
  "Before the rehearsal", steps 1 to 4, with two changes: the replay server starts with
  `--step-ms 600000` (ten minutes a step), and it and the agent start just before task 1, in a
  new folder. The replay's results are a fixed sequence of eight steps (`packageTimeline()` in
  `scripts/election-replay-server.mjs`), counted from the agent's first read: 0 min, the first
  count (counted share 60%); 10 min, a newer count (61%); 20 min, the same count again; 30 min,
  a correction (one candidate's votes and a party's total go down; the counted share stays);
  40 min, an older count (refused); 50 min, a broken answer (refused); 60 min, Sara Example
  (district 02, candidate 103, task 2's prepared person) leaves the list; 70 min, the list is
  empty. Tasks 1 to 4 must end within the first hour. A production that has taken a later count refuses an
  earlier one, so a second participant needs a new production (delete or rename the previous
  participant's production first, because the registration in step 2 finds the production by its
  name; then import the pack again) and a new replay folder, never a restarted timeline on the
  old one. Open the output in a second browser
  window beside the production page. Then add one graphic from the library with a title and one
  empty text field (any lower third works), titled `Counted`, as a cue that is
  connected to nothing. Keep the agent's and the replay server's windows on the proctor's
  screen, out of the participant's sight.
- **Production Q (two graphics)**, published, with its output open beside it: a quiz board with
  answers A to D (a classic answer board, for example qz01) with one question cue, and a score
  banner with two competitors and ± numbers, with one cue. Nothing pinned. This is the
  2026-10-23 show of [`pinned-live-controls/spec.md`](../../pinned-live-controls/spec.md).
- **Production A (adjustments)**, published, with its output open: a lower third, a score banner
  and the same quiz board, one cue each plus a second lower-third cue, all at their defaults. A
  production look exists under **Setup**, **Look…** and is **Off**.
- **Companion** for task 5, set up as the E6.2 kit's "What you need" says: the module 0.2.0 or
  newer, paired with a production that holds the imported OGraf package
  `e2e/fixtures/foreign-ograf/rundown/` with its Mark action, one cue. No Stream Deck is needed.
- A timer and this page for notes. Do not help, point or explain while the clock runs. If the
  participant is stuck for two minutes, note where, help, and count that task as not done.

## Tasks

Read each task aloud as written. Start the timer at the start of each task and write the time at
its end.

On production E:

1. **Connect a sample API.** "The results source 'Election results (replay)' is already added to
   this production. Connect the `Counted` cue's value to how much of the vote is counted, so it
   follows the results, and put it on air." The route the proctor expects: the cue's **Connect
   data…**, then **Use existing content…**, "Connector: Election results (replay)" (the page reads
   the sample through the agent), the value field to the counted share (`60%`), **Connect**, Take.
   A pasted address does not work here: the page cannot reach the replay server itself (#1734).
   Done when the cue's field is connected (it reads "🔗 Connector: …") and the cue is on air
   showing the first count (60%). The proctor also notes whether the output changes to 61% by
   itself when the second step arrives, ten minutes after the start, with no press.
2. **Select a live candidate.** "Put Leo Example's candidate card on air." Then: "Now get Sara
   Example's card ready, without changing what is on air." Done when Leo airs, and Sara is
   prepared while the output still shows Leo.
3. **Preview or air.** Without touching anything: "Which person is on air now, and which one is
   only prepared? Show me where you read that." Done when the participant names Leo as on air
   from PROGRAM or the output, and Sara as only prepared from PREVIEW or the editor's "Not on air
   yet" line.
4. **Recover a source failure.** Before reading the task, the proctor stops the agent (Ctrl+C).
   "The results provider has stopped answering. Find out when results last arrived, and keep
   what is on air safe until it is back." When the participant has acted, or after three
   minutes, the proctor starts the agent again with the same command. "The results are back.
   Carry on." Done when the participant finds when data last arrived (the Data page's **Another
   system** card, "Received N min ago"), keeps the graphics on air rather than taking them out,
   holds the data (**Pause**, or **Fixed values** on the aired candidate cue followed by **✎
   Update**; Fixed values alone leaves the aired card following), and after the restart lets new
   values through again (**Resume**, or picking the candidate again and **✎ Update**). This is
   judged by those presses: the page cannot tell a stopped agent from results that simply have
   not changed (the runbook, section 3), and the next replay step may change nothing visible.

On the Companion production:

5. **Use a declared Companion button.** "Put a key for the imported graphic's Mark action on a
   Companion button. Take the graphic's cue, then use the key to write 'from the deck' on air
   without typing on the production page." Done when the output shows "from the deck" after the
   press. (This is the E6.2 kit's tasks 4 and 5 in one.)

On production Q (L1 AC-11, the two-graphic show; record it press by press, see below):

6. **The two-graphic show from one screen.** "Take the score banner, then the quiz question. Pin
   the score banner. For this question, pick answer B, lock it in, reveal the correct answer, and
   give competitor 1 one point. Do not select another cue while you do it." Start from a fresh
   page load (L1 AC-11). The pin can be made from the score banner's ⋯ menu in the rundown while
   the quiz cue stays selected. Done when the output shows B locked and revealed and competitor
   1's score one higher, with no cue switch from the pick to the +1 (L1 AC-11 records every
   switch; only those during pick, lock, reveal and +1 fail the task).

On production A (L2 AC-11, the adjustments; each prepared on PREVIEW, then taken or updated):

7. **Adjust from one screen.** Start from a fresh page load (L2 AC-11).
   1. "Move the lower third to the right and nudge it a little up. Put it on air."
   2. "Make the score banner 5 % smaller, on air."
   3. "The quiz board looks too big. Decide whether making it smaller is enough, and say what you
      would do instead if it is not." (The Adjust block's line "smallest text N px" turns amber or
      red; the remedies, in order: resize a little while the line stays amber or green; use the
      lower third if the content fits a strap; otherwise ask for a compact companion graphic.)
   4. "Set the quiz cue's text to bold, on air."
   5. "Turn the production look on and send it to what is on air."
   6. The proctor says: "Only the second lower-third cue should sit on the left; the first one
      stays where you put it." Write down which scope the participant used first, and whether
      the first cue moved.
   7. The wrong-scope recoveries, both of them, whatever happened in step 6. The proctor first
      checks that the first lower-third cue has no exception of its own (its Adjust block offers
      no **Stop this cue’s exception**; if it does, press it). Then says: "Move the first
      lower-third cue to the top, for this cue only." Then: "That was a mistake. Put it back to
      the graphic's own place, without undo." Done when it is back with **Stop this cue's
      exception**. Then: "Move all the lower thirds to the top." Then: "That was a
      mistake too. Undo it." Done when it is back with Ctrl+Z. Each recovery must reach the
      output (take or update the cue when the page asks).
   Done for task 7 when each of steps 1 to 5 and 7 is on the output as asked (step 6 is the
   scope judgement, recorded). There is no time target (L2 AC-11).

For every task write down: the time, each wrong turn (a menu opened and closed, a field filled
wrongly, a question asked), and the words of anything that confused the participant.

**Task 6 recording** (L1 AC-11): every press in order with its time, the time between presses,
whether the task completed, every error, and every cue switch (a different cue selected). A screen
recording is the easiest way; keep it with the run's record.

**Task 7 recording** (L2 AC-11): a screen recording of the whole task, and for each step whether
it reached the output as asked.

## Comprehension questions

Ask after the tasks, without the app in front of the participant, and write down the answer in
their words. The right answer follows each question.

1. "New results arrive while a candidate card is on air. What changes on air?" (Right: the card
   follows that same person's newer figures by itself. It never changes to another person, and
   nothing new goes on air without a Take or Update.)
2. "What is the difference between PREVIEW and PROGRAM?" (Right: PREVIEW is only on this page;
   PROGRAM is what the outputs were told to show. "logged" means the server took the command; the
   page cannot see the actual picture.)
3. "The results stop arriving. What happens to the graphics on air, and what do you do?" (Right:
   they keep their last values; nothing is taken off. Look at when data was last received, Pause
   or use Fixed values and then Update for a card on air, and Resume or Update once it is back.)
4. "A Companion key turns amber with a '?' after you press it. Should you press it again?"
   (Right: not before looking at the output: it is not known whether it ran, and it is never sent
   again by itself.)
5. "What does pinning a graphic do?" (Right: its live controls stay on screen whatever cue is
   selected, and they act on that graphic's cue that is on air.)
6. "You made a change in Adjust. When does it reach air, and which cues does it change?" (Right:
   at Take or Update. **Only this cue** changes this cue; a change to the graphic's default
   changes every cue of that graphic, except what a cue set for itself.)

## Reading the results: four of five

The same rule as the parent and data trial (the content kit): run the kit with five
participants. Read a task as passed when at least four of the five finish it unaided and answer
its questions right (tasks 1 to 4 against questions 1 to 3, task 5 against question 4, task 6
against question 5, task 7 against question 6). Report each task's median time; there is no time
target. A single participant is a pilot: note the findings, do not read a verdict. When a task
fails for two or more participants, that task fails whatever the totals say. The trial's own
result is reported, never required (owner, 2026-10-20, D).

**Who may take part.** Never anyone who built, reviewed or checked these features. Someone who
took part in an earlier NoaCG trial may take part again only if their familiarity is written in
the run's record (which kits and when, and how often they use NoaCG). The record names no one:
write P1 to P5.

## Where findings go

- Each run of this kit is recorded in `trial.md` in this folder (create it at the first run):
  the build, the date, each participant's familiarity (no names), each task's result, time and
  recording, each question's answers, and the issues filed.
- One GitHub issue per finding, titled `Expanded trial: <what went wrong>`, labelled with its
  area (`playout` for the production page, `data` for sources and Connect data, `control` for
  Companion) and a priority (`P1` to `P3`), quoting the participant's words and the time lost and
  naming the build. A finding in an operator guide is a change to that guide: the
  [runbook](../runbook.md), Companion's `HELP.md` (with its test), or the election
  [`rehearsal.md`](../../playout-election-package/rehearsal.md).
- After a fix, repeat the affected task with a participant who has not done it before, and say so
  in `trial.md`.
- Link each issue in `trial.md` and in the table below.

| Run | Date | Build | Participants (familiarity recorded) | Tasks passed (of 7) | Questions right | Issues |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
