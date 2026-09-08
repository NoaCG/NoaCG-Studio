# queue-merge - say this work is finished, and let the queue land it

Shared canonical procedure - `/queue-merge` in Claude Code, `$queue-merge` in Codex.

**This is the normal way work reaches `main`.** Run it when the work here is done. It does not
merge anything itself: it puts this branch in the machine-wide landing queue, which lands it when
its turn comes, one branch at a time, gated on CI.

Optional argument: another branch name. Read "Landing someone else's branch" before using it.

## Why queueing is a declaration

Landing is serialized, not permissioned (root `AGENTS.md`, "Git"). But serialization alone left a
real problem: **the queue knew a branch was landable long before its author knew it was finished.**
A branch can be green and clean while the session that owns it is still mid-conversation about
what to do next - and nothing in a verdict can tell the difference.

So the authority to land sits where the knowledge is. Queueing IS the declaration that the work is
done, made by the only party who can make it. Nobody else queues your branch; you queue it when you
mean it, and then it lands without you waiting for anything.

Nobody merges by hand any more, either. Until 2026-09-06 a manual landing procedure existed for
when the laptop queue could not do the job; the ruleset now refuses every push to `main` that is
not the merge queue's, so that door is gone and `contracts/retired.json` says so.

## 1. Be finished

Queueing pins the branch at its CURRENT commit. If you commit again afterwards the job refuses and
asks you to queue again, because the thing that was queued is not the thing that is there. That is
deliberate: it is what makes "I queued it" mean "it was done".

So before queueing - and know that **queueing FREEZES the branch**: until the landing job is terminal,
every edit and every commit in its worktree is refused by the hooks (`scripts/hooks/frozen-branch.mjs`),
because each one turns the queued job into a refusal. The next change goes on a new branch in a new
worktree, or you withdraw the job first with `node scripts/jobs.mjs cancel <id>`. So:

- **your relay is read** - `node scripts/relay.mjs read --branch <branch>` - and you have acted on
  anything it held. A report that reached the ORCHESTRATOR instead of you (a review leg, a delegated
  diff read) waits there, because a launched session never gets its own subagents' notifications
  (`orchestrator/launch.md`). Queueing pins the branch as finished, so `add-merge` refuses a branch
  whose relay is unread - on 2026-09-04 row K queued a proposal without its own reviews, which had
  found its numbers doubled, and row J landed without its Codex guard-gap review;
- everything committed, `git status --porcelain` empty;
- `npm run build` green on what you are about to queue;
- anything observable in the product has its own file under `docs/acceptance/owner-queue/`
  (one file per item - a shared list makes parallel sessions conflict, and a conflict stops the
  landing job dead);
- **the owner receipt this work serves says so** - see below.

### Which receipt does this branch serve?

Answer it here, because this is the last moment anyone can. A receipt is an owner-raised item on
`docs/backlog/` and it closes by having its FILE DELETED in the change that lands the work
(`docs/backlog/README.md`). Nobody downstream knows which one you served: by the time a planner
counts the shelf, this session has ended. On 2026-09-05 six receipts still read as undone with their
work already on `main` - among them `scoreboard-behaviour`, landed two days earlier with an
owner-queue walk filed for it - and every wave plan in between spent judgement re-deriving it.

    node scripts/owner-receipts.mjs --serves <branch>

- **The ask is served** - `git rm docs/backlog/<slug>.md` in this branch. That is how a receipt
  closes, and `--closed` reads it back out of git afterwards, so nothing is lost.
- **Part of it landed and the ask still stands** - set `state: advanced` with a `note:` saying what
  landed (name the commit) and what is still missing.
- **You started it and it is not finished** - keep it `active` with your `branch:` and update its
  `note:` to say what this landing added, so the next session reads it rather than the diff.
- **This branch serves none** - nothing to do; the command says so and passes.

Nothing downstream runs this check again. The laptop lander used to refuse a branch that a receipt
named in `branch:` and that the branch did not touch; the merge queue reads no receipts, so this
command, run here, is the whole mechanism - which is the argument for marking a receipt `active`
when you pick it up, and for answering it before you queue rather than after.

## 2. Look before you queue

    git fetch origin && git merge-tree --write-tree origin/main <branch>

A conflict with `main` is the one refusal you can see from here, and the queue only tells you after
a CI run: a pull request that cannot merge sits outside the queue until its session resolves it.
If the merge-tree reports conflicted paths, integrate `main` here, resolve with a consult, re-run
the build, then queue. `node scripts/merge-order.mjs --branch <branch>` says which OTHER unqueued
branches this one collides with - advisory, because order is the queue's: whichever lands second
integrates `main` (owner ruling 2026-09-05: a merge question never reaches him).

