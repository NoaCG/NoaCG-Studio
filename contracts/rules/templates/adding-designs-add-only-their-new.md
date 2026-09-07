---
v: 1
scope: src/templates/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-adding-designs-add-only-their-new.md
---
When adding designs to `scripts/overflow-baseline.json`, add only their new rows by hand and preserve every existing row. Confirm the result with `node scripts/overflow-sweep.mjs --baseline`, rather than replacing the reference with a full re-record.
