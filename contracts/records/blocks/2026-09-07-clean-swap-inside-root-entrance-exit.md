# blocks/clean-swap-inside-root-entrance-exit

Rule: `blocks/clean-swap-inside-root-entrance-exit`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

An ambient breath is behaviour, not the entrance, and an inserted graphic's layers live outside the root - dropping either would silently delete work the picker never claimed to touch.

The loops caveat is the one the contract this replaced got wrong: it said the rewrite KEEPS `loops` flat out. `applyMotionPreset` step 2 deletes `step.loops[selector][prop]` for every property the written track covers, because two sources for one property is not a state the interpreter has an answer for. An ambient breath on a property the motion leaves alone survives; a breath on `opacity` under a Fade does not.
