# Faster delivery with credible site and graphics protection

Status: draft for owner and Opus review, 2026-10-25. Planning is authorized; implementation,
experiments, workflow activation and changes to the production-page run are not. This is the
master proposal for the work after production-page completion, integrating the
[suite-budget plan](../e2e-suite-budget/spec.md) and [parallel-plan proposal](../parallel-plans/spec.md).
It does not silently supersede their active procedures. The proposed replacements are listed below.
Research is pinned to `d8dd1304910736437486d6f9f9cd9e401ac65589`; see
[evidence and limitations](evidence/research.md). The [Opus prompt](opus-review-prompt.md) is ready to use.

## Why and goal

Make a meaningful change reach independently verified completion sooner, and allow three independent
plans to progress together, as the site and graphics catalog grow. Reduce repeated design repairs,
unnecessary app startup and duplicate executions. Preserve named behavior, failure detection and
integration boundaries. Keeping every existing execution is not itself proof of protection.

The supplied research reports 2.70 hours median and 3.50 hours mean from first build to final PASS
over 30 production-page rows. Six first checks failed. Row 30 took 10.63 hours and exposed missing
ordering assumptions through repeated repairs. These elapsed times include tests and waiting;
they do not measure active coding. Configured-suite sharding changed during the sample. Faster
queue checks alone cannot remove the larger review-and-repair interval.

Success means lower category-matched completion times and more independently passed changes per
hour, with no accepted loss of critical protection. A merge, a worker exit and a green test run
are each insufficient to call a feature complete.

## Owner requirements and decisions

- Work starts after the production-page work is complete. Do not edit its plan, ledger, workers,
  rows or worktrees. Confirm its final independent acceptance before any live trial here.
- The owner accepted on 2026-10-25: daily detection for unrelated, non-critical regressions,
  after selection qualification. Critical flows and affected graphics contracts remain pre-merge;
  shared rendering, export and playout changes still receive broad checks before merge.
- Retain independent reviewers and acceptance. The owner will obtain Opus's second opinion
  before implementation. That review and its disposition are still pending.
- Carry forward the supplied constraints: public GitHub Team, standard runners, 60 concurrent
  jobs, no additional paid services or infrastructure, and only the merge queue writes main.
- Three plans are the immediate parallelism target. Ten contributors are a later capacity question.

The following design is recommended, not a claim that these capabilities are already implemented.
No finite suite guarantees that all possible regressions are caught. Retained protection must be
shown by explicit behavior coverage, adversarial cases, historical defect replay and ongoing audits.

## Non-goals

No new scheduler, test service, framework, distributed lock or execution ledger. No assertion
relaxation, added retries, raised timeouts, automatic baseline approval or test removal to obtain
green. No arbitrary review-round cap. No native database-runtime replacement. No broad product
refactor or automatic rollout from this document. No requirement to manually inspect every graphic
for an unrelated feature. Human taste review remains for changed visible behavior where it adds value.

## D1. Review the contract early; review coherent repairs

For stateful work, the builder's brief first states the observable rules: ownership, attempted /
accepted / observed operations, unknown outcomes, other tabs or writers, revision-to-content
identity, retries, reload and recovery. A fresh reviewer challenges these rules before implementation
when the feature changes them. Routine copy or contained logic changes do not acquire another
mandatory design-review ceremony.

Keep `/check` and fresh independent acceptance after landing. Give reviewers a compact map from
acceptance criteria to changed behavior and evidence, with the exact base and head. The checker
gets the contract and artifacts, not the builder's repair conversation as its starting context.
It chooses its own boundary probes and judges whether evidence proves the contract. Tests may
share setup; an independent oracle must not simply repeat the production algorithm.

One outstanding review request per revision and scope. Resolve related confirmed findings together,
run focused checks, then push a coherent checkpoint. Preserve frequent local commits and required
remote backups. A new head invalidates a clean verdict on the old head; a stalled review is never
implicitly clean. Follow the existing recovery procedure for a stalled request.

