# Phase 9 on hosted staging, rerun after the load fixes, 2026-11-21

AC-6 checked again on hosted staging (project `garafohbzmsybtysxphb`), with 3 people as the pass
mark (owner decision, 2026-11-20). Source: `main` at d882121, which holds #2620, #2624, #2627,
#2630 and #2646; all their migrations are applied to staging. The failed run before the fixes is
in `phase-9-cloud/README.md` and the diagnosis in `phase-9-load-diagnosis.md`.

**Verdict for AC-6 at 3 people: failed.** One of the two pass-mark runs lost 8 of 163 Takes. Texts
held in every run, and the timing difference is inside 50 ms on its point estimate, but the
bootstrap range does not exclude more than 50 ms. Defect filed: #2657 (P1, area: control).

## How it ran

- **Staging only, same route as before.** Every run went through `.github/workflows/hosted-latency.yml`
  with its `spec` input, on the scratch branch `scratch/p9-rerun-3p` (not for `main`). The job's
  "Configured backend" line named `garafohbzmsybtysxphb.supabase.co` on every run, and each
  instrument refused anything but the declared staging target and the production ref. No
  production variable was used and no Supabase management API call was made.
- **Accounts.** The workflow's `e2e-s1@noacg.staging` and the scene's own per-run members
  (`e2e-five-<n>@noacg.staging`). No other account was created.
- **Instruments.** Phase 8's scene (`e2e/configured/_five.ts`) with `phase-9-cloud/instruments.patch`
  applied to current `main`, plus a small layer for this rerun: `team_designs` added to the switches
  read and written, every switch put back to what the run found, each request to staging timed from
  every page (`requestfinished`, per minute), and the publish attempts recorded. The whole scratch
  diff is `phase-9-staging-rerun/instruments.patch`. No product code changed.
- **Runner.** One GitHub `ubuntu-latest` runner per run, every person a browser context on it,
  against the app's dev server. Absolute times are dev-server times, as in the earlier run.
- **Timing method.** Phase 8's interleaved pairs: 45 s with everyone working, 45 s with the taker
  alone, order alternating by round; pooled p95 difference with a 2,000-draw bootstrap over pairs
  (`phase-9-cloud/pairsum.py`, unchanged).

## Runs

| Run | What | Result |
|---|---|---|
| [44885417409](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44885417409) | 1a: 3 people, switches on, 10 min | no Take lost |
| [44886497545](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44886497545) | 1a: 7 pairs, switches on | +97.6 ms |
| [44887585681](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44887585681) | 1b: 3 people, switches on, 10 min | **8 of 163 Takes lost** |
| [44888619087](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44888619087) | 1b: 7 pairs, switches on | +1.2 ms |
| [44889834729](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44889834729) | 2: 3 people, switches as production, 10 min | 4 of 233 Takes lost |
| [44890935469](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44890935469) | 3: 5 people, switches on, 10 min | 19 of 51 Takes lost |
| [44892116622](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44892116622) | 4: step 7, first try | instrument error (below); typing never ran |
| [44893908401](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44893908401) | switch check after the timed-out step 7 | found all off, left all off |
| [44894000539](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44894000539) | 4: step 7 | publish landed in 64 s; no Take lost |

Each run's `hosted-results-1` artifact holds its JSON; GitHub keeps them 14 days. The numbers
used here are copied into `phase-9-staging-rerun/*.json`.

## Switches

"On" means `auto_publish`, `partial_writes`, `team_designs` and `production_copies` all on. "As
production" means the three new switches off and `production_copies` on (production has it on,
`e2e/configured/publish-guard.spec.ts`). `team_designs_state()`, asked as the signed-in owner,
reported `installed: true` and the expected `on` in every run.

| Run | Before | During | After |
|---|---|---|---|
| 1a soak | auto off, partial off, copies off, designs **no row** | all on | all off |
| 1a pairs, 1b soak, 1b pairs | all off | all on | all off |
| 2 | all off | auto off, partial off, copies on, designs off | all off |
| 3 | all off | all on | all off |
| 4 first try | all off | auto off, partial off, copies on, designs on | not logged (test timed out) |
| switch check | all off | (none) | all off |
| 4 | all off | auto off, partial off, copies on, designs on | all off |

