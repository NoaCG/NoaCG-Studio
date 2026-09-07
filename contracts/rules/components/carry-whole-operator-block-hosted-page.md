---
v: 1
scope: src/components/HostedControlPage.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-carry-whole-operator-block-hosted-page.md
---
Carry the whole operator block on the hosted page: event sections from `controlSections`, the recovery `.pd-snap`, the help line, the activity log, the not-on-air-yet warning judged against what the WIRE says was last sent so another operator's update clears it, and the production DATA-ROW picker whose rows `buildPanelSpec` publishes from the shared `control/cueData.ts` matcher. Field edits go to the SHARED staging buffer and air only on an explicit take.
