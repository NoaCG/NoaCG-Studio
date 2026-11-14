# Editor hosted feedback correction — 2026-11-13

## Owner decisions

This continues `plan-editor-r1-5-2026-11-08`, issue [#2295](https://github.com/NoaCG/NoaCG-Studio/issues/2295).
The owner tested the hosted editor and reported these product requirements:

- Starting an empty project or graphic must be easy. Starter choices need useful
  names and visual previews.
- Timeline and side panels should be resizable so users can choose how much
  artwork, properties and timeline they see.
- The editor assistant is supplied by Studio. Its provider, model, credentials
  and billing must not follow a user's personal AI preferences or saved keys.
- The Whole graphic row should support understandable graphic-wide positioning,
  scaling and animation. Scaling artwork together is distinct from changing the
  output canvas resolution; changing that resolution is outside this correction.
- Everyone uses the hosted Studio website. A downloaded local build is not the
  owner testing workflow.
- The owner explicitly declined a recruited 2–3-person study and offered direct
  testing and normal-use feedback instead.

These are current product decisions, not evidence that an unexecuted test passed.
The owner reported usability problems, not completion of every suggested smoke
step. Do not claim save, Discard, installation independence, device performance
or receiving-host checks from that report alone.

## Current position and preservation

E1–E4, E5C and E6C have independently accepted receipts: six of the original ten
phases. E4's narrow Discard recovery correction passed its original assertions.
E6C landed in [PR #2506](https://github.com/NoaCG/NoaCG-Studio/pull/2506), merge
`705ba59425441fedbe171bee993e4b621c7bf68b`. No feedback correction has landed.

Preserve the original ledger, phase acceptance, receipts, exhausted attempts,
failed WIP and authority. An historical PASS retains its tested-source and
execution-environment scope. No confirmed E4-attributable defect may be patched
without the existing owner reassessment. These new requirements do not reset an
old repair allowance. Do not weaken a test, check, quota or limit to close a gate.

The original E5 participant criterion remains untested and is declined by owner
product disposition. It is not a technical PASS. Do not keep requesting recruits,
a moderator or a local app build. Completion reporting must distinguish accepted
engineering evidence, the declined study and other unverified criteria. Do not
modify the supervisor merely to call this acceptance PASS or finish the run.
Remaining receiving-system, rights and exact-candidate release decisions retain
their existing scope; no production release approval is inferred here.

## Correction step to admit after E6C

Insert `E5F`, **Hosted editor feedback corrections**, after E6C and before E5;
add E5F to E5's prerequisites, retaining every existing prerequisite. Environment:
qualified Cloud browser/CLI, isolated test backend and the hosted Studio website
for final candidate verification. Engineering fixtures remain isolated; the
owner tests through the website. A local build is not a user prerequisite.

Acceptance:

1. Editor Help and Edit use a server-owned Studio route, credential and billing
   independent of personal provider/model/fallback/temperature/seed preferences
   and user-key cookies. Both calls retain current consent, authentication,
   applicable access/spend/rate limits, bounded requests, validation, reviewed
   atomic apply, Undo and stale-document/selection refusal. A credential rejection
   remains a failure until the actual hosted connection and an edit/Undo are
   verified; mocked success is not real-provider evidence. Personal AI settings
   on other product surfaces retain their existing behavior.
2. Blank project/graphic creation opens usable authoring directly with the existing
   unsaved-work guard, durable save/reopen and independent graphic identities.
   Starter selection remains available with meaningful names and previews.
3. Draggable panel dividers resize timeline and side panels within reachable
   minimum bounds, retain the user's layout and provide reset. Verify keyboard
   access, actual layout at the existing viewport/zoom requirements and that
   resizing panels changes no artwork, animation, history or saved source.
4. Whole-graphic controls move/scale the composition's artwork together while
   preserving relative layout, existing animation, saved source and exported
   results. Verify Undo, save/reopen and export parity. Unsupported imported
   structures refuse safely; do not enable a destructive source rewrite merely
   to make a resize handle active.

Execute the Studio-managed assistant correction first, then blank creation,
panel sizing and whole-graphic controls serially. Each verified implementation
step is committed. Use the existing fresh builder, independent acceptance,
review and merge-queue workflow. Preserve inherited Codex model/effort. Compare
meaningful interactions with the pinned working reference where equivalent;
record differences and limits rather than claiming beginner usability parity.

## Production credential investigation

The hosted gateway reports a credential rejection. Configuration presence is not
credential validation. Investigate the actual assistant route and safe provider
error metadata; do not ask users to choose a model or configure a personal key.
Do not expose, transplant or create credentials, alter billing/retention policy,
or relax limits. Any required secret/account change keeps its existing approval
boundary. Prepare and verify all unaffected product changes while that item is
blocked, and report the hosted failure honestly.
