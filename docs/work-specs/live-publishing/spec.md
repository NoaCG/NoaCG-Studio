# Publishing while live

Status: agreed with the owner on 2026-11-09 ("Agree.", issue #2303), after four second opinions
(each grade C) and a reshape (E1 to E5). This spec states outcomes, decisions and acceptance; the hard
parts each get a design, graded A by an independent review, before they are built. Not built. Plan
name `live-publishing`, preparation only: see `runbook.md`.

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
query results, unverified by any later run). `control_shows.output` only, not the `panel` column,
which also carries graphic code (`src/control/hostedControl.ts:368`). Bytes are the stored JSON
text, so images and fonts count as base64, about a third larger than the files. 1 MB here is
1,048,576 bytes. 56 published productions, 253 graphics, 45.2 MB in all, the largest 8.2 MB.

| Part | MB | Notes |
|---|---|---|
| Graphic code | 21.6 | About 87 kB per graphic. About 68 kB of a graphic built from a NoaCG template is the animation engine with its sound and ease runtimes, the same in every one (225 of 253; `src/templates/shared/animRuntime.ts:19-27`). Generated code keeps its comments (`src/templates/shared/base.ts:400`), about 35 kB per graphic, overlapping the engine. |
| Images | 17.2 | All uploaded by people; NoaCG's templates hold none. 11.5 inside graphics built from templates (40 stored, 20 different), 0.6 inside imported designs, 5.0 as rundown pictures (3 productions). |
| HTML and CSS | 3.7 | |
| Fonts | 1.6 | |
| Other files | 0.3 | |
| The rest | 0.8 | Cues, keys and JSON escaping. |

Size decides how long an output takes to start or to load an update. A Take does not download the
production; it carries the cue's values (`src/control/graphicVerbs.ts:763`), observed at a few
hundred bytes, not a bound.

## Owner decisions (2026-11-09)

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
- **O6. Take sends one command; the output plays what it already holds.**
- **O7. Never block a Take.** A Take of a graphic an output is still loading plays there once it is
  loaded, with a "Loading" mark on the cue meanwhile.
- **O8. Live adjustments belong to the production page**, never the editor.
- **O9. Send only what changed, publishing and saving alike.** Each image is uploaded once. "Our
  database migration is fine" if one is needed.
- **O10. 3 to 5 people at once,** keeping to their roles; same-thing conflicts settled the easiest
  reliable way.
