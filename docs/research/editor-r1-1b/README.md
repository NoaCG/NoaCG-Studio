# R1.1b: numeric keys and layer body movement

Base: refreshed origin/main, PR #467 merged as
`fc9f263aae5d6857562a921d3bed7293b820ca7c`. September 27, 2026.

Why: static artwork editing cannot yet complete the first animation task.
Goal: author a text and box entrance with numeric properties, then move a layer's
timing as one undoable operation, using source as the only persisted model.

Decisions: source tracks determine arming. Capture rendered runtime values so
eased poses are not approximated by the legacy linear inspector sampler.
Independent channels retain their arming; X and Y have separate controls.
Base editing remains a named operation preserving motion.
Spans use the additive step-local schema in EDITOR_REBUILD_PLAN. Body movement
is bounded to one cue; crossing a cue refuses until R1.2a. No trim controls.

| Scoped acceptance | Evidence required / failure behavior |
|---|---|
| B03/B05: enable at playhead creates one key; armed edits and gestures key affected channels, unarmed edits change base | Text + box off canvas at frame 0, at 1 second drag into place and edit opacity; no extra hidden keys or unrelated channel changes |
| B05: nonzero first key, inherited pose, diamond removal and disable at interpolated pose | Before-first holds first value; last removal and disable bake displayed pose; undo restores exact source and previous base; explicit base edit retains keys |
| B06/B13 timing portion: body carries keys and all local intervals without changing relative offsets | Stored delta = effective delta * speed; snap to document FPS; test 0.5/1/2 speed and 25/30 FPS; cancel restores exact source |
| B13 visibility portion | Static layers selectable; disjoint intervals, arriving endpoint and departing start, reverse seek, absent-span legacy and saved/exported runtime agree |
| Shared transaction/preservation | Completed edit is one undo, redo and durable reopen agree; stale/invalid/unsupported ownership refuses atomically with a visible reason; preserve unrelated source |
| Regression | Hairline/Quiz, reliable text, immediate appearance, continuous Play/Pause and Space/pan; desktop 1920x1080, laptop 1366x768, 125% equivalent 1093x614 |

Non-goals: Set Out/reversal/interruption changes (R1.1c), trim (R1.1d), Step/Next
or cross-cue authoring, full easing/multi-key tools, advanced tools or default
editor switch. This slice does not close whole acceptance rows.

## Evidence

The default editor is unchanged. This
receipt does not close B03/B05/B06/B13 or request owner workflow acceptance.

The concrete task imports a text and box with an explicit 0–2.4 second visibility
interval into a three-second In cue. Both start fully left of the canvas. The UI
enables X and opacity at frame 0, drags both into the canvas at one second, and
changes opacity to 75%. X and opacity each have two keys; unarmed Y changes base.
A completed body drag then moves the box by ten frames, carrying both tracks.
One undo restores each interaction, redo restores its exact source, and save/reopen
retains it. Forward/reverse samples agree. The same task runs at 1920×1080,
1366×768 and 1093×614 (125% layout equivalent).

Important boundary: a legacy layer with no span occupies its whole cue. Moving that
bar would cross a cue boundary, so the operation explains the refusal and preserves
source. This slice does not shorten its lifetime, extend In, move Out, or invent a
trim control. An imported explicit interval with room can move. Static legacy layers
remain visible and selectable. The complete create-from-scratch timing workflow
still depends on the following Out/trim slices.

Focused evidence: queued job `j-2110`, all 13 tests in `e2e/editor-keys.spec.ts`
passed. `j-2109` passed all 26 existing artwork regressions and all nine September 27
usability regressions. Its scale fixture had started at the initial hold rather than
frame 0; `j-2110` corrects that setup and passes the animated-scale gesture.
Subsequent mixed-selection and stronger before-first assertions are included in the
final suite below; these are not covered by the earlier 13-test count.

- Source and rendered evidence covers nonzero first keys, last-key removal,
  interpolated disable/undo, animated scale handles, separated X/Y, parent inverse
  conversion, base offset preserving motion, stored/effective speed at 0.5/1/2 and
  25/30 FPS, disjoint spans, cue-side visibility and inheritance.
- Executable SPX, CasparCG and OGraf packages agree with the preview's visibility,
  opacity and transform samples. This is local package evidence, not a receiving-host
  or physical-device verdict.
