# CI/CD improvement planned run

Revised 2026-10-29 after the [full-run opinion](evidence/full-run-opus-review-2026-10-29.txt).
Registered name: `cicd-improvement` in [plan-run](../../../.agent-workflows/plan-run.md).
Preparation and registration are authorized; implementation is not. This is a prepared plan,
not a live supervisor project. The [spec](spec.md) owns intent and numbered phase order.
The phase array below fixes exact acceptance and environments without inventing authorization.

## Launch admission

- Obtain acceptance of revised intent and explicit execution authorization with scope, start and
  finite deadline. Only then set `work.json authority.status` to `agreed`, citing that source,
  refresh the normalized hash and check for zero structural problems. Preparation, an Opus
  opinion or a green planning PR is not implementation authorization.
- Require full production-page final PASS/finish and owner/studio acceptance. No software-phase-50
  exception was approved. Read its receipt; do not mutate its project.
- Reconcile landed spec/runbook, current procedures, open PRs and existing projects. Use the live
  coordinator qualification below; permission and capability receipts are not permanent.
- Size the window for implementation, useful samples and 14 clean days after the last selection
  correction, including at least one realistic reset. Discuss six to eight weeks at launch, not
  a promised duration or permission. Resolve the actual date, timezone and offset explicitly.
- Identify useful, separately authorized work for the ten-risky-row sample and three-plan cohort.
  Lack of work leaves improvement claims pending; it does not authorize filler tasks or indefinitely
  strand unrelated safety work. Bind participants and native capacity before their launch.
- Retain the approved hard 24-hour per-landing deadline for unrelated non-critical detection.
  Retain selected backend checks on triggered PRs and the explicit merge-group exception. P0 must
  measure deployment exposure; changing that policy needs a separate decision, not an inference
  from the review's unverified deployment assumption.
- A generic orchestrator wave cannot overlap under current policy. Surface this multi-week scheduling
  constraint in the execution brief. A dated observation pause is not permission to evade it.
  No deadline, workload or wave-scheduling decision is invented during preparation.

Use the existing [preparation procedure](../continuing-plan-preparation/runbook.md).
Copy the exact phase array below into the project, with actual authorization supplied separately.
Open paused; use the existing supervisor and recovery branch. Do not run `continue`, `--open`,
supervisor registration, start-block or wake commands during preparation: even `continue` can claim
ownership and open a block. This document is static input, not an execution ledger.

## Order, acceptance and safe outcomes

The 17 phases are serial. Review guidance starts sampling early. Maintenance comes before fault
replay, scope integrity, schedule qualification and the cohort, so those activities can use the
audit window. The clock starts at the last actual reset, not automatically at row 10. No scheduler
extension, conditional reordering or second roadmap is implied.

Initial acceptance is exactly AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 and AC-8. The old optional AC-7 text
is preserved in optional follow-ups, outside acceptance headings. Optional P5/P6 and the worker
backend pilot remain excluded. No future criterion is passed by this preparation.

Rows 13-17 distinguish an accurate assessment from achieved improvement targets. A row's documented
no-activation/pending outcome can PASS only when its own acceptance is proved; it never marks an
unmet AC passed. The final project may finish bounded delivery/reporting with goals still open:
call that "run concluded with unmet/pending goals", not initial success. Only a current independent
review and `work-spec converge` reporting `evidence-complete` establish initial success. Failed
implementation/tests still use ordinary repair limits, not this reporting alternative. Missing
observation time alone in row 15 is a prerequisite wait while feasible within authorization.
A demonstrated failed qualification can be reported immediately with no activation; it need not
wait for a calendar window that cannot change that verdict.

Row 15 lands evidence only and gets independent PASS before row 16 starts. Its receipt must say
`qualified` to permit activation. A valid `not qualified` receipt permits only row 16's no-activation
report. No implicit qualification comes from a green ledger event. Any reset or stale receipt
between those rows refuses narrowing and requires fresh qualification under reviewed authority.

