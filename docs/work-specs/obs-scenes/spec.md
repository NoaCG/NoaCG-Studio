# OBS scenes

Status: agreed with the owner on 2026-11-12, after three independent second opinions on the
design and two on the run preparation. Plan name `obs-scenes`. Not built.

## Why

OBS users build scenes that hold everything and switch between them, often from a Stream Deck.
NoaCG plays out like a broadcast rundown: one output link per production, cues taken by hand.
For a one-person OBS production with a dozen scenes that always carry the same graphics, a click
in NoaCG on every cut will sooner or later be missed. The graphics must follow the OBS cut by
themselves, and NoaCG must show the operator that every scene is in place.

OBS is the most common tool for the small productions NoaCG serves (`docs/GOALS.md`, North Star),
so this fits NoaCG to the scene model in general. A live production on one Windows PC with the
newest OBS is the first production proof.

**What must hold.** Air never depends on a fragile link. A graphic never appears in the wrong
scene. The operator recovers alone from anything recoverable, and the docs say plainly what is
not. Nothing new appears for users who do not switch OBS scenes on. Nothing this plan lands may
break another live production.

## Evidence

- `docs/OBS_ON_A_REAL_HOST.md` §3, §5, §9, §10, §11: at OBS's default page permission a browser
  source receives `obsSourceVisibleChanged` (preview or program), `obsSourceActiveChanged`
  (program) and `obsSceneChanged`; `getCurrentScene` answers `null`; no event at load; docks get
  no OBS events but share storage and BroadcastChannel with sources on the same address; one
  stale frame of the old picture on every tested Cut at 30 fps with hardware acceleration. The
  cloud output link itself was never loaded in that OBS (§9).
- `src/model/shows.ts` (`folders`): folders never reach the published page, the export or a pack.
- `src/control/hostedControl.ts` (`OutputGraphicSpec`): the output payload, on-air state, reports
  and bindings are keyed by graphic name. `src/output/main.ts` builds every graphic of the
  production and needs the backend to boot; a loaded page keeps its state when the network drops
  (`docs/CLOUD_PLAYOUT.md` §3).
- `src/model/library.ts` (`templateForSavedGraphic`): a production's graphic is its own copy of
  the template; a newer design reaches it only through Update.
- `src/control/livePath.ts` `readLiveEntry`: at most 16 expected outputs.
- `src/model/adjust.ts`: placement and nudge per graphic and per cue.
- `src/templates/shared/clock.ts`: a target time is `HH:MM` only, and a past time means
  tomorrow. `src/templates/cornerBug/bugRuntimes.ts`: the sponsor rotation index is a per-page
  timer from zero.
- `api/_lib/feedFetch.ts`: guarded fetch (public addresses only, redirects checked), feed floor of
  5 minutes; `api/data/[...path].ts` (`as=json`): an uncached one-off JSON sample of 256 KiB.
  `vercel.json`: the server data tick runs once a minute. `api/AGENTS.md`: 12 of 12 functions.
  `docs/DATA_API.md`: "NoaCG never scrapes a site or polls an address for you".
- `src/templates/competition/results/shared.ts` (`BRACKET_FIELDS`): the Bracket type takes tie
  lines "Round | Side A score | Side B score" and is single elimination only.
- `src/backend/auth.ts`: sign-in is Google only.
- `companion-module/` (0.3.0): Take and Select keys per cue and per folder, answered by one open
  production page (`src/control/panelRelay.ts`). Its release is a manual workflow
  (`.github/workflows/release-companion.yml`).
- `scripts/plan-run.mjs`: phases are admitted strictly in order.

## Owner decisions (2026-11-11 and 2026-11-12)

- **D1. A scene is a rundown folder** marked as an OBS scene, with its own output link pasted once
  into a browser source in the matching OBS scene. An "OBS scenes" switch sits beside the vMix and
  CasparCG switches; nothing about scenes shows until it is on. No Bridge, no OBS plugin, and no
  obs-websocket on the air path. The agreed `docs/work-specs/bridge-obs-adapter/spec.md` is parked.
- **D2. Scene graphics are settled and always on.** No entrance animation on program in this plan.
  They show in OBS preview and program alike; OBS's own cut, fade or stinger carries them.
  Continuous motion inside a graphic (a clock, a rotation) is not an entrance and keeps running.
- **D3. On and off is the cue's ordinary Take and Out.** No second visibility flag. A graphic used
  in several scenes gets one pool copy per scene, bound to the same data paths, each with its own
  placement. Keying renderer state by cue is later work.
- **D4. JSON is read by NoaCG's server.** A public JSON address is read on a schedule set per
  source, above a floor of 10 s, through the existing guarded fetch, with one shared cached read.
  This replaces the "never polls an address" line in `docs/DATA_API.md` for public JSON sources
  with these guards.
- **D5. One Live dock** runs the production control session and answers Companion. The Messages
  dock is postponed: moderation runs in a normal browser.
- **D6. Event graphics are made outside this plan's phases**, in this repository with the local
  graphic skill. A retrospective afterwards compares each step with what a user of the published
  NoaCG plugin and connector would have met. It records the shortcuts the local skill took; it
  does not claim an ordinary user could have reproduced the work.
- **D7. Landings stop during the owner's live windows.** A landing hold covers every route to
  `main` (and with it production deploys and migrations). Its schedule is private.
- **D8. Scores typed in the Sheet are the baseline;** the JSON source and bracket adapter are a
  bonus and the first scope cut if the run slips.
