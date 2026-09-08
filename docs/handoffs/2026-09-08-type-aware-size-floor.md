# The broadcast size floor became type-aware

Branch `claude/type-aware-size-floor`, from `origin/main` at `178cbc69`. Answers the owner ruling of
2026-09-08 ("make it type-aware, not a universal 50px blocker"), recorded in
`docs/OWNER_RULINGS.md`, and closes the question `docs/NOACG_PRO_PLAN.md` §23.1 left open.

## What the catalog said, measured rather than argued

All 503 shipped designs re-rendered and read through the instrument itself (not off the CSS):

- The universal 4.6% primary row refused **322 of 503** - the 64th percentile of our own catalog,
  including **52 of 101 lower thirds**, the category the number was written for.
- It contradicted a floor already ratified in this repo: `typeFloor.ts` says a corner bug may render
  at 16px because it is "a persistent station mark read over minutes rather than a line read in four
  seconds", while the primary row demanded 49.68px of the same element.
- The catalog's own median primary text is 42px.

## The rule now

Three bands on `typeFloor.ts`'s own axis - READING TIME, not identity:

| band | floor @1080 | categories |
|---|---|---|
| persistent | the category's own legibility floor (16 bug / 20) | corner-bug, ticker, audience, infographic, esports-score, public-info, scoreboard, imported-design |
| card | 28px | everything unlisted, and lower-third, info-card, quiz, alert, poll, results-board, end-credits, frame, stream-notification |
| statement | 42px | game-timer, versus, starting-soon, transition, reveal, matchup |

An unlisted category takes the CARD band - never an exemption, which is `typeFloor.ts`'s doctrine
("a new category must be readable before it is special").

**Where a category names its own number, that number governs every informational role**, not just
the lead line. This was the second half of the same contradiction and it is worth reading twice: 18
of the 26 designs the lead-line change alone still refused were shipped corner bugs whose SUPPORTING
line renders at 16px, refused by the universal 19.98px secondary row.

**Result: 8 of 503 refused.** A name at 12px with its role at 8px (`imp01`), "Back shortly" at 30px
where the category runs 64-280px (`ss12`), "PRESENTED BY" at 20px (`card48`), `lt48` at 26px, and
four flat checklist info-cards at 25-27px - the arguable residue, left warning rather than tuned
away, and named in the owner-queue item.

## Three decisions worth knowing about

- **`TYPE_FLOOR_PX` moved into `designRules.ts`.** The persistent band IS that table, a model-layer
  rule cannot import validation, and copying it would have been the second source of truth
  `typeFloor.ts` exists to prevent. It re-exports; every caller is unchanged.
- **The prompt block quotes the graphic's own floor**, not the lowest in the table. A floor a model
  is told about becomes a target, so quoting 28px at a versus card would have pulled it from 120px.
- **This extends the ruling by one row.** The owner ruled on the 50px primary blocker; making the
  20px secondary row type-aware for categories that name their own number is the same principle,
  and is the only way the corner bugs actually stop being refused. Flagged to him in the session.

## Verified

`npm run build` green, `npx tsc --noEmit`, `eslint`, `depcruise`, `node --test
scripts/design-rules.test.mjs` (21 of 21, six of them new), `npx playwright test
e2e/design-rules-product.spec.ts e2e/mark-legibility.spec.ts` (14 passed), and the whole catalog
re-measured twice through the live instrument.

**Not run here: the full suite.** `src/model/designRules.ts` is CORE, so the affected plan is the
whole suite plus the catalog gate. CI does strictly more on a clean checkout; read WHICH JOBS RAN
before trusting a green.

## What a reviewer should push on

The band membership, not the numbers. The numbers came from what the catalog already ships, so a
band that feels wrong means a category is grouped wrong. `info-card` is the known bimodal one - it
holds both 25px checklist boards and 240px headline cards, and it is in the card band.
