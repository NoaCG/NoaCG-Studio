# plan-run - run a long plan phase by phase

`/plan-run <plan> until <time>` (Codex: `$plan-run`). Each phase is built by one fresh session and
checked by another, the next only after the check passed. Output: phases on `main`, a report.

**Runnable plans** (a name here and nothing else):

- `editor`: `docs/EDITOR_REBUILD_PLAN.md`; its order and acceptance are in `docs/EDITOR_PLAN.md`.
- `guided-mod`: `docs/work-specs/guided-mod/spec.md`; phases, acceptance and phase notes are in it.
- `production-page`: `docs/work-specs/production-page-refactor/spec.md`; the same.
- `ci-plan`: `docs/work-specs/ci-plan-reliability/spec.md`; the same.
- `remote-mcp`: `docs/REMOTE_MCP_PLAN.md`; the same.

## Boundaries

- **A wave runs alone; plan runs of different plans may run side by side** (never two on one file).
- **24 hours is the ceiling** of one authorised window; opening refuses a longer one.
- **Only phases written in the plan.** Refuse a plan whose phases lack acceptance; never invent one.
- **Only the merge queue writes `main`.** Sessions land themselves with `/queue-merge`.
- **The coordinator stays thin**: it reads the plan's phase list and short results, never code, and
  keeps its state in the wave file. Real work runs in fresh `wave-row` sessions (Opus, high effort);
  workflow fan-out (`ultracode`) only when the owner's prompt for the run says so.
- **Never touch another session's worktree**, and `docs/private/` stays private.

## 1. Start

- **Open the run** with the owner's window, in Helsinki time with its offset (unstated: ask, along
  with what the plan's checks need on this machine, such as a signed-in `claude -p`):
  `node scripts/wave-plan-store.mjs --open <date> plan-<plan> --until <iso>`; `<date>` is the run's
  first day, the same `--until` resumes after a restart, a new one is a new window the owner named.
- **First open only**: read the plan on `origin/main` (`git fetch origin main`) and copy the phases
  still to build, numbered, under `## Phases` in the wave file, each with where its acceptance is.
- **Arm the wake-up** (Claude desktop, each start): create or re-enable the task printed by `node
  scripts/run-wake.mjs arm <wave file> --resume "plan-run <plan> until <iso>"`; it restarts this
  session if its process stops. `run-wake.mjs awake <wave file>` holds the machine awake to the end.

## 2. The loop

`node scripts/plan-run.mjs next <wave file>` names the one next step; record it before launching,
`node scripts/plan-run.mjs record <wave file> <phase> <event> <detail>`, with branch and worktree.
The ledger refuses a step out of order or launched twice: then launch nothing and run `next` again.

- **launch build** (or **repair**): a builder with the brief below. Record `landed #<n> <merge sha>`
  once its pull request merged with every check green (`gh pr checks <n>`); a red check, required or
  not, or a red-on-main alarm on that sha (`npm run jobs`), goes back to that session (`resume`).
- **launch check**: a checker with the brief below, once the phase is on `main`. Record `pass
  <findings>`, `fail product: <findings>` (next: a repair) or `fail blocked: <what was missing>`
  (remove the obstacle, or `stop` and ask; next: the check again, once).
- **wait**: the step is running. After a restart reconcile first (`gh pr list --head <branch>`,
  `npm run jobs`): merged is recorded `landed`, queued is waited for, otherwise a fresh session
  starts in the recorded worktree with the same brief, and `resume` is recorded. No second branch.
- **retro**: write `## Midpoint retro` (`orchestrator.md` step 6, five lines) and run `next` again.
- **stop**: a second failed check, or a reserved decision (`verify.md` step 5): record `stop <why>`,
  ask him at once (recommendation, phone notification), go no further, record `answered <answer>`.
- **closing** (the last 45 minutes, or "I need to close the laptop"): launch only a step that lands
  before the end (the median step so far plus ten minutes); otherwise, and at the end, tell running
  sessions to commit, push and stop, leave queued pull requests to GitHub, record `paused <what
  remains, pending jobs>` and report; never extend the window yourself.
- **done** or **time-limit**: after the last notes pull request, confirm `main` is green (`npm run
  jobs`), run the retro (`orchestrator.md` step 6), write `## Report` in the wave file (15 plain
  lines: **Needs you** first or "nothing", each phase's pull requests and verdict, where it stopped
  or paused and what remains, what was not checked, the retro); send it with a phone notification.

Sessions get their own worktrees on `<tool>/plan-<plan>-p<phase>-<build|check|repair>` (`-2` on a
second check). Claude Code: `run_in_background` `wave-row` agents (they wake you), background
`jobs.mjs wait` per landing and `sleep 1800`, the step 1 wake-up; in the cloud, harness worktrees
(`orchestrator.md` step 3), `subscribe_pr_activity` per pull request and `send_later`. Codex:
`spawn_agent` without context, `wait_agent` with a timeout, the 30-minute heartbeat; ask him here.

**The builder brief**: the row brief from `orchestrator.md` step 3, after these lines:
```
PHASE    <n> of <plan document>: <phase name>. Build it against its acceptance criteria and nothing
         else; read the plan's phase notes and the decisions it records first.
NOTES    Same pull request, under the plan's `## Phase notes`: FINDINGS below as the last check's
         findings, then what the next phase must allow for, decisions, traps.
FINDINGS <the carry: line from next, or "none">
```
**The checker brief**:
```
CHECK   Phase <n> of <plan document>: <phase name>. You did not build it. On current origin/main, do
        the phase's task the way a user would (and in the reference products the plan names), check
        each acceptance criterion and the user outcome the plan states; change no product code. PASS
        only when all of it holds on evidence you produced; anything to fix first (a try-out the
        plan asks for included) is FAIL product; a prerequisite you could not get (a sign-in, a
        tool, a flaky runner) is FAIL blocked, named. End with that line, then at most five lines of
        findings, blockers first.
NOTES   <land notes: Also add your findings under the plan's `## Phase notes` in a docs-only pull
        request, /check and /queue-merge it. | otherwise: Open no pull request.>
```
