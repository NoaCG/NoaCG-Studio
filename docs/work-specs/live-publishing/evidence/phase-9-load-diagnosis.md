# Phase 9 load diagnosis (diag-load-9a)

Why hosted staging slowed from about 0.2 s to medians of 0.6 to 7.6 s under five people, and what
that did to Takes, Goals, messages, saves and the 60-graphic publish in the phase 9 cloud check
(`phase-9-cloud/README.md`, PR #2613). Run issue #2361. Diagnosis only: no product code changed.
Measured 2026-11-20.

## Answer in short

The database work per request is large and grows with the production. A team production's record
carries every graphic's full template (about 85 KB per lower third), so a 60-graphic record is
5.1 MB of JSON (2.1 MB stored) and a 6-graphic one 0.58 MB. Every save sends and rewrites the
whole record, every lost compare-and-swap sends the whole record back, and every publish rewrites
the whole output (another 5.1 MB at 60 graphics) in one statement. On the local stack (4 CPUs)
that costs 57 to 296 ms per save and up to 1.1 s per publish, so it never shows. On staging the
same requests cost 0.6 to 7.2 s per save and 3.4 to 5.6 s per publish with nobody else working,
which leaves no room under the 8 s statement limit once two or more people write. Takes, Goals
and messages are small, but they wait behind that work, and their client paths give up after a
fixed time instead of retrying until they land.

No cue moved backwards. The three cues that read as their original text on staging never had a
save land during the run.

## How it was measured

- **Local stack**: Supabase CLI 2.111.0, `scripts/configured-stack.mjs`, all 120 migrations,
  4 CPUs. The role limits match hosted Supabase: `authenticated` statement_timeout 8 s, `anon`
  3 s, `authenticator` 8 s, max_connections 100. pg_stat_statements, EXPLAIN (ANALYZE, BUFFERS),
  `pg_stat_xact_user_functions`, a once-a-second sample of `pg_stat_activity` wait events and
  `docker stats`. The phase 8 scene and the phase 9 instruments (`phase-9-cloud/instruments.patch`)
  ran from a local copy; nothing of them is in this PR.
- **Staging**: one dispatch of `hosted-latency.yml` with `spec: e2e/instruments/p9-diag-staging.ts`
  on the scratch branch `claude/diag-load-9a-scratch` (run
  [44804695193](https://github.com/NoaCG/NoaCG-Studio/actions/runs/44804695193)). The job's
  "Configured backend" line names `garafohbzmsybtysxphb.supabase.co`. The instrument uses no
  browser: as the workflow's signed-in test account it makes one throwaway team and team
  production, times `team_production_save` and the publish write by size and by number of
  writers, then deletes both (`cleanedUp: true`). No switch was changed, so none needed restoring.
- **Not available**: SQL on staging. The workflow holds only the REST keys, so staging's
  pg_settings and pg_stat_statements could not be read; staging numbers are request times seen
  from the runner (round trip about 240 ms). Production was not touched.
- **Accounts**: the configured suite's local throwaway accounts, and the existing staging account
  `e2e-s1@noacg.staging`. No account was created.

## 1. What is slow, and why

### Sizes

| | 6 graphics | 15 | 30 | 60 |
|---|---|---|---|---|
| team record sent per save | 0.58 MB | 1.33 MB | 2.59 MB | 5.12 MB |
| publish output written | 0.58 MB | 1.33 MB | 2.59 MB | 5.12 MB |

A lower third's template is 84.7 KB, the score's 145.7 KB; cues and settings add 12 KB in all. The
stored 60-graphic record is 2,155,401 bytes after TOAST compression.

### Save time by size, one writer (`team_production_save`, end to end)

| | 6 | 15 | 30 | 60 |
|---|---|---|---|---|
| local, median | 57 ms | 88 ms | 155 ms | 296 ms |
| local, same instrument as staging | 103 to 181 ms | 274 to 295 ms | 400 to 681 ms | 869 to 965 ms |
| staging, idle | 554 to 1,583 ms | 820 to 1,925 ms | 2,314 to 2,434 ms | 4,144 to 7,215 ms |

Linear in size on both. Inside the database (psql, no PostgREST), one 60-graphic save takes
594 to 804 ms and one refusal 204 ms; `production_authoring_guard` alone costs about 30 ms per
call at that size, because a BEFORE ROW trigger that returns NEW copies the 5 MB row.

### Several writers on one record

Each writer saves every 600 ms, as the page's debounce does, for 20 to 30 s.

| | saves landed | refused (lost the compare-and-swap) | save p50 / p95 | record bytes sent back by refusals | probe read p95 |
|---|---|---|---|---|---|
| local, 60 graphics, 1 writer | 22 | 0 | 277 / 334 ms | 0 | 8 ms |
| local, 60 graphics, 7 writers | 21 | 123 | 306 / 526 ms | about 630 MB | 84 ms |
| local at 0.25 CPU, 60 graphics, 7 writers | 6 | 30 | 4,773 / 6,435 ms | about 150 MB | 249 ms |
| staging, 6 graphics, 1 writer | 16 | 0 | 1,048 / 3,038 ms | 0 | 534 ms |
| staging, 6 graphics, 7 writers | 21 | 91 | 993 / 2,082 ms | 51.7 MB | 550 ms |
| staging, 60 graphics, 2 writers | 4 | 3 | 9,954 / 13,338 ms | 15.4 MB | 2,212 ms |

Two things stand out. Only about one save a second lands however many people type, because each
landed save makes every other writer's token stale. And every refusal returns the whole record, so
the traffic and the server work grow with writers times record size. The page then merges and
uploads the whole record again, up to four times (`MAX_SAVE_ATTEMPTS`). On staging, two writers on
a 60-graphic record already take 10 to 13 s per request.

### What else was checked

- **Query plans and indexes**: every hot statement is a primary-key lookup or a one-row update.
  `team_productions` reads use a sequential scan with `is_team_member` per row, on a table of a
  dozen rows locally; not a cost here. No missing index explains the times.
- **Locks**: no lock waits in the local five-person run (two `ClientRead` samples in 45 s, none on
  `Lock`). With several writers, `team_production_save` holds the row lock for the length of a
  whole-record write, so the others queue behind it and then refuse; that is the refusal
  arithmetic above, not a separate cause.
- **Triggers**: on the publish write, see section 2. On the team save, `production_revision_next`
  and `production_authoring_guard` each copy the row (7 ms and 30 ms per call at 60 graphics).
- **Realtime**: the publication holds only `chat_submissions` and `control_events`, both small
  rows. Realtime averaged 1.8 % of a CPU in the local five-person run. Not a cause.
- **Polling**: every page reads the heads every 15 s and then fetches the whole record of any
  production a teammate saved (`fetchTeamProductionDocs`), so each landed save is downloaded once
  more per open page.
- **Local five-person run, 90 s** (phase 8 scene, 6 graphics): the database averaged 5.6 % of one
  CPU; 48 Takes, none lost, press to ran p95 208 ms; Goals 29 of 29; messages 5 of 5. The top
  statement by time was `team_production_save` (73 calls, mean 29 ms). The same workload is cheap
  locally and saturates staging.

## 2. The 60-graphic publish

The statement is the publish write to `control_shows`: an INSERT on a first publish, else
`UPDATE control_shows SET output = <whole payload> WHERE id = ... AND output->ver->>n = <n>`
(`writeControlShow` in `src/control/hostedControl.ts`). With `partial_writes` off, as in step 7,
the payload carries every graphic whole.

| | 6 | 15 | 30 | 60 |
|---|---|---|---|---|
| local, median | 99 ms | 254 ms | 480 ms | 1,081 ms |
| staging, idle, 3 writes each | 967 to 1,709 ms | 601 to 2,499 ms | 923 to 2,119 ms | 3,381 to 5,602 ms |

EXPLAIN (ANALYZE, BUFFERS) of the 60-graphic UPDATE on the local stack, 1,089 ms in all:

- 293 ms to evaluate the WHERE clause: `output->'ver'->>'n'` decompresses the whole stored 5 MB
  output to read one number, although 0118 already copies `ver` into `published_ver`;
- four BEFORE ROW triggers, each copying or comparing the 5 MB value:
  `control_stamp_audio_owner` 108 ms (`new.output is distinct from old.output`),
  `control_shows_set_updated_at` 94 ms, `control_publication_guard_b_output` 90 ms,
  `control_shows_production_authoring_guard` 5 ms;
- the rest, about 500 ms, compressing and writing the new value.

On staging the single write takes 3.4 to 5.6 s with nothing else running, so the 8 s limit is
reached as soon as anything competes. In step 7 something always did: the owner's own 5.1 MB team
save (4.1 to 7.2 s on staging) runs just before the publish, and the first attempt's note was
"Your latest change is still saving". Each retry after a timeout is a fresh whole-payload write,
which is why five presses over 3.4 minutes all failed the same way.

## 3. The three cues at their original text

**The server record never moved backwards; those cues' saves never landed.**

- Every failed save writes nothing: `team_production_save` and `team_production_patch` are single
  statements, so a statement timeout rolls the whole write back.
- Reproduced locally: the seven-typists instrument with `production_copies`, `partial_writes` and
  `auto_publish` on, the database throttled to 0.1 CPU and the signed-in role's statement timeout
  cut to 1.5 s during the work (75 s), then restored. Every editor page ended with "canceling
  statement due to statement timeout", as on staging. An audit trigger recorded each cue's text on
  every stored revision (23 revisions): **no cue ever went backwards**. Editor F's record stayed at
  its first text (`#1`) 40 s after the load ended while F's page held `#18`: the same "record
  behind the page" shape as staging, with nothing undone.
- On staging, C kept `#43` and G `#5` of 119: their saves stopped landing early. A, B and F read
  "Alexandra Riva" because none of their saves landed at all in 8 minutes. The phase 9 report's
  "went back to their original text" should read "never left their original text".
- Why it did not catch up within the 120 s settle: a failed save is not retried on its own timer.
  `pushSave` records the failure and leaves the edit dirty; the retry is scheduled only by the
  next good read (`refreshOnce`, every 15 s, backing off to 120 s while reads fail) or the next
  keystroke, and then waits out the save backoff (2 s doubling to 30 s).

**Can production lose text today, with production_copies on?** No backwards path was found or
reproduced. The edit stays on the typist's page and in the device outbox (`retainTeamEdit`), and a
reload restores and resends it. It can, however, stay unsaved for minutes under load, so a second
person or the output sees the older text in that time, and a production with this many graphics
and editors will hit the same statement limit on production that it hits on staging.

## 4. Why Takes, Goals and messages are lost rather than retried

All three ask the same saturated database, and none waits for it.

- **Takes**: `graphicVerbs.ts` sends through `sendWithResend` (`src/control/failedSends.ts`). Each
  attempt is cut at 1.5 s (`ATTEMPT_TIMEOUT_MS`), resent after 0.4, 1 and 2 s, and nothing starts
  after 4 s (`RESEND_WINDOW_MS`). With request medians of 0.6 to 7.6 s every attempt is aborted:
  23 of the taker's 78 sends were `net::ERR_ABORTED`. The page then says "on this monitor only ...
  Send it again". This is deliberate (a Take that lands late is a new mistake) and it is reported,
  but an aborted attempt can still commit on the server and is only settled if its row is heard.
- **Goals**: a press waits for the press before it on the same graphic, up to 7 s
  (`afterPress`, `RESEND_WINDOW_MS + 2 * ATTEMPT_TIMEOUT_MS`), then writes the bound score through
  `operatorWrite` (`src/control/productionDataSession.ts`) as an absolute value computed from the
  page's tree. One attempt, no timeout, no retry: on failure it notes "not moved" and calls
  `refresh()`, which replaces the page's tree with the server's and so drops the presses counted on
  top of it. One press every 2.25 s against a round trip of several seconds builds a queue that
  never drains ("sending..." at the end of the run). 199 presses, score 55.
- **Messages**: Paste calls `audience_operator_add` once (`audienceData.ts`); a failure says "The
  message was not kept". Prepare then adds a cue, which is a team save of the whole record and
  waits behind the others. The instrument gave each row 20 s; 14 of 39 did not make it.

## 5. Staging's size, or production too

The mechanism is the same on any hosted tier: the work is linear in record size, multiplied by the
number of writers through refusals, and the 8 s statement limit is the hosted default for the
signed-in role (the local stack carries the same 8 s, and staging's errors are that limit). Only
the threshold moves with compute. Measured ratio for the same requests: staging is 4.5 to 8 times
slower than the local stack for a 60-graphic save, and a one-row read on idle staging takes 0.48 s from the runner (round trip about 0.24 s) where
locally they take 5 ms.

Staging is a free project. Production's compute is "Small" (from the production-load report in
#2599, which also shows 517 of 1024 MiB swap in use); its speed under this workload was not
measured, by rule. Expect production to cope with larger records or more writers than staging,
and to hit the same limit at some size: a 60-graphic production with two people editing is already
past 8 s on staging, and the work per edit on production is the same 5 MB. Staging's size explains
when it breaks, not why.

## 6. Causes, smallest fixes, issues

| # | Cause | Evidence | Smallest fix | Risk | Issue |
|---|---|---|---|---|---|
| 1 | Every team save sends and rewrites the whole record, which carries every graphic's full template | 0.58 MB at 6 graphics, 5.1 MB at 60; save 57 to 296 ms local, 0.6 to 7.2 s staging, linear | Keep graphic templates out of the team record (content-named, stored once, as 0120 does for publications), so a cue edit writes kilobytes. `partial_writes` alone does not help the database: `team_production_patch` still reads and rewrites the whole value | Medium: a persisted-format change with a migration on read | #2614 |
| 2 | A refused save returns the whole record, and the page re-uploads the whole record up to four times | 7 writers: 123 of 144 saves refused locally, 91 of 112 on staging, 51.7 MB returned in 30 s | Answer a refusal with the token and revision only; the page reads the record once and merges | Low: the client already handles a refusal; one more read | #2615 |
| 3 | The publish write reads and copies the whole 5 MB output several times | 1,089 ms local: 293 ms decompressing to read `ver.n`, 297 ms in four triggers; 3.4 to 5.6 s on idle staging | Filter on `published_ver` instead of `output->ver->>n`; skip the triggers' whole-value comparisons when `ver` is unchanged; longer term publish in parts by default | Low for the filter; trigger change is live-path | #2616 |
| 4 | Goal presses are written as absolute values, once, and a failed write resets the tree, dropping later presses | score 55 of 199; one attempt in `operatorWrite`, `refresh()` on failure | Send `+1` as a relative operation the server applies, and resend until it lands or report how many presses are unsent | Medium: a new RPC shape on the live path | #2617 |
| 5 | A failed team save is retried only after the next good read | F stayed at `#1` 40 s after load ended locally; staging did not catch up in 120 s | Reschedule the save on its own backoff when it fails | Low | #2618 |

Related: #2589 (seven typists; its fix #2591 made each typist write only its newest save, which
these numbers support but do not finish), #2599 (production load).
