# Agent lifecycle: finished work closes itself, decisions come at once, plans run phase by phase

## Problem and authority

Agents leave things running that nobody needs, and the owner is the one who notices. On
2026-10-09 a background command (`until docker info; do sleep 5; done`) had polled for 14 hours
because Docker was not running. It also kept its session from being auto-archived, since the
desktop app never archives a session with background work. Four idle session processes from the
day before held about 0.9 GB. This week the machine (16 GB) was memory-constrained, and the dev
ports ran out (since fixed: ports are reserved only when a server starts, and landed worktrees
clean themselves up).

The same conversation exposed three more problems. The end-of-session handoff invites optional
follow-ups, which agents then build into systems nobody asked for. Decisions are filed as
`needs owner` issues, and agents file far too many, so the owner's queue fills with notes to read
later. And a long plan (the editor) moves one phase per session, but the next phase only starts
when the owner copies a prompt from the last session, which the owner rarely has time to do.

**Owner, 2026-10-09** (the authority for this record, from the conversation that wrote it):

- Nothing should stay open for the owner to look at. The owner reviews on `main` and the live
  site, later and when there is time, never in the same session. When an agent is done, it closes
  what it no longer needs. Agents still get whatever they need while they work.
- Cleanup is **strict**: once an agent's work has landed, or nothing has used it for a while,
  everything that agent started is closed. Only processes explicitly marked as long-running, such
  as the orchestrator's, are exempt.
- A session must never stop just because a task it started did not end. It notices the task did
  not end, fixes the cause and starts it again.
- A wait gets a time limit, but not a harsh one: when it needs more time, the agent starts a new
  wait.
- **Decisions are asked in the session, at once.** "I do not want a note that I need to read
  later. I want to fix the issue right then and there." No new `needs owner` issues.
- Two kinds of handoff. **Loose ends** should not exist: a session fixes them. A **phase handoff**
  in a long plan carries what the next phase must take into account, from the agent that did this
  phase, without the owner carrying it.
- A long plan runs phase by phase, each phase in a fresh session, with a different fresh session
  checking it before the next phase starts. The owner starts a run by naming the plan, and it runs
  until its time limit. Never more than 24 hours, since the owner closes the computer now and then.
- A plan run and a normal wave are **two skills**, and a night runs **one or the other**. Both
  work in Codex as well as Claude Code, since the owner uses both.
- Neither may get worse as the night goes on: fresh context for every step, clear plans and clear
  acceptance, so nothing gets built that was not asked for.
- Build order: cleanup first, then the editor plan's reference check, then the rest.

## Behaviour

### Waits end, so agents notice when they are stuck

1. **Every wait has a time limit.** The command guard refuses a polling loop with no limit
   (`until`/`while` around a `sleep` with no `timeout` or deadline) and says how to add one. A
   limit of up to an hour is fine, and an agent that needs longer starts another wait. A polling
   loop costs a few megabytes, so the problem is never its memory: it is that a wait with no end
   never tells anyone it failed.
2. **A wait that runs out wakes its agent.** The command exits with a failure, the agent is told,
   and the agent finds out why, fixes it and starts again, or changes course. That is how a session
   learns it is stuck instead of waiting forever. The existing stop-wait hook already covers a
   session that ends its turn waiting on something that cannot wake it.

### Cleanup

Code only, run by hooks and the sweep that already exist. It spends no model tokens and needs no
agent to remember anything.

3. **Landed work takes its processes with it.** When the unattended sweep removes a worktree, it
   first closes every process running from that worktree: dev servers, test browsers, shell
   loops, delegations. Today it closes only Codex delegations (`reapDelegationTrees`).
4. **Abandoned processes are closed after one hour.** A process a Claude Code or Codex session
   started is closed when that session and its worktree have both shown no activity for an hour.
   A working agent is never quiet, so this only catches what was left behind. If an agent does come
   back to a closed dev server, it starts it again. The sweep already runs at session start and
   after each landing (`scripts/land-watch.mjs`), at most every 30 minutes; this adds a step to it.
5. **The exemptions are a short written list**: the merge queue and job queue runners, a running
   orchestrator or plan run and the rows it launched, each live session's own process and its MCP
   servers, and the owner's own applications. Adding to the list is a reviewed code change.
6. **Sessions archive when their pull request merges.** The app setting "Auto-archive sessions when
   their pull request closes" goes on once the handoff changes below have landed. After that,
   nothing lives only in a chat, and an archived chat can still be reopened and asked.

### Decisions

7. **A session with the owner present asks at once.** One question, with a recommendation, in the
   session, and the work continues from the answer. No `needs owner` issue for it.
