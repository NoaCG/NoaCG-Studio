---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: advanced
note: "2026-09-08 - SERVED in full. The check shipped as the weekly owner session (`.agent-workflows/orchestrator-week.md` part A, the `weekly-owner-session` task on Tuesdays 09:15, the routine set consolidated in `docs/ROUTINES.md`), and the recording half shipped the same day: `scripts/alignment-answers.mjs` reads the answers out of the session's own file and `wave-plan-check.mjs` refuses a wave plan that does not mention an answered ruling still missing from `docs/OWNER_RULINGS.md`. Rehearsed end to end on 2026-09-10 as a dry run, which found the parser truncating a wrapped owner answer and the week's plan reading as a sprint board; both fixed that day. Kept as a receipt until the first REAL run on 2026-09-15, because a session inventing an answer is not the owner answering; delete it then."
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
- **The recording half.** Each question is written into the session's own gitignored file under an
  id (`ALIGN-<date>-<n>`) and the answer is filled in beside it, which is capture a routine is
  allowed to do. `scripts/alignment-answers.mjs` then compares the answers against
  `docs/OWNER_RULINGS.md`, and `wave-plan-check.mjs` refuses a wave plan that does not mention an
  answered id still missing from it - so the next `/orchestrator` plans the row that writes the
  ruling, and the refusal returns every morning until it lands. It is the plan check rather than
  `npm run build` because the weekly file is gitignored and per-machine: a build gate would be blind
  in CI and would block unrelated feature branches on this laptop.

## What is still open

- **Whether three questions is the right cap.** A guess; three or four weeks of runs will say.
- **The chain was rehearsed on 2026-09-10 and it did not hold as shipped.** A session ran the whole
  procedure as a dry run - the three measurement commands for real, the page written to a scratchpad
  root instead of `docs/handoffs/`, three questions asked, one answer filled in - and put the result
  through the parser, the refusal and the rulings file. The refusal worked. The parser did not: it
  reads one physical line per field, every markdown file here wraps at about a hundred columns, and
  the session wrapped all three questions without thinking about it. An answer of three sentences
  would have been recorded as one and a half in `OWNER_RULINGS.md` and the reminder would have
  cleared as though the whole ruling had landed. Fixed the same day, along with two neighbours the
  2026-09-09 `/check` review had already filed: an answer in a carried-forward question's older copy
  losing to the newer empty one, and an id matched by substring so `...-1` reads as recorded when
  only `...-10` is present. With those fixed the chain holds end to end on real inputs - open,
  pending, refused, recorded, cleared.
- **What the rehearsal cannot prove**, and why this receipt stays until the 15th: a session filling
  in an answer it invented is not the owner answering, and nothing has yet tested whether he reads
  the page as directions. On that second question the dry run is the first evidence and it is
  negative - section 1 came out as a sprint board, four bold headings with a paragraph of
  justification each, so the procedure now fixes the shape at one sentence per direction and a
  closing line naming what is not being started. Whether three questions is the right cap is still a
  guess. Read `npm run alignment:pending` after the 2026-09-15 session, and read section 1 as he
  would, before deleting this.

## Evidence

The 2026-09-05 orchestrator review, item 6 (handoff drained 2026-09-08), and the ruling text. Over a
year of planned work exists (owner, 2026-09-05), so the constraint is direction, not supply - which
is the argument for a direction check rather than a throughput one.
