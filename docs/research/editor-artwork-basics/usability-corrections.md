# Bounded editor usability corrections

September 27, 2026. Base: updated origin/main containing PR #466 (`edee2374`).

Why: the owner could customize artwork but could not reliably find playback,
marquee selection, layers or Project, and appearance required a hidden Apply step.

Goal: complete those four interactions before R1.1b. Use the September 27
acceptance table in README.md as the observable contract (B02/B04/B11/B13 portions).

Decisions: use the existing authoring seek/preview protocol for finite playback;
Space tap toggles playback, Space-drag pans without playback. Keep timeline-owned
layers. Project exposes the current graphic, assets and fields with an honest
open/close state. Appearance drafts preview through validated source writers,
then commit on completion as one transaction; Escape restores the original.

Non-goals: keys, bar authoring, Out changes, advanced tools, project persistence,
in-canvas rich text, production actions or a default-editor switch.

Acceptance: real wizard Hairline and House Quiz routes at 1920x1080, 1366x768
and 1093x614 (125% equivalent). Continuous artwork/clock, pause/resume, cue stop,
shortcut exclusions, marquee/movement and cancellation, visible new rectangle
rows/reordering, immediate font/size/colour/opacity, history and save/reopen.
Source, fields, motion and revision checks remain intact. Text completion stays explicit.

## Reproduction

`j-2073` and `j-2074` exercised New graphic -> Browse -> Hairline / House Quiz ->
Finish -> Edit this graphic on `edee2374`, Chromium on Windows. All six routes
used 1920x1080, 1366x768 and 1093x614 CSS viewports. A new rectangle was included.

- The triangle advanced exactly one frame; Space left the clock unchanged across
  30 measured parent animation frames. There was no continuous Play control.
- Project remained visible before and after its desktop toggle. At the smaller
  widths the drawer opened, but its supported contents were poorly explained.
- Layers existed and the created rectangle could be reached. The heading and
  transport did little to distinguish artwork rows from read-only timeline spans.
- Quiz padding captured the drag as `.quiz-box`, then refused movement with
  "This layer has no supported base placement." An enclosing marquee selected
  this unsupported ancestor along with its descendants, also blocking movement.
- The blue-screen symptom was not reproduced. Native selection stayed empty in
  the recorded drags; the visible marquee was translucent amber. This receipt
  does not claim to have identified the owner's exact blue-screen cause.
- Appearance values stayed unchanged in the preview until Apply, as reported.

The Quiz letter chips are static `.quiz-letter` spans without unique layer IDs,
and their alphabet also feeds correct/selected-answer fields and runtime matching.
They are not eligible plain-text targets under the current identity contract.
This change retains their source and behavior rather than exposing them as fields.

## Implementation

Playback advances the existing revision-aware seek controller and parks on the
arriving cue endpoint. At a parked endpoint Play replays that segment; scrubbing
into another segment lets the author inspect it. No production action is sent.
Space tap toggles playback; Space-drag and repeated Space reserve canvas panning.
Typing and modal shortcuts retain their existing ownership.

Dragging blank container space starts a marquee; a click still selects it.
Already-selected containers remain movable. Panels and blocks reuse the guarded
flow-offset writer, so Quiz movement preserves motion and existing constraints.
Layers remain in the timeline, with a visible count and selection instruction;
newly selected rows scroll into view. Project opens and closes at all three sizes.

Appearance uses shared fields and registry-validated transient CSS. Enter/blur
finishes typing, a font choice or stepper click finishes its discrete operation,
and Escape cancels. Invalid drafts and changed revisions preserve source.
The text completion action remains explicit.

## Verification

The focused regressions use the actual wizard routes in
`e2e/editor-usability.spec.ts`. The six Hairline/Quiz viewport journeys passed in
`j-2078`, alongside the invalid/stale appearance test. The whole-Quiz selection,
modifier selection and pointer-cancellation test passed in `j-2080` after its
second gesture waited for the revision-correlated restored geometry.

The typing guard was deliberately removed in `j-2082`. The strengthened assertion
failed as intended: Space in the opacity field changed the parked clock from
1.34 to 0.09 seconds. The guard was restored before final verification. An earlier
mutation run (`j-2081`) exposed a vacuous eventual-pause assertion; it was replaced
with an unchanged-clock assertion before checking that playback remains stopped.

Review and simplification ran inline. Review corrected field remounting that lost
the next focused input, appearance cancellation that restored an obsolete
selection, playback that needed to be tied to the exact document session as
well as its revision, abandoned panning on pointer-capture loss, and the sticky
inspector header's paint order. Container identity derivation is memoized; the existing
field controls, registry, flow-offset writer and preview protocol are reused.
The affected-suite planner's 47 unit tests passed.

