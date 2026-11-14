# Phase 8 evidence: five people at once

Acceptance (verbatim): "AC-6".

AC-6 (spec): "Five accounts on one production for 10 minutes with automatic updates on: one taking,
one adding messages, one using quick buttons, two editing cues at once; one page reloads, one loses
and regains its connection. No command lost, no different cue overwritten, press to ran within 50 ms
p95 of a single page. The same run with 10 and 15 pages is reported in `docs/CLOUD_PLAYOUT.md` as
tested numbers, not a limit. Layer: a configured spec."

Base: `origin/main` d2d35f4a7cfd44d61f0807bfe35d7323aacfd3bf. No file under `src/`, `api/`,
`supabase/` or any workflow changed. Hardware checks: none in this phase; every one the run could
not do is in `../phase-9-checklist.md`, none counted as passed.

## The rule, fixed before the runs

From the coordinator's brief (#2361), before any timing was read:

- 10 minutes, five accounts (one taking, one adding messages, one using quick buttons, two editing
  cues at once), one page reloads, one loses and regains its connection.
- No command lost, no different cue overwritten.
- Press to ran within 50 ms p95 of a single page, measured as interleaved runs (several five-page
  runs and several single-page runs alternating), judged on the pooled p95 difference, with the
  bootstrap range reported beside it.
- Then the same run with 10 and 15 pages, reported in `docs/CLOUD_PLAYOUT.md` as tested numbers.

## What was built

- `e2e/configured/_five.ts`: the scene. The suite's own account builds a team production (three
  lower thirds for the taker, one per editor, and a House Score whose home score is bound to the
  production's data), creates a team, moves the production into it and publishes it. The other
  people are signed-in accounts, each in a browser context of its own, who join the team by its
  code and open the production page. One output holds every graphic. Then the roles run for a set
  time, scripted to press on a shared clock:
  - **taker**: select a lower third, Take, wait for the output's graphic to run it, Out; repeat.
  - **messages**: on the Interaction workspace, paste a message and press Prepare cue on it.
  - **quick**: the score goes on air once, then its Goal button is pressed on every tick.
  - **editors**: each types a new text into its own cue on the same tick. The first editor's page
    reloads part way through; the second editor's browser goes offline for a while and back.
- `e2e/configured/five-people.spec.ts`: the configured spec (AC-6's layer). A 30-second run with
  everything above, judged on correctness: every Take ran on the output, the score moved once per
  Goal, every message became a cue, each editor's last text is in the team's record, in the
  publication and on every page, the taker's and the score's cues keep their text, and no
  "(conflicted copy)" exists in any account. It fits the suite's 120 s per-test ceiling.
- `e2e/configured/measure/five.measure.ts` (`soak`, `pair`) and `summarize-five.mjs`: the same
  scene run long and timed; `*.measure.ts` is never run by the suite.
- Automatic updates (`auto_publish`) and partial writes (`partial_writes`) are switched on in the
  local stack for every run, as the spec says ("with automatic updates on"), and off after it.
  Production keeps both off; this phase never reached it.
- The three extra accounts are minted on the local stack only (the scene refuses any other
  backend), the way `teams.spec.ts` mints its third account, and deleted after the run.

"Press": the Take button's `click` event. "Ran": the output's graphic calls `play()` for that Take
(the W3 "ran"), on the same time origin (one Playwright run, one machine).

## Where it ran

One Claude cloud worker (4 CPUs, 13.4 GiB), the configured suite's local Supabase stack
(127.0.0.1, all 118 migrations), headless Chromium, every page and the output in one Playwright
run. The judged runs use the e2e build (`vite build --mode e2e` with `VITE_MEASURE_HOOKS=1`,
served by `vite preview`), as phases 6 and 7 judged timing on a bundled build. Unthrottled.

## Results

### Ten minutes, five people (`soak`, job j-0022)

Five accounts for 600 s, automatic updates and partial writes on; ticks every 4 s (editors type
together on each, the Goal on every 3 s), a message every 15 s. The first editor's page reloaded at
240 s; the second editor's browser was offline from 360 s to 380 s and kept typing.

| Check | Result |
|---|---|
| Takes | 476 pressed, 476 ran on the output, 0 lost |
| Press to ran (all 476) | p50 31.9, p95 62.3, max 116.4 ms |
| Quick button | 199 Goals pressed; the production's score reads 199 |
| Messages | 39 pasted, 39 prepared; every one is a cue in the team's record |
| Editors | 149 texts each; each cue's last text (`#149`) is in the team's record, in the publication and on all five pages, 9.5 s after the run ended |
| Cues nobody edited | the three lower thirds and the score keep their text |
| Conflicted copies | none in any of the five accounts |
| Role errors | none |

No command lost and no different cue overwritten: met.

### Press to ran: five pages against a single page (`pair`)

Twelve interleaved pairs over six jobs (j-0023 to j-0028), each job a fresh scene with two rounds;
each round runs 45 s with everyone working and 45 s with only the taker's page open (every other
page closed), the order alternating per round and per job.

