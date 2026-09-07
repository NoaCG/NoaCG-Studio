---
v: 1
scope: src/components/wizard/steps/ai/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-handle-pro-finding-step-cannot-repair.md
---
Handle a Pro finding the step cannot repair by clamping categories to the supported set, demoting spec-field findings to warnings against a fixed contract with no repair loop, and standing refine and fix down, because regenerating is the honest move.
