# Studio feedback verification

Baseline: `ba8ad8738758c6a87580f40e35a34c05b88bee13`, including reliability PR #711.

## Reproduction and decisions

The baseline browser run reproduced the anonymous global notice, browser-only productions
showing CasparCG setup, and five color input events causing five entire-production writes.
Existing additive/range selection and clipboard operations worked. Delete and application
undo had no handler. Write-path profiling found synchronous production serialization and
persistence announcements on every color input event. The fix removes those repeated writes;
it does not claim a measured frame-time improvement on the owner's machine.

The global notice came from commit `b76d23827` in PR #711. Commit `82e1f69ad` moved it clear
of authoring controls but retained the condition that displayed it for anonymous work and every
unconfirmed cloud revision. This session owns that condition and the shared status indicator;
the editor session was notified to avoid a competing change.

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
  type, unit, build and bundle gates. The final build ran 2,464 unit tests: 2,461 passed,
  three skipped and none failed.
- The studio feedback and evening reliability specs passed all 20 tests, including a
  persistent failed-save/expiry recovery, phone settings, output changes, color writes,
  selection/clipboard and Delete standing down for inputs and menus.
- Six intentional Windows rundown screenshot updates passed and were visually reviewed.
  The changed footer hides irrelevant CasparCG guidance without moving the controls.
- Six Linux baselines were recorded by the repository workflow on commit 1c1966888,
  run 37533800761, and all six were visually reviewed before copying into the branch.
- The CasparCG playout suite explicitly chooses that production output; it retains native
  server command and capability coverage after optional setup became hidden.
- The affected suite passed 742 cases and skipped 117 configured/quarantined cases.
  Nine failures used old CasparCG fixtures or wording; the fixture changes explicitly select
  CasparCG when its controls are being tested. Four loading/video failures all passed the
  isolated rerun without product fixes. That rerun passed 12 cases; the remaining health
  case required actual legacy Bridge activity before opening its contextual CasparCG settings.
  That complete health case then passed, retaining disconnect/reload, stale-response and
  native-cue readiness assertions. No assertions were skipped or weakened.
- The final review also removed two version labels inside the readiness checklist.
  Internal revision comparisons, asset preparation and command checks remain intact.

An earlier full affected-spec attempt was cancelled after expected old screenshot/fixture
failures. Another playout run lost its reused dev server when a concurrent screenshot run
ended. Neither is counted as passing; subsequent jobs are serialized within each checkout.

Not exercised: installed CasparCG/Bridge hardware, a real cloud account, physical phone,
OBS/vMix applications, or native macOS key handling. Browser and cloud failure behavior use
real application code with deterministic fixtures.

Undo uses separate prerequisite/history slices. This UI slice does
not expose an inverse operation before those storage guarantees are proved.
