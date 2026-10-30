# H0.1 laptop checks: Companion on Windows, press to air, and the players (row 2)

The laptop helper's checks on H0.1's merge `995272d56` (spec.md §9.1, non-gating), run on
2026-10-23 on the owner's Windows 10 laptop: hardware-panel AC-11 (the isolated Companion run,
timed), AC-8 (press to first frame) and AC-12 (CasparCG, OBS and vMix). The physical deck and a
person's timed walk are H0.2.

## Setup

- **App:** `995272d56` served by `npm run dev:worktree`, against **noacg-staging** (the separate
  free test project, never production) with a throwaway account made for this run and deleted
  after it; its published productions went with it (`control_shows.owner_id ... on delete
  cascade`). AC-8 asks for "a preview branch from this laptop"; staging is the same kind of hosted
  Supabase and needed no paid branch, but it is not the same project as October's branch.
- **Module:** `yarn package` of `companion-module/` at that SHA, `noacg-studio-0.1.2.tgz`.
- **Companion:** 5.0.6, the installed one (H0.1's cloud walk used 5.1.0), run from a scratch copy
  of its `resources` with the built-in Stream Deck and X-keys surface modules removed (its log:
  "could not be loaded, unknown module"), an empty `--config-dir` per run, admin on
  127.0.0.1:18010. It could not open the owner's deck; the owner's Stream Deck app kept running
  and was not touched.
- **Driver:** Playwright through Companion's admin UI, following only the module's `HELP.md`;
  presses through Companion's HTTP API (`POST /api/location/1/1/1/press`), which runs a key
  exactly as a surface does. The NoaCG address field pointed at the local app, as in October.
- **Production:** a House Scorebug in two cues, Anna and Ben, published, open on its production
  page.

## AC-11: the guide on Windows, timed

Seconds from Companion's first screen, final run:

| s | Step | Seen |
|---|---|---|
| 2.5, 3.3 | Companion's first-run windows | "Welcome to Companion" and "What's New in Companion" closed |
| 4.5 | Install: **Modules**, **Import module package**, the file | NoaCG listed |
| 5.1 | 1: **Setup**, **Panel**, **Pair a panel** | a code `XXXX-XXXX` |
| 15.8 | 2: **Connections**, search, **Add**, **Add**; code, name, address, **Save** | |
| 17.2 | | the panel listed on the page as "Laptop walk deck" |
| 17.3 | 3: the production page answers by itself | "This page answers the panel." |
| 29.4 | 4: **Buttons**, **Presets**, **NoaCG** (19 presets), **Show control**, TAKE onto 1/1 | the preset read "TAKE Ben" from the page's state |
| 29.7 | press 1/1 | the page: "on air: ● Ben", the module's `last_press` "Done" |
| 31.6 | press 1/1 again, 1.5 s later | "nothing on air" |

About 30 s of machine time from first screen to a working Take and Out key, with every step in the
guide's own words on Companion 5.0.6 (the guide names 5.1's words; none differed on the path
walked). Two things a script needs and a person does not: the Import control is not a plain button,
and Companion's drag and drop needs a stepwise mouse drag. A second press sent the instant the first
one landed (no gap) did not take Ben off within 5 s in one early run; with a 1.5 s gap it always
did. Not investigated further.

## AC-8: press to first frame

Research §6.1's method: an output page in a headless Chromium on this laptop, a watcher inside the
graphic's frame stamping the first animation frame in which `.scoreboard-box`'s effective opacity
rises above 0.05, a press stamped just before Companion's HTTP press, same machine clock. 10 presses
each, the graphic taken off and settled between them. The hosted control page answered the panel
(reconciliation 2026-10-21: AC-8 is measured there); that page has no keyboard verbs at this
revision, so the keyboard reference is SPACE on the production page, as in October.

| Route | p50 | min | worst | October (`companion-end-to-end.md`) |
|---|---|---|---|---|
| Companion key, module, relay, hosted control page | **243 ms** | 211 ms | 288 ms | 168 ms |
| Keyboard SPACE on the production page | 156 ms | 144 ms | 161 ms | 115 ms |

Earlier runs the same evening on the same setup gave 218, 229 and 241 ms through the hosted page,
and 236 ms with the production page answering. **AC-8's 192 ms is not met on this setup.** It is
not attributed: the keyboard path, which shares the backend and the machine but not the module or
the relay, is 41 ms slower than in October too, the backend is a different project (staging, free
tier) and the machine had 0.4 to 2.4 GB free with the owner's applications open. The module and
relay's own share is about 87 ms against October's 53. Reported on #1613 for the coordinator.

## AC-12: one relayed Take and Out on each player

The production's output URL loaded on each player; each press is the Companion key through the
module, the relay and the hosted page. Boxes are where each player's own capture is opaque (alpha
above 200 and not black), one throwaway capture before each measured one.

| Player | Version | Loaded through | Before | After press 1 (`on_air` "Ben") | After press 2 (`on_air` empty) |
|---|---|---|---|---|---|
| CasparCG | 2.5.0 (69e8ad5 Stable) | `PLAY 1-20 [HTML]`, scratch config, AMCP on 5350 | nothing opaque | 465-1454 x 86-182 of 1920x1080 | nothing opaque |
| OBS | 32.2.1, obs-websocket 5.7.4 | browser source in a new scene collection | nothing opaque | 232-727 x 43-91 of 960x540 | nothing opaque |
| vMix | 29.0.0.49 Trial | Web Browser input through its API | nothing opaque | 465-1454 x 86-182 of 1920x1080 | nothing opaque |

The boxes match October's to a pixel on all three players.

## Left as found, with one exception

- **CasparCG:** the scratch config `casparcg.noacg-laptop-walk.config` written into the 2.5.0
  folder for the run, the server stopped with AMCP `KILL`, the file removed (checked: no `noacg`
  file left); media, log and data paths in the session's scratch directory.
- **OBS:** obs-websocket config, `user.ini`, `global.ini` and the `Untitled` collection copied before
  and compared after: identical byte for byte, the websocket server off again. The run used a new
  collection `NoaCGLaptopWalk`, switched back to `Untitled` and closed through its main window; the
  collection's files moved out of `basic/scenes`.
- **Companion:** only the scratch copy ran; the installed Companion and its configuration were not
  started or touched.
- **vMix: not left as found.** It was closed with a forced end as in October, but this time vMix had
  already rewritten `%APPDATA%\last.vmix` during the run (22:23 local). It now holds the run's
  Browser input and a Blank input. The file it replaced was dated 2026-10-01 04:12, the night of the
  hardware research that installed this trial, so it was most likely that run's leftover; it was not
  backed up first and cannot be restored. A later run should copy `last.vmix` before starting vMix.
