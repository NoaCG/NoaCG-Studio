# Substantial work - intent, bounded tasks, convergence

Load for a major feature, direction change, repeated partial delivery, or a SPEC row. Routine
fixes use GOAL/WHY/GATE as before. Do not backfill old projects merely to populate this format.

## Authority and the specification checkpoint

Owner intent -> the outcome and its done criteria in `docs/GOALS.md` ->
active spec -> plan -> task -> implementation -> verification. The last two describe reality,
not permission to redefine the goal. Use those existing sources as the constitution; link the
relevant sections instead of copying product principles. A handoff or discovery is evidence.

A new major outcome starts with a compact `docs/work-specs/<slug>/spec.md`: problem/why, desired
behaviour, authority links, preserved behaviour, non-goals and observable `### AC-1: ...` headings.
Label owner requirements, derived decisions/assumptions and rationale separately. Technical design
belongs in the existing project plan (or `plan.md` beside the spec), not the outcome definition.
The orchestrator assigns the document work to a row; its no-product-edit boundary is unchanged.

Show the proposed outcome to the owner before expensive implementation when new direction needs
alignment. Record the actual message/ruling as `authority.source`, with `status: agreed` only
when it authorizes this outcome. An existing explicit instruction or ratified picture suffices;
do not ask again. Draft work may research/specify, but is not an implementation candidate. The
implementation prompt has no owner-wait step: independent authorized rows keep running. Propose
a better solution openly; changing the goal needs owner steering, not a rewritten acceptance test.

## Bound the assignment, preserve the parent

Before dispatch, assess uncertain decisions, touched subsystems, dependency depth, and time for
real verification using existing `wave-horizon` estimates. `large`, a phase with several distinct
outcomes, or a verification step that cannot fit means AUTONOMOUSLY SPLIT. Task size and context
pressure are never owner checkpoints. Ask only when a split reveals a genuine product/intent
decision; preserve the agreed outcome otherwise. Prefer smaller wave rows under one spec first.

Keep stable parent acceptance IDs. Each child names its parent path and IDs; the existing plan
names the child path and still needs parent-level evidence. A child completing
does not satisfy an integrated parent scenario automatically. Every criterion stays assigned,
including cross-child integration and preservation scenarios. Never delete an unmet criterion
to make coverage pass. Explain the split in section 4 and keep letters stable; it changes delivery
units, not product scope.

Use `docs/work-specs/README.md` for the versioned acceptance/evidence ledger. `work.json` contains
NO task lifecycle, ready set, launch, dependency or landing state. The existing plan/wave/job
system owns all execution. Planner decomposes there; workers write separate evidence/handoffs,
and one assigned consolidation row updates acceptance. Allocate that file in TOUCHES.

`SPEC docs/work-specs/<slug>/work.json AC-1,AC-2` binds a row to its acceptance scope; `SIZE small`
or `SIZE standard` is required. The wave check validates these before launch. Scope-only check:

    node scripts/work-spec.mjs scope docs/work-specs/<slug>/work.json AC-1,AC-2

This checks intent coverage, not execution eligibility. Existing collisions, candidates, launch
ledger, host ownership, guarded resume, windows and serialized landing decide execution. A large
candidate returns `decompose`; replace it with bounded rows autonomously. Old no-SPEC plans remain
supported. Do not use classification or a missing SIZE line to bypass substantial-work scoping.

## Context and worker return

Start with the assigned task, parent intent and relevant acceptance headings, plan section,
applicable area contracts, and current code. Retrieve siblings, logs and incident history only
for a concrete uncertainty. Preserve the current common-path budget; this module is conditional.
Write findings outside chat, then return the concise receipt prescribed in `prompts.md`.

At a coherent milestone, or when context pressure threatens verification, checkpoint code and
evidence, unresolved IDs, decisions and next action. Continue in a fresh native context when the
host supports it, after confirming the old worker relinquished ownership. Do not fake context
resets with a second live worker, reset a deadline, or report completion to escape a full context.
The new context reads artifacts and checks current code; it need not inherit the investigation.

## Converge before closing the parent

Read the spec against the actual current implementation and run the acceptance scenarios. Use
the existing check/review route with fresh context where available; never grade only the diff or
task checkboxes. Inspect preserved behaviour and integrated scenarios as well as new behaviour.
Store a concise review under the spec's `evidence/`, with command/run references, observations,
limitations and every AC marked pass, fail or unverified. Hash the evidence files in `work.json`.

After EVERY worker completion or landing on this parent, read its acceptance ledger before any
completion report. `wave-tick` reports parent acceptance separately from branch landing. For open
criteria, autonomously continue a matching wave row or plan a new bounded gap row with those IDs,
using existing refill/ownership/collision controls. Update the operational plan, never shrink the
spec. A done worker does not close its parent. Continue until reviewed convergence or an actual
window/access/intent boundary; carry unresolved IDs durably if such a boundary is reached.

    node scripts/work-spec.mjs converge docs/work-specs/<slug>/work.json

The read-only checker refuses missing criteria, missing/altered evidence, old spec hashes
and a changed reviewed tree. `evidence-complete` means the record is consistent, NOT that a hash
or an agent's prose proves behaviour. The reviewer must judge the actual evidence; a zero process
exit, file existence or regex match is not functional verification. Keep implemented,
machine-verified, scenario-proven, owner-accepted and production-proven distinct, as GOALS.md
("How done works") requires. Queueing declares the bounded branch finished, never silently the whole parent.

After this pilot, follow `docs/backlog/instruction-context-rot-after-spec-pilot.md`: audit actual
loaded context, stale instructions and deeper chains. Do not let this ledger become another layer
over stale guidance or treat a smaller core file as proof that context rot is solved.
