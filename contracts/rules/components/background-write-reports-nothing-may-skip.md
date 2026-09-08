---
v: 1
scope: src/components/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-background-write-reports-nothing-may-skip.md
---
A background write that reports nothing may skip `commitDurableWrites` entirely, because the app-level dialog already announces unclaimed failures. Awaiting it in an autosave buys nothing and delays the next edit.
