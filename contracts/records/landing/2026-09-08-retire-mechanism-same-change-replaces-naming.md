# landing/retire-mechanism-same-change-replaces-naming

Rule: `landing/retire-mechanism-same-change-replaces-naming`. Recorded 2026-09-08 on `claude/orchestrator-on-the-queue` at 64dab69b.

When GitHub's merge queue replaced the laptop lander on 2026-09-06, the orchestrator contract and its modules kept telling rows to read auto-merge.mjs refusals, to quote merge-order verdicts as a landing order, and to fall back to the safe-merge workflow. The freshness gate saw nothing: every script still existed, only its meaning had changed. Found 2026-09-08 by reading the contract against the tree; nine instruction files across .agent-workflows, supabase/AGENTS.md and two adapters named a retired mechanism as a live instruction. The negative check docs/WORKFLOW_ARCHITECTURE.md section 5.3 designed was unbuilt for two days after the queue landed.
