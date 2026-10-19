# Planning refinement integrated, 19 October 2026

Authority: the owner asked, "Can you incorporate the planning refinement now into the actual
plan that we will run?" This follows acceptance of P1–P6, the full-project direction, cloud/local
placement, a quiet field connection UI, whole-graphic matching and downloadable starter data.
This receipt records planning work, not product acceptance. No run, project manifest, worker,
implementation, deployment or merge was started by this update.

## Canonical plan

- [Parent phase order and execution boundaries](../spec.md): all 22 sequential steps plus Q.
- [Data sources](../../data-sources/spec.md): connection interaction, formats, C0–C7 and checks.
- [Sheets](../../sheet-data-flow/spec.md): source lifecycle, overrides and starter round trip.
- [Messages](../../audience-flow/spec.md): unchanged staging protection and revised final-trial placement.

Research proposals are background. These specs now own the accepted scope; earlier research
statements that formal specs were unchanged are historical. Work-record hashes track this revision;
acceptance reviews remain open because the product work has not run.

## Traceability

| Accepted direction | Where incorporated |
| --- | --- |
| All refactors in this project, not cleanup before every feature | Parent Run order: C0, 1, 2+7, 13a, C1–C7, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13b, 14; existing safety matrices retained |
| P1: preserve current UI/import behavior; separate election/OGraf/Bridge redesign | Parent scope and data-sources Non-goals; mockups illustrate logic only |
| P2 and latest refinement: connect a whole graphic, optional field repair | Data-sources model, Whole-graphic matching, AC-3/13, C1/C5; Sheet behavior and AC-1/2 |
| Download a custom graphic's data template | Scalar Field ID/Label/Value CSV plus existing list adapters; C1 round-trip and fixed-slot fixture proof; no arbitrary bracket inference |
| P3: understand acquisition and API delivery | Data-sources Another system, AC-7 and C5: synthetic collector/sender, generated request, receipt, correction, failed acquisition and explicit freeze policy |
| P4: legacy Sheet transition without two writers | Sheet AC-10 and C6; correct current LiveDataControls location; retain old block unless explicitly migrated |
| P5: overrides and recovery | Sheet AC-5/7 and data AC-11; C2/C7 handover, Pause/Resume, delayed/missing reads and changed-cell cases |
| P6: first-production output route | C7 technical rehearsal; parent phase 14 final acceptance requires actual CasparCG/Bridge and OBS/browser receipts |
| Human testing on the completed build | C7 prepares the full trial; parent 14 runs data AC-14, sheet AC-12 and audience AC-7 after all refactors. Q's early paste trial is retained |
| Cloud where equivalent, local where required | Parent §9: qualified cloud implementation/software checks; local Windows baselines, hardware and human acceptance |
| Flexible blocks and no duplicate verification policy change | Landed continuing-project procedure referenced; finite owner deadline supplied at start; observation-only dispatch lookup preserves the Teams experiment |
| Future Excel/local-file sources | [Issue #1507](https://github.com/NoaCG/NoaCG-Studio/issues/1507), outside this run; RSS/Atom remains C4 |

## Scheduling and runner reconciliation

The previous C7 full human trial would block eleven remaining refactor steps until that trial
finished. With Friday planned for owner testing, C7 now proves technical integration and prepares
the trial; phase 14 owns the full human result. No criterion or threshold is dropped. Earlier
output checks catch integration defects; final receipts must cover the completed candidate,
rerunning affected walks after later material changes under the existing revalidation policy.

Rebased the research branch onto main `9294d250d` before these edits. The separate continuing-plan
work is landed there: project deadlines can span days, while individual blocks remain bounded.
Its runbook explicitly leaves native/cloud recovery and cross-host ownership unqualified.
The actual coordinator route must pass preflight before claiming unattended operation. This
planning session did not open a project or test that recovery path.

The shared plan-run instructions refer to an observation-only verification lookup. At the
inspected revision, the linked `verify.md` does not itself describe that lookup procedure;
the continuing-plan spec/runbook describes the intended observation behavior. Reconcile the
actual dispatch entry points in the runner/CI session before relying on lookup output. This
planning update neither changes CI nor treats that documentation reference as operational proof.

## Pending preparation

1. Receive the owner's separate Pixotope 26.3 OGraf Controller research. Compare authoring,
   OGraf package/runtime support, data mapping, rundown/control, actual output routes and recovery;
   distinguish documented, demonstrated and inferred capabilities. No competitor claim is made here.
2. Reconcile any accepted findings into these same specs, preserving current-run versus future
   OGraf scope; assemble a self-contained full-plan review package and request the owner's intended
   independent second opinion. The old reviews do not certify this revised scope.
3. Before execution, confirm the finite owner deadline, qualified coordinator/worker route,
   actual local acceptance setup and Q access/participant availability. Prepare the exact project
   manifest only under the start authorization; do not silently drop unavailable gates.

## Validation scope

Validate the four spec digests, unique acceptance IDs and the complete 22-step phase table;
review the cross-spec trial assignment and scope boundaries; run documentation gates and
`git diff --check`. Product tests and hardware trials are not planning evidence and are not
claimed by this receipt.

Results: all four `work-spec.mjs status` calls report zero structural problems and open
acceptance (no convergence review claimed). All 22 phase IDs/order and unique acceptance IDs
were checked; the local links in this receipt resolve. Documentation gates passed, including
23 existing tests selected by the gates. The first gate run caught an overlong GOALS summary;
it was condensed within the existing 200-line budget, then the gate run passed. No product
build, E2E run, hardware trial or CI dispatch was needed for these planning edits.
