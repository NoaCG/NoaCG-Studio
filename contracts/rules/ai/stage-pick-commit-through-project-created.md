---
v: 1
scope: src/ai/preferences.ts, src/ai/claudeProvider.ts
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-stage-pick-commit-through-project-created.md
---
Stage a pick with `stageSelection` and commit it through `commitStagedSelection` when the project is created; store only local shown/chosen facet counters. Let `preferenceHint` act as a subtle tie-breaker after `MIN_SELECTIONS` and `MIN_SHOWN`, never override the brief or react to a single click.
