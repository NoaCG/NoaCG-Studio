# R1.1a: base artwork edits

Implementation branch: `codex/editor-r1-1a`, based on fetched `origin/main` at
`15b8f3fc` (includes the R1.0 implementation and handoff merge). Date: 2026-09-20.
This is a branch review, not a deployment or owner usability verdict.

## Walkthrough

1. Run `npm run dev:worktree` in this branch and open the printed URL at `/app#/new`.
   Browse templates, search Hairline, skip to Finish, then choose **Edit this graphic**.
   The primary Add to production route still works; Edit adds no production or library item.
2. Select Name in the timeline. Set **Layout offset X** to 40. Its sibling stays still.
   Drag Name on the canvas, press Escape, then try a completed drag and Undo/Redo.
   Existing animation remains in the document and still scrubs.
3. Choose Rectangle or Ellipse and drag; hold Shift for a square/circle. Choose Text and
   click for point text or drag for a text box. Each addition selects its layer and shows
   its read-only bar. The text has a real operator field. Box width reflows text; Scale
   changes artwork size. Corner handles scale around the opposite corner, Alt around
   the existing anchor, and Shift temporarily reverses the Link proportions setting.
4. Import `e2e/fixtures/illustrator-lower-third.svg` through the wizard and choose Edit.
   Select an SVG text layer and change Position in its parent coordinates. Existing SVG
   bytes, fields and motion remain intact. Add text outside the imported SVG subtree.
5. Save, return Home, reopen, then inspect the graphic. Existing editor remains available
   for the broader controls and export UI. SPX, CasparCG and OGraf export checks execute
   the edited graphics and update the new operator field.

## Scope and implementation

`SpxTemplate` remains canonical. The shared registry now supports `base.set`,
`box.resize` and `layer.create`, using the existing placement, text-field and CSS writers.
No second scene model or persisted format was added. The canvas previews a transient
stylesheet with document/revision/request correlation; pointer-up commits one operation
batch and one undo entry. Source edits reuse the live iframe when only CSS changes.
New layers live directly under the graphic root, outside existing panel masks. The first
render inspection reproduced invisible additions under Hairline's clip-path entrance;
the final adapter preserves that entrance and makes new artwork visible outside its panel.

Flow text uses a labelled relative Layout offset; placed layers use their wrapper;
SVG base translation and scale use independent CSS properties so animation keeps
ownership of `transform`. Parent matrices map canvas deltas into source coordinates.
Ambiguous identifiers, unsupported placement and singular parents are refused.
Collapsed scale axes remain editable numerically.
When a selected layer already owns scale animation, the inspector explains why base
Scale is unavailable and omits its handles. An SVG element with its own animated
position also stays with the existing animation controls. These are explicit adapter
boundaries, not rewritten motion tracks; parent motion remains supported. Full transform
composition/arming is later work. Authored panel masks remain effective when moving flow
text; an offset beyond its original mask can still be clipped.

The shared placed-element writer also fixes multiline SVG insertion: it balances complete
tags and splices after the artwork, preserving its original bytes. The regression was
reproduced by a failing original-SVG comparison before changing the writer.

## Verification

The mapped browser tests cover both wizard routes
for catalog/Illustrator/quiz/timer/growing-layout results; +40px flow offset; transformed
SVG parent coordinates; cancel/history; point and box text; constrained shapes;
linked/unlinked, negative/zero scale and Shift/Alt; save/reopen and executable exports.
Export files are served as binary bytes, including bundled fonts, and their rendered
geometry is compared to the editor rather than just checking CSS declarations.

The affected integration plan from the actual fork point, `15b8f3fc`, passed in
`j-1466`: 991 browser tests across 96 specs, followed by all 35 catalog calibration
and containment checks. This covers wizard entry/shell/Finish, saved documents,
SVG import, text tools and export regressions. Final focused checks also cover the
subsequent editor-only geometry and preview fixes.

Two additional reproductions tightened the implementation: glyph bounds initially
hid the editable text-box width, and native-rate drag input invalidated every reply
before the selection could use it. Wrapper bounds now represent placed boxes;
the preview allows one correlated request in flight and coalesces unsent pointer input.
Laptop render inspection also caught a newly created layer falling below the visible
timeline rows. Selection now scrolls that row into the local timeline viewport, keeping
the page and horizontal time range still.
GSAP's cached independent transforms are rebuilt when base transforms change, and pose
reset restores authored SVG transform attributes as well as inline styles. Repeated scale
edits after reopen, nested SVG parent mapping and scaled export geometry have dedicated
checks. Canonical animation code remains unchanged by base edits.

The final focused run, `j-1485`, passed all 34 tests (18 base-edit checks plus the
16 foundation/Alpha regressions). This includes stale source/asset replies, atomic
history, suppressed lifecycle callbacks, phone entry and recovery from broken source.

