---
v: 1
scope: src/model/generationSpec.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-more-control-panel-user-authored-lives.md
---
The AI More-control panel's user-authored `GenerationSpec` lives HERE rather than in `src/ai`, because `SavedProject` and `GraphicDoc` persist it as `aiSpec` (additive optional) and the model layer imports nothing above it. The category REGISTRY that interprets a spec is `src/ai/spec/categories.ts`. `normalizeSpec` is the migrate-on-read guard: an unknown version degrades to no spec, never a crash.
