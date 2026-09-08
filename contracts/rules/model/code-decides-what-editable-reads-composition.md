---
v: 1
scope: src/model/videoInputInfer.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-code-decides-what-editable-reads-composition.md
---
The CODE decides what is editable: `videoInputInfer.ts` reads a composition's inputs OUT OF the module - every field read with a literal fallback, typed from that fallback - so a hand-written field gets the same control the AI would have declared. `contentInputs(declared, tsx)` is what the Content panel shows: declared inputs FIRST and unchanged, because they carry labels, options and bounds a fallback cannot express, then whatever else the code reads. A read with NO literal fallback is ignored on purpose - without a default there is nothing to show, reset to, or type the control from.