- **O11. CasparCG 2.5 is the target;** 2.3 must not get worse.
- **O12. Simple, safe and fast first.** "Let's avoid any risky changes." The hosted control page is
  removed (`docs/work-specs/retire-hosted-control/spec.md`, #2301).
- **O13. Separating the production page** is a later plan, only if shown safer or faster (#2317).
- **O14. The run works on its own.** Every check it can run, it runs itself, five people included
  (simulated with five signed-in accounts). The owner tests everything once at the end.

Settled with recommendations ("All as recommended", three times):

- **D1.** A Take of a brand-new graphic waits at most 5 s for it to load (a ceiling: "I hope that's
  just a theoretical maximum"). An updated graphic whose new design is still loading plays its
  previous design now, and the page says so.
- **D2.** A Take with invalid typed data, or pressed on a stale view of air, is still refused with a
  note (`src/control/graphicVerbs.ts:679`, `supabase/migrations/0071_command_sequence.sql:431`).
- **D3** was replaced by S2.
- **D4.** Outputs are never forgotten automatically (`src/control/readiness.ts:463,493`).
- **D5.** Smaller graphic code and preloading CasparCG server cues are follow-ups, started only if
  this run's measurements justify them.
- **D6.** Unsent changes stay in the browser's own storage and are sent when the production page
  opens again on that device; a lost device loses them.
- **S1.** Remove only the page's own waits; keep the network ordering waits.
- **S2.** Pages opened before the switch to production copies only play out: their saves and
  publishes are refused with "Reload this page to edit".
- **S3.** A failed publish never undoes a save; publishing catches up with the newest save.
- **S4.** A Take held over 5 s appears without its entrance, as after a restart, and the light names
  it. The 5 s counts from when the Take reaches the output, on its own clock.
- **E1. What green proves.** Every expected output reports that it ran each command pressed.
  Anything unreported is unknown and never green. No browser can prove the broadcast picture.
- **E2. Outputs opened before the change** switch over by reloading once nothing is on air. Until
  then the light shows amber "Reload <output> when nothing is on air", and updates still reach them
  while a production page is open.
- **E3. An old page reopened under the new build** keeps its cue edits, merged as usual; a design it
  pulled from the library is dropped.
- **E4. A save not yet published when its page closes** is published by the next production page
  anyone opens on that production. Until then outputs keep the previous version, and an open page
  shows red "Saved, not on the outputs".
- **E5.** The phase order below: correctness first, byte saving after.

## What must be true

"Today" lines are facts from the current code. Each design gate lists what its design must cover;
the design decides how.

- **W1. A Take never waits on the page's own work (S1).** Every Take path (graphic cue, folder,
  picture, server cue, quick button, Next, scripted hardware-panel command) reads values and
  adjustments from memory, sends, and saves afterwards. Removed: the adjustment save and box
  measurement (`src/control/adjustGeometry.ts:237-239`), the draft save and history close
  (`src/control/graphicVerbs.ts:671`, `ProductionPage.tsx:3067`), the server-cue save head start
  (`src/control/serverVerbs.ts:84`), the Bridge health request before a server action
  (`src/control/playoutLink.ts:566`). Kept, as ordering: road discovery
  (`src/control/hostedControl.ts:1744`), one send in flight per graphic (`hostedControl.ts:1847`,
  `src/control/seqSend.ts:221`), a quick button waiting for its previous press
  (`src/control/graphicVerbs.ts:641`), a folder's Outs before its next Take
  (`src/control/folderPlayout.ts:297`). Placement presets resolve on the output from its own box; a
  Take also carries the last measured position, which an older output uses.
- **W2. One source for a production's graphics: its own copy (O4, O5), and old pages only play out
  (S2, E3).** Today an old page copies library designs in and saves before it publishes
  (`src/components/home/useProductionPublish.ts:384-396`), over three write paths: team save
  (`src/backend/teamProductions.ts:262`), account sync (`src/backend/supabaseProvider.ts:148`) and
  publish (`src/control/hostedControl.ts:971`); a team page restores pending edits on reopen
  (`teamProductions.ts:486-495`). **Design gate G1 must cover:** how each write identifies its build
  (old ones send none), a guard on every production-authoring route only (documents of other kinds,
  commands, reports and heartbeats are untouched), the order of server guard, adoption and app
  release, and E3's handling of retained edits.
- **W3. The light tells the truth (E1, O2, O3, S4, D1, D4).** Today an output claims a command before
  running it (`src/output/main.ts:816`), advances and banks its cursor (`main.ts:948,688`), ignores
  commands for a graphic it does not have (`src/output/stage.ts:945`), and the stage only queues or
  posts commands (`stage.ts:411`); the page says it cannot confirm a picture
  (`src/control/playoutStatus.ts:192-199`); a waiting replacement makes `holds()` false
  (`src/output/swap.ts:217`). **Design gate G2 must cover:** per-output, per-graphic reports of
  received and ran commands, pending and failed states; never banking past held work; deduplication;
  reconnect, restart, cancellation (Out, All out, newer Take, deletion) and queue limits; replaying
  held history out of sight before showing its final state, keeping data, events and Next steps
  (`src/control/seqFollow.ts:333-358`); a demanded graphic loading ahead of background preparation
  and its 15 s spacing (`src/output/prepare.ts:36,233`); the three reported versions (stored,
  prepared, on air); and unknown never green.
- **W4. Automatic updates with whole publishes (O1, S3, E2, E4).** Today publication checks the
  published stamp, not a saved revision (`src/control/hostedControl.ts:619-632,971-974`), personal
  sync is a whole-record upsert (`src/backend/supabaseProvider.ts:140-148`) beside team
  compare-and-swap, outputs prepare only on the page's Presence request
  (`src/output/main.ts:409`, marked handled before the fetch, `src/output/prepare.ts:196,261`) and do
  not compare versions on reconnect (`main.ts:1279`); old outputs learn of a new build only inside a
  request (`prepare.ts:190-205`). Takes stay protected from publishing: a Take takes a key-share
  lock and a publish writes without blocking it (`0071_command_sequence.sql:373`,
  `hostedControl.ts:969`). **Design gate G3 must cover:** the saved revision for personal and team
  productions; an atomic check that a publication never replaces a newer one; durable pending
  publication and E4's executor; new outputs re-reading the whole published copy on boot, on
  reconnect and periodically, with retries; E2's transition for old outputs, never reloading one
  with something on air; switching on per production only after the guards are in place; and
  keeping Takes unblocked.
- **W5. Only what changed is sent, and each image once (O9).** **Design gate G4 must cover:**
  revision-checked patches and partial reads, what happens when a requested revision has been
  replaced, content-named image storage with older outputs still reading inline images, and old and
  new clients writing at once.

## How the agent tests and measures

- **Browser checks** run in the cloud worker and GitHub Actions against the configured stack, which
  creates its own accounts and an isolated database (`e2e/configured/_helpers.ts:119-123`,
  `.github/workflows/configured-suite.yml`). Five people are five signed-in test accounts, each in
  its own browser context, pressing at the same moments from a script. Hardware panels are scripted
  commands.
- **One time origin.** Pages and outputs run in one Playwright run on one machine, and every event
  is stamped with `performance.timeOrigin + performance.now()`.
- **Words.** "Sent": the request leaves the page. "Ran": the output's graphic ran the command (the
  W3 report). "Render dispatch": the frame's first animation frame after `play()`. "First seen": the
  first captured screenshot showing the graphic's pixels, with its actual capture time; capture is
  not every frame, so the receipt states the gap between captures as the uncertainty. Only "first
  seen" claims a picture.
- **Network.** Each timing runs unthrottled and throttled (20 Mbit/s, 50 ms). Cache state is written
  in the receipt.
- **Bytes.** Every request and response of the pages and outputs from the edit until every output
  reports the new version prepared.
- **Samples.** At least 50 per timing: p50, p95 and failures. A check passes only with no failure
  unless it says otherwise.
- **Fixtures.** "Typical": 20 graphics from NoaCG templates with 3 MB of generated images. "Large": 60
  graphics with 10 MB.
- **Targets.** 50 ms and 20 kB are targets until phase 2 has measured today; a target phase 2 shows
  wrong goes to the owner before the phase that uses it.
- **Hardware.** Real CasparCG rendering (2.5 and 2.3), physical panels and the studio are checked in
  the owner's final session only. The run checks the NoaCG Bridge commands it sends, never counts a
  skipped hardware check as passed, and lists each one for the final session.

## Behaviour

### AC-1: A Take never waits on the page's own work
The page's own time, press to the start of sending (excluding the kept ordering waits), is under
50 ms p95 for every W1 path, with the save and the Bridge health request deliberately stalled. Total
press to sent is reported beside it. Two fast Nexts and two fast +1s both count. D2's refusals still
refuse. A preset cue taken right after its text grows is first seen at the preset's place on a new
output and at the sent position on an older one. Layer: a journey in the production e2e; a
configured spec for order; a blank-page spec on the output stage against both builds.

### AC-2: What plays comes only from the production's copy, and old pages only play out
Editing or breaking a graphic in the library changes nothing on the monitors, in a publish or on an
output; the graphic shows "Newer design in library"; Update keeps cues, values, adjustments, links
and stack position and names a dropped field first. An old-build page saving, syncing and publishing
after adoption is refused with "Reload this page to edit" and changes nothing stored; its Takes,
reports and heartbeats still work; reopened under the new build, its cue edits merge and its library
designs are dropped (E3). Layer: Node tests on payload building, the gate and adoption; a configured
spec with an old-build page.

### AC-3: The light never says green when air is wrong
Each output reports, per graphic, the commands it received and ran. For a graphic still loading: a
Take is first seen once loaded, with its entrance if under 5 s, otherwise without it and the light
names it; it never appears after an Out, All out or deletion; data and Next pressed while loading all
apply in order; a cancelled graphic is never seen even briefly; a restart shows what is on air. In
every case where an output has not reported running what was pressed, the light is not green. An
updated graphic on air reads "<graphic>: new design at next Take" with the light green. Layer:
`scripts/playout-status.test.mjs` for the words; a configured spec with loading delayed on purpose.

### AC-4: Changes reach the outputs by themselves
After the first publish, adding, removing or updating a graphic and editing cue text, order or
adjustments reach every expected new output with no press. "Publish changes" no longer exists. A
publish made to fail keeps the save, the light turns amber and then red "Saved, not on the outputs",
and the next page opened publishes it. Two publishers finishing in reverse order leave the newer
version published. With the page's signal dropped and the page closed, new outputs reach the newest
version within 90 s; an old output shows amber "Reload <output> when nothing is on air" until it has
switched over. Press to ran, while publishing in a loop, stays within 50 ms p95 of nothing being
published. Layer: a journey in the production e2e; configured specs.

### AC-5: Only what changed is sent, and each image once
On the large fixture, editing one cue's text (at most 2 kB) causes under 20 kB of requests, save and
publish together, and a new output downloads only the changed graphic. Updating one graphic sends
that graphic and no stored image. Using the same image again uploads nothing; an output reads it
once. Old outputs' whole downloads are reported, not judged. Layer: configured specs counting bytes.

### AC-6: Five people at once
Five accounts on one production for 10 minutes with automatic updates on: one taking, one adding
messages, one using quick buttons, two editing cues at once; one page reloads, one loses and regains
its connection. No command lost, no different cue overwritten, press to ran within 50 ms p95 of a
single page. The same run with 10 and 15 pages is reported in `docs/CLOUD_PLAYOUT.md` as tested
numbers, not a limit. Layer: a configured spec.

### AC-7: The owner's final check
After phase 8, the owner checks everything once in his studio, from a checklist the run prepares:
real CasparCG 2.5 with a browser output beside it, CasparCG 2.3 no worse than before, and every
hardware check the run listed.

## Preserved behaviour

- The first Publish: account gate, output setup, loading the CasparCG slot.
- An on-air graphic is never swapped mid-air; a re-Take takes a ready new design (O3).
- Outputs never reload with something on air or during an outage, and replay missed commands.
- All out's fallback through NoaCG Bridge; CasparCG server cues play without the cloud.
- Send order: two fast Nexts or +1s both count.
- The output URL and every slug stay the same; open outputs and pages keep working across every
  phase.

## Non-goals

Taking graphics without the internet. Locking a cue while someone edits it. A full CasparCG 2.3
rig. Separating the production page (O13). New production-page controls. A new command ordering
protocol (S1). Smaller graphic code and server-cue preload (D5).

## Phases

One pull request each, landed with `/queue-merge`, adding notes to `## Phase notes`. A **design
gate** means: the phase's design is written to `docs/work-specs/live-publishing/designs/`, covers its
list above, and lands as its own pull request only after an independent review (`/so`) grades it A;
product code follows in the next pull request. A phase that meets a behaviour choice the owner has
not decided stops and asks.

1. **Retire the hosted control page.** Its own spec, AC-1 to AC-5.
2. **Measure.** No product change. On both fixtures, today's code: the page's own time and total
   press to sent for every W1 path, with how often each kept ordering wait adds time; sent to render
   dispatch to first seen; press to sent during a publish; bytes per cue edit, graphic add and design
   update; output start, update and single-graphic load time. The baseline for every target.
3. **A Take never waits on the page's own work.** W1. AC-1.
4. **The production's copy is the only truth; old pages only play out.** Design gate G1, then W2.
   AC-2.
5. **The honest light and held Takes.** Design gate G2, then W3. AC-3.
6. **Automatic updates, whole publishes.** Design gate G3, then W4. AC-4.
7. **Only what changed, each image once.** Design gate G4, then W5. AC-5.
8. **Five people at once.** AC-6, with automatic updates on.
9. **The owner's final check.** AC-7.

## Phase notes

Filled in by each phase's pull request.

### Phase 1: Retire the hosted control page

- Previous verified `main`: e6be4cf3dcbcb103a7ea0372d30d0505845a8ba8.
- Revert: `git revert -m 1 <this pull request's merge commit>` restores the page, its CSS, its
  tests and the retired rules; nothing persisted changed, so no data step goes with it.
- Decisions: the old link resolves with `control_show_by_slug` selecting only `id`, retries every
  2 s doubling to 15 s while unanswered, and offline (no backend) answers "This link no longer
  works" at once. The redirect's backend test lives in
  `e2e/configured/operator-outage-not-unpublished.spec.ts` (the configured suite is the layer that
  can resolve a slug; the offline half is `e2e/shows.spec.ts`). `e2e/hosted-control.spec.ts` keeps
  its name and its shared-code tests (receiver, panel spec, payload): almost all of it guards shared
  code, and the capacity gate prices a renamed offline spec as a new one.
  Retargeted specs open the other operator as a second device: a fresh browser signed in to
  the same account (`openSecondProductionPage`), so it holds no local copy, as the hosted seat did not.
  `PanelGraphicSpec` stays exported: it is the return type of the shared `buildPanelSpec`.
- Traps: `npm run learn` refuses while any active rule scopes a deleted file, so the page was put
  back, untracked from the deletion, for the three `--supersedes` calls and removed again. The
  local configured stack could not start in the cloud worker (its image host is blocked by the
  proxy), so the configured evidence is the CI selection on the PR head.
- Rules (the old link's; written after coding, so the Rules-first review came after the code):
  R1 a server answer naming a production replaces the address with `/app#/production/<id>`, the
  query gone and no history entry added; R2 an answer with no production shows "This link no longer
  works" with a link home and never the waiting card; R3 no answer (an error, no client, a thrown
  request) shows "Waiting for the server" and asks again after 2, 4, 8 then every 15 s, and never
  says the link is dead; R4 an offline build says the link no longer works at once and asks
  nothing; R5 the production page's own behaviour and every persisted value are unchanged.
- Evidence: `docs/work-specs/live-publishing/evidence/phase-1.md`.

### Phase 2: Measure

- Previous verified `main`: 78ce3f35063386fdc7217d0542e3df871fc32b8d.
- Revert: `git revert -m 1 <this pull request's merge commit>` removes the harness and the
  receipt; no product file and nothing persisted changed, so no data step goes with it.
- Decisions: measured with the configured suite's own ground (its local Supabase stack, its Vite
  development server, headless Chromium) on the cloud worker, so later phases can rerun the same
  harness against the same baseline; these are numbers for this harness, not studio numbers.
  "Press" is the `click` event, since every measured button acts on click. "Page's own" is press to
  sent minus the overlap of a kept ordering wait, read from the page's own requests; a send is tied
  to its press by the sender id and press number in its body. A cue text
  edit needs no publish today, so its bytes are the save alone. Update rounds add, remove and
  update one graphic, so the production keeps its size, and stay clear of the output's 15 s
  preparation spacing. Throttling starts once the fixture is built. "Second of two fast" is two
  mouse clicks back to back; the first press still unanswered counts as a kept wait. The stepped
  graphic is a three-line lower third, so two fast Nexts have steps to take. The harness lives in
  `e2e/configured/measure/` as `*.measure.ts`, which the configured suite never runs.
