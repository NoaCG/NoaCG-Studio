# E1 acceptance inventory

The product baseline is main `361cb6f628df0a44d410954aae527cde976d1750`. This
inventory follows the [finalized scope](https://github.com/NoaCG/NoaCG-Studio/blob/f0f2e3fe0c2cc14e23b171957b6f8d18905fd434/docs/work-specs/editor-r1-5/spec.md),
the [editor plan](../../EDITOR_PLAN.md) and the [acceptance register](../../research/editor-acceptance-register-2026-09-17.md),
including its later owner corrections. E1 through E7 and OW1 are run phases. E01
through E25 are requirement IDs. A receipt applies at the source and in the
environment it names. The baseline column identifies which current path can be
checked. The status column records what remains on that path.

## Receipt and environment keys

- **R1** is the [scoped implementation sequence](../../EDITOR_PLAN.md#completion-and-continuation).
  Its R1.0 foundation is at `cfb28e74`. Specific receipts below use the source
  and test pins linked from their work specs.
- **Fidelity** is [R1.1d](../../research/editor-r1-1d/README.md) in the
  [register's fidelity and trim entry](../../research/editor-acceptance-register-2026-09-17.md#r11d-scoped-fidelity-and-trim-receipt-2026-09-27).
  **Motion** is the same register's [R1.1b/c and R1.2a entries](../../research/editor-acceptance-register-2026-09-17.md#r11b-scoped-engineering-receipt-september-27).
- **Tools** are the register's [R1.2b.1 through .7 entries](../../research/editor-acceptance-register-2026-09-17.md#r12b1-scoped-canvas-transform-tools-receipt-2026-10-01),
  covering static anchors, type, images, Pen, arrangement, groups and folders/bins.
  **Layers** is [layer/property qualification](../editor-layer-property-qualification/README.md),
  including measured browser zoom and its short-canvas limitation.
- **Oct2** is the [October 21 single-device closure](../editor-leave-reliability/scoped-closure/README.md)
  on product `12eccdd8533ba710f0917cb3bcc78101070ecca8`. **Oct3** is the
  [#2294 independent closeout](https://github.com/NoaCG/NoaCG-Studio/pull/2294#issuecomment-6723373701)
  on the exact baseline above. Keep the original cumulative journey, cloud
  readback, native picker/download, 125% zoom, save/reopen and browser export
  results at their demonstrated scope. The original shared-lab module-load,
  concurrent-save, degraded-storage, pristine-baseline, nightly, controller
  and queue failures retain their historical verdicts. October's recovery
  scope and deferrals remain in force.
- **W** means an owned Windows Chromium context, actual browser 125% zoom and
  native file picker/drop/download where applicable, with isolated test accounts.
  Headless or offline fixture results are scoped engineering evidence. **B** is
  a maintained browser/fixture check. **M** is browser/CLI with isolated fixtures
  and existing authorized model access. **P** is a local isolated account with
  disposable production. **U** is first-time users and moderator on named
  desktop and laptop, actual browser zoom and executed reference. **H** is an
  actual clean receiving host/version with an operator, including Linux for #775.
  **O** is the owner and a written record. **CI** is the queue, independent
  exact-merge checks and intended deployment.
- **Open** is an unfulfilled proof requirement. **Scoped** preserves a limited
  existing receipt and still requires the named check. **Gap** has direct
  code/issue evidence or a local reproduction and still requires closure.
  The [E1 notes](e1-notes.md) carry current-source results and their limitations.

## Entry, source, canvas and everyday authoring

| Requirement and subcriterion | Phase | Existing receipt/revision | Applicability on pinned main | Remaining check | Env | Status |
| --- | --- | --- | --- | --- | --- | --- |
| B01 / E01 / D05. Catalog Finish/Edit and direct Finish to production use the same final document | E1 | R1.0, R1.1a | One Alpha editor; earlier flag route superseded | Compare final source, fields, assets and samples; Edit adds no rundown item | W | Scoped |
| B01 / E01. Illustrator SVG import, Edit without Advanced, select title, Home and reopen the intended saved document | E1 | R1.1a, Fidelity, Oct2, Oct3; j-4998; [j-5042 owner walkthrough](e1-notes.md#november-10-windows-file-checks) | Wizard and Alpha entry current | Saved record readback, title selection and applicability of the native import receipt after reconciliation | W | Scoped |
| B01 / E01. Catalog graphic from fresh default entry and a saved graphic return | E1 | R1.1a, Layers, Oct3 | Catalog and Home current | Record all entry/return paths and durable reopen | W | Scoped |
| B02 / E02 / D05. Nested and overlapping selection, marquee/multi-select and consistent canvas, Inspector and timeline | E1 | R1.0, Fidelity, Layers | Alpha selection controls current | Exercise nested and overlapping Illustrator and catalog layers | W | Scoped |
| B02 / E02 / E07. Lock/unlock, visibility, rename, same-parent reorder, layer folders | E1 | Layers, Tools .7 | Current product, prior bounds apply | Verify order, source labels and eye, lock, navigation and no visual/timing effects from folders | W | Scoped |
| B02 / E07 / G08. Group and ungroup, nested member edit, transforms, local ruler, parent-bar movement and trim | E1 | Tools .6-.7 | Groups are in R1; reusable instances excluded | Preserve member pose/keys/fields; only root flags own holds; exact undo/export | W | Scoped |
| B02 / E06 / E07. Asset bins, references, empty bins and safe rename/removal | E1 | Tools .3/.7 | Current asset model | Move and rename without losing bytes or fields; verify stale refusal and undo | W | Scoped |
| B03 / E04 / D03. Catalog flow layout offset +40 px | E1 | R1.1a/b, Motion | Labelled base offset | Compare numeric/drag result, sibling layout and unchanged motion | W | Scoped |
| B03 / E04 / D03. Nested SVG parent translate (100,80), rotate 30°, scale 2; zero and negative axes | E1 | Fidelity, Tools .1, Layers | Parent mapping available on supported layers | Compare numeric and drag, base/armed axes and save/reopen/export with zoom/Shift/Alt | W | Scoped |
| B03 / E04. Position, Scale, Rotation, Opacity and static Anchor, linked/unlinked, multiple turns | E1 | Motion, Tools .1, Layers | Supported base/animation channels; Anchor is static | Confirm numeric/canvas agreement, center/type/drag moves only pivot, exact cancel/undo; note turns display | W | Scoped |
| B03 / E04. Animated anchor and SVG anchor on required artwork | E1 | Tools .1, editor plan R1.2; [ordinary anchor verification](e1-notes.md#ordinary-layer-anchor-verification); [group geometry findings](e1-notes.md#svg-group-paint-findings) | Keyed HTML box and ordinary imported SVG text passed. Legacy group paint adds a moving fill-box origin to the cached pivot. | Resolve the legacy first-enable rule. Then verify keyed group geometry, source, cue transitions and exports. | W | Ordinary layer pass, keyed group blocked |
| B03 / B04 / E04 / E05. Placed text box side handles reflow, corners scale | E1 | Tools .2 | Text boxes, existing motion preserved | Verify no sibling/text distortion and exact undo | W | Scoped |
| B04 / E05 / G04. Change title, bundled face, size, fill, real weights, spacing and fit | E1 | Tools .2, Layers, #1749; [rotated plate measurement](e1-notes.md#rotated-text-plate-measurement) | SVG alias correction and rotated Illustrator alignment controls on candidate | Keep source and preview/export results on final reconciliation; retain intentional centered text snap | W | Scoped Windows pass |
| B04 / E05. Italic, case, shadow, outline and canvas typing | Later typography work | [Editor Plan E05](../../EDITOR_PLAN.md#completion-and-continuation); [R1.2b.2 owner scope](../../research/editor-r1-2b-2/README.md) | The owner deferred these controls. The E1 typography task still covers content, basic type and colour, supported weight and spacing, long-text fit and text-box sizing. | Carry the deferral and verify the supported controls in E1. | W | Deferred by owner |
| B04 / E06 / G04. Text/rectangle/ellipse creation, square/circle constraint, real text field and no decorative duplicate | E1 | R1.1a, Layers | Current canvas tools and source bindings | Create, cancel, undo, edit field and compare exported bindings | W | Scoped |
| B04 / E06 / G04. Native file chooser and OS drop, image creation and logo replacement | E1 | Tools .3, Oct2 native import; [j-5042 SVG picker/drop and SPX download](e1-notes.md#november-10-windows-file-checks); [j-5060 owner raster drop](e1-notes.md#maintained-authoring-observations) | Native SVG check on `be049c7ea`; native editor raster drop on `24439f46f`; image and replacement browser assertions in j-5057 | Preserve distinct native and browser receipts and verify affected source after final reconciliation | W | Scoped Windows observations |
| B04 / E06 / G04. Pen corners/curves, open/closed paths, tangent editing and cancellation | E1 | Tools .4 | Supported M/L/C/Z geometry | Draw and edit on catalog and transformed SVG parent, one undo, verify exported artwork | W | Scoped |
| B04 / E07 / G04. Duplicate/delete/reorder, six align edges, equal spacing, keyboard nudge/resize | E1 | Tools .5, Layers | Current tools on eligible selections | Test parent/scope ownership and input/timeline shortcuts, compare exact source and output | W | Scoped |
| B04 / E12 / E16 / E20 / E21. Source, gradient/mask, assets, field IDs and samples across edits and export | E1 | Fidelity, Tools, Layers, Oct3 | Required preservation; R2/R3 authoring excluded | Verify unchanged unrelated source and field identity on both cumulative tasks | W | Scoped |
| B11 / E03 / E17 / D05. Fit/zoom/pan, panels, ruler, escape and focus | E1 | R1.0, Layers, Oct2, Oct3 | Alpha layout; earlier tight zoomed canvas and old route retained as history | Reach editing controls at actual 125%, record viewport and cancel/focus behavior | W | Scoped |
| E12 / D05. Atomic history, cancel/stale refusal and preview generation, asset-byte checks | E1 and each consuming phase | R1.0 registry, Layers, Oct2, Oct3 | Single-device source and revision protection | Compare source, history, preview, save/readback/reopen and exported pose after actual edits | W | Scoped |

## Timing, easing, flags and trim

| Requirement and subcriterion | Phase | Existing receipt/revision | Applicability on pinned main | Remaining check | Env | Status |
| --- | --- | --- | --- | --- | --- | --- |
| B05 / E08. Position and Opacity arm, first/last key, disable at interpolated pose, previous/next and diamonds | E1 | Motion, Layers | Current controls and per-channel ownership | One first key at frame 12, second at 20, disable at 16 without pose jump, undo restores both; grouped/separated and mixed axes | W | Scoped |
| B05 / E08 / E10. Title X −80→0 and opacity 0→1, outgoing Easy Ease Out, retime to 0.8 s | E1 | Motion | Supported channel/curve paths | Scrub both ways, move/cancel/undo/redo/save/reopen/play export | W | Scoped |
| B06 / E09. Key marquee/modifier selection, retime/nudge/snap and occupied-target refusal | E1 | Motion, Layers | Batch editing current | Two X keys, across rows, frame nudge and bypass; no source/history changes when refused | W | Scoped |
| B06 / E09 / #774. Copy/paste selected keys | E1 | #774; j-5046 reproduced; j-5050 and j-5051 passed | Timeline keyboard copy and paste use the existing session transaction | Carry the rendered, state and source checks through final reconciliation and independent review | W | Scoped |
| B06 / E10 / G01. Multi-key easing, mixed states and exact Hold/jump | E1 | Motion, R1.2a.2 | Current sampler, preset UI and runtime | Dropdown/menu/keyboard parity, exact boundary and reverse/split dense samples, unchanged opacity and atomic refusal | W, B | Scoped |
| B06 / E10 / G01 / #774. Agent easing guidance and clip-path split | E1 | #774, Motion; [operation and guidance check](e1-notes.md#agent-easing-and-clip-path-splits); j-5059 and j-5061 | Agent guide covers key sides, supported curves, Hold and jump; both editor controls refuse a crossed clip-path string with unchanged source/history | Retain this exactness guard in final verification | W, B | Scoped Windows pass |
| B06 / B13 / E09 / E24 / D04. Bar-body moves with keys; trim affects only disjoint visibility spans | E1 | Fidelity, Motion | Current authored trim and legacy read-only/upgrade rules | Cross-cue, static/no-key, inherited motion, undo/refusal, seek and emitted holds | W | Scoped |
| B07 / B13 / E11 / E24. Permanent Out, empty/manual/reverse and prior saved source upgrade | E1 | Motion, Layers | One Alpha editor with Out | Author frame 0/25 text+box, reverse/manual, save/reopen, match preview/export; no In replay on empty Out | W | Scoped |
| D01 / B13. Flag placement, held side, Set Out timing and legacy interpreter identity | E1 | Motion | Current owner correction, older supported source | Insert flag at playhead, preserve curve and carried cue, compare save/reopen/export without changing unrelated source | W | Scoped |
| B07 / B13 / E11 / E24. Two reveals, hold, Next and updates | E1 | Motion | Current sequence and timed graphic paths | Add Step at playhead, snap next bar, animate, hold/Next/Out, update during motion/hold without firing effects on scrub | W | Scoped |
| D02 / B07 / B13. Non-loop live-pose Out and replay | E1 | Motion | Current authored and supported legacy exit | Out at 40%, <1 px and <1 percentage point dispatch jump, earlier-step and last-step policies, zero-time keys, finite hide/replay, foreign source unchanged | W, B | Scoped |
| G02 / B05 / B13. Arriving/departing key edits at a Step | E1 | Motion R1.2a.4 | Current cue-side policy | Off-frame flag at 30 fps, held vs revealing layers, atomic mixed writes and no early reveal | W | Scoped |
| G03 / B02. Anonymous and duplicate SVG identities | E1 | Fidelity, Layers | Mint identity on first committed supported edit | Verify exact cancel/undo/redo, no ID on inspect, references/masks/keys/fields survive reopen/export | W | Scoped |
| G05 / B13 / E24. Effective frame/second ruler | E1 | R1.0, Motion | Current non-loop ruler | 25/30 FPS and .5/1/2 speed, same ticks/cursor/input/flags, no key retime on unit toggle | W | Scoped |
| B13 / E24 / #774. Flag label legibility and Set Out prompt | E1 | #774; j-5046 reproduced; j-5050 passed | Labels fit between their authored markers; Out at zero remains operable | Carry the ruler check forward and verify the Set Out prompt and actual zoom in the final walkthrough | W | Scoped |
| B03 / #774. Rotated text alignment after Illustrator import | E1 | #774; j-5048, j-5058, j-5059 and [j-5061](e1-notes.md#rotated-text-plate-measurement) | The transformed foreground plate covers 34.5679% of the frame, below the existing 70% full-frame threshold. Its alignment controls now appear. The existing centering rule accounts for the 3.25 px shift. | Retain fixture and unchanged fitting checks through final reconciliation. | W | Scoped Windows pass |
| B07 / B13 / B14 / E11 / E19. Property and layer repeat/yoyo with own ruler | E2 | Motion runtime/parity receipts | R1 HTML/SVG; Lottie and sequences excluded | Test deterministic reverse seek, boundaries, hold, interruption, replay, finite Out and legacy preservation | B | Open |
| D02 / G05 / #774. Loop stop on state exit, repeatable settling and supported running speed changes | E2 | #774; prior R1.2a parity | Requires loop fixture and independent local clock | Assert state exit stops loop, repeatable settle, no discontinuity on supported speed changes; preview and export | B | Open |

## Assisted editing, projects, receiving and adoption

| Requirement and subcriterion | Phase | Existing receipt/revision | Applicability on pinned main | Remaining check | Env | Status |
| --- | --- | --- | --- | --- | --- | --- |
| B17 / E23. Manual and shared UI/CLI operations against selected document | E3 | [Command qualification](../editor-command-qualification/README.md) | Six commands scoped; paired live MCP is R3.2 | Compare UI/CLI source, history and render, with supported external-tool access | M | Scoped |
| B17 / E12 / E23. CLI package import, visual edit, save/reopen and exports | E3 | [CLI round-trip](../editor-cli-round-trip/README.md) | Maintained bounded scoreboard task | Run isolated fresh import/edit/readback, retain unrelated source, fields/assets and history; rehearse browser outputs | M | Scoped |
| B18 / E22. Free/basic grounded help, BYOK and external-tool access | E3 | [Model proposals](../editor-model-proposals/README.md) | Existing authorized routes only | Prove correct context, supported access, quota/timeout and offline fallback | M | Open |
| B18 / E12 / E23. Reviewed proposal, preview/accept/cancel/undo, invalid and stale refusal | E3 | Model proposals, Command qualification | Existing editor proposal path | Correct document and selection, atomic refusal, preserve source/fields and separate quality from deterministic parity | M | Scoped |
| B18 / E22. Real-model task quality | E3 | Model proposals, six bounded provider requests | Historical provider proof stays at its scope | Execute same tasks on existing authorized route and measure independently | M | Open |
| B08 / E13 / E14 / G06. Choose Starter collection and three items, choose/create and apply brand without code | E4 | Editor plan R1.4, register ownership evidence | Current project and Starter paths | Use tested registry revision; customize one item, maintain untouched graphics | P | Open |
| B09 / E13 / G06. Brand undo/redo, reapply after local override | E4 | Editor plan R1.4 | Current brand application path | Verify visible logo and source; explicit reapply keeps title-colour override and untouched graphics | P | Open |
| B19 / E25 / E12. Independent durable graphic edits/history and Home reopen | E4 | Oct2, Oct3; register document-port evidence | Same-device authoring, one active tab | Lower third and intro, independent drafts/history, reload, save/rename/removal/migration/failure preserve records | P | Open |
| B08 / B10 / B19 / E15 / G06. Install into two rundowns, interrupted install retry and rollback conflict | E4 | Register R1.4 ownership evidence, Oct3 | Disposable productions, shared registry | Select subset, retry no duplicates, visible conflict, on-air copies unchanged until explicit replacement | P | Open |
| B08 / E16. Operator data, In/Next/Out and candidate output staging | E4 | Oct3 browser scope | Existing production/graphic output paths | Rehearse disposable rundown, stage exact export, font/logo, expected output and host checklist | P | Open |
| B01–B11 / B13 / E03 / E17. First-use imported-SVG and Starter-to-rundown journeys | E5 | Oct2/Oct3 and E1–E4 receipts at their scopes | Actual participants and moderator pending | Two or three participants, one minute per ordinary edit and five minutes each for keyframe and collection tasks, individual errors/assistance | U | Open |
| B11 / E03 / E17 / D05. F4 performance and rendered layout | E5 | R1.0 harness; Layers native zoom limit | 30 layers/300 keys; current product | Selection ≤100 ms, feedback ≥30 Hz, no freeze >100 ms, final pointer-up ≤150 ms; distribution/frames at 1366×768 and 1920×1080, actual 125% | U | Open |
| R1.5. Comparable tasks against Studio, release-critical corrections and walkthrough | E5 | [Reference contract](../../EDITOR_PLAN.md#baseline-closure-and-acceptance), pin `3142fc7d02934494931eb14e7dc255393e4110d0` | Old source/run receipts scoped | Execute same tasks on same machine, exact versions/differences; Stable separately if material; rehearse both workflows and stage handover | U | Open |
| B10 / B17 / E16. Real CasparCG, named OGraf renderer and any other claimed hosts | E6 | Oct2/Oct3 browser scopes; [previous SPX host walk](../../SPX_ON_A_REAL_SERVER.md) | Candidate hosts need new proof | Clean host, versions, bundled logo/font, data/In/Next/Out, interruption/replay/parity and actual output; off-air qualified operator | H | Open |
| #775 / B10 / E16. Linux long-text fit | E6 | [Open report](https://github.com/NoaCG/NoaCG-Studio/issues/775), current Windows scope | Linux CasparCG/OBS issue, Windows fit alone insufficient | Reproduce on Linux and measure applicable named receiver; retain Windows evidence separately | H | Open |
| G07. Rights, provenance, notices and redistribution | OW1 | [E1 GSAP inventory and vendor draft](gsap.md) | GSAP 3.15.0 candidate paths traced; written disposition pending | Review exact clean candidate bundles, licence text/date, retained notices, no third-party AGPL helper/runtime in CLI/shared closure or outputs | O, CI | Open |
| R1.5. Candidate-specific workflow and adoption decision | OW1 | October disposition and E1–E6 receipts, when complete | Editor remains Alpha | Owner reviews both rehearsals, host and first-use receipts, candidate limitations and written rights disposition; record explicit decision | O | Open |
| R1 adoption. Preserve routes, saved data, runtime and rollback | E7 | Candidate-specific OW1 approval, when recorded | Dependent gate | Implement approved Alpha-to-release change, independent exact merge and intended live verification; requalify material changes | CI | Open |

Monaco (B12/E18), R2 gradient/mask/effect authoring and clips (B14/B15/E19/E20),
R3 structured live data and paired MCP (B16/B17/E21/E23), P-GPU (B20), P-WEBMCP
(B21) and P-COMP are excluded. Their applicable R1 preservation obligations
remain in the assigned rows above.
