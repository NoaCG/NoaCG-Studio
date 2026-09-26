# Grounding - what to read, in what order

This session has to survive a day of follow-up questions, so its window is the scarce resource and
reading is tiered. Grounding is done when every command in the cheap set has run in this invocation
and the plan-time state is written into the wave-state file - a plan grounded in yesterday's numbers
is grounded in nothing.

## Before any read: the home

**`node scripts/orchestrator-home.mjs`**, by the host route in `hosts.md`, fetches and updates the
permanent detached home (exception 4). Read from its printed path with explicit cwd, so the plan is
grounded in what landed; a pinned-cwd harness uses the verified-current fallback in `hosts.md`. It
refuses rather than clobbers (a dirty home, a path git does not know as a worktree, a home holding a
branch): on a refusal, continue in the current checkout and say in section 4 that its reads may be
stale. Never create, move or delete the home by hand, and never run a dev server in it (it reserves
no dev port). A failed store access is a limitation to report.

On recovery, read `node scripts/wave-recover.mjs --plan <stored-plan> --json` first and retrieve
only the assignment or result a decision needs; a new plan still runs the cheap set below.

## Then always - the cheap set

It produces the wave table, so if the window later runs short the routing already exists.

- `node scripts/worktree-activity.mjs` - every other worktree's uncommitted and unmerged files: the
  collision input, and how a "finished" session is caught still holding work.
- `npm run jobs` - where every branch ahead of `main` stands (the states: core section 3; the
  refusal kinds: `report.md`).
- `node scripts/merge-order.mjs` - which unqueued branches ahead of `main` collide with each other,
  by a real three-way merge. A collision input, never a landing order.
- `git log --oneline -5`, `git branch --show-current`, `git status --porcelain=v1 --branch`.
- `node scripts/owner-receipts.mjs` - every owner-raised task with its state and age. A STANDING
  ask (unstarted or advanced) is inventory the plan must mention (the plan check refuses one that
  does not); a FINDING is our own bug, never his, and drains with the backlog.
- `node scripts/handoff-drain.mjs` - every handoff file, classified or not, with its age; the plan
  classifies each under `## Handoffs` (`collisions.md`, "Consuming the handoff folder").
- `npm run harness:usage` - the capacity snapshot the routing is decided on (`routing.md`).
- `ls docs/acceptance/owner-queue/` - the unwalked count, a capacity input - plus any live plan the
  store still holds from a wave that never reported.
- **The morning CI verdict and the weekly review live in the PRIMARY checkout, gitignored**, so the
  home never has them (`docs/ROUTINES.md` owns when each is written and deleted). Read them there.
  The verdict is a claim like any handoff: re-check the run it names (`gh run view <id> --json
  jobs`). `npm run weekly:candidates` says what this plan owes the review.
- **Every row's source, checked against git.** For each branch a pasted handoff names,
  `git show-ref --verify refs/heads/<branch>` and `git branch --merged main`; for every source (a
  pasted ask, a handoff item, an owner receipt, a backlog file), `git log -i --grep=<its key words>
  -5`. A false "all merged", a missing branch, or work already landed goes in section 4, never in a
  prompt. **A shelved file is a claim about the past; the log says whether it is still true**, and
  nothing deletes an item when the work lands somewhere else.
- **The north star, one read:** `grep -n '^#' docs/GOALS.md` for the skeleton, then its
  `## Outcomes` section - each outcome's priority, current state and done criteria for this phase.
  The `(now)` outcomes are the push; `(next)`, `(later)` and `Later and parked` wait, whatever a
  task's own handoff says about urgency. Never read the whole file, and never read
  `docs/GOALS_ARCHIVE.md`. An outcome whose criteria are met is reported, never silently advanced;
  updating its current state lands with the work that changed it.

## Only when it changes routing

Each further read owes a question whose answer can move a session: one source file to confirm or
kill a suspected collision, the binding doc for a task whose scope looks wrong, one memory or round
doc when a pasted trap decides an order. **The confirmation pass (`prompts.md`) is such a read and
is never the one trimmed for window.** Prefer `grep` with a line range to opening a source file:
opening one in an area with its own contract pulls that contract in too.

**NEVER, unprompted:** product source for a task nobody flagged, plan docs for work nobody pasted,
reference images (name the path in the prompt), or a memory file browsed for background rather than
consulted for one fact. The reading never lengthens a prompt: prompts stay pointers.
