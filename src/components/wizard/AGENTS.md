# src/components/wizard - the creation wizard

Loaded alongside the root `AGENTS.md` and `src/components/AGENTS.md` when working in this
directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly).
Keep it accurate. This chain sits close to `project_doc_max_bytes` and
`npm run check:shared-instructions` refuses a careless addition: add a RULE here, leave the
reasoning in the code's own comments.

## Wizard (wizard/)

CreationWizard (Entry -> Browse -> Fields -> Style -> Animation -> **Finish**, persistent live
preview), draft.ts, WizardPreview, MiniPreview, steps/. Creating calls `variant.create(options)`
which generates the complete, commented template. THREE entry cards (template, Create with AI,
Import graphic) in a two-column grid, plus the separated video strip; Advanced mode adds blank.
An ODD LAST CARD spans the row (`.wz-entry-card:last-child:nth-child(odd)`) and sizes to its
OWN copy — the row-alignment reserves are two empty lines on a card with no row-mate. Create
with AI is the ONE AI door - NoaCG Pro is an execution TIER inside it, never a second card;
there is no kit card either (see the kit path below).

**THE ENTRY STEP'S CONTENT** (steps/EntryStep.tsx, handoff §2a; reasoning in that file's
comments). Hero = the LANDING PAGE's headline verbatim plus a subtitle naming BOTH routes to
air - the cloud control panel and EVERY export target, never a sample of three - no second
brand mark, no export-target chip row: the targets belong in the SENTENCE, and a new export
target updates this copy too. Home = a full-width ROW whose Graphics / Productions
shortcuts are SIBLINGS of the body button, shown only when there is saved work. The video strip
is ONE LINE, carries no label of its own, and is FLUSH with the card grid. Both AI doors
(Create with AI, video) wear the Beta tag INSIDE the title, and the AI card ALSO says it in
words: `ai-testing-note` LEADS its hint, inline so the three-line reserve still holds. The
fuller sentence is AiStep's own ⓘ — never a second notice pattern, and the door is never
disabled. **THREE DIVERGENCES ARE DELIBERATE**, pinned by `e2e/wizard-entry-fit.spec.ts`: no
kit card, cards act on CLICK not radio-plus-Continue, Blank stays behind Advanced mode.

**THE HEADER'S DOORS ARE DISTINCT DESTINATIONS**: the brand lockup is an `<a href="/">` to the
public FRONT PAGE (as on every topbar), `wz-home` beside it is Home, and `wz-new-graphic` after
it is the shared NewGraphicButton in the shell order (logo -> Home -> + New graphic) - mid-walk
a guarded start-over that keeps the draft (Back returns to the step), on Entry a no-op. Home
must stay one press from every step - ✕ only rewinds to the front page. Every wizard-shell
control answers a hover in amber like the entry cards, stated once over `.wz-header`/`.wz-dot`
in `src/styles/wizard-and-dialogs.css`, never per button.

**EVERY STEP IS ITS OWN HISTORY ENTRY** (`#/new/step/<name>`, src/app/router.ts): the step is
named, NEVER indexed, because import mode's extra step shifts every later index. Step 0 carries
no segment, so Back off the front page still leaves. Two rules follow. The open reset seeds its
step from the route, not from 0. And **nothing the wizard renders may navigate a live frame** -
WizardPreview mounts a NEW iframe per document (keyed on its generation) because replacing an
existing frame's `srcdoc` is a subframe navigation that joins the session history, which put one
dead Back press in the walk for every rebuild.

**THE FEEDBACK DOOR IS ON THE WIZARD HEADER** (`BetaFeedbackButton area="wizard"`; Home carries
`area="home"`). Two dependencies: the header's push is a
CHAIN (`.wz-stepcount ~ .fb-open`, `.fb-open ~ .gallery-close`), since the step counter is
absent on Entry and the button absent offline and whichever exists first takes the auto margin;
and the shell behind the wizard mounts a SECOND button, so a locator says which via `data-area`.

**LAYOUT AFTER ENTRY: rail | form column | preview** (handoff §2). Entry is a card menu - NO
creation-step navigation, the rail's 216px goes to the menu - and the rail appears the moment
a card is chosen. From then on, the steps are a 216px vertical RAIL
(`.wz-rail`, still `.wz-dots`/`.wz-dot` so every spec still addresses them): number-or-green-
tick, title, and a second line naming the decision the step asks for. The rail's foot reads the PROJECT
FORMAT back for the whole walk while the control stays in the step that owns it (Browse, AI,
blank) - one decision, one home. Under 768px the rail lies down as a scrolling chip strip and
that read-back stands down (it needed ~212px the row lacks). The FOOTER belongs to the form
column, so Next sits under the form it advances, not under the graphic beside it.

Two measured constraints:
- **After Entry, the rail's 216px leaves the row before either pane sees it.** A WORKING left
  pane (`.wz-body-working`, the Import flow's Text step) lifts the measure cap and clamps the
  preview, or the placement canvas drops under the 700px floor `e2e/import-graphic.spec.ts`
  holds. **Only a step whose left pane is a CANVAS may wear it.** The SVG mapping step wore it
  and its left pane is a form: the class took the preview to ~275px wide, on the step where the
  reader decides whether their text fits (docs/SVG_IMPORT_PLAN.md §6a step 1). Without it the
  preview is 614x345 on a 1366x768 laptop, four times the area.
- **The Entry step's HEIGHT budget still binds** (`e2e/wizard-entry-fit.spec.ts`, 1366x768):
  cards share the column, and the grid's 10px came off the hero's title margin. Grow one, pay
  from another.

**Deep-linked open** (`#/new/<variantId>`, docs/PRERENDER.md - a prerendered template page's
CTA): the router's `design` param rides through `openGallery(designId)` into templateStore's
`pendingDesignId`; the wizard's open effect resolves it via `variantById` and, on a hit,
applies the SAME patch `BrowseStep`'s card click does, jumping straight to Fields (mode
`'template'`, step 2) - never creating a project, Finish stays the only door that does. An
unresolved id (unknown, retired, `imported-design`) falls through to the ordinary Entry-step
open.