All eight usability regressions also passed together in the final broader run
`j-2083`, along with the existing editor foundation, base-edit and export routes.
The six actual UI captures were inspected for reachable transport/layers, retained
canvas space and readable controls. Properties scroll locally at smaller sizes.

| Layout | Hairline | House Quiz |
|---|---|---|
| Desktop, 1920x1080 | [Workspace](usability-built/hairline-1920-workspace.png) | [Workspace](usability-built/quiz-1920-workspace.png) |
| Laptop, 1366x768 | [Workspace](usability-built/hairline-1366-workspace.png) | [Workspace](usability-built/quiz-1366-workspace.png) |
| 125% equivalent, 1093x614 | [Workspace](usability-built/hairline-1093-workspace.png) | [Workspace](usability-built/quiz-1093-workspace.png), [marquee](usability-built/quiz-1093-marquee.png) |

The matrix deliberately moves child artwork vertically as well as horizontally.
Quiz retains its authored question reveal mask, so that child offset can clip the
question; the mask is not removed to make a moved child visible. The separate
whole-Quiz test moves the panel and its contents together, preserving the mask.

Final focused verification (`j-2088`): **51 passed**, including all nine usability
regressions, foundation/preview identity checks, actual catalog and SVG edits,
history, durable reopen and SPX/CasparCG/OGraf export execution. Capture loss was
first fault-injected in `j-2086`: subsequent pointer movement continued the pan
to (40,40) instead of restoring (0,0). The regression passes after the fix.

Production capture `j-2090` exposed scrolled content painting over the inspector
tabs at 125% ([before](usability-built/inspector-header-before.png)). The sticky
header now has an explicit stacking level. All nine usability/layout tests passed
again after that one-line CSS correction (`j-2091`); the matrix images above are
from this final run.

Broader verification (`npm run test:e2e:affected`, `j-2083`): **976 passed,
545 skipped, two failed; catalog calibration 35 passed**. The skipped legacy
routes remain skipped by the existing suite; they are not passing evidence.
The two failures were outside the editor route:

- The install-command clipboard assertion compared Windows CRLF with LF.
  The full command text is now compared after newline normalization, in a
  separate test-only commit. Its rerun passed (`j-2086`).
- The unchanged wizard afterimage test measured 635 ms blank against its 400 ms
  limit. Its isolated rerun (`j-2087`) passed: 38 ms forward and 0 ms back.
  No limit or wizard code was changed. The original full run remains a failed
  run; the isolated result does not prove that timing stable under all loads.

## Built interaction and render evidence

`npm run build` passed on final application commit `701e5bc2` (`j-2092`): lint,
types, bundle and repository gates, with 1,899 infrastructure checks passing and
three platform skips. `j-2093` then ran
`node scripts/editor-foundation-bench.mjs --measure --artwork --output docs/research/editor-artwork-basics/usability-built`
against this checkout's production bundle. All nine catalog/SVG/F4 cases passed
at desktop, laptop and 125% equivalent layouts. Every recorded application source
hash matches the final files. [Raw samples, build identity and environment](usability-built/latency-built.json).

| Measurement, across nine cases | Result |
|---|---|
| Drag feedback | 56.7-58.5 Hz |
| Drag input-to-correlated-pose p95 | 20.8-28.2 ms |
| Selection p95 / scrub p95 | At most 55.0 / 56.0 ms |
| Pointer-up completion / maximum drag feedback gap | At most 47.0 / 34.5 ms |
| Page errors / long tasks | 0 / 0 |

These are browser acknowledgement measurements, not physical display latency.
Each 90-move drag is one transaction and its undo restores source exactly.
Rendered production captures were inspected, including [the corrected 125%
inspector](usability-built/tools-built-1093.png), [SVG](usability-built/svg-built-1920.png),
[30-layer fixture](usability-built/f4-built-1920.png) and [phone viewing](usability-built/phone-built.png).

## Next task and boundaries

After this slice lands, resume R1.1b numeric keys and layer bar-body movement from
updated main, following EDITOR_PLAN.md and the acceptance register. Set Out,
hold/interruption and export changes remain R1.1c; nested fidelity and first-user
evidence remain R1.1d. Advanced tools and direct in-canvas typography remain R1.2b.

This receipt covers engineering verification only. It does not close full
B02/B04/B11/B13, approve the default-editor switch, or claim physical-device,
receiving-host or owner usability acceptance. The exact historical blue-screen
symptom remains unreproduced.
