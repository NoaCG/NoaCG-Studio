---
v: 2
source: derived
kind: finding
raised: 2026-10-04
state: unstarted
found: "Coordinator observation: routine native Codex orchestration loads too much guidance and prints too much irrelevant state before useful work starts."
---
# Simplify the normal native Codex orchestration path

**Filed:** 2026-10-04. **Source:** coordinator observations during the 2026-10-03 night wave,
reported to this documentation worker. This is a derived finding from an efficiency assessment,
not a new owner requirement or a measured cost saving.

## Why

Instruction bulk and routine output make a native-only wave harder to launch and supervise.
The same run showed that isolated worktrees, review and CI were useful: they caught actual defects.
Simplify the coordination overhead while retaining those protections and the durable evidence
that makes unattended work recoverable. This supports the reliability bar in `docs/GOALS.md`.

## What it would take

Make one bounded follow-up to the existing orchestrator, using its module routing rather than
adding another framework: load guidance selectively; show compact native-only worker state;
inspect local test selection counts and run bounded relevant cases with the broad CI gate;
reserve reviewer capacity before launches. Preserve all existing gates, permissions, ownership,
fixed deadlines and receipts. Measure launch latency and guidance/output volume on the next
comparable wave. Do not remove checks based on this one run or add a global rule from it.

## Evidence

Coordinator observations at an intermediate cutoff, not independently remeasured by this worker:

- Initial 12 workflow files loaded: 1,382 lines, 16,537 whitespace words, 105,821 characters;
  the first two launches took about seven minutes. Unused multi-provider `harness:usage` output
  added 528 lines to a native run.
- A prompt filename mismatch, a failed heartbeat schema call and a reviewer capacity race
  caused avoidable coordination work. Default sandbox builds repeatedly hit EPERM; normal
  approved host execution passed without changing permissions or weakening gates.
- B's local selectors expanded to 1,904 then 817 cases and were canceled; 51 explicitly bounded
  local cases and broad CI subsequently succeeded.
- F already landed a minimal native-identity correction. It corrected a 61% usage undercount
  at one root+A+B cutoff. This is not the final wave usage or a reason to repeat that fix.

These observations support reducing instruction/output overhead, not a claim of dollar waste,
causal attribution of every delay, or final usage totals. The morning assessment will supply
final exact usage and outcomes. Durable implementation entry points are
`.agent-workflows/orchestrator.md` and its `orchestrator/` modules, `scripts/harness-usage.mjs`,
`scripts/e2e-affected.mjs` and `scripts/wave-launch.mjs`. Their scoped rules were checked before
filing; this item proposes no rule or framework change tonight.