At the end staging stands as found, except that `team_designs` now has a row saying off where it
had none (both read as off, as with `production_copies` after the first cloud check).

## Run 1: the pass mark, 3 people, switches on

Roles: a taker, two editors typing a new text into their own cue every 4 s. One editor reloads at
40 %, the other goes offline for 20 s at 60 %. The scene has no Goals and no messages.

| | 1a (44885417409) | 1b (44887585681) |
|---|---|---|
| Takes, never ran | 270, **0** | 163, **8** |
| Press to ran | median 192 ms, p95 272 ms | median 649 ms, p95 6,344 ms |
| Out still disabled 15 s after a Take | 0 | 3 |
| Editor A last text (149 typed) | on the record, published, on all 3 pages | on the record, published, on all 3 pages |
| Editor B last text (95 typed) | on the record, published, on all 3 pages | on the record, published, on all 3 pages |
| Settled after the run | 9.3 s | 17.6 s |
| "(conflicted copy)" | none | none |
| Reload, 20 s offline | done | done |

**Pairs**, 14 pooled (7 from 44886497545, 7 from 44888619087; `pairs-pooled.json`):

| | Takes timed | median | p95 | never ran |
|---|---|---|---|---|
| taker alone | 449 | 192 ms | 341 ms | 0 |
| 3 people working | 340 | 211 ms | 348 ms | 0 |
| **difference** | | | **+7.1 ms** (bootstrap 95 %: -59.3 to +108.1) | |

Per dispatch: +97.6 ms over the first 7 pairs (one round where staging slowed to a p95 of
606 ms), +1.2 ms over the second 7. Both dispatches happened to start with the taker alone in
round 0 (odd run numbers); the order still alternated round by round.

### AC-6 verdict, item by item

| Item | Result |
|---|---|
| No Take lost (each Take airs) | **failed.** 1a: 0 of 270. 1b: 8 of 163 never ran on the output within 10 s. |
| No editor's last text lost, no different cue overwritten | **ok.** Both runs: each editor's last text on the record and on all 3 pages, on its own cue; nothing in any other cue; no conflicted copy. |
| Goals and messages all counted | **not in the scene** (taker and two editors only). Run 3 below has them. |
| Press to ran within 50 ms p95 of a single page | **not shown.** Pooled difference +7.1 ms over 14 pairs is inside 50 ms, but the bootstrap range reaches +108.1 ms, so 50 ms is not excluded. |

### Staging response times during run 1

All requests to staging from every page, per minute of the 10-minute run (`staging` in the JSON):

| Minute | 1a median / p95 / max (ms) | 1b median / p95 / max (ms) |
|---|---|---|
| 0 | 130 / 243 / 954 | 147 / 1,184 / 6,914 |
| 1 | 128 / 222 / 1,265 | 660 / 8,574 / 12,024 |
| 2 | 126 / 204 / 316 | 2,631 / 11,119 / 19,326 |
| 3 | 127 / 196 / 338 | 711 / 25,443 / 41,300 |
| 4 | 127 / 208 / 945 | 641 / 5,159 / 11,521 |
| 5 | 128 / 227 / 527 | 1,171 / 24,919 / 33,641 |
| 6 | 129 / 214 / 984 | 882 / 5,408 / 12,792 |
| 7 | 130 / 264 / 2,012 | 912 / 9,746 / 25,348 |
| 8 | 137 / 737 / 3,975 | 667 / 4,835 / 9,581 |
| 9 | 132 / 241 / 512 | 325 / 2,343 / 6,272 |
| whole run | 129 / 236 / 3,975; 3,114 requests, 0 cancelled | 593 / 10,303 / 41,300; 2,270 requests, 165 cancelled |

The pairs runs, from the taker's page: 1a median 129 ms, p95 180 ms; 1b median 195 ms, p95 323 ms.
The workflow's own probe before each run read 145 to 173 ms a request.

1a and 1b ran the same scene and the same load ten minutes apart. In 1b staging slowed from its
second minute and the Takes were lost then. Why staging slows in one run and not the other cannot
be read from here (only the REST keys are available); #2657 asks for the staging dashboard for
those minutes. Either way the loss is on the Take path: no text was lost in 1b.

