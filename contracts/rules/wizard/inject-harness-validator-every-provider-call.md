---
v: 1
scope: src/components/wizard/ai/**
kind: rule
fires: contract
status: retired
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-inject-harness-validator-every-provider-call.md
---
Inject the harness validator into every provider call, stream the progress stages into the busy line, show the route badge on the result card, and pass a grounded result spec back on refine so spec-level refinement re-assembles deterministically.
