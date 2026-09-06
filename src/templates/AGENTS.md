# src/templates - the wizard catalog and template contracts

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate. Read
docs/DESIGN_LANGUAGE.md before generating or judging templates. After template changes, run the
catalog sweep for the affected category (root AGENTS.md, "Verifying changes").

**Twenty-two subdirectories own their own contract** - `types/`, `pack4/` and the twenty
categories listed under "Categories" below - each an `AGENTS.md` with a thin `CLAUDE.md` importing
it, loaded only when you work in that directory. A section that describes ONE directory belongs
there, not here: this file is read in full by every session touching any template.

**START WITH `npm run catalog:affected`.** It reads the diff and says which designs the change can
move, then prints the exact battery - scoped with `--only <ids>` where it could attribute the
change to named designs, and the whole catalog where it could not (a category's `shared.ts`, a
preset bank, `types/`, fonts, the theme tokens, `src/blocks/`, a gate script, a baseline). Editing
one design should cost one design's worth of machine time. Nothing about WHAT is measured changes -
only how many designs it is measured over, and the NIGHTLY runs all five unscoped (CI carries the
emit gate and the calibration tripwire; the four sweeps are nightly-only, as they always were).
`npm run check:catalog-emit` is the three-second first answer (emitted code, hidden data holders,
name collisions) and needs no dev server. Details: docs/VERIFICATION.md.

**ADDING A DESIGN MOVES THREE BASELINES, and the five catalog gates only cover one of them.**
`scripts/overflow-baseline.json` is re-recorded by the overflow sweep; `e2e/catalog-baseline.json`
and `e2e/catalog-render-baseline.json` are re-recorded by their own spec:

```bash
UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1 npx playwright test e2e/catalog-baseline.spec.ts
```

**`e2e/catalog-baseline.spec.ts` is not in `playwright.catalog.config.ts`**, so every local
catalog gate can pass while CI's full plan goes red on it - which is exactly what happened on
2026-08-19 to a nine-design branch with four green catalog runs behind it. The healthy diff is
purely additive: ids added, nothing existing changed. Details: docs/VERIFICATION.md.

**But `overflow-baseline.json` is the one file whose own updater breaks that rule.** Re-recording
it with `--update-baseline` on a clean tree produced **+12 / -98** (2026-08-23): the deletions were
`-mask:y` self-clip rows on designs nothing had touched - card05, card17, card18, card21, card33,
card44, ss05, ss10, ss18 and more. Those rows sit within a pixel or two of `CLIP_TOLERANCE` (2px),
so whether they appear depends on font loading and machine load rather than on the code. A full
re-record bakes one run's coin flips into the committed reference, and the NEXT run reports the
ones that came back as regressions. **Add only the new rows by hand and leave every existing one
alone**, then re-run `node scripts/overflow-sweep.mjs --baseline` to confirm PASS:

```bash
node -e "const fs=require('fs');const p='scripts/overflow-baseline.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.myNewId={off:[],clip:['.prefix-mask:y']};fs.writeFileSync(p,JSON.stringify(j,null,1))"
```

Editing `shared/matchClock.ts` moves about 25 catalog hashes on its own, because every board that
reads the clock re-serializes - re-record the catalog baselines in the same commit rather than
treating that diff as a regression.

**A DESIGN'S NAME IS ITS OWN - no two may share one**, and the same spec holds that (both names:
the variant's, which is the Browse card, and the created template's, which is what a production,
a rundown and an export folder carry). Export already survived a collision by suffixing the
second graphic; the user never did - Browse offered two identical cards with nothing to choose
between. Five pairs had drifted together by 2026-08-19 (bug05/lt54, card30/pi01, ig38/tk13,
tt01/ig03, fr03/qz05), every one of them a later design landing on an earlier one's name. When
a new design's name is taken, rename the NEW one; renaming a shipped design moves its baseline.

blank.ts + the catalog, resolved through catalog.ts (CATALOG, variantsFor/variantById).

**structuralAnchor.ts** - the one table answering "does a catalog structure carry this intent,
and which one": the family words, `resolveAnchor`, `structuralFit`, and `anchorsSatisfiedBy` /
`variantSatisfiesAnchor` (what a VARIANT is, for the satisfaction check). It lives here, not in
src/ai, because TWO layers need the same answer and neither may import the other - the AI's
ROUTER asks before the design call (adapt vs create) and `validation/structuralIntentCheck.ts`
asks afterwards (is this the graphic that was asked for). A second copy is how those two come to
disagree. Everything resolves LIVE against the registry and catalog, so catalog growth updates
routing and satisfaction by itself: adding a design can CHANGE a route, which is why
e2e/creative-routing.spec.ts runs on changes here.

**kit.ts** - what a kit CONTAINS, resolved once for every consumer: the pack's types through
the (type x family) matrix PLUS its `extras`. Both halves are the kit - a caller reading only
`resolvePack` builds a kit missing its extras while still counting them, which is exactly the
bug the wizard's kit step shipped with. It lives here rather than in packs.ts because that
module deliberately does not import the catalog it is a view over.
Every choice is drawn as a CARD with a settled MiniPreview of the real design
(wizard/steps/KitPicker.tsx) — a kit's contents are looked at, not read off a list of names.
`kitChoices(pack, family)` widens that into what the picker OFFERS - the pack's contents, then
every other graphic type whose cell resolves ("start from a genre preset, then edit the set") -
and `kitSelection` resolves a ticked set back to `KitItem[]`. Every offered row is asked
through `resolvePack`, the same resolver create runs, because the matrix is not full and the
widening is exactly where a row that throws on Create could appear. A choice's KEY is the
graphic TYPE id (or `extra:<designId>`), never the resolved design id and never an index: the
design changes when the look does, so either of those would silently re-tick the set the
moment the user changed the look.

