---
kind: walk
date: 2026-09-08
serves: now
answered: false
---
# The weekly alignment check exists, and the routines around it are down to five

**Date:** 2026-09-08 · **Branch:** `claude/noacg-routines-orchestrator-a3b5cb`

## What changed

You asked which routines we have, whether some could be combined, and whether the alignment check
had been built. It had not - it was filed on 2026-09-05 and never started. Both are done now.

**The alignment check is the first half of a weekly owner session**, Tuesdays at 09:15. It reads the
north star, `## NOW`, the programme register, your receipts and the NOW-serving backlog, and writes
the week's plan as directions you can read in five minutes. Then it asks **at most three questions**,
and each one has to pass a single test: *would your answer change what we build or in which order,
in a way no model can derive from the docs?* A technical question, a design question, a merge
conflict, a "which first" the plan already answers, and anything shaped like "is this okay?" all
fail that test and get decided without you, recorded where you can revert them. If a week has no
qualifying question it says "nothing needs you this week".

**It never blocks.** If you do not answer, the plan stands and the queue keeps working toward it.
That property is the point, not a fallback - it is what makes the rest of your ruling safe.

**The routines went from a table of eight to five that actually run.** Three daily routines became
one morning brief, which now answers what is still broken, what the queue did overnight and what did
not run at all, and still says nothing at all on a clean morning. The Monday feedback routine folded
into the Tuesday session. Along the way three rows of the old table turned out to be false: one
routine had never existed, one had a task file but was never registered so it had never run once,
and the quality review had been running **weekly** while the doc called it monthly.

## The route, under a minute

Open the **Scheduled** section in the Claude Code sidebar. You should see five enabled tasks -
morning brief, delegation tooling, weekly owner session, competitor review, quality review - and
three greyed-out ones whose descriptions start with SUPERSEDED. Click **Weekly owner session** and
**Run now** to see the page it will produce; that is the whole of your weekly commitment.

Then read `docs/ROUTINES.md`, which is one page and now matches the scheduler.

## What to look at

- **The three-question cap, and the test each question has to pass.** That is the line between a
  check that respects your ruling and a questionnaire that quietly reinstates the gate. It is a
  guess and it is the thing most likely to be wrong.
- **Whether Part A reads like directions or like tasks.** It is written for you, not for a session.
  If the first run reads like a sprint board, the format is wrong.
- **Tuesday 09:15**, chosen because you said fresh usage. It sits before the monthly reviews and
  after the morning brief.

## What needs you, at the first run

Nothing before it runs. One thing after: **your answers currently have to be picked up out of chat
by a session** to reach `docs/OWNER_RULINGS.md` and the plan docs, because a routine is not allowed
to write a tracked file. That is a missing mechanism by our own rule, it is written down in
`docs/backlog/weekly-alignment-check-is-the-only-owner-gate.md`, and the fix is for the next
`/orchestrator` after an answered session to carry the answer as a mandatory row. Say at the first
session whether you want that built straight away or want to see the page work first.
