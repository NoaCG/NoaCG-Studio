---
v: 1
scope: src/components/wizard/steps/ai/**, src/ai/runStats.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-show-money-result-card-prices-codebase.md
---
Show NO money on the result card - prices are not in this codebase and a stale one would be believed - and print zero tokens as silence, because "0 tokens" is a measurement claim rather than the absence of one. Take cost from the telemetry ring as a median expectation before Generate, null below two matching runs, and actuals after, recorded on a RUN and never on a re-pick.
