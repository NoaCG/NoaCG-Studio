# The second review's SQL changes, applied and checked on B

2026-09-30, preview branch B. Never production. Scratch scripts in the session's `step2/`, run
through the preview-branch wrapper with `branch-b.env`, Management API only.

## What was applied

The changes of commit 0f08a678a (then in the file named 0070, now 0071): `control_send_seq` and
`control_output_report_seq` with a 1 s wait for the show row and the head and a refusal when the
production vanished under the lock; `control_head_legacy` bounded below the first numbered row;
`control_tail_seq_for` trusting its window only when it holds every row after the cursor; and the
whole self-check block (an owner hosted control is open to, every internal function asserted out
of both client roles, realtime.messages reads bounded to the apply's minute). One transaction,
`create or replace`; answered 201 with the self-check passing. Before it, a dry run applying 0069
and the sequence file whole on B's pre-Step-2 schema, rolled back, reached its end.

## What was checked

- LEGACY, before and after (`legacy-compare.sql`), for every production on B with rows: the new
  bound answered exactly what the old full scan did, with no baselines and with each production's
  real reports. Two productions held seq-null rows (46 and 3); on both every seq-null id was below
  every numbered id, which is the premise of the bound.
- TAIL WITH A GAP (`tail-gap-test.sql`, rolled back): a throwaway production with rows 1 to 6,
  row 3 deleted as a prune would. From 0 the tail answered 1, 2, 4, 5, 6; from 1, 2, 4, 5, 6; from
  3, 4, 5, 6; with nothing deleted, 1 to 6. The head answered 6 each time.
- LEGACY BOOT, re-run (job j-2561, `verify-b.mjs --scenarios legacy`): see `legacy-boot.md`.

## Limitations

- The tail's window fallback on a row pushed out of the window by a waiting legacy writer (review
  2 ordering:F3) was not produced; the gap test takes the same fallback path.
- No EXPLAIN of the bounded legacy read on a large production; B's largest has about 2,600 rows.
