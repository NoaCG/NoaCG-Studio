---
v: 1
scope: src/components/wizard/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-treat-shared-facet-never-reads-never.md
---
Treat the shared `ProjectFormatPicker` as not a facet - `browseTemplates` never reads it - so never put it inside the filter drawer. On Browse it is three bare selects in one row with each label hidden through `.project-format-label` but kept in the DOM for a screen reader: hide the WORDING, never the control. Every other caller renders the picker unchanged, and draft selection survives route switches.
