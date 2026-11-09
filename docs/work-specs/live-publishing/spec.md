# Publishing while live

Status: owner decisions of 2026-11-09 (issue #2303), revised after two second opinions (both grade
C). Owner decisions D1 to D6 settled the same day ("All as recommended"). Draft until a third
second opinion. Not built. Plan name
`live-publishing`, preparation only: see `runbook.md`.

## Why

While live, nobody should press "Publish changes". Today the header shows it after a graphic is
added, removed or edited in the editor, and the press runs a check that takes a while. It reads as
"something is wrong until you press me", mid-show.

The owner's priority is fast, predictable and reliable playout: any graphic, any reaction, on screen
as soon as possible. Nothing may risk reliable playout.

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

Read-only queries on production, `control_shows.output` only (not the `panel` column, which also
carries graphic code, `src/control/hostedControl.ts:368`). Bytes are the stored JSON text: images
and fonts are base64 data URLs, about a third larger than the files. 56 published productions, 253
graphics, 46.3 MB in all, the largest 8.4 MB.

| Part | MB | Notes |
|---|---|---|
| Graphic code (`js`) | 22.1 | About 87 kB per graphic. About 68 kB of a graphic built from a NoaCG template is the animation engine with its sound and ease runtimes, the same in every one (225 of 253; `src/templates/shared/animRuntime.ts:19-27`). Generated code keeps its comments (`src/templates/shared/base.ts:400`), about 35 kB per graphic, overlapping the engine. |
| Images | 18.2 | All uploaded by people; NoaCG's templates hold none. 12.4 MB inside graphics (40 stored, 20 different), 5.2 MB as rundown pictures (3 productions), 0.6 MB in imported designs. Six images over 500 kB make 6.8 MB. |
| HTML and CSS | 3.8 | 1.9 MB each. |
| Fonts | 1.7 | |
| Other files | 0.3 | |
| The rest | about 0.8 | Cues, keys and JSON escaping. |

No imported OGraf package is published yet. Size decides how long an output takes to start or to
load an update. A Take does not download the production; it carries the cue's values
(`src/control/graphicVerbs.ts:763`), observed at a few hundred bytes, not a bound.

## Agreed owner decisions (2026-11-09)

- **O1. Publish once, then everything updates by itself.** The first press stays and keeps its name,
  Publish. After it there is no "Publish changes" button and no live mode. "Check now" stays.
- **O2. The light says it.** Grey "Not published" or "No output". Green "Ready". Amber "Updating
  outputs" while a change loads. Red names what does not work.
- **O3. An updated graphic on air shows its new design at its next Take, and after an output
  restart** (today: `src/output/swap.ts:201`, `src/output/main.ts:929`). Until then the light stays
  green with "Scorebug: new design at next Take".
- **O4. A queued graphic is self-contained.** Its copy in the production is the only thing that
  plays. A newer library design comes in through **Update** on that graphic, swapped in place,
  keeping its cues, values, adjustments and links.
- **O5. Adoption.** A published production's copies become what is published now; a production never
  published takes the library's current design once.
- **O6. Take sends one command; the output plays what it already holds.** No lookups or waits on the
  way.
- **O7. Never block a Take.** A Take of a graphic an output is still loading plays there once it is
  loaded, with a "Loading" mark on the cue meanwhile, within D1's limits.
- **O8. Live adjustments belong to the production page**, never the editor, ready at once.
- **O9. Send only what changed, publishing and saving alike.** Same storage, small patches. Each image
  is uploaded once. "Our database migration is fine" if one is needed.
- **O10. 3 to 5 people at once,** keeping to their roles; same-thing conflicts settled the easiest
  reliable way. The supported number is measured and written down.
