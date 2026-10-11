# Usable canvas at short window heights (#981)

## Why and goal

Independent check #967 reproduced a 94px canvas at actual 125% browser zoom in a 1366x768 outer window. Correct the existing shell's space allocation so ordinary artwork and transform handles are usable, while canvas tools, Properties and timeline actions remain reachable.

## Scope and decisions

Start from fetched main `8ae5bbae5bbdedd39b67c95efa76bb24bea87c92` in `codex/editor-canvas-125-981`. Reproduce current main before design. Inspect and execute the pinned Studio workspace comparison. The owner explicitly selected Compact timeline on 2026-10-11: at desktop widths (at least 901 CSS px) and short heights (at most 600 CSS px), use a 180px timeline with vertically scrolling tracks, retain 280px Properties, and recover at least 180px of canvas at native 1366x768 / actual 125%. Compact the existing header/document spacing and omit the canvas shortcut caption in this mode. Arrangement controls scroll horizontally inside their own row. Normal laptop/desktop and the existing phone route retain their layout. Preserve explicit canvas zoom/pan and existing source/session handlers.

## Non-goals

No save/leave/cloud status, loops, default switch, receiving-host/MCP work, broader property conventions, panel framework or editor rewrite. Engineering verification and owner acceptance remain distinct. Do not land disposable probe workflows or upstream reference code.

## Observable acceptance

- Fresh native 1366x768 outer window at real 125% browser zoom records actual zoom at both ends, CSS bounds and native screenshot, then repeats import/create/edit/text/animate/history/cancel/save/reopen/output.
- The approved short-height layout has at least 180px canvas, 180px timeline and 280px Properties at the native target. Ordinary movement/resize/rotation handles are visibly usable.
- Document identity, Composition, tools, properties and timeline remain reachable without overlap or document-wide horizontal overflow. User-selected canvas zoom/pan survives shell changes.
- Inspect desktop 1920x1080, laptop 1366x768, native 125% and phone; preserve unchanged layer/property, #950/#960 transform and CLI regressions plus input/selection/key ownership, one gesture history and exact cancellation.
- Trace and execute comparable pinned Studio interactions and document deliberate differences. Use the shared scheduler for local checks, full builds/suites in CI, /check and /queue-merge, with a concrete owner review route and subsequent fresh independent checker.
