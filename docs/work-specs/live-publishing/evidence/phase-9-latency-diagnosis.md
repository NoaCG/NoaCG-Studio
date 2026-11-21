# Phase 9 Take latency with three people (diag-lat-9b)

Why a Take takes hundreds of ms longer to run on the output when two editors type than when the
taker works alone, on hosted staging with `team_designs`, `auto_publish` and `partial_writes` on
(`phase-9-staging-rerun.md`, second rerun and addendum: +530 ms pooled p95 over 28 pairs). Run
issue #2361. Diagnosis only: no product code changed. Measured 2026-11-21.

## Answer in short

The extra time is in the Take's own database write, not in the page or the output. On staging, a
Take sent while editors type often gets no answer for 1 to 7 s, while the taker's other requests
in the same round stay fast. Its frame reaches the output a few ms after the write commits.

The write waits on the database log (WAL, the write-ahead log every change is written to before it
counts as saved). With `auto_publish` on, every editor edit is followed by a publish that rewrites
the whole published output (`control_publish_parts`, about 370 KB of WAL per publish at 6
graphics, against 7 KB for a Take). A Take's commit has to wait until the log is flushed past
that, and it holds the production's command head (`control_heads`, one row per production) until
then, so every other send and renderer report queues behind it. The output's frame also travels
through the log (Realtime's broadcast from the database), so it cannot overtake the flush either.
Reads do not wait for the log, which is why staging's general response times can look fine while
Takes are slow.

No weekend change is shown to cause it. The same staging test with the client from before #2662
(d882121) was as bad (+1,420 ms); local runs before the weekend changes, with all database
changes, and on main overlap. How large the gap is depends mostly on how fast staging's disk is
at that moment: two runs of main an hour apart gave +2,615 ms and +8 ms.

## How it was measured

- **Instrument.** Phase 8's scene trimmed to 3 people (taker, two editors typing a new text every
  4 s), phase 9's interleaved pairs, and the same pooled p95 difference with a 2,000-draw bootstrap
  over pairs (`phase-9-cloud/pairsum.py`). Added for this diagnosis: for every Take, the time of
  each `control_send_seq` attempt (start, end, HTTP status, cut by the page or not) on the taker's
  page, and the time each Realtime frame for the production reached the output page. All stamps
  are `performance.timeOrigin + performance.now()` on one machine. The scratch diff is
  `phase-9-latency-diagnosis/tools/instruments.patch` (scratch branches `scratch/diag-lat-9b` and
  `scratch/diag-lat-9b-d882`, not for `main`).
- **Local stack.** Supabase CLI 2.111.0 through `scripts/configured-stack.mjs`, 4 CPUs, images from
  `mirror.gcr.io`. Staging-like slowness: the database container at 0.2 CPU, Realtime at 0.3 CPU,
  120 ms added round trip (a delaying TCP proxy in front of the API, `tools/delayproxy.mjs`; this
  kernel has no netem), and, for the runs marked "disk cap", the database's disk writes capped at
  2 MB/s and 40 writes/s (cgroup v1 blkio). The analytics and vector containers were stopped for the
  matched runs, since they write to the same database. Every 100 ms, `pg_stat_activity` with wait
  events and the blocking session (`tools/sample.sql`); `pg_stat_statements` with WAL bytes; the
  WAL position once a second. Accounts: the configured suite's `e2e-s1@noacg.local` and its
  teammate, and the scene's own per-run members.
- **Staging.** Three dispatches of `hosted-latency.yml` with `spec: e2e/instruments/p9r-3p-pairs.ts`,
  7 pairs each (runs below). Each run read the four switches before, set them on, and put them back;
  every run found all four off and left all four off, read back with the service role
  (`staging/*-switches-*.json`). A fourth dispatch (44936029426) failed in set-up before any switch
  was used for a Take (the production never opened on staging); it too found and left all four off.
  No production variable was used and no Supabase management API call was made.

