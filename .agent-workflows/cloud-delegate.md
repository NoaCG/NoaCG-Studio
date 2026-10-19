# cloud-delegate — provider-native work and bounded recovery

Route ordinary implementation, review, verification and unattended phases to cloud.
Keep device, installed-program, private-local-file and local-browser-state tasks local.
Use the existing wave/plan/job and landing records; this procedure creates no new scheduler.
Native subagents share one VM; they are not separate cloud resources.
Each provider launches its own workers in its existing environment/subscription.

## Use native coordination

At startup inspect the exposed tools/current CLI help and existing sessions. Record the
chosen launch, status, message/resume and wake capabilities in the existing ledger; reuse
them until the context changes. A release/version or old measurement is not availability.
Preserve configured models, effort, permissions and feature choices; do not upgrade,
enable optional modes or broaden access just to obtain a newer orchestration path.

- **Claude Code:** prefer available native background sessions, Agent completion events
  and session inventory/attach/logs/resume (`claude agents`, `claude --bg` where supported).
  Use Workflow for bounded parallel work only when it preserves each row/phase admission,
  owned worktree, resource limits, worker identity and retrievable results. Otherwise use
  the named Agent/session route with `run_in_background` when exposed, or its supported
  background equivalent. Never let a workflow launch a later plan phase.
- **Codex:** prefer exposed native session/subagent lifecycle and managed-worktree tools.
  Verify the actual branch, source SHA and absolute worker directory; every command
  stays in that owned worktree. Without native worktree support, use
  `git worktree add` with the existing `spawn_agent`/`wait_agent` route where available.
- Use native completion notifications and bounded waits; steer or resume the original
  worker by ID. A message to an idle worker is not proof it resumed. Retain task/agent IDs
  through compaction/reconnect; inspect status and results before retrying a launch.
- Before the first unattended launch, arm and record one qualified native wake or the
  existing bounded 30-minute heartbeat/Claude background timer for missed completions/late CI.
  Re-arm only while needed within the authorized window; do not add a parallel scheduler.
  Native retries/continuations obey the workflow's existing end policy and attempt limits.

Context-sharing forks can help builders; an acceptance checker starts fresh without the
build/repair conversation, using the explicit checker brief and current main. Native
"completed"/Workflow success is not acceptance PASS, a merged PR or green exact-merge checks.
Background services, scheduled wakeups and self-hosted runner orchestration do not by
themselves prove cloud placement, restart survival or cross-machine ownership.

## Codex cloud startup and network access

At startup, run `node scripts/cloud-network-preflight.mjs` from the feature worktree.
For this preflight and commands needing remote access (including fetch, push, gh,
dependency downloads and checks using remote services), select the shell tool's
supported network permission. When its schema exposes additional permissions, use:

```json
{
  "sandbox_permissions": "with_additional_permissions",
  "additional_permissions": { "network": { "enabled": true } }
}
```

Use the current tool schema; a repository script cannot grant itself shell access.
Keep the configured proxy and TLS verification. Destination allowlisting and shell
network permission are separate requirements. Do not change the allowlist or
credentials merely because default shell execution could not connect to the proxy.

The preflight independently reads origin/main through Git and this repository's
Actions API through gh. Each subprocess has a short timeout with prompts disabled;
output contains fixed diagnoses, never raw responses or credentials. A nonzero exit
means at least one path is unqualified. Permission or proxy transport failures need
the supported shell permission checked before diagnosing GitHub authentication.
An API denial does not by itself establish a disconnected account. GitHub connector
access is separate: test its repository read if the CLI path fails. Passing reads
do not qualify push, dispatch, status writes, whole logs or auto-merge; follow
queue-merge's separate probes when those operations are needed.

Tool approval can remain pending before the subprocess starts, outside its timeout.
Yield long tool calls promptly and report pending approval separately from an
executed command's failure. A pending call is no evidence that GitHub is unavailable.

## Before submission

Read `AGENTS.md`, the relevant spec and the current owner receipts in issue #1301.
Use the original Codex binding in the canonical root rule unchanged; runtime IDs and
`source_config_id` lineage do not prove that the CLI accepts that binding. Read
`docs/work-specs/cloud-execution/evidence/capabilities.md` as prior measurements, then
inspect the current interface. Missing or denied launch/auth/mapping stops that launch;
continue independent work. Never transplant credentials, bypass the proxy, retry a
known denial or substitute an API model, another provider or same-VM subagent.
Requalify after a relevant access/interface change; old inventory is not a permanent ban.

