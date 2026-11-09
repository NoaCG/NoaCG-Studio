# Interaction: one tab for everything audience

Authority: owner, 2026-11-09, issue [#2299](https://github.com/NoaCG/NoaCG-Studio/issues/2299).
**Draft**: the decisions below were agreed with the owner one at a time on 2026-11-09. The owner
asked for an independent second opinion on this written plan before any building starts, so
`work.json` stays `draft` until the owner agrees the plan after that review.

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
4. A vote is composed and opened in one go. There is no list of prepared questions to move
   through during a show.
5. Results reach air only on the five live vote boards, all one layout (a card or a band), and a
   board's own 20-second timer can say "voting closed" while phones still vote.
6. Nothing on air tells viewers how to join: no join graphic, no QR code.

## Goal

An operator opens **Interaction**, writes the show's questions before air, and during the show
picks which question the phones answer now. Viewers join in one scan or one short link, on a page
that carries the production's look and logo. Answers become messages or result graphics the
operator adds to the rundown as ordinary cues. Nothing airs by itself.

## Owner decisions (2026-11-09)

- **D1. A separate question list, not the rundown.** Interaction holds a simple list; the
  operator picks which question is live. A question can stay live all show (a favourite vote)
  or for one segment. With none live, phones show a waiting screen.
- **D2. Link: `noacg.studio/j/<name>` and a QR code.** No extra domain (cost and upkeep), no
  typed number codes (they feel unprofessional). `/join/<name>` keeps working.
- **D3. Phone messaging later.** WhatsApp waits for its own issue (Meta business account and a
  number). Here, YouTube and Twitch chat count as votes while a multiple-choice question is live.
- **D4. Branding follows the production's look.** Colours, font and the look's one logo. No
  separate phone look and no override. Page settings: a title and the waiting text only.
- **D5. Three question types.** Open (a sentence, lands as a message), Multiple choice (2 to 8
  options, a vote), Word (one short word, a word cloud). Word comes in a later phase. How results
  are shown is chosen afterwards, never fixed by the question.
- **D6. Paste stays in Interaction**, one message per paste, filed under a question (the live one
  by default) or none. A second person with only Interaction open can do this work.
- **D7. Unpublished: everything works except phones.** Publish sits where the QR code will be.
  Nothing publishes by itself.
- **D8. Graphics.** A Join card graphic, and the QR code available to any graphic. Results come
  from templates in several layouts (bars across, bars up, pie or donut) and placements (full
  screen, lower third, side), designed to sit over a studio picture and to follow the
  production's look. Anyone can make their own by SVG import or the CLI, through one field
  contract. Templates are examples, not the only way.

Related issues filed the same day: publishing while live
([#2303](https://github.com/NoaCG/NoaCG-Studio/issues/2303)) and tidying up idle published
productions ([#2304](https://github.com/NoaCG/NoaCG-Studio/issues/2304)). Neither blocks this.

## Non-goals

- Anything airing without an operator's press, including a result that updates by itself from
  open-answer words. The existing vote switch "update the percentages on air while voting" stays
  the one opt-in for live figures.
- WhatsApp, SMS or any other messaging backend; a separate short domain; number join codes.
- A separate phone look; viewer accounts; showing results on phones.
- Jury plus audience scoring on one board (its own issue if wanted).
- Renaming persisted identifiers: the view's stored key, storage keys, tables and CSS prefixes
  keep their names; only displayed words change.

## Screens

### Interaction tab (was Messages)

Same place in the production page's view switcher; Setup lists "Interaction…". Three areas, which
stack on a narrow window:

1. **Questions** (left). One row per question: type mark, text, and its state: *Live*, *Ready*
   or *Done* with its answer count. "+ Question" asks for the type, then the text (and options
   for multiple choice). Rows reorder by drag and by keyboard. Each row has **Go live**; the live
   row shows **Stop**. Going live on another row moves the room to it in one press. The list is
   saved with the production and survives reload.
2. **Selected question** (middle).
   - Multiple choice: the options with live bars, phone and chat counts shown apart and summed,
     and **Add results to rundown** (see "Results to the rundown").
   - Open: its messages, the existing inbox filtered to this question, with "Prepare cue on
     <graphic>" and Reject as today. A filter shows all messages or messages with no question.
   - Paste sits here, filed under the selected question by default.
3. **Join** (right).
   - A phone-sized live preview of what phones see now.
   - Published: the QR code, the link `noacg.studio/j/<name>` with Copy, **Download QR** (PNG and
     SVG), **Add Join card to rundown**, and the link name (moved here from Links; Links keeps a
     pointer).
   - Unpublished: "Phones can join once this production is published" and **Publish**; signed
     out, the sign-in prompt in that spot only.
   - Page settings: title (default: the production name) and waiting text.
   - "More ways in", folded: YouTube, Twitch, the message Sheet, Simulate.

### Phone page (`/j/<name>` and `/join/<name>`)

The production's colours, font and logo; the title; then the live question with one big input
(Open), large option buttons (Multiple choice) or a one-word input (Word). After sending: a
thank-you and, for a vote, the picked option, changeable while live. No question live: the
waiting text. No account, no app, no cookie banner beyond what the page needs.

## Model and backend (derived choices; the builder may improve them and must say so)

- **Question list:** saved with the production record (`Show`), so it publishes and syncs like
  the rundown. A question has id, type, text, options (multiple choice) and order.
- **Live question:** the existing audience state. Multiple choice opens a round as today; Open
  sets mode `question` with the question text as `prompt`; Stop sets `waiting`. One live at a
  time, enforced by the server for rounds as now.
- **Answers filed by question:** a nullable `question_id` on submissions (a migration), written
  by the join page from the state it read and by paste.
- **Logo on phones:** the look's logo published as a file the join page loads by URL, not inlined
  into the state row. Size stays inside the brand's existing 300 KB cap.
- **Short link:** a `/j/:name` rewrite beside `/join/:name`; the same names and reserved list.
- **QR code:** made in the browser from the link, by a small MIT-licensed encoder or our own;
  no third-party QR service, so it works offline and leaks nothing.
- **Chat votes:** while a multiple-choice question is live and a YouTube or Twitch chat source is
  connected, a chat message that is only an option's number or letter (`2`, `B`) counts as that
  author's vote; their latest counts, one per author. Counted through a new operator RPC so
  totals live with phone votes but stay separable. Read in the operator's browser, as chat is
  today, so it counts only while a production page is open; the panel says so.

## Results to the rundown

- **One field contract** for every result graphic, catalog or home-made: fields titled
  Question, Options (one `label | count` line per option) and optional Vote count and Figures
  (`percent`, `count` or `both`). It is today's `voteBoardFields` matching, documented for SVG
  import and the CLI, so any graphic carrying those titles works with no mapping screen.
- **Add results to rundown** on a multiple-choice question lists the production's result
  graphics first, then the catalog's result templates by layout and placement, styled with the
  production's look. Picking one adds the graphic if needed and stages the counts onto a cue, as
  today's staging does; pressing again updates that cue. The operator takes it.
- **Closing follows Interaction.** A result graphic fed by an audience vote shows "voting closed"
  when the question is stopped in Interaction, not from its own timer; the timer stays for
  hand-typed votes.
- **Join card:** a catalog family whose QR code and link come from the production's join link at
  play time. "Add Join card to rundown" adds it and a cue. Placement and scale use the cue
  editor's existing controls.
- **QR in any graphic:** a layer named `QR` (SVG import, the editor, the CLI) becomes the join QR
  code, drawn into that layer's box from the production's link. A home-made join graphic needs
  nothing else from Interaction.

## Acceptance criteria

### AC-1: Everything audience is in one tab called Interaction
The view and Setup say Interaction; Messages no longer appears as a name. Questions, the selected
question, Join (QR, link, link name, page settings, Publish) and the sources are in it. Links
still points to the audience link. Stored keys are unchanged, so an existing production opens with
its inbox and sources intact. Layer: journey in `e2e/production-audience.spec.ts`; Node test that
the persisted view key is unchanged.

### AC-2: The operator prepares questions and moves the room through them
Questions of type Open and Multiple choice are added, edited, reordered and removed; they survive
reload, locally and published. Go live puts one question on phones; another's Go live replaces
it; Stop shows the waiting text; a question can stay live indefinitely. Two operators on one
published production see the same live question. Layer: Node tests for the list model; journey
with Simulate; configured suite for two operators.

### AC-3: Joining takes one scan or one short link
Published, Interaction shows a QR code that a phone camera opens to the phone page, the link
`noacg.studio/j/<name>`, Copy and Download QR. `/join/<name>` still works. A cold phone page
shows the live question within 2 seconds on Playwright's Fast 3G profile at phone size. No
account, app or number code. The QR is made locally. Layer: blank-page spec decoding the drawn QR
back to the link; journey on a phone-sized page with network throttling; configured suite.

### AC-4: The phone page carries the production's look and words
Colours, font and the look's logo appear on the phone page; the title and waiting text come from
Interaction; the live question's text is the heading. Text stays readable: a look whose colours
fail contrast gets readable text without changing the look. Layer: blank-page spec over
`joinSurface` with a look, a logo and a low-contrast palette; journey for the settings.

### AC-5: Answers arrive under their question
An Open answer, a vote and a paste are filed under the question live when sent (paste: the chosen
one or none). Changing the live question never moves earlier answers. Layer: Node tests over the
local provider; configured suite for `question_id`.

### AC-6: Unpublished productions rehearse everything but phones
Questions, Go live, the phone preview, paste and Simulate (messages and votes) work offline with
no account. Where the QR goes, the page says phones need publishing and offers Publish; signed
out, the sign-in prompt appears in that spot only. Nothing publishes without the press. Layer:
journey offline; `e2e/auth.spec.ts` keeps zero auth UI offline.

### AC-7: Results reach air only as cues the operator takes
Add results to rundown offers the production's result graphics and the catalog's, stages the
counts onto one cue, updates that cue when pressed again, and airs nothing. A result graphic shows
voting closed when the question is stopped in Interaction, never earlier from its own timer.
Messages still go through "Prepare cue on <graphic>" with destination hygiene unchanged. Layer:
Node tests for staging and the field contract; journey through Take; mutation that airs on stage
must fail.

### AC-8: Result templates fit real productions
The catalog has result templates in at least three layouts (bars across, bars up, pie or donut)
and three placements (full screen, lower third, side), each designed over a studio picture with a
transparent background, taking 2 to 8 options and long option names without overflow, showing
percent, count or both, following the production's look, and responding to the existing
placement and scale controls. They pass the catalog's visual quality gates. Layer: the catalog
quality gates; blank-page specs for 2 and 8 options and long names; owner look on taste only.

### AC-9: Anyone can make their own result or join graphic
An SVG with layers titled Question, Options and Vote count imports as a working result graphic;
a layer named `QR` draws the production's join QR. The same works from the CLI. The contract is
written in the import and CLI docs. Layer: Node test over an imported fixture outside the sample
set; CLI test.

### AC-10: Chat votes count while a question is live
With a multiple-choice question live and YouTube or Twitch chat connected, a chat message that is
only an option's number or letter counts once per author (latest wins); other messages go to the
inbox as today. Phone and chat counts show apart and summed. The panel says chat counts only
while this page is open. Layer: Node tests with recorded chat fixtures; journey with a simulated
chat source.

### AC-11: Word questions make a word cloud the operator approves
A Word question takes one short word per phone (at most 25 characters). Interaction shows the
words by frequency; the operator hides any word; staging puts a snapshot of the shown words on a
word cloud cue. Hidden words never reach the cue. Layer: Node tests for counting and hiding;
journey through stage and Take.

### AC-12: A rehearsal walk on the local stack
On the local stack: a phone-sized browser joins by the QR link, answers an Open question and a
vote, a chat fixture votes, results go to the rundown and air through Take, and the room moves
through three questions. Findings are filed and blocking ones fixed before this passes. Layer:
scenario run in `evidence/`.

## Phases

1. **Interaction and questions** (AC-1, AC-2, AC-5, AC-6): rename, three areas, question list,
   Go live and Stop, answers by question, paste by question; the `question_id` migration.
2. **Joining** (AC-3, AC-4): `/j/` link, QR in the panel and download, link name moved, page
   settings, logo on phones, phone page timing.
3. **Results to the rundown** (AC-7, AC-9): the field contract, Add results to rundown, closing
   follows Interaction, the Join card family and the `QR` layer.
4. **Result templates** (AC-8): the layouts and placements across the look families.
5. **Chat votes** (AC-10): the chat vote reader and operator RPC.
6. **Word questions** (AC-11): the type, the phone input and a word cloud family.
7. **Walk** (AC-12).

Each phase lands on its own through `/queue-merge` and adds what the next must know to
"Phase notes".

## Phase notes
