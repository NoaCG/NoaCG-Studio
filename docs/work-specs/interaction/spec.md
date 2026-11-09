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
