# Preserve intent across bounded orchestration sessions

Owner requirement: [the 2026-09-14 brief](owner-intent.md) asks for architecture review and safe
incremental improvements, preserving autonomous execution on Codex and Claude Code. Existing
authority: [GOALS](../../GOALS.md), [North Star](../../the retired 2027 North Star) and
[programme register](../../the retired programme register). This work changes development workflow, not the
product direction or a parked programme's authorization.

Problem: the current phasing guidance can be undermined by large assignments and partial
deliveries whose unresolved requirements are carried only in prose. Desired outcome: a fresh
worker can find its bounded obligation and a reviewer can find what remains unmet without the
coordinator carrying the whole investigation.

Preserve: continuous bounded waves, owner intent, dependency/collision checks, unknown ownership,
durable launch claims, recovery and GitHub queue landing. Routine fixes keep their lightweight
route. Non-goals: replace the scheduler, install upstream frameworks, build a tracker, auto-close
product promises, force fresh contexts on every task, or retrospectively specify old programmes.

Derived design: conditional spec module and a read-only acceptance/evidence checker; technical rationale
and plan are [the architecture review](../../ORCHESTRATOR_SPEC_REVIEW.md). The original brief
authorizes these reversible workflow improvements; it does not authorize new paid runs.

### AC-1: Preserve the current orchestration protections

Map the important mechanisms to prevented failures before changing them. Existing wave planning,
candidate, horizon, recovery/dispatch and landing regression checks still pass. Do not replace
their runtime ownership or write authority with a second state store.

### AC-2: Bounded wave assignments retain acceptance without duplicating execution state

Per the owner's clarification, `work.json` contains acceptance/evidence only. Scope validates
criterion IDs; size and dependencies stay in the existing wave. Oversized candidates request
autonomous decomposition and do not starve bounded independent work. A future dependent can
coexist with its prerequisite in the wave plan. Version 1 migrates on read without promoting
task-completion flags to accepted behaviour.

### AC-3: Partial work and stale evidence cannot close the parent record

Worker completion or branch landing alone is insufficient. The real wave observer separately
reports open parent criteria and the Orchestrator continues bounded gap work. Missing/failed/unverified acceptance evidence, changed
receipts, a changed spec or a changed reviewed implementation produces open/invalid, not an
evidence-complete record. Actual behavioural review stays separate from record integrity.

### AC-4: Context is bounded through retrieval and concise durable returns

The common planning instruction path does not grow. Substantial work has a conditional route;
prompts point to task/spec/evidence instead of copying investigations. Checkpointing preserves
remaining IDs and next action, without changing ownership or deadlines. Do not claim measured
real-world decision-quality gains from this local mechanism test.

### AC-5: Both runtimes retain the same workflow and small fixes remain simple

Codex and Claude Code wrappers still point to canonical shared procedures. Equivalent records
are handled identically for both pool names; legacy prompts without SPEC remain valid. No runtime
SDK, new daemon, recurring task, or package installation is needed for the checker.

### AC-6: Real Orchestrator pilot continues after a partial worker delivery

Use a naturally occurring bounded substantial feature, backed by an existing owner/frontier item.
Observe one worker finish with parent criteria still unmet, then autonomous bounded continuation
and scenario-based review to convergence. Exercise Codex and Claude Code if practical, recording
actual runtime limitations. Preserve normal launch/worktree/landing authority. The broader
instruction-context audit remains an explicit post-pilot follow-up, not silently complete.
