# The SVG import carries two answers to "is this shape the board's own backplate"

**Filed:** 2026-09-09. **Source:** the review of `claude/c-vote-notice-plates`, which added the
second one and measured the first.

## Why

`BACKPLATE_SHARE_OF_FRAME = 0.7` in `src/components/wizard/import/MapSvgFieldsStep.tsx` opens with
"Written once because two measurements ask it… a shape that is a backplate to one and a row to the
other would put a graphic in two states at once". That sentence names the exact hazard, and there
are now three askers and two answers: the mapping step's unmatched count asks the same English
question through `isPlate` in `fieldAutoMap.ts`, at 0.95 of the artwork's INK rather than 0.7 of
the frame.

The two disagree on real files, in the same step, on the same render. A strap drawn small inside a
1920x1080 artboard is 7.6% of the frame and 100% of the ink: the count treats it as the board's own
plate and leaves it out, while `withoutBackplates` keeps it as a checklist group head and
`repeatsWithNewContent` still lets two such shapes pair into "repeat".

The newer rule is the better measured of the two, and it says the older one is weak: over the 77
artwork files in the repo, a frame rule at 0.7 misses 75 of their 132 plates and wrongly catches a
bumper's foreground. That is not an argument for changing the old rule blind - its two readers ask
about a shape's standing in the FRAME, which is a different question from what a picker may be
filled from - but it is an argument for measuring it rather than leaving two numbers and a comment
that says there is one.

## What it would take

Run `node scripts/svg-plate-share-spike.mjs` (browser work, queue it) and add the two frame-rule
readers' verdicts to its table, so the disagreement is visible per file rather than argued. Then
either move `repeatsWithNewContent` and `withoutBackplates` onto the ink rule and re-run
`full-frame-offering.spec.ts`, `import-svg.spec.ts` and the catalog's lower thirds to see what the
checklist grouping and the growth proposal do - or keep both and say, in one place, which question
each answers.

The checklist grouping and the growth default are both things a reader SEES, so this needs a look
at the product and not only a green build.

## Evidence

- `src/components/wizard/import/MapSvgFieldsStep.tsx` - `BACKPLATE_SHARE_OF_FRAME`, and its two
  readers `repeatsWithNewContent` and `withoutBackplates`.
- `src/components/wizard/import/fieldAutoMap.ts` - `PLATE_SHARE_OF_ARTWORK` and `isPlate`, whose
  comment carries the corpus distribution both numbers should come out of.
- `scripts/svg-plate-share-spike.mjs` - the instrument, which already prints the frame share and
  the ink share side by side for every drawing in the corpus.
