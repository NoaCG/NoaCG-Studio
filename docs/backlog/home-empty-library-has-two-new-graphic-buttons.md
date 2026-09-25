# An empty Home shows two buttons both named "+ New graphic"

**Filed:** 2026-09-25. **Source:** the code review of the configured-suite fix on
`claude/f-rewrite-skipped-specs` (row F of the 2026-09-24 night wave).

## Why
On an empty library, Home carries the header's door (`NewGraphicButton`, testid
`home-new-project`) and a plain `<button className="primary" onClick={onNew}>+ New graphic</button>`
in the empty-library hint (`src/components/home/HomePage.tsx`, the `EmptyHint`). A screen reader
and any role query see two identical controls. It is also how every signed-in configured spec went
red on 2026-09-24: `startNewProject` asked for "the" button by that name and got two. The test side
is fixed (it clicks `[data-door="new-graphic"]`); the product still has the ambiguity.

## What it would take
Render the hint's call to action through `NewGraphicButton`, so it takes the same guarded, routed
path (the unsaved-changes guard, the `#/new` route), and give one of the two a distinct accessible
name, or drop the hint's button in favour of pointing at the header. Pin it with an assertion that
an empty Home exposes one control of each name, in a spec `scripts/e2e-affected.mjs` maps from
`HomePage.tsx`.

## Evidence
Configured run 36069827692: 29 failed, every one at
`getByRole('button', { name: '+ New graphic' }) resolved to 2 elements`, the second being
`getByRole('main').getByRole('button', { name: '+ New graphic' })`.
