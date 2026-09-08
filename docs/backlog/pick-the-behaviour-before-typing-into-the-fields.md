---
v: 2
source: owner
kind: ask
raised: 2026-09-04
state: unstarted
asked: "if the behavior of the graphic changes, the text react maybe should be above the editable
  text fields so you can start by choosing what the template is"
touches: src/components/wizard/import/MapSvgFieldsStep.tsx
---
# Put the behaviour choice above the text fields on the mapping step

**Filed:** 2026-09-08. **Source:** rescued from `wizard-text-fit-is-order-dependent.md`, deleted in
`251cecfd` with the hypothesis it was filed under. This half was never his hypothesis and outlived
it; it reached today through the 2026-09-04 fit-recompute-order handoff, since drained.

## Why
He raised it while working the Fields step: a reader should choose what the graphic IS before
typing into it. Beyond the bug it was filed beside, it makes the dependency visible in the layout,
because the behaviour decides which rows exist and how many answers are seeded, so a reader who
types first has their work re-shaped under them.

## What it would take
Move the behaviour picker above the field rows in `MapSvgFieldsStep.tsx` and re-walk the step's
copy, which reads top-down today. Check it against the answer-count seeding in the same file (the
count is read off the ticked rows) and against the corpus and behaviour specs.

## Evidence
His words are in the front matter, quoted from the walk of `776aa8cf`. The fit itself was measured
on 2026-09-04 and found order-independent, so this stands on its own as a design change, not a fix.
