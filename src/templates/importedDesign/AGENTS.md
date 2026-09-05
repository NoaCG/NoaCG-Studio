# src/templates/importedDesign - the user's own artwork

Loaded alongside the root `AGENTS.md` and `src/templates/AGENTS.md`. Add a RULE here; leave its
reasoning in the code's own comments, and the measured defect that bought it in the docs below.
This is the tightest instruction chain in the repo, so a paragraph restating one of them is a
defect, not thoroughness.

Two graphic types, one category (prefix 'imported-design', `CategoryInfo.group` 'imported', NOT
browsable - the wizard's "Import graphic" entry is its only way in): **imp01**, raster artwork
(`shared.ts` + `stretch.ts`), and **svg01** (`svg.ts`). Read the relevant contract before changing
any rule here: **docs/IMPORT_MVP.md** (raster, plus diagnosis), **docs/SVG_IMPORT_PLAN.md** (SVG -
§3 the fit ladder and the hug, §6b one fit per graphic, §6c vertical growth),
**docs/SVG_BEHAVIOUR_PLAN.md** (behaviour).

## What both variants share

- **The user's own flat artwork IS the design.** Nothing regenerates or redraws it; the only
  reshaping that ever happens is the one the author opted into (imp01's 9-slice stretch, svg01's
  growth table), and even that never rewrites the artwork itself.
- Self-assembled from `shared/base.ts`, **never `assembleStandard`**: that auto-fit's
  `width: fit-content` cap would shrink frame-sized artwork.
- Steps forced off. `designPresets.ts` (design-fade/slide/pop/blur) animates ONLY the box - artwork
  and text as one unit, because the per-line presets would tear text out of artwork drawn around it.

## imp01 - raster artwork

The wizard creates it BARE - an explicitly empty `lines` array, honoured by resolveOptions, with
teaching comments where fields will land - then hands off to the editor's Data tab; the assembler
still renders explicit lines for a caller that passes them. svg01 does not work this way - its
fields are the mapping step's.

The DOM is IMPORT_MVP's "structure contract" diagram - `#fwN` mask wrapper carries the POSITION (in
the artwork's own px), the `#fN` span inside it the TYPE (`LineSpec.style`) - and those `#fwN` rules
are the canvas drag's contract (`blocks/designLayout.ts`, which also owns `addPlacedLine`, the Data
panel's add-field, emitting a new line in exactly that shape). `.imported-design-art` is its own
registry part, so the art and each line animate independently after creation
(`blocks/presetApply.ts`).

SCALING MODE is per-graphic (`DesignArt.stretch`, picked in the wizard's Prepare step): fixed
(default - byte-identical emit to before the mode existed), or horizontal 9-SLICE stretch, where the
art becomes a border-image div. Three tripwires there: **the image ref must stay a CSS declaration,
never an inline style**, because the editor's entrance reset clears inline styles; the runtime
(`stretch.ts`) is design-owned JS OUTSIDE the marked region and drives everything from ONE
`--stretch-x`, its ladder being stretch to 4% inside the frame edge, then textFit shrink, then clip;
and the packaged SPX css hops bucket urls to `../` (`spxStarter cssForSubfolder`; zip import strips
it back).

E2E: `e2e/import-graphic.spec.ts`, `e2e/import-prepare.spec.ts`, `e2e/import-stretch.spec.ts`.

## svg01 - the SVG variant

The SVG is inlined VERBATIM, its own text/image nodes bound as `id="fN"` (markup edits: bound ids
AND the in-file `#id` references that move with them, `-art`, hidden `-outlined`, a bound
PICTURE's `xlink:href` folded to `href` so update()'s restore has something to remember);
sanitized at import (`assets/svgImport.ts`), re-checked by the gate
(rules 'svg'/'svg-binding'). Bound nodes and top-level named `<g>`s are registry parts, lines
channel 'rise'; `fieldPlan: fixed` (the fields ARE the mapping step's choices); DESIGN_PRESETS plus
`design-stagger`. E2E: `e2e/import-svg.spec.ts`.

**A PICTURE candidate and the node it BINDS are not always the same element.** Figma writes a
placed raster as `<rect fill="url(#patternN)">` painted by an `<image>` in `<defs>`, so the row is
offered on the shape the designer named and `id="fN"` lands on the `<image>` the pattern resolves
to (`svgPictureTarget`) - the only node whose href a swap can repaint. Which is why the id rename
carries the references: the pattern's `<use>` finds the picture by id.

**ONE FIT for the whole graphic** (§6b): the ladder measures the PLACED lines too, so `update()`
calls one hook, not two. A placed line's ROOM is its own SLOT - the width its wrapper declares,
AUTHORED rather than found, so it beats any rectangle a container search might turn up under it;
and being a width alone, it never wraps.

**THE LADDER is overflow-only, and its ORDER is the ruling** (owner 2026-08-23 and 2026-08-26):
**fill the room, grow the panel where the author opted in, wrap into the room the design already
has, shrink to 55%, squeeze what is still over, and report the field.** Copy that cannot be made to
fit is warned about, never cut - `noacgTextOverflow()` names the fields, and the warning rides the
machine-state answer rather than a channel of its own (`control/controlModel.ts`). Each rung cost a
measured defect; §3 holds the evidence:

- **Room, not drawn width.** The budget is what the shape behind the line offers, and it STOPS at
  whatever is drawn beside the line on its own rows (`svgFitNeighbour`); such a PENNED line never
  drives the panel's growth, because widening gives it nothing. **Only what is drawn INSIDE the
  box bounds anything** - a plate standing beside another plate is not that line's furniture
  (`svgInsidePanel`, owner walk 2026-09-02).
- **EVERY LINE HAS AN ALIGNMENT, and it is read off where the designer drew it** (`svgAlignOf`,
  owner walk 2026-09-02; design `docs/TEXT_BOX_BINDING.md`). Nothing is asked and nothing is
  stored: on each axis the drawn insets are compared and the line is CENTRED when its centre sits
  within 5% of the box's, else aligned to the nearer side. An explicit `text-anchor` states the
  ANCHOR and is believed; **it is never an opt-out of the sideways half** - where the line was
  drawn is measured all the same, because they are two facts and a file can state one while
  drawing the other (stating one used to skip the anchor, the room and the growth). Agreeing,
  the line is treated exactly as a derived one; disagreeing (a centre-anchored line composed into
  a plate's empty left half), the anchor stays WHERE IT WAS DRAWN and the room is measured about
  it, since moving it would invent a centring nobody drew. Three things hang off it, and this is
  why the alignment had to exist before any of them could be right:
  - **Centring SNAPS to the box's real centre** (owner ruling: *"that just usually looks
    better"*), emitted as a real `text-anchor` plus an `x`. The distance to where the text was
    actually drawn is kept as `align.nudge` for a composition that is off-centre on purpose.
  - **Its room is the box's inside, not the run from where it was drawn to the far margin** -
    the design's tighter margin kept on both sides and spent FROM THE ANCHOR, so a middle-anchored
    line may reach the nearer margin twice over and an end-anchored one fills leftwards until it
    meets the other. Measured ONCE at rest, in the box's own frame, because moving the anchor
    moves the text and a budget read off the text would answer differently on the second pass.
    Never for a PENNED line.
  - **A block grows about the drawn line rather than only downward from it.** The panel's top
    padding mirrored is the right bound for a line composed against the top of its box; for one
    the designer CENTRED, the space above is not margin at all and mirroring it handed back a
    fraction of the box - his question measured 64 units of room in a plate 259 tall and shrank
    to 62% rather than taking the second line that plainly fitted. Centred, the room is symmetric
    about the drawn centre with half a line's leading kept from each edge, and `svgRise` lifts the
    painted block by the lines it gained so it stays where it was composed. The new rule may only
    ever ADD room, so a design the mirror already served is untouched.
- **MEASURE IN THE BOX'S OWN FRAME, never in screen rectangles** (`svgLocalBox`). A plate turned
  three degrees has a screen rectangle bigger than the plate, so "the middle of the box" read off
  one is not the middle of the plate - and hand-drawn artwork is routinely on an angle. The
  panel's corners are mapped panel-local -> screen -> line-local; text and plate almost always
  carry the same rotation, and then it is exact.
- **Wrap only into room already drawn**, keeping the designer's own gaps: line to the nearest thing
  below it inside its panel, re-asked at every size, dropping a LINE rather than printing through
  the layer below. Every bound is measured off the rest pose, never a constant.
- **The shrink is FLOORED at 55%**, and past the floor the block is SQUEEZED to its budget
  (`svgSqueeze`), because nothing may ever paint outside the panel.
- **Measure exactly, and from the DESIGN**: screen px convert through the element's CTM, never an
  advance/ink ratio; the drawn text is read in the real face and never re-taken from what is on
  screen, or a playout renderer's first `update()` becomes a budget nothing can overflow (owner
  2026-08-22: shrink, never condense).

**GROWTH is the alternative the mapping step ASKS for, and it is a VERSIONED TABLE**
(`DesignSvg.growth` -> `NOACG_LAYOUT` v1, emitted by `layoutDataJs` and read by `growthRuntimeJs`):
each row names one element by its `data-noacg-el` stamp, its axis, its safe margin, and optionally
its FOLLOWERS. §6c carries the mechanism; these are the tripwires.

- The table lives in the design-owned JS, **never in `NOACG_ANIM`** - the timeline rewrites that
  region. `layoutRules` NORMALIZES the pre-format one-rectangle `stretch` into an axis-'x' row, and
  `followers` is ADDITIVE, so declared-vs-derived cost no second version.
- **The stamp is a LIST, matched word-wise** - one element may be named by TWO rows, which is how
  wider-THEN-wrap ('xy', and the mapping step's measured default) needed no new format. Every row
  reads its followers and its lines while the artwork is AT REST, or it records a pose an earlier
  row already moved.
- **The axes sit on opposite sides of the fit.** Sideways, growth is extra BUDGET, so it runs BEFORE
  the fit and the shrink answers what the cap withheld; downwards it is somewhere to WRAP into, so
  the fit runs first against the most that rule could give (`svgOfferHeights`, at rest) and the
  panel then grows by what the settled block needed (`growSvgHeights`). One measure, one fit, one
  apply, **never iterated** - wrap and grow are circular, and an iterated answer settles differently
  in the editor, in an export and under SPX. **Every re-measure RESTS the layout first**
  (`refitSvgText`), or the last pass's growth reads as this pass's room and a graphic that grew in
  the editor collapses on air at `document.fonts.ready`.
- **The cap is the DESIGN'S OWN MARGIN** (`svgGrowCap`), never a constant: the inset the panel keeps
  from the frame edge it is ANCHORED to, MIRRORED onto the edge it grows towards and floored at the
  row's `safe` - and for a panel widening from its middle, the NEARER of its two margins, spent half
  on each side. An inset is never negative, so outgrowing the frame is impossible by construction
  rather than by a number somebody has to keep right. **And a panel grows AWAY from the edge it is
  anchored to** (`svgGrowDir`), so a lower third gets taller UPWARDS with its composed edge staying
  put. Sideways the TEXT answers it, in three ways: a START-anchored line needs the far edge, so the
  panel widens right; a line the designer CENTRED or set against the right reads its room from the
  box, so the panel widens from its MIDDLE and the offset it was drawn with survives - unless the
  middle offers less than one side alone does, and then it grows the way there is room to. The stack
  is pinned to the anchored edge, so the drawn bottom padding never moves; furniture SPANNING the
  growing axis travels with it (`svgCollectSpanners`), and an end CAP hugs whichever edge moves.
- **A wrapped line restarts at the text's own `x`, and a layer with NO `x` starts at 0** - SVG's
  default, and where Illustrator puts it since it writes the position in the transform. The value is
  read back through `svgFitValue`, because `textContent` joins tspans with nothing between.

A graphic with an EMPTY table never moves, and a lower third's default row is measured at design
time by the wizard, never at play time (`src/components/wizard/AGENTS.md`).

## BEHAVIOUR - recipes, one table, one runtime (docs/SVG_BEHAVIOUR_PLAN.md)

`behaviour.ts` is the COMPILER; `boundBehaviour(svg, artworkFields)` is all `svg.ts` asks for. A
behaviour is a DECLARATION in `templates/behaviours/<id>.ts` (roles, rows, owned fields, machine,
controls, paint rules); the compiler stamps the picked layers with `data-noacg-role="role/KEY"`,
emits the versioned `NOACG_BEHAVIOUR` table (`blocks/behaviourData.ts`) and ONE paint runtime
(`behaviourRuntime.ts`) in the design-owned JS, and hands `attachMachine` the type. **A recipe
adds no emitted JS**: a behaviour that needs a line is a missing FIELD KIND in the runtime.

- **A look shows when ANY of its rules holds; a rule is picks only** - any of some `group/state`,
  and all of some `role:fact` a field's KIND exposes (`selectedAnswer:picked`, `score:moved`,
  `clock:warning`, `voteStatus:open`). No comparison outside the runtime's kinds, ever.
- **Classes, never inline styles** (`<prefix>-look` / `-on`, one pair for every recipe): a snap
  clears inline props. **Gauges measure once, at rest.** **Bars move on DATA, not on state.**
- The wire and its rulings survive unchanged: the vote's five field TITLES are the join to the
  audience plane (`pollFieldMap`), `Vote status` is a token the controller writes (the
  `vote-status` kind falls back to the count line only when it is unstated), the score's `+1`
  rides `adjust` and New game rides `set`, the countdown's take starts the count and holds at
  0:00 (the `clock` kind latches a finished count until a new length arrives), and a repaint has
  THREE drivers: a state entry (`noacgRepaint` on every recipe state), a data write
  (`noacgRepaintData`) and the clock's tick (`clockPainted`).
- The validator pairs the table with its runtime and checks every state and field a rule names.

E2E: import-svg-behaviour (vote: fixtures/svg-corpus/illustrator-live-vote-band.svg; score:
illustrator-four-team-scoreboard.svg; countdown: illustrator-question-timer-board.svg) +
configured/imported-quiz-output.
