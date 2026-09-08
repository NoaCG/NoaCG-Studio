---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: advanced
note: "2026-09-08 - the check SHIPPED as the weekly owner session: `.agent-workflows/orchestrator-week.md` part A (the week's plan, the at-most-three questions and the test each must pass), the `weekly-owner-session` scheduled task on Tuesdays 09:15, and the routine set consolidated around it in `docs/ROUTINES.md`. What is still open is the recording half - his answers have to reach `docs/OWNER_RULINGS.md` and the affected doc through a session, and nothing yet makes that automatic - plus three or four weeks of runs to see whether the three-question cap holds."
asked: "we could have weekly alignment checks so we make sure that we have the same plan and vision for NoaCG. The rest we can automate. Once a week we look at the job queue and our long-term plan and then we can just automatically work toward it"
serves: NOW
size: standard
touches: .agent-workflows/orchestrator-week.md, docs/ROUTINES.md, docs/GOALS.md, docs/PROGRAMMES.md
covered-by: scripts/orchestrator-week.test.mjs
needs-owner: none
---
# The weekly alignment check is the only gate that needs the owner

**Filed:** 2026-09-05. **Source:** owner ruling (`docs/OWNER_RULINGS.md`, owner-decisions-2026-09-05).
**Shipped:** 2026-09-08, on his direct question about which routines exist.

## Why

The 2026-09-05 ruling removes the owner from every technical and design decision. What it keeps
him for is the one thing no model can supply: whether the plan is still what he wants NoaCG to be.
Before this, that check had no fixed place - the orchestrator grounds each wave in `docs/GOALS.md`
NOW and `docs/PROGRAMMES.md`, and if those drift from his intent a faithful wave goes confidently in
a slightly wrong direction. A weekly check with him in the loop is the bound that makes "the rest we
can automate" safe: between checks the queue and the long-term plan run on their own and no plan
asks him when.

## What shipped

- **Part A of `.agent-workflows/orchestrator-week.md`.** Read the north star, `## NOW`, the
  programme register, the owner receipts and the NOW-serving backlog frontier; write the week's plan
  as directions he can read in five minutes; then at most three questions, each held to one test -
  *would his answer change what we build or in which order, in a way no model can derive from the
  docs?* Everything that fails that test is decided and recorded as revertible, which is what stops
  the page becoming the questionnaire the ruling deleted.
- **Unanswered is not a stop**, written into the procedure. The plan stands and the queue keeps
  working. A question is carried forward once, then dropped and replaced by the decision taken
  instead.
- **The `weekly-owner-session` scheduled task**, Tuesdays 09:15, replacing the separate Monday
  feedback routine and Tuesday orchestrator review. Chat gets sections 1 to 4 - the plan, what needs
  him, feedback, freshness. The orchestration review stays in the file.

## What is still open

- **The recording half.** His answers belong in `docs/OWNER_RULINGS.md` and in whichever of
  `GOALS.md` / `PROGRAMMES.md` / a backlog entry the answer moves. Routines cannot write tracked
  files, so today that depends on a session picking the answer up out of chat, which is exactly the
  shape of a missing mechanism. The obvious fix is for the next `/orchestrator` invocation to treat
  an answered alignment question as a mandatory row.
- **Whether three questions is the right cap.** It is a guess. Three or four weeks of runs will say
  whether it forces real questions out or lets padding in.

## Evidence

The 2026-09-05 orchestrator review, item 6 (handoff drained 2026-09-08), and the ruling text. Over a
year of planned work exists (owner, 2026-09-05), so the constraint is direction, not supply - which
is the argument for a direction check rather than a throughput one.
