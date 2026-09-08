# The ref that answers for a `main` that no longer exists

Branch `claude/t-stale-main-ref`, from `origin/main` at `04c8864c`.

`git fetch` moves `origin/main`; it does not move the local `main` branch. Every landing used to
fast-forward the primary checkout, so the two agreed and no script had to choose. GitHub's merge
queue runs on GitHub and touches nothing on this laptop, so the local ref stopped moving the moment
the last hand-merge did and the lag only grows. It was 33 commits on the night of 2026-09-09, in a
worktree cut that same night.

`scripts/main-ref.mjs` exists to answer which ref means "landed", and four scripts already used it.
`owner-receipts.mjs` was the fifth. Two rows found it independently the same night, which is why
this row exists rather than a chip.

## The reproduction

Nothing had to be staged. Local `main` sat at `03aa732d`, `origin/main` at the tip, 33 commits
apart, and the branch had touched no backlog file at all:

```
$ git diff --name-status origin/main...claude/t-stale-main-ref -- docs/backlog
(nothing)

$ node scripts/owner-receipts.mjs --serves claude/t-stale-main-ref
  closes exported-panel-does-not-pair-with-an-imported-design (which never named this branch)
  and edits 5 receipt(s) it never claimed
```

Six receipts attributed to a branch that had opened none of them. All six had landed days earlier.
After the fix the same command answers `owns no owner receipt and changes none`.

That is the shape row Q named: "a branch looks like it changed MORE than it did, so a real diff can
be reported clean." The `--serves` verdict is the queue's landing preflight (`jobs.mjs:472`), so the
noise sits directly in front of the one gate that reads it.

## What was wrong in `owner-receipts.mjs`, and why it outlived four fixes

Four reads, three of them naming the bare local ref and one naming no ref at all:

| Where | What it did | Now |
| --- | --- | --- |
| `recentCommits` (509) | `gitRead([...args, 'main']) ?? gitRead([...args, 'origin/main'])` | `landedRef(root)` |
| `receiptsFor` (603) | `git show main:<path>` to recover a receipt the branch deleted | `landedRef(root)` |
| `changedBacklogFiles` (613) | `git diff --name-status main...<branch>` | `landedRef(root)` |
| `closedReceipts` (626) | `git log` with **no revision**, so it walked HEAD | walks `landedRef(root)` |

The first line is the reason the file survived four siblings being repaired. **It reads local `main`
first and falls back to `origin/main` only if that read FAILS.** Local `main` exists on every
checkout here, so the read never fails, the fallback never fires, and the stale ref is always the
answer. It is shaped like robustness and guarantees the wrong result, which is exactly the kind of
line a sweep skims past.

`closedReceipts` is the same defect in its absent form: a listing whose promise is "the landed ones"
stopped at the branch's fork point. No scanner can catch that one - there is no token to match.

The fix is `landedRef(root)`, a memoised `mainRef` adapter (`owner-receipts.mjs:190`). Not a fifth
private answer to the question `main-ref.mjs` exists to answer.

## The sweep

Every `main` in `scripts/`, `cli/` and `.github/`, by hand, then again by the scanner below.

**Fixed** - the four rows in the table above, all in `scripts/owner-receipts.mjs`.

**Deliberate, with the reason:**

