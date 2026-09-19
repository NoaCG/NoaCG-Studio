---
v: 1
scope: e2e/import-svg*.spec.ts
kind: trap
fires: contract
status: active
since: 2026-09-19
record: contracts/records/e2e/2026-09-19-assert-what-imported-line-fit-spent.md
allow-numbers: true
---
Assert what an imported line's fit SPENT in the fit's own ruler, getComputedTextLength in user units, and bound the painted rectangle hard only on the side that eats the margin. Put the measured numbers in the expect message, because the two rulers agree on Windows and differ on CI's Linux renderer.
