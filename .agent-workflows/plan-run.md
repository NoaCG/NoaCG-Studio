# plan-run - run a long plan phase by phase

`/plan-run <plan> until <time>` (Codex: `$plan-run`). Fresh builders and independent checkers alternate; the next phase waits for PASS. Use `.agent-workflows/cloud-delegate.md` for cloud routing and executing-worker resources.

**Runnable plans** (a name here and nothing else):

- `editor`: `docs/EDITOR_REBUILD_PLAN.md`; its order and acceptance are in `docs/EDITOR_PLAN.md`.
- `guided-mod`, `production-page`, `ci-plan`, `svg-import-engine`, `wizard-shell`, `wizard-ai`, `noacg-harness`, `vmix`, `codebase-health`: `docs/work-specs/<spec>/spec.md`, where `<spec>` is `guided-mod`, `production-page-refactor`, `ci-plan-reliability`,
  `svg-import-engine`, `wizard-structure`, `wizard-ai`, `noacg-harness`, `bridge-vmix-adapter`, `codebase-health`; phases, acceptance and notes are in it.
- `remote-mcp`: `docs/REMOTE_MCP_PLAN.md`; `agent-delivery`, `codex-graphic-preview`, `harness-ladder`: `docs/work-specs/<plan>/spec.md`; phases, acceptance and notes are in each. The preview's phase 1 is local.

## Boundaries

- **A wave runs alone; plan runs of different plans may run side by side** (never two on one file).
- **Finite owner-authorized project deadline**: no 24-hour project ceiling. Ordinary day/night waves keep theirs.
- **Only phases written in the plan.** Preserve phase set, order, dependencies, acceptance and required environments; refuse missing acceptance.
- **Only the merge queue writes `main`.** Sessions land themselves with `/queue-merge`.
- The wave file is the continuing project/phase ledger; use the existing supervisor for ownership and recovery, never a second ledger.
- **Never touch another session's worktree**, and `docs/private/` stays private. Keep this coordinator thin; fresh builders and independent checkers do real work.

## 1. Prepare, qualify and open

- Default timezone-free owner dates/times (including today/tomorrow and `until 18:00`) to Finnish time, `Europe/Helsinki`, unless the owner supplies another timezone/offset.
  Resolve its calendar date and daylight-saving offset independently of the machine/client timezone; report the resolved local date, time, zone and offset before launch.
  Pass explicit-offset ISO timestamps to authorization, block and wake tools; preserve recorded instants on resume. Ask only when the intended date/time is unclear or repeated/nonexistent at a daylight-saving transition.
- Get explicit current owner authorization: stable project ID, source, scope, permission policy, start and finite deadline. Earlier sessions grant no renewal.
  Prepare a project JSON as described in `docs/work-specs/continuing-plan-preparation/runbook.md`, copying the owner's exact phases and acceptance.
- Qualify the coordinator and each fresh worker in their own worktrees before substantive work. Inspect effective terminal/subprocess/network/approval policy.
  Run `node scripts/plan-run-preflight.mjs --context coordinator --until <short qualification end>` in two separate shell calls;
  repeat with `--context worker` in a fresh delegated context. On a project resume use `--wave <file>` after its authorized block opens.
  Use supported shell network permission. Record non-secret receipts in the existing ledger, separating sandboxed, approved-network and escalated evidence.
  One pass is not reusable permission. Tool approval waits are pending, not executed failures. Requalify after policy/context changes.
  An unavailable owner prerequisite produces one concrete configuration request; checkpoint and stop dependent work without approval loops or provider substitution.
  Pre-test infrastructure/capacity failures consume no product repairs: checker says `fail blocked:`, builder checkpoints; existing blocked-check limits remain.
- Open only when execution is actually authorized: `node scripts/wave-plan-store.mjs --open <first-date> plan-<plan> --until <original-deadline> --project <json>`.
  The continuing file starts paused. Register its immutable manifest with `run-supervisor.mjs register <db> <manifest.json>`.
  `run-supervisor.mjs start-block <db> <id> <block.json>` opens one bounded block with owner, deadline and reconciliation evidence.
  Keep the same ID, file, deadline, scope and phase ledger on every restart. Legacy short-window records retain their compatibility path; migration needs explicit review.
