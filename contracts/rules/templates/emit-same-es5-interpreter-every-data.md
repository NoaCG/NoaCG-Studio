---
v: 1
scope: src/templates/shared/animRuntime.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/templates/2026-09-07-emit-same-es5-interpreter-every-data.md
---
Emit the same ES5 interpreter in every data-driven template, preserving `buildInTimeline`, `buildOutTimeline`, and `revealNextStep` globals. Emit the complete data header, literal, and interpreter with `emitAnimRegion`, and replace the marked region through `replaceRegionWithAnimData`.
