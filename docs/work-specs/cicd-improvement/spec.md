# Faster delivery with credible site and graphics protection

Status: revised draft after Opus review, 2026-10-28. Planning is authorized; implementation,
experiments, workflow activation and changes to the production-page run are not. This is the
master proposal for the work after production-page completion, integrating the
[suite-budget plan](../e2e-suite-budget/spec.md) and [parallel-plan proposal](../parallel-plans/spec.md).
It does not silently supersede their active procedures. The proposed replacements are listed below.
Initial research is pinned to `d8dd1304910736437486d6f9f9cd9e401ac65589`; see
[evidence and limitations](evidence/research.md). The [Opus opinion](evidence/opus-review-2026-10-28.txt) reviewed the original draft. Its findings and
reported owner decisions are incorporated below; see the research receipt for disposition and limits.

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
  after selection qualification. Critical offline flows and affected graphics contracts are the pre-merge target;
  shared rendering, export and playout changes still receive broad checks before merge.
- Retain independent reviewers and acceptance. Opus returned AGREE WITH CORRECTIONS on 2026-10-28.
  Approval of this revised draft and implementation admission remain pending.
- Owner decision reported in that review: when a change touches the backend paths the configured
  specs declare, those specs run as a required pull-request check. The full configured suite stays
  post-landing, once per landing. This adds pre-merge protection that does not exist in the baseline.
- Owner decision: P0-P4 are the initial implementation; P5/P6 are optional follow-ups as recorded
  verbatim in their section below.
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
It chooses its own boundary probes and judges whether evidence proves the contract. Land this
guidance once in the plan-run builder brief and check procedure, and mark parallel-plans D3 as
fulfilled by those canonical changes. Tests may
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
second copy of every flow. Inventory existing coverage before writing any new test. Opus counted 286 offline and 53 configured
specs at its source revision; remeasure at P0. Label/select existing cases and add only demonstrated gaps.

Keep two distinct sets: critical journeys run for every product change (target <=5 minutes), while
the shared-change set is the broader escalation set. Today the latter is encoded by 77 `// focus`
headers, about 68 historical test-minutes according to the review. The proposed explicit
`SHARED_CHANGE_SET` inventory is not yet implemented; these two sets must not be conflated.

| Contract | Observable proof | Cheapest faithful coverage retained |
| --- | --- | --- |
| Site entry and creation | App loads; a user can create/import a graphic and reach the production | Existing short app journeys and built/deployed smoke |
| Edit, save and reopen | Reopened fields and appearance match the accepted edit; a refused save is not reported as saved | Pure state tests, real persistence integration and one UI journey |
| Production and playout | Preview, Take, Update and Stop have the specified visible effect; wrong/stale writers cannot replace current output | Model tests plus real browser/output boundary; backend integration when required |
| Export portability | An exported artifact loads in its supported harness, accepts fields and performs its lifecycle | Artifact-level integration per supported format, not only a schema assertion |
| Graphics runtime | Text/media/data updates paint, assets load, layout remains in bounds and entry/exit reaches the required state | Blank-page renderer checks and affected-design visual checks |
| Access and durability | Tenant/access boundaries, concurrent writes, identity and recovery retain their contract | Selected pre-merge on triggered PRs; full suite per landing. Real isolated backend and negative cases; mocks alone are insufficient |

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
Keep explicit qualification coverage for the boundaries they cannot prove. Physical playout devices
remain a stated qualification limit and do not become an automated landing prerequisite.

## D3. Select affected graphics and behavior, conservatively

Extend `scripts/e2e-affected.mjs` and `scripts/catalog-affected.mjs`; do not introduce a second
selector. The former already combines declared coverage and traces; the latter already maps
design declarations and transitive importers. Local catalog checks accept selected design IDs.
The ci.yml catalog calibration job currently runs the entire catalog when its flag is true.
However, catalog-gates.yml already runs scoped batteries in Actions on demand and for a midday
landed range; nightly.yml already runs full offline/catalog checks and sweeps daily. Reuse the
catalog-gates scoped path in ci.yml after qualification, rather than introducing another path.

