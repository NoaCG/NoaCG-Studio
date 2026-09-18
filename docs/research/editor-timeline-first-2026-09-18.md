# Timeline-first editor correction

2026-09-18 owner direction. The [master plan](../EDITOR_PLAN.md) owns scope;
the [mechanism contract](../EDITOR_REBUILD_PLAN.md) defines implementation behavior.
Product implementation remains on hold. This record supersedes the previous Add step,
duration/insertion forms, Edit Out setup and categorical prohibition on cross-cue editing.

The first task is simple In -> indefinite hold -> Out. Place flags at the playhead, drag
flags/keys/layer bars for timing, and create the second Position key by dragging the canvas
at another frame after enabling animation. Add Out offers reverse entrance or no generated
keys. Add Step comes next, with additive layers and all-visible-layer exit coverage.

The timeline is the visual authority. Source code remains the only persisted truth; the
adapter must support the workflow rather than exposing old step-local constraints to users.
A boundary is both the preceding segment's stop and the next segment's command entry.
Arrival holds the preceding pose; new layers reveal only after the appropriate trigger.

Layer body moves carry keys; edge trims change visibility without rescaling animation.
Adobe documents these conventions in [Selecting and arranging layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/select-and-arrange-layers/selecting-arranging-layers.html).
Collapsible folders and asset bins provide organization; real nested compositions are a
separate capability. [Adobe precomposing](https://helpx.adobe.com/nz/after-effects/desktop/work-with-compositions/precomposing-and-nesting/precomposing-nesting-pre-rendering.html)
describes editable child layers represented by one parent layer. R1.2 must provide that
behavior, not call a folder a precomp. Source/field/export fixtures precede its UI.

[Focused timeline study](editor-timeline-proposal-2026-09-18/README.md) demonstrates the
flag/bar/hold workflow. Earlier studies remain visual references for the full workspace,
transforms, templates and brands, with their superseded cue interactions clearly marked.
