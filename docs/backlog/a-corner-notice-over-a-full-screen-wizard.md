# Where should a corner notice sit when the surface under it fills the screen

**Filed:** 2026-09-08. **Source:** the 2026-09-03 consent-over-dialog session (handoff since
drained)

## Why
The layer scale settled the ordering question and deliberately left a notice ABOVE the full-screen
wizard, because a notice dimmed behind an opaque wizard shell is not dimmed, it is gone - and the
consent banner exists only for the first visit, which is exactly the visit that opens on the
wizard. Correct, and it leaves a placement defect: fixed bottom-right, the banner overlaps the
wizard's own Next control on a laptop viewport and covers the footer outright below 600px.
`e2e/configured/pro-wizard.spec.ts:145-154` records it and declines the banner as part of the
walk, calling it what a real student meets. It is a design answer, not another z-index.

## What it would take
Decide where a notice goes when the surface under it is full-screen - inset above the wizard
footer, docked into the shell, or a different corner below a breakpoint - then pin it in
`e2e/overlay-layers.spec.ts` beside the readability assertion already there.

## Evidence
`e2e/configured/pro-wizard.spec.ts:145-154`; the layer scale in `src/styles/base.css`;
`e2e/overlay-layers.spec.ts` test 3.
