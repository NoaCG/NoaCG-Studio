# CI/CD improvement planned run

Prepared 2026-10-28. Registered name: `cicd-improvement` in
[plan-run](../../../.agent-workflows/plan-run.md). The owner authorized preparing and registering
the run, explicitly forbidding implementation launch. Registration makes the plan discoverable;
it is not a live supervisor project. No start, deadline, execution owner, worker, wake or recovery
branch is invented during preparation. The [spec](spec.md) owns intent and its numbered Phases
list owns execution order. This document supplies row scopes and acceptance environments.

## Launch admission

Before opening any execution project, require all of the following:

- Owner acceptance of the full-run review and explicit execution authorization, including a finite
  deadline and scope. Resolve dates with an explicit timezone/offset. A recommendation to start
  after production-page software acceptance was not approved; retain full completion, including
  the owner/studio phases and final acceptance. A changed boundary needs a new owner decision.
- Registration/spec/runbook landed on main. Reconcile their actual revisions with current source,
  procedures, open PRs and active plans; no expectation that today's baseline remains current.
- Production-page final PASS/finish receipt and any required exact checks, not a merged final PR,
  worker completion or a partially passed ledger. Do not mutate its project to obtain this receipt.
- A plan window that can accommodate at least 14 calendar days after the last selection correction,
  plus implementation, sample collection and repair time. Recommend discussing a roughly four-week
  window at launch; this is an estimate, not granted authority or a completion promise.
- Existing permitted workload from which to collect ten comparable risky rows and a three-plan,
  four-rows-each cohort. Candidate work must be genuinely useful and already owner-authorized.
  Name these plans, coordinators, deadlines and contracts before the cohort, not fictional tasks.
  If suitable work is unavailable, implementation may proceed within authorization but measurement
  remains pending. Never manufacture filler work, inflate samples or call incomplete evidence PASS.
- Coordinator/worker permissions and native lifecycle qualification under current plan-run and
  cloud-delegate procedures. Local implementation and targeted checks are permitted by current
  policy; isolated cloud execution and concurrent checker capacity require actual receipts before
  claiming the three-plan trial. Preserve models/subscriptions and existing resource bounds.

Then derive the project JSON using the existing
[preparation runbook](../continuing-plan-preparation/runbook.md): same ordered phase titles as the
spec, stable row IDs `ci01` through `ci15`, each depending on its predecessor (first: none),
acceptance and environments from the table below. Supply the actual owner authorization and
deadline at that time. Open paused, register the existing supervisor manifest/recovery checkpoint,
and start a bounded block only under that authorization. Do not call `continue` during preparation:
it can claim ownership and open a block. Do not introduce a new runtime manifest schema or ledger.

## Scope and order

Initial scope is P0-P4 and spec AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8. AC-7 and optional P5/P6
are excluded, as is the optional portable worker-stack pilot. The selected backend PR check remains
included. Full-record `work-spec converge` will still show optional AC-7 open: use explicit initial
criterion scope and report initial completion separately, never mark AC-7 passed or delete it.

The canonical runner admits rows serially after independent PASS. This preparation deliberately
uses that simple order, even though P4 technically needs only P1. Row 14 therefore runs after row
13; no scheduler extension or silently reordered phase is implied. During observation waits,
other compatible authorized plans may continue. Within row 14 the existing coordinators execute
the three separate plans; their distinct project identities do not bypass this plan's own order.

Each row lands a bounded change or evidence report through `/check` and `/queue-merge`, then a fresh
checker judges that row's acceptance on its immutable merge SHA and required exact Actions results.
Before row 13 lands any narrowing, a fresh reviewer must accept the already completed audit and
rows 8/9 qualification receipts. The post-landing checker then verifies the activated behavior;
its later verdict cannot substitute for that pre-activation evidence gate.
Partial criteria named below do not claim whole-program acceptance prematurely. Keep preceding
protection intact. Each row owns `evidence/phase-NN.md` for its findings and results; do not have
concurrent workers append to one evidence file. The existing project ledger alone holds live state.

