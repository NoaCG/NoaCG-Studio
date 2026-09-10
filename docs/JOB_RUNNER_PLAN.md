# The job runner - one queue per machine for browser-driving work and merges

Status: **steps 1, 3 and 5 BUILT (2026-08-25); step 2 revised on contact; step 4 not started.**
It replaces the "merge lock" idea from the same session - the queue IS the lock, and building
both would be two mechanisms for one job.

- `scripts/jobs-store.mjs` - the state and the arithmetic, unit-tested in `jobs-store.test.mjs`
  (in the build gate).
- `scripts/jobs.mjs` - the CLI and the drain loop. `npm run queue -- "<command>"` to enqueue,
  `npm run jobs` to see the queue.
- `scripts/hooks/session-start.mjs` prints the queue and what finished since the last session.
- `scripts/e2e-runs.mjs --wait` now gives up after 30 minutes instead of never.

## The problem, measured

`scripts/e2e-runs.mjs` deliberately is **not** a lock: it reads the OS process table, so a killed
run stops counting the moment its process dies, and there is no ticket to go stale. That design is
sound and this plan keeps it. What fails is everything around the *waiting*.

Three defects, which compound into "I came back hours later and nothing had progressed":

1. **The `--wait` loop has no cap and no tie-break.** `test:e2e:affected:queued` expands to
   `node scripts/e2e-runs.mjs --wait && node scripts/e2e-affected.mjs`. That waiter polls
   `activeRuns()` every 5 s, forever, and yields to any active run. The *other* waiter - inside
   Playwright's `globalSetup` (`e2e/_offline-guard.ts`) - has both a 30-minute cap and a proper
   FIFO tie-break (`blockingRuns`, added 2026-08-21 after exactly this stall). The fix landed on
   one waiter and not the other.

2. **The agent's shell tool caps at 600 s.** A foreground `:queued` command waiting behind a
   twelve-minute suite is killed at ten minutes with the wait still running, so the run never
   starts at all. Nothing reports this: the session sees a timed-out tool call, and the queue sees
   a job that never existed. This is the likeliest cause of the daily loss.

3. **Every waiter wakes at once.** When the slot frees, all pollers notice within 5 s and all
   launch Playwright together - the exact collision the module exists to prevent. They then land
   in `globalSetup`'s FIFO, one proceeds, and the rest burn the 30-minute cap.

And nothing anywhere shows a *queue*. `activeRuns` reports what is RUNNING, never what is WAITING,
so "correctly queued behind a long suite" and "dead ten minutes ago" look identical from outside.
That is why diagnosing it currently needs a person.

The resource being protected is RAM, not CPU or GPU. Measured on the Ryzen 7 5800H / 16 GB laptop
with two suites at once: 34 live `chrome-headless-shell` processes, 93% CPU, under 2 GB free.

## The design

Sessions stop waiting. They **enqueue and return immediately**, which removes defect 2 by
construction - no shell command outlives the tool that started it. One runner process per machine
drains the queue, which removes defects 1 and 3 because there is no longer a race: one process
decides what starts.

### State

One directory beside the existing dev-port tickets, so every worktree of this repo - and only this
repo - shares it: `<git-common-dir>/noacg-jobs/`. One JSON file per job, named by id.

```jsonc
{
  "id": "j-0007",
  "kind": "gate",             // gate | merge | sweep
  "command": "npm run test:e2e:affected",   // exactly what the runner spawns
  "checkout": "C:/claude/NoaCG-Studio/.claude/worktrees/...",
  "branch": "claude/some-branch",
  "after": ["j-0006"],        // ids that must finish green first; [] for none
  "enqueuedAt": 1756100000000,
  "state": "waiting",         // waiting | running | done | failed | timed-out | cancelled
  "startedAt": null,
  "finishedAt": null,
  "exitCode": null,
  "logPath": "<git-common-dir>/noacg-jobs/logs/j-0007.log"
}
```

A file per job rather than one queue file: two sessions enqueuing in the same second cannot lose
each other's write, and a half-written file is one unreadable job rather than a corrupt queue. The
runner skips anything it cannot parse and reports it.

### CLI

```
node scripts/jobs.mjs add "npm run test:e2e:affected"   # prints a job id, exits at once
node scripts/jobs.mjs add "npm run build" --after j-0007
node scripts/jobs.mjs                                    # running + waiting, with positions
node scripts/jobs.mjs --json
node scripts/jobs.mjs log j-0007                         # tail that job's output
node scripts/jobs.mjs cancel j-0007
node scripts/jobs.mjs --runner                           # the drain loop itself
```

