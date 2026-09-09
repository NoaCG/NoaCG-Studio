---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, cross-file C1 - the orchestrator ruled: file it, be explicit that this branch caused it"
---
# The OGraf body remap splits the SVG stretch measurement across two coordinate frames

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session. **Caused by that branch.**

## Why

`scopedDocument` in `src/export/targets/ograf.ts` now answers `document.body` and
`document.documentElement` with the graphic's element, so `--scale` reads and
`body.clientWidth` measure the canvas rather than the renderer's page. One measurement in
`src/templates/importedDesign/stretch.ts` is now split: `frame = document.body.clientWidth` (line
65) is the ELEMENT's width, while `edgeLeft()` (line 57) walks `offsetParent` past the element
into the renderer page, so `restLeft` is page-space. Before the branch both were page-space (the
leaked `body` rule forced the renderer body to the canvas size at x=0), so they agreed.

Under SPX, CasparCG and the studio the template still measures correctly; the divergence shows
only on OGraf playout, with a renderer that positions its layer away from the page origin - a
centred or offset stage. Right-growing designs stop stretching short of the frame edge and fall
to shrink; left-growing ones stretch past the left edge and are clipped by the element.

## What it would take

1. A fixture that does not exist: an SVG-imported design with `[data-stretch]` slots, mounted
   through the conformance spec's renderer host page with the stage at `left: 240px`.
2. Measure `edgeLeft()` against the element rather than the page (subtract the element's own
   `getBoundingClientRect().left`, or stop the `offsetParent` walk at `document.body`, which is
   the element under the scoped document), keeping SPX unchanged - there `document.body` is the
   real body and the walk ends where it always did.
3. `src/templates/shared/stageFit.ts` walks ancestors to `document.body` (line 289) and appends
   its probe there (line 168); check the same frame question for it.

## Evidence

`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md` (the relayed cross-file finding), `src/export/AGENTS.md`
(the scoped-document contract as it now reads).
