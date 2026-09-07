# templates/arm-machine-timers-through-end-entry

Rule: `templates/arm-machine-timers-through-end-entry`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 282-284.   path changed. Timers are `gsap.delayedCall` armed by a `tl.call` at the entry timeline's end,   never setTimeout: GSAP's callback suppression then means a settled/scrubbed graphic never   arms one, and the bench's timeScale + the render virtual clock drive them for free.