`add` starts the runner if it is not already alive. "Alive" is decided the way this repo already
decides such things - by looking for the process in the OS table, not by a lock file - so a
crashed runner leaves nothing behind to clean up.

### Capacity policy - a BUDGET, not a job count

**One runner is an election, not a throughput limit.** The runner is the scheduler; jobs run as
separate processes beside it. Two runners would both read the queue, both see the same free slot
and both start the same job - the exact collision the queue removes. Parallelism is the budget
below, and that is the only knob worth turning.

Jobs are weighted in **suite-equivalents**, because counting them was the crude part:

| job | cost | why |
|---|---|---|
| e2e suite, sweep, bench, or anything queued `--kind sweep` | **1.0** | a dev server plus four browser workers; two at once measured 34 browser processes, 93% CPU, under 2 GB free |
| anything unrecognised | **0.5** | assumed to be a dev server and ONE browser page - see the asymmetry below |
| `npm run build`, `node --test`, lint, `tsc`, `check:*` | **0.4** | CPU, little RAM, no browser |
| a landing (`auto-merge`) | **0.15** | almost entirely `gh run watch`, waiting on GitHub's network |

A job may also declare its own cost - `npm run queue -- "<command>" --cost 0.5` - anywhere between
a landing's 0.15 and a whole suite. The number is written onto the job record, so the listing, the
budget and the RAM floor all read the same figure and a retry inherits it. It is the only way to
price work the classifier has no way to recognise, and the floor of 0.15 is there because the same
number is the RAM admission threshold: left open, a job could waive that check on itself.

Heavy work is classified by `command-match.mjs` - the repo's ONE named list of what starts
browser work, read by the guard hook and the process detector too, so a script that is heavy here
is heavy everywhere rather than in a second opinion that can drift.

**The asymmetry decides the default, and it cuts both ways.** Charging an expensive job too little
puts two dev servers and eight browser workers on a 16 GB laptop. Charging a cheap one too much
stops it running at all: on 2026-09-09 a single-page renderer walk (j-0888) was charged a suite,
and because the RAM floor scales with the cost it demanded 4 GB free and sat refused for about
three hours while six other branches landed. So an unrecognised command is assumed to open ONE
browser - never free, never a battery - and anything genuinely suite-sized is either on
`command-match.mjs`'s list, queued `--kind sweep`, or given a `--cost`.

Budget, recomputed before every start and never cached:

- **Day (07:00-24:00 Helsinki): 1.0.** Never two suites while someone is using the machine.
- **Night (00:00-07:00 Helsinki): 2.0.** Two suites, or one suite plus a night's worth of
  landings draining beside it rather than behind it.
- **A free-RAM floor overrides the clock in both directions.** Below the floor nothing new starts,
  however many slots the schedule allows. Ship the floor at 4 GB and tune it from the log.
  `NOACG_JOBS_FREE_MB` retunes it; a runner keeps the environment it started with, so restart it
  after changing. The floor scales with the job's cost - a full 4 GB for a suite, 2 GB for one
  browser page, 600 MB for a landing - and one scheduling pass subtracts what it has already let
  through, so two jobs cannot both be admitted against the same free-memory reading.
- **Work started outside the queue still counts.** Another coding agent - Codex, or a hand-run
  command - never touches `jobs.mjs` and is invisible to the queue, but it IS visible to
  `activeRuns()`, which only ever reports browser work. Each such run costs a full
  suite-equivalent, subtracted before anything starts. Cooperation is an optimisation here; the
  process table stays the source of truth.
- **Landings are serial by their own rule, not by the budget.** Two merges never overlap however
  cheap they are, and a landing never runs beside anything in the SAME checkout - it rewrites the
  tree a suite there would be reading. Beside a suite in a different worktree it is harmless,
  which is the whole point of the 0.15.

Night = 2.0 is a starting point, not a promise, and it is probably already at the memory wall
rather than conservative: past it a RAM-bound box pages, and every job slows down together, so
more parallel stops being more throughput. Raise it only against measurements.

### Per-job cap

Every job carries a hard cap (default 45 min, `--cap` to override). On expiry the runner kills the
process **tree** - the whole tree, because killing only the shell is a documented way to orphan a
paid bench run that then holds a slot invisibly - records `timed-out`, keeps the log, and moves on.
Nothing sits forever, which is exactly the property the current `--wait` loop lacks.

### Visibility

- `node scripts/jobs.mjs` prints running jobs with elapsed time, and waiting jobs with their
  position and the reason they wait ("capacity 1/1", "waiting on j-0006", "RAM 3.1 GB free").
