# Import Graphic — the manual MVP workflow

The one core workflow this feature makes reliable, end to end:

1. Choose **Import graphic** from the wizard.
2. Import a flat design image (e.g. a lower third drawn in Photoshop). Any raster format the
   browser decodes is accepted — PNG, JPEG, WebP, GIF, AVIF — because everything downstream
   works off the decoded pixels, never the container. PNG/WebP are the ones that carry the
   transparency a broadcast overlay usually wants; that is advice, not a restriction.
3. **Prepare** (optional, skippable): erase baked-in text with the flat-fill engine, and pick
   the scaling mode — fixed (default) or horizontal 9-slice stretch (both below).
4. Create: land in the real canvas editor with the **Data tab** open.
5. Add text / number / image fields there — each is a real SPX DataField AND a real placed
   layer on the artwork, so every playout system can edit it.
6. Drag, nudge, and resize the fields on the canvas; restyle them in the Inspector's Style tab.
7. Animate the whole design (the default in/out) or each layer on its own, from the Inspector.
8. Preview with sample data.
9. Export a working SPX / CasparCG template.

**Success condition:** a user turns an imported lower-third PNG into a working SPX template
with two editable text fields and selectable in/out animations in under ten minutes.

**Product line:** NoaCG is not replacing Photoshop, Figma, or After Effects. Graphics may be
designed elsewhere. NoaCG's job is the dynamic fields, broadcast behaviour, control logic,
preview, and export around them. This flow is **manual — no AI anywhere in it** (the AI-driven
Import card is a separate entry; per the founder it merges into Describe).

## Why imported graphics could not be animated before

Not a bug — an absent path. Three separate systems all gate on ONE fact: the HTML containing
`class="<prefix>-box"` (`model/structure.ts` `detectPrefix`).

| Gate | Where | Effect without a `-box` |
|---|---|---|
| Layer registry | `structure.ts:61` — the `[class*="-box"]` spine | no prefix → no root/panel/parts → nothing is canvas-selectable |
| Presets | `blocks/presetRegistry.ts:67` `emitPresetRegion` | returns `null` immediately → `presetApply` has no donor keyframes |
| Timeline dock | `components/timeline/StepTimeline.tsx:82` `TimelineDock` | no `NOACG_ANIM` + no legacy region → `LegacyTimeline` → renders `null` (no strip at all) |

An imported PNG never reached those gates anyway: the import flow assigns the first image to
`logoAssetPath` and places it in a **64–96 px logo box** inside a *different* house design. On
the 34 variants with `hasLogoSlot: false` it ships as an asset nothing references. There was no
path where an imported image became the graphic.

## The approach: satisfy the contract, don't loosen it

**The import produces a template the existing engine already accepts** — a standard-contract
template with a `.imported-design-box`. The alternative (teaching the registry and the presets
to handle arbitrary foreign HTML) is a structural change to the shared element-identity
contract, and would put every catalog template at risk to serve one flow.

Because the output is an ordinary contract-shaped template, all of this works with **no change
to any of it**: the TemplatePart registry, canvas selection, the step timeline, the Inspector,
keyframes, validation, and all six export targets.

## The structure contract

```
.imported-design            root — positioned, opacity:0 until play()
  .imported-design-box      the design UNIT: art + text animate together
    .imported-design-art    the artwork (<img>; in stretch mode a border-image 9-slice div;
                            an empty box before import)
    .imported-design-mask   one per line, id="fwN" — carries the POSITION
      span#fN               the field — carries the TYPE; SPX writes into it
```

- The **mask wrapper** and the **span** are separate elements because they are separate
  decisions: the canvas drags the wrapper, the Fields step restyles the span. The wrapper also
  makes `#fN` a registry `line` part (the registry's rule: an `fN` whose parent carries
  `<prefix>-mask`), which is what makes it selectable and mask-reveal-capable later.
- **Self-assembled** from `templates/shared/base.ts`, not `assembleStandard` — the standard
  assembler gives `.<prefix>-box` `width: fit-content` + the auto-fit wrap cap, which would cap
  a 1920px design at the 1680px text safe area and shrink the user's artwork.
