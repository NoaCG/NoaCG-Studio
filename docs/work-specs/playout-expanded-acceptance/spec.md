# E8 — Final expanded production acceptance

Status: agreed planning scope, 19 October 2026; implementation and acceptance unstarted.
Reconciled against main `4e067b65674a9bf0a7632430b5dd0772c03a0331`.

## Shared execution contract

Parent: [production-page](../production-page-refactor/spec.md). The
[extension contract and exact sequence](../production-page-refactor/extensions.md) are normative:
file ownership, compatibility, evidence reuse, environment routing, stop/rollback and final
acceptance apply here. All phases below are product/qualification work, not refactor-only moves.
Paths named as new are planned files, not claims that implementation already exists. Use the
existing `/check`, targeted verification and `/queue-merge` procedures when execution starts.
Each phase must pass its listed ACs before the next dependent phase. `work.json` records intent
and acceptance, never worker progress. No implementation or run starts from this document.

## Scope, dependencies and ownership

After E3.2 and all required baseline/H0/E4/E5/E7/E6/E1/E2 outcomes. This closes the expanded
programme, not merely the refactor. Own acceptance fixtures/receipts/operator runbook and focused
integration fixes with their own regressions; no hidden feature expansion or gate weakening.
Reconcile source, package, provider configuration, output version and environment for every
receipt. Earlier passes may be reused only if those material dependencies remain applicable.

## Required operating envelope

Use the final candidate and rehearsal production with all four election graphics, two shared
score graphics, a quiz with independent clock, normal clips and at least two foreign OGraf
packages. Exercise the real source route, normal rundown and physical Companion controls.
Mandatory outputs: CasparCG through Bridge and OBS/browser. Preserve existing vMix/SPX regressions;
expanded vMix/SPX qualification is separately reported. One external OGraf controller is required.
Official election-feed access remains a separate qualification verdict, not simulated success.

One 60-minute software endurance run: 2,000 deterministic candidate records at five-second
source cadence, a cue switch every 15 seconds, scheduled malformed/duplicate/older revisions,
Pause/Resume, reader handover, controller reload and output disconnect. The E4 size cap must
accommodate the fixture or the recorded envelope is reduced explicitly before testing, never
silently during a pass. No unhandled errors, wrong-person frames, stale-owner writes, duplicate
non-idempotent actions or unbounded queue growth. Log memory and queue depth throughout; compare
steady-state windows after warmup; pending reads are bounded to one per source and buffered
updates to one latest snapshot, with instance/subscription counts returning to baseline after
replacement/disposal. Durable command history may grow; an unbounded client backlog may not.
Investigate sustained unexplained memory growth before accepting. Parent §7
performance thresholds and existing hardware limits remain in force; report dispatch, fetch-to-
apply and apply-to-render timings separately, with sample counts and slowest observations.

A local physical dress rehearsal of at least 30 minutes covers the same core failures on the
required outputs and hardware. Time alone is not acceptance; every failure/recovery assertion
needs evidence. No routine score/Take confirmation dialogs are introduced to pass operator tests.

## Acceptance

### AC-1: Every required criterion has attributable final evidence
Parent baseline 22, Q and all nine child specs have criterion-level pass evidence or explicit
open findings. “Done” requires all required criteria passed; session success, a green group or a
package build is insufficient. Separate software rehearsal, real outputs, human trial and actual
provider qualification. Record exact SHA/package hashes and a dependency-based reuse decision.

### AC-2: Cross-feature behavior and endurance are correct
Complete the workload above. In addition, E6 discovers/invokes E1–E3 foreign typed actions
through the same negotiated guarded route, respecting unknown legality and preview/program
instance targeting. A quiz reveal leaves its clock running; data arrival never Takes. Groups
expose collision/partial failure; last-confirmed monitors become visibly stale on loss.

### AC-3: A producer can operate and recover the real setup
Unaided participants meet the existing parent/data trial's four-of-five criterion for the original
tasks and the added tasks: connect a sample API, select a live candidate, distinguish preview from
air, use a declared Companion button and recover a source failure. Reuse participants only with
recorded familiarity; do not pass a newcomer test using its builders. State what failed and repeat
affected tasks after fixes. Physical CasparCG/Bridge, OBS and Stream Deck evidence is required.

### AC-4: Release and rollback instructions match qualified capability
Operator guide covers install/rebind, credentials, source status/cadence, manual/Fill fallback,
reader/controller/Bridge restart, unsupported OGraf recovery and restoring the prior release.
No exported credentials; final native/foreign package compatibility receipts retained. Publish a
capability/limitation matrix with separate official-feed and vMix/SPX status. No universal vendor
parity, unattended-cloud or election-day claim beyond the measured evidence.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E8.1 | Evidence reconciliation, foreign Companion integration, bounded cross-feature/endurance checks; AC-1/2 software portions | Cloud: targeted Node/configured checks, full required suites in Actions using existing-run lookup; endurance through the authorized bounded runner. Any >12-minute software run follows existing Actions routing rather than bypassing local test limits. |
| E8.2 | Final hardware/output/human rehearsal, runbook and verdict; AC-1–4 in full | Owner Windows/CasparCG/Bridge/OBS/Companion/deck and participants; current hosted sources. No substitute screenshots or simulated deck pass. |

A failure produces a scoped repair and affected requalification under existing failure limits.
A missing device/person/provider is blocked evidence, not an automatic product defect or skip.
Restore the last qualified release/production backup if a deployed change regresses; do not
clear unknown live instances or replay uncertain actions. Baseline 14 can remain accepted while
E8 is open, but the expanded programme cannot be marked complete.
