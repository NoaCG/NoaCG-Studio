# Editor R1.5 release run

**Prepared November 8, 2026; Cloud-first remainder authorized November 11, 2026.**
Existing run: `plan-editor-r1-5-2026-11-08`. E1-E3 are independently accepted; their original source/environment receipts are historical facts, not relabeled Cloud checks.
The [owner amendment](owner-decision-2026-11-11-cloud-first.md) supersedes only the unstarted scheduling/environment restrictions described below. The original spec remains pinned at `f0f2e3fe0c2cc14e23b171957b6f8d18905fd434`.
Baseline for preparation is main `361cb6f628df0a44d410954aae527cde976d1750`.
The October 13 run is complete. [Phase 3 #2294](https://github.com/NoaCG/NoaCG-Studio/pull/2294)
and the [Phase 2 single-device closure](../editor-leave-reliability/scoped-closure/README.md)
carry their actual scope and failure history into this run.

## Why and scope

Finish the remaining required R1 work and bring the editor to a documented
release decision. Today the editor is available as Alpha. The release gate is
a useful, dependable workflow from imported or starter artwork to rehearsal
and playout on the systems the release promises.

Use the [editor plan](../../EDITOR_PLAN.md), the
[acceptance register](../../research/editor-acceptance-register-2026-09-17.md)
and the [owner review criteria](../../research/editor-outcomes-and-review-readiness-2026-09-20.md)
as the authority for scope. Start each phase on current main. Reconcile each
requirement against shipped behavior, open issues and existing receipts. Fix
reproduced gaps in small, independently checked changes. Give working
behavior credit only at its demonstrated scope.

Keep one active authoring tab on one device per account. Carry the October
single-device restrictions and deferrals. R2, R3, reusable precompositions,
the deferred shared-lab diagnosis, a new animation engine, and changing
licence terms or committing to paid services require separate authority.
Keep existing graphic source, saved revisions, operator fields and the
on-air copy safe. Release adoption requires explicit owner approval.

## Phases

| ID | Work and observable exit | Evidence environment |
| --- | --- | --- |
| E1 | **Baseline and remaining editing gaps.** Inventory the required R1 rows on pinned main, separating existing passes, open checks and reproducible defects using the coverage table below. Close remaining Windows authoring checks, including keys/copy, anchors, nested-source fidelity and everyday tools. Exercise imported Illustrator SVG and catalog artwork through editing, grouping, undo/cancel, animation, save/reopen and export. Recheck [#774](https://github.com/NoaCG/NoaCG-Studio/issues/774) and [#1749](https://github.com/NoaCG/NoaCG-Studio/issues/1749) on reachable R1 paths. Inventory the Linux-specific [#775](https://github.com/NoaCG/NoaCG-Studio/issues/775) for E6; a Windows result cannot close it. Keep the cumulative October journey and prior failures. | Completed Windows evidence retains its actual 125% zoom/native-file scope and original failures. |
| E2 | **R1.2c loops.** Complete property/layer repeat and yoyo loops with an independent local ruler and deterministic backward seek. Prove hold, interruption, replay and finite Out, boundary and settling behavior, and editor/browser-export parity. Preserve legacy motion and source. Test loop stopping on state exit, repeatability when settling and continuity when supported speed changes during motion. | Maintained test fixtures and browser preview/export. Same-task reference evidence. |
| E3 | **R1.3 assisted editing and round-trip.** Close required manual, grounded-help and reviewed-edit scenarios under existing model and funding policy. Show correct-document/selection targeting, preview, accept/cancel/undo, stale and invalid requests safely refused, and source/fields retained through CLI package import, visual edit, save/reopen and export. Verify required free/BYOK and external-tool access paths, quota/timeout handling and offline fallback. Measure real-model task quality separately from deterministic command parity. | Browser and CLI with isolated fixtures. Real model checks only on an authorized existing route. |
| E4 | **R1.4 projects to rundown.** Prove starter selection and branding, brand undo/redo and reapplication with local overrides preserved. Verify multiple durable graphics with independent drafts/history, Home reopen, selective installation into two rundowns, and operator data/In/Next/Out. Interrupt installation and retry without duplicates, expose rollback conflicts with newer edits, and verify failed save, rename, project removal and legacy migration preserve documents. Preserve existing/on-air copies until explicit replacement and retain October save/recovery evidence. Stage verified export fixtures, expected outputs and the receiving checklist; access to an operator or host is not an E4 exit condition. | Qualified Cloud browser/CLI with a real isolated authenticated backend on the worker or GitHub Actions, disposable productions and browser rehearsal. Hosted keys/production data are unnecessary. |
| E5C | **Cloud software qualification.** Rehearse both cumulative workflows, source/history/field preservation and comparable reference tasks; record F4 Cloud performance diagnostics at both viewports and actual settings, resolve known software gaps, and prepare participant/device instructions and forms. | Qualified Cloud worker/CI and isolated fixtures. No claim of real participants, named-device performance or native 125% acceptance. |
| E6C | **Cloud export and receiving preparation.** Verify exact bundled-asset packages in available browser/isolated renderers; investigate Cloud-reachable Linux #775 paths; complete technical bundle/provenance checks and stage operator scripts, expected outputs and rollback. | Qualified Cloud Linux/browser/export fixtures. Real receivers/operators and written GSAP disposition remain later gates. |
| E5 | **R1.5 software and first-use qualification.** Run the imported-SVG and starter-to-rundown journeys with 2–3 real first-time users. Ordinary edits target one minute each, and keyframe and collection tasks target five minutes after the short introduction. Record assistance and misses individually. Measure selection within 100 ms, visible feedback at least 30 Hz, no freeze over 100 ms and final pointer-up pose within 150 ms using F4's 30-layer/300-key scene. Record distributions and rendered results at 1366x768 and 1920x1080, with actual 125% browser zoom and reachable controls. Compare the same tasks on the same machine against pinned Studio, recording exact sources, executed versions and deliberate differences. Use current Stable separately when it answers a materially different question. Resolve release-critical gaps and prepare the owner review and playout handover. | Real participants and moderator, named desktop and laptop setups, native 125% zoom. Actual, executed reference tasks. |
| E6 | **R1.5 receiving systems.** On a clean receiving environment, play an exported graphic with bundled font and logo, exercise data, In/Next/Out, interruptions, replay and parity, and record the host/version and actual output. Include real CasparCG and a named OGraf renderer; qualify every other claimed release target. Reproduce #775 on Linux and verify long-text fit on the applicable named Linux receiving target. Use a rehearsal output or off-air window with a qualified operator. | Actual named receiving systems, including Linux for #775. Browser exports and a second browser profile remain separate evidence. |
| OW1 | **Release decision.** Present the rehearsed workflow and tested candidate, the first-use and performance results, real-host receipts, the written GSAP disposition and any remaining material limitations. The owner reviews workflow and explicitly approves or declines release adoption. The approval is recorded separately from engineering evidence. | OW: owner workflow review and recorded release decision. |
| E7 | **Release adoption and exact verification.** After approval and all required evidence, implement the approved Alpha-to-release change for the current one-editor product. Preserve routes, stored data, runtime behavior and rollback. Use the normal merge queue and confirm independent acceptance, required checks on the actual merge, and the intended live deployment. | Normal GitHub queue and exact-merge checks, then applicable production verification. |

Use [phases.json](phases.json) as the supervisor's phase input. Preserve completed
E1-E3. Execute **Cloud E4 -> E5C -> E6C**, then the final local qualification
stage **E5 -> E6**, then **OW1 -> Cloud/CI E7**. Existing E5/E6/OW1/E7 acceptance
strings remain unchanged. E5 additionally depends on E6C, so local scheduling
cannot hold up unfinished Cloud engineering or begin before its handover is ready.

Qualify the actual Cloud backend/worker or existing GitHub Actions isolated stack
before claiming stateful project/auth/persistence results. Disposable fixture
accounts are allowed within that isolated stack; production data, private local
artwork, new external accounts/funding and broader credentials are not implied.
Keep local-stack versus hosted latency limits explicit; use existing latency/failure
fixtures where required, never claim WAN behavior from a fast local database alone.

Stage participants, devices, receivers/operators and the GSAP reply in parallel
without making their availability a Cloud phase prerequisite. A missing resource
blocks only its first dependent gate. The final local stage collects real user,
native-device/125% and named-host evidence; simulations do not pass it. A defect
found there may need a bounded Cloud repair and affected local recheck on the new
candidate. No phase split resets a prior failure family or attempt limit.

Prepare the owner walkthrough and adoption change in Cloud. OW1 still requires
complete applicable E1-E6 plus E5C/E6C evidence, written GSAP disposition and explicit
candidate approval. E7 performs adoption only after that approval; release CI after
local qualification is not permission to release first. Overall completion still
requires E7 and intended live verification. Preserve the same project/ledger and
manual owner handover, with no periodic check-in while the owner holds a gate.

## Acceptance coverage and receipt rules

The table allocates existing requirements, including their later owner corrections;
it does not replace their detailed tests. Phase IDs E1-E7 are distinct from the
editor plan's E01-E25 requirement IDs. All required R1 portions must close, while
R2/R3 portions, optional Monaco, P-WEBMCP and P-COMP remain outside this run.
Imported gradients/masks and existing fields still require preservation in R1.
Historical flagged-route tests do not require restoring the retired second editor.

| Phase | Required coverage | Existing evidence to reconcile | Remaining proof and environment |
| --- | --- | --- | --- |
| E1 | B01-B07/B11/B13 non-loop authoring portions; E01-E11/E17/E24; D01-D05 and G01-G05/G08 applicable R1 portions | [Ordered implementation receipts](../../EDITOR_PLAN.md#completion-and-continuation), [acceptance register](../../research/editor-acceptance-register-2026-09-17.md), [October closure](../editor-leave-reliability/scoped-closure/README.md), #2294 | Current-source applicability and uncovered authoring tasks: nested identity/transforms, animated anchors, keys/copy/easing, flags/trim, file/drop, assets/Pen, typography, groups/bins and exact source/history/export preservation. Windows/native zoom; route loop-specific #774 checks to E2 and Linux #775 to E6. |
| E2 | B07/B13/B14 R1 loops; E11/E19; D02/G05 loop regressions | Register's R1.2a runtime/parity receipts; #774 | Repeat/yoyo, local ruler, reverse seek, hold/interruption/replay/finite Out, state-exit stop, repeatable settle and supported speed continuity in browser preview and exports. |
| E3 | B17/B18 R1 core; E22/E23; E12 shared-command safeguards | [Command qualification](../editor-command-qualification/README.md), [model proposals](../editor-model-proposals/README.md), [CLI round-trip](../editor-cli-round-trip/README.md) | Required help/access/failure paths and independent real-model task quality; browser/CLI and existing authorized model routes. Paired live MCP remains R3.2. |
| E4 | B08/B09/B19 and B10 install/recovery; E13-E16/E25; G06 | Register's project ownership evidence, October closure and #2294 | Full starter and brand/override workflows; independent durable documents/history; two-rundown install, conflicts, failed saves, rename/removal/migration and unchanged live copies. Qualified Cloud isolated account/backend, disposable production and browser rehearsal. |
| E5C | Applicable E1-E4 cumulative software; B11/E03/E17 diagnostic preparation | Current source-specific engineering receipts | Cloud cumulative/reference tasks, F4 diagnostics and a ready final local kit; not native-device/human acceptance. |
| E6C | B10/B17/E16 technical output preparation; Cloud-reachable #775 investigation; G07 technical bundle audit | E4 packages and exact dependency/artifact inventory | Cloud browser/isolated renderer outputs, Linux fixture and consolidated receiving/rollback kit; real-host and written-rights gates remain. |
| E5 | B01-B11/B13 cumulative usability, B11/E03/E17 performance; R1.5 first-use/reference gates | Bounded source-specific receipts above and [pinned reference contract](../../EDITOR_PLAN.md#baseline-closure-and-acceptance) | Two complete journeys, real first-time users/moderator, exact times/help/errors, F4 distributions, both viewports and native zoom. Execute comparable Studio tasks on the same machine at pin `3142fc7d02934494931eb14e7dc255393e4110d0`; record any runtime difference. |
| E6 | B10/B17 receiving-host portions, E16 output parity, #775 | Prior browser/export and host receipts only at their stated scope | Named real CasparCG, OGraf renderer and other claimed targets; clean bundled assets, runtime/resource behavior, Linux fit and actual output with an operator. |
| OW1 | G07 rights/provenance and R1.5 explicit owner workflow/release approval | Existing licence timing decision and earlier bounded owner receipts | Exact tested candidate, compatibility scope, limitations and complete E1-E6 evidence; written GSAP disposition, clean-bundle/provenance review and explicit approval. |
| E7 | R1 adoption, protected routes/data/runtime, rollback and exact deployment | OW1's candidate-specific approval | Normal queue, fresh independent exact-merge acceptance, required checks and intended live deployment. |

E12 history/save/source/stale protection and E16 existing operator fields/output
apply to every consuming phase, including E20/E21's R1 preservation obligations.
E1 publishes a row-level inventory: requirement and subcriterion, responsible
phase, existing receipt/revision, applicability on pinned main, remaining check,
required environment and status. Later receipts update that inventory without
changing scope or erasing previous outcomes. No required row may remain unassigned;
an uncovered required subcriterion remains a gate on its responsible phase.

Each independent checker reports every applicable subcriterion, not just one
summary for a compound phase criterion. A recorded blocker, scheduling request,
unsupported environment or missing receipt is never PASS. Evidence may be reused
only with explicit source/environment applicability; a historical pass does not
qualify newer main automatically. Product fixes use small reviewed changes.

Evidence-only phases follow the existing `build -> landed -> check -> pass`
path: publish the evidence through the normal queue, distinguish the tested
product SHA from the evidence PR's merge SHA, then independently check the receipt,
its product applicability and required exact-merge checks. OW1 uses the existing
owner handover rather than a dispatched builder; record the owner's actual
decision and publish its receipt for independent provenance/prerequisite checking.
Only explicit approval of the tested candidate can pass OW1 and admit E7.
Decline, silence or unresolved mandatory evidence leaves adoption stopped.
Material candidate changes require renewed applicable evidence and owner approval.

## Prerequisites and waits

Stage external prerequisites early without counting them as acceptance. Retain E1's existing model/participant/host inventory and record availability honestly.
Finish all Cloud E4/E5C/E6C work and consolidate the final local kit without waiting
for participant/device/operator access. E5 needs participants and named devices;
E6 needs named receiving access and an operator. GSAP disposition
gates OW1, and explicit release approval gates E7. Neither gates the Cloud phases or E6's technical checks. Cloud workflow review preparation does not wait for either.

If a required executing Cloud stack/access check, final E5 participant/device check or E6 host check is
unavailable, checkpoint the same project at that dependent phase with the missing
receipt, responsible party and exact resume action. Preserve partial results but
do not pass the phase or skip ahead in the serial supervisor. Preparatory work
does not admit another phase. Existing unrelated engineering outside this plan
is not held by an owner workflow-review request.

## When owner involvement is needed

| Milestone | What the team prepares | What the owner supplies |
| --- | --- | --- |
| Early in E1, after the dependency inventory | Exact GSAP version and plugins, builder use and redistribution in browser, CLI and exported packages. Prepare the written clarification request. | Explicitly bring the earlier six-month request deferral forward, then send it as project owner. The team reconciles the reply with the artifact inventory. A written response or separately approved resolution is required before release approval. |
| Once E4 yields repeatable export packages, ahead of E6 | Test exports, host/version checklist, expected output, off-air procedure and rollback. First check access the team already has. | Provide a named CasparCG and OGraf test setup or nominate an operator and off-air slot if the team lacks access. The operator can execute the checklist. |
| After E5, once both full workflows are rehearsed | One review route, a tested build, representative artwork and a short walkthrough. Include imported artwork through In/Next/Out and save/reopen, and a starter into a rehearsed rundown. Provide known limits and relevant comparison captures. | Judge clarity, timing, comfort and broadcast confidence on the usual setup. Confirm the release decision only after E6 and the licence disposition are recorded. |

The licence question follows [the existing owner receipt](../../STACK_FRESHNESS.md#L271)
and the [GSAP release gate](../../research/editor-acceptance-register-2026-09-17.md#L182).
Use the [current vendor licence](https://gsap.com/community/standard-license/)
and the [vendor licensing contact form](https://gsap.com/community/contact/)
as inputs to the request. The preparation baseline vendors GSAP 3.15.0 in
`src/assets/gsap.min.js`. The preview inlines it through
`src/preview/composeDocument.ts`. Export entry points include
`src/export/selfContained.ts`, `src/export/noacgPackage.ts` and
`src/export/targets/ograf.ts`. Recheck the exact browser, CLI and export
artifacts, plugins and notices before sending the request. Other products'
use of GSAP is comparison evidence.

The September 5 owner decision deferred the request for six months. Finalizing
this draft does not supersede that timing decision; an explicit later launch
instruction may do so. Preparing the inventory/request needs no licence change.
G07 also requires exact licence text/date and notices, rights/provenance review,
clean emitted bundles, and absence of third-party AGPL helpers/runtime from the
CLI/shared dependency closure and emitted graphics. Unresolved restrictions block
release approval. Other products' use and zero price establish no reuse rights.

## Activation and verification

- This is an amendment to the existing run, not a fresh activation. Preserve its
  original start, planning target, until-complete/block-renewal grants, provider,
  funding, failures, attempts and October single-device restrictions. Later explicit
  owner decisions, including this Cloud-first request, supersede older environment
  handoffs without rewriting completed receipts.
- Active Codex execution is already authorized. Qualify actual worker IO/network,
  owned worktrees, isolated services and result transport. Same-VM fresh contexts
  suffice for active execution; unattended wakes/host-loss recovery remain separately
  unqualified and are not prerequisites for Cloud engineering.
- Apply the reviewed amendment through the existing supervisor's owner-receipted
  admission transaction. Completed/started phases and original acceptance stay fixed.
  No second ledger, digest edit, fresh allowance or alternate phase launcher.
- Run Cloud E4/E5C/E6C before final local E5/E6. Qualify real isolated backend behavior
  on the Cloud worker or existing CI stack; label mocks, local latency and actual
  receiver limits. If unavailable, wait on that concrete infrastructure; do not infer
  Windows from the old E4 label. Never consume production data/credentials.
- Use the normal scheduler, targeted worker checks and GitHub Actions full suites,
  with unchanged budgets, selection, quarantine and limits. Every meaningful editor
  step retains a comparable executed reference task. No duplicate paid model round
  or reset of E3's consumed bounds follows from new phase names; reuse evidence only
  with independently checked source/environment applicability.
- Each phase uses a fresh builder and independent exact-merge checker, normal
  /check and merge queue, and terminal merge/deployment results. Preserve the current
  #1967 rules and exact sideEnds assessment; no budget exceptions to pass a gate.
- The final local batch keeps real first-time users/moderator, desktop/laptop,
  native 125% zoom/file actions and actual named receiving-host/operator/Linux
  checks. Cloud diagnostics, fixtures, simulations or a vendor delay cannot replace
  required evidence. Stage all scripts/fixtures/expected results before handover.
- OW1 keeps G07's written GSAP disposition, licence/provenance/notices/clean bundles
  and explicit candidate-specific approval. E7 adoption stays after approval. Any
  material candidate fix renews applicable software/local evidence before release.
- A pause, cancellation, expired block, unknown native delivery, permission refusal
  or exhausted failure family stops dependent work under the existing procedure.
  Missing local resources checkpoint the same run only at the final local gate.
