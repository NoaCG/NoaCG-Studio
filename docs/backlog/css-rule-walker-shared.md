---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, reuse 1 - the orchestrator ruled: its own row, because it adds import edges across src/ai, src/blocks and src/export"
---
# Five hand-rolled CSS rule walkers; one should live in `src/model/`

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session.

## Why

`src/export/targets/ograf.ts` `scopeCssToGraphic` (with `indexOutside`, `matchingBrace`,
`splitSelectors`) is the repo's fifth walker of the same shape, and the only one that skips
comments, quoted strings and unquoted `url()`: `src/ai/creative/style.ts` `eachRule` and
`stripHidingDeclarations`, `src/blocks/edit.ts` `findRuleBody`, `src/model/cssVars.ts`
`findRootBody`, and `src/model/spxDefinition.ts` `matchBraces` (the JS-side twin). No CSS parser
package is in `package.json`, so there is nothing off-the-shelf to call. Each copy has its own
blind spots; the ograf one is the only one gated (browser-parsed, fail-closed, at export).

## What it would take

Hoist the comment/string/url-aware walker into `src/model/` (or `src/blocks/`), give it the
rule-iteration shape the four callers need, and point them at it. That adds import edges
`src/ai -> src/model` and `src/export -> src/model` that `docs/ARCHITECTURE.md` has to name in
the same change, and touches `src/ai/` and `src/blocks/` outside any single row's territory - so
it lands alone.

## Evidence

`docs/handoffs/2026-09-02-c-ograf-host-page.md`.
