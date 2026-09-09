---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: unstarted
asked: "Loop/browser blocking: we still seem to have problems with the machine browser blocking other work. Please keep working toward a proper solution."
---
# An e2e run whose dev server never comes up holds the machine-wide browser lock forever

**Filed:** 2026-09-03. **Source:** measured during the 2026-09-02 night wave, then raised by the
owner the next morning as a standing problem rather than a one-off.

## Why

One browser-driving job runs per MACHINE, so the lock that enforces that is the single point every
suite, sweep and bench queues behind. A run that dies in a way the lock does not recognise stops
every other browser job on the laptop until a person notices. Nobody noticed for **126 minutes**
on 2026-09-02, and the session that eventually hit it lost an hour to a problem that had nothing
to do with its own work.

The deeper reason this is worth a real fix rather than a bigger timeout: **the detector and the
failure disagree about what "stuck" means.** `e2e-runs.mjs --orphans` asks whether the process is
alive. This process was alive. It was alive and doing nothing, forever, which is the one state the
check cannot see - so the guard reported a clean machine while the machine was blocked.

## Evidence

Measured in the 2026-09-02 night wave, row K. Its handoff was drained on 2026-09-09; the numbers
below are the whole of what it carried about this, and it prints from
`git show 187a1c79:docs/handoffs/2026-09-02-d-leaving-the-wizard.md`:

- A Playwright run in the **primary checkout** held the lock for **126 minutes** having burned
  **1.7 CPU seconds**, with **no browser child processes**.
- Its dev server had bound `::1:5230` only - IPv6 loopback - so the readiness probe, which asks
  for IPv4, could never succeed.
- Nothing timed out: Playwright's `webServer` had no timeout that fired, so the run waited on a
  condition that could not become true.
- `node scripts/e2e-runs.mjs --orphans` reported nothing, because a live-but-stuck run is not an
  orphan under its definition.
- Cleared only by killing the process tree by hand.

## What it would take

Three independent changes, each useful alone, cheapest first:

1. **Pin the dev host.** Bind the e2e dev server to `127.0.0.1` explicitly rather than letting
   Node choose, so the readiness probe and the server agree on the address. This removes the
   observed cause.
2. **Give `webServer` a timeout.** A readiness wait that cannot fail is the bug; a run that gives
   up and releases the lock is recoverable. This removes the whole class, not just the IPv6 case.
3. **Make the stuck check read CPU TIME, not liveness.** A run holding the lock with near-zero CPU
   accumulated over many minutes and no browser children is stuck, whatever its process state says.
   Fold it into `e2e-runs.mjs` beside `--orphans` so one command answers "is anything wrongly
   holding the lock" - and have the job runner surface it, since the runner is what waits.

Fix 2 is the one that makes the class survivable; fix 3 is the one that makes it visible. Doing
only 1 fixes today's instance and leaves the mechanism intact.

## Note on how this was nearly lost

This was originally captured as a task chip for the owner to click. He does not click them, and
said so: *"If the system surfaces a useful task like this, the orchestrator should automatically
capture it into the backlog/to-do system when appropriate."* A chip is a suggestion to a human; a
backlog file is a tracked item. The orchestrator contract now carries that rule
(`.agent-workflows/orchestrator/collisions.md`, "Work the wave surfaces").