- **D9. Direct cuts and fades are supported; graphics that change while off air sit in a shared
  source.** OBS keeps the last picture of a browser source whose scene is off air and shows it for
  one or two frames when the scene comes back (`docs/OBS_ON_A_REAL_HOST.md` §11, measured again in
  OS2). A graphic that did not change looks the same, so only a changed one flashes its old value.
  Graphics that change all the time (a countdown, a sponsor loop, live scores) therefore go in one
  scene folder whose link is added to every OBS scene that shows them as the same source ("Add
  Existing"), so it stays on air while the operator cuts between those scenes. Taking a scene
  through Studio Mode preview shows no old frame at all and stays the safest path. Owner,
  2026-11-13: "we need to support swapping scenes without preview also"; agreed to the shared
  source rule. (Before OS2 this decision read: take every scene through Studio Mode preview.)

## Behaviour

### Scenes (OS1a, OS1b)

- A folder marked as an OBS scene is a scene. Its cues are its graphics. The scene id is stable
  and survives renaming the folder.
- Adding a graphic that is already in another scene makes a pool copy named "<name> · <scene>"
  (a number is added when that name is taken), with the same bindings and its own placement. The
  copy is a normal pool graphic: it persists, publishes and exports like any other.
- Making a scene, or adding a graphic to one, takes it: it is on air in that scene's link until
  the operator takes it out. Take and Out work from the rundown, the Live dock and Companion keys.
- A scene graphic is drawn settled: its first visible pixels are its resting state. A change while
  the scene is not shown is applied without animation. A re-Take after Out shows it settled.
- A template's empty text draws nothing. Data never sends show or hide commands.
- All out clears hand-taken cues only. Scene graphics keep their state: on stays on, and out
  stays out.

### The scene link (OS1a)

- `/output?production=<slug>&scene=<sceneId>` builds only that scene's graphics, through publish,
  reconnect and reload. A graphic deleted from the scene disappears from the link. An unknown or
  deleted scene id draws nothing and reports itself as unknown; it never falls back to the whole
  production. The ordinary `/output?production=<slug>` link behaves as today.
- Readiness counts a graphic outside a scene as excluded, not missing.
- Its presence report adds the scene id, loaded and ready, and from OBS events, whether it is in
  preview or on program, plus the OBS scene name it was on program in last.

### Monitoring and settings (OS3)

- Automatic: loaded and ready, connected, not loaded, loaded twice, in preview, on program,
  unknown (no OBS event yet), and stale presence.
- By walk-through: "seen in OBS scene <name>" ticks the first time a link goes on program after
  OBS switched to that scene. Until then the row says "not yet seen", which is not an error.
- The playout panel shows one row per scene under the OBS scenes switch. Playout settings gets an
  OBS scenes section: scenes, their graphics, a copy button per link, "Copy all links", and a
  link to the OBS scenes guide in `docs/` (browser source settings, the walk-through, the fallback
  and what each failure needs).
- More than 16 expected outputs are refused with a sentence that says so.
- The fallback is the existing offline HTML overlay export (`src/export/targets/htmlOverlay.ts`),
  one file per scene graphic, placed by the owner in a hidden OBS group per scene. The exporter
  gains a settled option: the graphic is drawn at rest from load, with no entrance, no automatic
  Out timer, and OBS's show and hide events ignored. Without it the export plays its entrance on
  program and can take the graphic off again.

### Clocks (OS4)

- The sponsor rotator picks its logo from the wall clock, so every copy shows the same logo at the
  same moment, and a reload or a page throttled while hidden resynchronises.
- A countdown can count to an absolute deadline: an ISO 8601 date and time with its offset. It
  shows the time left, holds at zero (optionally showing a short text), survives reload, and never
  cuts anything. A deadline in the past shows zero. An invalid value shows the template's empty
  state. `HH:MM` targets keep working as today.
- "In N minutes" is computed by the caller (the Live dock, or Companion's own time functions) and
  written as a full time, so writes stay absolute (`docs/DATA_API.md`). A repeated press writes
  the same kind of value again; it never adds time twice.

### JSON source (OS5a)

- A production can add a public JSON address as a source, with an interval it chooses (floor
  10 s). The server reads it through the guarded fetch, caches one read per address for every
  reader, and the open production page keeps the reading lease the way the sheet and feed readers
  do; with no page open, the once-a-minute server tick reads it.
- A read is applied through the existing source evaluator as one complete snapshot. A failed,
  late or malformed read writes nothing: the last good values hold. Pause and resume work as for
  other sources. The source shows when it was last checked and, separately, when its content
  last changed.
- No new Vercel function; the route stays inside the existing data catch-all.

### Bracket adapter and current match (OS5b)

- A source can use a named adapter. The bracket adapter is a pure module. It accepts rows given as
  a list or as an object keyed by row number, and returns this shape under the source's prefix
  (`<p>` below), which graphics bind to:
  - `<p>.brackets[i]` `{ id, title, stages[k] }`; a stage is `{ id, rounds[r] }`; a round is
    `{ id, name, matches[m] }`, in feed order.
  - A match is `{ id, status, a, b }`. `status` is `pending`, `live` or `done` as the feed gives
    it, else `unknown`. A side is `{ name, race, seed, score }`; `score` is a number or `null`
    (unknown), never a silent zero. No winner is inferred from scores.
  - `<p>.players[j]` `{ name, race, seed, league }` where present.
  - `<p>.ties.<bracketId>`: the lines the existing Bracket type takes, one per match, "Round |
    A score | B score", with "—" for an unknown score.
  - `<p>.current` `{ matchId, round, a, b, held }`, resolved from the operator-owned
    `<p>.currentMatchId`.
- The adapter's field mapping (which input field means name, score, race, round and so on) is a
  setting of the source, not code, so no site's field names are written into the product.
  Fixtures are synthetic.
- The mapping also covers feeds shaped differently (added after the first run on a real feed):
  - A row can be one side of a match: rows that share a match id form the match, side a then side
    b in row order. A match with one side in the rows is kept, with an unknown other side, and
    reported; no winner is invented.
  - Rows can be nested: the rows path can gather every entry of a list or of a numbered object at
    any level, in feed order, down to leaves that are lists or numbered objects of rows.
  - The bracket can be taken from where a row sits (its entry's place at a gathered level) when no
    row field names it; a field that repeats across brackets can then be the stage.
  - Rounds can be ordered by their number, highest or lowest first, for a feed keyed by round
    number, whose own order is lost when its JSON is read.
  - A separate players section can be joined to the sides by name, ignoring case, to fill each
    side's seed (and its race where the row has none); `<p>.players` then comes from that section.
    A name the section does not hold is reported, not guessed.
- The current match is chosen by the operator. A read never changes it. If its match disappears
  or its players change, `current` keeps the last values and `held` is true.

### The Live dock (OS6)

- `/dock` is a compact page (300 px wide) that signs in like the app, runs the production control
  session and answers Companion. Exactly one page answers Companion: opening the dock beside a
  production page follows the existing "Use here" hand-over (`src/control/panelRelay.ts`), and a
  reconnect keeps it.
- It shows the scene health line, the program scene's graphics with Take and Out (or a scene the
  operator picked, while OBS state is unknown), the current match picker, the break deadline with
  "In 2 min", "In 5 min" and "Set", and source freshness. Its controls do not move when the
  program scene changes.
- No `companion-module/` change unless a needed action is missing; a module release is manual and
  outside the merge queue.

### Landing hold (OS0)

- A hold state, read by the CI gate on every pull request and merge group run. While the hold is
  on, the CI gate fails with "Landing hold" and a pointer to who set it, so nothing reaches
  `main`, production does not redeploy, and no migration applies. If the hold state cannot be
  read, the gate fails (fail closed).
- A `workflow_dispatch` workflow turns it on or off, with a reason. The owner or the run's
  coordinator triggers it; scheduled triggers in the owner's account turn it on before each
  private window and off after. A pull request queued when the hold turns on leaves the queue by
  the failing gate and is queued again after.
- `docs/` says how to set and lift it, and what it does not cover (a manual production deploy).

## Beside the live-publishing run

Both plans change the output page and the publish path. The contract between them:

- The scene field in the payload is additive. A scene link filters at payload build and at
  recovery; it never changes what an unscoped output receives.
- Excluded graphics are not missing graphics (readiness, reports, recovery).
- Commands and reports for a scene link are scoped to that scene's graphics.
- Scene graphics follow live-publishing's replacement rules (a new design at the next Take, after
  an output restart). Both states of the `production_copies` switch are supported until the owner
  fixes it for the event; no new production switch after the feature freeze.
- Before a phase that touches `src/output/` or the publish code in `src/control/hostedControl.ts`,
  this run's coordinator posts a note on the other run's issue. The later lander of an overlapping
  change owns the integration: it merges `origin/main`, re-runs both runs' output journeys, and
  fixes the conflict in its own pull request.

## Acceptance criteria

### AC-1: A scene link builds only its scene

A production with three scenes of two graphics each builds two graphics per scene link, through
publish, reconnect and reload. A graphic removed from a scene disappears from its link. An unknown
or deleted scene id builds none and reports itself as unknown. The ordinary output link of the
same production builds every graphic, as today.

### AC-2: Take and Out per scene graphic

Take and Out of a scene graphic change only that scene's link. Reloading the link restores the
same on and off state. All out leaves scene graphics as they were: on stays on, out stays out.

### AC-3: Pool copies per scene

Adding a graphic to a second scene makes a named pool copy (a number added on a name clash) with
the same bindings and its own placement. The copy survives save, reload, publish and export. A
placement change in one scene moves nothing in the other.

### AC-4: Settled drawing

A scene graphic's first visible frame is its resting state, with no entrance. A change while the
scene is hidden, and a re-Take after Out, are applied without entrance animation. Continuous
motion (a clock, a rotation) keeps running.

### AC-5: Nothing changes with the switch off

With the OBS scenes switch off, the existing playout, publish and output journeys pass unchanged.
The clock improvements of OS4 are judged by AC-7 and AC-8, not here.

### AC-6: Scene monitoring and settings

In a test page that sends OBS's own events: each scene row shows loaded, loaded twice, not loaded,
connected, unknown before any event, preview, program, stale presence after the page goes away,
and "seen in OBS scene" after a walk-through. The settings section shows each link with Copy,
"Copy all links" copies every link with its scene name, and the guide link opens the OBS scenes
guide. More than 16 outputs is refused in words. Simulated events are not hardware proof: the
owner confirms the rows in OBS in OS2 or OS7.

### AC-7: Wall-clock sponsor rotation

Two pages loaded at different times show the same logo at the same moment; a page hidden and
throttled for a minute, and a reloaded page, rejoin the cycle within one change.

### AC-8: Absolute deadline countdown

A countdown given an ISO deadline with an offset shows the right time left across a reload and a
hidden page, in a timezone other than the offset's. It holds at zero after the deadline. A
deadline in the past shows zero, never tomorrow. An invalid value shows the empty state. `HH:MM`
behaves as before.

### AC-9: Scheduled JSON source

A JSON source reads at its set interval and never under 10 s, while a page holds the lease and,
without one, at the server tick. One cached server read per address serves every reader. Two
pages compete for the lease without double reads. A failed, malformed or late read writes nothing.
Pause and resume, and closing the page or dock, behave as for other sources. Checked and changed
times are shown. The feed route's guards hold (private addresses refused, redirects checked, size
limit). No new Vercel function.

### AC-10: Bracket adapter and current match

Both row shapes produce the same ordered result with stable match ids. Unknown scores stay `null`
and "—" in tie lines. Duplicated or missing rows are reported, not guessed. The field mapping is a
source setting. The current match holds across reads, keeps its last values with `held` true when
its match disappears or changes players, and moves only when the operator picks another. Rows
that are sides of a match pair by match id, and a one-side match is kept and reported; rows nested
under lists and numbered levels are gathered in feed order; the bracket can come from a row's place;
a players section fills seeds by name, ignoring case, and an unmatched name is reported; rounds can
be ordered by their number, highest or lowest first. A setting
made before these options reads exactly as before. Covered by synthetic fixtures.

### AC-11: The Live dock

At 300 px wide the dock signs in, answers Companion (and hands it over through "Use here" when a
production page is also open, and keeps it after a reconnect), Takes and Outs the program scene's
graphics, falls back to a picked scene while OBS state is unknown, sets the break deadline as a
full time, and picks the current match. Sign-in inside an OBS Custom Browser Dock is confirmed by
the owner in OS2.

### AC-12: Offline fallback

