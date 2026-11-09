# Publishing while live

Status: owner decisions of 2026-11-09 (issue #2303), revised after three second opinions (each grade
C) into a simpler plan: S1 to S4 below. Draft until the owner settles it. Not built. Plan name
`live-publishing`, preparation only: see `runbook.md`.

## Why

While live, nobody should press "Publish changes". Today the header shows it after a graphic is
added, removed or edited in the editor, and the press runs a check that takes a while. It reads as
"something is wrong until you press me", mid-show.

The owner's priority is fast, predictable and reliable playout: any graphic, any reaction, on screen
as soon as possible. Nothing may risk reliable playout. When something does not reach air, the
light must say so: "The most annoying thing would be that if you try to play out something and it
doesn't go on air and everything looks green."

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

Read-only queries on production during the planning session (no receipt file; the figures are the
query results). `control_shows.output` only, not the `panel` column, which also carries graphic code
(`src/control/hostedControl.ts:368`). Bytes are the stored JSON text, so images and fonts count as
base64, about a third larger than the files. 1 MB here is 1,048,576 bytes. 56 published
productions, 253 graphics, 45.2 MB in all, the largest 8.2 MB.

| Part | MB | Notes |
|---|---|---|
| Graphic code | 21.6 | About 87 kB per graphic. About 68 kB of a graphic built from a NoaCG template is the animation engine with its sound and ease runtimes, the same in every one (225 of 253; `src/templates/shared/animRuntime.ts:19-27`). Generated code keeps its comments (`src/templates/shared/base.ts:400`), about 35 kB per graphic, overlapping the engine. |
| Images | 17.2 | All uploaded by people; NoaCG's templates hold none. 11.5 inside graphics built from templates (40 stored, 20 different; six over 500 kB make 6.6), 0.6 inside imported designs, 5.0 as rundown pictures (3 productions). |
| HTML and CSS | 3.7 | |
| Fonts | 1.6 | |
| Other files | 0.3 | |
| The rest | 0.8 | Cues, keys and JSON escaping. |

No imported OGraf package is published yet. Size decides how long an output takes to start or to
load an update. A Take does not download the production; it carries the cue's values
(`src/control/graphicVerbs.ts:763`), observed at a few hundred bytes, not a bound.

## Owner decisions (2026-11-09)

- **O1. Publish once, then everything updates by itself.** The first press stays and keeps its name,
  Publish. After it there is no "Publish changes" button and no live mode. "Check now" stays.
- **O2. The light says it.** Grey "Not published" or "No output". Green "Ready". Amber "Updating
  outputs" while a change loads. Red names what does not work. Green never shows while something
  the operator pressed did not reach air.
- **O3. An updated graphic on air shows its new design at its next Take, and after an output
  restart** (today: `src/output/swap.ts:201`, `src/output/main.ts:929`). Until then the light stays
  green with "Scorebug: new design at next Take".
- **O4. A queued graphic is self-contained.** Its copy in the production is the only thing that
  plays. A newer library design comes in through **Update** on that graphic, swapped in place,
  keeping its cues, values, adjustments and links.
- **O5. Adoption.** A published production's copies become what is published now; a production never
  published takes the library's current design once.
- **O6. Take sends one command; the output plays what it already holds.**
- **O7. Never block a Take.** A Take of a graphic an output is still loading plays there once it is
  loaded, with a "Loading" mark on the cue meanwhile (S4).
- **O8. Live adjustments belong to the production page**, never the editor.
- **O9. Send only what changed, publishing and saving alike.** Same storage, small patches. Each image
  is uploaded once. "Our database migration is fine" if one is needed.
- **O10. 3 to 5 people at once,** keeping to their roles; same-thing conflicts settled the easiest
  reliable way.
