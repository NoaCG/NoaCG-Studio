# Phase 9 local hardware check: notes

Run on 2026-11-17 on the studio laptop (Windows 10), against the live site https://noacg.studio,
signed in with the owner's check account. All times are UTC (the page's Activity line shows local
time, UTC+2). No production setting was changed: `auto_publish` and `partial_writes` stayed off,
and only operator actions in the app were used.

## Setup

| Piece | What ran |
|---|---|
| Operator page | The owner's Chrome (driven through Claude in Chrome), production page of "Phase 9 test" |
| CasparCG 2.5 | `C:\casparcg\casparcg-server-v2.5.0-stable-windows` with its own config (2 channels), AMCP 127.0.0.1:5250, plus its media scanner |
| CasparCG 2.3 | `C:\casparcg\casparcg-server-v2.3.3-lts-stable` with its own config (1 channel), AMCP 127.0.0.1:5250, plus its scanner |
| NoaCG Bridge | 0.12.0, built from `origin/main` (`cli/`, `noacg bridge`), 127.0.0.1:8899, paired with the Chrome page |
| Browser output | A visible Chrome 157 window opened by a Playwright script on this machine, showing `/output?production=…&destination=browser` (needs no sign-in); its line is throttled through the DevTools protocol when a step says so |
| vMix | vMix on this machine |

Productions made for the test: "Phase 9 test" (20 library graphics; a stepped Showtime Quiz, a
CasparCG server clip and the step 3 graphics were added during the run) and "Phase 9 test large"
(60 library graphics). Both are deleted at the end, with an untitled production made by mistake
while finding the add path.

