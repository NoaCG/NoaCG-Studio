---
v: 1
scope: src/model/fonts.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-face-flag-measured-never-declared-hand.md
---
A face's `tabularFigures` flag is MEASURED by `scripts/numerals.mjs --fonts`, never declared by hand, and it is measured ACROSS the face's weight range because a face with even digits at one weight can spread at another. An imported face is measured at import by `registerAndMeasureFont`, and an ABSENT flag reads as cannot.
