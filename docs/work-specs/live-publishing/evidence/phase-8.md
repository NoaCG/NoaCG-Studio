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
- `e2e/configured/teams.spec.ts`, describe "five accounts at once": the configured spec (AC-6's
  layer), in the team flow's maintained file rather than a new one (root rule: one journey spec per
  flow, extended in its file; a new configured file is also priced as backend-tier growth). A 30-second run with
  everything above, judged on correctness: every Take ran on the output, the score moved once per
  Goal, every message became a cue, each editor's last text is in the team's record, in the
  publication and on every page, the taker's and the score's cues keep their text, and no
  "(conflicted copy)" exists in any account. It fits the suite's 120 s per-test ceiling.
- `e2e/configured/measure/five.measure.ts` (`soak`, `pair`) and `summarize-five.mjs`: the same
  scene run long and timed; `*.measure.ts` is never run by the suite.
- Automatic updates (`auto_publish`) and partial writes (`partial_writes`) are switched on in the
  local stack for every run, as the spec says ("with automatic updates on"), and off after it.
  Production keeps both off; this phase never reached it.
- Every person but the first (the suite's own account, the team owner) is an account minted on the
  local stack only (four for five people; the scene refuses any other backend), the way
  `teams.spec.ts` mints its third account, and deleted after the run.

"Press": the Take button's `click` event. "Ran": the output's graphic calls `play()` for that Take
(the W3 "ran"), on the same time origin (one Playwright run, one machine). It is the first play in
any of the output's frames after the press: during a run only the taker takes (the score goes on air
in set-up and then only updates), so no other play is expected, and a Take with no play within
10 s counts as lost.

## Where it ran

One Claude cloud worker (4 CPUs, 13.4 GiB), the configured suite's local Supabase stack
(127.0.0.1, all 118 migrations), headless Chromium, every page and the output in one Playwright
run. The judged runs use the e2e build (`vite build --mode e2e` with `VITE_MEASURE_HOOKS=1`,
served by `vite preview`), as phases 6 and 7 judged timing on a bundled build. Unthrottled.

## Results

### On `main` with #2567 and #2573 (2026-11-17): the judged runs

`origin/main` with #2573 landed (67d04688) merged into the branch; no file under `src/` differs from
`main`. Same machine, local stack, bundled build for the timed runs. These are the runs AC-6 is
judged on.

| Run | Jobs | Result |
|---|---|---|
| Configured five-person check | j-0120, j-0121 (branch db32b7d9); j-0129, j-0130 (8d2d677e, the final scene) | **12 of 12 passed**; no run lost any editor's last text |
| Ten minutes, five people (`soak`) | j-0122 (db32b7d9) | 398 Takes, 0 lost; press to ran p50 42.2, p95 81.8, max 196.5 ms; 199 Goals, score 199; 39 of 39 messages are cues; both editors' `#149` in the record, the publication and all five pages, 12.4 s after the run; one reload; offline 360.1 to 380.1 s; no conflicted copy; no role error |
| Ten minutes, five people, again | j-0131 (8d2d677e) | 432 Takes, 0 lost; press to ran p50 38.3, p95 72.9, max 156.5 ms; 199 Goals, score 199; 39 of 39 messages are cues; both editors' `#149` in the record, the publication and all five pages, 11.8 s after the run; one reload; offline 360.0 to 380.1 s; no conflicted copy; no role error |
| Interleaved pairs, first 12 | j-0123 to j-0128 (db32b7d9) | five pages p95 84.4 ms, a single page 36.1 ms; difference +48.3 ms (bootstrap 5 to 95 %: +37.5 to +53.5 ms) |
| Interleaved pairs, second 12 | j-0132 to j-0137 (8d2d677e) | five pages p95 64.3 ms, a single page 33.9 ms; difference +30.4 ms (+26.6 to +36.1 ms) |
| **All 24 pairs, pooled** | | five pages p95 71.8 ms (918 Takes), a single page 34.8 ms (1159 Takes); **pooled p95 difference +37.0 ms** (bootstrap 5 to 95 %: +32.6 to +43.1 ms); 0 lost, no role error: **met** |

Per pair (everyone / alone, p95 ms), first set: 85/38, 99/35, 105/44, 105/31, 88/35, 77/33, 95/47,
63/35, 80/32, 74/32, 104/32, 111/34; second set: 78/31, 68/32, 69/38, 81/33, 58/29, 70/29, 60/32,
65/36, 60/33, 58/32, 56/39, 64/32.

