# EDITOR_RESEARCH.md - the master editor research and direction document

**What this is.** The direction document for the NoaCG authoring system, written to the owner's
master brief (`docs/backlog/editor-master-research-brief.md`, verbatim, 2026-08-28). It replaces
the first edition of this file (2026-08-28, five products from their product pages) with what the
brief ordered: a hands-on audit of our own editor under the brief's three-level test, competitive
research grounded in actual workflows across ten systems, the major authoring problems named with
their boundaries, credible directions compared rather than chosen, and a short list of decisions
for the owner. `docs/COMPETITORS.md` remains the capability matrix; this file is the research on
one axis - **authoring**: how a person draws a graphic, animates it, exposes it to an operator,
binds it to data, gives it behaviour, and keeps a package of many graphics maintainable.

**Nothing in this document is authorized to be built by it.** `docs/CONTROL_PANEL_ROAD.md` §11
parks the cloud editor, and `docs/GOALS.md` THEN items 1 and 2 park the WYSIWYG canvas and the
node editor as an authoring surface. The NOW push, in that file's `## NOW`, owns the calendar.
This file exists so that when the editor is finally committed to, we are solving the right
problem.

**Where the control axis lives.** Custom control applications, the production operator story,
shared production data and staged-vs-live are decided in `docs/CONTROL_PANEL_ROAD.md` (rewritten
2026-08-28 from its own owner brief). This document defers to it wherever the two meet and owns
the AUTHORING half: what an author can create, and through what surface.

**Evidence discipline.** Every claim about our own editor below is tagged **[measured]** (driven
in a real browser this round, 2026-08-28), **[pinned]** (an E2E spec exercises it nightly),
**[owner]** (the owner has used it and said so), or **[code]** (read from the source, not
exercised). Competitor claims carry the researching round's tags - [doc], [video], [marketing],
[inferred] - and the per-system source links at the end. Marketing copy is weak evidence about
shipped software; a row that would change an architecture decision gets re-checked against a live
system before it does. Refresh is TIME-driven: treat anything older than a quarter as stale.

---

## 0. The three-level test (the brief's ruler, applied everywhere)

For every capability, three different claims, never conflated:

1. **Runtime-representable** - the schema and interpreter can carry and execute it.
2. **AUTHORABLE** - a normal user can create and modify it through the editor.
3. **PROVEN** - someone built a real graphic with it and operated the result.

Only levels 2 and 3 may be called editor capabilities. The first edition of this file overstated
NoaCG by reading level 1 as level 2; §1 re-grades every row. The same ruler is applied to
competitors: XPression's easing lives in an editor its own 906-page manual barely documents, and
Loopic's `next()` semantics are representable and undocumented - level-1-vs-2 gaps are not only
ours.

---

## 1. The honest NoaCG assessment - by actually using it

### 1a. What was done

A fresh headless Chromium session drove the dev build on 2026-08-28: created a catalog lower
third (steps on) and a quiz through the wizard's own create path, then exercised the editor
surface by surface - stage, selection, Inspector, canvas gestures, inline text, the step timeline,
the machine graph, the event strip, the Rehearse and Content panels, zoom. Findings were recorded
per probe; screenshots are session evidence, not repo assets. Two limits of that instrument,
stated: headless Chromium is the environment where the owner-reported blank stage does NOT
reproduce (the editor-stage-blank handoff (removed from the tree; `git show 0eec5a83:docs/handoffs/2026-08-27-editor-stage-blank.md`) measured the same), and motion was
judged by the document's own state, not by eye.

### 1b. The grading - what the editor is today, level by level

**Authorable AND proven** (level 3 - real graphics have shipped through these):

- **The wizard road end to end.** Choose, brand, animate by preset, finish, export or open the
  editor - the whole catalog ships this way. [owner, pinned]
- **The SVG import road.** Artwork in, text layers auto-detected as fields, mapping, fit ladder
  (grow / wrap / shrink with symmetric caps), behaviour attach (quiz, scoreboard) - walked in a
  browser, pinned by `e2e/import-svg-behaviour.spec.ts`; the owner walk that decides whether a
  student can FIND it is still open (`docs/GOALS.md` NOW 1-3). [pinned, owner-partial]
- **Operating a graphic from generated surfaces.** The control page, dashboard and exported panel
  driving fields, events and verbs - the student release closed on it. [owner, pinned]

**Authorable, not yet proven as a workflow** (level 2 - the controls work; no real production has
been built through them):

- **Selection and direct manipulation.** Click selects the innermost part (measured: `#f0`, then
  the box on the climb); the chip and Inspector follow; lasso and multi-select are pinned
  (`e2e/multi-select.spec.ts`). Dragging the root writes the zone patch; dragging a layer writes
  x/y keyframes at the playhead (`e2e/canvas-keyframe.spec.ts`); a placed field drags as
  placement CSS. Undo restored the exact code both times. [measured, pinned]
- **Inline text.** Double-click a visible field, type, Enter - the sample value, the SPX default
  and the markup all updated in one undoable patch. [measured]
- **Keyframe authoring.** The Inspector's property rows (position, scale, opacity, rotation, the
  composed filter group, 3D transform) each carry a ◇ diamond - "Animate this property - stamps
  its first keyframe" - and clicking it wrote the keyframe into the code (+70 chars, one undo
  step). ‹ › navigate keys; labels drag-scrub values. [measured] The timeline draws clips, layer
  rows, per-property sub-rows, keyframe sets with marquee, magnetic drags, per-step and
  per-keyframe ease menus; the playhead dragged and the store followed. [measured, pinned by
  `e2e/anim-engine.spec.ts`]
- **The machine graph mechanically.** The ≡ Timeline | ◇ States toggle opened the graph; the
  derived chip showed; "+ state" offered pose / step-on-path / timeline-from-layer; adding a pose
  materialized the machine into the code in one undoable apply; the quiz graph drew Off /
  Question / Answer selected / Locked in / Reveal / Out with the amber spine and badges.
  Port-drag arrows, transition style cards, guarded deletes and problem dots are pinned
  (`e2e/machine-graph.spec.ts`). [measured, pinned]
- **Rehearsing behaviour inside the editor.** On the quiz, the event strip rendered the five
  operator events with structural greying LIVE - at Question, three enabled, two disabled
  exactly as the guard says - and pressing one moved the state chip (Question → Answer
  selected). The Rehearse panel rendered the full generated operator view (ten inputs, the A-D
  answer buttons, the five ⚡ events, the transport) beside the running preview. [measured]
- **Fields.** The Content panel rendered every field with real inputs and a working "+ Add" that
  goes through the code-level transforms (`addCatalogLine` / `addPlacedLine`). [measured, code]

**Runtime-representable only** (level 1 - the model carries it; no editor surface writes it):

- **Loops.** `{ repeat, yoyo, repeatDelay }` per track is parsed, validated, serialized and drawn
  truthfully as the repeat tail - and remains READ-ONLY in the UI. Still the sharpest single gap,
  unchanged from the first edition. [code]
- **Operator-control metadata.** `machine.controls` (labels, sections, payload fields, ± adjusts)
  drives every generated panel, and only TYPES and hand-written code author it - the editor
  cannot rename a button into operator language, group controls, or add an adjust. The graph
  edits events; nobody edits their presentation. [code]
- **Interruption safety.** Nothing like exit time exists at any level; an operator can cut an
  entrance in half from every surface. [code]
- **`data-condition`** parses, round-trips, warns, never fires - reserved by design. [code]

**Defects found or confirmed this round** (the step-1 work list):

1. **Space over the stage is swallowed** - confirmed exactly as the owner reported: with the
   pointer over the preview, Space produced no run (`__activeTl` stayed null); over the timeline
   strip, the same key played. The pan owns the key there and a tap does nothing at all.
   [measured; `spaceKey.ts`]
