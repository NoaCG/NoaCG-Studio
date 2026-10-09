# Agent lifecycle: finished work closes itself, and long plans run phase by phase

## Problem and authority

Agents leave things running that nobody needs, and the owner is the one who notices. On
2026-10-09 a background command (`until docker info; do sleep 5; done`) had polled for 14 hours
because Docker was not running. It also kept its session from being auto-archived, since the
desktop app never archives a session with background work. Four idle session processes from the
day before held about 0.9 GB. This week the machine (16 GB) was memory-constrained, and the dev
ports ran out (since fixed: ports are reserved only when a server starts, and landed worktrees
clean themselves up).

The same conversation exposed two handoff problems. The end-of-session handoff invites optional
follow-ups, which agents then build into systems nobody asked for. And a long plan (the editor)
moves one phase per session, but the next phase only starts when the owner copies a prompt from
the last session, which the owner rarely has time to do.

**Owner, 2026-10-09** (the authority for this record, from the conversation that wrote it):

- Nothing should stay open for the owner to look at. The owner reviews on `main` and the live
  site, later and when there is time, never in the same session. When an agent is done, it closes
  what it no longer needs. Agents still get whatever they need while they work.
- Cleanup is **strict**: once an agent's work has landed, or after about three hours with nothing
  using it, everything that agent started is closed. Only processes explicitly marked as
  long-running are exempt.
- Two kinds of handoff, treated differently:
  - **Loose ends** should mostly not exist. A session fixes obvious loose ends itself. What
    remains is a new problem or a decision the owner must make, never a menu of optional work.
  - **Phase handoff** in a long plan: what the next phase must take into account, from the agent
    that did this phase. It must reach the next phase without the owner carrying it.
- Long plans continue automatically, **but only when the owner starts a run**. Each phase runs in a
  fresh session. A different, fresh session checks the phase worked as intended before the next
  one starts. The run stops only for something that must be fixed or decided before continuing.
- A plan run and a normal wave are **two skills**, and a night runs **one or the other**, never
  both.
- Neither may get worse as the night goes on. Fresh context for every step, clear plans, clear
  acceptance, so nothing gets built that was not asked for.
- This spec is shown to the owner before it goes live.

## Behaviour

### Cleanup

The rule is simple: a process an agent started lives as long as the work it serves, and no longer.
Everything here is code that runs on its own (hooks and the existing sweep). It spends no model
tokens and needs no agent to remember anything.

1. **Endless waits are refused when they are written.** The command guard refuses a polling loop
   with no limit (`until`/`while` around a `sleep` with no `timeout` or deadline) and says how to
   add one. This is where the 2026-10-09 loop would have stopped.
2. **Landed work takes its processes with it.** When the unattended sweep removes a worktree, it
   first closes every process running from that worktree: dev servers, test browsers, shell
   loops, delegations. Today it closes only Codex delegations (`reapDelegationTrees`).
3. **Quiet work is closed after three hours.** A process that a Claude Code or Codex session
   started, has run for more than three hours, and belongs to a worktree with no activity in that
   time, is closed. The sweep already runs at session start (at most every 30 minutes) and at
   each wave tick; this adds a step to it.
4. **The exemptions are a short written list**: the merge queue and job queue runners, a running
   orchestrator or plan run and the rows it launched, each live session's own process and its MCP
   servers, and the owner's own applications. Nothing else is exempt, and adding to the list is a
   reviewed code change.
5. **Sessions archive when their pull request merges.** This is the app setting "Auto-archive
   sessions when their pull request closes", turned on by the owner once the handoff changes below
   have landed. After that, nothing lives only in a chat. An archived chat can still be reopened
   and asked.

### Handoff

6. **Loose ends: no list of optional work.** `/handoff` no longer offers optional follow-ups. A
   session fixes what it can. A new problem or a decision for the owner becomes a `needs owner`
   issue (the existing route, read by `/walk`). If nothing is left, the handoff is the archive
   verdict and nothing else.
7. **Phase notes go into the plan, not the chat.** A session that finishes a phase of a written
   plan adds the notes for the next phase to that plan document, in the same pull request as the
   work. The notes cover what changed that the next phase must allow for, decisions taken, traps
   found, and what the check found. They land on `main` with the code, so archiving loses nothing.
   Anyone can then start the next phase by pointing a fresh session at the plan.

### Plan run (new skill, `/plan-run`)

8. **The owner starts it with a plan and a time window**, for example
   `/plan-run docs/EDITOR_REBUILD_PLAN.md until 06:00`. It refuses a plan without ordered phases
   that each have acceptance criteria. It runs only phases written in the plan, never invents
   one, and stops when the plan ends.
9. **One plan run or one wave, never both.** It opens through the same wave store, so a plan run
   refuses while a wave is open, and a wave refuses while a plan run is open. The window limit is
   the same 24 hours.
10. **Each phase is two fresh sessions.**
    - A **builder** does the next phase against its acceptance criteria, writes the phase notes
      (point 7), passes `/check`, and lands through the merge queue like any wave row.
    - A **checker** that never saw the build then tests the result on `main`. It tries it the way
      a user would, checks the phase's acceptance criteria and the user outcome the plan states,
      and, where the plan names reference products, compares the same interaction there. It
      records what it found in the plan's phase notes.
