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

### Steps 4 and 5 rerun, 2026-11-20 (UTC), after #2610

Production deployment 90286a4d (includes #2610, merged 16:35 UTC). Same laptop: CasparCG 2.5.0,
NoaCG Bridge 0.12.0 built from `main`, the Playwright browser output window, the operator page in
Chrome. A fresh "Phase 9 test" with 14 library graphics (two more added for the loading cases),
published with the CasparCG switch on; production switches untouched; deleted afterwards. Each
restart was fired from the operator page itself through two local helpers (the browser output
window's reload, and `PLAY 1-20 [HTML] <same URL>` over AMCP), so its time is in the light's log.
CasparCG was grabbed about every 0.3 s, the browser output by its picture-change series.

**Step 4: once the page notices the restart, the light is never green before the picture is
back. Open: until it notices, it stays green over the blank restarted output** (0.3 to 0.6 s on
CasparCG, 2.2 to 2.8 s on the browser output).

| Case | Restart at | Page noticed | Picture back | Green | Green before picture? |
|---|---|---|---|---|---|
| A. Take still loading (House Countdown), CasparCG reload 0.3 s after Take | 21:46:50.999 | amber throughout ("Updating outputs", "placing", "loading on CasparCG 1-20") | 57.947 | 01.357 | no, 3.4 s after |
| B. Take still loading (Arcade Strap), browser output on 4 Mbit/s reloaded 1 s after Take | 21:48:01.756 | 04.377 (not answering) | 13.538 | 14.161 | no, 0.62 s after |
| C1. On air, nothing pressed, CasparCG reload | 21:49:20.921 | 21.218 (grey "Confirming…") | 22.440 | 22.897 | no, 0.46 s after; green over a blank output for 0.3 s before the page noticed |
| C2. On air, nothing pressed, browser output reload (4 Mbit/s) | 21:50:17.187 (blank) | 19.958 | 22.518 | 24.197 | no, 1.7 s after; green over a blank output for 2.8 s before the page noticed |
| D1. 15 graphics on air, nothing pressed, CasparCG reload | 21:52:39.821 | 40.358 | 41.616 (all back) | 42.679 | no, 1.06 s after; 0.54 s green over blank first |
| D2. 15 graphics on air, nothing pressed, browser output reload (4 Mbit/s) | 21:53:43.036 (blank) | 45.265 | 48.531 (all back) | 51.158 | no, 2.6 s after; 2.2 s green over blank first |

While noticed, the light read grey "Confirming…" or amber, as the checklist says. During every
reload the restarting output was listed twice ("Chrome 158 not answering (0 s) / Chrome 158 not
answering (0 s)"); that looks like the known #2611. No "did not play" appeared.

**Step 5: the output cut is ok; a silent output read green for 42.6 s; the production page cut
off for 60 s stayed green the whole time (fail).**

- **Output cut with a press** (browser output offline 20.1 s, 21:56:15.558 to 35.638; Take at
  +4.6 s, Out at +10.2 s): grey "Confirming…", amber "Waiting for Chrome 158 / has not confirmed
  Pro lower third" from 5 s, red "did not confirm" at about 16 s; the output's picture caught up
  between 35.70 and 36.06 and green followed at 36.537. A first run the same way (21:55:08.8 to
  28.96) went green at 29.858, then amber "Chrome 158: Catching up on missed commands" for 3 s,
  then green; its picture was not timed, so whether that first green came before the output had
  caught up is not known. Seen once in two runs.
- **Silent output, nothing pressed** (browser output offline 60 s from 21:57:23.613): green for
  42.6 s, then red "Chrome 158 lost … has not answered for 80 s" at 21:58:06.220 (the 80 s is
  more than the 42.6 s it had been silent), a flick of grey "Confirming… (0 s)", red again "not
  answering (16 s…20 s)"; back online at 58:23.689, amber "Commands slow: Chrome 158: Commands may
  arrive up to 30 s late" from 26.038, green at 36.018 (12.3 s after reconnecting). Within the
  checklist's "at most 3 min".
- **The production page's own network off for 60 s** (a second signed-in operator page, offline
  from 21:59:09.446 to 22:00:09.523): green for the whole 60 s. It read amber "CasparCG 1-20 cannot
  confirm: this page cannot hear the outputs right now / Chrome 158 cannot confirm…" only at
  22:00:09.590, after the network was back, and green again at 14.759. A check that the emulation
  really cut the page off: offline, that page neither saw a Take pressed on the other page (its
  PROGRAM did not change) nor could fetch anything. So for 60 s the page could not hear and still
  read green; it never noticed while cut off.
- Not run: a real cable pull (emulated with DevTools offline on one browser window; CasparCG and
  the pages share this laptop), and a data feed (none configured).

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

## Final rerun (2026-11-22)

Run on 2026-11-22 from 07:07 to 07:49 UTC on the studio laptop, against https://noacg.studio, for
the coordinator's final local checklist (steps 4 and 5, plus #2662 and #2676). Production served
`main` 502418268 (after e8fda70b) when the run started; 516ab7f0c (TL1 templates and a spec map
refresh) deployed at 07:19 UTC during it. No production switch was changed and no account was
made.

| Piece | What ran |
|---|---|
| Operator page | The owner's Chrome (Claude in Chrome), signed in as before, a new production "Phase 9 final 2026-11-22" with four library graphics (Pro lower third, Arcade Strap, Volt Scorebug, House Poll), published with CasparCG via Bridge on |
| NoaCG Bridge | 0.13.1, built from `main` 502418268 (`cli/`, `noacg bridge`) |
| CasparCG 2.5 | 2.5.0 69e8ad5, same folder and config as before |
| CasparCG 2.3 | the `casparcg-server-v2.3.3-lts-stable` folder (its AMCP `VERSION` answers "2.3.2 4de6d18f Dev") |
| Browser output | a visible Chrome window opened by a Playwright script, `/output?…&destination=browser` |

How it was measured: the light (`production-status`) polled every 20 ms in the operator page, with
each press and restart marked in the same log; CasparCG's channel grabbed with `ADD 1-990 IMAGE`
every 0.26 s on 2.5 and 0.35 s on 2.3 (an empty frame is about 8.2 KB, the lower third 65 to 67
KB); the browser output screenshotted continuously and each change logged. "Green minus picture" is
the light's first green after the page noticed the restart, minus the first grab with the picture
back; a negative number means green came early. Logs, helper scripts and the browser output's
frames are on the laptop in `C:\claude\noacg-archives\phase-9-local-2026-11-17\final-rerun-2026-11-22\`.

Stand-ins, because the outputs, the Bridge and this session share one laptop:

- **Full machine restart**: the output process killed hard and started again (`taskkill /F` on
  `casparcg.exe`, or on the browser output's whole Chrome tree). Restarting the laptop would have
  ended the measurement.
- **Output cable pull**: the browser output's network set offline through DevTools emulation.
  CasparCG's own network could not be cut without changing firewall settings.
- **Production page network** (items 5, 7 and 8): the page's own requests to the backend failed (or
  were slowed) and its realtime messages dropped inside the page, with the socket left open, as a
  silent cable pull leaves it. Calls to the local Bridge kept working, as they would with a pulled
  cable. The first item 5 attempt also blocked the Bridge, read red "Bridge not running", and is not
  counted.

### Summary

| Item | Result |
|---|---|
| 1. Restart after a Take, CasparCG 2.5 and browser output | pass once noticed: green 0.50 to 3.0 s after the picture, never before it |
| 1. Restart after a Take, CasparCG 2.3 | pass on 2 of 3; one green 1.0 s over the blank output before the page noticed, one stuck on a stale entry |
| 2. Restart with a graphic on air, nothing pressed | pass once noticed (green 0.57 to 10.6 s after the picture); before noticing, green over the blank output for up to 2.4 s on CasparCG 2.5 and 0.7 s on the browser output |
| 2. On air, CasparCG 2.3 | **fail**: 5 of 11 loads of the output died with "Uncaught SyntaxError: Unexpected token ."; with the stale entry removed as item 3 says, the light read green "Ready" while the 2.3 slot said "Loading…" and CasparCG showed nothing, through two Takes |
| 3. Stale "not answering" entry (#2611) | seen after plain template reloads too, not only a full restart; ✕ removed it each time; while it stood the light went red "lost" over a working output |
| 4. Output cable pull, nothing pressed | pass with the window measured: green for the whole of a 60 s cut, and 54.3 s of a 150 s cut; then grey "not answering" and red 16 s later |
| 5. Production page cut off | pass: green for 41.1 s, then amber "cannot confirm", never green until 3.8 s after the network came back |
| 6. Data feed alone | not run: no feed is configured |
| 7. Take on a throttled page | pass: "still sending" with Stop sending at 4.0 s, never "failed", one `control_send_seq` at a time, aired once when the network returned |
| 8. Take then Out on a throttled page | pass: never flashed on either output in 3 runs; but the page said "Take is on this monitor only… Send it again" for the Take that Out had replaced |

### Step 4: restarts

Item 1, a Take 0.5 s before the restart (template reload: `PLAY 1-20 [HTML]` with the same URL, or
the browser output window's reload). Times from the restart.

| Output | Run | Page noticed | Picture back | Green | Green minus picture |
|---|---|---|---|---|---|
| CasparCG 2.5 reload | 1 | 1.0 s (grey "Confirming…") | 2.47 | 3.68 | +1.21 |
| CasparCG 2.5 reload | 2 | 0.48 | 2.16 | none | listed as "CasparCG 1-20 #2" beside a stale "CasparCG 1-20", red "lost" from 19 s; green only when the stale one was removed at 48 s |
| CasparCG 2.5 reload | 3 | 0.48 | 2.50 | 3.56 | +1.06 |
| CasparCG 2.5 reload | 4 | 0.54 | 2.26 | 3.66 | +1.41 |
| Browser output reload | 1 to 3 | 0.46 to 0.77 | 1.90 to 2.08 | 2.94 to 3.50 | +1.17, +1.60, +0.98 |
| CasparCG 2.5 hard restart, Take 2.5 s before | 1 | 1.97 (red "CasparCG not answering") | 7.81 | 8.31 | +0.50 |
| Browser output hard kill, Take 6.5 s before | 1 | 1.24 (grey, the output listed twice) | 8.93 | 11.94 | +3.01 |
| CasparCG 2.3 reload | 1 | 0.50 | 1.61 | 0.55, then grey at 2.16 and green at 2.18 | green at 0.55 s while the picture was blank from 0.57 to 1.61 s: the old page confirmed the Take just before the reload replaced it |
| CasparCG 2.3 reload | 2 | 0.44 | 1.51 | 2.28 | +0.77 |
| CasparCG 2.3 reload | 3 | 0.46 | yes | none in 14 s | stale entry |

The light read grey "Confirming…" while it waited, amber "Reloading on 1-20" once (hard restart,
nothing pressed), red "lost" or "not answering" when an output stayed away. Amber "Updating outputs"
did not appear: no placement lasted 5 s.

Item 2, a graphic on air for 7 s, nothing pressed, then the restart. Stale entries were removed
before each run.

| Output | Green over the blank output before the page noticed | Green minus picture |
|---|---|---|
| CasparCG 2.5 reload, 4 runs | 1.3, 2.1, 1.0, 2.4 s | +1.70, +1.85, +0.70, +0.76 |
| Browser output reload, 3 runs | 0.72, 0.39, 0.07 s | +2.13, +0.81, +2.34 |
| CasparCG 2.5 hard restart, 2 runs | 2.3, 2.4 s (green over a dead CasparCG) | +0.57; +10.6 (amber "Reloading on 1-20" from 8.2 s, green at 19.2 s) |
| Browser output hard kill | none: red "Browser out lost" at 1.7 s, its age reading "41 s" | +0.69 |
| CasparCG 2.3 reload, clean run | 0.2 s | +2.32 |

A first batch of item 2 runs without removing stale entries went red "CasparCG 1-20 lost" or
"CasparCG 1-20 #2 lost" over working outputs and is not counted.

**CasparCG 2.3: the output died on load, and the light read green.** CasparCG 2.3's log shows
these loads of the output failing at once with `Uncaught SyntaxError: Unexpected token .` and the
page destroyed: 07:26:45, 07:27:12, 07:27:39, 07:31:31 and 07:31:57 UTC. Loads at 07:25:36,
07:25:57, 07:26:18, 07:29:52, 07:30:10 and 07:31:04 worked. Every failed load came right after a
reload with a graphic on air, but two such reloads (07:30:10, 07:31:04) worked, so that is not the
whole trigger. The app's own output chunks are not the cause: all 28 chunks the output page loads
from the deployment tokenize clean of `?.`, `??` and logical assignment. A graphic's own script
evaluated in the output is the next suspect. While the slot was dead, the outputs list held only
"Browser out" once the stale "CasparCG 1-20" was removed (item 3), so the light read green "Ready"
with its title "This production is on 1-20 and still loading" and "Output slot 1-20 Loading…", and
two Takes went green with nothing on CasparCG (grabs empty from 07:26:46 to 07:29:52). CasparCG
2.3's log for the run is in the archive folder as `caspar23-2026-11-22.log`.

### Step 5: the network

- **Item 4, browser output offline, a graphic on air, nothing pressed.** 60 s cut (07:34:51): green
  for the whole 60 s; grey "Browser out not answering (0 s)" 1.0 s after the network came back, amber
  "Commands slow" at 8.6 s and green at 17.6 s. 150 s cut (07:36:35): green for 54.3 s; then red
  "Browser out lost … not answering (81 s)" for 10 ms, grey "not answering (0 s)", and red at 70.2 s
  (16 s after the grey). Back online: amber "Commands slow" after 14 s, green after 26 s. The window
  before the page notices a silent output is 54 s to over 60 s here.
- **Item 5, the production page cut off for 90 s**, a graphic on air: green for 41.1 s, then amber
  "Browser out cannot confirm: this page cannot hear the outputs right now / CasparCG 1-20 cannot
  confirm…" until the network came back; green 3.8 s after it did. It never read green after
  noticing. On 2026-11-20 the same cut stayed green for all 60 s.
- **Item 6**: not run. The production has no data feed, and configuring one needs an outside source.

### #2662 and #2676: held presses

- **Item 7, every backend request held 9 s** (07:46:00): "sending…" at once, "still sending" with
  Stop sending at 4.05 s, never "failed". `control_send_seq` went one at a time: each attempt was
  cancelled at 8.0 s and the next started 0.4 to 2.0 s later (4 attempts). With the requests fast
  again at 25.0 s, the next attempt landed at 27.5 s; one entrance on each output (browser 27.6 s,
  CasparCG 27.8 s). The light stayed green "Ready" for the 27 s the Take was still being sent. With
  requests held only 3 s, the Take landed at 3.1 s and "still sending" did not appear, as expected.
- **Item 7, page offline 10 s, Take 1 s in**: "still sending" with Stop sending 4.0 s after the
  Take, never "failed"; five attempts failed at once while offline; landed 2.4 s after the network
  came back; one entrance on each output.
- **Item 8, Take then Out 0.3 to 0.4 s later**, once with requests held 9 s and twice with the page
  offline 10 s: neither output ever showed the graphic (CasparCG empty in all 55 to 112 grabs per
  run, the browser output unchanged). Out landed when the network returned. Two things to know:
  - With requests held, the Out's request started at 1.5 s while the Take's was still open, so two
    `control_send_seq` were in flight until the Take's was cancelled at 8.0 s.
  - The page said "Take is on this monitor only. It may not have reached the screens or the log
    (the server did not answer). Send it again." for the replaced Take: at 8.0 s with requests held,
    and 0.3 s after Out when offline. An operator who follows it puts the graphic back on air after
    pressing Out.

Not run: a real cable pull, a real machine restart, and a data feed. The test production "Phase 9
final 2026-11-22" is left in the account.
