# R1.1c: permanent Out and live-pose exit

Base: PR #469 verified merged as `ffd7a3ec5a560e719f18517b0af8b7d2f31eb002`.
Refreshed origin/main contains that commit. Worktree branch: `codex/editor-r1-1c`.

Why: the numeric text-and-box entrance needs a usable hold and exit, with the same
behavior in authoring, rehearsal and exported runtimes.

Goal: permanent Out, Set Out at the playhead, empty/manual/reverse exits and an
interruption policy that starts from the rendered pose. Source remains authoritative.

Decisions: preserve arriving cue sides; expose explicit Out inspection for manual
keys, including its zero frame. Empty exits cut instantly. Out keys may extend the
exit; no duration form or trim handles. Boundary movement preserves absolute exit
key times and refuses any move requiring curve splitting. Reverse is an explicit
choice beside Set Out, with independent copied keys and correctly mirrored eases.
Escape retains the chosen boundary and adds no keys. Boundary and reversal are
separate completed operations, each one undo transaction. No new automatic timer.

| Contract / acceptance portion | Observable result and atomic refusal |
|---|---|
| D01 / B13 permanent and empty Out | One-step In is read without mutation and displays a distinct empty Out. Supported preview runs a transient upgrade; save/export materializes it and upgrades the owned interpreter; reopen is idempotent. Foreign interpreters remain preserved with an explanation. |
| D01 / B05/B13 Set Out | Frame-snapped effective time converts through speed. Earlier than the last In key, crossing spans/exit keys, unknown data, calls/machine ownership or unsupported curves refuse without source/history changes. |
| D01 / B13 reverse/manual | Adjacent keyboard-accessible prompt at all three layouts; No/Escape adds no keys, Yes copies mirrored keys with destination easing. No outside click chooses Yes. Manual zero/end keys use the ordinary numeric controls. |
| D02 / B07/B13 interruption | At 40% In, synchronous before/after positions differ by less than 1 px and opacity by less than .01. Capture before resets, retain leading delay, tween to final exit keys with speed/ease; settled exits retain waypoints. Repeat coalesces, replay resets, unseen layers stay hidden, final exit clears. |
| D04 / B05/B06/B13 preservation | Numeric keys, explicit/disjoint spans, inherited channels, held arriving/departing sides, FPS, speed and stored times survive. Unsupported movement refuses atomically. |
| E12 / B03/B05/B13 transactions | Cancellation, one undo per operation, redo, durable save/reopen and executable SPX/CasparCG/OGraf agree. User code outside owned animation remains byte-identical. |
| B02/B04/B11 regression | R1.1b, Hairline/Quiz, wording and immediate appearance, Play/Pause, Space/pan, desktop 1920x1080, laptop 1366x768 and 1093x614 (125% equivalent). |

Non-goals: R1.1d trim handles and nested identity work; Step/Next and cross-cue
authoring; full easing/multi-key tools, loops authoring, advanced tools, default
editor switch, whole-row acceptance, physical devices or receiving-host claims.

Verification: reproduce first; repository-queued browser jobs, rendered review,
mapped affected suite, build, `/check`, then `/queue-merge` and deployed revision.

## Reproductions and implementation

The baseline queued run `j-2134` reproduced the missing Set Out control, the
one-step entrance replaying as Out, and a 540 px interruption jump. That baseline
sample was 0.4 seconds into a two-second cue. The final test samples 40% of the
whole In cue (0.8 seconds), and checks both text and box before/after dispatch.

`j-2140` exposed repeated legacy stop commands cancelling the exit's final hide.
Object-target property setters now retain exit motion and cleanup across those
commands, including silent seeks. `j-2142` reproduced unseen layers being revealed
by normal Out visibility gates; `j-2143` verified the fix and retained leading delay,
final-key interpolation and repeat behavior. The same run reproduced selection of
a derived one-step Out dereferencing an absent source step. `j-2144` passed all 17
focused tests after its fix, including the complete controls-and-drag entrance.

`j-2149` reproduced old one-step Out failing before its first save. The preview now
derives its runnable empty exit on a transient copy, matching supported exports.
Read-only source remains unchanged. Save materializes it once. Foreign interpreter
bodies and unknown animation data remain untouched. Interpreter matching uses the
frozen PR #469 body, not a capability comment that custom code could retain.

