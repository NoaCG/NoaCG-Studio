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
- **Production E (election)**, prepared by the proctor exactly as
  [`playout-election-package/rehearsal.md`](../../playout-election-package/rehearsal.md),
  "Before the rehearsal", steps 1 to 4: the pack imported and published, the source registered,
  the replay server started with `--step-ms 60000` and the agent running. Open its output in a
  second browser window beside the production page. Then add one graphic from the library with a
  title and one empty number or text field (any lower third works), titled `Counted`, as a cue
  that is connected to nothing. Keep the agent's and the replay server's windows on the
  proctor's screen, out of the participant's sight.
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
- A sheet of paper with the replay results address (`https://127.0.0.1:8443/results`, or the one
  the replay server printed). Never write a key or token on it.
- A timer and this page for notes. Do not help, point or explain while the clock runs. If the
  participant is stuck for two minutes, note where, help, and count that task as not done.

## Tasks

Read each task aloud as written. Start the timer at the start of each task and write the time at
its end.

On production E:

1. **Connect a sample API.** "The `Counted` cue should show how much of the vote is counted, from
   the results address on this paper. Connect it so it follows the results, and put it on air."
   Done when the cue's field is connected (it reads "🔗 Connector: …"), the cue is on air, and
   the value on the output changes by itself when the next replay step arrives (within about a
   minute).
2. **Select a live candidate.** "Put Leo Example's candidate card on air." Then: "Now get Sara
   Example's card ready, without changing what is on air." Done when Leo airs, and Sara is
   prepared while the output still shows Leo.
3. **Preview or air.** Without touching anything: "Which person is on air now, and which one is
   only prepared? Show me where you read that." Done when the participant names Leo as on air
   from PROGRAM or the output, and Sara as only prepared from PREVIEW or the editor's "Not on air
   yet" line.
4. **Recover a source failure.** Before reading the task, the proctor stops the agent (Ctrl+C)
   and waits for one replay step to pass. "The count has not moved for a while. Find out whether
   the results are still arriving, and keep what is on air safe." When the participant has
   acted, or after three minutes, the proctor starts the agent again with the same command. "The
   results are back. Carry on." Done when the participant finds that nothing new arrived (the
   Data page's **Another system** card, "Received N min ago"), keeps the graphics on air rather
   than taking them out, holds the data (**Pause**, or **Fixed values** on a candidate cue), and
   after the restart lets the new values reach air (**Resume**, or picking the candidate again and
   **✎ Update**).

On the Companion production:

5. **Use a declared Companion button.** "Put a key for the imported graphic's Mark action on a
   Companion button. Take the graphic's cue, then use the key to write 'from the deck' on air
   without typing on the production page." Done when the output shows "from the deck" after the
   press. (This is the E6.2 kit's tasks 4 and 5 in one.)

On production Q (L1 AC-11, the two-graphic show; record it press by press, see below):

6. **The two-graphic show from one screen.** "Take the quiz question and the score banner. Pin
   the score banner. For this question, pick answer B, lock it in, reveal the correct answer, and
   give competitor 1 one point. Do not select another cue while you do it." Done when the output
   shows B locked and revealed and competitor 1's score one higher, with no other cue selected
   after the pin.

On production A (L2 AC-11, the adjustments; each prepared on PREVIEW, then taken or updated):

7. **Adjust from one screen.**
   1. "Move the lower third to the right and nudge it a little up. Put it on air."
   2. "Make the score banner 5 % smaller, on air."
   3. "The quiz board looks too big. Decide whether making it smaller is enough, and say what you
      would do instead if it is not." (The Adjust block's line "smallest text N px" turns amber or
      red; the remedies, in order: resize a little while the line stays amber or green; use the
      lower third if the content fits a strap; otherwise ask for a compact companion graphic.)
   4. "Set the quiz cue's text to bold, on air."
   5. "Turn the production look on and send it to what is on air."
   6. The proctor says: "Only the second lower-third cue should sit on the left; the first one
      stays where you put it." Done when the second cue sits on the left (**Only this cue**) and
      the first has not moved. If the change lands in the wrong place (the graphic's default, so
      the first cue moved too, or an exception on the first cue), say "Put the first one back
      where it was"; done when they recover it with Ctrl+Z or with **Stop this cue's exception**
      on the cue that should not have one. Write down which scope they used first.
   Done for task 7 when each step is on the output as asked. There is no time target (L2 AC-11).

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
   or use Fixed values if needed, and Resume or Update once it is back.)
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
