# Audience flow: viewer messages reach the right graphic in a few plain steps

Authority: owner, 2026-10-16 and 2026-10-17 (see `work.json`). The owner accepted A1-A5,
then clarified that messages should share the data workflow, manual intake is central, YouTube
matters now and Twitch is optional. The updated recommendations are accepted for inclusion in
the plan. **Still a draft pending independent whole-plan review and final agreement.**
This document owns message behavior, not a requirement for a separate Audience page or store.
Shared model and phases: `docs/work-specs/data-sources/spec.md`. Parent run:
`docs/work-specs/production-page-refactor/spec.md`, phases 1-26.
Existing foundation: `docs/INTERACTIVE_PLAYOUT_PLAN.md` phases 5 and 6.

## Latest owner direction, 2026-10-17

The main task is to take a chosen message from anywhere into a graphic. Pasting a message from
X, SMS or WhatsApp, or selecting it from a Google Sheet, is a complete supported route. Native
connectors are not a prerequisite. YouTube is a priority; Twitch remains possible for other
users later. A shared content workspace with a Messages view is a candidate, not a fixed UI.
The independent reviews may propose a simpler approach across the whole plan.

One workflow can preserve two behaviors: live data follows a connection; a message is selected,
prepared and copied into a cue before Take. A Sheet message needs the same protection as chat.
Share management and interactions without giving message intake a live-data writer. Polling,
push and subscriptions may need different runners. Reuse existing storage where it fits.

The current source `src/audience/youtubeChat.ts` resolves `activeLiveChatId` and reads live chat.
It does not read ordinary video comments. Phase 15 must name which direct YouTube routes the run
will support and qualify them separately. Copying either kind manually remains available.

## Problem

A walk on 2026-10-16 (local dev server, signed out, a new production holding one scoreboard)
found:

