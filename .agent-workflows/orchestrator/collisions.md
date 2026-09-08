# The collision pass - what can run at once

Done when every pair of rows is either disjoint in `TOUCHES` and `MINTS` or carries a ruling
below, and `node scripts/wave-plan-check.mjs` finds no slot minted twice.

**File overlap is the expensive failure, and a file list alone does not find it** - nor does a list
of paths nobody confirmed, which is not yet a file list (`prompts.md`, the confirmation pass). Two
sessions owning one file merge CLEANLY into a tree describing something neither built. Pass across
every `TOUCHES` set, then across the collisions a `TOUCHES` diff calls disjoint.

## The collisions a file diff calls disjoint

- **A scarce shared slot.** Two sessions minting migration `0036`; two re-recording
  `scripts/overflow-baseline.json`; two adding an e2e spec and so both editing
  `scripts/e2e-lists.mjs` / `scripts/e2e-affected.mjs`; two moving a landed goal out of
  `docs/GOALS.md` into `docs/GOALS_ARCHIVE.md`; two touching `package.json`. Different filenames,
  disjoint sets, clean merge, wrong result. **The plan ALLOCATES these up front** - A takes 0036,
  B takes 0037, C owns the baseline re-record - and each is named in that session's `MINTS`.
- **A shared CHECK - two rows that change one FLOW, not one file.** Different sources, same TEST,
  because that test drives the flow both changed. **Ask of every pair: do these rows change the
  same user-visible FLOW?** If so they share its tests whatever their file lists say. Measurable,
  not foreseen: `node scripts/e2e-affected.mjs` maps sources to covering specs - run it over each
  row's forecast `TOUCHES`; an intersection is a collision (`incidents.md` "two dialogs").
- **A renamed or re-signatured shared export.** One session changes it, another writes callers.
  Any session that renames or re-signatures something shared is **sequential by construction**,
  whatever the file sets say.
- **A build gate.** **A GATE LANDS ALONE** (the rule is in the core file; the incident that paid
  for it is `incidents.md` "the copy gate landed mid-wave"). An allowlist note in a prompt does
  not cover this - the builder may rightly choose a better design than the planner named.
- **A backlog item filed by a LIVE session is not free work.** Filed today by a session still
  holding the file it names, it reads like an unowned task and is the exact opposite. Before
  turning one into a prompt, check who filed it and whether that session is live -
  `node scripts/worktree-activity.mjs` names the file, its own git history names the branch. If
  that session still holds the file, the work is its continuation or it waits, never a second row.

**When two sessions do collide on one file, the planner says which version WINS - the later-landing
session resolves with judgement, not with a merge.** A collision settled by whoever happens to
merge second, with no ruling from the plan, is how a clean merge produces a tree describing
something neither branch built. Worked example: `incidents.md` "the docs-index backlog item".

## The machine's limits

**The laptop holds 3-4 CONCURRENT sessions, weighted by what each needs** (~1 GB each across hidden
child processes): a browser-driving session costs a full slot, a docs/plan session roughly half. A
wave larger than that is planned as COHORTS - the extra rows carry `START on slot free` and the
watch loop launches them as landings free capacity. Capacity succession is NOT a dependency edge:
cohorts stay order-free, so a big wave runs all night without the owner starting sessions by hand.

**RAM is a shared resource like the browser slot and the merge queue.** A wave where every session
queues a full catalog battery at once starves the landings. The plan names which sessions carry
heavy batteries and staggers or trims them: only the AFFECTED gates, cheapest first, and whatever
CI can prove stays in CI. Jobs waiting on the queue's RAM floor is the system working.

**One browser-driving job per MACHINE, not per worktree** (root `AGENTS.md`; the override lives
there too). The per-change gate belongs to CI, so the only work needing the laptop's browser is
what CI cannot do - in-browser visual acceptance, the catalog gates (`l3-sweep`, `type-floor`,
`overflow-sweep`, `field-coverage`, `numerals`, `test:e2e:catalog`), benches, and render smoke.
Order those cheapest-first and tell the user to use the `:queued` form of any e2e script.

**A wave may not depend on a permission prompt being answered.** Nobody is awake, so an unanswered
prompt is not a delay, it is a session that never finishes and never says why. Plan inside what is
already allowed: `.claude/settings.json` is tracked, so every worktree gets it from git
(`docs/AGENT_WORKFLOWS.md`, "Permissions"). A row needing something outside it gets that entry
landed first - a one-line change, not a night's blocker - or is planned for a session the owner is
awake for, and section 4 says which. **Never plan around it by asking for bypass mode**: the fix is
an allowlist entry that was reasoned about, or a mechanism that removes the command. How a blocked
session is SEEN is `launch.md`; that it must be planned out of existence is decided here.

**Work the wave SURFACES becomes a `docs/backlog/` file, never a chip** - see `report.md`.

## The two files every session appends to

These are append-only lists, so N sessions writing at one offset is a git conflict, and the merge
queue bounces the conflicting pull request to its session. Both are solved by one FILE per session:

- **the owner queue** - one file per item under `docs/acceptance/owner-queue/`, named
  `<date>-<letter>-<slug>.md`. Never a shared list (root `AGENTS.md` rule 7).
- **the handoff** - one file per session at `docs/handoffs/<date>-<letter>-<slug>.md`, so the
  morning report can collect every session's handoff without the user opening any of them.

## Consuming the handoff folder

**Handoff files are CONSUMED, not archived - git is the archive.** A new plan classifies every
file in `docs/handoffs/` it read, one line each under `## Handoffs` in the wave-state file:
**consumed** (a prompt in section 5 was written from it), **spent** (nothing left worth a prompt -
every open item traced, never invented work), **deferred** (machine-continuable, not this wave -
it stays, and section 4 says why), or **owner** (its open items need a person and have gone to
needs-you or an owner-queue item). `node scripts/handoff-drain.mjs` prints every file with its
class and flags the unclassified and the long-deferred; the plan check refuses a plan while any
file is unclassified. Consumed, spent and owner files are DELETED by the wave itself: exactly one
session's prompt carries the line "delete these handoff files in your first commit: <list>", so
the deletion lands with the successor work, distinct file deletions cannot conflict, and this
session still changes nothing.

**But SPENT is a claim about each open ITEM, not about the file.** A handoff is spent only once
every open item is traced to where it now lives - a landed commit, a backlog file, a contract, an
owner-queue item - and the plan records that trace; the file's own "what is left" heading is what
its author believed on the day, not the test. Grep PROSE mentions ("see the handoff") as well as
paths - the path grep feels sufficient and is not. Deferring costs nothing; a wrong deletion
destroys the only copy, and "git is the archive" helps only a reader who knows what to look for.
