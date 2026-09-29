# A publish holding the production's row does not delay a Take (AC-15, the real writer)

2026-09-30, preview branch B (migrated). Never production.

## What the real writer is

Read off `pg_stat_statements` on the branch after issuing each publish write as the production's
owner through PostgREST (the branch's E2E test account, as the configured specs sign in):

- the OLD publish (supabase-js `upsert(..., { onConflict: 'id' })`) runs
  `INSERT INTO "public"."control_shows"("id", "title", ...) ... ON CONFLICT("id") DO UPDATE SET
  "id" = EXCLUDED."id", "title" = EXCLUDED."title", ...`. The key column `id` is in the SET, which
  makes Postgres lock the existing row FOR UPDATE.
- the NEW publish (`writeControlShow`: update by id, insert only when nothing matched) runs
  `UPDATE "public"."control_shows" SET "title" = ..., ... WHERE "public"."control_shows"."id" = $2`,
  with no key column in the SET: FOR NO KEY UPDATE.

A first run of this scenario held an upsert written by hand without `id` in its SET; it did not
block Takes, and that was a wrong test of the old writer, not a finding. The run below holds the
captured shape.

## What ran

Jobs j-2462 and j-2481, scenario `publish` of the scratch script `step2/verify-b.mjs` (session
scratchpad), this branch's app, through the preview-branch wrapper with `branch-b.env`. Three
conditions, each with a new output and a new hosted page on `p6-harness main`: nothing held; the
new publish's statement (`update ... set title, panel, output, bindings, profile ... where id`)
held open 15 s in a transaction; the old publish's captured upsert shape held open 15 s, run as the
owner. During each, the operator pressed Take and Out alternately (every 700 ms, each Take waited
for air) for about 13 s.

## What was observed

| Condition | Sends | Failed | Send p50 / p95 | Takes aired | Press to air (ms) |
|---|---|---|---|---|---|
| nothing held | 12 | 0 | 68 / 163 ms | 6 of 6 | 168, 194, 156, 134, 113, 162 |
| new publish held 15 s | 12 | 0 | 112 / 168 ms | 6 of 6 | 215, 159, 172, 168, 201, 164 |
| old upsert held 15 s | 4 | 3 | 2,068 / 2,083 ms | 1 of 2 | never, 1,528 |

- With the new publish's statement holding the row, Takes and Outs kept their latency (the first
  run, j-2462, measured the same shape at p50 89 / p95 150 ms, 6 of 6). Before Step 2 every Take and
  Out failed after about 3.1 s under a held row (research §5.3), and the lock-release burst run
  (`lock-release-burst.md`) shows 52 of 52 sends answering in at most 203 ms under a 15 s hold of
  the row by an ordinary UPDATE.
- The old bundle's upsert still blocks: sends wait for the row, time out on their own 2 s lock
  timeout and are sent again, and most end in the "server did not answer" notice. That is the
  transitional case D8 names: an old page's publish, until it reloads.

## Limitations

- The held statement was the captured SQL run through the Management API, not a publish pressed in
  the app and frozen mid-write; it takes the same row lock.
- The old-upsert condition only ran two Takes in its window, because each waited up to 12 s for air.
- Old pages' own Updates now wait behind a new publish too (step-2-design.md D-n); not measured here.
