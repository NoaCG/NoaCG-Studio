# Phase cf04: isolate configured backend stacks (#1865, #1829)

Plan run #1967 (cicd-followup), phase cf04. Builder session on branch
`claude/plan-cicd-followup-cf04-build`, from `main` at 98b62dad.

## Acceptance, verbatim

(a) Concurrent configured stacks are isolated, with safe port allocation, readiness checks and
cleanup on failure or cancellation, and the collision cause is diagnosed. (b) Concurrent execution
is verified in CI; no unrelated process is killed and startup is not merely retried. Cleanup is
shown in CI after one failed and one cancelled run, with no stack process or port left held.

## (a) The collision cause, diagnosed

**Every recorded failure is the same one.** From Actions history (configured-suite.yml, the last
100 runs, 2026-10-31 to 2026-11-03, and ci.yml's selected configured jobs in its last 300 runs,
plus the runs named in #1829, #1865 and the brief), the stack start failed seven times. Each time
`supabase start` stopped at its first container with
`failed to start docker container "supabase_db_noacg-studio": ... failed to bind host port 0.0.0.0:54322/tcp: address already in use`,
on a fresh GitHub-hosted runner with no other stack on it.

| Run | Job | Workflow | Starts | Result |
| --- | --- | --- | --- | --- |
| 41134775201 | shard 2/4 (124334491159) | configured-suite | 1 (before the retry) | 54322 in use |
| 41224338003 | shard 2/4 (124606446616) | configured-suite | 1 (before the retry) | 54322 in use |
| 41247602152 | shard 4/4 (124674250212) | configured-suite | 2 (with the retry) | 54322 in use, both |
| 41283438391 | 4/4 (124780192540) | ci.yml, PR selection | 2 | 54322 in use, both |
| 41339116445 | shard 1/4 (124945203109) | configured-suite | 2 | 54322 in use, both |
| 41455869801 | 1/4 (125312452582) | ci.yml, PR selection | 2 | 54322 in use, both |
| 41542753257 | 1/4 (125611100600) | ci.yml, PR selection | 2 | 54322 in use, both |

In configured-suite.yml that is 3 failed starts in about 400 (100 runs of four shards). The
"Docker networking" wording in #1865 is the same message's prefix; the "Data limit exceeded"
registry errors in run 41224338003 were image-pull throttling that recovered before the database
started, and are not this failure.

**The mechanism.** The CLI's ports are fixed (54320-54329), and the runner's ephemeral range is
`32768 60999` (printed by every stack start now). The kernel gives an outbound connection's source
port from that range, so a connection made shortly before the database starts, by the image pulls
`supabase start` runs itself or the cache downloads before it, can hold 54322. 54322 is always the
one named because the database is the first container started. The holder was never identified in
the old logs because nothing printed it (#1829).

**Reproduced on a runner** (endurance.yml runs 41604440485 and, on the final code, 41607584981, `drill:stack-collide`; the same result both times):

1. With nothing on 54322, Docker publishes it.
2. With the ephemeral range narrowed to 54322 for one connection, an ordinary outbound connection
   (no bind, as every pull connection is) is given source port 54322 by the kernel, and Docker then
   fails with the CI message exactly: `failed to bind host port 0.0.0.0:54322/tcp: address already in use`.
3. After that connection closes it sits in `TIME-WAIT 127.0.0.1:54322` and **still blocks Docker's
   bind**, for the 60 s TIME_WAIT lasts. This is why the bounded retry added for #1865 (stop, start
   again a few seconds later) failed in all five runs that had it.
4. With 54322 in `net.ipv4.ip_local_reserved_ports`, eight connections from a range of
   54312-54322 took 54320, 54312, 54314, 54316, 54318, 54313, 54321, 54317: the kernel never gave
   54322 out.

So the cause is the stack's fixed ports sitting in the ephemeral range, not a stale stack, a shared
resource or another job: hosted runners run one job per VM.

## (a) The fix

`scripts/configured-stack.mjs`, used by the composite action `.github/actions/configured-stack`
(ci.yml's selected configured job and configured-suite.yml's shards) and by endurance.yml:

- **Safe port allocation.** A stack claims a slot k (its claim and owner written aside, then
  renamed onto `/tmp/noacg-configured-stacks/slot-k`, which fails while another claim holds it), whose ten-port block is 54320-54329 plus 100 k. The block is
  reserved first (`ip_local_reserved_ports`, rewritten from the claims under `flock`, so two stacks
  allocating at once cannot lose each other's reservation), and only then checked: any socket on
  the block, in any state, TIME_WAIT included, means the block is given back and the next slot is
  tried, with the holder printed as a warning (`sudo ss -tanp`, the diagnosis #1829 asked for). A
  failed socket read fails the step rather than reading as free.
- **Isolation.** The stack runs from its own copy of `supabase/` with `project_id`
  `noacg-studio-s<k>` (its own container, volume and network names) and every published port moved
  into its block (api, db, shadow, studio, inbucket, analytics and its vector port, pooler). `SUPABASE_WORKDIR` is
  exported so every later `supabase` call of the job reaches it. The action's database check now
  finds the container by this stack's project label instead of the first `supabase_db*` match, and so does `scripts/endurance-election.mjs`.
- **Readiness.** After `supabase start` returns, one check: every container of the project is
  running, publishes only ports in its block (api and db among them), `supabase status` reports the
  block's API port, and the gateway answers 200 on `/rest/v1/` and `/auth/v1/health`. No polling:
  the CLI has already waited on the health checks.
- **Not retried.** The bounded retry is gone. A failed start prints the block's sockets and the
  project's containers, then fails.
- **Cleanup on failure or cancellation.** Every job that starts the stack has
  `Take the local stack down and prove it gone` with `if: always()` (in ci.yml after the
  tree-clean guard, so a cleanup failure cannot skip that guard). It stops every stack this job
  claimed (`supabase stop --no-backup`; whatever is left removed by the project's label, never
  anything else), then proves: no container, volume or network of the project, no `supabase`
  process of this stack, no listening or process-owned socket on the block, each port binds, and
  it counts any ownerless TIME_WAIT socket left (a later allocation skips such a block). Only
  then are the reservation and the claim released; anything left fails the step.
- **No unrelated process is killed.** Nothing outside the stack is ever signalled. The only
  processes the teardown may stop are `supabase` CLI processes whose environment names this stack's
  workdir (a start cut off by a cancellation), never an ancestor of the step. A Docker query that
  fails during teardown is a problem, not an empty answer, so the claim is kept (review on #2014). The first concurrent
  drill (run 41602754978) showed why the name check matters: `SUPABASE_WORKDIR` is in the job's
  environment, so matching on it alone took the teardown step's own shell; fixed in 1b909749 with a
  regression test (`isStackProcess`).

## (b) Verified in CI

On head cb104858, the final code (the same drills passed earlier on 1b909749 and 4a7d50c:
41603498728, 41604646086, 41604949433; 41606156869, 41606643025, 41607025223). The collision
drill's code has not changed since 4a7d50c.

| What | Run | Result |
| --- | --- | --- |
| Concurrent stacks | endurance 41609331371 (`drill:stack-concurrent`) | The job's stack on slot 0, then two more started at once, racing for slots: slots 1 and 2, projects `noacg-studio-s1`/`-s2`, ports 54420-54429 and 54520-54529, both ready with no retry; three API and database URLs; a user made in s1 exists only in s1; both taken down and proved gone; the job's own stack still answered 200; its teardown then proved it gone too. |
| Collision reproduced | endurance 41607584981 (`drill:stack-collide`, 4a7d50c) | Section (a) above. |
| Cleanup after a failed run | endurance 41608528376 (`drill:stack-fail`) | `Run` failed on purpose; the teardown step: `noacg-studio-s0: 0 containers, 0 volumes, 0 networks, no process; ports 54320-54329 not held and each binds; 0 ownerless TIME_WAIT socket(s) left (a new allocation skips a block until they expire); reservation and claim released.` |
| Cleanup after a cancelled run | endurance 41608857703 (`drill:stack-hold`, cancelled while it held the stack) | `Run` cancelled; the teardown step ran and reported the same line for `noacg-studio-s0`. The runner then terminated only the drill's own `npm run drill:stack-hold` processes. |
| Cleanup in the real configured jobs, cancelled mid-suite | ci.yml run 41607990844 on 2f281dd8 (this PR's earlier head, superseded and cancelled by the next push) | All four `Configured E2E n/4 (selected)` jobs were cancelled while their specs ran; in each, the teardown step reported 0 containers, 0 volumes, 0 networks, no process, ports 54320-54329 not held and each binds, with 3, 10, 4 and 21 ownerless TIME_WAIT sockets left from the suite's own traffic. |
| The real configured jobs, to the end | this PR's CI run on its final head (whole configured set, since the change touches ci.yml and the action) | in the PR and the receipt |

**What "no port left held" means here.** After teardown no socket on the block listens or belongs
to a process, and each port binds. A run with traffic leaves ownerless TIME_WAIT sockets on the
block for up to 60 s (the cancelled CI jobs above). The collision drill showed that a client-side
TIME_WAIT on a stack port does block Docker's bind, so these are counted and printed, not ignored,
and allocation treats a block with any socket on it, TIME_WAIT included, as in use. On a hosted
runner the VM ends with the job, so they never meet a second stack there.

The drills run through endurance.yml, which now starts its stack with the same script and has the
same teardown step, so they exercise the code the configured jobs run.

## Phase notes

- **Previous verified main SHA:** 98b62dad9ae664ffb49829201ecc3a7c0667aad6 (where this branch
  started); `main` at b7ca35ca was merged in before review. The PR names the base it lands on.
- **Revert:** `git revert -m 1 <merge sha>` restores the old start (with its retry) and removes the
  teardown steps; nothing persistent is created, and no migration.
- **Decisions.**
  - Reserve and check rather than move the stack below 32768: the reservation is the kernel's own
    mechanism for exactly this, keeps slot 0 on the CLI's default ports, and still lets a second
    stack on one host take a different block.
  - Every stack runs from a copy with its own `project_id`, slot 0 included, so container names
    never collide between stacks; the copy lives outside the checkout, so the tree stays clean.
  - The readiness check is single-shot: `supabase start` already waits on the health checks, and a
    poll here would be the retry this phase removes.
  - `scripts/configured-selection.test.mjs` asserted the old retry ("exactly two starts"). It now
    asserts the new rule as strictly: one start through the allocator, no `supabase start` or
    `stop` command in the action, the database container found by project label, and the
    `if: always()` teardown in both configured jobs.
- **Traps.**
  - `SUPABASE_WORKDIR` exported to `$GITHUB_ENV` is inherited by every later step's shell, so any
    process match on it must also check the process is the `supabase` CLI.
  - A Node `net.connect` with an explicit `localPort` sets `SO_REUSEADDR` and does not reproduce the
    collision; only a kernel-chosen source port does (first collide run, 41604081670).
  - A TIME_WAIT socket on a stack port blocks Docker's bind for 60 s; a "restart after a stop" is
    not a fix.

Issues to close after landing: #1865 and #1829.
