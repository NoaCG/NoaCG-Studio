# blocks/delete-nothing-can-reach-never-repair

Rule: `blocks/delete-nothing-can-reach-never-repair`. Recorded 2026-09-07 on `claude/migrate-agents-contract-rules-5ab9fc` at 39835021.

The countdown block went on 2026-08-29: unreachable, and wrong three ways at once - it decremented a counter per setInterval tick instead of anchoring a deadline (drifting late under load, losing minutes in a background tab), read its duration field once and ignored every later Update, and hid that field with an inline display:none the editor's entrance reset clears. Adding a block back is cheap; a second divergent implementation of playout logic is not. The contract used to say the stub applies `fullscreen` and nothing else, which is false and would have licensed deleting eight live entries.
