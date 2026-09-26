# queue-merge - land finished work

Shared canonical procedure, invoked as `/queue-merge` in Claude Code and `$queue-merge` in Codex.
It is the one way NoaCG work reaches `main`. Optional argument: another branch name (see the end).

**What it protects:** finished work reconciles safely with current `main`, passes the required
verification, lands without duplicate or stale work, and leaves `main` green. The mechanism is
GitHub's merge queue; choose the safest way to get the branch into it, resolve problems yourself,
and never ask the owner about merge order or Git mechanics. Queueing declares the work finished,
so only the session that owns the branch queues it.

## 1. Be finished

- Everything is committed, `npm run build` is green on the tip, and `/check` has stamped that tip.
  `add-merge` refuses a tip the stamp does not cover or whose verdict is not a pass, whichever
  agent did the work. Landing without a review is possible only visibly:
  `npm run queue:merge -- --unreviewed "<reason>"`.
- If the branch serves an owner ask in `docs/backlog/`, answer it here
  (`node scripts/owner-receipts.mjs --serves <branch>`): delete the file when the ask is served, or
  update its state and note. `add-merge` refuses unanswered receipts and unread relay mail
  (`node scripts/relay.mjs read --branch <branch>`).
- Queueing pins the branch at its current commit and freezes its worktree until the landing ends.
  The next change goes on a new branch, or withdraw first with `node scripts/jobs.mjs cancel <id>`.

## 2. Reconcile with current main

    git fetch origin && git merge-tree --write-tree origin/main HEAD

Conflicted paths mean reconcile now (section 4) before queueing. `node scripts/merge-order.mjs
--branch <branch>` refuses a branch that contains another branch that has not landed (exit 3):
rebase onto `origin/main` or wait for that branch, because queueing would land its commits too.

## 3. Queue

    npm run queue:merge -- --why "<the reason the change exists, if the commits do not say it>"

It pushes the branch, opens or reuses its pull request, posts the review verdict as the
`noacg/reviewed` status, adds the `land` label and turns auto-merge on. GitHub queues the pull
request once `CI gate` and `Reviewed` pass, runs CI on the merge group and merges it as one merge
commit. Do not sit and watch: `node scripts/jobs.mjs wait <id>` is bounded if the verdict is needed
now. A migration on the branch is applied by the landing itself (`post-land.yml`).

## 4. When a landing is refused, reconcile and queue again

- **A red check on the pull request:** fix it on the branch, run `/check`, queue again.
- **A conflict with `main`:** in the branch's own worktree, `git merge origin/main`. Regenerate
  every generated file with its generator rather than trusting the merged text (for example
  `npm run contracts:compile`). Resolve mechanical conflicts yourself; hand a conflict about
  meaning to a fresh agent session with both sides' intent. Then build, run
  `npm run test:e2e:integration` so both sides are covered from the fork point, `/check`, and queue
  again.
- A landing that reached no verdict (killed at its cap, the runner gone, CI with no result) is
  retried once automatically; a verdict the queue reached is never retried behind anyone's back.
- `npm run jobs` shows each branch's state (`QUEUED`, `LANDED`, `LANDING FAILED` with the refusal).

## From a cloud session (no `gh`)

1. Section 1 still holds. Push the branch and open its pull request against `main`, with the
   description from `scripts/pr-description.mjs`.
2. Right after opening it, dispatch `.github/workflows/cloud-queue-merge.yml` on `main` with
   `branch`, `sha` (the reviewed tip) and `review` (one line: what was checked). It refuses a branch
   that moved past `sha`, posts `noacg/reviewed` and labels the pull request `land`; its log says if
   the `Reviewed` job needs a re-run.
3. Turn auto-merge on from the session itself (a workflow token's auto-merge never reaches the
   queue), after the workflow run is green.
4. Confirm `added_to_merge_queue` then `merged` on the timeline. Green checks without a queue entry:
   toggle auto-merge off and on from the session, or re-run a red or cancelled `CI gate` or
   `Reviewed`.

## Landing someone else's branch

Allowed only for a branch no live session holds (`node scripts/worktree-activity.mjs` and its last
commit say whether one does). The orchestrator uses this to finish landings whose sessions ended.
A branch whose worktree is gone still lands; the queue works from the pushed branch.
