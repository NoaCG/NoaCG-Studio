---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
note: "Two behaviours became fourteen recipes. 0040657c compiled the quiz through one binding
  table and runtime, eea00820 ported the score tracker, the live vote and the countdown onto it,
  1908b7a4 gave imported artwork a real countdown, 19285fd7 added five game-show recipes and the
  field kinds they need, and 47b7b1dc added the add/remove controls, the row-set field kind and a
  bingo caller. src/templates/behaviours/registry.ts is the list. The method the ask names is
  served too: 182e79bc wrote the seventeen-product survey (docs/BEHAVIOUR_SURVEY.md), and the
  layer-name tables are generated from the declarations into docs/SVG_AUTHORING.md. STILL OPEN:
  the survey's gaps are not all built - adjust-a-running-clock.md is the clearest one - and a
  ranking that reorders itself, which graphics-need-their-own-logic.md carries, has no recipe."
asked: "I know that we only have a poll and quiz right now, but we need to add more. That needs to be on the to-do list ... We just need to follow how other programs do them"
---
# More behaviours than the quiz and the live vote

**Filed:** 2026-09-03, from the live-vote walk.

## Why

Two behaviours exist. A student importing a scoreboard, a countdown, a results board or a versus
card gets fields that hold text and no logic that makes the graphic do its job - the same gap
`docs/backlog/graphics-need-their-own-logic.md` describes from the results board's side.

> we need to get this logic figured out so you can do them automatically and not have me check
> every single board. We just need to follow how other programs do them.

Two instructions in that sentence, and the second is the method: **the defaults come from what
comparable products already do**, not from asking him what each board should do
(`docs/acceptance/OWNER_QUEUE.md`, "A design default is NOT a taste question").

## What it would take

1. The scoreboard is the one 2026-09-12 needs (score plus and minus, Goal A and B) and it should be
   next regardless of what this row concludes.
2. For the rest, survey what comparable graphics tools ship as standard behaviours before adding
   any, and write the survey down so the next behaviour is not argued from scratch.
3. Whatever pattern makes a behaviour recognisable from layer names (the poll's `Bar 1`, the quiz's
   `Answer A`) has to be documented for designers, which today it is not - see
   `docs/backlog/run-a-real-audience-vote.md`.

## Evidence

Owner walk, verbatim in `docs/acceptance/owner-queue/2026-08-30-a-live-vote-on-your-own-artwork.md`.
The behaviour registry is `src/templates/importedDesign/behaviour.ts`; the detection that reads
layer names is `proposeSvgBehaviour` in `src/components/wizard/draft.ts`.