2. **A finished run is never reported finished** - `__activeTl` is cleared only by the next
   play/stop, so the playhead's live-follow pins at the run's end
   (the editor-stage-blank handoff (removed from the tree; `git show 0eec5a83:docs/handoffs/2026-08-27-editor-stage-blank.md`), measured there; the code is unchanged).
   [code]
3. **The owner's blank stage is still unreproduced.** Settled and visible headless (measured
   again this round: opacity 1, 414×96 px rect); blank on his screen. The handoff's candidate
   list (colour-scheme mismatch, stale pan, an assets record, the route through Home) stands -
   this is an environment fault to catch in the field, not a code path anyone has found. [open]
4. **No alignment or distribution tools.** Multi-select exists; align-left/center/distribute do
   not, on any surface. Smart guides and Safe/Grid overlays exist. [measured, code]
5. **Branch-state timelines cannot be scrubbed by phase** - the known limit in
   `docs/STATE_MACHINE_SCHEMA.md` §6a: clicking the state snaps and parks. Authoring a branch's
   motion is done against a parked pose. [code]
6. **Catalog typography is contract-only.** A catalog template's per-element type (size, weight,
   family per line) is edited through the :root style contract and the assembler's own idiom, not
   per-element in the Inspector; the Inspector's Style tab exists only for imported placed
   fields. Deliberate - but against §1c's baseline it reads as a reach gap on the editor's main
   template class. [code]

### 1c. The professional baseline, and where we sit against it

The brief asks for the minimum professional bar for basic editing. Composited from the ten
systems (§2), the baseline a professional expects on day one: click-select with hierarchy
climbing; multi-select; drag/resize/rotate with snapping and smart guides; rulers and guides;
safe areas; align and distribute; grouping; full typography on any text; keyboard nudge and a
shortcut map; undo/redo everywhere; per-property keyframes with draggable keys and visible
easing; scrub; zoom/pan of both canvas and timeline.

We meet most of it - selection, climbing, multi-select, drags that write honest patches, snap
guides, safe/grid, nudge, undo, per-property keys with ease menus, scrub, zoom - and miss:
align/distribute (absent), rulers/user guides (absent), rotation handles only on layers [code],
grouping as an authoring act (parts come from the registry; there is no "group these" gesture),
and full per-element typography on catalog templates (above). None of these is architectural;
all of them are what "make basic editing genuinely reliable" (the brief's step 1) means in
practice, alongside defects 1-3.

### 1d. Corrections to the first edition

- **"Us today" rows were level-1 claims.** The machine graph column read as an editor capability;
  it is authorable but unproven, and the owner's verdict stands: as a way a non-programmer
  AUTHORS logic, "it did not really work out" (`docs/GOALS.md` THEN 2). The graph's mechanics
  passed every probe this round - the failure is route and audience, not code, and the second
  attempt should not be a third graph.
- **"Singular has no loop concept" was wrong.** Behavior animations are exactly that: a looping
  idle effect per widget (effect, easing, min/max, duration, loop delay). Their timeline has no
  keyframes; their looping is real. [doc]
- **"Viz Flowics: no public evidence of authored motion" was wrong.** The Transitions Panel is a
  real per-event animation editor - preset blocks per element with drag duration/delay and
  easing, onion-skinned opposite phase, list pagination transitions, and text update animations.
  What it lacks is keyframes and any timeline outside an event. [doc]
- **"MXMZ panels are hand-built per vertical" was half wrong.** The rundown item's field form is
  GENERATED from the template's typed variables, and the match-control surface (clock nudges,
  score steppers, card counters, lineups, a trigger grid) looks productized, not bespoke; who
  configures it per sport remains unpublished. Their editor is confirmed AE-shaped: per-property
  keyframe lanes, selectable frame rates to 59.94/60, sub-composition tabs, a Repeater element,
  and JSONata data paths with live autocomplete. [video, doc]
- **"Nobody in broadcast authors logic" needs narrowing.** True of the WEB class (Singular,
  Flowics, Loopic, MXMZ author no logic without code). False of the desktop class: XPression has
  Visual Logic node graphs, Chyron has a Conditions tree with a live Evaluate tracer, Viz has
  Transition Logic plus scripting, and Unreal now ships Scene State - "a state-machine plugin
  designed for broadcast graphics", with states, events, guards and nested machines. The
  corrected claim: **designers in the web class get no logic; designers in the desktop class get
  several overlapping logic systems**; the structural, single-model machine remains ours and
  Rive's alone.

### 1e. What is genuinely ahead, said precisely

Three things measured this round that no competitor's public product does:

- **Behaviour rehearsal against the real contract, inside the editor.** The event strip and
  Rehearse panel grey buttons by the same structural guard every exported and hosted panel uses,
  live, while authoring. Singular's data panel doubles as a control app (their best idea, §2)
  but has no legality to mirror; Viz needed Logicmaker's click-a-state fifteen years into
  Transition Logic.
- **Every gesture is a code diff.** One undoable apply per gesture, the diff highlighted in the
  code view - the audit watched keyframes and machines appear in the document. XPression
  mediates keyframing through modal dialogs; every cloud competitor hides the model entirely.
- **The generated panel exists at all.** `docs/CONTROL_PANEL_ROAD.md` §1-2 owns this claim now:
  nobody else generates a complete default operator surface from the graphic's own contract.

---

## 2. The systems - what the user actually does, per product

Ten systems, workflow evidence only, compressed to what changes decisions here. Full per-system
source links at the end; visual evidence is linked, never embedded (public repo).

### Ross XPression (desktop CG, the North-American incumbent)

Scene Manager + Object Library + Object Inspector; keyframing is pose-then-capture through a
modal Set Keyframe dialog (Ctrl+K, tick attributes, type the frame); moving a key is another
dialog; easing lives in a Keyframe Editor the manual barely documents. Lifecycle is assembled by
convention: a director with a pause in the middle, or full **Transition Logic** - a hand-built
family of named directors (the worked example needs nine) plus a rules table with conditions.
Exposure is per-attribute **Publish** checkboxes plus a hand-ordered published list; the
Sequencer generates the operator's Template Data form from it. Data is **DataLinq**, a separate
server with ~35 drivers and one good binding dialog (browse a field, Live Update toggle,
dependent re-query). Logic: **Visual Logic** wire-node graphs, then C#/VB script. Panels:
**DashBoard PanelBuilder** - a second application, a second layout language (OGLML) and a second
script dialect (ogScript), hand-laid-out; nothing is generated from the published fields.
Content-aware layout is a parenting trick (Auto Squeeze on text, Auto Scale making a child quad
follow it) with documented mutual exclusions. **The traps it proves:** four-plus parallel logic
systems, and dialog-mediated direct manipulation.

### Vizrt Viz Artist / Trio / Pilot (the global incumbent)

Scene tree of containers; Stage with directors → actors → channels; set keys with ENTER,
hand-shaped splines (no named-easing library). Lifecycle: stop points on a director (Take plays
to the pause, Continue resumes) - or **Transition Logic**: one master scene that never unloads,
one director per layer whose named stop points ARE the states, and the animation between two
named points IS the transition; the engine searches for the pair and will play O→B backwards for
B→O. Four states need six authored animations, six need fifteen - the docs teach Euler walks.
Exposure: drag **Control Object** onto the root, **Control Text/Image** onto each container, set
a numeric field identifier that becomes the Trio tab order; Trio generates its tab-field list
from it and draws a bounding box around the selected field's object in preview. Pilot templates
are hand-designed forms over the same fields, with feed-bound fields refreshed by an update
service. **Logicmaker** (Artist 5) finally gave TL a four-panel surface with a state graph and
click-to-test - the industry's admission that naming-convention logic needs a rehearsal surface.
Package reuse: the master scene owns the shared look; Graphic Hub is the shared asset database
with locking and archives. **The traps it proves:** consistency by case-sensitive naming
convention, and O(n²) hand-authored state-pair animations.

### Chyron PRIME (desktop, the third incumbent)

