# Layer and property qualification

## Why and goal
The October 6 feedback still names everyday layer and property friction before R1.5. Reproduce current main through ordinary import/create/editor controls, record existing passes, and correct only confirmed, contained gaps using current source operations and session history.

Baseline: fetched `C:/claude/NoaCG-Studio` main `d0a8ce1272c300fbf5fa5c192a6a37f5af18dbfa`; fresh managed worktree and branch `codex/editor-layer-property-qualification`. Preserve #950/#960 (`fb3edd49`), its independent receipts, and all existing CLI round-trip regressions unchanged.

## Decisions and boundaries
- Inspect pinned OGraf Studio `3142fc7d02934494931eb14e7dc255393e4110d0`, including event, mutation, preview and tests; execute comparable interactions before designing corrections. Use the smaller pinned Eyevinn example where applicable. Reference code remains isolated research, never copied into product/CLI/output.
- Record selection, Shift ranges, keyboard ownership, Delete/history, context actions, rename, visibility, composition context, property discovery, distinct key actions, alignment and numeric scrubbing before choosing fixes.
- Reuse current source/session/operation handlers. Stable identity, fields, masks, assets, unsupported source, armed/base behavior and input keyboard ownership are invariants.
- Save/leave/cloud-status stays with its separate owner. No loops, R1.5/default switch, receiving-host or paired live MCP work.

## Observable acceptance
1. Canvas/layer selection, additive selection, Shift row ranges, Delete, Undo/Redo and context actions have recorded current-route outcomes and any contained correction restores exact source through history.
2. Double-click and Enter rename labels without changing stable IDs; an eye control changes visibility coherently; Composition/template context is clear.
3. Position, Scale and Rotation remain discoverable before any key exists. Every key control has a distinct tooltip and accessibility name; property values align.
4. Numeric drag scrubbing has documented modifiers, visible preview, one undo per completed gesture and exact Escape/pointer cancellation. Typed entry and inputs retain keyboard ownership. Armed edits key only affected channels; base edits retain existing keys.
5. Cumulative normal-route import/create -> edit text/artwork -> animate -> undo/cancel -> save/reopen -> executable SPX/CasparCG/OGraf output preserves source identity, fields, masks and asset bytes.
6. Rendered desktop, 1366x768 and actual browser 125% zoom are inspected. Record measured browser zoom and usability limits; viewport/Fit proxies do not satisfy physical zoom.
7. Shared scheduler owns browser jobs and targeted local verification. Full build/suites remain CI. Receipts, plan/phase notes, /check, /queue-merge, auto-fix and landed verification leave a concrete fresh-independent-checker task; implementer evidence is never independent or owner accepted.

## Verification and rollback
Write focused normal-route regressions for confirmed gaps, retain CLI/transform regressions, run targeted lint/type/gates and browser checks through the scheduler, inspect screenshots and console/network. Refusals and stale/cancel cases must leave source/history unchanged. Revert the bounded feature commits if their acceptance fails; do not weaken existing checks.

Engineering qualification is pending. Independent comparison and owner acceptance remain separate.

## Current handoff
[Source inspection and execution status](research.md) distinguishes candidates from reproduced defects. Spec commit: `51f40005e`. Local browser job `j-4203` was cancelled while held below the shared 4 GB RAM floor. The user approved the separate non-landing CI probe, now executing on `codex/editor-layer-property-probe`. Corrections have deliberately not started before the required reference/runtime reproduction. No acceptance, /check, landing or deployment verdict is claimed.

