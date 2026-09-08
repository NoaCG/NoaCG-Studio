---
v: 1
scope: src/components/wizard/useMarkLegibility.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-measure-mark-legibility-warning-own-offscreen.md
---
Measure the mark-legibility warning on its OWN offscreen frame, because the preview iframe deliberately carries no same-origin access and its pixels cannot be read from the app at all. Debounce past the preview own settle, skip entirely unless the draft carries a logo, and REPORT without ever repairing.
