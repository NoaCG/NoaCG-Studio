# Grounding - what to read, in what order

Load this FIRST, before any other read. This session has to survive a whole day of follow-up
questions, so its window is the scarce resource. Reading is tiered, and grounding is done when
every command in the cheap set has been run in this invocation and the plan-time state is written
into the wave-state file - a plan grounded in yesterday's numbers is grounded in nothing.

## Before any read: the home

**`node scripts/orchestrator-home.mjs`.** It fetches and puts this session in its permanent home -
`.claude/worktrees/orchestrator`, detached at `origin/main`, created if absent and fast-forwarded
if behind (exception 4). Everything below is then read from the path it prints, so the plan is
made against what actually landed rather than against whatever commit this session started from.
Run every later command of the session from that directory. The wave-state file goes to the store,
not here - the tick, the drain and the plan check all resolve it there, from any checkout.

It is idempotent and refuses rather than clobbers: a dirty home is left alone and reported (reads
there are stale), and a path git does not know as a worktree, a home holding a branch, or any git
refusal exits 1 with the real error. On a refusal, continue in the current checkout and say in
section 4 that its reads may be stale. Never create, move or delete it by hand, and never run a dev
server in it: it reserves no dev port, and SessionStart exempts it from the 5180-5298 block.

## Then always - the cheap set

It produces the wave table, so if the window later runs short the routing already exists.

- `node scripts/worktree-activity.mjs` - every other worktree's uncommitted and unmerged files.
  This is the collision input, and how a "finished" session is caught still holding work.
- `npm run jobs` - where every branch ahead of `main` stands: `QUEUED <id>` with its pull request,
  `LANDED`, `LANDING FAILED` with the failed check copied from the pull request, or `not queued`.
  **A refusal lives on the pull request** (`gh pr view <n>`), never in a local log; the kinds are in
  `report.md`, and the queue's only preconditions are `CI gate` and `Reviewed` green on the tip.
- `node scripts/merge-order.mjs` - which unqueued branches ahead of `main` collide with each other,
  measured by a real three-way merge. A collision input, never a landing order: order is the queue's.
- `git log --oneline -5`, `git branch --show-current`, `git status --porcelain=v1 --branch`.
- `node scripts/owner-receipts.mjs` - every owner-raised task with its state and age. A STANDING
  ask (unstarted or advanced) is on the frontier above the backlog and the plan check refuses a plan
  that does not mention it; a FINDING is our own bug, never his, and drains with the backlog.
- `node scripts/handoff-drain.mjs` - every handoff file, classified or not, with its age. The
  classification the plan owes each one is written under `## Handoffs` in the wave-state file
  (`collisions.md`, "Consuming the handoff folder").
- `npm run harness:usage` - the capacity snapshot the routing is decided on (`routing.md`).
- The unwalked count - `ls docs/acceptance/owner-queue/` - a capacity input, plus any live
  plan the store still holds from a wave that never reported. **The morning CI verdict and
  the weekly review are written into the PRIMARY checkout, gitignored, so the home never has them**
  (`docs/ROUTINES.md`, its routine table, owns when each is written and deleted). Read them there:
  the verdict is a claim like any handoff, so re-check the run it names
  (`gh run view <id> --json jobs`) first, and the weekly file's candidate rows are frontier input.
- **For each branch a pasted handoff names**: `git show-ref --verify refs/heads/<branch>` and
  `git branch --merged main`. A handoff claiming "all merged" for a branch that never landed, or
  naming a branch that no longer exists, is reported in section 4 - not written a prompt. **And for
  EVERY ROW'S SOURCE - a pasted ask, a handoff item, an owner receipt, a backlog file -
  `git log -i --grep=<its key words> -5`**: work already landed is reported in section 4, never
  planned again. Both contracts did exactly that on 2026-09-02, and a backlog file fixed the day
  after it was filed sat six days and got a row whose core was already `main`. **A shelved file is
  a claim about the past; the log says whether it is still true**, and nothing deletes an item when
  the work lands somewhere else.
- **The north star, two ranges, nothing more:** `grep -n '^#' docs/GOALS.md` for the skeleton, then
  `sed -n '/^## NOW/,/^## NEXT/p' docs/GOALS.md` for the current push. `## NOW` is the push;
  `## NEXT`, `## THEN` and `## Parking lot` are parked. That is enough to classify every pasted
  task, whatever its own handoff says about urgency. Never read the whole file, and never read
  `docs/GOALS_ARCHIVE.md`.
- **The register, one read:** the state table at the top of `docs/PROGRAMMES.md` (and a
  programme's own section only when planning a row from it). It answers which programmes are
  ACTIVE, what their next stages are, and which entry condition may have just become true - a flip
  is recorded in the same commit as the first work it permits.

## Only when it changes routing

Each read owes a question whose answer can move a session: one source file to confirm or kill a
suspected collision; the binding doc for a task whose scope looks wrong; one memory or round doc
when a pasted trap decides an order. **The confirmation pass in `prompts.md` is such a read and is
never the one trimmed for window** - a grep per path answers the question `TOUCHES` exists to ask.

Prefer `grep` with a line range to opening a source file: opening one in an area with its own
contract pulls that contract in too (a second file in the same area is then free).

**NEVER, unprompted:** product source for a task nobody flagged, plan docs for work nobody pasted,
reference images (name the path in the prompt), or a memory file browsed for background rather
than consulted for one fact.

Spend none of the reading into the prompts: they stay pointers, so a longer read never lengthens one.
