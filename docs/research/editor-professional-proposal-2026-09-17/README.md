# Professional editor proposal v2

2026-09-17. Design evidence only; no application implementation. Replaces the owner-rejected
first proposal. Source branch `codex/editor-baseline-design`, base `49a2f31e`; documents and
this evidence remain uncommitted for review. See `../../EDITOR_PROFESSIONAL_DIRECTION.md`.

## What can be tried

The inline proposal uses `editor-professional-workspace.html`. Drag the ruler/playhead,
the gold Position X key or the Out marker. Undo restores key and marker edits. Frame and
easing controls update the illustrative preview. Chat > Preview example edit performs a
predefined 12-frame entrance change, with one undo. Data sample name changes the preview
without rewriting the authored title. Take rehearses a hold; Manual Out or After hold exits.
The canvas remains visible when either dock changes. No Monaco integration is depicted.

The mock uses simplified transforms, a decorative loop and one selected text target. It is
not a Lottie player, actual model call, GDD editor, effect stack, export adapter or full source
transaction. Layout/Animate placement is proposed; this mock does not establish their full
property-authoring semantics. In particular, the visual lower-third moves as a unit. The
production implementation must meet the independent-layer/transaction contracts in the plan.

## Verification

- Queue j-1325 completed, exit 0; 19 recorded assertions pass and no page errors.
- Playhead/ruler -> time and visible pose; key drag independently retimes; Out marker retimes;
  both undo; AI example and undo; data sample vs design default; automatic exit completes.
- Checked dark widths 1366, 1920, 1024 and 320, plus light 1366 and AI dock 1366. No horizontal
  document overflow. Desktop root heights approximately 735 and 969 pixels. The standalone
  inspection wrapper adds outer padding; this is not a screenshot of the running NoaCG app.
  Narrow widths reflow vertically and are not a promise of full mobile animation authoring.
- First pilot j-1319 failed a real key-snapping assertion: a dragged key snapped to its own
  moving position. The laptop mock was also too tall. Fixed exclusion of the dragged target
  from snap candidates and reduced composition height; j-1320 passed. Narrow labels were shortened and j-1322 passed. The owner then supplied a Studio reference;
  chat moved left and Layers above Properties moved right. Exit keys became visible. j-1324
  passed; the final laptop height refinement is verified by j-1325. The final JSON and screenshots are retained.
- `git diff --check` passed. Repository build j-1323 exited 0: 1,798 tests passed, 1 skipped, zero failures; 121 test
  files and all bundle/post-build checks completed. No application source changed.

Owner acceptance is pending. These checks are not actual-editor usability/performance,
Lottie/AI/data correctness or Studio comparison evidence. M0 and implementation hold remain.

The supplied Studio screenshot is copied verbatim and hashed alongside the proposal. The
full Lottie player, effect stack, GDD/live feed and model/agent connection are required future
implementation, not working features in this mock. Exit and opacity keys are display-only
in the mock; the entry X key and Out marker are draggable.
