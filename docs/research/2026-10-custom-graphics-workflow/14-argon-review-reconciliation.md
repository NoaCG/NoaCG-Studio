# Argon review: findings checked and proposal refined

19 October 2026. Planning/documentation only. No implementation, plan run, package build,
hardware test or merge was performed. Preserve the [original review](argon-review-2026-10-19.txt)
alongside this assessment and the [revised full-run review prompt](13-full-run-second-opinion.md).

**Verdict:** useful product advice, but not reliable enough to adopt as a source-verified
execution specification. Bring the election use case forward and strengthen keyed selection.
Do not adopt its substituted phase descriptions, restored size limit, changed E6 scope or
Companion manifest fix. These are material errors, not merely different priorities.

## Evidence boundary

The original competitor research inspected `86e795dc9f66183633d7c99a73bea8c27e4e32f6`.
This reconciliation inspected the exact main revision Argon names, `70714e8f5`, after fetching
main. The planning branch before this reconciliation was `a78d7a14f`; it includes owner
refinements `4a861003e`, competitor integration `1c176d427`, and the full-run review candidate.
The branch's planning amendments were not on main. That part of Argon's finding is correct.

The main changes since the competitor baseline concern runner/orchestration instructions,
account/editor checks and related documentation, not the production-page, data-binding,
OGraf-control or Companion product implementations discussed here. Therefore those changes
do not explain the incorrect source paths and phase descriptions in the review.

References below are repository paths at `70714e8f5` unless stated otherwise. Package-tool
evidence was read from the published npm tarball, not inferred from the source manifest.
Source inspection establishes contracts and gaps, not successful current runtime qualification.

## Findings and disposition

| Finding | Existing support / commitment | Necessary refinement | Treatment / evidence |
| --- | --- | --- | --- |
| Reviewed plan is absent from main | Planning amendments exist on this branch; H0/E1–E8 are still a review proposal | Reconcile the complete reviewed plan with latest main, prepare approved child specs and land through the normal queue before execution | Accept, P0 preparation. Do not cherry-pick only the research integration and lose its prerequisites |
| Whole-graphic mapping and starter CSV need real acceptance | Already added to C1 and the Sheet/data specs in the owner-refinement changes | Verify they survive final integration; keep them out of an invented replacement E6 | Preserve, P0; inspect actual specs and perform their existing matching/export trials during the run |
| Per-cue live candidates require stable identity | Shared bindings exist; E7 already names keyed candidate selection | Specify cue-owned selection over shared collection mapping, separate preview/program identity and coherent entity revision | Strengthen E7, P1; switching, reorder, correction, missing-key and reconnect tests below |
| Election should precede broad foreign OGraf work | All extensions remain candidates; old default ordered E1–E8 numerically | Propose E4/E5/E7 before native E6 and E1–E3; keep all 22 baseline steps and Q | Accept as candidate sequencing, not authorization to implement |
| External acquisition needs trusted credentials and failure handling | Existing production API, source ownership and proposed E4/E5 | Define one provider route and bounded transforms; keep secrets outside ordinary exports; use existing data ownership | Accept, P1. A second snapshot table/store is not approved by this review |
| Hardware setup/docs have drift | Lease and Trigger cue exist; physical deck qualification remains H0 | Correct actual setup/protocol documentation and inspect the packaged artifact on the target Companion version | Accept H0 work; reject the proposed automatic manifest/API-version change |
| Soak and real-device rehearsal improve evidence | Q, baseline 22 and E8 already require endurance/output/human evidence | Select realistic workload and bounded duration; distinguish dispatch from end-to-end display latency | Refine acceptance; 60-minute soak / 30-minute hardware rehearsal are suggestions, not existing guarantees |
| Expanded programme reaches competitors' level | Research documents overlapping workflows, not exercised product parity | Compare production tasks and measured failure recovery; report remaining limitations per category | No numerical parity claim or guaranteed Friday completion |

## Corrections that must not enter the executable plan

1. **The phase descriptions and Q track are wrong.** The page is
   `src/components/home/ProductionPage.tsx` (5,744 lines at the checked revision), not the
   claimed 3,522-line `src/pages/ProductionPage.tsx`. Phase 1 is the safety net/defect and
   performance baseline, 2+7 is store/session and production-data ownership, and 13a is the
   props-only CueEditor extraction. Q is source qualification and an early paste trial;
   it is not Q1–Q4 audience-voting hardening. Preserve the actual 22-row table and underlying
   phase contracts instead of using Argon's replacement descriptions.

2. **There is explicitly no 600-line gate.** Parent spec D8 records the owner's October 17
   decision to remove the page budget. Maintenance is guarded by ownership boundaries,
   behavior preservation and the compiled control-module rule. Reintroducing a size ceiling
   would reverse that decision.

3. **A project is not limited to three fixed 24-hour windows.** Current main's
   `.agent-workflows/plan-run.md` explicitly says there is no 24-hour project ceiling;
   ordinary waves retain their own limits. Main's older parent-spec window prose needs
   reconciliation with the reviewed branch and current continuing-project runner. Blocks
   are resumable scheduling units, not a reason to split product scope arbitrarily.
   Cross-machine ownership/recovery still needs qualification before relying on it unattended.

