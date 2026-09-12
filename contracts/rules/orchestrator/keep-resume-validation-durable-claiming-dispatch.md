---
v: 1
scope: .agent-workflows/orchestrator/**, scripts/resume-dispatch*
kind: trap
fires: contract
status: active
since: 2026-09-12
record: contracts/records/orchestrator/2026-09-12-keep-resume-validation-durable-claiming-dispatch.md
---
Keep resume validation, durable claiming and dispatch in one fail-closed command. Parse saved deadlines as explicit UTC strings, preserve accepted claims through uncertain failures, and never follow a refused claim with a separate worker launch.
