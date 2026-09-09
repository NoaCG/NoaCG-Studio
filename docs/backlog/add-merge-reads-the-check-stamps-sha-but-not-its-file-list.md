---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "The /check stamp records the file list the review actually read, and the landing gate never compares it with the tip's diff."
serves: NOW
size: small
touches: scripts/jobs.mjs, .agent-workflows/check.md
needs-owner: none
---

# `add-merge` reads the check stamp's sha but not its file list

**Filed:** 2026-09-09. **Source:** the one follow-on left open by the row that made a mis-scoped
review say so - "What is left" in
`git show a2ab4097:docs/handoffs/2026-09-09-r-review-scope-is-checked.md`. That row placed it with
the stamp work of `claude/k-reviewed-gate-race` rather than in its own branch.

`/check` writes `checks/<branch>.json` carrying `{ v, branch, mergeBase, reviewedSha, files,
legs }` (`.agent-workflows/check.md:210`). `scripts/jobs.mjs add-merge` reads two of those fields:
it takes `reviewedSha` and refuses a tip the stamp does not name (`jobs.mjs:364-394`). `mergeBase`
and `files` are written and never read.

## Why

The 2026-09-09 wave produced three separate instances of a delegated review scoping itself against
a stale `main` and reporting on somebody else's landed work
(`docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`). The repair that landed puts
the comparison in the row's own hands: phase 2 of `/check` tells the row to write down what the
review claims it read and diff it against `git diff --name-only $(git merge-base origin/main
HEAD)..HEAD`. That works, and it is a human step in a chain whose whole argument is that human
steps are what a gate is for.

The stamp already holds both halves of the machine version. A stamp whose `files` list does not
intersect the tip's diff is the signature of a review that read another branch, and the landing
gate is the last moment anyone can act on it. This is the same shape as the sha check that is
already there: the sha check catches "reviewed a different commit", and this would catch "reviewed
a different branch's commits".

## What it would take

One comparison beside the existing `stampGap` call in `jobs.mjs`, plus a case in
`scripts/jobs.mjs`'s test neighbours. The verdict wants care rather than code:

- an exact match is not the bar. A review legitimately reads files it does not report on, and a row
  legitimately edits a file after the review and re-stamps;
- an empty intersection is the unambiguous case and is probably the whole gate;
- the stamp's `mergeBase` compared against `git merge-base origin/main <tip>` catches the stale-base
  case directly, and is the sharper signal of the two - but it fires on an ordinary rebase too, so
  it wants to be a warning rather than a refusal unless that is measured first.

Whether this refuses or only prints is the decision to make first. `add-merge` already queues an
unreviewed tip with `(UNREVIEWED: <reason>)` in the description rather than blocking, so a third
descriptive state is the cheap shape.

## Evidence

- `.agent-workflows/check.md:210` - the stamp's fields, `files` and `mergeBase` among them.
- `scripts/jobs.mjs:364-394` - the existing stamp read, and the comment recording that 68 stamps
  sat on disk on 2026-09-06 with nothing reading one.
- `.agent-workflows/check.md`, phase 2 - the hand comparison this would mechanise.
- `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` - the underlying tool defect
  and its three 2026-09-09 instances.