## 1. Where the extra time goes

### On staging

Per Take, from the press: to the first send (page), the send's answer (network and database), the
output's frame (database and Realtime), and the frame to `play()` on the output. Run 44932145979,
main 5634c2f, 7 pairs:

| | taker alone | 3 people |
|---|---|---|
| Takes (never ran) | 157 (0) | 101 (0) |
| press to ran, p50 / p95 | 187 / 983 ms | 254 / 3,644 ms |
| press to send, p50 / p95 | 48 / 67 ms | 56 / 94 ms |
| send to answer, p50 / p95 (answered attempts) | 205 / 1,005 ms | 324 / 1,523 ms |
| send to the output's frame, p50 / p95 | 133 / 904 ms | 213 / 3,584 ms |
| frame to `play()`, p95 | 3 ms | 5 ms |
| Takes over 900 ms | 10 (6 %) | 24 (24 %) |
| of those, first attempt cut by the page at 1.5 s with no answer | 6 | 14 |
| attempts sent again | 4 | 12 |

- **The page is not it.** Press to send grows by 8 ms at p50 and 27 ms at p95 with editors working.
  The page's main thread is not holding the press.
- **The output is not it.** Frame to `play()` stays under 12 ms in every run. The output applies
  what it receives at once.
- **The Take's write is it.** In the calm rounds of the same run the taker's other requests to
  staging had a p95 of 244 to 919 ms, while the Take's own answered attempts had a p95 of 1,191 to
  1,617 ms in rounds 1 and 6 with editors (274 and 407 ms in the alone rounds next to them). When
  the answer does come, the output's frame arrives within a few ms of it (the frame is often
  earlier than the answer, which still has to cross the network). When the first attempt is cut,
  the frame comes when that attempt finally commits on the server, up to 7.2 s after the press.

### Locally, with the disk capped

Without a disk cap the local stack shows no three-person penalty, even at 0.2 CPU and 120 ms round
trip (before the weekend changes +14 ms, bootstrap -17 to +45; main +20 ms, -10 to +74; 4 pairs
each). With the disk capped, the staging shape appears: the Take's answer slows only when editors
write, and an occasional Take takes 8 to 9 s.

What the lock samples show while editors write (main, 8 pairs): 236 samples of `control_send_seq`
waiting, all but one on a `transactionid` lock (a row held by another transaction), and the
holder was in every such case a session in `COMMIT` waiting on `WALWrite` or `WALSync`, that is, a transaction
that had finished its work and was waiting for the log to reach disk. That holder is another
command or renderer report that took the command head before the Take. No sample shows a wait on
`control_shows` (0125's KEY SHARE, 0126's guard trigger) or on anything else.

Where the WAL comes from (`pg_stat_statements`, one local run each, 2 pairs):

| Statement | before the weekend changes | main |
|---|---|---|
| `control_publish_parts` (each automatic publish) | 49 calls, 353 KB each | 45 calls, 376 KB each |
| team record write | `team_production_patch`, 49 calls, 186 KB each | `team_production_patch_v2`, 44 calls, 4 KB each |
| `control_send_seq` (Take, Out) | 9 KB each | 7 KB each |
| WAL written with editors / alone | 0.37 to 0.42 / 0.02 to 0.04 MB/s | 0.18 to 0.28 / 0.02 to 0.03 MB/s |

