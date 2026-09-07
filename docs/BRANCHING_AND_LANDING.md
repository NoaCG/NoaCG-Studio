# Branching and landing - the full contract

The root `AGENTS.md` carries the rules that have to fire while you work. This doc carries the
same rules in full, with the incidents that produced each one, so a session can check its
reasoning without every other session paying for the words. Nothing here is optional reading
when a landing behaves in a way the short form did not predict.

The procedures themselves live in `.agent-workflows/queue-merge.md`,
`.agent-workflows/safe-merge.md` and `.agent-workflows/cleanup-worktrees.md`; the migration
contract is `supabase/AGENTS.md`.

## Where you stand: a worktree per session

- Most work happens on a **feature branch**, usually in a worktree - several are typically active
  at once, so `node scripts/worktree-activity.mjs` prints what is in flight elsewhere before you
  start something that collides: every OTHER worktree's uncommitted and not-yet-merged files,
  then every branch ahead of `main` that no worktree has checked out - a closed session's work
  still collides even though nobody is in it. If a session starts on `main`
  with work to do, branch first - **in a worktree, never in the checkout that holds `main`** (next
  bullet). The rhythm: **commit each completed, verified phase/step** to the
  FEATURE BRANCH with a descriptive message. **Never add a `Co-Authored-By` trailer or any agent
  co-author.** Don't commit `dist/` in feature work.
- **The checkout that holds `main` is shared infrastructure - never occupy it with a feature
  branch.** `scripts/auto-merge.mjs` finds it with `worktreeFor('main')` and integrates, gates and
  lands every queued branch there, so a feature branch sitting in it breaks the queue in both
  directions. Both halves were paid for on 2026-08-28: a session that branched in it blocked
  another session's landing outright, and when the runner took the checkout back mid-build, that
  session's `npm run build` silently gated `main` instead of its own branch **and still reported
  green** - only the build's branch stamp (`[write-version] dist/version.json -> <branch>@<sha>`)
  said so. **A green gate on the wrong tree is worse than a red one**, which is why this is a rule
  about where you stand rather than tidiness. **The hazard is not occupancy, it is MUTATION**: the
  queue checks out, merges, builds and resets that tree during every integration, so a read taken
  there mid-integration can be wrong with nothing saying so. Hence a worktree per session, and one
  for the orchestrator too - DETACHED at `origin/main`, since git will not let a second worktree
  hold `main`. Make the worktree first, then work in it:
  `git worktree add -b <branch> .claude/worktrees/<name> main`. The one thing the main checkout is
  for is being on `main`.

## Landing is serialized, not permissioned

