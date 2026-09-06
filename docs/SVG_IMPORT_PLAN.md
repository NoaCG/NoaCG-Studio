# SVG import - your own graphic, playable

**Status: binding plan, owner-directed 2026-08-20 (north-star material, wanted working in weeks).**
Origin: the Yle demo. Their designer insight - **SVG is code** - names the gap our raster Import
Graphic cannot close: erase fails on textured art, and AI recreation produces "inspired by", never
the user's exact graphic. A layered SVG imported *verbatim* IS the exact graphic; binding its text
layers to data fields makes it a playable NoaCG template that exports to SPX, CasparCG, OGraf,
OBS, vMix like anything else. MXMZ (mxmz.com) sells precisely this workflow to 200+ channels
(Illustrator/Figma -> import -> layers auto-exposed -> JSON data bindings); we do it free, open,
and export-anywhere. See `docs/GOALS_ARCHIVE.md` ("the SVG road") and **`docs/COMPETITOR_MXMZ.md`** for
what they actually ship and where they stop.

**The user promise:** design in Illustrator, Figma, Inkscape or any SVG app; drop the file into
the Import door; your text becomes operator fields; the pixel-exact graphic goes on air.

**The designer-facing half is `docs/SVG_AUTHORING.md`** - how to draw and export a file that
imports well, per app, plus the ready-to-drop practice library in `docs/svg-samples/` - one file
for almost every kind of graphic, each teaching one thing about importing, listed in that folder's
own `README.md`. This plan is the engineering contract;
that page is what you hand somebody holding Illustrator.

---

## 1. Decision: inline the SVG verbatim, bind text nodes IN PLACE

Two architectures were weighed:

- **A. SVG as background + HTML overlay fields** (reuse the raster flow's placed-lines machinery,
  delete SVG text nodes instead of pixel-erasing). Robust text handling (wrap/fit/fonts all
  existing), but the replaced text is *re-rendered*, not the designer's - font metrics, kerning
  and effects drift, which breaks the exactness promise the feature exists for.
- **B. Bind the SVG's own `<text>` nodes** - give a chosen node `id="fN"` and let the standard
  `update()` write its textContent. The typography IS the designer's; nothing is redrawn.