**packs.ts** - the PACK taxonomy (docs/PACK_TAXONOMY.md): a pack is a curated type-subset in a
default family, PURE CONFIG over the types x families matrix; the 60 reference formats each map
to exactly one pack. `scripts/factory.mjs` validates the config on every run (cells resolve,
extras exist, formats covered exactly once) - edit packs.ts and the doc together.
**The matrix is full across FOUR families, not six** - and since 2026-08-08 those four are
COMPLETE, so every pack resolves in every one of them (docs/KIT_MATRIX_GAPS.md; before that day
four packs were stuck in two looks each). Editorial covers 6 types and cinematic 5: real style
families with focused information systems and Browse chips, but BROWSE families rather than KIT
ones - no pack resolves into either, and filling them for kits is ~118 designs apiece. The cell
gate only tests a pack's OWN declared family, so it cannot catch a hole in the other five:
anything re-resolving a pack must MEASURE which families work (`familiesFor` in
wizard/steps/KitPicker.tsx), never assume.
`docs/KIT_MATRIX_GAPS.md` is the standing gap report - the core six a kit owes a show, which
designs no kit can reach, and why that last number is a kit-model question rather than a
drawing one.
**Before adding a design, read `docs/CATALOG_VARIETY.md`.** It measures what the catalog already
repeats, off the EMITTED code rather than the declared axes: the style family predicts three of
the fourteen decisions a viewer can see (blur, skew, radius) and the graphic CATEGORY predicts the
rest, so a design that varies only its family is a re-skin. `node scripts/catalog-sameness.mjs`
prints a design's distance to its nearest catalog neighbour; under 0.25 is a near-duplicate.
`node scripts/palette-freedom.mjs` answers the other half - whether a design can take a palette it
was not drawn in.

## Discovery metadata (the Browse step's facets — docs/TEMPLATE_TAXONOMY_PROPOSAL.md)

- **meta.ts** - the DECLARED sliver: per-type and per-variant graphic category / subtype /
  structures / field semantics, with a SINGLE-VALUED per-old-category fallback. Resolution
  order: `VARIANT_META[id]` → `TYPE_META[typeId]` → `CATEGORY_DEFAULT_META[category]`.
  **`TYPE_OCCASIONS` / `VARIANT_OCCASIONS` are declared SEPARATELY from `DeclaredTemplateMeta`**
  (facet I - what a design is FOR): that resolution is winner-takes-all, so folding the occasion
  into it would force a design to restate its category, structures and semantics just to gain one
  word. An occasion resolves on its own - variant, else type, else NONE, with no category fallback,
  because half a shelf being a front door and half a sign-off is the confusion the facet ends.
  **Undeclared is the default and costs nothing**; a guess is worse than a gap.
  `AssemblerId` (model/wizard.ts, renamed from `TemplateCategory` 2026-08-11) stays the
  ASSEMBLER/routing id, never rendered in UI; the graphic category is presentation metadata
  on top — no file moves, no value renames.
- **templateMeta.ts** - the DERIVED bulk, memoized per variant: field counts off the compiled
  schema (`visible` excludes `HIDDEN_CONFIG_FIELDS`; buckets match the reachable range by
  INTERSECTION), capabilities (declared extras ∪ schema/preset derivation), placement
  (coverage class → placements), motion (the per-preset table in model/taxonomy.ts),
  complexity, and pack-derived programme relevance (a format's pack contains any type whose
  graphic CATEGORY matches — category-level so unclaimed classics rank like their typed
  siblings; `relevance: 'all'` categories match everything, ranked below genuine hits).
