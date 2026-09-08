# blocks/motion-lives-two-places-default-path

Rule: `blocks/motion-lives-two-places-default-path`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

The canvas is the easy one to forget: it took its data straight from `parseAnimData`, so with a branch on screen a canvas drag wrote x and y into the default path's step while the strip showed the branch. Dropping `machine` on the projection is what stops the walk's cue markers and `spxSteps` describing a branch as if it sat on the path.