- Targets the numbers show wrong or unproven, for the owner before the phase that uses them: AC-1's
  50 ms p95 (Next, which W1 changes nothing in, already takes 77 to 144 ms p95 here), AC-4's 50 ms
  margin during a publish (198 against 98 ms p95 typical, 385 against 186 large, unthrottled),
  and D1's 5 s ceiling against a 30 to 33 s whole
  update on the large fixture throttled. Details in the evidence.
- Traps: in the evidence, "Traps met" (the local stack does start on a cloud worker from Docker
  Hub; one 12-minute queue job per commit; Playwright empties `test-results/`; Realtime frames are
  binary).
- Evidence: `docs/work-specs/live-publishing/evidence/phase-2.md`.

### Phase 3: A Take never waits on the page's own work

- Previous verified `main`: fb04bbd9658857318e4b954611b6dd08a4815e9d.
- Revert: `git revert -m 1 <this pull request's merge commit>` puts the waits back: the draft save
  and history close before a Take, the server cue's 250 ms save head start, the Adjust write and
  box measurement wait, and `/health` before every `/act`. Nothing persisted changed: the place
  hint is an optional member of a command an older output ignores, so no data step goes with it.
- Rules (written beside the code, so the Rules-first review came after it, as in phase 1):
  R1 every W1 Take path (graphic cue, folder Take and step, picture, server cue, quick button,
  +1, Next, a panel's Take) sends before it saves: the draft's save and the history group's close
  start once the send is answered, whatever it came to, and never hold the send;
  R2 the values sent are those on screen at the press, the draft over the newest record, read
  from memory; R3 a cue whose typed OGraf data is its source still saves first, since its values
  are read from the stored record; R4 a Take's place and size come from memory (the newest
  rendered record, the last box measured) and never wait for an Adjust write or a measurement;
  R5 when that box is for other values and a preset or size resolves against it, the Take also
  carries the preset (`place`), a new output measures the values itself and first shows the
  graphic at the preset (2 s cap, then the place sent), and an older output applies the place
  sent; R6 a server action to a Bridge this page load already heard as current sends `/act`
  without `/health`, and a failure to reach it asks `/health` why; an address never heard is
  asked first, as before; R7 kept as ordering: road discovery, one send in flight per graphic, a
  quick button or +1 waiting for its previous press, a folder's Outs before its next Take;
  R8 D2's refusals (invalid typed data, a stale view of air) still refuse; R9 a +1 or quick
  button writes its accepted figure into the cue only after its own save has landed, and counts a
  field typed and not yet saved as the text on screen.
