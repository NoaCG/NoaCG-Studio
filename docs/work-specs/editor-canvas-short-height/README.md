# Short-height canvas correction (#981)

## Current phase

Research/baseline complete; the owner approved the compact timeline and implementation is in progress. [Spec](spec.md). Source starts at fetched main `8ae5bbae5bbdedd39b67c95efa76bb24bea87c92`, not the main checkout's lagging HEAD. The CSS correction is limited to short desktop windows.

## Fresh baseline

[Run 38121486455](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38121486455), disposable probe `f2d63c107`, passed four cases: comparable Studio ordinary/cumulative interactions and NoaCG desktop, laptop and native 125% cumulative journeys through source save/reopen and three browser-executable outputs. [CI metadata](evidence/baseline-run.json). This reuses the separately authored #967 task to reproduce the same failure, rather than treating its earlier receipts as a fresh run.

Real `chrome.tabs.setZoom/getZoom=1.25` at both ends gives outer 1366x768, content 1093x545 and `.ef-viewport` 812.8x94. Timeline remains 240px and Properties width 280px. No document-wide horizontal overflow, page errors or failed requests. [Native capture](evidence/before-native-125.png), [bounds/output results](evidence/before-actual-125.json), [zoom](evidence/before-zoom.json). The complete task passes through scrolling; this is a reproduced usability failure, not acceptance.

Local browser job j-4248 was queued, remained below the 3.5GB scheduler RAM floor at about 2.2GB free, and was cancelled without starting. CI supplied the actual browser evidence. Probe lint j-4249 passed, exit 0. Gate jobs j-4250/j-4251 printed all five gate successes but were reaped without exit codes; neither is a passing scheduler verdict. The same targeted cheap gates ran in the foreground and returned exit 0 (contract freshness/citations, docs index, client secrets, copy). [Scheduler receipts](evidence/jobs.json). No scheduler threshold or test assertion was weakened.

## Reference workspace

Inspected pinned Studio `3142fc7d02934494931eb14e7dc255393e4110d0`: AppShell mounts Stage inside DockWorkspace; its default model owns panel layout, and ResizeHandle routes pointer movement through useResizable. That hook clamps/persists panel size in local UI storage rather than project composition source. DockWorkspace applies its sizes as grid tracks; bottom timeline defaults to 220px, minimum 120px. Stage uses a separate viewport with Fit/manual zoom and scroll camera. Dock-model and configuration-column tests were inspected, not executed. [Twelve exact Git-file hashes](evidence/reference-source.json) match release source `a1e9776120fa19d9f3f9d40ab4b10ae1be034347` in every inspected file.

[Run 38121789105](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38121789105), disposable probe `04da6572a`, freshly downloaded/hash-verified official v0.17 Linux server SHA256 `9ba1de317cdc8380c38a694f1d201964d7b805833597419111dab9eea9a02681` and ran a native 1366x768 / actual 125% reference window. Created text, typed X=150 and saved source. Dragging the timeline divider 40 CSS px reduced the timeline from 220 to 180px, increasing the canvas viewport from 171.4 to 211.4px. The 300px Properties panel remained, X retained 150, and saved compositions were exactly unchanged. Zoom remained 1.25; no page errors. [Receipt](evidence/reference-workspace.json), [before](evidence/reference-native-before.png), [after](evidence/reference-native-after.png), [CI metadata](evidence/reference-run.json). The reference's smaller canvas width and camera behavior differ; this is no whole-workspace usability claim.

## Approved design

On 2026-10-11 the owner selected Compact timeline: at widths >=901 CSS px and heights <=600 CSS px, use a 180px timeline with vertical track scrolling, retain 280px Properties and provide at least 180px canvas at the native target. Compact the existing header/document spacing, omit the canvas shortcut caption and allow internal arrangement-row scrolling. The status/error footer remains. Normal 1366x768 keeps its 240px timeline; the phone route remains stacked. No canvas camera or source/session handlers change.

Preserve #950/#960, layer/property, CLI/transform and all source/history/output boundaries. No reference implementation code or disposable workflow will land. After correction and /check, /queue-merge owns landing; a fresh independent checker follows.
