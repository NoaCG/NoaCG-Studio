---
v: 2
source: derived
kind: finding
raised: 2026-09-13
state: parked
note: A design/evidence task within the existing animation direction, not a new scene-model implementation.
found: Studio separates independent numeric tracks, lifecycle markers and local loops; NoaCG should compare this before major timeline changes.
serves: P7
size: large
needs-owner: none
---

# Specify property tracks and lifecycle stops through the code-backed animation model

**Filed:** 2026-09-13. **Source:** [Studio research](../OGRAF_STUDIO_RESEARCH.md), section 4.

## Why

Independent property timing avoids duplicating unrelated keys, and a local loop must keep moving
while OGraf waits at a step. Studio offers a concrete implementation; importing its scene document
would violate NoaCG's source authority and discard unsupported authored code.

## What it would take

The owner-requested [consolidated editor plan](../EDITOR_PLAN.md), dated 2026-09-17,
now owns the implementation sequence; product implementation remains on owner hold. Its dated [preview protocol](../EDITOR_REBUILD_PLAN.md#source-patches-and-preview-protocol)
and [shared sampler decision](../EDITOR_REBUILD_PLAN.md#out-loops-and-easing)
own those contracts; this receipt must not restate or independently redesign them. Fold this contract work into its foundations and
timing phases; do not schedule a competing track-schema rewrite. Current source already
has independent property tracks, so the first question is interaction/evaluation quality.

First reconcile `TIMELINE_V2_PLAN.md`, `SVG_ANIMATION_DIRECTION.md`, `animData.ts`, `animEdit.ts`,
`animEval.ts`, `timelineLens.ts` and the current machine. Specify an additive supported shape or
a versioned migration only if needed. Include target identity, units, incoming easing/curve,
duplicate-key/property conflict rules, frame-rate conversion and dynamic/unsupported-code policy.
Specify lifecycle marker movement independently from property-key movement, with loss warnings.

Keep one reader/emitter/evaluator contract; derive the UI and exported runtime from it. Define
loop activation, repeat/phase, update precedence, stop interruption and seek/reset semantics.
Compare Studio's frame ruler with Eyevinn's in/out lanes using the same two-step graphic before
choosing UI complexity. No GSAP-only public contract and no parallel scene source.

## Acceptance and handoff

Deliver the schema/transform contract and fixture expected values before a UI implementation.
Later tests must prove source -> visual edit -> readable source -> reopen parity, unequal X and
opacity key counts, moving a stop without moving keys, loops at holds, direct stop, skipped
animation and repeated seeks where supported. Unsupported handwritten code stays byte-preserved
and visibly read-only. A UI phase requires a mapped Playwright spec and its own acceptance file.
Coordinate canonical model changes with the agent-revision task; do not duplicate that ownership.

## Evidence

[Research source links](../OGRAF_STUDIO_RESEARCH.md#4-animation-lifecycle-and-data),
[full-stack graphic contract](../OGRAF_FULL_STACK_PLAN.md#3-graphic-contracts-and-authoring-decisions).
