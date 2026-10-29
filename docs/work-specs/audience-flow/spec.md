# Messages: a chosen message reaches the right graphic in a few plain steps

Authority: owner, 2026-10-16 and 2026-10-17, agreed 2026-10-18 (see `work.json`). **Agreed**,
reconciled on 2026-10-17 from two independent reviews
(`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`). This document owns message
behaviour, not a separate Audience page or store. Shared model, phases and verification:
`docs/work-specs/data-sources/spec.md`. Parent run: `docs/work-specs/production-page-refactor/spec.md`.
Existing foundation: `docs/INTERACTIVE_PLAYOUT_PLAN.md` phases 5 and 6.

Owner agreement, 2026-10-18: synthesis §7 **1 yes; 2 yes; 3 yes; 4 yes to both**
(run order; Sheet reader model; destination hygiene with `/update` allowed; opt-in key storage
and off-air YouTube provenance). The reconciled plan is agreed. Recording and landing this
planning update does not start `/plan-run production-page`; the owner explicitly said not to.

19 October full-project refinement: C7 remains the technical rehearsal and prepares the full
human trial; that trial now runs at parent phase 14 after the remaining refactors. Its tasks
and thresholds are unchanged. Whole-graphic data connections must enforce the same prepared
message refusal as individual connections. No implementation or run starts from this update.

Owner decisions, 2026-10-20 ([receipt](../production-page-refactor/evidence/owner-decisions-2026-10-20.md)):
the trials of AC-7 are a trial kit and an early paste pilot the owner runs when he can, never a
gate; Q's YouTube receipt is agent-run with the owner's key; Twitch is checked against recorded
fixtures; C0 adds an operator insert RPC and reverses the local inbox's no-persistence decision;
the YouTube quota is budgeted and the remaining live-chat runtime is shown.

## What the reconciliation changed here

The shared changes are listed once in the data-sources spec. For this document: the Audience view
becomes Messages and the cue editor is the main door; paste lands first (C0); A1's permanent tab
and A4's server-read chat sources are superseded (below); the field-level snapshot flag, the
refusal of `/update` and the "changed row" marker are dropped for the simpler rules in "The
workflow".

## Problem

A walk on 2026-10-16 (local dev server, signed out, a new production holding one scoreboard)
found:

