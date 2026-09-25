# src/components/canvas - the direct-manipulation surface

The stage the gestures act on - the iframe, the zoom and the pan - is PreviewFrame's, which stays in
`src/components/`. The selection and keyframe INTERACTION contract is
docs/TIMELINE_INTERACTION_MODEL.md.

## Canvas direct manipulation (Era 6)

- **CanvasInteraction** - always-on direct manipulation: drag the root -> nearest
  zone + residual nudge -> the SAME zoneDecls patch the Style panel writes; dblclick a visible
  #fN -> inline edit -> sample value + definition default via blocks/edit.ts setFieldDefault;
  corner handle -> live --scale preview, diagonal-aware, clamped 0.25-4. Every gesture commits as
  ONE undoable applyTemplate and jumps the editor to the changed tab, highlighted; the root is
  detected via model/structure.ts detectPrefix.
  CURSORS name the gesture IN PROGRESS, never one that is merely possible: hover is the plain
  arrow, an active move reads `move`, handles keep their resize arrows, an armed tool its own,
  and the HAND belongs to panning alone (PreviewFrame's `.panning` / `.panning-active` on the
  stage outrank everything while a pan is armed). The rotate handle therefore carries an
  inline-SVG rotate cursor, percent-encoded with `charset=utf-8` and single-quoted attributes;
  the raw `;utf8,<svg …>` form does NOT decode in Chromium, and a bad data URI falls back
  SILENTLY, which is why e2e/import-canvas.spec.ts loads the URI as an image rather than
  trusting the computed value.
  THE DESIGN UNIT (imported designs): `.{prefix}-art` and `.{prefix}-box` swap the keyframe
  scale/rotate handles for the ROOT's --scale handle. The artwork's size IS the composition's
  size - every placed field is `calc(Npx * var(--scale))` against it - so one --scale patch
  moves artwork and fields together, where a scale KEYFRAME on the artwork alone would leave
  every field behind.
  LAYER SCALE/ROTATE HANDLES (data-block, a single selected non-root layer): a corner scale
  handle + a top rotate handle on the selection box; dragging previews live via GSAP and, on
  release, keys `scale` / `rotation` at the playhead (ONE undoable apply, re-parked), pivoting
  around the layer's transform-origin. The root keeps its own --scale corner handle.
  THROUGH THE LENS: this file keyframes at the PLAYHEAD, and the playhead belongs to whichever
  timeline is open - so its `dataModel` is `lensRead(…, timelineTarget)` and every write folds
  back through `projectedJs` (blocks/timelineLens.ts), never raw `parseAnimData`/`writeAnimData`
  (the drift a raw read caused is described at the lens read in CanvasInteraction.tsx).
  CANVAS POSITION KEYFRAMING (docs/TIMELINE_INTERACTION_MODEL.md, amendment 3): on a
  data-block template, dragging any SELECTED non-root layer moves the WHOLE selection (layers
  contained in another dragged layer are excluded - the parent's transform carries them) and,
  on release, ONE undoable apply writes each layer's x/y keyframes at the parked playhead,
  through the same animEdit + spliceAnimData path the Inspector edits through. The root keeps
  the zone drag, unselected layers don't drag on their own, and legacy templates keep the
  classic gestures exactly. Pinned by e2e/canvas-keyframe.spec.ts.
  PLACEMENT DRAG (imported designs): a selected PLACED line - one whose wrapper id has a CSS
  rule with left/top px values (blocks/designLayout.ts placedLines, code-derived, never
  category) - drags as PLACEMENT, not motion: live inline left/top preview in the rule's own
  idiom, ONE undoable placeLine CSS patch on release. Placed lines are excluded from the
  keyframe drag entirely, so a multi-select drag never keys motion for them. A single
  selected placed FIELD swaps the keyframe scale/rotate handles for a SIZE corner handle - a
  text line's font-size, or an image slot's wrapper box (aspect preserved) - one CSS patch on
  release (design, never a scale keyframe). A placed field whose element is HIDDEN (an empty
  image slot - setFieldValue display:none's the img) stays selectable/outlined/draggable: the
  rendered wrapper stands in via partScreenEl. KEYBOARD NUDGE (arrows, 1 px, Shift = 10) moves
  every selected layer: placed fields as placement CSS, other non-root layers on the keyframe
  channel (GSAP preview, x+y keyframes at the playhead); a burst commits as ONE undoable apply
  once the keys go quiet, Esc cancels. The timeline's keyframe-set arrows listen in the
  CAPTURE phase and preventDefault, so a selected keyframe set always beats the layer nudge
  (a diamond click usually leaves its layer selected too — only one may act). Pinned by
  e2e/import-graphic.spec.ts + e2e/canvas-keyframe.spec.ts.
  DIRECT GRAB + LOCKS (imported designs): a press on a PLACED field grabs it - selects it and
  starts its placement drag in ONE gesture, no select-then-drag round trip. Scoped to placed
  fields on purpose: their drag is a design decision costing one undo, while a keyframe layer's
  drag WRITES MOTION, so selection stays the deliberate step there and catalog templates are
  untouched. **partLocks.ts** owns what "locked" MEANS and which parts start that way, so the
  overlay and the Inspector can never disagree: store `partLocks` + `setPartLock` hold only
  EXPLICIT toggles, `partLocked()` falls back to `defaultPartLock()` for everything else. A
  locked part takes no drag, handle, or lasso but stays selectable by click and from the
  timeline - locking is about the POINTER, never editability. Exactly one part has a default:
  an imported design's ARTWORK (a full-bleed image UNDER every field, so unlocked it swallows
  every press meant for the text) - a press on BARE artwork then falls through to the root's
  zone drag. A locked ROOT gives up that zone drag too, so the press marquees instead. Two
  surfaces toggle it: the **Inspector's identity header** (any part) and the **selection chip's
  padlock** (the artwork only, where the default is the surprising one). Locks are UI state,
  cleared on a whole-project swap.
  The SELECTION model is docs/TIMELINE_INTERACTION_MODEL.md's: a click selects the innermost
  TemplatePart under the point (registry-driven closest-ancestor hit test, rect-containment
  fallback), clicking the sole selected part climbs to its container, SHIFT-click toggles, and
  a drag on EMPTY canvas lassos every rendered non-root part it touches. Selection is editor
  UI state ONLY - it lives in store selectedParts (ordered, first = primary in selectedPart) so
  the timeline and the Inspector track the same elements - never written into the template.
  Pinned by e2e/multi-select.spec.ts.
- **CanvasSelection** - the presentational selection/hover overlay: amber outline + a chip
  speaking part.label - the registry's words, same as the timeline strip. Chips hint only
  actions that already exist: dblclick-to-edit on text lines, corner resize on the root. On
  MOBILE (useIsMobile) the chip shows the label ONLY - every hint describes a pointer/keyboard
  gesture a touch screen doesn't have, and less guidance beats a wrong instruction. The chip
  is width-capped to the stage (maxWidth + a left clamp; label/hint ellipsize in CSS), so it
  can never overflow a narrow canvas. An
  eligible selected part's chip carries the "appears" select - offered on ANY editable data
  block, even one with no middle steps yet: existing steps are listed BY NAME and "appears in
  a new step »" creates and names the step itself (blocks/layerTimeline.ts createStepFromLayer,
  the same transform the Inspector and states graph use), which is how a freshly dropped asset
  becomes the graphic's next step in one click; moves between existing steps stay the
  blocks/stepAssign.ts patch. The chip swallows its own pointer events so the gesture layer
  under it never fires. The canvas also owns a CONTEXT MENU (right-click; the right button
  never starts a gesture): one action for now - "Add template graphic…", opening the same
  InsertTemplateDialog the Assets panel's button does (its open flag is the shared
  useInsertTemplateUi store; the dialog itself mounts once in AppShell).
- **TEXT TOOLS** (the stage toolbar's ↖ / T / boxed-T switch, PreviewFrame; placed-design
  templates only - the designBoxInfo gate, code-derived): store `canvasTool` arms them
  ('select' | 'text' | 'area-text'; T is the keyboard shortcut, Escape disarms). The T tool
  clicks POINT TEXT onto the artwork: one addPlacedLine at the click (born empty, shifted a
  line-height up so the click is the insertion point) + the inline editor opened on it
  immediately - committing empty (or Escape untyped) undoes the creation; Escape after typing
  commits (the Illustrator rule). The area tool DRAGS a rectangle that becomes a wrapping
  text box: addPlacedLine at the rect origin + setLineFit 'wrap' with the dragged width; its
  corner handle then resizes the BOX width (kind 'area'), not the font-size. Both create real
  fields through the Data tab's exact transform and disarm back to Select after creating.
  While the inline editor is open, typing MIRRORS live into the preview element; cancel
  restores the template's text. Pinned by e2e/text-tools.spec.ts.
