# queue-merge - say this work is finished, and let the queue land it

Shared canonical procedure - `/queue-merge` in Claude Code, `$queue-merge` in Codex.

**This is the normal way work reaches `main`.** Run it when the work here is done. It does not
merge anything itself: it puts this branch in the machine-wide landing queue, which lands it when
its turn comes, one branch at a time, gated on CI.

Optional argument: another branch name. Read "Landing someone else's branch" before using it.

## Why this exists rather than running safe-merge

Landing is serialized, not permissioned (root `AGENTS.md`, "Git"). But serialization alone left a
real problem: **the queue knew a branch was landable long before its author knew it was finished.**
A branch can be green, clean and `clear` while the session that owns it is still mid-conversation
about what to do next - and nothing in a verdict can tell the difference.

So the authority to land sits where the knowledge is. Queueing IS the declaration that the work is
done, made by the only party who can make it. Nobody else queues your branch; you queue it when you
mean it, and then it lands without you waiting for anything.

That also removes the last reason to sit through a merge. `safe-merge` run by hand is outside the
queue, races the other sessions, and costs a full re-verification every time it loses - five
branches landing in a hundred minutes against a ten-minute gate meant a near coin-flip each time.

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

The landing preflight runs the same check and REFUSES a branch that a receipt names in `branch:` and
that the branch does not touch. It never guesses from a branch name, so a receipt nobody marked
`active` is invisible to it - which is the argument for marking one `active` when you pick it up.

## 2. Look before you queue

    node scripts/auto-merge.mjs --branch <branch> --dry-run

It runs the whole assessment - merge-order verdict, both worktrees clean, the merge preview - and
stops before the first state change. Two minutes here saves a refusal later.

**If it refuses, read which kind it is.** The queue lands only what it can settle mechanically:

- **`clear`** - queue it.
- **`caution`** - queue it. The queue lands a plain caution in queue order and the later branch
  integrates `main` (owner ruling 2026-09-05: a merge question never reaches him).
- **`hold`** - the risk is large (five or more files, or a stacked branch) and THIS session settles
  it, never a person: integrate `main` here, resolve with a consult, re-run the build, then queue;
  or, once you have read the reasons, `--accept <kind>` records that per KIND - it never waves
  through a different risk in the same verdict. `docs/JOB_RUNNER_PLAN.md` and the note beside
  `SILENT_MERGE_FILES` in `scripts/merge-order.mjs` explain how to test whether a collision is real.
- **a conflict integrating `main`** - resolve it here, commit, then queue.

## 3. Queue it

    npm run queue:merge

With no branch it queues THIS worktree's. **It reads the `/check` stamp**: the tip being queued
must be the sha `/check` reviewed, or `add-merge` refuses. Landing without a review is possible
and visible, never silent: `npm run queue:merge -- --unreviewed "<reason>"` puts the reason on the
job record. Then:

    npm run jobs        # position, what is running, why anything waits

**The job pushes for you - do not push by hand.** The pin is `git rev-parse <branch>`, the LOCAL
ref (`jobs.mjs` `branchTip`), so a commit that has never left this machine is covered; and the job
pushes the branch itself before it waits on CI (`auto-merge.mjs`, just above the `awaitCi` call).
The rhythm is **commit everything, then queue** - not commit, push, queue. Two sessions reached
for the hand push by habit on 2026-08-26 and neither needed it.

The one exception is a PRE-CHECK of your own work before handing it to the queue. That is worth
having - it is how one branch found a spec that passed locally and failed on CI's fonts - but it
must be a FULL DISPATCH (`gh workflow run ci.yml --ref <branch>`), never a bare push: an ordinary
push plans from the PREVIOUS push, and preflight phase 3 refuses a run that skipped every shard as
loudly as it refuses a red one. A bare markdown-only push is therefore a refusal, not a delay.
And the pre-check is only ever the run the GATE consumes when main has not moved by your turn - if
it has, phase 2 makes a merge commit and the gate waits on a fresh run for that sha regardless.

**THE GATE NO LONGER WAITS ON A WEBHOOK - it hands itself a run.** When `main` has moved, the sha
being verified is a merge commit the job has just minted, so its CI run arrives by GitHub's PUSH
WEBHOOK - and delivery is not bounded: on 2026-08-26 three webhooks arrived 28-35 minutes late,
each spending the gate's whole wait budget hoping and then refusing in words that read like a tree
fault. So `waitForCi` (`auto-merge.mjs`) now gives the webhook ~30 seconds and then dispatches the
run itself (`gh workflow run ci.yml --ref <branch>` - created by the API immediately, no webhook
in the path, and `--ref` targets the branch tip, which after the job's own push IS the verified
sha). It also reads runs properly: ci.yml runs only (never a deploy-verify run), ties between a
push run and a dispatch broken on `databaseId` (`selectCiRun`, `safe-merge-preflight.mjs`), a
cancelled shell never mistaken for a verdict, and the listing - not `gh run watch`'s exit, which
returns immediately on a run still `pending` with zero jobs (j-0088) - decides when the wait ends.