| Row | Scope and permitted edits | Independent acceptance and required environment |
| --- | --- | --- |
| 1 | P0 baseline and readiness. Evidence only; read current Actions, rules, selection, nightly failures, deployment ordering and production-page receipts. | AC-1 baseline: pin sources/configuration and cohort definitions; classify the reported nightly failures or name unresolved blockers. Report queue versus execution time, missing samples and whether production can deploy before configured tests finish. Existing GitHub/API evidence; no new workload or settings change. Unresolved nightly causes prohibit later narrowing but need not prevent unrelated safety repairs. |
| 2 | P1(a) configured-dispatch isolation. Workflow concurrency and minimum existing caller/input wiring needed for requested SHA. | AC-6 scheduling portion: three immutable candidates cannot replace each other across refs; schedule separate; same-ref supersession visible; requested/actual SHA mismatch fails; required cancelled verdict has owned recovery. Workflow/identity fixtures plus bounded standard Actions trial. Keep per-landing full backend and observation-only lookup. Measure cancellations by cause, not just total ratio. |
| 3 | P1(b) broad/shared selection safety. Existing affected/catalog dependency code and tests. | AC-4 broad trace and catalog fallback portions: reproduce misses; broad files include critical protection (use conservative current shared set until row 7); model/render/font/shared changes reach catalog or conservatively escalate. Dynamic/unsupported dependencies cannot silently select nothing. Targeted Node selector tests, archived failing examples and Actions plans. No narrowing for speed. |
| 4 | P1(b) path and execution-integrity safety. Existing selector/configs/header/fixture maps. | AC-4 rename old/new paths, output.html, filesystem fixtures, short-regex copy and spaceKey override; CI rejects test.only. Reproduce each reported gap or explicitly correct the report with evidence; pin retained behavior. Node fixtures and controlled test discovery/verdict probes; no intentionally focused test left committed. |
| 5 | P1(c) required selected configured PR check. Shared bootstrap/verdict extraction, selection manifest and CI gate wiring, with minimum workflow/caller edits. | AC-6 backend portion: triggered PR runs every selected case against isolated migrated local backend, using local default credentials; missing/empty/mismatched reports, unexpected skips or failure cannot pass. Untriggered PR and merge-group skip rules tested. Full backend suite per landing unchanged. Node verdict mutations and paired real Actions backend runs; unchanged migration/auth/grant/realtime prerequisites. Record added cost and combined-tree detection gap. No hosted credential fallback. |
| 6 | P1(d) review-convergence guidance. Canonical builder brief/check procedure and parallel-plans D3 reference. | AC-2 mechanism: one source of guidance, risky invariants assessed early, one outstanding review per revision/scope, repeated-family warning grants no extra attempts. Fresh reviewer exercises ordinary, risky, repeated-family and stalled-review scenarios. Start cohort measurement; ten-row outcome is owed in row 15, not claimed here. Documentation/tooling checks and independent procedure review. |
| 7 | P2 explicit critical/shared contracts and audit start. Existing test inventory, coverage metadata and only demonstrated missing contract tests. | AC-3 and AC-4 set-definition portions: distinguish small critical journeys from broad escalation; map all D2 contracts and backend exceptions; replay representative faults at faithful layers. Start retroactive miss audit using existing full-main failures and continuing selected/full receipts. Node/browser/artifact/configured checks as needed. Record last selection-changing merge/time as audit start; no fixed-duration target can delete necessary tests. |
| 8 | P3 scoped-catalog integrity first. Existing scope parser/reports and catalog bench tests. | AC-5 integrity: exact selected IDs/categories equal measured coverage; unknown ID, missing category, omitted design, empty overall selection and missing reports fail. Legitimately empty individual slices pass only with complete overall manifest. Mutations plus rendered scoped/full Actions comparisons; no CI calibration narrowing yet. |
| 9 | P3 scheduled detection and recovery readiness. Reuse nightly/catalog-gates reporting, freshness alarm and bounded culprit diagnosis mechanisms. | AC-5 deadline: demonstrate completed coverage inside 24h, including schedule delay and failures, with exact identities. Midday scope counts only covered cases. Drill missed/failed/late pass, incomplete coverage, interacting landings, culprit replay and full-scope rollback. Resolve row-1 nightly blockers before relying on cadence. Controlled fixtures plus bounded Actions drills and real schedule receipts. If deadline cannot be met, retain full pre-merge coverage and report blocker; no false PASS or silent scope change. |
| 10 | P3 maintenance candidate 1. First remeasured candidate from suite-budget inventory, complete behavioral boundary only. | AC-5 first candidate: inventory behavior/failure/boundary, faithful cheaper replacement, defect replay/fault injection and comparable measured before/after. UI/renderer/persistence checks remain where necessary. Node or blank-page/browser/configured layer as selected; independent rendered judgment if appearance is touched. |
| 11 | P3 maintenance candidate 2. A distinct remeasured candidate. | Same AC-5 proof as row 10 for a second candidate. Do not split one saving into two sample claims; no auto-fixer-written maintenance exceptions. |
| 12 | P3 maintenance candidate 3. A distinct remeasured candidate. | Same AC-5 proof as row 10 for a third candidate. Retain all changed mappings in the selection audit; a correction restarts its clean window. |
| 13 | P2 audit close and P3 scoped catalog activation. Existing ci.yml catalog job calls the qualified catalog-gates scope path; immutable evidence report. | AC-4 two weeks after latest selection correction, no unexplained misses, adversarial scenarios and original-culprit replay complete. AC-5 scope integrity, deadline/alarm/culprit/rollback receipts complete. Only then narrow calibration for known affected sets; unknown/shared changes remain broad and cheap whole-catalog emit stays. Prove selected/full equivalence on representative changes and actual merge group; required exact checks pass. An audit reset or missing receipt means wait/repair, not early activation. |
| 14 | P4 bounded three-plan cohort. Existing coordinators, no new scheduler; evidence-only changes owned here. | AC-6 trial: compatibility/ownership table and separately authorized native workers/checkers; two-plan operational smoke then three plans with four rows each. Fixed window/configuration, >=2x matched serial rate and <=25% category median slowdown, with tails/unfinished rows reported; exact dependent PASS and pause/resume proven. Current queue p50/p90 targets retained. Native resources and Actions evidence, independent combined acceptance. A short cohort or unavailable capability remains pending, not success. |
| 15 | Initial acceptance and handoff. Evidence consolidation and initial criterion-scope review only. | AC-1..AC-6 and AC-8 independently reviewed against current receipts; ten comparable risky rows for review-convergence outcome, measured costs/gains, escapes, missing data and unresolved issues disclosed. Apply bounded timing-correction policy; threshold failure cannot be relabeled successful delivery. Declare initial P0-P4 complete only with evidence; AC-7/P5/P6 remain excluded and inactive. Existing reporting, immutable receipts and fresh independent acceptance; no new product changes hidden in report. |

