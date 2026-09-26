# The collision pass - what can run at once

Done when every pair of rows is either disjoint in `TOUCHES` and `MINTS` or carries a ruling
below, and `node scripts/wave-plan-check.mjs` finds no slot minted twice. **Where the pass is
UNSURE, chain**: chaining spends wall-clock the night has, while a wrong parallel call is paid for
with nobody awake to catch it.

**File overlap is the expensive failure**: two sessions owning one file merge CLEANLY into a tree
describing something neither built. Pass across every `TOUCHES` set (confirmed paths only:
`prompts.md`, the confirmation pass), then across the collisions a file diff calls disjoint. **When
two sessions do share a file, the plan says which version WINS**, and the later-landing session
resolves it with judgement, not with a merge.

## The collisions a file diff calls disjoint

- **A scarce shared slot**: a migration number, a re-record of `scripts/overflow-baseline.json`, a
  new e2e spec (both rows edit `e2e-lists.mjs` / `e2e-affected.mjs`), archiving a landed goal out
  of `docs/GOALS.md`, `package.json` - **and LIVE MACHINE STATE, which has no filename at all**:
  the machine's signed-in CLI credential, a global install, a declared presence. Allocate them in
  the core's up-front pass (A takes 0036, B takes 0037, C owns the baseline re-record); a session's
  `MINTS` BINDS, so two rows never mint one slot. It does not oblige the named row to use it, nor
  forbid a row that discovers it needs an unallocated one from taking it and saying so.
- **A shared CHECK - two rows that change one FLOW, not one file.** Ask of every pair: do these
  rows change the same user-visible FLOW? If so they share its tests whatever their file lists say.
  Measure it: run `node scripts/e2e-affected.mjs --list` over each row's `TOUCHES`; an intersection
  is a collision. Always pass `--list`: bare, it RUNS the whole suite on the one browser slot.
- **A renamed or re-signatured shared export.** One session changes it, another writes callers.
  Such a session is **sequential by construction**, whatever the file sets say.
- **A build gate** lands alone (core). An allowlist note in a prompt does not cover this: the
  builder may rightly choose a better design than the planner named.
- **A backlog item filed by a LIVE session is not free work**: it reads like an unowned task and is
  the opposite. Before turning one into a prompt, check who filed it (`worktree-activity.mjs` names
  the file, its git history names the branch). If that session still holds the file, the work is
  its continuation or it waits, never a second row.

## The machine's limits

**The laptop holds 3-4 CONCURRENT sessions, weighted by what each needs** (~1 GB each across hidden
child processes): a browser-driving session costs a full slot, a docs/plan session roughly half. A
larger wave is planned as COHORTS - the extra rows carry `START on slot free` and the watch loop
launches them as landings free capacity. Capacity succession is NOT a dependency edge: cohorts stay
order-free.

**RAM is a shared resource like the browser slot and the merge queue.** The plan names which
sessions carry heavy batteries and staggers or trims them: only the AFFECTED gates, cheapest first,
and whatever CI can prove stays in CI. Jobs waiting on the queue's RAM floor is the system working.

**The browser slot** (core: one job per machine). The per-change gate belongs to CI, so the laptop's
browser is only for what CI cannot do - in-browser visual acceptance, the catalog gates (`l3-sweep`,
`type-floor`, `overflow-sweep`, `field-coverage`, `numerals`, `test:e2e:catalog`), benches, and
render smoke. Order those cheapest-first; sessions use the `:queued` form of any e2e script.

**A wave may not depend on a permission prompt being answered**: with nobody awake, it is a session
that never finishes and never says why. Plan inside what `.claude/settings.json` already allows (it
is tracked, so every worktree has it; `docs/AGENT_WORKFLOWS.md`, "Permissions"). A row needing more
gets that entry landed first, or is planned for a session the owner is awake for, and section 4
says which. **Never plan around it by asking for bypass mode**: the fix is an allowlist entry that
was reasoned about, or a mechanism that removes the command. How a blocked session is SEEN is
`launch.md`.

**Work the wave SURFACES becomes a `docs/backlog/` file, never a chip** - see `report.md`.

## The two files every session appends to

Append-only shared lists make N sessions write at one offset, and the merge queue bounces the
conflict, so each session writes its own FILE: an owner-queue item as
`docs/acceptance/owner-queue/<date>-<letter>-<slug>.md`, never a shared list; a handoff, only when
meaningful work is left unfinished, as `docs/handoffs/<date>-<letter>-<slug>.md`.

## Consuming the handoff folder

**Handoffs are continuation records, CONSUMED and deleted, never a queue.** A plan classifies every
file in `docs/handoffs/` it read, one line each under `## Handoffs` in the wave-state file:
**consumed** (a prompt in section 5 was written from it), **spent** (nothing left worth a prompt),
**deferred** (machine-continuable, not this wave - it stays, and section 4 says why), or **owner**
(its open items need a person and have gone to needs-you or an owner-queue item). The plan check
refuses a plan while any file is unclassified, and `handoff-drain.mjs` flags the long-deferred.
Consumed, spent and owner files are DELETED by exactly one session of this wave whose prompt names
the list, so the deletion lands with the successor work.

**SPENT is a claim about each open ITEM, not about the file**: every open item is traced to where
it now lives - a landed commit, a backlog file, a contract, an owner-queue item - and the trace is
recorded; the file's own "what is left" heading is only what its author believed on the day. **Then
REPOINT before deleting**: each citation states its own fact and cites something durable
(`git show <sha>:<path>` at worst); grep prose and bare filenames too, not only paths. Deferring
costs nothing; a wrong deletion destroys the only findable copy.