**One caveat: a RUNNING runner keeps the code it started with.** A landing draining through a
runner that started before this behaviour landed still waits passively; the manual move is the
same as the automatic one - while the gate waits, run `gh workflow run ci.yml --ref <branch>`
yourself (watch `node scripts/jobs.mjs log <job>` for the push line first, so the tip is the
verified sha). The next `add` after the old runner exits starts a fresh one with the new code.

The residual race remains: the push's own webhook can arrive mid-watch and cancel the dispatched
run (the ci.yml concurrency group is the REF, not the sha). The gate keeps waiting through the
cancelled shell and follows the replacement; if nothing conclusive ever arrives it refuses,
loudly, exactly as before - re-queue, and by then a run for that sha is on disk.

Nothing else to do. Merge jobs never run beside each other, so queued landings drain strictly one
at a time in order. If `main` moves under yours mid-gate it re-integrates and re-verifies by
itself, up to three times.

**A migration on your branch applies itself.** Once the branch is on `origin/main` the job runs
`npm run db:push`, so you never have to remember a production push. It refuses anything that can
remove something - a DROP, a REVOKE on an object the migration did not create - and reports instead;
that refusal does not fail the landing. If it happens, add an `owner-action` file under
`docs/acceptance/owner-queue/` carrying the `npm run db:push -- --allow <version>` command,
because from there it is the owner's call.

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

**A branch whose worktree is gone lands anyway.** A closed session leaves its branch with nowhere
to integrate main and run the gate, and that used to be a refusal - so finished work sat unlandable
and the outstanding listing called it "not queued". The job now makes ONE temporary worktree at
`.claude/worktrees/auto-merge-tmp-<branch>`, lands there, and removes that same path again - never
another, never with `--force`. It still refuses if that path already exists, because something left
it behind and its contents are not this job's to assume.

## When a landing gives up

`npm run jobs` prints, for every branch ahead of main, either `QUEUED <id>`, `not queued`, or a
loud row saying the landing FAILED or was WITHDRAWN - with the reason it stopped (killed at its
cap, process vanished, still blocked, a refusal and its exit code) and the exact command that puts
it back:

    node scripts/jobs.mjs requeue <branch>

"Not queued" never describes a branch that was queued. Re-queue after reading the log
(`node scripts/jobs.mjs log <id>`) - a landing that refused usually refused for a reason that is
still true.

**`requeue` re-runs a declaration; `add-merge` makes one.** That is the whole difference, and it is
why any session may run the first without a permission prompt while the second stays behind one
(`docs/AGENT_WORKFLOWS.md`, "Permissions"). `requeue` takes a branch name and refuses every flag, it
refuses a branch with no landing to re-run, it copies the dead job's own command so a `--accept` a
person once weighed carries forward and none can be added, and it re-pins only over commits that
are provably the previous landing's own integration of `main` - so a commit that arrived after the
work was declared finished refuses and is sent back to `add-merge`, which only that branch's own
session may run.

**A landing blocked by an unqueued branch is HELD, not failed.** Its row in the waiting list reads
`held for <branch> to land or be queued`, and it releases itself the moment that blocker lands or is
queued for landing - there is nothing to re-queue by hand. A hold nothing answers within twelve
hours is written off with the reason on it, which is the point at which it is genuinely a person's
call: only that blocker's own session can declare it finished.

**A landing nobody JUDGED is put back automatically, once, and you do not have to be there.** The
runner sweeps for those on every poll (`node scripts/jobs.mjs adopt` asks for it now), and the row
then reads `QUEUED <id> (automatic retry of <id>, which reached no verdict)`. Only three outcomes
qualify, and all three are the machine failing to answer rather than anything about the branch: the
job was killed at its cap, its process vanished with the runner or the laptop, or the CI wait ended
with no verdict (exit 5 - a run still going, only cancelled shells, no run at all, or a run whose
jobs were killed by their own `timeout-minutes`). **Anything CI or the preflight actually decided is
never retried** - a red gate, a conflict, a dirty tree, a red main. Retrying a verdict is how a
queue lands work that was refused.

This is not another session queueing your branch. The declaration was made when the branch was
first queued and nothing about it has changed; the retry re-runs that declaration rather than making
a second one, and it re-runs the command VERBATIM, `--expect-sha` and all - so a session that woke
up and pushed gets a refusal, not a landing. The mechanism exists because on 2026-09-03 two
landings were killed at their cap with both owning sessions already finished, and since only a
branch's own session may queue it, two green branches became unlandable. Then it spread: a branch
still ahead of main with no landing queued makes `merge-order` refuse everything that collides with
it, so one dead landing stranded four more branches inside an hour.

**A branch moved by its own failed landing still satisfies its pin.** Every landing pushes an
integrated commit before it gates, so one killed mid-gate leaves the tip one merge past the sha it
was queued at. The pin allows exactly that shape - a merge whose other side is already in main -
and nothing else, so real session work still refuses.

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
