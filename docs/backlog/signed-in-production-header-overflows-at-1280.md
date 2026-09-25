# The signed-in production header is wider than a 1280px window, clipping ■ All out

**Filed:** 2026-09-25. **Source:** measurement, while building the team production header button.

## Why

■ All out is the panic control, and the header is where the page promises it stays "one reach
away" (`ProductionShell` in `src/components/home/ProductionPage.tsx`). At 1280x720, signed in,
it is mostly off-screen: a common laptop width cannot reach the one control an operator presses
when something wrong is on air. Signed out the header has no Share button, which is why the
offline suite never sees it.

## What it would take

Make the row fit at 1280 and 1366 without undoing the owner's placement rulings recorded in the
`ProductionShell` comments (left order logo / Back / Home / + New graphic; Output links beside the
mode chip; All out a header's width from navigation). The existing levers are the media queries in
`src/styles/playout-dashboard.css` that already drop `.pd-target-state` (below 1600px) and
`.pd-share-label` (below 1440px) - more labels can stand down to icons with titles below ~1366px,
e.g. "+ New graphic", "○ NOT PUBLISHED", "Export…". Pin it with an in-viewport assertion on
`verb-out-all` at 1280x720 in `e2e/configured/` (signed in).

## Evidence

Measured 2026-09-25 against a local Supabase stack, a signed-in personal production at 1280x720:
`.pd-header` clientWidth 1280, scrollWidth 1341. Children left to right (width@left): logo 86@14,
Back 63@110, Home 54@183, + New graphic 110@247, h1 0@367 (the name has already given way
entirely), mode chip 139@377, Start production 139@526, clock 56@675, tabs 216@751, spacer,
Playout settings 106@987, Share 42@1103, Export 95@1155, All out 81@1260.
