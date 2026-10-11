---
v: 1
scope: src/components/editorFoundation/**, docs/work-specs/editor-*/**
kind: rule
fires: contract
status: active
since: 2026-10-08
record: contracts/records/editor/2026-10-08-each-meaningful-editor-step-run-comparable.md
---
For each meaningful editor step, run a comparable task in a suitable working reference editor and record its pinned source, executed version, relevant paths, interaction and rendered comparison, intentional differences and regression checks in the work spec and check. Code inspection is research, not runtime proof; if no equivalent exists, state that and verify the NoaCG contract without claiming usability or whole-editor parity. Engineering owns routine functional and interaction verification; reserve owner questions for product direction, taste and broadcast trade-offs.
