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
- **D9. The operator takes scenes through OBS Studio Mode preview, with a short fade (100 ms or
  more) as the default transition,** so a changed graphic is drawn in preview before it reaches
  program.

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
its match disappears or changes players, and moves only when the operator picks another. Covered
by synthetic fixtures.

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
  old frame on the first two. The direct Cut is recorded for information.
- The stinger's start, cut point and the source's "on program" event are logged ten times, for
  information.
- Sign-in to NoaCG inside a Custom Browser Dock works.
- A load failure on the laptop is repeated on the show PC before any decision, because that PC is
  stronger.

### AC-14: Owner rehearsal

Owner phase, on the owner's laptop, with the receipt template in the OS7 hand-over, one pass or
fail line each: every scene walked through and its row ticked; the dock and the Companion keys
used; network off and a source refreshed, then the fallback group shown; a source killed and
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
5. **OS5b. Bracket adapter and current match** (AC-10; **Risky**: state rules). Its checker also
   runs the adapter on the owner's private sample and reports only pass or fail.
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