Pre-merge offline selection is already live, not awaiting a shadow rollout. P1 first hardens known
gaps: broad traced files must select at least critical journeys; fallback changes that can reach
designs must escalate catalog checks using the existing dependency machinery, with conservative
fallback for dependencies it cannot resolve. Preserve both rename paths using name-status/-M
(including working-tree renames), enable forbidOnly in CI configurations that run these suites,
and map output.html and filesystem-read fixtures. Audit short-regex copy locators and the
spaceKey.ts header override. Pin every reproduced case in selector/verdict tests. This safety
work may increase PR cost; report it honestly. It is not evidence of a performance regression.

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

This is the initial target policy after qualification. Current required executions remain until
the corresponding activation phase has passed. Backend selection is a new required PR protection.

Add a job inside ci.yml, reporting into its existing required CI gate. On PRs whose plan has the
configured flag, run the specs selected by CONFIGURED_TRIGGERS against an isolated local stack,
using shared configured-suite bootstrap/verdict logic and local default keys, without hosted secrets.
Expected cases/skips derive from the selected manifest. The gate accepts a skipped backend job only
when the flag is off or the event is merge_group. Missing/failing triggered PR evidence cannot pass.
Keep the full configured suite per landing. This intentionally leaves a gap between PR-base
backend validation and validation of the combined landed tree: merge groups skip this backend job.
Do not claim backend integration is checked before merge. P0 must establish whether deployment
precedes that verdict and document the existing incident/recovery path.

| Stage | Checks and evidence | Detection/acceptance requirement |
| --- | --- | --- |
| Builder feedback | Affected Node/browser checks; selected isolated backend tests on capable workers | Existing five-minute small / single twelve-minute broader bounds; whole suites in Actions |
| PR checkpoint | Required build/tooling, critical journeys, affected integration/design checks; broader checks for shared/uncertain impact | Known affected and critical protection before merge; review exact final head |
| Merge group | Required offline checks on combined source and union of affected coverage; selected configured job intentionally skipped | PR green never substitutes for the integrated tree |
| After deployment | Reuse/extend existing deployment verification of the actual served build and critical smoke | Failed/skipped deployment is not tested production; no destructive probes on customer data |
| After landing | Independent criterion checks on exact merge; required exact-merge evidence under current policy | Dependants still wait for PASS |
| Full-main validation per landing | Full maintained offline regression, full configured suite and catalog when triggered, attributed to the exact landing; recover superseded required runs | Completed validation target within 60 minutes; existing exact obligations retained |
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

First isolate manual configured-suite dispatches by ref, give the schedule its own group and keep
per-SHA landing groups with cancel-in-progress false. Add an immutable requested SHA and fail if
checkout differs. Grouping by ref controls scheduling, not proof of source identity. Genuine
same-branch pending supersession remains possible; recover any cancelled verdict still required
by a checker. Preserve obsolete ordinary PR cancellation and the owned exact-SHA recovery path.
The full reuse identity tuple is not a prerequisite for this first scheduling slice.

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

Three plans can each fan out many Actions jobs. Opus reports a five-build merge-queue limit;
five groups of about 16 jobs plus a main run of about 25 can exceed 60 jobs in a burst, although
not all jobs are eligible simultaneously. P0 reads current settings and actual job waiting rather
than inferring capacity from average occupancy. Reviewer/checker capacity remains unknown.
Keep current merge settings initially; measure before changing concurrency.

## One implementation sequence

Register future rows in the existing plan machinery only after the owner accepts the Opus-reviewed
spec and production-page completion is confirmed. Each row has a single coherent outcome, `/check`,
`/queue-merge`, a repair owner and independent acceptance. Do not run three overlapping roadmaps.

| Phase | Deliverable and prerequisite | Reversal |
| --- | --- | --- |
| P0: reconcile and baseline | Pin current main, rules and production-page completion receipt. Read existing main/configured/merge-group durations and queue waits. Triage the reported nightly failures before relying on them. Freeze cohorts. | Documents only |
| P1: safety and feedback | Separate reversible rows: (a) dispatch isolation; (b) selector hardening; (c) selected configured PR job after (a); (d) D1 guidance. Measure added safety cost separately. | Revert each scheduling/guidance change independently; a safety repair needs retained protection before reversal |
| P2: contracts and miss audit | Distinguish critical/shared sets, fill demonstrated gaps and replay historical full-main failures against culprit selections. Continue the audit for two weeks after the last selection correction, starting after P1(b). Use existing full-main evidence; no duplicate shadow executions. | Retain existing full protection and corrected mappings |
| P3: scoped catalog and maintenance | Fix scoped-report integrity first; reuse catalog-gates path in ci.yml. Prove the 24-hour coverage/completion bound, failed/missed-pass alarm, culprit and rollback drills before narrowing. Pair existing scoped/full evidence where identities match. Land three remeasured maintenance candidates. Optional worker backend feedback measured separately. | Restore full catalog/previous faithful placements; disable worker caller |
| P4: three-plan cohort | Two-plan smoke then three plans with four rows each. Requires P1 safety/dispatch rows and compatibility, but not P2/P3 completion. Hold configuration stable for each measured cohort and retain exact obligations. | Pause additional admissions; retain repair owners |