Inspect existing native task IDs, status, nonce and wave/plan state before submitting.
If delivery is uncertain, reconcile the same nonce/task; do not create another worker.
No readable status/result means unresolved, not absent. Record the concrete blocker.

Supply one worker prompt containing repository, full expected source SHA, unique
nonce, intended saved environment, goal/acceptance, owned branch/worktree, authorized
window end and result transport. Require a receipt with native ID, actual provider
binding, HEAD, clean/dirty paths, UTC time and nonce. Fetch and pin the exact source
in its own worktree before edits. Inspect concurrent work; preserve main and siblings.

## Qualified native examples

**Claude cloud**, where the existing native remote tools are exposed: `create_session`
with `source_url=https://github.com/NoaCG/NoaCG-Studio`, `source_revision=<full SHA>`,
`environment_id=env_017nuiDZBW9smUNLdWVQK8cf`, owned `outcome_branch` and the complete
prompt. Inspect `get_session` and `list_events`; send a nonce/HEAD follow-up with
`send_message` and read the reply. Fetch its pushed owned branch for artifacts.
These operations are qualified by `evidence/claude-measurements.md` under the cloud
execution spec; local worker paths alone are not transport. Reuse #1305's click-free
landing receipt. For the already-qualified local Claude CLI launch, omit
`CLAUDE_CODE_OAUTH_TOKEN` only from the child process, preserving parent configuration.

**Codex cloud prior measurements**: UI launch, app read/follow-up and GitHub artifact
return were observed; native child launch was not qualified (CLI environment discovery
was empty or denied, and app waiting failed). Inspect today's exposed tools instead of
assuming those limits or inventing a task-create API. A new launch path still needs
authenticated access, the intended environment mapping and an actual native receipt.
Use Work in > Cloud > published-environment UI when the owner directs that surface;
local subagent/worktree improvements alone do not qualify a remote child.

## Execute and return

On the worker that runs commands, run `node scripts/execution-profile.mjs` and follow
`.agent-workflows/verify.md`. Never inherit the laptop/coordinator resource profile.
The shared detector reads v1/v2 controller mounts, quota/affinity and ancestor memory
headroom; an unlimited ancestor is no cap, and a failed reading falls back to the
machine's own CPUs and memory. The worker runs its own browser and e2e checks through
the existing queue, affected planner and worker selector before /queue-merge.
Commit each verified phase, /check, then /queue-merge. Return native status, exact SHA,
useful result and retrievable artifacts; a submission acknowledgement is insufficient.
Record failed, skipped and incomplete verification as observed, not passing evidence.

## Reconnect and bounded recovery

Reopen the same native task or reconstruct its owned branch from origin; inspect
native status plus wave/plan/job/PR state before continuing. Reuse existing
cloud-landing-recovery qualification and #1307's local helpers only within their
proved scope. Inert-process controls do not prove native restart or filesystem recovery.

For durable supervisor runs, opt into the existing repository's recovery ref and use
`run-supervisor.mjs record` for phase events. `resume` restores a missing local store,
pinned source and ledger, then requires exact native/GitHub reconciliation before
dispatch. Keep the run ID/repository locator in the existing bootstrap or wake prompt.
See `docs/work-specs/native-recovery/evidence/restoration.md` for the packet and adapter
contract. Technical errors and state discrepancies are diagnosed and repaired by the
active owner without asking the user; unknown delivery still requires reconciliation,
and missing provider support never authorizes duplicate work or broader permissions.

Follow `.agent-workflows/queue-merge.md` for exactly one acknowledged repair owner,
including no-webhook base-conflict checks and at most three repairs per failure.
A scheduled check-in while active is not durable recovery. Before claiming unattended
recovery, observe a real supported wake, repository/whole-log/push/check/queue access,
and bounded re-arming to the original owner window. Record the native wake receipt.
Without that proof, the active owner stays through merge and exact-SHA post-land
results; report restart, reclaimed-container reconstruction or missing wake support
as open. Stop wakes at terminal state/window expiry. Never claim archived revival or
indefinite monitoring without separate evidence; never extend the authorized window.
On plan pause/block/expiry, stop native auto-continuations, retries and new-session
launches too; checkpoint/reconcile in-flight work and preserve queued-PR repair ownership.

Continuing plan projects use the immutable project deadline and bounded work blocks in
`plan-run.md`. Native replacement/remote handoff needs acceptance-side stale-owner fencing;
the current local SQLite authority and Git checkpoint CAS do not provide it. Restored project
execution stays refused. Checkpoint and stop when closing the active owner without qualified
cloud acceptance. A project pause/block end stops local keep-awake and block-specific wakes.
