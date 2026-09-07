---
v: 1
scope: src/templates/**, src/blocks/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-make-every-state-enterable-two-ways.md
---
Make every state enterable two ways - by transition, animated, or by SNAP, instant, for recovery and preview without playback - and keep reset TWO operations that are never conflated: reset visual state, and reset data. Process events SERIALLY through one queue that lives INSIDE the template.
