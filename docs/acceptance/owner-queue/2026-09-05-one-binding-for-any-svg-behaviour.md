---
kind: walk
date: 2026-09-05
serves: now
answered: false
---
# One binding for any SVG behaviour - the plan, and the one thing in it that is yours

**Date:** 2026-09-05 · **Branch:** `claude/svg-behaviour-control-system-459532`

## What changed

Nothing in the product yet. `docs/SVG_BEHAVIOUR_PLAN.md` is the design you asked for on
2026-09-03 - *"figure out a solution on how we can make the graphic work as we want without needing
to use a ready-made template."* It replaces the five hand-written behaviour modules (quiz, score,
vote, countdown, and the plain stepper) with one format any graphic can carry:

- the designer's hidden layers are stamped with the ROLE they play, and a small versioned table in
  the template says when each one shows;
- a behaviour is a declaration (which roles, which rows, which machine, which buttons), so adding
  one is adding data, and the five you have become the first five rows;
- `show:` and `choice:` are the two names that need no behaviour at all - hide a layer, name it,
  and it is a switch or a set of exclusive looks with its own buttons;
- "when a look shows" is always picks from lists (states, and facts a field states about itself).
  No expression language, as ruled.

Eight decisions inside it are recorded in its §12 so you can revert any of them; none was put to
you, per your 2026-09-05 ruling.

## The route, under a minute

Open `docs/SVG_BEHAVIOUR_PLAN.md`. Read §0 (one screen), then §9 (eight graphics, one paragraph
each - the reuse test), then §12.

## What needs you, at the weekly alignment

Phases 0-2 generalize what already ships and close four filed defects; they are current work and
start without you. **Phase 3 onwards adds capability under programme P2**, which by the register
enters implementation on evidence plus your ruling. The plan proposes that the phase-2 paper pass
(the eight challenge graphics walked against the vocabulary) is that evidence. Say at the weekly
alignment whether that is enough, or whether it waits for the round-2 proxy protocol in
`docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §6.

## What to look at

- §3c: two prefixes, `show:` and `choice:`, and no more. That is a taste line as much as a design
  one - designers will draw against it.
- §7e: "require lock before reveal" as a checkbox is the first answer to your 2026-08-22 question.
  Whether a checkbox is the right shape for it, or too small, is a thing only a walk tells.

## Answered 2026-09-06

Both lines above are ruled: the two prefixes and the checkbox stay as shipped until the students
have used them (`docs/OWNER_RULINGS.md`). Phases 3 to 5 were built the same night on his go-ahead,
so the phase-2 evidence question is moot. The walk is still worth the minute for the plan itself.

