# Audience flow: viewer messages reach the right graphic in a few plain steps

Authority: owner, 2026-10-16 (see `work.json`). The decisions under "Owner decisions" were answered
on 2026-10-17: the owner took every recommendation. **Still a draft** until the data sources spec
is agreed after its second opinion; nothing is built before then. The proposed phases join
`/plan-run production-page` as 23-25, with integration in 26, after the page cleanup (1-14) and
the data sources phases 15-22 (DS16, proposed P5). Parent: `docs/GOALS.md` outcome 5 (Data and
Audience tabs); the model it shares with data is `docs/work-specs/data-sources/spec.md` (draft).
Built on: `docs/INTERACTIVE_PLAYOUT_PLAN.md` phases 5 and 6 and its audience backend design.

## Second-opinion proposal, 2026-10-17

See `docs/research/2026-10-data-sources/second-opinion.md` and data-sources P1-P5. These are
proposed refinements, not new owner answers. A1-A3 and A5 stand. A4 keeps production persistence,
one reader, status and Pause, but its shared core means shared management and narrow destination
interfaces, not one identical polling loop. Chat uses a subscription runner; a database scheduler
cannot itself hold an IRC or streaming connection. Qualify provider access, reconnect behavior,
runtime lifetime and cost before promising closed-page delivery. No silent new platform OAuth.

Audience remains an inbox. Neither an equal field title nor an approved message creates a live
data binding. The message is copied into a compatible cue, and later viewer edits or arrivals
cannot mutate it. Keep the existing deliberate vote staging and explicit live-tally switch.
The Data and Audience interaction is prototyped together in phase 15; the safe destination fix,
inbox/join flow and chat work follow sequentially in 23-25, with combined acceptance in 26.

Review, 2026-10-17: the owner asked whether these phases deliver the intended audience workflow.
The criteria below now explicitly cover remembered target choice, exact broadcast text, safe
retry and an unaided newcomer journey. These make A1-A5 observable; they do not approve the draft
or add a redesign of the public join page. Phase 15 still has to qualify provider access and
durable chat before phase 25 can be called ready.

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

An operator who wants viewers' questions on air turns on the audience, shares one link or QR, and
puts a chosen message into a graphic made for it, in a few presses, with the original text kept
and the broadcast text editable. A message never lands in a graphic not made for it.

## Non-goals

- Automatic airing of any message or vote result.
- Per-show customisation of the join page (backlog item, its own decision about what a guessed
  link may reveal).
- New chat platforms or platform OAuth.
- Moving local work into an account (a sign-in matter for the whole product, not this tab).

## Where the audience fits (2026-10-17)

The data sources spec asks whether the audience is just another data source (DS11-DS14); the owner
accepted its recommendations on 2026-10-17. The answer, C: audience sources (the join page, Twitch,
YouTube) sit on the same sources line as data sources, with status and Pause, and run on the same
source core (A4 below), but they write only to the inbox; a message reaches air only as a cue the
operator takes. Votes stay staged by the operator. The research behind it
(`docs/research/2026-10-data-sources/README.md` §2.6, §5) also found, for A4: reading Twitch chat
anonymously works but is not documented (the documented way needs a user token); YouTube's daily
quota is per Google project, and its streaming method costs far less than polling; and a listener
that must stay connected needs an explicitly supported runtime and recovery strategy. A database
scheduler may dispatch bounded reads but is not a replacement for an open chat connection.
Data-sources phase 15 qualifies the options and phase 25 implements the qualified choice.

## Owner decisions (answered 2026-10-17)

The owner, 2026-10-17: "yes, use your recommendations for A1-A5 too." Each answer below was the
recommendation.

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

### AC-3: The tab is always in the same place
The Audience tab is present on every production in the same position, and the Setup menu has no
item that adds or removes it. Layer: journey.

### AC-4: Chat sources survive a reload and a closed page when published
A connected chat source is remembered with the production; published, messages keep arriving
with every operator page closed; status and Pause are in the tab. One source has one intake owner,
and reconnecting does not duplicate already received messages. Pause prevents new intake while
existing inbox messages remain usable. A disconnect, quota refusal or missing authorization is
shown honestly with the next useful action; no source says connected before a successful intake
connection. Prove the promised behavior separately for Twitch and YouTube with actual provider
access; fixtures alone do not establish platform support. Layer: Node state/reconnect tests;
configured suite; `e2e/production-chat-intake.spec.ts`; provider scenario receipts.

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
Layer: Node target/field-value contracts; audience journey with two cues and a competing data
binding; configured published Take scenario. This preserves the existing live-data precedence
for ordinary graphics while protecting the audience snapshot.

### AC-7: A newcomer completes the message journey without a guide
Using a signed-in test production ready to publish and a second phone-sized browser, someone
unfamiliar with Audience opens the tab, enables messages, publishes if needed, shares the join
link or QR, submits a question, edits it, puts it in rundown and takes it in under five minutes,
without instructions from the tester or opening documentation. Include a production with no
message graphic, so the card offer is exercised. Record time, missteps and assistance; assistance
or a blocked step means the trial did not pass. Repeat after correcting the flow. Rehearsing
locally with Simulate also stays available. Layer: prototype task in phase 15; recorded product
scenario in phase 26. This does not claim to solve moving signed-out local work into an account.

## Phases

The candidate schedule is defined once, in `data-sources/spec.md` P5 and its phase list:

- 15: prototype both journeys and walk the published flow (AC-5 findings, AC-7 prototype).
- 23: fix #1313, remember compatible targets and preserve cue snapshots (AC-1/6).
- 24: stable inbox, reliable actions and publishing/joining/vote/presenter flows (AC-2/3/5/7).
- 25: persistent chat with the qualified subscription runner (AC-4).
- 26: combined rehearsal, closed-page intake and the unaided message journey (AC-1 to AC-7).

AC-4 remains unverified if provider access or runtime feasibility is blocked. Other completed
flows may be recorded individually; a blocked provider never becomes a claim of full acceptance.

## Phase notes