Ten pages with #2573 (j-0138, branch b0977da9, settle 30 s), reported, not judged: 151 Takes, 0
lost; press to ran p50 95.7, p95 199.4, max 460.9 ms; 199 Goals, score 199; 39 of 39 messages are
cues; one reload; offline 360.6 to 380.6 s; no conflicted copy; no role error. **No editor's last
text stood (0 of 7).** Each cue's record stopped partway, at `#86` to `#117` of 149, and every page,
the typist's own included, showed about the same number, never `#149`. The earlier ten-page runs
kept 4 of 7 (no fix) and 1 of 7 (#2565's fix only).

Diagnosed as a save backlog, not loss (#2589, P1). Two 8-minute ten-page runs probed each editor's
own page at the end and 30 s later. With #2573 (j-0139): every editor's box held the typed `#119`,
every save was pending with an edit owed, several showed "Teammates keep saving this production -
your edit is on screen but not saved yet.", and the records stood at `#81` to `#113`. With #2573
reverted in a local scratch copy (j-0140, never pushed): every record held `#119` and nothing was
owed after 30 s. So the backlog comes with #2573; nothing typed was discarded in either run. It is
#2589's to fix; AC-6, at five people, is met with #2573 in place.

**AC-6: met.** No command lost (every Take ran, every Goal counted, every message a cue), no
different cue overwritten (each editor's last text in the record, the publication and every page;
the cues nobody edited kept their text; no conflicted copy), press to ran within 50 ms p95 of a
single page (+37.0 ms pooled over 24 pairs, the rule fixed before the runs; the coordinator set the
24-pair pool when the first 12 came out near the limit).

The same machine measured +28.2 ms without #2573 and +18.0 ms with an earlier version of it. The
first 12 pairs with #2573 (+48.3 ms) were the slowest set of the day; the second 12 (+30.4 ms) are
close to the run without it. Both sets share one 4-CPU machine with every page and the servers, so
the difference between the sets is within what this machine varies by; it is not shown that #2573
costs the five-page case more.

### On `main` with #2567, and #2573 at c9cc8682 (2026-11-17)

Merged `origin/main` b1fb1b9e (branch head 10fc5ed8), which holds #2567 (#2565's fix). The branch
also still held #2573's fix of #2572 as of c9cc8682, merged in on 2026-11-14 for the measurements,
so these runs had both fixes. Same machine, local stack, bundled build for the timed runs.

| Run | Jobs | Result |
|---|---|---|
| Configured five-person check | j-0094 (2), j-0102 (3), j-0107 (3) | 8 of 8 passed; no run lost any editor's last text |
| Ten minutes, five people (`soak`) | j-0104 | 472 Takes, 0 lost; press to ran p50 33.2, p95 62.8, max 224.5 ms; 199 Goals, score 199; 39 of 39 messages are cues; both editors' `#149` in the record, the publication and all five pages, 12.2 s after the run; one reload; offline 360.0 to 380.1 s; no conflicted copy; no role error |
| Ten minutes, five people, again (`soak`, from commit f12ce841, docs only since j-0104) | j-0108 | 469 Takes, 0 lost; press to ran p50 33.6, p95 60.4, max 192.6 ms; 199 Goals, score 199; 39 of 39 messages are cues; both editors' `#149` in the record and on all five pages, 12.1 s after the run; one reload; offline 360.0 to 380.1 s; no conflicted copy; no role error |
| Interleaved pairs | j-0096 to j-0100, j-0105 | 12 pairs; five pages p95 41.3 ms, a single page 23.3 ms; **pooled p95 difference +18.0 ms** (bootstrap 5 to 95 %: +14.8 to +22.3 ms); 0 lost, no role error: met |

Not counted: the first pass of j-0094 also ran the file's other team walks, and two of them failed
on that pass only, then passed on the next two passes. This branch does not change them.
- "two accounts" (a team asset key in the `s256-` form where the walk expects the older form):
  measurement runs killed on 2026-11-14 and by a container restart had left `partial_writes` on in
  the local stack until the first five-person test's clean-up turned it off. With both switches on
  it fails every time (j-0110); with them off the whole file passes 6 of 6 (j-0109). The walk
  assumes `partial_writes` off: #2586, on the phase 9 switch-on list.
- "signed in" (the share door's `move-explainer` not shown within 20 s): once, on a cold stack just
  after a restart; it passed with the switches on (j-0110) and off (j-0109, and j-0094's next
  passes). Noted here; it goes to quarantine only if it fails in CI. j-0094's third pass and j-0102's fourth run were stopped by the queue's 5-minute
limit, not failed, and j-0101 by a container restart; none of those is counted.

The earlier report that the five-person check lost a typed text (an editor typed `#9`, every page
kept `#8` or `#7`) was j-0034, on code without any fix for #2565. With #2567 and #2573's fix, eight
runs in a row kept every last text. The runs without #2573 are in the next section.

### On `main` with #2567, without #2573 (2026-11-17)

The branch with #2573's changes taken out (no file under `src/` differs from `main` b1fb1b9e;
branch head 24f109bc). Same machine, local stack, bundled build for the timed runs.

| Run | Jobs | Result |
|---|---|---|
| Configured five-person check | j-0111 (3), j-0112 (3) | **5 of 6 passed.** In one run the editor whose connection drops typed `#9`; 30 s later the team's record still held `#8` and the publication did not have `#9`. No trace survived to say whether this is #2572 or a separate path. |
| Ten minutes, five people (`soak`) | j-0113 | 461 Takes, 0 lost; press to ran p50 34.4, p95 64.6, max 122.0 ms; 199 Goals, score 199; 39 of 39 messages are cues; both editors' `#149` in the record and on all five pages, 12.1 s after the run; one reload; offline 360.0 to 380.1 s; no conflicted copy; no role error |
| Interleaved pairs | j-0114 to j-0119 | 12 pairs; five pages p95 62.2 ms, a single page 34.0 ms; pooled p95 difference +28.2 ms (bootstrap 5 to 95 %: +25.5 to +30.6 ms); 0 lost, no role error |

So without #2573, AC-6's "no different cue overwritten" does not hold every time at five people
(1 of 6 short runs lost an editor's last text). This pull request waits for #2573; the runs are
repeated on `main` once it lands.

### Ten minutes, five people (`soak`, job j-0022)

Five accounts for 600 s, automatic updates and partial writes on; ticks every 4 s (editors type
together on each, the Goal on every 3 s), a message every 15 s. The first editor's page reloaded at
240 s; the second editor's browser went offline at 360 s and kept typing, and came back on the
first tick at least 20 s later (20 to 24 s; a later commit brings it back on its own 20 s clock).

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
| 10, with the #2565 fix | j-0039 | 214 (0) | 87.0 / 254.7 / 382 ms | 199 / 199 | 39 / 39 | 1 of 7 (#2572) |
| 15 | j-0032 | 91 (0) | 161.8 / 560.1 / 874 ms | see below | 39 / 38 | 2 of 12 |

**15 pages overran the test machine.** Sixteen browser pages and the servers on one 4-CPU machine:
after about 6.5 minutes every role's clicks and typing timed out (the taker stopped after 91 Takes,
all of which ran; the editors after 99 or 100 of their 149 ticks; the quick button never pressed,
because its set-up Take timed out on that commit). The record then held each editor's last text
for 2 of the 12, and one prepared message had no cue. Both are what #2565 does, but with the pages
stalled the run cannot separate it from texts that never left a frozen page, so the 15-page row
says what this machine carries, not what the product does with 15 people.

**A lost edit at 10 pages (#2565).** Three of the seven editors' last texts were missing on every
page, their own included, 90 s after the run: the record held `#148` or `#147` where `#149` was
typed. Cause, read from the code: `refreshOnce` in `src/backend/teamProductions.ts` takes the set of
productions with an edit on its way up before it awaits the teammates' documents, then applies the
fetched record over an edit made during that await. More editors mean more fetches, so it showed
here first. It is not #2562 (one account on two devices). Filed as #2565 (P1), reported to the
coordinator. #2567 fixed it on `main` (merge 4f11d145); this phase's own fix of the same cause (#2570) was closed as a duplicate. No conflicted
copy, no Goal or message lost, no Take lost.

**A second path, with the fix (#2572).** Run again with #2570's fix of #2565 applied (j-0039), the 10-page run
still lost the last text of 6 of 7 editors. A shorter diagnostic run (j-0040, 2.5 minutes, 3 of 7
lost) read each editor's own page 60 s after the typing stopped: the cue editor's input itself
showed the previous text (`#36` where `#37` was typed), with nothing unsent, no save pending and no
note. So the typed text is dropped on the typist's page before or while it becomes the record, not
during the team read. Filed as #2572 (P1) and reported to the coordinator; its fix is #2573, which this phase waits for before the 10-page run is repeated.
The five-page runs never met it (ten minutes, twelve pairs, the configured check three times).

### The configured spec

The test, run alone with `--repeat-each 2` on the local stack: 2 passed (j-0004, 1.1 and 1.2
minutes), 2 passed again on the scene after the review fixes (j-0033, 1.3 and 1.2 minutes), both
when it was its own file, on the development server. Moved into `teams.spec.ts` and run after that
file's other walks, it failed twice in a row on #2565 (j-0034); with #2570's fix of #2565 the whole file
passed 6 of 6 three times (j-0035 to j-0037). The CI run on the pull request's head runs it in the
configured selection.

## #2565, #2562 and #2557

- **#2565** (a team edit made while the page reads teammates' changes is lost): met. First in the
  10-page run (below), then by AC-6's own configured check once it moved into `teams.spec.ts`: run
  after that file's other team walks, it failed twice in a row (job j-0034; an editor typed `#9`,
  the record and every page kept `#7`). The team read runs on window focus, and each person's typing
  focuses their page, so the window opened often. Fixed first, as its own Risky pull request
  (#2570, rules before code, a Rules-first and a final `/so`); with that fix the whole file passed
  three times (j-0035 to j-0037). #2567 landed the same fix on `main` first, so #2570 was closed as
  a duplicate; the runs below are on `main` with #2567.

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
