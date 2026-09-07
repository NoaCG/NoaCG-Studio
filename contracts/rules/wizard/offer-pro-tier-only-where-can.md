---
v: 1
scope: src/components/wizard/steps/ai/**, e2e/pro.spec.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-offer-pro-tier-only-where-can.md
---
Offer the Pro tier only where it can actually run - the status answer AND the metering backend - and where that is false make it ABSENT, never a greyed row and never a key request. Its settings are one read-back with the remaining allowance and no chooser of any kind: no provider, no model, no key. A hosted deployment is never reachable from the browser through a flag, a query parameter or a stored key.
