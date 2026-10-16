# queue-merge - land finished work

Shared canonical procedure, invoked as `/queue-merge` in Claude Code and `$queue-merge` in Codex.
It is the one way NoaCG work reaches `main`. Optional argument: another branch name (see the end).

**What it protects:** finished work reconciles with current `main`, passes the required
verification, lands without duplicate or stale work, and leaves `main` green, through GitHub's merge
queue. Resolve problems yourself; never ask the owner about merge order or Git mechanics. Queueing
declares the work finished, so only the session that owns the branch queues it.

## 1. Be finished

- Everything is committed and `/check` has stamped the tip with its targeted checks passing; the
  full build and the browser suites run on the pull request's CI, not here. `add-merge` refuses a
  tip the stamp does not cover or whose verdict is not a pass, whichever agent did the work.
  Landing without a review is possible only visibly:
  `npm run queue:merge -- --unreviewed "<reason>"`.
- If the branch finishes a GitHub issue, put `Closes #<n>` on its own line in a commit message:
  queueing copies it into the pull request, and GitHub closes the issue when the branch lands. A
  branch that only advances an issue says what it did in a comment on the issue. `add-merge`
  refuses unread relay mail (`node scripts/relay.mjs read --branch <branch>`).
- Queueing pins the branch at its current commit and freezes its worktree until the landing ends.
  The next change goes on a new branch, or withdraw first with `node scripts/jobs.mjs cancel <id>`.

## 2. Reconcile with current main

    git fetch origin && git merge-tree --write-tree origin/main HEAD

Conflicted paths mean reconcile now (section 4) before queueing. `node scripts/merge-order.mjs
--branch <branch>` refuses a branch that contains another branch that has not landed (exit 3):
rebase onto `origin/main` or wait for that branch, because queueing would land its commits too.

## 3. Queue

    npm run queue:merge -- --risk "<what could break>" --why "<the reason, if the commits do not say it>"

`--risk` is the pull request's Risk line, written from the diff you just checked: one plain sentence
naming what could break for a user if this change is wrong, or `low, copy only`. Without it, a
branch that changes only `docs/**/*.md` reads `Risk: low, docs only.` and any other shows none.

It pushes the branch, opens or reuses its pull request, posts the review verdict as the
`noacg/reviewed` status, adds the `land` label and turns auto-merge on. GitHub queues it once
`CI gate` and `Reviewed` pass and merges it as one merge commit after CI on the merge group. Do not
sit and watch: `node scripts/jobs.mjs wait <id>` is bounded if the verdict is needed now. A
migration on the branch is applied by the landing itself (`post-land.yml`).

**Exactly one repair owner is required for every pull request, before the worker ends.**
Record the owner, PR/branch, provider/session, wake or monitor receipt, and repair-attempt count in
one PR comment. Reuse that comment on transfer; disable the old wake before the new owner writes.
An armed notification is not a fixer: prove that its wake can resume a coding session with the
repository, failed-log access and push/check/queue capabilities. Environment variables, tool
presence, or a successful scheduling call do not prove this.

- **Claude app tools**: bind the PR (`bind_pr` when needed), then `set_monitor` with `auto_fix` and
  `address_comments` true. In Claude Code Cloud, use its available PR subscription/Auto-fix tools.
  Auto-fix does not wake when advancing main creates a conflict. Arm a bounded scheduled wake to
  the **same owner**, using the cloud scheduler actually exposed (for example `send_later`), to
  inspect mergeability and queue progress even when no webhook arrives. Record the next wake.
- **Codex chat**: use `automation_update` if exposed, with a thread heartbeat targeting the owning
  chat (`CODEX_THREAD_ID`), at the cadence its schema supports. Other hosted scheduling tools are
  usable only after a real wake proves they resume this cloud coding session and its workspace.
  A ChatGPT reminder or a local Codex CLI process is not evidence of a cloud repair owner.
- **Wave/plan row**: the coordinator is the owner, and acknowledges the PR before the row ends.
  It needs a working cloud wake and reads GitHub directly when cloud landings have no local jobs.
- **No proven durable wake**: the current cloud session remains the owner through merge and
  post-landing results. Do not end at “queued” or claim that anything watches after the session
  ends. A restart or unavailable scheduler is an explicit qualification gap, never a silent handoff.

The wake prompt names the PR, branch, worktree (or reconstruction from origin), and this procedure.
It reads current head/checks, failed job logs, mergeability, auto-merge and queue entry, plus the
merge SHA's CI and post-land runs. Red checks or conflicts follow the repair paragraph and section
4, at most three attempts per failure; record each attempt and its SHA. Keep the same assertions
and gates. Stay quiet while unchanged. Stop/pause the wake after closed, or after merged **and**
post-landing results are recorded; report a post-land failure rather than calling the PR green.
A second monitor may wake the same owner, but must never launch a competing fixer.

**Then leave the next session its prompt**, because the chat is archived when the pull request
closes: one comment on the pull request (`gh pr comment <n>`), repeated at the end of your final
message. It says what is not done, each with its issue; for a visible change, which preview page to
open; and last, the line `Nothing left.` or one code block a fresh session can be given alone (the
goal, where things stand, the issue and pull request links, what to do first, and one closing line:
the suggested model and effort, and whether it can run beside the live sessions, with why, from
`node scripts/worktree-activity.mjs`). Plain and short: no chat language, nothing from
`docs/private/`, no secrets.