If two successive confirmed rounds expose variants of the same missing invariant, pause patching
and obtain a focused independent reassessment of the model. This is a warning trigger, not an
extra attempt allowance or a reason to ignore later findings. Separate product defects, faulty
test expectations, infrastructure failures and delayed review service in the record.

## D2. A small black-box contract suite, using existing tests

Black-box means driving public inputs and checking observable results rather than inspecting
internal state. Build it by identifying and extending maintained journeys, not by creating a
second copy of every flow. Inventory existing coverage before writing any new test.

| Contract | Observable proof | Cheapest faithful coverage retained |
| --- | --- | --- |
| Site entry and creation | App loads; a user can create/import a graphic and reach the production | Existing short app journeys and built/deployed smoke |
| Edit, save and reopen | Reopened fields and appearance match the accepted edit; a refused save is not reported as saved | Pure state tests, real persistence integration and one UI journey |
| Production and playout | Preview, Take, Update and Stop have the specified visible effect; wrong/stale writers cannot replace current output | Model tests plus real browser/output boundary; backend integration when required |
| Export portability | An exported artifact loads in its supported harness, accepts fields and performs its lifecycle | Artifact-level integration per supported format, not only a schema assertion |
| Graphics runtime | Text/media/data updates paint, assets load, layout remains in bounds and entry/exit reaches the required state | Blank-page renderer checks and affected-design visual checks |
| Access and durability | Tenant/access boundaries, concurrent writes, identity and recovery retain their contract | Real isolated backend tests, including negative cases; mocks alone are insufficient |

Derive expected outcomes from the approved contract. Include known defect classes: cross-tab lost
updates, competing writers, same revision with different content, stale/delayed acknowledgements,
failed persistence, parser resource limits and incorrect grants. Keep integration probes where
Node tests cannot reproduce the fault. A parser's scaling limit is best tested below the UI.

Create a small, explicit fixture matrix of capabilities, not one example from each marketing
category. Cover text fitting and long/empty/Unicode inputs, fonts, images, transparency, motion,
timers/data updates, relevant aspect ratios and supported protocol variants. Map each fixture
to the contracts it exercises. Use deterministic time and controlled assets where appropriate,
but retain separate checks for real font/asset loading and the actual packaged output.

The critical journey set runs for product changes and merge groups; pure docs-only changes use
the existing safe exemption. Cheap contract tests run on relevant changes. The initial design
target for the small journey set is <=5 minutes of execution on existing Actions resources,
measured separately from setup. This is a design target, not permission to truncate checks.
Representatives do not certify every design, font, viewport, browser or physical playout device.
Keep explicit qualification coverage for the boundaries they cannot prove.

## D3. Select affected graphics and behavior, conservatively

Extend `scripts/e2e-affected.mjs` and `scripts/catalog-affected.mjs`; do not introduce a second
selector. The former already combines declared coverage and traces; the latter already maps
design declarations and transitive importers. Local catalog checks accept selected design IDs.
The CI catalog calibration job currently runs the entire catalog when its flag is true. Qualify
using that existing selection in CI before reducing its scope.

| Change | Proposed pre-merge work after qualification |
| --- | --- |
| Documentation only, not build inputs | Documentation/tooling gates; no graphics sweep |
| One design | That design and all affected dependants, relevant field/visual/lifecycle cases, affected journeys and critical app contracts |
| App-only feature with proven separation from output | Relevant app/contract checks and critical journeys; no unrelated full catalog sweep |
| Font, shared CSS, template registry, renderer, export or playout protocol | Broad affected behavior/format coverage; full catalog when design impact cannot be bounded |
| Selector, runtime bench, baseline or shared test infrastructure | Selector/verdict fault tests plus broad validation of the scope it controls |
| Missing/stale evidence, unknown dependency, generated/dynamic import or uncertain impact | Broad escalation; never infer no impact from an empty trace |

