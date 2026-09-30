---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "The numbered command log (Phase 6 Step 2) has no (show_id, seq) index, so catch-up reads grow with a production's retained log."
size: standard
touches: supabase/migrations/, scripts/db-push.mjs, src/output/main.ts
needs-owner: none
---

# Index the numbered command log before productions keep large logs

## Why

Phase 6 Step 2 reads a production's log by sequence number without an index on `(show_id, seq)`
(design K4 in `docs/work-specs/playout-runtime-reliability/step-2-design.md`): an index built in
the same migration would have scanned `control_events` under a lock on air. Today each tail read
costs about the gap it covers, and the fallback scans the production's retained log (14 days by
the daily sweep). A renderer that reboots far behind on a feed-driven production could read slowly
enough to stay dark until reloaded. Fine at today's sizes; not past roughly 50k retained rows.

Also small, from the same work: the telemetry's identity line and Presence entry still say
`protocol 1` although a page may run protocol 2 (K8).

## What it would take

- `create index concurrently` on `control_events (show_id, seq) where seq is not null`, which
  cannot run inside `db-push`'s one-transaction-per-file: add a non-transactional path for it,
  or build it as a separate, explicitly run step.
- Serve `control_tail_seq_for` from the index; keep the current path as the fallback.
- Report the protocol the page actually negotiated in telemetry.