1. **A viewer message went into the scoreboard.** "Send to rundown" added a scoreboard cue with
   the question as Team A ([#1313](https://github.com/NoaCG/NoaCG-Studio/issues/1313)). With no
   graphic that has a message field, `sendToRundown` falls back to the production's first graphic
   and its first text field.
2. **Six buttons on every message**: Shortlist, Approve, Reject, Now, Next and Send to rundown.
   Approve and Send to rundown overlap; Now and Next steer the presenter view, which the tab does
   not explain.
3. **The door moves.** Setup says "Turn on audience…", which adds an Audience tab; Setup's data
   item behaves the same way. Accepting messages, the mode, Simulate, chat sources and the poll
   form share the top of the tab before any message is shown.
4. **Phones cannot join an unpublished production**, and publishing needs an account whose cloud
   workspace does not include this browser's local work. Links shows "Available after publishing"
   with no step towards it.
5. **Chat sources run in the operator's tab** and are forgotten on reload
   (`docs/INTERACTIVE_PLAYOUT_PLAN.md`, "Backlog for the audience plane").

Not walked in that earlier session, because they need a published production: the join page on
a phone, the presenter view, a vote on air, a real Twitch or YouTube source. Proposed phase 15
walks the published flow on the local stack; provider access is qualified separately.

Kept: nothing airs from this tab by itself; a message reaches air only as an ordinary cue the
operator takes. The audience backend has no method that reaches the command log.

## Goal

An operator or student pastes a message, or picks one from a Sheet or supported YouTube input,
edits the broadcast text, previews it on a compatible graphic, puts it in the rundown and Takes
it. This works without first enabling audience participation or connecting the original service.
The original stays intact and later source changes cannot alter the prepared or on-air cue.

## Non-goals

- Automatic airing of messages or votes, or source edits changing an approved cue.
- Required direct X, SMS or WhatsApp integrations; manual content from them is in scope.
- New persistent Twitch integration in this run; retain existing behavior and an extension path.
- A separate Audience workspace or a new general data store as prerequisites.
- Join-page branding, local-to-account migration, or unreviewed platform OAuth.

## Shared content, optional joining

The same source can provide different kinds of content. A Sheet can supply a ticker that follows
edits and a table of messages that must be selected. The operator sees one coherent workflow and
one source identity, with specialized views where helpful. A message has original text, optional
source/reference, a broadcast version and cue snapshots. Technical IDs stay behind the workflow.

Manual paste needs only the message body; name is optional. A message Sheet uses `Name`, `Message`
and optional `Source`/`Reference` columns, with starter rows to copy. Source labels do not imply a
native connection. Only chosen broadcast text and credit fields reach the graphic; private sender
metadata is not auto-filled on air. Imported items and operator edits survive production reload.

The production's join link/QR is another route, requiring publishing. Simulate stays for local
join rehearsal, while paste is useful production content in its own right. Presenter Now/Next
and votes keep their existing explicit operator controls. No intake can take a graphic.

## Historical owner decisions (answered 2026-10-17)

The owner, 2026-10-17: "yes, use your recommendations for A1-A5 too." Each answer below was the
recommendation. The latest direction supersedes A1's mandatory separate tab and A4's equal
priority for both chat providers. A2/A3/A5 remain, applied to the shared workflow. The current
criteria below govern the proposed run; these historical answers are not a second specification.

- **A1. Where audience lives.** Answer: the Audience tab is always there next to Playout
  and Data, never added through Setup, and opens on the inbox; turning messages on is the tab's
  first control.
- **A2. No graphic for messages.** Answer: when no graphic in the production takes a
  message, "Send to rundown" offers a viewer question card from the catalog (House, Volt, Frost or
  Clean Question; one press) and then sends the message to it; never a fallback to an unrelated
  graphic. With several message graphics, the operator picks one once and it is remembered for the
  production.
- **A3. Actions per message.** Answer: one primary action, "Put in rundown" (it approves
  too), plus Reject; Shortlist, Now and Next move into a small menu, and Now and Next say "for the
  presenter view".
- **A4. Chat sources.** Answer: they become production sources like the Sheet (the shared
  source core from `docs/work-specs/sheet-data-flow/spec.md`): remembered with the production, read
  by the server when published and by the browser when not, with status and Pause in the tab and
  on the one sources line of the data sources spec (DS14).
- **A5. Joining without publishing.** Answer: the tab says plainly that phones need a
  published production, with the Publish step one press away; Simulate stays the way to rehearse
  locally.

## Acceptance criteria

### AC-1: A message only goes where it fits
With no graphic that takes a message, sending one adds no cue and offers the viewer question card;
accepting the offer adds the card and the message cue without airing either. With one compatible
graphic, the message lands in its message field and the author in its name field. With several,
the operator picks once; the production remembers that choice across reload. A deleted or changed
target requires a fresh compatible choice, never a fallback to a scoreboard or vote board. A
matching title alone is insufficient: the destination must preserve the prepared body and author
through Take (AC-6). Layer: Node tests on target choice and invalidation; a journey in
`e2e/production-audience.spec.ts`.

### AC-2: One obvious action per message
Each message shows one primary action and Reject; the other actions are one press away and say
what they do. Put in rundown also approves; Now and Next explicitly affect the presenter view.
Success names the destination and makes clear that Take is still required. A failed cue save
does not mark the message used or claim success. A double press or retry of an uncertain save
does not create duplicate cues; a deliberate later reuse remains possible. Layer: journey with
held and failed persistence; owner look in the pull request.

### AC-3: Messages are easy to find in the shared workflow
A stable content entry and contextual graphic actions lead to the same message records. Pasting
or selecting a Sheet message requires no audience-enable step and no switch between duplicate
Data/Audience setup flows. Views can specialize tasks, but Setup never hides their entry point.
Phase 15 compares the shared workspace and a simpler field-led alternative. Layer: prototype,
newcomer observation and journey.

### AC-4: Promised direct YouTube intake survives reload and closed pages
The agreed YouTube source is remembered with the production. Published intake continues with
operator pages closed; local intake honestly requires an open page. One source has one owner,
with stable message identity, reconnect deduplication and status. Pause stops new intake while
existing messages stay usable; the provider's resume/backfill policy is documented and bounded.
A disconnect, ended chat, missing authorization or quota refusal shows a useful next action.
Credentials needed by the published reader stay private to operators and the service. Prove with
actual provider access, not fixtures alone. Layer: Node lifecycle tests, configured suite,
`e2e/production-chat-intake.spec.ts` and provider receipts. An unavailable required route remains
unverified; manual copying is not proof of direct intake. Twitch is covered separately by AC-9.

### AC-5: The published flow is walked and its findings settled
The join page on a phone-sized browser, the presenter view and a vote on air are walked on the
local stack. A submitted message reaches the inbox; presenter selection changes the presenter
view without taking a graphic; staged votes air only through the operator, and automatic tally
updates require the existing explicit switch. Defects blocking these outcomes must be fixed and
retested before this criterion passes; filing them is not passing evidence. Unrelated findings
may be filed with their scope stated. Layer: scenario run in `evidence/`.

### AC-6: The audience cue airs the exact version the operator prepared
An operator edits the broadcast body and author or chooses anonymity; the original submission
stays intact. Put in rundown copies that broadcast version into one cue. Take airs those exact
values. Preparing a second message on the same graphic, new chat arrivals, a later inbox edit
and an unrelated data-source update cannot change the first cue's prepared text or its on-air
text. Message/author fields with live data bindings cannot be used silently: offer a compatible
unbound target or a separate card, without removing existing bindings or changing another cue.
Adding or changing a live binding later on fields used by a prepared/on-air message is refused
with a safe alternative. Revalidate restored or legacy cues before Take; never silently air a
substituted value. The same protection covers direct or held data-key `/update` writes to these
message fields; preserving legacy support does not permit a bypass on a protected message.
The operator can still deliberately edit the cue and Update through playout.
Layer: Node target/field-value contracts; audience journey with two cues and a competing data
binding attempted before and after staging, plus a data-key update against protected fields;
configured published Take scenario. Existing live-data precedence stays for ordinary graphics.

### AC-7: A newcomer completes the main message journeys without a guide
Use a fresh unpublished production with no message graphic. Someone unfamiliar with the product
pastes a message and optional name, edits the broadcast text, accepts a compatible card, previews,
puts it in rundown and Takes it without documentation, sign-in or a source account. Proposed
usability target: under two minutes. Repeat with a prepared link-shared message Sheet: choose a
row, edit, stage and Take in under five minutes, without a binding lesson. Record time, errors
and assistance; assistance or a blocked step does not pass. Phase 15 validates these targets
with the owner rather than asserting that they have already been met.

Separately walk the optional signed-in publish/join/QR journey on a phone-sized browser in under
five minutes, with the starting account state stated. It must not block either primary task.
Local Simulate remains available. Layer: phase 15 prototype and phase 26 recorded product trials.
Automated journeys prove mechanics; they do not replace observation of an unfamiliar person.

### AC-8: Paste and Sheet messages are first-class production content
A pasted body works with no name, reference, platform login or automatic integration. Sheet
starter rows contain Name/Message and optional Source/Reference; the operator previews which
fields will be broadcast. Original text, editable broadcast text and prepared cue revisions are
distinct, with one logical candidate record rather than mirrored editable copies in two views.
Native/imported items and edits persist across reload in local and published productions.

Refresh, row reorder and reconnect do not silently duplicate already imported items. Stable
source IDs distinguish revisions where available. For ID-less Sheets, phase 16 must specify a
conservative rule: never use row position as identity; changed or ambiguous rows may be new
candidates, visibly so, and cannot silently inherit an earlier approval. Identical bodies from
different sources or authors must not be merged just because the text matches. A removed row
does not delete a prepared cue. Late reads after disconnect cannot revive removed candidates.
Layer: Node import/revision contracts and local/configured journeys with reorder, edit, delete,
identical text from distinct senders, reload and an already on-air snapshot.

### AC-9: Provider support and deferral are honest
Phase 15 records direct YouTube scope for live chat and ordinary video comments separately,
including what is available on initial connection, history, pagination, quota and authorization.
The current live-chat reader discards its first history page; decide deliberately which recent
messages users should be able to select rather than inheriting that behavior unnoticed.
A promised comments route needs its own provider proof; neither fixtures nor live chat covers it.
Manual copying is always available. Twitch remains an extension point, existing controls receive
regression coverage, and no new durable Twitch service blocks this run. Layer: qualification
receipt, compatibility checks and separately labeled phase 26 results.

## Phases

The single candidate schedule is in `data-sources/spec.md`:

- 15: prototype paste, Sheet and YouTube alongside lists; qualify provider scope (AC-4/5/7/9).
- 16: source/use boundaries, message identity, revisions and persistence (AC-6/8).
- 21: manual/Sheet intake and preview, without enabling unsafe legacy staging (AC-8).
- 23: safe destinations, reliable staging and exact cue snapshots from all routes (AC-1/2/6/8).
- 24: shared navigation, newcomer tasks and optional join/presenter/votes (AC-3/5/7).
- 25: qualified direct YouTube and Twitch compatibility (AC-4/9).
- 26: combined rehearsal, primary newcomer tasks and separate provider receipts (AC-1 to AC-9).

Open review issue: can the valuable paste-to-graphic result land safely earlier, without waiting
for feeds and API polish or interleaving feature changes with the refactor? Reviewers should
propose the smallest justified dependency chain, not assume the current order is optimal.

## Phase notes
