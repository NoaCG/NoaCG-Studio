# Host adapters - one planner, several execution routes

Read before choosing a home or promising an unattended shift. The 2026-09-10 Codex measurement
used Claude's **plugin worker**. Its sandbox observations remain evidence about that route, not
restrictions on the native Codex app. Keep the Claude-native Agent and Monitor paths intact.

## Establish the current session's capabilities

Record the coordinator host, version, available agent/wait/automation tools, filesystem scope,
GitHub access and durable plan path in the wave-state file. Use the tools actually exposed.
`gh repo view` establishes GitHub access; a CLI version or installed plugin does not.
Never change permissions to make a capability probe pass. Failure leaves the route unavailable.
Do not repeat expensive model probes once auth and route capability are verified; preserve original receipts.

| coordinator | Codex work | Claude work | Antigravity work |
| --- | --- | --- | --- |
| Claude Code | existing `rescue` wrapper, called directly by the owning row | existing Agent definitions; authenticated CLI if needed | existing `agy-run` wrapper |
| native Codex with subagents | native subagent assigned an explicit feature worktree | authenticated Claude background CLI | existing `agy-run` wrapper |
| restricted Codex plugin worker | assigned patch unless capabilities demonstrate more | only if tools, grants and auth permit | only if tools and grants cover the task |

The third row is a worker, not an unattended coordinator by assumption. If a required capability
is absent, keep useful work on available routes and state the precise limitation. A supported
fallback never means routing around a tool's safety refusal.

## Home, row ownership and worktrees

Use `node scripts/orchestrator-home.mjs` when the session can execute in its printed directory.
A native app session need not move its UI task there: issue planning commands with explicit cwd.
If the harness pins cwd, stay in the current clean detached planning checkout after fetching and
confirming its HEAD matches `origin/main`; report stale reads otherwise. Never switch a live
worker's checkout, never use the primary main checkout, and never build in the planning home.

**Implementation workers never share a working tree.** Before a native Codex or CLI launch,
fetch and create a feature worktree from `origin/main` with
`git worktree add -b <branch> <path> origin/main`. Use the assigned branch and an unused path within
the current grants; never branch from the coordinator's in-flight changes. Creating an assigned
row's empty worktree is launch infrastructure, not permission to edit or adopt someone else's.
A Claude Agent's existing isolation mechanism stays as-is. A native Codex subagent needs absolute
paths and every command's cwd set to its assignment; its tool does not itself provide isolation.

Record letter, branch, absolute worktree, host, returned agent/job ID and result route BEFORE
launching another row. Record the launch with `wave-launch` too. A returned ID is not completion.
Only one coordinator owns a wave; a resumed turn reconciles existing IDs before launching anything.
Do not use app task creation to manufacture subagents; that surface is for user-requested tasks.
App handoff moves an existing task and its git state, not a background worker's ownership record.

**Missing from Claude's inventory does not mean dead in Codex.** Check native agent/task status
and the recorded worker result, alongside branch and transcript evidence. If the owning harness
cannot be queried, ownership is UNKNOWN: do not queue, adopt, clean or replace that branch.
Stop on unknown ownership; never perform arbitrary PID kills or permission changes.
The orphan-adoption procedure in `night.md` applies only when all its signals cover the owner.

## Claude workers launched from Codex

Check `claude --version` and `claude auth status` without exposing credentials, then verify one
useful bounded call: login status can lapse before model execution. A subscription login differs
from an API key; do not start paid API work merely because a key is present. A login-expired
result marks this route unavailable until reauthentication.
For a working `--bg` route:

    claude --bg --name <wave-letter-name> --model opus --effort high -- <prompt>
    claude agents --json --all
    claude logs <returned-id>
    claude --bg --resume <returned-session-id> -- <follow-up>

Invoke with an argv array and `--` before the prompt: variadic flags such as `--mcp-config` otherwise
consume it. A failed-before-init ID has no resumable conversation; diagnose it before a fresh
launch. Adding flags to resume may create a COPY: record the actual returned ID. The worktree flag is also
valid, but verify the actual branch and cwd before work begins; a branch line in a prompt does
not configure isolation. Record the returned identity and reconcile it before retrying a launch.
An interrupted/ambiguous launch is UNKNOWN until inventory/logs settle it, never an automatic retry.
Native background mode owns process survival and resumption; do not build a second daemon.
Do not apply print-only flags to background mode. Inherited grants still apply, so a permission
wait is reported and the independent rows continue. Never disable hooks or approval controls.

**Live Claude CLI 2.1.268 background and resume behavior:**

- `--bg --resume` creates a COPY session if the original process is still running, even if its state is reported as `done`.
- `claude stop <id>` acknowledgement can precede actual process exit.
- Always verify that the worker's own PID is absent from inventory (`claude agents --json --all`) before executing resume.
- In the measured stopped-session probe, resume then returned the SAME ID with saved options; always record and check the returned identity rather than assuming it.
- Stop on unknown ownership; avoid arbitrary PID kills and do not alter permissions.

For a bounded foreground review, or a host without background mode, use:

    node scripts/claude-run.mjs run --cwd <feature-worktree> --prompt-file <absolute-file> --read-only --timeout-seconds 180

