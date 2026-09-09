# The night wave - follow-ons, continuations, and the watch loop

## Follow-on waves

**Night only, and the one thing this session is allowed to start.** A follow-on is work that
genuinely does not exist until another branch lands - the second half of a rename, a caller update
after a signature change, a measurement that needs the fix in `main`. In a day wave it is simply
the next invocation. In a night wave the user is asleep, so a follow-on that waits for morning
wastes the hours the wave existed to use.

**Two kinds, and both are planned before the wave starts:**

- **The logical consequence.** Known in advance, blocked only by the landing. Its prompt is
  written in full in section 5.
- **The expected surprise.** The SHAPE is predictable even though the content is not - "if the
  flake reproduces, fix its cause; if twenty runs cannot reproduce it, harden the assertion
  instead". Write it as a conditional prompt whose branch is chosen from what the trigger
  session's own **handoff file** says. That file is the channel: the loop reads
  `docs/handoffs/<date>-<letter>-*.md` on the landing and picks the arm, or launches nothing if
  neither arm applies.

The rules that keep it from becoming an unattended agent doing whatever it likes:

- **It must be in the wave table before the wave starts**, with its letter, its `TOUCHES`, its
  trigger branch, and its full prompt in section 5. The user approves its shape before bed. **A
  follow-on that was not planned is never launched** - a genuinely novel discovery at 03:00 goes
  in the morning report as a candidate row, and waits for a person. Planned SHAPE with unplanned
  CONTENT is the most a night gets to decide on its own.
- **The trigger is a landing, checked, never assumed**: `git fetch` then
  `git merge-base --is-ancestor <branch> origin/main`. A queued job is not a landed branch.
  **Containment alone is not a landing** - a branch that has never committed is trivially an
  ancestor of `origin/main`, so that check alone fires the moment the branch is CREATED. The
  landing signal is containment for a branch the loop previously saw AHEAD of main, which is why
  `wave-tick.mjs` keys its `LANDED` event on the transition rather than the state. When checking
  by hand, `git rev-list --count origin/main..<branch>` returning 0 means either landed or empty,
  and only the previous tick tells you which. Evidence: `incidents.md` "the empty branch that read
  as landed".
- **It runs in its own worktree**, so it can never edit the files another session is holding.
- **It queues itself and writes its own handoff**, exactly like a session the user started. This
  session still never merges and never pushes.
- **Cap the chain at one** for planned follow-ons. Deeper unattended planning runs through handoff
  continuations below, which carry their own bounds.

## Handoff continuations - the wave that feeds itself

**A landed handoff that waits on no human may seed a new session without having been planned.**
This is the loosening the follow-on rules deliberately did not make, and it is bounded by the WHY
chain instead of by pre-approval:

- **A continuation opens with FRESH EYES ON THE PRODUCT, not on the prose.** Its first step is
  driving what the trigger session landed - does it work, is it logical, does it serve the why -
  before building on it. A handoff describes what its author believes happened; the fresh read is
  what catches the belief being wrong, and what it finds goes in the continuation's own handoff
  either way.
- **A continuation is a FRONTIER row the landing just uncovered, and nothing else.** Its GOAL and
  WHY come from the landed handoff's own "what is left"; that why traces to `## NOW`, an ACTIVE
  programme, an owner receipt or the wave's stated goals; its files are free; and it waits on no
  human - an item that needs a ruling, a walk, a payment or a credential goes to needs-you in the
  report, never continued around. The loop writes the prompt in the section-5 format, quoting the
  handoff's why verbatim, and names its POOL like any row. Work whose why the loop cannot trace is
  a candidate row in the report, never a launch - the north star is what keeps an unattended loop
  from optimising toward nowhere.
- **Bounds:** chain depth at most 2 from any owner-started session; total continuations per wave
  at most the wave's own session count; each runs in its own worktree, queues itself, and writes
  its own handoff, exactly like a planned session.
- **THE REPORT IS THE CHECKPOINT.** Continuations run only inside the wave window; no chain
  crosses a report. The report lists every continuation launched, with its traced why - and the
  next wave needs the owner's go. This is the owner's protection against the day that went happily
  in the wrong direction: the loop can extend a wave, never extend itself.

## The watch loop

