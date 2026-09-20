# R1.1a implementation brief

Base: fetched origin/main, 15b8f3fc (handoff merge), 2026-09-19.
Branch: codex/editor-r1-1a. R1.0 owner acceptance remains open.

Task: refine actual catalog and imported artwork through optional Finish -> Edit,
base placement, scale, and Text/Rectangle/Ellipse tools. Direct production stays primary.

Adapters: reuse placedLines/placeLine, addPlacedLine/addCatalogLine, field definition
and CSS writers. Add bounded SVG and flow offsets without rewriting motion transforms.
Registry operations own base position/scale, text-box geometry and layer creation.
Canvas owns transient gestures; PreviewController/runtime own revision-checked feedback;
session owns one completed transaction and exact cancellation/history.

Modules: editorFoundation Canvas, Inspector, operations, session, protocol, runtime and
PreviewController; blocks base editing adapter; wizard CreationWizard/FinishStep; app
opt-in routing. Existing SaveControls and exporters remain the save/export boundaries.

Failure cases: stale source/assets, ambiguous targets, singular/unsupported transforms,
competing positioning rules, canceled creation and interrupted gestures must refuse or
restore source and pose. Unknown source stays intact. No second persisted scene format.

Closing evidence: B01 catalog/SVG/quiz/timer/stretch Finish routes; B03/D03 +40 flow
offset with unchanged siblings/keys and transformed-parent inverse mapping; B04 text,
box text, rectangle, ellipse, Shift constraint, scale/numeric parity, fields and bars.
All include cancellation, atomic undo/redo, save/reopen and relevant exports. Mapped
browser checks and actual F4 drag measurements at desktop/laptop/125%; phone viewing.
Stop before R1.1b. Human and receiving-host acceptance remain separate.