Each row uses `/check`, `/queue-merge`, one repair owner and an independent checker on its immutable
merge SHA. Evidence lives in `evidence/phase-NN.md`; concurrent workers do not append to one file.
The existing project ledger alone holds live state. Permitted edits stay within each title and
acceptance below: assessment rows add evidence only; no product change is hidden in a report.

## Exact phase metadata

This authority-free array is the canonical acceptance/environment input. Spec titles must match
exactly. IDs ci01-ci17 are fixed before first launch; no earlier runtime exists to migrate.
Copy these strings, not weaker summaries derived by the launcher.

```json
[
  {
    "id": "ci01",
    "title": "Baseline and launch-readiness evidence (P0; AC-1 baseline).",
    "dependsOn": [],
    "acceptance": [
      "Pin source, workflow configuration, baseline cohorts and missing samples; distinguish queue, execution, review and repair time without adding overlapping intervals.",
      "Classify nightly failures and actual deployment ordering relative to configured verdicts; name unresolved blockers without authorizing narrower coverage."
    ],
    "environment": "Repository and cached GitHub run/job records; read-only baseline analysis."
  },
  {
    "id": "ci02",
    "title": "Establish coherent review checkpoints (P1d; AC-2 measurement start).",
    "dependsOn": [
      "ci01"
    ],
    "acceptance": [
      "One guidance source exercises ordinary, risky, repeated-family and stalled-review scenarios with a fresh reviewer; one outstanding review per revision/scope and unchanged repair limits.",
      "Start the two-row feasibility and ten-risky-row sample using separately authorized work; preserve failures, tails and missing samples."
    ],
    "environment": "Documentation gates and independent procedure review; existing review records."
  },
  {
    "id": "ci03",
    "title": "Isolate candidate dispatches and source identity (P1a; AC-6 scheduling).",
    "dependsOn": [
      "ci02"
    ],
    "acceptance": [
      "Three unrelated immutable candidates cannot replace each other across refs; schedules are separate; requested/actual SHA mismatch fails and required superseded verdicts have recovery.",
      "Reconcile uncertain dispatches by recorded intent, ref, requested commit and run identity; preserve per-landing full backend validation and observation-only lookup."
    ],
    "environment": "Workflow/identity fixtures and bounded standard Actions trials."
  },
  {
    "id": "ci04",
    "title": "Harden broad/shared and catalog selection (P1b; AC-4).",
    "dependsOn": [
      "ci03"
    ],
    "acceptance": [
      "Reproduce broad-trace and catalog-fallback misses or correct the report with evidence; shared/model/render/font changes reach affected contracts and catalog or conservatively escalate.",
      "Unknown, dynamic or unsupported dependencies cannot silently select nothing; preserve conservative shared protection until row 7."
    ],
    "environment": "Targeted Node selector tests, archived defect examples and Actions selection plans."
  },
  {
    "id": "ci05",
    "title": "Harden path selection and execution integrity (P1b; AC-4).",
    "dependsOn": [
      "ci04"
    ],
    "acceptance": [
      "Pin old/new rename paths, output.html, filesystem-read fixtures, short-regex copy and spaceKey override cases; report unsupported cases conservatively.",
      "CI rejects test.only; discovery and verdict probes prove selected cases cannot disappear, with no focused test left committed."
    ],
    "environment": "Node fixtures and bounded discovery/verdict probes."
  },
  {
    "id": "ci06",
    "title": "Require complete selected configured PR checks (P1c; AC-6).",
    "dependsOn": [
      "ci05"
    ],
    "acceptance": [
      "Every configured spec declares covers or a justified none; edited specs still run. Emit exact selected spec/case identity, not only a boolean. Helper, live config, setup, workflow and uncertain shared changes select the full configured set.",
      "Triggered PRs execute every selected case on an isolated migrated local stack; missing, empty, mismatched or unexpectedly skipped results fail the existing CI gate, which reads the planner flag.",
      "Exercise untriggered PR and explicit merge-group skip cases; full configured tests per landing, default local credentials and migration/auth/grant/realtime prerequisites remain. Record cost and combined-tree exposure."
    ],
    "environment": "Header/selector/verdict mutations and paired real Actions backend runs; no hosted credential fallback."
  },
  {
    "id": "ci07",
    "title": "Define critical/shared sets and start the miss audit (P2; AC-3/AC-4 inventory).",
    "dependsOn": [
      "ci06"
    ],
    "acceptance": [
      "Map every D2 contract to faithful checks; distinguish critical journeys from broad escalation and record backend exceptions without deleting needed tests for a timing target.",
      "Treat quarantine of critical or currently affected protection as an incident with an owner, bounded repair and explicit coverage gap counted under AC-4/AC-8; no silent replacement by a nonblocking run or extra retries.",
      "Replay existing full-main failures against original culprit selections and start continuing comparison; record the latest audit-reset commit and its reason under the reset definition."
    ],
    "environment": "Test metadata and selector/quarantine fixtures, historical Actions evidence and independent contract review."
  },
  {
    "id": "ci08",
    "title": "Complete measured test-maintenance candidate one (P3; AC-5).",
    "dependsOn": [
      "ci07"
    ],
    "acceptance": [
      "Inventory behavior, failure and boundary; prove a faithful cheaper replacement by defect replay and comparable before/after timing and runner cost.",
      "Retain necessary UI, rendering and persistence integration. Move no protection to scheduled cadence; classify any selection change under the audit-reset rule."
    ],
    "environment": "Targeted Node, artifact, browser or configured checks at the faithful layer; rendered judgment when appearance changes."
  },
  {
    "id": "ci09",
    "title": "Complete measured test-maintenance candidate two (P3; AC-5).",
    "dependsOn": [
      "ci08"
    ],
    "acceptance": [
      "Provide the same behavior inventory, fault replay and comparable cost evidence as row 8 for a distinct candidate; do not count one saving twice.",
      "Retain necessary integration, move no protection to scheduled cadence, and record any audit reset; never manufacture a maintenance exception to pass a gate."
    ],
    "environment": "Targeted checks at the documented faithful layer; rendered judgment when appearance changes."
  },
  {
    "id": "ci10",
    "title": "Complete measured test-maintenance candidate three (P3; AC-5).",
    "dependsOn": [
      "ci09"
    ],
    "acceptance": [
      "Provide the same behavior inventory, faithful replacement, defect replay and comparable cost evidence for a third candidate.",
      "Retain necessary integration, move no protection to scheduled cadence, and record the last actual reset commit; row completion alone does not reset or begin the clock."
    ],
    "environment": "Targeted checks at the documented faithful layer; rendered judgment when appearance changes."
  },
  {
    "id": "ci11",
    "title": "Prove critical contract fault detection (P2; AC-3).",
    "dependsOn": [
      "ci10"
    ],
    "acceptance": [
      "For each changed or replaced protection class, observe a historical or realistic boundary fault fail and its correction pass; cover identity, persistence, export lifecycle and asset loading at faithful boundaries.",
      "A fresh reviewer checks the oracle and discloses unproved device boundaries; ordinary additive tests do not reset the audit, but a discovered mapping or set correction does."
    ],
    "environment": "Named Node, browser, packaged-artifact and configured integration probes."
  },
  {
    "id": "ci12",
    "title": "Prove scoped-catalog report integrity (P3; AC-5).",
    "dependsOn": [
      "ci11"
    ],
    "acceptance": [
      "Expected selected IDs and categories exactly match measured coverage; unknown IDs, omitted designs, missing categories, empty overall selection and missing reports fail.",
      "An empty individual slice passes only when the complete selected manifest ran; compare rendered scoped/full results. No CI calibration narrowing yet."
    ],
    "environment": "Report mutations and rendered scoped/full Actions comparisons."
  },
  {
    "id": "ci13",
    "title": "Assess scheduled detection and recovery readiness (P3; AC-5).",
    "dependsOn": [
      "ci12"
    ],
    "acceptance": [
      "Measure each landing's merge-to-completed-coverage delay for omitted designs and required contracts; preserve the existing schedule alarm and detect the oldest uncovered landing. Whole-catalog IDs alone do not prove all required check coverage.",
      "Use requested-commit identity for drills; exercise missed, failed, late and incomplete runs, interacting landings, culprit replay and full-scope rollback. Resolve nightly causes before relying on cadence.",
      "Record qualified only with real complete coverage within 24 hours and all drill receipts; otherwise record not qualified with a named blocker and existing full pre-merge catalog protection retained. Either assessment may PASS only if accurate and protection is preserved; AC-5 remains open when unqualified."
    ],
    "environment": "Controlled fixtures, bounded Actions drills and real scheduled completion/coverage receipts."
  },
  {
    "id": "ci14",
    "title": "Measure the authorized three-plan cohort or record its absence (P4; AC-6).",
    "dependsOn": [
      "ci13"
    ],
    "acceptance": [
      "With eligible work and qualified native capacity, run a two-plan smoke then three plans of four rows each, preserving dependency PASS, single repair owners and pause/resume.",
      "Report fixed-configuration matched throughput, latency, tails, unfinished work and resource use against AC-6 targets; allow only the existing bounded correction.",
      "If workload/capability or targets are missing, report pending or not met with evidence and no success claim. A correct disposition can PASS this reporting row; AC-6 remains open. No automatic reorder or new cohort authorization."
    ],
    "environment": "Native worker/checker receipts and cached Actions/review records; independent comparison."
  },
  {
    "id": "ci15",
    "title": "Independently accept audit and qualification evidence (P2/P3; activation gate).",
    "dependsOn": [
      "ci14"
    ],
    "acceptance": [
      "A qualified verdict requires at least 14 clean calendar days after the last defined reset, original-culprit and adversarial replays, zero unexplained misses and independently accepted row 12/13 integrity and deadline receipts.",
      "Publish qualified only when every condition is proved. A demonstrated failed qualification may be reported immediately as not qualified with retained protection; incomplete observation alone waits while feasible within authorization. Expiry stops the project.",
      "A fresh independent checker PASS on this evidence-only merge gates row 16. A not-qualified disposition permits only row 16's documented no-activation outcome, never narrowing."
    ],
    "environment": "Immutable audit, fault-replay, scope-integrity and scheduled-coverage receipts; independent exact-merge acceptance."
  },
  {
    "id": "ci16",
    "title": "Activate qualified catalog scope or retain full protection (P3; AC-4/AC-5).",
    "dependsOn": [
      "ci15"
    ],
    "acceptance": [
      "Before any activation PR, require row 15 independent PASS and its qualified verdict on still-current evidence; a later reset or invalidated receipt refuses activation.",
      "Qualified: reuse the existing scoped path, preserve unknown/shared broad fallback and cheap whole-catalog emit, prove representative selected/full equivalence and actual merge-group behavior. Reversal restores full scope without undoing hardening or integrity fixes.",
      "Not qualified: land no narrowing or cadence reduction; record retained protection and blocker. Independent PASS proves the chosen safe outcome, not that AC-4/AC-5 were achieved."
    ],
    "environment": "Qualified branch: bounded real Actions and rendered comparison; otherwise immutable evidence review with no activation."
  },
  {
    "id": "ci17",
    "title": "Independently report initial outcomes and hand off (P0-P4).",
    "dependsOn": [
      "ci16"
    ],
    "acceptance": [
      "For every initial AC, independently report met, not met or pending with exact evidence, reasons, measured costs, escapes and outstanding work; disclose the ten-risky-row and three-plan sample limits.",
      "Record pass only for actually met ACs in work.json; other statuses remain non-pass. This row PASS means the report is accurate, not that improvement targets were achieved.",
      "Claim initial success only when the existing work-spec converge command is evidence-complete on the current reviewed source; optional cadence/reuse requirements stay inactive. Stop wakes and preserve any outstanding repair ownership."
    ],
    "environment": "Fresh independent criterion review, immutable receipts and existing work-spec convergence checks."
  }
]
```

