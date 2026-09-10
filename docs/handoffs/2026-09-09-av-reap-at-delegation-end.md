# AV - reap when the delegation ends, not when the worktree goes

**Branch:** `claude/av-reap-at-delegation-end` (3 commits, queued).
**Files:** `scripts/codex-rescue.mjs`, `scripts/codex-rescue.test.mjs`, plus one backlog file.

## The row's diagnosis was wrong, and the leak was real anyway

The row said the reaper's CALL SITE was the problem - that `reapTrees` only ran from
`scripts/cleanup-worktrees.mjs`, on the path that removes a worktree, so it fired hours after the
memory was needed. That is not what main does. Commit `8aa7b634`, which landed in PR #206 along
with the reaper itself, is titled "Close a Codex delegation's process family when the delegation
ends", and it put the call in three places: `poll` calls it the moment a job reaches a terminal
status, `cancel` calls it, and `launch` calls it before starting the next family. The call site
the row asked for already existed.

**Do not narrow it.** The row's step 3 asked for a call "narrower than `reap --all-workspaces`",
and `poll`'s reap is deliberately unscoped. That is a feature: a reap running in one workspace is
how a leak left by a session that died in another workspace gets collected at all. Narrowing it
would collect strictly less. Recorded here because the next reader of the row prompt will have the
same instinct.

So why was the memory still gone? **Nothing had written an ownership record.** Measured at 23:50
on 2026-09-09: sixteen state directories under the plugin's store, every one with a `broker.json`
and a `state.json`, and **not one `owned-tree.json` anywhere**. `delegationRecords()` returned
zero. With no record there is no candidate, and no call site can fix that.

The cause is ordinary and will recur every time this file changes: the two families still resident
belonged to worktrees `agent-a1122c442ea77070f` (`claude/ac-harness-verdict`) and
`agent-a90898c1f5b7c254e` (`claude/ae-cli-0-3-1`), both forked before PR #206 merged at 21:44 UTC.
Their checkouts' `scripts/codex-rescue.mjs` contains no `recordOwnership` at all - confirmed by
grep, zero hits in both. They launched through the wrapper (the `codex-rescue-*` scratch
directories in Temp line up to the minute with their job timestamps), and the wrapper they ran
simply did not have the recording code yet.

## What landed

**1. Unrecorded finished delegations are collected by asking their broker.** A workspace whose
broker is still listening, whose every job has reached an outcome, and which no ownership record
claims, gets `broker/shutdown` sent to the endpoint the plugin itself wrote into `broker.json`.
The broker then closes the app-server and `codex.exe` through the live handle it holds - the one
link no outside process-tree walk can follow, which is exactly why the record existed.

**This path produces no kill list and cannot grow one.** `adoptableBrokers` returns
`{ stateDir, endpoint, workspace, pid }` and there is nowhere to put a kill list; a test pins that
shape. The record still decides every kill and always will. Getting the address wrong here means a
socket refuses a connection, not that a stranger's process dies - that asymmetry is what makes it
safe without the proof a record provides.

**2. `busy` is now answered for unrecorded delegations too.** This came out of the review and is
the more dangerous half. A scoped reap answers "is anything still running here" from the ownership
record alone, so a workspace with no record exits 0 - and the caller reading that exit code is the
worktree removal, which then deletes the directory a running `codex.exe` is standing in. Same
blind spot, seen from the side that costs work rather than RAM. `unrecordedWorking` now makes such
a workspace busy, so the reap exits 3.

That half deliberately does NOT check that the broker is alive. Nothing is closed on the answer -
it only ever refuses - and demanding a second proof before refusing is another way to say "clear"
when the truth is unknown.

**3. `workspaceOfBroker` is bounded by the next flag, whichever flag that is.** It used to name
the three flags the plugin emits today and fall back to an end-of-line match that swallowed the
rest of the command line. One new plugin flag and a workspace would read as
`C:/.../worktree --new-flag value`, matching no worktree - so every scoped reap would skip that
family and call it not busy. Both answers wrong, both silent. Fixed here rather than filed because
the new code in (1) and (2) depends on it.

## Measured, not inferred

| | processes | MB |
|---|---|---|
| Two leaked families, before | 8 | 573 |
| After `reap --all-workspaces` | 0 | 0 |

Free RAM 2828 MB -> 3196 MB across that reap (working set understates it; the machine was busy).
The owner's desktop Codex app (pid 20136, `codex.exe` under `ChatGPT.exe`, with its
`codex-code-mode-host.exe` child) was untouched throughout - checked explicitly after every reap in
this session, because that is the one thing this mechanism must never close.

