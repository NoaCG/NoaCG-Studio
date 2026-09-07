---
v: 1
scope: src/components/wizard/steps/ai/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-offer-fix-these-failing-non-managed.md
---
Offer "fix these" on a failing non-managed result as a BUTTON and never an automatic loop, sending the exact validator findings back as the instruction at CODE level. Use the per-card verdict class, not the one that names the verdict on the current result. The smallest managed tier instead labels the same failure a platform defect and spends no repair call.
