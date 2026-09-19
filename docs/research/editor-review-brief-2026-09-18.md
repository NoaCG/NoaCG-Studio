# Editor rebuild: corrected review package

2026-09-18. Independent review of d5e8c1db: **ready with named corrections**.
Corrections are recorded, not implemented. Branch: codex/editor-baseline-design.
Product implementation remains on hold. Group/precomp scope approved by owner 2026-09-19.
This brief indexes the plan; EDITOR_PLAN.md is the single scope authority.

## Read in this order

1. [EDITOR_PLAN.md](../EDITOR_PLAN.md): complete destination, corrected sequence, E01-E24 and checkpoints.
2. [EDITOR_REBUILD_PLAN.md](../EDITOR_REBUILD_PLAN.md): D01-D05 source/interaction/runtime decisions.
3. [Acceptance register](editor-acceptance-register-2026-09-17.md): closing tests, slice gates and unverified evidence.
4. [STARTER_COLLECTIONS_PLAN.md](../STARTER_COLLECTIONS_PLAN.md): Home brands, gallery and production installation.
5. [Complete workspace, workflows and phase purposes](editor-whole-workspace-2026-09-19/README.md):
   latest desktop screenshots, gallery, canvas tools and timeline in one local design study.
   [Canvas/timeline](editor-canvas-review-2026-09-18/README.md), [workspace/gallery](editor-consolidated-proposal-2026-09-17/README.md)
   and [transforms](editor-transform-proposal-2026-09-18/README.md) remain historical evidence.

The previous [review request](editor-second-opinion-request-2026-09-18.md) describes the
d5e8c1db review input. Its old phase order is superseded here. Likewise the mockups' Add Out
label, missing initial Out, first-pass trim timing and mixed seconds/frame ruler are superseded
by the permanent Out / Set Out and explicitly labelled unit contract. The new 2026-09-19
whole-workspace study illustrates those controls and the asset/template journeys. Its local
interactions are not product acceptance. The owner requested this alignment before R1.0.
The mechanism now requires a file-level keep/refactor/replace/retire inventory before code;
the study explains each slice's user purpose, scope limits and closing demonstration.

## Complete scope retained

Permanent canvas, familiar full 2D controls and layers; property keys, bars, flags, reverse exits,
local loops and history; Illustrator import fidelity and preserved wizard logic/fields; text,
shapes, assets and typography; templates/starter graphics, Home brands/overrides and rundown
installation; embedded AI/BYOK, CLI and paired MCP; Lottie/paint/effects; structured GDD/live data;
OGraf/SPX/CasparCG/NoaCG production and named-host evidence. Optional Monaco stays beside canvas.
Node authoring remains excluded; existing behavior and node lessons survive. Reusable precomps
remain required for full completion and follow R1.5 as P-COMP, approved 2026-09-19.

## Decisions recorded before R1.0

| Decision | Contract | Closing test / owner |
|---|---|---|
| D01 Out | Permanent end-of-last-pre-Out flag; Set Out at playhead; reverse prompt whenever exit has no keys; one-step In has a distinct empty exit | R1.1c: empty-exit save/reopen identical; one-step source never replays In on Out; repeat Set Out reoffers reverse |
| D02 interruption | Capture live pose, stop current motion, tween each exit track to its final key without initial set; re-emit older owned interpreter | R1.1c: Out at 40% of In, dispatch discontinuity <1 px / <1 opacity percentage point in simulator and export |
| D03 Position | Persist runtime values; parent coordinates for placed/absolute/SVG, labelled Layout offset for catalog flow; position:relative adapter owns base offsets | R1.1a/d: +40 px base move preserves motion and siblings; transformed parent conversion, undo/save/export agree |
| D04 spans | Optional per-step visibility sets, deterministic cue-side sampling; read-only bars, then body-move, then trim | R1.1b/d: static/disjoint/cross-hold spans; move carries keys, trim preserves them; legacy/no-span save/seek/export parity |
| D05 sequence | R1.0 foundation followed by R1.1a-d; correctness proven in each consuming slice | R1.0: flagged preview route, shell/selection/bars/scrub, registry/history/protocol and latency harness; R1.1d: two first-time users |

These decisions are closed in planning. Their product tests remain unverified and must pass
at the named slice exits; recording them does not authorize starting R1.0.