## Run 2: 3 people, switches as production has them (information)

Run 44889834729, the same scene and roles, `auto_publish`, `partial_writes` and `team_designs`
off, `production_copies` on.

- Takes: 233, **4 never ran**; press to ran median 201 ms, p95 3,331 ms, max 9,833 ms.
- Both editors' last texts on the record and on all 3 pages; not published, as expected with
  `auto_publish` off. No conflicted copy. Settled 12.3 s after the run.
- Staging: median 292 ms, p95 4,359 ms, max 19,084 ms; 123 of 3,201 requests cancelled. Slow in
  minutes 1 to 6 (medians 0.5 to 1.2 s, p95 up to 12.4 s), then about 145 ms from minute 7.

For Monday without `team_designs`: three people keep their texts, but Takes can still fail to air
while staging is slow, as with it on.

## Run 3: 5 people, switches on (information)

Run 44890935469, phase 9 step 9's roles: taker, messages (paste, prepare a cue every 15 s), quick
button (Goal every 3 s), two editors.

| Check | This run | Before the fixes (phase-9-cloud) |
|---|---|---|
| Takes never ran | **19 of 51** | 18 of 52 |
| Press to ran | median 312 ms, p95 7,808 ms | median 1,422 ms, p95 9,698 ms |
| Goals counted | **199 of 199** (score 199) | 55 of 199 |
| Messages that became cues | 22 of 39 (17 rows not shown or not added within 20 s) | 25 of 39 |
| Editors' last texts | both on the record and all 5 pages; one published, one not yet | both held |
| Conflicted copy | none | none |

Out stayed disabled 15 s after 14 Takes; 7 of those pages showed "Take is on this monitor only.
It may not have reached the screens or the log (the server did not answer). Send it again." The
dev server logged "Data read failed: canceling statement due to statement timeout" once.

Staging: median 1,179 ms, p95 39.4 s, max 85.5 s; 440 of 3,439 requests cancelled. Per-minute
medians 0.2, 2.3, 2.1, 5.1, 2.4, 2.3, 1.0, 21.7, 0.4 and 5.4 s.

## Run 4: step 7, two typists on 60 graphics, `team_designs` on (information)

Switches: `team_designs` and `production_copies` on, `auto_publish` and `partial_writes` off.

**The 60-graphic publish now lands.** Run 44894000539: on the first press, 64.4 s from the press
to the production reading as started. Before the fixes it failed five times with a statement
timeout. In the first try (44892116622) the same publish also landed; its trace shows the
`control_shows` write answered 201 in 15.8 s, after six `team_designs_put` calls of 1.0 to 6.4 s,
about 46 s after the press. That try failed as an instrument error: the publish helper stops
waiting at 30 s, the scene pressed Publish again on a button already disabled, and the test hit
its 20-minute limit. The rerun waits up to 180 s for a publish that is still landing. That is a
change to the instrument only, not to what is judged.

Two rounds of 60 s with both typing key by key, each against 60 s of the taker alone:

| | Takes | never ran | press to ran |
|---|---|---|---|
| both typing | 11 | 0 | 262 to 6,921 ms (round 1: 1.8 to 6.9 s) |
| taker alone | 21 | 0 | 195 to 3,841 ms |

- Each typist reached only 8 to 11 texts a minute, because every key waits on the page.
- Each typist's last text reached the record and all 3 pages, 25 s and 33 s after the round. Not
  published, as expected with `auto_publish` off. No conflicted copy, no other cue changed.
- Staging during the step: median 347 ms, p95 6.0 s, max 16.8 s; 23 of 746 requests cancelled.
  Slow in minutes 4 and 5 (medians 0.8 and 1.4 s).

## Defects

- #2657 (P1, area: control): Takes do not air with three people when staging answers slowly,
  after the load fixes. New at the 3-person pass mark; same signature as the five-person loss
  before the fixes.
- Not a product defect: the shared publish helper `e2e/_publish.ts` waits 30 s, shorter than a
  60-graphic publish on staging. Only this rerun's instrument was changed.

UTC time of the last run's end: 2026-11-21 10:34.

## Second rerun, after the Take fix (#2662), 2026-11-21 afternoon

