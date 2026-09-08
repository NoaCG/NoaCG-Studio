---
v: 1
scope: src/components/wizard/CreationWizard.tsx, src/app/router.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-give-every-wizard-step-own-history.md
---
Give every wizard step its own history entry at `#/new/step/<name>`, NAMED and never indexed, because import mode adds a step that shifts every later index. Step 0 carries no segment, so Back off the front page still leaves, and the open reset seeds its step from the route rather than from 0.
