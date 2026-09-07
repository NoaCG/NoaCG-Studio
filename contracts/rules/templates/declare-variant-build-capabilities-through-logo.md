---
v: 1
scope: src/templates/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-declare-variant-build-capabilities-through-logo.md
---
Declare a variant's build capabilities through `maxLines`, logo support, `animationPresets`, and `defaultSteps`. Let `defaultSteps` determine untouched `create({})` output for stepped designs, preserving an unset wizard steps choice rather than overriding it with a boolean.
