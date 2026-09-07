# components/capture-stage-pan-zoom-before-overlay

Rule: `components/capture-stage-pan-zoom-before-overlay`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

Zoom reaches the gesture math for free, which the zoom case in e2e/multi-select.spec.ts pins. Panning with a wheel, a middle-mouse drag or a held Space over the stage all route through the same captured handlers.
