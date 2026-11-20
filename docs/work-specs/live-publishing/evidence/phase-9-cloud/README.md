# Phase 9 on hosted staging, 2026-11-20

The parts of the owner checklist (`../../phase-9-checklist.md`) that need no studio hardware, run on
the hosted staging project only: step 7, step 9, seven typists once (for #2589), and dry runs of
steps 11 and 12 with `auto_publish` and `partial_writes` switched on in staging. Steps 1 to 6, 8
and 10 were not run. Source: `main` at e8488c899 (after #2591, the #2589 fix).

## How it ran

- **Staging only.** Every run went through `.github/workflows/hosted-latency.yml` with its `spec`
  input, on the scratch branch `noacg/eager-turing-4orpho`. That workflow holds the staging keys,
  declares `NOACG_CONFIGURED_TARGET=hosted-staging`, and its "Configured backend" line named
  `garafohbzmsybtysxphb.supabase.co` on every run. Each instrument also refused anything but
  `scripts/configured-target.mjs`'s `hosted-staging` kind and refused the production ref. The cloud
  session's own production variables were never used; no Supabase management API call was made.
- **Accounts.** The workflow's staging test accounts (`e2e-s1@noacg.staging` and its teammate),
  plus the per-run members the phase 8 scene mints and deletes on staging. Nothing in production.
- **Instruments.** Phase 8's scene (`e2e/configured/_five.ts`) and its interleaved method, with a
  few changes for staging, in `instruments.patch` (scratch, not for `main`). The changes: a large
  production option (`fill`), roles chosen per run, continuous typing, bounded clicks in the run
  loop so an unconfirmed Take is recorded instead of stalling the run, a publish retry while a large
  production is still saving, and a 30 s wait for the first-visit wizard. No product code changed.
- **Runner.** One GitHub `ubuntu-latest` runner per run; every person is a separate browser
  context on that one machine, against the app's dev server. Phase 8 judged timing on a bundled
  build; the dev server reads about twice as slow there. The gaps below are seconds, not tens of
  milliseconds, so that does not decide them, but the absolute numbers are dev-server numbers.
- **Switches.** Staging held no `production_copies` row before this run (it reads as off) and had
  `auto_publish` and `partial_writes` off and installed. Steps 7 and 9 ran as production is today
  (both new switches off; `production_copies` on during the run). The seven typists and steps 11
  and 12 ran with all three on. Every run ended by setting `auto_publish`, `partial_writes` and
  `production_copies` off and reading them back: `data/*-switches-after.json`. The last read,
  after the step 7 run, is in the table at the end.

## Runs

| Run | What | Outcome |
|---|---|---|
| [44723989832](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44723989832) | steps 11, 12 | step 11 measured; step 12 stopped by an instrument error (it looked for a cue it had renamed) |
| [44728270771](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44728270771) | steps 11, 12 | both measured; the older output's notice hid the step 12 note |
| [44729067706](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44729067706) | step 9, five people | instrument error (signed the owner in twice); nothing measured |
| [44732295894](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44732295894) | step 9, five people | ran; stalled on an unconfirmed Take (Out disabled), trace kept |
| [44736841836](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44736841836) | step 9 pairs, 1 of 2 | 6 pairs |
| [44738953865](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44738953865) | step 9, five people | full 10 minutes |
| [44739022505](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44739022505) | step 9 pairs, 2 of 2 | 6 pairs |
| [44744165726](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44744165726) | seven typists | full 8 minutes |
| [44741875906](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44741875906), [44746612893](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44746612893), [44750703081](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44750703081) | step 7 | set-up never finished: the first said "Publish failed: Your latest change is still saving. Publish again in a moment."; the next two stalled on instrument errors in the publish retry |
| [44746676847](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44746676847) | steps 11, 12 | measured; older output closed before step 12 |
| [44752384134](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44752384134) | step 12, current outputs only | measured |
| [44755730539](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44755730539) | step 7 | publish of the 60-graphic production failed with a statement timeout, five times |

Each run's `hosted-results-1` artifact holds its JSON, screenshots and, for a failed run, the
Playwright trace. GitHub keeps them until 2026-12-04. The repository keeps pictures out of git
(`docs/work-specs/repo-pictures/spec.md`), so the screenshots are not in this folder; each one used
below is described where it is cited, by its file name inside that artifact.

## Step 7: two operators typing on a large production

**Not run past set-up: the large production would not publish on staging.** The scene builds a
team production of 60 graphics (the phase 8 scene's 6 plus 54 Hairline lower thirds) and publishes
it before the three people join. On staging that publish failed every time:

- Run 44741875906: "Publish failed: Your latest change is still saving. Publish again in a moment."
- Run 44755730539 (`data/step7-run4-log.txt`): no answer within 30 s on the first press, then four
  more presses over 3.4 minutes, each "Publish failed: canceling statement due to statement
  timeout". Only the owner's page was open; nobody else was working.

Phase 9's local check published a 60-graphic production on the local backend, so this is the hosted
project refusing a publish of that size, not the scene. The two typists and the taker never
started, so the step itself (prompt Takes, everyone's text, nothing overwritten) is **not run**.

## Step 9: five people at once

Five accounts in their own browser contexts on one team production: a taker, a messages person
(Interaction, Paste, Prepare cue every 15 s), a quick-button person (Goal every 3 s), two editors
(a new text every 4 s). Editor 1 reloads at 40 % of the run; editor 2 goes offline for 20 s at 60 %.

**Ten minutes (run 44738953865, `data/step9-soak.json`):**

| Check | Result |
|---|---|
| Every Take airs | **failed.** 52 Takes, 18 never ran on the output (34 did). 15 times Out stayed disabled 15 s after a Take; 8 of those pages said "Take is on this monitor only. It may not have reached the screens or the log (the server did not answer). Send it again." |
| Press to ran | 34 Takes: median 1,422 ms, p95 9,698 ms, max 9,847 ms |
| Every Goal counts once | **failed.** 199 Goal presses, final score 55. The quick-button page showed "Catching up on missed c…" and "sending…" at the end (`step9-person2-quick.png`). |
| Every message becomes a cue | **failed.** 39 pasted, 25 prepared; 14 rows did not appear or could not be added within 20 s |
| Each edit stays on its own cue | **ok.** Both editors' last texts on the server and on all five pages, 37 s after the run, including the reloaded and the offline editor |
| No "(conflicted copy)" | **ok.** None in any account |
| Reload, 20 s offline | done (1 reload; offline 360 to 380 s) |

**Interleaved pairs (runs 44736841836 and 44739022505; `data/step9-pairs-*.json`,
`data/step9-pairs-pooled.json`, `pairsum.py`).** Phase 8's method: 45 s with everyone working, 45 s
with the taker alone, order alternating; pooled over 12 pairs, bootstrap over pairs (2,000 draws).

| | Takes timed | median | p95 | Takes that never ran |
|---|---|---|---|---|
| taker alone | 332 | 237 ms | 527 ms | 2 |
| everyone working | 97 | 316 ms | 5,767 ms | 13 |
| **difference** | | | **+5,240 ms** (bootstrap 95 %: +1,578 to +7,273) | |

Against 50 ms: **failed.** Phase 8 on the local backend: +37.0 ms (+32.6 to +43.1).

**Why: staging slows down under five people.** The first full run (44732295894) kept the taker's
network log (`data/step9-run1-staging-response-times.txt`): before the run the taker's requests to
staging took a median of about 190 ms; with five people working the median per minute was 0.6 to
7.6 s, the slowest single requests 13 to 42 s; once the run stopped it was back to about 160 ms
with every page still open. 23 of the taker's 78 command sends were cancelled by the page
(`net::ERR_ABORTED`). The dev server logged "Data read failed: Could not query the database for the
schema cache. Retrying." seven times in one minute. All six pages together sent only about 8
requests a second. The frames from that run show the taker's page at the stall, "Take is on this
monitor only… Send it again.", with Out disabled and the program monitor "not confirmed"
(`soak2-page@…-1795176271404.jpeg` in the trace).

One caveat: six browser contexts on one runner also load that machine. The pairs separate the two
in part: with the taker alone the same machine and staging gave a p95 of 527 ms.

## Seven typists once (#2589), switches on

Run 44744165726, `data/seven-typists.json`: ten pages (taker, messages, quick button, seven
editors), 8 minutes, one reload (editor A) and 20 s offline (editor B), with `auto_publish`,
`partial_writes` and `production_copies` on.

- At the end every editor's page showed its own last text, but 6 of 7 pages still had a save
  pending, each with the note "canceling statement due to statement timeout".
- 120 s later the team record on the server held: the last text for 1 cue (D); an older text by
  the same editor for 3 (C, E, G); and the cue's original text "Alexandra Riva" for 3 (A, B, F).
  No other page held any editor's last text. None was published. No "(conflicted copy)".
- Takes: 28, 16 never ran; press to ran median 4,750 ms, p95 9,237 ms. Goals: 159 presses, score
  14. Messages: 23 pasted, 3 prepared.

For #2589: on staging the record does not catch up; three cues went back to their original text,
which is an overwritten cue, not a slow one. The statement timeouts say the database refused the
saves under this load.

## Steps 11 and 12 (dry run, switches on in staging)

`auto_publish_state()` and `partial_writes_state()` reported `installed: true` on staging, asked as
the signed-in test account (`data/auto*-states*.json`). Each run switched both on, then off again.

**Step 11** (runs 44723989832, 44728270771, 44746676847, 44752384134; `data/step11-12-*.json`,
`data/step12-current-outputs-auto.json`). Times from the change to: the server publication, then
output "Desk A" holding it, then the second output.

| Change | run 1 | run 2 | run 3 | current outputs only |
|---|---|---|---|---|
| cue text typed | 6.1 / 8.6 / 8.6 s | 5.8 / 7.5 / 7.5 s | 5.4 / 6.0 / 6.6 s | 6.8 / 7.9 / 7.9 s |
| graphic added | 4.5 / 8.9 / 8.9 s | 4.7 / 12.2 / 11.4 s | 5.7 / 11.9 / 11.9 s | 7.3 / 9.0 / 9.0 s |
| graphic removed | 3.9 / 6.3 / 8.3 s | 3.8 / 7.4 / 7.4 s | 4.8 / 4.8 / 7.7 s | 6.3 / 11.4 / 10.7 s |

- No Publish press in any of them. The light went amber "Updating outputs" 3 to 5 s after each
  change. With an older output open it then showed "Reload Old when nothing is on air" instead of
  green; with current outputs only it went green "Ready" (6.1 s after the typed change).
- **Closed with a change unpublished:** held back while the page was open (publish calls blocked),
  then published 12.0, 16.0, 18.3 and 23.7 s after a second browser opened the production.
- **Output opened before the switch** (`&oldbuild=1`): the light read "Reload Old when nothing is
  on air" 27 to 29 s after the switch, and never named the current output Desk A
  (`auto1-step11-reload-old-output.png`).
- Seen on the way: "The rundown changed elsewhere. Undo history was cleared." on the only editing
  page (`auto1-step11-after-edits.png`); the local run saw it too (checklist step 6).
- Result: **ok.**

**Step 12.** The scorebug on air, its design edited in the library.

- Runs 2, 3 and the current-outputs run: the frame on air was kept (no change mid-air), and the
  next Take showed the new design (the new frame carried the edit's marker). Run 1 did not reach
  step 12.
- With an older output present the note never showed: the light read "Reload Old…", and after
  that output was closed, "Waiting for Old" then red "Old lost" (run 44746676847). The page kept
  counting a closed output.
- With current outputs only (run 44752384134): amber "Updating outputs" from 7 s, then green
  "House Scorebug: new design at next Take" 22.4 s after the edit
  (`s12-step12-new-design-at-next-take.png`). The checklist expects the light to stay green; it
  was amber for about 15 s first.
- Result: **ok, with the amber gap noted.**

## Switches at the end

Read back with the service role after the last run (step 7, run 44755730539,
`data/step7-run4-switches-after.json`): `auto_publish` off, `partial_writes` off,
`production_copies` off. That is how staging stood before the first run, except that
`production_copies` now has a row saying off where before it had none (both read as off).