Source: `main` at 5634c2f, which adds #2662 (the fix for #2655; #2657 above was closed as its
duplicate). Same instruments: `phase-9-staging-rerun/instruments.patch` applied unchanged to
5634c2f on the scratch branch `scratch/p9-rerun-3p-2` (not for `main`), the same route through
`hosted-latency.yml`, the same accounts, the same judgement. Data: `phase-9-staging-rerun-2/`, the
JSON files each run wrote, named by run.

**Verdict for AC-6 at 3 people: failed on timing only.** No Take was lost in any run and every
text held, but the pooled p95 difference over 14 pairs is +189 ms (bootstrap 95 %: -474 to +869),
above 50 ms. A new publish defect showed up in step 7: #2667.

### Runs

| Run | What | Result |
|---|---|---|
| [44919806869](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44919806869) | 1a: 3 people, switches on, 10 min | 0 of 366 Takes lost |
| [44921040603](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44921040603) | 1a: 7 pairs, switches on | +820.4 ms |
| [44922393066](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44922393066) | 1b: 3 people, switches on, 10 min | 0 of 249 Takes lost |
| [44923696718](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44923696718) | 1b: 7 pairs, switches on | -6.4 ms |
| [44925104806](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44925104806) | 2: 3 people, switches as production, 10 min | 0 of 248 Takes lost |
| [44926364732](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44926364732) | 4: step 7, 60 graphics, `team_designs` on | publish timed out twice, landed on the third press at 434 s |

### Switches

Every run read them before, during and after (`*-switches-*.json`). Before each run: all four off.
During: as in the first rerun ("on" for runs 1; `production_copies` only for run 2;
`team_designs` and `production_copies` for step 7). After each run: all four off, read back with
the service role. Staging stands as this rerun found it: `auto_publish`, `partial_writes`,
`production_copies` and `team_designs` off.

### Run 1: the pass mark

| | 1a (44919806869) | 1b (44922393066) |
|---|---|---|
| Takes, never ran | 366, **0** | 249, **0** |
| Press to ran | median 224 ms, p95 528 ms, max 5,167 ms | median 213 ms, p95 1,448 ms, max 7,782 ms |
| Editor A last text (149 typed) | on the record, published, on all 3 pages | on the record, published, on all 3 pages |
| Editor B last text (95 typed) | on the record, published, on all 3 pages | on the record, published, on all 3 pages |
| Settled after the run | 10.5 s | 25.4 s |
| "(conflicted copy)" | none | none |
| Reload, 20 s offline | done | done |

**Pairs**, 14 pooled (`pairs-pooled.json`):

| | Takes timed | median | p95 | never ran |
|---|---|---|---|---|
| taker alone | 409 | 172 ms | 592 ms | 0 |
| 3 people working | 305 | 196 ms | 781 ms | 0 |
| **difference** | | | **+189.1 ms** (bootstrap 95 %: -474.0 to +869.4) | |

Per dispatch: +820.4 ms (bootstrap -1,081 to +1,381) and -6.4 ms (-406 to +672). Both started
with everyone working in round 0 (even run numbers); the order alternated round by round. The
slow tail is in both modes: in 1a, round 2 alone had a p95 of 1,281 ms and round 6 alone one Take
at 5,400 ms; with everyone working, rounds 1, 2, 3 and 6 each had one Take of 1.9 to 3.2 s. In 1b,
rounds 0 and 1 alone had p95s of 853 and 928 ms, and rounds 2 and 4 with everyone had 1,458 and
1,123 ms. Staging from the taker's page during the pairs: median 147 ms, p95 623 ms (1a); median
142 ms, p95 393 ms (1b).

### AC-6 verdict, item by item

| Item | Result |
|---|---|
| No Take lost (each Take airs) | **ok.** 0 of 366 and 0 of 249, and 0 lost in 28 pair rounds. |
| No editor's last text lost, no different cue overwritten | **ok.** Both runs: each editor's last text on the record and all 3 pages, on its own cue; no conflicted copy. |
| Goals and messages all counted | **not in the scene** (taker and two editors only). |
| Press to ran within 50 ms p95 of a single page | **failed.** +189.1 ms pooled over 14 pairs; the bootstrap range (-474.0 to +869.4) is wide, and the alone rounds show the same kind of tail, so staging's own swings are a large part of it. |