**B is the architecture; A survives as the fallback for outlined text** (an SVG whose type was
converted to paths has nothing to bind - the recovery is: hide/delete that path group, place an
HTML field over its bounding box, exactly the raster flow's field machinery). This honors the
pillars: the SVG source is real code in `template.html`, visible in Advanced mode, no hidden
model.

**What stays verbatim:** everything. The SVG is inlined into the template HTML unchanged except
for (a) `id="fN"` added to bound nodes, (b) sanitization (§5), (c) a wrapper div for
position/scale in the 1920x1080 frame. No re-serialization through a DOM prettifier that reorders
attributes - byte-preserving edits, the way `blocks/` transforms already work.

## 2. Detection and mapping (no renaming ritual - the MXMZ lesson)

On drop, parse with `DOMParser` (`image/svg+xml`) and build the layer inventory:

- **Candidate text fields:** every `<text>` element. One `<text>` with multiple positioned
  `<tspan>`s (Illustrator multi-line) offers each tspan as its own candidate (ids are legal on
  tspans and `getElementById` finds them). Sample value = current textContent; numeric-looking
  sample proposes `ftype: number`.
- **Candidate image fields:** `<image>` elements (bind by swapping `href`).
- **Labels prefill from layer names.** Illustrator writes layer names as `id` (original in
  `data-name` when uniquified); Figma writes frame/layer names as `id` on groups. Nearest named
  ancestor group labels the candidate. **No naming convention is required** - but a
  `f:`/`field:` prefix on a layer name names the field and guarantees it is offered ON
  (optional power-user/org sugar, documented for Illustrator workflows). **The prefix is a
  guarantee, never a filter:** it used to mean "and nothing else", so a scorebug with one
  `f:Competition` layer arrived with six of its seven rows unticked and read as detection
  having failed. A picture, which defaults OFF because inside a design a picture is usually
  the artwork, is the one thing the prefix switches on.
- **Mapping UI** (new wizard step in the import door, replacing Prepare/Text for SVG files): a
  checklist of detected layers with live highlight-on-hover in the preview; toggle which become
  operator fields, edit labels, set sample values. Default: all detected text ON - the graphic
  should work with zero clicks. **The checklist is what the step is for, so it owns the fold**:
  the artwork is capped to a share of the window and made sticky beside the instruction rather
  than stacked above it (a full-frame design at the column's width is 435px tall and left one
  of seven rows inside a 1366x768 scrollport). Editing a sample writes it into that artwork the
  way `update()` writes it on air - the one place a real value can be tried at design size.
- **Zero text nodes detected** = outlined export. Say so honestly ("This SVG's text was converted
  to outlines...") with the two roads: re-export with real text (Illustrator: Type > SVG, not
  Outlines - the teaching moment), or the overlay fallback (§1.A).

**AI's role: none in v1, proposal-only later.** The raster import measured AI as unnecessary
(`scripts/import-suggest-audit.mjs`, 2026-08-16) and SVG is *more* structured, not less. If a
later phase wants semantic labels (mapping `id="Rectangle_3"` text to "Home team"), it is a cheap
text call proposing labels/ftypes through the existing `AnalyzeProposalPanel` pattern - a
proposal the user applies, never an authoring step. Behaviour on an imported graphic comes from a
type, not from a model (`docs/CONTROL_PANEL_ROAD.md` §9); the 2026-08-27 opening of authored
machines is about the agent door and the AI tiers, and changes nothing in this plan.

## 3. The generated template

A new generator beside `src/templates/importedDesign/` (registered like `imp01`; the SVG variant
is its own graphic type so the derived machine/timeline stays the standard linear one):

- **HTML:** stage wrapper + the inlined `<svg>` (viewBox preserved; wrapper sized/positioned by
  the same fit-to-frame rule the raster import uses - full-frame art fills the frame, a lower
  third sits where its viewBox geometry puts it).
- **Fields:** standard `SPXGCTemplateDefinition` DataFields; `fN` -> the bound node, our one
  contract. `update()` is the shared runtime - `getElementById('fN').textContent = value` works
  identically on SVG nodes under SPX, CasparCG, OGraf and the browser output.
- **Text fitting:** SVG text neither wraps nor clips. The generated JS gives each bound node a
  BUDGET - the width of the text the DESIGNER drew - and a value wider than that is SHRUNK
  until it fits (comment-documented, deterministic, removable). Nothing is applied to a value
  that fits. **Shrink, never condense** (owner ruling, 2026-08-22): holding the drawn width
  with `textLength` + `lengthAdjust="spacingAndGlyphs"` distorts tracking AND glyph shapes, so
  one extra letter visibly broke the typeface - which is exactly the taste rule this section
  always claimed and the code did not follow.
  **The budget is measured from the drawn text, never from whatever is on screen.** A playout
  renderer replays its control log the moment the page exists, so the first value measured
  there is usually the operator's - and a budget taken from that can never be overflowed, which
  is how one file came to squish in the editor and run clean past the artwork on air. The drawn
  text is remembered as the page parses (before `update()` can be called) and the budget is
  re-MEASURED, not re-taken, once the real typeface has loaded.
- **THE FIT LADDER** (owner-ruled 2026-08-23, extended 2026-08-26, shipped, after the owner
  walked the hug): a value longer than the design was drawn for is answered in ONE fixed order -
  **fill the room, grow the panel where the author opted in, wrap into the room the design
  already has, shrink to the readability floor, squeeze what is still over, then report the
  field.** The artwork is never reshaped to make copy fit and the copy is never cut to hide that
  it does not.
  **The ORDER is itself the ruling** (owner, 2026-08-26, near-verbatim): "first I want it to get
  wider ... and then it should go to the next line. And the last thing is to shrink" - shrink
  last "because that changes the design more". The mapping step's list is that order, with the
  smaller-text rung last and never first.
  Each rung was a measured defect on the owner's own walk:
  - **The budget was the DRAWN TEXT'S width, not the room.** A name drawn 402px wide inside a
    1040px banner began shrinking at its 403rd pixel with 588px of banner standing empty - and
    that same 588px gap survived every value, at every length, because it was never in the sum.
    The budget is now the shape drawn behind the line, out to a right margin mirroring the left
    inset. A line with no shape behind it keeps the drawn width, which is the honest fallback.
  - **The same wrong budget was what the HUG grew against**, so a banner started widening at the
    fourth character of a three-letter name - spending the growth before any of the design's own
    space. Growth now measures against the room.
  - **There was no floor**: a 400-character value shrank to 3.7px, which reads on air as the text
    having disappeared. It stops at 55% of the drawn size, the raster import's floor
    (`shared/textFit.ts` `FIT_MIN_RATIO`), and sets `noacgTextOverflow()` instead.
  - **A LINE'S ROOM STOPS AT ITS NEIGHBOUR** (owner, 2026-08-26: "a line's room is bounded by
    what is drawn next to it"). Two labels placed apart on ONE baseline is how an exporter writes
    a strap's place and its time; the panel behind them says nothing about where the first has to
    stop. A long HELSINKI ran 160px through the 19:30 drawn beside it, because its room was
    measured out to the banner's edge. `svgFitNeighbour` bounds it at the nearest thing drawn to
    its right on its own rows, less half its drawn type; and such a PENNED line never drives the
    panel's growth, because widening the panel would give it nothing.
  - **THE FLOOR WAS NOT A CONTAINMENT RULE.** At the floor the ladder stopped and reported - and
    the floored line kept painting, 127px past the banner and across the artwork beside it.
    "Nothing may ever paint outside the panel" (owner, 2026-08-26), so a floored block is
    SQUEEZED to its budget (`svgSqueeze`): `textLength` + `lengthAdjust="spacingAndGlyphs"` on a
    drawn layer, a horizontal scale from its own start edge on a placed one. It is deliberately
    ugly, it is still reported as too long, and it comes off when a shorter value arrives. This does
    not reopen the 2026-08-22 shrink-never-condense ruling: condensing is not a DEFAULT, it is
    the last rung under a value no size and no line count could hold.
  - **Screen px convert through the element's CTM**, not through its own advance-length / ink-box
    ratio. The old ratio was close and not exact - a glyph's side bearings are in one measurement
    and not the other - and the error landed in the ROOM, so a grown banner missed the margin it
    was mirroring by 1.4px on the shipped sample.
  - **Wrapping** uses only room the artwork already has: from the line down to the nearest thing
    drawn below it inside its panel. How many lines that is depends on the SIZE (a 112px board
    panel holds one 44px line and three 24px ones), so the ladder re-asks on every pass, and a
    block that does not fit loses a LINE rather than printing through the layer below it. A name
    with a role under it can never wrap; a question alone on a board wraps as it shrinks.
  - **THE ROOM DOWNWARD KEEPS THE DESIGNER'S OWN GAPS** (owner walk 2026-08-29: "the panel
    doesn't have a safe space"). Sideways a line already stopped one drawn left-inset short of
    its bound; downwards there was NO margin rule at all, so a wrapped block ran to the panel's
    bottom edge and sat hard against the line beneath it. Two mirrors, both measured off the
    rest pose the designer drew and neither of them a constant: the whole gap drawn between a
    line and whatever is below it is kept (so a name with a role under it has no room of its
    OWN - a second line is bought by growing, never by eating the leading), and with nothing
    drawn below, the bound is the panel's bottom less the padding it keeps above its first line.
    Mirroring the TOP rather than reading the drawn bottom gap is what leaves a lone line drawn
    high in a tall panel free to wrap into the space below it: that space is room, while the
    space above the first line is the margin.
  - **A WRAPPED LINE RESTARTS AT THE TEXT'S OWN X, and a layer with no `x` starts at 0** - SVG's
    own default, and exactly where Illustrator puts it, since Illustrator writes the position in
    the element's TRANSFORM. Left off, the second tspan continues from where the first ended and
    the wrap paints a staircase running out of the panel - on every Illustrator export, which is
    most of them.
  - **A wrapped value is READ BACK as the words it was made from** (`svgFitValue`). The painted
    lines are marked (`data-noacg-line`) and joined with a space; `textContent` concatenates tspans
    with nothing between them, so the second pass - the one `document.fonts.ready` fires - used to
    fit "AlexandraKonstantinopolous" and settle where the first pass never would.
  - **`noacgTextOverflow()`** returns the field ids that could not be made to fit, and every
    operator surface where a value is typed reads it - see THE OVERFLOW WARNING below.
- **THE HUG** (owner-directed 2026-08-22, shipped): shrinking is right for a graphic that
  declares a STAGE (a quiz board, a scoreboard - `src/templates/AGENTS.md` "THE STAGE") and
  wrong for a lower third, where "the text should decide how big the banner is". An imported SVG
  has no category to read that from, so **the mapping step ASKS** - "when the text is too long",
  shrink or grow, plus WHICH RECTANGLE grows, proposed as the widest one.
  **The DEFAULT is measured off the artwork where it is unambiguous, and asked where it is not**
  (owner 2026-08-25, GOALS goal 5 - "of course that text should be able to become longer and
  the background should grow with it. I don't know why we need to choose them"; shipped
  2026-08-26, `MapSvgFieldsStep` `proposeBannerGrowth`). The 2026-08-23 ruling that geometry
  cannot answer this was about SIZE - the shipped lower third is a full-frame artboard and the
  shipped scorebug a small floating object, so "smaller than the frame = a banner" mislabels
  both, and size against the frame is still never measured. What IS measured is containment
  and arrangement: a rectangle wider than tall, with room before the safe margin, holding
  bound text whose STACKED lines are all START-anchored, defaults to growth - the ordinary lower
  third, working with nothing chosen (on BOTH axes since 2026-08-29; see the ladder-as-a-choice
  paragraph below). An end- or middle-anchored stacked line (composed against a
  point growth would move), a full-frame backplate (no room), and a quiz BEHAVIOUR (a stage by
  declaration) refuse the default and keep shrink.
  **A pair sharing one baseline argues NEITHER way** (fixed 2026-08-26). It used to veto the
  whole file, which is how the shipped Illustrator sample - three stacked lines above one such
  pair - defaulted to shrinking on the owner's own walk. Widening the panel gives those two
  nothing because each is bounded by the other, and the runtime now measures exactly that; a file
  with NO stacked line at all is a composed row (the scorebug) and still refuses.
  The measured default is marked unauthored (`SvgStretchDraft.authored`) and re-derives
  as rows are ticked; the author's first touch of any growth control freezes their answer.
  The runtime (`stretchRuntimeJs` in importedDesign/svg.ts) keeps the raster stretch's doctrine
  (`importedDesign/stretch.ts`): ONE measured deficit - how far the widest bound line inside the
  panel runs past the width it was drawn at - widens the picked rectangle, everything drawn past
  its right edge travels with it, and the shrink above answers only what the cap could not give.
  **THE CAP IS THE DESIGN'S OWN MARGIN, MIRRORED** (owner, 2026-08-26: "we cannot have templates
  outgrow the screen, that should never happen", and growth is symmetrical). `svgGrowCap` mirrors
  the inset the panel keeps from the frame edge it is ANCHORED to onto the edge it grows towards,
  floored at the row's `safe` fraction. An inset is never negative, so outgrowing the frame is
  structurally impossible rather than a number somebody has to keep right - and it is what the
  flat 4% got wrong: a banner drawn 150px in from the left ran to 1843 on a 1920 frame, 73px past
  its own mirror. It now stops at 1770, with the text ending exactly one drawn inset inside that.
  **A PANEL GROWS AWAY FROM THE FRAME EDGE IT IS ANCHORED TO** (`svgGrowDir`; owner walk
  2026-08-29 - the mechanism the mirror needed to be true downwards). Sideways the text answers it:
  a start-anchored line gains room only to its RIGHT, so the panel widens rightward whatever else
  is true of the composition. Downwards nothing ties it, so the panel grows towards the FARTHER
  frame edge - and a lower third is drawn against the frame's BOTTOM (130px below it and 760
  above, on the shipped Illustrator sample), so it gets taller UPWARDS, into empty screen, with
  the edge the designer composed against never moving. Until this, growth was always downward
  and the cap mirrored the TOP inset onto the bottom, which put the ceiling 630px ABOVE the
  panel's own bottom edge: **every lower third measured zero room to grow taller**, the wrap
  rung had nowhere to go, and the ladder fell straight through to shrinking - the one rung the
  order says must come last. The stack of lines is pinned to the anchored edge, so a wrapped
  block travels by exactly the height taken on the side the panel is NOT growing towards
  (growing up: a line rises by its own extra plus everything below it, so the lowest line and
  the panel's drawn bottom padding never move; growing down: a line descends by the extra taken
  above it, so the top line never moves). **Furniture that SPANS the panel on the growing axis**
  (`svgCollectSpanners`) - the sample's amber rail, drawn to the plate's own two edges - grows with
  it rather than leaving the gained strip bare, and an END CAP hugs whichever edge is the one that
  moves.
  **THE LADDER IS ALSO A CHOICE** (owner, 2026-08-26: "a real graphic sometimes wants a
  combination ... we should let the customer choose whatever they want, that's the most important
  thing"). The mapping step offers wider / wider-then-wrap / wrap / smaller, and the combination
  needed no new format: the runtime already spends width BEFORE the fit and height after it, so
  'xy' emits two ordinary rows naming one panel (`draft.ts` `svgGrowthOptions`).
  **The MEASURED DEFAULT is the whole ladder, not its first rung** (owner walk 2026-08-29): a
  default of 'x' alone skips the wrap and lands a long name straight on the rung ruled last, and
  the owner walked this file without touching the dropdown. Where the artwork has no room to
  grow taller the runtime grants zero and the graphic behaves exactly as 'x' did. The
  `data-noacg-el` stamp became a space-separated LIST for it, matched word-wise, and both rows
  read their followers while the artwork is still at rest - a follower captured after the first
  row had moved it would record the moved pose as its resting one.
  **What v1 handles, said out loud:** a RECTANGLE - drawn as a `<rect>` OR as a `<path>` whose
  data reads as one (owner walk 2026-08-28: Illustrator exports a rounded rectangle as a path,
  never `rx`, so rect-only silently dropped the archetypal premium lower third to shrink while
  "panel gets wider" was chosen; `panelPathGeometry` in assets/svgImport.ts is the test, and the
  runtime grows a path by shifting the far half of its points past its middle, which keeps the
  drawn corner radii exactly the designer's). A genuinely freeform shape still has no width to
  change. Growing RIGHTWARD, with start-anchored text inside it - the lower third everybody
  draws.
  **AN END CAP IS PANEL FURNITURE, NOT A NEIGHBOUR** (owner walk 2026-08-28: "text must stay
  between the caps, never on top of them"). A narrow shape hugging the panel's far edge - a
  gradient end-cap, a closing bar (`svgIsEndCap`: within 2% of the edge, at most a quarter of
  the panel's width) - bounds a line's room exactly like a neighbour does, with the design's own
  left inset mirrored before it. But it never PENS the line: it rides the growing edge (always,
  declared follower list or not), so widening the panel genuinely buys the line room. A text
  neighbour still pens, because widening moves neither label. Everything is measured in screen px and converted back through each element's own CTM,
  so a transformed group between the root and a layer is handled; a rotated or skewed one is
  left alone rather than moved wrongly. A follower travels by its transform ATTRIBUTE, so a
  layer the timeline animates in its own right (a per-layer stagger) stays where its animation
  puts it.
- **THE OVERFLOW WARNING** (shipped 2026-08-23) - the second half of the owner's ruling: copy
  past the floor is **warned about, never clipped and never allowed to reshape the artwork**.
  The runtime names the fields (`noacgTextOverflow()`); the surfaces where a value is TYPED say
  so, in one vocabulary (`control/controlModel.ts` `overflowNote` + `OVERFLOW_FIELD_MARK` /
  `OVERFLOW_FIELD_HINT`): one summary line at the top of the cue editor and a mark on the box
  itself, because a summary alone does not say which of six inputs to shorten.
  - **It rides the machine-state answer**, not a channel of its own. Every operator surface
    already asks its graphic for state once or twice a second, so the reply carries `overflow`
    beside `state` (`preview/previewProtocol.ts`, `output/stage.ts`, and the exported graphic's
    BroadcastChannel reply in `control/receiverScript.ts`). A template that answers one of the
    two questions and not the other still answers the one it has.
  - **The monitor showing the cue is the one asked.** The in-app cockpit and the hosted page
    both keep PREVIEW's report apart from PROGRAM's: an editor pointed at the live cue must warn
    about what is on air, one pointed at a staged cue about what a TAKE would put up. Reading one
    for both would warn about a cue nobody is typing into.
  - **All five surfaces in the same change** (docs/CONTROL_PANEL_PARITY.md §4): the in-app
    production page, the hosted control page, the exported production controller, the exported
    standalone `controlpanel.html`, and `#/control/<id>`. The exported controller asks its own
    monitor frames directly - they are same-origin pages it built, and the relay log is a COMMAND
    log with no report direction. Opened over `file://` the frames are opaque and no warning is
    available, which is where that surface stood before.
  - Pinned by `e2e/import-svg-behaviour.spec.ts` ("copy the design cannot hold is WARNED about"),
    verified red first by making the document report nothing.
- **Animation:** the standard marked ANIMATION region animating the wrapper (entrance/exit
  presets work day one; the timeline dock reads the CODE as always). Phase 2: per-layer stagger -
  top-level named `<g>`s offered as animation units.
- **Fonts (the hard part, §4).**
- **Exports:** free. The template is an ordinary `SpxTemplate`, so all six targets + whole-show
  export + the OGraf conformance gate apply unchanged. The SVG travels inline in the HTML - no
  asset-path question, single-file targets (CasparCG) stay single-file.

## 4. Fonts - the exactness risk that needs honesty

An SVG references families by name (`font-family="Gotham"`). If the playout machine lacks the
font, the exact graphic silently isn't. The import must:

1. Inventory every `font-family` in the SVG.
2. Match against bundled faces (`src/model/fonts.ts`) and offer the existing Google Fonts
   design-time fetch (`src/model/googleFonts.ts` - embeds as an asset, no CDN in emitted code)
   or a font-file upload for licensed faces.
3. Emit `@font-face` for every resolved family exactly as the raster import's custom-font path
   does; **warn, per family, when unresolved** ("previews may differ on air") - never block, the
   designer may know the renderer has it.

Outlined text has no font problem - which is why the fallback road (§1.A) must exist rather than
being treated as a defect.

## 5. Sanitization and validation

Imported SVG is untrusted input entering srcdoc previews, exports, and (later) community
sharing. On import, strip: `<script>`, event-handler attributes, `<foreignObject>`, external
`href`/`xlink:href` (external images offered for inline-fetch at design time or dropped with a
message - emitted code never references the network, pillar 3). `validation/validateTemplate.ts`
stays the export gate; add SVG-shaped checks there (bound ids present, no external refs) so the
gate - not the importer - is authoritative.

**One normalization rides beside the sanitizer, and it exists to KEEP fidelity rather than take
anything away** (owner walk 2026-08-28: "never alter tracking"): an SVG length may be unitless
(`letter-spacing:2` - Illustrator writes Character-panel tracking exactly this way), which a
standalone .svg renders as 2px and HTML's CSS parser silently DROPS once the SVG is inlined into
the template - the designer's tracking tightened to `normal` on import. `normalizeSpacingUnits`
(assets/svgImport.ts) rewrites the bare number to `px` in style blocks, inline styles and
presentation attributes; a value that already carries a unit is untouched.

## 6. Phases

- **P1 (the promise, ~1-2 weeks):** .svg accepted at the Import door (today it dies at the
  raster size check with an honest message - `ImportDesignStep.tsx`); parse + inventory; mapping
  step with live highlight; generator with in-place binding, font inventory/matching, overflow
  fit; entrance/exit presets; Finish -> production/export. E2E: an Illustrator-shaped fixture
  SVG (layers, tspans, data-names) walks door-to-export; ograf-conformance covers the new shape.
  Acceptance: a student takes a layered SVG to air, unchanged pixels, in one session.
- **P2:** outlined-text fallback (delete group + overlay field), `<image>` binding, per-layer
  animation stagger, number/clock ftypes, org boilerplate story (an SVG imported once, saved as
  a shared base others restyle - couples with `docs/WYSIWYG_PLAN.md`).
  **Status 2026-08-21 - shipped:** `<image>` binding (filelist fields, empty restores the
  drawing); a numeric-looking sample proposes `ftype: number`; the OUTLINED-TEXT fallback -
  `assets/svgImport.ts` inventories every `<g>` of two-plus glyph shapes (path/polygon only)
  as an outline candidate, offered OFF in the mapping step, whose box/cap-height/fill are
  MEASURED on the step's own inline render (`MapSvgFieldsStep` `measureOutline`: the most
  populated cluster of shape bottoms is the baseline); the generator HIDES a ticked group
  (`imported-design-outlined` class + one `display: none` rule - kept in the file, never
  deleted) and `draft.ts withSvgOutlineFields` places the stand-in through the raster flow's
  `addPlacedLine` (same sizing rules as the erase seed). The SVG's own text fit is
  `fitSvgText` with its own update() hook, so the placed line's `fitPlacedText` shrink runtime
  can coexist; `addPlacedLine` inserts after `</svg>`, never inside it. The per-layer stagger
  is `design-stagger` (designPresets.ts), offered by svg01 only, emitting an ARRAY of the
  top-level named groups (`PresetConfig.layers`, `structure.ts svgLayerSelectors` - a hidden
  outlined group is not a layer) with `stagger:` - the shape the data importer turns into
  per-layer keyframe offsets. The CLOCK ftype is a per-row "Binds as" choice on any
  clock-shaped layer (`looksClock`: M:SS / H:MM:SS) - Text (default; "22:40" may be the time of
  day) or COUNTDOWN: the node takes the `imported-design-clock` class (never the field id - update()
  would overwrite the readout), the field becomes the length in minutes (`clockSampleMinutes`,
  "22:40" = 22.67) in a hidden `noacg-data-source` holder, the shared `templates/shared/clock.ts`
  runtime rides outside the region, and the data gains `startClock`/`stopClock` step calls (a
  `convertToDataRegion` refine - the design presets know nothing of clocks). One countdown per
  graphic (one shared runtime, one display). **Open:** the org boilerplate story.
- **Detection hardening (2026-08-21/22)**, measured against files shaped the way Illustrator,
  Figma and Inkscape really export - every item below was a wrong answer the importer gave, and
  each one now has its own case in `e2e/import-svg.spec.ts` (mutation-tested):
  a MERGED field keeps its place - Illustrator puts the position on the RUNS, so the `<text>` a
  kerned headline binds has no `x`/`y` of its own and the first `update()` (which replaces the
  runs) sent the line to the SVG origin, reading as a field that changed nothing; the first
  run's position is hoisted onto the text at import (`hoistRunPosition`);
  a `<tspan>` is a LINE or a KERNED RUN and only the measured GAP tells them apart (`groupRuns`,
  with `fontSizeResolver` reading attribute / inline style / class rules, CSS-initial 16 when
  nothing says); Inkscape's `inkscape:label` is read and an editor-generated serial id
  ("text123", "layer1") counts as unnamed; hidden layers and `<defs>`/`<symbol>` text are not
  offered (and a PAINTED symbol says why); `<flowRoot>` is called out as invisible; outline rows
  are RANKED by whether the measured shapes read as a line of type, never filtered; a PostScript
  font name resolves to its family and weight (`fontLookup`) and the bundled or fetched face is
  declared under the name the artwork asks for; `<textPath>` binds the path run, not the `<text>`
  around it; samples collapse source whitespace unless `xml:space="preserve"`; repeated layer
  names are numbered. The designer-facing half of all of it is `docs/SVG_AUTHORING.md`.
- **Flawed-human corpus (2026-08-26)** - every SVG walked so far was AI-made, so twelve
  hand-authored failure modes were probed against `importSvgMarkup` and the mapping step ahead
  of the first student file. Every case either imports correctly or refuses with a message
  naming the fix; nothing needed a code change. For the /docs authoring guide:
  - **Refused, teaching the fix:** no viewBox AND no width/height ("Re-export it with a
    viewBox - in Illustrator, File > Export > SVG does this"); a damaged/unclosed file ("may
    be damaged or not an SVG at all"). Outlined-only files keep their honest answer from P2.
  - **Imports correctly:** width/height attributes without a viewBox; a group transform
    (translate + scale) between root and layers - candidates bind AND the goal-5 growth
    default measures right through it, because everything is read off rendered rects; a
    matrix transform on the text element itself; text used inside `<clipPath>` (never
    offered - it is furniture) beside a real text that is; `clip-path` applied TO a text
    layer (still bindable); a nested `<svg>`; BOM + XML declaration + DOCTYPE; percent
    coordinates (`x="50%"`, offered - and middle-anchored, so growth correctly refuses);
    a `<text>` with no x/y; duplicate ids (labels number "Name" / "Name 2", binding is by
    marker so ids never collide with fields).
- **P3 (opt-in):** AI label proposals; Figma-specific niceties; SVG *export* of a NoaCG graphic
  is explicitly out of scope.

## 6a. The imported SVG is a STARTING DESIGN, not a binding step (owner, 2026-08-23)

The step ships as a binding form: tick the layers the file already has. That framing assumes the
file contains a layer for everything the show needs, and it is the assumption the owner broke.
**The imported SVG is a fixed 1920x1080 STAGE, not immutable artwork** - elements inside it may
resize and reposition, and the walk is: bind what exists, replace what was outlined, ADD what was
never drawn, and progressively declare LAYOUT RELATIONSHIPS between them.

**Never universally elastic.** The author says which element may grow, in which direction, how
far, and what travels with it. A board and any deliberately fixed composition stay fixed. AI may
later PROPOSE a relationship ("this rectangle is probably the text background"); it is never
required for the feature and never participates in the runtime fit.

### The ordered road (owner-ruled 2026-08-23; the order is the ruling, not a preference)

1. **ONE CANVAS.** Two canvases on the mapping step were two answers to one question and only the
   preview could answer it: the inline render has no runtime, so it showed a value the ladder had
   already wrapped and shrunk as clipped and running off the artwork - at three times the area of
   the truthful preview beside it (measured, 1366x768). The inline render survives as a HIDDEN
   node for `measureOutline` (that code needs the artwork RENDERED, not VISIBLE); the hover
   highlight moves onto the preview through the rect channel the editor canvas already uses
   (`preview/canvasControlProtocol.ts`). No canvas EDITOR is committed to by this.
   **Status 2026-08-23 - shipped.** The markup renders off screen at its own width (so
   `measureOutline`'s k is 1); the preview keeps the import-time `data-noacg-candidate` markers
   under ONE preview-only build flag (`WizardOptions.previewMarkers`, the precedent being
   `buildDraftTemplate`'s `stretchDemo`), scoped to the mapping step so the Finish step's preview
   is still byte-for-byte the created code; a REPLACED outline group gives its marker up to the
   live stand-in that replaces it, so exactly one node ever answers a hover. The step also stops
   wearing `.wz-body-working` - its left pane is a form, and the class was clamping the preview
   to ~275px. Measured at 1366x768: the preview goes 260x146 -> 614x345, and all seven of the
   scorebug's rows are on screen at once (three before). The step's copy is unchanged: the
   markup still ships verbatim, so "airs exactly as drawn" is still true - it gets reworded at
   step 4, where a declared element can move.
2. **ONE FITTING SYSTEM** - the enabling refactor, and **deliberately scoped small** (owner:
   "keep step 2 tightly scoped as an enabling refactor rather than allowing it to become a larger
   field-system cleanup"). See §6b.
3. **ADD FIELD** - drag on the canvas, a real editable field where the file drew nothing. Cheap
   once 2 lands: `addPlacedLine` already emits it; this is the gesture plus the canvas from 1.
   **Status 2026-08-24 - shipped.** "＋ Draw a field on the artwork" arms a marquee on the
   preview; the box comes back as FRACTIONS of the artwork's own rect (`WizardPreview` never
   learns what a design px is) and the mapping step turns it into a `DesignFieldSpec`, which
   `buildDraftTemplate` already applied for this category - so the drawn line is an ordinary
   placed field from birth and the preview, the editor and every export agree by construction.
   Three decisions worth keeping:
   - **A drawn field is a `shrink` line, never a `wrap` one.** `applyPlacedFieldSpecs` gives a
     dragged box CSS wrap, which is right on RASTER artwork and wrong here: the ladder measures
     `data-fit="shrink"` (§6b), so a wrapping line would be the one field the operator's
     too-long warning cannot see - the defect step 2 just removed, re-entering by a new door.
     `DesignFieldSpec.fit` carries the answer and raster keeps its default.
   - **The drawn box IS the type's em box** (`lineHeight: 1`), so the numbers dragged are the
     numbers in the emitted rule. A CLICK is a drag of no size and reads as "put a field here",
     with a field-shaped default - never a two-pixel field nobody can see or select.
   - **The artwork is tracked for the whole step, not only while armed.** Its rect arrives on
     the document's next FRAME, so arming the channel at the moment of the gesture left the
     first drag after the button with nothing to measure against, and the field silently did
     not appear.
   The step reports its drop HANDLER up rather than a flag, because only it holds the SVG - and
   that handler's identity changes with every keystroke, so it lives in a REF with a boolean in
   state. Held as state it made every report a render and React stopped the wizard with
   "Maximum update depth exceeded" **while every assertion still passed**, which is why the
   loop has an assertion of its own in `e2e/import-svg.spec.ts`.
4. **VERTICAL GROWTH** - the rung the owner values most. See §6c.
5. **THE CANVAS AS A CONTROL SURFACE** - click a layer to bind it, click a rectangle to make it
   the growing panel, drag its direction. The relationship set from 4 stops being
   dropdown-authored. This is the canvas-editor question proper and is taken deliberately.
   **Status 2026-08-25 - the gestures are shipped; declared followers are not.** The preview
   iframe carries no allow-same-origin, so nothing reaches in to ask what is under a pointer -
   and it does not need to: every offered layer is TRACKED and the hit-test runs on the APP side
   against the pushed rects, which is the core design move `canvasControlProtocol.ts` already
   states. The tie-break is the editor canvas's own - innermost by ancestor depth, then smallest
   box - so a name drawn on a banner answers for itself rather than for the banner.
   - **The canvas says WHICH layer; the step says what that MEANS.** Same split as the drawn box
     (step 3): a text, picture or outlined-text layer toggles its binding, a rectangle becomes
     the growing panel, and a DRAG on it names the axis (dominant direction, a 24 canvas-px
     threshold so it reads the same at every zoom). Picking the panel that is already growing,
     with no direction, turns it off - every gesture is its own undo.
   - **The handler lives in a REF**, the lesson step 3 paid for: a function reported up from the
     step and held in state re-renders on every report and spins React.
   - **A pointer is a ONE-SHOT, and the rects are not there yet when the step opens.** The
     document commits on a debounce and the first rect push lands on its next animation frame,
     so a pointer arriving before that finds nothing under it and never asks again. That is a
     property of the surface, not of the test: anything driving this canvas has to wait for a
     layer to actually answer (`awaitPickable` in the spec) rather than for the surface to exist.
   **Followers - the last half - shipped 2026-08-25.** §6c's "geometry proposes, the author
   edits" is now whole: the proposal is measured on the STEP's own artwork (the same rule the
   runtime guesses by, outermost-first so a named group and its contents are never both offered),
   listed with a per-follower Moves/Stretches choice, and editable either in the list or by
   arming "⌖ Pick what travels" and clicking layers on the artwork. Two rules make it honest:
   - **An untouched proposal is NEVER written down.** No `followers` field is emitted and the
     runtime derives exactly as the hug always has. Freezing a design-time guess into every
     future playout would be worse than the guess, and it would have changed shipped horizontal
     behaviour.
   - **The first edit MATERIALIZES the whole set** (the derived-machine idiom,
     docs/STATE_MACHINE_SCHEMA.md §6a): a no-op at the moment it happens, and from then on the
     list stops calling itself "proposed" and what the reader sees is what ships.
   Changing WHICH panel grows clears the set back to a proposal - it was measured against a
   different element, so keeping it would be stale rows about the wrong panel.
   **A defect this found, worth keeping:** the panel picker rebuilt its answer as a fresh object,
   so choosing a panel silently reset the AXIS - a "grows taller" graphic went back to growing
   sideways with nothing on screen to say so. Two controls where one quietly resets the other is
   the kind of thing only a walk catches; it now has a mutation-tested guard.
   **The owner's walk of this surface (2026-08-25) revised two things, both shipped 2026-08-26:**
   - **"What travels with it" renders only where there is something to decide** - a proposal
     with members, a declared list, or an author who engaged with growth themselves. On the
     ordinary lower third's measured default (growth, nothing past the edge) the section does
     not exist, because being asked it at all was the thing he could not understand - and on
     that artwork the honest answer is that nothing needs to move. When it does render, it is
     one line + an ⓘ carrying the why (GOALS goal 4).
   - **Named groups joined the pickable set.** The canvas hit-test offered candidates, images,
     outlines and rectangles but not GROUPS, so arming "⌖ Pick what travels" over a lower third
     could only ever hit the fields - his words: "I can only click the fields". A follower is
     usually a named layer; the innermost-first tie-break keeps a group from answering for what
     is drawn inside it.

**Why 2 before 4, though 4 is the higher-value feature** (owner: "I don't want vertical growth
implemented against a field distinction we're about to remove"): the growth half - moving a panel
and reflowing followers - is DOM rects and does not care what kind an element is, but the
*wrap-into-the-new-height-then-shrink* half is the FIT, and the fit is exactly where the two kinds
diverge today. Built before 2, it ships twice and one copy is thrown away.

## 6b. Step 2 - ONE FITTING SYSTEM, and where its line is

**The defect.** An imported SVG can carry TWO fit runtimes at once, and `svg.ts` says so out loud
("both can coexist"):

- **bound SVG text** (a `<text>`/`<tspan>` in the file) -> `fitSvgText`, THE LADDER: room
  measured from the shape behind the line, wrapping into the drawn height, the 55% floor, and
  `noacgTextOverflow()`;
- **placed text** (an outlined-text stand-in today, a newly added field tomorrow - `addPlacedLine`
  emits an HTML layer AFTER `</svg>`, never inside it) -> `fitPlacedText`
  (`templates/shared/textFit.ts`): modes `overflow`/`wrap`/`shrink` and the same 55% floor, but
  **no room measurement, no height check, and no overflow report**.

It is latent on a plain import and bites exactly on the graphics this road extends. It is already
costing something real: **the operator overflow warning covers bound SVG text and goes silent on
an outlined-text field**, because `fitPlacedText` has no report to ride.

**IN scope.** One fit per imported-SVG graphic: placed lines in an SVG design are measured and
fitted by the ladder, one hook in `update()` instead of two, and the warning consequently covers
all three text origins. The real design work is the ladder's ROOM rule for a placed line - it has
no shape drawn behind it (it was placed on empty artwork, or over shapes now hidden), so the
honest fallback is its own slot, the way a bound line with no shape behind it keeps its drawn
width.

**THE ROOM RULE FOR A PLACED LINE** (settled 2026-08-24, before the refactor was written - it is
the one decision in step 2 that is design and not mechanics):

> **A placed line's room is its own SLOT: the width its wrapper declares.** Nothing was drawn
> behind it - it sits on empty artwork, or over shapes the template now hides - so there is no
> shape to measure a margin from, and the slot is the only statement anybody actually made about
> how much room the line gets.

Three things make the slot the honest answer rather than merely the available one:

- **It is AUTHORED, not inferred.** The slot is measured at placement from the outlined group's
  own box (`components/wizard/draft.ts`), or from the artwork's edge for a field added on empty
  design, and the canvas resize handle re-states it (`blocks/designLayout.ts` `setLineFit`).
  Everywhere else in this ladder an authored value beats a found one - the panel that grows is
  PICKED, never guessed (§3) - and a container search that overrode a slot the author had just
  dragged would break the resize handle to obey a rectangle nobody pointed at.
- **It mirrors the bound line's fallback exactly.** A bound line with no shape behind it keeps
  the width it was DRAWN at; a placed line keeps the width it was PLACED at. Same sentence, same
  reason: measure what the design said, never what happens to be on screen.
- **The slot is a WIDTH, so a placed line does not wrap.** Wrapping in this ladder is only ever
  allowed into room the artwork already drew - from the line down to the nearest thing below it
  inside its panel. Nothing under a placed line was drawn for it, so there is no such room to
  claim, and reflowing into it would print through somebody else's layer. A placed line fills its
  slot, shrinks to the 55% floor, and is then REPORTED - which is the half that was missing.

The ladder therefore takes over exactly the lines `fitPlacedText` had (`data-fit="shrink"`, the
mode every placed line is born in). A line the author switched to `overflow` still runs free and
a `wrap` line still reflows in CSS, both unreported, because both are the author saying the cap
does not apply - that vocabulary is out of scope below and unchanged.

**OUT of scope, deliberately** - each of these is the "larger field-system cleanup" the owner
refused, and none of them blocks step 4:

- the RASTER import path keeps `fitPlacedText`. It has no SVG, no `svgFitRoom` and no panel;
- the `lineFit` vocabulary (`overflow`/`wrap`/`shrink`) as an editor-facing control;
- moving placed lines INSIDE the `<svg>`. Tempting - it would make them literally the same kind -
  but it changes the emitted markup shape, the registry parts, `addPlacedLine`'s insertion
  contract and every saved template;
- any canvas gesture, any relationship model, any growth.

The FIELD contract needs no work and never did: all three origins are already `id="fN"` plus an
SPX DataField, so `update()` binds them identically. The split is *where the element lives* and
*which runtime measures it* - a smaller gap than "one field model" sounds.

## 6c. Step 4 - VERTICAL GROWTH, and what it has to be

**Wrapping may increase the height of a designated container and reflow what is attached to it,
before the type shrinks.** Deterministic layout, never AI.

- **The relationship set is DATA, versioned.** Today's `svg.stretch` is a degenerate one-row
  version and is not even data: it marks exactly ONE element `.imported-design-panel`
  (`querySelector`, singular), hard-codes the direction rightward, caps at a constant
  `PANEL_SAFE = 0.04`, and DERIVES its followers at runtime. What the owner described - element,
  direction, distance, followers, more than one of them - is a persisted format, so principle 6
  applies: it carries a version and a breaking change ships its migration in the same commit. It
  is emitted as a readable, commented table the runtime loops over. Emitted as a HIDDEN model it
  would be the second scene model the architecture forbids; emitted as data the code reads, with
  the code still the truth, it is not.
- **Followers are DECLARED, geometry only PROPOSES.** Horizontal growth gets away with deriving
  them ("anything past the right edge") because that guess is usually right. Vertical does not:
  growing a panel down moves everything below it, and "below it" contains things that should stay
  (a strap pinned to the frame bottom) and things that should stretch rather than move. No
  geometry rule separates those - the same shape of problem as the shrink-vs-grow default, which
  §3 already decided not to infer. So the derived set becomes the PROPOSAL the author edits.
  **AMENDED 2026-09-06: stretch-versus-move IS separable, and only stay-versus-move is not.**
  A layer that must stretch is drawn TO BOTH of the panel's edges (`svgCollectSpanners`); a layer
  that must move is drawn PAST one of them. Measured over the whole corpus, the two sets never
  intersect and the per-row move/grow picker was right on none of the 79 rows that carried it, so
  the picker is gone: the list declares WHICH layers travel, and spanning furniture stretches
  itself. Evidence and the ruling: docs/TEXT_BOX_BINDING.md, "What travels is not a question".
- **ACCEPTANCE CRITERION, explicit (owner): deterministic convergence across editor, export and
  SPX.** Wrap and grow are circular - line count depends on type size, available height depends
  on growth, growth depends on line count - and the fit runs INSIDE the template, so the same
  values must settle on the same geometry in the app preview, in an exported package, and in the
  `/output` renderer. Testable as: identical measured geometry (panel box, per-field size, line
  count, overflow set) on all three; the fit IDEMPOTENT (running it twice changes nothing); and
  independent of arrival order, which is the trap §3 already paid for once - the first value
  measured must never become the budget.

**One copy change rides along:** the mapping step promises "Your artwork airs exactly as drawn."
The markup does stay verbatim, but the sentence becomes a half-truth the moment a declared
element can move, and it needs rewording in the same change.

**Status 2026-08-24 - the format, the growth and the convergence are shipped; authoring is the
minimum.** `NOACG_LAYOUT` (version 1) - the wizard's `DesignSvg.growth` option, emitted by
`layoutDataJs` and read by the runtime `growthRuntimeJs` emits - is a commented table in the
design-owned JS, deliberately NOT in `NOACG_ANIM`, which the timeline rewrites. Each row names one
element by its `data-noacg-el` stamp, its axis, and its safe margin; `followers` is an ADDITIVE
optional field, so declared-vs-derived needed no second version: absent = the geometric derivation
the hug always used (fair sideways, poor downwards), present = exactly what the author said. `layoutRules` is a
NORMALIZING read - the old one-rectangle `stretch` becomes one axis-'x' row - so nothing
downstream sees two shapes. One stamp per participant replaced `.imported-design-panel`, which a
class per role could not scale past one rule.

**How the circularity was answered: it is not iterated.** The ceiling a block may fill is the MOST
its rule could ever give, measured at rest BEFORE the fit (`svgOfferHeights`); the fit wraps and
shrinks inside that fixed ceiling exactly as before; then the panel grows by what the SETTLED
block needed (`growSvgHeights`). One measure, one fit, one apply. Sideways stays the other way
round - growth is extra BUDGET, so it happens before the fit - and that asymmetry is the whole
reason the two halves sit on opposite sides of it.

**The acceptance criterion caught a real defect, which is why it is the criterion.** `refitSvgText`
re-measured the room BEFORE resetting the layout, so a second pass measured against a panel still
grown by the first: the block looked like it already fitted the drawn height and the growth was
silently dropped (122 -> 110). `document.fonts.ready` fires exactly that path, so on air the
graphic would have grown and then collapsed when the webfont landed. Every re-measure now rests
first, which is what makes a pass a function of the VALUE and the DESIGN and nothing else.

**Still authored the narrow way:** the mapping step asks shrink / wider / taller for ONE picked
rectangle. Declared followers and several rules are what the format now expresses and the step
does not yet ask for - that is step 5's surface, and the runtime is ready for it.

## 7. What this is NOT

- Not a replacement for the raster import - photographs and flattened PNGs keep the erase flow.
- Not an SVG animation editor - motion stays NoaCG's (presets/timeline), the SVG is the look.
- Not SMIL support - `<animate>` elements are stripped with a note (deterministic playout owns
  time; a wall-clock SMIL loop would also fail the OGraf post-production gate).
