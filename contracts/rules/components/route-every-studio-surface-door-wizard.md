---
v: 1
scope: src/components/NewGraphicButton.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-28
supersedes: components/open-wizard-through-every-studio-surface
record: contracts/records/components/2026-09-28-route-every-studio-surface-door-wizard.md
---
Route every studio surface's door to the wizard through `NewGraphicButton` - Home, the editor, the control page, the production dashboard, the video shell, and the wizard's own header - never a hand-rolled button. It always navigates to `#/new` behind `requestSwitch`, takes `productionId` on a production surface so a graphic made while standing in a show joins it, and inside the wizard is a guarded start-over mid-walk that keeps the draft and, through `current`, a marked non-button item on the front page.