The HTML overlay export's settled option draws the graphic at rest from load, with no entrance,
no automatic Out, and no reaction to OBS's show and hide events, checked in a browser page that
sends those events. The OBS scenes guide explains the fallback group. In OS7 the owner starts OBS with the network
off and empty browser caches, shows each scene's fallback group, and sees its graphics placed and
settled with their fonts and images.

### AC-13: First laptop test

Owner phase, on the owner's laptop with the OBS version he will use, recorded with the receipt
template in the OS2 hand-over. With placeholder graphics, every scene's source loaded at
1920×1080 and 60 fps, the game capture, cameras and encoding running, Stats counters reset, 20
minutes of cutting:

- Pass (owner, 2026-11-12): frames skipped due to encoding lag 0; frames missed due to rendering
  lag at most 0.1%; average render time at most 8 ms.
- Stale frame: change a value while its scene is hidden, then take it ten times through Studio
  Mode preview, ten times with the default transition, and ten times with a direct Cut. Pass: no
  old frame through Studio Mode preview. The default transition and the direct Cut are recorded
  for information, and D9's shared source covers graphics that change off air (amended after
  OS2, owner 2026-11-13).
- The stinger's start, cut point and the source's "on program" event are logged ten times, for
  information.
- Sign-in to NoaCG inside a Custom Browser Dock works.
- A load failure on the laptop is repeated on the show PC before any decision, because that PC is
  stronger.

### AC-14: Owner rehearsal

Owner phase, on the owner's laptop, with the receipt template in the OS7 hand-over, one pass or
fail line each: every scene walked through and its row ticked; a shared source (D9) holding a
running countdown shows no old frame on ten direct Cuts between two scenes that both hold it;
the stinger's start, cut point and "on program" event logged ten times, and any hand-made or
imported event graphic rests on air when taken (both moved here from OS2); the dock and the
Companion keys used; network off and a source refreshed, then the fallback group shown; a source killed and
refreshed back within 10 s; OBS restarted and every scene back within 2 minutes; the Stream Deck
unplugged and the dock used instead; the bracket feed paused and its last values held. Each drill
is recovered by the owner alone.

### AC-15: Landing hold

With the hold on, the CI gate fails on a pull request and on a merge group with "Landing hold"
and who set it, so a queued pull request leaves the queue. With it off, the gate behaves as
today. If the hold state cannot be read, the gate fails. The workflow sets and lifts it with a
reason, and the guide says what it does not cover.

## Phases

Each phase is one pull request, runs `/check` and lands with `/queue-merge`. Phases are admitted
strictly in the order below, so the owner's laptop test sits after work that does not need it:
he gets its checklist as soon as OS1a lands, and records his result when OS2 comes up. Phases
marked **Risky** take the Rules-first `/so` (`docs/plan-runs/known-traps.md`). Evidence files are
`evidence/phase-<id>.md`.

1. **OS0. Landing hold** (AC-15; **Risky**: CI). The hold state, the workflow to set it, the CI gate
   check, failing closed, and its guide.
2. **OS1a. The scene link** (AC-1, AC-4, AC-5; **Risky**: payload, output, recovery). The scene
   flag on a folder, the scoped link, settled drawing, the OBS scenes switch with no other UI.
   Leaves a placeholder production and the OS2 checklist with receipt template.
3. **OS4. Clocks** (AC-7, AC-8; **Risky**: reload semantics). Wall-clock rotation and absolute
   deadlines.
4. **OS5a. JSON source** (AC-9; **Risky**: api, polling). Includes the `docs/DATA_API.md`
   change of D4.
5. **OS5b. Bracket adapter and current match** (AC-10; **Risky**: state rules). The coordinator
   also runs the adapter on the owner's private sample and records only pass or fail, privately.
6. **OS2. First laptop test** (AC-13). Owner phase.
7. **OS1b. Take, Out and copies per scene** (AC-2, AC-3; **Risky**: state rules, recovery).
8. **OS3. Monitoring, settings and the settled export** (AC-6, and the settled export and guide
   of AC-12; **Risky**: presence state).
9. **OS6. The Live dock** (AC-11; **Risky**: a second control session). Leaves the OS7 checklist
   with receipt template.
10. **OS7. Owner rehearsal** (AC-12, AC-14). Owner phase.

## Later (not in this plan)

The Messages dock, entrance animations on program, renderer state keyed by cue, one shared
connection for all OBS pages, a read-only OBS check through obs-websocket and one-click source
creation, a live OBS picture under placement, a general JSON mapping screen, live data stingers.

## Phase notes

Filled in by each phase's pull request.

### OS0: Landing hold