## Waits, repair and restart

- Calendar observation is part of the run. Two weeks without enough relevant failure/defect evidence
  is not proof of safety; retain the fault-replay requirements. A mapping/selector correction resets
  the clean window, even if this crosses the authorized deadline. No automatic deadline extension.
- Record an explicit prerequisite wait in the existing supervisor when evidence, workload or
  capabilities are missing; don't repeatedly launch a worker to discover the same absence. Waiting
  is neither PASS nor a reason to consume product repair attempts. A demonstrated product/test
  failure uses the existing failure/diagnose limits. Do not relabel repeated defects as infrastructure.
- Keep one current coordinator and one acknowledged repair owner per PR through exact post-landing
  checks. Reconcile pending launches/dispatches by original identity before retrying. A stale PID,
  empty list or lost acknowledgement does not prove nothing happened. Independent checkers never
  inherit builder/repair conversation as their judgment and cannot be prior phase builders/repairers
  for the same phase.
- Follow current supervisor/block/recovery semantics. Blocks are bounded within the project deadline;
  a new session uses the same project ID and recovery ref, reconciles unfinished work and invalidates
  the old owner. Never use `tick` to drive a continuing project. Preserve failure counts and all waits.
- A scheduled check-in is not proof of durable continuation. Qualify wake/continuation before relying
  on it for unattended waits. Otherwise checkpoint and report that an owner resume is needed. On
  pause/deadline stop new launches and block wakes; preserve outstanding PR repair responsibility.
- Missed required verdict, selected-out critical defect, wrong-source evidence, unsafe admission or
  competing repair ownership stops affected rollout immediately. Restore last proven full selection
  through the merge queue; do not restore a known unsafe selector just because it was the old version.
- For time/capacity target misses, one bounded correction and remeasurement is allowed under the
  spec; persistent misses stop expansion and leave acceptance open. Never discard slow rows, reset
  the cohort, raise retries/timeouts or change assertions to obtain the target.

## What may run beside this plan

Read-only research and preparation may overlap. Product plans must have distinct owned files and
compatible protocols/migrations/fixtures; independent files alone are not enough. Serialize changes
to ci.yml, configured-suite, selectors, shared helpers, gate rules and dependency locks while their
rows are active. Coordinate necessary security/dependency fixes rather than freezing them for weeks;
record changes and restart/stratify affected measurements. A generic orchestrator wave cannot overlap
under current policy. No current background task receives messages or new authority from this file.

The cohort must not be silently expanded to nine tracks by splitting three plans. Distinguish this
coordinator's observation role from the three active product streams. Native capacity, review waiting,
runner eligibility and repair load must be measured. Ordinary local work does not establish remote
concurrency capacity. Physical/studio evidence retains its real environment; this CI plan introduces
no new physical-device landing prerequisite.

## Preparation verification versus execution qualification

This registration is verified by parsing the exact phase list with the existing runner, checking
all 15 row details and initial criterion references, validating representative project metadata in
memory only, and exercising paused/expired/unfinished-phase refusal with existing read-only helpers.
Documentation gates and links also pass before landing. Such fixtures do not qualify live permissions,
native workers, wake persistence, experiment delivery or speedups. Those remain launch/row evidence.

No runtime project JSON with fabricated authorization is saved. No supervisor database is opened,
no recovery branch is published, no execution block begins and no CI-improvement experiment runs
as part of preparation. Ordinary required checks on the registration PR are preparation validation.