| Where | Why it stays |
| --- | --- |
| `cleanup-worktrees.mjs` (`MAIN` + `REMOTE_MAIN`, containment in both) | asks a different question - "is this work backed up off this machine?" - and the wrong answer deletes a gigabyte of work. `main-ref.mjs`'s own header says it must never use the helper. Untouched. |
| `e2e-affected.mjs:1087` `mainRefs`, local first | its question is a **merge-base**, not a landing. A stale ref is an ancestor of a fresh one, so it can only push the base earlier and widen the plan - a slower suite, never a missed test. The comment now says so; it did not before. |
| `worktree-activity.mjs:72` `rev-parse --verify --quiet main` | asks only whether a local `main` branch EXISTS, to decide whether a comparison is possible. It reads the landed ref through `mainRef` on the next line. The single entry in the new gate's allowlist. |
| `check-shared-instructions.mjs:187-188` | string markers pinning the handoff workflow's archive test, which requires containment in BOTH refs. Not git calls. |
| `reattach-main.mjs`, `agy-run.mjs:380`, `ci-watch.mjs:91`, `jobs.mjs:346/768`, `jobs-store.mjs:1296`, `wave-tick.mjs:258`, `worktree-activity.mjs:86/140`, `vercel-ignore-build.mjs:49`, `red-main-issue.mjs:57`, `metrics/ci-minutes.mjs`, the `hooks/*` guards | all compare the CURRENT branch name to the string `main`, or name the branch to switch to. A name comparison has no stale answer. |
| `queue-pr.mjs`, `jobs.mjs` `--base main`, `e2e-durations.mjs --branch main` | GitHub CLI arguments naming the PR base or a workflow branch on the server. |
| `jobs.mjs`, `e2e-quarantine.mjs` `+refs/heads/main:refs/remotes/origin/main` | fetch refspecs. They name main ON THE SERVER and are the lines that keep `origin/main` fresh. |
| every `.github/` workflow | all read `origin/main` or `github.ref`, and CI checks out fresh, so a stale local ref cannot arise. Swept by hand; nothing to change. |

**Found and filed, not fixed here** - `scripts/orchestrator-week.mjs`, three reads walking HEAD with
no revision, in the checkout the weekly workflow requires and the one holding the stale ref.
Measured: 105 added handoff files against local `main`, 114 against `origin/main`. Receipt at
`docs/backlog/the-weekly-report-walks-head-not-what-landed.md`. Left out on the check workflow's own
rule - a pre-existing bug outside the diff is reported, not silently fixed - and because the weekly
page is owner-facing and its numbers should not move inside a branch about something else.

**Found in the workflow that was supposed to catch all this.** `.agent-workflows/check.md` phase 1
told every reviewer to compute scope with `git merge-base main HEAD`. Run on this branch it answers
100 files; `origin/main` answers 6. That is the exact command that cost rows Q and P their review
passes, written into the instruction. Fixed, with the measurement in the text so the next reader
does not have to trust the assertion.

## Is the next instance visible

Yes, at build time. `scripts/check-landed-ref.mjs` (`npm run check:landed-ref`, `gate: build`)
refuses a quoted string in `scripts/` or `cli/` that hands the bare name `main` to git as a
revision. Two shapes, because those are the two the defect has actually taken here:

- a suffix only git reads - `main...${b}`, `'main..HEAD'`, `` `main:${p}` ``, `'main^'`, `'main~2'`,
  and the same spelled `refs/heads/main`;
- the exact literal `'main'` in an argv, on the hit line or the two above it, alongside a
  revision-consuming verb. That is the `gitRead([...args, 'main'])` shape, where the verb sits in
  the argv built on the previous line.

Never a hit: a comparison (`branch === 'main'`), a fetch or push refspec, a comment, or a test file
(tests build fixture repositories with `git init -b main` and no remote, where the local ref is the
only truthful one). Each exemption carries a reason, and an exemption that stops matching **fails
the gate**, so it cannot outlive the line it was written for.

Measured on the tree as it stands: **344 shipped scripts, 28,047 string literals, one deliberate
use left.** The first test is the three lines `owner-receipts.mjs` actually shipped, copied
verbatim - the gate is worth its build seconds only if it would have caught the bug that caused it.

It says its blind spots out loud rather than implying completeness: an **absent** ref (no token to
match - that is how `closedReceipts` and `orchestrator-week` hid), a ref built at a distance, and
`merge`/`rebase`/`checkout`/`switch`/`reset`, left out on purpose because naming the local branch to
those is usually the point and flagging correct code teaches the next reader to skim.

## What I could not reach