8. **An unattended session (a wave row or a plan run) decides for itself** and records the decision
   in its pull request, where it can be reverted. Only what the owner's instructions reserve (money,
   accounts, an important security or privacy boundary, something genuinely hard to undo) is not
   decided: that one item stops, the run carries on with other work, and the coordinator asks the
   owner in its own session and sends a phone notification. An answer there lets the item resume.
9. **The rule changes at its source.** The root rule that routes a decision to a `needs owner`
   issue (`contracts/rules/root/verify-proportion-change-against-spec-acceptance.md`) is changed
   with `npm run learn`, and so is the verify workflow (`.agent-workflows/verify.md`), the one
   workflow that opens such issues. The orchestrator and the weekly session only read them, and
   existing open issues stay where they are, for `/walk`.

### Handoff

10. **Loose ends: nothing optional.** `/handoff` no longer offers optional follow-ups. A session
    fixes what it can and asks the owner what it cannot decide (point 7). If nothing is left, the
    handoff is the archive verdict and nothing else.
11. **Phase notes go into the plan, in the same pull request as the work.** A session that finishes
    a phase adds the notes for the next phase to the plan document: what changed that the next
    phase must allow for, decisions taken, traps found, and what the check found. It goes in the
    pull request because every session works in its own copy of the repository, made from `main`,
    and the sweep deletes that copy after landing. A note left anywhere else never reaches the next
    phase, nor a cloud session.

### Plan run (new skill, `/plan-run`)

12. **The owner names the plan and the time limit**, for example `/plan-run editor until 18:00`.
    The skill keeps a short list of runnable plans, each pointing at its plan document, and reads
    that document's phases, acceptance and notes. It refuses a plan whose phases lack acceptance
    criteria, runs only phases written in the plan, never invents one, and stops when the plan ends
    or the time limit comes, whichever is first. The limit is at most 24 hours.
13. **One plan run or one wave, never both.** A plan run opens through the same wave store, so
    each refuses while the other is open.
14. **Each phase is two fresh sessions.**
    - A **builder** does the next phase against its acceptance criteria, writes the phase notes
      (point 11), passes `/check`, and lands through the merge queue like any wave row.
    - A **checker** that never saw the build tests the result on `main`. It tries it the way a user
      would, checks the phase's acceptance and the user outcome the plan states, and where the plan
      names reference products (the open-source editors), compares the same interaction there. Its
      findings go into the plan's phase notes.
    - The **next phase starts only after the check passes**, so nothing is ever built on an
      unchecked phase. Checking `main` rather than the branch tests what users actually get and
      keeps the merge flow unchanged.
15. **A failed check gets one repair, then that item stops.** One builder session fixes the phase
    with the checker's findings and the checker runs again. A second failure is a stuck run: the
    coordinator asks the owner (point 8) and does not continue the plan past it.
16. **The coordinator stays thin, so it does not get worse.** It reads the plan's phase list and
    short results, never code, and keeps its state in the wave file. When the computer was closed,
    or the session restarted, starting the same run again continues from the next unfinished step
    and launches nothing twice. All real work runs in fresh sessions.
17. **The editor plan carries its reference check.** The rule that implementers inspect and try the
    open-source reference editors is only in the research copy
    (`docs/research/editor-consolidation-2026-09-17/EDITOR_REBUILD_PLAN.md`). It moves into the live
    `docs/EDITOR_REBUILD_PLAN.md`, and becomes part of the checker's work after each phase.
18. **It works in Claude Code and in Codex.** The owner uses both. `/plan-run` is one shared
    procedure in `.agent-workflows/`, with a Claude command and a Codex skill pointing at it, as
    the orchestrator is. In Codex, the builder and checker are native subagents started without
    the coordinator's context, each in its own `git worktree add` worktree, and the coordinator
    wakes on a thread heartbeat. A question for the owner is asked in the coordinator's own thread;
    the phone notification is Claude Code's, and Codex gives its own notice when the turn ends.
    The endless-wait refusal (point 1) is a Claude Code hook and this repository configures no
    Codex hooks, so the row checks whether Codex can run the same check; where it cannot, the
    one-hour cleanup (point 4), which is plain code, covers processes Codex started.

## Preserved behaviour

- `/orchestrator` keeps working as it does now: many tasks, rows in parallel, backlog from Issues.
  Only the shared pieces change (the wave store learns the plan-run kind; the sweep closes more;
  decisions follow points 7 to 9).
- The merge queue stays the only way to `main`.
- Dev-port reservations, the worktree sweep's landing and quiet rules, and its safety checks stay.
- No session, worktree or process the owner started is touched.
- Production migration refusals keep their existing route (their own rule, not this one).

