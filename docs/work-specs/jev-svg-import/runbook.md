# SVG plan creation and handoff

Prepared with the repository's [plan-create skill](../../../.agents/skills/plan-create/SKILL.md)
and [canonical procedure](../../../.agent-workflows/plan-create.md), subject to the owner's explicit
instruction to obtain another opinion before implementation. This preparation completes the phase
definition and static handoff. It **does not** open a wave/project, register supervisor state, start
a block, create a run issue, post heartbeats or arm triggers. Even `continue` may claim ownership;
do not run it during review.

## Files and authority

- [spec.md](spec.md): sole numbered phase order and acceptance.
- [phases.json](phases.json): authority-free array, 43 exact phases; IDs are the spec's row numbers,
  no second numbering. Titles, acceptance text, dependencies and environments are copied verbatim.
- [work.json](work.json): normalized spec hash, draft authority and null convergence review.
- [readiness.md](readiness.md): pre-start evidence and boundaries.
- [decisions.md](decisions.md): selected workflow improvements and old/new row mapping.

This is an actual prepared repository plan, not a runnable supervisor project. Its registration
entry should be a small preparation-only PR after whole-plan reconciliation:
`jev-svg-import: docs/work-specs/jev-svg-import/spec.md`, explicitly forbidding launch until this
runbook's admission gate passes. It is not added to Runnable plans on main by this branch alone.
The owner has not authorized a start or standing block renewal; never fill those with example dates.

## After the whole-plan opinion

1. Resolve findings in this owned plan branch; refresh the spec hash and exact phase array.
   Check all AC headings and references, order/dependencies, allowed files/new-path creation order,
   no obsolete row references, and source ownership at the new main pin.
2. Land the planning documents/registration through the current check and queue-merge procedures,
   preserving review as draft until the accepted intent and explicit implementation authority
   are recorded. A planning acceptance check is not product convergence.
3. Close pre-start readiness items, including independently authored corpus and synthetic Sheet.
   Model/harness behavior that requires future implementation is qualified at the explicit early
   rows; label the residual risk instead of claiming it already works.
4. Obtain one concrete start contract with the already approved ceiling/duration, exact resolved
   instants and explicit standing permissions. The canonical procedure says “A plan run needs
   current explicit authorization”; the user's no-start instruction takes precedence over its
   automatic handover. No approval question is needed while the user still requests review only.
5. Only then run the normal plan-create steps below in the qualified Claude coordinator.

## Native project and kit mapping

Construct the runbook's version-1 project using the exact phases array. Supply the real
`id=plan-jev-svg-import-<actual-first-date>`, `ownership`, `authorization.source/scope/
permissionPolicy/startedAt/deadline/standing` and `status=paused`. Keep absent permissions absent.
The immutable deadline is 14 calendar days from the owner-authorized start, never a rolling window.

Use the existing wave-plan-store open command, supervisor register with recovery block, and
start-block with a deadline no more than 24 hours away or beyond the project deadline.
Save the returned authority receipt; do not fabricate a block ID or native session identity.

The kit's state.json uses:
- plan `jev-svg-import`, spec `docs/work-specs/jev-svg-import/spec.md`;
- actual project/issue/coordinator session, environment and return transport;
- owner's authorization line, deadline and standing words verbatim;
- common read set: spec, this runbook, readiness, relevant folder rules and
  `docs/plan-runs/known-traps.md`;
- branchPrefix `claude`, and the current waitingOn/inFlight/owner/fixes/triggers fields.

Run plan-kit init with the real wave/state; it supplies the existing build/check/repair/fix templates.
Add only this plan's read/file/acceptance details; no forked template engine. Publish through the
existing supervisor so the kit survives restoration. Open one run issue with public-safe scope,
authorization and phases, render its heartbeat from plan-kit, arm only the qualified check-in
requested by plan-kit, record IDs, qualify and publish again. Then use plan-run's continuing loop,
not a second scheduler or direct phase launches. No hypothetical credentials or private research
enter the public run issue.

## Independent operation and termination

One native Claude cloud coordinator; fresh builders and independent checkers. Paid requests remain
inside protected Actions. Preserve one repair owner per PR, exact merged-SHA evidence and the
existing failure/diagnosis budgets. Infrastructure waits retain the in-flight task without duplicate
launch or new paid request. At block end/expiry/cancel stop continuation and new launches, checkpoint
in-flight work and preserve queued-PR repair ownership. Restart uses the same project/deadline and
reconciles native/GitHub/paid-call state before resuming. No fresh project to escape a stopped one.

The row-9 quality stop is intentional. A partial pilot reports only qualified recognition cases;
mandatory behavior/field/source regression acceptance remains in scope. Completion requires all
mandatory rows/ACs, while the optional notice-zone diagnostic may report unsupported honestly.
Keep physical host/studio and novice-user-study claims separate from cloud software acceptance.
