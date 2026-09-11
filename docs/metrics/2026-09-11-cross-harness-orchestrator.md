# One orchestrator across Claude Code and native Codex

Measured 2026-09-11 on branch `codex/orchestrator-cross-harness`, based on `fc4b69e5`.
This is implementation and bounded route verification, not evidence of a completed ten-hour wave.

## What was conflated

The 2026-09-10 comparison invoked Codex THROUGH Claude's plugin. Installed plugin 1.0.6 sets
`approvalPolicy: never` and either `read-only` or `workspace-write`. The wrapper passes its
process cwd to the plugin. A worktree path written in the task prompt does not change that cwd,
and the plugin's sandbox can exclude the shared git directory. Those observations remain valid.

Native Codex in this session exposes subagents, explicit shell cwd, GitHub network access,
unrestricted filesystem permissions, task handoff tools and thread heartbeat automations. Native
subagents share a directory by default; they must be assigned separate implementation worktrees.
Neither that capability nor the plugin's restrictions should be generalized to the other route.

The installed Codex CLI reports `0.154.0-alpha.11`; `exec --help` exposes `--worktree`, `--cd` and
`--add-dir`. The official [0.154.0 changelog](https://learn.chatgpt.com/docs/changelog) describes
experimental worktree creation/fork/resume and a shared Windows server. The
[worktree documentation](https://learn.chatgpt.com/docs/environments/git-worktrees) describes app
handoff. Help and documentation establish available surfaces, not this plugin's integration with
them. No CLI upgrade or permission expansion was performed.

## Why delegations underperformed

- Codex launch cwd was sometimes different from the worktree named in its prompt.
- A blanket ban on git prevented verification: build gates use read-only git subprocesses.
- Antigravity had no command grant. A task asking it to discover files could return empty output
  while an explicit file list and `read_file` task could succeed.
- Its write grants cover Claude's worktree root and a Claude temp directory, not native Codex
  worktrees. `grantPreflight` previously accepted any write grant, regardless of target path.
- Routing said only Claude could own judgement, verification and landing. That is a limitation
  of a constrained delegate, not a property of the model or of native Codex.

The path preflight now refuses an uncovered directory BEFORE invoking Antigravity or recording
spend. Tests cover granted Claude roots, refused Codex roots, case/separators, sibling prefixes,
parent traversal, read-only tasks and unrecognized grant patterns. A runtime probe with
`AGY_BIN=node` returned exit 2 and created no ledger, proving the paid client could not run.
Unknown grant syntax is reported as unknown rather than implementing a guessed permission engine.

## Claude from Codex: measured launch behavior

Claude CLI 2.1.263 exposes native background launch, named sessions, inventory, logs and resume.
Those are preferable to a new daemon. A bounded foreground `scripts/claude-run.mjs` supports
literal stdin prompts, narrow read-only review, duplicate refusal and durable results without
claiming background survival. It preserves configured permissions and checks denied tools.

The useful read-only review probe found three distinct outcomes:

1. `5bb8fe05`: variadic `--mcp-config` consumed the positional prompt. The CLI returned a job ID,
   but its state had an empty intent and failed before initialization. Add `--` before the prompt.
2. `14ae739e`: resuming that failed-before-init job could not find a conversation. Changing flags
   on resume created a copy, announced by the CLI. Always record the returned identity.
3. `38b6db2c`: a corrected fresh launch reached Claude in this feature worktree and reported
   `Login expired`. `claude auth status` then reported `loggedIn: false`. The earlier auth-status
   check had reported a subscription login. No successful model review was claimed; the owned
   background session was stopped and the user was told `claude auth login` was needed.

The two startup errors did not reach model execution. Native background launch/readback is
measured; successful authenticated work and resume after a completed turn remain unverified.
Reauthentication is an account action, not a reason to widen permissions or use an API key.

## Shift bounds and meaningful output

An in-memory reproduction recorded a standard task at minute 0, a small repair at minute 123,
and queueing at minute 128. The old join reported five minutes; it now reports 128 and preserves
the original classification, with attempts separately visible. Persisted v1 records stay readable.

The old checker accepted a 72-hour night plan. It now rejects excessive, expired and malformed
windows while accepting ten hours and the exact 24-hour ceiling. New plans record their original
start and end, preserved across refill and compaction. End-only legacy plans use the current
check time as their ceiling origin and cannot prove an earlier start.

The new host adapter uses the existing candidates, collision and horizon tools. Native Codex
waits can service an active turn; a supported thread heartbeat recovers between turns. A plan
records the actual wake-up ID and deadline; no scheduler was armed by this implementation task.
No claim is made about operation while a local host sleeps or its application is closed.

Coherent outcomes share one branch and landing. Independent rows can refill while GitHub lands
queued work. Two failed attempts without new evidence hold that item for rescoping, not the whole
wave. Reports distinguish new outcomes from repairs and queue wait. Existing Claude Agent/Monitor
and rescue mechanisms remain available; no GitHub rules or merge protections changed.

## Merge queue review and follow-ups

GitHub's organization queue owns main. The branch owner declares completion through `queue:merge`;
the PR requires `CI gate` and `Reviewed`, and `merge_group` tests the combined tree before landing.
Merge commits preserve ancestry for the landing and worktree machinery. Main's latest inspected
CI run was successful. This change preserves those gates and does not tune queue batching.

Two follow-ups deserve separate reproductions before implementation: enforce the existing
unlanded-parent check at the queue entry point, rather than relying on a session running
`merge-order`; and prevent a late red-main run from proposing a stale revert after a newer main
has already recovered. `revert-landing.mjs` currently bases its branch on the reported failing SHA.
Also measure whether the 40-run/history bound in `red-main-issue.mjs` misses the earlier verdict
under heavy queue traffic before increasing it. These are review targets, not fixes claimed here.

## Check evidence

The final review scope is the 25 changed files on this branch against
`fc4b69e54ebc4a7616c98a58c07ba1de3070b976`, including untracked additions. An independent review
of the initial implementation found two confirmed issues: POSIX timeout needed to terminate
the worker's process group, and the coordinator's exceptions needed to permit empty assigned
worktree creation. Both were fixed and the changed scope was checked. The final delta and full
scope were reviewed inline; simplification was inline because no dedicated capability was exposed.
The bounded foreground bridge reuses the installed-Claude resolver; native background mode owns
overnight process survival. No additional daemon was added. Taste review is not applicable:
no product or graphic rendering changed.

The targeted five-file test run passed 134 tests. The full build initially found two lint issues
in the new code; both were fixed rather than suppressed. The final `npm run build` exited 0:
1,603 script tests passed, one skipped, typecheck/lint and production bundling passed, and 502
template pages were prerendered. Shared-instruction and owner-queue checks passed. Successful
live Claude work and a full night remain separate acceptance requirements.

Run the targeted Node tests for `wave-launch`, `wave-horizon`, `wave-plan-check`, `harness-usage`
and `claude-run`; then `npm run check:shared-instructions` and `npm run build`.
The owner-queue item records the remaining live cross-host/overnight acceptance rather than
mistaking those mechanical checks for a successful night.
