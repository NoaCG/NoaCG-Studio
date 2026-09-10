---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: advanced
note: "the row now HANDS the delegate its scope - `scripts/review-request.mjs` prints the branch, the merge base against `origin/main` and the complete file list, and the review is invoked with that instead of a branch name, so there is nothing left for it to derive. Measured ONCE, on the branch that added it: the pass came back naming the handed base sha and exactly the handed file list, and cross-checked both against the script itself. One pass on one short file list is not proof - the next rows to run /check report what came back, and two or three clean scope-checks close this"
found: "the /code-review tooling scopes a branch by diffing against the LOCAL main, which under the merge queue is permanently behind, so it reviews files the branch never touched and can report a real diff as clean"
serves: NOW
size: small
touches: .agent-workflows/check.md, scripts/review-request.mjs, scripts/check-shared-instructions.mjs
covered-by: none
needs-owner: harness
---

# The code review scopes a branch against a stale local `main`

`/code-review` decides which files a branch changed, and between 2026-08-29 and 2026-09-09 it
decided wrong ten times in this repository. It reviewed files that had landed on `main` days
earlier and attributed them to the branch under test. The tooling is a Claude Code built-in with no
file here, so this receipt is the record rather than the fix.

## The ten, from rows that had no contact with each other

**Three on 2026-08-29**, from the other cause: a delegated review inherits the delegating tool's
working directory rather than the worktree under test, so it reviewed a different WORKTREE's
branch. That write-up is consumed and retrievable with
`git show c5823d3b^:docs/handoffs/2026-08-29-dd-svg-fitting-two.md`.

**Row Q**, 2026-09-08 (`git show c68f2a92:docs/handoffs/2026-09-08-q-oss-community-files.md`, "The
thing underneath all ten"). Local `main` sat at `03aa732d`, two commits behind. The review read
`37bc74af` and `31dd12ea` as this branch's work and produced ten findings about files the branch
never opened. Q's words for the shape: "Both are right answers to the wrong question, and the
failure is quiet in the bad direction: a branch looks like it changed MORE than it did, so a real
diff can be reported clean."

**Row P**, independently the same night: its delegated pass read a stale `main` and reviewed two
landed pull requests' files. P discarded the pass and reviewed inline.

**Row J**, 2026-09-09: the pass scoped against merge base `ae5a32b9` rather than the branch's
`761ad8e7`, read 117 files over 26 commits, and returned eight findings about another row's landed
work, none inside J's own diff.

**Rows AS, AV, AQ and AT**, all on the night of 2026-09-09. AS's pass scoped against a local `main`
29 commits stale, reviewed 56 files against a true diff of 2, and returned four findings all in
`cli/` - another row's files. AV's "named files this branch doesn't touch and reported no base
sha". AQ's, five commits stale, put nine of ten findings in files the branch never touched. AT's
reported reading 79 files and about 4,900 insertions "against main" where the true diff was 11
files, and reviewed `cli/src/**`, `scripts/worktree-cleanup-lib.mjs` and `scripts/codex-rescue.mjs`,
none of which that branch touches.

**AT's pass also corrected the discard rule, which is worth more than the tenth data point.** Three
of its six findings named files that ARE in the true diff, and two of those were genuine
high-severity defects - a missing `checks: read` permission, and skipped Playwright specs annotated
as failed ones. Discarding the pass unread would have shipped both. So `/check` now says to discard
a mis-scoped pass as a VERDICT rather than as reading matter: you may no longer claim the branch was
reviewed, and you still check every in-scope claim against the code before redoing the leg.

**The quality cost is worse than the money.** AQ's discarded pass had MISSED a real defect that the
inline redo then caught. A review of the wrong files is not merely wasted; it returns findings and
therefore looks like it worked. Every one of the ten was a delegated pass paid for and thrown
away, and the redo was done by hand.

## Why

`git fetch` moves `origin/main`; it does not move the local `main` branch. Every landing used to
fast-forward the primary checkout, so the two agreed. GitHub's merge queue runs on GitHub and
touches nothing on this machine, so the local ref stopped moving the moment the last hand-merge did
and the lag only grows - 41 commits in this worktree on 2026-09-09.

The in-repository half of that is fixed and gated: `scripts/main-ref.mjs` is the one answer to
"which ref means landed", and `scripts/check-landed-ref.mjs` refuses at build time any script that
asks the question of the bare local ref. None of it reaches a built-in running outside the
repository.

## What was actually wrong with the workaround

`.agent-workflows/check.md` had said the correct thing since 2026-09-08 - fetch first, merge base
against `origin/main`, run the commands inside this worktree - and the rows followed it. **The
delegate never read it.** A delegated review is a separate context that receives an invocation and
nothing else, and what the row handed it was a branch name. A branch name is not a scope; it is an
instruction to go and derive one, and the derivation is exactly where the stale ref got in. The
rule was correct, complete, and pointed at the wrong reader.

So it is now ROUTED rather than restated. `node scripts/review-request.mjs` prints the request the
row hands over: the branch, the merge base taken against `origin/main` after a fetch, the complete
changed set including uncommitted work, and - because this text is the only thing that reaches the
delegate - the instruction not to derive a scope, and to stop and print both lists rather than
quietly substitute its own view. The script binds its git to the worktree that contains it, which
answers the 2026-08-29 cause in code. Measured on the branch that added it: the true base answered
one changed file and the local one answered 72.

`/check` phase 2 still compares the scope the review REPORTS against this branch's real diff and
discards the whole pass on a mismatch. That comparison is what caught all ten, and a fix upstream
of a detector does not retire the detector.

## What is genuinely left

**The fix is measured exactly once.** On the branch that added it, the delegated pass came back
naming merge base `e25d8b14` and exactly the four handed files plus the one deletion read at the
base - and it went further than asked, running the diff and `review-request.mjs --json` itself and
reporting that all three agreed before reviewing anything. That is the first evidence that a
delegate honours a file list it did not compute.

One pass is not proof. It is one delegate, on one branch, on one night, with a four-file list, and
nobody has yet seen the disagreement path fire in anger. The next rows to run `/check` are the rest
of the measurement: report whether the pass named the handed base sha and file list, and whether it
ever refused. Two or three more clean scope-checks close this; one delegate quietly recomputing
means the request needs teeth the workflow cannot give it, and that is when the harness ask below
becomes worth spending.

`needs-owner: harness` therefore stands but has dropped in value. The tool-side fix - make
`/code-review` diff against `origin/main`, and have it name the base sha it used - would still be
better than working around it, and it needs an Anthropic-side change this repository does not hold.
It is no longer costing a review pass a night, so it is not worth interrupting him for.