**A night wave enters this automatically**, as the last action of the invocation, without being
asked. Staying awake is a LOOP, not a daemon: this session only sees a landing if something wakes
it to look.

- **In Claude Code the wake-up is an EVENT, not a nap.** Arm `node scripts/wave-watch.mjs` as a
  persistent Monitor: it runs the tick on a short interval and prints ONE LINE PER EVENT and
  nothing else, so a landing wakes this session within minutes and a quiet night wakes it never.
  Arm `node scripts/ci-watch.mjs` as a second one: every run that goes RED anywhere in the repo
  reaches this session the minute it does, named by failing spec, and `main` turning green again is
  a line too - the "owner got the email, the loop never heard" gap. Say in one line that both
  watches run; never poll or sleep in the foreground - the Monitors' events are the only wake-up.
- **In Codex** there is no Monitor, so a night wave there is planned with **no follow-on rows and
  no refill at all** - the work is collapsed into bigger prompts instead, and its morning report
  comes from re-invoking this workflow. Say that out loud in section 7 rather than leaving the user
  to notice the difference.

Each tick, in this order, and nothing else:

1. `node scripts/wave-tick.mjs` - ONE command that does the whole observation leg: `git fetch`,
   the per-branch `merge-base --is-ancestor` landing checks (a queued job is not a landed branch),
   the queue and landings, `blocked-sessions.mjs`, the green-but-unqueued check (a branch ahead of
   main, clean tree, session idle, nothing queued - the ended-expecting-a-watcher failure, seen
   from outside; the Stop hook `scripts/hooks/stop-wait.mjs` catches the same failure from inside,
   at the turn that ends on a wait), and the heartbeat append to the wave-state file. It prints only the DELTA since
   the last tick; a no-event tick prints one line. Every event is ALSO appended to
   `<git-common-dir>/noacg-jobs/wave-tick-events.log`, because an event is announced exactly once
   and stdout can be lost to compaction - the morning report reads that log, not the loop's
   memory. The script observes and never acts - launching, holding and every judgement stay in
   this session.
2. Read the delta. What refused, and which kind (`report.md`); what landed; who is waiting. A
   stalled worker is REPORTED, never killed - but its slot counts as free when launching cohort
   rows, so one hung session cannot park the rest of the night behind it.
   **A branch tip that has stopped moving is NOT the stall signal**, and reading it as one has
   already produced a wrong diagnosis (`incidents.md` "the seven-hour hang that was not one"). The
   transcript is the instrument that actually fits - Claude Code writes the tool CALL when it is
   made and the RESULT when it returns, so a call still carrying no result is a session waiting,
   at that instant, on that call. A session grinding through a suite has results arriving; a stuck
   one does not.
   **EACH INSTRUMENT ANSWERS ONE QUESTION AND NO OTHER**, and substituting one for another nearly
   cost a live row its branch on 2026-09-08. `blocked-sessions.mjs` answers who is HELD on a
   call - a working session has results arriving and never qualifies, so an empty list is silence
   about every session, not an all-clear about any. `claude-agents.mjs` answers what the harness
   LISTS as running, and never sees an Agent-tool subagent, a Codex session or another machine.
   Neither answers "is this row alive"; the three-signal test below does.
   **A wait is one of three things**: a permission prompt nobody answered, a call still running, or
   a session no longer running at all. The inventory separates the third, so every waiting line
   carries whether a process holds it; the first two are inseparable, the tick says so rather than
   guessing, and both want the same action. The 30-minute threshold clears every shell command (the
   Bash tool is killed at 600 s) but not a blocking agent fork or a slow MCP call, so a long review
   leg surfaces as "waiting" behind a live process, never as "stuck". A wait behind NO live process
   is the one that changes the night: that row is not coming back, its slot is free and its work is
   unfinished. Report it, kill nothing, and treat an absent process as evidence, never proof.
3. For every follow-on whose trigger has now landed, launch it in its own worktree with the prompt
   already written in section 5. Never one that is not in the wave table.