- **Frame-sized art anchors at 0,0** (no zone insets — they exist to keep a house panel in the
  text safe area, and would push the user's own artwork off its own frame). A smaller design is
  a free-floating object and gets the ordinary 9-zone anchor.
- The artwork's natural size is **measured at import**, never assumed: it decides the graphic's
  size, the full-frame question, and where text defaults land.
- **Artwork larger than the frame is scaled down to fit it at import** (`DesignArt.width/height`
  become the fitted design-space size; the file's real pixels are kept as `sourceWidth/Height`
  for the summary). A larger file is almost always the same design exported at higher resolution
  (a 2×/retina export) - at natural size only its top-left quadrant would fit the frame, leaving
  a lower third drawn in its bottom half entirely off-screen. A 2× export of the frame therefore
  lands exactly frame-sized (anchored at 0,0), keeps its full resolution for sharpness, and text
  positions are measured in the fitted space the user actually sees.

## Whole-unit motion

`templates/importedDesign/designPresets.ts` — Fade · Slide up · Pop · Blur. They animate
`.imported-design-box` and nothing else. A flat design is one picture: the text is positioned to
sit inside artwork drawn around it, so moving a line independently of its art tears the design
apart. The catalog's line presets do exactly that (they stagger `#fN` out of masks), which is
why this family exists instead of reusing them — and why `presetsForType('imported-design')`
returns only these.

Per-element motion is not forbidden, just not the preset's business: this is a data-block
template like any other, so the timeline can key any layer after creation.

The presets emit a legacy region which `convertToDataRegion` converts to `NOACG_ANIM` at
create — the same emit→import path every category uses. No new engine code.

## Positioning: the canvas drag (and the Inspector's numeric X/Y)

A field's position lives in its wrapper's `#fwN` rule (`left`/`top`, design px measured from
the artwork's top-left). The assembler's `LineStyle.x/y` still writes it for a template built
with explicit lines, but the normal path is the editor: the canvas drag, the arrow-key nudge,
and the Inspector Style tab's X/Y inputs all patch that same rule.

**Dragging a selected field on the canvas re-places it.** The design tension
this had to resolve: on a data-block template, dragging a selected non-root layer writes **x/y
keyframes** at the playhead — that is *motion*, not a design position. For a placed line a drag
means "this is where the text sits". The resolution (`blocks/designLayout.ts`) follows the house
rule — the gate derives from the **code**, never the category: a line is *placed* when its
parent wrapper carries an id whose CSS rule holds readable `left`/`top` px values (the shape the
assembler emits, and a shape a pro can hand-write to opt any template's line in). A placed
line's drag patches that rule (one undoable CSS apply, in the rule's own `calc(Npx *
var(--scale))` or plain-px idiom) and is **excluded from the keyframe drag entirely**, so a
multi-select drag can never write motion keyframes for it. Everything else keeps the keyframe
drag unchanged, and catalog templates are untouched (their masks carry no wrapper ids).

## The wizard is a SETUP flow, not a second editor (2026-07-18; third step 2026-07-19)

The wizard is three steps — Start → Design → **Prepare** (the erase + scaling sections below) —
and Create is offered from the Design step onward: a design that needs no preparation goes
drop → Create, exactly the two-step flow this section originally described.
Creating builds the imported-design template **bare** (no fields) and lands in the real editor
with the **Data tab revealed** (`setActivePanel('data')`; the store's `panelRevealNonce` makes
the reveal fire even though 'data' is the stored default). Everything the wizard's old Text /
Style / Animation steps did lives in the editor now, once, on the real surfaces:

- **Fields** — the Data tab's add (below). The old wizard Text step's per-line X/Y/anchor/font/
  size/weight/color grid is replaced by the canvas gestures plus the Inspector's Style tab,
  which offer the same options and more against the SAME rules.
- **Whole-unit motion** — the default entrance is the Fade design preset; changing it is the
  Inspector's Animations tab on the Design (box) row, same presets, same generator.
- **Palette / font as base tokens** — the created template still carries the :root contract
  (default palette + font, or the project brand via the wizard's "Use current project's colors
  & font" toggle, offered on the Design step). The Style *panel* edits them post-create; a new
  line's defaults read them (`var(--text-color)`, `var(--font-heading)`).

A bare design's HTML/CSS carry teaching comments saying where fields will land; `resolveOptions`
honours an explicitly empty `lines` array for this (absent still falls back to suggestions).

**One amendment to "bare" (2026-07-19): bare *unless the user erased a region*.** Erasing
baked-in text is an explicit "editable text goes here", so the erased rectangle seeds the first
field at create — through the same `addPlacedLine` transform as every other field (see the
Prepare section below). The fast path (Create from the Design step) stays exactly bare.

**The box is labelled "Design", not "Panel".** `model/structure.ts` special-cases the
`imported-design` prefix, so the timeline row, canvas chip, and Inspector all say "Design" —
the box is the user's artwork, not a generated background panel.

## Fit: what a long value does to a placed line (2026-07-18)

A placed line was `white-space: nowrap` with no width cap, so a long operator value ran clean
off the artwork and off the frame. The line's **slot** is its wrapper's `max-width`; the
**fit mode** is how the text answers when the value outgrows it (`blocks/designLayout.ts`
`lineFit`/`setLineFit`, read from the code like every other reader here):

| Mode | Code shape | For |
|---|---|---|
| `overflow` | no cap (or `max-width: none`) | a line whose length the designer controls — the pre-fit behaviour, so **saved templates read as this and nothing changes under them** |
| `wrap` | cap + `white-space: normal` + `overflow-wrap: break-word` | descriptions, synopses — text that may take more rows |
| `shrink` | cap + `white-space: nowrap` + `data-fit="shrink"` | **the default for a new field**: names in a drawn slot |

`shrink` is the only one needing code, because CSS cannot size text to its container.
`templates/shared/textFit.ts` emits `fitPlacedText()` as **design-owned JS outside the marked
ANIMATION region** (like `shared/clock.ts` and the category motion runtimes), so the timeline
never rewrites it and it survives export untouched. The shared `update()` calls it when it
exists — the same optional-hook idiom `next()` uses for `revealNextStep` — and
`ensureTextFitRuntime` injects the block (and, for a template created before the hook, the
hook line) exactly once, the idempotent-bootstrap pattern `blocks/lottieInsert.ts` uses.

Two decisions worth keeping:

- **It shrinks by reducing font-size, not by condensing glyphs horizontally.** The horizontal
  squeeze is the older hardware-CG trick, but it distorts the typeface the user chose — and
  that typeface is part of the design they imported. A `FIT_MIN_RATIO` floor (0.55) stops it
  before illegibility; past the floor the slot's `overflow: hidden` clips, which is the honest
  outcome of a value that genuinely does not fit.
- **It re-fits on `document.fonts.ready`, not just DOM-ready.** The design's face loads with
  `font-display: swap`, so a DOM-ready-only pass measures the *fallback* font and leaves the
  fitted line overflowing the moment the real face swaps in. (Found by measuring the composed
  export document, not by reading the code — the same hazard `WizardPreview` already gates on.)

A new field is born with a slot equal to the room between it and the artwork's right edge, so
a long value can never leave the design without the user configuring anything.

## The canvas + data-field phase (post-MVP, 2026-07-18)

The wizard hands off to the REAL canvas (it always did — the output is a contract-shaped
template), and this phase makes the editor's data-field workflow first-class there:

- **The Data tab's add-field is real on an imported design.** `blocks/designLayout.ts
  addPlacedLine` is one pure transform emitting everything a field needs to exist end to end:
  the mask wrapper + `#fN` span inside the design unit (which makes it a registry `line`
  part — selectable, animatable, a timeline row), the wrapper's placement rule + the span's
  type rule in the assembler's exact idiom (so the drag/nudge/resize read it back), and the
  SPX DataField (the shared runtime's `update()` binds by id — zero JS changes, works in
  every export). The new line stacks under the LOWEST existing line and inherits its
  size/weight/color; the first line of a bare design starts in the artwork's lower-left. The
  gate is `designBoxInfo` — code-derived (a box whose unit carries `<prefix>-art`), never the
  category. Long text and image fields keep the definition-only add.
- **Image slots are placed fields too.** The Data tab's Image add runs `addPlacedImageSlot`:
  an `<img id="fN">` in a mask wrapper (a registry `image` part) with a sized slot box, a
  dashed outline while empty (the house rule — image placeholders are visible), and an SPX
  `filelist` DataField listing `images/` — the shared runtime's `setFieldValue` already
  handles the img show/hide and `.has-image`. A hidden empty slot stays selectable and
  draggable: the canvas lets the rendered WRAPPER stand in for a placed field's hidden
  element (`partScreenEl` in CanvasInteraction), and the corner handle resizes the slot's
  box (`slotSize`/`setSlotSize`, aspect preserved).
- **Canvas text tools (2026-07-19).** The stage toolbar grows a ↖ / T / boxed-T switch on
  placed-design templates: the **T tool** clicks point text onto the artwork (the field is
  created empty at the click - the insertion point - and the inline editor opens on it, so
  the user types directly on the canvas; an empty commit removes it again), and the **area
  tool** drags a rectangle that becomes a wrapping text box (fit 'wrap' at the dragged
  width, lorem ipsum starter content; its corner handle resizes the box width and the text
  rewraps). Both run the SAME addPlacedLine transform as the Data tab's add - next fN id,
  real DataField, registry layer, timeline row, Inspector Style tab - so a tool-created
  text is indistinguishable from a panel-created one. `NewPlacedLineSpec` carries the
  optional `at` (design px) and `text` for this. E2E: e2e/text-tools.spec.ts.
- **Keyboard nudging.** Arrows move every selected layer 1 px (Shift = 10). A placed field
  moves as placement (design px, the placement drag's inline preview, ONE `placeLine` apply
  per burst); every other selected non-root layer moves on the keyframe channel — GSAP x/y
  preview, x+y keyframes at the playhead, the drag's semantics key by key — so nudging works
  the same across the whole editor, not just on imports. One undoable apply per burst; Esc
  cancels. Precedence: the timeline's keyframe-set arrows listen in the CAPTURE phase and
  claim the key with preventDefault, so an explicitly selected keyframe set always wins over
  the layer nudge — selecting a diamond usually leaves its layer selected too, and only one
  of the two may act.
- **The corner handle resizes the DESIGN.** On a single selected placed field the corner
  handle edits a text line's `font-size` (`lineFontSize`/`setLineFontSize`) or an image
  slot's box (`slotSize`/`setSlotSize`), in the rules' own idiom — the keyframe scale/rotate
  handles step aside for placed fields, for the same reason the drag places instead of
  keying: a placed field's size is design, not motion.
- **The artwork is its own layer, and LOCKED by default.** `.{prefix}-art` is a registry part
  (kind `image`, label "Artwork"), so the image and every text field are independent layers
  throughout — style and animate each on its own. The whole-unit presets stay the wizard's
  (and the Design row's) business; per-layer motion comes from the Inspector. But it is also a
  full-bleed image UNDER every field placed on it, so on the CANVAS it starts locked (store
  `partLocks`): it takes no drag, handle, or lasso, while staying selectable by click, from
  the timeline, and fully animatable. That is what lets a press on visible text grab the TEXT,
  and a press on bare artwork fall through to the root's zone drag — moving the whole graphic,
  which is what dragging a design's background should do. The selection chip's padlock
  unlocks it, giving it its own layer gestures back.
- **The design SCALES as one composition.** `.{prefix}-art` and `.{prefix}-box` swap the
  keyframe scale/rotate handles for the root's `--scale` handle. The artwork's size *is* the
  composition's size — every placed field's left/top/font-size is `calc(Npx * var(--scale))`
  against it — so one `--scale` patch grows artwork, text positions, type, and image slots
  together, and it stays design-layout CSS. A scale KEYFRAME on the artwork alone would leave
  every field behind, which is exactly the layout the design was imported with. Keyframing the
  artwork's scale is unchanged; it lives in the Inspector's Properties tab like any property.
- **Per-layer presets work here.** `blocks/presetApply.ts`'s single-layer retarget chain now
  falls back to the donor's `-box` tracks — the whole-unit presets animate only the box, and
  that fallback is what lets Fade/Slide/Pop/Blur apply to ONE layer (the artwork, a line)
  from the Inspector's Animations tab.
- **Animations is the Inspector's default view on an imported design** (the artwork brought
  its look with it — what a user comes here for is motion). The switch fires when a
  placed-design template arrives; a manual tab choice afterwards sticks. No Inspector
  restructuring.
- **The Inspector grows a Style tab for a selected placed field** — the layer-specific
  styling surface (the Inspector is where layer-specific things live; animation already
  does). It opens with **Content**: the field's operator label (`setFieldTitle` — the
  registry renames the timeline row and canvas chip from it) and, for text lines, the shown
  text (the canvas inline editor's pattern: definition default + live sample value in one
  commit). Then the design: for a text line font (bundled list or the design font — picking
  a bundled face also ships its @font-face, deduped), size, weight, color, anchor,
  line-height, tracking; for an image slot: its box; for both: numeric X/Y. Every control reads and writes the
  field's OWN rules through `blocks/designLayout.ts` (`lineTextStyle`/`setLineTextStyle` +
  the existing placement/size pairs) — the same rules the canvas gestures use, in the same
  idiom, one undoable apply per edit (the color inputs patch live like the Style panel's
  swatches). The tab is offered only while a placed field is selected; the global Style
  PANEL keeps the :root contract (palette, heading font, scale) and is no longer the wrong
  place to look for per-field text styling.

