---
v: 1
scope: src/components/wizard/CreationWizard.tsx
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-snapshot-walk-each-three-appliers-finish.md
---
Snapshot the walk as a `FinishedWalk` in each of the three appliers when a Finish door closes the wizard. Re-opening onto a `#/new/.../step/<name>` url offers it back behind a warning naming what re-entering resets, while a plain `#/new` means a fresh wizard and discards it. A second pass saves OVER the record that walk made, through `saveBuiltGraphic` and never `saveGraphicAs` directly.
