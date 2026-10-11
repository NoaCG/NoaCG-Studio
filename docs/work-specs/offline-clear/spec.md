# Offline clear

Status: agreed with the owner on 2026-10-09 (O1). Not built yet.
Parent: `docs/work-specs/playout-workflow-simplification/spec.md` (non-goal 4, "Local and offline
operation").

## Why

If the internet drops mid-show, NoaCG graphics on `/output` freeze where they are: their commands
travel only through the cloud, so ■ All out reports a failure and leaves them up. The one lever
that still works is Playout › Unload, which stops this production's renderer on CasparCG through
the NoaCG Bridge, a call on the operator's own network. Under pressure nobody finds it.

## Goal

■ All out always clears. When it cannot clear NoaCG graphics through the cloud, it takes this
production's renderer off CasparCG through the Bridge by itself.

## Non-goals

- Take, Update or Out without the cloud, an offline copy of the app, or a local runtime: deferred
  until a real outage shows the need (owner, 2026-10-09).
- Browser outputs (OBS, vMix, a browser source): nothing on the operator's network reaches them.
- Bringing the renderer back by itself: Playout › Load does that, as today.

## Owner decision (2026-10-09, binding)

- **O1. Clear always works, nothing else.** All out falls back to unloading the NoaCG renderer on
  CasparCG through the Bridge when the cloud does not clear it.

## Key decisions

Derived (revertible; each says how):

- **C1. When.** All out's graphics part did not go out, or went out and the outputs still say a
  graphic is on after All out's own confirm window (5 s), while the Bridge reads this production's
  renderer on its CasparCG slot. Revert: only on a send that did not go out.
- **C2. How.** The same call as Playout › Unload, so the renderer stops at once (no out
  animation) and the slot reads empty. Server cues are cleared by All out through the Bridge as
  today.
- **C3. Said once.** The page's existing note line keeps All out's own failure and adds: "Unloaded
  NoaCG graphics from <slot>. When the connection is back, press All out before Load on <slot>." A
  renderer loaded again boots into what the cloud still says is on air, and the All out never
  reached the cloud, so All out comes first. A failed unload says that instead. Revert: the old
  note alone.

## Behaviour

### AC-1: All out clears CasparCG without the cloud
With the production's renderer loaded on CasparCG and the cloud not answering, ■ All out takes the
renderer off the slot within the send's own failure window plus the Bridge call, and the note says
so and what to press once the connection is back.

### AC-2: All out clears CasparCG when the outputs do not confirm
With the cloud answering but the outputs still reporting a graphic on after the confirm window,
All out unloads the renderer the same way.

### AC-3: Nothing changes when All out works
When the outputs confirm All out, nothing is unloaded and nothing more is said.

### AC-4: Nothing to unload
With no renderer of this production on the slot (browser outputs only, another production's
renderer, no Bridge), All out reports its failure as today and touches no slot.

## Preserved behaviour

All out's server cue part, its order and its cut; Playout › Load and Unload; the hardware panel's
all-out press, which runs the same All out on the page.

## Verification

- Offline e2e with a faked backend and the fake Bridge: AC-1 (sends never answered), AC-3, AC-4.
  AC-2 shares C1's code path and is checked by a forced still-on reading in the same spec.
- `/check`, then `/queue-merge`.
