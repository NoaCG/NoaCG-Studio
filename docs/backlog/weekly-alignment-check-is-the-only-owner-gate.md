---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: unstarted
asked: "we could have weekly alignment checks so we make sure that we have the same plan and vision for NoaCG. The rest we can automate. Once a week we look at the job queue and our long-term plan and then we can just automatically work toward it"
serves: NOW
size: standard
touches: .agent-workflows/orchestrator-week.md, .agent-workflows/orchestrator.md, docs/GOALS.md, docs/PROGRAMMES.md
covered-by: scripts/orchestrator-week.test.mjs
needs-owner: none
---
# The weekly alignment check is the only gate that needs the owner

**Filed:** 2026-09-05. **Source:** owner ruling (`docs/OWNER_RULINGS.md`, owner-decisions-2026-09-05).

## Why

The 2026-09-05 ruling removes the owner from every technical and design decision. What it keeps
him for is the one thing no model can supply: whether the plan is still what he wants NoaCG to be.
Today that check has no fixed place - the orchestrator grounds each wave in `docs/GOALS.md` NOW
and `docs/PROGRAMMES.md`, and if those drift from his intent a faithful wave goes confidently in a
slightly wrong direction (the alignment session the review handoff deferred). A weekly check with
him in the loop is the bound that makes "the rest we can automate" safe: between checks the queue
and the long-term plan run on their own and no plan asks him when.

## What it would take

- A step in `orchestrator-week.md`: read the north star, `## NOW`, the programme register and the
  backlog frontier; write the week's plan as a short list the owner reads in five minutes; ask him
  only where the plan and the vision could differ. His answers go to `docs/OWNER_RULINGS.md` and
  the affected doc in the same session.
- Between checks the orchestrator never routes a "when" or a "which first" to him: the plan
  answers, and a plan question the plan cannot answer is a consult, then a dated decision he can
  revert at the next check.
- The morning report's alignment questionnaire becomes the weekly check's input rather than a
  daily ask.

## Evidence

The 2026-09-05 orchestrator review, item 6 (handoff drained 2026-09-08), and the ruling
text. Over a year of planned work exists (owner, 2026-09-05), so the constraint is direction, not
supply.
