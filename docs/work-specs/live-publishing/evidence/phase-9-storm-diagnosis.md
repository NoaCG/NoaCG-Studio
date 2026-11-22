# Phase 9: did e8fda70 knock hosted staging over? (issue #2684)

Run #2361, 2026-11-22. Question: with the switches as production has them (`production_copies` on,
`team_designs`, `auto_publish` and `partial_writes` off), the 3-person soak took hosted staging down
twice on `main` e8fda70b (runs 44958681473 at 22:52 and 44983927028 at 04:11 UTC), while the same
scene on 5634c2f (run 44925104806) did not. Is it the product?

## Answer

**No. The client makes the same requests on both builds.** On a local stack, the same scene on
5634c2f and on e8fda70 sends the same requests per page and endpoint, within a few percent, with
the same database CPU and WAL, both unthrottled and with a slow, spiky link. Nothing between the two
builds touches the editor's save or sync path. The about 90 `GET /rest/v1/documents` a minute per
editor is how the client has always behaved with partial writes off; it is not a loop and slowness
lowers it. Staging was already slow before the 04:11 soak started.

No fix and no revert are needed for Monday.

## 1. What changed between the builds

`git log 5634c2f..e8fda70b --first-parent`: #2669, #2672 (docs), #2674 (docs page), #2675 (plan
docs), #2676. Runtime code changed only in:

- #2669 `src/backend/teamDesigns.ts`: design puts of 500 KB instead of 1 MB. `team_designs` only, off
  in production.
- #2669 `src/control/hostedControl.ts`: the published panel no longer carries each graphic's script.
  Publish only.
- #2676 `src/control/failedSends.ts`, `hostedControl.ts`: a held Take is sent one copy at a time with
  an 8 s cut. Taker page only.

No migration, no change to `src/backend/syncController.ts`, `src/model/shows.ts`,
`src/model/teamShows.ts` or `src/backend/teamProductions.ts`. A bisect was not needed: the local
rates below are the same on both ends.

## 2. Local A/B, switches as production

Local stack (Supabase CLI 2.111.0, slot 1, 127.0.0.1:54421), the phase 9 soak scene from
`e2e/configured/_five.ts` (taker plus two editors, one reload at 40 %, one editor offline 20 s at
60 %), 2.5 minutes of soak per run, one run at a time through the job queue. Both builds use the
same instruments (scratch branch `scratch/p9-rerun-3p-6`); the 5634c2f run has `src/` checked out
from 5634c2f. Instrument: `phase-9-storm-diagnosis/tools/diag-storm.spec.ts.txt`. Database CPU is
the database container's cgroup CPU time; WAL is `pg_current_wal_lsn()` before and after. Data:
`phase-9-storm-diagnosis/data/`.

Throttled: every byte held 150 ms each way through a local TCP proxy, plus a 6 s spell every 15 s
that adds 2.5 s each way (`tools/slowproxy.mjs`, `tools/spell.sh`). On staging the saves took 1 to
9 s; here they take about 0.3 s, and 5 s or more in a spell.

Requests per page per minute:

| Endpoint (page) | 5634c2f fast | e8fda70 fast | 5634c2f slow | e8fda70 slow |
|---|---|---|---|---|
| `GET documents` (editor 1 / 2) | 89.9 / 92.2 | 92.2 / 89.9 | 52.0 / 51.2 | 56.8 / 52.0 |
| `DELETE documents` (editor 1 / 2) | 15.0 / 11.4 | 15.4 / 11.0 | 8.3 / 6.3 | 9.5 / 5.9 |
| `rpc/team_production_save_v2` (editor 1 / 2) | 21.3 / 17.7 | 20.9 / 18.9 | 17.7 / 14.2 | 15.4 / 15.0 |
| `GET documents` (taker) | 23.6 | 23.6 | 23.7 | 21.3 |
| `rpc/control_send_seq` (taker) | 101.7 | 103.3 | 52.4 | 48.9 |
| all backend requests (taker / editor 1 / editor 2) | 160 / 166 / 163 | 162 / 166 / 162 | 111 / 114 / 108 | 104 / 118 / 113 |
| database CPU, CPU-seconds a minute | 2.53 | 2.59 | 2.11 | 2.46 |
| WAL, MB a minute | 9.2 | 8.7 | 7.6 | 8.4 |
| Takes / never ran | 129 / 0 | 131 / 0 | 47 / 0 | 62 / 0 |

Files: `56-fast2.json`, `e8-fast2.json`, `56-slow.json`, `e8-slow.json`. `e8-fast.json` is an
earlier e8fda70 run without the CPU reading, with the same rates. `56-fast.json` is a run that ran
beside another queued job (the queue started two at once) and stalled the editors; it is kept, and
not used.

