# Draw the lower-third shapes the catalog does not have

**A standing BRIEF, not a handoff.** It lived in `docs/handoffs/` until 2026-08-30 and was swept
with that folder, which is what the folder's contract says happens to everything in it - while
three live docs went on citing it. Moved here so it survives: `docs/CATALOG_WORK_QUEUE.md`,
`docs/CATALOG_VARIETY.md` and [issue #776](https://github.com/NoaCG/NoaCG-Studio/issues/776) all point at it, and
the queue item it briefs is still open.

Paste it into a fresh session. It is self-contained; everything it claims is measured and the
commands to re-measure are in it.

---

## The task

**Draw new lower-third designs whose SILHOUETTE the catalog does not already contain.**

The owner ratified this on 2026-08-21 in these words: *"yes, that's the ask — lower thirds need
real variety"*, and separately, on whether a house design should always lead a category:

> *"Let's not keep the house designs first. No one wants to use a design that other people also
> use. It's better to have a unique variety, and if we don't have a lot of graphics that are
> unique and very good, then we are doing something wrong."*

Treat sameness as a defect, not as a house style.

## What is already known — do not re-derive this

Measured with `node scripts/card-look-sweep.mjs lower-third` (reads the RENDERED pixels: backdrop,
accent hue, footprint):

- **99 of 103 lower thirds are `strap/thin`. 96%.** The exceptions — lt61 "Poster Slab", ls05
  "Studio Pair", ls33 "Quote Strap", ls39 "Fact Check" — only reach `strap/mid`.
- **Colour is NOT the gap.** The shelf already carries nine accent hues (orange 28, red 11,
  amber 10, rose 8, azure 5, cyan 5, violet 4, spring 1), 31 designs with no coloured accent, and
  7 light backdrops against 73 dark. That variety used to be invisible because Browse showed the
  first twelve in registry order; the storefront now spreads the fold across hue and family
  (`spreadFirstPage`, `src/templates/search.ts`), so it is surfaced.
- **The old sameness instrument cannot see this.** `catalog-sameness.mjs` scores fourteen CSS
  decisions and rates the same page 11-distinct-of-12. It is blind to palette and silhouette; the
  caveat is written where its number prints. Use `card-look-sweep.mjs` for anything about look.

## What to draw

Six silhouettes the category does not contain. Each is a different SHAPE, not a re-skin — a new
dark strap with a new accent colour is not an answer to this brief.

| Shape | What it is | Why it is new |
|---|---|---|
| Full-width band | edge-to-edge bar, name and role on one line | every current design is inset and content-sized |
| Tall panel | portrait block at one side, name stacked | the category assumes a horizontal strap |
| Side column | vertical rail up the frame edge, rotated or stacked type | `writing-mode` is used 0 times catalog-wide |
| Corner block | square or rounded block in a frame corner | the corner is bug territory; a NAME there is new |
| Full-frame card | the name owns the frame briefly, then clears | exists for versus/reveal, never for a person |
| Framed cut-out | the strap is a hole in a colour field, not a plate on one | inverts figure and ground; nothing does this |

How many is a judgement call — enough that `card-look-sweep` stops reporting one footprint at 96%.
Fewer excellent ones beat a dozen variations; the owner's line about "unique and very good" is the
bar.

## Read before drawing

- `docs/CATALOG_VARIETY.md` — what the catalog already repeats, and why family-only variation is a
  re-skin. **Also §5: 148 designs cannot take a light palette** — check a new design can.
- `docs/DESIGN_LANGUAGE.md` — taste, motion, code style. Binding.
- `src/templates/AGENTS.md` — the assembler contracts. Specifically: the standard contract, the
  logo-slot rules (a mark goes BESIDE the words on a lower third, never above), the accent rule (a
  design declaring `hasAccent` must emit the node unconditionally), and the footprint contract
  (lower thirds HUG — they keep `fit-content` — so a new full-width design is a deliberate
  exception that has to say so).
- `docs/CATALOG_WORK_QUEUE.md` — where this sits among the rest of the catalog's debts.

## The gates a new design must pass

Adding a design moves **three** baselines and only one is covered by the five catalog gates:

```bash
npm run build
node scripts/type-floor.mjs
node scripts/overflow-sweep.mjs --baseline
node scripts/field-coverage.mjs
node scripts/numerals.mjs
npm run test:e2e:catalog
UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1 npx playwright test e2e/catalog-baseline.spec.ts
```

`e2e/catalog-baseline.spec.ts` is NOT in `playwright.catalog.config.ts`, so every local catalog
gate can pass while CI goes red on it. The healthy diff there is purely additive.

Then re-measure and check the brief was actually met:

```bash
node scripts/card-look-sweep.mjs lower-third
node scripts/spike-shelf-look.mjs <out-dir>   # and LOOK at shelf-lower-third.png
```

**Look at the shelf image.** Every wrong turn in the session that produced this brief was caught by
looking at a picture after a number said the opposite.

## Two traps that cost time in the session before this one

1. **A comfortable number can be a blind number.** The CSS instrument said the page was varied
   while a person said it was not. When a measurement disagrees with an eye, check the
   instrument's axes before trusting it.
2. **A guard test that cannot fail looks exactly like a passing one.** Three were written in one
   session — reading a field the local path never writes, pressing keys where a later key undid
   the first, and reading state back in the tab that never saw the write. Mutation-test anything
   that guards: remove the guard, confirm the test goes red.

## Definition of done

- `card-look-sweep lower-third` no longer reports a single footprint at anything near 96%.
- The new designs are visible on the first page (the spread orders by hue and family; footprint is
  not an axis yet — **consider adding it once there is something to spread**, see
  `docs/CATALOG_WORK_QUEUE.md` §2).
- Build, the five catalog gates and the baseline spec are green, and the shelf image has been
  looked at by a person.