### Staging response times during runs 1 and 2

All requests to staging from every page (`*-soak.json`, `staging`):

| | 1a | 1b | 2 |
|---|---|---|---|
| whole run, median / p95 / max | 198 / 542 / 9,120 ms | 144 / 1,193 / 14,556 ms | 155 / 1,612 / 8,243 ms |
| requests, cancelled by the page | 3,246, 18 | 3,046, 38 | 3,465, 49 |
| slowest minute (p95) | minute 9: 2,240 ms | minute 9: 11,725 ms | minute 0: 3,175 ms |

The per-minute medians stayed between 133 and 358 ms in all three runs, except 671 ms in 1b's
last minute. Before the fix the same scene lost 8 Takes while staging's per-minute medians were
0.6 to 2.6 s; this time staging slowed less, so the runs show the fix kept every Take through
p95 spikes of 1 to 12 s, not through a slowdown as long as the one in the first rerun.

### Run 2: 3 people, switches as production has them (information)

Run 44925104806: 248 Takes, **0 never ran**; press to ran median 229 ms, p95 2,283 ms, max
4,387 ms. Both editors' last texts on the record and all 3 pages, not published (as expected with
`auto_publish` off), settled 4.3 s after the run. No conflicted copy.

### Run 4: step 7, 60 graphics, `team_designs` on (information)

Run 44926364732 (`4-step7-*.json`):

- **Publish:** press 1 answered "Publish failed: canceling statement due to statement timeout"
  213 s after it; press 2 the same at 406 s; press 3 landed, 434 s after the first press. This
  morning (44894000539) the same publish landed on the first press in 64 s. Filed as #2667 (P2,
  area: control).
- Then two rounds of 60 s with both typing key by key against the taker alone: 11 Takes with both
  typing and 19 alone, **none lost**. Press to ran with both typing 243 to 5,419 ms (one Take each
  round above 2 s); alone 147 to 361 ms.
- Each typist reached 6 or 7 texts a minute; each last text reached the record and all 3 pages
  15 to 19 s after the round, on its own cue, no conflicted copy.
- Staging during the typing: median 154 ms, p95 1,218 ms, max 18.1 s; 4 of 742 requests
  cancelled.

### Defects

- #2667 (P2, area: control): the 60-graphic publish can still fail with a statement timeout.
- The timing failure is not filed as a separate defect: no Take was lost, and the alone rounds
  carry the same tail. The coordinator decides whether the 50 ms rule is met by another method or
  needs a fix.

UTC time of the last run's end: 2026-11-21 17:00.

### Addendum: 14 more pairs (2026-11-21, 17:07 to 17:36 UTC)

Asked by the coordinator to narrow the timing range: two more dispatches of 7 pairs, switches on,
same method, same scratch branch and source (5634c2f). The 50 ms rule is unchanged.

| Run | Pairs | Difference | Bootstrap 95 % | Staging, taker's page: median / p95 / max |
|---|---|---|---|---|
| [44928271068](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44928271068) | 7 | +712.6 ms | +3.9 to +1,173.2 | 196 / 461 / 3,442 ms |
| [44929702637](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44929702637) | 7 | +818.5 ms | +170.3 to +1,231.2 | 160 / 510 / 6,805 ms |

Pooled (`pairs-pooled-new14.json`, `pairs-pooled-28.json`):

| | Pairs | 3 people p95 | alone p95 | Difference | Bootstrap 95 % |
|---|---|---|---|---|---|
| the new 14 | 14 | 1,135 ms (301 Takes) | 382 ms (419 Takes) | **+753.2 ms** | +162.6 to +1,014.5 |
| all 28 | 28 | 987 ms (606 Takes) | 457 ms (828 Takes) | **+529.8 ms** | +8.0 to +818.6 |

- **Timing: failed.** Over the new 14 the whole bootstrap range is above 50 ms; over all 28 the
  point estimate is +530 ms and the range starts at +8 ms.
