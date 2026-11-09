# Publishing while live

Status: decisions agreed with the owner on 2026-11-09 (issue #2303); waiting for a second opinion
before the plan is final. Not built. Plan name `live-publishing`, preparation only: see `runbook.md`.

## Why

While live, nobody should press "Publish changes". Today the header shows it after a graphic is
added, removed or edited in the editor, and the press runs a check that takes a while. It reads as
"something is wrong until you press me", mid-show.

The owner's priority is fast, predictable and reliable playout. A Take must not wait for anything,
and what plays must not depend on the editor, the wizard or the library.

## What the server copy protects (the safety answer)

Evidence: `docs/CLOUD_PLAYOUT.md` §3, `src/output/reload.ts`, `src/output/prepare.ts`,
`src/backend/sync.ts:59`, `docs/work-specs/offline-clear/spec.md`.

| Event | Saved by the server copy | Not saved |
|---|---|---|
| The operator's laptop closes | Outputs keep playing; on-air graphics stay; another signed-in device opens the production and carries on (the record syncs to the account). | Nothing is taken until a laptop is back. |
| The output machine restarts | It loads the published copy, rebuilds what was on air from its last report and replays missed commands. | Its download time: the whole payload today (average 244 kB, largest 6.7 MB). |
| The studio's internet drops | Nothing new: the server is unreachable. Outputs keep what they hold; All out still clears CasparCG through NoaCG Bridge. | Takes, Updates and Outs; clearing OBS or vMix outputs; an output that restarts during the drop comes back empty. |

## Owner decisions (2026-11-09, binding)

- **O1. Publish once, then everything updates by itself.** The first press stays and keeps its name,
  Publish. After it there is no "Publish changes" button and no live mode. "Check now" stays as
  optional proof.
- **O2. The light says it.** Grey "Not published" or "No output". Green "Ready": every output holds
  the current version and answers. Amber "Updating outputs" while a change loads. Red names what
  does not work. A graphic on air when its update arrives keeps its old design until cleared; the
  light stays green with a note such as "Scorebug updates when cleared".
- **O3. A queued graphic is self-contained.** Its own copy in the production is the only thing that
  plays. Editor and wizard changes never reach it by themselves; the owner no longer wants editor
  edits to update queued graphics live. A newer library design comes in through an **Update**
  button on that graphic in the production, swapped in place, keeping its cues, values,
  adjustments and links.
- **O4. Take sends one command; the output plays what it already holds.** No version checks, no
  lookups, no waits on the way.
- **O5. Live adjustments belong to the production page.** Size, position and the other supported
  controls are set there, never through the editor, and must be ready at once.
- **O6. Upload in two parts.** Graphics are stored one by one and sent only when one is added,
  removed or updated. Cue text, rundown order and adjustments are a small separate update. "Our
  database migration is fine."
- **O7. Several people at once.** Target 3 to 5 working together (one playing out, one adding
  interactive messages, one updating a score). Users keep to their roles; when two edit the same
  thing, the later edit wins. The supported number is measured and written down.
- **O8. CasparCG 2.5 is the target.** Nothing may get worse on 2.3, checked without building a full
  2.3 test rig.
- **O9. Simple and reliable first.** Only do what makes the production page more reliable and
  maintainable. The hosted control page is removed (`docs/work-specs/retire-hosted-control/spec.md`,
  issue #2301).

## Key decisions

Derived (revertible; each says how):

- **C1. Placement presets resolve on the output.** A Take carries the preset ("bottom right, 40 px
  in") and the output places the graphic from its own measured box. The production page stops
  measuring before a Take. Revert: send the measured position again.
- **C2. No waiting before a send.** A Take sends what the page holds at the press. An adjustment
  still being saved is sent from memory, not awaited. Revert: restore the capped waits
  (`src/control/adjustGeometry.ts:237-239`).
- **C3. One source for a production's graphics: its own copy.** The publish payload, the publish
  gate, the "older design" guard, the change detection and the production page's monitors all read
  `Show.graphics[].template`, never the library (couplings in `src/model/library.ts:467`
  `templateForSavedGraphic`, `src/control/hostedControl.ts` `buildOutputPayload`,
  `src/model/shows.ts` `refreshGraphicCopies`, `src/components/home/usePublishDrift.ts`).
  Revert: read the library again.
- **C4. Update warns before it drops anything.** If the newer design lacks a field a cue uses, the
  Update names it and waits for a confirm. Nothing else is asked.
- **C5. Publishing never touches the row a Take updates.** Graphics and the rundown are written
  outside the `control_shows` row that every Take and Out update, so a publish can never hold a
  Take (measured: a held row made Takes fail after about 3 s, `docs/PLAYOUT_ISOLATION_RESEARCH.md`
  §5.3). The migration changes the live-path contract, so it applies in a quiet window
  (`supabase/AGENTS.md`).
- **C6. Rundown updates are debounced.** The small update goes about 2 s after typing stops, and
  each cue is written on its own, so different people's cues never overwrite each other.
- **C7. Server cues preload.** A CasparCG template cue next in the rundown is loaded with
  `CG ADD … 0` ahead of its Take, and the Take sends `CG PLAY`. Today every Take sends
  `CG ADD … 1` and loads cold (`cli/src/playout/adapters/casparcg.ts:292`). Revert: play on load.
- **C8. Images stored once, only if needed.** Content-named image files are uploaded once and
  reused. Built only if measurement after phase 6 shows design updates are still heavy.

## Behaviour

### AC-1: A Take never waits on the production page
From press to the command leaving the page is under 50 ms for any cue, including a cue with a
placement preset whose text just changed and a Take pressed right after an adjustment. Layer: a
Node test of the press path and a journey in the existing production e2e.

### AC-2: Placement presets are right on the output
A cue with a preset, taken right after its text grows, appears at the preset's place on the output.
Layer: a blank-page browser spec on the output stage.

### AC-3: What plays comes only from the production's copy
Editing or breaking a graphic in the library changes nothing on the production page's monitors,
in a publish, or on an output. The production shows "Newer design in library" on that graphic.
Layer: Node tests on payload building and the publish gate; a journey in the production e2e.

### AC-4: Update swaps the design in place
Pressing Update on a graphic takes the library's design, keeps its cues, values, adjustments,
links and stack position, and the outputs load it by themselves. A dropped field is named first.

### AC-5: Changes reach the outputs by themselves
After the first publish, adding, removing or updating a graphic, and editing cue text, order or
adjustments, reach every output with no press. "Publish changes" no longer exists.

### AC-6: The light says where things stand
The header light reads: grey "Not published" or "No output"; amber "Updating outputs" while any
output loads a newer version; green "Ready" once every output holds it; red with words when an
output is lost, an update fails or CasparCG does not answer. A graphic on air keeps its old design,
and the light stays green with "<graphic> updates when cleared". "Check now" still runs the full
check. Layer: `scripts/playout-status.test.mjs` for the words, the production e2e for the flow.

### AC-7: Uploads are small
Changing cue text uploads under 20 kB whatever the production's size. Adding or updating one graphic
uploads that graphic only. An output downloads only what changed. Layer: a configured spec that
counts request bytes.

### AC-8: A publish never delays a Take
Takes sent while an update is being written arrive as fast as Takes sent with nothing being written
(within 50 ms at p95). Layer: a configured spec that publishes in a loop while taking.

### AC-9: Server cues play at once
A CasparCG template cue that was next in the rundown starts within one frame of the Take reaching
the Bridge. Layer: a Node test of the Bridge commands; timed in the owner walk.

### AC-10: Five people at once
Five signed-in production pages on one production, one taking, one adding messages, one using
quick buttons, two editing cues, run for 10 minutes with no lost command, no overwritten different
cue, and Take latency within 50 ms of a single page. The measured limit is written in
`docs/CLOUD_PLAYOUT.md`. Layer: a configured spec.

### AC-11: The studio walk
On the owner's CasparCG 2.5 with a browser output beside it, a quiz Take is timed press to first
frame, every light state is seen, and CasparCG 2.3 plays the same show no worse than before.

## Preserved behaviour

- The first Publish: account gate, output setup, loading the CasparCG slot.
- An on-air graphic is never swapped mid-air (`src/output/prepare.ts`).
- Outputs never reload during an outage (`src/output/reload.ts`) and replay missed commands.
- All out's fallback through NoaCG Bridge.
- The output URL and every slug stay the same; open outputs keep working across the migration.

## Non-goals

- Taking graphics without the internet.
- Locking a cue while someone edits it.
- A full CasparCG 2.3 test rig.
- Changing what a graphic looks like through the production page beyond today's adjustments.

## Phases

Each phase is one pull request, landed with `/queue-merge`, and adds its notes to
`## Phase notes`.

1. **Retire the hosted control page.** `docs/work-specs/retire-hosted-control/spec.md` in full,
   its AC-1 to AC-5, as its own owner prompt describes. First, because it removes a second surface
   every later phase would otherwise change.
2. **Measure the Take path.** Time press to send, send to output, output to first frame for a quiz
   with and without a placement preset, a server cue, and a Take during a publish, on desktop
   Chromium. Receipt in `evidence/`. No product change. This is the baseline for AC-1 and AC-8.
3. **A Take never waits.** C1, C2. AC-1, AC-2.
4. **The production's copy is the only truth.** C3, C4, the Update button. AC-3, AC-4.
5. **Store graphics and the rundown apart.** C5, C6, the migration (quiet window), outputs and the
   production page reading the new shape, old publications still readable. AC-7, AC-8.
6. **Updates by themselves, and the light.** O1, O2: remove "Publish changes", automatic updates,
   the light's states. AC-5, AC-6.
7. **Preload server cues.** C7. AC-9.
8. **Five people at once.** AC-10, and the limit written down.
9. **Images stored once (only if needed).** C8, only if phase 2's method run after phase 6 shows a
   design update over 1 MB for a typical production. Otherwise recorded as not needed.
10. **The studio walk (owner).** AC-11 on the owner's hardware.

## Phase notes

Filled in by each phase's pull request.