- Rules found after coding (review): R10 a press waits for the press before it on its graphic
  until that press is answered, never for its save or its figure's write; R11 after a hinted Take
  the page measures the values the Take sent, as an output does, and holds what that resolves as
  the graphic's look, unless a later send set its look or took it off (any Take, Update or look
  send that carries a look, or an Out; a figure, a +1 or a snap does not count). An output whose own measurement ran past its
  cap shows the place sent meanwhile; the next look sent to on-air graphics moves it to the
  preset. R12 a Take that takes another graphic off its layer (an imported package sharing it)
  carries no hint, so the layer is never blank while an output measures (PR review); R13 an Out
  never waits on an output's measurement: what waits goes at once at the place sent, then the
  Out.
- Decisions: Update and snap are not Take paths and keep their waits. A typed OGraf cue keeps its
  save first (R3). The page's own PROGRAM monitor resolves a hint too, starting its measurement
  after the press's task, so the send leaves first. An output resolves a hint only while on air
  (a restart's catch-up applies the place sent), and a hint is never read for typed data or a
  package. The Bridge's "heard as current" lives in memory per page load. A Take reads typed data
  from the stored record only for a cue that has some, so a Take no longer parses the whole store.
  AC-1 is judged on a production build (owner, 2026-11-11, run issue #2361): the phase 2 harness
  gained `MEASURE_BUILD=prod` (one origin, the fixture built through the development modules, the
  page reloaded under `vite preview`) and `MEASURE_STALL=1` (an owed edit before each press, the
  save and `/health` held 3 s).
- Traps: Docker Hub refused anonymous pulls (429) for most of the stack's images; the default
  registry (public.ecr.aws) answered, so `SUPABASE_INTERNAL_IMAGE_REGISTRY` was not needed this
  time. The Supabase CLI came from npm (`supabase@2.111.0`), since a download from GitHub
  releases was refused. A harness page that imports `/src/...` cannot run on a bundled build.
  `preview/` may not import `control/`, so the measuring frame takes its qualification from its
  caller.
- Repair 2 (check on 92e581a7 failed it): an edit was lost when the page reloaded before its save
  landed, with no press too. IndexedDB aborts a write still committing when the page reloads, so
  the page going also records the owed edit in localStorage, and the production page applies it
  once on its next visit unless the production was saved after it. Rules P1 to P5 in the evidence.
- Evidence: `docs/work-specs/live-publishing/evidence/phase-3.md`.

### Phase 4: The production's copy is the only truth; old pages only play out

- Design: `designs/G1.md`, graded A by an independent `/so` at e32746e, landed as #2404.
- Previous verified `main`: eee7827892b1936c00acc263655cf6a6e753e4be.
- Revert: `git revert -m 1 <this pull request's merge commit>` brings back library-first reads and
  the publish's copy refresh. Migration 0115 stays applied and is inert while the
  `production_copies` switch is off; turn the switch off first if it was turned on (delete the
  `system_settings` row or set `"on"` to false). The `designAt` stamps left on copies are additive
  and ignored by the older code; its record digest reads a `2:` digest as changed until the next
  publish.
- Rules: G1 section 7, R1 to R13 (stated before the code, reviewed Rules-first in the design gate).
- Decisions: the personal sync settle runs inside the sync engine (the settle is pure kernel code,
  so no registration hook was needed); a team publish or export flushes the team save, which
  settles; the production page re-reads its library only when the stored library moved, by
  reference; adding a graphic the production already holds replaces it as before and stamps it
  (G1 section 2 had it ask the dropped-field question; refusing it broke the wizard's confirmed
  re-import "Replace anyway"); `production_copies_state()` is for signed-in pages only and recorded
  in the advisor baseline; the new browser checks extend the publish guard's configured spec, since
  backend growth is stopped. Found while building: adoption must settle against the server's copy
  before it stamps, or it keeps an old page's pulled design (caught by the configured walk). The switch is turned on separately, by the owner or the coordinator with the owner's
  permission, after the app is live and `production_copies_state()` reports the mark on
  production (G1 section 6).
- Traps: in the evidence, "Traps met".
- Evidence: `docs/work-specs/live-publishing/evidence/phase-4.md`.

### Phase 5: The honest light and held Takes

- Design: `designs/G2.md`, graded A+ by an independent `/so` at 13a698c2, landed as #2426.
- Previous verified `main`: 8b1a55c9 (the build's last merge from `main`).
- Revert: `git revert -m 1 <this pull request's merge commit>` brings back today's output (a Take
  for a graphic it does not host is dropped, reports bank whatever was applied) and today's light
  ("Connected" from READY alone). Nothing persisted changed: `state.run` is one more member of a
  report row's state, which older readers ignore, so no data step goes with it.
- Rules: G2 section 8, R1 to R14 (reviewed Rules-first in the design gate).
- Decisions: holds and run reports live on the numbered log only; the page owes the command rows it
  follows and the head it resolved, not its own send answers (the answer carries no position, and
  the Take path's send code was left alone); a mounted OGraf package counts as ready; monitors pass
  no positions. Rules found while building are in the evidence.
- Owner decisions (2026-11-12, on #2361, after the final review's repeated family):
  - D1: a command with no outcome at 20 s (a boot frame or a package base still loading) reads
    `failed load` in red, and nothing is dropped; when the frame loads its queue runs hidden and
    the red clears. A held Take still gives up and drops its queue at 20 s (R8).
  - D2: a single stage failure on a running graphic stays red until that graphic's next Take or
    Out, All out, or its deletion; later commands still run.
- G2 wording these change: R1's "answered failed and leaves the queue" becomes D1. Section 1's "a
  graphic in `h` has settled nothing from `from` on" becomes "has not settled everything from
  `from` on": `ran = from - 1` stays a lower bound. R4's "or whose hold has failed" applies only
  while the graphic has no frame able to run it: a failure is a line in `h`, never a gate.
- Traps: in the evidence, "Traps met".
- Evidence: `docs/work-specs/live-publishing/evidence/phase-5.md`.

### Phase 6: Automatic updates, whole publishes

- Design: `designs/G3.md`, graded A by an independent `/so` at 4d61c38e and A on the delta to
  c5d09460, landed as #2469.
- Previous verified `main`: 814f105901f01bdfe1bdadc12afed0cfefa10319 (the build's branch point;
  later `main` merged in before landing).
- Revert: `git revert -m 1 <this pull request's merge commit>` brings back Publish changes and
  outputs that prepare only on a page's request. Turn the `auto_publish` switch off first (delete the
  `system_settings` row or set `"on"` to false): with it off the page publishes only on a press and
  the guard refuses nothing. Migrations 0117 and 0118 stay applied and are inert for older code: `rev`
  and `published_rev` are columns nothing older reads, and the guard only skips a publication naming
  an older revision, which only this build writes.
- Rules: G3 section 11, R1 to R20 (reviewed Rules-first in the design gate).
- Decisions: the saved revision is read from the server's identity columns (`body_updated_at` for a
  personal record, the team token) rather than kept by the sync engine; the configured walk lives
  in `publish-guard.spec.ts` (it holds the service-role switch helpers, and backend growth is
  stopped); the press-to-ran harness republishes through a session flag only the harness sets.
- Found while building, fixed: the Presence reader dropped `au`; a revision-only update now
  carries the source columns (review on #2469); and, on the #2488 review, a team confirmation now
  holds its record across the revision read, automatic mode needs a known revision before it hides
  Publish changes, a 401 that outlives one session refresh is transient, and a page that may not
  publish reads red while a save waits. The configured walk runs with both switches on
  (`production_copies` and `auto_publish`), as production has them.
- AC-4: on the typical fixture at a 5 s edit pace, publishing adds +35.9 ms pooled p95 over 20
  interleaved pairs (90% range +26 to +47 ms), within 50 ms, a pass by the rule fixed before the
  last ten pairs (see Repair 1). In that loop a full publish reaches the outputs about every 10 s
  and every other edit is a revision-only update; the large fixture under continuous editing does not pass (about +334 ms p95, the output
  re-reading each whole copy). Owner decision (b), recorded on #2361, 2026-11-13: land
  with the typical fixture passing, judge the large fixture at the end of phase 7 with D1, and keep
  automatic updates off in production until then. Separately, editing faster than one sync pass on a
  large production makes the sync engine re-run without pause (#2494, fixed before phase 8, not here).
- Migrations: `0117_production_revision.sql` (ordinary), `0118_publication_guard.sql` (live-path,
  renumbered from 0116 and 0117 when `main` took 0116 for the JSON source tick;
  applies in a quiet window). Turning `auto_publish` on is a separate step, after the app is live
  and `auto_publish_state()` reports `installed: true` on production (G3 section 8).
- Traps: in the evidence, "Traps met".
- Evidence: `docs/work-specs/live-publishing/evidence/phase-6.md`.
- Repair 1 (check 6-c-3476 on 7451fbba failed it, typical AC-4 timing +260 ms over 4 pairs): 10
  interleaved pairs on the same commit read p95 256 ms on against 431 ms off, with the same count of
  slow Takes (47 and 48). A bootstrap over pairs puts the difference between -246 and +133 ms, so the
  first single pair's +2 and the check's +260 are both draws from one spread. Probes show the slow
  Takes, on both sides, wait for the page's save: every edit makes two sync passes (#2494's queued
  re-run), with page long tasks of 95 to 190 ms. With #2497 landed, a publish waits for a pass
  that ends synced, so at 3 s nothing was published. Owner decision (a), 2026-11-13: automatic
  updates publish once editing pauses, and AC-4 is judged at a 5 s edit pace (the harness's
  `MEASURE_EDIT_MS`, default 5000). The rule, fixed before the last ten pairs: pass when the pooled
  p95 difference over 20 pairs is 50 ms or less. Result: p95 141 ms on against 105 ms off over
  1000 Takes each, +35.9 (90% range +26 to +47). 239 edits, 225 confirmed saves, 204 publishes,
  the newest save published at the end of 19 of 20 runs; every other edit changes nothing the
  outputs show (the fixture's last cue is the CasparCG server cue, which has no field values), so 6
  of each run's publishes were new versions and the rest revision-only updates. Slow Takes 43
  against 21 and the longer tail are recorded and carried to phase 7 with D1. The only code change is that harness
  pace setting, which normal builds leave out. The evidence's +2 is replaced by both tables.

### Phase 7: Only what changed, each image once

- Design: `designs/G4.md`, graded by independent `/so` reviews (see the design's pull request for the
  rounds and the final grade), landed as its own pull request before this one.
- Previous verified `main`: 88c94f959920db642c9b3c79cb82f74b72010c95 (the design's landing, merged
  into the build branch).
- Revert: `git revert -m 1 <this pull request's merge commit>` brings back whole saves, whole
  publishes and whole output reads. Turn the `partial_writes` switch off first (delete the
  `system_settings` row or set `"on"` to false): with it off every page saves and publishes whole and
  every output reads whole at once, so the revert changes nothing anyone sees. Migrations 0119 and
  0120 stay applied and are inert for older code: `body_units`, `doc_units`, `published_head` and
  `published_units` are columns nothing older reads, the new tables are reached only through the new
  functions, and `output` is always written whole.
- Rules: G4 section 8, R1 to R24 (R23, the parts path leaves everything as the whole path would, was
  added by the round-cap reassessment of the design).
- Migrations: `0119_record_patches.sql` (ordinary), `0120_publication_parts.sql` (live-path; applies in
  a quiet window). Turning `partial_writes` on is a separate step, after the app is live and
  `partial_writes_state()` reports `installed: true` on production (G4 section 7). `auto_publish`
  stays off.
- Departures from G4's wording, each for its intent:
  - The sync listing is incremental with parts on: after a full listing, a pass reads only the rows
    the server changed since (`updated_at`, with a minute's overlap), and reads in full again every
    ten minutes and after a purge or removal. G4 said no result is kept after the listing answers;
    on the large fixture the full listing alone was 12.7 kB of a 23.7 kB cue edit. The coordinator
    was told before it was built.
  - A press that names no saved revision reads the stored stamp instead of using this page's own
    last publish: its older-design check (G3) is judged against what is stored.
  - The publisher's 30 s revision check reads a personal record's `rev` in a query of its own, so
    the count can tell that poll from a save's own read (G4 section 11 reports fixed-period reads).
- Traps: a large-fixture measure on the development server crashed the browser while building the
  fixture (int3, typical fixture fine); on the production build, where AC-5 is measured, it runs.
  A job chained with `--after` fails when the job before it fails. The AC-2 test of
  `publish-guard.spec.ts` fails locally when run after the tests before it in that file, on this
  branch and on `main` alike; alone it passes, and CI runs it green.
- Evidence: `docs/work-specs/live-publishing/evidence/phase-7.md`.
