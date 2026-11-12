# OBS scenes

Status: agreed with the owner on 2026-11-12, after three independent second opinions. Plan name
`obs-scenes`. Not built.

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
not. Nothing new appears for users who do not switch OBS scenes on.

## Evidence

- `docs/OBS_ON_A_REAL_HOST.md` §3, §5, §10, §11: at OBS's default page permission a browser
  source receives `obsSourceVisibleChanged` (preview or program), `obsSourceActiveChanged`
  (program) and `obsSceneChanged`; `getCurrentScene` answers `null`; no event at load; docks get
  no OBS events but share storage and BroadcastChannel with sources on the same address; one
  stale frame of the old picture on every tested Cut at 30 fps with hardware acceleration.
- `src/output/main.ts`, `src/output/stage.ts`: `/output` builds every graphic of the production,
  keys on-air state and reports by graphic name, and needs the backend to boot; a loaded page
  keeps its state when the network drops (`docs/CLOUD_PLAYOUT.md` §3).
- `src/control/livePath.ts` `readLiveEntry`: at most 16 expected outputs.
- `src/model/adjust.ts`: placement and nudge per graphic and per cue.
- `src/templates/shared/clock.ts`: a target time is `HH:MM` only, and a past time means
  tomorrow. `src/templates/cornerBug/bugRuntimes.ts`: the sponsor rotation index is a per-page
  timer from zero.
- `api/_lib/feedFetch.ts`, `api/data/[...path].ts` (`as=json`): a guarded one-off JSON sample
  read (public addresses only, redirects checked, 256 KiB) and the feed reader's 5-minute floor.
  `docs/DATA_API.md`: "NoaCG never scrapes a site or polls an address for you".
- `companion-module/` (0.3.0): Take and Select keys per cue and per folder, answered by one open
  production page.
- `src/templates/types/competitionBoards.ts`: the Bracket type is single elimination only.

## Owner decisions (2026-11-11 and 2026-11-12)

- **D1. A scene is a rundown folder** marked as an OBS scene, with its own output link pasted once
  into a browser source in the matching OBS scene. An "OBS scenes" switch sits beside the vMix and
  CasparCG switches; nothing about scenes shows until it is on. No Bridge, no OBS plugin, and no
  obs-websocket on the air path. The agreed `docs/work-specs/bridge-obs-adapter/spec.md` is parked.
- **D2. Scene graphics are settled and always on.** No entrance animation on program in this plan.
  They show in OBS preview and program alike; OBS's own cut, fade or stinger carries them.
- **D3. On and off is the cue's ordinary Take and Out.** No second visibility flag. A graphic used
  in several scenes gets one pool copy per scene, bound to the same data paths, each with its own
  placement. Keying renderer state by cue is later work.
- **D4. The bracket is read by NoaCG's server.** A public JSON address is read on a schedule set
  per source, above a floor of 10 s, through the existing guarded fetch, with one shared cached
  read. This replaces the "never polls an address" line in `docs/DATA_API.md` for public JSON
  sources with these guards.
- **D5. One Live dock** (runs the production control session and answers Companion) plus an
  optional Messages dock.
- **D6. Event graphics are made outside this plan**, through Claude Code with the NoaCG plugin, as
  a user would.

## Behaviour

### Scenes

- A folder marked as an OBS scene is a scene. Its cues are its graphics. Adding a graphic that is
  already in another scene makes a pool copy named "<name> · <scene>", with the same bindings.
- Making a scene, or adding a graphic to one, takes it: it is on air in that scene's link until
  the operator takes it out. Take and Out work from the rundown, the Live dock and Companion keys.
- A scene graphic is drawn settled. A change that arrives while the scene is not shown is snapped,
  never animated.
- A template's empty text draws nothing. Data never sends show or hide commands.
- All out clears hand-taken cues only, never scene graphics.

### The scene link

- `/output?production=<slug>&scene=<sceneId>` builds only that scene's graphics. An unknown
  scene id draws nothing and reports itself as unknown. It never falls back to the whole
  production.
- It recovers its scene's state on reload like `/output` does today.
- Its presence report adds: scene id, loaded and ready, and from OBS events, whether it is in
  preview or on program, plus the OBS scene name it was on program in last.

### Monitoring

- Automatic: loaded and ready, connected, not loaded, loaded twice, in preview, on program.
- By walk-through: "seen in OBS scene <name>" ticks the first time a link goes on program after
  OBS switched to that scene. Until then the row says "not yet seen", which is not an error.
- The playout panel shows one row per scene under the OBS scenes switch. Playout settings gets an
  OBS scenes section: scenes, their graphics, a copy button per link and "Copy all links".
- The 16-output limit fits a production of this size (12 scenes plus a regular output and docks);
  a check that refuses more than 16 says so in words.

### Clocks

- The sponsor rotator picks its logo from the wall clock, so every copy shows the same logo at the
  same moment, and a reload continues the cycle.
- A countdown can count to an absolute deadline: a full date and time with its offset. It shows
  the time left, holds at zero (optionally showing a short text), survives reload, and never
  cuts anything. `HH:MM` targets keep working as today.
