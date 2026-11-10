# Interaction: one tab for everything audience

Authority: owner, 2026-11-09, issue [#2299](https://github.com/NoaCG/NoaCG-Studio/issues/2299).
**Agreed** by the owner on 2026-11-09 ("the Interaction plan is agreed"), after the decisions
below were made one at a time and the plan was revised from an independent second opinion the
owner supplied ("Review revisions" below). It runs as its own plan run.

This spec replaces, in `docs/work-specs/audience-flow/spec.md`, the non-goal "Join-page branding"
and the section "Join, presenter and votes" except the presenter view, which stays with its own
issue. Everything else there (candidates, staging, destination hygiene, YouTube, Sheet, paste) is
kept and built on. It also covers the live-vote half of
[#785](https://github.com/NoaCG/NoaCG-Studio/issues/785); the sample poll SVG item stays there.

## Problem

From the owner's studio test on 2026-11-09 and the code:

1. Audience things are in three places: Messages (inbox, paste, YouTube, Twitch, Sheet, votes),
   Links ▸ Audience (the join link and its name) and nowhere (no QR code exists in the app).
2. Phones show a default heading per mode. The join page's `prompt` has no editor.
3. The phone page takes the production's colours and font, but not its logo.
4. A vote is composed and opened in one go. There is no list of prepared questions.
5. Setting the room to waiting leaves a database round open: `audience_vote` checks only
   `closed_at` (migration 0035), so phones can still vote.
6. Which cue a round was staged onto lives in browser memory (`stagedCue` in
   `ProductionAudienceWorkspace.tsx`), so a reload or a second operator makes a duplicate cue.
7. Results reach air only on the five live vote boards, one layout each, and a board's own
   20-second timer can say "voting closed" while phones still vote.
8. Nothing on air tells viewers how to join: no join graphic, no QR code.

## Goal

An operator opens **Interaction**, writes the show's questions before air, and during the show
picks which question the phones answer now. Viewers join in one scan or one short link, on a page
that carries the production's look and logo. Answers become messages or result graphics the
operator adds to the rundown as ordinary cues. Nothing airs by itself.

## Owner decisions (2026-11-09)

- **D1. A separate question list, not the rundown.** The operator picks which question is live.
  A question can stay live all show or for one segment. With none live, phones show the waiting
  text.
- **D2. Link: `noacg.studio/j/<name>` and a QR code.** No extra domain, no typed number codes.
  `/join/<name>` and `/join?p=<slug>` keep working.
- **D3. Phone messaging later.** WhatsApp gets its own issue. Here, YouTube and Twitch chat count
  as votes while a multiple-choice question is live.
- **D4. Branding follows the production's look**: colours, font and the look's one logo. No
  separate phone look. Page settings: a title and the waiting text only.
- **D5. Three question types**: Open (a sentence, lands as a message), Multiple choice (2 to 8
  options, a vote), Word (one short word, a word cloud; last phase). How results are shown is
  chosen afterwards.
- **D6. Paste stays in Interaction**, one message per paste, filed under the live question by
  default or under none, with the destination shown beside Paste.
- **D7. Unpublished: everything works except phones.** Publish sits where the QR code will be.
  Nothing publishes by itself.
- **D8. Graphics.** A Join card and a QR code any graphic can carry. Result templates in several
  layouts and placements, over a studio picture, following the production's look. Anyone can
  make their own by SVG import or the CLI.

Related, not blocking: [#2303](https://github.com/NoaCG/NoaCG-Studio/issues/2303) (publishing
while live), [#2304](https://github.com/NoaCG/NoaCG-Studio/issues/2304) (idle published
productions).

## Non-goals

- Anything reaching Program without an operator's press, except the existing opt-in switch
  "update the percentages on air while voting".
- WhatsApp, SMS, a separate short domain, number join codes, viewer accounts, results on phones.
- Jury plus audience scoring on one board.
- Renaming persisted identifiers (the view's stored key, storage keys, tables, CSS prefixes).

## Screens

### Interaction tab (was Messages)

Same place in the view switcher; Setup lists "Interaction…". Three areas, stacking on a narrow
window:

1. **Questions.** One row per question: type mark, text, answer count. Pressing a row
   **selects** it to look at; that never changes phones or air. One row may carry the **Live on
   phones** mark. Each row has **Go live**; the live row has **Stop**. "+ Question" asks for the
   type, then the text and options. Rows reorder by drag and keyboard.
2. **Selected question.**
   - Multiple choice: options with bars, phone and chat counts apart and summed, and **Add
     results to rundown** naming the remembered result graphic, with **Change**.
   - Open: its messages (the inbox filtered to it) with "Prepare cue on <graphic>" and Reject.
     A filter shows all messages or those with no question.
   - The question's menu has Duplicate and **Clear results** (two presses, not while live).
3. **Join.** A live phone preview. Published: QR code, `noacg.studio/j/<name>` with Copy,
   **Download QR** (PNG, SVG), **Add Join card to rundown**, the link name (moved from Links;
   Links keeps a pointer). Unpublished: "Phones can join once this production is published" and
   **Publish**; signed out, the sign-in prompt in that spot only. Page settings: title (default
   the production name) and waiting text. Folded "More ways in": YouTube, Twitch, message Sheet,
   Simulate. **Paste** sits here with "Files under: <live question>" and Change.

### Phone page (`/j/<name>`, `/join/<name>`, `/join?p=<slug>`)

The look's colours, font and logo; the title; then the live question with one input (Open), large
option buttons (Multiple choice) or a one-word input (Word). After sending: thanks, and for a
vote the picked option, changeable while live. No question live: the waiting text.

## Question lifecycle

- **Question** (in `Show.questions`, saved and synced with the production): stable `id` (a
  random id made once, never reused), `type`, `text`, `options` (multiple choice), order.
- **One question, one result** (owner, O1). Each question has one result record on the server:
  an `audience_rounds` row extended with `question_id` (unique per production) and the kinds
  `open` and `word`, holding a snapshot of the text and options. Answers carry its `round_id`;
  votes already do. A viewer has one vote per question and can change it while the question is
  live.
- **Go live** is one server function, `audience_go_live(slug, question)`: in one transaction it
  closes any other open round, opens this question's round (creating it the first time,
  reopening it after), and sets the state's mode, prompt and `question_id`. **Stop** is
  `audience_stop(slug)`: closes the round and sets waiting. Both bump `rev`. Concurrent presses
  end with exactly one open round: the later transaction wins. Going live again continues the
  same count. The local provider does the same in memory.
- **Server checks**: `audience_submit` and `audience_vote` take the round id and the round's
  **revision** the phone read, and refuse a round that is not open or a revision that is not
  current; `question_id` is never taken from the client. The revision changes whenever the
  round's snapshot can change (an edit going live, Clear results), never on a plain reopen, so a
  phone that read the same question earlier still counts into the same result.
- **Editing**: text and options are locked while the question is live, and locked once it has
  answers, so the result always matches what was asked; Duplicate makes a new question that
  starts from zero. Type never changes after creation.
- **Clear results**: in the question's menu, two presses, only while the question is not live.
  It removes that question's answers and votes (server function `audience_clear_results`) so a
  rehearsal does not count on air. A cue already staged keeps its values until the next stage.
- **Deleting** a question with answers removes it from the list; its answers and cues stay and
  are shown under "Earlier questions".
- **Stale phones**: a phone that sends to a closed round gets "That question has closed", keeps
  the typed text in the box, and shows the new question (or the waiting text). The answer is
  never filed under the next question unless the viewer sends again.

## Chat votes

- While a multiple-choice question is live and a YouTube or Twitch chat source is connected, a
  chat message that is only an option's number or letter (`2`, `B`, `b`, ` 2 `) is a vote. Other
  messages go to the inbox as today.
- **Identity**: `yt:<channel id>` or `tw:<user id>`, never the display name. **Dedupe** by the
  platform message id. **Order**: the platform's own timestamp decides; per author the latest
  timestamp wins, whatever order messages arrive in.
- **Window**: only messages timestamped after the question last went live, and before it was
  stopped, count. So
  the "earlier" first page, a backlog read after Pause, and a reconnect's replay cannot vote on a
  new question. A small allowance for clock difference is measured in the fixtures, not guessed.
- **Intake**: a new operator function `audience_operator_votes(slug, round, items)`, at most 500
  items a call, with its own limits, separate from the message throttle (20 per 10 seconds per
  production in 0035) and from viewer votes. Vote rows gain `source` (`phone` or `chat`) so the
  panel shows both counts. Read in the operator's browser like chat today, so it counts only
  while a production page is open; the panel says so.

## Results to the rundown

- **Staging writes cue values and nothing else.** No Take, Update or graphic event is sent by
  Go live, Stop, staging or a question edit. The one exception stays the existing switch "update
  the percentages on air while voting", which acts only on a cue already on air.
- **The association is saved with the production**: `Show.resultCues` maps each question to
  its cue id. Reload, a tab change or a second operator updates that same cue. If that cue was
  deleted, or its graphic no longer has the result fields, the next press makes a new cue and
  says so.
- **Remembered result graphic**: `Show.resultTarget`, like the existing `messageTarget`: chosen
  the first time from the production's result graphics or the catalog, shown on the button,
  changeable with **Change**.
- **Closing**: Stop writes "voting closed" into the staged cue's count line, as closing a round
  does today. It reaches air only through Update or the live-figures switch. It never moves the
  board to its result state; the reveal stays the operator's press. A cue staged from a vote
  drops the board's automatic voting timer, the same way imported boards drop it today.

## Graphics

- **Field contract** for result graphics: fields titled Question, Options (one `label | count`
  line each) and optional Vote count and Figures (`percent`, `count`, `both`); today's
  `voteBoardFields` matching. Matching supplies values; it does not draw anything.
- **Drawing**: catalog result templates draw themselves. Imported artwork uses the existing live
  vote behaviour (`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §12): the designer draws each bar at full
  length and NoaCG scales it to its share. CLI-made result graphics use the same behaviour. Bars
  across come first; bars up and pie or donut for imported artwork follow in phase 5.
- **Join card and QR layer**: the QR is drawn inside the graphic from a field titled **Join
  link**, with the QR encoder bundled in the graphic, so an exported graphic stays self-contained
  and works offline. "Add Join card to rundown" fills Join link from the production. When the
  link name changes, Interaction offers to update cues that carry the old link. A layer named
  `QR` in imported SVG, the editor or the CLI becomes this QR (phase 5). An empty Join link draws
  nothing.

## Joining

- `/j/<name>`: added to the join entry's path parser (`src/join/main.ts`), the dev and preview
  routing (`PATH_PAGES` in `vite.config.ts`) and the Vercel rewrite beside `/join/:name`. Same
  names and reserved list.
- **QR**: an established, MIT-licensed browser QR encoder (for example `qrcode-generator`), error
  correction M, no third-party QR service.
- **Logo**: published to a public storage path named by the production and the file's hash; the
  join state carries its URL. A new logo gets a new path; removing it clears the URL. If it fails
  to load, the page shows the title with no broken image. The brand's 300 KB cap stays.
- **Contrast**: text on the page meets WCAG AA (4.5:1 for body text, 3:1 for large text and
  button edges); where the look's colours fail, text switches to black or white, whichever
  passes. If the look's custom font fails, the system font is used and the layout holds.

## Acceptance criteria

### AC-1: Everything audience is in one tab called Interaction
The view and Setup say Interaction; Messages no longer appears as a name. Questions, the selected
question, Join and the sources are in it; Links points to it. Stored keys are unchanged, so an
existing production opens with its inbox and sources intact. Layer: journey in
`e2e/production-audience.spec.ts`; Node test that the persisted view key is unchanged.

### AC-2: Questions are prepared, browsed and changed safely
Open and Multiple choice questions are added, edited, reordered, duplicated and deleted, and
survive reload locally and published. Selecting a row changes nothing on phones or Program. The
text and options are locked while the question is live (even with no answers yet) and once it
has answers; type never changes. Going live again
continues the same count and a phone that voted before can change, not add, its vote. Duplicate
starts from zero. Clear results needs two presses, is refused while live, and leaves zero
answers and votes. Deleting a question keeps its answers. Layer: Node tests for the list model
and the local provider; configured suite for reopen and clear; journey.

### AC-3: Go live and Stop are atomic and enforced by the server
After Stop, or after another question goes live, a vote or answer sent to the closed round is
refused by the server. Two operators pressing Go live on different questions at the same moment
end with one open round and the state pointing at it. Switching from Multiple choice to Open
closes the round. Layer: configured suite calling the functions directly and from two pages; Node
tests for the local provider.

### AC-4: A stale phone loses nothing and misfiles nothing
A phone holding a closed question that sends an answer or vote sees "That question has closed",
keeps its typed text, and shows the new question; nothing is filed under the new question until
the viewer sends again. After Stop, Clear results, an edit and Go live again, a phone still
showing the old options is refused rather than counted against the new ones. Layer: journey with
two pages (operator, phone) on the local provider; configured suite for the server refusal.

### AC-5: Joining takes one scan or one short link
Published, Interaction shows a QR code that decodes to `https://noacg.studio/j/<name>`, Copy and
Download QR; `/j/<name>`, `/join/<name>` and `/join?p=<slug>` all open the page, in dev, preview
and production. Cold load: Playwright Chromium, a new context (empty cache), 390 x 844, network
throttled to 1.6 Mbps down, 750 kbps up and 563 ms latency; from navigation start to the live
question's text visible; the median of 5 runs is under 3 seconds against the local stack. Layer:
blank-page spec decoding the QR; journey with throttling; Node test for the path parser.

### AC-6: The phone page carries the production's look and survives bad assets
Colours, font, logo, title and waiting text appear. A low-contrast palette still meets AA as
defined above; a broken logo URL shows no broken image; a failing custom font falls back with the
layout intact; replacing and removing the logo take effect on the next read. Layer: blank-page
spec over `joinSurface` with each case; journey for the settings.

### AC-7: Answers arrive under the question they were sent to
An Open answer and a vote are filed under the question whose round they were sent to; paste goes under
the destination shown beside it (the live question by default, or none). Changing the live
question never moves earlier answers. Layer: Node tests over the local provider; configured
suite for `round_id` and server refusal of a client-chosen question.

### AC-8: Unpublished productions rehearse everything but phones
Questions, Go live, the phone preview, paste and Simulate work offline with no account. Where the
QR goes, the page offers Publish; signed out, the sign-in prompt appears there only. Nothing
publishes without the press. Layer: journey offline; `e2e/auth.spec.ts` keeps zero auth UI
offline.

### AC-9: Results reach air only as cues the operator takes
Add results to rundown stages one cue on the remembered graphic; a second press, a reload, a tab
change or a second operator updates the same cue; a deleted cue or a destination without the
fields gets a new cue with a note. Go live, Stop, staging and edits send nothing to Program: the
output's command log gains no rows from them, except live figures with the switch on and the cue
on air. Stop writes "voting closed" to the cue and never moves the board to its result state.
Layer: Node tests for staging and the mapping; journey through Take with the log counted; a
mutation that sends Update on staging must fail.

### AC-10: Chat votes count once, in order, inside the window
With recorded YouTube and Twitch fixtures: a number or letter counts once per author; a repeated
message id counts once; out-of-order arrival keeps the latest by platform time; the earlier page,
a paused backlog and a reconnect replay do not vote on a new question; non-vote messages reach
the inbox; phone and chat counts show apart and summed; a burst of 500 chat votes is not limited
by the message throttle. Layer: Node tests with fixtures; configured suite for the operator
function.

### AC-11: A basic Join card works on air and exported
"Add Join card to rundown" adds one Join card cue whose QR decodes to the production's link; it
takes placement and scale from the cue editor's controls; an exported Join card, opened with no
network, still draws a QR that decodes to the same link. Layer: blank-page spec decoding the
rendered QR, live and exported.

### AC-12: Result templates fit real productions
Result templates in three layouts (bars across, bars up, pie or donut) and three placements (full
screen, lower third, side), over a studio picture with a transparent background, take 2 and 8
options and long names without overflow, show percent, count or both, follow the look, and pass
the catalog's visual quality gates. Layer: quality gates; blank-page specs; owner look on taste.

### AC-13: Home-made result and join graphics render correctly
An SVG outside the sample set with bars drawn at full length and layers titled Question, Options
and Vote count imports and, rendered with known counts, draws each bar at its share within one
pixel; the same from the CLI; a layer named `QR` renders a QR that decodes to the Join link. The
contract is written in the import and CLI docs. Layer: blank-page specs rendering the imported
and CLI-made graphics.

### AC-14: Word questions make a word cloud the operator approves
A Word question takes one word of at most 25 characters per phone. Interaction lists words by
frequency; hidden words never reach the cue; staging puts a snapshot on a word cloud cue. Layer:
Node tests; journey through stage and Take.

### AC-15: The whole flow is rehearsed after each phase
On the local stack a phone-sized browser joins by the QR link, answers an Open question and a
vote, results go to the rundown and air through Take, and the room moves through three
questions. Run first at the end of phase 3, then repeated with each later phase's additions.
Findings are filed; blocking ones are fixed before the phase passes. Layer: scenario run in
`evidence/`.

## Phases

1. **Questions and their lifecycle** (AC-1, AC-2, AC-3, AC-4, AC-7, AC-8): rename; the list;
   selected versus live; `audience_go_live`, `audience_stop` and `audience_clear_results`; one round per question;
   `round_id` on answers; stale-phone handling; paste destination.
2. **Joining and a basic Join card** (AC-5, AC-6, AC-11): `/j/`, QR in the panel and download,
   link name moved, page settings, logo, contrast and fallbacks; one Join card design.
3. **First complete flow** (AC-9, AC-15 first run): Add results to rundown on the existing vote
   boards, `Show.resultCues` and `Show.resultTarget`, closing behaviour, Program safety.
4. **Chat votes** (AC-10; walk repeated).
5. **More results and home-made graphics** (AC-12, AC-13; walk repeated): the template
   combinations, the field contract docs, imported and CLI result graphics, the `QR` layer.
6. **Word questions** (AC-14; walk repeated).

Each phase lands on its own through `/queue-merge` and adds what the next must know to "Phase
notes".

## Owner decisions after review (2026-11-09)

- **O1. One question, one result.** Going live again continues the same count; a fresh count is
  a duplicated question. Owner: "one question has one result. If you need to have many results
  for a question, you can just make a new question."
- **O2. Clear results** for testing, as above. Owner: "Yes, let's add the Clear Results button.
  It can be very useful when testing."

## Review revisions (2026-11-09)

From the independent review the owner supplied. All six points were taken; adjustments:

- The question-to-result link is an extended `audience_rounds` row rather than a separate
  table, so one mechanism snapshots text, holds the open/closed state the server checks, and
  carries answers and votes. After O1 there is one such row per question.
- Stale phones are refused by **round id**, which the phone already reads, rather than by a
  question id the client could choose.
- The QR layer reads a **Join link field** rather than the production at play time, which is
  what keeps exported graphics self-contained.
- AC-5's cold-load target is 3 seconds at the stated throttling, set from the RPC round trips
  that profile implies; the builder records the measured baseline in phase 2's notes.

## Phase notes

### Phase 1: Questions and their lifecycle

Previous verified main: `3985c140631173c267c5e93b37741a15bab8d88c`. Revert of this merge:
`git revert -m 1 <merge sha>` (the merge sha is in `evidence/phase-1.md` once it lands), AND a new
migration that restores 0035's `audience_submit(text, text, text, text)`, `audience_vote(text,
text, uuid, int)`, `audience_set_join` and `audience_close_round`, and 0036's `audience_open_round`.
Migration 0111 is not purely additive: it drops the phone signatures that named no round and makes
the old door and round writers refuse (R18, R19), so the old app cannot run on it. Its columns,
index and new functions can stay; nothing old reads them.

**Rules** (state rules written before code; each is observable):

- R1. A production has at most one open round at any moment. The database enforces it (the
  partial unique index of 0035) and `audience_go_live` and `audience_stop` take a row lock on the
  production first, so concurrent presses run one after the other.
- R2. A question has at most one round (unique per production and question id). Go live creates
  it the first time and reopens it after; the count continues.
- R3. Go live, in one transaction: closes every other open round of the production, opens this
  question's round, and sets the state to open, the mode (`question` for Open, `poll` for
  Multiple choice), the prompt (the question's text), the round and the question id, bumping
  `rev`. Of two concurrent presses the later transaction wins and one round is open.
- R4. Stop names the round it stops. In one transaction, if that round is still open, it closes
  it and sets the state to waiting (not open, no round, no question id), bumping `rev`; if another
  question went live meanwhile, Stop changes nothing.
- R5. Each round has a revision, 1 when made. It goes up by one when Go live brings text or
  options different from the round's snapshot, and on Clear results. A plain reopen keeps it.
- R6. A phone's answer or vote names the round id and the revision it read. The server refuses
  it unless the round is this production's, open, of the matching kind (Open takes answers,
  Multiple choice takes votes) and at that revision. A closed or stale round is refused with
  "That question has closed". A question id is never taken from a client. The send holds a share
  lock on the round, so a Stop, Go live or Clear results either waits for it or is seen by it.
- R7. An answer is filed under the round it was accepted into, and nothing later moves it: not
  Go live on another question, not Stop, not an edit. A vote is one row per round and device;
  sending again changes it.
- R8. Text and options are locked while the question is live and once its round has an answer
  or a vote. The server refuses a Go live whose text or options differ from a round that has
  answers or votes, and one whose type differs from its round's. Type never changes. When Go live
  is refused for that reason (another tab edited a question that had answers), the page says so
  and offers Duplicate, which asks the changed words as a new question.
- R9. Clear results is refused while the round is open. It removes the round's answers and votes
  and bumps its revision. The UI asks for two presses.
- R10. Deleting a question removes it from the list only; deleting the live question stops it
  first. Its round, answers and votes stay; its answers are listed under "Earlier questions".
- R11. Duplicate makes a new question id with no round, so it starts from zero.
- R12. Selecting a row is screen state only: it calls nothing and saves nothing.
- R13. Paste files the message under the destination shown beside Paste: the live question's
  round by default when it is an Open question, otherwise none; the operator can change it to
  none. The server accepts only a round of this production. The cue editor's Fill paste files
  under none.
- R14. A refused stale send keeps the typed text, shows "That question has closed" and the new
  question (or the waiting text), and never resends by itself.
- R15. An unpublished production runs R1 to R14 on the local provider, with the same refusals.
  Its rounds, live state, votes and phone answers are kept in browser storage per production, so
  a reload, the production's other tabs and a rehearsal phone tab see the same rounds and a
  pasted message keeps its question. Simulated rows stay in memory, as before.
- R16. None of these sends a Take, an Update or a graphic event.
- R17. `Show.questions` is additive optional. The view key `audience`, the storage keys, the
  tables and the CSS prefixes keep their names.
- R18. Only Go live and Stop move the round and the live state. `audience_set_join` keeps the
  presenter pointers and the brand only; the old `audience_open_round` and `audience_close_round`
  refuse. The join resolve reports a production as not open unless a round is open, so a state
  left by an older page (a comment mode, a round with no question) shows phones the waiting text.
- R19. The old phone signatures (`audience_submit` without a round, `audience_vote` without a
  revision) are removed, so a page loaded before this change has its sends refused and counted
  nowhere.
- R20. Twitch chat keeps going in through the phone door, which is now the live Open question:
  a line is filed under it, and with no Open question live it is refused and counted as dropped,
  as with the door closed before. YouTube and the message Sheet keep the operator door and file
  under no question. (Chat votes are phase 4.)
- R21. Quiz rounds, the comment mode and the "Accepting messages" switch leave the panel: the
  spec's question types are Open and Multiple choice (Word is phase 6), and what phones see is
  the live question or the waiting text (D1).

Found after coding (in the code review), apart from the rules above:

- R22. A send never deadlocks with Go live, Stop or Clear results: those lock the production row
  `for no key update`, which the send's foreign-key check does not wait on.
- R23. When Stop finds another question live (R4), the page says nothing was stopped and leaves the
  staged cue alone.
- R24. A Twitch line refused because its remembered round closed is sent once more to the round
  live now, so a switch of question loses no chat line that arrived after it.

Found in the Codex review of the first head:

- R25. The local room store is changed by one tab at a time (one Web Lock for the store, which
  holds every production's room in one value), so neither a rehearsal phone's send nor another
  production's change can write back a room from before the operator's Stop.

Found in the final review of `dc19c95`:

- R26. A round an older page left open is closed by the migration, so no production keeps a round
  that no Interaction row can Stop.

Found in the Codex review of `ecd6c56` (the second finding of one family, so the rule was
reassessed by a fresh read-only review before the repair):

- R27. Whatever round is open on the provider the panel runs on (the published production's, or the
  local room), the panel offers Stop for it, whether or not its question is in the page's list: a
  line above the list names it and carries Stop when no row does.
- R10, amended: Delete asks the provider whether the question's round is open at the press, not the
  page's last reading, and stops that round. It removes the question once the round is closed
  (including when another question going live closed it), and keeps it only while the round is
  still open or the provider could not be read.

**Decisions** (made in the build, revertible in review):

- The question list is `Show.questions` (`src/model/questions.ts`), saved and synced with the
  production and left out of the publish digest: questions reach phones through Go live, so
  writing one never asks for a publish.
- Twitch keeps the phone door (R20), so with an Open question live its lines answer it and with
  none live they are refused as before. YouTube and the Sheet keep the operator door. The rules
  review asked whether this is a product decision; it is the reading closest to "as today" until
  phase 4's chat votes, and it is one line to change.
- A rehearsal phone page, `/join?rehearse=<production id>`, mounts the join surface over the local
  room in the same browser, with a small link from the Join area. It is what lets an unpublished
  production rehearse a phone (AC-8) and the two-page stale-phone journey run offline (AC-4).
- The local room (rounds, live state, votes, phone answers) is kept in browser storage under a new
  key, `spx-gfx-audience-room` (v1); the old inbox key is unchanged (R15, R17).
- Quiz rounds, the comment mode and the "Accepting messages" switch leave the panel (R21). "Stage
  counts to a graphic" and Stop writing "voting closed" into the staged cue stay as they were;
  phase 3 replaces them with Add results to rundown and `Show.resultCues`.
- The phone page shows the full question as its heading (up to 200 characters); the old 160
  character prompt cap would have cut long questions.

**Traps found** (for later phases):

- Go live, Stop and Clear results lock the production row `for no key update`, not `for update`:
  a phone's send holds a share lock on the round and then inserts a row whose foreign key takes a
  key-share lock on the production row. `for update` deadlocked that pair (reproduced on a scratch
  Postgres 16 with 0035 to 0111 applied; fixed and re-run before review).
- 0111 builds its two indexes concurrently and adds the answers' foreign key `not valid`, then
  validates it: phones insert into `audience_submissions` during a show, and a plain build or a
  validating `add column ... references` would hold their inserts for the scan.
- `e2e/_interaction.ts` holds the question steps every journey uses; `scripts/docs-shots.mjs` and
  `scripts/acceptance-pack.mjs` carry their own copies because they cannot import TypeScript.
- A rehearsal phone in a journey needs `page.clock.install()` before it loads, or its five-second
  poll can refresh it between the operator's press and the phone's, and it is no longer stale.

**Repair 1** (post-landing run 42627967625 red on merge `cdc1011`): the advisor step listed 0111's
client-callable definer functions as new since `supabase/advisor-baseline.json` and its replaced
`audience_submit` and `audience_vote` signatures as gone. The migration applied and the six ACs
passed; the build had not recorded the grants it meant. Each grant was checked against the
migration and is the intended, minimal door (`evidence/phase-1.md`, Repair 1), so the baseline was
re-recorded with `node scripts/supabase-advisors.mjs --input <report> --update-baseline` from that
run's report, and the reasons are named in `ACCEPTED_CLASSES`. No grant changed. The new
`scripts/advisor-baseline-grants.test.mjs` replays the migrations' grants and fails when the
baseline does not match them, so the next migration that adds or changes a client-callable
definer function records it in its own pull request, before landing.

- Trap: post-land's advisor check reads production, so it can only fail after the merge. A
  migration that adds, drops or re-signs a `security definer` function granted to `anon` or
  `authenticated` must change `supabase/advisor-baseline.json` in the same pull request; the
  offline test above now says so in CI.


### Phase 2: Joining and a basic Join card

Previous verified main: `afbe5cb0ce9aa3bc2da579ac9a42b60c9a6d1a38`. Revert of this merge:
`git revert -m 1 <merge sha>` (the merge sha is in `evidence/phase-2.md` once it lands). Migration
0112 is purely additive (a public bucket, its quota row, one insert policy) and nothing older reads
it, so the reverted app runs on it unchanged; removing it is a new migration that drops the policy
and the quota row and deletes the bucket once empty.

**Decisions** (made in the build, revertible in review):

- The link is `<origin>/j/<name>`: on noacg.studio that is `https://noacg.studio/j/<name>`, and a
  local or self-hosted build hands out its own origin, so the link always opens the page that made
  it (`src/join/joinPath.ts`). Links shows the same short link; `/join/<name>` and `/join?p=<slug>`
  keep working.
- The look (colours, font and logo) also reaches phones without a publish: Interaction keeps the
  phone page in step with the production as saved (rules P1 to P5), so a look edit shows on phones
  on their next read while the publish status still counts it as unpublished for the graphics.
  The phone page is not air, and AC-6 asks for the look on the next read; publishing it with the
  graphics would make phones lag the production's own settings.
- Title, waiting text and the logo's URL travel in the join state's existing `brand` value (no new
  column): publish writes it, and a change made while Interaction is open is sent through
  `audience_set_join`'s `brand` key, which merges on the server. Publish now uses that call too,
  instead of writing the whole state back from a read (which could undo a Go live in between).
  The page settings are `Show.joinPage`, saved with the production and left out of the publish
  digest, like the question list.
- The logo is published to the public bucket `join-logos` (0112) at
  `<user>/<production>/<sha-256 of the look's file>.<ext>`, raster only and 300 KB at most; an SVG
  logo is drawn to PNG first, so the bucket serves nothing that can run a script. Old files are
  not deleted (there is no delete or list policy, by design; the 20 MB per-user quota bounds them).
  A logo that cannot be published (signed out, refused, offline) never clears the one phones
  have: publish keeps the logo URL already in the join state, and Interaction sends nothing and
  says so. A publish never fails over the logo.
- Unpublished, the studio's phone preview takes the page (look, logo, title, waiting text) straight
  from the production; the rehearsal phone tab keeps the studio's own colours, as before.
- The page keeps the look's colours where they meet AA and switches to black or white where they do
  not (`src/audience/joinColours.ts`); muted text is a blended colour, never opacity. Field and
  option borders now reach 3:1, which makes them a little stronger in the default look too.
- The phone reads its view with one plain request instead of through supabase-js, which now loads
  only when the phone sends: median cold load 2.65 s before, 1.82 s after, on a build against a
  mock (evidence). The configured test measures a real build against the local stack.
- The Join card is one audience design, `jc01` House Join Card (house family, bottom-right). Its
  QR encoder is qrcode-generator 2.0.4 (MIT), vendored minified into
  `src/templates/shared/qrEncoder.min.js` by `scripts/qr-vendor.mjs` and checked against the
  installed package; the studio panel uses the package itself. "Add Join card to rundown" adds a
  cue to the production's Join card if it has one, else adds the card with its one cue.
- The link name moved from Links to Interaction's Join area. It shows only on a published
  production (where the link exists), so its offline test became a check that Links has no name
  control, and the claim, the empty-name refusal and the stale note are pinned against the real
  database in the configured walk.

**Traps found** (for later phases):

- A minifier writes the string `'$'` as a template literal, and `` $` `` inside a graphic's script
  is a `String.replace` pattern: the studio's preview splices scripts in with `replace`, so the
  script was cut short and `play` never existed. `scripts/qr-vendor.mjs` writes it as a plain
  string and its test refuses any replace pattern in the vendored file.
- The configured suite runs Vite's dev server, which ships about 2.5 MB to a phone; a cold-load
  number from it measures the dev server. Build the entry (`vite build` with `configFile: false`
  and the join input) and serve it with `vite preview` plus `scripts/app-clean-url.mjs`.
- `e2e/catalog-render-baseline.json` is recorded on Windows and compared only there; a Linux worker
  must not re-record it (it would replace every design's values). A new design is added there on
  the recording platform (#2319).
- A Node test that imports `src/audience/audienceTypes.ts` without the repo's resolver needs
  relative imports there to name the `.ts` file.

Found in the Codex review of `2e20660` (two findings of one family, keeping phones in step with
the page between publishes), stated as rules before the repair (`src/control/joinPageSync.ts`):

- P1. Interaction reads what phones get and sends the production's page only when it differs, so
  opening it repairs a change that never reached phones and otherwise sends nothing.
- P2. A change is sent a moment after it is made, even if the operator has left the tab: the wait
  and the send live outside the component.
- P3. Sends for one production run one at a time, and a send that a newer change superseded stops
  before it reaches phones, so phones end on the latest saved page.
- P4. A logo already published under its file's hash is not uploaded again; a logo that cannot be
  published keeps the one phones have, and the rest of the page still goes (amended after the
  final review of `a8eb578`: sending nothing held the words back too). Publish keeps the logo the
  same way. Only when what phones have cannot be read (the read throws) and the logo cannot be
  published does nothing go, since a send then could clear their logo; phones with no page yet
  get the rest of the page.
- The blank-page join tests live in the files that already own their subject, not a new spec
  file: the phone page and the studio QR in `e2e/production-audience.spec.ts`, the Join card in
  `e2e/audience-pack.spec.ts`. A new file is priced at the suite median until measured, which took
  the offline tier over the CI gate's capacity line; folded, the change adds no priced minutes. The
  measured cost on head `49f9a4d` was 0.10 min for those tests and 0.42 min for the Interaction
  journeys, less 0.08 min from the link-name test that moved to the configured walk.
- P5 (from the review of `a8eb578`, completed after the final review of `1bf6181`). Publish writes
  the page through the same one-at-a-time queue, which reads the production as saved when its turn
  runs, so a title changed during a long publish or a slow logo upload is not put back by it, and
  publish and Interaction's sync never overtake each other in one tab. A page-settings edit
  committed as the tab closes asks for its own sync.

Follow-ups filed: #2319 (render baseline on Windows), #2320 (offer to update Join card cues after
the link name changes; in the spec's Graphics section, not in phase 2's acceptance).

**Repair 1** (independent check checker-2-2-c-3487 on merge `d521e01`, AC-6): `joinColours`
checked contrast on fractional colours and `css()` rounded them to whole RGB, so a colour that
passed at 3.001:1 could render at 2.99:1 (about 2.7% of 100,000 random looks; four named looks).
Root fix: `over()` and `mix()` produce whole channels, so every colour the page gets is exactly the
one each check judged, for every pair the AA rule covers. `scripts/join-colours.test.mjs` judges
the rendered CSS strings for all eight pairs over the four named looks and 100,000 seeded random
looks (a quarter with a panel alpha); it is red on `d521e01` (2748 looks below AA) and adds no E2E
minutes (`evidence/phase-2.md`, Repair 1).

### Phase 3: First complete flow

Previous verified main: `f47aa360c411cc44f30ba95b09c853b93141ade1`. Revert of this merge:
`git revert -m 1 <merge sha>` (the merge sha is in `evidence/phase-3.md` once it lands). The phase
adds no migration; `Show.resultCues` and `Show.resultTarget` are additive optional, so an older
build ignores them and the reverted app runs on records that carry them.

**Rules** (state rules written before code; each is observable):

- S1. A question has at most one result cue. `Show.resultCues` maps the question's id to that
  cue's id and is saved and synced with the production, so a reload, another tab and another
  operator read the same mapping.
- S2. Add results to rundown, when the question's mapped cue still exists and its graphic still
  has the result fields (Question and Options, by title), writes the result values into that cue
  and adds no cue.
- S3. Otherwise it adds one cue on the remembered result graphic and records it as the question's
  cue in the same write. When a mapping existed it says why the cue is new: the earlier cue was
  deleted, or its graphic no longer has the result fields.
- S4. Update or add is decided on the production as stored when the write runs (a rebased write),
  not on the page's copy, so a second press while the first settles, or a press in another tab of
  the same browser, updates the cue the first press made. Another operator's press does the same
  once the production has synced to them.
- S5. The remembered result graphic is `Show.resultTarget`. With none, or one that can no longer
  take results, the press asks: the production's result graphics, or with none of those the
  catalog's live vote boards (added with their one cue, which becomes the result cue). Nothing is
  picked without the operator's choice; Change asks again. The choice is remembered.
- S6. A refused write says so and records nothing: no cue, no mapping, no remembered graphic.
- S7. Stop, after the server closed the round, writes the final counts, "voting closed" in the
  count line and the closed status into the question's mapped cue when it exists with the fields.
  Stop never adds a cue and never sends an event, so the board stays in whatever state it is in;
  the reveal is the operator's press.
- S8. Nothing in Interaction sends a Take, Update, Out, Next or graphic event. Go live, Stop,
  staging and question edits add no row to the output's command log. A staged cue already on air
  changes on Program only through the operator's Update; with the live-figures switch on, the
  board shows its figures from the field it already carries.
- S9. Staging writes only the result fields (Question, Options as `label | count` lines, and
  where present Vote count, Vote status and Live figures). The cue's other values, its label and
  its place in the rundown stay as they are.
- S10. Duplicate starts with no result cue. Deleting a question leaves its cue in the rundown.
- S11. `Show.resultCues` and `Show.resultTarget` are additive optional and left out of the
  publish digest, like the question list.

Added after the rules review (a fresh read-only `/so`, AGREE WITH CORRECTIONS), before code:

- S12. On a team production a save is merged with a teammate's, not rebased. `resultCues` merges
  question by question (`model/teamShowMerge.ts`): one operator staging Q1 while another stages
  Q2 keeps both links. Two operators pressing Add results on the same question at the same moment,
  before either save reaches the other, can make two cues; the merge keeps one link and the other
  cue stays in the rundown as an ordinary cue.
- S13. Stop's write is rebased like staging's and driven by the stored `resultCues`, so a Stop
  pressed in any tab finalises the cue another tab staged. A refused write is said: "Stopped, but
  the result cue was not updated".
- S14. A round closed by Go live on another question gets the same closing write as Stop, for
  the question whose round it was (coordinator decision, 2026-11-09; a close is a close).
- S15. The note always reports what the stored write did (updated or added, and why a cue is
  new), never what the page expected. The ✓ is said only once the durable write has landed.
- S16. Change, then picking a graphic, when the selected question already has a result cue on
  another graphic, adds a new result cue on the picked graphic and links it; the old cue stays in
  the rundown as an ordinary cue and the note says so (coordinator decision, 2026-11-09).
- S6, amended: a catalog board picked under S5 is added first, with its one cue; if the result
  write after it is refused, the board and its cue stay as an ordinary graphic and the note says
  the result was not written.
- S8, decided: the live-figures exception permits rows; this phase adds no automatic sender. The
  switch writes the board's Live figures field and the board shows its own figures (coordinator
  decision, 2026-11-09).

Found in the code review (`/check`), apart from the rules above:

- S17. The rebased write makes the new cue's id once, outside the part that runs twice, so the cue
  this tab shows is the cue the store keeps. The note and the page's productions come from the
  stored write after it landed (S15 made exact).
- S18. Change only opens the choice; Cancel keeps the remembered graphic. A pick is remembered
  whether it added a cue or landed on the cue already there (S5).
- S19. A catalog board's seeded cue that the stored write does not use is removed in that write,
  so one press leaves one board and one result cue.
- S20. Go live that finalises another question's cue (S14) says so in its note.

Found in the Codex review of `4230b2e` (three findings; S21 and S22 are one family with S15, the
stored write deciding):

- S21. Stop's close-only write reaches the stored record even when this tab's copy has no link
  yet: its first pass changes nothing but still asks for the rebased pass, which decides. A team
  production, not rebased, keeps its merge (S12).
- S22. When the stored pass has nowhere to write (another tab removed the graphic or its fields),
  nothing was written and the press asks again; Stop then says nothing about a cue. The tab's own
  guess is never reported as success.
- S23. A catalog board picked under S5 takes a free pool name ("House Vote 2"), so it never
  replaces a same-named graphic already in the production.

Found in the Codex review of `fb8a835`:

- S24. The button names where this question's press would write: its result cue's graphic while
  that cue can take results, else the remembered graphic (`resultDestinationOf`, the planner the
  write uses), so it never names one graphic and writes another.
- S12 kept as written: two team operators staging the same question before either save reaches
  the other keep two cues, one linked. The merge does not delete either, because one may already
  be on air; the unlinked one stays an ordinary cue in the rundown.

Found in the Codex review of `b854d6b`:

- S25. A press decides from state read at the press, never from the page's last reading. Go live
  reads the provider's rounds before and after its call and finalises each poll round the press
  closed (`roundsClosedBy`), so a question another operator put live meanwhile gets its closing
  write; the page's own reading counts only for a round the press-time reading lacks. Add results
  reads the round and its counts afresh, so a round stopped in another tab stages as closed. What
  remains is the moment between the press-time reading and the server's Go live, two calls apart.

Reassessed after the Codex review of `b4d62b5` (a stale snapshot written after a slow catalog-board
add, while Stop or Go live closed the round: the second successive round of one family, so a
fresh read-only review reassessed the rule model before any patch; AGREE WITH CORRECTIONS). The
missing rule was about the end state, not about when to read. S26 to S30 replace S25's read rule;
`roundsClosedBy` is gone.

- S26. Once a round is closed, its question's result cue ends up saying "voting closed" with
  counts read after the close, whatever order Add results, Stop and Go live ran in, in one tab,
  across tabs, or across operators on a production that is not a team's.
- S27. In one page, Add results, Stop and Go live take turns: one runs to its note before the
  next starts (one lock, held in a ref).
- S28. Values are read after every other wait of the press, immediately before the write. A
  reading that fails writes nothing; the page's earlier reading (its rounds, its counts) is never
  written.
- S29. A staging write that wrote "open" reads the round again once it landed; closed meanwhile,
  the same press makes the closing write with fresh counts. Stop and Go live make the closing
  sweep: every poll round the provider reports closed whose result cue still says open
  (`roundsToFinalise`, `resultCueSaysOpen`).
- S30 (residual, stated): on a team production, a Stop in a copy that has not yet synced the link,
  landing after the stager's re-check, leaves the cue open until the next Stop, Go live or Add
  results on that production.

Found in the Codex review of `6e258ef` (a defect in building S29, not a new rule: S26 already
says the counts are read after the close):

- S29, amended: the sweep always finalises the round the call itself closed, whatever its cue
  says (Stop names its round; for Go live, a round whose closed time changed between the
  provider's readings just before and just after the call). A reopened question's cue can still
  say "closed" from an earlier Stop while its counts moved on. "Cue still says open" only adds the
  rounds closed elsewhere.

**Decisions** (made in the build, revertible in review):

- The planner (`model/resultCues.ts`) and the record write (`model/shows.ts` `stageShowResult`)
  are one rebased write that decides update or add on the stored production; the page reports
  what that write did (S15). `control/resultStaging.ts` holds the field contract (`pollFieldMap`,
  `tallyValues`, moved out of the workspace) and the notes.
- With no remembered result graphic the press lists the production's result graphics, and with
  none the five catalog live vote boards (House, Volt, Frost, Clean, Floor). A board picked from
  the catalog arrives with its one seeded cue, which becomes the result cue.
- The live-figures switch stays as it was: it writes the board's Live figures field, and nothing
  sends Update automatically (S8). Go live closing another question's round finalises its cue
  (S14). Change then a pick starts a new result cue for the selected question (S16). The three were
  sent to the coordinator before the patch and confirmed by it as decisions the owner can revert.
- The vote field words (`Vote status`, `Live figures` and their tokens) moved to
  `model/voteFields.ts`, re-exported by `vote.ts`, so the staging module runs in
  Node without the recipe machinery. No emitted byte changes.
- The rehearsal walk on the local stack is a configured test (the existing published walk,
  extended), because it has to run where a local stack exists; this machine walks it offline.

**Traps found** (for later phases):

- A Take adds more than one row to the action log (Took, Played in, Updated n fields). A journey
  counts the rows after the Take and asserts nothing else adds any, rather than adding one.
- The local provider's simulated device ids restart on reload (`sim-<option>-<n>`), so Simulate
  votes after a reload overwrites earlier simulated votes instead of adding. Simulate before the
  reload in a journey.
- A prepared message cue is labelled by the message text, not by the card's name.
- `src/control/` may not import `src/templates/` (`.dependency-cruiser.cjs`, run in CI's Build lane,
  not in `npm run gates`): shared words go in `src/model/`. Run
  `npx depcruise --config .dependency-cruiser.cjs src` before pushing a new import edge.
- `git commit -a` for a temporary mutation sweeps every unstaged edit into it; reverting it with
  `reset --hard HEAD~1` drops them. Commit real work first.

**Walk** (AC-15, first run): `evidence/phase-3.md`. One blocking finding fixed here (the phone's
thanks outlived its question); #2333 and #2334 filed.

### Phase 4: Chat votes

Previous verified main: `034cbc057621083581361db310d848d7b2530844`. Revert of this merge:
`git revert -m 1 <merge sha>` (the merge sha is in `evidence/phase-4.md` once it lands). Migration
0113 is additive for the app: `audience_votes.source` defaults to `phone` and `cast_at` is nullable,
the phone functions keep their signatures, and `audience_tally` keeps its first three columns, so
the reverted app runs on it unchanged. Its function and columns can stay; nothing older reads them.

**Rules** (state rules; each is observable). They were written with the code, not before it, and a
fresh read-only review challenged them before the final assessment:

- C1. A chat line is a vote only while a Multiple choice question is live and the line is only one
  option's number (`1` to the number of options) or letter (`A` onwards), ignoring case and the
  spaces around it. Any other line, and every line while no Multiple choice question is live, is
  a message as before.
- C2. A chat voter is `yt:<channel id>` or `tw:<user id>`, never a display name. A line with no
  user id never votes. A phone's token cannot hold a colon, so a chat vote and a phone vote are
  never the same row.
- C3. One vote per voter per question; voting again changes it. A repeated message id counts
  once: the intake drops an id it has seen, and a re-sent vote changes nothing on the server.
- C4. Per voter, the vote said latest by the platform's own time wins, whatever order the messages
  arrive in, within one call and across calls; of equal times, the last to arrive. The page sends
  votes one call at a time in arrival order, and a retried call leaves out any vote a newer line
  from the same voter has replaced, so a retry never undoes a later choice made in the same second.
- C5. The server counts chat votes only into this production's open Multiple choice round, and
  refuses any other as "that question has closed". The page then reads what is live once: if
  another Multiple choice question is live, the votes said inside its window go there; the rest are
  dropped and counted.
- C6. The window alone decides: only a line said at or after the question last went live, less one
  second (the measured allowance), and before it closed, counts, wherever it was read (the YouTube
  first page marked "earlier", a backlog read after a pause, a reconnect's replay). The server also
  refuses a time more than a minute ahead of its own clock. A replay is stopped first by the page's
  dedupe, and after a reload, when the page has forgotten the ids, by the window. A vote that
  reaches the page after the question closed is not counted, as a phone's would not be; chat
  arrives a few seconds late (YouTube is read every five seconds), so the panel says to wait a
  moment before Stop.
- C7. Chat votes go in through `audience_operator_votes(slug, round, items)` with the control slug,
  at most 500 a call. An item whose option or time cannot be read is skipped, never the whole call.
  A source's "votes" figure is what the server counted; a vote that changed nothing (older than one
  it holds) shows as dropped.
- C8. Each source has its own limits. A chat vote never passes the message throttle (the intake's
  10 in 10 seconds, the server's 20 per 10 seconds on messages). Phones keep 0035's 300 votes per
  10 seconds a round, now counted over phone votes only, so a chat burst cannot crowd phones out;
  chat has its own ceiling of 5,000 per round in 10 seconds.
- C9. The tally gives phone and chat apart and their sum; a result cue carries the sum. Clear
  results removes chat votes too, and a question with chat votes counts as answered, so its words
  are locked (R8).
- C10. A Twitch line that is not a vote answers the live Open question through the viewer door
  (R20). With no Open question live, it reaches the inbox under no question through the operator
  door, deduped by `tw:<message id>`. YouTube lines that are not votes go in as before.
- C11. Chat is read in the operator's browser, so it counts only while a production page is open;
  the panel says so. While a vote is live, a vote-shaped line that does not count (outside the
  window) is not a message either; it is counted as dropped on its source. A line is sorted against
  one reading of what is live: this page's own Go live or Stop is read at once, another operator's
  within three seconds, and a failed reading is tried again, never taken as "nothing live". A
  Twitch answer goes to the Open question that same reading named.
- C12. Nothing here sends a Take, Update or graphic event (R16).
- C13. An unpublished production runs C1 to C11 on the local provider, with chat votes kept in the
  local room store beside the phone votes (an additive field, store version unchanged). The
  server's chat ceiling (C8) has no local counterpart.

**Decisions** (made in the build, revertible in review):

- The allowance is one second: the recorded YouTube later page gives `publishedAt` in whole
  seconds, so a line said in Go live's own second can read up to 999 ms earlier; Twitch's
  `tmi-sent-ts` carries milliseconds. `scripts/chat-votes.test.mjs` re-reads that step from the
  fixtures. The difference between the platforms' clocks and the database's is not in any fixture
  and is not covered beyond this second.
- The window is the one rule for the earlier page, a paused backlog and a replay, as the spec's
  Chat votes section words it. The first build also refused every line on the earlier page and the
  first page after a resume; the code review found that a long pause fills more than one page, so
  the flags were removed rather than extended.
- Twitch lines that are not votes now reach the inbox when no Open question is live (C10), as the
  phase 1 decision foresaw ("one line to change"); AC-10 asks that non-vote messages reach the
  inbox while a vote is live. The intake's test source stands in for Twitch here too, so the
  offline journey "with no Open question live a chat line reaches the inbox" pins the rule.
- The panel shows "N phone · M chat" under each option once chat has voted, the count beside the
  bar stays the sum, and a source's line reads "in · votes · dropped" once it has votes.
- The tally, `audience_tally`, gained `phone_counts` and `chat_counts`; a table function's columns
  cannot change in place, so 0113 drops and recreates it with the same arguments and grant.
- The new operator function is recorded in `supabase/advisor-baseline.json` in this pull request
  (anon and authenticated, the same intended door as `audience_operator_add`), checked by
  `scripts/advisor-baseline-grants.test.mjs`. The recorder reads production, which has no 0113
  yet, so the two entries were written in its format and the replay test confirms them.

**Traps found** (for later phases):

- On a cloud worker the Docker daemon is not running at start; `dockerd` started by hand works,
  and `npx -y supabase@2.111.0 start -x studio,edge-runtime` brings a local stack up in about five
  minutes. `scripts/configured-stack.mjs` refuses there, because `ss` is not installed.
- A migration's self-check skips on a fresh local stack (no account yet). Insert a throwaway
  `auth.users` row and run the file's DO block with `psql` to see it run.
- A YouTube page is a burst of lines in one moment, so a vote and the reading of what is live are
  decided together: the intake reads the live round once per batch (cached three seconds), never
  per line.

### Phase 5: More results and home-made graphics

Previous verified main: `1740d4f128ec6f74bc9b95ca3b90d12f0c101ab5`. Revert of this merge:
`git revert -m 1 <merge sha>` (the merge sha is in `evidence/phase-5.md` once it lands). No
migration. The Vote result type and its nine designs are new ids, so a reverted app opens a
production that uses one as an unknown catalog id, like any design it never had; its cues keep
their values.

**Decisions** (made in the build, revertible in review):

- The result templates are nine designs (`poll/results.ts`, `pl06` to `pl14`), every layout in
  every placement, in the house family, on a new type, Vote result (`types/resultBoard.ts`): the
  live vote's arc, buttons and four fields, plus Figures (percent, count, both). A type of its own
  because a type declares one field list. Placement is a design, not a zone: a lower third, a side
  card and a full-screen board need different arrangements, not the same card moved.
- Their drawing lives in each design's own script (`PollDesign.extraJs`, `figures`), so the five
  existing vote boards emit byte-identical code. Bars up turn the track a quarter, so the growth
  builder's width reads as height; the donut paints its ring from hidden tracks' widths through a
  MutationObserver, so it sweeps with the bars and a renderer that never ticks a frame still shows
  the finished ring.
- Long names wrap to two lines and end in an ellipsis; at six or more options full screen and on
  a side donut, one line. Five or more options in a lower third run in two columns.
- The result picker offers all fourteen catalog vote boards (`RESULT_BOARDS`).
- `Vote count`, the field contract's word, also names the vote's total layer in artwork.
- A layer named `QR` (any case; never text, nothing in `<defs>` or a hidden layer) gains a last
  field, Join link; the code is drawn inside that layer (a bare shape is wrapped in a group at
  bind), with the encoder the Join card carries, on a white plate with its own paint.
- The CLI path is `noacg scaffold --svg <file>`, through the bridge's `scaffold`, which calls the
  studio SVG drop's own default (`components/wizard/import/svgDefault.ts`: `svgDraftFromImport`
  then `svgDesignOptions`), so the CLI and the studio cannot drift. That is one new named edge,
  bridge to that file, in `docs/ARCHITECTURE.md` §3 and `.dependency-cruiser.cjs`; the file loads
  no React. The first build re-created the defaults by hand and two review rounds each found one
  more it missed; a fresh reassessment chose the shared function instead. Studio-only: a lower
  third's measured growth and every answer an author gives in the mapping step. Moving the import
  draft's pure core down to templates would retire the edge. The MCP server's scaffold is
  unchanged.
- Imported upright bars and pies are filed (#2344), not built: AC-13 asks for bars at their
  share, and the change re-records every pinned behaviour runtime.

**Traps found** (for later phases):

- Artwork with each row (`Option N`, `Bar N`) wrapped in its own group named `Options N` was
  proposed as nothing; the same layers in two plain groups were proposed as a vote. The cause is
  not traced here; test home-made artwork with the layer tree the docs teach.
- `e2e/` blank-page specs cannot import `src/components/wizard/import/draft.ts` on a bare page
  (React preamble error); load `/app` first, or use `importSvgMarkup` and `IMPORTED_SVG.create`.
- A page embedding the preview document must declare `color-scheme: dark`, or Chromium paints
  the iframe opaque.
- A layout read by a MutationObserver is one microtask behind `update()`; a test measures after a
  frame.
- `scripts/svg-import-passes.test.mjs` fails 4 of 22 on a cloud worker on `main` itself; compare
  against a `main` control there.
- The rendered catalog baseline is Windows-only; a Linux worker adds no rows to it.
- `node scripts/catalog-specs.mjs` is refused by the queue without a check stamp on the head;
  admit it with `node scripts/jobs.mjs add "<command>" --cap 12` after `/check`.
- The local stack's image pulls can be refused for one layer by the proxy and succeed on retry;
  `supabase start` retries by itself.

**Walk** (AC-15, phase 5): `evidence/phase-5.md`. No blocking finding; #2344 filed.

### Phase 6: Word questions

Previous verified main: `7c16e66a89942d7020d19004603d091a56e4f635`. Revert of this merge:
`git revert -m 1 <merge sha>` (the merge sha is in `evidence/phase-6.md` once it lands). Migration
0114 keeps every existing function's signature and grant, so the reverted app runs on it unchanged
against the server: an older page never makes a Word round, and `mine` gains a key it ignores. In
a browser that rehearsed Word questions offline, the older build drops the stored Word rounds and
lists their rehearsal words as unfiled messages. Removing it is a new migration
that restores 0111's `audience_go_live`, `audience_submit`, `audience_round_guard` and
`audience_join_by_slug` and 0095's `audience_guard`; the kind `word` in the check can stay.

**Rules** (state rules; each is observable). Written with the code; a fresh read-only review
challenged them before the final assessment:

- W1. Interaction lists a Word question's words by frequency, most first, then alphabetically.
  Case does not split a word (`Brilliant` and `brilliant` are one word), and the spelling most
  phones used is shown. Every word counts: the provider counts a round's words itself
  (`audience_word_counts`), never off the operator's message list, which the server caps at a
  page (added after the PR review of `88cc688`).
- W2. A word is one word: trimmed, no space and no `|` inside, 1 to 25 characters (code points).
  The phone, the local provider and the server apply the same rule; the server refuses anything
  else, and lists the Unicode spaces the phone refuses by code point rather than trusting its
  locale's `[:space:]` (added after the first `/so`).
- W3. One word per phone per question. A second send from the same phone is refused with "You have
  already sent your word."; a word cannot be changed once sent.
- W4. Words never count against the message throttle (20 per 10 seconds per production), and the
  message throttle no longer counts words. A Word round has its own cap, 300 words in 10 seconds,
  as phone votes have.
- W5. A phone that sent its word shows the word instead of the box, also after a reload: the join
  view gives each of this phone's messages its round and whether it was a word, and the phone never
  lists a word among "What you sent".
- W6. The operator hides a word (Hide beside it); a hidden word stays listed, struck through, and
  can be shown again. A hidden word is never in a cue's Words. Hiding is kept on the question
  (`Show.questions[].hidden`, by the word's key), allowed while live and with answers, and Duplicate
  starts with none. A cue carries the 30 most-sent shown words at most. A word the production's
  blocklist masks (0035's courtesy filter) is filed as asterisks, counted and listed like any
  other; the operator hides it.
- W7. "Add word cloud to rundown" writes a snapshot of the shown words (Question, and Words as
  `word | count` lines, most first) onto the question's one cue, through the phase 3 mapping
  (`Show.resultCues`, S1 to S6, S15): a second press, a reload or another tab updates that cue; a
  deleted cue or a graphic without the fields gets a new cue and the note says why. The remembered
  graphic is `Show.wordTarget`; with none the press asks: the production's word clouds, or the
  catalog's House Word Cloud, added with its one cue. Words that arrive later reach the cue only on
  the next press.
- W8. Nothing in this sends a Take, Update or graphic event (R16, S8). Stop writes nothing into a
  word cloud cue.
- W9. Words are not messages: the operator's message list (`list()`, `audience_list`) never
  returns them, so they are not in the inbox, the Messages filter or the cue editor's Pick a
  message whatever a page has read of the rounds; they are counted by `wordCounts` and reach a cue
  only as a word cloud. Paste never files under a Word question. The operator door
  (`audience_operator_add`, unchanged) still accepts any round of the production, so an operator
  call that named a Word round would add a word without the per-phone limit; only the
  production's owner can make that call.
- W6, made exact: staging takes the hidden words from the stored question whenever it is still in
  the list, an empty list included; only a question gone from it keeps the page's reading. Hiding
  a word also removes it from the question's word cloud cue in the same record write
  (`setShowWordHidden`), so a word hidden after the press never airs with the next Take or Update;
  showing it again changes only the list (the next press puts it back). Added after the `/so` of
  `428ff47`. The hosted control page, Companion and an exported controller run the published copy
  of the cues, which, as for any cue edit, changes only with the next publish: on a published
  production Hide says to publish again (after the `/so` of `378059c`).
- W10. A press stages only the words the operator has seen: fresh counts for the words the panel
  was listing at the press. A word that arrived since the panel last read waits for the next press,
  and the note says how many are listed now and not on the cue. Added after the `/so` of `428ff47`.
- W11. Every write that can put a word on a cue or hide one applies the hidden words of the record
  it lands on, inside that write: every production write (`saveAll` and the rebased pass of
  `patchShowChecked`, so a press, Hide, a paste of an earlier copy, a duplicate or an edit), an
  undo or redo (`replaceRundown`; the history checks a restore against what it lands as), a team
  merge, and a teammate's record applied from the server (`scrubHiddenWords`,
  `model/wordCues.ts`). A word typed by hand into a cue's Words
  while it is hidden goes too. It takes them off every cue carrying the question's
  words: its result cue (a mapped cue belongs to that one question only), and a word cloud cue no
  question maps whose Question is this question's text, when no other Word question has that text
  (the cue left behind by Change, a duplicate). A tab's own earlier reading never decides. Found by
  the final `/so` of `0ccd83e` as the rule missing behind the cross-tab and team cases; narrowed to
  question identity after the PR review of `cafc165` (a Duplicate keeps its text, and its own cue
  must not lose a word only the original hides). Residual: an unmapped cue whose text two Word
  questions share keeps its words.

Model correction (after the review of `ad7ec51`): W9 had been held by filtering words out of the
message list in each surface, using the rounds the page had read. Two successive rounds found the
cue editor's Pick a message wrong at the edges of that (a failed rounds read stalled it; a round not
yet read let words through), so instead of a third patch the rule moved to its source: the list
never holds words.

**Decisions** (made in the build, revertible in review):

- Each word is an `audience_submissions` row under the question's round (kind `word`), so Go live,
  Stop, Clear results, the revision and the stale-phone refusal are the Open question's, unchanged.
- One word per phone and no change after sending (W3): a word is a message's original, which is
  never edited (the moderation model); a vote can change because it is a pointer, a word is text.
- Staging is a snapshot, not live: the spec says "staging puts a snapshot on a word cloud cue", and
  a word reaching air between presses would bypass Hide.
- Hidden words live on the question rather than on the rows, so a word hidden before more phones
  send it stays hidden for every later send of it.
- The word cloud is one catalog design, `wc01` House Word Cloud, on a new type, Word cloud
  (`types/audience.ts`): a fixed 1280 px board, the question over a cloud whose words the runtime
  sizes by count (34 to 92 px at 1080p), the most-sent in the accent and in the middle. A word too
  wide for the board is drawn smaller, never below 34 px; when the words do not all fit, the
  least-sent go first.
- A word cloud's Question is not a message destination (`messageFields`), as a vote board's is not.
- Chat stays as phase 4 left it: with a Word question live a Twitch or YouTube line is a message
  under no question (C10). Chat words are not in AC-14.
- The cue is labelled "Words: <question>" (a dash label would add a copy tell).

**Traps found** (for later phases):

- The stage fit (`templates/shared/stageFit.ts`) resets every leaf's inline `font-size` on
  `update()`. A runtime that sizes its own text must opt its elements out the way the fit
  documents: a `line-clamp` on them ("a design that already bounds its own line is left alone").
- Program holds one frame per layer: a journey reads `iframe[title="<graphic>"]`, never the first.
- `scripts/interaction-questions.test.mjs` used `word` as its "type no build knows yet"; it now
  uses `rating`.
- A dev server left on this worktree's port makes the offline suite refuse to start; stop it
  before queueing a browser job.

- PostgREST caps a set-returning RPC at `max_rows` (1000 in `supabase/config.toml`, the same
  hosted), with no error: anything that must count every row of a big room counts on the server
  and returns one value, as `audience_word_counts` does. The message list itself has this cap.

**Walk** (AC-15, phase 6): `evidence/phase-6.md`.
