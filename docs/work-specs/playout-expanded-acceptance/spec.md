# E8 — Final expanded production acceptance

Status: agreed planning scope, 19 October 2026; implementation and acceptance unstarted.
Revised 2026-10-20 ([owner decisions](../production-page-refactor/evidence/owner-decisions-2026-10-20.md)).
Reconciled against main `4e067b65674a9bf0a7632430b5dd0772c03a0331`.

## Shared execution contract

Parent: [production-page](../production-page-refactor/spec.md). The
[extension contract and exact sequence](../production-page-refactor/extensions.md) are normative:
file ownership, compatibility, evidence reuse, environment routing, stop/rollback and final
acceptance apply here. All phases below are product/qualification work, not refactor-only moves.
Paths named as new are planned files, not claims that implementation already exists. Use the
existing `/check`, targeted verification and `/queue-merge` procedures when execution starts.
Each phase must pass its gating ACs (the extensions.md table) before the next phase. `work.json` records intent
and acceptance, never worker progress. No implementation or run starts from this document.

## Scope, dependencies and ownership

After E6.2 and all required baseline/H0.1/E4/E5/E7/E1/E2/E3/E6 outcomes; H0.2 and parent phase S follow it as the final owner block. This closes the expanded
programme, not merely the refactor. Own acceptance fixtures/receipts/operator runbook and focused
integration fixes with their own regressions; no hidden feature expansion or gate weakening.
Reconcile source, package, provider configuration, output version and environment for every
receipt. Earlier passes may be reused only if those material dependencies remain applicable.

## Required operating envelope

Use the final candidate and rehearsal production with all four election graphics, two shared
score graphics, a quiz with independent clock, normal clips and at least two foreign OGraf
packages. Exercise the real source route (E4's replay server through the trusted agent), normal
rundown and Companion controls, including the foreign actions E6 now owns. Mandatory outputs:
CasparCG through Bridge and OBS/browser, in the real studio in parent phase S. Preserve existing
vMix/SPX regressions; expanded vMix/SPX qualification is separately reported. The independent
OGraf controller check is backlog issue #1531, outside this run (owner, 2026-10-20, F). Official
election-feed access remains a separate qualification verdict, not simulated success.

One 60-minute software endurance run in `endurance.yml` (landed before the run opens): 1,000 deterministic candidate
records (owner, 2026-10-20, G: sized to fit E4's ingress limits with headroom) at five-second
source cadence, a cue switch every 15
seconds, scheduled malformed/duplicate/older revisions, Pause/Resume, reader handover, controller
reload and output disconnect. Every revision stays inside E4's ingress limits; the fixture's
measured size is recorded before the run, and a fixture or limit change is
reviewed with its reason, never made silently during a pass. No unhandled errors, wrong-person frames, stale-owner writes, duplicate
non-idempotent actions or unbounded queue growth. Log memory and queue depth throughout; compare
steady-state windows after warmup; pending reads are bounded to one per source and buffered
updates to one latest snapshot, with instance/subscription counts returning to baseline after
replacement/disposal. Durable command history may grow; an unbounded client backlog may not.
Investigate sustained unexplained memory growth before accepting. Parent §7
performance thresholds and existing hardware limits remain in force; report dispatch, fetch-to-
apply and apply-to-render timings separately, with sample counts and slowest observations.

A physical dress rehearsal of at least 30 minutes covers the same core failures on the
required outputs and hardware, in the real studio as part of parent phase S. Time alone is not acceptance; every failure/recovery assertion
needs evidence. No routine score/Take confirmation dialogs are introduced to pass operator tests.

## Acceptance

### AC-1: Every required criterion has attributable final evidence
Parent baseline phases, Q's records and all nine child specs have criterion-level pass evidence
or explicit open findings. “Done” requires all required criteria passed, through the final owner
block; session success, a green group or a package build is insufficient. Separate software
rehearsal, laptop scratch walks, real-studio outputs, trials run from their kits and actual
provider qualification. Record exact SHA/package hashes and a dependency-based reuse decision.

### AC-2: Cross-feature behavior and endurance are correct
Complete the workload above. In addition, the foreign typed actions E6 integrated keep working
through the same negotiated guarded route under this workload, respecting unknown legality and
preview/program instance targeting. A quiz reveal leaves its clock running; data arrival never Takes. Groups
expose collision/partial failure; last-confirmed monitors become visibly stale on loss.

### AC-3: The real setup can be operated and recovered, and newcomer tasks have a kit
In the 30-minute dress rehearsal (parent phase S), the added tasks run on the real setup: connect
a sample API, select a live candidate, distinguish preview from air, use a declared Companion
button and recover a source failure, with physical CasparCG/Bridge, OBS and Stream Deck evidence
(the deck requalified in H0.2). E8.2 lands a trial kit with these tasks for unaided participants;
reading guide: the parent/data trial's four of five, reusing participants only with recorded
familiarity and never the builders. Pass: the kit holds these tasks, the questions, the reading guide and where findings go,
and every trial the owner reports is recorded against its build with each finding filed as an
issue. The trial's own result is reported, never required (owner, 2026-10-20, D). State what failed and repeat
affected tasks after fixes.

### AC-4: Release and rollback instructions match qualified capability
Operator guide covers install/rebind, credentials, source status/cadence, manual/Fill fallback,
reader/controller/Bridge restart, unsupported OGraf recovery and restoring the prior release.
No exported credentials; final native/foreign package compatibility receipts retained. Publish a
capability/limitation matrix with separate official-feed and vMix/SPX status. No universal vendor
parity, unattended-cloud or election-day claim beyond the measured evidence.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E8.1a | Evidence reconciliation and bounded cross-feature checks; AC-1 software reconciliation, AC-2 cross-feature cases | Cloud: targeted Node/configured checks, full required suites in Actions using existing-run lookup. |
| E8.1b | The 60-minute endurance run; AC-2 endurance | Actions: `.github/workflows/endurance.yml` with the 1,000-record fixture, dispatched by the builder on its branch before `/queue-merge`; the checker reuses that run under the parent §6 reuse rule when the merge's material inputs are unchanged, and otherwise dispatches it on the merge SHA. Memory, queue depth and timing receipts. Existing CI job timeouts unchanged. |
| E8.2 | Runbook, capability/limitation matrix and the verdict on all agent evidence, plus the trial kit; AC-1 agent evidence complete, AC-3 kit, AC-4 | Cloud: guide and matrix checked against the landed build and receipts; the kit landed and on the owner list. The physical evidence is H0.2 and parent phase S. |

A failure produces a scoped repair and affected requalification under existing failure limits.
A missing device, person or provider holds only the final owner block, never an agent phase; it
is not an automatic product defect or skip. Restore the last qualified release/production backup
if a deployed change regresses; do not clear unknown live instances or replay uncertain actions.
Baseline 14 can remain accepted while E8 is open, but the expanded programme cannot be marked
complete before S.
