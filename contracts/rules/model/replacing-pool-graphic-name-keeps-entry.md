---
v: 1
scope: src/model/shows.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-replacing-pool-graphic-name-keeps-entry.md
---
Replacing a pool graphic by name KEEPS the entry's id, because cues reference it through `ShowCue.sourceId` and an id churn would orphan every cue on that graphic. A sync CONFLICT COPY strips the published capabilities and the pin point - the hosted, output, join and presenter slugs and `publishedAt` - so a conflict can never bring a second copy of a live production on air.
