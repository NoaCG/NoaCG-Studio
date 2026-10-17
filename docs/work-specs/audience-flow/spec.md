# Audience flow: viewer messages reach the right graphic in a few plain steps

Authority: owner, 2026-10-16 (see `work.json`). **Draft**: the decisions under "Owner decisions"
are open, each with a recommendation; nothing is built until they are answered. Once agreed, its
phases join `/plan-run production-page` after the page cleanup (1-14) and the data phases: 21
onward after the Sheet data flow (15-20) as agreed, or 23 onward if the data sources spec's draft
phases 15-22 replace them (its DS16). Parent: `docs/GOALS.md` outcome 5 (the playout dashboard,
with its Data and Audience tabs); the model it shares with data is
`docs/work-specs/data-sources/spec.md` (draft). Built on: `docs/INTERACTIVE_PLAYOUT_PLAN.md`
phases 5 and 6 and its audience backend design.

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

Not walked, because they need a published production: the join page on a phone, the presenter
view, a vote on air, a real Twitch or YouTube source. Phase 1 walks them on the local stack.

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
that must stay connected does not fit a serverless function, so the published half of A4 needs a
worker that stays connected or the database's scheduler. Phase 4 settles that design; nothing here
decides it.

## Owner decisions (open; recommendation first)

- **A1. Where audience lives.** Recommendation: the Audience tab is always there next to Playout
  and Data, never added through Setup, and opens on the inbox; turning messages on is the tab's
  first control.
- **A2. No graphic for messages.** Recommendation: when no graphic in the production takes a
  message, "Send to rundown" offers a viewer question card from the catalog (House, Volt, Frost or
  Clean Question; one press) and then sends the message to it; never a fallback to an unrelated
  graphic. With several message graphics, the operator picks one once and it is remembered for the
  production.
- **A3. Actions per message.** Recommendation: one primary action, "Put in rundown" (it approves
  too), plus Reject; Shortlist, Now and Next move into a small menu, and Now and Next say "for the
  presenter view".
- **A4. Chat sources.** Recommendation: they become production sources like the Sheet (the shared
  source core from `docs/work-specs/sheet-data-flow/spec.md`): remembered with the production, read
  by the server when published and by the browser when not, with status and Pause in the tab and
  on the one sources line of the data sources spec (DS14).
- **A5. Joining without publishing.** Recommendation: the tab says plainly that phones need a
  published production, with the Publish step one press away; Simulate stays the way to rehearse
  locally.

## Acceptance criteria

### AC-1: A message only goes where it fits
With no graphic that takes a message, sending one adds no cue and offers the viewer question card;
with one, the message lands in its message field and the author in its name field. Layer: Node
test on the target choice; a journey in `e2e/production-audience.spec.ts`.

### AC-2: One obvious action per message
Each message shows one primary action and Reject; the other actions are one press away and say
what they do. Layer: journey; owner look in the pull request.

### AC-3: The tab is always in the same place
The Audience tab is present on every production in the same position, and the Setup menu has no
item that adds or removes it. Layer: journey.

### AC-4: Chat sources survive a reload and a closed page when published
A connected chat source is remembered with the production; published, messages keep arriving
with every operator page closed; status and Pause are in the tab. Layer: Node test on the source
core; configured suite for the published path; `e2e/production-chat-intake.spec.ts` for the tab.

### AC-5: The published flow is walked and its findings settled
The join page on a phone-sized browser, the presenter view and a vote on air are walked on the
local stack; each finding is fixed in this plan or filed. Layer: scenario run in `evidence/`.

## Phases

1. **Walk the published flow** on the local stack (AC-5, findings only) and fix #1313 (AC-1).
2. **The tab and the actions** (AC-2, AC-3), per A1 and A3.
3. **Joining** (A5) and the viewer question card offer (A2, AC-1 rest).
4. **Chat sources as production sources** (AC-4), after the shared source core (data sources
   phase 15).

## Phase notes
