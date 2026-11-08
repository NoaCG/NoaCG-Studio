# Codex plan execution

`$plan-run <plan> [until <time>]` uses the existing supervisor and ledger. Read AGENTS.md, the spec,
current launch/owner receipts, and `.agents/skills/plan-create/references/codex.md` for creation/modes.
Claude's commands and default templates continue to use `.agent-workflows/plan-run.md` unchanged.

## Binding contracts

- A wave runs alone; plan runs of different plans may run side by side, never on the same files.
- Finite owner-authorized project deadline binds unless explicit untilComplete makes it a target.
  Automatic daily blocks separately need blockRenewal; preserve the immutable scope, date and attempts.
- Only phases written in the plan. Missing acceptance refuses launch. Owner closure is not technical PASS.
- Only the merge queue writes `main`. Use `.agent-workflows/queue-merge.md` and
  `.agent-workflows/verify.md` with their current checks, budgets, retry rules and one PR repair owner.
- The wave ledger is execution authority; work.json is acceptance evidence; kit/heartbeat are context/views.
  Never rewrite an old failure as green, weaken tests to pass a gate, or create another ledger.
- Read `docs/plan-runs/known-traps.md` for shared worker/review/landing gates, including Narrow delta.
  Its dated Claude worktree/browser workaround applies only to that image; Codex uses its qualified
  absolute paths and Cloud runtime browser/package guidance. Other shared traps remain binding.

## Enter and reconcile

Qualify the selected active/unattended mode before mutating runtime state. Inspect first, then
`node scripts/run-supervisor.mjs continue <state-root> <plan> <owner>` to restore the same project.
No existing project: follow plan-create's `node scripts/wave-plan-store.mjs --open` path. Never open
another run to escape a pause, unknown submission, spent allowance or provider restriction.
Read supervisor status and the restored kit. Reconcile worker native IDs, branches/SHAs, PRs, queue,
Actions and repair-owner comments. Missing status/acknowledgement is unknown, never absence.
Update the kit's current coordinator session and return destination, publish it, and transfer each
PR repair owner through its existing comment only after the old wake is disabled and native work
is authoritatively reconciled. Git checkpoint ownership is not a native lock. Require native stop
acknowledgement before replacing a worker that may still run; otherwise stop safely.
Run the executing worker's resource/network preflights and current folder rules. Same-machine
workers use fresh conversations and owned absolute worktrees, serially with isolated ports/services.

## Admit and execute

`node scripts/run-supervisor.mjs next <db> <id>` is the sole phase admission view.
`node scripts/plan-run.mjs next <wave>` describes the ledger; projects record only through supervisor.
Do not use tick to launch continuing projects. Do not infer a launch from a build-intent record.
1. Render `node scripts/plan-kit.mjs brief <wave> build|repair|check <phase> SOURCE=<sha>` (check
   instead uses MERGE=<sha> PARENT=<sha> PR=<n>), with `WORKTREE=<owned absolute path>`; repair adds CARRY.
   Start from the exact full source/merge SHA in that fresh worktree; never a queue candidate or drifting main.
2. Before native dispatch, record build/repair/check with its actor and `launch` object as defined in
   `docs/work-specs/codex-plan-runs/spec.md`. The supervisor persists the exact brief, source, native
   binding, block and action/hash in its existing pending record. Immediately before dispatch run
   `node scripts/run-supervisor.mjs ready-launch <db> <id> <block.json>`: it rechecks current authority
   and reserves dispatch once. Send only its returned exact request with native Codex tools. A stopped
   block or lost ready acknowledgement retains the intent; reconcile instead of requesting dispatch again.
3. Read back native acceptance, then use `node scripts/run-supervisor.mjs observe-launch <db> <id>
   <observation.json>` with the exact native binding, action/hash and returned worker ID. Unknown or
   lost delivery blocks advancement and replacement. Reconcile the original action, never resend it
   because a response is missing. Authoritative final non-delivery is retained as a safe stop.
4. Follow the original worker by ID with status/completion events and bounded waits. Its receipt
   names the reviewed SHA, CI configured selection, required independent review and PR. The worker
   never stamps itself or enables auto-merge. The coordinator verifies actual permission and gates,
   checks the head before/after, and uses the normal queue route. A self-approval refusal is a real
   blocked permission boundary; do not bypass it with another actor label or alternate stamping route.
5. Record landed with mergeSha, then immediately admit a fresh independent checker: “You did not build it.”
   It shares no builder/repair conversation, checks every criterion/environment and all required exact-merge
   runs. A cancelled/superseded CI run needs the existing justified exact-SHA dispatch, not assumed PASS.
   Checker runs in its own worktree and returns its native identity; acceptance cannot be self-awarded.
6. Record pass only with the latest independent actor's exact-merge evidence per criterion. Archive
   finished phase/review sessions after their results, preserve current coordinator and running work.
   Publish kit changes and render the heartbeat. Ask next again; no next builder before predecessor PASS.

## Failure, waits and stopping

Preserve the shared loop: one repair after product fail, one re-check after blocked fail, then one
fresh independent diagnose (repair/check/stop); any later failure stops. Counts survive replacement.
A repeated state-rule family gets fresh model reassessment before further patching, not more attempts.
Infrastructure/review-service/capacity outage persists a wait without spending product attempts.
Use current control evidence for an unrelated red; never alter its judge. Resume after observed usage
reset only within authority; unknown reset waits. Preserve provider, model, billing and permissions.
Make reversible scoped engineering decisions and record why. Reserved money/privacy/account/scope
decisions stop the dependent item; ask through the current acknowledged owner route. Issue assignment
is not notification; reuse the accepted #1951 route, checking its current status. OW phases hand over
the usable kit and retain their unverified status; keep no check-in while the owner holds them.

Active mode: retain the coordinator through acceptance and terminal post-landing results; no wake
or after-session recovery claim. Unattended mode: re-arm only a qualified native wake within the
active block. The kit wakes before expiry; checkpoint and retain an active coordinator until the
boundary, then renew under existing standing permission before any new launch or wake. A missed
boundary or unsupported retained session is unqualified recovery, not permission to extend a worker.
At pause/block/cancel/expiry stop launches, retries and wakes, checkpoint native work and preserve PR
ownership. Owner pause requires explicit resume. A superseded coordinator stops. Finish only after
required phases pass; report unmet overall criteria and owner disposition separately and stop wakes.
