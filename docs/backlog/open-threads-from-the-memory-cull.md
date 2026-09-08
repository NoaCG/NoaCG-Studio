---
v: 1
source: handoff
raised: 2026-08-25
state: advanced
note: "The 50px design rule under 'Owed a human look' was re-ratified and replaced on
  2026-09-08: 98dcf896 records the ruling, c8f3fe2d makes the broadcast floor answer to what
  the graphic is for after measuring that the flat 4.6% rule refused 322 of 503 shipped
  designs, and 3257bfaf moves the product's legibility pins onto the type-aware bands. That
  line should come out of the list. STILL OPEN: everything else, and the file warns why - no
  line here has been re-checked since 2026-08-25, so each is a claim about that date. The
  dompurify override is still in package.json, so that one is confirmed open. The rest needs a
  line-by-line pass against the log before any of it is planned."
---
# Open threads left by the 2026-08-25 memory cull

**Filed:** 2026-09-03, moved verbatim out of the memory store (`open-threads.md`) under the
charter in `docs/MISTAKE_TRIGGERS.md`: this is a tracking list, and the repo already has two
systems built to hold one (`docs/backlog/` and `docs/acceptance/owner-queue/`). It sat in memory
because that was the only place it existed when the cull happened.

## Why

The 2026-08-25 redesign deleted ~160 work-journal memories whose content git and `docs/` already
carried. This is the receipt for every OPEN item those entries named, so nothing was lost by
deletion rather than by decision. Full text of any deleted entry:
`C:\claude\memory-archive-2026-08-25\<slug>.md`.

**Prune a line the moment it closes; delete this file when it empties.** Nothing here has been
RE-CHECKED since 2026-08-25 - treat each line as a claim about that date, not about today. Items
already tracked in `docs/acceptance/owner-queue/` need no second home here.

## Owed a human look

- Countdown manual start - a design pass, not a bug; raised with the goal-bumps-score work.
- Send Yle the `/ograf` page and `/app?diag=1` - promised at the 2026-08-20 meeting.
- Blind reads owed on design-principles teaching and the Pro Phase B package - both merged,
  both judged only by me.
- Owner gallery read of graphics import + recreate; the hosted `/output` walk.
- Live walks owed: weather pack, Fight Night pack, the Yle scorebug on the production data API,
  the picture-publish path in controller partial bumps.
- `-> Preview` in the cue editor is undecided - it shipped, nobody ruled on whether it stays.
- 50px design rule wants re-ratification.
- Flat folders were never owner-ratified. A look is not a gate; this one was assumed.

## Open defects

- **`/output` wire flaky on CI** - scorebug and quiz-output fail-then-pass across runs AND
  across assertions. Likely a Take landing before the renderer subscribes. Reds the nightly most
  mornings until it is fixed or the specs are downgraded to flaky.
- **26 of 43 Lite production failures are undiagnosed** (admin overview).
- **Pro first-production generation still cuts students off.**
- Hosted boot recovery's renderer wiring is covered by a live checklist only, never a spec.
- dompurify is on an override rather than a clean version.

## Owner decisions owed

- Staging Supabase: whether to stand one up, after the tombstone-sync fix showed local timings
  (5 ms/req) hide what a runner sees (207 ms/req).
- The five `e2e/configured/` repo secrets do not exist and only the owner can create them, so
  the credentialed path has never run anywhere.
- `PRO_PACKAGE_IDS` flip is blocked pending a call on the topic card set.
- Five questions from the 2026-07 docs audit are unanswered.
- Teams, storefront-shows-first, tabs and an offline `/join` - all deferred from the owner
  acceptance pack, none refused.

## Paused programs (deliberate, not abandoned)

Lite eval benchmark (migration 0013 unapplied), the AI platform plan's paid benches, Creative
Mode, the SPX examples corpus (private visual eval set), the stinger half of the video quality
plan, and the nightly graphics library. Each has a docs page; none is waiting on a decision.

## Known work with a named owner elsewhere

Catalog variety is DESIGN work, not a script (`docs/CATALOG_VARIETY.md`). The taxonomy's §11
publish contract, the per-design width tail in footprint stability, and the "other wizard
categories" half of the animation preset road all sit in their own docs pages.