- **The SessionStart hook prints the same summary**, plus everything that finished since the last
  session: green, red, timed-out, and which spec failed. That is what turns "why has nothing
  progressed" into something answerable without asking an agent.
- If there are waiting jobs and no live runner, SessionStart says so and restarts it. A runner
  that dies is therefore a delay, never a stall.

## Auto-merge rides the same queue

This is the part that gets the mornings back. A branch that is ready to land enqueues two jobs:
the gate, then the merge that depends on it.

```
node scripts/jobs.mjs add "npm run test:e2e:integration" --branch <b>
node scripts/jobs.mjs add "safe-merge <b>" --after <that-id> --kind merge
```

Because `kind: merge` never runs two-wide, whatever the clock says, **merges are serialised by
construction**. No separate lock exists or is needed.

Guardrails, because nobody is watching at 03:00:

- Only a `clear` verdict from `scripts/merge-order.mjs` auto-merges. `caution` and `hold` stop and
  wait for the morning - those are exactly the cases the old collisions came from (a stacked branch
  jumping its ancestor, two branches minting one migration number).
- The gate must be green on the **integrated** SHA - main merged into the branch - never on the
  pre-integration commit. A clean `git merge main` is not proof the integration worked.
- `git merge --ff-only` stays the final arbiter. If anything landed while the gate ran, git
  refuses before anything is published.
- **When main moves under it mid-gate it re-integrates and re-verifies**, at most `--attempts`
  times (default 3). A serial queue loses that race constantly on a busy day - the second real
  landing lost it to a branch that landed during its own ten-minute CI run, and before the retry
  existed the job simply failed with nothing re-queuing it. There is no shortcut: a new main is a
  new tree, and a clean merge is not proof the integration worked, so each retry is a full
  re-verification. Bounded, because an unbounded retry is a machine that never lands anything
  while looking busy. Only this refusal retries; every other one stops dead.
- Publishing past `main` is never enqueued. `npm publish`, production migrations and anything
  costing money stay owner-triggered.
- **A green gate says nothing about migrations applying to a fresh HOSTED project.** CI's
  migration evidence comes from the local-stack nightly, and the CLI's local image ships
  `pgcrypto` already reachable - which is how three unqualified `gen_random_bytes` call sites
  passed every run and still failed a from-scratch hosted apply. "CI is green" and "a self-hoster
  can stand this up" are unrelated statements; this gate must never be cited for the second.

Morning report: what merged, what did not, and why - in the SessionStart summary.

### Every refusal says which one it is

Measured over the seven days to 2026-09-04: 51 merge jobs did not exit 0, and **37 of them carried
no refusal kind at all**. The queue reported each of those as "auto-merge refused it (exit 1) -
read the log for which check said no", which is a true sentence that hands a person a log file and
a guess. That is why merges were being shepherded by hand.

So `auto-merge.mjs` states a `kind` on every refusal (`REFUSAL` in that file; the queue reads it
back with `classifyRefusal`), and `refusalGuidance` in `scripts/jobs-store.mjs` is the one place
each kind's sentence and its answering command live - the listing, the give-up reason and a
session's own start banner all read it, so they cannot say three different things.

Three groups, and the grouping is the whole point:

| | Kinds | What happens |
|---|---|---|
| The queue recovers | `order-blocked`, `stale-pin`, `shards-skipped` | Held, re-pinned, or handed one dispatched full CI run - each **once**, then it escalates |
| A person decides | `order-caution`, `dirty-tree`, `merge-conflict`, `ci-red`, `preflight-1` | Failed with the reason on the record, and **no command offered** - a verdict must not be dressed up as something to re-run |
| The machine failed | `main-fetch`, `main-churn`, `push-failed`, `worktree-unavailable`, `no-main-worktree`, `ff-refused`, `order-no-verdict` | Failed, with `requeue` named - re-running is honest when nothing was judged |

**Phase 3 needed splitting, not naming.** One exit code carried three faults - a red run, a damaged
run, and a green run that skipped every E2E shard - under one sentence, eight times in that week.
Only the last has a mechanical cure (a `workflow_dispatch` has no push base, so it runs the full
suite), and it was the commonest. `planPhase3Refusal` tells them apart from the gate's own output,
which is why phase 3 is run captured rather than only inherited.

**A refusal now has an address.** The job record carries the `checkout` it was queued from, so
session start tells that worktree's session what happened to its branch - the other half of the
existing "THIS WORKTREE'S BRANCH HAS LANDED" line. The seen marker is per checkout, because one
machine-wide marker meant the first session of the day consumed the report for all of them.

