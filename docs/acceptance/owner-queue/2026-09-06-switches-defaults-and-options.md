---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# Switches and choices, NoaCG's own look for undrawn moments, and the first quiz option

**Date:** 2026-09-06 · **Branch:** `claude/svg-behaviour-control-system-459532`

## What changed

Phases 3, 4 and 5 of `docs/SVG_BEHAVIOUR_PLAN.md`, built overnight on your go-ahead. Four things
you can see:

- **Any hidden layer can be a switch or part of a choice, with no behaviour at all.** Hide a
  layer, name it `show:Sponsor`, and the control page gets Show Sponsor and Hide Sponsor. Name a
  set `choice:Status/Live`, `choice:Status/Replay` and the operator gets one button per option,
  one look showing at a time. Both work beside a quiz on the same graphic, and the Fields step
  offers the same two answers on every hidden layer nothing else claimed.
- **An undrawn quiz moment is no longer silent.** Import a quiz board with nothing hidden and the
  buttons visibly work: a ring around the picked row, a tick and a cross on the reveal, a small
  LOCKED IN plate. This is rung 1 of the ladder you ratified on 2026-09-03; every moment you draw
  replaces it, one moment at a time.
- **"What if I don't want to be able to lock it?"** Under Quiz in the Fields step, *Require lock
  before reveal* is a checkbox, on by default. Untick it and Reveal correct works straight from a
  pick. A second one reveals by itself five seconds after the lock.
- **Two more behaviours**: a meter (a bar you drew full fills toward a target as the figure goes
  up) and an alert (it plays, holds eight seconds, and takes itself off). The naming page
  `docs/SVG_AUTHORING.md` §5b carries both, generated from the same word list the import reads.

## The route, under a minute

1. `/app` -> **Import graphic** -> drop `e2e/fixtures/svg-corpus/illustrator-quiz-board-multiline.svg`
   (nothing hidden in it). Create into a production, set an answer key and a pick, Take, then
   Select answer, Lock it in, Reveal correct. Watch the Program monitor this time.
2. Back in the Fields step of any quiz: untick **Require lock before reveal**.
3. Drop any SVG with a hidden layer named `show:Something`: the "Switches and choices" section
   appears with it already set.

## What to look at

- **Whether the neutral default look is acceptable on a student's board.** It is deliberately not
  amber - it sits on their artwork - and you preferred rung 1 in the mockup; this is that rung on
  a real file, built from the row's own panel. If it is wrong in size or weight, say which.
- **Whether a checkbox is the right shape for "no lock".** It is the smallest thing that answers
  your question; the sentence board is the bigger one, and it is still parked under P2.
- **The words** for switches and choices in the Fields step: "A switch: Show / Hide" and "One
  option of a choice". They are the first vocabulary a student meets for behaviour without a
  recipe.