Scene tree + Toolbox + a properties pane that exposes 3D-engine plumbing on every flat object.
Timeline: **Actions** (named keyframe timelines) with per-key in/out interpolation, ease arrows
draggable in the timeline, a spline editor; a parallel **Default action** defines the resting
state the designer must actively maintain. Lifecycle: scene slots (Effect In/Out, Layer In/Out,
Preview In) point at Actions or Conditions; **update is a first-class phase** - per-object
transition effects animate old-to-new on value change, with On Update vs On Change, Out-on-empty
and per-object stagger. Exposure: drag an object into the **Replaceables** table (ID,
description, order, character limit) - one table drives the playout panel, automation and the
newsroom (LUCI). Data: the **Data Object** panel (source / filter / binding), bindings pushed
only on an Update command - a second regime beside continuously-pushing Parameters. Logic: a
**Conditions** tree - If/Else/While scaffolding around typed expressions, with an **Evaluate
tracer that paints the branch taken**; then command sequences, C#, JS, Lua. Panels: drag an
Action onto a **Scene Control Panel** and a bound control is auto-created; Master Control Panels
are scene-independent dashboards. Content-aware layout is a catalog of named effects - **Auto
Follow, Auto Scale, Auto Hide, Auto Spacing, Duplicate-per-row** - each teachable in a
one-minute video. **The traps it proves:** N overlapping logic systems needing dedicated
"why did that fire" diagnostics, and engine plumbing in every author's face.

### Singular.live (cloud, the professional web class)

Composition tree (sub-compositions → groups → widgets), absolute percent-of-parent positioning,
no anchors or auto-layout. Animation: **In/Out bars only** - drag to retime, a settings popover
with type/direction/duration/curve; "2 timelines" splits Out1→In→Out2; **no keyframes exist in
the product**. Beyond the bars: **Update animations** (per widget: when new data arrives, play
old-out/new-in from three dropdowns - no code), **Behavior animations** (looping idles), and
procedural widgets. Exposure is their signature: click an underlined property, name it, and it
is a **control node**; the control app is generated from the nodes (text, textarea, number,
image, color, checkbox, selection, counter, table, timecontrol, button), with per-node ID,
title, order, default AND reset values, immediate-vs-staged commit, hide-in-form. Global nodes
re-skin a package. Data: streams bound by script; no-code Google Sheets field-mapping in UNO
apps. Logic: composition scripts across four nested scopes with sanctioned raw-DOM access - the
escape hatch every real production falls into. Responsive = **adaptive by duplication**: build
the graphic per aspect class, show/hide by output. The author rehearses the operator inside
Composer - the data panel doubles as the control app. **The traps it proves:** escape-hatch
gravity when the no-code ceiling is low, and variant-duplication as a responsive story.

### Viz Flowics (cloud, Vizrt's HTML5 arm)

Elements tree (Regions → Overlays → blocks, data providers as first-class tree elements),
percent-of-parent geometry, "Fit to parent", no canvas zoom. Animation: the **Transitions
Panel** - per lifecycle event (overlay in/out, list pagination, text update), one preset block
per element, drag for duration/delay, easing in an inspector, the opposite phase onion-skinned;
**no keyframes, no free timeline**. An early Out **plays the entrance backwards** rather than
jumping - a structural safety behaviour. Exposure: a per-element "Show on Remote Control"
toggle; the operator surface is derived (Classic mirrors the tree; Rundown Control is playlists
of overlay instances), and the control mode is **frozen at publish** - switching means
duplicating the package. Data: the strongest binding UX in the class - a visible affordance on
every bindable property, a modal filtered to type-compatible variables, JSON Pointers as the
escape hatch, local-vs-global provider scopes with a consolidation wizard. Logic: single-clause
conditional visibility and on-click events; **no scripting at all** - their own sports verticals
move the control surface into a Google Sheet when the panels run out. Two-stage deploy: designer
publishes, operator presses Update to adopt. **The traps it proves:** a sealed model with no
floor beneath it, and publish-time rigidity.

### Loopic (desktop-class web app, closest positioning)

Six panels; per-property keyframes (park playhead, click the diamond), cubic-bezier easing per
key pair - **paywalled**, as are undo/redo, rotation and unminified export. Lifecycle: one
linear timeline carved by frame actions - `this.pause()` on the hold frame, a red outro marker,
loops via nested composition + Detach Playhead + a hand-typed `goToAndPlay(0)`; **next/steps
have no documented runtime semantics at all**. Fields: an element Key in the Inspector joins
canvas, JS API and the **Template Definition Builder** (experimental) - pick a keyed element,
bind field types per target (CasparCG GDD / SPX / LiveOS), options filtered to what the target
supports. Updates are always instant writes; anything animated on data change is hand-coded
middleware. No in-editor operator rehearsal - authors round-trip to a CG server to test. **The
traps it proves:** loop-by-recipe, behaviour as undocumented convention, and craft gated behind
price.

### MXMZ (cloud, the one Yle named)

Import-first: Illustrator/Figma SVG in, every layer exposed, designers trained "for one day".
The editor is AE-shaped and real: per-property keyframe lanes with add/prev/next, numeric
fields, frame-accurate timecode at selectable rates (23.976-60), sub-composition tabs, an
IN/OUT timeline mode with segment markers, a **Repeater** element for array rows, and cheap
auto-numbered **version history with restore**. Exposure: a **Variables panel** - label, type
(text/array/image/object), default, and a **JSONata data path with live autocomplete against
the connected feed** and inline validation; the Operator product generates the rundown item's
field form from the variables. Match control (clock with nudges, score steppers, cards,
lineups, a trigger grid) looks productized; who builds it per sport is unpublished. **No
authored behaviour layer exists publicly** - no states, no conditions, no scripting surface;
"SD to 8K" is vector scaling, not layout. Closed SaaS, no docs site, no export. **The gaps it
proves:** behaviour locked in the vendor's own control layer, and no content-aware layout
behind the resolution claim.

### Rive (the authoring-UX bar; not broadcast)

Design/Animate mode split; hierarchy with lock/isolate/hide; origins, constraints, solos (a
group where one child renders - the structural variant switch). Animate: key buttons beside
every property (grey/blue/filled states), auto-key warnings, draggable keys, Alt-drag scales
timing, a graph editor with two cubic modes (interpolation vs overshooting value), "Set as
default". **Layout** is the reference for content-aware: per-axis **Hug / Fill / Fixed** with
min/max, rows/columns/wrap/gap/padding, text auto-width/height with **explicit overflow policy
per text box** (visible / clip / ellipsis / fit), **N-slicing** on vector and raster, and
**Layout Animation** - a per-container policy (none / inherit / duration+easing) that tweens
children when content reflows, so resizes animate without anyone keying anything. Components
expose typed **Inputs and Outputs** upward through nesting; **data binding** is right-click a
property → pick a view-model property, with converters and **Lists** (repeat an artboard per
item into a layout). Rive is actively collapsing inputs/events/state-callbacks into the one
view-model contract. Community names the state machine as the product's learning cliff, and the
editor is cloud-only with fragile undo at scale. **What transfers:** the layout vocabulary, the
explicit overflow policy, typed component APIs, outputs. **What does not:** pointer-first
listeners, canvas-placed events, rig-depth (origins/constraints) as a prerequisite.

### Unreal Motion Design (the engine-class entrant)

