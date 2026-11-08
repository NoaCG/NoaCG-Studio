# Editor R1.5 release run

**Prepared November 8, 2026. Status: draft, awaiting independent review and launch authority.**
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
| E1 | **Baseline and remaining editing gaps.** Inventory the required R1 rows on pinned main, separating existing passes, open checks and reproducible defects. Exercise imported Illustrator SVG and catalog artwork through editing, grouping, undo/cancel, animation, save/reopen and export. Recheck outstanding issues such as [#774](https://github.com/NoaCG/NoaCG-Studio/issues/774), [#775](https://github.com/NoaCG/NoaCG-Studio/issues/775) and [#1749](https://github.com/NoaCG/NoaCG-Studio/issues/1749) on reachable R1 paths. Keep the cumulative October journey and prior failures. | Owned Windows Chromium context, including actual 125% zoom and native import/download when required. Isolated test accounts and fixture files. |
| E2 | **R1.2c loops.** Complete the required property/layer loop tasks. Prove hold, interruption, replay and Out, boundary and settling behavior, and editor/browser-export parity. Preserve legacy motion and source. Test loop stopping on state exit, repeatability when settling and continuity when supported speed changes during motion. | Maintained test fixtures and browser preview/export. Same-task reference evidence. |
| E3 | **R1.3 assisted editing and round-trip.** Close the required manual and reviewed-help/edit scenarios under existing model and funding policy. Show correct-document targeting, preview, accept/cancel/undo, a stale request safely refused, and source/fields retained through CLI package import, visual edit, save/reopen and export. Test the supported access paths within existing authority. Record separately if a required model/access check is blocked. | Browser and CLI with isolated fixtures. Real model checks only on an authorized existing route. |
| E4 | **R1.4 projects to rundown.** Prove the complete starter or brand workflow, multiple durable graphics, Home reopen, selective install into a new or existing rundown, and rehearsed operator data/In/Next/Out. Interrupt installation and retry without duplicates, exercise rollback against a newer edit, preserve the live copy until explicit replacement, and retain October save/recovery evidence. | Local isolated account and disposable production. Browser rehearsal and exported outputs. |
| E5 | **R1.5 software and first-use qualification.** Run the imported-SVG and starter-to-rundown journeys with 2–3 real first-time users. Ordinary edits target one minute each, and keyframe and collection tasks target five minutes after the short introduction. Record assistance and misses individually. Measure actual feedback with the plan's targets of selection within 100 ms, visible feedback at least 30 Hz under stress, no freeze over 100 ms and final pointer-up pose within 150 ms. Compare the same tasks on the same machine against the existing pinned Studio reference, recording exact sources, versions and deliberate differences. Use current Stable separately when it answers a materially different question. Resolve release-critical gaps and prepare the owner review and playout handover. | Real participants, named desktop and laptop setups, native 125% where relevant. Team or delegated moderator. Actual, executed reference tasks. |
| E6 | **R1.5 receiving systems.** On a clean receiving environment, play an exported graphic with bundled font and logo, exercise data, In/Next/Out, interruptions, replay and parity, and record the host/version and actual output. Include real CasparCG and a named OGraf renderer. Qualify other release targets where the release claims compatibility. Use a rehearsal output or off-air window with a qualified operator. | Actual named receiving systems. Browser exports and a second browser profile remain separate evidence. |
| OW1 | **Release decision.** Present the rehearsed workflow and tested candidate, the first-use and performance results, real-host receipts, the written GSAP disposition and any remaining material limitations. The owner reviews workflow and explicitly approves or declines release adoption. The approval is recorded separately from engineering evidence. | OW: owner workflow review and recorded release decision. |
| E7 | **Release adoption and exact verification.** After approval and all required evidence, implement the approved Alpha-to-release change for the current one-editor product. Preserve routes, stored data, runtime behavior and rollback. Use the normal merge queue and confirm independent acceptance, required checks on the actual merge, and the intended live deployment. | Normal GitHub queue and exact-merge checks, then applicable production verification. |

Use [phases.json](phases.json) as the supervisor's ordered phase input. Start
with E1 and progress serially through E5. Stage GSAP clarification and receiving
access in parallel with those phases. Prepare the workflow walkthrough after
E5 even if E6 or GSAP is still pending. Start OW1 after E6 passes and the
written GSAP disposition is available. Missing mandatory evidence checkpoints
the same project at the first dependent gate, with the exact receipt and action
needed to resume. The owner handover uses the accepted report route with no
periodic check-in. Resume on the recorded receipt within the applicable
authority. If the native route cannot deliver it, the checkpoint names the
manual resume action. Completion requires E7 and its exact deployment check.

## When owner involvement is needed

| Milestone | What the team prepares | What the owner supplies |
| --- | --- | --- |
| Early in E1, after the dependency inventory | Exact GSAP version and plugins, how the editor uses it, and how it is bundled or redistributed in browser, CLI and exported packages. Prepare a short request for written clarification under the existing licence decision. | Send the request as the project owner. The team reconciles any reply with the current artifact inventory. The written response or separately approved resolution is required before release approval. |
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

## Activation and verification

- This is a local draft. Activation requires explicit start authority, actual
  start and a finite deadline or expressly authorized planning target. Record
  separate owner grants for running until complete and automatic renewal of
  bounded work blocks. Each block is at most 24 hours. The October run's
  authority ended with that run.
- Use plan-create and plan-run. Reconcile current main, worktree ownership,
  the old terminal ledger, recovery refs, overlapping work and live GitHub
  state. Use one continuing project, one supervisor and fresh builders and
  independent checkers in owned worktrees. Preserve the phase IDs, acceptance
  and required environments from phases.json. Keep physical and private
  evidence on the required host.
- Requested mode is unattended Codex. Before opening the project, qualify the
  selected native coordinator and worker bindings. Observe coding-session
  wake and re-entry, a bounded renewal, terminal stop and the effective
  permission policy on the selected route. Record idle re-entry and reclaimed
  host recovery separately. The
  [prior recovery qualification](../native-recovery/evidence/qualification.md)
  and [Codex implementation evidence](../codex-plan-runs/evidence/implementation.md)
  provide context. If qualification fails, keep the draft and report the
  missing proof. Active execution requires its own owner authorization.
- On a qualified route, progress through routine phase transitions, repairs,
  queue admission and exact-merge checks within the recorded authority.
  Use the native wake and existing supervisor state. The phase coordinator
  owns recovery and each PR has one acknowledged repair owner. OW1 uses the
  existing owner handover and receipt flow. An explicit owner pause requires
  explicit resume. Stop launches and block-specific wakes when authority
  ends, and stop the native wake at terminal completion.
- Use the existing scheduler for targeted local checks and GitHub Actions for
  full suites. Run the required comparable reference task per meaningful
  editor step. Keep named hosts, human judgment and actual browser zoom tied
  to their required environments.
- Read the latest [#1967 hold](https://github.com/NoaCG/NoaCG-Studio/issues/1967)
  just before queue admission while it applies. Run the existing sideEnds
  check on exact candidate paths. Preserve selection, budgets, limits,
  quarantine and the original failure evidence.
- Before each implementation record the requirement, the smallest reproduced
  gap and its observable verification. Where behavior already passes, use a
  verification receipt with the tested revision and required environment as
  phase evidence. Use the normal queue for any required evidence-only PR.
  Independently check every phase and follow changes through the merge queue,
  exact-merge checks and applicable deployment. Checkpoint the same project
  with the exact next action at any remaining external gate, unsupported
  interruption or authorization boundary.