11. **A failed check gets one repair, then pauses.** If the checker fails a phase, one builder
    session fixes it with the checker's findings, and the checker runs again. A second failure, or
    anything that needs the owner, opens a `needs owner` issue and pauses the plan. The pause
    affects this plan only, and the run reports it.
12. **The coordinator stays thin, so it does not get worse.** It reads the plan's phase list and
    short results, never code, and keeps its state in the wave file. It can be stopped and restarted
    from that file at any point with nothing lost. All real work runs in fresh sessions.
13. **The editor plan carries its reference check.** The rule that implementers inspect and try
    the open-source reference editors is currently only in the research copy
    (`docs/research/editor-consolidation-2026-09-17/EDITOR_REBUILD_PLAN.md`). It moves into the
    live `docs/EDITOR_REBUILD_PLAN.md`, as part of what the checker does after each phase.

## Preserved behaviour

- `/orchestrator` keeps working as it does now: many tasks, rows in parallel, backlog from Issues.
  Only the shared pieces change (the wave store learns the plan-run kind; the sweep closes more).
- The merge queue stays the only way to `main`.
- Dev-port reservations, the worktree sweep's landing and quiet rules, and its safety checks stay
  as they are.
- No session, worktree or process the owner started is touched.

## Non-goals

- No automatic start of a plan run. The owner starts each one.
- No trigger, scheduler or always-on service of its own. The cleanup rides on what already runs.
- No "does it feel as good" verdict from an agent. The checker reports behaviour, acceptance and
  differences from the reference. Feel stays the owner's call when trying it on `main`.
- No change to the owner's machine settings. Capping WSL and Docker memory (`.wslconfig`,
  Docker's resource saver) is offered to the owner separately, not built here.
- The console-window flicker seen on 2026-10-09 is not diagnosed here. A 30-minute watch caught
  nothing, and the leftover loop was not its cause.

## Acceptance

### AC-1: An endless wait is refused before it runs

Scenario: a session runs `until docker info >/dev/null 2>&1; do sleep 5; done` as a command. The
guard refuses it and the message says how to add a limit. The same loop wrapped in `timeout 600`,
or with a deadline check, runs.

### AC-2: Removing a landed worktree closes everything running from it

Scenario: in a disposable worktree, start a dev server, a sleeping shell loop and a test browser,
then land and sweep it. Afterwards none of the three processes exists, and the removal does not
report a locked folder.

### AC-3: Quiet agent processes close after three hours, and exempt ones do not

Scenario: with the clock moved forward in a test, an agent-started shell loop in a worktree with
no activity for three hours is closed by the next sweep. A merge queue runner, a live session's
MCP server and an owner application with the same age are left running.

### AC-4: The handoff offers no optional work

Scenario: `/handoff` at the end of a session with no remaining work prints the archive verdict and
nothing more. A session that found a decision for the owner opened a `needs owner` issue, and the
handoff links it. The handoff procedure no longer contains an "optional follow-ups" section.

### AC-5: A finished phase leaves its notes in the plan on main

Scenario: a builder session completes a phase of a written plan. The pull request that lands it
also adds the next phase's notes to the plan document. A fresh session given only the plan path
can state what the next phase must take into account.

### AC-6: A plan run moves phase by phase with a separate check

Scenario: `/plan-run` on a small test plan of three phases. Each phase is built in its own session
and checked by a different session. The wave file shows build, land and check in order for each
phase, and the run ends when the plan ends.

### AC-7: A failed check repairs once, then pauses

Scenario: a phase whose check fails twice. One repair session runs, the second failure opens a
`needs owner` issue, the plan pauses, and the run's report says why.

### AC-8: A plan run and a wave exclude each other

Scenario: while a plan run is open, opening a wave is refused, and the other way round.

### AC-9: The coordinator restarts without losing its place

Scenario: stop a plan run's coordinator mid-run and start it again with the same plan. It
continues from the next unfinished step and launches nothing twice.

### AC-10: The editor plan states the reference check

Scenario: `docs/EDITOR_REBUILD_PLAN.md` itself, not only its research copy, tells each phase to
inspect and try the reference editors, and tells the checker to compare against them.

### AC-11: Archive on merge is on

Owner step after AC-4 and AC-5 land: the app setting "Auto-archive sessions when their pull
request closes" is on.

## Decisions taken while writing (revisit freely)

- **The checker tests `main`, after landing, not the branch before it.** That keeps the merge
  flow unchanged and checks what users actually get. A failed phase is fixed by the next session
  rather than held back, which matches the owner's "code is cheap, fix later" and keeps `main`
  green through the existing gates.
- **Three hours** for quiet processes, from the owner's "about three hours".
- **The skill is called `/plan-run`.** Rename freely.
- **Order of building:** cleanup (AC-1 to AC-3) first, since it helps every session at once; then
  the handoff (AC-4, AC-5) and the editor plan's reference check (AC-10); then `/plan-run`
  (AC-6 to AC-9); the archive setting (AC-11) last.
