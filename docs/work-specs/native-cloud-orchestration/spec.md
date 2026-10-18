# Native Claude cloud orchestration cycle

Authority: owner prompt to coordinator `session_014ka1JkcBhgjXBaoBjxwCcm`, 2026-10-17, for #1301
with context evidence for #805. Parent: [cloud-execution](../cloud-execution/spec.md) AC-3/4/5;
follow-up to [native-recovery](../native-recovery/spec.md).
Window: 2026-10-17T18:39:59Z to **2026-10-17T20:39:59Z**, fixed, never extended.

## Behaviour and boundaries

One phase, "Execute and document one native Claude cloud orchestration cycle", runs through a
thin cloud coordinator, one separate native cloud builder and one separate native cloud checker,
all in environment `env_017nuiDZBW9smUNLdWVQK8cf` on the existing subscription. Same-VM Agent
subagents do not count. The coordinator records the phase in the existing wave store and
`scripts/plan-run.mjs` ledger; it does not invoke `/plan-run`, register a plan alias or change
shared routing. Results return through pushed Git branches and the pull request, never local paths.

Reused, not repeated: #1305 launch/identity/follow-up and click-free landing, the
cloud-landing-recovery Claude wake receipts and the native-recovery re-arm receipts.
Still open after this phase: external reconstruction, remote fencing, native permission
continuation and genuinely uncertain delivery. The Codex `codex/native-recovery-next` work and
run-wake files are out of scope. No product code changes.

### AC-1: Coordinator phase ledger

The coordinator opens `plan-native-cloud-orchestration` with the fixed window, lists the one
phase under `## Phases`, and records each transition (`build`, `landed`, `check`, `pass` or
`fail`) with `plan-run.mjs record`, refused steps included. The ledger lines are copied into the
evidence record.

### AC-2: Native builder with receipts

A separate native cloud builder, created with `create_session` at the exact source SHA, reports
its own native session ID (from `get_session`), environment, full HEAD, clean tree, nonce and
`scripts/execution-profile.mjs` output. One coordinator follow-up through `send_message` gets a
reply naming the same identity and nonce. It commits the qualification record under
`evidence/` on `claude/native-cloud-phase-1-build` and pushes it.

### AC-3: Landing through the queue

The evidence change passes `/check` (stamped tip) and lands through `/queue-merge`. The landed
qualification record names the PR, reviewed SHA and queue state at queue time. The merge-queue
entry, merge SHA and the terminal conclusions of that SHA's PR, merge-group, main CI and
post-land runs cannot exist in the file that lands: they are recorded in the repair owner's PR
comment (#1408 issuecomment-6239053255) and verified independently by the AC-4 checker receipt.
Pending or failed stays explicit. The
coordinator acknowledges sole repair ownership in one PR comment before the builder ends.

### AC-4: Independent checker on main

Only after AC-3's merge, a different native cloud session checks current `origin/main` on
`claude/native-cloud-phase-1-check`: the record exists at the merge SHA, and its session IDs,
SHAs, PR and run conclusions match what the checker reads itself from `get_session`,
`list_events` and GitHub. It returns `PASS`, `FAIL product:` or `FAIL blocked:` with evidence.

### AC-5: Reconciliation and report

The coordinator records the checker's verdict in the ledger, reports what ran, landed and
passed, and names remaining gaps. Unavailable usage or context counters stay null, not zero.
Owned wakes are stopped at the end. Neither #1301 nor #805 is marked complete by this phase.