E2E: the whole roundtrip (wizard handoff → Data-tab add → place → nudge → resize → restyle →
per-layer animate → live sample data → validated export) is pinned in
e2e/import-graphic.spec.ts.

## The Prepare step: erasing baked-in text (2026-07-19; segment rebuild 2026-08-18)

Text exported INTO the design file is pixels — it can never become a live field. The Prepare
step (wizard step 3) removes it deterministically, offline, with no AI: the user drags a box
over the text on a source-pixel artwork surface (`components/wizard/import/DesignPrepCanvas`), and
`assets/eraseRegion.ts` rebuilds the background behind the type.

**The erase fills the TYPE, not the lasso (2026-08-18).** The original model filled the whole
drawn rectangle with one mean colour, and two real customer files measured it broken the same
way: the lasso is loose, so its ring crossed panel edges and backdrop, the verdict failed even
over a perfectly flat strap, and "use it anyway" painted one giant alien slab across panel,
divider and backdrop alike. `eraseRegionFlat` now finds the type INSIDE the rectangle first —
stroke-edge bands, the same discriminator `proposeEraseRect` uses, which needs no background
estimate and so cannot be fooled by a box spanning two surfaces — splits each line into
word-gap segments, and fills each segment's own padded box from each segment's own ring.
Furniture the box crossed (a hairline rule, a chip, an accent bar, a panel edge) is left
standing. A rect in which no type is detected falls back to the whole-rect fill (the way to
remove a logo), with the same background models.