**The transition is slow by construction.** A landing runs the copy of `auto-merge.mjs` in its own
branch's checkout, so branches cut before this refuse the old way and `classifyRefusal`'s prose
fallbacks are what read them. The runner half - the recovery, the banner - helps every branch from
the moment a current runner is draining.

## Failure modes this must survive

| Failure | Behaviour |
|---|---|
| Runner killed mid-job | Job stays `running` with a dead pid; the next runner start reaps it to `failed` and logs it |
| Machine reboots | Queue survives on disk; `waiting` jobs run, `running` jobs are reaped as above |
| Two runners race to start | Both check the process table, the loser exits; a duplicate start wastes a process, never duplicates a job |
| Unparseable job file | Skipped and reported, never blocks the queue |
| A job that never exits | Killed at the cap, whole tree |
| Another agent hogs the box | Counted via `activeRuns()`; capacity drops and the queue waits rather than thrashing |

## Tests

Node's built-in runner, beside the existing `scripts/*.test.mjs`:

- capacity arithmetic at both clock windows, at the RAM floor, and with unqueued outside work
- dependency ordering (`--after`), including a dependency that fails
- reaping a `running` job whose pid is gone
- the cap killing a whole process tree, not just the shell
- two concurrent `add` calls producing two distinct jobs and exactly one runner
- `merge` jobs never running two-wide, even at night

The clock and the free-RAM reading are injected, so no test depends on wall time or on how much
memory the machine happens to have.

## Rollout

1. **DONE.** `jobs.mjs` + `jobs-store.mjs` + tests - `add`, list, `log`, `cancel`, the runner,
   capacity, dependencies, reaping, and the tree kill.
2. **REVISED - do NOT repoint the `:queued` scripts.** The original plan said to make
   `test:e2e:*:queued` enqueue and return. That is wrong on contact with the callers: safe-merge
   Phase 3 Route B runs `npm run test:e2e:integration:queued` **for its verdict**, and a command
   that returns a job id instead of a pass/fail silently turns the gate into a no-op. Two
   different needs, so two different commands:
   - **needs the answer now** (a gate, a human watching) -> the `:queued` scripts, unchanged
     except that they can no longer wait forever (step 5);
   - **will come back for it later** (an agent, an overnight sweep) -> `npm run queue -- "<cmd>"`.

   The guard hook already tells these apart correctly - `node scripts/jobs.mjs add "npm run
   test:e2e:affected"` is allowed while `npm run test:e2e:affected` is refused - so enqueuing
   needed no change to `command-match.mjs`.
3. **DONE.** SessionStart prints running/waiting with reasons, what finished since the last
   session, and a loud line when there are waiting jobs but no runner.
4. **BUILT, DELIBERATELY NOT AUTOMATIC.** `scripts/auto-merge.mjs --branch <b>` does the boring
   path of the safe-merge workflow as one command, and `npm run queue:merge -- <branch>` queues
   it as a `merge` job. Because a merge job never runs beside anything, queueing several drains
   them strictly one at a time - which is the "wake up and they are landed" case.

   **What it refuses**, changing nothing further, is the whole design: any verdict that is not
   `clear`; any failed preflight check in phase 1, 3 or 4; a dirty worktree either side; a branch
   with no worktree; a CONFLICT integrating main (aborted, tree restored); a red, missing,
   damaged or shard-skipping CI run; and main moving under it at any point. It never
   force-pushes, never resets, never deletes anything, and the only merge it makes into main is
   `--ff-only`. `--dry-run` stops before the first state change.

   **Sessions queue their own landings now** (the queue-merge workflow, owner 2026-08-25):
   queueing is the finished session's own declaration that the work is done, so waves land
   unattended through this path. The safe-merge adapter keeps `disable-model-invocation: true`
   because the hand-run flow still starts with a human - it is the exception path for refusals
   a person has to judge. Everything past `main` stays owner-triggered.
5. **DONE.** `--wait` gives up after 30 minutes - matched to `QUEUE_TIMEOUT_MS` in
   `e2e/_offline-guard.ts`, which has capped the other waiter for the same resource since
   2026-08-21 - and points at the queue instead of stalling.

## Tuning

`NOACG_JOBS_FREE_MB` overrides the RAM floor for a runner. The 4 GB default is a starting point,
not a measurement; set it from what the logs say a run actually costs. A runner keeps the
environment it was started with, so change it and restart the runner.
