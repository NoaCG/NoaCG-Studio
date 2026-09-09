---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
---
# The NOW push moved to 2026-09-25, and eight files still name the 12th as the push

**Filed:** 2026-09-09 by the row that moved `docs/GOALS.md` `## NOW` onto the 25th
(`claude/g-demo-25-september`). Found by that row's review; left unfixed on purpose because every
file below is outside the row's file set and three other rows were planned against it.

## Why

`.agent-workflows/orchestrator/grounding.md` has every planner read exactly two things to learn
what the push is: `docs/GOALS.md` `## NOW` and the `docs/PROGRAMMES.md` state table. After the
2026-09-09 ruling (`docs/OWNER_RULINGS.md`) those two disagree about what the push is and when it
ends, so a wave planned on 2026-09-13 can read the push as over. That is the one that costs a
planner real work; the rest are entry points a new session reads to orient itself.

In order of what they cost:

1. `docs/PROGRAMMES.md` lines 51, 63 and 148 name the NOW push by the 2026-09-12 date.
2. `docs/NORTH_STAR_2027.md` lines 383 and 406, the same.
3. `docs/PRODUCT_AND_MAP.md` line 50 attributes the 09-12 date to GOALS NOW by citation; it is the
   orientation document, so from that entry point the CLI-to-player deliverable is invisible.
4. `docs/PROMISE_AUDIT.md`, the row "Behaviour on your own artwork", grounds "the owner's own walk
   is still owed" on GOALS NOW items 1-3; item 1 now records five owner walks, item 2 still ends
   "What is left is the OWNER WALK", and `docs/acceptance/owner-queue/2026-09-04-a-score-tracker-on-your-own-artwork.md`
   records him confirming the quiz end to end on 2026-09-03. The chain contradicts itself at both
   ends and needs one sentence that says what is still owed (his own board after the text-box
   fixes, and the hosted eyes-on walk).
5. `docs/GRAPHIC_BEHAVIOUR_PLAN.md` line 12, `docs/OGRAF_FIRST_REVIEW.md` line 404,
   `docs/CONTROL_PANEL_RESEARCH.md` line 334 and
   `docs/backlog/graphics-without-a-ready-made-template.md` line 58 each cite the 09-12 date as
   GOALS NOW's.

Lower severity, dated records rather than live text: the `.github` workflow comments and
`docs/OWNER_RULINGS.md` line 121 still call the 12th "the NOW".

## What it would take

One sweep, one commit: read each line, make the smallest edit that names the 25th as the push
and the 12th as its rehearsal, and cite `docs/OWNER_RULINGS.md` 2026-09-09. Item 4 wants a
sentence, not a date. No script parses GOALS for a date, so nothing breaks mechanically; the cost
is a planner reading the wrong push.

## Evidence

The line numbers above were read on `main` at `ae5a32b9` on 2026-09-09. `docs/DEMO_2026-09-25.md`
and `docs/GOALS.md` `## NOW` carry the corrected state.
