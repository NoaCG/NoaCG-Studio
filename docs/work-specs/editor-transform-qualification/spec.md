# Bounded transform qualification (#910)

Why: October 6 feedback reported squashing with linked proportions and unclear corner/side/rotation interaction. Existing implementations need reproduction on current main rather than replacement.

Base: fetched `origin/main` 296077bd0ad863d3705f3ee53fdb00772ccca661, dedicated branch `codex/editor-transform-qualification`.

Goal: qualify typed and pointer Scale/Rotation and text-box side-versus-corner semantics, correcting only reproduced gaps through existing gesture/session/operation handlers (E04/E08/E12/E17, bounded B03/B05).

Non-goals: new editor/model/transform engine, general property/layer polish, save/sync changes, paired live MCP (R3.2), R1.5/default switch, broad editor or receiving-host acceptance.

Decisions: preserve the current ratio when linked, including unequal scales after relinking; unlink permits independent scaling and Shift temporarily inverts the scale constraint. Text-box sides continue to change geometry/reflow regardless of Scale linking; corners scale appearance. Preserve unwrapped rotation and existing 15-degree Shift snapping. Existing source IDs, source ownership and history/context guards remain authoritative. No reference code enters the product.

Reference: execute the comparable scale/rotate/history/native-reopen task in pinned VectorCraft v0.4.0 (`a26aa5b203c901979eb447d28e34e7357138c789`), verify archive/executable hashes against the #933 receipt, inspect the exact transform/tool/command paths and record deliberate differences. A missing equivalent is recorded, never inferred as parity.

Acceptance:

1. Numeric linked scale and corner/edge scale preserve the current X:Y ratio; unlinked scaling changes only requested axes; Shift inverts the constraint. Opposite pivot remains fixed, including a rotated target. Zero-axis pointer edits refuse without source/history mutation and numeric recovery remains possible.
2. A text-box side changes Width/Height and reflows without changing font size or Scale; a corner scales the whole layer. Rotation follows the pointer, agrees with typed values, snaps with Shift and retains turns.
3. Armed transforms key affected channels at the playhead; unarmed edits change base values. Each completed gesture is one undo; Undo/Redo, Escape and pointer cancellation preserve exact source and pose. Stale source/playhead contexts refuse rather than overwrite current work.
4. Save/reopen preserves source identities, fields, assets and resulting transforms. Existing CLI round-trip qualification cases continue passing.
5. Rendered task evidence is inspected at 1920x1080, 1366x768 and the established 1093x614 zoom proxy (200% Fit). Record actual clipping/scrolling/refusals and do not call the proxy physical browser zoom.
6. `/check` covers the final diff with targeted gates/lint/typecheck/browser checks; `/queue-merge` reaches actual merge, successful relevant CI/post-landing and a verified production revision/task. The required independent post-landing reference/main comparison remains explicit.

Verification: reproduce first with a focused browser spec on the untouched product; retain before/after evidence, run relevant existing canvas/typography cases and all six CLI cases through the shared scheduler with one browser worker. Record check/landing/deployment receipts here. Full builds/suites run in Actions.
