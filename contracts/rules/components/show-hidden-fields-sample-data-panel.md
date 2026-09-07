---
v: 1
scope: src/components/SampleDataPanel.tsx, src/components/ControlPanel.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-show-hidden-fields-sample-data-panel.md
---
Show hidden fields in the sample-data panel (`includeHidden`) and hide them in the operator view, because a hidden field carries a real input value like a countdown's duration and has to be testable while designing, while SPX skips it on air.