## Implementation order after authorization

| Slice | Dependency | Bounded outcome / review route |
|---|---|---|
| R1.0 | Recorded D01-D05, implementation authorization | Flagged preview-deployment editor route; shell, selection, read-only bars/scrub, registry/history, revision protocol, latency harness |
| R1.1a | R1.0 | Wizard Finish -> Edit; base Position/Layout offset and text/shape/basic scale tools |
| R1.1b | R1.1a | Text+box: off-canvas first key, canvas drag at 1 s creates second key; span-backed bar-body moves |
| R1.1c | R1.1b | Set Out, reverse/manual/empty exit, indefinite hold, early interrupt, undo/save/reopen/export/production parity |
| R1.1d | R1.1c and stable-ID gate | Nested Illustrator/catalog fixtures, trim without retiming, two first-time users; repeat latency/fidelity checks |
| R1.2a | R1.1d and shared Bezier gate | Full transform animation, key gestures/easing, exact splits, Step/Next, cue-side editing and cross-cue spans |
| R1.2b | R1.2a; scope approved | E05-E07/B04: typography/fit/assets/images/full tools, duplicate/delete/reorder/align/distribute/group movement; folders/bins and group layer |
| R1.2c | R1.2a and relevant group behavior | Local loops, interrupted Out/replay and legacy behavior regression |
| R1.3 | Stable shared operations from R1.1c; later tools registered as shipped | Grounded basic AI/BYOK, real-model evidence and CLI round-trip |
| R1.4 | R1.1c stable registry; may run parallel with R1.1d/R1.2/R1.3 | Gallery, starter set, Home brand/overrides, selected-set installation/recovery and rehearsal; no AI dependency |
| R1.5 | All required R1 portions, GSAP clarification | Comparative/human/performance/output-host checks and explicit owner default-switch approval |
| P-COMP | After R1.5; scope approved | Instanced reusable precompositions with definition/instance, field, history and export parity |
| R2.1/R2.2 | Relevant R1 contracts | Lottie then paint/mask/composable effects |
| R3.1/R3.2 | Relevant R1/R2 contracts | Structured/live data then complete paired co-authoring |

Each row gets a bounded branch, fixture and exact route before implementation. At its exit,
provide a short walkthrough/expected results, screenshots or recording, commit, automated
evidence, known limits and an owner-queue item. Owner review when available is separate from
engineering verification; don't depend on the owner to find ordinary defects. Update the
E/B ledger and handoff. No screenshot/build closes the full product journey.

## Later gates and scope ruling

- Before R1.2a: interpreter and sampler share the serialized cubic-bezier ease string and exact
  split/mirror evaluator. Until then refuse Set Out before the last In key. For named eases,
  in/out swap is the exact mirror; incoming-segment ease moves to the other reversed key.
- At cue flags: edits target the arriving side except a layer whose bar starts there.
- Before R1.1d: mint stable IDs on first committed edit of unnamed SVG nodes, with atomic undo.
- E05-E07/B04 explicitly close in R1.2b (core new text/shapes start in R1.1a).
- B13 is split across R1.0, R1.1b-d, R1.2a/c, not assigned solely to R1.2. Label ruler units and
  test seconds/frames against document FPS without rewriting source time.
- Before R1.5: clarify the exact GSAP licence/version/plugin/export/CLI obligations.
- Owner approved 2026-09-19: R1.2b group layer with its own transform, parent bar and local
  ruler; instanced reusable precompositions are P-COMP after R1.5. This supersedes their former
  R1.2 placement. Do not conflate groups and reusable instances; both remain in the destination.

## Reuse rationale and remaining evidence

Studio remains a behavioral/source reference. Third-party AGPL code removes sole-holder
freedom to dual-license the combined work without additional rights; it must never reach
the Apache CLI, shared dependency closure or emitted packages. See the mechanism's licensing
section for primary sources and the separate GSAP gate. This is more than scene-model mismatch.

The [baseline](editor-baseline-2026-09-17.md) and
[supplement](editor-design-review-2026-09-17/baseline-supplement.md) retain old-editor evidence.
Transform/source, latency, comparative users and real receiving-host checks remain unverified.
YLE renderer/workflow and the free-AI launch budget remain explicit later gates. No planning
commit, review verdict or green build is implementation, merge or deployment authorization.