- The tail is in the 3-person rounds: 8 of the 14 new 3-person rounds have a p95 above 900 ms
  (928 to 3,233 ms), against 1 of the 14 alone rounds (1,046 ms). The staging p95 seen from the
  taker's page in those 8 rounds was 388 to 1,621 ms, and under 1 s in 5 of them (388 to 960 ms),
  so those slow Takes are not explained by slow staging answers alone.
- **One Take did not run within 10 s** (44929702637, round 5 with everyone working; Out was not
  left disabled and no note showed). Staging's slowest answer to the taker in that round was
  6,805 ms. Every other Take across the 28 pairs ran.
- Switches: all four off before each dispatch, on during, off after, read back
  (`1c-pairs-switches-*.json`, `1d-pairs-switches-*.json`).

UTC time of the addendum's last run end: 2026-11-21 17:36.

### Addendum: pairs with the switches off and as production (2026-11-21, 17:38 to 18:24 UTC)

Asked by the coordinator: the same pairs method, one dispatch of 7 pairs with all four switches
off, one with the switches as production has them (`production_copies` on, the other three off).
Same scratch branch and source (5634c2f); the 50 ms rule unchanged. Files: `off-pairs-*.json`,
`prod-pairs-*.json`. Each dispatch started with the taker alone in round 0.

| | All four off | As production |
|---|---|---|
| Run | [44931119423](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44931119423) | [44932505778](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44932505778) |
| Takes with 3 people: timed, never ran | 181, 0 | 68, **8** |
| Takes alone: timed, never ran | 217, 0 | 101, **8** |
| 3 people p95 | 537 ms | 5,641 ms |
| alone p95 | 744 ms | 4,780 ms |
| **Difference** | **-206.6 ms** | **+860.5 ms** |
| Bootstrap 95 % | -760.3 to +582.5 | -1,753.1 to +3,777.3 |
| Staging, taker's page: median / p95 / max | 213 / 861 / 4,331 ms | 354 / 10,316 / 35,756 ms |
| Staging requests cancelled by the page | 22 of 1,320 | 289 of 758 |

Staging per round, from the taker's page (median / p95 / max, ms):

| Round | Off, 3 people | Off, alone | Production, 3 people | Production, alone |
|---|---|---|---|---|
| 0 | 211 / 557 / 776 | 224 / 907 / 1,410 | 1,057 / 10,316 / 10,316 | 226 / 1,149 / 9,755 |
| 1 | 240 / 1,266 / 2,133 | 292 / 1,696 / 2,152 | 1,457 / 11,125 / 11,125 | 1,183 / 35,735 / 35,756 |
| 2 | 214 / 645 / 943 | 205 / 731 / 1,336 | 267 / 9,029 / 15,719 | 3,882 / 22,055 / 27,384 |
| 3 | 225 / 750 / 2,204 | 216 / 805 / 929 | 329 / 1,441 / 2,313 | 225 / 824 / 24,589 |
| 4 | 209 / 1,582 / 4,331 | 195 / 317 / 364 | 249 / 2,743 / 2,918 | 202 / 399 / 430 |
| 5 | 217 / 995 / 1,921 | 204 / 888 / 1,116 | 774 / 4,096 / 9,362 | 1,019 / 15,447 / 26,163 |
| 6 | 213 / 1,517 / 1,689 | 200 / 351 / 590 | 1,142 / 11,227 / 11,227 | 2,891 / 23,997 / 33,800 |

- **All four off:** no Take lost; the difference is negative and the range spans -760 to +583, so
  this dispatch cannot say whether 3 people stay within 50 ms. Staging swung in both modes (round
  1 alone had a p95 of 2,566 ms for press to ran).
- **As production:** staging was very slow for most of the run, in the alone rounds as much as in
  the 3-person rounds (alone, round 1: slowest answer 35.8 s). Takes were lost in both modes, 8 and
  8, so in that window even a single page lost Takes. The difference (+860.5 ms) has a range of
  -1,753 to +3,777 and says nothing about 3 people against one.
- No other `hosted-latency` run overlapped either dispatch: the workflow's concurrency group
  queued this one behind another session's run 44932145979, which ended at 18:07:33, two seconds
  before this one's jobs started. What else reached staging in that window cannot be seen from
  here.
- Switches: all four off before each dispatch and after, read back. Staging stands at all four off.

UTC time of the addendum's last run end: 2026-11-21 18:24.