4. **E6 means declared graphic controls through Companion.** It does not mean an
   authoring/AI/SVG bridge. Its requested score, quiz and clock buttons would disappear if
   Argon's replacement were adopted. Native declared actions can be specified without
   waiting for foreign OGraf controls. Foreign typed actions are qualified after E1–E3.
   SVG import redesign remains a separate future option.

5. **The proposed Companion manifest fix is not supported.** The source manifest uses
   placeholders, while `companion-module/package.json` declares module 0.1.1 and
   `@companion-module/base` 2.0.4. Published `@companion-module/tools` 3.1.1, in
   `package/dist/scripts/lib/build-util.js` lines 86–95, injects the package version and
   framework API version into the packaged manifest before validation. See the
   [exact package metadata](https://registry.npmjs.org/@companion-module/tools/3.1.1).
   H0 should inspect/install the built archive; this inspection did not build one.
   Do not hard-code the suggested 1.11.0 API version. Trigger cue uses a stable row target,
   not the review's `cueIndex` / `takeNow` contract. The proposed `panel_commands` table
   is also not the inspected route: credential tests must target the real relay boundary.

6. **The OGraf source description overstates current support.** The exported adapter is
   `ografContract`, not `ografManifestToFields`. It skips object/array controls with notes;
   it does not supply the asserted one-level object controls. Numeric bounds and step
   hints already exist. Several other cited implementation paths do not exist at the
   named revision. The typed data/action gaps remain valid, but use the existing full-stack
   milestone and pinned EBU specification, not invented function names or capability flags.

7. **Do not change established source semantics accidentally.** Blanket non-empty-record
   validation would reject a valid empty list, which the agreed workflow permits to clear.
   Missing, malformed and empty have different meanings. Sheet overrides persist until
   that source cell changes, Pause holds them, and Resume applies cells changed while paused.
   Lists remain read-only when connected; API Pause has its own suppress-and-diff contract.
   The new candidate-selector mode needs an explicit extension of these rules, not an
   implicit replacement with universal cue-local/permanent overrides.

## Candidate selection: add these concrete acceptance requirements

Agree the state contract before implementing E7: a cue can select a stable entity from a
shared collection without rewriting every graphic's binding. Argon's proposed interface is
a useful sketch, not an approved persisted schema or migration. Do not place this new
behavior inside a refactor-only phase or quietly expand C6 into a new mapping language.

- Selecting B in preview leaves the aired cue's A identity intact until an operator action.
- Switch A → B → A while source reads finish out of order. All fields in each update must
  resolve from one validated entity/revision; no A photo with B votes.
- Reordered rankings never retarget a cue. Duplicate or missing IDs are explicit failures,
  never permission to use row zero. District-qualified IDs prevent number collisions.
- Last-good values are scoped to source, entity and schema. If B has never had valid data,
  A's cached card is not a valid fallback for B. Define what the operator sees and whether
  Take is ready in that case. Define deleted-person behavior separately from a failed read.
- A newer downward correction applies; duplicates and older revisions cannot roll back
  results. Source values may update without taking, advancing or resetting behavior.
- Preserve agreed override/Pause rules and explain any deliberate new selector-mode policy.

Use the existing production store and adapters. Coherent revision metadata is a contract
requirement; it does not automatically require a second persistent snapshot store or a
native wire-format rewrite. Keep future typed OGraf representation at the appropriate boundary.

## Recommended sequencing and completion boundary

**H0 early; unchanged 22 steps plus Q; then E4 → E5 → E7 → E6 (native) → E1 → E2 → E3 → E8.**
These remain 31 named packages plus Q. E8 performs final integration, including any foreign
action coverage dependent on E1–E3. Baseline step 22 is a useful independently accepted
milestone, not final acceptance of the expanded programme.

The election package's synthetic fixtures and agent-authored graphics can be prepared using
the existing C5 sender. A generic mapper is not required merely to demonstrate replay data.
E4/E5 deliver a reusable acquisition/mapping product; a real election-provider qualification
requires actual access, schema, rate/latency expectations and operational arrangements.
Keep the proposed four graphics (party board, candidate card, count bug, ticker).
Head-to-head, constituency and coalition additions need a deliberate scope decision.

After successful acceptance, the expanded programme should cover a credible combination of
data-driven graphics, keyed election cards, normal rundown operation, hardware control and
foreign OGraf workflows. That is meaningful competitive capability for the target productions.
It does not establish parity with every vendor's mature operations, licensed feeds, newsroom
integrations, custom panel designers or native SDI/NDI engine. Production reliability is
earned by output/recovery evidence and repeated use, not the number of phases in a plan.

Friday remains a progress checkpoint: existing Companion transport and CasparCG/Bridge plus
browser output are the first practical goals. Do not promise that new custom actions, the
mapper, foreign OGraf and a qualified election feed will all be ready by then.

Before starting: settle the expanded boundary, turn selected extensions into executable child
specs with file ownership/ready conditions, reconcile latest main and runner contracts, and
land the complete reviewed planning changes through the normal queue. No implementation is
authorized by the review's “Run after these changes” verdict alone.

## Verification of this reconciliation

Checked immutable source/spec contents, branch ancestry, actual phase ordering, current runner
boundary, bindings, OGraf adapter, Companion package metadata and published package-tool code.
The original review is preserved verbatim. Documentation checks verify unchanged baseline rows
and working local links. No fresh hardware, cloud service, rendered output or performance pass
is claimed; those belong to the execution acceptance described above.