Production benchmark `j-1487` exited 0 on all nine fixture/viewport combinations.
The [raw receipt](latency-built.json) contains input/acknowledgement samples, frame
intervals, source and fixture hashes, the exact build stamp and machine information.
All recorded source hashes match the final application files.

| Fixture | CSS viewport | Drag p95 (ms) | Feedback (Hz) | Pointer-up (ms) |
|---|---|---:|---:|---:|
| Catalog | 1920x1080 | 22.0 | 59.4 | 46.8 |
| Catalog | 1366x768 | 21.3 | 59.3 | 45.6 |
| Catalog | 1093x614 / 125% | 21.3 | 59.3 | 46.8 |
| Illustrator SVG | 1920x1080 | 20.9 | 59.3 | 45.0 |
| Illustrator SVG | 1366x768 | 20.2 | 59.2 | 43.5 |
| Illustrator SVG | 1093x614 / 125% | 20.8 | 59.3 | 43.7 |
| F4: 30 layers / 300 keys | 1920x1080 | 26.9 | 59.1 | 45.8 |
| F4: 30 layers / 300 keys | 1366x768 | 26.6 | 59.2 | 46.9 |
| F4: 30 layers / 300 keys | 1093x614 / 125% | 28.2 | 38.6 | 44.9 |

Worst selection acknowledgement: 54.7 ms; largest feedback gap: 40.4 ms; largest
parent/iframe frame interval: 16.8 ms; no recorded long tasks or page errors. Every
case performed 90 native canvas mouse moves, proved a changed saved stylesheet, then
undid that entire drag in one transaction back to the exact original stylesheet.
This passes the <=100 ms selection, >=30 Hz feedback, <=100 ms freeze and <=150 ms
pointer-up gates. Timing is input-handler to correlated rendered geometry acknowledgement,
including postMessage, not physical display photon timing. Chromium 149 on Windows,
Ryzen 7 5800H, 16 GB RAM; 125% uses equivalent CSS viewport and device scale.

`npm run build` exited 0 on the final source: typecheck, lint, production bundle and
repository gates passed; 1,801 infrastructure tests passed with one documented
platform skip and zero failures. The build stamp is `2026-09-19T22:43:07.746Z` on
`codex/editor-r1-1a`. Its commit field is the branch's pre-commit base; the measurement
receipt hashes the actual source files to identify the tested uncommitted implementation.

Reproduction commands (run the measurement only after the build and browser checks finish):

```powershell
npm run build
npm run queue -- "node scripts/e2e-affected.mjs 15b8f3fc --focus"
npm run queue -- "node scripts/editor-foundation-bench.mjs --verify --base-edits" --cost 0.5
npm run queue -- "node scripts/editor-foundation-bench.mjs --measure --base-edits" --cost 0.5
```

## Rendered walkthrough

These are actual production-build screenshots, inspected at desktop, laptop and 125%.
Fit keeps the entire artwork visible; use the canvas zoom control for close detail work
on smaller screens. Inspector and layer lists scroll locally. Original fixture screenshots
are parked after undoing the measured drag so their authored masks and composition remain
visible. Tool screenshots show real completed additions.

| View | Desktop | Laptop | 125% |
|---|---|---|---|
| Catalog | [1920](catalog-built-1920.png) | [1366](catalog-built-1366.png) | [1093](catalog-built-1093.png) |
| New text and shapes | [1920](tools-built-1920.png) | [1366](tools-built-1366.png) | [1093](tools-built-1093.png) |
| Illustrator SVG | [1920](svg-built-1920.png) | [1366](svg-built-1366.png) | [1093](svg-built-1093.png) |
| F4 stress fixture | [1920](f4-built-1920.png) | [1366](f4-built-1366.png) | [1093](f4-built-1093.png) |

[Phone viewing, 390x844](phone-built.png) and [wizard Finish -> Edit](wizard-finish-built.png).
The Finish pane is scrolled to the optional action and its preview is settled before capture.
That targeted recapture passed as `j-1488` (`--capture-finish --base-edits`); it leaves
the completed `j-1487` latency receipt and application source unchanged.
This is viewport evidence, not a physical-phone or receiving-host verdict.

## Open gates

R1.0 owner usability acceptance and the original blank-stage report remain open.
This slice does not claim named receiving-host acceptance. New layers are static across
the existing timeline; key authoring, span/body moves, Out changes, playback, rotation,
anchor editing, grouping, Monaco and the default-editor switch remain later work.
The route remains Alpha, including the live shortcut and phone viewing.

Stop before R1.1b. The [owner review item](../../acceptance/owner-queue/2026-09-20-editor-r1-1a.md)
is deliberately unanswered.