Inline review also corrected the playback clock when Out replaces an active In,
refused reversal over authored exit visibility, shared the lossless source reader
with save/export migration, and carried the inspected cue through pose guards and
numeric/opacity drafts. Unsupported reversal eases and changed later-cue poses
refuse without committing a partial result.

`j-2154` reproduced five additional edge cases: a legacy interpreter with appended
custom code being replaced, an off-grid playhead remaining past its snapped Out,
Play after a completed exit replaying Out, a known two-cue predecessor failing its
read-only Out, and outside-root cleanup extending an empty exit by 0.3 seconds.
Exact region matching now refuses extra source; the shared migration runs in
preview/save/export; empty cleanup has zero duration; transport resumes its live
exit or replays In after completion. The snapped clock retains the arriving side. `j-2159` then reproduced redo restoring
the unsnapped clock; that case passed in `j-2160` after the snapped side moved into the transaction
view snapshot.

The first build exposed five architecture violations from importing the emitter
directly into preview/store/export. A pure blocks migration now owns that pairing,
with one narrow documented preview-composition edge; dependency checks pass.

## Verification scope

`j-2141` passed all 14 R1.1b cases and all nine usability cases. Two Out checks
failed there: a stale test pose wait and an OGraf host-margin expectation. The
checks now await rendered time/cue and measure relative to the graphic root.
`j-2144` passed all 17 focused Out cases. The 40% synchronous jump bounds are
less than 1 px and .01 opacity for both layers in simulator, SPX, CasparCG and
OGraf. The tests also check final hiding, repeated Out, replay, normal exit,
leading delay, intermediate-waypoint bypass and unseen visibility.

The full affected run `j-2150` completed with 1,009 passes, 545 skips and one new
clock-test failure. Its fake clock was still advancing during interaction under
load; explicitly pausing it fixed the test. Its later focused runs pass. All
other application regressions passed, including the 26 artwork editing cases.
The appended catalog calibration suite passed all 35 cases and four baseline
checks, including rendered equivalence.

`j-2155` repeated all 14 R1.1b and nine usability cases successfully. `j-2162`
passed the 21 core Out cases, including the final off-grid undo/redo, pause/resume,
legacy read-only playback and outside-root cut fixes. Its two wizard cases failed
on test setup assuming group opacity controls; the corrected two journeys passed
in `j-2164` (23 Out cases covered in total). Setup was corrected against the
rendered UI, without replacing the wizard result's source.

The real wizard proof imports [out-text-box.svg](../../../e2e/fixtures/out-text-box.svg),
clears its generated fade through ordinary controls, keys a named box group's X
and live text's X/opacity, then holds and runs both reverse and manually authored
Out. It checks executable self-contained export poses, source/field preservation
and durable save/reopen. [Reverse](built/wizard-reverse.png) and
[manual](built/wizard-manual.png) frames were opened and inspected: the text stays
inside the amber box at the held pose. This fixture uses currently addressable
named groups and bound text. Bare SVG shapes, nested discovery and group appearance
controls are not claimed by this proof and remain in R1.1d's richer fixture.

The layout matrix covers 1920x1080, 1366x768 and 1093x614 (125% equivalent).
Rendered choice/hold frames are in [built](built/). The popover stays adjacent to
Set Out, fits the viewport and leaves the canvas geometry unchanged. Keyboard
invocation, Tab/Escape/focus return, separate boundary/reverse undo transactions,
redo, manual exit extension, cancellation and durable reopening are executable.

Catalog source recordings `j-2146` and `j-2156` change only JavaScript fingerprints for 528
variants. HTML/CSS fingerprints and the render baseline are unchanged.

## Check review and simplification

Review ran inline against merge base `ffd7a3ec5a560e719f18517b0af8b7d2f31eb002`.
Eleven confirmed finding groups were fixed: repeat-stop cleanup, unseen-layer gates,
derived Out indexing, transport clock/resume/replay, unsafe reversal ownership,
cue-aware pose guards, legacy preview migration, custom interpreter tail preservation,
off-grid history, empty outside-root cleanup and illegal dependency edges.

