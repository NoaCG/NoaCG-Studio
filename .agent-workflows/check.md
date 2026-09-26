# check - review, simplify, then verify the current branch

Shared canonical procedure, invoked as `/check` in Claude Code and `$check` in Codex. The pre-merge
quality chain over the work on the current feature branch: a bug-hunting review, a
behaviour-preserving simplification, and the verification, in that order so the simplification
does not polish code a fix is about to rewrite, and verification runs once over the final state.

An optional argument narrows the focus (a path, an area, a concern). This workflow edits the
current feature branch only; it never merges, pushes or touches `main`. On `main`, branch first.

## 1. Scope

Run `node scripts/review-request.mjs`. It fetches, takes the merge base against `origin/main`, and
prints the branch, that base sha and every file this branch changed, committed and uncommitted.
All three phases work from that one set. Read the change with
`git diff $(git merge-base origin/main HEAD)`, which includes uncommitted work. Never recompute the
base from the local `main`, which the merge queue does not move. If nothing changed, report
"nothing to check" and stop.

## 2. Review

- Invoke the tool's review capability (Claude Code: the code-review skill; Codex: its review
  mode) with exactly what `review-request.mjs` printed: the file list and the base sha.
- **Decide the mode from what came back.** Findings, or an explicit clean result, mean the pass
  ran (`delegated`). Anything else - instructions to fan out, an agent id or a promise of a later
  notification, an error - means it did not: do the review here yourself (`inline`), covering
  correctness, edge cases, races and the binding folder guidance. Never wait on a background
  notification to finish this step.
- **Scope-check a delegated pass before believing it.** Compare the branch, base and files it
  reviewed with `git diff --name-only $(git merge-base origin/main HEAD)..HEAD` plus
  `git status --porcelain`. On any mismatch, discard the WHOLE pass as a verdict, and treat a pass that will not say what it
  read the same way: still check any finding that falls inside the real diff, then redo the review
  inline and report `review: discarded+inline` with both scopes.
- Review against what was asked as well as for bugs: does the change make the goal true, and what
  was built that nobody asked for.
- Verify every finding against the code before acting on it. Fix confirmed defects in the changed
  code. A problem outside the diff: fix it in its own commit if it is small, clear and contained;
  otherwise report it.

## 3. Simplify

Invoke the simplification skill (Claude Code: simplify) over the same diff and classify the result
by the same rule; without a usable result, do it inline. Look for reuse of existing helpers, dead
code, needless indirection, and drift from the surrounding style. Behaviour-preserving only; a
cleanup that would ripple into unchanged code stays a report.

## 4. Verify

Follow `.agent-workflows/verify.md`: the acceptance criteria, the checks this change needs, the
loop, the evidence, and the owner queue only where judgment adds value.

## 5. Commit, stamp, report

- Commit what the check changed, with a message an outside developer understands.
- Write the stamp, after committing, with the same modes the report carries:

      npm run stamp -- --review inline:1/1 --simplify inline --verify inline \
        --model <model id> --effort <effort>

  Counts are `<findings>/<fixed>`. Add `--fail` for a check that ran and did not pass. A leg that
  did not run is `not run`, and the verdict it derives is a fail. The stamp covers the exact tip;
  any later commit needs a new check. Never hand-write the stamp file.
- Report per phase: what the review found and fixed, what simplify changed, which checks ran with
  their results, and what was not checked. Name each leg's mode; never report a leg that did not
  run as one that passed.
- Then stop. Landing is the queue-merge workflow, which refuses a tip the stamp does not cover.
