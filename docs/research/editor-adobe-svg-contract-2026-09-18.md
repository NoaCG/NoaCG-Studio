# Familiar transforms, SVG handoff and OGraf fields

2026-09-18. Research and design decisions under [EDITOR_PLAN.md](../EDITOR_PLAN.md).
This is supporting evidence, not another roadmap. No application implementation is authorized.
Repository inspection uses planning branch base `49a2f31`; findings below are code inspection,
not a new end-to-end wizard or Adobe application walk.

## Reference comparison

After Effects is the primary interaction reference. Premiere confirms the familiar
stopwatch/keyframe pattern; it is not the model for broadcast cue lifecycle controls.

| Topic | Documented reference | NoaCG decision |
|---|---|---|
| Transform family | AE exposes Anchor Point, Position, Scale, Rotation and Opacity; rotation/scale use the anchor | Include all five in R1, using 2D coordinates. New 3D authoring is deferred; existing source is preserved |
| Anchor adjustment | AE's Pan Behind tool compensates Position when moving the anchor | Provide a canvas anchor tool with no pose jump, plus numeric layer-local X/Y; distinguish numeric anchor edits from compensated pivot relocation |
| Scale and rotation | AE supports constrained scale and turns plus degrees | Linked/unlinked X/Y percentages and signed, unwrapped rotation; 720 degrees remains two turns |
| Initial key | Stopwatch creates one key at the current time | Remove the previous draft's automatic extra key at time zero |
| Animated edits | Changing a property's value at another time writes a key | Scrub or type values and drag supported canvas handles through the same transaction |
| Disable animation | AE removes keys and retains the current value | Keep the displayed value; Undo restores the animation. Never silently restore an earlier base |
| Key navigation | Diamond indicates/adds/removes the current key; arrows visit adjacent keys | Same controls in inspector and property rows, with shared selection |
| Temporal interpolation | AE distinguishes the approach to a key from its departure; Hold retains a key's value until the following key | Use key-side Easy Ease In/Out/Both and outgoing Hold semantics, not a renamed destination-only easing menu |