`/code-review` is a Claude Code built-in with no file in this repository, and it had the same bug
twice on 2026-09-08 - row Q's pass produced ten findings about files its branch never opened, row P
discarded a pass that had reviewed two landed pull requests. Recorded with both rows' evidence and
the two things that would settle it in
`docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`, `needs-owner: harness`.

Worth knowing: the review leg of this row's own `/check` scoped itself correctly, noticing the stale
local ref and using `origin/main`. So the failure is not constant, which makes it worse to rely on.

## `/check`

- **review: delegated.** Scope-checked against phase 1 (6 files, merge-base `04c8864c`) and it
  matched. Four findings, all verified against the surrounding code before acting:
  1. *medium, fixed in `main-ref.mjs`.* `mainRef` returned the string `main` when the local branch
     does not exist, because the containment test fails for the boring reason that one side is
     missing. A CI checkout of a feature branch has no local `main` at all, and the fallback I
     deleted used to cover that. Fixed at the module, not the caller - it is the same argument the
     file already makes for the missing-remote direction, and all five callers get it.
  2. *medium, filed.* `orchestrator-week.mjs`, above.
  3. *low, fixed.* The gate crashed rather than reporting when a tracked script is deleted from the
     working tree; `repositoryFiles()` lists what git tracks. Guarded with `existsSync`, the way
     `check-retired-names.mjs` guards the same case.
  4. *low, fixed.* `refs/heads/main` slipped through both patterns, and the header claimed its
     limits were complete. Widened, which immediately produced two false positives on fetch
     refspecs - so refspecs are now excluded by the one token that only occurs in them, `:refs/`.
     The verb-list omission is now stated as a decision rather than left silent.
- **simplify: inline.** The skill returned fan-out instructions - a background pass whose result
  routes to the launcher and never arrives here - so the leg was done in this context over its four
  angles. Three changes: `mainRef`'s three-question chain flattened through one `then` helper
  instead of two nested sync-or-promise ternaries; the gate's 3-line verb window joined on demand
  rather than for all ~70,000 lines it reads; a dead `slice` moved into the branch that uses it. No
  reuse finding - `landedRef` is a fourth adapter around `mainRef`, but the three existing ones
  have differently shaped runners and unifying them is a different change. On altitude: the deepest
  fix is one git helper every script must use, which is ~40 files and its own row; the gate is the
  right depth for now because it makes the next instance loud without forcing that rewrite.
- **verify: green.** `npm run build` exit 0, read from the build's own exit code. 30 tests across
  `check-landed-ref`, `main-ref` and `owner-receipts`. `npm run check:owner-receipts` OK.
  `check:gate-coverage` accepts the new gate (35 checks, 107 test files) and the build runner runs
  it. CI run 34287397482 on the first commit was green, and I read the job list rather than the
  badge: Build, Factory gates, E2E plan, nine E2E shards, Combined E2E report and CI gate all
  success; Reviewed, Vercel, catalog calibration, E2E retry and After-the-gate skipped on their
  conditions.
- **taste: not applicable.** Nothing here can move what a graphic looks like - four scripts, a
  workflow instruction and two backlog receipts.
- No `docs/acceptance/owner-queue/` item: the change is developer tooling with no route in the
  product. The invariant asks for one when the work is observable in the product, and this is not.

## Pointers

- `scripts/main-ref.mjs` - the one answer, and the header that records what the wrong one has cost.
- `scripts/owner-receipts.mjs:190` `landedRef`, memoised per checkout because `receiptsFor` asks
  once per deleted receipt and a migration pass deletes forty.
- `scripts/check-landed-ref.mjs` - the gate, its allowlist and its blind spots.
- `scripts/check-landed-ref.test.mjs` - the pre-fix lines, verbatim.
- `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` - the half outside this repo.
- `docs/backlog/the-weekly-report-walks-head-not-what-landed.md` - the sixth instance, filed.
- `docs/handoffs/2026-09-08-q-oss-community-files.md`, "The thing underneath all ten" - row Q's
  original account.
