# Less database work per user

Why: on 2026-11-03 production stalled on its smallest compute size. It now runs on Small (2 GB) and
the 190 MB database fits in memory, so nothing is on fire. This adds headroom for more users.

## Behaviour

- A sync list reads each document's revision time from its own small column instead of opening the
  stored document. Every write keeps that column equal to the body's `updatedAt`.
- A renderer's heartbeat, a report or a stage on a published production no longer opens that
  production's stored payload. A trigger compared the whole `output` before and after on every
  update of the row, even when the statement never named it.

## Preserved behaviour

- The sync tiebreak is still the client's timestamp, with the same value and the same rule for a
  missing one. `updated_at` is still the server's write time, and the backfill does not move it.
- A page on an instance that has not run the migration still syncs. A list falls back to the old
  read when the column is missing.
- A publish still stamps `audio_owner_id`, and a heartbeat still never changes it.

## Non-goals

- Moving published shows' assets to Storage. See the decision below.
- Changing compute, load tests on production, or the load watch on `claude/production-load-watch`.
- The body a save asks back to confirm its revision. It is small next to these and not measured.

## Decisions

- **The copy is a jsonb column kept by a trigger.** It holds exactly what `body->'updatedAt'` gave,
  so every summary reads as before. A stored generated column would rewrite the whole table.
- **The backfill is inside the migration, in one transaction.** A half-filled column would read as
  the epoch, so no page may ever see one. It locks `documents` only, for about as long as reading
  every revision took on production: 277 ms for all 1022 graphics. A 10 s statement limit caps it.
- **The trigger narrowing is its own landing,** because it is on the live path and waits for a
  quiet window, while the sync list has no such wait.
- **Published shows' assets stay inline.** The gain is small and the risk lands on air:
  - An output's whole payload arrives today in one answer from one service, stamped with one
    version. With assets in Storage, an output also needs Storage and a signing route to answer
    before its images and fonts exist, so a slow Storage would air a graphic with a missing logo or
    the wrong font, or hold it back. Keeping an inline fallback would keep the row's size, which is
    the only thing the move would save.
  - Sounds already go through Storage, but only at Prepare, where an operator sees the failure and
    retries. Nobody is watching an output reload.
  - The cost is rare. The row is read when an output or an operator page loads and written on
    publish, not per Take. `control_shows` is 41 MB across 52 rows, which fits in memory on Small.
    Its recurring cost was the trigger above, which this work removes.
  - Worth reopening if published rows grow past what memory holds, with the output's load able to
    survive a Storage outage as the first requirement.

### AC-1: A sync list does not open the stored documents

A list for a kind reads the new column only. Measured on production with read-only queries against
`extensions.pg_stat_statements` and one `EXPLAIN (ANALYZE, BUFFERS)` of the list's shape: blocks per
call before against after. For all 1022 graphics together: 10387 blocks and 277 ms before, 115
blocks and 0.7 ms after (the same query shape, 2026-11-03, once 0107 was applied).

### AC-2: The column stays equal to the body through every write

Migration self-check (runs on every apply, configured suite included): an insert, an upsert, an
attempt to write the column directly, and a body with no revision. A throwaway Postgres also proved
that a backfill leaves `updated_at` alone and a body with a non-string revision reads the same.

### AC-3: Syncing behaves as before, on a migrated instance and on one that is not

Node test (`scripts/supabase-provider-list.test.mjs`): the summary's revision and tombstone come from
the column, and a missing column falls back to the old read, while any other error still fails the
list. The configured suite's sync journeys (`e2e/configured/`) pass against a stack with the column.

### AC-4: The migrations are bounded and additive

`scripts/db-push.test.mjs` accepts both, with their timeouts and the live-path header on the second.

### AC-5: A heartbeat does not open the payload, and a publish still stamps

Migration self-check on the narrowed trigger: updating another column leaves `audio_owner_id` alone,
and a new `output` stamps it. A throwaway Postgres measured a heartbeat on a 7 MB payload: 1880
blocks and 7.3 ms before, 5 blocks and 0.04 ms after. `control_output_seen` per call on production
is read from `extensions.pg_stat_statements` before and after.
