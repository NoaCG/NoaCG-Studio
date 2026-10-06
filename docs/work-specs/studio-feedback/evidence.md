# Studio feedback verification

Baseline: `ba8ad8738758c6a87580f40e35a34c05b88bee13`, including reliability PR #711.

## Reproduction and decisions

The baseline browser run reproduced the anonymous global notice, browser-only productions
showing CasparCG setup, and five color input events causing five entire-production writes.
Existing additive/range selection and clipboard operations worked. Delete and application
undo had no handler. Color latency comes from repeated synchronous production serialization
and persistence announcements, rather than rendering the small color swatch.

The color control now previews immediately and coalesces durable updates. The regression checks
zero writes during input, one settled write, and the final persisted value after reload.
Global notices now represent actual recovery needs; the persistent header reports routine
local, checking, confirmed and failed save states. Expiry/retry/export tests remain intact.

Playout settings exposes the current production choice and browser URL together. CasparCG
configuration follows an explicit output choice or an actual native server cue. Output choices
preserve cue/source IDs and publication links. Internal revision-based readiness is unchanged;
operator text omits version counters. Browser sources remain one common output.

Independent browser channels would be useful for persistent scorebugs and scene-specific lower
thirds, but the existing destinations are mirrors. A routing implementation needs coordinated
dispatcher, renderer, monitor, export and readiness changes, plus safe live reassignment. The
owner decision is whether to prioritize that separate feature, with those two use cases as its
initial scope. No decorative channel controls are included here.

## Checks

- Inline review and simplification covered the branch diff. Fixed pending-state wording,
  a false initial team-load error, a missing preview callback, and excessive modal height.
- Full `npm run build` passed, including the contract, layering, client-neutral, lint,
  type, unit, build and bundle gates.
- The studio feedback and evening reliability specs passed all 20 tests, including a
  persistent failed-save/expiry recovery, phone settings, output changes, color writes,
  selection/clipboard and Delete standing down for inputs and menus.
- Six intentional Windows rundown screenshot updates passed and were visually reviewed.
  The changed footer hides irrelevant CasparCG guidance without moving the controls.
- The CasparCG playout suite explicitly chooses that production output; it retains native
  server command and capability coverage after optional setup became hidden.

An earlier full affected-spec attempt was cancelled after expected old screenshot/fixture
failures. Another playout run lost its reused dev server when a concurrent screenshot run
ended. Neither is counted as passing; subsequent jobs are serialized within each checkout.

Not exercised: installed CasparCG/Bridge hardware, a real cloud account, physical phone,
OBS/vMix applications, or native macOS key handling. Browser and cloud failure behavior use
real application code with deterministic fixtures.

Undo is implemented and verified in separate prerequisite/history slices. This UI slice does
not expose an inverse operation before those storage guarantees are proved.