**The heuristic** (per segment, and for the whole-rect fallback): a ring of 16 single-pixel
probes **3 px outside** the box — 5 across the top, 5 across the bottom, 3 per side. Outside,
because the text's own antialiasing lives inside the box and would pollute the verdict. Probes
that fall off the image are skipped (a design cropped at the frame edge is legitimate). Each
side's pad is **capped before the nearest surface boundary** (a transverse-transition test —
horizontal edge counts cannot see a horizontal rule), so the probes can only read the surface
the text itself sits on; a hairline rule one pad short of the descenders no longer poisons the
verdict. Stroke edges are counted only when the transition SUSTAINS across 2 px — real stems
are ≥ 2 px at any legible size, while compression ringing and upscaler halos oscillate and
would otherwise read furniture as type on re-encoded uploads.

**The background models, judged by one number.** Flat is `v = mean`; a smooth gradient is a
per-channel plane `v = a + bx·x + by·y`, least-squares fitted to the ring — both judged by the
worst per-channel deviation they leave unexplained, against the same `FLAT_BG_TOLERANCE = 10`,
alpha included. "Smooth gradient" is exactly "flat once the plane is subtracted"; a texture, a
photo, or a step edge refuses honestly. The fit gets one second chance on TRIMMED probes (the
worst third dropped against the per-channel median — a rule crossing one side is a minority),
and a trimmed model is only believed together with the **fill-zone verification**: the box's
own pixels must be mostly the model's background (≥ 40% within tolerance, ink ≤ 50%), which is
what refuses a box straddling two surfaces whose "outliers" were half the truth.

- **Clean** (every segment modelled and verified) → each segment box is filled from its own
  model — one colour where flat, the fitted plane per pixel where a gradient (written into
  `ImageData` directly — `fillRect` would COMPOSITE a semi-transparent fill over the text and
  ghost it through) — and applied immediately; hold-to-compare shows the original. A model
  alpha ≤ 8 writes true transparency, not a tinted veil.
- **Not clean** → the warning names the deviation and how many text areas failed, recommends
  re-exporting the design without the text, and offers **Use it anyway** (fills each area with
  its own local mean — still local, never one slab across the box).
- **Marks ACCUMULATE.** A design usually carries more than one piece of baked text (a name and
  a title, a scoreline and a clock), so each box is its own erase in `draft.designErases`, run
  against the artwork as it stands — which is also what lets each region's ink be measured
  before its own fill lands. Dropping one mark cannot un-fill pixels in place, so the step
  REPLAYS the survivors from the untouched upload (`draft.designOriginal`): **fills never
  compound**, and that replay is the only way an artwork can carry exactly the marks still
  standing.