- Rules (written before coding):
  - R1. The hold is on exactly when at least one open issue (not a pull request) in this
    repository carries the label `landing-hold`; off when that read succeeds and finds none.
  - R2. The CI gate reads the hold on every `pull_request` and `merge_group` run, and on a
    `workflow_dispatch` run of any ref but `main` (the mechanical landings' tips). It does not read
    it on a push to `main`: that commit has landed, and a red gate there would start the red-main
    revert machinery for a commit nothing is wrong with.
  - R3. Hold on: the gate fails with an error annotation that starts "Landing hold" and names who
    set it, the reason, and the hold issue's link. Every other gate rule is unchanged, so other
    failures are still reported beside it.
  - R4. The read fails (no token, a network or API error after three attempts, a timeout, an
    answer that is not a list of issues): the gate fails with "Landing hold state could not be
    read" (fail closed).
  - R5. Hold off: the hold step passes and the gate's verdict is exactly today's.
  - R6. The gate reads the hold when its own job runs, after every other job. A merge group whose
    gate is still running when the hold turns on fails and its pull requests leave the queue. A
    gate that already finished is not read again.
  - R7. `.github/workflows/landing-hold.yml` is `workflow_dispatch` only, with `state` (on or off)
    and a required non-empty `reason`. On: with no open hold issue it creates one (and the label
    if missing) whose body names the account that dispatched it, the run and the reason; with one
    open it rewrites that body to the new setter and reason and comments. Off: it closes every
    open hold issue with a comment naming who lifted it and why. Repeating a request changes
    nothing else. Runs never overlap and a running one is never cancelled.
  - R8. After writing, the workflow reads the hold back with the gate's own reader and fails
    unless it matches the request.
  - R9. Lifting re-runs nothing. A pull request whose gate failed under the hold gets its failed
    `CI gate` job re-run (it reads the hold again) and is queued again.
  - R10. Not covered, and the guide says so: a manual production deploy, a migration applied by
    hand, an administrator bypassing the branch rules, and releases that never touch `main`.
- Rules found by the Rules-first `/so`, before code (it agreed with corrections):
  - R11. A gate red only with the hold's error ("Landing hold: set by ...") is not a fault. The
    red-PR alarm (`scripts/repair-wake.mjs` `heldOnly`) raises nothing for it, and the repair
    rules (`queue-merge.md`) spend no attempt on it. An unreadable hold, or the hold beside any
    other failure, is still a fault.
  - R12. Closing or unlabelling the hold issue by hand is never a repair; only the workflow lifts
    it with a reason. An issue labelled by hand still holds and names whoever opened it.
  - R13. The reason is public. Scheduled dispatches use a fixed neutral reason, so no window or
    date appears anywhere.
- Rules found after coding (`/check` review): every open hold is rewritten on a repeated `on`;
  a write is tried once (a retried create could open a second hold), reads three times; a request
  still waiting when a newer one arrives is cancelled by GitHub, so the newest wins (R7 amended);
  `heldOnly` needs exactly one failed step, so the gate's own failure beside the hold is a fault,
  and a held PR keeps an alarm line already listed for it; a pull request that edits the hold's
  own check is judged by that edited check (the guide lists it as not covered).
- Previous verified `main`: `3c5bbf9add0692fdc1d8fc42aed558416d331805` (CI run 43229582088). The
  source, `d8aaca715e8cecbfc2b888f6bb76b2670f32b502`, had its push CI still running at the start.
- Revert: `git revert -m 1 <this pull request's merge commit>` removes the gate step, the
  workflow, the alarm exception and the guide. Lift the hold first if it is on: an open hold issue
  left after the revert holds nothing, but should be closed so it does not mislead.
- Decisions: the state is an open issue with the `landing-hold` label, because the workflow token
  can write issues but not repository variables, a ref could be pushed or deleted by any agent,
  and a file would need a landing, which the hold blocks. The gate reads it in its own last step,
  beside "Require every gate", with `issues: read` added to that job and nothing else. Three
  attempts per read, 15 s each, then fail closed. The workflow is dispatch only, so no schedule
  is in the repository.
- Traps: the merge queue's held revert and quarantine landings stay held too (D7's "every
  route"); the guide gives the escape (lift, land the revert, set again), and the owner of the hold
  decides. A merge group whose gate passed before the hold turned on may still land; the runbook's
  lead time covers it.
- Evidence: `docs/work-specs/obs-scenes/evidence/phase-OS0.md`.

### OS1a: The scene link

- Rules (written before coding):
  - R1. A folder is an OBS scene when it carries `obsScene: true` (additive optional on
    `ShowFolder`). Its scene id is the folder id, so renaming the folder keeps it. The flag is set
    and cleared from the folder's menu, which offers it only while the production's OBS scenes
    switch is on.
  - R2. The switch is `obsScenes: true` on the production record (`Show`, additive optional; off
    is absent; not in `outputSetup`, so the payload's `outputSetup` never changes), shown beside the vMix and CasparCG switches. Turning it off keeps every folder's flag,
    so turning it on again finds the scenes as they were.
  - R3. While the switch is on and at least one folder is a scene, a publish writes `scenes` into
    the output payload: per scene its id, its name and the names of the graphics its graphic and
    picture cues use, deduplicated, in rundown order. With the switch off, or no scene, the payload
    is exactly today's. The version stamp is unchanged by scenes: they are cue metadata, taken by
    an output on the next publish it prepares, as cue metadata is today.
  - R4. `/output?production=<slug>` with no `scene` parameter runs exactly today's code path.
  - R5. `&scene=<id>` builds only the graphics the payload's scene `<id>` names, at boot and at
    every publish the output takes. The stage keeps the production's resolution. An id that is
    malformed, absent from the payload (unknown, deleted, switch off) or names no graphic builds
    nothing; the page keeps running, reports itself, and builds the scene's graphics when a later
    publish names them. It never falls back to the whole production.
  - R6. Commands for a graphic outside the scope (not in the scene of the publish the link holds
    now) are read past: they move the follow position and change nothing else, no
    data, no air state, no report, no bank. A graphic that leaves the scene leaves the link at the
    next publish the link takes, on air there or not, with no Out animation, and its commands are
    read past from then on. This departs from per-graphic replacement G1 (a removed graphic waits
    for its Out) on scene links only: a scene graphic is always on, so waiting would keep it in the
    wrong scene.
  - R7. A scene link reports, banks and recovers only the graphics it holds; its boot catch-up
    starts from the oldest baseline among them. With no graphic in scope it follows from the log's
    head, never from its start.
  - R8. Readiness on a scene link counts its own graphics only, so a graphic outside the scene is
    excluded, never missing. A link whose scene the payload does not know carries a `scene` issue
    in READY, so every operator surface reads it not ready, never green. Its Presence entry adds
    `scene`: the id, whether the payload knows it, and from OBS's browser source events whether it
    is in preview or on program (unknown until the first event) and the OBS scene name it was last
    on program in; `readLiveEntry` reads it back.
  - R9. On a scene link every Take is drawn settled: no frame of an entrance is ever drawn. A
    graphic with a state machine plays and is snapped to the pose that Take reached in the same
    task, with its timers armed, so a clock, a loop or a rotation keeps running. A graphic without
    one plays and has its finite running animations jumped to their end in the same task; endless
    ones keep running. An imported OGraf package's Take asks it to skip its animation. A re-Take,
    on air or after Out, is drawn the same way. Out, Next, events and updates are as today. On the
    ordinary link a Take is as today.
  - R11. A graphic that joins the scope on a publish joins off air with its first cue's values, as a
    newly published graphic does; its next Take airs it there, settled, and a reload recovers it
    from its report and the log. Joining on air is OS1b's ("adding a graphic to one takes it").
  - R12. Until OS1b makes a pool copy per scene, one graphic in two scenes is built by both links
    and shares one air state; this phase's fixtures and the placeholder production use a graphic
    in one scene only.
  - R10. With the switch off no scene control shows, no payload field is written and a scene link
    builds nothing, so every existing playout, publish and output journey is unchanged. Turning the
    switch off on a running production therefore empties every scene link at the next publish
    (asked of the owner through the coordinator; this is the default until answered).
- Rules found by the Rules-first `/so`, before code (it agreed with corrections): R6's removal at
  the next publish, R7's empty scope, R8's `scene` issue and parsing, R11, R12, and R10's switch-off
  consequence. Departure recorded: AC-4 asks for no entrance animation; the behaviour section's
  "a change while the scene is not shown is applied without animation" is read as no entrance, so
  Next, events and updates animate as their graphic does today.
- Rules found after coding: the boot's hidden catch-up counts only rows in scope, so another
  scene's Take never hides a scene link's graphics while it settles; the switch-off default was sent
  to the owner through the coordinator as one question. From the `/check` review: a face the
  production ships once, with a graphic of another scene, is still found by a scene link's styles;
  OBS names the scene a source arrives in right after activating it and names the next scene before
  deactivating it, so only a name within a second of an activation sets "last on program in"; a
  settled Take of a graphic without a machine finishes repeats and jumps a looping timeline to the
  end of its finite motion; copying a scene link marks the output as set up, as the plain link does.
  From the final `/so`: a graphic outside the scope is never on air on the link (`onAirHere`), so it
  holds no whole-page reload either (a publish that changes the stage size and moves an on-air
  graphic out of the scope used to wait for an Out the link reads past). From the PR review: the
  settled snap clears inline styles the data owns (a fitted size), so the values are restated after
  it, as a restart's recovery does.
  Not changed, with reasons: a design change to a scene graphic on air waits for its next Take (the
  contract with the live-publishing run); an operator page built before this one reads an unknown
  scene's READY as ready, for the life of that page only (deploy skew).
- Previous verified `main`: `619ebc8358f212410bce16e6cd5ce6682b94d5a7` (CI run 43243087381).
- Revert: `git revert -m 1 <this pull request's merge commit>`. Nothing persisted is renamed: an
  `obsScene` flag or `obsScenes` switch left on a record by this build is ignored by the reverted one,
  and a published `scenes` field is ignored by its outputs, so a scene link then builds the whole
  production; take scene links out of OBS before reverting.
- Decisions: the switch lives on the production record, not in `outputSetup`, so the published
  `outputSetup` and every reader of it stay as they are. The scene id is the folder id. Scenes are cue
  metadata outside the version stamp. A settled Take is `play()` then `noacgSnap` of the reached pose
  in one task, the recovery path every graphic already supports, rather than a new entrance-less
  animation path in the runtime. The unknown-scene state is a READY issue, so today's operator words
  say "Not ready" without any OS3 surface. A copy of the scene link sits in the folder's menu, the
  only way to get a link before OS3's settings section.
- Traps: `__noacgLive.command` (the offline specs' door) reaches `applyCommand` only, never the report
  path, so a check that a scene link writes no report for another scene's graphic needs log rows
  (the spec's stood-in tail). A graphic's composed document only knows `settled` through the play
  command; the editor monitors never send it.
- Evidence: `docs/work-specs/obs-scenes/evidence/phase-OS1a.md`.

### OS4: Clocks

- Rules (written before coding):
  - R1. The sponsor rotation's cycle is the wall clock. Its length P is the machine's own: the
    rotating state's hold (its timer's `after`) plus its crossfade, divided by the motion speed
    (6.5 s at speed 1). Cycle k is `floor(Date.now() / P)`; its logo is filled slot `k mod n`
    (every slot while none is filled, as today). So every copy of a graphic shows the same logo
    in the same cycle, wherever and whenever it was loaded.
  - R2. Off air, parked or measured (a snap with `timers: false`, a preview, a thumbnail, the
    catalog's load-state fingerprint) nothing changes: the first slot shows from load, as today.
  - R3. The rotation is live exactly while the machine's rotation group has a timer armed: after a
    Take's entrance has finished, after a snap with timers (a reload's recovery, a scene link's
    settled Take), and after Resume's crossfade. While live, the runtime owns the timing: it reads
    the wall clock five times a second, replaces the machine's
    armed timer at once with its own wait, and when the next crossfade's midpoint would fall in a
    new cycle it makes that timer's own transition (the crossfade) at once, so the swap lands on
    the cycle boundary within one read. A machine timer that would fire early or late, or a page
    whose timers and drawing were throttled while hidden, therefore never sets the beat. When the
    new cycle's logo is the one on screen it records the cycle and plays nothing.
  - R4. A crossfade the runtime started shows its cycle's logo at the midpoint. Any other
    crossfade (Next sponsor, Resume, a snap into the crossfade state) shows the following slot,
    as today, and the rotation rejoins the wall clock at the next boundary. Hold arms no timer,
    so nothing moves until Resume.
  - R5. Joining never adds a change: a Take, a settled Take and a reload keep the logo they show
    until the next cycle boundary, which brings them onto the wall clock (AC-7: "within one
    change"; AC-4: no motion beyond the rotation's own). So copies agree from their first change.
  - R6. The rotation's machine, events, controls, fields, look and load state are unchanged;
    only its design-owned runtime (`src/templates/cornerBug/bugRuntimes.ts`) changes. Without
    an armed-timer signal to read, the runtime keeps today's per-page cycle.
  - R7. The starting-soon start-time field also takes an absolute deadline: an ISO 8601 date
    and time, seconds and fractions optional, with an offset (`Z` or `+HH:MM`/`-HH:MM`), for
    example `2026-11-14T19:00:00+02:00`. The time left is `ceil((deadline - now) / 1 s)`,
    the same in every timezone. A date and time without an offset is not a deadline: no zone
    is guessed.
  - R8. A deadline already past at start, or reached while counting, shows 0:00 and holds there
    with the design's finished class (`<prefix>-done`, the hook a design's CSS uses for a short
    text); never the duration, never tomorrow. The clock never takes the graphic out.
  - R9. Every start and every tick derives the time left from the deadline, so a reload, a snap
    and a page throttled while hidden show the right time on their next tick. An Update that
    keeps the same deadline leaves the count alone; a new deadline re-arms it (today's
    signature rule), also once it has held at 0:00 on air (a finished duration or `HH:MM` count
    given a deadline counts to it too).
  - R10. An invalid value (neither `HH:MM` nor a whole deadline with an offset, or an impossible
    date such as the 31st of November) is treated as an empty field: the duration counts. That
    is the template's empty state, as a typo is today.
  - R11. `HH:MM` is unchanged: today's parse, and a time already past counts to tomorrow.
  - R12. Only the start-time field's parse changes; the duration-only clocks (game timers,
    imported designs, the countdown type) emit what they emit today. A production's graphic is
    its own copy: a rotation or countdown made before this lands keeps today's behaviour until
    its design is refreshed with Update in the production.
- Rules found by the Rules-first `/so`, before code (it agreed with corrections): R3's ownership
  of the timing (a machine timer armed at the entrance's phase can fire before the boundary), R4's
  "crossfade the runtime started" (at the midpoint no timer is armed, so liveness cannot be read
  there), and R5 joining at the boundary instead of a crossfade after a Take (AC-4). Also:
  - R13. Reload while held shows the slot a snap leaves, not the one held: the held slot is not
    persisted, as today.
  - R14. A logo added or removed on air changes `n`; the logo on screen stays until the next
    boundary, which picks `k mod n` again. Removing the logo on screen leaves its slot as today.
  - R15. The speed is read through `motionSpeed()`. Copies agree only as far as their machines'
    clocks agree (NTP is assumed); the render service's virtual clock is a wall clock too.
  - R16. A deadline count has no pause: no start-time design carries the pause group (the
    countdown type's designs count durations), so R9 has no exception today.
- Rules found after coding: the joining read records the cycle on screen and replaces the machine's
  timer in the same read, so a timer armed at a Take's own phase never fires (it would otherwise
  change the logo up to a hold early). The machine's rotating state is named `advance` and its
  first waypoint `enter`; the runtime reads only the group's armed timer and the `advance` hold.
  A deadline is anchored to its own instant (`clockAnchor`), not to "now plus the rounded seconds",
  so every page flips on the deadline's second. From the `/check` review: a crossfade that stalled across
  boundaries (drawing stopped in a hidden page while reads went on) lands on the current cycle's
  partner, not the one it was fired for; the stand-in for the machine's timer never fires by
  itself (a real one-day timer would have dipped a one-sponsor bug once a day); "already on
  screen" is compared by element, since a logo picked on air reorders the filled slots; a deadline
  that held at 0:00 on air counts to a new one at once (R9 amended), and one already past is
  finished from its start, not a tick later. Kept with a reason: the runtime reads the
  interpreter's timer table rather than a new wall-aligned timer edge in the shared interpreter,
  because that would change every template's interpreter and the frozen copies in saved ones; it
  only acts while a machine timer is armed, so GSAP's callback suppression (a scrub, a settle, a
  parked snap) still keeps it idle. From the final `/so` (grade B, one defect): a join records the cycle on screen,
  not the one the next crossfade would open, so a join in the last 250 ms before a boundary still
  makes that boundary's change. From CI: no `visibilitychange` listener (in an OGraf renderer the
  document is the host's; the 200 ms read resumes as soon as the page runs), and the factory's
  "a Take after the Out looks as the first Take did" check holds a rotation to its first Take on
  everything except its partner slots, which follow the wall clock by design (the same reason it
  already exempts the rotating ticker).
- Previous verified `main`: `b9f3660e28c5cc339dbfb82d4415ebb492ac2cef` (CI run 43268862367, the
  configured suite 43268862377).
- Revert: `git revert -m 1 <this pull request's merge commit>`. Nothing persisted changes: the
  rotation and the start-time field keep their fields, ids and machine. A graphic refreshed with
  Update while this was on main keeps the wall-clock runtime until it is refreshed again after the
  revert; a deadline written into a start-time field then reads as invalid and the duration counts.
- Decisions: the machine is unchanged and the runtime owns the beat while the machine's own timer
  is armed, because that timer already means "on air, entrance done, not held, not parked", and
  a machine change would reach every control surface. A Take keeps its logo until the next
  boundary (AC-4) rather than crossfading at once. A new cycle whose logo is already on screen
  plays no crossfade, so a one-sponsor bug no longer dips every 6.5 s. Only the start-time
  designs' clock changes; the duration clocks emit byte-identical code (the catalog emit gate
  moved 10 designs, js only: bug21 to bug24, ss05, ss07, ss10, ss11, ss13, ss18).
- Traps: Playwright's fake clock gives each srcdoc frame its own clock, offset by when the frame
  loaded while time flows; pause the clock (`pauseAt`) before building frames that must agree.
  Graphics made before this lands need Update in their production (each is its own copy).
- Evidence: `docs/work-specs/obs-scenes/evidence/phase-OS4.md`.

### OS5a: JSON source

- Rules (written before coding):
  - R1. A JSON source is a connector source (`kind: 'external'`, `config.v` 1) whose registration
    also carries `read: { everyMs }` (additive optional). With `read`, NoaCG reads the
    registration's `endpoint` itself; without it the source is today's agent-only connector. Its
    paths stay `external.<id>.<leaf>`, and its endpoint, lists, recipe and config revision keep
    their meaning. `everyMs` is clamped to 10 s at least and an hour at most; a `read` without a
    finite number is not read by NoaCG.
  - R2. The connector review offers "Read by NoaCG every N s" (on, 30 s) for an address NoaCG's
    public reader could read, only while the production's OBS scenes switch is on. A source that
    already has `read` shows and keeps its interval in the review whatever the switch. Turning the
    switch off stops nothing that already reads. With the switch off and no such source, nothing
    new shows and every journey is as today.
  - R3. One cached server read per address: the existing guarded fetch (public addresses only,
    every redirect checked, 10 s for the whole read, 256 KiB after decompression), asking for
    JSON, never sending a credential. The cache is the feed reader's shared row, keyed apart from
    a feed of the same address. A row read less than 10 s ago is served without fetching; after a
    failure the publisher's Retry-After is honoured, capped at an hour; its `max-age` does not
    lengthen the wait (the operator's interval does). One instance holds the claim and fetches;
    the others serve the row they have, or wait for the first read.
  - R4. The route is `GET /api/data/json?url=<address>` inside the existing data catch-all: public,
    with its own per-client limit (60 a minute). It answers `{ok: true, payload, fetchedAt}` or
    `{ok: false, error, fix, failingSince}` with no payload. Not JSON, over the size, cut off, not
    2xx, refused by the guard, or not yet read: a failure. No new Vercel function.
  - R5. Who reads. The production page holding the source's lease (published: the row's lease;
    unpublished: this browser's) reads at `everyMs` and renews the lease at least every 20 s.
    Another tab or page shows the holder's status and reads nothing. Published with no page holding
    the lease, the server tick reads it, at most once a minute and only when the row's last good
    read is at least `everyMs` less 15 s old. An agent claiming the source takes the same lease, so
    one of agent, page and tick reads at a time.
  - R6. A good read is one snapshot: the parsed payload is evaluated once by the shared evaluator
    (`projectSource`: identity, lists, recipe) for the paths bound at that moment, and every bound
    path whose value differs from what this source last wrote is written in one write. A path the
    payload does not carry, a value its fields cannot all hold, a path only typed fields read, or a
    recipe the build cannot use writes nothing; the line names it and the field keeps its value. An
    operator's value on a bound path holds until the source's value there changes.
  - R7. A failed, malformed, refused, oversized or late read (past the reader's timeout) writes
    nothing and the last good values hold; three missed reads in a row mark the source stale. An
    answer that arrives after Pause, Disconnect, the page closing or a handover writes nothing.
  - R8. Pause and Resume as for other sources: paused, neither page nor tick writes; Resume reads at
    once and writes only paths that changed while paused.
  - R9. The source's line shows when it was last checked (the last good read) and, separately, when
    its content last changed (the last good read whose payload differed from the read before, by a
    fingerprint of its canonical JSON), who reads it, and its interval.
  - R10. The server tick lists such sources through migration 0116 (`control_data_tick_due` also
    lists an external source with `config.v` 1 and an object `config.read`; nothing else changes).
    It is live-path and waits for a quiet window; until it applies, only open pages read them.
  - R11. The reader is generic: a read hands the parsed payload to one projection hook, so OS5b's
    adapter turns the payload into its shape before the evaluator, without a second reader.
- Rules found by the Rules-first `/so`, before code (it agreed with corrections):
  - R10 amended. The due test is in 0116's SQL, not in the tick's code: an external source is
    listed only when its `config.read.everyMs` is a number and the row's last good read
    (`status.checkedAt`) is absent or at least the clamped interval less 15 s old. A source not
    yet due is not listed, so it never takes a place in the tick's 50 from a Sheet or a feed.
  - R12. A source with `read` is NoaCG's alone: 0116 adds one refusal to
    `control_source_registration_refusal`, so an agent's claim or report for it is refused with
    `read_by_noacg` and nothing it sends is applied. The route says why. Removing `read` gives the
    source back to an agent. The review offers `read` only for a sample read the public way, never
    one an agent posted.
  - R13. Every writer of a connector configuration keeps `read`: the review keeps the stored value
    unless the operator changes it, and changing it never moves `configRevision`. A page of an
    older build that rewrites the configuration drops `read`; NoaCG then stops reading it and the
    source leaves the data indicator, which shows the change.
  - R14. A NoaCG read writes only bound paths, as text. A collection recipe's leaf (0102, written
    only by the agent's report) is not written: the review does not offer `read` for a source a
    collection recipe of the production reads, and if one is added later the line says its cards
    keep their values. A path only typed fields read is not written and the line says so (R6).
  - R15. The line reads the source's lease row (`control_source_reads`, published) or this
    browser's lease (unpublished), as for a Sheet; the agent's `production_source_snapshots` is
    not used. A NoaCG-read source is held by its own Pause, like a Sheet, not by the production's
    "Another system" Pause (spec: "as for other sources").
  - R16. The JSON route's per-client limit is 120 a minute, room for 20 sources read at the floor
    from one computer.
  - R17. The cache keeps the parsed payload as the one item of the row's `items` array (`[payload]`),
    so `feed_cache` needs no new column.
  - R18. `docs/DATA_API.md` replaces "it never scrapes a site or polls an address for you" with what
    NoaCG now reads (a public JSON address, on the source's interval above 10 s, through the guarded
    fetch and one shared read) and what it still never does (scrape a page, send a credential).
- Rules found after coding (`/check` review):
  - R3 amended. A good read's wait counts from when the reader's request arrived, less 1 s, not
    from the end of the fetch: the address is fetched at most every 9 s, and a source read every
    10 s gets a fresh read each time however long the fetch and the database took. A failure still
    waits from the fetch's end, so a Retry-After is honoured in full.
  - R12 amended. The agent is refused exactly when `config.read.everyMs` is a number, the test the
    tick's list and the page's reader use; a malformed `read` leaves the source its agent's.
  - R19. A registration NoaCG's reader cannot use is still read and holds every value, and the line
    says why, on the page and the tick alike; the tick's list carries the production's collection
    recipes so its line says what the page's says.
  - R20. A good read stamped more than a minute ahead of the database's clock (a page whose clock
    runs fast) counts as never read in the tick's due test.
  - Every refusal and failure of a JSON read is said of an address, never of a feed.
- Previous verified `main`: `bcb4d10b8773704db04e9ec9148d3782b6df1d2d` (CI run 43287863511, the
  configured suite 43287863588).
- Revert: `git revert -m 1 <this pull request's merge commit>`. Nothing persisted is renamed: a
  `read` left on a connector is ignored by the reverted build, so the source is an agent-only
  connector again for the page. Migration 0116 stays applied: its tick list still names such a
  source, and the reverted tick, which knows only Sheets and feeds, tries it as a Sheet every minute
  and fails, writing nothing but the source's failing line, and an agent is still refused it. So
  turn "Read by NoaCG" off on those sources first, or restore 0099's `control_data_tick_due` and
  0101's `control_source_registration_refusal` in a new migration.
- Decisions: the source is a connector with `read`, not a new kind, so the existing JSON review,
  recipe, lists, paths and evaluator serve it and nothing persisted changes shape; the feed kind is
  headlines only. The cache is the feed reader's row and claim with a JSON key, floor and words
  (`CachedKind`), so the guard and the one-read-per-address rule are one code path. The reader is
  the Sheet reader with a `project` hook (R11), so lease, Pause, stale and late answers are the
  ones every source already has. The tick's due test is in SQL (R10 amended). Owner questions the
  Rules-first `/so` raised and this phase decided by default: a source with `read` is NoaCG's alone
  (R12), and it is held by its own Pause, not the "Another system" Pause (R15, the spec's "as for
  other sources").
- Traps: until 0116 applies (a live-path migration, held for a quiet window), the tick does not list
  a JSON source and the line can still say closed-page reading is on; only open pages read it. A
  page of an older build that rewrites a connector's configuration drops `read` (R13). On a ticker,
  a pasted address is still read as a news feed; "Read by NoaCG" is offered on the other graphics.
- Evidence: `docs/work-specs/obs-scenes/evidence/phase-OS5a.md`.

### OS5b: Bracket adapter and current match

- Rules (written before coding):
  - B1. The adapter is a setting of a JSON source NoaCG reads: `config.adapter` (additive optional)
    is `{ v: 1, name: 'bracket', rows, fields }`. `rows` is the dotted path of the rows in the
    payload (empty: the payload itself). `fields` names, per meaning, the dotted path inside a row
    that holds it: `bracket`, `bracketTitle`, `stage`, `round`, `roundName`, `match`, `status`, and
    per side `aName`, `aRace`, `aSeed`, `aScore`, `aLeague` and the same for `b`. `aName` and
    `bName` are required; anything else may be left out. No site's field names are in the code.
    An unknown key, a path that is not dotted, or another `name` makes the adapter unusable: the
    read holds every value and the line says why. A later `v` is held read-only, never applied.
  - B2. The adapter is kept and offered only with "Read by NoaCG" (OS5a R1): turning `read` off
    in the review drops `adapter` too, so an agent's report is never read through a mapping it
    does not know. Every writer of the configuration keeps `adapter` unless the operator changes
    it, and changing it never moves `configRevision` (as OS5a R13). The review offers it only while
    the OBS scenes switch is on or the source already has it.
  - B3. Rows come as a list or as an object keyed by row number. Object keys are taken in numeric
    order; a key that is not a whole number is reported and left out; a gap between the lowest and
    the highest number is reported as a missing row, never filled in. In a list, an entry that is
    not an object is reported as an empty row. Both shapes, in the same order, give the same
    result.
  - B4. Output, under the source's prefix `<p>`, in feed order (the order each bracket, stage,
    round and match first appears): `<p>.brackets.<i>` `{ id, title, stages.<k> }`, a stage
    `{ id, rounds.<r> }`, a round `{ id, name, matches.<m> }`, a match `{ id, status, a, b }`, a
    side `{ name, race, seed, score }`; `<p>.players.<j>` `{ name, race, seed, league }`;
    `<p>.ties.<bracket key>`; `<p>.current`. Indexes are path segments (`brackets.0`), since a
    bound path is dotted keys. A grouping field left out of the mapping puts every row in one
    group whose id is `1`; a round with no name field is named by its id; a bracket with no title
    field is titled by its id.
  - B5. A match's id is its `match` field as text. With no `match` field mapped it is
    `<bracket>:<stage>:<round>:<n>`, n counting from 1 within its round, so it is stable while the
    rows keep their order. A row with a mapped grouping or match field that is empty is reported
    and left out.
  - B6. `status` is `pending`, `live` or `done` when the feed's value is that word (any case,
    trimmed), else `unknown`. `score` is a finite number, or a numeric string as its number, else
    `null`; never a silent zero. No winner is inferred. Name, race, seed and league are the feed's
    scalar, else `null`.
  - B7. Duplicates are reported, not guessed: a second row with an existing match id and the same
    mapped values is left out; one with other values makes that match keep its values (its slot
    stays, with its id only, so later indexes do not move) and its bracket's tie lines keep theirs.
  - B8. `players` lists each named side once, in first appearance, with race, seed and league
    from the rows; a player given two different values for one of them gets `null` there, reported.
  - B9. `<p>.ties.<bracket key>`: one line per match in feed order, "Round name | A name A score |
    B name B score", with "—" for an unknown score, as the Bracket type takes them; a `|` or a line
    break inside a value becomes a space. The key is the bracket id with every run of characters
    other than letters, digits, `_` and `-` made one `-` (empty: the bracket's index); a second
    bracket with the same key is reported and left out of `ties`.
  - B10. An unknown value (`null`) writes empty text to a bound field, so a field never shows the
    previous match's value as this one's; a tie line shows "—".
  - B11. The current match is the operator's: `<p>.currentMatchId` in the production's tree,
    written by the operator (the source line's picker, or a data write). No read writes it, and a
    binding to it is never reported missing.
  - B12. `<p>.current` is `{ matchId, round, a, b, held }` (round: the round's name). The reader
    remembers, beside its snapshot under a key no path can take, the pick it last resolved and the
    two side names it resolved with. At each read of an open page:
    - no pick (absent or empty): nothing under `current` is written, and the memory forgets the
      match (B12 after coding);
    - a pick that differs from the memory, found: every `current` value is written, `held` false,
      and the memory becomes the pick and its two names;
    - the same pick, found, with the same names: every `current` value is written, `held` false; a
      remembered name that was empty takes the match's name (a slot filled later is not a change);
    - the pick not found (gone, or kept by B7), or found with a remembered non-empty name changed:
      `held` is written true and nothing else under `current`, so every field keeps its last value;
      the memory stays; the line says which.
    So `current` moves only when the operator picks another match. Picking it again after a hold
    needs another pick first.
  - B13. The server tick does not know the pick: it writes nothing under `current` and keeps the
    memory, so `current` holds until a page reads. Brackets, players and ties are written by page
    and tick alike. (Until 0116 applies the tick reads no JSON source at all.)
  - B14. A pick on the source's line writes `<p>.currentMatchId` and asks the reader to read at
    once, so the pick shows within one read. With the OBS scenes switch off and no adapter set,
    nothing new shows.
  - B15. The adapter's report goes on the source's line, at most five lines and a count of the
    rest. The read is still one snapshot (OS5a R6), checked and changed as before.
- Rules found by the Rules-first `/so` (agreed with corrections), before code:
  - B1 amended. The adapter is applied inside `projectJson`, reading `config.adapter` through
    `readExternalRegistration`, so the page and the tick share it with no change under `api/`.
  - B3/B5 amended. An empty, unnumbered, missing or left-out row takes no place in a round's count.
  - B5 amended. With no `match` field mapped, ids are positional: the line says so, and there is no
    current match (the picker is not offered and `current` is not written), since an inserted row
    would move a pick onto another match.
  - B7 amended. A conflicting match writes only its id; its other paths write nothing (a field keeps
    what it showed, or its default on a first read); its bracket's tie lines write nothing.
  - B9 amended. In a bracket with more than one stage, each tie line's round is prefixed with its
    stage's id, since the Bracket type groups rounds by name.
  - B12 amended. The memory is carried by the reader with the snapshot (`project(payload,
    previous)`; `projectedState` keeps keys starting `#`), so a handover and the published row pass
    it on. With a pick and no memory (a fresh tree, or an older build held the lease), the
    snapshot's `current.matchId`, `current.a.name` and `current.b.name` stand in when they are
    bound and name the pick; otherwise the match is adopted.
  - B14 amended. A pick in any tab only writes `currentMatchId`; the tab holding the lease applies it
    at once, any other reader on its next read. A read computed before a pick lands as if read just
    before it; the next read applies the pick. A pick written as data waits for a page.
  - Not taken: blanking a bound bracket, player or tie path the new shape no longer has. OS5a R6
    and `docs/DATA_API.md` keep the last good value of a path a read does not carry, so a cut-off
    feed never blanks air; the line names each such path.
  - Not taken: the tick resolving `current` from the memory. Its projection hook is built in
    `api/_lib/dataTick.ts`, outside this phase, and passes no snapshot; B13 stands (the tick holds
    `current`, `held` included).
  - Decided by default: after a hold, picking the same match again needs another pick, or the
    picker's "None", first (the pick must change for `current` to move).
- Rules found after coding (`/check` review):
  - B12 after coding. With no pick, the memory keeps an empty match id instead of going, so the
    bound `current` paths never stand in for it: picking "None" and then the held match again
    takes the match as it is now.
  - B14 after coding. A pick is written onto the newest tree, so a value written since the last
    render keeps it. Published, a page that cannot write the production's data (no data key yet)
    refuses the pick and says so, rather than keeping it in this browser.
  - B16. The picker offers the matches of the last read that could say (at most 200, and the line
    says when there are more); a read the adapter cannot use keeps the last offer, and a source
    without a match id or an adapter offers none.
  - B2 after coding. Turning "Read by NoaCG" off in the review clears the picks made against the
    bracket's shape. A stored setting this build cannot edit is shown with its problem and kept;
    a later version cannot be turned off here, and Connect is refused while the bracket cannot
    be read.
- Rules found after coding (PR review):
  - B3 after coding. A gap in the row numbers is one line ("rows 4 to 9 are missing"), never one
    line per number, and a row number beyond a safe whole number counts as no row number.
  - B14 after review. A pick taken on a page marks its source, and that page's next read of it
    takes the pick as new, whatever the memory says. So "None" then the held match recovers
    even when both picks land before a read. A pick from a tab that does not hold the lease
    still needs a read between the two.
  - B16 after coding. While a pick is set, the picker stays on the line with it and "none", even
    when the last read offers no matches.
- Rules added after the first run on a real feed (coordinator, 2026-11-12; additive, so a setting
  without the new keys reads exactly as before and no field changes meaning):
  - B17. `rowsAre: 'sides'`: a row is one side of a match, with its own `name`, `race`, `seed`,
    `score` and `league` fields beside the grouping ones; `match` and `name` are required. Rows
    sharing a match id, in feed order, are side a then side b. One row: side b is unknown, and the
    line says "match X has one side in the rows". Three or more rows, or two sides that disagree
    about bracket, stage, round or status: the match keeps its values (as B7) and the line says so.
  - B18. A `*` segment in `rows` gathers every entry of a list (by position, from 1) or of an
    object keyed by number (in numeric order), at any level, in feed order. The leaves are read as
    B3 says. A branch without the next key, or with no entries, is said, never filled in. Rows
    found nowhere: the read holds every value (as a missing rows path does).
  - B19. `bracketLevel: k` takes the bracket id from the entry's place at the k-th `*` of `rows`;
    it and a `bracket` field are never set together.
  - B20. `players: { at, fields: { name, race?, seed?, league? } }` reads a section (a list, or an
    object of entries by any key) beside the rows and joins it to each side by name, ignoring case.
    It fills `seed` where the side has none, and `race` where the side has none. A side name it
    does not hold is said once. `<p>.players` is the section's entries in order, when it is
    mapped. A section that is not there is said, and the sides keep what the rows give.
  - The review offers each of these from the sample: rows found through `*`, "Each row is", the
    bracket from "Its place in" a gathered level, and a players list with its fields.
  - B21 (found while adding these). A match's own paths are 10 keys deep
    (`brackets.i.stages.k.rounds.r.matches.m.a.name`), past the 8 a recipe path or the review's
    offers reach. So the review offers a bracket source's shape 12 keys deep (up to 1000 values),
    and connecting a field to an adapter's leaf writes no recipe output: the read reaches the leaf
    by its own path, at any depth. The recipe's limit is unchanged.
  - B4 amended (found while adding these). An index segment is `_0`, `_1`, ... and a tie key of
    digits alone takes a `_` in front: the production tree reads a segment of digits alone as an
    array index, which no source write can address, so `brackets.0...` could never be written.
    So `<p>.brackets._i.stages._k.rounds._r.matches._m`, `<p>.players._j`, `<p>.ties.<key>`.
    Every path the shape gives is checked to be writable.
  - Found by the `/check` review of these: the same side row twice is one side, said and left out
    (never a match against itself); a round name or title given on one side only is the match's,
    and does not hold it (B17 compares bracket, stage, round and status); an empty level at a `*`
    is said (B18); the review steps through a level as the reader does (numbered keys, others said)
    and keeps a stored players list editable when the sample offers none; a bracket source is never
    marked "needs repair" for paths its adapter makes. Side rows pair by match id across the whole
    answer, since match ids are unique across it and the current match is picked by id.
  - Found by the PR review on 80345806: a side row's place (B19) is part of what it says, so the
    same side rows under two brackets are not repeats; the match has four rows and keeps its
    values (B17).
  - Found by the full `/so` on 80345806 (graded B, one blocking finding):
    - B20 amended. A mapped players section that a read cannot give leaves `<p>.players` out of
      the output, so its bound paths keep their values (OS5a R6). Before, it fell back to the
      players found in the rows, and a bound `players._j` could show someone else.
    - An entry of the section with no name keeps its place, said. A name given twice in another
      case with other values fills nothing for that name, said (as B8).
    - A side row left out takes its match's other rows with it, said.
    - Tie lines are built as own keys. A bracket whose tie key is `__proto__` is said and has
      no tie lines: the tree's merge drops that key without a word (found by the full `/so` on
      9f0d29dc, graded A). Every path the shape gives is now checked through that merge.
    - Not taken, recorded: side rows pair by match id across the whole answer, as decided
      above.
  - B22 (coordinator, after the second run on the real feed). `roundOrder: 'ascending' |
    'descending'` puts each stage's rounds in order of their id as a number; a round whose id is
    not a number keeps its feed place after the numbered ones. Absent, rounds keep the feed's order
    as before. A feed keyed by round number ("round of 8, 4, 2") loses its own order when its JSON is
    read (integer-like keys come first, ascending), so without it the final would draw first.
    Tie lines, the shape and the picker follow the order. The review offers it as "Round order".
- Previous verified `main`: `97ba82596a7fcfcf6a424140648a5f8ad13aab92` (CI 43307568831, configured
  suite 43307568943).
- Revert: `git revert -m 1 <this pull request's merge commit>`. Nothing persisted is renamed and no
  migration: an `adapter` left on a source is ignored by the reverted build, which then reads the
  raw payload, so its bracket paths say "not in the JSON" and keep their values; turn "Read as a
  bracket" off or reconnect first. A `#bracket.current` key left in a source's snapshot is ignored.
  `currentMatchId` stays in the tree as an unbound value.
- Decisions: the adapter is a setting on the connector (`config.adapter`) beside `read`, not a new
  source kind, so the review, recipe, lease and evaluator are OS5a's. Its output uses index
  segments (`brackets.0`), since bound paths are dotted keys. The reader's memory of the current
  match rides in the snapshot under a `#` key, so the published row carries it with no migration.
  The picker is on the source's line in the data panel, from the matches of the last good read
  (the reader's status, shared by every tab); the Live dock (OS6) can reuse it. Defaults decided
  here, not by the spec: no current match without a mapped match id (B5 amended); after a hold,
  the pick must change (another match, or "none") before `current` moves again; a status word other
  than pending, live or done is `unknown`, with no mapping of the feed's own words.
- Traps: the server tick holds `current` (B13) and passes no snapshot to the projection, because its
  hook is built in `api/_lib/dataTick.ts`; `held` therefore updates only while a page reads. Until
  0116 applies the tick reads no JSON source anyway. A pick from a tab that does not hold the lease
  shows at the holder's next read, up to the interval. A pick is an owner write to the tree
  (`setLiveData`), the same road as editing a value on the Data tab.
- Evidence: `docs/work-specs/obs-scenes/evidence/phase-OS5b.md`.

### OS1b: Take, Out and copies per scene

- Rules (written before coding):
  - C1. A scene graphic is a pool graphic that a graphic or picture cue of a scene uses, while the
    production's switch is on (`obsScenesOf`). With the switch off there is none, and nothing in
    this phase changes anything.
  - C2. After every write this build makes to a production record whose switch is on, each pool
    graphic is used by at most one scene. A graphic used by several stays with one: the scene that
    used it before the write, if it still does, else the first of them in rundown order. Each
    other scene's cues of it point at that scene's copy of it.
  - C3. A scene's copy of a graphic is a pool graphic that scene already uses and that was copied
    from it (`sceneCopyOf`, additive optional, the source's pool id). When the scene has none, the
    same write makes one, so two cues of one graphic in one scene share one copy, whichever write
    added them.
  - C4. A new copy: a new pool id; the name "<name> · <scene>", or "<name> · <scene> 2", 3 and on
    when that name is taken; the source's design, type, library link, sounds and placement
    (`adjust`) at the moment of copying, and from then on its own; the next free layer, so it never
    replaces another graphic on air; the source's bindings under its own name, and the source's
    control arrangement when the profile is one this build reads. It starts off air.
  - C5. Cues outside every scene never cause a copy and never move to one. A graphic used both by
    a scene and outside every scene stays one graphic, and it is that scene's.
  - C6. Nothing merges a copy back or deletes it: a cue that leaves its scene, a folder no longer a
    scene, or the switch turned off keeps the copy and the cue's pointer. Undo restores the
    rundown, graphics included, as it was before the write that made the copy.
  - C7. Take and Out of a scene graphic's cue act on its own pool graphic, so they change only the
    link of the scene that holds it (OS1a R6 reads every other graphic past). The ordinary
    production link shows every graphic, as today.
  - C8. Reloading a scene link restores each of its graphics as on or off, from its reports and
    the log, as OS1a R7 does.
  - C9. All out, from any door (the header, a key, Companion), clears what it clears today except
    the scene graphics of the production as this page holds it: they are not in its targets from
    the page's own list, from what the server's heads say, or in the fallback of every graphic. A
    scene graphic on air stays on air, on its scene link and on the ordinary link; one off stays
    off. With the switch off, All out is exactly today's.
  - C10. A cue that a write repoints while its graphic is on air does not move air: the source
    stays on air until its own Out (from its scene's cue), and the copy starts off air.
- Rules found by the Rules-first `/so`, before code (it agreed with corrections):
  - C2 covers the writes of the record's write envelope (`patchShowChecked`): every write that
    moves, adds, pastes, duplicates or repoints a cue, makes, renames or removes a folder, flags a
    scene, or turns the switch on. Adding a pool graphic (its new cue is in no folder), a layer
    change, a sync from another device or a team merge do not run it; the record they leave is
    put in order by its next envelope write. Undo puts back a rundown that was already in order.
  - C3 amended: a copy's pool id is derived from (source id, scene id, n), so the envelope's
    rebased pass and two devices making the same copy meet one id, and a team merge keeps one
    copy. The scene's copy is the first of those ids that is free, or that a copy of the same
    source holds while no other scene uses it, so a copy left behind under C6 is taken up again.
  - C10 replaced: a write that would move a cue this page has on air to a copy is refused whole,
    with "Take "<cue>" off air before you put its graphic in a second OBS scene." Nothing of the
    write lands. The production page tells the record which cues it has on air.
  - C11. A cue saved by a newer version (a selection or typed data this build cannot read) is never
    moved to a copy: the write is refused whole, in words that say why.
  - C12. The production's own picture graphic (the pool's picture graphic with no library link) is
    never copied: its pictures would be published twice, against the published row's limit, and a
    new upload would reach one of the two only. Its cues in two scenes share one graphic and one
    air state, as OS1a R12 said. Sent to the owner through the coordinator; this is the default
    until answered.
  - C4 amended: re-adding a library graphic replaces the original pool entry, never a scene copy
    that shares its link. A copy keeps its link and is updated from the library by its own Update,
    as every pool graphic is.
- Not in this phase, with reasons: "making a scene, or adding a graphic to one, takes it" (the
  behaviour section; OS1a R11 left joining on air to OS1b) is not in AC-2 or AC-3, and a Take made
  by an edit would air the graphic on the ordinary link too and before the scene link has the
  publish that names it. It is filed as #2489 for the coordinator to place. The offline
  controller export and the Bridge's offline clear keep today's All out: neither knows scenes.
- Rules found after coding, by the `/check` review: a record that came shared (a sync, an older
  build) leaves a held cue the write did not touch where it is, so an unrelated edit still lands,
  and only a held cue the write itself moved refuses it (C10 amended); a copy's layer is free among
  the graphics and the server's templates, as a new template's is (C4); the on-air guard reads the
  session's air part, not the paced copy the page draws, so a Take that just landed counts; All
  out leaves a scene folder's run and One-by-one step as they are, not only its graphics (C9); a
  copy left behind is taken up again only when no cue at all uses it (C5); with the original gone,
  re-adding the library graphic adds it again rather than replacing one scene's copy.
- Found by the PR review (on 7abb850b), both answered:
  - C11 amended: a cue with a live candidate (a selection) is never moved to a copy either, and the
    write is refused in words: its selection names a recipe made for its graphic, which the copy's
    gate would refuse, and a write may not change recipes (`selectionFrozen`).
  - C2 covers a team save's merge too: two teammates can each put a cue of a graphic that was in
    no scene into a different scene, and the merge joins them. The save's retry separates the merged
    document against the teammate's saved one before it goes up; a held cue there stays as it is,
    since nobody pressed anything to refuse, and the next write moves it once it is free.
- Not changed, with reasons:
  - All out reads the scenes of the record this page holds, not also the published payload's: the
    page holds no published payload, and an edit from another device reaches this page's record
    through its sync. A scene graphic another device published a moment ago, before its record
    arrives here, is cleared by All out, as any hand-taken graphic is.
  - A copy's name is free in the pool only, not among library names. A copy normally keeps its
    library link, which a publish follows before any name; a link-less copy is matched by name as
    every link-less pool graphic already is.
  - The offline controller export and the Bridge's offline clear keep today's All out (no scenes
    there), and the offline clear only unloads a renderer from a CasparCG slot.
  - "Adding a graphic to a scene takes it" is not built (see above): sent to the coordinator as a
    placement question with C12.
- Previous verified `main`: `f528683c8a950ac935679241be4860d643bf8487` (CI run 43408100165,
  configured suite 43408100325).
- Revert: `git revert -m 1 <this pull request's merge commit>`. Nothing persisted is renamed and no
  migration. A `sceneCopyOf` left on a pool graphic is ignored by the reverted build, and a scene
  copy stays an ordinary pool graphic with its cues, so nothing is lost; All out then clears scene
  graphics again.
- Decisions: the separation runs inside the record's write envelope (`patchShowChecked`), after
  the write's own change and beside the frozen checks, so every door that adds a cue to a scene (drag, menu, paste, duplicate,
  flag, switch) gets it without a call of its own, the rebased pass included. A copy is a whole pool
  graphic, not a new kind of reference, so publish, export, Update and the output treat it as any
  other. The copy sits after its source in the pool, named "<name> · <scene>". Each open production
  page tells the model which of its cues are on air, by production id, read only when a cue would
  move. A copy's id is the shared `deterministicUuid` of (source, scene, n).
- Traps: duplicating the only cue of a folder copies the folder ("<folder> copy"), and the copied
  folder is not a scene. An unpublished production's Take shows `UP` (`up-here`), not ON AIR. The
  export names a copy's folder by its slug (`hairline_desk`).
- Evidence: `docs/work-specs/obs-scenes/evidence/phase-OS1b.md`.