Where the pictures are: the repository keeps pictures out of git (`docs/work-specs/repo-pictures/spec.md`),
so the 102 screenshots named below are not in this folder on GitHub. They are on the studio laptop
in `C:\claude\noacg-archives\phase-9-local-2026-11-17\`, under the same file names, with these
notes and the two log excerpts. What each one shows is written out below.

How it was measured:

- **The light**: a 20 ms poll in the operator page of the status control's tone and text
  (`data-testid="production-status"`), with each press marked in the same log.
- **The browser output's picture**: the Playwright window screenshots itself in a loop and logs
  each moment the picture changes (the JPEG size moves), so "the picture moved" has an error bar
  of about 30 ms. Many changes in a row are an entrance or exit animation; one jump is a cut.
- **CasparCG's picture**: `ADD 1 IMAGE <name>` over AMCP writes channel 1's frame as a PNG
  (transparent background, white in most viewers). Pairs are `<step>-caspar.png` and
  `<step>-browser.png`, captured 4 s after the press unless named otherwise. For step 3 point 5
  CasparCG was grabbed every 0.3 s for 40 s.

## Setup problems met

- The app's built-in browser pane (Chromium 156) could not pair with the Bridge: "Your browser is
  blocking noacg.studio from reaching NoaCG Bridge. Allow local network access…", with no prompt
  to allow it. The owner connected Claude in Chrome instead, which paired at once.
- A browser output left in that pane, while the pane was hidden, only painted when screenshotted
  (a background page). It was replaced by the visible Playwright window.
- After that pane's output was navigated away (about 18:02:35), the operator page kept it as
  "Chrome 156 · Reconnecting…", and the light stayed grey "Confirming…" titled "Chrome 156 not
  answering (0 s) / News lower third (C): sent, waiting for Chrome 156" for over a minute. The age
  stayed "(0 s)" and never turned amber or red. Pressing its ✕ removed it.
  `s1-page-stale-output-confirming.jpg`. A Playwright window closed normally left the list at once.

## Step 1: CasparCG 2.5 with a browser output beside it

Lower third (News lower third C), scorebug (Volt Scorebug), a stepped graphic (Showtime Quiz:
question, then reveal) and a CasparCG server clip, each taken, updated where it has fields, Nexted
where it steps, and taken out. 22 capture pairs (`s1-c25-*`).

- Both pictures agree at every capture: on air in both or empty in both, same text and step. The
  first Facts graphic tried (Showtime Facts) turned out not to step, so the quiz was added.
- The light: Ready, then grey "Confirming…" about 0.1 s after the press, then green again
  0.9 to 1.1 s after the press (Take, Update, Out, Next). The browser picture began to move 0.16
  to 0.6 s after the press, so green always came after the browser output had run it. CasparCG's
  picture was not timed to the millisecond here (captured 4 s after each press).
- Server cue: `PLAY 2-10 "FLASH_CHECKED"` reached CasparCG 116 ms after the Take, `STOP` on Out,
  through the Bridge (`s1-bridge-server-cue-log.txt`). The light stayed green throughout.
- One Update (18:08:39.6) turned grey 1.0 s after the press instead of 0.1 s; the page had been
  busy for about 0.45 s after the field was typed into. Not seen on the other Updates.

## Step 2: CasparCG 2.3 (Chromium 71)

Failed. Every load of the output into CasparCG 2.3.3 logs, 1.4 s later:
`Uncaught (in promise) TypeError: e.matchAll is not a function`, and the output never joins: the
page reads "This production is on 1-20 and still loading" / "CasparCG 1-20 not answering", and a
Take airs on the browser output only; CasparCG 2.3 stays empty (`s2-c23-lt-take-*`,
`s2-c23-after-load-caspar.png`, `s2-c23-casparcg-log.txt`). Reproduced on a second Load.
`String.prototype.matchAll` arrived in Chrome 73. The live output loads several chunks that call it
(seen in `graphicSoundRuntimeV1-*.js`, `objectWithoutProperties-*.js`, `animMigration-*.js`,
`ografContract-*.js` on the deployment of 2026-11-17); the run's Chromium 71 check parses the
modules but does not catch a missing built-in. Not established here: whether 2.3 worked before
this run.

Setup difference, not a product defect: this machine's 2.3 config has one channel, so the Bridge's
channel 2 polls answer "Invalid channel specified" and the server clip (on 2-10, and only in 2.5's
media folder) reads "Server files missing".

### Step 2 rerun, 2026-11-20: pass

After the fix for #2603 (PR #2605, merge 7b4e6e66), on the same laptop. The live `/output` page
served the fix's Chromium 71 shims (`Promise.allSettled`, `structuredClone` and the #2603 note
that #2605 added to `output.html`), so the deployment included 7b4e6e66. NoaCG Bridge 0.12.0 was
built from `main` at 3f79bd7a; the production was a fresh "Phase 9 test" (News lower third C and
Volt Scorebug from the library), published, with CasparCG as its only output. The Bridge reported
the 2.3.3 LTS server as "CasparCG 2.3.2 4de6d18f Dev". Deleted afterwards.

1. **Load and log**: Load on 1-20 at 11:46:43.707 UTC; CasparCG 2.3 received the `PLAY 1-20
   [HTML]` at 11:46:43.747. In the following 40 s (and in the whole session's log) there is no
   "Uncaught", no "is not a function" and no output-page error line: no `html[...]` line at all
   after the PLAY. `s2-c23-rerun-casparcg-log.txt` (server start to 40 s after the PLAY, the
   Bridge's status polls removed). The "Invalid channel specified" lines of 2026-11-17 did not
   appear either.
2. **Joins**: the light went from "Not loaded on 1-20" to "● Ready for playout · 1 of 1 output"
   at 11:46:54.030, 10.3 s after Load.
3. **Take, Update, Out of the lower third** (CasparCG grabbed by `ADD 1 IMAGE` about every 0.3 s;
   each time is the window between the last unchanged grab and the first changed one):

   | Press | Press at (UTC) | Picture moved | Press to picture | Light green after press |
   |---|---|---|---|---|
   | Take | 11:47:52.049 | by 52.169 (prior grab 51.884, before the press) | at most 0.12 s | 1.02 s |
   | Update to "Rerun Update 2.3" | 11:48:02.268 | between 02.437 and 02.733 | 0.17 to 0.47 s | 1.34 s |
   | Out | 11:48:12.581 | between 12.976 and 13.268 | 0.40 to 0.69 s | 1.00 s |

   The update frame shows "Rerun Update 2.3"; after the Out channel 1 is empty.
4. **CasparCG 2.5, same presses**: the page reloaded the output onto 2.5 by itself ("Reloading on
   1-20", Ready 9.1 s later).

   | Press | Press at (UTC) | Picture moved | Press to picture | Light green after press |
   |---|---|---|---|---|
   | Take | 11:49:55.251 | by 55.318 (prior grab 55.007, before the press) | at most 0.07 s | 0.98 s |
   | Update to "Rerun Update 2.5" | 11:50:05.469 | between 05.696 and 05.988 | 0.23 to 0.52 s | 1.42 s |
   | Out | 11:50:15.581 | between 15.820 and 16.110 | 0.24 to 0.53 s | 1.00 s |

   As on 2026-11-17 (green 0.9 to 1.1 s after a Take or Out); nothing changed on 2.5.

The CasparCG frames are in the local archive with the other pictures (`s2r-c23-*`, `s2r-c25-*`,
named by their grab time), with the full 2.3 log.

## Step 3: a Take of a graphic the output is still loading (CasparCG 2.5 only)

2.3 not run: step 2's output does not come up.

- **Added and taken at once, not published** (production as it is today, automatic updates off):
  red "Arcade Clock did not play on Chrome 157 / CasparCG 1-20: it is not published" 2.4 s after
  the Take; no "Loading" (`s3a-page-not-published.jpg`). An operator has to press Publish changes
  first; the cases below do that and take the moment the publish lands.
- **Under 5 s** (unthrottled): Arcade Clock on the browser output 1.29 s after the Take, with its
  entrance (several animation frames), and on CasparCG; amber "Updating outputs" for 12.6 s, then
  green (`s3b-*`). No "Loading" mark appeared.
- **Over 5 s** (browser output at 4 Mbit/s, 200 ms): the cue showed LOADING from 1.1 s, the light
  said "Sticker Title: loading on Chrome 157", the picture came on 11.0 s after the Take in one
  jump to its final state (no entrance, no intermediate frame), and green followed at 12.9 s
  (`s3d-*`). CasparCG (unthrottled) loaded it in about 2 s. Sound not checked (no sound graphic).
- **Take pressed 0.6 s into "Publishing…"** (by accident, browser at 1 Mbit/s, 400 ms): CasparCG
  red "not published"; the browser output "loading … it will appear without its entrance", then
  red "did not load in 20 s"; nothing ever appeared on either output (`s3c-*`).
- **Out, All out and delete while the Take loads** (0.4, 0.4 and 0.36 s after the Take): nothing
  appeared on either output. The browser picture never changed; CasparCG was grabbed every 0.3 to
  0.55 s for 40 s each time (75, 74 and 74 frames), all empty.
- **D1, measured for the owner** ("Phase 9 test large", 60 graphics, browser output on the run's
  slow line, 20 Mbit/s and 50 ms; a new graphic published, then taken the moment the publish
  landed):

  | Graphic | Browser output on air after Take | CasparCG (unthrottled) | Light green after Take |
  |---|---|---|---|
  | Arcade Quiz | 8.9 s, one jump | by 1.8 s | 12.8 s |
  | End credits (a roll) | 12.9 s | by 2.7 s | 9.4 s (3.4 s before the browser picture) |
  | Showtime Clock | 6.6 s, one jump | by 2.2 s | 15.0 s |

  The run measured 7.6 s; the ceiling is 5 s. For the credits roll the light was green while the
  browser output still held it hidden (the late-Take rule shows it when it stands still, 6 s cap).

## Step 4: an output restarts while a Take is held

Both restarted outputs end up showing what is on air, but the light turned green slightly before
the restarted output drew it:

- Browser output reloaded 2 s after a Take of a new graphic on the large production: amber "Chrome
  157 has not confirmed Showtime Mark (5…7 s)", green at 18:37:35.363, the reloaded output's
  picture at 35.711 (0.35 s later) (`s4a-*`).
- CasparCG's template reloaded over AMCP (`PLAY 1-20 [HTML] <same URL>`) 4.4 s after a Take
  while it was still "placing" the graphic: green at 18:39:02.262; CasparCG frames at 02.673 and
  03.221 still empty; drawn at 03.732 (`s4b-c25-burst-*`, file names carry the grab time).

## Step 5: the light on the network

- The cable pull was emulated on the browser output (DevTools offline for 20.1 s, 18:41:13.5 to
  33.6); the CasparCG output runs on the same machine as the page, so its cable could not be
  pulled. A Take at +5.8 s and an Out at +11.4 s while offline: grey "Confirming…", amber
  "Waiting for Chrome 157 / Chrome 157 has not confirmed House Poll (5 s … 14 s)" from 5 s, red
  "Chrome 157 did not confirm" at 15 s, and green by itself 0.93 s after the connection came back,
  with the output caught up (House Poll on, Volt Fixtures out) (`s5-after-reconnect-*`).
- With nothing pressed, the light stayed green for the first 6 s offline (not watched longer).
- Not run: a data feed (needs a configured feed on the production).
- Slow line (browser output at 20 Mbit/s, 50 ms), 10 presses (Take and Out of five graphics on
  the large production): green 965, 1000, 1022, 999, 1041, 996, 1002, 1095, 1030, 1021 ms after
  the press; unthrottled it was 0.9 to 1.1 s.

## Step 6: a Take never waits (mouse only)

Real mouse clicks and typing in the operator page (Chrome), typical production:

- Typed "Mouse Take One" into a cue and clicked TAKE at once: on air on both outputs with the
  typed text; the browser picture moved 0.5 s after the click (`s6-mouse-type-take-*`).
- TAKE then Next on the quiz: both confirmed; reveal on both outputs (`s6-mouse-quiz-next-*`).
- Quick button "⚡ Point to player 1" and the live number "Score 1 +": 0 to 1 to 2 on both
  outputs (`s6-mouse-goal-plus1-*`, `s6-mouse-plus1-*`). The first "+" click missed because a
  line "The rundown changed elsewhere. Undo history was cleared." appeared and pushed the panel
  down, with nobody else editing (`s6-page-rundown-changed-elsewhere.jpg`).
- Typed "Reload Keep Three", clicked TAKE, pressed F5 at once, browser output on 1 Mbit/s with
  300 ms: after the reload the cue still reads "Reload Keep Three" and it is on air on both
  outputs (`s6-page-after-reload.jpg`, `s6-type-take-reload-*`).
- Touch screen and physical panel: the owner's.

## Step 8: vMix

vMix 29 on this machine, the browser output URL added as a Browser input on overlay 1. The page
counted it as a third output ("Chrome 115"). Take of a lower third, Take of a scorebug on another
layer, Update of the lower third, Out of the scorebug, Take and Next of the quiz, All out: vMix's
input shows the same picture as the browser output at each step (`s8-*-vmix.png` beside
`s8-*-browser.png`). In `s8-04` vMix was grabbed 70 ms before the browser output and still had the
previous text; 6 s later (`s8-05`) it shows the update. vMix was closed afterwards and its last
preset file restored.
