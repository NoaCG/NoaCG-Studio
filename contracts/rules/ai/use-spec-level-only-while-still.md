---
v: 1
scope: src/ai/claudeProvider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-use-spec-level-only-while-still.md
---
Use `GenerateOptions.spec` for spec-level `modify` only while `detectPrefix` and `parseAnimData` still recognize a house-shaped template; otherwise refine code. Feed `convertImport` a deterministically parsed import from `src/model/importTemplate.ts`, never raw file bytes.
