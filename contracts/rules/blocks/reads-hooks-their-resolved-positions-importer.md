---
v: 1
scope: src/blocks/animImport.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/blocks/2026-09-07-reads-hooks-their-resolved-positions-importer.md
---
`parseTimeline` reads `tl.call(fn)` hooks with their resolved positions and the importer attaches them to the enter or out step as speed-relative `calls`, which is what lets game timers flip to data blocks; it also reads a repeating tween's `repeat`/`yoyo`/`repeatDelay` and writes a step loop when the tween's values are finite LITERALS. Neither calls nor dynamics shift a tween's INDEX, so the legacy patchers are untouched.
