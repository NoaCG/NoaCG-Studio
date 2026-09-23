---
v: 1
scope: src/components/wizard/kitPlan.ts, src/components/wizard/KitTray.tsx, src/components/wizard/steps/KitFinishStep.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-23
supersedes: wizard/walk-kit-through-same-six-steps
record: contracts/records/wizard/2026-09-23-build-whole-kit-moment-kit-step.md
---
Build the whole kit the moment the Kit step's Next is taken and land on the kit's Finish step as its HUB, where every graphic opens for editing in any order. `KitPlan` keeps one draft per graphic so leaving one and coming back is lossless, the tray's chips are navigation that open another graphic on the same step, there is no look question, and both hub doors SAVE FIRST with every write claimed.
