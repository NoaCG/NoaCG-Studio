---
v: 1
scope: src/components/HostedControlPage.tsx
kind: rule
fires: contract
status: active
since: 2026-10-03
supersedes: components/carry-whole-operator-block-hosted-page
record: contracts/records/components/2026-10-03-hosted-page-carries-app-page-whole.md
---
The hosted page carries the in-app page's whole operator block: event sections from `arrangeControls`, the recovery `.pd-snap`, the block's help in the heading's hover rather than a line under it, the activity log, the not-on-air-yet warning judged against what the WIRE says was last sent so another operator's update clears it, and the production DATA-ROW picker whose rows `buildPanelSpec` publishes from the shared `control/cueData.ts` matcher. Field edits go to the SHARED staging buffer and air only on an explicit take.
