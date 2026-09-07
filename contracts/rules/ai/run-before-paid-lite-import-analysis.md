---
v: 1
scope: src/ai/lite/**, src/ai/importAnalysis/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/ai/2026-09-07-run-before-paid-lite-import-analysis.md
---
Run `npm run bench:preflight -- <models>` before paid Lite or import-analysis comparison rounds and resolve arms through the real `liteProfile` and task registry in `api/_lib/aiBenchPreflight.ts`. Refuse overridden, unapproved, unconfigured or indistinguishable arms before spending.
