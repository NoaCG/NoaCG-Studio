# BT - widen and grow taller

Branch `claude/bt-widen-and-grow-taller`. Four commits, queued for landing.

## The verdict, which is most of the row

**A plate already could widen and grow taller for the same field.** The row's three candidate
causes are all false, and each was ruled out by measurement rather than by reading the path that
looked likeliest:

- **(a) the wizard never offers both** - false. The graphic-wide select carries "The panel gets
  wider, then taller" (`STRETCH_OPTIONS`, `MapSvgFieldsStep.tsx`), the per-plate override offers
  the same four rungs, and the corpus fixture's own sidecar states `grow-xy` as its default.
- **(b) one rule erases the other by the time it reaches the emitted table** - false. Read out of
  the composed document, `NOACG_LAYOUT.rules` carries `g0` axis `x` and `g1` axis `y`, and the
  plate carries `data-noacg-el="g0 g1"`. Both stamps survive, exactly as the space-separated list
  at `svg.ts:299` was written to make them.
- **(c) the runtime honours only one axis** - false. On
  `effects-gradient-shadow-lower-third.svg`, the file the owner walked, the plate widens
  1040 -> 1640 px, then grows 190 -> 257 px, the name wraps onto a second line at the 56 px it was
  drawn at, and the role beneath does not move. Twenty-one of the corpus fixtures do the same.

**The receipt's claim was stale by three days.** `docs/backlog/growth-rule-geometry-and-purpose.md`
carried "a plate still cannot widen and grow taller at once" in its `note:`. That note was last
written on 2026-09-05 (`251cecfd`); the two commits that made vertical growth work are `6a8fde49`
(2026-09-08) and `0441dea0` (2026-09-09). Nothing measured it in between, which is the reason it
survived - see the gap below.

## What was actually broken, and is now fixed

**The growth cap, on any artwork whose user units are not CSS pixels.** Growth is decided in screen
px and spent by writing user units - a rect's width, a path's points, a follower's transform - and
`svgUserScale` is the only conversion between the two. It asked `svgFitPlaced`, whose test was
"this node has no `getComputedTextLength`". That is a true test of "not an SVG `<text>`" and only
means "placed" when the caller already holds a line. Asked of a PANEL - a rect, a path, a group -
it answered yes for all of them, so every growing panel converted at `svgPlacedScale`'s fallback
of 1.

On a 1920x1080 artwork the frame scale IS 1, so the two numbers agree and the defect is invisible
on every graphic anyone has ever looked at. Measured:

| fixture | units | plate before | plate after |
|---|---|---|---|
| `inkscape-millimetre-scorebug` | mm (scale 3.78) | 600x1700, 1040 px below the frame | 600x513, inside |
| `affinity-point-sized-nameplate` | pt (scale 1.33) | 1173x240, 20 px past the right | 1027x210, inside |
| `ticker-strip-3840` | 3840 artboard (scale 0.5) | grew half as far as granted | 262 px, correct |
| `illustrator-rotated-sidebar-strip` | nested | 308x354 | 308x446 |
| `nested-svg-sub-artboard` | nested viewBox | 360x181 | 360x234 |

Both directions of the error appear, which is the signature of a scale bug rather than a cap bug.
Every 1:1 artwork is byte-identical. `255f0ab6` is the fix.

## The gap that let it live, now closed

**Nothing gated either half.** The ladder sweep runs all four options, but only on the owner's
QUIZ BOARD, whose question plate has 216 units of room and never needs one unit of the height it
is offered - so `grow-xy` and `grow-x` give it identical answers at every length, and its
assertion 5 actively requires the plate NOT to get taller. The rung that had been broken twice was
measured on no file at all, and the cap was measured nowhere.

Two gates in `e2e/import-svg-corpus.spec.ts` (`759d86dd`):

- **"a panel told to get wider AND taller spends both, at the drawn size"** - the owner's own file,
  relational rather than a table of numbers: wider, then taller, wrapped, not shrunk, not printing
  over the row beneath.
- **The cap column on the every-file walk** - no growth-ruled panel may end up further outside the
  frame than the drawing put it, swept over the whole corpus. **Proved by reverting the fix and
  re-running**: it fails with `inkscape-millimetre-scorebug: g0 stands 1117px below the bottom` and
  the affinity nameplate beside it. A gate nobody has watched fail is not a gate.

## Traps that exist in no repo file

- **A URL in the emitted runtime is refused at the publish door, and the corpus spec does not
  catch it.** The first version of the fix compared `el.namespaceURI` against the SVG namespace
  STRING, which put a literal `http://www.w3.org/2000/svg` into the template JS every imported
  design emits. `templateBench.ts`'s `JS_URL` cannot tell an XML namespace from a network
  reference, and `productionGate.ts` promotes that to an error, so every imported graphic failed
  to publish. `svg.ts:1389` already documents this hazard for `svgPaintLines` - I wrote the bug
  anyway, twelve hundred lines above the comment warning about it. The corpus spec's own
  `exportsClean()` runs `validateTemplate` alone, not the bench, so it stayed green; CI caught it
  on `community.spec.ts` and two `import-svg-behaviour.spec.ts` production-gate walks. Use
  `!(el instanceof SVGElement)`.