Initial success is judged on P0-P4 alone. D1 and scoped catalog target individual latency;
dispatch isolation and P4 target throughput. Selector hardening and configured PR coverage add
safety and may cost more. No combined measurement can establish which intervention helped.
The reviewer proposed P4 depending only on P1(a); this draft additionally requires P1(b/c) so
known safety gaps are not left open during expansion. No dependency on full test-maintenance work.

## Optional follow-ups (not part of the initial implementation)

Owner decision recorded by Opus on 2026-10-28:

> P5 (batched full-main validation) and P6 (automatic reuse) are optional follow-ups outside the
> initial implementation. Implement and measure P0-P4 first. Reconsider P5 only if repeated
> full-main validation remains a meaningful bottleneck. Reconsider P6 separately, only if
> duplicate identical checks still cause material cost or waiting. Neither is required to declare
> the initial improvement successful. Their qualification requirements are preserved, and
> neither activates automatically.

Opus reports successful main runs at p50 14 / p90 17 minutes, with 91 success, 3 failure and 6
cancelled among 100 runs, and two exact-SHA recoveries among 100 dispatches. These are attributed
measurements, not remeasured here; they do not establish a current full-main bottleneck.
Keep per-landing validation and exact-SHA recovery in initial scope. The policy conflict below
exists only if P5 is reconsidered. Verify whether landed and merge-group SHAs are identical before
using merge-group results as exact-landing evidence; do not assume this from the queue's name.

P5 would retain two-week selection qualification, capacity checks, stale/culprit/rollback drills
and explicit approval of exact-versus-range reconciliation. Its rollback must restore per-landing
full validation. P6 would require the observer runbook and explicit experiment-complete receipt;
its rollback returns to observation and reconciles outstanding intents.

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

## Observable acceptance criteria

All criteria below are future implementation criteria. None is passed by this planning document.
Initial acceptance comprises AC-1 through AC-6 and AC-8; AC-7 is reserved for optional P5/P6 and
is excluded from initial completion. Future execution records must scope these IDs explicitly.

### AC-1: Baseline distinguishes delay from execution

Analysis records a frozen source/workflow configuration, a post-sharding serial cohort of at least
12 comparable completed rows when available and unfinished eligible rows in its fixed window.
Stratify extraction, feature and backend/stateful work. Report missing samples as provisional.
Measure builder-to-PASS, request-to-review, material repair rounds/finding families, setup/test/report
time, concurrency/dependency wait versus eligible runner wait, ready-to-queue, queue-to-merge,
merge-to-validation, cancelled/failed runner-minutes and escaped defects. Never add overlapping
intervals as exclusive work or infer active work from commit frequency. P0 triages the four failed
nightlies reported among the last ten and establishes deployment timing relative to backend checks.
Measure queued-to-started job wait, labelling dependency/concurrency components and unknown eligible
times rather than calling the whole interval runner shortage. Layer: analysis of existing records.

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

Reproduce and pin the P1 broad-trace, catalog fallback, rename, test.only, output/fixture and
copy/header cases first. Planner fixtures cover design dependency closure, shared fonts/CSS/rendering, unknown/new/renamed/
deleted paths, stale/incomplete traces, custom contexts, selector edits and combined merge groups.
Malformed/missing reports and omitted selected cases fail. Start by replaying existing full-main failures retroactively against culprit plans. Existing
selected and full runs are compared for at least two weeks after the last relevant selection correction;
this is an audit inside P2, not a separate duplicate-run shadow phase. Replay
every full-run failure against its culprit's original PR/merge-group selection; investigate all
misses, including faults classified as flakes. Zero unexplained misses is necessary, not completeness
proof. Layer: selector/verdict Node tests, defect replay and paired Actions evidence.

### AC-5: Maintenance preserves behavior and reduces measured work

