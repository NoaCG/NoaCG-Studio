# Codex plan creation

`$plan-create <plan> [until <time>]` prepares one authorized run, then hands over to `$plan-run`.
Read AGENTS.md, docs/GOALS.md, the selected spec and latest owner receipts, this skill's plan-run
counterpart at `.agents/skills/plan-run/references/codex.md`, and
`docs/work-specs/continuing-plan-preparation/runbook.md` for the existing manifest/block format.
Claude commands retain `.agent-workflows/plan-create.md` and their existing templates.

## Scope and execution mode

Inspect the existing run issue, recovery ref and terminal/owner disposition before opening anything.
Reuse current owner decisions; later explicit decisions supersede old handoffs without erasing failures.
Never reopen a completed or owner-closed run to fill historical evidence. Work only on the authorized
phase set, order, dependencies and acceptance. A product plan, provider or topology change needs its
own authorization; this procedure does not transfer a Claude-owned run to Codex.

Record scope, owner words, actual start and the owner's date if he gave one (none: until complete) in the existing launch receipt.
Reuse permission already supplied; ask only missing owner-level choices. Resolve owner-facing dates
in the owner's supplied timezone (the current client preference otherwise), preserve explicit offsets
and recorded instants. `untilComplete` and automatic `blockRenewal` are separate standing permissions;
a date alone grants neither. Blocks remain at most 24 hours. Owner pause needs explicit resume.

Select the supported mode and write `execution: {harness: "codex", mode: "active"}` or `"unattended"`
in the kit state. New Codex runs default to active; recording that mode grants no additional authority.
Active mode works locally or in managed cloud with the actual worker/session binding. Cloud wake or
host-loss qualification is not a prerequisite for local active execution; device checks stay on their required host.
- **active:** qualify subprocess, network, owned worktrees and fresh worker/result routes. No durable
  wake is required to create this explicitly bounded project. The active coordinator remains its
  acknowledged PR repair owner through required merge, acceptance and post-landing results. Never
  finish a turn at queued or promise monitoring after the session ends. A lost session needs reconciliation.
- **unattended:** additionally observe actual coding-session wake/re-entry, one bounded renewal and
  terminal stop, with native identity, source, policy and supported interruption receipts. Scheduling
  acknowledgement, environment metadata and local fixtures are insufficient. Report idle re-entry
  separately from machine-loss recovery. Unavailable recovery leaves the active route available.

Inspect actual lifecycle tools and use `.agent-workflows/cloud-delegate.md` for network qualification.
Run `node scripts/plan-run-preflight.mjs --context coordinator --until <qualification-end>` in two
separate shell calls and repeat `--context worker` in the fresh worker's context. These checks are
invocation evidence, not unattended qualification. Fresh same-machine contexts/worktrees are sufficient
for a new serial run unless its authorization requires separately hosted children. Allocate ports,
services/test accounts and resources on the executing worker; preserve models, effort and permissions.

## Existing project and kit

Once the selected mode is qualified, inspect current state and use
`node scripts/run-supervisor.mjs continue <state-root> <plan> <owner>` for an existing recovery ref.
This claims ownership; a restart grants no new scope. A blocked/paused result must be reconciled,
never escaped by opening another project. Restore and reconcile outstanding native work before replacement.
If the result is open, use the runbook's project JSON with exact phase IDs, criteria and environments,
then `node scripts/wave-plan-store.mjs --open <date> plan-<plan> --until <end> --project <project.json>`,
`node scripts/run-supervisor.mjs register <db> <manifest.json>` and
`node scripts/run-supervisor.mjs start-block <db> <id> <block.json>` under the actual authorization.

Create the existing kit with `node scripts/plan-kit.mjs init <wave> <state.json>`.
State includes the run issue, current coordinator native session/environment/return destination,
verbatim authorization, execution mode, brief rules, waitingOn/inFlight/owner/fixes/triggers and
`branchPrefix: "codex"`. The explicit Codex execution setting selects the four tailored templates
from `.agents/skills/plan-run/references/templates/`; Claude/default templates stay unchanged.
Never place credentials, private context or user artwork in the public recovery branch.
Publish with `node scripts/run-supervisor.mjs publish <db> <id>` before relying on a changed kit.

Use one run issue and its rendered `node scripts/plan-kit.mjs heartbeat <wave>` comment. Distinguish
execution status, overall work-spec acceptance and owner disposition using their existing records.
Only unattended mode arms a qualified wake: its prompt names the existing wave/kit and this procedure,
never becomes a second state store. Use `node scripts/plan-kit.mjs checkin <wave>` and the scheduler's
actual capabilities; no unsupported cadence. Store/read back the native wake ID. Active mode arms none.

Hand over the project ID, wave, kit, run issue, selected mode, authority and first supervisor next step.
Execute through `$plan-run`; do not launch a phase through a second scheduler or the supervisor tick loop.