**A branch cut from another branch does not queue.** `merge-order.mjs --branch <branch>` reports
when this branch CONTAINS another branch that has not landed, and exits 3. Queueing it would land
that other session's commits without its declaration, and the queue cannot tell: the pull request
is opened against `main` and carries both. Rebase onto `origin/main` first, or wait for that branch
to land, then queue.

## 3. Queue it

    npm run queue:merge

With no branch it queues THIS worktree's. **It reads the `/check` stamp**: the tip being queued
must be the sha `/check` reviewed, or `add-merge` refuses. Landing without a review is possible
and visible, never silent: `npm run queue:merge -- --unreviewed "<reason>"` posts the reason where
the lander and anyone reading the pull request see it.

**The pull request is written for a person.** Its title is the branch's FIRST commit subject and
its description lists every commit subject, the review verdict and one line saying CI runs the
build and the affected tests before merging - all of it read off the branch, so nothing has to be
typed. The one thing commits cannot supply is the reason the change exists, so add it if it is not
obvious: `npm run queue:merge -- --why "the old field could not hold two scores"`. Queueing again
after a refusal refreshes a description the queue wrote and never one a person typed
(`scripts/pr-description.mjs`).

**The queue is GitHub's merge queue** (`docs/WORKFLOW_ARCHITECTURE.md` §5.2). Queueing pushes the
branch, opens or reuses its pull request against `main`, posts the review verdict as the
`noacg/reviewed` commit status on the tip, adds the `land` label and turns auto-merge on. Once the
two required checks pass on the pull request - `CI gate` and `Reviewed`, both jobs of `ci.yml` -
GitHub adds it to the queue, builds a temporary merge of the queued pull requests on `main`, runs
`ci.yml` on that (`merge_group`), and merges the group in order. Nobody pushes `main`, not even a
workflow: the ruleset (`scripts/landing-ruleset.mjs`) requires the queue. Watch it with:

    gh pr view <number>
    gh run list --workflow ci.yml --limit 5

**Your branch lands as ONE merge commit, and that is settled** (2026-09-09). The queue is pinned to
`MERGE` rather than squash because five scripts decide "this work is on main" by asking git whether
the branch's commits are reachable from `origin/main`: `cleanup-worktrees.mjs` reclaims a worktree
on it, `jobs.mjs` calls a branch unqueued while it is false, and `merge-order.mjs` both ranks by it
and holds a branch that contains another until that one lands. A squashed branch never satisfies
it, so under squash every landed branch would stay "ahead of main" forever - worktrees never
reclaimed, `npm run jobs` filling with finished work, and a stacked child held by a parent that
already landed. It is not about preserving what CI saw: the queue re-runs `ci.yml` on the merge
group, so the gate judges a tree, and squash and merge land the same tree. Two things a session
notices: your fixup commits stay in the history, though `git log --first-parent` still shows one
line per landing, and a revert of your landing is `git revert -m 1 <sha>`, which
`scripts/revert-landing.mjs` already writes for you. The argument and the measurements are in
`scripts/landing-ruleset.mjs`; `npm run land:ruleset` says whether GitHub still agrees with it.

**A refusal shows on the pull request**: a check that failed on the pull request keeps it out
of the queue, and a group whose `CI gate` failed is dropped from the queue with auto-merge turned
off. The local watcher job names the failed check. Fix it, run `/check`, and queue again. A
conflict with `main` shows as a pull request that cannot merge; resolve it here, commit, queue
again. Nothing is retried behind anyone's back, and the laptop holds nothing: a closed lid stops
no landing.

The rhythm is **commit everything, then queue** - `queue:merge` does the push. A pre-check of your
own work before queueing is still worth having (a spec that passes locally and fails on CI's
fonts is found that way); since branch runs plan from the fork point, a plain push is an honest
pre-check now, and `gh workflow run ci.yml --ref <branch>` asks for the full suite.

**A migration on your branch applies itself.** Every landing is a push to `main`, and
`.github/workflows/post-land.yml` runs `db-push` for production and staging from the `production`
environment's `SUPABASE_ACCESS_TOKEN`; without that secret it says so and the landing stands, and
the push is made by hand as before (`supabase/AGENTS.md`). `db-push` refuses anything that can remove
something and reports instead; that refusal never fails a landing. If it happens, add an
`owner-action` file under `docs/acceptance/owner-queue/` carrying the
`npm run db:push -- --allow <version>` command, because from there it is the owner's call.

## 4. When it lands

The worktree whose branch landed is told at its next start-up: merged, pushed, nothing left to
merge. `npm run jobs` lists recent landings with the session each belongs to.

