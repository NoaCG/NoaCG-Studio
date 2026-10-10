# Bounded editor transform qualification

Issue [#910](https://github.com/NoaCG/NoaCG-Studio/issues/910), following the landed CLI round-trip [#909](https://github.com/NoaCG/NoaCG-Studio/pull/909), independent receipt [#933](https://github.com/NoaCG/NoaCG-Studio/pull/933), and CI retry repair [#940](https://github.com/NoaCG/NoaCG-Studio/pull/940). [Spec](spec.md) defines this slice. Broader editor acceptance, R1.5 and paired live MCP remain separate.

## Reproduced gaps and change

Fetched main was `296077bd0ad863d3705f3ee53fdb00772ccca661`. The spec and reproduction were committed as `58444ad50` before changing the product. [Baseline CI](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38031067779) ran that commit:

- Typing linked Scale X from 150% to 180% after relinking 150%:75% retained 2:1, as did a corner drag. A linked right-side drag instead changed the ratio to 2.25520885:1 ([source values](baseline-linked-side.json)). The existing handler used Shift alone for sides, ignoring Link proportions.
- Text-box side resize, corner scale and mouse versus typed rotation reached Save/reopen at all three viewports. Their baseline failures were an incorrect test expectation: Save intentionally changed the graphic name. The assertion now compares the complete template with that requested name.
- The added zero-axis case reproduced an unreachable refusal: a collapsed side made the handle hit radius zero. Ignore collapsed side lengths when sizing the hit area, so the existing zero-scale guard can report its recovery instruction. Numeric controls recover the collapsed axis.

Ordinary scale edges now use the existing `linked !== shiftKey` constraint, exactly as corners do. Text-box sides still take the earlier frame-resize branch. Session transactions, authored transforms, source ownership, current-pose checks and preview cancellation remain the existing implementations. Independent-axis tests explicitly unlink; all prior one-axis, Alt, keyed-channel and refusal assertions remain. The Frosted Panel case additionally proves linked side scaling uses the shared animated Scale channel and linked+Shift refuses the unsupported independent axis.

## Pinned working reference

Executed VectorCraft v0.4.0, revision [`a26aa5b203c901979eb447d28e34e7357138c789`](https://github.com/storytold/vectorcraft/tree/a26aa5b203c901979eb447d28e34e7357138c789), using its official loopback control server and real UI pointer events. Independently downloaded the [portable ZIP](https://github.com/storytold/vectorcraft/releases/download/v0.4.0/vectorcraft-0.4.0-windows-x64-portable.zip). ZIP SHA-256 `fa8d7dc5590ebf1adb93d040dd7420441a2e55db2971f33c05c0c0e5edde0fec`; executed EXE SHA-256 `19d93588ae034e38084be17e626a7f2174bd626059723c93d4681e752a72ffba`. These match the published-archive proof in the [independent provenance](../editor-cli-round-trip/independent/reference-archive-verification.json). No upstream code or runtime enters this repository or product.

[Actual calls and snapshots](reference-task.json) retain imported nodes, pointer coordinates, engine commands, undo and native reopen. The original [SVG input](reference-input.svg) is retained separately. Scheduler job j-4163 completed with exit 0 at 2026-10-10 06:29 UTC. To repeat: download/verify the archive, start the EXE with `--control <free-loopback-port>`, use newline-delimited JSON requests from the receipt's `calls`, replacing local paths with fresh paths. `view.actualSize` is necessary before these document-coordinate drags. Await `ui.inspect.background` empty after native Save before reopen.

Source traced at the pinned revision:

- [Selection tool](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/tools/src/select.rs): pointer hit, draft transform, `ActionPreview` and commit.
- [Bounding-box geometry](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/tools/src/bbox.rs): oriented axes, opposite pivot, Shift proportional scale and rotation zone.
- [Transform panel](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/ui-egui/src/panels/transform.rs): numeric proportional preference and bounds commands.
- [Object commands](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/engine/src/cmd/object.rs): transform mutation, type-area resize and rotation direction.
- [Type commands](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/engine/src/cmd/typecmd.rs): native area geometry/reflow.

| Task | Executed reference | NoaCG contract / deliberate difference |
| --- | --- | --- |
| Proportional side | 300x120 panel to 360x144 with Shift; numeric width 360 with proportional=true gives identical bounds | Link defaults on; Shift temporarily reverses it. Preserve the existing ratio, including unequal X/Y values |
| Independent side | Same panel to 360x120 without Shift | Unlink or linked+Shift changes the requested axis |
| Corner | Shift corner gives 360x144 | Linked corner scales the whole layer |
| Rotation | Outside-corner pointer turn agrees with numeric -30 degrees | Dedicated visible knob, positive clockwise display; existing 15-degree snap and unwrapped turns retained. Reference source uses 45-degree snap; no multi-turn parity claimed |
| Area text | Side changes 300x120 to 400x120 and native reopen retains geometry | Sides reflow without font/scale changes; corners scale appearance. Reference type-area corners also resize the frame, a deliberate difference from the specified NoaCG semantics |
| Cancel/history | Undo restores each transform. In this control-server run Escape did not cancel an active area drag, so it was released and undone before Save | NoaCG Escape and pointer cancellation preserve exact source/history. Do not infer reference cancellation parity from this run |
| Source and animation | Native document transforms and reopen | No equivalent broadcast source-ID, channel-arming, stale-revision or CLI-output contract. Verify NoaCG's own regression cases |

Inspected [proportional panel](reference-linked.png), [rotated panel](reference-rotated.png) and [reopened area text](reference-render.png). They confirm geometric scaling/rotation and area reflow; this sparse test artwork is not a broadcast design comparison.

## Verification and rendered inspection

- Focused qualification covers unequal linked values, typing/corners/sides, Shift inversion, fixed opposite pivot including rotation, one undo, exact Undo/Redo and Escape/pointer cancellation, collapsed-axis refusal/recovery, text-box side versus corner, mouse versus typed rotation, preserved HTML/JS/fields and durable reopen.
- Final focused qualification **4/4**, j-4172, one worker, traces enabled. A separate [normal public-route walk](public-route.json) passed as j-4173: ordinary import/create/edit/save/reload with no dev-module imports or seeded state, no console errors or failed requests ([render](public-route.png)).
- Existing `editor-canvas-transforms`, `editor-typography` and all six `editor-cli-round-trip` cases passed together: **24/24**, scheduler j-4167, one worker. These retain animated playhead writes, raw-transform refusals, 720-degree rotation, Shift snapping, text reflow, stale-context refusal and executable export regression coverage.
- Final affected gates j-4178 passed, including 11 geometry/typography tests and cheap contract, copy, serialization and source checks. Final TypeScript j-4176 and ESLint j-4175 passed over the changed TS/TSX files. Receipt audit found j-4174 was reaped without a terminal exit despite its passing log; that job is not counted. Landing was withdrawn, gates were repeated as j-4178 (DONE, exit 0), and the receipt corrected. Inline review found no further product defects in the final diff; inline simplification retained the existing handlers and geometry helpers.
- [1920x1080](desktop.png), [1366x768](laptop.png), [1093x614](zoom-proxy.png) captures and their adjacent JSON receipts were inspected. Corners, edge handles and rotation knob remain reachable; the latter two viewports use existing Properties/timeline scrolling. The last capture uses the established **200% of Fit at 1093x614** proxy, not physical browser zoom. Each recorded approximately 60 degrees and no page errors after reopen. No layout or typography redesign is claimed.

The final check stamp, merge-queue CI, landed revision, production task and independent post-landing reference/main comparison are recorded by their actual outcomes in the pull request and follow-up receipt; green pre-merge checks alone do not establish deployment.
