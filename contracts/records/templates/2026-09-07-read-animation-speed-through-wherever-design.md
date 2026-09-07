# templates/read-animation-speed-through-wherever-design

Rule: `templates/read-animation-speed-through-wherever-design`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 258-260.   A wrapper that needs the motion speed must read it via the shared `motionSpeed()` helper   (base.ts `motionSpeedJs`: NOACG_ANIM.speed, else legacy animSpeed, else 1) - never the bare   animSpeed global, which only exists inside a legacy region.