## Audit reset and coverage rules

A reset is a landed change to selector code, header/list interpretation, critical/shared set
membership, or a dependency mapping corrected because of a miss. Replacing/removing protection
or moving it between layers also resets when it changes which existing contracts are selected.
Record commit, time and reason. Ordinary additive spec headers, product features and trace
refreshes do not by themselves reset the clock; audit them and reset if they reveal/correct a
miss, change shared membership or invalidate the coverage model. Never call a selection-changing
fix "only tests" to preserve the window.

Replay full-run failures against original culprit selection, including quarantined faults.
Fourteen quiet days alone do not prove safety. Unknown misses block qualification. Compatible
authorized plans can continue; their changes and affected measurements stay visible.

Configured `covers: none - reason` is a reviewed declaration, not a blanket opt-out. Edited specs
are selected; shared helpers, setup, live configuration, workflow/verdict machinery, new unmapped
dependencies and uncertain scope broaden to the full configured set. Preserve named negative cases
and a complete expected-case manifest.

Use the existing midday catalog workflow with all designs as the first coverage candidate, retaining
nightly full validation. Measure total battery cost, not only the reported 9-11 minute calibration
job. `designs=all` is not all nightly contracts: account for omitted checks such as engine-floor
and exhaustive variants. Per landing, measure merge-to-completed-verdict delay for every required
omitted design/contract; later source must not silently mask an earlier defect. Keep exact acceptance
distinct from a containing sweep's range evidence, recording breaches and unresolved interactions.
Retain the schedule-start alarm and extend existing reporting to alarm on the oldest uncovered
landing before its deadline with repair margin. Two cron entries do not guarantee completion.
If full 24-hour coverage cannot be qualified, retain prior pre-merge protection and report not
qualified; no new paid service is authorized.