- "In N minutes" is computed by the caller (the Live dock, or Companion's own time functions) and
  written as a full time, so writes stay absolute (`docs/DATA_API.md`).

### JSON source and current match

- A production can add a public JSON address as a source, with an interval it chooses (floor
  10 s). The server reads it through the guarded fetch, caches one read for every reader, and the
  open production page keeps the reading lease the way the sheet and feed readers do.
- A read is applied through the existing source evaluator. A failed or malformed read writes
  nothing: the last good values hold. The source shows when it was last checked and, separately,
  when its content last changed.
- A source can use a named adapter. The first is a bracket adapter: a pure module that turns
  rows given as a list or as an object keyed by row number into ordered brackets, rounds and
  matches with ids, players with seed and other fields, and scores as numbers or unknown (never a
  silent zero). Fixtures are synthetic.
- The current match is an operator-owned value. A read never changes it. Its match's players and
  scores feed bound graphics. If the match disappears from the feed, the value holds and is
  flagged.

### Docks

- The Live dock (`/dock`, compact, about 300 px wide) runs the production control session and
  answers Companion. It shows the scene health line, the program scene's graphics with Take and
  Out (falling back to a scene the operator picked when OBS state is unknown), the current match
  picker, the break deadline with "In 2 min", "In 5 min" and "Set", and source freshness. Its
  controls do not move when the program scene changes.
- The Messages dock reuses the moderation list in a compact form: Approve, Reject, On air,
  Off air.

### Fallback

- Per scene, NoaCG exports its graphics as a local package (HTML overlays and PNG stills) for a
  hidden OBS group, used when the internet is down and a source must reload.
- `docs/` gets an OBS scenes guide: browser source settings (1920×1080, 60 fps, "Shutdown source
  when not visible" off, "Refresh browser when scene becomes active" off), the build-up
  walk-through, the fallback group, and what each failure needs.

## Acceptance criteria

### AC-1: A scene link builds only its scene

A scene link builds only its scene's graphics: a production with three scenes of two graphics each builds two graphics per link. An unknown scene id builds none.

### AC-2: Take and Out per scene graphic

Take and Out of a scene graphic change only that scene's link. Reloading the link restores the same on and off state. All out leaves scene graphics on air.

### AC-3: Pool copies per scene

Adding a graphic to a second scene makes a named pool copy with the same bindings and its own placement. A placement change in one scene moves nothing in the other.

### AC-4: Settled drawing

Scene graphics are drawn settled. A change while hidden is applied without animation.

### AC-5: Nothing changes with the switch off

With the OBS scenes switch off, the production page, playout panel and settings look and behave as today (existing journeys unchanged).

### AC-6: Scene monitoring and settings

The playout panel and settings show each scene's link and its state: loaded, loaded twice, not loaded, connected, preview, program, and "seen in OBS scene" after a walk-through, driven by OBS's own events in a test page.

### AC-7: Wall-clock sponsor rotation

The sponsor rotator shows the same logo in two pages loaded at different times, and continues the cycle after a reload.

### AC-8: Absolute deadline countdown

A countdown given an absolute deadline shows the right time left across a reload, holds at zero, and a deadline in the past shows zero, never tomorrow. `HH:MM` behaves as before.

### AC-9: Scheduled JSON source

A JSON source reads at its set interval (never under 10 s), one cached server read serves every reader, a failed or malformed read writes nothing, and checked and changed times are shown. The guards of the feed route hold (private addresses refused, redirects checked, size limit).

### AC-10: Bracket adapter and current match

The bracket adapter turns both row shapes into the same ordered result, keeps unknown scores unknown, and is covered by synthetic fixtures. The current match holds across reads and is flagged when its match disappears.

### AC-11: The Live dock

The Live dock answers Companion, Takes and Outs the program scene's graphics, sets the break deadline as a full time, and picks the current match, at 300 px wide.

### AC-12: Fallback export

The fallback export produces, per scene, files that show its graphics in a browser source with no network.

### AC-13: First laptop test

Owner phase, on the owner's laptop. With placeholder graphics, every scene's source loaded, the game capture, cameras and encoding running, 20 minutes of cutting stay free of rendering and encoding lag in OBS's Stats dock. The program recording at 60 fps shows no old frame on Cut, Fade or stinger in Studio Mode, and logs when a source turns active against the stinger's cut point.

### AC-14: Owner rehearsal

Owner phase, on the owner's laptop. The full rehearsal: every scene walked through, the dock and Companion keys used, and each failure drill recovered by the owner alone: network off and a source refreshed (fallback group), a source killed, OBS restarted, the Stream Deck unplugged.

## Phases

Each phase is one pull request, runs `/check` and lands with `/queue-merge`. Phases that touch
`src/output/` build on the live-publishing run's landed changes to the output page; they rebase on
it rather than working around it. Evidence files are `evidence/phase-osN.md`.

1. **OS1. The scene link** (AC-1, AC-2, AC-3, AC-4, AC-5). Mark a folder as an OBS scene, the scene
   link that builds only its scene's graphics, settled drawing, Take and Out per scene graphic,
   pool copies per scene, All out skipping scene graphics, the OBS scenes switch with no other UI.
   Node tests for the scene model; one journey extending the playout journey for a two-scene
   production.
2. **OS2. First laptop test** (AC-13). Owner phase, `OW:` the owner's laptop with OBS. The builder
   of OS1 leaves a placeholder production and a test checklist.
3. **OS3. Monitoring and settings** (AC-6, AC-12). Scene rows, the walk-through tick, the settings
   section, the fallback export and the OBS scenes guide in `docs/`.
4. **OS4. Clocks** (AC-7, AC-8). Wall-clock sponsor rotation and absolute deadlines.
5. **OS5. JSON source, bracket adapter and current match** (AC-9, AC-10). Includes the
   `docs/DATA_API.md` change of D4.
6. **OS6. The Live dock and the Messages dock** (AC-11). Includes Companion keys for scene
   graphics end to end.
7. **OS7. Owner rehearsal** (AC-14). Owner phase, `OW:` the owner's laptop with OBS, a Stream
   Deck and Companion.

## Later (not in this plan)

Entrance animations on program, renderer state keyed by cue, one shared connection for all OBS
pages, a read-only OBS check through obs-websocket and one-click source creation, a live OBS
picture under placement, a general JSON mapping screen, live data stingers.

## Phase notes