- The cleaned PNG is downloadable (`<base>-clean.png`) and every mark is removable
  individually or all at once.
- Erasing happens in the file's **SOURCE pixels** (a 2× retina export is erased at 2×); only
  the seeded field's placement maps through the fitToFrame ratio into design px.

**The seeded field is built from the INK, not the mark.** The rectangle is a loose lasso — you
box text in with air around it — so its edges say nothing about where the type sat. The erase
therefore MEASURES what it removes (`eraseRegion.ts` `measureInk` → `RegionInk`, carried on
`DesignEraseState.ink`) before the fill destroys it: the tight bounds of every pixel more than
`INK_TOLERANCE = 40` per channel from the sampled background, plus the tallest unbroken run of
ink rows — a row/column needs two ink pixels to count, so compression noise can't inflate the
box, and the run is what makes a region holding two stacked lines report ONE line's height
instead of both plus the gap between them.

The runs are the LINES, and each becomes its own field: a box drawn around a name *and* its
title — the shape of every lower third — gives back two pieces of text, each with its own
columns (a short title under a long name must not inherit the name's width and left edge),
its own size, and its own anchor. A run under `MIN_LINE_ROWS` is a rule or an underline, not
type, and seeds nothing.

Within each run it also finds the **baseline**: the lowest row still carrying `BASELINE_SHARE`
(0.35) of the line's densest row. Every glyph of a line reaches the baseline, so those rows are
dense, while the two or three letters with a tail (g j p q y) collapse to under a tenth of the
peak. That one measurement is what makes the type size readable at all — measured against real
typeset Inter, the FULL ink run is 0.708 em for "Alexandra Riva" but 0.917 em for "Jonathan
Gray", while cap-top-to-baseline is 0.698 em for **both**. A size read off the run would be
right for one and 30% out for the other. Its blind spot is a string where most glyphs descend
("gypsy"); names and titles are not shaped that way.

`draft.ts withEraseSeedField` → `addPlacedLine` then seeds from that:

| from the ink | into the field |
|---|---|
| cap-top-to-baseline ÷ 0.72 | `#fN` font-size. Cap height runs 0.677 em (all caps) to 0.76 em (ascender-heavy) across the bundled faces, so 0.72 is the midpoint: ±6% worst case, biased small because oversized type overflows its slot and gets shrunk, while undersized type is just nudged up |
| …bounded by the line's own width ÷ (0.55 em × the field's name) | the same font-size. Not every marked region held type — a user marks a LOGO to put editable text over it, and its ink is as tall as it is wide, so cap height read off it is type the width could never hold. The fit runtime floors its shrink at 55% and then CLIPS, so the field would open showing "Tex". Half an em per glyph never binds on a real line (many times wider than it is tall) and always binds on a block |
| the run's top, less a tenth of an em | `#fwN` top, with `line-height: 1` pinning the box to exactly one em so the glyphs land back on the ink |
| the ink box's centre vs the ARTWORK's centre (±4.5%) | the anchor: `center` (a title card stays centred when the operator types a longer name — the one thing the field exists to survive), else `left`/`right` by which half it sits in |
| the ink box's width, plus 0.12 em | the shrink slot — the room the ORIGINAL text had. The margin is the side bearings: type OCCUPIES more width than it PAINTS, and a slot set to the painted width alone is narrower than the very text it was measured from, so the fit runtime shrinks the seed on arrival |

**Measured, not assumed** (`e2e/import-canvas.spec.ts`, "REAL typeset text"): a fixture that
renders actual glyphs in the bundled face at a known size, erases them, and compares the
replacement's rendered INK against the original's. Recovered size lands within 0.5% and the ink
within 3 px horizontally / 1.2 px vertically at 96 px type. Every other erase fixture paints a
solid bar, where the measured ink height *is* the bar — which is exactly why these constants
needed type to be checked against.

The field's colour contrasts against the erase's own sampled fill (dark ink on a light fill,
white on a dark one) — the palette default is invisible on a light design. Nothing here
reconstructs a FONT: flattened pixels do not carry one. It reproduces what is in the pixels, so
the field is a starting point on the design rather than beside it. A region with no measurable
ink (and a draft saved before this existed) falls back to the old rect-derived numbers.

E2E: e2e/import-prepare.spec.ts (pixel-asserted, including retina and the non-flat refusal) +
the alignment cases in e2e/import-canvas.spec.ts.

## The step opens with the box already drawn (2026-08-16)

The audit below measured the erase as the workhorse of this whole flow — 9 of 10 designs,
including panel-less artwork and artwork over footage, where the empty-panel detector answers
none of the baked ones. But it only ever ran **if the student thought to drag a box**, so the
strongest path in the flow was opt-in by accident. `assets/eraseRegion.ts proposeEraseRect`
scans the artwork on arrival and hands the step a rectangle already drawn around the words.

**What separates type from artwork is the count of horizontal STROKE EDGES on a row** — pairs
of adjacent pixels more than `EDGE_TOLERANCE` (40) apart on some channel, alpha included. A
solid shape contributes exactly two per row however large it is, so a strap, an accent bar, a
rounded chip, a hairline rule and a divider together give six or eight; "Alexandra Riva" alone
gives forty. `MIN_ROW_EDGES` (12) sits in that gap, which is why a CLEAN export — the way
students are told to send their design — is offered nothing rather than a box drawn on the
panel.

