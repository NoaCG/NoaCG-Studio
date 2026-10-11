# Shared command qualification

Bounded qualification at the start of R1.3b, before model edits. See [spec](spec.md)
and [verification](check.md). Stable command IDs and strict runtime schemas describe
only existing task handlers. Source, selection, session, revision, gesture and
history ownership remain with the current editor. Pose readiness requires a
correlated acknowledgement from the existing preview controller.

## Runnable task

Run through the shared job queue:

```
npm run queue -- "npx playwright test e2e/editor-commands.spec.ts e2e/editor-command-task.spec.ts --workers=1"
```

The paired task imports the same nested/masked SVG through the wizard into fresh
browser contexts. One route uses actual authoring controls; the other imports
`activeEditorCommands` from the local module seam. Semantic source edits call the
catalog and the existing session begin/preview/cancel handlers, without clicks or
store setters. Selection/seek call shared UI handlers. Wizard, save and rehearsal
retain their existing routes. Rehearsal sample setup is test input.

Create a rectangle, ellipse and text box; change the public default and excluded
static wording; author two position keys, a Next cue and Out; cancel a draft;
refuse stale/unsupported/mixed batches; undo/redo; save/reopen and rehearse the
sequence. Validate and execute SPX, CasparCG and OGraf packages. Compare exact
phase source/identities/history, rendered held poses and executed cue endpoints.

Creation inputs use source-parent pixels. The UI copy records the geometry it
submits to the shared handler, including subpixel text geometry; the semantic copy
replays those arguments through the catalog. Inspection exposes the existing
acknowledged drawing-space matrix. This proves handler parity with measured UI
inputs, rather than independent composition-coordinate conversion.

At a Step flag, the existing authoring Play control replays the arriving segment.
The task inspects the departing cue and plays from its first frame; exported Next
executes from the boundary. Samples survive default edits and history travel.
Reopening uses the existing contract that resets samples to saved defaults.

## Boundaries

This is deterministic Chromium browser qualification with DOM parsing. The 1093x614
capture is the documented 125% laptop viewport proxy, using 200% canvas fit; it is
not actual browser/OS zoom. No Node-pure, real-model, WebMCP, paired MCP, physical
receiving-host, owner or full-release acceptance claim. Paired live MCP remains
R3.2. Broader R1.3b remains open.
