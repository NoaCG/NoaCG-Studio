---
v: 1
scope: src/model/designRules.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-per-project-settings-viewing-target-plus.md
---
The per-project `ProjectLegibility` settings are the viewing target plus the relaxed-or-safe floors tri-state, and `normalizeLegibility` makes the DEFAULT serialize to NOTHING, so an untouched project carries no legibility payload at all.
