# Persistent drawing tools

R1.2b usability follow-up, 2026-10-08. Rectangle, Ellipse, Text and Pen now stay
selected after completing artwork. Escape discards a drawing draft and keeps the
tool. Select is explicit; Escape from existing-path Edit points returns to Select.
Entering a group cancels construction and chooses Select, following the current
Composition-only creation contract.

The [spec](spec.md) bounds the slice. VectorCraft's repeated construction behavior
is evidence from the [landed research](../../research/crafting-apps-editor-2026-10-07/README.md),
not an engine or geometry proposal. NoaCG still commits a whole path once and
cancels its whole active draft without writing source or history.

## Verification and review

The [check receipt](check.md) records reproduction, direct lifecycle checks,
affected editor regression tests, cumulative authoring and exported playback.
Direct persistence failed on unchanged product code before the fix. The cumulative
task imports nested SVG with masks and excluded text, creates repeated shapes and
paths, edits public and static text, authors keys and a Next cue, refuses stale
and atomic invalid edits, saves/reopens, and executes SPX, CasparCG and OGraf.
Rehearsal samples stay separate while editing; reopen restores field defaults,
as the existing store contract requires.

Rendered review captures:

- [1920x1080](desktop.png)
- [1366x768](laptop.png)
- [1093x614](laptop-125.png), the documented 125% laptop viewport proxy

The proxy reduces the available viewport; it is not actual browser or OS zoom.
Its walk uses the existing 200% of Fit control, including after reopen. Default
Fit leaves a small artboard at this height; canvas layout changes stay outside
this tool-completion slice.
The [owner route](../../acceptance/owner-queue/2026-10-08-persistent-drawing.md)
asks for judgment of the cumulative drawing workflow. Engineering verification
does not close whole-row owner acceptance or physical receiving-host acceptance.

## Next task

Keep shared command discovery and runtime schemas as the next planned task, at
the start of R1.3b: stable command IDs, discoverable arguments, capabilities and
refusals over the existing operation/session handlers, then one deterministic
human/agent task with matching source/history receipts. Do not add a model or
paired live MCP to this slice; paired MCP remains R3.2. Remaining transform,
layer/property usability and save/sync work retain their existing ownership in
[EDITOR_PLAN](../../EDITOR_PLAN.md).