- Prefer qualified cloud implementation and software verification via `.agent-workflows/cloud-delegate.md`. Route device/OS/performance/human acceptance to the plan's required environment.
  Same-VM qualification is not a native cloud-child receipt. Current preflight exposes native launch, wake/bootstrap and remote-fencing gaps.
- Arm only qualified, authorized block-specific wakes. `node scripts/run-wake.mjs awake <file>` holds locally only through the active block.
  A scheduling acknowledgement or heartbeat is a check-in, not durable continuation. No new scheduler is introduced.

## 2. Continuing loop and ownership

`node scripts/plan-run.mjs next <wave file>` names the next step. For projects the only supported phase admission is
`node scripts/run-supervisor.mjs record <db> <id> <phase> <event> <detail> --authority <current-block.json>`.
The supervisor's local transaction and ledger admission lock serialize claims; direct project `plan-run record` is refused.
Launch/verdict detail is a JSON actor/evidence receipt (runbook). Record the intent before any external launch; reconcile uncertain acceptance before replay.

- **launch build/repair**: use the brief below in the phase's owned worktree. Record `landed` only after actual merge and all exact-merge checks pass.
  Preserve carry findings, failure history and existing per-command/test bounds. A recorded intent alone proves no worker was launched.
- **launch check**: fresh independent checker on current `origin/main`. PASS requires evidence for every authorized criterion in its specified environment.
  `fail product:` gets the existing one repair; `fail blocked:` gets the existing one repeated check. A second failure stops for the owner; limits never reset on restart.
- **wait**: reconcile the original native worker, PR, jobs and exact tested revision first. Record observed `landed`, or wait for its queue; never start another branch/phase.
  Unknown status or lost acknowledgement is unresolved, never absence. The local supervisor does not establish remote exclusion.
- **retro**: write the requested `## Midpoint retro` (orchestrator step 6, five lines), then ask `next` again.
- **stop/stopped**: record the reserved decision and ask the owner as verify.md requires. Record `answered` only from the answer; cancellation cannot be answered away.
- **pause/block**: `run-supervisor.mjs pause <db> <id> <reason>` or `wait <db> <id> <wait.json>` stops launches immediately, between phases or in flight.
  The in-flight worker must checkpoint and acknowledge its exact phase, step and block. Use `tick` for the bounded checkpoint request; no replacement is launched.
  Resolve prerequisites explicitly, preserve pending intents, then open another bounded block with reconciliation evidence under the unchanged authorization.
- **block end/local coordinator closure**: checkpoint, stop launches and block-specific wakes/keep-awake. This is resumable pause, not completion or cancellation.
  Continuing remotely requires qualified cloud-owner acceptance and acceptance-side stale-owner fencing. Without it, stop; current automatic native replacement is refused.
- **cancel/expired**: owner cancellation or original deadline ends launch authority. Preserve unfinished work, findings, pending evidence and queued PR ownership.
- **done**: `finish` is permitted only after every phase/acceptance PASS. Write the final report/retro, exact-merge results and remaining limitations; stop wakes.

Use `<tool>/plan-<plan>-p<phase>-<build|check|repair>` worktrees. Native routing, bounded waits and one acknowledged PR repair owner follow cloud-delegate and queue-merge.
A restored local SQLite/file lock cannot fence another machine. Git checkpoint CAS protects publication only; restored project execution stays refused until native fencing is qualified.
Before relevant manual Actions dispatches follow verification lookup's observation procedure in verify.md; measurement behavior and failure/retry restrictions stay unchanged.

**Builder brief** (after orchestrator step 3's row brief):
```text
PHASE    <n> of <plan>: <name>. Read its decisions; build only its authorized acceptance.
NOTES    Same PR, under ## Phase notes: previous findings, constraints, decisions and traps.
FINDINGS <carry from next, or none>. Checkpoint on pause/block/deadline; never broaden scope.
```
**Checker brief**:
```text
CHECK   Phase <n> of <plan>. You did not build it. On current origin/main do the user's task
        and check EVERY criterion/outcome in its required environment. Change no product code.
        PASS needs your own evidence for all criteria. Otherwise FAIL product or FAIL blocked,
        named. Preserve findings and exact tested revisions; do not weaken tests or retry limits.
NOTES   <land the required plan notes through /check and /queue-merge | open no PR>.
```
