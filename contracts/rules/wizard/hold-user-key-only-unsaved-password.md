---
v: 1
scope: src/components/wizard/steps/ai/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-hold-user-key-only-unsaved-password.md
---
Hold a user AI key only in the unsaved password-field state and submit it to the credentials endpoint. Never pass a key through the settings object, browser storage, query parameters, telemetry, logs or rendered error detail. Model lists are provider-scoped suggestions, not an application-wide allowlist.