A graphic is a UE Level in a re-skinned mode: toolbox of parametric shapes, Material Designer
(layer stack, not node graph), cloners/effectors, Sequencer with **Stop-role marks** (hold
there; Continue resumes - SPX semantics inside one timeline), and **Animators** - parameterized
loopers (bounce/oscillate/wiggle/counter) with a Time Source, distinct from keyframes. Logic is
a deliberate ladder: **Remote Control Behaviors** (expose a property with a joystick click, drag
it to a Controller; a Conditional Behavior on an integer switches whole property bundles - "0 =
Show 1"), then **Transition Logic** per layer, then **Scene State** (a full broadcast
state-machine plugin: states, priority transitions, events with payloads, nested machines),
then Blueprints. Templates: the level's Remote Control Preset IS the contract; **Controllers**
carry operator-facing IDs and descriptions distinct from the raw properties; a **page** is a
template plus saved controller values; the **rundown** is pages with preview/program channels
and number-pad recall; a WebSocket rundown server takes JSON commands. Content-aware: named
pairwise modifiers - **Auto Size** (background hugs a reference actor plus padding), **Auto
Follow**, Max Width on text. Sub-layer transition logic exists specifically because updating
part of an on-air page otherwise required a re-take. Workstation hardware, SDI cards, multi-
machine networking. **The traps it proves:** a general engine leaking through every seam, and
four logic surfaces whose boundaries users must learn.

### After Effects MOGRT + Figma (adjacent, the packaging and layout references)

**MOGRT** is the industry's dominant "package an animation with exposed controls" pattern: drag
properties into the Essential Graphics panel, rename them in editor language, group them, add
**comment rows as instructions**, export; the Premiere editor sees exactly that panel and
nothing else. **Responsive time**: paint protected intro/outro spans on one timeline; unprotected
time stretches - the authoring gesture is excellent, the semantics (slow-motion middle, breaks
past one nesting level) are wrong for broadcast. Dropdowns switch designs by 1-based index -
reorder and every expression silently breaks. Essential Properties give linked instances with
per-instance overrides and Push/Pull resolution. AE has **no layout engine**: "background hugs
text" is a `sourceRectAtTime()` expression folk-literature - the strongest proof in this file
that content-aware layout by per-layer expressions is misery at scale. **Figma**: per-axis
hug/fill/fixed with min/max and wrap; constraints (pin/scale) as the second regime for absolute
children, cleanly coexisting; typed component properties (boolean/text/variant/instance-swap)
with curated preferred values and **exposed nested-instance properties**; **variables with
modes** - one collection, one value column per theme, switch a subtree by one attribute - the
cleanest package-retheme mechanism in any mainstream tool; prototyping logic capped at
variables + structural arrows + if/else. **What they prove:** expose-by-pointing, typed
contracts, token modes, and exactly how far a non-programmer audience tolerates logic.

---

## 3. What "better than they do" means, per axis

Not "has the feature" - a specific, checkable bar. (This section is the one
`docs/CONTROL_PANEL_ROAD.md` §2 cites for the operator-handoff claim.)

- **Canvas.** Better is: a person who has never opened the app places and restyles their own
  imported artwork without the code view, and the code that results is the code they would have
  written. Everyone has a canvas; nobody else has one whose output is a file you own. The bar is
  §1c's baseline list plus pillar four - and today we miss named pieces of the baseline
  (align/distribute, per-element typography reach).
- **Timeline.** Better is: frame-accurate parity with MXMZ and Loopic, plus the thing neither
  has - the timeline is a view of the same machine the control page is generated from, so a
  keyframe edit and a behaviour edit are one document that cannot drift. We are close
  mechanically; loops are the missing editing affordance, and XPression's dialog-mediated keys
  are the anti-pattern to keep refusing.
- **Easing.** At the bar. Rive's overshoot-capable graph editor is the only thing above us, and
  it earns its cost only if people hand-tune curves, which `docs/DESIGN_LANGUAGE.md` says they
  should not have to.
- **Lifecycle.** Better is: the pause-marks model every product teaches (Loopic pause frames,
  UE Stop marks, Viz stop points, XPression mid-pause) as a STRUCTURAL default path - which is
  exactly `steps` - plus interruption rules none of them let a designer state (exit-time,
  auto-reverse on early Out). The default path stays primary; Unreal, with a full state-machine
  plugin on the shelf, still teaches the linear mark walk first.
- **Looping.** Better is: one control on a track that says "keep doing this until the Out",
  truthfully drawn. Loopic's recipe has a documented defect; Singular's Behaviors are per-widget
  idles outside the timeline; UE's Animators are a second animation system beside keyframes. Our
  model is already right and already drawn - it is one editing affordance short.
- **Update.** Better is: a value change on air is an AUTHORED phase, per field - Chyron's
  per-object update transitions, Singular's three-dropdown update animations and Flowics'
  old/new text pairs prove the demand; the owner's own stories (stat readouts animate old to
  new, never recount) already require it. Nobody offers it structurally on a state model; we
  can, without touching "data never transitions" - it is a visual policy on the binding, not a
  transition.
- **Logic authoring.** Better is: **a person who cannot read a graph still gets the
  behaviour.** The desktop class proves designers need logic and then buries them in three to
  five overlapping systems; Rive proves a single structural model works but is the learning
  cliff even for motivated designers; the web class proves the cost of offering nothing. The
  bar is a LADDER with one model under it (§4f) - named behaviours, then sentences, then the
  graph - never a second model beside the first.
- **Data binding.** Better is: the field an operator types into and the property it drives are
  the same object, promoted in one gesture (Singular's node, MXMZ's variable, Chyron's drag to
  Replaceables) - plus Flowics' binding modal discipline and MXMZ's live autocomplete against
  real feed data. Our field model is stricter than any of their payloads; the gesture and the
  feed-side UX are what to borrow. `docs/CONTROL_PANEL_ROAD.md` §5 owns the shared-data plane.
- **Operator handoff.** We are ahead, and it is not close: generated-from-the-machine with
  structural legality against hand-built panels (XPression/DashBoard), a generated form without
  legality (Singular, MXMZ), per-target definition files (Loopic), and derived-but-frozen
  surfaces (Flowics). What the incumbents add that we lack is CURATION of the contract - UE's
  controller IDs and descriptions, AE's groups and comment rows, XPression's published order -
  authored metadata on the exposure, which for us is `machine.controls` without an editor.
- **Package.** Better is: Figma's token modes over our :root contract (one attribute retheme,
  named tokens, never positional switches), Chyron's base-scene instinct (change one thing,
  a hundred graphics follow) as nested graphic instances with exposed properties, and MXMZ's
  cheap restorable version history. Nobody in broadcast has tokens; this axis is winnable.
- **Content-aware layout.** Better is: Rive/Figma's vocabulary (hug/fill/fixed, min/max,
  explicit per-text overflow policy, layout-animation policy) NATIVE over CSS, which we
  generate anyway - against a field where the incumbents ship pairwise tricks (Auto Follow,
  parenting hacks), the web class ships squeeze modes or duplication, and MXMZ ships nothing.
  §4d takes this axis whole.

---

## 4. The major authoring problems, named with their boundaries

### 4a. The three concepts the brief separates - adopted as vocabulary

Every mature system separates, under whatever names:

1. **CONTROL EXPOSURE** - what an operator may change. Ours: fields (`fN` → `id="fN"`) plus
   `machine.controls` metadata. Graphic-owned, travels in the template, versioned with it.
2. **GRAPHIC BEHAVIOUR** - what happens when an event occurs. Ours: the one `NOACG_ANIM` block -
   steps, machine, timers, styles. Graphic-owned.
3. **OPERATOR/CONTROL APPLICATION** - how capabilities are presented to the person running THIS
   production. Ours: generated panels always; the production control profile as the sanctioned
   arrangement layer - decided in `docs/CONTROL_PANEL_ROAD.md` §3, deferred to entirely.

The evidence that these are genuinely three: UE's exposed-properties vs Controllers vs rundown
pages; Viz's control plugins vs Transition Logic vs Trio pages; Singular's nodes vs scripts vs
Studio/UNO instances. The boundary that matters for AUTHORING: 1 and 2 are authored in the
graphic and may share surfaces; 3 is production state and is never authored in the graphic.
These may live on different authoring surfaces even though they share contracts - the brief's
phrasing, confirmed by every system read.

### 4b. Lifecycle and interruption

