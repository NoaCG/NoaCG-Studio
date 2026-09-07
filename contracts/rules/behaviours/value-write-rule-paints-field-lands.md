---
v: 1
scope: src/templates/behaviours/**, src/templates/importedDesign/**
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/behaviours/2026-09-07-value-write-rule-paints-field-lands.md
---
A value a write rule paints is NOT a field: it lands in textContent on a stamped artwork layer, while every derivation reads a field through getElementById(fN). A second lookup therefore cannot read what a first one wrote, and a write whose value is empty is skipped, so a Reset cannot clear what it filled. Chain a derivation only through a real field the operator owns.