**Finish** (steps/FinishStep.tsx - the last step of every catalog-shaped mode, design included)
is the wizard's ONE branch. It carries the graphic's NAME (`draft.name`, applied inside
`buildDraftTemplate` so it reaches the topbar, the Save prefill and the export slug through one
path; blank falls back to the design's catalog name), a read-back of what was chosen, and two
doors:
- **Open in the editor** - the classic ending. Creates and hands over; saving stays the
  user's move.
- **Export it** - creates, SAVES to the library (not optional; reasoning on
  `createAndExport`, CreationWizard.tsx), and opens ExportWindow OVER the wizard
  (`applyTemplate`'s `keepGalleryOpen`); closing the window returns to the last creation
  step, so a follow-up tweak costs no re-walk. The editor is never revealed. A FAILED save
  deliberately stays in the editor instead, where the topbar's failed status is visible.
- **Add to the production** - the primary door. It applies with `skipNavigation` +
  `keepGalleryOpen` exactly as Export does, so the editor never flashes on the way to the rundown,
  and a failed save leaves the wizard open on Finish to press again. It CONFIRMS first, through
  `WizardConfirm` (the wizard's one dialog shell, portalled to the body), and that dialog PRINTS
  the production: stating back the dropdown the reader could walk past IS the point, not "are you
  sure". Specs that only want the production page use `addToProductionFromFinish`.
Both doors go through `applyDraftProject`, which is what keeps them byte-identical - the
editor path formats through Prettier (`applyGenerated`), so an export path skipping it would
ship different HTML for the same choices. The footer's quiet "Create project" shortcut stands
down ON Finish and works from every step before it. The graphic's name slugs the zip AND, for
the SPX and CasparCG targets, the template FOLDER inside it - the name the operator reads in
the playout server. Pinned by e2e/wizard-finish.spec.ts.

**A FinishStep door that closes the wizard snapshots the walk** (`FinishedWalk`, taken in the
three appliers); re-opening onto a `#/new/.../step/<name>` url offers it back behind a warning
naming what re-entering resets, while the plain `#/new` still means a fresh wizard and discards
it. A second pass saves OVER the record that walk made: `saveBuiltGraphic`, never `saveGraphicAs`
direct. The KIT and Pro-package doors save a SET, reach no applier, and so still have no way
back; nor has a graphic opened from HOME (docs/backlog/back-to-the-wizard.md).

**A closed `<details>` needs an author rule here** - the UA's `display: none` on non-summary
children loses to ANY author `display` (the Style step's disclosures wrap `.row`, a flex),
hence `src/styles/wizard-and-dialogs.css`'s `details:not([open]) > *:not(summary) { display: none }`. `toBeVisible()`
is blind to it, so specs assert measured HEIGHT is 0, never `open`.

**Browse** (steps/BrowseStep.tsx, mode 'template' only) is the FACETED template storefront
(docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12 for the facets - in their retired tile-wall presentation -
and §4c for the groups; re-design/handoff.md §2b for what they are drawn as; the catalog-side
vocabulary is src/templates/AGENTS.md's):
search (alias-aware in ENGLISH, SWEDISH and FINNISH, src/templates/search.ts), optional
programme family/format selects (RANKING — "Best for X" / "Also works" sections, never
exclusion), **ONE graphic-TYPE dropdown carrying BOTH LEVELS** (proposal §19 Option A, owner
2026-08-27): the ten shelves as SELECTABLE heading rows (`browsableGroups` over `CATEGORY_GROUPS`,
model/taxonomy.ts), their member categories (`browsableCategories`) NBSP-indented under them, every
row with its live count. No `<optgroup>` and no "All <shelf>" row: the
heading itself is the whole-shelf answer (owner walk 2026-08-28 - the label+All pair read as
"written there double"; a one-member shelf stays a plain option).
Option values are `group:<id>` / `cat:<id>` — a bare id cannot say which level a row is —
and a category answer ALWAYS sets its shelf too, so the chip, the count and the value the
control reads back describe the same pair. **There is no member-category chip row any more**:
it was level two of this one question drawn as a second row of `.wz-filter` pills directly
over the STYLE pills, which are a different facet drawn identically, and the owner read the
pair as "a third way of looking at things". For the same reason the active-filter row shows
ONE chip for the whole type answer, naming the narrowest level and clearing both.
Field-count buckets (range-intersection over the reachable visible range),
style-family chips, and the specialist facets (structure / capabilities / placement-motion)
behind the Filters disclosure. Filter state lives in
CreationWizard (`browseFilters`) so Back returns with filters intact; the setter is passed as
a REACT DISPATCH so chip toggles compose as functional updates (two clicks in one batch must
never overwrite each other). Zero results name no template dishonestly: the empty state
offers "remove the most limiting filter" (computed: the chip whose removal restores the most
results) and a Create-with-AI hand-off. Cards carry the strict info budget (category ·
subtype, top families, field summary from semantics, ≤3 capability badges, complexity, style
family), with everything the budget excludes one ⓘ click away in the card's detail panel
(a SIBLING button of the card button, never nested; one panel open at a time).
**THE CAPTION IS THE NAME ALONE, and the line under it says what the graphic IS** (proposal
§12.3, amended 2026-08-26). The style family is a FILTER, not an identity: it rides the last
line beside complexity as a dim `.wz-style-tag`, never opposite the name and never in a
per-family colour. The style row wears a `.wz-filter-lead` caption naming the
question it answers ("Style:") — it is the only chip row on the step now, and an untitled row
of pills under a dropdown reads as a second axis.
**A WORD NOTHING IN THE CATALOG CARRIES IS SET ASIDE, AND SAID BACK.** `browseTemplates`
returns `ignored`, and the count line renders it ("ignoring “my”",
`data-testid="wz-browse-ignored"`). Token-AND is exact, so one unreachable word used to take
the whole query to zero — measured 2026-08-27, "big title" returned NOTHING while "title"
returned 71. A result the reader did not entirely ask for has to admit which part of the
question it dropped; a query made only of unreachable words still honestly returns nothing. The footer's brand
toggle feeds `brandFamily` as browse CONTEXT, not a filter: the package's siblings rank
first, no chip appears, Clear-all leaves it alone, and a genuine programme match always
outranks it. MiniPreview mounts its iframe only when the card scrolls into view
(IntersectionObserver).

**IT SHOWS A PAGE, NOT THE CATALOG** (handoff §2b). `PAGE_SIZE` = 12 plus **"Show 12 more"**,
and the step states both numbers — `Showing 12 of 82`, `data-testid="wz-browse-count"`. Three
rules: `browseTemplates` still returns the WHOLE result and gains no limit argument (the total
is what the count line reports); the limit is spent on the RANKING then split into the two
sections, so "Show more" walks "Best for" into "Also works"; and the page resets on any result
change, derived during render off a signature, never in an effect (flash reasoning in
BrowseStep.tsx). For SPECS: search for a named design (`pickDesign`, `e2e/_browse.ts`) and assert
`resultTotal`, never a `.wz-variant` count.

**THE KIT PATH — one door, at the top of Browse** (docs/PACK_TAXONOMY.md, "The wizard
surface"). `.wz-buildmode` (ONE GRAPHIC / A WHOLE KIT) swaps the step body between the design
grid and **KitPicker** (genre preset, then a card per graphic over `templates/kit.ts`
`kitChoices`). **A KIT SHOWS ITS CONTENTS** (owner, 2026-08-27: choosing one was "buying a pig
in a bag" — 33 checkbox labels, "Volt Scorebug", "Pager", "Doors Open", none of which says what
it looks like). Every row is a `KitRow` card: a settled **MiniPreview of the real design**,
its name, and its graphic type, with the checkbox still carrying `data-kit-item` so the
selection contract is unchanged. Two things that must not regress — the preview is
intersection-gated (a 33-graphic kit would otherwise be 33 live timelines on arrival), and
`.wz-kit-thumb` is `pointer-events: none` because an iframe swallows the click that would
otherwise reach the label around it, so clicking the picture of the graphic you want has to
toggle it;
the format picker and the SEARCH sit above the branch — one box: designs on one side, shows and
the graphics a kit can hold on the other (facets stand down).
Filtering hides rows, never unticks them, and the count stays the whole SELECTION.
Picker state lives in CreationWizard like `browseFilters`. A kit then walks the SAME six steps
a single graphic does (`mode` stays `'template'`; `KitPlan`, wizard/kitPlan.ts, makes each step
one graphic OF A SET) plus **KitTray**, **KitLookStep** and **KitFinishStep**. What
they must not break: the tray is the second axis of progress, in the rail's vocabulary, its
done chips MiniPreview in `lazy` mode (its one caller), not navigation; the
look question is a bordered card, never a modal (it would cover the rail and tray), and its
yes is a deterministic transform over the `:root` contract and
NOTHING else (`kitLookPatch` — the motion preset carries only where the target design DECLARES
it, and the brand toggle reaches every graphic of the set); both Finish doors SAVE
FIRST, every write claimed (see "Save + Home"), export asking the production page for its
dialog via templateStore's one-shot `pendingProductionExport` and NAMING the production it
packages, which is the whole pool; and the kit's last rail entry is not a jump
target (the graphic in hand was BUILT), while re-finishing the tone-setter re-propagates.

**ONE disclosure, EVERY width, closed by default** (`.wz-browse-drawer-btn` +
`.wz-browse-filters`, handoff §2b; the cost of two is in BrowseStep.tsx's comments). LEADING
the step: search, the type select, the style families. Behind the toggle: programme, field
counts, structures, capabilities, motion — with the active count on it, so a narrowed catalog
never reads as an empty one. The LEAD ROW is a GRID of two lines (select + Filters, then the
chips), never one wrapping flex line - this step's column halves the moment a design is
picked, and a flex row degrades there into a chip stack beside a lone select.

The shared PROJECT FORMAT picker (`ProjectFormatPicker`, aspect / resolution / FPS,
`.wz-browse-format`) is not a facet — `browseTemplates` never reads it — so it never sits
inside the filter drawer. On Browse it is three bare selects in ONE row, since the rail
captions and reads back the format; each label's text is hidden via `.project-format-label`,
kept in the DOM for a screen reader — hide the WORDING, never the control, and every other
caller renders the picker unchanged. The same controlled picker appears before generation or
placement in AI/Lite, Import Graphic, blank, video AI, and the older import/catalog
continuation; draft selection survives route switches. Blank is a setup step, never an
immediate default-format create. The import-images
continuation (mode 'import') keeps the old ImportStep -> TemplateStep flow and indices; the
catalog flow's later steps sit one index earlier (`animStep`), and FINISH follows Animation
in every mode (`finishStep = animStep + 1`).

**Import graphic** is a SETUP flow, not a second editor. Its one drop zone takes three MODES, never
a branch: `design` (any raster - ImportDesignStep + PrepareDesignStep + PlaceFieldsStep + the shared
AnimationStep, walked as Start -> Design -> Prepare -> Text -> Animation -> Create), `svg`
(MapSvgFieldsStep alone), and `file` (a finished template). **What each step DOES is owned
elsewhere**: `docs/IMPORT_MVP.md` sections "The canvas + data-field phase", "The fields place
themselves", "The Prepare step: erasing baked-in text", "The step opens with the box already drawn",
"Scaling mode: fixed vs horizontal 9-slice stretch", "The typeface the design was actually made in"
and "A finished template file, through the same door", plus `docs/SVG_IMPORT_PLAN.md` §§1-4 and
§§6a-6c. **Not that doc's "The wizard is a SETUP flow" section** - it still describes the three-step
walk from before the Text and Animation steps existed, so the order above is the shipped one and
that section is stale. What follows is only what this wizard owns.

**`design` mode.** The artwork's INTRINSIC pixel size is the measurement every downstream number
comes from. Create is available from the Design step on, so every later step is an optional stop.
The Text step OPENS with the fields already placed where the artwork has an empty panel
(`assets/suggestFields.ts` - deterministic, no model call), ONCE and only into an empty step;
`✨ Suggest fields` re-runs it, and artwork with no flat panel refuses out loud while the manual
tools stand unchanged. Specs live in `draft.designFields` in DESIGN px and become REAL placed fields
at build - `draft.ts` `withDesignFieldSpecs` runs addPlacedLine + setLineTextStyle + setLineFit, so
wizard placement, editor, preview and export agree by construction. Every font source the
**FontPicker** (`wizard/FontPicker.tsx`) offers EMBEDS, so playout never depends on the machine's
fonts, the emitted code never references Google, and Local Font Access stays Chromium-only and
permission-gated.

**The Animation step differs for this category alone:** the UNIVERSAL in/out bank LEADS
(`components/MotionPresetPicker.tsx`) in place of the category's four whole-unit presets, which the
bank stands in for (`draft.ts` `isWholeUnitPreset` hides their cards; the SVG layer stagger stays
beside them). The pick lives in `draft.animation.motionIn/motionOut` and is written AT BUILD by
`withUniversalMotion`, through the same engine the saved graphic's control page applies after - so
the wizard preview, the created graphic and the page that reads it back agree by construction. The
default maps design-fade -> fade, so an undecided design lands on the same data the card it shows
lit would write. Pinned by `e2e/motion-presets.spec.ts`.

**Prepare's erase is an OFFER, never applied pixels.** `proposeEraseRect` scans on arrival so the
strongest path is not opt-in, it re-runs on the CLEANED artwork after every accepted erase, and
under its confidence bar it proposes NOTHING and names the rule that refused (`erase-scan-refusal`).
Its overlay CSS is wizard-local (`prepProposal.css`), not `src/styles/`. **"It's meant to be there /
no baked text" is DRAFT state** (`designKeepBakedText`), cleared by "yes, mark it" and reset by a
fresh drop; the Text step re-scans and says so when detected text remains un-erased
(`placefields-baked-note` - a back-to-Prepare door plus the keep answer), and Next never blocks, the
fact travels. An applied mark keeps `DesignEraseState.segments`. Marks ACCUMULATE into
`draft.designErases`, each run against the artwork as it stands, and removing one REPLAYS the
survivors from `draft.designOriginal` so fills never compound - a fill cannot be undone in place.
**The erase MEASURES the ink it removes**, split into LINES, and every line seeds a real field at
create from that line's own bounds, cap height, top and the edge it was set from, never from the
loose rectangle the user drew. FieldsStep and StyleStep carry NO imported-design branches: design
mode never reaches them.

**`svg` mode.** Prepare and Text cannot apply; MapSvgFieldsStep is the one mapping step, over text
layers, pictures and the OUTLINED-TEXT rows - a ticked glyph group is hidden and a placed line
stands in, its box MEASURED on the step's own inline render and never the preview iframe (`draft.ts`
`withSvgOutlineFields`/addPlacedLine). **The SVG export help LEADS the drop step, ABOVE the zone**
(`.wz-help-strip`): nothing below the gesture's target is read. Three rules in `assets/svgImport.ts`
are load-bearing: a `<tspan>` is a LINE or a KERNED RUN and only the measured GAP tells them apart
(`groupRuns`); hidden layers and `<defs>`/`<symbol>` text are never offered; outline rows are RANKED
by whether the shapes read as type, never filtered. **EVERY detected text row starts ON** - the `f:`
prefix guarantees a field and never turns unmarked rows off (only a PICTURE, off by default, is
switched on by it). The step has a measured HEIGHT BUDGET, e2e-pinned EXACTLY by the fold cases in
`e2e/import-svg.spec.ts`: a copy change costing a checklist row fails, one buying a row updates the
number. Editing a row's sample writes it into the PREVIEW exactly as `update()` does on air, so a
real length is testable here.

**A field the file never drew** arrives through "＋ Draw a field on the artwork", a marquee on the
PREVIEW (`WizardPreview` `drawIn`/`drawing`/`onDraw`) whose box comes back as FRACTIONS of the
artwork's rect and lands as a `DesignFieldSpec` in `draft.designFields`. Three rules: the spec asks
`fit: 'shrink'` (the ladder measures `data-fit="shrink"`), because a wrapping line would dodge the
too-long warning; the drawn box IS the em box (`lineHeight: 1`) and a CLICK gets a field-shaped
default; `drawIn` is tracked for the WHOLE step, since the rect arrives a frame late and arming at
the gesture lost the first drag.

**THE ARTWORK IS ALSO THE CONTROL SURFACE**: every offered layer is tracked (`WizardPreview`
`pickable`/`onPick`) and the HIT-TEST RUNS APP-SIDE against the pushed rects, because the iframe has
no allow-same-origin. Tie-break is the editor canvas's - innermost by depth, then smallest box. The
canvas answers WHICH layer and the step decides what a pick MEANS, except on a **picture-filled
backplate holding both roles on one marker**, where a DRAG is decided before the binding kinds, so a
click ticks the picture and the ladder turns growth off. Anything spreading the inventories dedupes
by id. **Both handlers are held in a REF, never state**: as state, every re-report is a render and
React stops the wizard with "Maximum update depth exceeded" while every assertion passes. **A
pointer is a ONE-SHOT and the rects arrive a frame after the document commits**, so anything driving
this canvas waits for a layer to ANSWER, not for the surface to exist (`awaitPickable`).

**FOLLOWERS: geometry proposes, the author edits.** `proposeFollowers` measures the runtime's guess
on the step's render, outermost-first, never a group AND its contents. **An untouched proposal emits
NOTHING** - the runtime derives, as the hug did - and **the first edit materializes the whole set**
(`svgStretch.followers`). It renders only where there is something to decide, and growth alone opens
nothing. **A TRAVELLER THE READER CHOOSES ABOUT IS ARTWORK**: a text layer past the edge is STATED
in one line and committed WITH the set, never given a control row. `followArmed` is a visible MODE
rather than a modifier, so an armed pick toggles a FOLLOWER and a pick on text does nothing.
**THE LIST SAYS WHICH LAYERS, NEVER HOW EACH ONE BEHAVES** (owner 2026-09-05, settled on the corpus
2026-09-06 - docs/TEXT_BOX_BINDING.md, "What travels is not a question"): the per-row move/grow
picker is gone, every listed layer moves, and furniture drawn to the growing panel's own two edges
stretches by itself (`svgCollectSpanners`) without ever being a row. `mode` survives in the draft
and in `NOACG_LAYOUT` for saved templates and for a pro editing the code - never as a control.
**Every handler patching `svgStretch` must SPREAD it**: rebuilt fresh, it dropped the axis.

**THE TOO-LONG CONTROL IS A LADDER**, in the owner's order - wider, wider-then-wrap, wrap, smaller,
with shrink LAST; `xy` is both, emitted as two rows on one panel (`svgGrowthOptions`). **THE DEFAULT
IS MEASURED** where the artwork is unambiguous (`proposeBannerGrowth`): a banner rectangle whose
STACKED bound lines are all start-anchored, with room before the margin, defaults to grow-xy, the
whole ladder ('x' alone skips the wrap). A pair sharing one baseline argues neither way; no stacked
line, a non-start anchor, a full-frame backplate or a quiz behaviour keep shrink and the step asks.
**Never size-against-frame.** It re-derives with the rows until a growth control is touched
(`authored`). **THE PANEL PICKER OFFERS ONLY SHAPES A BOUND LINE SITS IN** - drawn OR placed, the
pair `svgFitNodes` walks, since the runtime grants any other zero - and where there is ONE it is
NAMED, not asked. **A SHAPE'S SIZE IS WHERE IT IS PAINTED, NEVER ITS ATTRIBUTES**
(`assets/svgGeometry.ts`, owner's quiz board 2026-09-02): the inventory applies every `transform`
down the ancestor chain, because that order decides which shapes make the list, which one
`proposeBannerGrowth` picks, and the size printed beside each. Read raw, a plate turned 88 degrees
inventoried as the portrait rectangle it was before the rotation, and the growth default landed on
an answer plate.

**`file` mode** takes a finished template (`.html`/`.zip` -> `importTemplateFile`): a two-stop rail,
the imported template as its own preview, and the ordinary Finish doors. A template declares its own
fields, canvas and motion, so it skips Prepare/Text/Animation by having a MODE rather than a branch.
Its code is applied BYTE-FAITHFULLY (`applyTemplate`, never `applyGenerated`/Prettier) - the
graphic's NAME is the only edit, because it slugs the zip and the playout folder.

E2E across the three modes: `e2e/import-svg.spec.ts`, `e2e/import-graphic.spec.ts`,
`e2e/import-prepare.spec.ts`, `e2e/import-stretch.spec.ts` and `e2e/google-fonts.spec.ts`.

The steps are driven by each variant's declared CAPABILITIES (model/wizard.ts): the Fields step
offers up to `maxLines` text lines plus the logo toggle + custom upload on a `logo: 'optional'`
design (built-in slots show it checked and locked); it also offers a graphic TYPE's SETUP values
- which answer a quiz marks correct, the club colours, a countdown's duration - rendered through
the shared `fields/FieldControl` like every other editable field, and written to
`WizardOptions.content`. **What counts as setup is DERIVED, never declared twice:**
`setupFields` (templates/types/graphicType.ts) drops every field an operator event carries as
its PAYLOAD, because in this model a pick IS payload - so live state (the contestant's answer,
the highlighted row, the verdict) cannot be offered at build time, and image fields stay out
because their value is an asset path. A design with none shows no section at all. Its label is
a word, so it gets `.wz-setup-label`'s own column, never `.wz-fid` (`src/styles/wizard-and-dialogs.css` says why).
Pinned by e2e/wizard-setup-fields.spec.ts,
including a registry-wide check that a setup value lands on the field it NAMES (the write is
positional - out-of-order emission would silently put the club colour in the period chip);
the Style step has TWO size knobs (Graphic
size -> --scale, Text size -> --type-scale); the Animation step renders the slide family as ONE
card with a direction-of-travel picker.

**THE ANIMATION STEP OFFERS THE UNIVERSAL BANK IN EVERY CATEGORY** - the switch
(`draft.ts` `usesUniversalMotion`) asks the BUILT TEMPLATE whether it has a unit to move, not
what category it is. Where the design has choreographies of its own they lead, in their own
grid, and the six universal families sit under a **"Simple motion"** `<details>` beneath them
(open from the start when the graphic already holds one). Where the design's own presets ARE
the whole-unit kind - the imported design - the bank leads and those cards stand down. The
reason it is an addition and not a replacement is measured: no catalog preset is a whole-unit
motion the bank duplicates (they all move a box AND stagger what is inside it), so cutting them
would remove taste, not duplication.

**ONE LINE PER THING, AND AN ⓘ FOR THE REST** (GOALS goal 4; `SectionHead.tsx`): title, one
muted line, and an ⓘ holding what it does AND why it exists. The mapping, Animation and Import
Design steps wear it; a new section starts with it, not a paragraph under an h3. **THE SPEED
BUTTONS WRITE 0.6 / 1 / 1.8** (`AnimSpeed`, GOALS goal 6: ±33% was real on the clock, invisible
across separate replays; 0.75/1.5 stay valid stored values). **The lifecycle demo's stop/replay
follow the TEMPLATE's own durations** (`demoCycle`), never a fixed pair: a fixed beat is what made
Speed and Easing read as dead on a FADE, which has no travel to judge them by.
**THE EASING DROPDOWN REACTS TO THE MOTION** (`blocks/motionPresets.ts` `easingsForMotions`) and
shows the no-code `plain` names. Picking a motion that cannot render the current curve drops the
choice to Auto rather than keeping a setting that does nothing.

**THE PREVIEW PLAYS AN ENTRANCE AND SETTLES A TRAVEL.** Off the Animation step, a graphic whose
motion is MEASURED (`blocks/animData.ts` `hasMeasuredMotion` - a roll, a crawl, a marquee) is
parked at rest instead of played: measured motion is CONTENT-LENGTH motion and starts with its
content off-stage, so playing it answered "what does this design look like" with an empty box for
1.5s and a roll nobody could recognise for 12 (docs/DYNAMIC_MOTION_SCOPE.md §11). The Animation
step passes `rehearse`, and ▶ Replay always plays - both are the reader asking for the motion
rather than the picture. Decide it from the DATA, never the category.

WizardPreview cancels pending lifecycle-demo timers when
a debounced srcdoc commits (a stale stop() must never blank the fresh document), pushes field
values from a latest-template ref, and gates the auto-entrance on `document.fonts.ready`
(capped) so a font choice shows on the entrance itself. Pinned by e2e/wizard-preview.spec.ts,
wizard-logo.spec.ts, and wizard-filters.spec.ts.

**THE LEGIBILITY SETTINGS ARE ONE SHARED CONTROL** (`ViewingControls.tsx`): the viewing-target
select and the two size-floor toggles ("Broadcast text sizes" OFF = relaxed, "Guaranteed
readable size" ON = safe - mirrors of ONE tri-state, interlock in the component). Rendered on
AiStep and the editor's Style panel; NOT on the catalog walk, where it changed nothing visible
(docs/DESIGN_RULES_PLAN.md §8). PROJECT METADATA riding `draft.legibility`, never
the `:root` contract - the create paths land it on the store, which persists it
(model/designRules.ts). Every AI generation resolves it into `GenerateContext.legibility`, and
the result card stamps what its request carried (`data-legibility`). Pinned by
e2e/design-rules-product.spec.ts.

**THE STYLE STEP WARNS WHEN THE PALETTE JUST ERASED THE LOGO** (`useMarkLegibility` ->
`validation/markLegibility.ts`, owner's value-gate ballot 2026-08-14). It measures its OWN
offscreen frame - WizardPreview's iframe deliberately carries no `allow-same-origin`, so the
live preview's pixels cannot be read from the app at all. Debounced past the
preview's own 220ms and skipped entirely unless the draft carries a logo - a graphic with no mark
cannot fail it and must not pay for the render. It reports; it never repairs (the two available
repairs are dropping the customer's mark or pasting a plate over the design, both refused in
`templates/shared/logoSlot.ts`). Pinned by e2e/mark-legibility.spec.ts.

**AND IT OFFERS ONLY THE PALETTE ROLES THE DESIGN PAINTS WITH** - `cssPaintsWith`, contract in
src/blocks/AGENTS.md. Pinned by e2e/wizard-setup-fields.spec.ts. The same question decides its
TYPEFACE roles (`FONT_ROLES`), whose overrides are keyed by the BARE variable name like every
other one on the step.

**A CONTROL IS OFFERED WHEN IT CAN CHANGE THE GRAPHIC IN FRONT OF THE USER, and HIDDEN, never
greyed, when it cannot** (owner 2026-08-28 on palettes, 2026-09-03 on the import walk). Ask the
BUILT artifact, not the category: `cssPaintsWith` for a colour or typeface role,
`presetMovesSomething` (blocks/presetRegistry.ts) for a motion card, the create's own contract
for a step reveal (`STEP_CATEGORIES`) or a project brand (`BRAND_MODES` in CreationWizard). A
control whose promise degrades to a no-op for some class of input needs that class named at the
offer site, in the same commit as the control.

**Create with AI** (Entry card -> steps/AiStep, mode 'ai') is the MERGED describe/import step.
One drop zone accepts images AND an existing .html/.zip template. A dropped template parses
deterministically (model/importTemplate.ts) into a card with two actions: **"Open as code (no
AI)"** — the byte-faithful import (applyTemplate + Export panel; it renders OUTSIDE the
`needsSignIn` gate and must stay there — only the AI actions are an account feature) — or
**Convert** (provider.convertImport, guided by the prompt). Each dropped
image becomes an **UploadCard** (steps/ai/UploadCard.tsx) carrying WHAT IT IS FOR - use it as
it is / make one like this / take the look and feel / make it work over this
(model/imagePurpose.ts, split into `images` + `references` by `splitByPurpose`). The purpose
is a property of the PICTURE, not of the gesture, so it lives on the card, never behind
separate drop zones. `guessPurpose` preselects (visibly, one click to correct) and only
ever guesses mark-or-not. An as-is card adds the fixed/swappable choice; VIDEO passes
`showBinding={false}`, since a composition reaches a picture through a declared image input.
The as-is paths are handed to `productionSpxValidator` so the as-is screen rides the injected
validator. The "Design around these with a catalog template" escape takes only the as-is assets
and continues into the mode-'import' images -> category -> TemplateStep flow. The step
injects the harness's validator (`validateTemplate` + `benchTemplateRuntime` merged) into
every provider call, streams `onProgress` stages into the busy line, shows the route badge
(catalog design system / +flourish / custom) on the result card, and passes a grounded
result's `spec` back on refine so spec-level refinement re-assembles deterministically
(src/ai/AGENTS.md).

**"More control"** (steps/ai/MoreControlPanel.tsx) is the OPTIONAL structured setup beside
the prompt: an accordion editing ONE `GenerationSpec` (model/generationSpec.ts) - category
(src/ai/spec/categories.ts, or "Let AI decide" with the inferred pick surfaced editable on the
result card), data fields (suggested per category from the GraphicType's own declarations),
look (style/mood/avoid, exact brand colours, plus a READ-ONLY count of what is attached -
uploading happens once, in the drop zone), fonts (primary through the shared FontPicker,
secondary/numeric uploads), and animation (presets filtered to the category, intensity,
transition style, speed/easing/steps). Collapsed sections show summary chips and keep their
values; the spec persists as a cross-session draft and, on Create, lands on the store's
`aiSpec` (saved with the project). A prompt-only user never touches it - an empty spec injects
nothing (pinned by e2e/ai-more-control.spec.ts).

**The step has THREE execution tiers** (`AiSettings.tier`, picked under ⚙ AI settings - the
one panel every tier can reach): **NoaCG Lite**, **NoaCG Pro** and **Bring your own key**
(stored id `custom` - the label changed, the id never can). The default resolves to Lite when
the server offers it, else BYO key. Lite and Pro are managed experiences of the SAME workflow -
no model picking and NO mechanism named in their copy; BYO key is the deliberate advanced
surface carrying `AiProviderSettings` with `allowManaged={false}`. A tier this build does not
offer is ABSENT rather than greyed: **Pro renders only where it can run** (see below). The
tier contract, the price targets and the price-book rule behind each model row are
src/ai/AGENTS.md's.

The PIPELINES behind Lite and Pro are src/ai/AGENTS.md's contract (and docs/NOACG_PRO_PLAN.md
§7); what belongs here is what each tier does to this STEP.

**Lite** is the smallest managed surface: one result, included/free-user copy, remaining
allowance, at most two fields, no image/logo input, no style reference. Provider and model
settings, brainstorm, raw mode, three alternatives, "more like this", custom/import conversion
and code repair are all hidden; an unsupported response shows the server's explanation and one
simplification. Creating or exporting records acceptance by generation id, which is transient
and never enters the template or the saved graphic. Lite disabled = the BYO surface unchanged.

**Pro makes a PACKAGE, and that is the one thing it asks the user** (docs/NOACG_PRO_PLAN.md
§15.9). The ⚙ panel's checkbox list (`AiSettings.proPackage`, `pro-package`) picks which graphic
types the design language is rendered as, **every box ticked by default** - the whole set costs
one model call, so there is no cost argument for hiding it, and the LAST tick cannot be removed.
The first member in package order is the PRIMARY: previewed, refined, and the one the
single-graphic ending still handles. Members are composed the moment the result lands, each
through the same gate the primary took; one the gate refuses is dropped and NAMED
(`pro-package-dropped`), never shipped. The result card renders the set (`pro-package-built`),
and a set of more than one FINISHES through `KitFinishStep` into a production - the branch is on
the SIZE of the set, never the tier, because the single-graphic door's "open in the editor" would
pick one member for the user and abandon the rest. Each member is renamed for its type ("<look>
lower third"), since that name is the export slug and the playout folder an operator reads.
**The two rules that are not about the door live OUTSIDE this step** - `namedPackage`
(ai/pro/language/graphics.ts) and the `proPackage` normalizer (ai/settings.ts) - because the
walk is pinned by `e2e/configured/pro-wizard.spec.ts`, a suite CI never runs, so anything
reachable only from here ships its regressions silently. Both are mutation-checked in
`e2e/pro-language.spec.ts`.

**Pro's engine contract** - the one model call, the design language it returns, the reservation and
what the gate does with a finding it cannot repair - is owned by `src/ai/pro/AGENTS.md`, section
"NoaCG Pro - the design-language tier", and `docs/NOACG_PRO_PLAN.md` sections 15-16. What is this
step's: the result card reports the language, its rationale, its palette and every divergence the
platform recorded at `data-testid="pro-report"`, keyed to the template by WeakMap so a restored past
result shows its own. **There is no concept image** - the graphic rendered above the card IS the
answer. **The tier is OFFERED only where it can actually run** (`proOffered = proHosted &&
isBackendConfigured()`: the `/api/ai/pro-status` answer AND the metering backend). Where that is
false the tier is ABSENT, never a greyed row and never a key request - a NoaCG tier runs on NoaCG's
own service or it is not offered (owner, 2026-08-14). Its settings are therefore one read-back with
the remaining allowance (`ai-pro-hosted-note`) and no chooser of any kind: no provider, no model, no
key. **A hosted deployment is never reachable from the browser** - no flag, no query parameter, no
localStorage key - which is the property `e2e/pro.spec.ts` pins by answering the status endpoint and
nothing else. What the step does with a finding it cannot repair: categories clamp to
lower-third/auto (`PRO_SUPPORTED_CATEGORIES`, ai/pro/brief.ts), spec-field findings demote to
warnings (`demoteSpecFields`, ai/spec/specValidate.ts - a fixed contract, no repair loop), and
refine/fix stand down because regenerating is the honest move.
`e2e/pro.spec.ts` pins only the DOOR (whether the tier is offered), `e2e/pro-language.spec.ts`
pins offline what a Pro graphic IS against the composer the product runs, and the LIVE walk
`e2e/configured/pro-wizard.spec.ts` pins what the engine spends (one call, forcing
`emit_design_language`; an image request fails the spec). The step MEASURES the first "use it
as it is" upload with `probeMark` before generating: its shape and ink go into the brief in
content-free words, and the same probe lets the composer give the mark's column a field when
its ink cannot read on the chosen panel.

The harness is ON BY DEFAULT (`AiSettings.useHarness`; the **"Use NoaCG harness (3 options)"**
checkbox turns it off). On → `generateAlternatives`: three directions rendered as `[data-alt]` PICKER
CARDS — a live **MiniPreview** of each built template plus its design words (density,
heading weight, alignment, panel) and a pass/fail mark — a list of names showed none of the
real compositional differences. Off → `generateRaw`
(one-shot, static validation only, no bench). Conversion of an imported template always runs
the validated conversion flow regardless of the checkbox. The default is pinned by
e2e/ai.spec.ts ("the harness checkbox is on by default").

AI settings use the shared `AiProviderSettings` surface for provider, opaque model id, and
user-key submission (laid out on the shared `.dlg-row` grid, so its Store-key button can never
wrap under the field). The component may hold a key only in its unsaved password-field state
and must submit it to `/api/ai/credentials`; it must never pass a key through `AiSettings`,
localStorage, query parameters, telemetry, logs, or rendered error detail. Model lists are
provider-scoped suggestions, not an application-wide allowlist.

The ⚙ button carries a one-line read-back of what will actually run (the tier, plus the model
on the tier where models are the user's own), so the common case needs no click. **The panel is
NOT a popover**, though the reference draws one: it opens ITSELF whenever nothing is
configured, so a floating sheet would cover the controls it exists to make work (measured;
reasoning at the settings sheet in AiStep.tsx).

**The directions SURVIVE a refinement.** `alternatives` (the current state of each
direction) and `originals` (each as first generated) are parallel arrays; a refine replaces
only `alternatives[selected]`, so the other directions stay pickable and **↺ Undo
refinements** restores the proposed design without spending a generation. `stagePick` stages
the pick for src/ai/preferences.ts on selection AND after every refinement — CHOSEN facets
from the direction as it stands, SHOWN from the ORIGINALS, since that was the choice actually
faced; a lone result stages nothing (counting it would score every facet as picked 100% of the
times shown). CreationWizard's `createFromAi` COMMITS whatever is staged.

**The result names the PROVEN DESIGN it was adapted from, and shows what it was chosen
between** (docs/ADAPT_FIRST_PLAN.md §3 Stage U). "Adapted from a proven design" is a claim, so
the card carries the design's name (`data-testid="ai-adapted-from"`) and, under it, the
retrieved shortlist (`ai-shortlist`) as MiniPreview cards - the same card chassis as the three
directions and a Browse tile, because all three are "pick a design". Picking another one
REBUILDS on it deterministically: `assembleGroundedTemplate(spec, ctx, { keepChassisZone: true })`
with the same spec, no model call and no cost - the user overrules the AI's choice free of
charge. No structural KIND check is needed on that swap - every design on the
shortlist satisfies the brief's anchor by construction (src/ai/retrieval.ts).
The card's caption is the NAME ALONE (reasoning at the card in AiStep.tsx).

A failing non-Lite result carries **⟳ Fix these** (`data-testid="ai-fix"`): the exact validator
findings go back as the instruction, at CODE level (no spec — the findings are about emitted
code). It is a button, not an automatic loop: a grounded assembly failing its own bench is a
platform bug worth surfacing (src/ai/AGENTS.md), but leaving a non-technical user holding
raw findings is not a resolution. The per-card verdict uses `.wz-alt-mark.ok/.bad`, NOT
`.status-ok`/`.status-bad` — those name the verdict on the CURRENT result.
Lite instead labels the same failure as a NoaCG platform defect and spends no code-repair
call.

An **example brief is armed before it replaces a brief the user wrote** (two-step, like every
other destructive click here); typing disarms it. Pinned by e2e/ai.spec.ts.

**ONE thread, ONE composer.** `turns` is a single transcript (`.ai-thread`): talk turns plus
`past` turns, which are earlier generations kept whole (their directions, their originals,
which one was picked) with **↩ Bring back**; restoring archives whatever it displaces, so
exploring a second idea never costs the first. The one textarea generates, talks (**🗨 Talk it
through**) or refines — the primary button follows the state, and the "Refine it…" placeholder
is retained so the composer answers to the same locator either way. `conversation()` feeds the
bounded transcript into `GenerateContext` (src/ai/AGENTS.md), **📎 Attach** adds images to the
turn, and **✦ 3 more like this** re-runs the design stage seeded with the picked direction's
spec.

**The conversation TRAVELS with the created project.** AiStep reports its talk turns up via
`onThread` on every change (so talk added AFTER the last result, before Create, is caught);
`createFromAi` commits it to the store's `aiThread`, which persists exactly like `aiSpec`
(SavedProject + GraphicDoc, additive optional, model/aiThread.ts). Only the talk turns travel -
the `past` generation snapshots are heavy and the editor has no surface for them. The editor's
**AIPromptPanel** shows the carried conversation read-only under a "Created from this
conversation" `<details>` (`data-testid="ai-origin"`, reusing the `.ai-msg` bubbles). Pinned by
the reload case in e2e/ai.spec.ts.

**The result card reports what was MEASURED, not a verdict.** `validation/readiness.ts` groups
existing findings into six operator-facing rows; it adds no checks, which is what lets a row
read "not played, so not tested" on the raw one-shot path rather than claiming a bench that
never ran. Rules no row claims are shown verbatim, never swallowed. Cost comes from
`ai/runStats.ts` over the telemetry ring: a median expectation before Generate (null below two
matching runs) and actuals after, recorded on a RUN and never in `showChange`, since re-picking
an alternative costs nothing. **No money is ever shown** — prices are not in this codebase and
a stale one would be believed — and zero tokens prints as silence, because "0 tokens" is a
measurement claim rather than the absence of one.

**Brand is PROPOSED, never applied.** The strip (`.ai-brand`) offers colours read out of the
first uploaded image — `src/assets/paletteExtract.ts`, deterministic arithmetic, no model call
— and the install's saved looks (`loadLooks()`). Both write `spec.brandColors`, the lock
`applySpecLocks` already honours over anything the AI picks. The pick stays the user's on
purpose (paletteExtract.ts says why). A filename chip uses **`.wz-file-chip`**, never
`.wz-fid` (the fixed 24px field-id badge; `src/styles/wizard-and-dialogs.css` says why).

Two ordering rules the transcript depends on: **archive the current result BEFORE recording
the new request** (it is chronological — the standing result happened first), and **record
the request even when the box was empty** and the brief came from the talk, or a generation
leaves no trace of what it was asked to make.

**Video mode** (Entry card "Video or animation with AI" -> steps/VideoStep): prompt + a
GENERATION-ENGINE picker (the VIDEO_ENGINES cards: Remotion preselected, HyperFrames tagged
Experimental) + duration/aspect/fps/transparency + asset upload -> an INSTANT create
(`createDefaultVideoProject`, the brief seeded as chat[0], the engine recorded on the
project); generation runs in the video shell's chat, not the wizard. Its reopen strip lists
saved videos plus a "Continue" chip for the autosaved current video project. Creating/opening a
video flips docKind to 'video'; every SPX create path flips it back to 'spx'.

**Sample data on create:** the wizard applies with
`applyTemplate(template, { resetSampleData: true })` so a new project starts from ITS field
defaults - plain applyTemplate (blocks, panels, AI) intentionally preserves typed sample values
for matching field ids. Don't drop the flag from the wizard path: the old template's values
would leak into the new graphic's fields.