Critical or affected protection entering quarantine is an incident, not proof that the critical
set still passes. Name its issue, owner, bounded repair and coverage gap; block affected narrowing
and expansion until faithful blocking protection is restored. Follow existing quarantine without
adding retries or weakening assertions.

## Coordinator home and continuity

At launch select one qualified native cloud coordinator session as this project's home, recording
provider/session, project/store/recovery identity, permissions and original deadline. Use the
single-home, same-session check-in and preflight pattern from
[production-page section 9](../production-page-refactor/spec.md#9-execution-settings), with fresh
receipts for this project. Never copy its session, credentials, deadline or authority.

Adapt that reference narrowly: prove repository and exact Git/API reads, whole failed-job logs,
push/check/queue capabilities from legitimate work, native builder/checker launch/result retrieval,
checkpoint/restore, stale-owner refusal and a real wake that resumes this coordinator. Read current
main CI/configured status and applicable served-build verification. Qualify local backend or existing
Actions routing where required. Do not import production-only keys, phone/endurance/studio checks,
historical provider restrictions or its prohibition on all other plans: compatible plans are allowed.

Where native `send_later` and trigger-management tools qualify, keep one project-named check-in for
this home during active work, reconcile duplicates and prove block-to-block continuation inside
original authority. A schedule acknowledgement is not proof. Each block is at most 24 hours.
On expiry, explicit pause, cancellation or supersession stop launches and applicable wakes.
Usage limits, closed sessions or lost stores can require owner resume; one wake cannot prove
weeks of reliability. Never reclaim ownership blindly from another session.

For known-date observation waits, checkpoint next evidence/date instead of hourly polling for two
weeks. At launch agree the mode: proven authorized dated native continuation, or an explicit dated
owner resume fallback. Never arm an out-of-authority wake or silently promise automatic resumption.
No wake or runtime is created during preparation.

## Waits, expiry and repair

- Use supervisor prerequisite/capacity waits; do not relaunch workers to rediscover missing evidence.
  Real product failures use the existing diagnosis and repair limits.
- At deadline stop launches and report passed/remaining rows, pending intents, repair owners, audit
  reset point and immutable receipts. Expiry preserves history; it does not authorize continuation.
  `activeProject` excludes expired projects, so `continue` answering `open` is never permission
  to restart the full plan.
- Before expiry, restarts keep the same project, phases, deadline and failure counts. After expiry,
  new authorization must cite a separately reviewed remaining-work spec listing unfinished outcomes
  and old PASS receipts/stable IDs. That new spec supplies exact phases under plan-run; do not
  improvise a truncated array under old authority. No automatic deadline extension or PASS import.
- Preserve pending-step identity, findings and consumed repair attempts in any successor. An exhausted
  row stays stopped unless explicit owner authority grants another attempt under the existing rule.
  A fresh ledger is not a retry reset. If safe carry-forward cannot be demonstrated with existing
  receipts/procedure, stop rather than open a misleading project.
- Reconcile lost acknowledgements/dispatches by original identity before replay. Keep one current
  coordinator and acknowledged repair owner per PR through post-landing results. Checkers are fresh
  and independent of that phase's builders/repairers.
- Owner decision, 2026-10-29: a phase may pass despite a proven pre-existing unrelated test failure
  only with independent attribution evidence and its tracking issue in `mergeChecks`. Wait for
  all required exact-commit runs; pending, cancelled or missing results are not this exception.
  Required merge gates still apply. A failure in checks, selection, shared infrastructure or
  protection changed by the phase remains blocking. Different filenames or selector output alone
  never prove unrelatedness. Use existing bounded comparisons/quarantine, no extra retry.
- Wrong-source evidence, missing required verdict, selected-out critical defect or competing repair
  owners stop affected rollout. Restore proven full protection through the queue without undoing
  hardening/integrity fixes. Timing misses allow one bounded correction/remeasurement; then report
  not met and stop expansion without discarding slow rows or relaxing targets.

## Parallel work and read budgets

Read-only research and compatible separately authorized product plans may overlap. Check files AND
protocols, migrations, fixtures, registries and provider/reviewer capacity. During active changes,
serialize ci.yml, configured-suite, selectors/lists, helpers, Playwright configs, protection/quarantine
handling and locks. Coordinate security/dependency fixes, recording resets and stratifying affected
measurements rather than freezing them for weeks. Generic waves still run alone.

The three cohort streams are separate plans, not nine tracks; this coordinator observes. Native
resources and independent checker capacity require receipts, not same-VM subagent counts. Existing
physical-device limits remain disclosed; this plan adds no device landing prerequisite.

Cache immutable run/job reads by identity, paginate only frozen samples, reuse existing artifacts
and inspect rate-limit headers. Bound each collection pass to 100 API calls and back off sooner
when shared budget is low; checkpoint the cursor and resume instead of widening that budget or
polling unchanged logs. Inspect the actual account limit rather than assuming 5,000/hour. Required
landing reads take priority. Never retain credentials or signed log URLs in evidence.

## Preparation verification

Parse 17 spec titles and this array with existing helpers; validate IDs, predecessor dependencies,
acceptance and environments in memory. Exercise paused/expired/unfinished-phase refusals without
opening state. Verify seven initial acceptance headings and matching hash; an in-memory fully
evidenced review can converge while pending/failed criteria cannot. Record actual results in
[the reconciliation receipt](evidence/full-run-reconciliation.md). These probes do not qualify live
permissions, capacity, wake persistence, dispatch or speedups. No implementation is launched.
