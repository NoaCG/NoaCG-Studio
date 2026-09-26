---
v: 1
scope: src/**
kind: invariant
fires: contract
status: active
since: 2026-09-26
record: contracts/records/model/2026-09-26-never-rename-persisted-deployed-identifiers-storage.md
---
Never rename persisted or deployed identifiers: the `spx-gfx-*` storage keys, BroadcastChannel names, CSS class prefixes, and the Supabase and Vercel project slugs. Renaming one wipes saved user data or breaks a deploy; only displayed names change.
