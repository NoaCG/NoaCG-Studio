# plan-run - run a long plan phase by phase

`/plan-run <plan> until <time>` (Codex: `$plan-run`). Fresh builders and independent checkers alternate; the next phase waits for PASS. Use `.agent-workflows/cloud-delegate.md` for cloud routing and executing-worker resources.

**Runnable plans** (a name here and nothing else):

- `editor`: `docs/EDITOR_REBUILD_PLAN.md`; its order and acceptance are in `docs/EDITOR_PLAN.md`.
- `guided-mod`, `production-page`, `ci-plan`, `svg-import-engine`, `wizard-shell`, `wizard-ai`, `noacg-harness`, `vmix`, `codebase-health`: `docs/work-specs/<spec>/spec.md`, where `<spec>` is `guided-mod`, `production-page-refactor`, `ci-plan-reliability`,
  `svg-import-engine`, `wizard-structure`, `wizard-ai`, `noacg-harness`, `bridge-vmix-adapter`, `codebase-health`; phases, acceptance and notes are in it.
- `remote-mcp`: `docs/REMOTE_MCP_PLAN.md`; `agent-delivery`, `codex-graphic-preview`, `harness-ladder`: `docs/work-specs/<plan>/spec.md`; phases, acceptance and notes are in each. The preview's phase 1 is local.

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

- **Qualify execution before work** on the coordinator and each fresh worker, in its own worktree.
  Inspect effective terminal, subprocess, network and approval policies; use supported workspace session permissions.
  Run `node scripts/plan-run-preflight.mjs --context coordinator --until <iso>`
  in two separate shell calls, then repeat with `--context worker` in a fresh delegated context.
  One pass or a persistent terminal is insufficient. On resume use `--wave <wave file>` instead
  of `--until`; reconcile native tasks, PRs and `next` before launch. Record non-secret receipts and policy
  in the existing wave file, separating sandbox from approved-network evidence. Requalify after policy/context changes.
  Tool approval waits before execution are pending, not process timeouts or failed tests. If permission is unavailable,
  checkpoint with one concrete configuration request and stop that context; never loop on individual approvals.
  Infrastructure/capacity failures before tests run consume no product repair: checkers record `fail blocked:`,
  builders stop/checkpoint. Preserve owner repair limits and the ledger's blocked-check limit; reuse execution-profile/queue.
- **Open the run** with the owner's window, in Helsinki time with its offset (unstated: ask, along with machine prerequisites such as signed-in `claude -p`):
  `node scripts/wave-plan-store.mjs --open <date> plan-<plan> --until <iso>`; `<date>` is the run's
  first day, the same `--until` resumes after a restart, a new one is a new window the owner named.
- **First open only**: read the plan on `origin/main` (`git fetch origin main`) and copy the phases
  still to build, numbered, under `## Phases` in the wave file, each with where its acceptance is.
- **Arm the wake-up** (Claude desktop, each start): create or re-enable the task printed by `node
  scripts/run-wake.mjs arm <wave file> --resume "plan-run <plan> until <iso>"`; it restarts this
  session if its process stops. `run-wake.mjs awake <wave file>` holds the machine awake to the end.
  Codex: arm a supported thread heartbeat before launching. An acknowledgement is only a fallback check-in;
  durable recovery needs an actual supported coding-context/access wake. Without proof, stay through exact-SHA post-land checks.

## 2. The loop

`node scripts/plan-run.mjs next <wave file>` names the next step; before launch use `node scripts/plan-run.mjs record <wave file> <phase> <event> <detail>` with branch/worktree.
The ledger refuses a step out of order or launched twice: then launch nothing and run `next` again.

- **launch build** (or **repair**): use the brief below. Record `landed #<n> <merge sha>` only after merge and every check green (`gh pr checks <n>`); a red check, required or
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
  jobs`), run the retro (`orchestrator.md` step 6), write `## Report` (15 plain lines) in the wave file:
  **Needs you** first or "nothing", phase PRs/verdicts, stopping point, remaining/unchecked work and retro; send a phone notification.

Sessions own `<tool>/plan-<plan>-p<phase>-<build|check|repair>` worktrees (`-2` on a second check).
Claude Code: background `wave-row` agents, `jobs.mjs wait` per landing, `sleep 1800` and step 1's wake.
Cloud uses harness worktrees (`orchestrator.md` step 3) and queue-merge.md's single repair owner/proven wake,
including no-webhook conflict checks. Codex: context-free `spawn_agent`, bounded `wait_agent`, 30-minute heartbeat; ask him here.
**The builder brief**: the row brief from `orchestrator.md` step 3, after these lines:
```
PHASE    <n> of <plan document>: <phase name>. Read phase notes/decisions; build only its acceptance criteria.
NOTES    Same PR, under `## Phase notes`: last check's FINDINGS, next-phase constraints, decisions, traps.
FINDINGS <the carry: line from next, or "none">
```
**The checker brief**:
```
CHECK   Phase <n> of <plan document>: <phase name>. You did not build it. On current origin/main,
        do the user's task, including named reference products/try-outs; check every criterion and
        stated outcome. Change no product code. PASS needs your own evidence for all of it;
        anything to fix first is FAIL product; unavailable sign-in/tool/runner is FAIL blocked, named.
        End with that verdict, then at most five lines of findings, blockers first.
NOTES   <land notes: Add findings under the plan's `## Phase notes` in a docs-only PR, /check and /queue-merge it. | otherwise: Open no pull request.>
```