4. **REFILL a free slot.** A slot is free when a row landed or its process is gone and the machine
   is under its concurrency ceiling. **`node scripts/candidates.mjs --plan <wave-state file>`** reads
   the candidate list below and names the next one to launch - it runs the instruments over the
   whole list and prints `LAUNCH <letter>` for the first candidate that is collision-CLEAR against
   every running row's REAL diff (`collision-check` reads what a branch changed, never what it
   forecast), whose BROWSER SLOT is free (a candidate naming e2e specs is taken to need it, held
   while a running row holds it) AND whose size still FITS the window (`wave-horizon`). A held unit
   carries its reason, and the pick falls through to the next one in the order. Launch the
   pick exactly like a planned row (its own worktree, its own queue, its own handoff), record
   the start with `node scripts/wave-launch.mjs record --letter <L> --branch <b> --size <size>` so
   the horizon learns, and append the launch and its traced why to the wave-state file. A refill
   unit is a **frontier row the loop launches under the WHY chain**: its why traces to `## NOW`, an
   ACTIVE programme, an owner receipt or the wave's goals, or it is a candidate row in the report,
   never a launch. **The bound is the HORIZON and the report, not a count.** The handoff
   continuations below were capped at the wave's session count because they had no other limit;
   refill has one - it runs until `wave-horizon.mjs` closes the window or the report checkpoint is
   reached, still inside the 24-hour ceiling, and supersedes that count cap for a refilled unit. **This is not the follow-on rule loosening**: a
   follow-on is trigger-chained and pre-planned; refill launches a fresh frontier unit whenever a
   slot opens, driven by the two measurements rather than by the master's read of the clock.
5. A row that came back substantially wrong is judged against `recovery.md` - repaired, or
   rewound and re-launched with a corrected assignment. A rewind is a NEW row in a NEW worktree;
   this session still never touches the old one.
6. Otherwise do nothing. **A tick with no landing is a no-op, not a report** - a night of "still
   waiting" messages is what the no-op tick exists to prevent. Refilling never manufactures a
   report either: a launch is one heartbeat line, a held candidate none.

**The candidate list.** The planner writes MORE units than the slots can hold, ordered, in the
wave-state file under `## Candidates` as a TABLE `candidates.mjs` reads - columns
`L | size | serves | TOUCHES | SPECS | goal` plus an optional `browser` (`yes`/`no` only; any other
cell derives the need from SPECS); `size` is `small`, `standard` or `large` (`wave-horizon`),
`TOUCHES` and `SPECS` are the files and covering specs (`collision-check`), and `serves` traces the
why to `## NOW`, an ACTIVE programme or an owner receipt. Each candidate is a FRONTIER unit under
the same WHY chain as a continuation; the fields come from its backlog item's front matter
(`serves`/`size`/`touches`/`covered-by`, `docs/backlog/README.md`). A unit that collides or does not
fit is held, not dropped, and re-tried when a slot or the window allows. When the list is spent and
the horizon still shows room, the loop launches ONE fresh planner subagent to extend it from what has
landed - never plans the units itself, because a thin loop with the whole night in its head is the
context cost this design removes.

**Stopping is the HORIZON, not a percentage of the night.** The loop stops refilling when
`wave-horizon.mjs` reports that no size still fits - remaining window under the smallest unit's
launch-to-land estimate plus the measured landing latency plus a buffer. It ends, and produces the
morning report, once nothing is running, nothing is queued, and nothing more fits; it also ends on
the user's word. A row that overruns the window is not a failure - it lands after the owner wakes,
and the queue refuses only an unlanded conflict, never a late one. **Never a fixed cadence and
never a fraction of the night**: the wake-up is the Monitor's events, the stop is the measured
horizon, and both are readings rather than guesses.

**A REFUSAL THE BRANCH DID NOT CAUSE IS REPAIRED BY THE LOOP, NOT REPORTED.** Read the watcher job's
log and the pull request to a verdict and name which kind it is (`report.md`). Two are the
machine's: a watcher that reached no verdict inside its cap while the pull request is still queued
(`node scripts/jobs.mjs requeue <branch>` re-arms the watcher and lands nothing itself; the store
already retries that once), and a stacked pull request dropped from the queue when its parent
landed with every check green. **Repair that second one with `npm run queue:merge -- <branch>`**,
which re-posts the verdict and turns auto-merge back on - it reads the `/check` stamp like any
queueing, so an unstamped tip needs the `--unreviewed` form below. `gh pr merge <n> --auto` does the
same job in one call, but the auto-mode classifier BLOCKED it on 2026-09-08 on the one branch that
needed it, so a loop knowing only the raw command has no repair at 03:00. A RED CHECK or a CONFLICT
with what landed is the branch's, and only its own session may queue it again - it reaches the user,
with its command, when that session is gone.

