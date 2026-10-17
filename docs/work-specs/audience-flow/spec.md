# Messages: a chosen message reaches the right graphic in a few plain steps

Authority: owner, 2026-10-16 and 2026-10-17 (see `work.json`). **Draft**, reconciled on
2026-10-17 from two independent reviews (`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`);
the owner has not yet agreed the reconciled plan. This document owns message behaviour, not a
separate Audience page or store. Shared model, phases and verification:
`docs/work-specs/data-sources/spec.md`. Parent run: `docs/work-specs/production-page-refactor/spec.md`.
Existing foundation: `docs/INTERACTIVE_PLAYOUT_PLAN.md` phases 5 and 6.

## What the reconciliation changed

- The main door is the cue editor: "Fill from… Paste a message" and "Fill from… Pick a message"
  on a card's cue. The Messages view (today's Audience view, renamed) stays for candidates and
  message sources; its one primary action is "Prepare cue on…" with an explicit picker.
- Paste lands first, in content phase C0, with the #1313 fix.
- Protection is destination hygiene (data-sources "The three protective sentences"). The earlier
  field-level snapshot flag, refusal of later bindings and `/update` protection are dropped.
- Candidates stay `AudienceSubmission` records with three optional fields; the local inbox
  becomes durable for authored and imported rows; the published table gains the same columns.
- YouTube is browser-side: video comments one-shot, live chat as today with its first page kept;
  the key is remembered only on opt-in. Server-side intake and new Twitch work are deferred.

## Problem

A walk on 2026-10-16 (local dev server, signed out, a new production holding one scoreboard)
found:

