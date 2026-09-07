---
v: 1
scope: **
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-land-through-run-session-owns-branch.md
---
Land through `/queue-merge`, run in the session that owns the branch when that work is FINISHED. Queueing IS the declaration that the work is done and only that session can make it, so nobody else queues your branch. Never merge into `main` yourself and never drive `safe-merge` by hand.
