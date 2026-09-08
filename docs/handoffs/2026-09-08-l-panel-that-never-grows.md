# The panel that never got taller: the cap was not zero, it was measuring the wrong thing

Branch `claude/l-panel-that-never-grows`, from `main` at `03aa732d`, with `origin/main` at
`04c8864c` taken in and re-verified. One commit of work, plus the check's own.

The row asked which of two answers was true - the cap is wrong and the panel could grow, or the
cap is right because there is nowhere to go - and to refuse the third, which is to iterate the
fit. **The first answer is true, and the surprise is the direction of the error: the cap was too
GENEROUS, not too tight.** It offered the fit 384px of room that could only have been delivered by
pushing the bottom answer plate off the board, and the apply then delivered nothing at all, for an
unrelated reason. Two broken measurements, in opposite directions, on the same panel.

## The table, reproduced

`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg`, question of 591 characters
(the spec's `LONG` four times), read off the wizard's own preview exactly as the backlog read it.
`spill` is how far the words stand outside the plate they were drawn in, worst edge.

| option | before | after |
|---|---|---|
| the panel gets wider | 6 lines @ 29.2px, 1353 x 262, spill **0** | unchanged |
| the panel gets taller | 8 lines @ 36px, 1238 x **259**, spill **42** | 7 lines @ 29.2px, 1239 x **285**, spill **0** |
| the panel gets wider, then taller | 8 lines @ 36px, 1353 x 262, spill **19** | 6 lines @ 29.2px, 1353 x 262, spill **0** |
| the panel stays the size you drew | 6 lines @ 26.2px, 1238 x 259, spill **0** | unchanged |

My "before" numbers are the live ones and they differ from the backlog's on one row: the
wider-then-taller option spilled 19px here, not 38, wrapping to 8 lines rather than 7. Everything
else matched to the pixel, including the 259px drawn plate height and the ~40px spill the row was
filed for.

## The three numbers

Instrumented on that fixture, under `grow-y`, at rest and after the fit:

- **The offer** (`svgOfferHeights`): `svgFitExtraH.f0 = 383.9` user units - a ceiling of 216 + 384
  for a room the design drew 216 tall.
- **The cap** (`svgGrowCap`): 932px, which is 384px of room below the plate's own bottom edge at
  549px. **Not zero.** But `svgGrowRoom` measured that room from the PLATE, and the four answer
  plates and their four texts are the rule's declared followers: the lowest of them ends at 883px,
  so the room that could actually be honoured was 932 - 883 = **49px**.
- **The apply** (`growSvgHeights`): `extras = [0]`, so `grant = min(0, 384) = 0`. The panel never
  moved a pixel.

The apply's zero is the second defect and it is independent of the first. `svgBlockExtras` asked
how far the settled block ran past `room.top + room.height`, which is where the room ends only for
a block composed against the TOP of its box. The question is centred in its plate, so `svgRecentre`
puts a too-big block over the middle and it hangs off both ends: the block measured y -171 to 171
(342 units tall) against a room of -32 to 184 (216 tall), and its bottom was 13 units SHORT of that
floor while 63 units stood above the plate. It reported that it needed nothing.

## What changed

Three edits in `src/templates/importedDesign/svg.ts`, all in the growth runtime the template
emits.

1. **`svgMovingBox`** - a new helper - unions the panel with every layer that travels with it, and
   `svgGrowRoom` measures from that box. The margin the design mirrors has to be kept by whatever
   ends up nearest the frame, which on a board is an answer plate, not the question. The offer and
   the apply both pass the rule's resting reading, so they cannot disagree about who travels.
2. **`svgBlockExtras`** now reads a HEIGHT rather than a floor crossing: how much taller the settled
   block is than the room it was given. That is the same number as before for a top-composed block
   (its top sits on `room.top`, so the two expressions are algebraically equal) and the right one
   for a centred or bottom-composed one. A placed line asks for nothing - its room is a slot with
   no height, and it is one line filled and then shrunk.
3. **`svgGrowShare`** - a new helper - says how much of its own extra height a block travels by: a
   top block stays put, a centred one takes half, a bottom one takes all of it, and the whole thing
   mirrors when the panel grows upwards. The previous code used the top answer in both directions,
   which is why a centred block would otherwise have stood still while the plate grew away
   underneath it. Where the cap can only pay part of the bill, every block travels by the same
   fraction of what it asked for, so a partly grown panel keeps its stack's shape.

The review added a fourth, in the same mechanism: **the panel's growth is one pot and the blocks
inside share it evenly**. Offered whole to each line - what the code did - two wrapping blocks in
one panel can between them wrap into twice the height the panel will ever have, and the apply can
then pay each of them half. No corpus file has two wrapping blocks in one growing panel today, so
nothing measured differently; the hole was reachable and is closed.

**I did not touch the fit.** One measure, one fit, one apply, never iterated. Both defects were in
the measuring, which is why the split survives intact.

## The pre-fix run

The gate that pinned the broken behaviour now asserts the fixed one, in the same two lines
(`e2e/import-svg.spec.ts`, "the too-long mode answers the same however the reader got there").
Proved by stashing the runtime fix and keeping the spec:

```
$ git stash push -- src/templates/importedDesign/svg.ts
$ npm run test:e2e:queued -- e2e/import-svg.spec.ts -g "the too-long mode answers the same..."
  x  1 [chromium] › the too-long mode answers the same however the reader got there (8.0s)
  Error: grow-y did not make the plate taller: plate 259px under shrink, 259px under grow-y;
         grow-y wrapped to 8 lines at 36px and spilled 42px
  Expected: > 267   Received: 259
  1 failed
$ git stash pop
$ npm run test:e2e:queued -- e2e/import-svg.spec.ts -g "the too-long mode answers the same..."
  ok 1 [chromium] › the too-long mode answers the same however the reader got there (7.6s)
  1 passed
```

## What the step says now

**Nothing changed in the wizard's copy, and that is the answer rather than an omission.** The
row's step 5 was conditional on the second answer being true - if there were nowhere to grow, an
option that behaves like "the panel stays the size you drew" would have to say so. There is room
on this board, the option now uses it, and the plate is visibly deeper than the one the owner
drew. An option that does what its label says needs no disclaimer.

## Verification

- `npm run build` - exit 0, read from the build's own exit code, before and after taking
  `origin/main` in.
- `npm run test:e2e:queued -- e2e/import-svg.spec.ts e2e/import-svg-corpus.spec.ts
  e2e/import-svg-behaviour.spec.ts` - 138 passed, including the corpus gate over all 43 fixtures.
  Run twice: once on the branch alone, once after the merge.
- `npm run test:e2e:integration` - **863 passed, 3 failed**, and none of the three is this
  branch's. Two were timeouts under laptop load (`counting-settle`, `layout` mobile) and both
  passed on a re-run. The third, `catalog-baseline` "every catalog variant renders identically",
  reproduces exactly with this branch's runtime change stashed, and CI is green on the same sha -
  filed as `docs/backlog/a-fourth-data-holder-appears-in-credits-on-this-laptop.md` with the
  numbers.
- Looked at the rendered board under all four options, in the wizard's own preview.

## The check

`review: delegated` - the code-review skill returned findings into this conversation. Its diff
was `main...HEAD`, so it also read what `origin/main` brought in; the findings on my own files are
acted on above (the pot split, and a docstring that claimed more than it could keep). Two findings
were on landed code owned by other rows and are filed rather than fixed here.

`simplify: inline` - the simplify skill returned fan-out instructions rather than a result, so the
pass was done here over its four angles. It found one thing worth changing: the offer's per-line
share was computing `most / sharers` inside the loop, now hoisted, which also makes the
divide-by-zero case impossible to read as a bug rather than merely being one that cannot happen.

`verify: green` - `npm run build` exit 0; the three SVG import suites 138 passed; the integration
set as above.

`taste: answered` - frames rendered through the real import door for five growing fixtures
(the owner's board, `illustrator-quiz-board-multiline`, `inkscape-lower-third-layers`,
`figma-offset-centred-endboard`, `inkscape-layer-rotated-quiz-plate`), at the drawn value and at a
160-character value, under each of the four options.

- **Hierarchy, restraint, coherence, on-air quality: YES.** Nothing about this change touches
  colour, type choice or what is drawn - it moves one plate's height and the block inside it.
- **Composition: YES.** The grown plate keeps the margin it was drawn with at the top and mirrors
  it at the bottom; the answers keep their spacing because they travel as a block.
- **T1 centred: YES.** The question sits on the plate's middle at every option, which is what the
  travel share exists to keep.
- **T2 inside: YES**, measured rather than eyeballed: every bound line against the shape that
  holds it, worst edge, across all five fixtures and all four options - zero everywhere except a
  1px reading on `inkscape-layer-rotated-quiz-plate` under the two growing options. That 1px is
  the rotation, not the text: it reproduces byte-identically with this branch's change stashed,
  and the suite's own `ROTATION_SLACK` is 8px for the same reason.
- **T3 aligned to the graphic: YES.** Nothing is measured against a frame coordinate; the room is
  measured off the panel and its followers.
- **T4 grows as implied: YES**, and this is the row. The plate that promises to get taller gets
  taller, the answers move with it, and the plate that promises to stay as drawn stays as drawn.

## Pointers

- `docs/acceptance/owner-queue/2026-09-08-the-panel-that-gets-taller.md` - the route, under a
  minute, and the one call that is his: a taller question plate pushes his answers down the board.
- `docs/TEXT_BOX_BINDING.md`, "The room a box has is what its followers leave it" - the two laws,
  where the design doctrine keeps them.
- `docs/backlog/the-panel-that-never-gets-taller.md` is **deleted** - it was this row, and it is
  done. The two files that pointed at it now point at the acceptance item.
- Three new backlog rows, all found by the review and none of them mine to fix here:
  `a-panels-growth-direction-ignores-what-travels.md` (a vertical rule still picks its direction
  from the panel's own margins, so a plate boxed in below can be sent the way with no room),
  `two-gate-names-can-share-one-measurement-receipt.md` and
  `an-owner-answer-on-the-next-line-is-lost.md` (both on code that landed the same night).

## Next, if anyone picks this up

The wider-then-taller option is the one I would look at next on this board: it now widens and
never needs the height, which is right, but it means the two "taller" options only differ once the
width runs out. Worth one owner look rather than any code.
