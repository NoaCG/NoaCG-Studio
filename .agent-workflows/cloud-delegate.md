# cloud-delegate — provider-native work and bounded recovery

Route ordinary implementation, review, verification and unattended phases to cloud.
Keep device, installed-program, private-local-file and local-browser-state tasks local.
Use the existing wave/plan/job and landing records; this procedure creates no new scheduler.
Native subagents share one VM; they are useful reviewers, not separate cloud resources.
Each provider launches its own workers in its existing environment/subscription.

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
`docs/work-specs/cloud-execution/evidence/capabilities.md` and the current native
interface/help. Missing or denied launch/auth/mapping support stops that launch;
continue independent work. Never transplant credentials, bypass the proxy, retry a
known denial or substitute an API model, another provider or same-VM subagent.

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

**Codex current cloud**: this coordinator's supported UI launch, app read/follow-up
and GitHub artifact return are observed. `wait_threads` failed with and without host.
No task-create connector is exposed here; do not invent one. The installed cloud CLI
has exec/list/status/diff/apply but no follow-up command. Local CLI discovery returned
zero environments before create_task; this managed CLI's injected credential returned
401 at the environment endpoint. No native child has been qualified. Use the supported
Work in > Cloud > published-environment UI for a current task when the owner directs
that surface; it does not turn the failed CLI submission into success. Stop/reconcile
unsupported child launch until authenticated access AND environment mapping are proven.

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
