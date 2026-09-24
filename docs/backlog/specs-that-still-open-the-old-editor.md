---
v: 2
source: owner
kind: ask
raised: 2026-09-24
state: unstarted
asked: "53 of the 166 specs switch into Advanced mode ... Many others only open the old editor to check what an import, a wizard walk or an export produced. Those cover things still in the product, so they must check through the library, the control page, the export or the new editor instead. Do not just delete them."
serves: NOW
size: large
touches: e2e/
needs-owner: none
---
# Specs that still open the old editor

**Filed:** 2026-09-24. **Source:** owner goal 3 of the 2026-09-24 night wave, split as he allowed:
"skip the rest with a backlog pointer so CI stays green, and finish the rewrite after the demo".
Row A (branch `claude/a-close-old-editor`) closed the old code editor and skipped these; row F
rewrites them.

## Why

No route renders the old code editor (AppShell) any more, so every test that reached it can only
fail. These tests cover imports, wizard walks, productions, playout and exports that are still in
the product, so skipping them is a hole in coverage, not a clean-up. Until they are rewritten, a
regression in those areas can merge green.

## How they skip

The skipped spec files were not edited, bar the one noted under the configured suite. The four helpers in `e2e/_create.ts` that reached the old
editor - `enableAdvancedMode`, `switchToAdvancedMode`, `finishIntoEditor` and `createProject` -
now call `skipOldEditor()`, which skips the RUNNING test with a reason naming this file
(`OLD_EDITOR_SKIP`). The configured suite's `createGraphic` in `e2e/configured/_helpers.ts`
reaches it through `finishIntoEditor`. So a test skips exactly when it calls one of them, and a
rewritten test stops skipping the moment it stops calling them.

## What it would take

For each test below, reach the same product behaviour without AppShell:

- **A graphic in the working slot** (`createProject`): its body is still in `e2e/_create.ts`
  below the skip, and without the skip it ends on Home with the created template as the working
  document. Callers that only need that template and then walk to Home, the control page
  (`#/control/<id>`), a production or the export window come back cheaply; give them a
  bootstrap that does not skip.
- **The Finish step's code-editor door** (`finishIntoEditor`, `wz-finish-editor`): end on
  "Edit this graphic" (`wz-finish-edit-artwork`, the new editor) or on the production door
  (`addToProductionFromFinish`), and assert what the import or wizard walk produced there.
- **Tests whose subject IS an old-editor panel** (the dock tabs, canvas, timeline, code pane,
  Inspector, machine graph): the feature is unreachable now. Port the assertion to the new editor
  where it has the feature, or delete the test and say so here, because it tests dead code.

When a spec stops calling the helpers, delete its entry below. When the list is empty, delete the
helpers, `OLD_EDITOR_SKIP` and this file.

## Evidence

