---
v: 1
scope: src/components/wizard/steps/ai/**, src/ai/preferences.ts
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/wizard/2026-09-07-let-directions-survive-refinement-keep-current.md
---
Let the directions SURVIVE a refinement: keep `alternatives` and `originals` as parallel arrays, replace only the selected one on refine, and offer an undo that restores the proposed design without spending a generation. Stage the pick with `stagePick` on selection AND after every refinement - chosen facets from the direction as it stands, shown from the ORIGINALS - and stage nothing for a lone result.
