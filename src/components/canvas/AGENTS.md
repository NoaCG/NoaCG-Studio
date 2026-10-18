# src/components/canvas - the stage guides

One file is left here: **CanvasGuides**, the SVG overlay that draws the broadcast safe-area
rectangles (title-safe / action-safe) and the rule-of-thirds grid over a stage. The video
workspace's player stage (`src/components/video/VideoPlayerFrame.tsx`) mounts it; it takes the
overlay's on-screen size, the two toggles and an optional canvas rect, and draws nothing else.

The direct-manipulation canvas that used to live beside it (CanvasInteraction, CanvasSelection,
partLocks, pasteboard) belonged to the retired code editor's preview stage and went with it
(docs/work-specs/codebase-lean/spec.md). The new editor's canvas, selection, handles and
keyboard nudges are `src/components/editorFoundation/`'s and are pinned by its own specs.