Omit `--read-only` only for an assigned implementation row. The bridge sends stdin, inherits
permissions, records local job/results, and refuses duplicate workers for one worktree. Its
`status`/`result --cwd <worktree> --id <id>` commands recover receipts. Keep its persistent shell
session alive until completion. The bridge provides no durable supervision after its host is killed.
A killed supervisor can leave a live child worker process; PID presence is not identity proof.
`readStatus` reports `supervisorPresent` and `workerPresent` separately (with `processPresent`
retained as a boolean supervisor-presence field for compatibility) and keeps status as `unknown` when no confirmed
terminal receipt exists. Ownership locks are retained on unconfirmed termination for manual recovery.
Result status and denied tools matter; a claimed success still needs independent verification.

## Codex overnight execution

Use the same candidates, collision check, horizon and report as Claude. A ten-hour request gets
fixed `Window starts:` and `Window ends:` timestamps; preserve both through compaction and refill.
End early only for exhausted meaningful work, capacity/access limits, the horizon, or the user's
stop - not because the first cohort finished. Log the reason rather than manufacturing tasks.

While the turn is active, wait on native agents and persistent shell sessions with bounded waits,
and run `node scripts/wave-watch.mjs --once` plus `node scripts/ci-watch.mjs --once` between
completions or at most every few minutes. A background process printing does not wake an ended turn.

If the app exposes thread heartbeat automations, an explicit unattended-shift request authorizes
arming ONE on this coordinator task through the automation tool. Store its ID in the durable plan.
Its prompt names that plan and fixed deadline, reads the saved state and compact tick first,
loads planning modules only when a new decision needs them, reconciles worker IDs,
performs a tick and eligible refill, stays quiet on unchanged/non-actionable state, and pauses
itself at completion or the deadline. Use five-minute recovery ticks, not new tasks per tick.
Never reset the window or start a second wave. Native waits handle prompt completion; the
heartbeat resumes between turns. If no wake-up tool exists, stay in the active turn; if it cannot
continue, report partial completion and the missing mechanism instead of claiming a night is armed.

### Guarded pilot resume on either host

For a saved JSON `bounded-production-pilot`, pause its owned heartbeat using the host's automation
tool, then use **one command** for validation, claiming and dispatch:

```text
node scripts/resume-dispatch.mjs --state <absolute-pilot.json> -- <executable> <literal-arguments...>
```

Run this from the feature worktree. The executable is the same bounded, permission-preserving
harness adapter already selected for the row. A failure from this command ends the attempt:
never issue a separate provider call afterwards. Do not convert the JSON through a shell date
type or hand-write the claim. This path is shared by Claude Code and Codex; it calls neither
provider until all guards and the durable claim succeed.

The supported state has `version: 1`, `kind: bounded-production-pilot`, an absolute `worktree`,
the expected feature `branch`, UTC `startedAt` and `deadline` strings ending in `Z`,
`phase: awaiting_resume`, `resumeCount: 0`, and `refill: { status: pending, launchCount: 0 }`.
Other fields are preserved. An explicitly user-authorized continuation adds `continuation`
with its own `startedAt`, `deadline` and nonempty `authorizedBy`; it cannot replace an open
original window, and neither window may exceed 24 hours. The command checks the saved record,
not whether the user actually authorized it: the coordinator must record real authorization.
An expired window is never extended automatically.

The controller retains an exclusive `<state>.dispatch-lock` after accepting an attempt, even
if spawning or a later write fails. `launchCount` counts the claimed attempt, not proof that a
worker ran. Concurrent wakes, repeated wakes and uncertain crashes must reconcile that claim,
the saved command/PIDs and `<state>.dispatch.log`; never delete it because a PID is absent.
Unclaimed validation refusals release their lock and leave the state unchanged. Use a new,
explicitly authorized pilot for another attempt, not a reset of this pilot's counters.

`awaiting_result_review` and `refill.status: exited` report transport completion only. Read the
saved stdout/stderr log, inspect exit code and validate the actual result before marking the
review passed. An empty answer or zero exit code alone is not a review. The launch deadline
prevents new work; the harness adapter still owns its worker timeout and termination protocol.
This controller does not schedule wake-ups or promise exactly-once execution after a crash;
it refuses to launch again when execution is uncertain.

Cheap acceptance: `node --test scripts/resume-dispatch.test.mjs`. It uses temporary Git worktrees
and local Node children only, including concurrent CLI processes and simulated disk failures.
Passing it does not replace the later live refill smoke test or prove an overnight shift.

Local execution requires its host to remain available. No adapter promises work while that machine
is asleep, the app is closed, authentication expires or the subscription is exhausted. GitHub PRs
already queued land independently. Pause only this wave's heartbeat after the report; do not
delete other schedules or terminate unrelated processes.

## Compatibility acceptance

Verify commands/grants before one useful bounded delegate call. Read its actual result and denied
tools, not exit code alone. Exercise native Codex delegation, Claude-from-Codex review, the unchanged
rescue command shape, Antigravity allowed/refused worktrees, restart/no-duplicate handling, a valid
ten-hour window and an invalid >24-hour one. A smoke task proves its route, not a whole night.
