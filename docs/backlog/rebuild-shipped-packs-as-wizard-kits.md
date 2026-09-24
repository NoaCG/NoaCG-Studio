---
v: 2
source: owner
kind: ask
raised: 2026-09-24
state: unstarted
asked: "In the long run I would like everything to be unified ... there should not be any default kits. All templates that we provide come through the template wizard."
---
# Rebuild Uutishuone and Fight Night as ordinary template-wizard kits

**Filed:** 2026-09-24. **Source:** owner ruling (Productions import card, 2026-09-24)

## Why

NoaCG's own graphics now come only through the template wizard. The Productions "Import a
package" card stopped listing the two shipped packs on 2026-09-24 (`docs/GRAPHICS_PACKS.md`).
Since then Uutishuone and Fight Night can only be reached as files in `public/packs/`. As normal
kits they come back in the one place, and they gain what every kit has: restyling, the brand and
Style tools, their graphics in Browse, and future catalog improvements.

## What it would take

The packs are finished, hand-written HTML/CSS/JS. A kit is pure config over the type-by-family
matrix (`src/templates/packs.ts`, one design per type per family), so this is a rebuild, not a
move:

- **Two new style families**, one per look (`StyleTag`, FAMILY_TOKENS row, palette, fonts:
  Outfit for Uutishuone; Archivo and Saira for Fight Night). The existing families have no free
  cells.
- **About 18 generated designs**, each following its type's structure contract:
  - Uutishuone (6): ticker, bug with clock, name strap, headline strap, endboard, opener
    (sources in `scripts/packs/newsroom/`).
  - Fight Night (12): event slate, fight card, matchup, tale of the tape, official result,
    judges' scorecards, live stats, fight bug with round clock, fighter intro, lower third,
    round card, stinger (sources in `packs/fight-night/`; inventory in
    `docs/FIGHT_NIGHT_PACK_PLAN.md`).
  - Judges' scorecards and live stats may need to be `extras` or a new type.
- **Behaviour moved into type machines**: the ticker rotator that survives live edits, the
  opener that clears itself, and the round clock (counts down, starts on Take, re-syncs on
  Update).
- **Core-six gaps filled**: Uutishuone needs a countdown or holding screen, and Fight Night
  needs a sign-off.
- **An optional prepared cue rundown on kits.** Without it, Fight Night's interleaved
  19-cue, three-bout running order and Uutishuone's 10 sample cues are lost; a kit seeds one
  default cue per graphic today.
- **Clean-up once both kits ship**: delete the pack sources, the builders (the
  `build-production-pack` step in `package.json` `build` and `build:vercel`) and the two pack
  files. Give `e2e/pack-import.spec.ts` and `e2e/production-pack.spec.ts` fixtures of their
  own, and keep the export round-trip test.

Size: several sessions, one family per session, then a review.

## Evidence

- `docs/GRAPHICS_PACKS.md`: the "Decided 2026-09-24" paragraph.
- `docs/acceptance/owner-queue/2026-09-24-no-shipped-packs-on-productions.md`.
- `src/templates/packs.ts` `resolvePack`: one design per (type, family), so a hand-written
  graphic cannot join a kit without becoming a design.