The list below is a STATIC scan made on 2026-09-24 of every test that calls a retired helper
directly, through a local function, or from a `beforeEach` in scope (TypeScript AST, row A's
handoff). It found 687 of 974 tests in 95 offline spec
files, and 24 of 34 in 19 configured spec files.
The owner's figure of 53 counted only the specs that switch into Advanced mode by name; the other
files reach the old editor through `createProject`, which switched it on for them. Three specs
whose only subject was the old editor were deleted rather than skipped: `advanced-mode.spec.ts`,
`old-editor-doors.spec.ts` and `lazy-editor.spec.ts` (Monaco's lazy load inside AppShell).
`e2e/no-old-editor.spec.ts` pins the closed state.

## Offline suite

### `e2e/adapt-first.spec.ts` - 3 of 3 skipped

ADAPT-FIRST Create with AI, end to end (docs/ADAPT_FIRST_PLAN.md).

- a brief becomes a customized graphic adapted from a proven design
- the shortlist is shown, and picking another design rebuilds on it for free
- an off-catalog brief keeps the full catalog listing, so the create route is untouched

### `e2e/ai-consent.spec.ts` - 1 of 2 skipped

Create with AI is disclosed through the public Terms and Privacy pages linked during account creation.

- the offline stub generates without ever showing the notice

### `e2e/ai-lite.spec.ts` - 2 of 2 skipped

- Lite creates one grounded graphic, records usability and acceptance, and opens the normal editor
- Lite explains an unsupported package request without calling a code or fallback route

### `e2e/ai-more-control.spec.ts` - 3 of 3 skipped

Create with AI — the "More control" structured setup: category pinning, user-defined data fields, animation intensity, draft persistence, and the untouched prompt-only default.

- structured setup: pinned category + user fields + intensity land in the created project
- collapsing sections and closing the wizard preserve the entered setup
- prompt-only generation injects no structured setup and keeps the full category space

### `e2e/ai-panel.spec.ts` - 3 of 3 skipped

The editor's AI assistant panel (AIPromptPanel).

- a bench-failing modify burns real repair rounds and the card reports the failure
- a clean modify passes the injected gate and applies
- with no AI configured, "add a lower third" adds one rather than crashing the offline stub

### `e2e/ai.spec.ts` - 32 of 32 skipped

AI mode (Create with AI): the normalized gateway endpoint is mocked at the network level, so these specs verify the full app flow — settings gate, generation, the harness's validation + runtime bench, the repair round, p

- harness off (the toggle): one raw model call, no design stage
- the step opens by saying it is still in testing, with the rest behind its ⓘ
- the harness checkbox is on by default
- describe-it: prompt → validated template → create project
- finish: Create with AI reaches the shared Finish step, gated on a valid result
- finish: the Create-with-AI export door saves the graphic and opens the export window
- harness on: three grounded alternatives, zero coder calls, the pick is remembered
- harness on: the directions are live previews that name their design decisions
- harness on: the intent stage runs first, and a catalog fit routes to adapt
- harness on: an intent answer from the wrong tool routes nothing - the flow falls back whole
- harness on: refining a direction keeps the others, and the pick still trains preferences
- harness on: a refinement can be undone back to the design that was proposed
- a failing result offers one press that sends the findings back
- an example brief never silently replaces a brief you wrote
- the conversation is one thread, and it travels with the brief
- an earlier generation stays in the thread and can be brought back
- "3 more like this" seeds the design stage with the picked direction
- an image attached to a refinement reaches the model and is bundled
- brand: the colours in an uploaded logo are offered, and the pick locks the accent
- readiness: a passing result reports what was checked, and the raw path admits what was not
- cost: a run whose provider reported no token usage says nothing about tokens
- readiness: the raw one-shot never claims the checks it did not run
- cost: no history means no number, and history is reported as tokens and seconds
- describe-it: a flourish runs the polish pass and lands as a marked override block
- describe-it: a contract-breaking polish patch reverts to the assembled template
- describe-it: an invalid first answer triggers the automatic repair round
- describe-it: refine sends the current code back through modify
- the conversation that produced an AI graphic travels with it, and survives a reload
- describe-it: without a key, generation is gated and settings open
- legacy browser-stored keys are erased and never reused implicitly
- a generation that phones home is refused, on the harness-off path too
- a modify keeps the code the user put there themselves

### `e2e/anim-engine.spec.ts` - 12 of 13 skipped

Timeline v2 Phase 1 (docs/TIMELINE_V2_PLAN.md) — the golden parity harness for the declarative animation engine.

- parity: created data templates match each preset's legacy emit
- slide family: each direction produces its own axis and sign of travel
- parity: the press chain — pre-hidden reveals, per-press timelines, exhaustion
- parity: clock templates carry startClock/stopClock through the step-call model
- parity: starting-soon flips to a data block and its ambient loop matches the legacy emit
- resolver: agrees with the real interpreter at keyframe times
- 3D transforms: rotationX/Y/z + perspective author and play through the real interpreter
- serializer: canonical fixed point, lossless splice, hand-edit round-trip
- parity: measured motion matches the legacy emit across content lengths
- measured motion actually tracks the content — and the timeline shows it read-only
- a hand-written DOM-measured region is refused, not guessed at
- parity: infographic measured motion matches the legacy emit, and lands on the data

### `e2e/asset-workflow.spec.ts` - 7 of 7 skipped

The asset-to-states workflow: dropping an asset creates ONE connected element (canvas + layer row + registry + selection), and its STEP/STATE participation is decided right on the canvas chip ("appears …") or in the Insp

- drop a logo, make it the NEXT STEP from the canvas chip — connected everywhere, fully undoable
- an image kept visible from the beginning stays out of every reveal list, and its row exists
- drop into an EXISTING step, then retarget participation afterwards from the Inspector
- the Inspector names the preset targets and writes an early exit (Disappears)
- a preset Delay shifts the written keyframes and grows the step — no keyframe editing needed
- video assets: capped import, VIDEO badge, and a muted looping <video> on drop
- the Assets panel marks which assets the graphic actually uses, per row

### `e2e/assets.spec.ts` - 8 of 8 skipped

The Assets panel: its own dock tab (desktop + mobile), row-based file list with folders, undoable imports, the derived info section, reference-safe moves, and the v2 -> v3 layout migration that surfaces the new tab for e

- import via the Assets tab: rows appear grouped, and a multi-file import is ONE undo step
- the info section derives name, format, dimensions, size, alpha, and usage
- remove is undoable; a Lottie file imports with its badge; junk JSON is rejected
- moving an asset into a new folder nests its path; undo restores it
- dragging an asset onto the canvas inserts a positioned <img> as one undo step
- dropping a Lottie asset on the canvas inserts a playing animation element
- a saved v2 layout gains the Assets tab once (v2 -> v3 migration)
- mobile: the Assets tab is in the side-panel strip

### `e2e/audience-pack.spec.ts` - 9 of 9 skipped

THE AUDIENCE PACK — viewer questions, Q&A cards, chat highlights, question queues, community requests, live votes, and the two- and three-answer boards.

- a very long message is clamped inside the frame, never spilled out of it
- a question with no name reads as anonymous, and no separator is left dangling
- the queue survives a bare list, a single entry, and an index past the end
- the vote board handles no votes, uneven options, and a dead heat
- two-, three- and four-answer boards all select, lock, and refuse a late change
- every state of every new type is reachable, and snapping to it lands its pose
- a chat highlight takes itself off air, and holding it stops the clock
- a pack graphic survives a save and load round trip with its machine intact
- every pack graphic exports to every target with no dangling references

### `e2e/auth.spec.ts` - 1 of 7 skipped

Era 5.6: the editor is open to everyone — there is no login wall anywhere.

- offline / no-backend: the save dialog names no account and no other computer

### `e2e/brand-editor.spec.ts` - 1 of 5 skipped

- brand drafts cancel without changing the open graphic; oversized and invalid logos are refused

### `e2e/bridge-connect.spec.ts` - 3 of 19 skipped

NoaCG Bridge (docs/BRIDGE.md).

- the CasparCG row is absent until a server is configured
- one button puts the production on the configured channel, and one takes it off
- a failure to air is reported on the row, and never as a success

### `e2e/canvas-fit.spec.ts` - 2 of 2 skipped

The canvas FIT invariant: the preview iframe is only ever visible because PreviewFrame scales it to the stage, so `fit` is the single number standing between the graphic and a blank canvas.

- the graphic is scaled onto the canvas, not collapsed
- a zero-sized stage never commits a zero scale

### `e2e/canvas-keyframe.spec.ts` - 6 of 6 skipped

Canvas position keyframing (the interaction model, amendment 3): with a parked playhead, dragging a SELECTED non-root layer on a data-block template writes/updates its x and y keyframes at that moment — the drag itself a

- dragging a selected layer keys x/y at the playhead — the drag itself arms
- a multi-selection drags together — every layer keys its own pair, one apply
- arrow keys nudge a selected layer — x/y keyframes at the playhead, one apply per burst
- a real arrow key press reaches the nudge handler
- with nothing selected, the drag still re-anchors the root (zone patch)
- Escape cancels a layer drag — nothing written, the layers spring back

### `e2e/canvas-selection.spec.ts` - 9 of 9 skipped

Era 6 — the canvas SELECTION model.

- clicking a text line selects it: outline + a chip naming the field — no code written
- hovering a selectable element previews its name; leaving clears it
- clicking empty canvas or pressing Escape deselects
- clicking the selected part again climbs to its container; the whole graphic keeps the scale handle
- selection layers cleanly under inline editing and never blocks drag-to-move
- selection is shared: a canvas click highlights the timeline row, a row label selects on canvas
- the chip assigns the selected part to a press — the data chain, from the canvas
- mobile: the chip drops the desktop-gesture hints and stays inside the canvas
- a block element outside the root joins the press chain: hidden until its press, gone with the exit

### `e2e/comments.spec.ts` - 4 of 5 skipped

The Comments visibility control (src/editor/commentVisibility.ts) - a VIEW preference over the code editor.

- Hidden paints comments transparent and leaves the source untouched
- the mode survives a tab switch, a content edit, and a reload
- a selection inside a hidden comment reveals it
- a find match inside a hidden comment reveals it

### `e2e/community.spec.ts` - 4 of 4 skipped

Era 5.5 community sharing.

- offline: no community affordances anywhere
- the publish gate passes a real template and blocks an unsafe one
- the publish gate blocks JS that talks to the network, reads storage, or leaves its frame
- the publish gate passes every catalog variant

### `e2e/competition-pack.spec.ts` - 12 of 12 skipped

THE COMPETITION PACK (docs/COMPETITION_PACK.md) — the esports, competition, result and reveal graphics.

- the pack ships its four categories, and every design creates and validates
- the match-up walks neutral -> selected -> locked, and the lock is structural
- the scorebug runs pre-match -> live -> final, and the pause group is independent
- map veto and tabletop initiative reuse parameterized machines with snap recovery
- the verdict card is ONE judged state carrying either ruling
- the nominee reveal holds for suspense and then names the winner from its field
- next() alone still walks a reveal card end to end (the playout-server contract)
- the boards spotlight a row from data, and a decided table survives a replay clean
- a board with no data, and an image field with no file, degrade quietly
- every design exports to all six targets with its runtime intact
- a pack graphic saves to the library and reloads with its machine and marks working
- the pack is discoverable in the wizard and creates from a category card

### `e2e/control.spec.ts` - 11 of 11 skipped

Era 4: control panels.

- control tab live-drives the preview from a field control
- a number field becomes a +/- stepper (no per-template code)
- export bundles controlpanel.html + injects the receiver into the graphic's own html
- the exported control panel escapes the graphic name (it is the page title)
- live data: adding a Google Sheet appends an editable polling block, remove strips it
- live data: a published CSV drives the graphic (mocked sheet)
- the Control tab renders labeled event buttons from the machine and fires them
- round-trip: the exported panel fires machine events, greys illegal ones, and shows the state
- the exported panel says so when no graphic is answering (file:// and cross-engine truth)
- staging + event log: staged data airs only on take, and refresh recovers both sides
- round-trip: the exported control panel drives the exported graphic over the channel

### `e2e/counting-settle.spec.ts` - 3 of 3 skipped

A SETTLED COUNTING GRAPHIC MUST SHOW ITS REAL FIGURE.

- `every counting design settles on its real figure (${recipe})`
- `every counting design plays its figure up from zero (${seed})`
- a counting graphic taken again on air never paints its old figure

### `e2e/cross-tab.spec.ts` - 1 of 1 skipped

CROSS-TAB SAFETY for the durable store (model/durableStore.ts).

- a second tab’s work survives the first tab’s next write

### `e2e/design-rules-product.spec.ts` - 10 of 10 skipped

THE DESIGN RULES AS A PRODUCT PROPERTY (docs/DESIGN_RULES_PLAN.md §5 R4).

- the wizard viewing settings persist with the project across a reload
- an untouched project serializes NO legibility key at all
- choosing denser type changes the AI request to the relaxed mode
- with the defaults the AI request carries the binding rules and no relaxed line
- undersized primary text warns in the editor in plain language and still exports
- a shipped catalog design warns under the same rule and is not blocked
- the computed floors scale off the template frame: 16:9 = 9:16, 720p smaller
- the editor can change the viewing target of an already-saved project
- the size floors are ONE choice with three answers, and each says what it permits
- supporting text has its own size rule, reported on the readiness row and never gating

### `e2e/end-credits.spec.ts` - 8 of 8 skipped

END CREDITS - the promise is that a credit roll is ONE field (docs/END_CREDITS.md).

- the whole credit roll is one field, and one role can credit five people
- a list pasted with no marks at all still reads as names
- the same text lays out as columns in the column design
- the Fields step is one paste box, not a field per person
- the closing logo is a default, not a requirement
- the Style step picks which line of a credit is the loud one
- `every credits design settles with its names ON SCREEN (${recipe})`
- `the ${design.name} runs the list off the frame, then brings the mark in on its own`

### `e2e/exports.spec.ts` - 15 of 16 skipped

The CasparCG and OGraf export targets — not just zip-structure checks: the CasparCG file is loaded and driven with an XML payload, and the OGraf Graphic is imported and taken through its load/updateAction/playAction cont

- a saved graphic's control entries ride into its own export, not just the show's
- export panel offers all six targets
- h2r: GDD fields embedded, and the play() toggle drives entrance then exit
- export target choice is remembered as the default across reloads
- html overlay: self-contained, autoplays with the Data panel values, control panel bundled
- casparcg: one self-contained html that speaks JSON and CasparCG XML
- spx: the folder package plays like a host drives it, and a late update never hides it
- liveos: the OGraf package with LiveOS instructions — same graphic, LiveOS README
- ograf: a valid v1 Graphic whose Web Component passes the action contract
- ograf: non-real-time schedule seeks are deterministic in shuffled order
- ograf: post-production intent is blocked for non-deterministic code
- ograf: scheduled custom actions reconstruct branching machine state
- ograf: the machine's operator events are custom actions, guarded like every surface
- no export target ships a relative reference its own package cannot resolve
- every export target carries the fonts its own code references

### `e2e/feedback.spec.ts` - 2 of 3 skipped

OFFLINE: the feedback surfaces must not exist at all.

- feedback, offline > no feedback entry point exists with no backend configured
- feedback, offline > the absence is the gate, not an empty topbar

### `e2e/flows.spec.ts` - 7 of 7 skipped

Core UI flows for the choose-first creation wizard + live panels.

- wizard: create a lower third with defaults
- wizard: field titles flow into the Data panel
- wizard: steps mode reveals lines on Next
- reset: the topbar button restores the original state, undoably
- import graphics: image lands in the logo slot
- style panel: accent retints the live preview
- export: downloads a plug-and-play SPX zip

### `e2e/format.spec.ts` - 7 of 7 skipped

The Prettier formatting layer (src/format/formatCode.ts) and its Monaco wiring.

- formatHtml / formatCss / formatJs normalize messy code
- formatJs refuses any file that owns an animation region
- minimalTextChange returns only the changed span (cursor-stable, merge-friendly)
- formatTemplate formats HTML but leaves CSS and JS alone by default
- the Format button reformats the active tab through Monaco and the store
- the Format button is disabled on the JS tab of a data-block template (region protected)
- a newly created project starts from a Prettier-formatted HTML baseline

### `e2e/google-fonts.spec.ts` - 1 of 2 skipped

The Google Fonts source in the typeface picker (src/model/googleFonts.ts).

- a Google typeface is searched by name and embedded in the graphic

### `e2e/graphic-types.spec.ts` - 10 of 10 skipped

GRAPHIC TYPES (docs/GRAPHIC_TYPES.md) — the conformance suite every registered type passes.

- every type conforms: parses, validates, binds its fields and events, and exports
- promotion is byte-identical apart from the machine the type adds
- a promoted design keeps the capabilities it was authored with
- the quiz board passes the Millionaire test: pick, change, lock, reveal
- the quiz board still degrades to dumb-stepping: next alone walks it
- the ticker passes the ticker test: it cycles on a timer, and pause holds it
- the scoreboard passes the scorebug test: data moves nothing, parallel groups move alone
- the countdown holds and resumes its clock from a parallel group
- a paused countdown takes a new duration without un-pausing itself
- a type keeps its catalog identity: same id, same slot, reachable by id

### `e2e/holding-pack.spec.ts` - 10 of 10 skipped

THE HOLDING / CREDITS / CEREMONY PACK.

- the three families are browsable and every design in them is offered
- the holding set covers the whole show, not just the front door
- a ceremony card creates from the wizard and lands in the editor
- a start-time countdown chases the wall clock and never goes negative
- the countdown self-corrects through a stalled event loop
- Update re-arms a running countdown, and an update that did not touch it leaves it alone
- a clock-less holding screen carries no countdown at all
- the credit reel loops with no seam and does not stack clones on replay
- a static board holds still and shrinks to fit rather than losing rows
- a looping reel survives create, save and reopen with its motion intact

### `e2e/hosted-control.spec.ts` - 5 of 13 skipped

Hosted control ENTRIES (docs/CONTROL_LAYER.md + docs/SAVED_CONTENT_MODEL.md §4): a show's published `panel` spec carries every graphic's saved entries, so the hosted ?control= page can offer them as a read-only switcher.

- a saved graphic carries its entries into the show it is added to
- a production dataset publishes the rows its graphics can load
- entries resolve by library id, fall back to a unique name, and never guess
- a production carries its control profile canonically, and deleting it leaves no trace
- the hosted page arranges from the PUBLISHED bytes, by the one rule the in-app page uses

### `e2e/house.spec.ts` - 4 of 4 skipped

The NoaCG house family (styleTag 'noacg') — the brand-kit overlays rebuilt as first-class catalog templates: one create + play + behavior spec per house mechanism (the standard lower thirds are covered by the shared swee

- house strap: creates from the noacg family and plays
- house clock bug: the live clock ticks and the logo replaces the mark
- house markets: deltas are colored by sign
- house breaking: chip and headline stack in visual order

### `e2e/image-purpose.spec.ts` - 5 of 6 skipped

What an uploaded picture is FOR (src/model/imagePurpose.ts).

- the preselect reads the picture, and only ever guesses mark-or-not
- the fixed/swappable choice belongs to "use it as it is" alone
- each purpose reaches the model as its own instruction
- a reference is never bundled into the created template
- a design that "improves" an as-is picture is held back

### `e2e/images.spec.ts` - 5 of 5 skipped

Image support: the "Image" field type (SPX filelist), logo fields on credits / corner bug, and the export folder structure ([TemplatesFolder]/your_project/index.html + images/...).

- data panel: the add-field types are the broadcast set, and an unanswerable add is refused
- end credits: uploading a logo through the Logo field puts it in the end block
- an oversized logo is shrunk to the frame at the door, and a small one is left alone
- corner bug: the logo field replaces the placeholder mark
- export: the zip is [project]/[project].html with images under [project]/images/

### `e2e/import-canvas.spec.ts` - 18 of 19 skipped

Canvas usability on an imported design (docs/IMPORT_MVP.md): the artwork and the fields placed on it are ONE composition — scaling keeps them together as design-layout CSS — and the canvas behaves like the editors people

- import graphic: scaling the design scales the artwork and its fields together
- import graphic: dragging visible text moves the TEXT, not the artwork under it
- import graphic: the locked artwork never captures a drag — bare artwork moves the graphic
- import graphic: unlocking the artwork gives it back its own layer gestures
- canvas: holding Space pans the view and moves nothing in the document
- canvas: an armed Space-pan does not also play the graphic
- canvas: Space follows the ACTIVE SURFACE - timeline plays even over the stage
- canvas: Space only pans over the stage, and never while typing
- canvas: the cursor names the gesture in progress, not one that is merely possible
- import graphic: centred baked text seeds a CENTRED field on the same centre line
- import graphic: left-set baked text seeds a LEFT-anchored field on its left edge
- import graphic: a scaled design still previews, validates, and exports
- import graphic: the seed recovers the size and position of REAL typeset text
- canvas: any part can be locked from the Inspector, and the rotate handle is not a hand
- import graphic: each marked region seeds its own field
- import graphic: one region holding two lines seeds a field per line
- import graphic: a region marked over a graphic seeds text that FITS it
- canvas: Escape disarms the text tool WITHOUT throwing away the selection

### `e2e/import-graphic.spec.ts` - 19 of 33 skipped

The Import Graphic workflow, end to end (docs/IMPORT_MVP.md): a flat PNG design becomes a working SPX template with editable text fields and per-layer animation.

- import graphic: the wizard is a setup flow — create lands in the editor, Data tab open
- import graphic: fields added from the Data tab are real placed layers — the wizard step, replaced
- import graphic: the imported design animates — whole unit in, whole unit out
- import graphic: a cropped design is placed as an object, not stretched
- import graphic: a 2× export is shown frame-sized, not pushed off the frame
- import graphic: dragging a field places it in the CSS — never a keyframe
- import graphic: Escape cancels a placement drag without touching the code
- import graphic: an added field is live — sample data drives it with no manual wiring
- import graphic: adding an image field creates a placed slot on the design
- import graphic: arrow keys nudge a selected field — one placement apply per burst
- import graphic: the corner handle resizes a field's text in the CSS
- import graphic: the Inspector Style tab restyles a selected placed field
- import graphic: the Style tab's Content rows rename and retext a field
- import graphic: a new field is born with a slot, so a long value cannot run off the design
- import graphic: a long name shrinks to stay inside its slot, and a short one springs back
- import graphic: wrap flows a long value onto more rows, Free lets it run
- import graphic: the artwork and a field animate as separate layers from the Inspector
- import graphic: the exported SPX package validates
- the Text step places a picture slot the operator fills from the control panel

### `e2e/import-prepare.spec.ts` - 7 of 10 skipped

The Import Graphic PREPARE step (docs/IMPORT_MVP.md): erasing baked-in text from the artwork, deterministically and offline.

- erase: a flat background flat-fills cleanly, and the created asset carries the fill
- erase: a 2x retina export is erased in SOURCE pixels
- erase: a smooth gradient background is REBUILT per pixel, not averaged
- erase: a busy background is refused honestly, with continue-anyway available
- erase: dropping one mark replays the rest from the original — fills never compound
- erase: the erased region seeds the first text field, placed and sized from the mark
- erase: on a 2x export the seeded field maps to design pixels

### `e2e/import-stretch.spec.ts` - 6 of 6 skipped

The Import Graphic SCALING MODE (docs/IMPORT_MVP.md): fixed (default — the image renders exactly as drawn) vs horizontal 9-slice stretch (the plain middle band widens with the longest text field, the drawn caps keep thei

- stretch: picking it writes the 9-slice into the created code, and the guides parse back
- stretch: the SPX folder package carries the 9-slice with subfolder-correct refs
- stretch: a long value grows the design at full type size, and a short one springs back
- stretch: growth caps inside the frame edge, then the text-fit shrink answers the rest
- stretch: dragging a guide lands in the created code
- fixed default: no stretch markers, and a long value shrinks its text instead

### `e2e/import-svg-behaviour.spec.ts` - 4 of 38 skipped

- imported quiz: the behaviour survives the export and runs standalone from a file
- CasparCG package: the standalone panel drives the imported SCORE board, reset included
- CasparCG package: the standalone panel drives the imported QUIZ board through lock and reveal
- CasparCG package: the standalone panel drives the bingo caller, add and take back included

### `e2e/import-svg-corpus.spec.ts` - 3 of 23 skipped

THE EXPORTER CORPUS - the SVG import road walked with files shaped the way Illustrator, Figma, Inkscape and Affinity really export, rather than the way this feature's own samples are written.

- corpus: a positioned embedded picture is a picture field an operator can swap
- corpus: a Figma-placed picture is a picture field, and an operator can swap it
- corpus: a photo-filled backplate is offered as a picture AND as the panel that grows

### `e2e/import-svg-sticker-sample.spec.ts` - 1 of 1 skipped

THE WORKED EXAMPLE the "draw it in Illustrator" guide is written around (docs/SVG_AUTHORING.md, "A worked example"): docs/svg-samples/sticker-lower-third.svg is the catalog's Sticker Strap rebuilt as a layered Illustrato

- the Sticker lower third sample imports with its layer names as fields, and its panel grows

### `e2e/import-svg.spec.ts` - 49 of 98 skipped

The SVG import road, door to export (docs/SVG_IMPORT_PLAN.md P1): a layered Illustrator-shaped SVG dropped on the Import door becomes a playable template whose text layers are operator fields — the artwork inlined VERBAT

- svg import: mapping — labels from layer names, all on by default, edits carried to the template
- svg import: overflow-only text fit — a long value shrinks, a short one stays exact
- svg import: sanitizer — script, handlers, foreignObject, SMIL and network refs never reach the template
- svg import: outlined text gets the honest answer, and still imports as a fixed graphic
- svg import: bound text and top-level groups are registry parts — selectable and animatable
- svg import: a picture layer binds as a filelist field — swap by value, empty restores the artwork
- svg import: the static: prefix says a text layer is DRAWING, and its words stay drawn
- svg import: a question typed with hard returns is ONE field that NoaCG wraps
- svg import: an Inkscape design keeps the type it was drawn in
- svg import: a wrapping block keeps the LEADING the designer set
- svg import: text on a path binds the path run, and keeps its curve when an operator types
- svg import: a PostScript font name finds the bundled face, and ships under its own name
- svg import: outlined text — a glyph-shaped group becomes a placed live field over its own box
- svg import: the layer stagger preset walks the artwork’s own top-level layers, as per-layer data
- svg import: a clock-shaped layer can bind as a countdown — the node ticks, the operator sets minutes
- svg import: the text-fit budget is the DRAWN text, whenever the first value arrives
- svg import: a value fills the panel it was drawn in before any of it shrinks
- svg import: copy too long for any size floors instead of vanishing, and says so
- svg import: a lower third climbs the ladder in order — wider, then onto a new line, and only then smaller
- svg import: a growing lower third keeps the space the designer drew around its text
- svg import: a word CENTRED in its plate gets the plate as its room, not its own width
- svg import: a wrapped value is re-fitted as the words the operator typed
- svg import: an outlined-text field is measured by the SAME ladder, against its own slot
- svg import: a field drawn on the artwork becomes a real field, where it was drawn
- svg import: a drawn field can be renamed and removed, and cancelling draws nothing
- svg import: a panel told to grow taller wraps into the new height instead of shrinking
- svg import: growing downwards settles on ONE geometry, whatever order the values arrive in
- svg import: the followers of a growing panel are proposed, then become the author’s own
- svg import: two boxes in one graphic grow differently
- svg import: a growth limit stops at the frame and at the box, and cannot be dragged past either
- svg import: an untouched proposal is left to the runtime, not frozen into the graphic
- svg import: only artwork travels — a text layer is never offered as one
- svg import: a value wraps inside the height the design drew, and never past it
- svg import: a line with another drawn right below it stays on one line
- svg import: with NOTHING chosen, a long name grows the banner instead of shrinking
- svg import: a hugging panel grows with its text, and what is beyond it travels
- svg import: growth is symmetrical and a line stops at whatever is drawn beside it
- svg import: past the floor a value is squeezed inside its room, never painted outside it
- svg import: the squeeze stops at the legibility floor rather than smearing the words
- svg import: wider THEN wrap is one choice, and it is two rows on one panel
- svg import: a rounded-rectangle PATH is the panel that grows, and the ladder options differ
- svg import: the tracking the designer set survives the import untouched
- svg import: text stays off a decorative end-cap, and the cap travels when the panel grows
- svg import: a rail spanning the panel still stretches after the reader edits what travels
- svg import: a rotated panel is measured where it is PAINTED, so the right plate grows
- svg import: a line centred in its box keeps its size, its centre and its neighbours
- svg import: a board that draws a repeated row keeps every box as drawn
- svg import: unticking a text layer keeps the words, says so, and offers removal on the row
- svg import: one box can answer the too-long question on its own

### `e2e/import.spec.ts` - 3 of 4 skipped

Era 2a: import an existing template (.html or SPX-style .zip) to edit and convert.

- import .html: splits into panes, keeps the definition, validates, exports
- import round-trip: an exported Starter zip re-imports as the same code
- import zip: a NoaCG graphic package (the agent door's dual package) keeps its name and TYPE through the Import door

### `e2e/inline-edit.spec.ts` - 2 of 2 skipped

Era 6 — inline text editing (docs/WYSIWYG_PLAN.md W3): double-click a text line in the preview, type, Enter.

- double-click edits text in place: live value + definition default, undoable
- Escape cancels an inline edit without changes

### `e2e/inspector.spec.ts` - 9 of 9 skipped

Timeline v2 Phase 2 — the Inspector column (the shared selection's third consumer) and the redo stack.

- inspector: sits in the right dock, empty until something is selected
- inspector: selecting a timeline row shows that layer — selection synced all around
- inspector: canvas clicks drive it too (select it to affect it)
- inspector: a new selection reveals it; an explicit close holds until the selection changes
- inspector: the pivot sets the transform-origin, and the runtime honours it
- inspector: the 3D transform rows arm and key a rotation (docs/PRESET_MODEL_REVIEW.md gap 7)
- redo: Ctrl+Shift+Z restores an undone edit; a new edit clears the redo branch
- inspector: filter rows compose into one filter track without clobbering each other (gap 8)
- filter track: every keyframe keeps the same shape, so the runtime really interpolates it

### `e2e/keyboard.spec.ts` - 6 of 6 skipped

- a held Space over the timeline plays ONCE, not once per key-repeat
- a Space TAP over the stage plays, exactly like one over the timeline
- a HELD Space over the stage stays a pan and never plays
- Space on a focused button activates the button instead of playing
- a modal takes the editor shortcuts: Delete behind the wizard changes nothing
- Ctrl+C yields to a live text selection instead of swallowing the copy

### `e2e/landing.spec.ts` - 1 of 6 skipped

The public landing page lives at "/" (static, no React); the editor lives at "/app" (dev/preview: the app-clean-url Vite plugin; production: Vercel cleanUrls).

- the landing CTA opens the wizard even for a visitor with work in progress

### `e2e/layout.spec.ts` - 8 of 10 skipped

The flexible dockable-panel workspace (model/layout.ts): the canvas over the timeline in the centre, flanked by left/right docks (plus an optional bottom dock), each hosting any panels as tabs that can be shown, hidden,

- the default framing: code CLOSED, Inspector + tools on the right, timeline in the centre
- opening the code pane narrows the centre, and the OPEN state persists
- closing a panel removes its dock and widens the centre; the closed state persists
- dragging a dock divider resizes it, and the size persists
- a panel moves between docks via its tab menu
- the timeline sits in the centre at an editing scale with real room
- the timeline height is resizable via the centre divider, and persists
- mobile: the Inspector is a panel tab, so a selected layer can still be edited

### `e2e/legacy-timeline.spec.ts` - 5 of 5 skipped

PHASE 8 — what happens to a LEGACY TEMPLATE now that the classic strip's editing patchers are gone (docs/TIMELINE_V2_PLAN.md, DYNAMIC_MOTION_SCOPE §8.1).

- the dock picks the surface from the CODE: data edits, readable legacy converts
- a region the importer refuses is still CHARTED — read-only, and honest about why
- scrubbing the read-only chart drives the preview and writes nothing
- the settled design view still works on a legacy template — no Play needed
- start over: the escape hatch out of unconvertible code writes DATA, and undo goes back

### `e2e/library.spec.ts` - 20 of 22 skipped

docs/SAVED_CONTENT_MODEL.md — the graphics LIBRARY, the Save flow, routed Home, brand looks, and the per-graphic control panel with its ENTRIES.

- save names the graphic; the status stays honest through edits and reopen
- save dialog: a text-selection drag that ends on the backdrop never closes it
- Home lists the library; Back walks the history; an old package link lands on Home
- the wizard leads with the Home card once there is saved work, and it lands on Home
- the wizard header carries its own Home door
- opening another graphic with unsaved changes asks first; Discard proceeds
- a graphic row opens from its NAME, the same door a production row offers
- a saved graphic's control panel: entries create, play with the active entry, persist
- the control panel says what an ENTRY is, and pools the graphic into a production from there
- switching entries re-settles the SAME preview document instead of reloading it
- the control panel reports the state and greys an event the machine would drop
- the control panel shows the graphic at rest before any take, and says how to get Home
- a Home card shows the real graphic, parked at its settled on-air state
- a Home card frames on the GRAPHIC, at both card sizes, without cropping it
- phone width: every row action is reachable, the text stays two lines, the nav scrolls
- video and graphics stay separate but connected: #/video, back to graphics, never trapped
- looks: capture the current look in Home, apply it to another graphic, survive reload
- a look carries SHAPE, and never grafts a token onto a design that reads none
- the save dialog is sized by its content, not by the wizard it borrows styling from
- the list view is a real table: headings over their own columns, and the toggle sticks

### `e2e/local-relay.spec.ts` - 1 of 8 skipped

The LOCAL-CONTROL door (offline local control, no command line): the overlay package bundles a localhost relay (two stdlib implementations of protocol v1) + double-click launchers, the panel gains a relay SEND transport,

- the overlay package ships the local-control bundle, and panel drives graphic through the relay protocol

### `e2e/machine-edit.spec.ts` - 5 of 5 skipped

Phase 1 left the step editor frozen under an explicit machine: adding, removing or reordering a step would have desynced the positional binding (defaultPath[i] owns steps[i]), so those four mutators refused.

- adding a step under a machine keeps the path bound and the graphic walkable
- deleting a step drops its waypoint, and DEMOTES one an authored branch still points at
- duplicating and renaming keep names in step without ever moving a state id
- the press chain edits under a machine, and the edited graphic still walks its path
- an off-shape machine blocks export instead of shipping to air unchecked

### `e2e/machine-graph.spec.ts` - 20 of 24 skipped

Phase 4 of docs/noacg-master-goals.md — the node editor.

- the dock toggles between the step timeline and the machine graph
- a machine-less template shows its derived walk, honestly labelled
- clicking a state snaps the preview there and its card opens the timeline at its step
- the transition card edits an arrow: event rename, illegal names refused, styles applied
- a styled transition plays the arrow's change and lands exactly on the target pose
- drawing an arrow from a port creates a transition; the walk's only edge refuses deletion
- a state nothing can enter is marked where it was authored, and the mark clears
- branch states and parallel groups add and delete; a dragged box parks and persists
- editing a derived machine materializes it, and Reset restores the shipped template
- a layer gets its own timeline from the graph: ▤ step, cut style, Delete restores by undo
- the timeline clips and the switch carry the layer/graphic vocabulary
- two complete graphic timelines chain on the path (the ◇ > ◇ rundown case)
- a branch state gets its own timeline, and it really plays
- the timeline says how each step is really reached, timers included
- the editor greys an event the machine would drop
- a state that only fires a lifecycle call is not described as doing nothing
- the transition card names the two ends the way the boxes do
- every "+ state" entry is reachable at the default dock size
- the transition card is reachable and stays put while the diagram scrolls
- the entrance and exit are real arrows: stylable, guarded, and next() keeps its no-op parity

### `e2e/mark-legibility.spec.ts` - 1 of 4 skipped

- a brand mark that cannot be read is reported > the wizard says so while the palette that broke it is still on screen

### `e2e/multi-select.spec.ts` - 5 of 5 skipped

The interaction model's selection foundations (docs/TIMELINE_INTERACTION_MODEL.md): one ordered multi-selection in the store — plain click replaces, shift-click toggles, a drag on EMPTY canvas lassos — synchronized acros

- shift-click builds a multi-selection synced across canvas, timeline, and Inspector
- preview zoom: the buttons scale the viewport, and a click still hits the right element
- timeline labels shift-click into the same multi-selection
- a drag on empty canvas lassos the parts it touches — no code, no history
- canvas: a selected layer shows scale + rotate handles that key at the playhead

### `e2e/offline.spec.ts` - 1 of 1 skipped

Era 1: self-hosted Monaco — the editor must work with every CDN unreachable.

- the editor loads and works with all CDNs blocked

### `e2e/ograf-conformance.spec.ts` - 7 of 11 skipped

OGraf v1 conformance, gated rather than remembered.

- the exported package declares its steps, durations and canvas — and ships what it names
- skipAnimation lands the action instantly, in real time
- the loaded Graphic resolves its own fonts and images against the PACKAGE, not the host page
- two DIFFERENT graphics in one document do not write into each other
- actions called concurrently, too early, or after dispose all answer with a ReturnPayload
- mounting a Graphic leaves the renderer's page as it was, and paints the studio's own frame
- a mounted Graphic's timeline calls still fire — an operator action PAINTS, not just answers 200

### `e2e/package.spec.ts` - 8 of 8 skipped

The broadcast-package flows: custom colors, imported fonts, the project brand, and the first-wave categories (info cards, end credits, tickers).

- custom colors: a hex typed in the wizard lands in the generated :root
- imported font: embedded, applied, and bundled into the export
- a saved brand carries its look to another variant
- info card: creates, binds, and plays
- end credits: text field drives the parsed roll
- ticker: items loop and the label binds
- ticker: an endless marquee still honours its timed hold
- the post-creation preset picker withholds a structural preset

### `e2e/pasteboard.spec.ts` - 5 of 5 skipped

The off-canvas pasteboard (plans/happy-marinating-pebble.md): the editor shows a working margin around the canvas so content positioned OUTSIDE the canvas is visible and editable.

- the pasteboard is sized by the authored motion, and grows when the motion does
- drag an element fully into the pasteboard: negative keyframe, still visible + selectable
- the pasteboard pad never enters persisted state; export stays clipped to the canvas
- code ↔ canvas: a negative x written in code renders on the pasteboard and stays selectable
- preset-authored off-canvas: a slide preset entrance renders + selects on the pasteboard

### `e2e/playout-cues.spec.ts` - 10 of 10 skipped

Cues over the PLAYOUT SERVER'S OWN LIBRARY (docs/BRIDGE.md §5): a template or a clip that already lives on the CasparCG box, listed through NoaCG Bridge, added to the rundown beside the production's own graphics, and tak

- the door is absent until a Bridge is paired, and lists the server's templates and media once it is
- a clip from the server becomes a cue on the clip layer, and Take, Pause, Resume and Out are one command each
- a server template takes the next free layer, carries its typed fields as JSON data, and Update, Next and Out follow
- a template NoaCG exported brings its own fields, matched by the export slug
- the server that cannot list says so, and a typed name still makes a cue
- with no Bridge running a server cue cannot be taken, and the editor names the hop
- a server cue and its item are removed together, and survive a reload as part of the record
- one rundown cues a template on the graphics channel and a clip on the insert channel, any cue can move, and All out clears both
- a take on a slot another cue holds replaces it, and a channel the studio does not name stays listed as itself
- a re-take onto a channel the server refuses leaves nothing marked ON AIR, since the old copy already came off

### `e2e/playout-drills.spec.ts` - 4 of 4 skipped

Recovery drills (docs/GOALS_ARCHIVE.md "Student release" step 10 — the agent-automatable half).

- storage full: a save fails LOUDLY, the library keeps the last good copy, freeing space recovers
- SPACE puts the selected cue on air and takes it off again, and 0 still means Out
- the rundown walks with the arrow keys, so a cue can be played out from the keyboard alone
- an edit to the cue that is on air says it has not been sent yet

### `e2e/preview-error.spec.ts` - 2 of 2 skipped

A template whose JS throws at load must not fail SILENTLY on the canvas.

- a template runtime error is worn on the stage, and clears on the next good build
- a simulator command that throws is worn on the stage, not swallowed

### `e2e/production-audience.spec.ts` - 7 of 8 skipped

The production AUDIENCE workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5).

- the audience workflow: arrive, edit a broadcast version, approve, send to the rundown, air it
- the audience workspace survives a workspace round trip and a reload
- the viewer preview is the join page itself, and it follows the operator
- an unknown production workspace degrades to Playout rather than a dead surface
- the vote reaches air the same way a question does: open, count, stage a cue, take it
- a vote with nowhere to go says so instead of writing a cue nobody can read
- the presenter pointers: queue what is read now and next, without airing anything

### `e2e/production-chat-intake.spec.ts` - 5 of 5 skipped

CHAT INTAKE (src/audience/chatIntake.ts): Twitch / YouTube live chat as a PRODUCER of submissions into the production's audience inbox.

- a chat line reaches air the way a phone question does: inbox, edit, approve, cue, Take
- the throttle and the dedupe refuse visibly, and what passes is what the inbox holds
- a closed door refuses chat the same as phones, and the surface says so
- pause stops collecting without counting a backlog, resume collects again, remove disconnects
- the add form refuses what no driver could use, before any source row exists

### `e2e/production-controls.spec.ts` - 20 of 29 skipped

The production page's GRAPHIC ACTIONS block (docs/PLAYOUT_DASHBOARD.md §8): the machine's ⚡ buttons rendered from the metadata that travels inside the template, greyed by the structural guard, with the state chip naming

- the production page re-asks for machine state, so a change it did not cause still reaches the chip
- a Take pressed a moment after the page opens still airs - and stays aired
- the selected cue is still identifiable once it is on air, and the editor names which one
- quiz actions on the production page: greying, select/lock, live update keeps the lock, snap recovers the verdict
- scorebug actions group by section and drive the clock; a plain lower third shows no actions block
- a match board reaches every one of its controls from the cockpit: both clock verbs, the interval, the crests
- an audience Q&A cue reveals its answer; switching to a plain cue swaps the actions away honestly
- ± LIVE NUMBERS bumps a figure on air without publishing other staged edits
- a scoreboard GOAL raises the flag AND moves that side's score on the same press
- an exported package recovers a running match clock when the renderer reloads
- the control area is the one scroller > at 1920x1080 > only the control area and the cue list scroll, and the monitors are capped
- the control area is the one scroller > at a scaled 1080p (1536x814) > a graphic with eight fields makes the CONTROL AREA longer, not the editor scrollable
- the control area is the one scroller > a portrait cue is letterboxed into the production stage, it does not re-size the monitors
- the control area is the one scroller > a scoreboard cue lays its number fields out without overlapping the fields beside them
- the control area is the one scroller > on a tall window the verbs are two across beside PROGRAM, packed and not thin
- the cue editor groups fields by what they belong to > a scoreboard reads one team per band, headed by that team’s own name
- the cue editor groups fields by what they belong to > a quiz is NOT grouped: A and B there are a lettered list, not two sides
- the Controls panel arranges the ⚡ block, and deleting the profile puts the generated one back
- SPACE previews first: the cursor previews nothing, SPACE stages, SPACE airs, SPACE cuts back to PREVIEW
- the default SPACE mode is unchanged: selecting previews, SPACE airs, SPACE takes off

### `e2e/production-data.spec.ts` - 24 of 24 skipped

The production DATA workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md D3/D6): the show's own tables, edited on the Data tab, loaded into CUES on the Playout tab by deliberate operator action.

- a quiz bank authored on the Data tab loads into the cue, airs only on Take, and survives a reload
- a table whose columns match nothing offers no load control, and columns can be added and renamed
- a teams table loads one team into the side the operator picked, and leaves the other alone
- a graphic with no sides never grows a side picker, and the quiz binding is untouched
- a graphic on air survives a Data-workspace round trip
- a quiz bank imported from CSV loads into a cue and airs — the Phase 2 walk from a file
- the downloaded template is a file the importer accepts, with the columns a cue can bind
- an imported table whose columns match no field says so rather than looking successful
- a file that is not a table is refused with a reason
- the empty workspace carries the doors and names the columns that would bind
- a bound field takes the LIVE value on air, and an old cue cannot re-air a stale one
- the seed is the reset target, and unbinding hands the field back to the cue
- an unpublished production offers no data key, because it has none
- nested trees, arrays and a missing path each behave as the contract says
- one value moves every graphic bound to it, and only the graphics bound to it
- production data is scoped to its production, never shared between two
- SPACE on the Data tab cannot put a graphic on air
- the playout column stays hidden behind the Data workspace, rundown included
- a ± press on a bound field moves the shared value, and every graphic bound to it follows
- an adjust on a bound field patches the tree, and the event still fires
- Bind all by title binds every unambiguous title in one press, and leaves the ambiguous one bound-empty with a reason
- typing a value costs ONE persist for the whole edit, not one per character
- an operator who types and walks away still has the value persisted
- a refresh arriving mid-word never overwrites the box under the cursor

### `e2e/production-gate.spec.ts` - 2 of 2 skipped

The LIBRARY -> AIR gate (src/validation/productionGate.ts, docs/AGENT_SAVE.md): a library record may be a broken draft, but an invalid graphic cannot be PUBLISHED (hosted control / output) or EXPORTED as a production - e

- publishControlShow and the production builders refuse an invalid graphic, and pass a valid one
- the export dialog shows the gate's verdict and keeps the download disabled

### `e2e/production-pack.spec.ts` - 1 of 3 skipped

The graphics-pack ROUND TRIP and the Fight Night pack (src/packs/graphicsPack.ts, docs/GRAPHICS_PACKS.md, docs/FIGHT_NIGHT_PACK_PLAN.md): any production exports as one re-importable .noacgpack.json - rundown included, as

- a production exports as a graphics pack and imports back with its rundown intact

### `e2e/productions.spec.ts` - 12 of 23 skipped

- a production page manages cues: auto-cue on add, edit, duplicate, reorder, preview
- Home Productions creates a production and opens its page; removing a graphic removes its cues
- the rundown is the only list: the last cue takes its graphic with it
- the LAST cue's ⋯ menu opens upward, inside the rundown that would otherwise clip it
- the links panel stays whole on a short screen — it caps and scrolls itself
- the production page fits one 1080p screen, and the preview takes only the room left over
- every graphic gets its own playout layer, typed, and it is what the output stacks
- the program monitor is the real renderer, and every verb reaches it without a wire
- the verbs answer their keyboard shortcuts, and never while a field has focus
- a published production reads SHOW; an unpublished one says so and offers no rehearsal
- a published production offers the SPX template file beside its output URL
- pictures upload straight into the rundown: one cue each, one layer, and they survive a reload

### `e2e/project-format.spec.ts` - 11 of 11 skipped

- templates author 720p25, 1080p50, and 4K60 from the shared picker
- aspect changes select a valid resolution and route switches preserve the choice
- blank and imported artwork require an authored format before creation
- video AI uses the shared selected project format
- Create with AI receives and produces the selected 4K60 format
- save, reopen, and package exports preserve authored dimensions and timing
- render output settings are explicit scaling from the authored canvas
- animation seconds remain equal at 25, 50, and 60 fps
- native 4K capture is not downsampled and a deliberate 1px hairline stays one CSS pixel
- a restored graphic whose format the catalogue does not offer is marked, not refused
- a save carrying an unsupported format lands and says so instead of "Saved"

### `e2e/project.spec.ts` - 1 of 3 skipped

Era 5.2b: the working graphic autosaves locally and survives a reload.

- project autosave: the working graphic survives a reload

### `e2e/public-service.spec.ts` - 15 of 15 skipped

The public-service pack: tickers, alerts and public-information panels.

- a ticker actually travels, loops endlessly, and answers the speed knob
- a rotating ticker advances on its own timer and answers pause / resume / next
- tickers survive both extremes of item length: one very long story, and forty short ones
- a kicker is drawn on the strip, and one typed alone tags every story under it
- every ticker design draws the tag as a tag, with no markup reaching the strip
- the same rundown keeps its tags in a design that draws them its own way
- a score, a clock and a link are not kickers - the colon needs a space after it
- the bilingual crawl splits both languages, and passes an untranslated item through whole
- an alert’s severity states are real: every level reachable, exactly one shown, word and colour agree
- the alerts that claim no states have none, and the ones that do put them on the control page
- a two-language notice alternates on its own, holds where it is told, and greys the language already up
- a public-information panel keeps its instruction numbering and its attribution
- save, reload and reopen keeps a severity machine and a language machine intact
- every export target packages the new categories with no dangling references
- a kicker typed on air reaches the strip through the control path

### `e2e/quiz-live-consistency.spec.ts` - 1 of 3 skipped

THE QUIZ ON AIR, THE SAME WAY ON EVERY BOARD (owner production test, 2026-09-22).

- `${id}: a correct answer changed on air reaches PROGRAM with Reveal, and again with Update`

### `e2e/quiz-pilot.spec.ts` - 2 of 2 skipped

THE QUIZ PILOT (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 3): the controlled sequence a student production runs — question on air, a HIDDEN contestant pick locked without showing, the choice revealed as its own beat, the ve

- the hidden-pick quiz sequence: seal, reveal choice, verdict, audience result — then the next question from the bank
- the TV-style flow still stands: select paints immediately, lock follows, verdict tells the wrong pick apart

### `e2e/quiz-show.spec.ts` - 1 of 8 skipped

THE QUIZ SHOW SET: a quiz board whose answer count is a FIELD, a two-player score, and the three game-show looks they ship in (sticker, showtime, arcade).

- the wizard offers the answer count and the correct answer, and not the contestant's pick

### `e2e/render.spec.ts` - 9 of 10 skipped

The Export tab's Video & image render section (src/components/render/RenderPanel.tsx).

- render section lists the five formats and a real timing breakdown
- a too-short total is a hard preflight error that disables rendering
- happy path: start -> progress -> complete -> download link (stubbed API)
- a failed job shows the server message and recovers
- a rate-limited start surfaces inline and stays retryable
- a busy fleet is refused with the sign-in nudge, and stays retryable
- quota rejection surfaces the server message inline
- cancel mid-render returns to the idle form
- the standalone export window carries the render section, measured off the saved record

### `e2e/shows.spec.ts` - 5 of 9 skipped

Phase 5: SHOWS — the rundown level.

- a show collects graphics in rundown order and exports one aggregated panel
- offline: the hosted control route answers honestly and the Shows section grows no cloud UI
- the layer stack reorders and removes; deleting the show keeps nothing behind
- a rundown export ships the LIVE graphic, not the snapshot from when it was added
- Home lists productions and the production page exports the package

### `e2e/specialist-lower-thirds.spec.ts` - 1 of 3 skipped

The SPECIALIST lower-third pack (src/templates/lowerThirds/specialist).

- a two-person strap gives each person independent fields

### `e2e/sports.spec.ts` - 17 of 17 skipped

THE SPORTS PACK (docs/SPORTS_PACK.md) — the conformance and behaviour suite for the eight sports graphic types and their thirty-two designs.

- the sports pack ships five types, every one carrying designs, and fills every family cell
- the match clock runs, holds where it is, and resets to the period start
- an operator can correct the clock on air by typing into it
- a score bump on air does not pull the running clock back
- a score bump does not pull the clock back when the ORIGIN arrived over the wire
- a clock value carries the instant it was true, so a fresh renderer opens at the real match time
- a counting-down period stops itself at zero and says so
- the match state groups move independently and refuse illegal moves
- the status card walks live to the interval to full time, and refuses to walk back
- the event card can be held on air, and cleared
- rapid score updates all land, and never leave a score mid-pop
- long club names never change a fixed strip’s height, and never leave the frame
- recovery leaves no machinery on air: no colour hex, no period source, no stale full-time wash
- a missing crest shows the design’s placeholder, not a broken image
- the repeating boards rebuild from whatever is pasted into them
- every sports graphic exports through every target
- every sports design keeps its state machine paired with a machine-aware interpreter

### `e2e/state-machine.spec.ts` - 9 of 9 skipped

Phase 1 of the state-machine model (docs/noacg-master-goals.md §1.4, docs/STATE_MACHINE_SCHEMA.md): the five acceptance criteria, driven against HAND-WRITTEN template definitions (e2e/_machines.ts) built in page through

- schema: migration on read, canonical fixed point over machines, shape rejections
- derived machine: a catalog template answers as one linear group, editor and runtime agreeing
- simplicity guard: a lower third is three states, drivable end-to-end with next alone
- millionaire: selection is data on one state, lock makes select structurally illegal
- scorebug: data stays data, parallel groups fire independently through one queue
- ticker: timer auto-advance cycles items, pause/resume works, a settled preview never advances
- compatibility: update/play/next/stop alone — the export surface — walk the default path
- drift guards: the export gate accepts every machine, editor and runtime agree on the snap route
- preview: snap-to-state works in the editor, and the event strip guards like the graph

### `e2e/template-insert.spec.ts` - 7 of 7 skipped

"Add template graphic" (Assets panel ✚): insert a catalog graphic INTO the current project — namespaced classes, renumbered fields, the donor's :root scoped onto the inserted root, its In/Out merged into the host's timel

- insert an info card into a lower third — project preserved, everything namespaced, one undo
- insert as a NEW NEXT STEP — a named step reveals the graphic, retargetable afterwards
- a STEPPED donor keeps its middle steps — the run joins the host path after the placement
- an inserted graphic's own text lines are selectable parts, without inflating the host design
- after an insertion the Data panel still adds a REAL line to the HOST design
- the canvas context menu opens the same insert flow
- templates that need their own runtime are greyed with the reason, not hidden

### `e2e/template-pack-10.spec.ts` - 3 of 4 skipped

The gap-list pack (docs/PACK_TAXONOMY.md): the commerce, fundraising, sponsor, location and call-to-action designs, plus the two NEW categories — camera frames and transitions.

- discover → select → edit → timeline → save → reload keeps a commerce card whole
- a transition carries the timer machine that clears it, and actually clears itself
- every export target packages a graphic from each new category

### `e2e/template-pack-4.spec.ts` - 3 of 10 skipped

THE TITLE / TOPIC / INFORMATION PACK (src/templates/pack4/).

- the notice’s level events reach the generated control page
- a pack graphic survives save, reload and reopen unchanged
- a stepped pack card exports to every target with nothing dangling

### `e2e/text-tools.spec.ts` - 8 of 8 skipped

The canvas TEXT TOOLS (the stage toolbar's T / area-text switch, placed designs): the T tool clicks point text onto the artwork and types it directly on the canvas; the area tool drags out a wrapping lorem-filled text bo

- T tool: click places point text, typing lands on the canvas, Enter commits a real f0
- T tool: Escape (or committing empty) removes the just-created field again
- T tool: ids continue the existing sequence — a Data-tab f0 makes the tool text f1
- area tool: a drag becomes a wrapping lorem text box of the dragged width
- area tool: the corner handle resizes the box and the text rewraps to it
- text tools: Escape disarms back to Select and the canvas gestures return
- tool-created text survives a reload as a real field of the saved project
- the text tools are a placed-design surface: a catalog template offers no toolbar switch

### `e2e/timeline-v2.spec.ts` - 25 of 25 skipped

Timeline v2 Phase 3 — the read-first step timeline behind the dock toggle: step clips with cue markers on a time ruler, a click/drag playhead that scrubs the real preview without creating history, layer rows with aggrega

- v2: step clips on a ruler with cue markers — steps are the clips
- v2: clicking the timeline moves the playhead and scrubs the preview — no history
- v2: zoom scales the clips; row labels drive the shared selection
- v2 keyframes: convert, arm at the playhead, auto-key, interpolate — the ratified workflow
- v2 keyframes: dragging a diamond retimes it; Delete removes it; undo restores
- v2 presets: In and Out apply independently; applying a preset cleanly swaps the targeted motion
- v2 presets: a single layer takes a preset into ITS activation step (In is layer-relative)
- v2: the canvas chip moves a layer between presses on a data template
- v2 clips: right-edge resize preserves keyframe timing; Alt-drag stretches it
- v2 clips: context menu duplicates, renames, deletes; the definition follows
- v2 clips: »+ adds an authoring step; the hold popover edits how the graphic leaves
- v2: Space plays; arrows nudge the selected keyframe on the grid
- v2: a finished run reports itself FINISHED — the strip returns to idle
- v2 polish: the playhead cap drags; the view follows playback when zoomed in
- v2 polish: keyframe and step eases from the menus; ◀ ▶ jumps; label scrubbing
- v2 layer blocks: the existence span renders; its left edge drags the activation
- v2 layer blocks: the right edge sets an early exit (hides) and upgrades the interpreter
- v2 keyframe sets: shift-click, group nudge, delete, copy/paste at the playhead
- v2 keyframe lasso: a marquee over the rows selects diamonds; Ctrl/Cmd+D duplicates them
- v2 property rows: a layer expands into per-property sub-rows with their own diamonds
- v2: corner bugs create as data blocks — the step timeline is their native surface
- v2: scoreboards create as data blocks — the score pop keeps working around the region
- v2 read-only glyphs: a looping track shows a repeat tail, and lifecycle calls get their own row
- v2 read-only glyphs: a finite repeat ends where it really ends, and is capped when it fits
- v2: the quiz Continue is a real step — its reveal is a lifecycle call, and the SPX steps setting is derived

### `e2e/ux.spec.ts` - 6 of 6 skipped

The UX overhaul: preview-over-tabs layout, validation inside Export, motion phase control + auto-replay (on the timeline strip — the Motion tab is retired), add-field in Data, and the editor's change highlighting.

- layout: code dock left ONCE OPENED, canvas + timeline in the centre, tool tabs right
- export: validation shows inline and gates the download on a broken template
- data: add-field lands as a REAL line on a catalog template, in the assembler's own idiom
- data: the catalog-line add is gated on the standard line SHAPE, never the category
- wizard: direction control mixes a different exit preset at create
- style: a color change highlights the changed CSS lines

### `e2e/video-project.spec.ts` - 1 of 13 skipped

- reload restores the project; save/reopen and the SPX switch work

### `e2e/wave2.spec.ts` - 6 of 6 skipped

Wave-2 categories: starting-soon, game timer, scoreboard, corner bug, infographic, quiz.

- starting soon: holds on screen and the countdown ticks
- game timer: label binds and the clock runs
- scoreboard: all four fields bind and a score change lands
- corner bug: plays with the placeholder mark
- infographic: the stat counts up to its value
- quiz: options bind and Next reveals the correct answer

### `e2e/wizard-brand.spec.ts` - 7 of 7 skipped

THE BRAND CHOOSER (docs/BRAND_PLAN.md §5).

- with no brands saved the wizard offers no chooser
- a chosen brand puts its accent, typeface and logo into the created graphic
- None takes back exactly what the brand put there
- creating a graphic writes no brand record
- applying a brand fills an existing logo slot and leaves a slotless graphic untouched
- a design that cannot show the mark never bundles it
- the footer stays one line beside the preview when the chooser is offered

### `e2e/wizard-filters.spec.ts` - 2 of 21 skipped

The Browse step's faceted discovery (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12-13, groups §4c): ONE category-group dropdown (+ the selected group's member-category chips) + field buckets + style chips narrow the result (fac

- the chosen brand ranks its family first without filtering anything out
- a brand chosen after paging re-ranks in place and keeps the depth the reader pressed for

### `e2e/wizard-finish.spec.ts` - 1 of 16 skipped

The wizard's FINISH step and the standalone export window.

- finish: the editor door (Advanced) creates the project and leaves saving to the user

### `e2e/wizard-logo.spec.ts` - 6 of 7 skipped

The wizard's logo option: a variant that declares `logo: 'optional'` offers a toggle + custom upload on the Fields step; enabling it makes the created template carry a REAL SPX image field (filelist) bound to an <img id=

- logo toggle + custom upload: the created template carries the field, asset, and <img>
- a lower third places the logo BESIDE the text, not above it
- a wide lockup is sized by the words, and the strap pays in width
- a design that draws its own slot is left alone by the shared one
- logo toggle off: nothing is injected
- a no-logo design offers no logo section

### `e2e/wizard-setup-fields.spec.ts` - 9 of 10 skipped

The wizard's SETUP section: the non-line decisions that belong to BUILDING a graphic rather than to running it - which answer a quiz marks correct, the club colours, how long a countdown runs.

- a quiz created in the wizard marks the answer the author chose
- live state is not offered at create, only setup is
- a countdown's duration and a scorebug's colours are setup too
- a design with no setup values shows no setup section
- a design that paints no accent is offered no package that only moves one
- a design that paints an accent keeps every package and its accent bar
- a chip never renders as the same rectangle as its neighbour
- the Custom rows are the roles the design actually paints with
- the viewing target and size floors are off the template path

### `e2e/wysiwyg.spec.ts` - 4 of 4 skipped

Era 6 — direct manipulation (docs/WYSIWYG_PLAN.md, revised: NO move mode).

- dragging the graphic re-anchors it via a zone+nudge code patch (no mode)
- W2: dragging the corner handle writes the --scale variable
- a drag starting on empty canvas does nothing
- Escape cancels a drag without touching the code

## Configured suite

These run only against a configured backend (`npm run test:e2e:live:queued`), never in CI.
`signed-in-ux.spec.ts`'s topbar test calls `skipOldEditor()` directly: the bar it measured was the
old editor's. `agent-access.spec.ts` is not skipped: its step 4 now asserts that the printed
`#/graphic/<id>` link opens the control page at `#/control/<id>`. `.github/workflows/configured-suite.yml`
lists every file below in `ALLOWED_SKIPS` and lowered `MIN_TESTS` from 54 to 31 for the same
reason; take a file off that list, and raise the floor, in the change that rewrites it.

### `e2e/configured/account.spec.ts` - 1 of 3 skipped

- account essentials > an expired session prompts to sign back in; local work survives and sync resumes

### `e2e/configured/anonymous.spec.ts` - 3 of 10 skipped

Era 5.6 — the open editor.

- anonymous visitor (open editor) > account features prompt for sign-in instead of walling the app
- anonymous visitor (open editor) > the topbar says which account state it is in, not only what it offers
- anonymous visitor (open editor) > signed out, the save dialog says the graphic stays on this computer

### `e2e/configured/audience-live.spec.ts` - 1 of 1 skipped

THE AUDIENCE LINK, against the real backend — the half of Phase 5 the offline suite cannot own.

- () => { test.skip(!haveCreds, 'set E2E_EMAIL / E2E_PASSWORD to run the live audience walk'); test('publishing derives a readable audience link, and that link opens the join page', async ({ page, context, }) => { await signIn(page); await settleSync(page); await wipeMyGraphics(page); await createGraphic(page, 'Lower thirds', 'Hairline'); // A production whose NAME is the whole point of the test: nobody types an ending anywhere // below, and the link still has to come out readable. const productionName = `Friday Night Live ${Date.now()}`; await page.getByTestId('dock-tab-control').click(); const section = page.locator('.panel-section', { hasText: 'Productions' }); await section.getByPlaceholder('New production name').fill(productionName); await section.getByRole('button', { name: 'Create', exact: true }).click(); await section.getByRole('button', { name: '+ Add current' }).click(); await section.getByTestId('open-production-page').click(); await expect(page.getByTestId('production-page')).toBeVisible(); await page.getByTestId('production-publish').click(); await expect(page.getByTestId('production-links')).toBeVisible({ timeout: 30_000 }); // The audience URL is READABLE and derived — not the base64 the column defaults to. const joinUrl = (await page.locator('.prod-link-row', { hasText: 'Audience link' }).locator('code').textContent()) ?? ''; const expected = `friday-night-live-${productionName.split(' ').pop()}`; expect(joinUrl).toContain(`/join/${expected}`); // …and it RESOLVES. The rewrite that serves /join/<name> is config, not code, so the only // honest check is opening the URL an operator would read out. const viewer = await context.newPage(); await viewer.goto(joinUrl); await expect(viewer.locator('#join')).toContainText(productionName, { timeout: 20_000 }); await viewer.close(); // A hand-picked name still wins — the derived one is a default, not a policy. const claimed = `handpicked-${Date.now()}`; await page.getByTestId('join-name-input').fill(claimed); await page.getByTestId('join-name-claim').click(); await expect(page.getByTestId('join-name-note')).toContainText(claimed); await expect(page.locator('.prod-link-row', { hasText: 'Audience link' }).locator('code')).toContainText( `/join/${claimed}`, ); await page.getByRole('button', { name: 'Unpublish' }).click(); await expect(page.getByTestId('production-publish')).toBeVisible(); await wipeMyGraphics(page); }); } > publishing derives a readable audience link, and that link opens the join page

### `e2e/configured/bridge-real-server.spec.ts` - 1 of 2 skipped

THE REAL-SERVER WALK of NoaCG Bridge (docs/BRIDGE.md, milestone 1).

- one rundown airs a server template on channel 1 and a clip on channel 2, moves a cue across, and All out clears both and nothing else

### `e2e/configured/community-authed.spec.ts` - 2 of 2 skipped

Authenticated community flows against the configured Supabase backend.

- community (configured / signed-in) > publish a graphic, then import it back from the gallery
- community (configured / signed-in) > the publish gate blocks a template that is not self-contained

### `e2e/configured/follow-status-is-visible.spec.ts` - 1 of 1 skipped

A LIVE CONNECTION THAT NEVER JOINS HAS TO SAY SO.

- a production whose live connection never joins says so, and a healthy one does not

### `e2e/configured/hosted-control-recovery.spec.ts` - 1 of 1 skipped

THE HOSTED CONTROL PAGE SURVIVES ITS OPERATOR'S FIRST TAKE (docs/CLOUD_PLAYOUT.md §3).

- a fresh operator page boots, takes its first cue, and holds it on air

### `e2e/configured/hosted-space-modes.spec.ts` - 1 of 1 skipped

THE TWO SPACE MODES ON THE HOSTED PAGE (owner, 2026-09-10; docs/PLAYOUT_DASHBOARD.md §2 "Two Space modes").

- the hosted page carries both SPACE modes: the cursor previews nothing, SPACE stages, SPACE airs, SPACE cuts back

### `e2e/configured/moderator.spec.ts` - 1 of 1 skipped

- community moderation (configured / moderator) > a moderator removes a published item from the gallery

### `e2e/configured/output-cold-boot.spec.ts` - 1 of 1 skipped

THE COLD BOOT (docs/CLOUD_PLAYOUT.md §3): the cue is taken BEFORE any renderer exists, and the browser source is opened afterwards.

- a cue taken before the renderer exists is on air when the browser source boots

### `e2e/configured/output-realtime-floor.spec.ts` - 1 of 1 skipped

THE FLOOR UNDER REALTIME (docs/CLOUD_PLAYOUT.md §3): a renderer whose Realtime channel never joins still catches up, and says so.

- a renderer whose realtime channel never joins still airs a take, and says it is polling

### `e2e/configured/output-url-cannot-push.spec.ts` - 1 of 1 skipped

- an output URL can render the show and cannot push a command onto it

### `e2e/configured/playout-both-roads.spec.ts` - 1 of 1 skipped

ONE PRESS, ONE ENTRANCE - on every surface, with the verb travelling TWO roads.

- one press is one entrance on the sender, on another operator, and on air

### `e2e/configured/production-data-key.spec.ts` - 1 of 1 skipped

THE DATA KEY IS REACHABLE FROM THE PRODUCT (docs/DATA_API.md, "Authentication").

- a published production shows its data key, and that key writes the production data

### `e2e/configured/production-links.spec.ts` - 1 of 1 skipped

A PRODUCTION'S URLS OUTLIVE UNPUBLISHING (docs/CLOUD_PLAYOUT.md §3, migration 0040).

- unpublishing and publishing again keeps every capability URL

### `e2e/configured/quiz-output.spec.ts` - 1 of 1 skipped

THE PUBLISHED QUIZ PATH (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 3): the hidden-pick sequence driven from the production dashboard, rendered by the REAL /output page over the REAL hosted log — including the renderer reboo

- a published quiz runs the sealed sequence on the real output renderer, and survives a renderer reboot mid-lock

### `e2e/configured/relay-cold-boot.spec.ts` - 1 of 1 skipped

THE COLD BOOT ON THE RELAY PLANE, against a real control log (docs/CLOUD_PLAYOUT.md §3).

- an exported graphic loaded after the take airs it, from the real log

### `e2e/configured/scorebug-output.spec.ts` - 1 of 1 skipped

THE PUBLISHED SPORTS PATH (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 4): a scorebug driven from the production dashboard and rendered by the REAL /output page over the REAL hosted log.

- a published scorebug takes a score bump and a running clock on the real output renderer

### `e2e/configured/signed-in-ux.spec.ts` - 3 of 3 skipped

The signed-in UX walk.

- signed-in UX walk (configured) > the topbar holds one row at laptop widths with the account controls in it
- signed-in UX walk (configured) > a published graphic reports its state in the product’s words, not the database’s
- signed-in UX walk (configured) > the hosted control page publish surface speaks productions

## Scripts that still drive the old editor

Not tests, so nothing skips them. The first two fail on a control that is gone; the third still
runs, but no longer measures the surface it was written for, so check it before quoting a number.

- `scripts/acceptance-pack.mjs` seeds `advancedMode: true` (now dropped on read) and clicks the
  old editor's `dock-tab-control`.
- `scripts/acceptance-shots.mjs` clicks Home's `home-continue-editing`, which is gone.
- `scripts/save-to-air-bench.mjs` seeds `advancedMode: true` so that it measures the old
  editor's surface; the seed is now ignored.
