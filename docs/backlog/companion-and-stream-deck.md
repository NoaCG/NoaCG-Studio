---
v: 2
source: owner
kind: ask
raised: 2026-09-28
state: unstarted
asked: "Built for Companion and Stream Deck: their integration is a later task, but nothing built now may make it harder. Every operator action a named command through the one verb dispatcher and keymap; every state a hardware button would show plain data from one place; it connects through the Bridge's local HTTP (paraphrase of the phase 2 work prompt, 2026-09-28)"
size: standard
touches: cli/src/playout/, src/control/serverState.ts, src/control/serverPlayoutStore.ts, src/components/playoutKeys.ts, src/components/home/ProductionPage.tsx
needs-owner: none
---
# Drive the production page from Bitfocus Companion and a Stream Deck, with live feedback

**Filed:** 2026-09-28. **Source:** the owner, in the work prompt for phase 2 of
[`CLIP_PLAYBACK_PLAN.md`](../CLIP_PLAYBACK_PLAN.md): the integration is a later task, it connects
through NoaCG Bridge's local HTTP, and nothing built before it may make it harder. It is item 7 of
[`RUNDOWN_AUTOMATION_PLAN.md`](../RUNDOWN_AUTOMATION_PLAN.md), recommended there for later.

## Why

A playout operator's hands are on hardware. A Stream Deck already drives the production page, but
only as a keyboard (`PLAYOUT_DASHBOARD.md` §2): a button sends SPACE or `0`, it works only while the
window has focus and the playout column is on screen, and it shows nothing back. A button that lights
red while its cue is on air, and a key that shows the clip's remaining seconds and flashes in the last
five, is what makes hardware worth having on a live show: the operator watches the program, not the
laptop. Companion is the free, widely used bridge between a Stream Deck (and other panels) and show
software, so one Companion connection reaches most of the hardware a school or a small studio owns
(`LANDSCAPE.md`, the Stream Deck row).

## What it would take

**Where it connects: the Bridge.** A panel cannot reach a page in a browser. NoaCG Bridge already
serves local HTTP on `127.0.0.1:8899` with a token and an origin check (`BRIDGE.md` §3), and it is the
only thing that reaches the operator's playout server. The shape that fits is a small relay there:

- the page PUBLISHES its feedback state to the Bridge (on each change of the store's ownership part,
  and a few times a second at most for the timing part), and asks the Bridge for commands a panel
  pressed;
- a Companion module, or at first Companion's generic HTTP connection, talks to the Bridge: it reads
  the states and posts a named verb. The page runs that verb through its one dispatcher (`onVerb`),
  exactly as a key press does, so a hardware press can never do what the page's own buttons would
  refuse: a greyed Out stays greyed.
- **One decision at build time, for the owner**: how a panel authenticates. A second token scoped to
  verbs, paired the way the page is, is the likely answer: the new consented permission, not an
  extension of an existing key, that `LANDSCAPE.md` (its NEXT list, item 10) already asks for. The
  fixed rule is that a panel never holds the credential that sends raw AMCP.

The hosted route of `CONTROL_PANEL_ROAD.md` §4 (an automation client as one more writer of the
published command log) still stands for graphics with no page open. It cannot reach a server cue,
because only the operator's Bridge reaches the server; the Bridge relay reaches both, through the page.

**The actions**, each already a NAMED verb in `src/components/playoutKeys.ts` and dispatched by the
production page's `onVerb`:

| Action | Verb | Key today |
|---|---|---|
| Take / take off (the SPACE toggle, honouring the operator's SPACE mode) | `take` | SPACE |
| Re-take | `retake` | R |
| Update | `update` | U |
| Next | `next` | N |
| Out | `out` | 0 |
| Select the previous / next cue | `select-prev` / `select-next` | ↑ / ↓ |
| Pause / resume a server clip | `pause` / `resume` | none yet (`P` comes with phase 3) |
| All out | not a verb yet: the header's panic control needs its own named command before hardware gets it | none |
| Select cue N, take cue N | not verbs yet: a module will want them, and they belong in the dispatcher, not in the relay | none |

**The feedback states**, each plain data in the store's two parts
(`src/control/serverPlayoutStore.ts`) or in the page's own state, read through the same pure
functions the page draws with:

| State | From |
|---|---|
| a cue is ON AIR (a graphic or a server cue) | `liveCue` for graphics; the ownership part's `onAir` for server cues |
| the selected cue (what PREVIEW shows) | the page's `selectedCueId` |
| the clip's remaining time, HOLDING, PAUSED, looping, estimated | `clipClock()` in `src/control/serverState.ts` over the two parts |
| the 10 and 5 second warnings | the same answer: its `phase` is `warning` or `final` |
| NEXT ON SERVER | the ownership part's `queued` |
| replaced on the server, an unidentified item | the ownership part's `replaced` and `unidentified` |
| whether each verb is allowed now | the page's own enabled states (`canTake` and the rest): published with the rest, never re-derived by the module |
| the Bridge and the server connection | the page's `bridgeStatus` |

**What phase 2 did to keep this open** (2026-09-28): the clip clock, the remaining times and the
server-state markers are computed by plain functions over the store (`clipClock`, `remainingAt`,
`applyReading`), never inside a component, so a relay can publish exactly what the page shows.
Pause and Resume became named verbs through `onVerb` rather than click handlers. The Bridge reads
the server's state itself (`/state`), and it is the same process a module would talk to.

**Not in the first slice:** editing cue values from hardware, a phone surface, and any control that
bypasses the page: a hardware Take is the page's Take.

## Evidence

- `PLAYOUT_DASHBOARD.md` §2: the Stream Deck as a keyboard emulator, today's only route.
- `BRIDGE.md` §3: the Bridge's routes, token and origin rules a relay would sit behind.
- `RUNDOWN_AUTOMATION_PLAN.md` item 7 and `LANDSCAPE.md` NEXT item 10: the size (weeks, a module in
  Bitfocus's own repository and review) and the permission question.
- Companion modules are Node packages that call an HTTP or TCP API; its generic HTTP connection can
  press a verb before a dedicated module exists.
