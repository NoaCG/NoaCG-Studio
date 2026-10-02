---
v: 2
source: owner
kind: ask
raised: 2026-09-28
state: advanced
note: "Researched and decided: docs/HARDWARE_CONTROL_RESEARCH.md landed in c029d2450, and the owner chose its suggestion on 2026-10-01 (recorded below). The build spec and wire protocol landed in docs/work-specs/hardware-panel-control/; still missing: the Companion module, the server side and the page side."
asked: "Built for Companion and Stream Deck: their integration is a later task, but nothing built now may make it harder. Every operator action a named command through the one verb dispatcher and keymap; every state a hardware button would show plain data from one place; it connects through the Bridge's local HTTP (paraphrase of the phase 2 work prompt, 2026-09-28)"
size: standard
touches: supabase/migrations/, src/control/serverState.ts, src/control/serverPlayoutStore.ts, src/components/playoutKeys.ts, src/components/home/ProductionPage.tsx, src/components/HostedControlPage.tsx
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

## Decided (owner, 2026-10-01)

After `docs/HARDWARE_CONTROL_RESEARCH.md` (measurements, the routes compared, the design sketch in its
§10), the owner chose its suggestion on every question in its §11. **This replaces the Bridge relay
the 2026-09-28 prompt assumed.**

- **Route:** a NoaCG Companion module that relays each press through the NoaCG cloud to the open
  operator page, which runs it through `onVerb` exactly as a key press. The keyboard route stays.
  No Bridge relay, no WebHID in the page, and the module never writes the command log itself.
- **Panel access:** a per-production panel key made by pairing. The production page shows a one-time
  code; the module exchanges it for a key that can only ask an open page to run named verbs on that
  production and read the feedback the page publishes. Listed and revocable on the page.
- **Who pairs, and expiry:** anyone who can operate the production may pair a panel; keys do not
  expire and are revoked on the page.
- **No page open:** keys show "no operator page" and presses are refused, never queued.
- **Which page answers:** an explicit "Answer the panel on this page" switch on the production page
  and the hosted control page; the last one switched on wins.
- **Publishing:** the module goes into Bitfocus's repository under the MIT licence they require.

## What it would take

**Where it connects: the NoaCG cloud, through the open page** (decided above). A panel cannot reach a
page in a browser by itself, so the module holds a persistent connection to the cloud and the press is
broadcast to the answering page:

- the answering page PUBLISHES its feedback state (on each change; a server clip's clock as start,
  end, paused and looping so the module counts down itself), and runs relayed presses;
- the page runs each press through its one dispatcher (`onVerb`), exactly as a key press does, so a
  hardware press can never do what the page's own buttons would refuse: a greyed Out stays greyed.
  It refuses a press id it has already run, and a press whose target no longer matches what the key
  showed; the Take it then sends carries the page's own Step 2 sender protocol;
- server clips keep working because the page drives them through its own Bridge connection; the
  panel key never reaches Bridge, so a panel never holds the credential that sends raw AMCP.

The design sketch, the cases (two tabs, phone page, outages) and a build estimate of about four weeks
are in `docs/HARDWARE_CONTROL_RESEARCH.md` §10. The build's acceptance criteria and wire protocol are
`docs/work-specs/hardware-panel-control/spec.md` and `protocol.md`.

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
| All out (the header's panic control) | `all-out` | none, on purpose |
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
the server's state itself (`/state`) for the page; the module reads it from the page's published
feedback, never from the Bridge.

**Not in the first slice:** editing cue values from hardware, a phone surface, and any control that
bypasses the page: a hardware Take is the page's Take.

## Evidence

- `PLAYOUT_DASHBOARD.md` §2: the Stream Deck as a keyboard emulator, today's only route.
- `HARDWARE_CONTROL_RESEARCH.md`: the routes compared and measured (press to first frame p50: keyboard
  133 ms, Companion through the cloud relay 192 ms), the check on CasparCG, OBS and vMix, the panel
  key, and the design sketch the owner chose on 2026-10-01.
- `BRIDGE.md` §3: why the Bridge's token stays away from panels (it also opens `/amcp`).
- `RUNDOWN_AUTOMATION_PLAN.md` item 7 and `LANDSCAPE.md` NEXT item 10: the size (weeks, a module in
  Bitfocus's own repository and review) and the permission question.
- Companion modules are Node packages that call an HTTP or TCP API; its generic HTTP connection can
  press a verb before a dedicated module exists.