Simplification ran inline: reuse the lossless animation reader, keep migration in
one pure blocks helper shared by preview/save/export, delegate span upgrades to the
same exact-body writer, and reuse the preview controller's existing single request
queue. The frozen PR #469 interpreter was compared byte-for-byte after newline
normalization. Its 41 historical em-dashes are recorded in the copy baseline because
changing that recognition fixture would break safe migration; no new emitted copy
uses the frozen body.

Verification ran inline through the repository queue. The final full catalog battery
is `j-2166`: type-floor, overflow against baseline, field coverage, numerals, catalog
specs/baselines, factory and Hairline/Quiz taste frames. `j-2165` failed only its runner's
readiness probe (127.0.0.1 versus the server's localhost bind); the corrected runner
owns and stops only its own dev server. Final build, check stamp and landing are
recorded on the exact committed tip by the check/merge workflow.

Final catalog result: `j-2166` passed type-floor (526), overflow (528, no baseline
regressions), field coverage (526; fields in 105 variants explicitly undriven),
numerals (349), calibration (35 tests), source/render baselines (four tests) and
factory (317/317 candidates plus 12 kits). The render baseline was not updated.
`npm run build` on implementation tip `076d7520` exited 0: 1,900 tests passed,
three skipped, with TypeScript, lint, dependency, bundle and after-build gates green.
The final evidence-only commit is rebuilt before its check stamp and landing.

### Rendered taste review

All six [Hairline and Quiz frames](taste/) from `j-2166` were opened: default/long
holds and Quiz's default/long revealed answer. This reviews regression appearance
on the prescribed grey bed; it does not close receiving-host or owner acceptance.

| Question | Answer and observed evidence |
|---|---|
| Hierarchy | YES: Hairline's name leads its quieter role; Quiz's question leads before reveal and the correct answer leads after it. |
| Composition | YES: Hairline shares one left edge beside its rule; Quiz's question and evenly spaced answer plates stay within the panel. |
| Restraint | YES: each uses one amber accent with neutral type and backgrounds; Quiz's reveal highlight has a clear state purpose. |
| Coherence | YES: type, rule/plate weights and amber state treatment remain consistent within each graphic. |
| On-air quality | YES for these reference frames: clear contrast, readable type and stable placement; real footage and receiving hosts remain unverified. |
| T1 Centred | YES: the Quiz question is centred in its header area and labels sit centrally in their chips; Hairline is intentionally left aligned. |
| T2 Inside | YES: long names, role, question and answers retain every glyph within their allotted space. |
| T3 Aligned to graphic | YES: text follows its rule or padded answer plate, with consistent shared edges. |
| T4 Grows as implied | YES: Hairline extends right from its fixed anchor; Quiz keeps fixed plates and fits the longer question without moving the answers. |

## Remaining acceptance and R1.1d handoff

Keep every whole E/B row open. This is scoped engineering evidence, not owner
acceptance or a default-editor switch. Physical 125% displays, receiving hosts,
production performance, two-user discoverability and full workflow acceptance
remain unverified. Next interruption, loops, arbitrary foreign runtimes, full
Bezier splitting/rebasing, grouped Position conversion, precision scrubbing,
full property rows/shortcuts and cross-cue/multi-key tools remain later slices.

Start R1.1d from updated main containing this slice. Read this receipt, the
September 27 artwork/usability corrections, D03/D04 and the acceptance register.
Use the actual wizard's Illustrator-style SVG result with live text, named nested
groups, translated/rotated/scaled parent, image/logo, gradient and clipping.
Record source and rasterized baseline before editing. Do not replace that result
with a convenient editable scene or mark nominated elements unsupported merely
because an adapter is missing.

Add span trim handles as their own operation: change only visibility intervals,
retain clipped keys and source ownership, enforce bounds/minimum duration and
atomic refusals. Preserve arriving/departing held sides and Out interruption.
Prove body move versus trim separately, including static/disjoint spans, inherited
motion, nested coordinates, cancel, one undo per gesture, redo, save/reopen and
executable exports. Preserve viewBox/aspect ratio, stacking, masks/clips,
definitions/references and sibling appearance. Stable collision-free IDs land on
first committed edit without changing read-only imports. Keep Next/cross-cue,
full easing/multi-key and advanced tools out; use /check and /queue-merge again.
