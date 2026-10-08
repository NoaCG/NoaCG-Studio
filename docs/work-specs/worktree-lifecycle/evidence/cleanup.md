# AC-1, AC-2: finished worktrees go by themselves, and nothing else does

Recorded 2026-10-08 on the owner's Windows machine, branch `claude/l-worktree-self-cleanup`.

## AC-1 end to end, through the real entry points

`sim-unattended-cli.mjs` (session scratchpad): a scratch repository with a local bare origin and
this branch's `scripts/` committed into its primary. A worktree `.claude/worktrees/landed-chat` on
`claude/landed-chat` (no upstream, as the harness makes them) is committed, landed the way the
queue lands it (origin/main moved, local main left behind), named in the landing ledger, and its
git activity dated two days back with no transcript - a chat that landed and was left alone. Then
`triggerUnattendedSweep` - what the SessionStart hook and land-watch call - spawned the primary
checkout's `cleanup-worktrees.mjs --unattended` detached; a second trigger a moment later answered
"a sweep started 0 minute(s) ago" and started nothing. Its `last.json` (run of 08:31 UTC on the
final code):

    ran=true removed=[".../.claude/worktrees/landed-chat"] deletedBranches=["claude/landed-chat"]
    needsPerson=[] errors=[]

Afterwards: the folder gone, the worktree deregistered, the branch deleted with `git branch -d`,
local main fast-forwarded to origin/main. Nobody ran a command beyond the trigger. The remote
branch half is GitHub's `delete_branch_on_merge`, which the owner turned on; the port half is the
existing `pruneStalePorts` after a removal (pinned by the release assertion in
`scripts/worktree-unattended.test.mjs`).

## Rules, pinned by `scripts/worktree-unattended.test.mjs`

Real repositories, origin/main moved the way the merge queue moves it, the local main lagging:

- a landed desktop-chat worktree quiet 3 hours stays; quiet 25 hours goes - worktree, branch
  (`git branch -d`, judged against origin/main) and port;
- a landed `agent-*` worktree goes after 2 quiet hours, not after 1;
- a worktree with no commits of its own goes after 3 quiet days, not after 2;
- a worktree made a minute ago, with no transcript at all, stays (its HEAD moved too recently);
- unlanded commits, a worktree outside `.claude/worktrees/` and a checkout with a queued job are
  never touched, each with its reason;
- a worktree a process is sitting in (a child `node` process with its cwd inside) is left exactly
  as it is - files, registration and branch - reported as "in use" and not as an error, and goes
  on the next run once the process has exited;
- a landed worktree with uncommitted changes is never touched and is written to `last.json` under
  `needsPerson`;
- two sweeps never run at once; the trigger throttles itself to one start per half hour, stamps
  the start before spawning, runs the primary checkout's copy of the script, honours
  `NOACG_NO_AUTO_CLEANUP`, and does not start off Windows.

The existing rules keep their own tests (`scripts/worktree-safety.test.mjs`, 57 cases: containment,
freshness, ignored-file classes and archive-before-delete, locks, live sessions, infrastructure,
leases): all pass on this branch.
