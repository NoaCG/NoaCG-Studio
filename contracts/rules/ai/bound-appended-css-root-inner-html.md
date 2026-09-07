---
v: 1
scope: src/ai/polish.ts, src/ai/claudeProvider.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-bound-appended-css-root-inner-html.md
---
Bound `applyPolish` to appended CSS and the root's inner HTML; reject changes to `:root`, `@font-face`, scripts, field ids or animation selectors. Run `polishStage` only for a requested `flourish` on a valid assembly and revert a rejected or bench-failing patch.
