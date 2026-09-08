# A new spec that is in no list never runs on the gate it was written for

**Filed:** 2026-09-05, from the evidence read behind `docs/MISTAKE_TRIGGERS.md` ("The 2026-09-05
read"). Routed there as a BUILD GATE, not a hook, because the fact it needs is the state of two
files against a directory.

## Why

`scripts/e2e-affected.mjs` maps changed SOURCE to the specs that cover it and escalates an unmapped
source path to the full suite - the safe direction. A new SPEC has no such safety: written and
committed without a line in `scripts/e2e-lists.mjs` or the map, it runs only at night, and the
branch that added it lands on a gate that never ran it. Three handoffs in five days carry the same
finding, all three since drained: route-transition-flash, 2026-09-02 ("the spec would not have run
on the merge gate"); browse-a-production's-graphics, 2026-09-04 ("the spec was mapped but not in
`FOCUS`"); panel-pairs-with-import, 2026-09-04 ("the new
walks not mapped ... so editing the export files they guard would never schedule them"). The root
`AGENTS.md` already says "add a spec for any new flow plus its mapping in the same commit", which
is the proof prose does not fire here.

## What

A check in `npm run build` that lists every `e2e/*.spec.ts` and fails on one that no entry in
`scripts/e2e-lists.mjs` names and no rule in `scripts/e2e-affected.mjs` maps, with the file quoted
and the two places to put it. A gate lands alone (`.agent-workflows/orchestrator/collisions.md`),
so this is its own row. The first run will name the specs already in that state; each is either
mapped or listed as deliberately nightly-only, in the same commit.
