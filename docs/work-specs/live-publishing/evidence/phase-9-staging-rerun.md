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
