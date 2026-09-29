# A second Stop freezes infographic and competition exits on air

**Filed:** 2026-09-30. **Source:** the R1.2a.3 review workflow (a runtime reviewer's probe, its
refuter confirmed the defect and ruled it out of that branch's scope;
[receipt](../research/editor-r1-2a-3/README.md#review-and-simplification)).

## Why

An SPX or CasparCG operator who presses Stop twice on an infographic or competition graphic leaves
it frozen mid-exit, still on air, with the root at full opacity. A repeated Stop is ordinary
operator behaviour, and "Out always takes the graphic off air" is the product's promise (D02:
"Repeat Out coalesces per take").

## What it would take

- The scaffolds' `stop()` is `if (activeTl) activeTl.kill(); activeTl = buildOutTimeline();`
  (`src/templates/infographics/shared.ts` around 141-143, `src/templates/competition/shared.ts`
  around 217-221). On a second Stop, `activeTl` is the running Out, so it is killed, and the
  interpreter's `buildOutTimeline()` returns that same killed `noacgOutTimeline`.
- Keep the running Out: skip the kill when `noacgOutActive()` is true, or return early. The base
  `stop()` in `src/templates/shared/base.ts` does not have the problem (its exit's object-target
  proxies survive `killTweensOf`). Grep for other scaffolds with the same kill-then-build pattern.
- Reproduce first in a browser test (play, Stop, Stop again mid-exit, the exit completes and the
  root reaches opacity 0), mutation-test the guard, and run what `npm run catalog:affected` prints.

## Evidence

The reviewer's probe on a fixture: after the second `stop()` the Out timeline had no parent,
`#box` stayed at x 63.28 after advancing the clock 5 s, and root opacity stayed 1. Identical on the
R1.2a.2 and R1.2a.3 interpreter bodies, so it predates Out from any step.
