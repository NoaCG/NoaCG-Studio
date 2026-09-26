---
v: 1
scope: e2e/_offline-guard.ts, scripts/e2e-runs.mjs, scripts/command-match.mjs
kind: trap
fires: test:e2e/_offline-guard.ts
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-enqueue-browser-driving-work-rather-than.md
---
Run browser-driving work (suites, sweeps, benches, spikes) through `npm run queue`, because one runs per machine. Name a new browser-driving script like its siblings so `SWEEP_SCRIPTS` sees it, or add it there.