- **search.ts** - the Browse engine: strict facets AND, choices within a facet OR, programme
  format RANKS ("Best for" / "Also works") and never hides, phrase-first alias expansion
  (aliases may fan out across categories, and the table is ENGLISH + SWEDISH + FINNISH since
  2026-08-28 — measured, 38 of 40 Nordic terms returned zero before it), field-weighted token
  index, `mostRestrictiveFilter` for the zero-result escape.
  **A token that reaches NO design is dropped from the AND rather than allowed to empty the
  result**, and returned as `BrowseOutcome.ignored` so the step can name it: token-AND is
  exact, so "big title" answered with an empty grid while "title" answered with 71.
  `catalogVocabulary()` is the one place that knows what the catalog can be matched on.
  **The design's id is indexed at name weight** ("sb08" finds sb08), and matching is
  FORGIVING as a FALLBACK only (owner walk 2026-08-28): a token the catalog reaches exactly
  keeps the exact contract; one that reaches nothing may match one edit away or mid-word at
  half weight (`wordMatch`), and a one-edit miss on an alias key lands on that alias — never
  under `briefTerm`, which keeps the strict AND throughout. Facet values without catalog mass are
  not offered (`offered*` helpers). `BrowseContext` is the second argument - ambient
  RANKING input the user never chose (today: the saved brand's family, a deliberately small
  boost that a genuine programme match always outranks), kept out of `BrowseFilters` so it
  can never grow a chip or be cleared by Clear-all.
  **A MOMENT OUTRANKS A FORM.** `aliasScore` pays +35 for an occasion the query named (facet I,
  model/taxonomy.ts `OCCASIONS`), above the subtype's 25 and stacking on the category's 40.
  Measured 2026-09-06 before it existed: "be right back" is an alias for the holding CATEGORY, so
  it returned all 21 holding screens at an identical score and the BRB card came ELEVENTH, under
  five front doors; "goodbye" returned NOTHING. An alias can only point at a facet, and until
  facet I no facet said what a design was for. Occasion phrases are alias KEYS, never words in the
  loose index - putting "before the show" in the text index would score every design carrying
  "show", which is the uncontrolled-adjective failure the facet model refuses.
  **The gate is `npm run test:use-case-search`** (`scripts/use-case-search.test.mjs`): it runs the
  real engine over the real catalog in a blank Chromium page, and carries `validateTaxonomy()`,
  which enforces facet I's admission rule - the ceiling of 8, the floor of 3 designs per occasion,
  a declared id that names no real variant, and every phrase resolving to its occasion. Outside
  `npm run build` for the same reason `check:catalog-emit` is: it needs a browser (the search
  index is built out of CREATED designs, and creating one parses the html it just emitted).
  It runs in CI in the **Factory gates** job, which needs no plan flag to fire.

  **An occasion ADMITS designs into a result; it does not only rank them.** So an alias that
  already names one shelf must not also carry an occasion that spans several: `sign-off` covers
  credits AND holding, and eight credits aliases carried it, so "end titles" answered with the
  12-design credits shelf plus 5 holding screens. Only `outro` keeps it, because that word does
  honestly mean either. Shelf word or moment word is an editorial call - "stream ending" spans
  both on purpose - so the vocabulary is a measured list in the gate, never a derived rule.

  **It returns the WHOLE result and the step renders a PAGE of it.** `browseTemplates` has no
  limit argument and must not grow one - the total is what the step reports ("Showing 12 of
  82"), and a filter's honest effect is a number the engine has to know in full to produce.
  Paging is `BrowseStep`'s, over `best` then `also`, reset by any change to the filters or the
  sort.

**THE STOREFRONT'S SHAPE** is owned by `src/components/wizard/AGENTS.md`, section **Browse**:
the Option A two-level dropdown, style-family chips, paged "Show 12 more" results, and search as
the route to a named design are drawn there.

- The categories themselves grew to 27 and stayed the machine vocabulary (search aliases, meta,
  AI retrieval, the factory). A group NEVER selects behaviour - playout controls generate from
  the machine + fields inside the template (docs/CONTROL_LAYER.md), and nothing at playout reads
  a category or group.
- The id registries (families/formats with verbatim sheet names, the 27 graphic categories
  and their ten groups, structures, semantics, capabilities, placements, motion
  intensity/styles, style aliases) live in **src/model/taxonomy.ts**; display labels there,
  never in stored ids.

## Shared assemblers (every category builds on these)

- **shared/base.ts** - generic assembler pieces: :root vars, zones, auto-fit, runtime scaffold.
- **shared/logoSlot.ts** - the shared OPTIONAL logo slot every `logo: 'optional'` design inherits
  unless it hand-authors its own (`designHasLogoSlot`). The capability, the two arrangements and
  the mark-is-not-a-picture rule are under "Fields & images" below; the measurements that settled
  them - and every recorded exception - are **`docs/LOGO_SLOT.md`**. Three rules bind anything
  that injects markup into a design it cannot see: **inject as the LAST child** (a first child
  renumbers every `nth-child` selector the design wrote about its own children - lt02 put the name
  under its underline), **cap the mark's height rather than fixing it** (a fixed height hands a
  portrait crest the power to set the strap's height through its own aspect), and **the clear
  space is the mark's own MARGIN, never the box's `column-gap`** (a track is charged its gap even
  when nothing is in it, so an empty slot shifted the words 26px). The gate is
  `e2e/catalog/mark-height.spec.ts`, which measures every mark-capable lower third against a
  SQUARE and a PORTRAIT mark - they fail differently - and holds the lt49/lt53 exceptions from
  both sides, so a stale entry fails rather than excusing a design it no longer describes.
- **shared/standard.ts** - CategorySpec, assembleStandard, makeDefineVariant, and
  `convertToDataRegion` - the Timeline v2 flip: convert a freshly assembled template's legacy
  ANIMATION region into the NOACG_ANIM data block + interpreter through the parity-proven
  importer (blocks/animImport.ts) at create. The preset still authors the motion; only the
  marked region converts (category-owned runtime around it - score pops, clock painters -
  stays); a conversion failure keeps the legacy emit, never a broken template.
  `CategorySpec.dataRegion` triggers it inside assembleStandard; self-assembled categories
  (scoreboards, game timers, starting soon, quiz, infographics) call it directly. **EVERY category
  now creates as a data block** - the legacy region survives only in SAVED templates (see
  src/blocks/AGENTS.md). The step-calls model
  (docs/TIMELINE_V2_PLAN.md §3b)
  carries `tl.call(startClock/stopClock)` through the conversion as step `calls`, so a countdown
  survives the flip (the clock runtime itself lives OUTSIDE the region and is untouched), and the
  loop model (gap 6) carries the ambient breath as a step `loop` (a repeating scale track) - this
  is what let STARTING SOON flip. The MEASURED-MOTION model (docs/DYNAMIC_MOTION_SCOPE.md) carries a
  `tl.add(builderName(target))` across as a step `dynamic` - this is what let TICKERS and END
  CREDITS flip (see their motion runtimes below).
  `convertToDataRegion(template, refine?)` takes an optional refinement of the imported data -
  the seam for a step the LEGACY region has no shape for, so a category can author it directly
  instead of growing a legacy step kind Phase 8 will delete. QUIZ is the one user
  (docs/TIMELINE_V2_PLAN.md §3c): its Continue reveal is a lifecycle CALL, not a reveal group,
  so it inserts a middle step `{ calls: [revealAnswer] }` before Out - which makes SPX's
  `steps: '2'` DERIVED (three steps -> one press) instead of a hard-coded value the timeline's
  steps re-sync would overwrite with '1' on the first edit, killing the reveal. The LIVE VOTE
  board (poll/) uses the same seam for the same reason: its result step carries the measured bar
  growth, which the keyframe model deliberately cannot express, and the AUDIENCE category's Q&A
  card uses it for an ordinary `reveals` step the legacy region simply has no shape for.
  INFO CARDS flipped last (`dataRegion: true`) - they are the standard contract's other line-based
  family, so they convert exactly like lower thirds, steps and all. Nothing blocked them but the
  spec suite they hosted, which now runs against a SAVED legacy template instead (e2e/timeline-v2.spec.ts).
  A wrapper that needs the motion speed must read it via the shared `motionSpeed()` helper
  (base.ts `motionSpeedJs`: NOACG_ANIM.speed, else legacy animSpeed, else 1) - never the bare
  animSpeed global, which only exists inside a legacy region.
- **shared/animRuntime.ts** - the emitted ES5 interpreter (Timeline v2), identical in every
  data-driven template: reads the NOACG_ANIM literal and defines the SAME builder globals the
  whole platform depends on (buildInTimeline / buildOutTimeline / revealNextStep), so the
  simulator, wizard thumbnails, control engine, and every export work unchanged. It pre-hides
  press-revealed layers (their reveal step's first keyframe values; plain opacity 0 fallback),
  shows/hides the CSS-hidden root, fades press-revealed layers OUTSIDE the root with the exit
  (unless the Out step animates them itself), runs a `loops` track in its own repeating
  sub-timeline (repeat/yoyo/repeatDelay - the ambient breath), and divides every duration and
  keyframe time by `speed`. `emitAnimRegion` emits the full marked region (data header + literal +
  interpreter); `replaceRegionWithAnimData` swaps a template's region for the data-driven
  emit (the converter's writer).
  It also carries the **STATE MACHINE engine** (docs/STATE_MACHINE_SCHEMA.md): the version-1
  statements stay VERBATIM as the machine-less path (a template with no `machine` key runs the
  identical code it always did), and the engine adds three globals - `noacgDispatch(event,
  payload?)` (one operator event through the SERIAL queue; the flat {field: value} payload is
  applied only if the guard accepts), `noacgSnap(assignments, opts?)` (enter states INSTANTLY
  by replaying the canonical path with suppressed callbacks; `null` = every group to its
  initial, the VISUAL half of reset - the data half stays update()'s job), and
  `noacgMachineState()`. The four SPX globals stay THE lifecycle surface and become
  machine-aware INSIDE (play = reset-and-enter, next = the default-path walk, stop = the
  built-in out legal from every state), which is why no export target, transport or preview
  path changed. Timers are `gsap.delayedCall` armed by a `tl.call` at the entry timeline's end,
  never setTimeout: GSAP's callback suppression then means a settled/scrubbed graphic never
  arms one, and the bench's timeScale + the render virtual clock drive them for free.
  **THE PAIRING RULE:** `spliceAnimData` replaces only the literal, so a saved template keeps
  its FROZEN interpreter - machine-bearing data must never land under one that predates the
  engine. Check `hasMachineRuntime(js)` first and re-emit the whole region when false (the
  `hides` precedent); validateTemplate treats a mismatch as an export-blocking error.
- **shared/clock.ts** - countdown engine: hidden minutes field -> M:SS (H:MM:SS past an hour) +
  `{prefix}-done` at zero; DOM-ready-safe, and null-safe about both the clock element and the
  duration field (a design with no clock simply has nothing to paint). The count is anchored to a
  DEADLINE timestamp and recomputed every tick, not decremented: a holding screen can sit on air
  for an hour and `setInterval` drifts (throttled tabs, coalesced timers), so a late tick has to be
  self-correcting or the clock and the wall disagree at 0:00. `Date.now()` is virtualized by the
  render runtime, so a rendered countdown stays a pure function of the frame.
  An optional THIRD field id opts a design into a wall-clock START TIME ("19:30"): filled in it
  wins over the duration, empty it is ignored. That is the difference between "count five minutes
  from whenever the operator hit play" and "count to when the show actually starts" - only the
  second survives a re-take.
  **UPDATE RE-ARMS A RUNNING CLOCK** (owner walk, 2026-08-29). The length is DATA, so a new
  value takes effect the moment the operator presses Update - running, paused or idle - and the
  graphic does not change state to do it (`update()` writes fields; events move states). Until
  this, a running clock read its length once at `startClock()` and the only way to correct a
  countdown on air was to take it out and back in. The safety is that `clockDataUpdated()`
  re-arms **only when the clock's own fields changed**, so an Update carrying a new headline
  never restarts the count under it. Every design that emits `clockRuntimeJs` owes that call in
  its `update()`: `startingSoon/shared.ts` and `gameTimers/shared.ts` make it directly, and
  `importedDesign/svg.ts` adds it as an update hook when a layer is bound as a countdown. Pinned
  by the Update case in `e2e/holding-pack.spec.ts` and the paused case in
  `e2e/graphic-types.spec.ts`. The match clock and the debate clock have always re-derived on
  the wire (`matchClockUpdate` / `speakingClockUpdate`); this is what makes the countdown agree
  with them.
- **shared/textFit.ts** - the FIT-TO-SLOT runtime for placed text lines (the imported-design
  contract): `fitPlacedText()` condenses a `data-fit="shrink"` line to its wrapper's max-width
  by reducing font-size (never by distorting the chosen typeface), floored at 55%. Design-owned
  JS emitted OUTSIDE the marked region, injected idempotently by blocks/designLayout.ts
  `ensureTextFitRuntime`; the shared `update()` calls it via an optional hook (the
  `revealNextStep` idiom). It re-fits on `document.fonts.ready` as well as DOM-ready - a
  DOM-ready-only pass measures the FALLBACK face and overflows once the real one swaps in.
  **The RASTER import is its only caller now**: an imported SVG fits its placed lines with the
  FIT LADDER instead (importedDesign/svg.ts, docs/SVG_IMPORT_PLAN.md §6b), so `ensureTextFitRuntime`
  recognises that design by `SVG_TEXT_FIT_MARKER` and leaves it alone - one fit per graphic, and
  the ladder is the one that can report a too-long value to the operator.

## types/ - the GRAPHIC TYPE registry (docs/GRAPHIC_TYPES.md)

A **type** declares what a graphic IS - structure contract, fields, state groups and default
path, control events - independent of what it looks like; a **design** is one look. A type is a
DECLARATION, not a second way to build a template: `variantsFromType` compiles one into ordinary
TemplateVariants that go through the category assemblers, and **the rule is *persist a machine
only when the derived one is wrong***. The full contract - the field-list limit, the field plan,
`WizardOptions.content`, the timer trap and the neutral scaffold - moved to
**`src/templates/types/AGENTS.md`** (with its thin `CLAUDE.md`), which loads when you work in
that directory.

## pack4/ - the TITLE / TOPIC / INFORMATION pack

36 designs over nine graphic types; nothing in it is a new mechanism (the word-shaped ones build
on the info-card assembler, the two LIST boards on the infographic one). Its contract - the skin
vocabulary, the words, the markup rules and the three traps a parallel-group type pays - moved to
**`src/templates/pack4/AGENTS.md`** (with its thin `CLAUDE.md`). The design files themselves live
in `infoCards/pack4/` and `infographics/pack4/`.

## Categories

**Every category carries its own `AGENTS.md`** beside its code (with the thin `CLAUDE.md`), loaded
only when you work in that directory. This list is the index and nothing more: a category's rules
live in its own contract, and a new design writes its lesson there, never back into this file -
which is what keeps every session's instruction chain affordable
(`npm run check:shared-instructions` prints the headroom). A NEW category mints the pair on its
first commit rather than starting as a paragraph here.

- **lowerThirds/** - lt01…lt67 (six ids retired 2026-08-28, never re-minted) plus the
  ls01…ls41 SPECIALIST pack -> `lowerThirds/AGENTS.md`
- **infoCards/** - card01…card71, the standard contract's other line-based family ->
  `infoCards/AGENTS.md`
- **endCredits/** - cr01…cr13 (cr10 retired 2026-08-28, never re-minted), the LIST category
  (rolls, walls, boards) -> `endCredits/AGENTS.md`
- **startingSoon/** - ss01…ss20, every screen shown while the show is NOT happening ->
  `startingSoon/AGENTS.md`
- **scoreboards/** - sb01…sb25, the sports boards and `shared/matchClock.ts` ->
  `scoreboards/AGENTS.md`
- **cornerBug/** - bug01…bug36, the IDENTITY family -> `cornerBug/AGENTS.md`
- **infographics/** - ig01…ig39, where every motion is MEASURED -> `infographics/AGENTS.md`
- **importedDesign/** - imp01 + svg01, the user's own artwork and the BEHAVIOUR pilot ->
  `importedDesign/AGENTS.md`
- **audience/** - what the people watching sent in, five forms -> `audience/AGENTS.md`
- **quiz/** - qz01…qz12, the answer boards -> `quiz/AGENTS.md`
- **competition/** - the COMPETITION PACK, 38 designs over four sub-categories ->
  `competition/AGENTS.md`
- **tickers/** - tk01…tk22, the travelling and rotating strips; a strip that neither travels
  nor rotates belongs in `alerts/` or `publicInfo/` -> `tickers/AGENTS.md`
- **alerts/** - al01…al13, the standard contract plus a SEVERITY flag -> `alerts/AGENTS.md`
- **publicInfo/** - pi01…pi10, official notices and two-language panels ->
  `publicInfo/AGENTS.md`
- **gameTimers/** - gt01…gt04, the on-air countdown clocks -> `gameTimers/AGENTS.md`
- **versus/** - vs01…vs02, the full-frame match-up -> `versus/AGENTS.md`
- **poll/** - pl01…pl05, the LIVE VOTE board (the poll while it is happening) ->
  `poll/AGENTS.md`
- **frames/** - fr01…fr15, the one category that is chrome around a HOLE -> `frames/AGENTS.md`
- **transitions/** - tr01…tr04, the full-frame cover-and-hold wipes -> `transitions/AGENTS.md`
- **streamNotifications/** - sn01…sn04, the stream event alerts ->
  `streamNotifications/AGENTS.md`

### The category MOTION RUNTIMES (tickerMotion.ts / creditsMotion.ts / igMotion.ts)

These categories move by magnitudes that only exist once the operator's DATA is in the DOM: a
marquee slides exactly one track-width, a roll covers its own content height, a flip runs one
segment per item, a stat counts to the figure they typed, a bar grows to its own `data-value`, a
list cascades one row per line they wrote. No static keyframe can hold a number that changes the
moment the data does - which is why these were the last categories on the legacy patchers.

The fix (docs/DYNAMIC_MOTION_SCOPE.md): each measured motion is a named BUILDER - a plain function
that measures the DOM and RETURNS a GSAP object - emitted OUTSIDE the marked ANIMATION region, in
the design-owned runtime, exactly like shared/clock.ts. The preset's region does not inline the
math; it just calls it: `tl.add(tickerMarquee('#ticker-track'))`. Consequences, all load-bearing:

- the region stays fully PARSEABLE, so the ordinary importer converts it (the segment becomes a step
  `dynamic`) - ONE choreography source, no second code path;
- the builders survive the conversion and the export untouched (they're outside the markers);
- **every builder of a category ships in every template of it**, so swapping the motion preset is a
  pure data edit (one `build` name) with nothing outside the markers rewritten;
- the speed knob is read through `motionSpeed()`, never the region's `animSpeed`;
- a builder takes `(target, opts)` - `opts` is `{speed, ease}` from the interpreter (absent when the
  LEGACY emit calls it, so always default), and it may compose other builders (igMotion's count-up
  adds the bar growth once the figure lands). Give a `tl.add()` an EXPLICIT position when the phase
  has more than one: a segment is zero-advance in the importer's clock but a real child in GSAP's,
  so a bare `'-=N'` after one would resolve differently in the two.

Adding a measured motion to another category = add a builder to its runtime + have the preset
`tl.add()` it. Do NOT inline measured math in a region: it makes the template unconvertible.

### The canonical REPEATING-DATA system (dataRuntimes.ts + sportsRuntimes.ts)

A graphic whose content is a LIST the operator types - a running order, a poll's options, a
starting eleven, a league table, a results column - keeps that list in ONE hidden textarea
field, one item per line, with `|` between an item's parts, and a `rebuildInfographic()` the
assembler calls after every update(). **Nothing about the list is ever expressed as more
fields**: a template does not grow `f7`…`f26` because a weekend has twenty fixtures. The SPX
definition stays small (so a control page shows one multi-line editor, and adding a substitute
is typing a line), the motion is MEASURED from the rendered rows, and the rebuild is per TYPE
rather than per design. `dataRuntimes.ts` holds the agenda, STAT-LIST, poll, goal, milestone and
ELECTION shapes; **sportsRuntimes.ts** holds the sports pack's fixtures shape. Both escape operator
text before it reaches innerHTML and SKIP a malformed line rather than rendering an empty row, and
both render into `#infographic-rows` with one direct child per item - exactly what `rows-cascade`
measures.
**Which pipe splits a line is a per-shape decision, not a convention** - the schedule board takes
the FIRST (a show name may contain a pipe, the time cannot), the stat list takes the LAST (the
figure is the short final part, so the label is what may contain one). Say which, in the runtime.

## THE STAGE: which graphics may change size with the operator's text

`width: fit-content` (DESIGN_LANGUAGE §5) is the catalog default and only HALF right. On a
NAMEPLATE it is the convention - a strap cut to the guest's name. On a BOARD it is a defect: the
panel is back all evening with different content, and an audience reads a graphic that re-sizes
itself as a broken one. **Full contract, measurements and traps: `docs/FOOTPRINT_STABILITY.md`.**

- **HUG** (keeps `fit-content`): lower-third, corner-bug, end-credits, imported-design, ticker,
  and the full-frame frame / transition / versus. **FIXED** (declares a stage): every other
  category. Owner-ratified 2026-08-20, with the overflow answer - inside a stage text WRAPS, then
  SHRINKS to the type floor, never widens the box.
- **THE CATEGORY LIST IS A DEFAULT, NOT A PROHIBITION** (owner-ratified 2026-08-23): *a lower
  third may declare `stageWidth` when the composition genuinely needs a bounded stage; "leave it
  unset" remains the default, not an absolute.* The test is whether the SHAPE is the design's or
  the operator's. A strap cut to the guest's name is the convention and must keep hugging; a
  design whose silhouette IS the point cannot let a long name redraw it. **`lt64` "Portrait
  Column" and `lt66` "Top Corner" are the recorded exceptions** - a 380px portrait block and a
  380px corner block, each of which stops being its shape the moment a hugging box widens to fit
  a name, so both declare a stage and `e2e/catalog/footprint-stability.spec.ts` holds them there.
  A new exception argues itself in its own source and gets added here; it does not need a
  category flip.
- **The mechanism.** A design declares `stageWidth` (px at 1080p). `stageBoxCss`
  (shared/base.ts) emits the width, the `--stage-width` marker, `box-sizing` and where the slack
  goes; `stageExtraJs` (shared/stageFit.ts) emits the runtime that holds each line - and the panel
  itself - to the height it was drawn at. Omit it and the output is byte-identical to before.
- **The instrument** is `scripts/footprint-stability-sweep.mjs`; **the gate** is
  `e2e/catalog/footprint-stability.spec.ts`, which selects on the marker rather than a list, so a
  category is covered the day it flips. **Measure BOTH axes** - a `min-width` floor does not
  stabilise a board, it changes which dimension moves.
- **THE RESERVE IS A LAYOUT NUMBER, AND IT IS SHIPPED** - the runtime writes it into the template as
  an inline `height` / `min-height` that stays there, so a reserve measured wrong is what the graphic
  puts on air. The three measurement-of-the-moment failures are recorded in
  `docs/FOOTPRINT_STABILITY.md`, section "The reserve is a LAYOUT number, and three things kept
  making it a measurement of the moment". **A rect
  is the visual box - never measure a reserve with one.** The gate is
  `e2e/stage-fit-determinism.spec.ts` (default suite, platform-free, mutation-tested): a reserve must
  come back the same across recalibrations and whatever the webfonts do.
- **A STAGED DESIGN SHIPS THE SIZE ITS CSS DECLARES - the shrink is the OPERATOR'S, never the
  design's own words.** The stage puts no floor under a `line-height` (**a LINE MASK still does** -
  `overflow: hidden` sized to the line box against a ~1.2em glyph box, so a tight leading clips
  letters instead of shrinking them; lt64 at 1.05 loses 4px off the name. Different mechanism,
  different instrument: `overflow-sweep`, not this one). That was not true until 2026-08-23; the
  line-box/content-box failure and what it measured are recorded in `docs/FOOTPRINT_STABILITY.md`,
  under "A LINE BOX IS NOT A CONTENT BOX". `scripts/stage-fit-sweep.mjs` is the
  instrument, `e2e/catalog/stage-fit-honesty.spec.ts` the gate. A MULTICOL block is the one line the
  reserve is never pinned on - a definite height makes it spill sideways into hidden overflow
  columns instead of reflowing (`e2e/catalog/multicol-containment.spec.ts`). **The TEXT-SIZE LADDER
  is an axis, not a constant**: `stage-fit-sweep`, `type-floor` and `overflow-sweep` all take
  `--type-scale s|m|l`, because only `font-size` reads `--type-scale` and a box sized off the other
  knob changes SHAPE as the operator moves it. The design measurements are in
  `docs/FOOTPRINT_STABILITY.md`, section "The text-size ladder is an AXIS, and every instrument
  measured one step of it".

## The :root style contract

Every template exposes `--accent`, `--text-color`, `--text-dim`, `--panel-bg`, `--font-heading`,
`--scale`, `--type-scale`, plus whichever SHAPE tokens its stylesheet reads
(`src/model/themeTokens.ts`). Both style surfaces read/write exactly these through the ONE
shared control set (`src/components/style/StyleControls.tsx` — see src/components/AGENTS.md),
swap the marked `@font-face` block (bundled or imported), re-anchor the root element via
`zoneDecls`, and can import a typeface post-creation. **Two size knobs:** every dimension is
authored as `calc(Npx * var(--scale))` (whole-graphic size; resolution is folded into `--scale`
by `computeScale`), and font sizes additionally multiply by `var(--type-scale)` (text-only
size, a raw multiplier — **S 0.85 · M 1 · L 1.2**, declared once in
`model/styleVocabulary.ts` `TYPE_SIZE_STEPS`; the graphic-size ladder beside it is
0.8 · 1 · 1.25). Nothing but `font-size` consumes `--type-scale`.

**`--font-numeric` is the one token that follows the CHOSEN typeface rather than the family**
(`src/templates/shared/numerals.ts`, DESIGN_LANGUAGE §1), so a live number never changes width
as its digits change: the heading face where its digits are even, that face's paired bundled
SIBLING where they are not, a monospaced stack only when there is no pairing. Every site that
writes `--font-heading` must write this too — `model/fonts.ts` `numericFontStack` is the one
resolver and `scripts/numerals.mjs` is the gate.

A sibling means a SECOND bundled `@font-face`, like a family's label face. `rootVarsCss` emits
it, and only when the token was actually declared — a design that shows no live number gets
neither the variable nor the extra font file (measured: sb01 bundles saira + oswald, gt01
bundles inter alone). The export writers need no change: they collect fonts by scanning the CSS
for `url("fonts/…")`.
EXCEPTION: an imported design declares NO `--type-scale` (`rootVarsCss(..., { typeScale:
false })`) — each placed line sizes itself from its own rule, and the Style panel keys its
"Text size" section on the var's presence, so declaring it would show a dead knob.

## Template runtime rule

Generated template.js loads in `<head>` in exported packages - any load-time DOM work (initial
rebuild/paint) must use the DOM-ready guard pattern (see shared/clock.ts or the rebuild calls in
the credits/tickers/infographics runtimes).

**Operator text reaching `innerHTML` is ESCAPED at the data boundary** - `escapeHtml()` (emitted
from `shared/base.ts` `ESCAPE_HTML_JS`), applied where the runtime READS the field, not inside
each design's row builder: the builder is the part a design rewrites, so the safety of the
category must not depend on remembering the rule. Tickers escape in `tickerItemHtml()`, the one
place both `rebuildTicker()` and `tickerShowCurrent()` go through and the one place a design's
`renderTickerKicked()` is handed its two halves; credits in `parseCredits()` + the end block's
year and logo path (that
one lands inside an `src="..."` attribute), the repeating-data and competition runtimes at
their own rebuilds. **A field value is not always typed by the operator** - the show-chat block
writes what an anonymous audience member sent in, and the control layer writes staged data - so
an unescaped field is a way for someone outside the studio to run code inside the graphic. A new
category that builds rows with `innerHTML` inherits this rule; `e2e/template-escaping.spec.ts`
drives every catalog variant with a markup payload and fails if any of it executes.

## Fields & images (the broadcast field policy)

**EVERY meaningful visible string is a field.** A template exists to be re-used by people who
never open the code, so a word baked into the markup is a word nobody downstream can change -
and in practice the ones that get baked in are exactly the ones a second broadcaster needs
different: a countdown's "BEGINS IN", a poll's "VOTE NOW", a phase chip's "LIVE", a severity
flag's "Warning", a sponsor rail's "PARTNERS". Language is the obvious case, but house style
is the common one. `node scripts/field-coverage.mjs` is the gate (root AGENTS.md); it drives
every field and reports whatever did not move.

Four rules keep this from fighting the rest of the model:
- **A repeated structure stays ONE `lines` field**, never `f7`…`f26` (see the repeating-data
  system below). "Every value is editable" is about REACH, not about field count.
- **A state's WORD is a field; the state is not.** An operator event carries state, not copy -
  the machine says the graphic is live, the broadcaster says what "live" is called. The pattern
  is hidden word sources the runtime reads (`cornerBug/statusParts.ts`, the esports phase chip,
  the alert severity flag), so nothing about the wording lives in the machine.
- **A word source the operator can edit must repaint on `update()`**, not only when its state
  is next entered. An operator who retypes a word, sees nothing happen, and concludes the field
  is dead is the failure this costs one line to avoid (`paintPhase()` in the esports runtime).
- **Hide a data holder with a CSS RULE, never an inline `style="display: none"`**: the editor's
  entrance reset clears inline props on the whole root subtree (PlayoutSimulator `resetGraphic`),
  so an inline-hidden holder comes back VISIBLE on the canvas. `STATUS_SOURCE_CSS` is the pattern.
  The general form is `DATA_SOURCE_CLASS`/`dataSourceCss` (shared/base.ts) - the `.noacg-data-source`
  class every category's assembler emits when its markup carries one. This is a CATALOG-WIDE
  rule, not a corner-bug one: measured 2026-08-06, the fundraiser meters leaked their goal, the
  milestone boards leaked the whole target list, the poll board leaked its options, every
  audience queue leaked its pending questions and sixteen match boards leaked their club-colour
  hex - all from the same inline `display: none`. `e2e/catalog-baseline.spec.ts` now fails on
  any `<div id="fN" style="…display: none">` in the emitted HTML. An `<img id="fN">` is the one
  exception and is excluded there: an empty image slot hides itself inline through
  `setFieldValue`, and `resetGraphicInline` restates that after clearing.

The deliberate exceptions are small and argued in the gate: the versus mark (it IS the graphic),
and an image field's empty-slot placeholder (that text is the field's own empty state and the
picked file replaces it).

- Field types offered to users are the ones live graphics actually use: `textfield`, `textarea`,
  `number`, and **`filelist` = the image field** (SPX lists files from
  `assetfolder: './images/'`). `dropdown`/`checkbox`/`color` exist in the SPX format but are
  reserved for genuinely constrained design choices (e.g. the quiz's correct-answer dropdown) -
  don't offer them in generic field UIs.
- Every runtime writes fields through the shared `setFieldValue` helper (base.ts
  `setFieldValueJs`): text -> textContent, `<img id="fN">` -> src (an empty value hides the img
  and toggles `.has-image` on its parent so CSS can show a placeholder). Data-driven categories
  may instead keep the path in a hidden source div (credits' #f2 logo).
- **Logo slots are real SPX fields, declared as a VARIANT CAPABILITY**
  (`TemplateVariant.logo: 'none' | 'optional' | 'built-in'`): built-in designs (corner bugs,
  credits' f2) always carry their slot; 'optional' designs get the wizard's Fields-step logo
  toggle + custom upload and only emit the field when it's on (`ResolvedOptions.logoEnabled`).
  A design either hand-authors its slot (lt07's badge, lt08's docked square, card03) as
  design-owned `extraFields` (id computed after all user fields), or opts in with zero code:
  `shared/logoSlot.ts` `applyLogoSlot` injects the standard slot (filelist field +
  `<img id="fN" class="{prefix}-logo">` + placeholder CSS) from `assembleStandard` when
  `logoEnabled` and `designHasLogoSlot` says the design has none. Four rules bind here; the
  measurements under them are **`docs/LOGO_SLOT.md`**, and where a mark is PERMITTED at all is
  `docs/MARK_CAPABILITY_AUDIT.md`.
  - **The capability is the whole answer**, including for a category that used to hard-wire it -
    a phantom Logo field the design can never draw is a lie on every generated control page, and
    removing it moves every baseline. **A design gating a logo gates its logo CSS on
    `logoEnabled` too**, or the default build changes for a slot nobody asked for.
  - **TWO arrangements, decided by the CATEGORY, never per design:** lower thirds place the mark
    BESIDE the text (a two-column, ONE-ROW grid, the design's own children gathered into a
    `.{prefix}-lockup`); every other category keeps the stacked band above it, because a card is
    a vertical composition and a mark above its heading reads as a header. **A strap spends
    width, never height.**
  - **A MARK IS NOT A PICTURE.** The slot is a BAND sized by height with its width free, carrying
    no radius and no crop - `src/ai/assetIntegrity.ts` refuses both on a picture the user marked
    "use it as it is". A slot holding CONTENT rather than a mark says so with
    `TemplateVariant.imageSlot: 'picture'` (ls25's square release artwork).
  - An EMPTY slot changes nothing in either arrangement: the hidden `<img>` stops being a grid
    item and takes its margin - which is where the clear space lives, deliberately, rather than
    in a track gap - with it. Pinned by `e2e/wizard-logo.spec.ts`.
- The preview iframe can't resolve `images/...` paths set at runtime - preview/composeDocument.ts
  injects a MutationObserver shim that swaps known relative paths for their in-memory data URLs.
  Exported packages never include the shim.
- Asset path convention (uploads at `images/<file>`, fonts at `fonts/<file>`, one-folder zip
  layout): see src/export/AGENTS.md.

## Easing doctrine

model/easings.ts + DESIGN_LANGUAGE §4: entrances use Out-direction curves, exits use In-direction
and run faster; Back Out for pops; Bounce/Elastic playful-only; Linear only for continuous motion
(credits rolls, ticker marquees - strictly `ease: 'none'`).

## Broadcast packages (siblings)

Graphics made in one project must read as siblings - DESIGN_LANGUAGE §8 holds the per-family
cross-category tokens (minimal / sport / glass / **noacg house** shape, type, and motion values;
noacg is the product's own on-air look, rebuilt from the brand-kit overlays). Two mechanisms
enforce it: the **project brand** (model/brand.ts, captured on every wizard Create; the wizard's
"Use current project's colors & typeface" toggle - off by default - re-applies palette + font via
`brandPatch`) and **sibling judging** (every new category variant is judged against its
lower-third counterpart). Custom colors enter through the wizard's Custom palette (hex/rgba +
picker); imported fonts become template assets (`fonts/<file>` data-URL) with a visible
`@font-face`, are registered via the FontFace API for the builder UI, and ship as real binaries
in the export.

## Four traps that no gate here can see

- **A REVEAL MASK IN A FLEX ROW IS A LINE THAT CAN BE SQUEEZED TO NOTHING.** A flex item normally
  refuses to shrink below its own content (`min-width: auto`), and that protection is switched OFF
  for an item whose overflow is not visible - which every `.{prefix}-mask` is. So a masked line in
  a flex row has no floor: ls07's label may not wrap (`white-space: nowrap`) and was squeezed under
  its own width and CUT - "COMMENTARY" aired as "COMMENTAR" at text size L. A masked line that
  cannot wrap states `flex: none`, and the lines that CAN wrap absorb the row instead.
- **`tabular-nums` is not `lining-nums`.** `font-variant-numeric: tabular-nums` holds a figure's
  WIDTH and says nothing about its HEIGHT. The bundled text serifs (source-serif-4,
  playfair-display) default to OLD-STYLE figures: 0, 1, 2 sit at x-height while 3, 4, 7, 9 hang
  below the baseline. In a stat column that puts "42" lower than "18,400" beside it and breaks the
  baseline each figure shares with its label; in a tracked all-caps label it makes "2026" read as
  lowercase inside its own line. **`scripts/numerals.mjs` cannot catch it** - it measures whether a
  number's box MOVES as digits change, and old-style figures are perfectly stable at the wrong
  height, so it passes. Any figure column or caps label on a serif face writes both:
  `font-variant-numeric: lining-nums tabular-nums;`. Found while drawing ig39 "Key Figures",
  visible only in a high-DPI crop.
- **A permanent `will-change` makes a settled capture unreproducible.** Chromium promotes the
  element to its own compositing layer for the life of the page, rasterises its texture DURING the
  entrance, and never redraws it once the tween settles - so a still of a finished graphic carries
  a texture rastered at whatever sub-pixel phase the last mid-flight raster caught. One cell
  produced 5 distinct PNGs in 5 runs, differing only on glyph and panel edges. It looks exactly
  like a composer or font bug and is neither: in the measured case (2026-08-17) the language, the
  composed html/css/js, the srcdoc and every element's rect to 4dp plus 19 computed paint styles
  were byte-identical across runs that disagreed. In a capture runner, after the graphic settles,
  drop the hint for one frame and restore it - `addStyleTag('*{will-change:auto !important}')`, two
  rAFs, remove, two rAFs - then shoot.
- **Never import from `src/blocks/**` inside `src/templates/**`.** `src/blocks/edit.ts` imports
  `templates/shared/standard.ts`, so any import back the other way closes a cycle - and because
  the catalog builds at module scope, the cycle throws no readable error: **the app simply never
  renders.** On 2026-08-09 reusing `setFieldDefault` inside `templates/types/graphicType.ts` made
  45 AI/wizard e2e tests time out waiting for the "Generate" button, with nothing in the console
  naming the cycle, while the same specs passed one at a time. The templates layer sits UNDER
  blocks in the allowed import edges (`docs/ARCHITECTURE.md`); the sanctioned
  `blocks/animData` / `blocks/animImport` seam reads like a precedent it is not. If a blocks helper
  looks reusable here, copy the few lines. **A wholesale wizard/AI spec failure with timeouts and
  no error message is the signature** - check the new import before debugging the UI.