**Then run the handoff workflow** if the work is finished, so the owner knows which sessions are
done and which still want a look. That is the whole point of announcing the landing: without it,
"landed" and "still working" look identical from outside.

## Landing someone else's branch

Naming a branch that is not this worktree's is allowed, and should be rare. **Check that its
session is not live first** - `node scripts/worktree-activity.mjs`, and look at how recent its last
commit is. A branch whose session closed (nobody will ever queue it) is the case this exists for; a
branch someone is actively committing to is not yours to finish.

If in doubt, ask that session to queue its own. It costs a message and removes the whole question.

**A branch whose worktree is gone lands anyway.** The lander works on GitHub's runner from the
pushed branch; no local worktree is part of the path.

## When a landing gives up

The local merge job (`scripts/land-watch.mjs`) only WATCHES the pull request, so `npm run jobs`
prints, for every branch ahead of main, either `QUEUED <id>`, `not queued`, or a loud row saying
the landing FAILED - with the queue's refusal, copied from the pull request. **The refusal is on
the pull request** (`gh pr view <number>`), and it is one of four kinds: a check red on the pull
request (`CI gate` or `Reviewed`), a drop from the merge group (`CI gate` red on the temporary
merge), a conflict with what landed, or no `noacg/reviewed` on a tip that moved after it was
queued. A watcher reaching no verdict inside its cap is not a refusal; the store retries it once.
Fix it, run `/check`, and queue again:

    npm run queue:merge

`node scripts/jobs.mjs requeue <branch>` only puts the watcher back; it lands nothing by itself.
"Not queued" never describes a branch that was queued.

**`requeue` re-arms a watcher; `add-merge` makes a declaration.** That is the whole difference, and
it is why any session may run the first without a permission prompt while the second stays behind
one (`docs/AGENT_WORKFLOWS.md`, "Permissions"). `requeue` takes a branch name and refuses every
flag, it refuses a branch with no landing to re-run, and it re-arms the watcher on the pull request
as it stands. A tip that moved after the declaration is refused by the pull request itself:
`noacg/reviewed` was posted on the declared sha, so the new tip fails `Reviewed` until its own
session runs `/check` and queues again through `add-merge`, which only that session may run.

**Nothing is held for another branch.** The queue has no order to protect: pull requests land in
the order they were queued, and the one that conflicts with what landed is marked conflicting and
bounced to its own session, which resolves `main` in and queues again.

**A landing nobody JUDGED is put back automatically, once, and you do not have to be there.** The
runner sweeps for those on every poll (`node scripts/jobs.mjs adopt` asks for it now), and the row
then reads `QUEUED <id> (automatic retry of <id>, which reached no verdict)`. Only three outcomes
qualify, and all three are the machine failing to answer rather than anything about the branch: the
job was killed at its cap, its process vanished with the runner or the laptop, or the CI wait ended
with no verdict (exit 5 - a run still going, only cancelled shells, no run at all, or a run whose
jobs were killed by their own `timeout-minutes`). **Anything the queue actually decided is never
retried** - a red check, a conflict with `main`. Retrying a verdict is how a queue lands work that
was refused.

This is not another session queueing your branch. The declaration was made when the branch was
first queued and nothing about it has changed; the retry re-runs that declaration rather than making
a second one, and it re-runs the command VERBATIM, `--expect-sha` and all - so a session that woke
up and pushed gets a refusal, not a landing. The mechanism exists because on 2026-09-03 two
landings were killed at their cap with both owning sessions already finished, and since only a
branch's own session may queue it, two green branches became unlandable. Then it spread: a branch
still ahead of main with no landing queued used to make `merge-order` refuse everything that
collided with it, so one dead landing stranded four more branches inside an hour.

A landing that SUCCEEDED normally makes its branch vanish from this listing, which only shows what
is ahead of main. So `LANDED <id>, and this branch is ahead of main AGAIN` means exactly what it
says: that landing worked, and commits arrived afterwards that nobody has queued. Queue the new
work. Until 2026-09-01 a successful landing read as a refusal instead
(`LANDING FAILED <id> (done) - auto-merge refused it (exit 0)`), and the watch tick announced
`LANDING GAVE UP` for branches it had just reported as `LANDED` - never trust a row that gives an
exit code of 0 as its reason for failure.

**Do not sit and watch it.** A landing takes as long as CI takes, and a foreground poll loop over
the queue is refused by the guard hook: the shell tool dies at 600 s, so a long wait is a session
holding an answer nobody reads. If you need the verdict now, `node scripts/jobs.mjs wait <id>` is
bounded at 30 minutes and then tells you to hand off. Otherwise queue and hand off - the next
session start reports what landed.