The industry's one convergent model (§3, Lifecycle). What no competitor lets a designer state,
and real operation needs, are the interruption rules: Flowics auto-reverses an interrupted
entrance; Viz plays pairs backwards when a transition is missing; our serial queue finishes the
running timeline instantly and evaluates against the new state - deterministic, but blunt. Two
additive, no-version-bump candidates carried from the first edition, both still right:
**exit time** on a transition (refuse to fire until the source has played a stated fraction) and
an **Any State** authored edge (snap already covers recovery structurally). A third joins them
from this round: a declared **interrupted-entrance policy** (finish / reverse / cut), because two
products ship a hard-coded answer and operators rely on it.

### 4c. Update as an authored phase

The strongest cross-system convergence this research found (Chyron per-object update
transitions; Singular update animations; Flowics text pairs; Viz back-to-back; UE sub-layers) -
and a place our doctrine is already correct: **data updates never cause transitions** stays,
because an update animation is a per-field VISUAL policy (old-out/new-in, count old→new,
crossfade), not a state change. The owner's operator stories already demand it (stat readouts,
scoreboard corrections). Direction: a declared per-field update style, written into the template
as generated code the way presets are - authorable where the field is authored, no machine
involvement, degrades to the instant write everywhere the style is absent.

### 4d. Content-aware layout - a major axis, and a winnable one

The brief names it; the research sharpens it into three findings:

1. **The vocabulary is settled outside broadcast.** Hug / fill / fixed per axis, min/max,
   wrap, and an EXPLICIT per-text overflow policy (grow / wrap / shrink / ellipsis - authored,
   never an accident) is Rive's and Figma's shared language, it maps almost one-to-one onto the
   CSS we already generate, and AE's expression folklore is the documented cost of not having
   it.
2. **Broadcast ships pairwise behaviours instead.** Auto Follow / Auto Size / Auto Hide
   (Chyron, UE) are the named, teachable subset - "the background hugs the name", "the logo
   tracks the text end" - and they are what a lower third actually needs on day one.
3. **We already have a third thing neither class has:** the import road's MEASURED fit ladder
   (grow → wrap → shrink, symmetric growth capped by the design's own margin, squeeze past the
   floor) - decided per field, judged against the artwork, owner-refined over three walks. And
   the TOO-LONG report rides the control plane to the operator.

Direction, compared not chosen: (a) adopt the hug/fill/fixed + overflow-policy vocabulary as
the NAMING standard across Inspector, import mapping and generated code, so the fit ladder,
catalog auto-fit and any future flow layout speak one language; (b) keep pairwise
follow/hug behaviours as the surfaced form on imported artwork (they match how designers think
about artwork, per Chyron/UE); (c) a full flow-layout container model (rows/columns/wrap) is a
LATER, needs-evidence step - imported artwork is not a flow, and Figma proves the two regimes
(flow + constraints) can coexist when that day comes. What must not happen: Singular's
adaptive-by-duplication as the responsive story, or MXMZ's vector-scale claim standing in for
layout.

### 4e. The exposure workflow

The brief's ask: the shortest workflow from "select a property" to "see and test the generated
control". Today creation IS exposure (a field is born operator-visible - wizard, type, import
mapping, "+ Add"), and the Rehearse panel already shows the result live [measured]. What does
not exist: **promoting an existing element or property** after the fact (every competitor's
signature gesture - §3 Data binding), and **curating the exposure** (rename into operator
language, order, group, instruction rows, default AND reset values, immediate-vs-staged - the
union of UE controllers, Singular node settings, AE panel formatting, XPression published
order). Both are additive: promotion compiles to the same field transforms the panels already
speak, curation is `machine.controls` metadata growing an editor surface. The test the brief
implies, worth adopting as the bar: property picked → exposed → seen working in Rehearse,
without leaving the editor, in under a minute.

### 4f. Behaviour - the progressive ladder over one model

The brief's three levels, confirmed independently by UE's ladder (behaviors → transition logic →
scene state → code) and by the failure modes at both ends (web class: nothing; desktop class:
sprawl):

