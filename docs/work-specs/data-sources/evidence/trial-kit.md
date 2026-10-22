# Trial kit: content newcomer tasks

For the unaided newcomer tasks of data-sources AC-14, sheet-data-flow AC-12 and audience-flow
AC-7 (owner decision D, 2026-10-20): someone who has never used NoaCG's data or message tools does
each task on a fresh production with no documentation. The kit never gates a phase. The owner runs
it when there is time and reports; each finding becomes an issue.

## What you need

- The build to trial: noacg.studio, or a local dev server on a known commit. Write the commit (or
  the date and time for noacg.studio) in the results table.
- A signed-in account and a **fresh, unpublished production** made from a scoreboard
  (for example Club Scorebug) and a news ticker. Add a lower third and a custom graphic only when
  task 5 starts (below).
- A Google Sheet shared as "Anyone with the link can view", with one tab of five ticker lines
  under a header `Text`, and a second Sheet for messages with columns `Name` and `Message` and
  three rows, one of them with a first name and a surname. Keep both open on a second screen
  for the proctor, out of the participant's sight.
- A public RSS or Atom feed address (any news site's feed) in a text file on the desktop.
- For task 4: the production published, its "Another system" card's generated sender file saved
  on the desktop, and a terminal or a double-click that runs it. The proctor prepares this; the
  participant only runs it.
- For task 5: a custom graphic with at least five text fields with unfamiliar labels (the blank
  template, labels in a language the participant does not expect is fine), added to the
  production as a cue.
- For tasks 6 to 8: a chat window (any messaging app, or a text file) on the same screen holding
  this raw message: `Hi from Tampere! Is the second half starting soon? -Mikko Laine, 040 123 4567`
  and a second one: `Great match so far, greetings to the commentators -Aino`.
- A timer and this page for notes. Do not help, point or explain while the clock runs. If the
  participant is stuck for two minutes, note where, help, and count that task as not done.

## Tasks

Read each task aloud as written. Start the timer at the start of each task and note the time at
its end. Data tasks (data-sources AC-14, sheet-data-flow AC-12):

1. **Paste rows.** "Put these five lines on the ticker and put it on air." (Hand over the five
   ticker lines as copied cells from the Sheet.)
2. **Connect a Sheet.** "Now make the ticker follow this Sheet instead, and put it on air." Give
   the share link. When it is on air, the proctor changes one line in the Sheet. "Make sure the
   changed line is what is on air." (It should arrive by itself within a few seconds.)
3. **Connect a feed.** "Make the ticker show the headlines from this feed." (The address in the
   text file.)
4. **Push a score.** "This file sends a score from another system. Run it and check the score
   on the scoreboard." (Prepared sender, published production.)
5. **Custom graphic as a unit.** "Fill in this graphic's values in a spreadsheet and connect the
   whole graphic to it." The participant downloads the graphic's data template, imports it into a
   new Sheet tab, fills it and connects it. Before they connect, the proctor renames one Field ID
   in the Sheet so that it matches nothing. "One value is not showing. Fix that."

Message tasks (audience-flow AC-7; tasks 6 and 7 repeat the paste pilot):

6. **Paste a message.** "Put the viewer message from the chat window on air on the scoreboard's
   message card. Leave out the phone number. Show the name as just 'Mikko' and shorten the text if
   you like." Accept the card the app offers, preview, prepare and Take.
7. **A second message while the first is on air.** "Prepare the second message so it is ready
   next, without changing what is on air." (PROGRAM must not change.)
8. **Messages from a Sheet.** "Viewers' messages also come in through this Sheet. Connect it and
   put the second message on air, without the surname." Give the message Sheet's link. While the
   participant works, the proctor edits one message's text and moves the rows into a different
   order. Note whether what was prepared or aired changed.

For each task write down: the time, each wrong turn (a menu opened and closed, a field filled
wrongly, a question asked), and the words of anything that confused the participant. For task 8
also write down whether the prepared or aired text changed when the Sheet was edited (it must
not).

## Comprehension questions

Ask after the tasks, without the app in front of the participant, and write down the answer in
their words. The right answer follows each question.

1. "What happens when you press Take?" (Right: the cue in PREVIEW goes to PROGRAM. On an
   unpublished production it reaches this page only; published, it is sent to the outputs, and
   PROGRAM's tag says when the server logged it.)
2. "If someone edits the Sheet now, what changes on air?" (Right: a connected list or value
   follows within a few seconds, unless it is paused. A message already prepared or on air does
   not change.)
3. "If someone adds a row, what happens to the cue you prepared?" (Right: nothing. A connected
   list gains the row; a prepared message cue keeps exactly what was prepared; a new message row
   is a new candidate in Messages.)
4. "Where did this value come from?" Point at a connected field. (Right: the source it names, a
   Sheet, a feed or another system, shown in the cue editor and the sources line, with when it was
   last checked and changed.)
5. "Which target will this button affect?" Point at Take. (Right: what the line under the
   buttons names: this page only, or the outputs and slot it lists.)
6. "What is confirmed on air, and what is only preview or pending?" (Right: PREVIEW is only a
   preview; "sending…" is pending; "logged" means the server took the command. No output reports
   its picture back, so nothing is shown as a confirmed picture.)

The message tasks (6 to 8) are read against questions 1, 2 and 6, the three that apply to a
message (audience-flow AC-7). The data tasks are read against all six.

## Reading the results: four of five

Run the kit with five participants who have not used NoaCG's data or message tools before. Read
a task as passed when at least four of the five finish it unaided and answer its questions right.
Report the median time of each task; there is no time target. A single participant is a pilot:
note the findings, do not read a verdict. The trial's own result is reported, never required
(owner, 2026-10-20, D).

## Where findings go

- Each run of this kit is recorded in `evidence/trial.md` in this folder (create it at the first
  run): the build, the date, the participants (no names), each task's result and time, each
  question's answers, and the issues filed.
- A run of only tasks 6 and 7 on C0's build is the paste pilot; it is recorded in
  `evidence/trial-paste.md` in this folder.
- One GitHub issue per finding, titled `Content trial: <what went wrong>`, labelled with its area
  (`production-data`-style areas use `playout` for the production page, `dev` for anything else)
  and a priority (`P1` to `P3`), quoting the participant's words and the time lost, and naming the
  build. Link each issue in `evidence/trial.md` and in the table below.

| Run | Date | Build | Participants | Tasks passed (of 8) | Questions right | Issues |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
