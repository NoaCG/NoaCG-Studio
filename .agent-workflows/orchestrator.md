# orchestrator - plan and assign the day's work

Shared canonical procedure, invoked as `/orchestrator` (alias `/o`) in Claude Code,
`$orchestrator` (alias `$o`) in Codex. Cross-references use plain names ("the queue-merge
workflow"); translate as `/queue-merge` or `$queue-merge`.

**This file is the always-loaded core (200-line cap), and the modules the routing table marks
*every plan* load beside it every time**; `npm run check:shared-instructions` gates both. A rule
that fires before its module loads keeps one sentence here and its mechanics in the module; a rule
restated here that fires only after its module loads is a defect.

## THIS SESSION NEVER ACTS

The single rule everything else serves. This session **plans work and never does any of it**, and
it **never touches another worktree** - not to check something, not to merge, not to tidy.

- **Read, don't write.** No merge, push, commit, rebase, build, test, install, or edit of product
  code. Not even a one-line fix that is obviously right: it goes in a prompt.
- **Never act on a collision.** Another worktree's in-flight work is read about through
  `worktree-activity.mjs` and planned around - never opened, never changed, never cleaned up.
- **Run one orchestrator session at a time.** Two plan against the same queue and their waves
  collide; this is the reason, not a hard lock, so a second one needs its own territory.
- **This session LAUNCHES its own rows** (`launch.md`) - the user pastes nothing and starts
  nothing. A command it genuinely cannot run names WHERE the user runs it, and that is the rarity.

**Exactly four exceptions, all bounded, all written here so none can widen quietly.** Outside them,
**Create or update no files.**

1. **Its own contract**: `.agent-workflows/orchestrator.md`, its module directory, the adapters
   that point at them, and the part of `scripts/check-shared-instructions.mjs` that pins them -
   nothing else in the repository.
2. **A follow-on it already planned**, when the trigger branch lands, in that session's own
   worktree, named in the wave table before the wave started (`orchestrator/night.md`).
3. **The wave-state file** - the plan's durable copy, NEVER in a checkout, because a plan printed
   only in chat dies with this session (`orchestrator/wave-state.md`).
4. **Launch infrastructure** - `node scripts/orchestrator-home.mjs` maintains the detached home;
   `orchestrator/hosts.md` also permits creating each assigned row's EMPTY feature worktree and
   launch receipts, never editing or adopting another worker's tree. Historically **the main checkout
   belongs to the landing queue**; GitHub now lands remotely. Plan from fetched `origin/main`.

**Landing authority belongs to GitHub's merge queue.** Never merge, and never push by hand. A branch
reaches `main` declared finished by its own session; re-arming a declared landing's watcher and
queueing a branch **NO LIVE SESSION HOLDS** are neither, so this session DOES both.

## Input, and the frontier

**Two sources of authority, and only two:** the owner's current feedback and direction (feedback
from testing the newest build outranks everything else), and the UNSATISFIED OUTCOMES marked
`(now)` in `docs/GOALS.md`, with their done criteria for this phase. Everything else is INVENTORY:
`docs/handoffs/` (read by default), `docs/backlog/` items and owner receipts
(`node scripts/owner-receipts.mjs`), bugs, red CI, unfinished work. Inventory supplies tasks, never
priority, and joins a wave only when it connects to an outcome or a concrete reliability
requirement. A vague report is ONE session whose first step is reproduce-and-scope.

**A row is on the FRONTIER when three things hold:** its why traces to the owner's feedback, to an
unsatisfied outcome's done criteria, or to reliability; its files are free; and it waits on no
human. Fill it with the most important unsatisfied outcome first, and finish important existing
work on an outcome before starting new work on it. Capacity left over stays left over - **never
invent work to fill a wave**. An owner ask this wave does not start becomes a `docs/backlog/` item
naming its outcome, written by one row's first commit. Private context (dates, partners, demos)
is in `docs/private/` in the main checkout: plan with it, never cite a date as the reason, never
copy it into public text.

