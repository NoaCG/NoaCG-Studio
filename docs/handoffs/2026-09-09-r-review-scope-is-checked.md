---
v: 2
kind: handoff
date: 2026-09-09
branch: claude/r-review-scope-is-checked
row: R
---
# R - a mis-scoped review says so

**Done and queued.** `/check` phase 2 no longer asks the row to remember that a delegated review
might have read the wrong files. It names the one command whose output the row compares, says what
a mismatch means, and pins three sentences of that step as critical contract markers so the next
rewrite cannot drop it with a green build.

## What changed

`.agent-workflows/check.md`, three edits:

1. **Phase 1 fetches.** `git fetch --quiet origin main` runs before the merge base is computed, so
   even `origin/main` is current rather than as old as the worktree. The diff itself is still
   `git diff $(git merge-base origin/main HEAD)`, merge base against the WORKING TREE, because
   uncommitted content has to be in the text the phases read.
2. **Phase 2 compares two lists.** Write down the branch, base sha and file list the review claims;
   run `git diff --name-only $(git merge-base origin/main HEAD)..HEAD`, plus whatever
   `git status --porcelain=v1` reports uncommitted; compare. It matches only if the review's branch
   is this worktree's and every file it read is in that list. A pass that will not say what it
   scoped fails the same way - a mis-scoped review that comes back CLEAN names no files, which is
   the silent case itself, so unfalsifiable does not get to mean trustworthy.
3. **The verdict is written down.** Any mismatch discards the WHOLE pass, not the findings that
   fell outside, the leg is redone by hand, and the handoff says `review: discarded+inline` with
   both scopes. Discarding is discarding it as a review OF THIS BRANCH - findings about another
   branch's files are still relayed to the row that owns them.

`scripts/check-shared-instructions.mjs` gets a `check` entry in `CRITICAL_WORKFLOW_MARKERS`,
pinning the command, the verdict and the handoff word. **That gate was measured, not assumed**:
perturbing "On any mismatch, discard the WHOLE pass" to "On a mismatch, drop it" fails the build
with `missing critical contract marker`, and the file was restored. `check` had no markers at all
before this, so the whole workflow was deletable quietly.

`docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` keeps its subject - the built-in
tool is still broken and still needs the harness - and gains row J as the third stale-main instance
plus a paragraph saying the in-repository half is that the row notices. Its receipt moves
`unstarted` to `advanced` with a note, because a receipt with landed work counting as untouched
drifts the one number a planner steers by, and `touches:` now names the two files instead of "none
in this repository".

## Why prose and a marker rather than a script

The comparison needs one input no script can read: what the review SAYS it scoped. That claim
arrives as prose in a tool result, so the row is the only thing that can put the two lists side by
side. What a script can do is refuse to let the instruction disappear, and that is what the markers
do. The 2026-09-08 wish list in the backlog file is still the real fix, and still not ours to write.

## The check, run on itself

This row ran its own new step on its own branch, which is the only proof that matters.

- **`review: delegated`.** Scope `claude/r-review-scope-is-checked`, merge base
  `c6417a1dea66a28c6ccf7ef396de5177800e6c18`, three files, clean tree. The delegated pass reported
  the same branch and the same three files, so it passed the comparison and counted. It found
  **seven defects and every one was real**, including the one that matters: my first draft had
  narrowed phase 1 to `..HEAD`, which stops at the last commit, while the same bullet still claims
  uncommitted work is in scope. An ordinary pre-commit `/check` would then have produced a correct
  review naming a working-tree file the comparison could not find, and the rule would have thrown
  away a good pass. The mechanism's own false-positive case was the ordinary invocation. Also
  fixed: no rule for a scope-less pass, the discard/relay contradiction, three different counts of
  the same evidence (six passes across four rows is the honest one), and a citation pointing at a
  handoff that has since been consumed - now `git show c5823d3b^:docs/handoffs/...`, verified to
  resolve.
- **`simplify: inline`.** The skill returned fan-out instructions, so by the workflow's own
  four-branch rule it did not run. Done here over the four angles: two wording fixes, no structural
  change. The duplicated merge-base command in phase 2 is deliberate and stays - the point is that
  the command sits where the comparison happens.
- **`verify: inline`.** `npm run build` green, exit 0 read from the build itself, after each
  commit. CI **success** on every commit this branch pushed, `545fc371` - the tip carrying all the
  reviewed content - included; the jobs that RAN each time were Build, E2E plan, Factory gates and
  CI gate. The E2E shards are `skipped` and that is correct, not a gap - the plan job mapped a diff
  with no product code and had no specs to map.
- **`taste: not applicable`.** Nothing here can move what a graphic looks like.

No `docs/acceptance/owner-queue/` file: this changes how agents check their own work, and there is
no route through the product to look at.

## Budget

No ceiling trips. `check.md` is not a modular workflow, so it carries no line limit, and the
instruction chains are 37 KB clear of the 110 KB ceiling - `check.md` is loaded on invocation, not
in any `AGENTS.md` chain. The file grew from 200 lines to 219, and two dead handoff citations went
out with the change rather than being carried.

## What is left

One follow-on, small, not blocking: the `/check` stamp already carries `mergeBase` and `files`, so
`scripts/jobs.mjs add-merge` could refuse a stamp whose recorded file list does not match the tip's
diff - the machine half of this same check, at the landing gate rather than in the row's hands. It
belongs with row K's stamp work, not here.

## Safe to archive

Yes, once the queue lands it. Nothing uncommitted, branch pushed and green, stamp written, and this
file carries what the next session needs.