| step | what it does | the failure it exists to stop |
|---|---|---|
| rows → bands | rows over `MIN_ROW_EDGES`, contiguous (one blank row tolerated), at least `MIN_TEXT_ROWS` tall | a hairline rule or a dashed border reading as a line of type |
| bands → one block | lines within `BLOCK_GAP` (1.2) of the taller one's height are ONE region | a name and its title becoming two boxes, when the erase already measures both inside one and seeds a field each |
| block → column span | the widest run of edge-carrying columns, gaps up to 0.6 of a line height | the box stretching across furniture that merely shares the words' rows — the divider on a two-person strap sits 200 px past the name |
| re-read rows through that span | bands recomputed inside the columns alone | a row that only qualified because of that furniture keeping the box tall |
| size caps | wider than `MAX_BLOCK_WIDTH` (0.85) or taller than `MAX_BLOCK_HEIGHT` (0.4) of the artwork is refused | a photograph or a texture, where every row is busy, reading as one enormous piece of text |
| the INK cross-check | `measureInk` over the padded box, against the ring's own sampled fill | a candidate the erase's own measurement cannot see; a disagreement about the line count costs confidence rather than being hidden |

The rectangle carries `PROPOSAL_PAD` (0.3 of the tallest line) of air — the loose lasso a
person draws — which clears the glyphs' antialiasing and leaves the ring's probes
(`SAMPLE_OFFSET` beyond it) on real background.

**Confidence, and what it is for.** `density × shape × agree`: edges per row against
`CONFIDENT_ROW_EDGES` (24), times 1 / 0.7 / 0.4 as the block is wider than tall by 1.5× / 1× /
less (set text is wider than it is tall; a logo or a chart is not), times 0.75 when the two
measurements disagree on how many lines are there. Under `MIN_CONFIDENCE` (0.45) the scan
**proposes nothing and names the rule that refused**, which the step says out loud
(`erase-scan-refusal`). A rectangle drawn around the wrong thing costs the student more than an
empty canvas: they have to notice it is wrong, work out why, and undo it, where an empty canvas
only asks them to drag.

**It is an OFFER, never an edit.** Nothing is filled until "Erase this" is pressed, the box and
its four corner grips are dragged in source px like every other rect on this surface, and "I'll
draw it myself" dismisses it back to the manual tools unchanged. Accepting runs the ordinary
`eraseRegionFlat` — the flat verdict, the non-flat warning, the seeded field per line are all
the same code — and the scan then **re-runs on the CLEANED artwork**, so a design carrying a
name, a title and a scoreline offers them one at a time and stops when nothing is left.

No model call, and that is measured rather than preferred: the audit below found the free path
already answering the designs an AI route was proposed for.

**Measured, on the same ten designs** (`node scripts/import-suggest-audit.mjs`, which grows a
detector column beside the hand-drawn-lasso one):

| | hand-drawn lasso | the opening proposal |
| --- | --- | --- |
| baked exports erased flat | 9 of 10 (p4's gradient not flat, 1 line) | **identical on all ten** |
| lines measured per design | 2 | **2** |
| text left over after the erase | n/a | **none** (the scan is re-run on the cleaned artwork) |
| boxes drawn on CLEAN exports | n/a | **none of 10** |

E2E: the three proposal cases in `e2e/import-graphic.spec.ts` — the box covers every painted
glyph of a REAL typeset strap and stays inside it, the box drags and resizes without applying
anything, and a clean export is offered nothing and says which rule refused.

## Scaling mode: fixed vs horizontal 9-slice stretch (2026-07-19)

Different graphic types scale differently, so it is a per-graphic CHOICE on the Prepare step,
never an assumption:

- **Fixed (default)** — the image renders exactly as drawn; long values shrink their text
  (the fit contract above). Title cards, full-frames, scoreboards, panels. Emits byte-identical
  code to before the mode existed — saved templates and the fast path are untouched.
- **Stretch horizontally** — the artwork becomes a **CSS border-image 9-slice**: the user drags
  two vertical guides (end of the left cap, start of the right cap), the drawn caps keep their
  exact shape, and the plain middle band widens with the longest text field. Lower thirds,
  straps, name tags. Disabled for frame-sized art (no room to grow into).

**Why border-image** (over three-layer DOM or pre-sliced assets): one element paints all nine
patches from one geometry, so there are no subpixel seams at fractional `--scale`; slice values
are in the FILE's own pixels while cap widths are design px, so retina exports slice correctly
for free; and the guides ARE the working declarations, so they parse back out of the code.

**The emitted contract** (all in the `.imported-design-art` rule — the guides live nowhere
else, and `blocks/designLayout.ts designStretchInfo` derives mode + guides from exactly these):

```css
.imported-design-box { width: calc((1050px + var(--stretch-x, 0px)) * var(--scale)); }
.imported-design-art {
  border-left-width: calc(186px * var(--scale));   /* guide 1: where the left cap ends   */
  border-right-width: calc(314px * var(--scale));  /* width − guide 2: the right cap     */
  border-image-source: url("images/tg123.png");
  border-image-slice: 0 314 0 186 fill;            /* the same guides, in FILE pixels    */
  border-image-repeat: stretch;
}
```

- **The image ref is a CSS declaration, never an inline style.** The editor's entrance reset
  (`PlayoutSimulator resetGraphic`, gsap `clearProps: 'all'`) strips inline styles — an
  inline `border-image-source` made the artwork vanish in the editor while every other
  surface painted it. (The clearProps-eats-authored-inline-styles gotcha, met before in the
  render work.)
- Longhands only — the `border-image` shorthand resets the parts it doesn't mention.
- A root-relative `url("images/…")` in template.css resolves everywhere EXCEPT the SPX folder
  package, whose stylesheet ships one level down: `spxStarter.ts cssForSubfolder` rewrites
  bucket refs to `../` in the packaged copy only (this also fixed the pre-existing bundled
  @font-face `fonts/…` → `css/fonts/…` bug), and `importTemplate.ts` strips the hop on zip
  import so the round-trip stays byte-identical.

**The runtime ladder: stretch → shrink → clip.** One value drives everything — `--stretch-x`
(design px) on the design box, read by the box width, the artwork's middle band, and every
driving slot's `max-width` (the `+ var(--stretch-x, 0px)` idiom; `readPx`/`placementCss`
mirror it so slot-width edits never drop it). `stretchDesignWidth()`
(templates/importedDesign/stretch.ts; design-owned ES5 OUTSIDE the marked region, like
textFit) measures the widest `[data-stretch]` line's deficit on every `update()`, DOM-ready,
and `document.fonts.ready`, and widens the design by exactly that — capped at
`STRETCH_SAFE = 0.04` inside the frame edge (just inside the bench's 3.5% title-safe, so the
boundary never flaps), direction-aware for right-anchored zones (probed by a test widen, not
guessed from CSS). Past the cap the grown slot is what `fitPlacedText()` measures, so the
existing shrink answers only the residue; past the floor, the slot clips. Measurements are
layout metrics (`scrollWidth`/`clientWidth`/`offsetLeft`) on purpose — they ignore GSAP
transforms, so an `update()` arriving mid-entrance still measures true, and the runtime never
shares a property with the box presets (they own transform/opacity, stretch owns width).

