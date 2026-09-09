---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, cross-file C2 - the orchestrator ruled: unpin the wrong output from the fixture, file the fix"
---
# `body > .x` rules match nothing in an OGraf package, because `load()` wraps the markup in a holder

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session.

## Why

`scopeCssToGraphic` rewrites `body > .x` to `:where([data-noacg-graphic=...]) > .x`, but `_load()`
appends the template markup inside a `<div>` holder, so the design's roots are grandchildren of
the element and a child-combinator rule off `body`, `html` or `:root` matches nothing. Under SPX,
CasparCG, OBS, vMix and the studio the same rule applies. No catalog design writes `body >` today;
Advanced-mode edits and hand-written templates do. The exact fixture in
`e2e/ograf-conformance.spec.ts` deliberately uses `body .other` (descendant) and no longer pins the
child form as correct. Also affected: template JS reading `document.body.children` /
`firstElementChild` expecting the design root gets the injected `<style>` first.

## What it would take

Either inject the markup as direct children of the element (no holder, and the `<style>` last or
first by contract), or rewrite a `>` combinator that follows the collapsed document head into a
descendant combinator and say so. The first keeps the selector semantics exact; a fixture with a
`body > .card` rule and a `document.body.children` read decides which.

## Evidence

`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md`, `src/export/targets/ograf.ts` `_load`.
