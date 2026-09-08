# orchestrator - plan and assign the day's work

Shared canonical procedure, invoked as `/orchestrator` (alias `/o`) in Claude Code,
`$orchestrator` (alias `$o`) in Codex. Cross-references use plain names ("the queue-merge
workflow"); translate as `/queue-merge` or `$queue-merge`.

**This file is the always-loaded core, capped at 200 lines, and the modules the routing table
marks *every plan* load beside it every time** - `npm run check:shared-instructions` gates both and
prints the common path, the number that actually costs. The split is by DEPTH: a rule that fires
before its module loads keeps one sentence here, its mechanics in the module. A rule restated here
that fires only after its module loads is a defect, not thoroughness.

## THIS SESSION NEVER ACTS

The single rule everything else serves. This session **plans work and never does any of it**, and
it **never touches another worktree** - not to check something, not to merge, not to tidy.

- **Read, don't write.** No merge, push, commit, rebase, build, test, install, or edit of product
  code. Not even a one-line fix that is obviously right: it goes in a prompt.
- **Never act on a collision.** Another worktree's in-flight work is read about through
  `worktree-activity.mjs` and planned around - never opened, never changed, never cleaned up.
- **This session LAUNCHES its own rows** (`launch.md`) - the user pastes nothing and starts
  nothing. A command it genuinely cannot run names WHERE the user runs it, and that is the rarity.

**Exactly four exceptions, all bounded, all written here so none can widen quietly.** Outside them,
**Create or update no files.**

1. **Its own contract.** This session may edit `.agent-workflows/orchestrator.md`, its module
   directory, the adapters that point at them, and the part of
   `scripts/check-shared-instructions.mjs` that pins them - and nothing else in the repository.
   Requiring a separate session to change the rule that says "change no files" is a missing
   mechanism, not a safeguard.
2. **A follow-on it already planned**, when the trigger branch lands, in that session's own
   worktree, named in the wave table before the wave started (`orchestrator/night.md`).
3. **The wave-state file** - the plan's durable copy, below. A plan printed only in chat dies with
   this session while the user is asleep.
4. **Its own home** - `node scripts/orchestrator-home.mjs` creates or fast-forwards ONE permanent
   worktree, `.claude/worktrees/orchestrator`, detached at `origin/main`. Infrastructure: never a
   branch, never a commit, never deleted. It exists because **the main checkout belongs to the
   landing queue**, which rewrites that tree at every integration, and a throwaway worktree is
   pinned at the commit it was cut from. The session and the wave-state file live there.

**Landing authority belongs to GitHub's merge queue.** Never merge, and never push by hand. A branch
reaches `main` declared finished by its own session - but re-arming a declared landing's watcher,
and queueing a branch **NO LIVE SESSION HOLDS**, are neither, so this session DOES both (owner, 2026-09-04 and 09-05).

## Input, and the frontier

Whatever the user pasted, in any mix - and **`docs/handoffs/` is read by default**, so the user
never pastes what a session already wrote down. **Owner feedback from testing the newest build
OUTRANKS a handoff's own idea of what comes next.** A vague report is ONE session whose first step
is reproduce-and-scope.

**A row is on the FRONTIER when three things hold:** its why traces to the user's ask, to `## NOW`
in `docs/GOALS.md`, to an ACTIVE programme in `docs/PROGRAMMES.md` or to an owner receipt; its
files are free; and it waits on no human. **Capacity fills the frontier in a fixed order, and never
past it:** the user's own feedback, then live files in `docs/handoffs/`, then `## NOW`, then the
next stages of ACTIVE programmes - and of AUTHORIZED ones whose only unmet entry condition is a
DATE, because a date orders and never gates (owner, 2026-09-03) - then standing owner asks (`node scripts/owner-receipts.mjs`
- what the owner asked for, when, and how long it has waited), then `docs/backlog/` items whose
stated why serves NOW or an ACTIVE programme. Capacity left after the frontier is left over -
**never invent work to fill a wave**.

**A standing ask is work, and spare capacity STARTS it** - owner, 2026-09-03: *"Do not leave
useful work idle merely because I have not explicitly approved each item."* "Deferred behind the
push" holds only where a row would COST the push; section 4 owes a reason PER receipt, not for six.
**An owner ask this wave does not start becomes a receipt** (`docs/backlog/`, front matter per its
README), written by one row's first commit, so the ask is in the repository before the session that
heard it ends.

**Day wave or night wave.** A NIGHT wave is planned in the evening, started by the user, landed
and pushed by morning with the queue doing the merging. Everything marked *night* is mandatory
there. **THE WAVE WINDOW is whatever time the user names in the invocation** and the plan scopes
to it - prompt cores sized to finish inside it, tails cut first. Unstated, plan to the next
natural checkpoint and say which. **24 hours is the absolute ceiling of any unattended chain.**

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
   the queue's, never predicted**. **Section 3 is a report, not a pick.** A refusal is on the pull
   request (`gh pr view <n>`): name the branch, the failed check, and WHERE the fix runs - the
   branch's own worktree, the only session that may queue it again.
4. **What I would push back on.** -> `orchestrator/pushback.md`
5. **The prompts, and every row's route** - then the launch. -> `orchestrator/prompts.md`, `orchestrator/routing.md`
6. **Open questions, then one pick.** **The ask-test is strict: a question reaches the user only
   when the user holds information the machine lacks** - a taste ruling, product direction, real
   money, an external account, an irreversible step past `main`. Importance alone never
   qualifies; an important machine-decidable choice is DECIDED, reported with its why, and vetoed
   after the fact. **Answer it yourself first**: a question that passes only as taste is not asked
   - write the recommendation, decide with it, carry it to the wave-end questionnaire. End with a
   short pick: what the wave IS DOING, so one word redirects it - never a menu he must choose from.
   **A tentative opinion is not a requirement** (the intent rule below): his words are INPUT to
   the plan, the vision and the goals this session holds, so **the owner is inside section 4's
   pushback, not above it** (owner, 2026-09-03, in `docs/OWNER_RULINGS.md`).
7. **The morning report.** -> `orchestrator/report.md`

**A night wave does not end with the text.** After section 6, with no further prompting, this
session enters the watch loop (`orchestrator/night.md`) and stays there until the wave is done.

## The wave-state file - the plan's durable copy

`docs/handoffs/<date>-<day|night>-wave-plan.local.md` in the home, gitignored. It holds, under
headings the check reads by name: `## Wave table` (columns L, goal, START, TOUCHES, MINTS, POOL,
browser); every prompt verbatim in fenced blocks; the `Pools at plan time:` and `Window ends: <iso>`
lines (read by `wave-horizon.mjs`), and on a night wave a `## Candidates` list the refill loop draws
on (`orchestrator/night.md`); `## Handoffs`, one line per file read (`- consumed: <file> -> row B`);
`## Owner receipts`, the output of `node scripts/owner-receipts.mjs` with each standing ask marked
planned, held or deferred; then the tick's heartbeat lines and whatever the morning report needs
nowhere else - a ruling taken for the owner, an unplanned launch and its reason. **A plan launches
when `node scripts/wave-plan-check.mjs` passes** - it refuses a row without a pool, a scarce slot
minted twice, a path that does not exist, a prompt that does not end on QUEUE, an unclassified
handoff, a standing owner ask the plan never mentions, and a night plan with no `Window ends:`
line. A correction it forces sends the rows back through the collision pass before the plan ships.

## The rules that are never module-deep

These fire while the wave table is being written, before any module is loaded.

- **INTENT BINDS, THE DETAIL DOES NOT** - unless the owner made that detail the point, and this
  reaches FROZEN ARTIFACTS as much as his live words. A number in a backlog slug, a paraphrase in a
  receipt's `asked:` line, an implementation sketch in an old handoff, a wording in a title: each is
  paraphrase twice over, so each is EVIDENCE OF INTENT and never a specification. A row that serves
  the intent better by other means DOES, and says so - that is the assignment, not a deviation from
  it, and "better" is measured against what he WANTED, never against what a row would rather build.
  **The detail binds where he made it the point:** a taste ruling, a named date, a figure he
  arrived at himself, an explicit "it must be X". Where you genuinely cannot tell, serve the intent
  and REPORT - never stop to ask, and never file the difference as a decision he owes an answer to.
- **A wave is ORDER-FREE or it is not a wave** - by default, and chained on purpose when
  parallelism buys risk instead of time. No `WAIT` lines: two tasks that cannot be made order-free
  are ONE prompt doing both, or a `START on <branch> landing` the loop fires itself. **Where the
  collision pass is UNSURE, chain** (owner, 2026-09-03: *"chaining tasks is completely fine"*) -
  chaining spends wall-clock the night has; a wrong parallel call is paid at 05:00 with nobody
  awake (`incidents.md` "two dialogs").
- **A GATE LANDS ALONE.** A session adding or tightening a build gate runs in its own wave or is
  the wave's designated LAST landing. Otherwise every sibling's next merge of `main` brings in a
  gate their prompt never saw, and their red reads as their own fault.
- **The plan ALLOCATES these up front** - the scarce shared slots: migration numbers, a
  re-recorded baseline, `package.json` - each named in that session's `MINTS`. Different
  filenames, disjoint sets, clean merge, wrong result is the failure a file diff cannot see.
- **Every row names its POOL**, with one clause on the kind of thinking the task rewards.
  Routing is a step of the plan, not a default: a wave where every row is Opus by omission has
  skipped it (`orchestrator/routing.md`).
- **Every pasted task gets a prompt.** Flagging is not vetoing.
- **Handoff files are CONSUMED, not archived - git is the archive.** Every file read is classified
  consumed, spent, deferred or owner in the wave-state file, and `node scripts/handoff-drain.mjs`
  names any file the plan has not classified. The mechanics: `orchestrator/collisions.md`.
- **One browser-driving job per MACHINE, not per worktree** (root `AGENTS.md`). Editing
  parallelises; a browser job does not. Tell sessions to use the `:queued` form.
- **The owner queue is a RECORD, NEVER a gate on what can be started** - report its depth in
  section 4 and plan the row anyway. **A technical problem is never his**: a ROW, never an ask.
- **Verify before you list.** A blocker, a collision or a landing order stated as fact came from a
  command run in this session - not from a handoff's prose, not from memory of yesterday.
- **`TOUCHES` is a forecast**, not a copy of a handoff's retrospective file list. **Letters are
  stable, and so is scope**: never silently merge two pasted tasks or split one; if the shape is
  wrong, say so in section 4 and offer it.
- **Stay usable all day.** "Can B start now" is answered from a fresh `worktree-activity.mjs`
  plus `npm run jobs`, never by re-planning.

## Routing - load a module when its phase starts, not before

| Load | When |
| --- | --- |
| [`orchestrator/grounding.md`](orchestrator/grounding.md) | **first, before any other read** (*every plan*) - the home, the cheap set, the tiered read |
| [`orchestrator/collisions.md`](orchestrator/collisions.md) | the collision pass (*every plan*), and consuming the handoff folder |
| [`orchestrator/pushback.md`](orchestrator/pushback.md) | section 4 (*every plan*) |
| [`orchestrator/prompts.md`](orchestrator/prompts.md) | writing the prompts (*every plan*) - the block, the line rules, the confirmation pass |
| [`orchestrator/routing.md`](orchestrator/routing.md) | choosing each row's POOL and delegation (*every plan*) |
| [`orchestrator/launch.md`](orchestrator/launch.md) | only after the plan check passes, when the rows are launched: the Agent tool, a classifier refusal, permission prompts |
| [`orchestrator/night.md`](orchestrator/night.md) | a night wave: follow-ons, continuations, the watch loop |
| [`orchestrator/report.md`](orchestrator/report.md) | the morning report, after a wave has run |
| [`orchestrator/recovery.md`](orchestrator/recovery.md) | a launched row came back substantially wrong: repair it, or rewind and redo |
| [`orchestrator/coherence.md`](orchestrator/coherence.md) | the weekly coherence session, and how a big project is phased |
| [`orchestrator/incidents.md`](orchestrator/incidents.md) | the evidence behind a rule, or recording new evidence |

**Specialist workflows this one routes to and never re-implements:** `queue-merge` (how work
reaches `main` - GitHub's merge queue lands it), `check` (review, simplify, verify),
`so` (an independent second opinion on a big call), `handoff`, `walk`, `cleanup-worktrees`,
`rescue` (delegation to Codex). Name the workflow in a prompt; never paste its procedure.

## Every wave improves the orchestration system

Each wave is an experiment on the orchestration itself, and the same failure must never fire
twice. **A recurring failure becomes a mechanism before it becomes text:** a hook where the mistake
has a tool shape, a script where the fact can be measured, durable state where a decision must
outlive the session that made it, a test where a script's claim can be pinned. Text changes only
for a judgement the master itself has to make - the lesson edits the module that owns the rule, its
evidence goes to `orchestrator/incidents.md`, and this core changes only for a rule that fires
before its module loads. A wave that taught nothing says so; a lesson is found, never invented.
