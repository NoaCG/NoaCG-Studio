# model/every-surface-edits-field-renders-never

Rule: `model/every-surface-edits-field-renders-never`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`. `FieldKind` is the vocabulary the product supports - text, lines, number, color, select, toggle, image - and the video Template Definition uses the subset without lines and toggle. The shared shape is a key, label, kind and default value plus options or bounds, with `FieldValue` and `clampToField` beside it.