- **Landing is SERIALIZED, not permissioned.** Merging never waits on the user; it waits on the
  other branches. Two rules, both machine-checked, both in `/safe-merge` (Claude Code) or
  `$safe-merge` (Codex) - use the flow rather than raw git, because that is where they live:
  - **Order.** `node scripts/merge-order.mjs` ranks every branch ahead of `main` by what landing
    it FIRST costs the other worktrees, measuring real conflicts with `git merge-tree` (read-only
    - no working tree, no ref) and naming the collisions git merges cleanly and still gets wrong:
    a rename over another branch's edits, two branches minting the same migration number, a
    stacked branch jumping its ancestor. A **`clear`** verdict may land. **`caution` and `hold`
    stop and ask** - those are the cases that historically went wrong.
  - **One at a time.** Never merge while another merge is in flight. The flow re-fetches and
    re-checks that `main` has not moved since the branch integrated it, and the final merge is
    `--ff-only`, so git itself refuses if anything landed meanwhile. The gate must be green on the
    INTEGRATED sha, never the pre-integration one. Once the job runner exists
    (`docs/JOB_RUNNER_PLAN.md`), merge jobs are serialized by it and this becomes structural
    rather than remembered.
  - **`/queue-merge` is how work reaches `main`** (owner, 2026-08-25). Run it in the session that
    owns the branch, when that work is FINISHED - it does not merge anything itself, it puts the
    branch in the machine-wide queue, which lands it when its turn comes. **Nobody else queues your
    branch**, because a branch can be green, clean and `clear` while its session is still mid-
    conversation about what to do next, and no verdict can tell those apart. Queueing IS the
    declaration that the work is done, made by the only party who can make it. It pins the branch's
    current commit, so a later commit makes the job refuse and ask you to queue again.
    `.agent-workflows/queue-merge.md` is the procedure.
  - **The queue is GitHub's merge queue, not anything on a laptop** (2026-09-06,
    `docs/WORKFLOW_ARCHITECTURE.md` §5.2). `npm run queue:merge` pushes the branch, opens or
    reuses its pull request, posts the `/check` verdict as the `noacg/reviewed` commit status on
    the tip, labels it `land` and turns auto-merge on. When `CI gate` and `Reviewed` pass on the
    pull request, GitHub queues it, builds a temporary merge of the queued pull requests on `main`,
    runs `ci.yml` on that group, and merges it in order; a group whose gate fails is dropped and
    auto-merge is turned off on the pull request, which the local watcher job reports. Until then
    the mechanical path ran as `scripts/auto-merge.mjs` on the owner's machine, one runner per
    machine, dead when the lid closed; that script remains for `--dry-run` preflights.
  - **Nothing but the queue writes `main`.** The ruleset (`npm run land:ruleset -- --apply`,
    `scripts/landing-ruleset.mjs`) requires the merge queue and the two checks, and forbids
    deleting or rewriting the branch; the repository admin is the one bypass, for emergencies,
    and every use of it shows in the ruleset's insights.
  - The local job queue (`npm run jobs`) still serializes browser work on this machine and lists
    recent landings; `scripts/landings.mjs` keeps that ledger fed from the merged pull requests.
  - **What the machinery needs from the ACCOUNT, asked all at once:** `npm run check:owner-setup`
    (`scripts/owner-preflight.mjs`). The two Actions-permission settings that let a quarantine
    entry or a revert open its pull request, the ruleset and its two required checks, the
    migration token in the `production` environment, the `land` label. It reports and changes
    nothing, names the command that fixes each miss, and calls an answer it could not read
    `unknown` rather than `missing`. Run it when a mechanical landing is refused - `queue-pr.mjs`
    names it in that error - or before assuming a settings problem is a code problem.

## Production migrations, and cleanup

- **Production migrations are a MECHANISM, not a permission** (owner, 2026-08-25), and **you should
  never have to run one**: a landing through the queue applies whatever production is missing as
  soon as the branch is on `origin/main`, so the schema a migration was written for is the schema
  the next request meets. `npm run db:push` applies every pending migration to the project
  `VITE_SUPABASE_URL` names and needs nobody, because the judgement a human was being asked for is
  made on the STATEMENTS - and it fails CLOSED, so a shape it does not recognise stops rather than
  guesses. **A REFUSAL is the only thing that still reaches you**, answered per version
  (`npm run db:push -- --allow 0052`) and filed under `docs/acceptance/owner-queue/` by the
  branch's own session; the landing itself succeeds either way. **It also refuses onto a DRIFTED
  ledger** - waiting was never the safe option: the old rule left 0051 unapplied for hours, and a
  ledger out of step stays silent until the next push and then fails partway through, so the
  refusal is what turns that into an error you can see. **Which statements pass, which stop, and
  why the classifier (`scripts/db-push.test.mjs`) is the guard rather than any prose:
  `supabase/AGENTS.md`**, which is authoritative here and loads when you work in that directory.
- **Cleanup is a MECHANISM, not a permission** (owner, 2026-08-30). A worktree and its branch may
  go once **every commit on the branch is an ancestor of a freshly fetched `origin/main`** - not a
  clean tree, not "the session is finished". `git branch -d` (never `-D`) and an unforced
  `git worktree remove` stay the backstops git itself enforces. **A worktree with NO branch is
  refused by its own rule**, never weighed against that test - it is infrastructure or an
  investigation, and "its commit is already on main" argues for deleting exactly what must not be;
  the primary checkout and anything holding `main` take that same path. **A clean `git status`
  still does not mean a worktree is disposable** - the real reason a human used to start every
  cleanup, now handled rather than remembered: ignored files are invisible to git and die with the
  folder, so each is classified. Rebuildable output goes; a secret goes **unread**, and only while
  the primary checkout still holds one; **anything unrebuildable is archived outside the repo and
  the copy verified file by file BEFORE anything is deleted**, an unprovable copy refusing with no
  override. Locked, dirty, mid-operation or with a live session: left alone. Full contract in
  `.agent-workflows/cleanup-worktrees.md`; `scripts/cleanup-worktrees.mjs` is dry-run by default.