Throttled, e8fda70 sends fewer copies of a Take than 5634c2f (2.0 against 2.8 `control_send_seq`
per Take, a Take and its Out counted together; 1 against 39 failed taker requests), which is what
#2676 set out to do. Unthrottled both send 2.0.

**The staging rates match the local ones.** The trace of 44983927028 shows each editor at 36 to 54
`GET documents` a minute while staging still answered (04:14 to 04:15), the local fast runs at
about 90 and slow runs at about 52. The editors' save rate (18 a minute) is the typing rate of the
scene. Nothing in the trace grows over time: the requests stop when staging stops answering.

## 3. What sends the documents reads

Each of the editor's `GET /rest/v1/documents` is one of the six index reads of a personal sync pass
(`select=id,deleted,updatedAt:body_updated_at&kind=eq.<kind>`, for project, look, brand, show, graphic
and video), and each pass ends with one tombstone purge (`DELETE documents?deleted=eq.true&updated_at=lt.<cutoff>`).
The trace shows exactly that: 23 of each index read and 14 purges per editor page.

The chain:

1. A local edit to a team production is saved through `saveAll` in `src/model/shows.ts` (`writeTeamShow`,
   then `notifyDataChanged` at line 699). A teammate's save adopted from the server goes through
   `applyServerTeamShow(s)` in `src/model/teamShows.ts` (lines 103 and 113), which also fires
   `spx-data-changed`.
2. `scheduleSync` in `src/backend/syncController.ts` (line 368) takes every `spx-data-changed` and runs
   `syncNow` 2.5 s after the last one.
3. `syncNow` runs a full personal pass (`runSync`: the 6 index reads) and then
   `remote.purgeTombstones` (line 264).

So a personal sync pass runs about every 3 to 9 s while anyone in the production types, though the
edit is to a team record that the personal sync does not carry. It is not a retry loop: it follows
the edits, it is capped by the 2.5 s debounce and by one pass at a time, and slower answers make it
rarer, not more frequent (about 90 a minute fast, about 52 slow). It is the same on 5634c2f.

With all four switches on (`e8-on.json`), the editors send only 15 to 23 `GET documents` a minute
and about 121 to 124 requests a minute in all, against 163 to 166 as production. Yet the database
work is about the same: 2.32 CPU-seconds and 9.7 MB of WAL a minute, against 2.59 and 8.7. Why
partial writes lower the pass rate was not traced further. The extra reads as production have are
cheap index reads; they do not explain a database falling over.

## 4. Why staging fell over

This cannot be proven from here; staging's database metrics are not visible with REST keys. What
the evidence does show:

- Staging was unhealthy for most of the night: 504 and 503 "Could not query the database for the
  schema cache" from 23:17 to 02:51, a statement timeout creating a team at 02:53, a sign-in that did
  not show at 03:05.
- In the 04:11 run, staging was slow **before the soak started**: the publish took 53.6 s (11.5 s in
  the healthy 5634c2f run) and minute 0 of the soak had a median of 533 ms (181 ms healthy).
- Both failing runs came after several hours of measurement load that evening: the (A) soak and
  14 pair rounds, before them the 60-graphic step 7 runs. Staging is a free project; a free project's
  disk IO budget can run out under sustained writes and then every query slows. This is the likely
  cause and someone with the staging dashboard can confirm it (disk IO budget, CPU, connections, for
  2026-11-21 22:00 to 2026-11-22 04:40 UTC).

The same scene as production writes about 9 MB of WAL a minute on the local stack, on both builds.
Sustained over a 10-minute soak after an evening of runs, that is a plausible load for a free
project with its IO budget spent, and the same for 5634c2f.

## 5. Unthrottled, production's real speed

Section 2's "fast" columns. The rates are the same as throttled or higher, and the same on both
builds. With `team_designs` off and no slowness, each editor makes about 90 `GET documents`, 13
`DELETE documents` and 20 saves a minute.

## 6. Fix

None needed before Monday: there is no regression to fix, and a revert of #2676 would bring back the
four Take copies in 8 s that it removed. Changing the sync trigger on the day before production use
would carry more risk than the reads it saves.

Worth doing later (not a regression, a cost that was always there): a change that touches only team
records should not schedule a personal sync pass, and the tombstone purge needs to run at most once
per session or hour, not on every pass. Together they would remove about 100 of the 166 requests an
editor sends a minute with partial writes off. Proposed as a follow-up on #2684.

## Safety

Every run was on the local stack: the run script sets the backend to 127.0.0.1 on the same command
and removes the shell's Supabase variables there, and the instrument refuses any backend that is not
127.0.0.1. No hosted project, production or staging, was called, and no management API. The accounts
are the configured suite's local throwaway accounts and the scene's own local members, inside the
local stack only.
