# Publishing while live

Status: decisions agreed with the owner on 2026-11-09 (issue #2303), revised after a second opinion
(grade C) the same day. Not built. Plan name `live-publishing`, preparation only: see `runbook.md`.

## Why

While live, nobody should press "Publish changes". Today the header shows it after a graphic is
added, removed or edited in the editor, and the press runs a check that takes a while. It reads as
"something is wrong until you press me", mid-show.

The owner's priority is fast, predictable and reliable playout: any graphic, any reaction, on screen
as soon as possible. A Take must not wait for anything, and what plays must not depend on the
editor, the wizard or the library.

## What the server copy protects (the safety answer)

Evidence: `docs/CLOUD_PLAYOUT.md` §3, `src/output/reload.ts`, `src/output/prepare.ts`,
`src/output/main.ts:241,611`, `src/backend/sync.ts:19-59`, `src/control/playoutLink.ts:828`,
`docs/work-specs/offline-clear/spec.md`.

| Event | Saved by the server copy | Not saved |
|---|---|---|
| The operator's laptop closes | Outputs keep playing; on-air graphics stay. Another signed-in device opens the production as it was last successfully synced (sync is a background mirror with pending writes) and carries on. | Edits not yet synced; nothing is taken until a laptop is back. |
| The output machine restarts | It loads the latest published version, restores what was on air from its last report and replays missed commands. A graphic on air comes back in its newest published design. | Its download time: the whole stored production. |
| The studio's internet drops | Nothing new: the server is unreachable. Outputs keep what they hold. CasparCG server cues still play through NoaCG Bridge, which needs no cloud, and All out still clears CasparCG through it. | Takes, Updates and Outs of NoaCG graphics; clearing OBS or vMix outputs; an output that restarts during the drop comes back empty. |

## What makes a production big (measured 2026-11-09)

Read-only byte counts on production: 56 published productions, 253 graphics, 46 MB in all, the
largest 8.4 MB.

- **Images, 18 MB, all uploaded by people.** NoaCG's own templates hold no raster images; what NoaCG
  draws is SVG and code. 12.4 MB sit inside graphics (logos and photos in image slots: 40 stored,
  20 different), 5.2 MB are pictures uploaded straight into a rundown (3 productions), 0.6 MB are in
  imported designs. Six images over 500 kB make 6.8 MB.
- **Graphic code, 22 MB, about 87 kB per graphic.** About 60 kB of it is the same animation engine
  copied into every graphic (225 of 253, `src/templates/shared/animRuntime.ts`), and about 35 kB is
  comments (overlapping). The design itself is roughly 10 to 25 kB.
- **Fonts, 1.7 MB.** No imported OGraf package is published yet.

None of this is downloaded at a Take. A Take is a few hundred bytes. Size decides how long an output
takes to start or to load an update.

## Owner decisions (2026-11-09, binding)

- **O1. Publish once, then everything updates by itself.** The first press stays and keeps its name,
  Publish. After it there is no "Publish changes" button and no live mode. "Check now" stays as
  optional proof.
- **O2. The light says it.** Grey "Not published" or "No output". Green "Ready": every output holds
  the current version and answers. Amber "Updating outputs" while a change loads. Red names what
  does not work.
- **O3. An updated graphic on air shows its new design at its next Take, and after an output
  restart** (today's behaviour, `src/output/swap.ts:201`, `src/output/main.ts:929`). Until then it
  keeps its old design and the light stays green with "Scorebug: new design at next Take".
- **O4. A queued graphic is self-contained.** Its own copy in the production is the only thing that
  plays. Editor and wizard changes never reach it by themselves. A newer library design comes in
  through an **Update** button on that graphic, swapped in place, keeping its cues, values,
  adjustments and links.
- **O5. Switching existing productions to their copies.** A published production's copies become
  exactly what is published now; nothing on air changes, and newer library designs wait for Update.
  A production never published takes the library's current design once. (The editor is in alpha;
  no live show depends on unpublished editor edits.)
- **O6. Take sends one command; the output plays what it already holds.** No version checks, no
  lookups, no waits on the way.
- **O7. Never block a Take.** A Take of a graphic an output is still loading plays there as soon as
  it is loaded. The cue shows a "Loading" mark and the light is amber meanwhile.
- **O8. Live adjustments belong to the production page.** Size, position and the other supported
  controls are set there, never through the editor, and must be ready at once.
- **O9. Send only what changed, publishing and saving alike.** Same storage, small patches (option
  B), confirmed by measurement first. Each image is uploaded once, never again. "Our database
  migration is fine" if one is needed.
- **O10. Several people at once.** Target 3 to 5 working together (one playing out, one adding
  interactive messages, one updating a score). Users keep to their roles; same-thing conflicts are
  settled the easiest reliable way. The supported number is measured and written down.
- **O11. CasparCG 2.5 is the target.** Nothing may get worse on 2.3, checked without a full 2.3
  test rig.
- **O12. Simple, safe and fast first.** Only do what makes playout more reliable. Make no change
  that risks reliable playout. The hosted control page is removed
  (`docs/work-specs/retire-hosted-control/spec.md`, issue #2301).
- **O13. Separating the production page into its own app** is a later plan, and only if shown to
  make playout safer or faster (issue #2317).

## Key decisions

Derived (revertible; each says how):

- **C1. Placement presets resolve on the output, compatibly.** A Take carries the preset ("bottom
  right, 40 px in") beside the last measured position. A new output places the graphic from its own
  box; an output opened before this lands uses the position, as today. Revert: drop the preset.
- **C2. Nothing is awaited between press and send.** Every Take path (graphic cue, folder, picture,
  server cue, quick button, Next, hardware panel) captures values and adjustments from memory at the
  press, sends, and saves afterwards. Today's waits go: the adjustment save and box measurement
  (`src/control/adjustGeometry.ts:237-239`), the draft save and history close
  (`src/control/graphicVerbs.ts:671`, `ProductionPage.tsx:3067`), and the Bridge health request
  before a server action (`src/control/playoutLink.ts:566`), which moves outside the press. Revert:
  restore each wait.
- **C3. One source for a production's graphics: its own copy.** The publish payload, the publish
  gate, the "older design" guard, change detection and the production page's monitors read
  `Show.graphics[].template`, never the library (`src/model/library.ts:467`,
  `src/control/hostedControl.ts` `buildOutputPayload`, `src/model/shows.ts`
  `refreshGraphicCopies`, `src/components/home/usePublishDrift.ts`). Adoption follows O5. Revert:
  read the library again.
- **C4. Update warns before it drops anything.** If the newer design lacks a field a cue uses, the
  Update names it and waits for a confirm.
- **C5. Takes are already protected from publishing; keep it so.** Takes write `control_heads` and
  take only a key-share lock on the production row (`supabase/migrations/0071_command_sequence.sql:373`),
  and a publish writes without blocking it (`src/control/hostedControl.ts:665`). Phase 2 measures
  this again; every new write must keep it.
- **C6. Small patches into the same storage.** A change is sent as a patch: one cue, the rundown
  order, one graphic. The server fits it into the stored production and bumps the version per
  graphic; an output fetches only the graphic that changed and reuses the per-graphic swapper
  (`src/output/swap.ts`). How Takes travel does not change. Team saves send the changed parts too
  (`src/backend/teamProductions.ts:261`). Old outputs and old pages keep working against the new
  server, and new pages against a server without the new function (they fall back to today's
  whole publish). Revert: whole publishes again.
- **C7. Delivery of automatic updates.** A change is retried until it is stored; outputs pick it up
  by the existing prepare request and also on reconnect, so a missed signal is caught. The light
  counts outputs that reported in the last 10 minutes, and says amber when an update is older than
  30 s and not yet held by every one of them. An update that cannot be stored stays queued on the
  page and is red after 30 s. Closing the page with an unsent change asks before leaving. The
  output's 15 s spacing between preparations (`src/output/prepare.ts:36`) is kept or shortened
  only if phase 2 shows it is safe.
- **C8. Images stored once.** An image is stored by its content, uploaded once and read by outputs
  as its own file, cached. A graphic or picture cue refers to it. Outputs opened before this lands
  still read today's inline images.
- **C9. Same-thing conflicts keep today's merge.** Different cues never overwrite each other; for
  the same cue the server's copy is kept, and folder and order rules stay as they are
  (`src/model/teamShowMerge.ts:100`).
- **C10. Smaller graphic code, only if measured worth it.** Load the animation engine once per
  output instead of per graphic, and leave comments out of what is published, with a version check
  so graphics built at different times keep working.
- **C11. Server-cue preload, only if measured worth it.** Today a template Take sends `CG ADD … 1`
  and loads cold (`cli/src/playout/adapters/casparcg.ts:292`), always on CG layer 1. Preloading
  needs a spare slot that never touches an on-air template, a readiness answer, cancel on edit or
  reorder, and a defined Take when the preload is not ready.

## Behaviour

Each criterion names its layer. Latency numbers are p95 over at least 50 samples, with failures
counted separately and reported.

### AC-1: A Take never waits on the production page
In a browser, press to command sent is under 50 ms p95 for every Take path in C2, including a cue
whose text and adjustment changed just before, with the save and the Bridge health request
deliberately stalled. Layer: a journey in the production e2e with the stalls injected.

### AC-2: Placement presets are right on the output, and old outputs still work
A cue with a preset, taken right after its text grows, appears at the preset's place on a new
output, and at the sent position on an output opened before the change. Layer: a blank-page browser
spec on the output stage, run against both.

### AC-3: What plays comes only from the production's copy
Editing or breaking a graphic in the library changes nothing on the production page's monitors, in
a publish, or on an output; the graphic shows "Newer design in library". Existing productions adopt
as O5 says. Layer: Node tests on payload building, the gate and adoption; a journey in the
production e2e.

### AC-4: Update swaps the design in place
Update keeps the graphic's cues, values, adjustments, links and stack position, names a dropped
field first, and the outputs load it with no press. Layer: a Node test on the swap; a journey in
the production e2e.

### AC-5: Only what changed is sent
Editing one cue's text, at most 2 kB of text, sends under 20 kB in all requests it causes, publish
and save together, for a production of 30 graphics with 10 MB of images. Updating one graphic
sends that graphic's code and no image already stored. An output downloads only the changed
graphic. Layer: a configured spec that counts request bytes.

### AC-6: Each image is uploaded once
Using the same image in a second graphic or production uploads nothing new; an output reads it once
and caches it. Layer: a configured spec that counts uploads and output reads.

### AC-7: A publish never delays a Take
Take latency, press to output receive, while patches are written in a loop stays within 50 ms of
the same measurement with nothing written. Layer: a configured spec.

### AC-8: Five people at once
Five signed-in production pages on one production for 10 minutes: one taking, one adding messages,
one using quick buttons, two editing cues at the same time, with one page reloading and one losing
and regaining its connection. No command is lost, no different cue is overwritten, and Take latency
stays within 50 ms of a single page. A smoke test, not a capacity limit; the limit found is written
in `docs/CLOUD_PLAYOUT.md` with how it was measured. Layer: a configured spec.

### AC-9: Changes reach the outputs by themselves
After the first publish, adding, removing or updating a graphic, and editing cue text, order or
adjustments, reach every counted output with no press, including after an output reconnects. "Publish
changes" no longer exists. A Take of a graphic still loading plays as soon as it is loaded, with
the cue's "Loading" mark shown meanwhile. Layer: a journey in the production e2e and a configured
spec with a dropped connection.

### AC-10: The light says where things stand
The header light reads: grey "Not published" or "No output"; amber "Updating outputs" while a
counted output does not hold the newest version; green "Ready" once all hold it; red with words when
an output is lost, an update fails or is unsent for 30 s, or CasparCG does not answer. An updated
graphic on air shows "<graphic>: new design at next Take" with the light green. "Check now" still
runs the full check. Layer: `scripts/playout-status.test.mjs` for the words, the production e2e for
the flow.

### AC-11: The studio walk
On the owner's CasparCG 2.5 with a browser output beside it, a quiz Take is timed press to first
frame over 20 Takes, every light state is seen, and CasparCG 2.3 plays the same show no worse than
before. Layer: owner walk, receipt in `evidence/`.

## Preserved behaviour

- The first Publish: account gate, output setup, loading the CasparCG slot.
- An on-air graphic is never swapped mid-air; a re-Take takes the new design (O3).
- Outputs never reload during an outage (`src/output/reload.ts`) and replay missed commands.
- All out's fallback through NoaCG Bridge; CasparCG server cues play without the cloud.
- The output URL and every slug stay the same; open outputs and open pages keep working across
  every phase.

## Non-goals

- Taking graphics without the internet.
- Locking a cue while someone edits it.
- A full CasparCG 2.3 test rig.
- Separating the production page into its own app (O13, a later plan).
- Changing what a graphic looks like through the production page beyond today's adjustments.

## Phases

Each phase is one pull request, landed with `/queue-merge`, and adds its notes to
`## Phase notes`. A phase that would change behaviour the owner has not decided stops and asks.

1. **Retire the hosted control page.** `docs/work-specs/retire-hosted-control/spec.md` in full,
   its AC-1 to AC-5. First, because it removes a second surface every later phase would change.
2. **Measure.** No product change. In a browser and on the configured stack: press to send for
   every Take path, send to output, output to first frame, for a quiz with and without a preset and
   a server cue; Take latency while a publish is written (C5); every request and its bytes caused by
   one cue edit, one graphic add and one design update, publish and save together; output start and
   update time for a 1 MB and a 10 MB production. Receipt in `evidence/`. This is the baseline
   every later number is compared with, and it decides C6's shape, C10 and C11.
3. **A Take never waits.** C1, C2. AC-1, AC-2.
4. **The production's copy is the only truth.** C3, C4, O5's adoption, the Update button. AC-3,
   AC-4.
5. **Send only what changed.** C6, publishing and team saves, with old and new clients against old
   and new servers. AC-5, AC-7.
6. **Images stored once.** C8. AC-6.
7. **Five people at once.** AC-8, before automatic updates are switched on.
8. **Updates by themselves, and the light.** O1, O2, O3, O7, C7: remove "Publish changes". AC-9,
   AC-10.
9. **Smaller graphic code (only if measured worth it).** C10, only if phase 2's method, run again
   after phase 8, shows output start over 3 s for a typical production on desktop Chromium.
   Otherwise recorded as not needed, with the numbers.
10. **Preload server cues (only if measured worth it).** C11, only if phase 2 shows a server
    template Take over 300 ms p95 from the Take reaching the Bridge to first frame. Otherwise
    recorded as not needed. If built: two templates in a row on one destination on CasparCG 2.5
    never touch the one on air.
11. **The studio walk (owner).** AC-11 on the owner's hardware.

## Phase notes

Filled in by each phase's pull request.