**On a CI failure, repair it yourself, within the pull request's scope.** Read the failed job's
whole log (`gh run view <run> --log-failed`; the failing step's summary is often not where the
error is), reproduce it with the failing check or specs (never the whole suite), fix the cause,
`/check`, and queue again. At most three repair attempts per failure; then stop and report what
failed, what was tried and why it did not hold. Never disable a check, skip or weaken a test, raise
a limit, or re-record a baseline only to make a run green: a re-record is for a change of look or
finding that was meant. A spec this branch does not touch that fails, then passes when the failed
jobs re-run on the same commit (`gh run rerun <run> --failed`), is a flake: quarantine it
(`node scripts/e2e-quarantine.mjs enter <spec> --run <url> --queue`). Ask the owner only when the
fix needs a product decision or a change well outside the pull request's scope.

## 4. When a landing is refused, reconcile and queue again

- **A red check on the pull request:** fix it on the branch, run `/check`, queue again.
- **A conflict with `main`:** in the branch's own worktree, `git merge origin/main`. Regenerate
  every generated file with its generator rather than trusting the merged text (for example
  `npm run contracts:compile`). Resolve mechanical conflicts yourself; hand a conflict about
  meaning to a fresh agent session with both sides' intent. Then `/check` with targeted checks and
  queue again: the pull request's CI and the merge group both test the merge with `main`.
- A landing that reached no verdict (killed at its cap, the runner gone, CI with no result) is
  retried once automatically; a verdict the queue reached is never retried behind anyone's back.
- `npm run jobs` shows each branch's state (`QUEUED`, `LANDED`, `LANDING FAILED` with the refusal).

## From Codex Cloud or Claude Code Cloud

Use the existing prepared environment and subscription. Keep the procedure above; select each
operation by evidence, not the provider name. No laptop daemon is needed.

1. Probe a repository/PR read, exact git fetch/push, Actions run/jobs read, a **whole failed job
   log**, dispatch/rerun, commit-status write and session-owned auto-merge separately as needed.
   Use `gh` where it actually works and provider GitHub tools where an operation is rejected.
   Never print credentials or signed log-download URLs. A redirected CLI log can fail while a
   provider log tool succeeds; that does not mean GitHub itself is unavailable. Record errors
   without secrets. Current references: [Codex Cloud](https://developers.openai.com/codex/cloud/),
   [Claude cloud](https://code.claude.com/docs/en/claude-code-on-the-web), and
   [GitHub queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
2. Fetch and reconcile current `origin/main` (section 2/4), regenerate compiled files, then run
   `/check` and `npm run stamp` on the resulting tip. Push only task files and open/reuse its PR
   with `scripts/pr-description.mjs`. Retain the full reviewed SHA. Disposable failure probes
   stay draft with no `land` label, auto-merge or queue entry.
3. If status writes work, post `noacg/reviewed` on that SHA from the actual passing check and add
   `land`. Otherwise dispatch `.github/workflows/cloud-queue-merge.yml` **on main** with `branch`,
   `sha` and the actual review verdict. With gh: `gh workflow run cloud-queue-merge.yml --ref main
   -f branch=<branch> -f sha=<sha> -f review="<verdict>"`. Observe the dispatched run and its jobs;
   a dispatch acknowledgement is not a verdict. Main's helper refuses a moved tip and recovers
   the PR's own stale `Reviewed`; a denied read or timeout requires the repair owner's action.
4. Inspect the PR's own CI run on the reviewed head. After a late stamp, re-run its failed or
   cancelled `Reviewed` once that run finishes (the existing `reviveReviewed` helper does this).
   A separate green dispatch does not clear a red job in that PR run. No PR run: check conflicts
   and held-run approval first; dispatch `ci.yml` with `require_review=true` only on confirmed
   absence. Never treat an API error as absence or a green stamp workflow as finished CI.
5. Turn auto-merge on with the session's working GitHub tool (`gh pr merge <n> --auto
   --match-head-commit <sha>` when supported); never bypass the queue. The workflow-token path
   previously stranded auto-merge (#393). Confirm a real `mergeQueueEntry` or
   `added_to_merge_queue` timeline event. If green but absent, inspect required checks and
   mergeability, then toggle session-owned auto-merge off/on once. Still absent: record a failed
   landing for the repair owner, not success. A moved head needs a fresh `/check` and stamp.
6. Before ending, satisfy the repair-owner paragraph and leave the next-session prompt. Record
   `merged`, the actual merge SHA and the results of that SHA's CI, post-land, configured-suite
   and deployment verification when applicable. Pending or failed is explicit, not “landed green”.

## Landing someone else's branch

Allowed only for a branch no live session holds (`node scripts/worktree-activity.mjs` and its last
commit say whether one does). The orchestrator uses this to finish landings whose sessions ended.
A branch whose worktree is gone still lands; the queue works from the pushed branch.