Then the record-driven path, to prove the edit did not break it: a fresh delegation was launched,
its ownership record appeared naming 21 processes, three delegation processes were resident
(broker + app-server + `codex.exe`, 239 MB), and `poll` seeing `completed` closed all three and
forgot the record.

Then both new halves, by construction: a second delegation was launched, **its `owned-tree.json`
was deleted by hand** to reproduce a launch from an older checkout, and

- while the job ran, the scoped reap printed the busy line and **exited 3**, closing nothing (on
  main this is exit 0 and the worktree gets deleted);
- once it completed, the scoped reap asked its broker and the whole family - 5 processes, 333 MB -
  went.

## Traps that exist in no repo file

- **`recordOwnership` is only as old as the checkout.** Every branch cut before 2026-09-09 21:44
  UTC leaks a family per delegation and always will; taking `main` in is what fixes a branch.
  Until the live worktrees have all done so, `node scripts/codex-rescue.mjs reap --all-workspaces`
  from any up-to-date checkout is what collects them. It is safe to run at any time.
- **`brokerShutdown` really does close the whole family**, which the header asserted but nothing
  had demonstrated end to end until tonight. Both leaked brokers answered "shut itself down" and
  their app-servers and `codex.exe` processes went with them, without a single `taskkill`.
- **A `broker.json` outlives its process by days.** Fourteen of the sixteen state directories name
  a broker pid that is long gone. That is why `adoptableBrokers` checks the command line and not
  just the pid.
- **The commit-message hook blocks the word "Codex".** All three commits here needed
  `ALLOW_AI_MENTION=1`, which is correct - this file IS the AI tooling - but it is not obvious
  from the error the first time.

## Check

`review: discarded+inline`. The delegated pass returned six findings but reported no branch and no
base sha, and the files its findings named (`scripts/worktree-cleanup-lib.mjs`, `cli/src/mcp.ts`)
are not on this branch, whose whole diff is two files against `d02eef82`. Discarded as a review of
this branch per the workflow and redone inline. Its one in-scope claim was verified independently
before being acted on - the probe found zero workspaces that would be stranded by the stricter
`busy`, which is what made the fix safe - and became commit `30685542`.

`simplify: inline` - the skill returned fan-out instructions rather than a result. Five cleanups
made over the four angles: one shared `jobIsOver` helper instead of the same reconcile expression
in two walkers, the workspace read in a single pass, redundant parameter guards dropped, a clearer
local name, and **the process table read once per reap and reused rather than twice** - which
matters because a reap runs in front of every launch and each read costs a PowerShell process.

`verify: inline`. `npm run build` green, 1513 ok / 0 not ok, the new cases visible in the run.
`e2e: not applicable` - no product code changed. `taste: not applicable` - nothing here can move
what a graphic looks like. CI on `30685542` was green with Build, Factory gates, E2E plan and CI
gate all run and the E2E shards correctly skipped.

No `docs/acceptance/owner-queue/` item: this is harness machinery with nothing to look at in the
product. The owner feels it as free RAM, not as a route.

## Left undone, and why

- **`scripts/worktree-cleanup-lib.mjs` treats only exit 3 as busy.** Any other reaper failure - a
  `spawnSync` timeout returning `status: null`, a throw reaching `main` and exiting 1 - reads as
  "nothing is running here" and the worktree is removed. Filed as
  `docs/backlog/worktree-removal-reads-a-failed-reap-as-an-empty-directory.md`. Not fixed here
  because the row's traps put the removal path out of bounds, and because the fix is worth
  verifying by fault injection rather than by reading.
- **`cli/src/mcp.ts` has a local `refuseStray` colliding by name with an exported one in
  `output.ts`.** Another row holds `cli/` tonight; it is a rename and nothing more.
- **`poll` creates its ownership recorder without the job id it is watching**, so a record first
  written by a poll carries `jobs: []`, and `abandonLaunch` - which refuses only when the record
  names a job - would then abandon a record belonging to a real delegation. `recorder.add` exists
  for exactly this and is called nowhere. Reported rather than fixed: it is pre-existing, it needs
  its own reasoning about which job a poll is entitled to claim, and it is not reachable through
  anything this branch changed.
- **A record whose `workspace` is null is excluded from a scoped reap AND from `busy`.** Now much
  less likely, since `unclaimedSessions` reads `workspaceRoot` off the jobs, but `recordOwnership`
  can still write null. Left alone; it belongs with the removal-path work above.

Nothing here needs the owner.