**Day wave or night wave.** A NIGHT wave is planned in the evening, started by the user, landed by
morning through the queue; everything marked *night* is mandatory there. An interactively started
wave may open with a brief alignment step, a few `needs: decision` questions Grill-Me style, when a
major owner-level choice shapes the whole wave. **START-NOW mode** (`/orchestrator now`) skips it:
no questions, decide and launch. Once a wave runs it asks nothing. **THE WAVE WINDOW is whatever
time the user names in the invocation** and the plan scopes to it - prompt cores sized to finish
inside it, tails cut first. Unstated, plan to the next natural checkpoint and say which. **24 hours
is the absolute ceiling of any unattended chain.**

## Output - seven sections, in this order, nothing else

1. **The wave table.** One row per session: letter, one-line goal, `START` (`now`, `on <branch>
   landing`, or `on slot free`), `TOUCHES` (files it will own), `MINTS` (scarce shared slots),
   `POOL` (who does the work), browser yes/no. Target about five; the constraint is not the count
   but whether they can land in ANY ORDER. **The letter travels in three places and no fewer** -
   the table row, the branch name `<tool>/<letter>-<name>`, the prompt's first line. Never
   re-letter, never reuse a letter.
2. **What can run at once.** The collision pass. -> `orchestrator/collisions.md`
3. **Landing.** Two things, never blended: branches already ahead of `main`, each with its state
   from `npm run jobs` (`QUEUED` with its pull request, `LANDED`, `LANDING FAILED` with the check
   that failed, or `not queued`); and today's new sessions, which have no branches yet - **order is
   the queue's, never predicted**. **Section 3 is a report, not a pick.** A refusal lives on the
   pull request (`gh pr view <n>`), never in a local log: name the branch, the failed check, and
   WHERE the fix runs - the branch's own worktree, the only session that may queue it again.
4. **What I would push back on.** -> `orchestrator/pushback.md`
5. **The prompts, and every row's route** - then the launch. -> `orchestrator/prompts.md`, `orchestrator/routing.md`
6. **Decisions deferred, then one pick.** Preserve the intended outcome, use engineering judgment,
   keep going. Defer only a decision that materially changes direction, costs significantly or
   unusually, changes an important external, security or privacy boundary, or is hard to reverse
   (`docs/GOALS.md`, "Autonomous work"): record it and continue other work. The rest is DECIDED,
   reported with its why, and revertible after the fact (`orchestrator/pushback.md`).
7. **The morning report.** -> `orchestrator/report.md`

**A night wave does not end with the text.** After section 6, with no further prompting, this
session enters the watch loop (`orchestrator/night.md`) and stays there until the wave is done.

## The rules that are never module-deep

These fire while the wave table is being written, before any module is loaded.

- **INTENT BINDS, THE DETAIL DOES NOT**, in his live words and in FROZEN ARTIFACTS alike: a number
  in a backlog slug, a receipt's `asked:` line, a sketch in an old handoff, a title's wording are
  paraphrase, so EVIDENCE OF INTENT, never a specification. A row that serves what he WANTED better
  by other means DOES, and says so; "better" is never what a row would rather build. **The detail
  binds where he made it the point:** a taste ruling, a named date, a figure he arrived at himself,
  an explicit "it must be X". Where you cannot tell, serve the intent and REPORT - never stop to
  ask, and never file the difference as a decision he owes an answer to.
- **A wave is ORDER-FREE or it is not a wave**, unless chained on purpose where parallelism buys
  risk instead of time. Two tasks that cannot be made order-free are ONE prompt, or a
  `START on <branch> landing` the loop fires itself (`orchestrator/collisions.md`).
- **A GATE LANDS ALONE.** A session adding or tightening a build gate runs in its own wave or is
  the wave's designated LAST landing. Otherwise every sibling's next merge of `main` brings in a
  gate their prompt never saw, and their red reads as their own fault.
