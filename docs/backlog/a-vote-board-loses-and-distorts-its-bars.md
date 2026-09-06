---
v: 1
source: measurement
raised: 2026-09-05
state: unstarted
---
# A live-vote board drawn the ordinary way loses its last bars, and rounds them wrong

**Filed:** 2026-09-05 by row X (`claude/x-live-vote-conventions`), found by the review pass on the
docs section that documents how to draw one. The page now warns designers about both; neither is
fixed.

## Why

A live vote may carry eight options. A board with eight options, drawn the way any designer draws
one, cannot bind more than five of them, and the failure is silent in the worst possible way: the
bars are missing from the picker as well as from the proposal, so the designer cannot correct it by
hand. They are left with a board whose last three rows never move. This is the graphic the
2026-09-12 production may well want, and the shape of the failure ("the control I need is not in
the list") is the one the owner already hit once on this same screen.

## Two separate limits

### 1. The twelve-rectangle cap starves the bars

`MAX_SHAPE_CANDIDATES = 12` (`src/assets/svgImport.ts`) caps the plain-shape inventory, taking the
widest twelve:

```ts
const shapes: SvgShapeCandidate[] = [
  ...alreadyPictures.slice(0, MAX_SHAPE_CANDIDATES),
  ...plainShapes.slice(0, MAX_SHAPE_CANDIDATES),
```

A vote board is `1 backplate + N tracks + N bars` rectangles, and a bar drawn at full length (which
is what the product requires: the drawn length IS 100%) is exactly as wide as the track behind it.
The sort is widest-first and stable, and the tracks are written before the bars, so every track
takes a slot before any bar does. At six options the twelfth slot is Bar 5 and **Bar 6 is not in
`svg.shapes` at all**: absent from `proposePollBinding`'s pool and absent from the Bar `<select>` in
`MapSvgFieldsStep`. At eight options, bars 4 to 8 are gone.

The cap's own comment says "A design with more rectangles than this is a chart or a table, and its
panel is not among the twentieth-widest of them" - which is a fair rule for the PANEL question it
was written for, and the wrong rule for an inventory that the bar picker now also reads.

### 2. A rounded bar is scaled, and its ends flatten

`pollSetBar` (`src/templates/importedDesign/pollBehaviour.ts`) tweens the width attribute only when
the element has one:

```js
if (el.hasAttribute('width')) {
  var to = { attr: { width: full * share } };
```

Everything else falls to `scaleX`. Its comment explains the intent exactly right - "A RECTANGLE'S
WIDTH IS TWEENED, NEVER ITS SCALE - scaling squashes a rounded cap" - but `svgImport.ts` already
records that **"a rounded rectangle exports as a `<path>` (Illustrator never writes `rx`)"**. So the
one case the width tween exists to protect is the one case that never reaches it. The corpus fixture
hides this because it is hand-written with `<rect rx="18">`, which Illustrator does not emit.

## What it would take

For the cap: the shape inventory serves two questions now, "which rectangle is the panel that
grows" and "which rectangle is a drawn part a behaviour binds". Only the first wants a widest-twelve
cap. Splitting them, or exempting a shape that some behaviour row has bound, is the shape of the
fix. A cheaper stopgap is raising the cap, which only moves the cliff.

For the rounded bar: `panelPathGeometry` already parses a rect-shaped path and the panel growth
runtime already grows one by shifting the far half of its points, keeping the drawn radii
(`templates/importedDesign/svg.ts`). A bar could grow the same way instead of scaling, which would
make the width-tween comment true for paths as well as rects.

Both want a corpus fixture with more than five options, since the current one has three and passes
either way.

## Evidence

Both confirmed by reading `src/assets/svgImport.ts`, `src/templates/importedDesign/pollBehaviour.ts`
and `src/components/wizard/import/MapSvgFieldsStep.tsx` on 2026-09-05. The public docs page written
on the same branch (`docs.html`, "Draw a live vote") tells designers to keep rectangle bars to five
options and to prefer square ends, which is a workaround for both, not a fix.
