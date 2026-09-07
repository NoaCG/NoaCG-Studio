---
v: 1
scope: src/components/wizard/import/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-let-geometry-propose-followers-author-edit.md
---
Let geometry propose followers and the author edit them: `proposeFollowers` measures the runtime guess on the step render, outermost-first, never a group AND its contents. An untouched proposal emits NOTHING because the runtime derives it, and the FIRST EDIT materializes the whole set into `svgStretch.followers`. Render the list only where there is something to decide, and let growth alone open nothing.