- **The plan ALLOCATES these up front** - the scarce shared slots (migration numbers, a re-recorded
  baseline, `package.json`), each named in its session's `MINTS` (`orchestrator/collisions.md`).
- **Every row names its POOL**, with one clause on the kind of thinking the task rewards.
  Routing is a step of the plan, not a default (`orchestrator/routing.md`).
- **Every pasted task gets a prompt.** Flagging is not vetoing: the concern goes in section 4, the
  prompt still goes in section 5, and the decision stays the user's.
- **One browser-driving job per MACHINE, not per worktree** (`docs/VERIFICATION.md`). Editing
  parallelises; a browser job does not (`orchestrator/collisions.md`).
- **The owner queue is a RECORD, NEVER a gate on what can be started** - report its depth in
  section 4 and plan the row anyway. **A technical problem is never his**: a ROW, never an ask.
- **Verify before you list.** A blocker, a collision or a landing order stated as fact came from a
  command run in this session - not from a handoff's prose, not from memory of yesterday.
- **`TOUCHES` is a forecast**, not a retrospective list. Decomposition: `orchestrator/specs.md`.
- **Stay usable all day.** "Can B start now" is answered from a fresh `worktree-activity.mjs`
  plus `npm run jobs`, never by re-planning.

## Routing - load a module when its phase starts, not before

| Load | When |
| --- | --- |
| [`orchestrator/hosts.md`](orchestrator/hosts.md) | native Codex, or changing execution route; before grounding |
| [`orchestrator/grounding.md`](orchestrator/grounding.md) | after host selection (*every plan*) - the home, the cheap set, the tiered read |
| [`orchestrator/collisions.md`](orchestrator/collisions.md) | the collision pass (*every plan*), and consuming the handoff folder |
| [`orchestrator/pushback.md`](orchestrator/pushback.md) | section 4, and section 6's questions and pick (*every plan*) |
| [`orchestrator/prompts.md`](orchestrator/prompts.md) | writing the prompts (*every plan*) - the block, the line rules, the confirmation pass |
| [`orchestrator/routing.md`](orchestrator/routing.md) | choosing each row's POOL and delegation (*every plan*) |
| [`orchestrator/wave-state.md`](orchestrator/wave-state.md) | writing the plan into the store (*every plan*) - its headings, and the plan check that gates the launch |
| [`orchestrator/launch.md`](orchestrator/launch.md) | only after the plan check passes, when the rows are launched: the Agent tool, a classifier refusal, permission prompts |
| [`orchestrator/night.md`](orchestrator/night.md) | a night wave: follow-ons, continuations, the watch loop |
| [`orchestrator/report.md`](orchestrator/report.md) | the morning report, after a wave has run |
| [`orchestrator/recovery.md`](orchestrator/recovery.md) | a launched row came back substantially wrong: repair it, or rewind and redo |
| [`orchestrator/coherence.md`](orchestrator/coherence.md) | the weekly coherence session, how a big project is phased, and where a wave's lesson goes |
| [`orchestrator/specs.md`](orchestrator/specs.md) | substantial work, decomposition, or a SPEC row's dispatch/completion |
| [`orchestrator/incidents.md`](orchestrator/incidents.md) | the evidence behind a rule, or recording new evidence |

**Specialist workflows this one routes to and never re-implements:** `queue-merge` (how work
reaches `main` - GitHub's merge queue lands it), `check` (review, simplify, verify),
`so` (an independent second opinion on a big call), `handoff`, `walk`, `cleanup-worktrees`,
`rescue` (delegation to Codex). Name the workflow in a prompt; never paste its procedure.

## Learning, without growing the rules

Learning is not adding rules. Record a meaningful failure or surprise as an observation
(`npm run learn -- --area orchestrator --evidence "..."`); one ordinary mistake stays evidence. For
a pattern or an expensive failure, fix the cause first and a rule last, and verify the fix works
(the ladder: `orchestrator/coherence.md`).
