---
source: derived
---
# A workflow can contradict the root contract, and nothing goes red

**Filed:** 2026-09-06. **Source:** measurement while updating `.agent-workflows/noacg-task.md`

## Why

`AGENTS.md` changed the landing rule on 2026-08-25: work reaches `main` through the queue, and a
session driving the merge itself is outside the serialization. Four workflow files never got the
message - `noacg-task` ("the user decides when work lands"), `check` ("landing on `main` is the
user's call, via safe-merge"), `next` (which ranked "merge and push via safe-merge" as a
first-class option and carried a whole subsection on running it) and `handoff` (whose archive
verdict read as the state after a clean safe-merge run). They were fixed on 2026-09-06.

`npm run check:shared-instructions` is thorough about everything else in these files: adapter
thinness, frontmatter, byte budgets, an `npm run` script that does not exist, a `scripts/` path
that does not exist, and a list of pinned marker strings per workflow. It has no opinion on
whether a workflow's procedure agrees with the contract it serves. So the one class of drift that
makes an agent take a wrong ACTION is the class nothing measures, and `/next` spent eleven days
recommending a landing route the root contract had retired - to every session, several times a day.

## What it would take

The mechanism already exists and is one line per entry: `CRITICAL_WORKFLOW_MARKERS` in
`scripts/check-shared-instructions.mjs`. Two ways to use it here, and the second is the stronger:

- Pin the landing sentence in each workflow that carries one, the way `next`, `handoff`,
  `orchestrator`, `safe-merge` and `cleanup-worktrees` already pin theirs. That freezes today's
  wording and refuses a silent revert.
- Better, a NEGATIVE check: refuse any non-destructive workflow that instructs a session to merge
  into `main` itself. The rule is small and stable enough to encode - the destructive workflows
  (`safe-merge`, `cleanup-worktrees`) are already an enumerated set, so everything outside it
  naming `git merge` onto `main`, or naming safe-merge as the route rather than an exception, is
  the defect. That one holds for rules nobody has written yet.

## Evidence

- The fix: commits on `claude/noacg-task-skill-3dc224`, 2026-09-06.
- The contract they contradicted: root `AGENTS.md`, "Git" - "reach `main` through the queue rather
  than running the `safe-merge` flow by hand", and `.agent-workflows/queue-merge.md`.
- The gate that passed them all: `npm run check:shared-instructions`, green on every one of the
  eleven days.