`addPlacedLine` on a stretch design marks lines left of the right cap as drivers
(`data-stretch` on the wrapper, slot to the cap start); right-cap lines and fixed designs are
unchanged. The Prepare step proves the mode live: a content-width slider pushes progressively
longer sample text through the preview's normal `update()`, so the user watches the emitted
runtime itself. With stretch picked and nothing erased, the PREVIEW build places one demo line
(`withStretchDemoLine`) so the slider has something to widen — the one sanctioned deviation
from preview == created code; Create rebuilds without it.

**Future modes without migration:** mode is DERIVED from the declarations, never stored, so
vertical stretch later = top/bottom border widths + slice values + a `--stretch-y` term in the
box height and a vertical branch in the runtime; `DesignStretch` already reserves the axis.

**Known limitations (deferred by decision):** a placed field over the RIGHT cap does not ride
the stretch (right-edge-anchored placement rules through the drag/nudge/Inspector loop are a
follow-up); a middle-band field is left-anchored, so a centered title does not re-center as
the band grows.

E2E: e2e/import-stretch.spec.ts (guides parse-back, the full ladder, cap fidelity, the guide
drag, the fixed default).

## The fields place themselves (2026-08-16)

An empty backplate is the common import: a strap or card exported with the words left out, so
the student then has to guess where NoaCG expects them. The artwork already answers that — the
panel a designer drew to hold text is, by construction, the largest run of ONE flat colour in
it — so `src/assets/suggestFields.ts` measures it and the Text step opens with **Name** and
**Title** already sitting inside the panel.

- Deterministic and free: dominant opaque colour (32-per-channel buckets, alpha ≥ 200), a
  binary "is this the panel colour" mask at ±24 per channel, then the classic largest-rectangle
  histogram walk. No model call, no network, same input always gives the same fields — which is
  what lets it run on arrival rather than behind a button somebody has to trust.
- It runs ONCE, and only into an EMPTY step. A user who has placed a field has said where the
  text goes; a suggestion landing on top of that would be an edit, not an offer. `✨ Suggest
  fields` re-runs it by hand and appends.
- The two lines are laid out as LINE BOXES, not font sizes. A placed field's `y` is the top of
  its rendered box and a line paints ≈1.22× its font-size tall, so sizing the type first and
  spacing by a fraction of the panel overlaps the pair by a few pixels — measured, and the
  reason the plate's room is divided first and each size derived from the room it got.
- A plate under 18% of the frame's width or 5% of its height is furniture (a badge, a rule, a
  corner tab), and artwork with no flat panel at all REFUSES out loud. The manual tools are
  untouched in both cases.

E2E: the auto-placement case in `e2e/import-graphic.spec.ts` (both fields inside the artwork's
own opaque block, which is where a wrong answer would show).

**The step also places PICTURE SLOTS** (🖼): a dragged box becomes a real `filelist` field with
its own `<img>`, through `blocks/designFields.ts` — `addPlacedImageSlot` + `placeLine` +
`setSlotSize`, the same three patches the editor's Data tab and canvas write. Both dimensions
come from the drag (a slot's shape is a design decision, unlike a text box where only the
width means anything), and the spec carries no typography, because what the operator supplies
is a file. This is what stops the commonest field after text from being a reason to open the
editor.

## A finished template file, through the same door (2026-08-16)

