---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, reuse 3 and efficiency 3 - the orchestrator ruled: outside the row's files (e2e/exports.spec.ts, package.json)"
---
# One `e2e/_ograf.ts` mount helper, and a Node-side frame comparison

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session.

## Why

The sequence `import(graphic.mjs)` -> `customElements.define` -> `createElement` -> append ->
`load({data, renderType: 'realtime', renderCharacteristics: {}})` -> `playAction` is written
inline nine times across `e2e/exports.spec.ts` (four) and `e2e/ograf-conformance.spec.ts` (five),
each with its own `Driver` element type. The studio-reference settle (play, land every timeline,
`fonts.ready`, double rAF) exists in `e2e/audience-pack.spec.ts` `settle()` and
`e2e/catalog-baseline.spec.ts` too.

Separately, the frame comparison in the conformance spec decodes two PNG screenshots in-page
through `Image` and `getImageData` with two hand-set thresholds; `pixelmatch` plus `pngjs` in Node
would replace that with a documented diff and a diff image, but neither is a declared dependency
and `package.json` is a shared slot.

## What it would take

1. `e2e/_ograf.ts` with `mountGraphic(page, origin, tag, data)` and a shared `Driver` type; the
   nine sites call it. Edits `e2e/exports.spec.ts`.
2. Add `pixelmatch` and `pngjs` as devDependencies and compare the two buffers in Node.

## Evidence

`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md`.
