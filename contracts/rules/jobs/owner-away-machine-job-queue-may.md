---
v: 1
scope: scripts/jobs-store.mjs, scripts/jobs.mjs, .agent-workflows/orchestrator.md
kind: rule
fires: contract
status: active
since: 2026-09-15
record: contracts/records/jobs/2026-09-15-owner-away-machine-job-queue-may.md
---
When the owner is away from the machine, the job queue may use more of its memory: lower the free-RAM floor for that window rather than leave browser work waiting behind a guess, and measure what a run actually needs before assuming the default floor. During a day wave, with the owner at the computer, ask before going past the floor.
