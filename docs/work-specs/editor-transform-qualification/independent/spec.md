# Independent landed-transform comparison (#950)

Why: #949 and #952 contain implementation evidence, requiring a checker who did not build the change.

Base: fresh feature worktree from fetched C:/claude/NoaCG-Studio origin/main a67891ae9ddcfffd4cd56558cb683387d6ca0fc9, including implementation 0c355905.

Goal: independently repeat typed/pointer linked and unlinked scaling, text-box side/corner semantics, rotation, history/cancellation and durable reopen in NoaCG and pinned VectorCraft v0.4.0.

Non-goals: product changes without a reproduced defect, broader editor/R1.5 or owner acceptance, live MCP, receiving-host qualification.

Decisions: use a separate normal-route browser task plus unchanged maintained regression specs; use the official reference control server with fresh files and hash-verified executable; record exact results and intentional differences without claiming whole-editor parity. Browser/native UI jobs share the scheduler.

Acceptance:
1. Fresh NoaCG task exercises ratio preservation, independent axes/Shift inversion, side reflow, corner appearance scale, pointer/typed rotation, one-gesture history, cancellation and save/reload source/pose preservation.
2. Fresh pinned reference run exercises comparable transforms, history, cancellation and native reopen; archive/executable hashes and inspected source paths are retained.
3. Maintained transform, canvas/typography and all six CLI round-trip regressions execute unchanged with one worker.
4. Inspect captures at desktop, laptop and the 1093x614 200%-of-Fit proxy; document matches, gaps and limits.
5. Receipt and phase-note outcome pass /check and land through /queue-merge.