- **`svg.ts`'s runtime block is inside a template literal.** A backtick in a doc comment there is a
  syntax error in `svg.ts` itself, several hundred lines from where you typed it. Cost me one
  typecheck cycle.
- **`test.slow()` is 180 s and the every-file walk now sits at ~125 s of it on CI.** My cap column
  roughly doubled that walk. It passed at 125 s on run 34502002518 and was killed past 180 s on the
  very next run - a coin toss, not a regression. `80134633` gives it an explicit six minutes with
  the measurement at the call site. If that walk gains another column, size it before landing.
- **The taste sweep needs `npm run dev:worktree`, and that server then BLOCKS the offline e2e
  suite** (`_offline-guard.ts` refuses a reused server that is not offline-pinned). Stop it before
  running any spec. Nothing says so in one place.

## Verification

- `npm run build` green on the final tree.
- `npm run test:e2e:affected`: 581 passed, catalog gate 35 passed, overall passed.
- `e2e/import-svg-corpus.spec.ts`: 23 passed locally, including both new gates.
- `e2e/catalog-render-baseline.json` **did not move** - the render gate passed untouched, so it was
  not re-recorded. `e2e/catalog-baseline.json` moved by exactly one hash (`svg01`, the
  imported-design variant's emitted JS), re-recorded with a per-design reason in the commit.
- Taste review answered below.
- CI read to a verdict on the final sha.

## check

- `review: delegated` - the code-review skill returned findings into this conversation. Scope
  checked: it reported the branch `claude/bt-widen-and-grow-taller`, base
  `83d4ec884ccfbc5bb3b99f50949bc0ee6b017c5c` and the same six files
  `review-request.mjs` handed it, which matches `git diff --name-only` plus `git status` here.
  4 findings, 4 fixed - the namespace URL (HIGH, independently confirmed by CI), the shared fill
  value defeating the settle wait, the frame comparison that would misattribute a drawn overhang,
  and an unguarded drawn size that silently disabled the shrink assertion.
- `simplify: inline` - the skill returned fan-out instructions, so the leg was done here over its
  four angles. Nothing to change: the new helpers reuse `readArt`, `awaitPainted`,
  `mapCorpusFile`, `rowLabelled` and `LADDER_VALUES`; there is no dead code; the fix is at the
  root helper rather than at its three call sites; and the extra reading is one evaluate per
  fixture.
- `verify: inline` - the gates above.
- `taste: answered`. Frames rendered through the real import door
  (`svg-import-sweep.mjs --shots`) for all five moved fixtures plus the owner's lower third, and
  the grown state rendered separately because the sweep shoots drawn values only. At drawn values
  all six are clean on all five axes and T1-T4. The owner's lower third at a long value is the
  frame that matters: hierarchy YES (the name dominates, role and programme step down), composition
  YES (the amber rail stretches with the plate rather than sliding out from under it, everything on
  one left edge), restraint YES, coherence YES, on-air YES, T1-T4 YES.
  **One NO: T2 on `inkscape-millimetre-scorebug` with all four of its fields holding a 95-character
  sentence.** The text stands outside its plate. Not fixed, and deliberately: that is the ladder at
  its floor on copy no scorebug could hold, which the owner ruled acceptable ("if it becomes too
  small, then that's the user's own fault"), and it is strictly better than what it replaced - the
  plate used to leave the screen entirely, which breaks the hard limit. The frame is kept, which
  is the law the new gate asserts.

## What is left

- **The receipt still stands, on its other half.** `growth-rule-geometry-and-purpose` is updated to
  `advanced` with what landed. What is open is its step 2: how a graphic knows it is played in a
  SEQUENCE, from the BEHAVIOUR attached to it and never from a category. That is design work, not a
  heuristic tweak, and it is the last thing between the receipt and deletion.
- **`docs/GOALS.md` NOW overstates what is left here, and I did not touch it** (the row forbade
  it). It reads as though the whole text-box problem is open; three quarters of it is closed, and
  after today the growth rung is too. Correcting the owner's steering document is its own row.
- **`docs/TEXT_BOX_BINDING.md` step 4 is still design.** The runtime half of growth-per-box is done
  and gated; the SURFACE - the per-box select on the header row and the draggable dashed cap line -
  is not built. The doc says so where it says so.
- **The two `GROWTH_FINDINGS` entries I met in passing** (`nested-svg-sub-artboard`,
  `ticker-strip-3840` default to `grow-xy` where their sidecars say `shrink`) are pre-existing and
  named in `docs/backlog/svg-import-sweep-findings.md`. Not mine, not touched.

## Nothing needs the owner

`docs/acceptance/owner-queue/2026-09-10-bt-wider-then-taller-on-your-lower-third.md` is a walk with
the route in under a minute. It is a look, not a decision.