Keep cheap whole-catalog structural/emit checks if measurement confirms they are cheap. The main
opportunity is avoiding expensive rendering and app startup for unrelated designs. Catalog IDs
alone are not coverage: reports name design, inputs, viewport, protocol and asserted contract.

Audit imports, aliases, dynamic loading, generated data, CSS/fonts/assets, exports, deleted/renamed
files, new tests and custom browser contexts. Static import closure is only as complete as its
parser and dependency model. Traces add evidence; they must not erase declared coverage. A set
of shared journeys is not evidence that an arbitrary shared change affects only those journeys.
Review the existing `focus` membership and its reasons; the old sprint environment switch has
already been removed. Do not implement that removal again.

Merge groups select against their actual base and combined tree, including the union of all
participating changes. Every selected test must execute with its expected assertions and reports;
empty/partial results, unknown IDs and unexpected skips cannot pass. Fixtures and verdict logic
must prove that narrowing a selection does not defeat completeness checks.

## D4. Put checks at the right layer and cadence

This is the target policy after qualification. Current required executions remain until the
corresponding activation phase has passed.

| Stage | Checks and evidence | Detection/acceptance requirement |
| --- | --- | --- |
| Builder feedback | Affected Node/browser checks; selected isolated backend tests on capable workers | Existing five-minute small / single twelve-minute broader bounds; whole suites in Actions |
| PR checkpoint | Required build/tooling, critical journeys, affected integration/design checks; broader checks for shared/uncertain impact | Known affected and critical protection before merge; review exact final head |
| Merge group | Required checks on the combined source, critical journeys and union of affected coverage | PR green never substitutes for the integrated tree |
| After deployment | Reuse/extend existing deployment verification of the actual served build and critical smoke | Failed/skipped deployment is not tested production; no destructive probes on customer data |
| After landing | Independent criterion checks on exact merge; required exact-merge evidence under current policy | Dependants still wait for PASS |
| Qualified full-main validation | Full maintained regression suite plus configured integration and catalog where range impact requires it, on pinned main snapshots | Relevant landing included in completed validation within 60 minutes; stale alarms and recovery |
| Exhaustive validation | Individually approved expensive combinations, qualification walks and whole catalog visual sweep | Unrelated, non-critical regression detection <=24 hours, with attributable range and owner |

Daily cadence does not mean a cron launch is sufficient: completion must meet the 24-hour bound
including queue/setup/execution. Schedule with margin and detect missed/incomplete runs. A known
critical or affected test cannot be moved to daily merely because it is slow. Database durability,
access boundaries and on-air correctness are critical. Moving exhaustive variants requires a
named faithful pre-merge replacement, independent review and a maintenance receipt.

A critical deployed-smoke failure stays an incident, not a deferred nightly finding. Its existing
repair owner follows the deployment failure/rollback procedure, stops further affected rollout
and verifies recovery against the actual served build. A successful workflow that checked a
different build cannot clear the incident. Qualify this route in the stale/failure drills.

Maintain a compact behavior-to-check map in the existing spec/test metadata: contract, failure
mode, faithful layer, triggering dependencies, cadence, detection deadline and evidence owner.
Do not create a per-design bureaucracy or a new central task database. Each removed duplicate
or moved case needs defect replay or an injected fault: fail on the fault, pass on the fix,
and preserve the necessary boundary. Source overlap and equal test counts do not prove equivalence.

First maintenance candidates come from the existing suite-budget inventory, remeasured after
production-page completion: geometry cases currently booting the app; repeated playout setup;
and overlapping editor qualification walks. Keep persistence/UI/packaged-output checks where
those boundaries matter. Land three small maintenance changes with separate before/after data.
Every new feature extends an existing journey where possible and adds pure logic tests below it.

## D5. Preserve exact attribution while removing repeated work

First isolate unrelated configured-suite dispatches. Use immutable source, workflow/configuration,
resolved inputs/selection, environment and purpose in evidence; separate scheduled requests.
Check requested versus checked-out SHA. Preserve required main results and cancellation of
obsolete ordinary PR CI. Never cancel evidence an independent checker still requires. Until
main scheduling is changed and verified, retain the existing owned exact-SHA recovery dispatch.