- **O11. CasparCG 2.5 is the target;** 2.3 must not get worse, checked without a full 2.3 rig.
- **O12. Simple, safe and fast first.** No change that risks reliable playout. The hosted control
  page is removed (`docs/work-specs/retire-hosted-control/spec.md`, #2301).
- **O13. Separating the production page** is a later plan, only if shown safer or faster (#2317).

## Owner decisions D1 to D6 (settled 2026-11-09: "All as recommended")

Each was put to the owner with a recommendation; he accepted every recommendation. On D1 he added:
"I hope that's just a theoretical maximum." The 5 s is a ceiling, not an expected wait; phase 2
measures real load times.

- **D1. A Take while an output is still loading.** (a) A brand-new graphic: how long may the Take be
  held before it is dropped and the light turns red? **Decided: 5 s.** (b) An updated graphic whose
  old design is ready and new design still loading: play the old design now, or wait for the new?
  **Decided: play the old design now, and say "Scorebug aired its previous design".**
- **D2. Refusals under "never block a Take".** Today a Take is refused, with a note, when its typed
  data is invalid (`src/control/graphicVerbs.ts:679`) or when it was pressed on a stale view of air
  (`supabase/migrations/0071_command_sequence.sql:431`). **Decided: keep both.** They stop wrong
  air; they are refusals, not waits.
- **D3. Pages opened before phase 6 lands.** They still publish the library's design
  (`src/control/hostedControl.ts:473`), which would break O4. **Decided: they keep taking and
  editing cues, but their publishes are refused with "Reload this page to publish".**
- **D4. Forgetting outputs.** Today an output stays expected until someone presses Forget
  (`src/control/readiness.ts:463,493`), so a lost one keeps the light red. **Decided: keep that;
  never forget automatically.**
- **D5. Optional work out of this run.** Smaller graphic code (one engine per output, no comments)
  and preloading CasparCG server cues add risk for unproven gain. **Decided: move both to their own
  follow-ups, started only if this run's measurements justify them.**
- **D6. Changes not yet sent when the browser fails.** **Decided: they stay in the browser's own
  storage and are sent when the production page opens again on that device; a lost device loses
  them** (the owner accepted laptop loss).

## Requirements

What must be true when the work is done. "Today" lines are facts from the current code.

- **R1. Placement presets resolve on the output, compatibly.** A Take carries the preset beside the
  last measured position. A new output places the graphic from its own box; an output opened before
  this lands uses the position.
- **R2. Nothing is awaited between press and send, and order is kept.** Every Take path (graphic cue,
  folder, picture, server cue, quick button, Next, hardware panel) captures values and adjustments
  from memory, sends, and saves afterwards. Today's waits:
  - adjustment save and box measurement, up to 1 s and 2 s (`src/control/adjustGeometry.ts:237-239`);
  - draft save and history close (`src/control/graphicVerbs.ts:671`, `ProductionPage.tsx:3067`);
  - working out how commands travel, on a fresh page (`src/control/hostedControl.ts:1744`);
  - one send in flight per graphic, up to the 1.5 s attempt (`src/control/hostedControl.ts:1847`,
    `src/control/seqSend.ts:221`);
  - a folder's Outs before its next Take (`src/control/folderPlayout.ts:297`);
  - a 250 ms save head start for server cues (`src/control/serverVerbs.ts:84`);
  - the Bridge health request before a server action (`src/control/playoutLink.ts:566`).

  The per-graphic queue exists so two Nexts never arrive out of order. Removing its wait must keep
  that order, for example by numbering sends at the press so the server applies them in press
  order. If order cannot be kept without the wait, phase 3 stops and reports.
- **R3. One source for a production's graphics: its own copy** (O4, O5), in the payload, the gate,
  the "older design" guard, change detection and the monitors.
- **R4. Update names a dropped field first** and waits for a confirm.
- **R5. Takes stay protected from publishing.** Today a Take takes a key-share lock on the production
  row and a publish writes without blocking it
  (`supabase/migrations/0071_command_sequence.sql:373`, `src/control/hostedControl.ts:665,969`).
  Every new write keeps that.
- **R6. Small patches, with revisions.** A change is a patch (one cue, the order, one graphic) sent
  with the revision it was based on. The server applies it only on that revision; otherwise the page
  takes the newer record, merges as today (`src/model/teamShowMerge.ts:100`: client-side,
  three-way, per whole item, the server's copy kept on a divergent conflict) and sends again. Team
  saves send the changed parts the same way (`src/backend/teamProductions.ts:261`). What is
  published always equals what is saved: an automatic update is published only from a saved record
  (today a publish can go ahead after a failed team save, `useProductionPublish.ts:387`). Outputs
  fetch only changed graphics. Older pages and outputs keep working (D3); an output that cannot read
  patches reads the whole production as today.
- **R7. Outputs reconcile versions themselves.** Today preparation is triggered only by the
  operator page's Presence (`src/output/main.ts:409`), a request is marked handled before its fetch
  succeeds (`src/output/prepare.ts:196,261`), and a reconnect does not compare versions
  (`src/output/main.ts:1279`). Required: on boot, on reconnect and at least once a minute, an output
  compares its version with the stored one and prepares what differs; a failed fetch or preparation
  is retried without a new request. A dropped signal followed by the publishing page closing still
  ends with every output on the newest version.
- **R8. Unsent changes survive as D6 decides.**
- **R9. The light tells the truth.** Counted outputs are the expected list (D4). Each output reports
  three things: the newest version it has stored, prepared, and on air. Green: every counted output
  has prepared the newest stored version (a replacement waiting for clear counts as prepared, with
  the O3 note; today `swapper.holds()` is false then, `src/output/swap.ts:217`). Amber at once while
  any has not. Red when an output is lost, a preparation fails, an update has not been stored for
  30 s, or one stays unprepared for 60 s.
- **R10. A held Take never appears late by mistake** (with D1). Today an output marks a command
  handled before it plays it (`src/output/main.ts:816`) and ignores commands for graphics it does not
  have (`src/output/stage.ts:945`). Required: a Take held for a loading graphic is dropped when an
  Out, All out, a newer Take of that graphic or the graphic's deletion arrives first, when loading
  fails (the light names it), or when D1's limit passes. After a reconnect only the newest state per
  graphic applies.
- **R11. Images stored once.** An image is stored by its content, uploaded once and read by outputs
  as a cached file. Outputs opened before this keep reading inline images.

## How things are measured

- **Clocks.** Press time is taken on the production page; arrival and first frame on the output.
  Cross-machine numbers use the existing clock offset (`src/control/livePath.ts`) and are reported
  only when the offset is known; otherwise each side is reported on its own clock.
- **First visible frame** is the output's first animation frame after the graphic's `play()` runs
  inside its frame, not the parent page's.
- **Conditions** are written in each receipt: machine, browser, network (local, or throttled to
  20 Mbit/s and 50 ms), and warm or cold cache.
- **Bytes** are every request body and response a step causes, on the page and the outputs, from
  the browser's own network log.
- **Samples.** Automated timings: at least 50, reported as p50, p95 and failures. The owner walk
  (AC-11) is a 20-Take confirmation, not a statistic.
- **Fixtures.** "Typical": 20 graphics from NoaCG templates with 3 MB of images. "Large": 60
  graphics with 10 MB of images.
- **Targets.** 50 ms, 20 kB, 3 s and 300 ms below are targets. Phase 2 measures today's numbers; if a
  target proves wrong, the owner confirms a new one before the phase that depends on it.

## Behaviour

### AC-1: A Take never waits on the production page
Press to command sent is under 50 ms p95 for every Take path in R2, with the save, the Bridge health
request and an earlier command of the same graphic deliberately stalled, and on a page whose command
road is not yet known. Two Nexts pressed fast still apply in press order. D2's refusals still refuse.
Layer: a journey in the production e2e with the stalls injected; a configured spec for order.

### AC-2: Placement presets are right on the output, and old outputs still work
A cue with a preset, taken right after its text grows, appears at the preset's place on a new
output and at the sent position on an output opened before the change. Layer: a blank-page browser
spec on the output stage, run against both.

### AC-3: What plays comes only from the production's copy
Editing or breaking a graphic in the library changes nothing on the monitors, in a publish or on an
output; the graphic shows "Newer design in library". Adoption follows O5. Layer: Node tests on
payload building, the gate and adoption; a journey in the production e2e.

### AC-4: Update swaps the design in place
Update keeps the graphic's cues, values, adjustments, links and stack position and names a dropped
field first. Until phase 9 it reaches the outputs with a publish; from phase 9 by itself. Layer: a
Node test on the swap; a journey in the production e2e.

### AC-5: Outputs reach the newest version by themselves
With the operator's signal dropped and the publishing page then closed, every output prepares the
newest stored version within 90 s; a failed fetch is retried. Layer: a configured spec.

### AC-6: Only what changed is sent
Editing one cue's text (at most 2 kB) causes under 20 kB of requests in all, publish and save
together, on the large fixture. Updating one graphic sends that graphic and no stored image. An
output downloads only the changed graphic. Layer: a configured spec counting bytes.

### AC-7: Old and new together
An old page and a new page editing the same production at the same time: no edit is lost except the
server's copy winning a divergent same-item conflict, what is published equals what is saved, and
an old page's publish is handled as D3 decides. Old and new outputs both end on the newest version.
Layer: a configured spec with both bundles.

### AC-8: Each image is uploaded once
Using the same image in a second graphic or production uploads nothing new; an output reads it once
and caches it. Layer: a configured spec counting uploads and reads.

### AC-9: A publish never delays a Take
Take latency, press to output arrival, while patches are written in a loop stays within 50 ms p95 of
the same measurement with nothing written. Layer: a configured spec.

### AC-10: Five people at once, and the limit
Five pages on one production for 10 minutes (one taking, one adding messages, one using quick
buttons, two editing cues at once; one page reloads, one loses and regains its connection): no
command lost, no different cue overwritten, Take latency within 50 ms p95 of a single page. The
limit: the same run repeated with 5, 10 and 15 pages; the largest that passes is written in
`docs/CLOUD_PLAYOUT.md` with its conditions. Layer: a configured spec.

### AC-11: Changes reach the outputs by themselves, and a held Take is safe
After the first publish, adding, removing or updating a graphic and editing cue text, order or
adjustments reach every counted output with no press. "Publish changes" no longer exists. A Take of
a loading graphic plays once loaded, as D1 decides, and never after an Out, All out, newer Take,
deletion, failure or the time limit. Layer: a journey in the production e2e; a configured spec for
the held-Take cases.

### AC-12: The light says where things stand
The light follows R9, with the words in O2 and O3. "Check now" still runs the full check. Layer:
`scripts/playout-status.test.mjs` for the words, the production e2e for the flow.

### AC-13: The studio walk
On the owner's CasparCG 2.5 with a browser output beside it: 20 quiz Takes timed press to first
frame, every light state seen, and CasparCG 2.3 playing the same show no worse than before. Layer:
owner walk, receipt in `evidence/`.

## Preserved behaviour

- The first Publish: account gate, output setup, loading the CasparCG slot.
- An on-air graphic is never swapped mid-air; a re-Take takes a ready new design (O3).
- Outputs never reload during an outage and replay missed commands.
- All out's fallback through NoaCG Bridge; CasparCG server cues play without the cloud.
- The output URL and every slug stay the same; open outputs and pages keep working across every
  phase.

## Non-goals

- Taking graphics without the internet. Locking a cue while someone edits it. A full CasparCG 2.3
  rig. Separating the production page (O13). New production-page controls beyond today's.

## Phases

One pull request each, landed with `/queue-merge`, adding its notes to `## Phase notes`. A phase
that meets a behaviour choice the owner has not decided stops and asks.

1. **Retire the hosted control page.** Its own spec, AC-1 to AC-5.
2. **Measure.** No product change. Every timing and byte count above, on both fixtures, for today's
   code: press to send for every R2 path, send to arrival, arrival to first frame (quiz with and
   without a preset, a server cue), Take latency during a publish, bytes per cue edit, graphic add
   and design update (publish and save), output start and update time. The baseline for every
   target.
3. **A Take never waits.** R1, R2. AC-1, AC-2. Applies D2.
4. **The production's copy is the only truth.** R3, R4, O5. AC-3, AC-4.
5. **Outputs reconcile, and report truthfully.** R7, the three versions of R9. AC-5. Applies D4.
6. **Send only what changed.** R5, R6, R8. AC-6, AC-7, AC-9. Applies D3, D6.
7. **Images stored once.** R11. AC-8.
8. **Five people at once.** AC-10, before automatic updates are switched on.
9. **Updates by themselves, held Takes, and the light.** O1, O2, O3, O7, R9, R10. AC-11, AC-12.
   Applies D1.
10. **The studio walk (owner).** AC-13.

Follow-ups outside this run (D5), each started only if phase 2's numbers justify it: smaller graphic
code, and preloading CasparCG server cues on a spare slot that never touches an on-air template,
with real CasparCG 2.5 evidence before it lands.

## Phase notes

Filled in by each phase's pull request.
