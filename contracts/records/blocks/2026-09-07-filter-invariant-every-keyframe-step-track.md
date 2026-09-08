# blocks/filter-invariant-every-keyframe-step-track

Rule: `blocks/filter-invariant-every-keyframe-step-track`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

GSAP matches the numbers positionally, so a track whose keyframes disagree on shape jumps instead of interpolating. `setFilterComponent` resolves the OTHER functions at that moment first, so editing brightness never silently resets a blur that was mid-tween. The consequence, by design, is that filter functions SHARE a keyframe - the diamond stamps them all at once.