Automatic duplicate suppression is a separate later option. The verification observer remains
observation-only. Its current workflows do not emit the complete identity artifact needed for
automatic reuse. Follow its [activation runbook](../verification-observation/runbook.md), including
the experiment owner's explicit completion receipt, complete report identity, persisted intent,
single dispatch authority and uncertain-delivery reconciliation. A matching SHA alone is insufficient.
Do not force three plans through a new globally serial review or dispatch service to obtain reuse.

Full-main batching is a different optimization from reuse. Follow the suite-budget design: pin
a snapshot, preserve its validation while new landings arrive, record the covered landing range,
then validate the next accumulated range. A descendant's green result must never be labeled a
full verdict on each earlier SHA. Preserve exact criterion checks and exact critical/affected
evidence for the landing; distinguish those from full-range validation.

There is a real policy conflict: current `plan-run` requires every exact-merge check, while the
older suite-budget target replaces some per-landing full runs with snapshot validation. Before
batching activation, make one reviewed reconciliation across CI, `verify`, `queue-merge` and
`plan-run`: identify precisely which full-regression obligation may be satisfied by a containing
pinned snapshot. Critical/affected checks and the checker's behavioral verdict remain exact.
Dependent admission waits for the required full-range result as well as exact acceptance; no
automatic PASS from ancestry. Keep full exact validation for changes whose risk requires it.
If this reconciliation is not approved, keep per-landing full checks and deliver the other gains.

A failed snapshot identifies candidate landings, not a culprit. Replay failed checks against
individual pinned landings and their relevant bases under existing bounded diagnosis rules;
test combinations when the failure is an interaction. No blind binary search assumption of
monotonic failure, no blaming the latest commit by default. If attribution is unresolved, preserve
the whole suspect range and stop affected dependent admission. The acknowledged owner repairs
or reverts the demonstrated culprit through the merge queue. Missing reports never mean green.

## D6. Earlier backend feedback and three concurrent plans

Reuse configured-suite setup/verdict code for selected tests on qualified cloud workers. This is
earlier feedback, not replacement for authoritative Actions. Qualify cold startup, ports, resource
headroom, pinned tools, migrations, auth, grants and realtime, with disposable local credentials
and rejection of hosted fallback. Start with one stack and one browser job per worker. Retain
Actions on providers where the stack is unqualified. Include startup in the cost/latency comparison.
Reproduce the historical exposure finding classes locally before gating them; retain hosted
advisors. This optional pilot is not a prerequisite for selection or parallel-plan work.

Use existing coordinators and ledgers for three compatible plans. Land shared foundations first;
record ownership of protocols, migrations, fixtures and common registries. Different files do not
prove independence. Qualify isolated native workers and enough reviewer/checker capacity; three
subagents on one VM do not establish three cloud resources. Within each chain, dependants wait
for PASS; final integration checks the combined product. Keep one acknowledged repair owner per PR.

Three plans can each fan out many Actions jobs. Three fifteen-shard matrices alone request 45
jobs; the supplied ordinary-work model estimates about 13 runners on average for three lanes,
but that omits some work and does not bound bursts. Review-service capacity is also unknown.
Keep current merge settings initially. Measure demand and waiting before changing concurrency.

## One implementation sequence

Register future rows in the existing plan machinery only after the owner accepts the Opus-reviewed
spec and production-page completion is confirmed. Each row has a single coherent outcome, `/check`,
`/queue-merge`, a repair owner and independent acceptance. Do not run three overlapping roadmaps.

