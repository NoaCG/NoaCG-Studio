---
v: 1
source: check
raised: 2026-09-02
state: unstarted
asked: "row C /check, altitude AL4 and review B2 - the orchestrator ruled: file it, narrow the doc to authored-size today"
---
# An OGraf graphic's canvas box should follow `renderCharacteristics`, not only the authored size

**Filed:** 2026-09-02, by the `claude/c-ograf-host-page` session.

## Why

`GRAPHIC_BOX_CSS` in `src/export/targets/ograf.ts` makes the element a block of the AUTHORED
resolution (`position: relative; overflow: hidden`), the box every design positions against.
`load()` ignores `params.renderCharacteristics`, so the component never learns the render area it
was mounted in, while the manifest declares its resolution as `ideal` on the grounds that "the
graphic scales" (`docs/OGRAF.md`). Today that promise holds only if the renderer scales the box.
Before the branch the element had no box at all and a design's absolutely positioned root followed
the renderer's nearest positioned ancestor - accidental, at 1080p sizes, but a 1280x720 layer
showed the lower third at its own bottom. Now it shows the top-left 1280x720 of a 1080p frame.

The escape hatch is real but narrow: the box rule has zero specificity, so a renderer's own rule
ON THE ELEMENT wins; a renderer that sizes only its container gets no override.

## What it would take

1. Read `renderCharacteristics.resolution` in `_load()`; when the renderer states a render area,
   set `--scale` (base.ts already has the knob, "also handles resolution") or a transform on the
   element, with the authored box as the fallback when nothing is stated.
2. The offline frame sizes its iframe off the same box; it inherits whatever this decides.
3. Pin it with a mount at a non-authored viewport in `e2e/ograf-conformance.spec.ts` - both
   current mount tests set the viewport to the authored format and cannot see this.
4. Viewport units (`vw`, `vh`, `vmax` - tk21, the stinger archetypes) resolve against the renderer's
   viewport whatever the box does; say so in the same change.

## Evidence

`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md`, `docs/OGRAF.md` "Known limits".