- The legacy interpreter compatibility test hashes the actual PR #467 interpreter
  (`c8f005f1…42141d2`), proves the no-span source stays unchanged, upgrades it before
  writing spans, and refuses a customized interpreter.
- Unknown data, nonnumeric tracks, loops, measured motion, machine ownership,
  competing transforms, invalid spans and cue-crossing moves refuse atomically.
  Existing source-controlled Quiz animation keeps its base editing path.

Rendered walkthrough, inspected from the actual dev preview after save/reopen:
[desktop](built/keys-1920.png), [laptop](built/keys-1366.png),
[125% equivalent](built/keys-1093.png). Text and box are inside the frame, handles
remain separate from body dragging, keys align with their moved bar, and the
inspector and layers scroll within the existing shell. These are fixture graphics,
not newly authored catalog designs.

## Review corrections

The inline review and rendered checks found and corrected:

- Animated SVG base offsets were absorbed by GSAP's transform cache. The supported
  numeric geometry adapter now changes source coordinates in the element's parent
  space, retaining motion; unsupported geometry refuses.
- Small layers at 125% had overlapping handle hit areas that captured body drags.
  Hit areas now leave a draggable centre.
- Explicit spans inherited legacy hide commands that zeroed opacity at a hold.
  Explicit visibility now preserves the authored opacity channel.
- Preview readiness could expose the previous pose after a seek or source update.
  Pose time/revision guards and current-pose acknowledgements protect authoring.
- A legacy visible layer at a flag was incorrectly treated as a new reveal.
  Cue ownership now uses effective bars, including legacy visibility.
- Shell button styles enlarged key markers; Inspector siblings reused React keys.
  Scoped marker styles and distinct component keys fix both rendered defects.
- A preview time mismatch kept landscape loading active while the iframe was off
  screen. Source readiness and the stricter mutation pose guard are now separate.
- Rounding each translated key separately changed relative offsets at half a
  millisecond. Body movement now quantizes the delta once for the entire layer.
- Materializing a legacy hide cue as a full explicit interval changed its held
  endpoint. Such conversions now refuse atomically, preserving the original source.

The initial visual fixture was also corrected: it had placed additions below the
canvas. Final assertions prove the start is off the left edge and the completed
artwork is entirely inside the frame. No earlier source-only pass is used as that
visual proof.

## Final checks

After reconciling with `origin/main` at `c49825a2`, queued integration `j-2122`
finished with 753 passed, 422 skipped and two failures; its 35 catalog calibration
tests passed. The landscape failure is fixed. The other failure was the wizard's
preview timing bound (616 ms against 400 ms); isolated repeats are recorded below.
This run is not reported as a green full suite.

Queued final focused run `j-2123` passed 56 tests: all 14 R1.1b cases, 26 artwork
base-edit regressions, 12 foundation tests and four alpha-entry/layout checks.
This includes the final quantization and legacy-hide refusals. The command selected
`editor-keys`, `editor-base-edits`, `editor-foundation` and `editor-alpha-entry`.

`j-2125` passed all nine `editor-usability.spec.ts` cases. `j-2126` repeated
`e2e/wizard-preview.spec.ts:518` three times with one worker: all passed, forward
blank intervals 57/45/43 ms and return intervals 0/0/49 ms. The full-suite timing
outlier remains recorded; its threshold and implementation were not changed.

Catalog baseline/calibration job `j-2118` passed 35 calibration tests and four
baseline checks, including rendered equivalence of every catalog variant.
The catalog source baseline update changes only the JavaScript fingerprints for
all 528 variants; HTML/CSS fingerprints and render baselines remain unchanged.

## Next bounded task: R1.1c

Implement permanent Out and Set Out at the playhead, with empty/manual/reverse exit,
held cue sides and live-pose interruption. Read D01/D02 in `EDITOR_REBUILD_PLAN.md`
and the acceptance register before implementing. Prove the text-and-box task through
Out, save/reopen and executable preview/export parity, including interrupting In at
40% without a position or opacity jump. Keep the first complete workflow review open
until these ordinary controls work together.

Keep trim in R1.1d; Next/cross-cue authoring and full easing/multi-key/advanced tools
remain later work. Numeric scrubbing, grouped Position conversion, full property
rows/shortcuts, broader nested identities, real hosts/devices and owner acceptance
remain open portions of the parent rows. Do not switch the default editor.