| Phase | Deliverable and prerequisite | Reversal |
| --- | --- | --- |
| P0: reconcile and baseline | Pin new main, active rules and completed production-page receipt. Remeasure post-sharding timings; map current coverage and open suite-budget work. Freeze cohorts and comparison windows. | Documents only; no activation |
| P1: earlier convergence and dispatch isolation | Separate small rows for D1 guidance and configured request identity/isolation. Measure them separately. Preserve observer mode and all current test cadence. | Revert guidance or dispatch change independently; reconcile in-flight verdicts |
| P2: contract coverage and selection shadow | Reuse critical journeys; fill demonstrated contract gaps. Exercise selector scenarios and selected-report integrity. Run proposed selections alongside existing full protection without narrowing the gate. Begin two-week audit after last selection fix. | Keep full coverage; disable proposed selection |
| P3: cheaper faithful tests and affected catalog CI | Three reviewed maintenance candidates. Qualify affected-design CI versus complete reference runs before activation; retain full post-merge coverage. Backend feedback is an optional separately measured row. | Restore previous placements/full catalog; disable worker-stack caller |
| P4: three-plan cohort | After isolation and compatible work are ready, short two-plan operational smoke, then three plans with four rows each. Hold workflow configuration stable for the cohort; independent checkers and all exact obligations remain. | Stop additional admissions through existing pause route; retain repair owners |
| P5: cadence qualification and activation | Two clean weeks of selection audit, adversarial replay, live capacity gate, stale/culprit/rollback drills, approved exact-vs-range reconciliation. Activate batching, then separately approved exhaustive moves. | Proven switch back to per-landing full validation and full catalog; keep missed-deadline/failed history |
| P6: optional automatic reuse | Only if duplicate wait/cost remains material; satisfy observer runbook and explicit experiment-complete receipt. | Return to observation-only, reconcile persisted intents |

P1 targets individual waiting and rework; P2-P3 reduce feedback cost and suite growth; P4 targets
completed work per hour and can modestly slow an individual change; P5-P6 reduce repeated execution
but add attribution obligations. Do not claim a combined timing change proves which intervention
helped. Read/plan lookahead, ten-plan scaling, merge-limit increases and new orchestration are deferred.

## Observable acceptance criteria

All criteria below are future implementation criteria. None is passed by this planning document.

### AC-1: Baseline distinguishes delay from execution

Analysis records a frozen source/workflow configuration, a post-sharding serial cohort of at least
12 comparable completed rows when available and unfinished eligible rows in its fixed window.
Stratify extraction, feature and backend/stateful work. Report missing samples as provisional.
Measure builder-to-PASS, request-to-review, material repair rounds/finding families, setup/test/report
time, concurrency/dependency wait versus eligible runner wait, ready-to-queue, queue-to-merge,
merge-to-validation, cancelled/failed runner-minutes and escaped defects. Never add overlapping
intervals as exclusive work or infer active work from commit frequency. Layer: analysis of existing records.

### AC-2: Review convergence improves without suppressing findings

Trial two risky rows for feasibility, then ten comparable risky rows before claiming improvement.
Record invariants discovered before/after coding, repeated-family rounds, duplicate requests,
review-service delay and first independent outcomes. Target 25% lower median pre-queue time and
fewer repeated-family rounds; report p90/max and all failures. No ignored finding or extra attempt.
Layer: independent review receipts and existing coordinator/review records.

### AC-3: Critical black-box contracts detect representative defects

Each D2 contract maps to executable evidence at its faithful layer. For each changed/replaced
protection class, replay a historical defect or inject a realistic boundary fault, observe failure,
then pass on the correction. Include cross-tab identity, persistence, export lifecycle and asset
loading faults, not only happy paths. The reviewer independently checks the oracle. Report coverage
gaps and physical-device limits. Layer: Node, browser, artifact and configured integration as named.

### AC-4: Selection never silently narrows an unknown change

Planner fixtures cover design dependency closure, shared fonts/CSS/rendering, unknown/new/renamed/
deleted paths, stale/incomplete traces, custom contexts, selector edits and combined merge groups.
Malformed/missing reports and omitted selected cases fail. Proposed selected runs and continuing
full runs are compared for at least two weeks after the last relevant selection correction. Replay
every full-run failure against its culprit's original PR/merge-group selection; investigate all
misses, including faults classified as flakes. Zero unexplained misses is necessary, not completeness
proof. Layer: selector/verdict Node tests, defect replay and paired Actions evidence.