1. **A viewer message went into the scoreboard.** "Send to rundown" added a scoreboard cue with
   the question as Team A ([#1313](https://github.com/NoaCG/NoaCG-Studio/issues/1313)). With no
   graphic that has a message field, `sendToRundown` falls back to the production's first graphic
   and its first text field (`ProductionAudienceWorkspace.tsx` 606-617), and nothing names the
   destination before the cue exists.
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

**Where candidates come from.** Paste (body required, name optional); a message Sheet tab (a
`sheet` source with `inbox: true`: Name, Message, optional Source and Reference; starter rows to
copy); YouTube comments or live chat; the join page; Simulate for rehearsal. The inbox has no
writer.

**Where a candidate becomes a cue.** Two doors share one staging function in `src/control/`.
In the cue editor, a compatible body field offers "Fill from… Paste a message" and "… Pick a
message"; the cue's graphic is the destination and the action names it. In Messages, "Prepare cue
on <graphic>" names the destination on the button: the first time the operator chooses it from
the compatible graphics, the production remembers it (`Show.messageTarget`), and it stays
changeable; when no graphic is compatible, the action offers the four Q&A cards (House Q&A, Volt
Q&A, Frost Q&A and Clean Q&A, `src/templates/types/audience.ts` 135-138) and one press adds the
card and the cue. Compatible: a body field titled Message, Question, Comment, Body, Text or
Request and, if present, a name field titled Name, Author, From, Sender, Handle or Asked by,
neither of them bound. Nothing is ever chosen by elimination. The function copies the broadcast
version into the cue's values by field title, writes `stagedFrom` on the cue, marks the candidate
used, and refuses a second prepare of the same candidate unless "Prepare again" is chosen. The
button is disabled while a save is pending; a failed save marks nothing used.

**What protects the cue.** A prepared cue owns its values. A binding on the destination's body
or name field is the one live route into those values, so the rule holds at both doors: a graphic
whose body or name field is bound is not compatible, and a binding is never added to a body or
name field that prepared cues use. Both refusals offer a separate card. The binding write is one
path, used by "Connect…" and by the Advanced binding rows, so neither bypasses it. `/update` by
graphic name keeps its documented semantics and is not a message intake. Take replaces what the
graphic shows on its layer; the other cue's text is still in its cue.

**Persistence.** The local provider keeps operator-authored and imported candidates in browser
storage keyed by production (the `productionState.ts` pattern); simulated rows stay in memory.
This reverses `src/audience/localAudience.ts`'s documented decision to hold nothing durable,
because a forgotten inbox is problem 5; keeping simulated rows in memory keeps that decision's
reason. On a published production, paste and imports go through the production's audience
backend so other operators see them, through a new operator RPC, `audience_operator_add`, keyed on
the control slug (the viewer door `audience_submit` keeps its join-slug gate and viewer caps; the
operator RPC has its own bound of 100 items per call, each clamped to the existing limits). The
table gains nullable `external_id`, `source` and `reference` in C0 and a unique index per show on
`external_id` in C3. Message sources are `Show.sources` entries.

**Identity.** A Sheet row's identity is the hash of its Name, Message, Source and Reference
cells plus an occurrence index for identical rows; never its position. Reordering changes
nothing. A row whose hash is no longer in the tab has vanished; a row with a new hash has
arrived; an edit is both, and nothing pairs them. The source governs unused candidates only: a
vanished unused candidate leaves the list; a used one is the operator's record, keeps its
original text and its cue's receipt, and shows "no longer in the Sheet". YouTube items dedupe by
their platform id. A late read after disconnect revives nothing.

## YouTube, and Twitch

Two modes, named plainly: "Comments on a video" and "Live chat of a stream". Both ask for the
video link and the operator's own key, with "Remember on this browser" unticked by default and
the quota cost in one line (comments: 1 unit a fetch; live chat: about 3,600 units an hour at the
5-second floor, so the 10,000-unit daily default lasts about 2 hours 45 minutes). While live chat
runs, the line shows the estimated runtime left today, counted from this browser's own spend since
the quota's daily reset (midnight Pacific time); it says that other users of the same key are not
counted, because the API offers no way to read the remaining quota. Comments: one call, the newest 100, refresh
is a press, no polling. Live chat: the existing reader, the first page delivered marked
"earlier", `pollingIntervalMillis` honoured with the 5-second floor, Pause and Remove as today.
The source (video and mode) is remembered with the production; on reload it reconnects when the
key is remembered and asks for the key otherwise. A disconnect, ended chat, missing authorization
or quota refusal shows a useful next action. Whether a key alone authorizes public content is
confirmed by Q's agent-run receipt before C3 promises it. The agents' shared key
(`YOUTUBE_API_KEY`) is budgeted: Q spends at most 2,000 units, C7 at most one 10-minute live smoke
(about 600 units), and automated tests use recorded responses.

Twitch: `src/audience/twitchChat.ts` is untouched; its existing behaviour gets a regression check
in C7 against recorded fixtures; a live Twitch check is a non-blocking owner-list item; no new
persistent Twitch work is required.

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
  the action is "Prepare cue on <graphic>".
- **A4. Chat sources.** Answer: production sources read by the server when published. Now:
  browser-side with the operator's key in this run; the source record is remembered with the
  production; server reading is deferred.
- **A5. Joining without publishing.** Answer: say plainly that phones need publishing. Kept.

## Acceptance criteria

### AC-1: A message only goes where it fits
The action always names its destination. With no compatible graphic, preparing adds no cue and
offers the four Q&A cards; accepting adds the card and the cue without airing either. The first
prepare in a production asks the operator to choose among the compatible graphics; the
production remembers the choice across reload and it stays changeable. A graphic whose body or
name field is bound is never compatible, and no graphic is chosen by elimination. Layer: Node
tests in `scripts/message-staging.test.mjs` (a scoreboard-only pool offers the cards; a bound
body is refused; nothing is picked without a choice); the #1313 steps as a journey in
`e2e/production-audience.spec.ts` whose mutation restores the fallback.

### AC-2: One obvious action per message
Each candidate shows "Prepare cue on <graphic>" and Reject; Shortlist, Now and Next sit one press
away and say what they do. Success names the cue and says Take is still needed. A double press
makes one cue; a retry after a failed save marks nothing used and makes no duplicate; "Prepare
again" makes a deliberate second cue. Layer: journey with held and failed persistence (owner
look: parent §9.1).

### AC-3: Paste works from the cue editor and from Messages
"Fill from… Paste a message" appears on a compatible body field and needs no audience enabling,
publishing or account; the same text pasted in Messages prepares the same cue through the same
function; the card offer lives in Messages. Setup always lists "Messages…". Layer: journey in
`e2e/production-audience.spec.ts` and `e2e/production-views.spec.ts`.

### AC-4: YouTube input is honest and survives reload
Comments and live chat are two named modes; comments arrive on one press; the live chat's first
page is shown as earlier; the key is kept in memory unless the operator remembers it; the source
is remembered with the production and reconnects or asks for the key on reload; quota and errors
show a next action, and running live chat shows its estimated runtime left today; nothing runs
server-side. Layer: Node tests with recorded responses in
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
is refused as a destination, and binding such a field later is refused while prepared cues use
it, both with the card offer, locally and published, through the Advanced rows as well as
"Connect…". The operator can still edit the cue and Update. Layer: Node value contracts; a
journey with two cues and a binding attempted before and after preparing; the same on a
published production in `e2e/configured/audience-live.spec.ts`.

### AC-7: The message newcomer tasks are in the pilot and the trial kit
Fresh unpublished production with one scoreboard; a raw message in a chat window on the same
screen. The participant pastes it, strips the phone number, edits name and text, accepts the
card, previews, prepares and Takes; then a second message while the first is on air (the program
must not change). These two tasks are the early paste pilot on C0's build. The third task, a
link-shared message Sheet with the second message aired without the surname while a proctor
edits and reorders the Sheet, is in the content trial kit with the first two repeated. Reading
guide: four of five complete unaided and answer the three comprehension questions (data-sources
AC-14); medians, no time target. Pass: the kit holds these tasks, the questions, the reading guide and where findings go,
and every trial the owner reports is recorded against its build with each finding filed as an
issue. The trial's own result is reported, never required (owner, 2026-10-20, D). Layer: the owner-list paste pilot
(`evidence/trial-paste.md`) and C7's kit (`evidence/trial.md`) as they are run.

### AC-8: Candidates are first-class content
A pasted body works with no name, reference, login or integration. Sheet starter rows carry Name,
Message and optional Source and Reference; only the broadcast fields reach the graphic, never
Source, Reference or the platform word. Original, broadcast and prepared cue are distinct, with
one candidate record. Authored and imported candidates and prepared cues survive reload locally
and published. Refresh, reorder and reconnect never duplicate an imported item; identical text
from two senders is two candidates; a vanished row leaves an unused candidate and keeps a used
one with its original; nothing pairs an edit with the row it replaced; a late read after
disconnect revives nothing. Layer: Node tests in `scripts/sheet-messages.test.mjs`; journeys with
reorder, delete and add, identical text, reload and an already on-air cue; the published dedupe
in `e2e/configured/audience-live.spec.ts`.

### AC-9: Provider support and deferral are honest
Q's agent records, with receipts, what a key alone returns for comments and for live chat, what
the first page holds, pagination and quota. A promised route needs its own receipt; manual
copying is not proof of a connector. Twitch's existing reader is regression-checked against
recorded fixtures; no new Twitch work blocks the run. Layer: `evidence/youtube.md`; C7's
separately labeled results.

## Phases

In the data-sources schedule: C0 (AC-1/2/3/6/8 paste half), Q (AC-9 receipts), C3 (AC-4/8/9),
C7 (AC-5/9 and the AC-7 trial kit), parent phase 14 (revalidation after later changes). The AC-7
pilot and kit run whenever the owner can and never hold a phase. The old phases 21, 23, 24 and 25 map to the content work
(synthesis §5); the final trial placement follows the owner's 19 October full-project scope.

## Phase notes
