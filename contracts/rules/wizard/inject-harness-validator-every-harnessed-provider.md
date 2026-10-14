---
v: 1
scope: src/components/wizard/ai/**
kind: rule
fires: contract
status: active
since: 2026-10-14
supersedes: wizard/inject-harness-validator-every-provider-call
record: contracts/records/wizard/2026-10-14-inject-harness-validator-every-harnessed-provider.md
---
Inject the harness validator into every harnessed provider call and screen the raw call's result where it is shown, stream the progress stages into the busy line, show the route badge on the result card, and pass a grounded result spec back on refine so spec-level refinement re-assembles deterministically.