### AC-5: Maintenance preserves behavior and reduces measured work

Three candidates have a named behavior/failure/boundary inventory, replacement receipt and measured
before/after setup, execution and runner cost on comparable environments. A one-design CI change
selects all proven dependants; shared/uncertain machinery still broadens coverage. Keep the necessary
UI/renderer integration and human visual review. No capacity exception, baseline or maintenance
entry is manufactured by a repair. Layer: focused tests, real rendered output and full comparison runs.

### AC-6: Parallel validation keeps every required verdict

Three unrelated candidate SHAs dispatched together complete with attributable verdicts. Exercise
moved refs, schedules, superseded PRs, missing reports and lost acknowledgement. Preserve exact-main
recovery. In the three-plan cohort, each plan completes four rows; no starvation, interference,
duplicate repair owner or admission before prerequisite PASS. Demonstrate pause/resume. Target >=2x
matched serial completion rate and <=25% increase in category-matched median latency, retaining
queue-to-landing p50 <=10 / p90 <=20 minutes. Report tails and unfinished rows. Layer: bounded Actions
trial and independent plan acceptance. Small cohorts are operating evidence, not statistical proof.

### AC-7: Cadence changes retain deadlines, attribution and recovery

Before activation, AC-3/4 pass, the capacity gate is live, policy reconciliation is approved and
stale, missing-report, culprit/interaction and rollback drills pass. A relevant landing is covered
by completed full validation within 60 minutes; approved unrelated non-critical exhaustive cases
within 24 hours. Record every breach, not only percentiles. Drill overdue/incomplete validation,
two interacting landings, a corrected successor masking an earlier defect, and a lost required
exact result. None may be reported as an exact green by ancestry. Retain scheduled freshness and
quarantine policy. Layer: orchestration fixtures and bounded live workflow drills.

### AC-8: Gains persist within the existing resource envelope

Report before/after per-change latency, completed work/hour and runner-minutes per accepted change,
including failures, cancellation and unfinished work. Retain the suite-budget 85% warning / 95%
exception policy against a reviewed fixed envelope based on current resources; extra shards do not
silently buy extra budget. Weekly maintenance reports identify growth and owners. Any selected-out
critical defect, missing required verdict or unsafe admission immediately stops the affected rollout.
Investigate any increase in first-check failures or escapes before expansion. Timing misses permit
one bounded correction and remeasurement, then pause expansion if still outside bounds. No test
weakening, cost increase or removal of slow rows from the statistics. Layer: existing reports and receipts.

## Reconciliation with previous proposals

- Parallel-plans P0-P2 previously prioritized concurrency before review improvement. This proposal
  brings review convergence into P1 because shorter individual delivery is now the primary goal;
  the three-plan trial still needs no portable backend stack. Its exact attribution, ownership,
  compatibility and cohort constraints are retained.
- The older suite-budget baseline used 20 runners. That is historical, not today's 60-job envelope.
  Do not copy its timing/capacity constants or treat unlimited billed minutes as unlimited capacity.
- Suite-budget already permits affected checks plus critical journeys and staged batched full
  validation. This proposal retains its two-week safety qualification and adds explicit graphics
  boundary coverage and the exact-merge policy reconciliation. It does not defer all full tests to night.
- Existing selection and cheaper-layer guidance have partly landed. P0 records what remains;
  implementation is not a second removal of the expired sprint switch or a new selector.
- The earlier proposal excluded activation of reuse/batching. They appear here as separately
  qualified future phases, not permission to turn them on. No current observer behavior changes.

## Phase notes

Planning only. Opus review, current-state remeasurement, implementation and all trials are pending.
This spec and its acceptance ledger are not a runnable plan. Add implementation receipts per phase
after authorization; do not report the future acceptance criteria as verified by prose review.
