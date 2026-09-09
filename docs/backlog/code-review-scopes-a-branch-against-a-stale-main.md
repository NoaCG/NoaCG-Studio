---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "the /code-review tooling scopes a branch by diffing against the LOCAL main, which under the merge queue is permanently behind, so it reviews files the branch never touched and can report a real diff as clean"
serves: NOW
size: small
touches: none in this repository
covered-by: none
needs-owner: harness
---

# The code review scopes a branch against a stale local `main`

`/code-review` decides which files a branch changed, and on 2026-09-08 it decided wrong for two
rows on the same night. It reviewed files that had landed on `main` days earlier and attributed
them to the branch under test. The tooling is a Claude Code built-in and has no file in this
repository, so this receipt is the record rather than the fix.

## The evidence, from two rows that had no contact

**Row Q** (`git show c68f2a92:docs/handoffs/2026-09-08-q-oss-community-files.md`, "The thing underneath all ten").
Local `main` sat at `03aa732d`, two commits behind. The review read `37bc74af` and `31dd12ea` as
this branch's work and produced ten findings about files the branch never opened. Q's words for the
shape: "Both are right answers to the wrong question, and the failure is quiet in the bad
direction: a branch looks like it changed MORE than it did, so a real diff can be reported clean."
It cost that row an entire review pass.

**Row P**, independently the same night: its delegated review pass read a stale `main` and reviewed
two landed pull requests' files. P discarded the pass and reviewed inline instead.

**Row J**, 2026-09-09, a day later and still happening: the pass scoped against merge base
`ae5a32b9` rather than the branch's `761ad8e7`, read 117 files over 26 commits, and returned eight
findings about another row's landed work, none of them inside J's own diff. J discarded it and
reviewed by hand, which then found three real defects the delegated pass never looked at - one of
them a factual overclaim in J's own text. Three rows, three separate discoveries, three review legs
paid for twice.

## Why

`git fetch` moves `origin/main`; it does not move the local `main` branch. Every landing used to
fast-forward the primary checkout, so the two agreed. GitHub's merge queue runs on GitHub and
touches nothing on this machine, so the local ref stopped moving the moment the last hand-merge
did and the lag only grows - 33 commits on 2026-09-09, in a worktree cut that same night.

The in-repository half of this is now fixed and gated: `scripts/main-ref.mjs` is the one answer to
"which ref means landed", `scripts/owner-receipts.mjs` was the fifth and last script reading the
bare local ref, and `scripts/check-landed-ref.mjs` refuses a sixth at build time. None of that
reaches a built-in that runs outside the repository.

## What would settle it

Two things, either of which is enough, and neither of which anyone here can write:

1. `/code-review` diffs against `origin/main` (or fetches first), rather than the local branch.
2. It names the ref and the base sha it scoped against in its output, so a reader can see the
   answer is stale instead of acting on ten findings about somebody else's files.

Until then the workaround is the one all three rows arrived at independently, and since
`claude/r-review-scope-is-checked` it is no longer a workaround anyone has to reinvent: **the
in-repository half of this finding is that the row NOTICES.** `/check` phase 2 now makes the row
write down the branch, base sha and file list the review claims, compare them against
`git diff --name-only $(git merge-base origin/main HEAD)..HEAD`, discard the whole pass on any
mismatch, and report `review: discarded+inline` carrying both scopes. Phase 1 fetches first, so
even `origin/main` is current. Three sentences of that step are pinned as critical contract markers
in `scripts/check-shared-instructions.mjs`, so deleting the comparison fails the build rather than
passing quietly.

That does not fix the tool and does not close this finding. A mis-scoped review still costs a whole
review leg; it just costs one command to detect instead of a wasted pass believed.

## Needs the owner

`needs-owner: harness`. Reaching the tooling means an Anthropic-side change or a harness
configuration this repository does not hold, and that is his call, not a decision to make here.
