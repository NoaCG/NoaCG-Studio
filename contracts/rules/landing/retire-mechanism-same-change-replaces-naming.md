---
v: 1
scope: contracts/retired.json, .agent-workflows/**, scripts/check-retired-names.mjs
kind: rule
fires: gate:check-retired-names
status: active
since: 2026-09-08
record: contracts/records/landing/2026-09-08-retire-mechanism-same-change-replaces-naming.md
---
Retire a mechanism in `contracts/retired.json` in the same change that replaces it, naming the replacement, so `npm run check:retired-names` refuses every contract, workflow or agent definition that still instructs it.