1. **A viewer message went into the scoreboard.** "Send to rundown" added a scoreboard cue with
   the question as Team A ([#1313](https://github.com/NoaCG/NoaCG-Studio/issues/1313)). With no
   graphic that has a message field, `sendToRundown` falls back to the production's first graphic
   and its first text field (`ProductionAudienceWorkspace.tsx` 606-617). A vote board whose
   options field has another title is treated as a message graphic because its prompt is titled
   Question (88-98).
2. **Six buttons on every message**: Shortlist, Approve, Reject, Now, Next and Send to rundown.
3. **The door moves.** Setup says "Turn on audience…", which adds an Audience tab; the item
   leaves the menu once the tab exists.
4. **Nothing can be pasted.** The inbox fills only from the join page, a chat source or Simulate.
5. **The inbox and chat sources are forgotten on reload** (`localAudience.ts` 9-12;
   `chatIntake.ts` 169-172); the YouTube key lives in component state and the first page of chat
   is discarded (`youtubeChat.ts` 105-108).
6. **Two presses make two cues**: no pending guard around the synchronous cue write (628-636).

Kept: nothing airs from this view by itself; a message reaches air only as an ordinary cue the
operator takes; the audience backend has no method that reaches the command log
(`audienceTypes.ts` 147-167).

## Goal

An operator or student pastes a message, or picks one from a Sheet or supported YouTube input,
edits the broadcast text and name or makes it anonymous, sees it on a compatible graphic, puts it
in the rundown and Takes it. This works without enabling audience participation, publishing or
connecting the original service. The original stays intact; later arrivals, source edits and a
second message on the same graphic cannot alter the prepared or on-air cue.

## Non-goals

- Automatic airing of messages or votes, or source edits changing an approved cue.
- Required direct X, SMS or WhatsApp integrations; manual content from them is in scope.
- Server-side YouTube intake with stored credentials; new persistent Twitch integration. Existing
  Twitch behaviour is kept and checked.
- A separate Audience workspace, a docked message tray, or a new general store.
- Join-page branding, local-to-account migration, or unreviewed platform OAuth.

## The workflow

**Candidates.** A candidate is an `AudienceSubmission`: original author and body, never edited;
broadcast author and body, editable; anonymity; status; `usedAt`; and, new and optional,
`externalId` (a Sheet row hash, a YouTube comment or message id), `source` (a label such as
"Pasted", "Sheet: Messages", "YouTube") and `reference` (a private cell such as a phone number).
Source and reference are provenance shown small and grey; they never fill a graphic field. The
platform word is provenance too, not part of the broadcast name.

**Where candidates come from.** Paste (body required, name optional); a message Sheet tab
(Name, Message, optional Source and Reference; starter rows to copy); YouTube comments or live
chat; the join page; Simulate for rehearsal. Every intake writes candidates only.

**Where a candidate becomes a cue.** Two doors share one staging function in `src/control/`:
in the cue editor, "Fill from… Paste a message" or "… Pick a message" on a cue of the card (the
cue's graphic is the destination; no picker); in Messages, "Prepare cue on…" with a picker that
lists compatible graphics only, remembers the choice per production, and offers the four Q&A
cards (`House`, `Volt`, `Frost`, `Clean Q&A`) when the list is empty. Compatible: a body field
titled Message, Question, Comment, Body, Text or Request and, if present, a name field titled
Name, Author, From, Sender, Handle or Asked by; not a vote board; neither field bound. The
function copies the broadcast version into the cue's values by field title, writes `stagedFrom`
on the cue, marks the candidate used, and refuses a second prepare of the same candidate unless
"Prepare again" is chosen. The button is disabled while a save is pending; a failed save marks
nothing used.

**What protects the cue.** A prepared cue owns its values. A binding on the destination's body
or name field is the one live route into those values, and the picker and the cue-editor door
refuse such a graphic with "unbind first or add a card". A later binding on a field used by
prepared cues names those cues and asks, offering a separate card; it is not refused, because
"a bound field follows the tree" is the one existing rule. `/update` by graphic name keeps its
documented semantics and is not a message intake. Take replaces what the graphic shows on its
layer; the other cue's text is still in its cue.

**Persistence.** The local provider keeps operator-authored and imported candidates in browser
storage keyed by production (the `productionState.ts` pattern); simulated rows stay in memory.
On a published production, paste and imports go through the production's audience backend so
other operators see them; the table gains optional `external_id`, `source` and `reference` with
a unique index per show for dedupe. Message sources live in `Show.sources` with `use: messages`.

**Identity.** A Sheet row's identity is the hash of its Name, Message, Source and Reference
cells plus an occurrence index for identical rows; never its position. Reordering changes
nothing. An edited row is a new candidate; the old one is shown as "changed in the Sheet" for one
read and then leaves the list; a prepared cue is untouched. A deleted row removes the candidate,
not the cue. YouTube items dedupe by their platform id.

## YouTube, and Twitch

Two modes, named plainly: "Comments on a video" and "Live chat of a stream". Both ask for the
video link and the operator's own key, with "Remember on this browser" unticked by default and
the quota cost in one line (comments: 1 unit a fetch; live chat: about 3,600 units an hour at the
5-second floor against a 10,000-unit daily default). Comments: one call, the newest 100, refresh
is a press, no polling. Live chat: the existing reader, the first page delivered marked
"earlier", `pollingIntervalMillis` honoured with the 5-second floor, Pause and Remove as today.
The source (video and mode) is remembered with the production; on reload it reconnects when the
key is remembered and asks for the key otherwise. A disconnect, ended chat, missing authorization
or quota refusal shows a useful next action. Whether a key alone authorizes public content is
confirmed by a receipt in track Q before C2 promises it.

Twitch: `src/audience/twitchChat.ts` is untouched; its existing behaviour gets a regression check
in C7; no new persistent Twitch work is required.

## Join, presenter and votes

Unchanged: the join link and QR need a published production and the view says so with Publish
one press away; Simulate rehearses locally; presenter Now and Next move into the per-message menu
and say "for the presenter view"; vote totals are staged onto a vote-board cue and follow only
with the existing "update the percentages on air while voting" switch. All three are walked on
the local stack in C7.

## Historical owner decisions (answered 2026-10-17)

The owner accepted A1-A5 as recommended. "Now:" marks what the reconciliation supersedes.

- **A1. Where audience lives.** Answer: a permanent Audience tab. Now: the view is called
  Messages; Setup always offers it; the switcher keeps today's rule (views in use).
- **A2. No graphic for messages.** Answer: offer a question card, never a fallback. Kept.
- **A3. Actions per message.** Answer: one primary action plus Reject; the rest in a menu. Kept;
  the action is "Prepare cue on…".
- **A4. Chat sources.** Answer: production sources read by the server when published. Now:
  browser-side with the operator's key in this run; the source record is remembered with the
  production; server reading is deferred.
- **A5. Joining without publishing.** Answer: say plainly that phones need publishing. Kept.

## Acceptance criteria

### AC-1: A message only goes where it fits
With no compatible graphic, preparing a message adds no cue and offers the four Q&A cards;
accepting adds the card and the cue without airing either. With one compatible graphic the body
lands in its body field and the name in its name field. With several, the operator picks once
and the production remembers it across reload. A scoreboard, a vote board and a graphic whose
body or name field is bound are never offered. Layer: Node tests in `scripts/message-staging.test.mjs`
(scoreboard-only, a vote board with a Question field, a bound body); the #1313 steps as a journey
in `e2e/production-audience.spec.ts` whose mutation restores the fallback.

### AC-2: One obvious action per message
Each candidate shows "Prepare cue on…" and Reject; Shortlist, Now and Next sit one press away and
say what they do. Success names the cue and says Take is still needed. A double press makes one
cue; a retry after a failed save marks nothing used and makes no duplicate; "Prepare again" makes
a deliberate second cue. Layer: journey with held and failed persistence; owner look.

### AC-3: Paste works from the cue editor and from Messages
"Fill from… Paste a message" on a card's cue needs no audience enabling, publishing or account;
the same text pasted in Messages prepares the same cue through the same function. Setup always
lists "Messages…". Layer: journey in `e2e/production-audience.spec.ts` and `e2e/production-views.spec.ts`.

### AC-4: YouTube input is honest and survives reload
Comments and live chat are two named modes; comments arrive on one press; the live chat's first
page is shown as earlier; the key is kept in memory unless the operator remembers it; the source
is remembered with the production and reconnects or asks for the key on reload; quota and errors
show a next action; nothing runs server-side. Layer: Node tests with recorded responses in
`scripts/youtube-comments.test.mjs` and `scripts/youtube-chat.test.mjs`;
`e2e/production-chat-intake.spec.ts`; Q's provider receipts.

### AC-5: The published flow is walked and its findings settled
The join page on a phone-sized browser, the presenter view and a vote on air are walked on the
local stack in C7. A submitted message reaches the inbox; presenter selection changes the
presenter view without taking a graphic; staged votes air only through the operator. Blocking
defects are fixed and retested before this passes. Layer: scenario run in `evidence/`.

### AC-6: The cue airs the exact version the operator prepared
The operator edits the broadcast body and name or chooses anonymity; the original stays intact.
Preparing copies that version into one cue; Take airs those values. A second message on the same
graphic, a new arrival, a later candidate edit, a Sheet refresh and an unrelated data update
cannot change the first cue's prepared or on-air text. A graphic with a bound body or name field
is refused as a destination; binding such a field later names the prepared cues and asks,
offering a card. The operator can still edit the cue and Update. Layer: Node value contracts; a
journey with two cues and a binding attempted before and after preparing, on local and published
productions.

### AC-7: A newcomer completes the message journeys without a guide
Fresh unpublished production with one scoreboard; a raw message in a chat window on the same
screen. The participant pastes it, strips the phone number, edits name and text, accepts the
card, previews, prepares and Takes. Then: a second message while the first is on air (the
program must not change). Then: a link-shared message Sheet, the second message without the
surname, while a proctor edits and reorders the Sheet. Pass: four of five complete unaided and
answer the three comprehension questions (data-sources AC-14); medians reported, no time target.
Layer: Q's trial on C0's build; repeated in C7.

### AC-8: Candidates are first-class content
A pasted body works with no name, reference, login or integration. Sheet starter rows carry Name,
Message and optional Source and Reference; only the broadcast fields reach the graphic, never
Source, Reference or the platform word. Original, broadcast and prepared cue are distinct, with
one candidate record. Authored and imported candidates and prepared cues survive reload locally
and published. Refresh, reorder and reconnect never duplicate an imported item; a changed row is a
new candidate, visibly; a removed row does not delete a cue; identical text from two senders is
two candidates; a late read after disconnect revives nothing. Layer: Node tests in
`scripts/sheet-messages.test.mjs`; journeys with reorder, edit, delete, identical text, reload
and an already on-air cue; the published dedupe in `e2e/configured/audience-live.spec.ts`.

### AC-9: Provider support and deferral are honest
Q records, with receipts, what a key alone returns for comments and for live chat, what the
first page holds, pagination and quota. A promised route needs its own receipt; manual copying is
not proof of a connector. Twitch's existing reader is regression-checked; no new Twitch work
blocks the run. Layer: `evidence/youtube.md`; C7's separately labeled results.

## Phases

In the data-sources schedule: C0 (AC-1/2/3/6/8 paste half), Q (AC-7/9), C2 (AC-4/8/9), C7
(AC-5/7/9). The old phases 21, 23, 24 and 25 map there (synthesis §5).

## Phase notes
