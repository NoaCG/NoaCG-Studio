---
v: 2
source: derived
kind: finding
raised: 2026-09-08
state: unstarted
found: "a branch cut from another unlanded branch queues cleanly against main and lands the parent's commits without the parent session's declaration; only prose in queue-merge.md stops it"
serves: NOW
size: standard
touches: scripts/jobs.mjs, scripts/queue-pr.mjs, scripts/merge-order.mjs
covered-by: scripts/jobs-store.test.mjs
needs-owner: none
---

# A stacked branch queues its parent's commits

`npm run queue:merge` opens every pull request against `main`. A branch that was cut from another
branch instead of `main` therefore carries that branch's commits, and the merge queue lands both
the moment the child's checks are green - while the parent's session may still be mid-conversation
and has declared nothing. The laptop lander used to refuse this shape through `merge-order.mjs`
(`verdictFor`, "contains <branch>, which must land first"); the queue has no equivalent, and today
the only stop is a paragraph in `.agent-workflows/queue-merge.md` section 2 telling the session to
run the instrument itself.

## Why

"Queueing IS the declaration that the work is done and only that session can make it" is the one
rule landing has (`root/land-through-run-session-owns-branch`). A mechanism that lets a second
session land the first session's work by accident breaks it silently, and a clean CI run is no
evidence either way.

## The mechanism

`docs/WORKFLOW_ARCHITECTURE.md` §5.2 already designs it: a stacked pull request is one whose BASE
is the parent branch; the queue lands the parent, GitHub retargets the child to `main`, and the
child's checks re-run. So `cmdAddMerge` in `scripts/jobs.mjs` runs `merge-order.mjs`'s containment
check on the tip, and when the branch contains another branch that is ahead of `origin/main`:

1. if that branch has an OPEN pull request, open this one with `--base <that branch>`;
2. if it has none, refuse with the branch named and the two honest ways out - rebase onto
   `origin/main`, or ask that session to queue first.

`queueOnGitHub` and `scripts/queue-pr.mjs` share the sequence, so the base goes through the one
place both callers use. Pin it in `scripts/jobs-store.test.mjs` beside the other refusals.

**Check that "one place" exists before relying on it.** A `/check` review of the phase 1c/1d/2a
rows found `queueOnGitHub` in `scripts/jobs.mjs` and `queuePullRequest` in `scripts/queue-pr.mjs`
to be the same sequence written twice, and nobody took the finding. If that is still true when this
lands, the base rule goes into one of the two copies and the other keeps queueing the old way -
which is the same defect this item is about, arriving through the other door. Merge them first, or
put the containment check somewhere both genuinely call.
