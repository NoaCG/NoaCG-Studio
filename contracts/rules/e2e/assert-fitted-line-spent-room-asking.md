---
v: 1
scope: e2e/import-svg*.spec.ts
kind: trap
fires: contract
status: active
since: 2026-09-19
record: contracts/records/e2e/2026-09-19-assert-fitted-line-spent-room-asking.md
allow-numbers: true
---
Assert that a fitted line spent its room by asking whether one more pixel of type would still fit, never by bounding the leftover. A hinting renderer sizes glyphs at whole pixels, so the leftover is a step of the font size and differs between Windows and CI's Linux with nothing wrong. Put the measured numbers in the expect message so a CI-only red explains itself.
