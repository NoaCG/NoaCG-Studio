# Phase ci14: the three-plan cohort, recorded absent

Row ci14 of the [cicd-improvement spec](../spec.md) (P4; AC-6). Built 2026-11-01 by the ci14
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`e680acd1889a2d4d70a754fecebcb6b87f369787` (JEV #1933 merge). This row starts no plan, row or
cohort and changes no code or workflow. It adds this file only.

Acceptance, verbatim:

- (a) "With eligible work and qualified native capacity, run a two-plan smoke then three plans of
  four rows each, preserving dependency PASS, single repair owners and pause/resume."
- (b) "Report fixed-configuration matched throughput, latency, tails, unfinished work and resource
  use against AC-6 targets; allow only the existing bounded correction."
- (c) "If workload/capability or targets are missing, report pending or not met with evidence and
  no success claim. A correct disposition can PASS this reporting row; AC-6 remains open. No
  automatic reorder or new cohort authorization."

## Disposition: PENDING, AC-6 open

**The two-plan smoke and the three-plan cohort are PENDING: no authorized eligible workload.** The
owner has authorized no cohort. For this run the owner said "Do not start another product plan" and
"Do not launch JEV", and (c) forbids a new cohort authorization or an automatic reorder. The only
other plan running is JEV (#1850), and it runs under its own authorization, not as a cohort
stream. No third plan exists.

**AC-6's cohort targets are NOT MET (unmeasured).** These are: each of three plans completes four
rows, at least 2x the matched serial completion rate, at most 25% more category-matched median
latency, a demonstrated pause/resume, and no starvation, interference, duplicate repair owner or
admission before prerequisite PASS. No matched serial cohort and no frozen configuration exist to
compare against. This file makes no throughput or latency improvement claim.

What exists instead is two kinds of evidence, reported below and labelled for what they are:

1. **Operating evidence from an unmatched, unfrozen configuration**: the observed co-run of this
   plan and JEV, 2026-10-31T08:11Z to 2026-11-01T22:07Z (section 2). The configuration changed
   while it ran: this plan's own rows ci03 to ci13 changed dispatch, selection, the configured PR
   gate and growth controls during the window. So the co-run is not the AC-6 smoke or cohort, and
   no >=2x or latency ratio is computed from it. It does show one condition AC-6 forbids:
   **admission before prerequisite PASS, observed once in each plan (#1934)**.
2. **The parallel-validation part of AC-6 that ci03, ci05 and ci06 already proved**, cited from
   their receipts and not redone (section 3).

## 1. Acceptance against evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| (a) Two-plan smoke, then three plans of four rows each | No authorized cohort and no third plan (above). The cicd/JEV co-run is not a cohort: unfrozen configuration, separate authorizations, unmatched | **pending** |
| (a) Preserve dependency PASS | Co-run: 2 of the 26 judged within-plan successors started before their predecessor passed (section 2.4, #1934) | **not met** in the observed co-run |
| (a) Single repair owners | cicd: 15 of 15 PRs carry exactly one `noacg:repair-owner` marker, all the coordinator. JEV: its PRs carry no marker, so uniqueness cannot be read from the PR records this row may read | met for cicd; **unverified** for JEV |
| (a) Pause/resume | Neither run paused or resumed in the window (no pause in either run issue; both heartbeats renewed blocks) | **pending**, not exercised |
| (b) Fixed-configuration matched throughput, latency, tails, unfinished work, resources against AC-6 targets | No fixed configuration and no matched cohort. Unmatched figures in section 2 | **not met** (unmeasured) |
| (b) Only the existing bounded correction | No correction applied. No target, ceiling, check or sample was changed | holds |
| (c) Pending/not met with evidence, no success claim, no reorder or new authorization | This file. No plan, row or dispatch was started | **pass** for this reporting row; AC-6 stays open |

## 2. Observed co-run (operating evidence, unmatched and unfrozen)

Sources: run issues #1842 and #1850 (bodies, heartbeats, milestones), the 30 plan PRs' timelines,
every merge-group run in the window, and each plan branch's Actions run listing. About 120 REST
calls in two passes, each under 100: pass 1 for PRs, timelines and merge groups, pass 2 for branch
run listings, comments and the held jobs. Every read was cached in the session scratchpad. No
ledger was read: the ledgers belong to the coordinators. Times are UTC.

### 2.1 Rows and landings

| | cicd-improvement (#1842) | JEV (#1850) |
| --- | --- | --- |
| Started | 2026-10-31T08:10Z | 2026-10-31T10:19Z |
| PRs landed in the window | 15: ci01-ci13, ci18, plus fix #1845 | 15: rows 1-15 |
| Phases passed (heartbeat, 22:00Z / 21:54Z) | 14 of 18 | 14 of 40 |
| In flight | ci14 (this build) | row 15 landed (#1933), in check |
| Unfinished, not started | ci15, ci16, ci17 | rows 16-40 (25) |
| Starvation | none: the gaps between landings in each plan were 1 to 7 h | none |

Both plans kept landing all through the window. Neither was starved. They share one merge queue
and one runner pool.

### 2.2 Queue-to-landing (ci01 clock: first `added_to_merge_queue` to `merged_at`)

| Set | n | p50 | p90 | max | > 10 min | > 20 min | > 30 min (per-item ceiling) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Both plans | 30 | 9.9 | 13.2 | 71.8 | 15 | 2 | 2 |
| cicd | 15 | 9.3 | 12.4 | 71.4 | 7 | 1 | 1 |
| JEV | 15 | 11.6 | 13.3 | 71.8 | 8 | 1 | 1 |

Against the retained targets (p50 <= 10, p90 <= 20 minutes), the pooled co-run sits inside them
(p50 9.9, p90 13.2). That is a description of an unmatched window, not a met AC-6 target. Two
items breached the 30-minute per-item ceiling. Both are the tail in 2.3.

Other durations, as a description only: PR opened to landed was p50 54, p90 170, max 388 minutes
(gross; it includes review, repair and owner waits). First branch commit to the independent check
comment was p50 1.69 h, p90 4.32 h for cicd (n=14) and p50 1.75 h, p90 3.80 h for JEV (n=13). The
first commit is later than a ledger `build` event, so these are lower bounds on phase time, not
the ci01 phase clock.

### 2.3 Tails and merge-queue interference

- **The tail: an hour of hold at job end, not the other plan's tests (#1935).** #1896 (ci07) and
  #1899 (JEV 11) were in the queue together, 07:53 to 09:10 on 2026-11-01. In both merge groups,
  41286559823 and 41286921432, two to four shards (and the catalog gate in the first) stayed
  running about 60 minutes after their logs ended. In `E2E 3/15`, for example, "84 passed (6.8m)"
  at 08:00:42, the last log line at 08:00:45 and completion at 09:00:47. No test failed. The cause
  looks like runner job completion.
- **Dequeues: 0.** Every one of the 30 PRs has exactly one `added_to_merge_queue` and one
  `removed_from_merge_queue`, at its merge. No plan PR was dequeued by the other plan's flake or
  by anything else.
- **Merge-group failures: 1 of 42** in the window, run 41243467985 for #1877, a quarantine PR from
  neither plan. It landed at 21:35Z.
- **Overlapping queue stays across plans: 3** (#1860/#1861, #1864/#1866, #1896/#1899). The first
  two took 6.8 to 12.4 minutes. The third is the hold above.
- **Post-landing configured-suite reds: 5** (#1857, #1869, #1881, #1905, #1925), on landings of
  JEV 2, JEV 5, two quarantine PRs and a non-plan PR. Each one is "no report from shard N", with 0
  failed tests: the local stack start fault #1865/#1829, not either plan's code.
- **Shared-runner flakes**: #1924 (`production-chat-intake`, failed once on the ci11 landing,
  quarantined by #1923) and #1915 (JEV's `import-svg` spec, quarantined) touch neither plan's
  diff. Neither caused a dequeue.
- **Cross-plan resource pressure**: ci06's milestone says the backend projection fits its
  per-landing ceiling "only once routine worker dispatches stop; the JEV run still dispatches
  them". That is shared-envelope interference, which is tracked in #1871.

### 2.4 Admission before prerequisite PASS: observed twice (#1934)

The within-plan successors were compared: the first commit on the successor branch against the
predecessor's independent-check comment. Of 27 successor pairs, 26 could be judged and 24 started
after the check. One JEV pair (row 2 to row 3) has no check comment on the PR and was not judged.
Two did not wait:

| Successor | First commit | Its parent | Predecessor landed | Predecessor check |
| --- | --- | --- | --- | --- |
| cicd ci08 (#1910) | 08:35:40 | `7030eb18`, the queued merge of #1899, on `main` only at 09:10:47 | ci07 at 09:04:29 | 09:23:35 |
| JEV 12 (#1909) | 08:47:22 | `7030eb18` | JEV 11 at 09:10:47 | 09:37:49 |

Both started during the hold in 2.3, from a merge-queue commit that was not yet `main`. Both merged
only after the predecessor passed, so nothing landed ahead of a PASS. But the start itself is the
admission AC-6 forbids. The ledgers' `build` events would settle whether the supervisor or a
coordinator admitted these. #1934 asks for that.

### 2.5 Resource use (Actions runs on the plan branches)

| | Runs | Cancelled | Failed | Configured-suite runs | Summed run wall minutes |
| --- | ---: | ---: | ---: | ---: | ---: |
| cicd (15 branches) | 146 | 82 | 28 | 32 | 1,046 |
| JEV (15 branches) | 83 | 36 | 18 | 19 | 630 |

These are run counts and summed run wall time on PR branches, not runner-minutes (a run has many
parallel jobs). Merge-group and push runs are not included. Most cancellations are superseded PR
pushes: ci18 had 45 runs with 38 cancelled, ci03 had 38 with 28. Runner-minutes per accepted
change for this window are **missing, not zero**. ci18's growth report (backend 107.4 of 117 per
landing, WARN, evidence partial) is the existing per-landing measure.

## 3. Parallel validation already proved (cited, not redone)

| AC-6 item | Row, evidence | Checker receipt |
| --- | --- | --- |
| Three unrelated candidate SHAs dispatched together complete with attributable verdicts | ci03 [section 5](phase-ci03.md): three PR heads dispatched within 12 s, each with its own returned run ID, `head_sha` and green verdict, all in progress together | PASS, session `session_017SdbwLxSpt7m2iKzkvPqrj`, merge `99c461b8`, [#1854 comment](https://github.com/NoaCG/NoaCG-Studio/pull/1854#issuecomment-6545342052) |
| Moved refs, schedules, superseded runs, lost acknowledgement, exact-main recovery | ci03 table rows (a) and (b): ref moved between request and run refused; schedule group isolated; pending same-branch supersession recovered (41200019293 to 41200054838); lost acknowledgement reconciled by recorded identity; push groups per commit | same |
| Selected cases cannot disappear (focused tests, discovery) | ci05 (b): `test.only` refused by lint and `forbidOnly` in CI; discovery and verdict probes | PASS, `checker-ci05-ci05-c-f4ff`, merge `11523106`, [#1866 comment](https://github.com/NoaCG/NoaCG-Studio/pull/1866#issuecomment-6547595674) |
| Coverage declarations, exact selected manifest feeds the required CI gate; missing reports, unexpected skips and failures fail it; untriggered and merge-group skip cases; full configured validation per landing | ci06 (a) to (c): run 41233844505 (68 specs, 4 local stacks); verdict tests; the first real exempt merge group was ci06's own landing | PASS, session `session_017SdbwLwL72Eo4iEEnxQKWh`, merge `26095c82`, [#1872 comment](https://github.com/NoaCG/NoaCG-Studio/pull/1872#issuecomment-6549558303) |
| Added PR time and combined-tree detection gap | ci06 sections 6 and 7 | same |

What still stays open in AC-6: the cohort (four rows in each of three plans), the matched >=2x
completion rate, the <=25% latency bound, demonstrated pause/resume, and the clean admission
record that 2.4 contradicts.

## 4. Per-PR record

| PR | Row | Opened | Queued | Landed | Queue min | First commit to check, h |
| --- | --- | --- | --- | --- | ---: | ---: |
| #1845 | cicd fix-1844 | 10-31T08:19 | 10-31T08:48 | 10-31T08:54 | 5.5 | no check comment |
| #1848 | cicd ci01 | 10-31T09:03 | 10-31T10:00 | 10-31T10:07 | 6.8 | 1.42 |
| #1851 | JEV 1 | 10-31T10:38 | 10-31T10:55 | 10-31T11:02 | 6.8 | 0.67 |
| #1852 | cicd ci02 | 10-31T10:44 | 10-31T11:34 | 10-31T11:40 | 5.4 | 1.37 |
| #1853 | JEV 2 | 10-31T11:27 | 10-31T13:04 | 10-31T13:12 | 8.5 | no check comment |
| #1854 | cicd ci03 | 10-31T12:40 | 10-31T14:52 | 10-31T14:58 | 6.5 | 3.22 |
| #1858 | JEV 3 | 10-31T13:59 | 10-31T14:44 | 10-31T14:49 | 4.7 | 1.15 |
| #1860 | JEV 4 | 10-31T15:34 | 10-31T16:08 | 10-31T16:15 | 6.8 | 1.36 |
| #1861 | cicd ci04 | 10-31T15:50 | 10-31T16:09 | 10-31T16:21 | 12.4 | 1.22 |
| #1864 | JEV 5 | 10-31T17:14 | 10-31T17:59 | 10-31T18:11 | 11.6 | 1.81 |
| #1866 | cicd ci05 | 10-31T17:47 | 10-31T18:04 | 10-31T18:14 | 10.3 | 1.46 |
| #1870 | JEV 6 | 10-31T19:26 | 10-31T20:09 | 10-31T20:19 | 9.5 | 1.57 |
| #1872 | cicd ci06 | 10-31T19:46 | 10-31T21:15 | 10-31T21:28 | 12.4 | 2.67 |
| #1878 | JEV 7 | 10-31T21:21 | 10-31T22:06 | 10-31T22:18 | 11.8 | 1.75 |
| #1880 | cicd ci18 | 10-31T22:25 | 11-01T03:56 | 11-01T04:08 | 12.4 | 6.27 |
| #1883 | JEV 8 | 10-31T23:14 | 10-31T23:53 | 11-01T00:06 | 13.2 | 1.54 |
| #1888 | JEV 9 | 11-01T01:03 | 11-01T03:36 | 11-01T03:48 | 12.2 | 3.27 |
| #1893 | JEV 10 | 11-01T04:43 | 11-01T05:41 | 11-01T05:54 | 13.4 | 1.96 |
| #1896 | cicd ci07 | 11-01T05:25 | 11-01T07:53 | 11-01T09:04 | 71.4 | 4.80 |
| #1899 | JEV 11 | 11-01T06:41 | 11-01T07:59 | 11-01T09:10 | 71.8 | 3.31 |
| #1910 | cicd ci08 | 11-01T09:04 | 11-01T09:38 | 11-01T09:47 | 9.3 | 1.52 |
| #1909 | JEV 12 | 11-01T09:52 | 11-01T12:06 | 11-01T12:19 | 12.2 | 3.93 |
| #1913 | cicd ci09 | 11-01T11:46 | 11-01T12:24 | 11-01T12:30 | 6.8 | 2.41 |
| #1916 | JEV 13 | 11-01T12:58 | 11-01T13:20 | 11-01T13:27 | 7.0 | 0.86 |
| #1918 | cicd ci10 | 11-01T13:55 | 11-01T14:12 | 11-01T14:19 | 6.7 | 1.87 |
| #1919 | JEV 14 | 11-01T14:04 | 11-01T20:19 | 11-01T20:32 | 12.8 | 6.96 |
| #1922 | cicd ci11 | 11-01T16:52 | 11-01T18:14 | 11-01T18:26 | 12.3 | 2.19 |
| #1927 | cicd ci12 | 11-01T19:34 | 11-01T19:50 | 11-01T20:01 | 10.7 | 1.19 |
| #1930 | cicd ci13 | 11-01T21:05 | 11-01T21:20 | 11-01T21:25 | 4.8 | 1.28 |
| #1933 | JEV 15 | 11-01T21:25 | 11-01T21:33 | 11-01T21:40 | 6.9 | no check comment |

Times are 2026 UTC (month-day, hour:minute). "No check comment" means no `Independent check`
comment on the PR. The milestone on the run issue may still record a PASS.

## 5. Phase notes

- Previous verified main for this plan: `d26c0ba0` (ci13, PR #1930, check PASS 21:57Z). Built
  from `e680acd1` (JEV #1933 merge on top).
- Revert: `git revert -m 1 <this PR's merge commit>`. It removes this file only.
- Audit reset: **not a reset**. No selector, header, list, set or mapping changes.
- Decisions:
  - The co-run is reported as operating evidence and never as the smoke or cohort. Its
    configuration was not frozen (this plan changed CI while it ran) and it has no matched serial
    baseline. So no throughput ratio or latency ratio is computed.
  - "Admission" is judged from the successor's first commit against the predecessor's check
    comment. The ledger is the coordinator's, and its `build` event can only be earlier than the
    first commit, so this test can miss an early admission but cannot invent one.
  - JEV repair-owner uniqueness is reported unverified rather than inferred. Its PRs carry no
    marker, and this row reads JEV records only.
  - Defects found are filed, not fixed here: #1934 (early admission), #1935 (job-end hold).
- Traps for later rows:
  - ci17: the co-run figures here are from an unfrozen configuration. Do not pool them into an
    AC-6 matched result.
  - A merge-group job whose `completed_at` is far after its last log line is a hold, not a slow
    test. Read the log tail before attributing queue time to a PR.