"I already have this graphic" is the same errand as "I already have this picture", so the
Import graphic drop zone takes an `.html` or `.zip` as well as artwork and the FILE decides the
walk (`isTemplateFile` → `importTemplateFile`, both already in `model/importTemplate.ts`; the
AI step's "Open as code" uses the same parse).

- It becomes wizard mode **`file`**: a two-stop rail (`Template file` → `Finish`) rather than a
  branch inside design mode, so the rail never shows four steps that cannot apply to it.
- The card leads with the OPERATOR FIELDS, because those are what separate a graphic somebody
  can type into on air from a picture that plays; a file declaring none says so.
- Finish is the ordinary one: add to a production, export, or (Advanced mode) the editor. The
  code is applied BYTE-FAITHFULLY — `applyTemplate`, never `applyGenerated`/Prettier — because
  it is the user's file, not ours. The graphic's name is the only edit, and only because it
  slugs the zip and the SPX/CasparCG template folder.

E2E: the two `finished .html template` cases in `e2e/import-graphic.spec.ts`.

## The typeface the design was actually made in (2026-08-16)

`src/model/googleFonts.ts` adds the ~1,900 Google families to the picker, searched by name and
downloaded at DESIGN time into `template.assets` exactly like an upload — so the emitted
template still references only `fonts/<file>`, and an export still plays out with no network.
Nothing about a fetched face is special downstream; that is the point.

The index (`src/model/googleFontsIndex.ts`, regenerated by
`scripts/build-google-fonts-index.mjs`) is NAMES ONLY and dynamically imported. A family it
does not carry is still asked for by name and Google's own 400 is what refuses it — the
snapshot never becomes the limit. The panel states that a download makes the browser's IP
visible to Google before anything is fetched.

E2E: `e2e/google-fonts.spec.ts` (Google stubbed, as the AI routes are).

## Does this need AI? Measured, 2026-08-16 — no

`node scripts/import-suggest-audit.mjs` (free, no tokens) puts ten authored lower thirds through
both free paths and scores each against the intended text box its fixture declares BEFORE the
run. The design vocabulary comes from `docs/LOWER_THIRDS_REFERENCE_CORPUS.md` §3.4, not from
what the detector happens to like.

| | clean export (no text) | text baked in |
| --- | --- | --- |
| auto-placement (`suggestFields.ts`) | 5 hit / 1 miss / 4 refused | 0 hit — the wrong tool |
| the Prepare step's ERASE | n/a | **9 of 10, two lines each** |

Two conclusions, and both are about what is IN THE FILE rather than about model quality:

- **A panel-less design exported clean is unanswerable by anyone.** There is no evidence in the
  pixels of where the words go — one fixture is an empty frame. §4 of the corpus says that
  family is half of our catalog and most of the professional one, so this is the common case,
  not the edge.
- **Baked-in text belongs to the erase**, which measures the ink and seeds a field per line —
  including on panel-less artwork and over footage. AI's only unique niche is baked text on a
  background too textured to erase (1 of 10 here), and there it can still only say WHERE the
  text is: the pixels cannot be cleaned, so the old words stay visible under the new field.
  Since 2026-08-16 the erase does not even wait to be asked — the section above scans for the
  words and opens with the box drawn, matching the hand-drawn lasso on all ten designs.

The audit is a LOWER BOUND on difficulty — the fixtures are authored, not collected. Re-run it
against a real class set before treating the numbers as coverage.

**A caution this cost.** The first argument against AI here cited the 2026-07-29 vision bench's
23% region precision. That run's dataset is the house CATALOG rendered to PNGs
(`scripts/ai-vision-dataset.mjs`, whose own header says the catalog "is exactly the thing a
user's imported artwork is not"). It measured a proxy and predicts nothing about imports. Check
what a benchmark was run ON before citing its number.

## The AI door is "inspired by this design", never "Recreate" (owner, 2026-08-19)

The recreate bench takes a finished graphic's PICTURE and returns a NoaCG template. The owner
read all 13 references across four paid rounds (`recreate-round-v4`…`v7`) and the verdict was one
sentence, repeated: **"I could use it, but it's not the same graphic."** Roughly eight or nine of
the thirteen were airable, one was very close to its original, one was rejected outright. None
was a reproduction.

**So the door is named for what it delivers.** Ship it as *"inspired by this design"* /
*"make me something like this"* and it keeps its promise every time; ship it as *"recreate this
graphic"* and every user reads the same gap as a failure. This is a product decision the owner
made on the evidence, not a hedge about model quality - the output is good, and calling it a
recreation is what would make it look bad.

Three consequences that follow from the name, and are not optional once it is chosen:

- **The similarity score is an internal instrument, never a user-facing promise.** It is
  calibrated (a good rebuild measures 42-58% of active blocks, a scale-broken one 19-34%, the
  wrong-design control 6%) and it exists to steer the loop, not to tell a user how close they
  got. A percentage on screen turns "inspired by" back into "recreate" with a number attached.
- **The reference's own text is a starting point, not a target.** The fields are the deliverable;
  the words in the picture are sample data.
- **Named capability gaps stay named** rather than being sold as near-misses. Measured over the
  thirteen references, the model reliably cannot do: diagonal or chamfered corners (everything
  comes out a straight box), thin decorative rules inside a banner, 3D/glow/shadow text
  treatments, fade-to-transparent edges, and an accent line that "draws out" and stops short. A
  design whose identity IS one of those is a design this door should not be pointed at.

The bench's own economics were retuned on the same read (`scripts/import-recreate-spike.mjs`, and
`docs/NOACG_PRO_PLAN.md` §26): the loop now ships the BEST round rather than the last one, and
stops paying once a round has answered a nearly-clean template with a worse one.

## Deliberately out of scope

Layered/PSD imports, OCR/text detection, Google Sheets, multi-step logic, state-machine
workflows, advanced custom keyframes. Remotion is a separate module and did not influence
any of this.