Three candidates have a named behavior/failure/boundary inventory, replacement receipt and measured
before/after setup, execution and runner cost on comparable environments. A one-design CI change
selects all proven dependants; shared/uncertain machinery still broadens coverage. Keep the necessary
UI/renderer integration and human visual review. Before narrowing, fix catalog-bench scoped
completeness: expected selected IDs/categories must match actual measured IDs; unknown IDs,
category mismatch or an empty overall selection cannot pass. Empty individual slices are valid
only if the complete selected manifest still ran. The cited scope-guard file is absent at baseline.

Daily-pass drills belong to P3: missed, failed and late runs alarm with the uncovered range; replay
scheduled failures against candidate landings, including interactions, and exercise full-scope
rollback. Midday scoped passes count only for the exact cases/designs actually checked. They do
not automatically close the 24-hour gap for unrelated designs omitted by selection. Prove a
completed full or collectively exhaustive pass inside the bound with scheduling margin; if the
existing schedule cannot do that, add the smallest justified fallback using existing workflows
or retain pre-merge coverage. Do not describe delayed cron starts as a guaranteed daily verdict.
No capacity exception, baseline or maintenance
entry is manufactured by a repair. Layer: focused tests, real rendered output and full comparison runs.

### AC-6: Parallel validation keeps every required verdict

Triggered configured PR cases execute exactly the selected manifest and feed the required CI
gate. Missing reports, unexpected skips and failed selected tests fail the gate; an untriggered
PR and merge-group event exercise the explicit skip cases. Full configured validation remains
per landing. Observe the added PR time and the combined-tree detection gap.

Three unrelated candidate SHAs dispatched together complete with attributable verdicts. Exercise
moved refs, schedules, superseded PRs, missing reports and lost acknowledgement. Preserve exact-main
recovery. In the three-plan cohort, each plan completes four rows; no starvation, interference,
duplicate repair owner or admission before prerequisite PASS. Demonstrate pause/resume. Target >=2x
matched serial completion rate and <=25% increase in category-matched median latency, retaining
queue-to-landing p50 <=10 / p90 <=20 minutes. Report tails and unfinished rows. Layer: bounded Actions
trial and independent plan acceptance. Small cohorts are operating evidence, not statistical proof.

### AC-7: Optional cadence changes retain deadlines, attribution and recovery

Outside initial acceptance; applies only if P5/P6 are later admitted. Catalog daily-pass
qualification is already required by AC-5 and cannot wait for this optional phase.

Before activation, AC-3/4 pass, the capacity gate is live, policy reconciliation is approved and
stale, missing-report, culprit/interaction and rollback drills pass. A relevant landing is covered
by completed full validation within 60 minutes; approved unrelated non-critical exhaustive cases
within 24 hours. Record every breach, not only percentiles. Drill overdue/incomplete validation,
two interacting landings, a corrected successor masking an earlier defect, and a lost required
exact result. None may be reported as an exact green by ancestry. Retain scheduled freshness and
quarantine policy. Layer: orchestration fixtures and bounded live workflow drills.

### AC-8: Gains persist within the existing resource envelope

Judge initial success on P0-P4 only; optional AC-7 is not a completion requirement.
Report before/after per-change latency, completed work/hour and runner-minutes per accepted change,
including failures, cancellation and unfinished work. Retain the suite-budget 85% warning / 95%
exception policy against a reviewed fixed envelope based on current resources; extra shards do not
silently buy extra budget. Weekly maintenance reports identify growth and owners. Any selected-out
critical defect, missing required verdict or unsafe admission immediately stops the affected rollout.
Investigate any increase in first-check failures or escapes before expansion. Timing misses permit
one bounded correction and remeasurement, then pause expansion if still outside bounds. No test
weakening, additional paid resources or removal of slow rows from the statistics. Report the
intentional safety cost of P1(b/c) separately from optimization savings. Layer: existing reports and receipts.

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
- The earlier proposal excluded activation of reuse/batching. They appear here only as optional
  follow-ups outside initial acceptance, not permission to turn them on. No current observer behavior changes.

## Phase notes

Planning only. Opus review received and reconciled on 2026-10-28. Current-state remeasurement,
owner acceptance of the revised draft, implementation and all trials are pending.
This spec and its acceptance ledger are not a runnable plan. Add implementation receipts per phase
after authorization; do not report the future acceptance criteria as verified by prose review.
