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
- Take scope, permission policy, start and finite deadline from current explicit owner authorization; earlier sessions grant no renewal.
  Derive the stable project ID, project JSON, block setup and worker briefs from that authorization and the actual plan
  (`docs/work-specs/continuing-plan-preparation/runbook.md`). Copy its exact phases/acceptance; ask only for missing owner decisions, not operational metadata.
- Qualify the coordinator and each fresh worker in their own worktrees before substantive work. Inspect effective terminal/subprocess/network/approval policy.
  Run `node scripts/plan-run-preflight.mjs --context coordinator --until <short qualification end>` in two separate shell calls;
  repeat with `--context worker` in a fresh delegated context. On a project resume use `--wave <file>` after its authorized block opens.
  Use supported shell network permission. Record non-secret receipts in the existing ledger, separating sandboxed, approved-network and escalated evidence.
  One pass is not reusable permission. Tool approval waits are pending, not executed failures. Requalify after policy/context changes.
  An unavailable owner prerequisite produces one concrete configuration request; checkpoint and stop dependent work without approval loops or provider substitution.
- First run `node scripts/run-supervisor.mjs continue <state-root> <plan> <owner>`: it continues the plan's active project in this session with a new block, or answers `open`.
  Open only when execution is actually authorized: `node scripts/wave-plan-store.mjs --open <first-date> plan-<plan> --until <original-deadline> --project <json>`.
  The file starts paused. Register its manifest, id `plan-<plan>-<first-date>` with the recovery ref, via `run-supervisor.mjs register <db> <manifest.json>`.
  `run-supervisor.mjs start-block <db> <id> <block.json>` opens one bounded block with owner, deadline and reconciliation evidence.
  Same ID, deadline, scope and ledger on every restart; legacy short-window records keep their compatibility path, migration needs explicit review.
- Prefer qualified cloud implementation and software verification via `.agent-workflows/cloud-delegate.md`. Route device/OS/performance/human acceptance to the plan's required environment.
  Use its capability-aware native session/workflow, worktree, completion and wake selection; the supervisor is the sole phase-admission authority. Same-VM qualification is not a native cloud-child receipt.
- Arm only qualified, authorized block-specific wakes. `node scripts/run-wake.mjs awake <file>` holds locally only through the active block. A scheduling acknowledgement or heartbeat is a check-in, not continuation.

## 2. Continuing loop and ownership

`node scripts/plan-run.mjs next <wave file>` names the next step (a project: `run-supervisor.mjs next <db> <id>`). For projects the only phase admission is
`node scripts/run-supervisor.mjs record <db> <id> <phase> <event> <detail> --authority <current-block.json>`; `<phase>` is the 1-based row of `## Phases`.
The supervisor's local transaction and ledger admission lock serialize claims; direct project `plan-run record` is refused.
Launch/verdict detail is a JSON actor/evidence receipt (runbook). Record the intent before any external launch; reconcile uncertain acceptance before replay.
Projects use `continue`, `start-block`, `record` and `next`; never `tick` (a continued store's adapter answers unknown).

- **launch build/repair**: use the brief below in the phase's owned worktree. Record `landed {"mergeSha"}` once the merge is observed.
  Preserve carry findings, failure history and existing per-command/test bounds. A recorded intent alone proves no worker was launched.
- **launch check**: fresh independent checker on that immutable merge SHA at once, without inherited build/repair conversation or a context-sharing builder fork.
  PASS requires evidence for every authorized criterion in its specified environment, and `mergeChecks` once every exact-merge check is green or, where its plan allows, already red before the merge outside the plan's areas (it waits for them).
  `fail product:` gets one repair; `fail blocked:` one more check. An infrastructure/capacity outage spends no budget: the step stays in flight, `wait`, `clear-wait`, resume.
- **diagnose** (a second failure): one fresh agent, independent of every builder, repairer and checker of the phase, records `diagnose`
  `{"actor","decision":"repair"|"check"|"stop","reason"}`: one last scoped repair, one re-check after a blocked prerequisite recovered, or stop for the owner. A failure after it stops; limits never reset.
- **wait**: reconcile the original native worker, PR, jobs and exact tested revision first. Record observed `landed`, or wait for its queue; never start another branch/phase.
  Unknown status or lost acknowledgement is unresolved, never absence. Never sit idle: wait in a running background job or monitor so a cloud machine is not reclaimed.
  From it run `node scripts/worker-progress.mjs --branch <branch> --wave <file>` (counts only work since the launch). On `idle` (30 minutes) nudge; if still idle, stop it, record
  `resume` with the replacement's JSON actor receipt (a checker's is independent of every builder) and launch it on the pushed branch. `unknown`: reconcile, never replace.
- **retro**: write the requested `## Midpoint retro` (orchestrator step 6, five lines), then ask `next` again.
- **stop/stopped**: record the reserved decision and ask the owner as verify.md requires. Record `answered` only from the answer; cancellation cannot be answered away.
- **pause/block**: `run-supervisor.mjs pause <db> <id> <reason>` or `wait <db> <id> <wait.json>` stops launches immediately, between phases or in flight.
  Stop native automatic follow-ups/retries/new sessions and block wakes too; retain in-flight checkpoints and queued-PR repair ownership.
  Ask the in-flight worker in its native session to checkpoint and acknowledge its exact phase, step and block; no replacement is launched.
  Resolve prerequisites explicitly, preserve pending intents, then open another bounded block with reconciliation evidence under the unchanged authorization.
- **block end/coordinator closure**: checkpoint, stop launches and block wakes/keep-awake; a resumable pause. Any later session continues it with the same line (`continue`); a coordinator reading `superseded` stops.
- **cancel/expired**: owner cancellation or original deadline ends launch authority. Preserve unfinished work, findings, pending evidence and queued PR ownership.
- **done**: `finish` needs every phase/acceptance PASS (block end leaves them resumable). Write the final report/retro, exact-merge results and limitations; stop wakes.

Use `<tool>/plan-<plan>-p<phase>-<build|check|repair>` worktrees. Native routing, bounded waits and one acknowledged PR repair owner follow cloud-delegate and queue-merge.
Before relevant manual Actions dispatches follow verification lookup's observation procedure in verify.md; measurement behavior and failure/retry restrictions stay unchanged.

**Builder brief** (after orchestrator step 3's row brief):
```text
PHASE    <n> of <plan>: <name>. Read its decisions; build only its authorized acceptance.
NOTES    Same PR, under ## Phase notes: previous findings, constraints, decisions and traps.
FINDINGS <carry from next, or none>. Checkpoint on pause/block/deadline; never broaden scope.
```
**Checker brief**:
```text
CHECK   Phase <n> of <plan>. You did not build it. On the landed merge SHA do the user's task
        and check EVERY criterion/outcome in its required environment. Change no product code.
        PASS needs your own evidence for all criteria and every exact-merge check green. Else FAIL product or blocked,
        named. Preserve findings and exact tested revisions; do not weaken tests or retry limits.
NOTES   <land the required plan notes through /check and /queue-merge | open no PR>.
```