## Non-goals

- No automatic start of a plan run. The owner starts each one.
- No trigger, scheduler or always-on service of its own. The cleanup rides on what already runs.
- No "does it feel as good" verdict from an agent. The checker reports behaviour, acceptance and
  differences from the reference. Feel stays the owner's call when trying it on `main`.
- No change to the owner's machine settings. Capping WSL and Docker memory is offered separately.
- The console-window flicker seen on 2026-10-09 is not diagnosed here. A 30-minute watch caught
  nothing, and the leftover loop was not its cause.

## Acceptance

### AC-1: A wait with no limit is refused, and one that runs out wakes its agent

Scenario: a session runs `until docker info >/dev/null 2>&1; do sleep 5; done`. The guard refuses
it and says how to add a limit. The same loop under `timeout 60`, with Docker stopped, exits with a
failure after a minute, and the session is told.

### AC-2: Removing a landed worktree closes everything running from it

Scenario: in a disposable worktree, start a dev server, a sleeping shell loop and a test browser,
then land and sweep it. Afterwards none of the three processes exists, and the removal does not
report a locked folder.

### AC-3: Abandoned processes close after an hour, and exempt ones do not

Scenario: with the clock moved forward in a test, an agent-started shell loop whose session and
worktree have been quiet for an hour is closed by the next sweep. A merge queue runner, a live
session's MCP server and an owner application of the same age are left running.

### AC-4: The editor plan states the reference check

Scenario: `docs/EDITOR_REBUILD_PLAN.md` itself, not only its research copy, tells each phase to
inspect and try the reference editors, and tells the checker to compare against them.

### AC-5: Decisions are asked at once, never filed

Scenario: the root rule and the verify workflow no longer route a decision to a `needs owner`
issue. An attended session asks the question in the session; an
unattended one decides and records it in its pull request, or, for a reserved decision, stops that
item while the coordinator asks in its session with a phone notification.

### AC-6: The handoff offers no optional work

Scenario: `/handoff` at the end of a session with no remaining work prints the archive verdict and
nothing more. The handoff procedure no longer contains an "optional follow-ups" section.

### AC-7: A finished phase leaves its notes in the plan on main

Scenario: a builder session completes a phase. The pull request that lands it also adds the next
phase's notes to the plan document. A fresh session given only the plan name can state what the
next phase must take into account.

### AC-8: A plan run moves phase by phase with a separate check

Scenario: `/plan-run` on a small test plan of three phases. Each phase is built in its own session
and checked by a different session, and no phase starts before the previous one's check passed.
The wave file shows build, land and check in order for each phase, and the run ends when the plan
ends or its time limit comes.

### AC-9: A failed check repairs once, then stops and asks

Scenario: a phase whose check fails twice. One repair session runs. The second failure stops the
plan at that phase, the coordinator asks the owner in its session with a phone notification, and
the run's report says why.

### AC-10: A plan run and a wave exclude each other

Scenario: while a plan run is open, opening a wave is refused, and the other way round. A plan run
asked for more than 24 hours is refused.

### AC-11: A plan run continues after a restart without repeating anything

Scenario: stop a plan run's coordinator mid-run (as closing the computer does) and start the same
run again. It continues from the next unfinished step and launches nothing twice.

### AC-12: Archive on merge is on

Owner step after AC-6 and AC-7 land: the app setting "Auto-archive sessions when their pull
request closes" is on.

### AC-13: A plan run works from Codex as well as Claude Code

Scenario: the small test plan from AC-8 runs to its end from Codex, with each phase built and
checked by Codex subagents that did not inherit the coordinator's context, and AC-11's restart
holds there too. From Codex, an abandoned shell loop is closed by the sweep (AC-3), and the
endless-wait refusal either works or the record says why Codex cannot run it.

## Decisions taken while writing (revisit freely)

- **One hour, not three, for abandoned processes.** The owner suggested it could be shorter, and
  with time limits on every wait (point 1) a working agent's tasks end on their own, so the sweep
  only catches what was left behind.
- **Wait limits are up to an hour each**, renewable by starting a new wait.
- **The checker tests `main` after landing.** The next phase waits for the check, so nothing builds
  on an unchecked phase, and it tests what users get.
- **The skill is `/plan-run <name>`**, with a short list of runnable plans in the skill.
- **Build order:** AC-1 to AC-3 (cleanup), AC-4 (editor plan), AC-5 to AC-7 (decisions and
  handoff), AC-8 to AC-11 and AC-13 (`/plan-run`, in both tools), AC-12 (owner's setting) last.