- **O11. CasparCG 2.5 is the target;** 2.3 must not get worse.
- **O12. Simple, safe and fast first.** "Let's avoid any risky changes." The hosted control page is
  removed (`docs/work-specs/retire-hosted-control/spec.md`, #2301).
- **O13. Separating the production page** is a later plan, only if shown safer or faster (#2317).
- **O14. The run works on its own.** Every acceptance check is one the agent runs itself, five
  people at once included (simulated with five signed-in pages). The owner tests everything once at
  the end.

Settled with recommendations, "All as recommended":

- **D1. Held Takes.** A Take of a brand-new graphic is held at most 5 s (changed by S4). An updated
  graphic whose new design is still loading plays its previous design now, and the page says
  "Scorebug aired its previous design". (The owner: "I hope that's just a theoretical maximum.")
- **D2. Refusals stay.** A Take with invalid typed data (`src/control/graphicVerbs.ts:679`) or pressed
  on a stale view of air (`supabase/migrations/0071_command_sequence.sql:431`) is refused with a
  note, as today. They are refusals, not waits.
- **D3. Old pages** (changed by S2).
- **D4. Outputs are never forgotten automatically.** One stays expected until someone presses Forget
  (`src/control/readiness.ts:463,493`).
- **D5. Smaller graphic code and preloading CasparCG server cues are follow-ups,** started only if
  this run's measurements justify them.
- **D6. Unsent changes** stay in the browser's own storage and are sent when the production page
  opens again on that device; a lost device loses them.
- **S1. Remove only the page's own waits.** Waits for saving, measuring and the NoaCG Bridge check
  go. The network ordering waits stay: they make two fast Nexts, or two +1s, both count, and cost
  time only when an earlier send stalls. Phase 2 measures how often they bite; if they matter, that
  is a separate design.
- **S2. Pages opened before phase 4 only play out.** Their saves and publishes are refused with
  "Reload this page to edit". This lands with adoption, in phase 4.
- **S3. A failed publish never undoes a save.** The publish retries from the latest saved version;
  the light is amber meanwhile and red after 30 s.
- **S4. A held Take past 5 s appears without its entrance**, as after a restart, and the light names
  it. The 5 s counts from when the Take reaches the output, on its own clock.

## Requirements

"Today" lines are facts from the current code.

- **R1. Placement presets resolve on the output, compatibly.** A Take carries the preset beside the
  last measured position. A new output places the graphic from its own box; an older output uses
  the position.
- **R2. The page's own waits go (S1).** Every Take path (graphic cue, folder, picture, server cue,
  quick button, Next, hardware panel) reads values and adjustments from memory at the press, sends,
  and saves afterwards. Removed: the adjustment save and box measurement, up to 1 s and 2 s
  (`src/control/adjustGeometry.ts:237-239`); the draft save and history close
  (`src/control/graphicVerbs.ts:671`, `ProductionPage.tsx:3067`); the 250 ms save head start for
  server cues (`src/control/serverVerbs.ts:84`); the Bridge health request before a server action
  (`src/control/playoutLink.ts:566`), which runs outside the press. Kept, as ordering: working out
  how commands travel on a fresh page (`src/control/hostedControl.ts:1744`), one send in flight per
  graphic (`hostedControl.ts:1847`, `src/control/seqSend.ts:221`; the server skips an earlier press
  that arrives after a later one, `0071_command_sequence.sql:422`), a quick button waiting for the
  press before it (`afterPress`, `src/control/graphicVerbs.ts:641`, capped by
  `src/control/failedSends.ts:31,59`), and a folder's Outs before its next Take
  (`src/control/folderPlayout.ts:297`). No server change.
- **R3. One source for a production's graphics: its own copy** (O4, O5), in the payload, the gate,
  the "older design" guard, change detection and the monitors.
- **R4. Update names a dropped field first** and waits for a confirm.
- **R5. Takes stay protected from publishing.** Today a Take takes a key-share lock on the production
  row and a publish writes without blocking it (`0071_command_sequence.sql:373`,
  `src/control/hostedControl.ts:969`). Every new write keeps that.
- **R6. Old pages only play out (S2).** Today an old page copies library designs into the production
  and saves the team document before it publishes (`src/components/home/useProductionPublish.ts:384-396`).
  From phase 4, every write of the production record (team save, account sync of the production,
  publish) carries the page's build; the server refuses one from a build before phase 4 with
  "Reload this page to edit". This needs a server check, applied before the app that relies on it. Takes and every other verb still work. Old pages
  close or reload within a show; nothing they hold needs merging.
- **R7. One saved revision, publication follows it (S3).** A change is saved as a patch (one cue, the
  order, one graphic) with the revision it was based on. The server applies it only on that
  revision; otherwise the page takes the newer record, merges as today
  (`src/model/teamShowMerge.ts:100`: client-side, three-way, per whole item, the server's copy kept
  on a divergent conflict) and sends again. The published copy is then rebuilt from the newest saved
  revision and stamped with it; publishing the same revision twice changes nothing. A failed publish
  keeps the save and retries. Today saves and publishes are separate writes
  (`src/backend/teamProductions.ts:262`, `src/control/hostedControl.ts:971`), and that stays.
- **R8. Unsent changes survive as D6 says.**
- **R9. Outputs catch up by themselves.** Today preparation starts only from the operator page's
  Presence (`src/output/main.ts:409`), a request is marked handled before its fetch succeeds
  (`src/output/prepare.ts:196,261`), and a reconnect does not compare versions
  (`src/output/main.ts:1279`). Required of outputs from phase 5: on boot, on reconnect and once a
  minute, read only the stored version (a few bytes); when it differs, fetch the changed graphics
  of that exact version; retry a failed fetch or preparation with backoff (5 s, 15 s, 60 s, then
  every minute); several changes in a row are taken as one. Outputs opened before phase 5 keep
  today's behaviour: pages keep sending today's Presence request, and on it an old output reloads
  onto the new build once nothing is on air (`src/output/prepare.ts` new-build reload), and from
  then on catches up by itself. Nothing ever reloads an output with something on air.
- **R10. The light tells the truth.** Counted outputs are the expected list (D4). Each output reports
  the newest version it has stored, prepared and on air. Green only when every counted output has
  prepared the newest saved version (a replacement waiting for clear counts as prepared, with the O3
  note; today `swapper.holds()` is false then, `src/output/swap.ts:217`) and nothing the operator
  pressed is missing from air. Amber at once while any has not prepared it. Red when an output is
  lost, a preparation fails, a publish has failed for 30 s, an output is still unprepared after
  60 s, or a Take did not reach air as pressed (R11).
- **R11. Held Takes.** Today an output marks a command handled before it plays it
  (`src/output/main.ts:816`) and ignores commands for a graphic it does not have
  (`src/output/stage.ts:945`). Required, per graphic on one output:
  - A command for a graphic still loading is kept, in order, with every later command for it. The
    graphic is loaded next, ahead of background preparation and its 15 s spacing
    (`src/output/prepare.ts:36,233`).
  - When it has loaded, the kept commands apply in order, as the existing recovery replays the log
    (`src/control/seqFollow.ts:333`): data, events and Next steps all count. Its entrance plays only
    if the Take reached this output under 5 s ago, by this output's clock; otherwise it appears
    without the entrance and the output reports "<graphic> appeared late" until the next Take.
  - An Out, All out or deletion that arrived first means it never appears; the entrance of a Take
    replaced by a newer Take is not played twice.
  - If loading fails, the output reports it and the light names the graphic in red.
  - After a restart the output rebuilds from the log as today: what is on air is shown, without
    entrances.
- **R12. Images stored once.** An image is stored by its content, uploaded once and read by outputs
  as a cached file. Outputs opened before this keep reading inline images.

## How the agent tests and measures

Every check below is run by the agent itself (O14), in the cloud worker and GitHub Actions.

- **Clocks.** Latency is measured on one machine: the production pages and the outputs run as
  browser tabs in one Playwright run, against the configured stack, so one clock serves both ends.
- **Words.** "Sent" is the request leaving the page. "Applied" is the output running the command.
  "Render dispatch" is the frame's first animation frame after `play()`. "Visible" is the first
  screenshot of the output in which the graphic's pixels appear, from Playwright frames captured
  every 16 ms; only "visible" claims a picture.
- **Network.** Each timing runs twice: unthrottled, and throttled to 20 Mbit/s with 50 ms latency.
  Cache state is written in the receipt.
- **Bytes.** From the browser's network log, every request and response of the page and the outputs
  from the edit until every output reports the new version prepared.
- **Samples.** At least 50 per timing, reported as p50, p95 and failures. A check passes only with no
  failure unless it says otherwise.
- **Fixtures.** "Typical": 20 graphics from NoaCG templates with 3 MB of images. "Large": 60 graphics
  with 10 MB of images. Both are built by the test, with generated images.
- **Several people.** Five signed-in test accounts, each in its own browser context, press at the
  same moments from a script.
- **Targets.** 50 ms and 20 kB are targets until phase 2 has measured today. If phase 2 shows a
  target is wrong, the run asks the owner before the phase that uses it.
- **CasparCG.** Where a CasparCG 2.5 server is available to the worker (as in
  `docs/PLAYOUT_ISOLATION_RESEARCH.md` §5.4), the CasparCG checks run there; otherwise they are
  listed for the owner's final check.

## Behaviour

### AC-1: A Take never waits on the page's own work
Press to sent is under 50 ms p95 for every Take path in R2, with the save and the Bridge health
request deliberately stalled. Two fast Nexts and two fast +1s still both count. D2's refusals still
refuse. Layer: a journey in the production e2e; a configured spec for order.

### AC-2: Placement presets are right, and old outputs still work
A cue with a preset, taken right after its text grows, is visible at the preset's place on a new
output and at the sent position on an older output. Layer: a blank-page browser spec on the output
stage, run against both builds.

### AC-3: What plays comes only from the production's copy
Editing or breaking a graphic in the library changes nothing on the monitors, in a publish or on an
output; the graphic shows "Newer design in library". Adoption follows O5. Layer: Node tests on
payload building, the gate and adoption; a journey in the production e2e.

### AC-4: Update, and old pages
Update keeps the graphic's cues, values, adjustments, links and stack position and names a dropped
field first. An old-build page's save and publish after adoption are refused with "Reload this
page to edit" and change nothing stored; its Takes still work. Layer: a Node test on the swap; a
configured spec with an old-build page.

### AC-5: Outputs catch up by themselves
With the update signal dropped and the publishing page then closed, a new output and an old output
each end on the newest version within 90 s, the old one by reloading only with nothing on air. A
failed fetch is retried. Layer: a configured spec.

### AC-6: Only what changed is sent
On the large fixture, editing one cue's text (at most 2 kB) causes under 20 kB of requests, save and
publish together, and a new output downloads only the changed graphic. Updating one graphic sends
that graphic and no stored image. Old outputs' whole downloads are measured and reported, not
judged. Layer: a configured spec counting bytes.

### AC-7: Saved and published stay together
A publish made to fail keeps the save, turns the light amber and red after 30 s, and succeeds on
retry with the newest saved revision; publishing one revision twice changes nothing. Two pages
editing different cues at once lose nothing. Layer: a configured spec.

### AC-8: Each image is uploaded once
Using the same image in a second graphic or production uploads nothing new; an output reads it once
and caches it. Layer: a configured spec counting uploads and reads.

### AC-9: A publish never delays a Take
Press to applied, while patches are written in a loop, stays within 50 ms p95 of the same
measurement with nothing written. Layer: a configured spec.

### AC-10: Five people at once
Five accounts on one production for 10 minutes: one taking, one adding messages, one using quick
buttons, two editing cues at once; one page reloads, one loses and regains its connection. No
command lost, no different cue overwritten, press to applied within 50 ms p95 of a single page.
Run in phase 8 and again in phase 9 with automatic updates on. The same run with 10 and 15 pages is
reported as tested numbers in `docs/CLOUD_PLAYOUT.md`. Layer: a configured spec.

### AC-11: Changes reach the outputs by themselves, and held Takes are honest
After the first publish, adding, removing or updating a graphic and editing cue text, order or
adjustments reach every counted output with no press. "Publish changes" no longer exists. For a
graphic still loading: a Take is visible once loaded, with its entrance if under 5 s; later than
that it is visible without its entrance and the light names it; it never appears after an Out, All
out or deletion; data and Next pressed while loading all apply in order; a restart shows what is on
air. Layer: a journey in the production e2e; a configured spec with loading delayed on purpose.

### AC-12: The light never says green when air is wrong
The light follows R10 with the words in O2 and O3. In every case of AC-5, AC-7 and AC-11 where air
is not as pressed, the light is not green. "Check now" still runs the full check. Layer:
`scripts/playout-status.test.mjs` for the words; the production e2e for the flow.

### AC-13: The owner's final check
After phase 9, the owner checks everything once in his studio on CasparCG 2.5 with a browser output
beside it, and CasparCG 2.3 plays the same show no worse than before. The run prepares a short
checklist for it.

## Preserved behaviour

- The first Publish: account gate, output setup, loading the CasparCG slot.
- An on-air graphic is never swapped mid-air; a re-Take takes a ready new design (O3).
- Outputs never reload with something on air or during an outage, and replay missed commands.
- All out's fallback through NoaCG Bridge; CasparCG server cues play without the cloud.
- Send order: two fast Nexts or +1s both count.
- The output URL and every slug stay the same; open outputs and pages keep working across every
  phase.

## Non-goals

- Taking graphics without the internet. Locking a cue while someone edits it. A full CasparCG 2.3
  rig. Separating the production page (O13). New production-page controls. A new command ordering
  protocol (S1). Smaller graphic code and server-cue preload (D5, follow-ups).

## Phases

One pull request each, landed with `/queue-merge`, adding its notes to `## Phase notes`. A phase that
meets a behaviour choice the owner has not decided stops and asks.

1. **Retire the hosted control page.** Its own spec, AC-1 to AC-5.
2. **Measure.** No product change. On both fixtures, today's code: press to sent for every R2 path,
   with how often each kept ordering wait adds time; sent to applied to visible (quiz with and
   without a preset, a server cue where CasparCG is available); press to applied during a publish;
   bytes per cue edit, graphic add and design update; output start and update time; graphic load
   time on a new output. The baseline for every target.
3. **A Take never waits on the page's own work.** R1, R2. AC-1, AC-2.
4. **The production's copy is the only truth, and old pages only play out.** R3, R4, R6, O5. AC-3,
   AC-4.
5. **Outputs catch up by themselves and report three versions.** R9, the reporting of R10. AC-5.
6. **Send only what changed.** R5, R7, R8. AC-6, AC-7, AC-9.
7. **Images stored once.** R12. AC-8.
8. **Five people at once.** AC-10, before automatic updates.
9. **Updates by themselves, held Takes, and the light.** O1, O2, O3, O7, R10, R11. AC-10 again,
   AC-11, AC-12.
10. **The owner's final check.** AC-13.

## Phase notes

Filled in by each phase's pull request.