1. **Named broadcast behaviours** - "count up on goal", "loop until out", "lock then reveal" -
   attached to artwork, each a real machine fragment written into `NOACG_ANIM`. The behaviour
   attach road (`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §10) and the graphic-type registry ARE this
   level's foundation; the wizard's offer step (`docs/CONTROL_PANEL_ROAD.md` §9) is its door,
   with demand recorded through `src/feedback/` so the library grows from asks, not guesses.
2. **Understandable event→action rules** - a sentence surface ("when the timer reaches zero,
   hold at 0:00"; "on Goal Home, +1 and play the flash") over the same machine - Rive's
   listener shape with operator vocabulary. The grammar is where this succeeds or fails, and it
   does not exist yet; UE's Conditional Behavior ("one integer switches a bundle") and
   Chyron's Evaluate tracer (SHOW which rule fired and why) are the two mechanics worth
   stealing when it is designed.
3. **The machine graph** - exists, works [measured], stays - as the escape surface for what
   simpler levels cannot express, not as the normal user's route. The owner's verdict and
   Rive's learning-cliff evidence agree; UE demotes graphs the same way.

The invariant under all three: ONE model. Every level writes the same `NOACG_ANIM` machine;
a level is a projection, never a store. XPression/Chyron/PRIME's parallel-logic sprawl is the
best-documented trap in this entire research round.

### 4g. Package-level authoring

The brief's framing (not hundreds of isolated templates) against the evidence: Viz's master
scene, Chyron's base scenes + referenced styles + message deltas, UE's spak bundles, Figma's
tokens with modes, AE's linked instances with push/pull. Ours today: the :root style contract
per template, brand capture, kits at creation, productions as the grouping - consistency at
CREATE time, nothing that keeps a shipped package consistent LATER. Directions, in likely
order of value: **(a)** the :root contract grown explicitly token-shaped with named modes
(Figma's mechanism in plain CSS - one attribute retheme, additive), **(b)** nested graphic
instances with exposed properties (the template-insert door exists; the missing half is the
instance staying LINKED with overrides, AE's push/pull semantics), **(c)** package-level
version history (MXMZ's cheap restore). All post-deadline; (a) is the one that changes how
kits and Pro packages are built and should be designed first.

### 4h. Custom control applications - deferred, one authoring-side invariant kept

The three-level question (generated always / visual builder / SDK) is the control road's:
generated panels are §2 there, production-level arrangement is the §3 profile, and automation
clients are §4.5 (one more writer of the command log - the log IS the API; an SDK is
packaging, not architecture). What this document adds, as the AUTHORING invariant the brief
states: **a custom controller must never become the only place that knows how a graphic
behaves.** Structurally true today - a panel can only send declared events, and the guard drops
anything else - and every future exposure/curation feature in §4e must preserve it: metadata
may present capabilities, never mint them.

### 4i. Preview and rehearsal

Singular's author-rehearses-the-operator instinct, Viz's Logicmaker click-a-state, Chyron's
Evaluate tracer and live mode, Flowics' watermark-not-preview lesson - against our event strip,
Rehearse panel, state-chip poll, graph click-to-snap and settled design view [measured]. We are
ahead of the web class and match the best desktop ideas; the §1b defect list (Space, run-report,
branch scrub) is what keeps it from being clean, and defect 3 (the owner's blank stage) is the
reminder that none of it counts on a screen where the stage is empty.

---

## 5. Borrow and refuse - the consolidated lists

**Borrow (each names its evidence):**

1. Loop as one timeline affordance on the shipped model (the market's weakest spot; Loopic's
   documented defect).
2. Update animation as a declared per-field policy (Chyron/Singular/Flowics convergence; the
   owner's stat story).
3. Exit time + Any State + interrupted-entrance policy, additive on `AnimTransition`
   (Rive properties; Flowics auto-reverse).
4. The promote gesture and exposure curation - labels, order, groups, instruction rows,
   default/reset, staged-vs-immediate (Singular nodes, UE controllers, AE panel, XPression
   order).
5. Hug/fill/fixed + explicit overflow policy as the layout vocabulary; pairwise follow/hug
   behaviours as the surfaced form (Rive/Figma; Chyron/UE).
6. Field-selected → element highlighted in preview (Viz Trio's tab-field bounding box) - cheap,
   and it teaches the mapping.
7. Token modes over the :root contract; linked instances with push/pull (Figma; AE).
8. A "which arrow fired and why" trace in Rehearse (Chyron's Evaluate; also the control road's
   §7 torture pass's natural instrument).
9. Per-glyph text animation as two knobs (Rive text modifiers: range + offset over generated
   spans) - broadcast-package polish with zero timeline literacy.
10. Cheap auto-version history with restore (MXMZ) - product surface over the existing
    versioned-document invariant.

**Refuse (complexity with named victims):**

1. A second behaviour store or scene model beside the code - XPression's four logic systems,
   PRIME's nine, Singular's four script scopes; the single strongest pattern in the research.
2. Expression-language guards - structural stays; Chyron shows even a nice Conditions tree
   ends in `ReadFile()`; AE's index-switched dropdowns show positional logic rotting.
   (Declared VALUE transforms - count-up formats, Rive-style converters - are a separate axis
   and not covered by this refusal.)
3. Consistency by naming convention - Viz's case-sensitive `O`; references stay structural,
   picked from lists, validated.
4. O(n²) state-pair transition authoring - per-state enter/exit + styles compose; pair
   overrides only ever as the exception.
5. Dialog-mediated timeline editing (XPression) and paywalled craft (Loopic).
6. Adaptive-by-duplication (Singular) and vector-scale-as-responsive (MXMZ).
7. A second clock (Loopic's detached playhead) - the determinism argument is one queue, one
   clock, unchanged.
8. Import-only authoring (MXMZ) - import AND catalog AND wizard AND agent; and the engine's
   plumbing in the author's face (PRIME z-buffers, UE project mechanics).
9. Pointer-first interaction authoring (Rive listeners aimed at a mouse) - our event source is
   an operator; sentences and panels, not stage-placed hotspots.
10. MOGRT's time-stretch semantics for holds - the gesture (mark intro/outro) is good and maps
    to deriving the three-state machine; the slow-motion middle is not.

---

## 6. Credible directions, compared

Five shapes the authoring system could take. Compared honestly; none chosen here.

**D1 - One graphic model, several authoring surfaces** (the brief's working hypothesis).
Canvas, Inspector, timeline, graph, Rehearse, code - all deterministic patch-writers over one
`SpxTemplate`, surfaces added or demoted by audience. *For:* it is literally today's
architecture, measured working end to end (§1b); it is how UE and Viz structure authoring over
one scene; it is the only shape that avoids the parallel-logic trap while still serving both
named users. *Against:* surface sprawl has its own confusion cost (PRIME needed diagnostics
panels to answer "where did this behaviour come from" - mitigated here by the one data block,
but real); each surface must be kept honest to code, which is engineering discipline forever.
*Evidence that would settle it:* the proving rounds and student walks - if users can answer
"where do I do X" without a manual, the shape holds.

**D2 - Two products: a student editor and a pro editor.** *For:* an uncluttered student
surface; Singular ships the shape (Composer vs UNO). *Against:* it forks the model or the UI
tree, doubles maintenance, and the brief demands the two users COEXIST - which progressive
disclosure (the Advanced toggle, panels that appear with content) already delivers without a
fork. Weakest of the five; kept because it must be argued against, not assumed away.

**D3 - Import-first with behaviour attach; the editor stays thin.** *For:* MXMZ proves the
shape at broadcast scale with one-day training; it is the current push, shipping; it defers
editor investment until demand names it. *Against:* it is a ROUTE, not an endgame - drawn-in-app
graphics, package authoring and level-2 behaviour all eventually need the editor; MXMZ's own
ceiling (no behaviour, no layout) is the warning. Best read as the near-term road INTO D1, not
an alternative to it.

**D4 - Graph-first (the Rive shape).** *Against, decisively:* tried, owner-judged not landed;
Rive's community names the machine as the cliff; UE demotes graphs below form-filling
behaviors. The graph remains as D1's level-3 surface. No new evidence supports another attempt
at graph-as-primary.

**D5 - A richer internal scene model (the industry default).** *Against, decisively:* pillar
four; and this round measured the cost on the other side of the fence - escape-hatch gravity
(Singular scripts, Flowics' Google-Sheet control surfaces), closed formats (Loopic's minified
runtime), publish-time rigidity. The code floor is the moat; every competitor read reinforced
it.

**The honest comparison:** D1 carried by D3 in the near term is the strongest hypothesis, with
D2 absorbed as progressive disclosure inside D1 and D4/D5 refused on evidence. This is a
hypothesis with a named test, not a decision.

---

## 7. The staged path - the brief's sequence, examined

The brief's ten steps, each annotated for/against from this research. A hypothesis to validate,
not an approved order.

1. **Basic editing genuinely reliable.** Endorsed, made concrete: the §1b defect list (Space
   swallow, run-report, the owner's blank stage chased in the field, align/distribute, rulers/
   guides, catalog typography reach, grouping) IS this step. Nothing architectural inside it.
2. **The smallest excellent property→operator-control workflow.** Endorsed; §4e defines it
   (promote + curate + Rehearse-in-a-minute). Reuses the generated-control architecture
   entirely; Singular is the reference, not the model.
3. **Professional animation authoring genuinely usable.** Endorsed, with contents named: loop
   authoring (small), update-animation policy (§4c), interruption rules (§4b), branch-scrub.
   The brief's warning stands - do not build behaviour on an unpleasant animation workflow.
4. **Prove the complete loop.** Already the plan: GOALS NOW 3 plus the control road's §8
   proving rounds with the §7 torture pass. This document adds nothing on top - deliberately.
5. **Content-aware layout and data binding.** Layout: adopt the vocabulary first (§4d), build
   later. Data: the binding UX borrows (§3) ride the shipped production-data plane.
6. **Simple broadcast behaviours.** The level-1 library (§4f), grown from recorded demand.
7. **Event/action authoring.** Level 2; the grammar is design work that has not started, and
   should not before 6 has taught the vocabulary users actually reach for.
8. **Deep state-machine editing only where simpler surfaces cannot express it.** Matches
   today's demotion; the graph is maintained, not grown, until 6-7 exist.
9. **Package-level authoring.** §4g's order: tokens/modes designed first.
10. **Custom Control Apps / SDK / automation.** The control road's; nothing to sequence here.

Amendments this research argues for: pull the LOOP control forward into step 3 explicitly (it
is one affordance on a shipped model and the market's weakest spot), treat the LAYOUT VOCABULARY
as a step-5-independent naming decision that steps 1-3 should already speak, and keep step 4
where it is - it is the evidence source for every "needs evidence" row in §8.

Sequencing sanity against the calendar: steps 1-4 are exactly the post-2026-09-12 continuation
of the current push; nothing above threatens the deadline work, and nothing in the deadline work
pre-commits an answer this document leaves open.

---

## 8. Decisions safe now, decisions needing evidence, and assumptions that must not harden

### Safe to decide now (the research is sufficient)

1. **One model, several surfaces (D1) as the working frame**, entered through import-first
   (D3); two-product forks and graph-primacy are off the table.
2. **The three-concept vocabulary** (exposure / behaviour / application) adopted in docs and
   UI language, with application owned by the control road.
3. **The behaviour ladder** (named behaviours → sentences → graph) over the ONE machine; no
   second behaviour store, ever.
4. **Loop authoring in the timeline** as the first animation affordance; **update animation as
   a declared per-field policy** as the second - both additive, both demanded by owner stories.
5. **The layout vocabulary**: hug/fill/fixed + explicit per-field overflow policy as the naming
   standard the Inspector, the import mapping and generated code all speak.
6. **Exposure curation lives in the graphic** (`machine.controls` grows an editor surface);
   arrangement lives in the production profile; neither may mint capability.
7. **The refuse list (§5)** as standing review vocabulary - especially no parallel logic
   systems and no expression guards.

### Needs evidence before deciding (and what the evidence is)

1. **Whether promote-from-canvas or field-first creation is the student's primary exposure
   route** - the student walks and the 09-12 production tell.
2. **The named-behaviour library's vocabulary and size** - grown from `src/feedback/` records
   and proving rounds; freezing a schema now would repeat the third-case mistake.
3. **The event/action sentence grammar** - prototype against real recorded asks only.
4. **Flow-layout containers for drawn-in-app graphics** - not before drawn-in-app graphics are
   a real workflow; imported artwork is served by the ladder + followers.
5. **How much graph investment (branch scrub, layout, grouping) is worth making** - after the
   behaviour library exists and shows what the graph is still needed FOR.
6. **Package tokens/modes design** - after Pro's package work names the tokens a real package
   actually varies.

### Assumptions that must not become permanent invariants

Correct today; each would be wrong to freeze. (The control road's §10 carries the control-plane
list; these are the authoring-side ones.)

1. **The editor is "Advanced mode".** A release posture for the student push, not an
   architecture; the staged path assumes the editor becomes a first-class surface again.
2. **`fN` → `id="fN"` as the only exposure vocabulary.** The SPX compatibility contract stays;
   but types already name fields logically, and promotion/curation may need aliased, logical
   naming above the positional ids. The wire contract must not become the authoring language.
3. **The positional step binding (`defaultPath[i]` = `steps[i]`).** Load-bearing and correct;
   a future surface that needs addressed timelines has the versioned-migration mechanism to
   change it - the binding is an implementation, not a promise.
4. **One 1920×1080 canvas.** Parity with MXMZ's vector-scale today; when adaptive outputs
   arrive they must be real layout (§4d), and nothing may meanwhile assume the canvas IS the
   output.
5. **"No expression language, ever" read wider than guards.** The guard rule is permanent;
   declared value transforms (formatting, count-up, converters) are a different axis and must
   not be refused BY that rule when their day comes.
6. **Panels generated only from fields + machine.** The profile (arrangement) and curation
   metadata will both sit above the same generation; "generated" must not harden into
   "uncustomizable".

---

## 9. Recommended next decisions for the owner

Short, in order, each one sentence of consequence:

1. **Ratify the frame** - one graphic model with several authoring surfaces, entered
   import-first; this ends "which editor do we build" as an open question and makes every
   surface a projection of the one document.
2. **Ratify the ladder** - named behaviours first, sentences second, graph as the escape - so
   behaviour investment after 09-12 starts at level 1, not at a better graph.
3. **Approve step 1's content** - the §1b defect list as the definition of "basic editing
   reliable", starting with the Space key and the blank-stage chase, since a student meets
   those before any new capability.
4. **Approve the two animation slices** - loop authoring in the timeline, then the per-field
   update-animation policy - as the first post-deadline editor work; both are small, both are
   owner-story-driven.
5. **Bless the layout vocabulary** (hug / fill / fixed + explicit overflow policy) as the
   naming standard so import, Inspector and generated code stop inventing three dialects.
6. **Decide the exposure-curation seat** - confirm `machine.controls` as where operator-facing
   labels/groups/order live and let the editor grow that surface, keeping arrangement in the
   control road's profile.
7. **Leave open, explicitly** - the sentence grammar, the behaviour library's contents, flow
   layout, and graph investment - each until its named evidence (§8) exists.

---

## Sources

Our editor: measured in a fresh browser session 2026-08-28 against the dev build (probe list
and screenshots in the session record; specs cited inline). The owner's reports:
the editor-stage-blank handoff (removed from the tree; `git show 0eec5a83:docs/handoffs/2026-08-27-editor-stage-blank.md`), `docs/GOALS.md` NOW/THEN, the 2026-08-25/26
walk records. Control axis: `docs/CONTROL_PANEL_ROAD.md` (2026-08-28) and its sources.

Competitors - public material only, all read 2026-08-28 by dedicated research passes
(workflow-grounded, tagged [doc]/[video]/[marketing]/[inferred] per claim). Key entry points;
visual evidence is linked here and never embedded in this repository:

- **Ross XPression**: [User Guide 12.6 PDF](https://documentation.rossvideo.com/files/Manuals/CG%20and%20Graphics/XPression/User%20Guides/XPression%20User%20Guide%20(3500DR-001-12.6).pdf)
  (Set Keyframe dialog, Publish/Template Links, Transition Logic worked example, Visual Logic,
  DataLinq dialogs, Auto Squeeze/Scale);
  [documentation portal](https://www.rossvideo.com/support/product-documentation/xpression-documentation/);
  [XPression U index](https://www.rossvideo.com/products/graphics-and-virtual/xpression-u/);
  [keyframe editing video](https://www.youtube.com/watch?v=wvwQZQpkK34);
  [DashBoard CustomPanel guide](https://documentation.rossvideo.com/files/software/dashboard/DashBoard%20CustomPanel%20Development%20Guide%20v9.16.pdf).
- **Vizrt**: [TL tutorial](https://docs.vizrt.com/viz-artist-guide/5.4/Tutorial.html) (master/
  object build, ControlObject setup);
  [state transition mechanics](https://documentation.vizrt.com/viz-artist-guide/3.14/State_Transition_Animation.html)
  (search order, reverse playback, the Euler-walk combinatorics);
  [Logicmaker](https://documentation.vizrt.com/viz-artist-guide/5.0/Logicmaker.html);
  [Stage/keyframes](https://docs.vizrt.com/viz-artist-guide/5.4/Create_a_Basic_Animation.html);
  [Control Object](https://docs.vizrt.com/viz-artist-guide/3.9.1/Control_Object.html);
  [Trio tab fields](https://docs.vizrt.com/viz-trio-guide/4.2/Tab_Fields_Window.html);
  [text fitting](https://docs.vizrt.com/viz-artist-guide/5.4/Viz_Engine_Text_Editor.html);
  [Trio operator video](https://www.youtube.com/watch?v=wMfdbINxzh0).
- **Chyron PRIME**: [5.4 help center](https://help.chyron.com/hc/en-us/categories/23388064318484-PRIME)
  (42 public chapters); [Timeline Editor](https://help.chyron.com/hc/en-us/articles/50376312665108);
  [Effects incl. Auto Follow/Scale/Hide/Spacing/Duplicate](https://help.chyron.com/hc/en-us/articles/50376244933140);
  [Scene Control Panel](https://help.chyron.com/hc/en-us/articles/50376479472916);
  [Replaceables](https://help.chyron.com/hc/en-us/articles/50376537247124);
  [Auto Follow video](https://youtu.be/nXq_Pl7MWDg);
  [video index](https://help.chyron.com/hc/en-us/articles/23444078026772).
- **Singular.live**: [timeline animations](https://developer.singular.live/singular-basics/building-overlays-in-composer/animating-overlays/how-to-create-timeline-animations);
  [update animations](https://developer.singular.live/singular-basics/building-overlays-in-composer/animating-overlays/how-to-create-update-animations);
  [behavior animations](https://developer.singular.live/singular-basics/building-overlays-in-composer/animating-overlays/how-to-create-behavior-animations);
  [Composer reference](https://developer.singular.live/singular-basics/building-overlays-in-composer/composer-reference);
  [adaptive walkthrough](https://developer.singular.live/singular-basics/building-overlays-in-composer/how-to-adapt-overlays-to-various-screen-sizes);
  [control-node video](https://www.youtube.com/watch?v=7gc-2226jWs);
  [Studio operation video](https://www.youtube.com/watch?v=ukNmky0oyGU).
- **Viz Flowics**: [Graphics Editor tour](https://support.flowics.com/en/articles/8869060-introducing-the-graphics-editor);
  [Transitions Panel](https://support.flowics.com/en/articles/8870454-transitions-panel);
  [overlay in/out (auto-reverse)](https://support.flowics.com/en/articles/8870464-overlay-in-out-transitions);
  [data bindings](https://support.flowics.com/en/articles/9148229-working-with-data-bindings);
  [Rundown Control](https://support.flowics.com/en/articles/8870302-rundown-control-for-graphics);
  [soccer control-in-a-Sheet](https://support.flowics.com/en/articles/8945458-soccer-graphics-custom-control-interface);
  [list transitions video](https://www.youtube.com/watch?v=N-YPyrohs8Y).
- **Loopic**: [user interface](https://docs.loopic.io/user-guide/fundamentals/user-interface/);
  [animation](https://docs.loopic.io/user-guide/animation/);
  [looping](https://docs.loopic.io/user-guide/examples/looping/);
  [actions API](https://docs.loopic.io/api/loopic/);
  [template definition builder](https://docs.loopic.io/user-guide/exporting/template-definition-builder/);
  [pricing](https://loopic.io/pricing).
- **MXMZ**: [editor screenshot](https://www.mxmz.com/assets/editor.jpg) (variables + JSONata +
  keyframe lanes - their single most revealing public artifact);
  [editor video](https://www.mxmz.com/assets/videos/mxmz-editor.mp4) (fps dropdown, IN/OUT
  timeline, Repeater, version restore);
  [match control](https://www.mxmz.com/assets/images/products/matchcontrol.jpg);
  [Cloud Editor](https://www.mxmz.com/products/cloud-editor); [Operator](https://www.mxmz.com/products/operator);
  SVG Europe interview (svgeurope.org, "MXMZ puts SVG and HTML5 at the heart of broadcast
  graphics"); [Grass Valley partner page](https://www.grassvalley.com/grass-valley-alliance/mxmz/).
- **Rive**: [layouts overview](https://rive.app/docs/editor/layouts/layouts-overview);
  [component sizing](https://rive.app/docs/editor/layouts/component-sizing);
  [N-slicing](https://rive.app/docs/editor/layouts/n-slicing);
  [keys](https://rive.app/docs/editor/animate-mode/keys);
  [text modifiers](https://rive.app/docs/editor/text/text-modifiers);
  [data binding + lists](https://rive.app/docs/editor/data-binding/lists);
  [state machine docs](https://rive.app/docs/editor/state-machine/state-machine);
  [layout video playlist](https://www.youtube.com/playlist?list=PLujDTZWVDSsGvor80PkjHaZ3hNNo6s_ef).
- **Unreal Motion Design**: [Your First Graphic](https://dev.epicgames.com/documentation/en-us/unreal-engine/your-first-graphic-with-motion-design-in-unreal-engine)
  (every panel, RC rigging, rundown, broadcast channels);
  [quickstart](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-design-quickstart-guide-in-unreal-engine);
  [animators](https://dev.epicgames.com/documentation/unreal-engine/animators-in-unreal-engine);
  [modifiers incl. Auto Size/Follow](https://dev.epicgames.com/documentation/unreal-engine/modifiers-in-unreal-engine);
  [Scene State](https://dev.epicgames.com/documentation/en-us/unreal-engine/scene-state-for-unreal-engine);
  [rundown server](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-rundown-server-for-motion-design-in-unreal-engine);
  [Unreal Fest toolset tour](https://www.youtube.com/watch?v=5P-sO_2aiwU);
  [transition logic 5.7 video](https://www.youtube.com/watch?v=959aWSqruJ4).
- **After Effects / Figma**: [creating MOGRTs](https://helpx.adobe.com/after-effects/using/creating-motion-graphics-templates.html);
  [responsive design - time](https://helpx.adobe.com/after-effects/using/responsive-design.html);
  [essential properties](https://helpx.adobe.com/after-effects/using/essential-properties.html);
  [dropdown controls](https://helpx.adobe.com/after-effects/using/create_dropdowns_using_expressions.html);
  [Figma auto layout](https://help.figma.com/hc/en-us/articles/360040451373);
  [constraints](https://help.figma.com/hc/en-us/articles/360039957734);
  [component properties](https://help.figma.com/hc/en-us/articles/5579474826519);
  [variables + modes](https://help.figma.com/hc/en-us/articles/15343816063383).

**Still unresearched, and it should make you uncomfortable:** every claim here about the
desktop incumbents comes from documentation and video, not hands-on time - a day inside a real
XPression or Viz installation would grade their level-2 claims the way §1 graded ours; MXMZ's
behaviour ceiling and per-sport panel authorship are known only by absence of evidence; and
Singular's App SDK docs are email-gated. Each is a demo account or a broadcast-engineer
conversation away, and each could move a row above.

## 9b. The seven decisions, settled 2026-09-03

Section 9 put seven items to the owner. Under his ruling the same day
(`docs/acceptance/OWNER_QUEUE.md`, "A design default is NOT a taste question") a question with a
defensible general answer is answered rather than escalated. One of the seven he had already
ruled; the other six are settled here with the reasoning, to be overruled rather than adjudicated.

**1. The frame is RATIFIED - and it was never as open as §9 made it sound.** Root `AGENTS.md`
principle 1 already says the code is the single source of truth and that nothing hides behind a
visual-only scene model. "One graphic model, several authoring surfaces, each a projection of the
one document" is that principle stated for the editor rather than a new commitment. Import-first
entry is likewise the shape the NOW push already has. So this closes a question the contract had
answered, which is worth recording precisely because it stops being re-argued.

**2. The ladder was ALREADY RULED, 2026-09-01.** The owner accepted P2's shortlist that day -
M1 behaviour recipes and M4 the sentence board - in his words, *"we can go with these"*. Named
behaviours first, sentences second, graph as the escape is that shortlist with an escape hatch. It
needed recording against this doc, not deciding.

**3. Step 1's content is ENDORSED as written.** The §1b defect list is the definition of "basic
editing reliable", and the ordering argument is sound: a student meets a swallowed Space key before
they meet any new capability. Current state, which §9 could not know: defects 1 and 2 are FIXED and
awaiting his walk (`docs/acceptance/owner-queue/2026-08-29-space-over-the-stage-plays.md`); defect
3, his blank stage, remains unreproduced anywhere but his screen and is an environment fault to
catch in the field; defect 4, align and distribute, is the one genuine capability gap left in the
list.

**4. The two animation slices are APPROVED to start**, with one ordering note that outranks them:
`docs/backlog/scoreboard-behaviour.md` is the first row of the next wave, because it is half the
2026-09-12 goal and does not exist. A date is not a gate (owner, 2026-09-03) but a missing half of
a dated goal is a fire, and his own test is "no other fires to put out first".

**5. The layout vocabulary is BLESSED: hug / fill / fixed, with an explicit overflow policy.** Not
a coin toss - it is Figma's vocabulary, which is what the designers exporting the SVGs we import
already have in their heads, so it is the one choice that costs a designer nothing to learn. Three
dialects across import, Inspector and generated code is the same drift failure ruled against twice
on 2026-09-03 (two copies of a decision disagree, and someone reads the stale one).

**6. `machine.controls` is CONFIRMED as the exposure-curation seat.** The control layer already
generates every operator surface from the machine, so operator-facing labels, groups and order
living anywhere else creates a second source for the same fact. Arrangement stays in the control
road's profile, as §9 proposed.

**7. The four open items STAY open, explicitly**, each until its named §8 evidence exists: the
sentence grammar, the behaviour library's contents, flow layout, and any graph investment. Leaving
them open is the decision, and it is recorded so nobody treats silence as permission.

**What is still genuinely his:** whether the §1b defect list matches what using the editor feels
like to him. That is a walk, not a question, and two of its entries are already waiting in the
queue for one.