Sources: [Adobe layer properties](https://helpx.adobe.com/after-effects/desktop/work-with-layers/layer-properties/layer-properties.html),
[Adobe keyframes](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-keyframes/setting-selecting-deleting-keyframes.html),
[Adobe shortcuts](https://helpx.adobe.com/no/after-effects/desktop/get-started/keyboard-shortcuts/keyboard-shortcuts-reference.html),
[Premiere keyframing](https://helpx.adobe.com/premiere/desktop/add-text-images/insert-images-and-graphics/animate-layers-using-the-effect-controls-panel.html).

Familiar operations do not imply complete Adobe equivalence: spatial Bezier paths, roving
keys, expressions, velocity graph editing, cameras and 3D are outside this R1 scope. Our cue
boundaries and indefinite holds remain explicit broadcast concepts. Do not copy Adobe code
or branding. Implement the conventions against NoaCG's canonical source and runtime.

## What the current repository actually provides

- `src/components/timeline/Inspector.tsx` already has X/Y, uniform scale, rotation, opacity
  and discrete pivot presets. Pivot is stored as an initial `transformOrigin` value; this is
  not a full numeric, compensated anchor tool. The current diamond mixes arming and keying.
- `src/blocks/animData.ts` stores step-local property tracks. Its key `ease` describes the
  incoming segment. The new key-side UI therefore needs an explicit adapter and sampled
  parity tests, not a label-only change. Preserve existing curves and their rendered motion.
- `src/blocks/animEdit.ts:addStep` inserts before Out by default, supports an insertion
  index, and synchronizes waypoint names. Reuse this mutation seam for visible Add step.
- `src/components/wizard/CreationWizard.tsx:applyDraftProject` builds the final document,
  formats/applies it and returns the working template. `create` opens the editor; Finish
  currently passes `showEditorDoor={advanced}`. Exposing this existing route is smaller and
  safer than designing another SVG import or behavior setup system.
- The same file initializes SVG text fields with `on: !c.drawing`. Detected text starts on;
  `static:` artwork is deliberately off. `armTimerClock` preserves behavior ownership.
  Pictures have a separate opt-in policy. One older mapping-step comment is stale.
- `src/components/SampleDataPanel.tsx` adds supported placed/catalog fields through
  `addPlacedLine`/`addCatalogLine` and image-slot operations. The document and real bound
  element are changed together. This is not universal automatic exposure of arbitrary text.
- `src/blocks/edit.ts` allocates stable `fN` field IDs and edits labels/defaults without
  changing those IDs. Retain these contracts rather than renumbering imported graphics.
- `src/export/targets/ograf.ts:dataSchema` already maps supported fields into manifest schema
  properties with types/defaults/titles and custom-action schemas. `ografSchema.ts` handles
  recursive schema validation. Extend these seams; do not create a competing field model.

## Wizard and text decisions

Finish retains Add to production as its primary route and Export as an alternative. Add an
always-discoverable secondary Open in editor action, without an Advanced prerequisite.
Open the exact post-build working document and assets, never the raw SVG or a rebuilt scene.
Retain animation presets, text/image fields, formatting, quiz/timer logic, reveal targets,
font data, stretch/follower layout, custom actions and sample values. No production entry is
created by opening the editor. A later explicit production action saves and installs it.

The editor exposes the shared design capabilities relevant to small adjustments, not a copy
of every wizard step. A property driven by layout or behavior identifies its owner. Changing
an answer panel's width must use the layout patch, not replace quiz markup or scale the text.
Do not rerun an old wizard draft over subsequent editor changes. A later wizard re-entry
requires reconciliation or a reviewed regeneration that preserves the original document.

New live text created with the Text tool defaults to Editable in playout. Creation atomically
adds the element, stable field ID, binding, label and default. An explicit Decorative text
choice removes that operator exposure safely. Existing imports retain intentional exclusions;
outlined SVG paths are artwork, and calculated/driven text is not exposed as a second input.
Renaming a layer or operator label must not rename a published schema key. Field deletion or
schema-key changes require reference/compatibility checks and a reviewed migration.

[Loopic's Template Definition Builder](https://docs.loopic.io/user-guide/exporting/template-definition-builder/)
maps fields/actions to keyed elements. [Ferryman](https://streamshapers.com/docs/documentation/streamshapers-ferryman/features/)
documents an underscore convention for dynamic content. Neither establishes a universal rule
that all text is automatically exposed. Our on-by-default Text tool is a NoaCG usability
decision, consistent with our SVG wizard. Loopic's OGraf integration page currently includes
legacy CasparCG wording; use EBU's specification as the technical authority.

## OGraf and YLE acceptance

[EBU's specification](https://ograf.ebu.io/v1/specification/docs/Specification.html) and
[manifest schema](https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json)
define the external contract. Public data keys live in the manifest's `schema`; `fN`, `f:`
and leading underscores are author-tool conventions, not mandated OGraf layer names.
Private element names need not match labels. Stable schema keys and correct runtime bindings do.

Acceptance includes manifest/schema validation, typed/default data and updates, load/dispose,
play/next/stop semantics, custom actions and interrupt/replay behavior, fonts/assets on a clean
host, and declared capability flags. Step count excludes final Out. A scrubber in the editor
does not prove OGraf non-realtime support: that requires the scheduled-actions/time APIs.
Preserve imported custom actions instead of flattening quizzes into linear Next steps.

Record the exact OGraf version, renderer/version and receiving workflow for a YLE acceptance
run before claiming suitability for their deployment. These are currently unknown. Schema
validity alone is not host interoperability, and opening an OGraf package does not guarantee
every third-party implementation can be visually edited. R1.5 owns supported core output
acceptance; R3 adds the structured-data acceptance already in the roadmap.
