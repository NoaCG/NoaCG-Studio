# wizard/resolve-deep-linked-through-hit-apply

Rule: `wizard/resolve-deep-linked-through-hit-apply`. Recorded 2026-09-07 on `claude/wizard-rules` at 32e60266.

The link comes from a prerendered template page CTA (docs/PRERENDER.md). A retired or unknown id, or `imported-design`, must land somewhere usable rather than erroring.

## Recorded 2026-10-14 on `claude/plan-wizard-shell-p9-build` at c65781a3f.

Retired in the close-out (S7) of docs/work-specs/wizard-structure/spec.md, section 7. A Browse card, the images walk's Template step and a deep link apply one function, `pickPatch` in `src/components/wizard/shell/walkState.ts`, so the three cannot disagree; `scripts/wizard-walk-state.test.mjs` ('one pick patch for Browse, the images walk's Template step and a deep link') pins it. `src/components/wizard/shell/useWalkLifecycle.ts` resolves the link and says in place that no project is created and an unknown id stays on Entry, and `e2e/template-deep-link.spec.ts` asserts Fields, an empty library and the Entry fallback.
