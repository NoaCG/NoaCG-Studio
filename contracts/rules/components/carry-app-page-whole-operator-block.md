---
v: 1
scope: src/components/HostedControlPage.tsx
kind: rule
fires: contract
status: active
since: 2026-11-05
supersedes: components/hosted-page-carries-app-page-whole
record: contracts/records/components/2026-11-05-carry-app-page-whole-operator-block.md
---
Carry the in-app page's whole operator block on the hosted page: event sections from `arrangeControls`, the step presses « Back and ⟲ Reset, the block's help in the heading's hover rather than a line under it, the activity log, the not-on-air-yet warning judged against what the WIRE says was last sent so another operator's update clears it, and the production DATA-ROW picker whose rows `buildPanelSpec` publishes from the shared `control/cueData.ts` matcher. Field edits go to the SHARED staging buffer and air only on an explicit take.
