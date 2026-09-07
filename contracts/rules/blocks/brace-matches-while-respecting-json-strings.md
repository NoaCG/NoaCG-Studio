---
v: 1
scope: src/blocks/animData.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-brace-matches-while-respecting-json-strings.md
---
`locateAnimData` brace-matches while respecting JSON strings, so a hand-edited block need not match the canonical layout to be found; parsing is strict JSON plus the structural gate `isAnimData`, and anything off-shape degrades to hand-crafted HONESTLY, never a crash. `spliceAnimData` replaces ONLY the object literal - every other character of the file, interpreter and user code alike, is untouched.