**A BRANCH WHOSE SESSION IS STILL ALIVE IS THE ONE THING THE LOOP MAY NOT QUEUE.** Queueing it
would be this session declaring another session's work done, which is the one rule landing has
(root `AGENTS.md`, "Git"). Nothing waits on it either: the queue holds no landing for another
branch, so an unqueued live branch costs nobody anything until its own session queues it.

**But a branch NOBODY CAN DECLARE is not that case, and the loop queues it itself** (owner,
2026-09-05: *"You shouldn't need me for landing branches."*). No live session is in it, so there is
no declaration being pre-empted - there is no declarer. **The test is THREE liveness signals that
must ALL be quiet - any one of them speaking means alive:** the harness's live-session inventory,
the branch tip's age, and the mtime of the session's transcript. **`blocked-sessions.mjs` is not
one of the three** - it answers a different question (step 2). **The inventory ALONE is not
enough and reading it that way is the trap**: it fails open for subagents, and on 2026-09-05 it
reported a row idle while that row was committing every four minutes and about to queue itself
(row Z's measurement, `incidents.md`). A tip that moved in the last half hour is alive whatever any
inventory says. **Then the queue-merge workflow's section 2 probe** - `git merge-tree --write-tree
origin/main <branch>`, and `merge-order.mjs --branch <branch>` for a branch that contains another
unlanded one - because a conflicting or stacked pull request never enters the queue and the session
that could fix it is gone: either is a candidate row in the report, never a queueing. Then
`npm run queue:merge -- <branch>` (with
`--unreviewed "queued by the night loop: the session is gone"` when the tip carries no `/check`
stamp - it refuses an unstamped tip otherwise, and the reason lands on the pull request), and the
report says which branches the loop queued and why. **What protects a half-finished branch is the
GATE, not the owner's attention**: the queue runs `ci.yml` on the pull request and again on the
merge group, refuses red, and lands one group at a time. Asking him instead buys no safety and
costs the landing. **Whatever is uncommitted stays uncommitted** - the landing takes the branch's
gated state and the row's handoff describes the rest, which is what every prompt's QUEUE step
already says to do.

**An EMPTY WORKTREE is not a session, and a live session is not an idle one.** Both halves were
paid for on 2026-09-05: a branch flagged FINISHED-LOOKING twice an hour apart was alive both times,
and a first draft that also demanded NO WORKTREE would have stranded row S - fully gated, `/check`
run in all four legs, a handoff written, its dead session in a worktree nobody was in. A directory
is not a declarer, and a stopped tip is not a verdict.

**The loop never merges, never pushes, and never touches another worktree's files.** It watches,
it launches what was planned, and it reports.

**The loop is ADDITIVE, never load-bearing, and the wave is planned so that stays true.** Every
starting prompt queues itself, so the wave lands with or without anything watching. Nothing a
starting prompt needs may depend on the loop being alive, which is also why a follow-on is never
allowed to hold work that the wave actually needs: if it is needed, it belongs inside a starting
prompt as one more step. **Subagent launches raised the stakes without changing the rule:** a
background subagent dies with this session, so what now rides the loop is not just the follow-ons
but every in-flight subagent worker and every unlaunched cohort row. Plan accordingly - the wave's
CORE goes into the sessions started at wave start, and the loop only ever carries work the night
can afford to lose.

**A dead loop must be visible, because a silent one looks exactly like a quiet one.** The morning
report states how many ticks fired and when the last one was - read from the wave-state file's
heartbeat, so the death is timestamped rather than inferred. A report that says "1 tick, 22:40"
after a seven-hour night is the loop having died at the first tick, and it reads as a defect
rather than as calm. It has died in both observed nights (`incidents.md`, "the loop that died
twice"), which is why the additive rule above is the most load-bearing sentence in this file, and
why the wave-state file is where the loop writes what the morning must know - an unplanned launch
and its reason, a ruling taken on the owner's behalf, a correction to something the owner was
told - as it happens, never from memory at the end.
