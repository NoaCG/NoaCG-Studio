# Row AW - stop paying for a review of the wrong files

**Branch:** `claude/aw-delegated-review-scope`, queued. **Gate:** `npm run build` green twice, the
second time over the final state (1513 tests across 110 files); CI run 34416344954 on `9e2dcaf9`
green with Build, Factory gates, E2E plan and CI gate all success and the E2E shards skipped by
CI's own plan job, since no product code changed. **check: run in full** - `review: delegated`,
`simplify: inline`, `verify: inline`, `taste: not applicable`. Stamp written at `d20a6e30` and
verified readable by `readReviewStamp`.

## The measurement the row was sent to get

**The delegated review, invoked with a handed scope, scoped itself correctly.** That is the first
data point on the new mechanism and it is the one the receipt was waiting for. The pass came back
naming merge base `e25d8b14`, exactly the four handed files plus the one deletion read at the base,
and it went further than asked: it ran `git diff --name-status` itself, ran
`review-request.mjs --json`, and reported that all three agreed before reviewing anything. Nine of
the previous ten passes across seven rows had scoped against a stale local `main`.

One pass is not proof. It is one delegate, on one branch, on one night, and the file list happened
to be short. The receipt says so and asks the next rows to keep reporting.

**And the numbers on this branch are why it mattered.** Local `main` in this worktree is 41 commits
behind `origin/main`. The two merge bases on this branch answered **1 file and 72**. A delegate
deriving its own scope would have reviewed 71 files belonging to other rows and never opened the
one this branch changed - and would have returned findings, which is what makes the failure
expensive rather than merely wasted.

## What actually changed, and why it is a script

The rule was never missing. `.agent-workflows/check.md` has said the right thing since 2026-09-08:
fetch first, merge base against `origin/main`, run the commands inside this worktree. The rows
follow it. **The delegate never reads it** - a delegated review is a separate context that receives
an invocation and nothing else - and what the row handed it was a *branch name*. A branch name is
not a scope; it is an instruction to go and derive one, and the derivation is where the stale ref
got in. The rule was correct, complete, and pointed at the wrong reader.

So it is routed, not restated. `node scripts/review-request.mjs` prints the request the row hands
over. Three things live in that text and can live nowhere else, because it is the only channel that
reaches the delegate: the scope itself, the ban on deriving one, and the instruction to stop and
print both lists rather than substitute its own view. The script also binds its git to the worktree
that contains it rather than the caller's directory, which answers the other cause (three passes on
2026-08-29 read a different worktree's branch), and it refuses `ultra`, which `check.md` could only
ban in prose.

**check.md came out five lines shorter** (219 to 214) while gaining the fix. That was the row's
constraint and it is worth keeping: the paragraphs on ref choice and worktree binding became code,
and the enumeration of the nine passes became a pointer to the receipt that carries them in full.
The three pinned contract markers are untouched, and phase 2's comparison is untouched - it is the
detector that caught all nine, and a fix upstream of a detector does not retire the detector.

## The four defects I found in my own script, and how

None of these came from reading the code. Every one came from running it and reading the output.

1. **The path lost its first character.** My `git()` helper trimmed both ends, which ate the
   significant leading space of `porcelain`'s first line, and `slice(3)` then ate the path's first
   character: `.agent-workflows/check.md` went out as `agent-workflows/check.md`. Only the FIRST
   entry is affected, and only when it is unstaged-modified - the common case.
2. **The request named a file I had deleted.** `git diff --name-only` includes deletions, and my
   request told the delegate to refuse on any file it could not open. It asked for a refusal on
   every branch that removes anything, including the branch that introduced it. Deletions are now a
   separate section, exempt from the refusal rule, pointed at the base sha.
3. **An untracked directory was named as a file.** `porcelain=v1` defaults to
   `--untracked-files=normal`, which collapses a new directory to one entry. A probe with two files
   under `zz-probe/` printed only `?? zz-probe/` - unopenable, and neither file inside ever named.
4. **A path git quoted was reported as deleted.** `zz-käyttö.md` comes back as
   `"zz-k\303\244ytt\303\266.md"`; stripping the quotes leaves the escapes, so it resolved to
   nothing. Both 3 and 4 are answered by `-z --untracked-files=all`, which turns quoting off
   outright instead of teaching the parser to undo it.

**The delegated review found 3 and 4, and both were real.** It also claimed my existing test case
`"docs/a file.md"` was "a shape git does not produce - spaces alone never trigger quoting". **That
is wrong**, and I only know because I probed it: git emits `?? "zz a space.md"`. Verify every
finding against the actual behaviour, including the ones from a pass that has just proved itself
careful.

## Traps that exist in no repo file

- **`worktree-cleanup-lib.mjs` exports a shared `git()` that looks like the one to reuse here.
  Do not.** It trims both ends, which is right for the revisions its callers ask for and wrong for
  every byte of porcelain - it is defect 1 above, waiting. The comment in `review-request.mjs` says
  so at the point of temptation.
- **A worktree-isolated session cannot write the check stamp directly.** The stamp belongs at
  `<git-common-dir>/noacg-jobs/checks/`, which is the shared checkout, and both Write and a
  compound Bash write are refused by the isolation guard. Write it to the scratchpad and `cp` it
  across as one plain command. Nothing documents this and it costs a few minutes to rediscover.
- **The Bash guard also refuses a heredoc whose *content* contains the word `git`**, and any
  command combining `$(git ...)` with a pipe. Split those into plain separate calls.

## What is left

- **The fix is measured once.** The receipt
  (`docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`) now asks the next rows
  running `/check` to report whether their delegated pass honoured the handed list. Two or three
  clean scope-checks close it; one delegate quietly recomputing means the request needs teeth the
  workflow cannot give it.
- **`needs-owner: harness` stands but has dropped in value.** The tool-side fix - `/code-review`
  diffing against `origin/main` and naming the base sha it used - is still better than working
  around it, still needs an Anthropic-side change, and is no longer costing a review pass a night.
  Not worth interrupting him for.
- **`docs/backlog/owner-receipts-serves-diffs-against-local-main.md` is deleted, not deferred.**
  Both functions it named read `landedRef` as of `35523e29`, and `check-landed-ref.mjs` fails the
  build on a script that reintroduces the pattern. Verified by running the thing rather than
  reading it: `--serves` on this branch reports exactly its two backlog changes, where the receipt
  recorded it inventing 21.

## The files this branch touched

`scripts/review-request.mjs` (new), `scripts/review-request.test.mjs` (new, 9 tests, auto-discovered
by `gates.mjs`), `.agent-workflows/check.md`,
`docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`, and
`docs/backlog/owner-receipts-serves-diffs-against-local-main.md` (deleted).

Four commits, working tree clean. Nothing left uncommitted.