| | Takes | p50 | p95 |
|---|---|---|---|
| Five pages, everyone working | 505 | 31.8 ms | 66.2 ms |
| A single page | 613 | 20.2 ms | 29.6 ms |

**Pooled p95 difference +36.6 ms** (bootstrap over pairs, 5 to 95 %: +29.6 to +39.6 ms), within
50 ms: met. Per pair (everyone / alone, p95 ms): 69/28, 54/38, 54/27, 57/28, 75/27, 68/32, 67/35,
47/26, 68/30, 58/27, 66/27, 72/33. No Take lost on either side, no role error. Summary:
`node e2e/configured/measure/summarize-five.mjs --dir <MEASURE_OUT>`.

All pages share one 4-CPU machine with the output and the servers, so part of the difference is
four more browsers competing for the same CPUs; on separate computers it can only be smaller or
the same, never measured here.

### 10 and 15 pages

The same ten-minute run with more people, on the same scene and machine: the extra people are
editors, each typing into a cue of their own on every tick (the first reloads, the second goes
offline, as above). Reported as tested numbers, not judged (AC-6).

| Pages | Job | Takes (lost) | Press to ran p50 / p95 / max | Goals / score | Messages / cues | Editors whose last text stood |
|---|---|---|---|---|---|---|
| 5 | j-0022 | 476 (0) | 31.9 / 62.3 / 116 ms | 199 / 199 | 39 / 39 | 2 of 2 |
| 10 | j-0029 | 216 (0) | 86.2 / 185.7 / 371 ms | 199 / 199 | 39 / 39 | 4 of 7 |
RESULTS_15

**A lost edit at 10 pages (#2565).** Three of the seven editors' last texts were missing on every
page, their own included, 90 s after the run: the record held `#148` or `#147` where `#149` was
typed. Cause, read from the code: `refreshOnce` in `src/backend/teamProductions.ts` takes the set of
productions with an edit on its way up before it awaits the teammates' documents, then applies the
fetched record over an edit made during that await. More editors mean more fetches, so it shows
with seven editors and not with two. It is not #2562 (one account on two devices) and is outside
this phase's scope; filed as #2565 (P1) and reported to the coordinator. No conflicted copy, no
Goal or message lost, no Take lost.

### The configured spec

`npx playwright test --config=playwright.live.config.ts e2e/configured/five-people.spec.ts
--repeat-each 2` on the local stack (job j-0004): 2 passed, 1.1 and 1.2 minutes. The CI run on the
pull request's head runs it in the configured selection. Its two editors can in principle meet
#2565; in every five-page run here (ten minutes, twelve pairs, five shorter runs) they never did.

## #2562 and #2557

- **#2562** (an edit after another device's edit goes to a conflicted copy): not met. It needs one
  account on two devices; AC-6's five people are five accounts on a team production, whose saves
  go through the team record's compare-and-swap, not the personal sync. Every run checked every
  account's library for "(conflicted copy)" and found none. No fix in this phase; #2562 stays open
  for the owner's step 10.
- **#2557** (a parts publish compares only the stamp number): not met. It needs an unpublish followed
  by a teammate's republish; no role unpublishes. It stays open, to close before `partial_writes`
  goes on in production.
- **#2502** (automatic updates on a team production): the configured spec now drives a team
  production with automatic updates on, end to end: teammates' saves reach the publication with no
  press, two editors saving at once leave both texts published. The Node test of
  `confirmedRevision`'s team branch it also asks for is not written here.

## Not checked here

- A hosted backend and the studio network: the local stack answers in about a millisecond.
- People on separate machines: every page shares one 4-CPU machine with the output and the
  servers, so CPU contention is part of every number.
- A throttled line: not run for AC-6 (the rule above fixes the unthrottled case).
- Hardware: CasparCG, vMix and physical panels. All in `../phase-9-checklist.md`.

## Traps met

- A queued command must start with the test runner (`. guard.sh && VAR=1 npx playwright test ...`):
  a wrapper script in front of it hides it from the queue, which then runs it as a non-browser job
  beside another browser job (two dev servers on one port) and never grants a 12-minute admission.
- The bundled build installs the test door (`__noacgImport`) only in e2e mode
  (`vite build --mode e2e`); a plain `vite build` with `VITE_MEASURE_HOOKS=1` does not.
- A 12-minute queue admission is one per commit and pinned to a clean checkout at that commit; the
  long runs ran from a second, detached worktree so editing could go on.
- The development server on one machine with five pages reads press to ran about twice the bundled
  build's (p95 188 against 80 ms alone in one dev-server round); the judged numbers are the bundle's.
