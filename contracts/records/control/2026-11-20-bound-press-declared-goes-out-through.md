# control/bound-press-declared-goes-out-through

Rule: `control/bound-press-declared-goes-out-through`. Recorded 2026-11-20 on `claude/plan-live-publishing-fix-2617` at 7ab0879e2.

#2617: on staging, 199 Goal presses ended at a score of 55. Each press was written once as an absolute figure computed from the page's tree, and a failure called refresh(), which dropped the presses stacked on top. Fixed by migration 0121 and the queue in productionDataSession.ts (docs/work-specs/live-publishing/evidence/fix-2617.md R1 to R11).

Why a rule rather than a fix, a mechanism or a check: The press id is the mechanism that keeps a resend from counting twice, and the model invariant on productionData.ts still holds because the tree write stays an absolute merge patch; what no check can see is a future caller counting a press from the page's own tree again, which is the loss #2617 fixed.
