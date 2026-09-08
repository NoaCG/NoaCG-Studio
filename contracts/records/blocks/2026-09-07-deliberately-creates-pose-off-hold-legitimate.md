# blocks/deliberately-creates-pose-off-hold-legitimate

Rule: `blocks/deliberately-creates-pose-off-hold-legitimate`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

A pose's look is composed by replaying the route to it, so before `setStateTimeline` every authorable branch was by construction a copy of its predecessor - that one mutator is what lets a branch LOOK different from the state before it.