`team_designs` (0126) cut the team record write from 186 KB to 4 KB, so main writes less log than
before. What remains is the automatic publish, which rewrites the whole `control_shows.output` on
every edit (#2533 records that this is still the case with `partial_writes` on).

Two local experiments isolate it (main, disk cap):

| | pairs | 3 people p95 | alone p95 | difference (bootstrap 95 %) | Take waits on the head, per pair |
|---|---|---|---|---|---|
| main, switches on | 8 | 829 ms | 523 ms | +306 ms (+35 to +610) | 30 |
| main, `auto_publish` off, the rest on | 4 | 614 ms | 485 ms | +129 ms (-13 to +673) | 3 |
| main, the head's two functions commit without waiting for the flush (test only) | 2 | 738 ms | 1,218 ms | -481 ms | 0 |

- With `auto_publish` off the WAL written while editors type falls tenfold (0.26 to 0.03 MB/s)
  and the Take's waits on the head almost vanish.
- Letting `control_send_seq` and `control_output_report_seq` commit without waiting for the flush
  (`synchronous_commit` off inside them, applied locally and removed again) removes every wait on
  the head, but the output's frame then arrives later for every Take (alone p50 from 170 to 422 ms):
  the frame is sent from the log, so it waits for the flush anyway. That rules out "commit without
  waiting" as a fix and shows the frame path is tied to the log.

The local disk cap is cruder than staging's disk: the first two runs on a fresh local database
also paid for creating new 16 MB log segments (`WALInitSync`, 80 samples each), which is what
made their slowest Takes 8 to 9 s. Later runs recycle segments and show none. The comparisons
below use only runs without it.

### The candidates in the question

| Candidate | Finding |
|---|---|
| Lock waits on `control_heads` | **Yes.** The Take waits on the head row held by a transaction in `COMMIT` waiting for the log. |
| Lock waits on `control_shows` | None seen (0125's KEY SHARE passes a publish's row lock). |
| 0126 guard trigger | Not on the Take's path; `control_publish_parts` is faster on main (66 ms mean) than before (196 ms). |
| 0125's resolve read under the head | `control_send_seq` mean 11.5 ms on main against 16.5 ms before, at 0.2 CPU; no wait seen. |
| Realtime fan-out of the editors' saves | The Take's frame follows its commit within ms; it is late only when the commit is. |
| The page's main thread | +8 ms p50, +27 ms p95 from press to send on staging. |
| The output's apply path | Under 12 ms from frame to `play()` in every run. |

## 2. The weekend changes

On staging only the client can be changed (staging has every migration). Run back to back:

| Staging run | Client | 3 people p95 | alone p95 | difference (bootstrap 95 %) | never ran |
|---|---|---|---|---|---|
| 44932145979, 17:53 | main 5634c2f | 3,644 ms | 1,029 ms | +2,615 ms (+628 to +4,087) | 0 |
| 44936026008, 18:32 | d882121 (before #2662) | 2,016 ms | 597 ms | +1,420 ms (+18 to +4,492) | 2 (3 people) |
| 44938053081, 18:55 | main 5634c2f | 453 ms | 445 ms | +8 ms (-791 to +1,272) | 1 (3 people) |

The client before #2662 shows the same gap, and the two runs of main differ by 2.6 s, so staging's
state at the time decides the size; #2662 does not cause it. The two Takes lost with d882121 are
its old 4 s window giving up while staging stalled (p95 33.8 s in that round).

Locally, disk cap, matched runs (no segment creation, analytics stopped, 6 pairs each):

| Local | Database | 3 people p95 | alone p95 | difference (bootstrap 95 %) | Take waits on the head, per pair |
|---|---|---|---|---|---|
| before the weekend changes (d3523c7f, before #2620) | 0120 | 620 ms | 591 ms | +29 ms (-88 to +263) | 12 |
| d882121 client (every weekend database change, no #2662) | 0126 | 630 ms | 614 ms | +16 ms (-217 to +164) | 7 |
| main 5634c2f | 0126 | 809 ms | 636 ms | +174 ms (-5 to +511) | 9 |

The ranges overlap. The database changes (#2620 to #2646) are not implicated: with all of them the
local gap is +16 ms. Main's local point estimate is higher, and #2662 is the only difference from
d882121, but the gap is not significant here and staging does not show it. If it matters, a longer
local A/B of #2662 alone would settle it. Phase 8's +37 ms was measured without a disk cap, where
this test also finds +14 to +20 ms.

## 3. The Take that did not run within 10 s

Run 44929702637 round 5 had no per-attempt timing. The same event happened in this diagnosis with
timing, on staging (44938053081, round 2 with everyone working) and locally (main, disk cap):

- **Staging:** the Take's attempts at 0, 1.9, 4.4 and 8.0 s, each cut by the page at 1.5 s with no
  answer. Between them, the previous Out of the same graphic, still being sent until it lands
  (#2662), was sent again at 1.1, 3.6 and 7.1 s, also unanswered. Nothing reached the output
  within 10 s. In that round the taker's slowest request took 4.2 s.
- **Locally:** the first attempt was cut at 1.5 s, and every later attempt came back after about
  1.1 s with HTTP 500, which is the head's 1 s lock timeout (`55P03`): each waited behind a
  transaction stuck in `COMMIT` for 7 to 8 s. For one Take the output's frame came when the first
  copy finally committed, 9.3 s after the press; another had not run at 10 s.

So the Take is not lost: it waits behind a commit that is itself waiting for the log, and every copy
the page sends while it waits joins the same queue on the head (with the copies of the previous
Out). It airs when the first copy commits. The 10 s limit is the instrument's, not the product's;
with #2662 the page keeps sending.

## 4. Fixes

| Cause | Smallest safe fix | Risk |
|---|---|---|
| Each automatic publish rewrites the whole output (~370 KB of WAL at 6 graphics; 5 MB at 60), and Takes wait for that log (#2670) | Short term: coalesce automatic publishes per production, at most one every few seconds while edits continue and one when they stop (`useAutoPublish.ts` / `control/autoPublish.ts`). Lasting: #2533, stop composing and writing `output` whole for a parts publish. | Coalescing: published texts reach other pages up to that many seconds later; AC-4's timing needs checking. #2533: the 0118 triggers, `control_output_resolve` and old outputs read `output`; needs its own design note, as #2533 says. |
| The command head is held until the log is on disk, and each copy the page sends of a stalled press (and of the previous Out) queues on that one row; a Take can take over 10 s (#2671) | Do not cut the first attempts of a held press at 1.5 s while the server has not answered; give them the held attempt's 8 s, so one copy waits instead of four. | A copy lost on the network (not slow) is sent again after 8 s instead of 1.5 s. Measure it before changing anything: on staging every cut attempt that had no answer was still in the server's queue. |

Not proposed: committing the head's functions without waiting for the flush (measured above: the
frame still waits, and every Take gets slower); turning `team_designs` off (it lowered the log, it
did not add to it).

For Monday: production runs with `auto_publish` off, the condition in which this mechanism is
smallest. Team saves still write log (186 KB per edit with `team_designs` off, as before the
weekend), so a slow production disk can still slow Takes while editors type; the production
database's disk metrics for a show are worth watching.

## Runs used

Staging (`hosted-latency.yml`, `spec: e2e/instruments/p9r-3p-pairs.ts`; data in
`phase-9-latency-diagnosis/staging/`):
[44932145979](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44932145979) (main),
[44936026008](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44936026008) (d882121),
[44936029426](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44936029426) (main, failed in set-up, no data),
[44938053081](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44938053081) (main).
Also read: the coordinator's 44932505778 (switches as production; staging was slow throughout,
alone p95 4.8 s, so it does not separate the causes).

Local (`phase-9-latency-diagnosis/local/`, each `*-pairs.json` with its lock and WAL wait samples
`*-waits.txt`): uncapped `before-harsh-1/2`, `main-slow-1`, `main-harsh-1`; disk cap
`before-io-2..4`, `d882-io-1..3`, `main-io-1..5`, `main-noauto-1/2`, `main-async-1`. The tools are in
`phase-9-latency-diagnosis/tools/` (`an.py` the per-Take breakdown, `slow.py` the slow-Take classes,
`wal.py` the WAL rate per round).

UTC time of the last measurement: 2026-11-21 19:10.
