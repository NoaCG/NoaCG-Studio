# Playout adjustments: move, size, retype and recolour graphics from the playout page

Status: **draft for the owner. Written 2026-10-24; the three open decisions (the first delivery's
scope, a reversible production look, the Google-font fix as its own change) taken the same day;
revised the same day after a first independent second opinion (`/so`); revised again on
2026-10-25 after two further independent second opinions, whose amendments are folded in below.
Phase 1 is admitted to the production-page run as row 32b (pull request 1699); its gate was
narrowed on 2026-10-25 to match this revision. The owner agreed the design as a whole on
2026-10-25 ("I agree the playout-adjustments design as a whole as revised"), so the work ledger is
agreed; phases 1b, 2 and 3 are proposed as rows 32c, 32d and 38a and await the coordinator's
admission.** Research and
planning only: no product change. Where this document says "verified", the code or an isolated
experiment was read or run on main `ad3c7238b` (the reviews re-read it on `be0cea068`,
`8ebb429b4` and `bb7890068`, by source review only); "inferred" is a reading not yet exercised;
"untested" is a claim nobody has checked. Private competitor notes with URLs:
`docs/private/competitors/PLAYOUT_ADJUSTMENTS_2026-10-24.md` (main checkout only).

Parent: [production-page](../production-page-refactor/spec.md) and its
[extension contract](../production-page-refactor/extensions.md), which admits row 32b and is
normative for integration.

## Why

In the studio game show of 2026-10-23 the operator needed, during the broadcast, to move a
lower third from bottom-left to bottom-right, to shrink a quiz graphic that filled half the
screen so that people and a score graphic fitted above it, and to make thin text more readable.
None of that was possible from the playout page. The only roads were reimporting the graphic or
opening the editor, and the editor's style surface was removed on 2026-10-18 (commit
`8c560be7c`), so there is no surface at all today that re-zones or resizes an existing graphic.
Separately, graphics have aired with a typeface or Nordic letters that did not match the design.

The production page already has most of what an adjustment needs around it: one NoaCG-owned
frame per graphic on the output and on PROGRAM, one frame for the selected graphic on PREVIEW, a
prep/live model where nothing airs because it was typed, a per-cue record, and a brand model
whose vocabulary is exactly the one a retint needs. What is missing is a record for the
adjustment, a measured box to anchor it, and the code paths that carry, apply, restore and
export it.

## Goal

An operator, on the playout page and under broadcast pressure, moves a graphic a little or to
the other side, makes it about five percent smaller or larger, corrects a font family, weight or
colour on one graphic, or applies one typeface and accent to every graphic already in the
rundown, all prepared on PREVIEW and reaching air through Take or Update, never by being typed.
The library original and other productions are untouched. Every change can be reset: a reset at
one scope reveals what the next scope says, and a reset at the widest scope returns the authored
appearance. A graphic that cannot take a change says so in one line.

## Non-goals

- A second editor. No per-element editing, no recomposition, no layout engine. A graphic that
  needs a different composition for a different place (the half-screen quiz as a lower third)
  needs a design, not an adjustment; see "The quiz, honestly".
- Changing what a graphic's code does. Adjustments live around the graphic (a frame transform)
  or in its declared style contract (`:root` variables); nothing rewrites markup or scripts.
- Rotation, crop, opacity, colour correction filters. Comparable renderers offer them; no
  production has asked.
- A theme vocabulary beyond the brand model that exists (`ProjectBrand`: palette, typeface, shape
  tokens). Logo replacement is out: the overlay is type and colour.
- Automatic following of library edits, operator identity, locking or a collaboration redesign
  (`docs/GOALS.md`). Where the team merge can split an operation, this spec asks for a targeted
  guard, not a new merge.
- Rewriting the `imageFit` precedent for server still pictures.
- A compact-layout framework for quiz boards. If a graphic wants a strip form, that is a design.
- Arbitrary visible-ink measurement of any document. The box is defined for the stable cases
  below and honestly absent elsewhere.
- Carrying adjustments in the `.noacgpack.json` format. A pack installs a production without
  them; the dialog says so.

## Findings about the current implementation

### Placement and size (verified)

- Every catalog design positions one root element with `zoneDecls` (`src/templates/shared/base.ts:176-210`):
  nine zones snapped to safe areas (left inset 120 px, top 86 px, bottom 119 px at 1080p), the
  nudge folded into the inset in px, centred zones through `calc(50% + n)` plus `translate(-50%)`.
  Lower thirds put it on `.lower-third` (`src/templates/lowerThirds/shared.ts`), quiz boards on
  `.quiz` (`src/templates/quiz/shared.ts:703-708`), scoreboards on `.scoreboard`; starting-soon
  and credits zone an inner element instead. The root element is also what the machine runtime
  tweens (`xPercent`/`yPercent`, `shared/animRuntime.ts:606-693`), and `noacgResetGraphic` wipes
  every inline style under the root on play, snap and state swaps (`animRuntime.ts:916-925`).
  An in-document adjustment must therefore live on `document.documentElement` or in a
  stylesheet, never as an inline style on the root.
- Size is one knob, `--scale` on `:root` (`computeScale`, `rootVarsCss`), with the resolution
  factor folded in; the wizard offers S/M/L (0.8/1/1.25) and a px nudge, once, at creation
  (`src/components/wizard/steps/StyleStep.tsx:512-586`). After creation nothing in the product
  changes zone, nudge or `--scale`; the old Style panel's `setZone` text patch is in git history
  only. `set-scale-var` exists in the editor canvas protocol, not in the live-control channel.
- **The output stage holds one sandboxed iframe per pool graphic**, absolutely positioned at
  that graphic's own resolution at the stage origin, unscaled, in layer order
  (`src/output/stage.ts:348-422`); the stage itself is `max(pool resolutions, 1920×1080)`
  (`hostedControl.ts:398-409`). A foreign OGraf package gets the same kind of frame
  (`src/output/foreignOgraf.ts`), though main's `PayloadStage` and output bootstrap do not yet
  pass the stage's `foreign` option, so foreign graphics in the production workflow are E3's
  work, not a fact today. PROGRAM on the production page and the hosted page is the same
  `createOutputStage` (`home/PayloadStage.tsx`). **PREVIEW is a different thing**: one iframe of
  the selected cue's graphic, contain-fitted and centred in the production-shaped frame
  (`home/PlayoutMonitors.tsx:188-241`), so a 720p or portrait graphic shows at another scale and
  place on PREVIEW than on PROGRAM today. The exported production controller's monitors are
  per-graphic iframes with a scale transform (`control/productionControllerHtml.ts:454-479`).
  Exported overlays (html-overlay, CasparCG, SPX) have no wrapper: the template document is the
  page.
- **Geometry today is thin.** The box a document reports (`reportGraphicBox`,
  `src/preview/settleGraphic.ts:149`) is the bounding rectangle of the body's first `div`, used
  by `frameGraphic` to crop library cards. It is not the union of visible ink, it is not clipped
  by the document's overflow clipping ancestors, and it reports no text sizes. The live-control
  `measure` command exists as a transport; what it measures must be extended for this feature.
  `settleGraphic` parks a design at its settled pose; a design whose motion has no finite end
  (every ticker in `src/templates/tickers/` is a marquee window over a wider track) is left at an
  arbitrary phase.
- **Isolated experiment** (a scratch script over the repo's own `scripts/catalog-emit.mjs`;
  method, numbers and limits in `evidence/scale-experiment-2026-10-24.md`; the script itself is
  not checked in): seven catalog templates (lt01, lt63, qz01, qz05, qz13, sb01, sb14) and the
  two agent-made boards of `e2e/fixtures/agent-made/vote-show.noacgpack.json`, rendered in
  Chromium at 1920×1080.
  - Setting `--scale` ×0.95 on a played graphic re-lays it out at once, no entrance replay, and
    the zone anchor holds (lt01 stays at left 120 / bottom 961; the box shrinks 410→389 px).
  - A `transform: scale(0.95)` on `<body>` about the measured box's bottom-left corner gives the
    same box for every hugging design, and `stop()` then `play()` still run correctly under it.
    A `translate` that mirrors the box across the frame puts lt01's strap at right inset 120.
  - A transform on the host iframe behaves identically and leaves the document untouched.
  - Full-width designs differ: lt63's band stays 1920 wide under `--scale` (frame-anchored
    geometry, `docs/DESIGN_LANGUAGE.md` §1) but becomes 1824 wide under a body or frame
    transform, leaving a gap at one edge. That is the honest limit of a generic transform.
  - Changing `--font-heading` at runtime reflowed qz01's box from 287 to 317 px tall; the text
    fits re-run only on `update()` and once on `fonts.ready` (`shared/textFit.ts:83-94`,
    `shared/stageFit.ts:497-502`), so a runtime font change needs a re-fit call.
  - Not exercised: designs that use `100vw`, `100vh` or `vw`/`vh` units (`tickers/tk21.ts:59`,
    `transitions/premiumArchetypes.ts:122`), which a `<body>` transform would mis-measure. In a
    document that IS the page there is no wrapper, and whether to transform `<body>` or wrap the
    body's children in one NoaCG element is **undecided**; a catalog sweep decides it (phase 1b).

### The quiz, honestly (measured, with an assumed band)

The catalog quiz boards are 895 to 1179 px wide and 287 to 319 px tall, centred, with their
smallest text at 20 to 32 px. The agent-made "Votes board" of the game-show fixture is 1200×511
at the bottom-left, smallest text 26 px. The band the people and a score graphic leave for a
lower third was **assumed at 240 px** above the bottom inset; nobody measured the 2026-10-23
frame. Against that band:

| Graphic | Box | Scale to fit | Smallest text after | Floors (card category) |
|---|---|---|---|---|
| qz01 Arena Quiz | 895×287 | 0.84 | 18.4 px | fails the 20 px secondary floor |
| qz05 | 580×199 | 1 (already fits) | 26 px | passes |
| qz13 Sticker Quiz | 1179×319 | 0.75 | 24.1 px | passes the secondary floor; still a 1179 px board, not a strip |
| Votes board (agent) | 1200×511 | 0.47 | 12.2 px | fails every floor |

The receipt measured the smallest visible text; it did not classify roles, so the 28 px primary
floor (`src/model/designRules.ts`) is not proved either way for the boards that pass. The reading:
modest resizing keeps some boards readable, a half-screen board shrunk to a strip does not, and
no validator sees an outside transform. No quiz board declares a compact layout
(`src/templates/quiz/`); each game-show family ships a lower third (`docs/DESIGN_LANGUAGE.md`
§8), which is a conditional alternative, not a drop-in replacement for an interactive
question-and-options board.

### The cue, the wire and recovery (verified)

- `ShowCue` (`src/model/shows.ts:50-89`) holds field `values`, label, note, hotkey, folder,
  timing, clip playback and `imageFit`; no visual data. Two cues of one graphic differ only in
  values. The pool entry `SavedGraphic` is a **copy** of the library template with a back-link
  (`src/model/packets.ts:39-68`); Publish refreshes the copy's template and `savedAt` from the
  library (`refreshGraphicCopies`, `shows.ts:826-870`; the copy is taken by `addGraphicToShow`,
  `shows.ts:703-741`) and keeps other entry properties; re-adding a graphic of the same name
  constructs a replacement entry that keeps `layer` and `soundConfig` explicitly. Duplicating a
  production is a `structuredClone` (`duplicateShowChecked`), a folder move moves the same cue
  objects (`moveInRundown`), and **cue copy and paste rebuilds the pasted cue field by field**
  (`src/model/cueClipboard.ts pasteCopies`, lines 95-111: label, values, note, accent colour,
  timing, folder), so a new cue member has to be added there by hand. Every show write goes
  through `patchShowChecked` (`shows.ts:907`) and stamps `updatedAt`, which drives the
  publish-again comparison, team saves and sync pushes. "Package" is retired: the one grouping is
  the production; a `.noacgpack.json` installs into one and **carries no cue adjustments**
  (`src/packs/graphicsPack.ts` has no such member; its brand is baked into templates at install);
  rundown folders do not travel to the published payload or exports.
- The wire is field data and machine events only: `update`, `play`, `stop`, `next`, `event`,
  `snap`, `hello` (`src/control/controlModel.ts:802-815`). The database checks each item's `t`
  against that list and its `graphic` name, and stores the message JSON as sent
  (`supabase/migrations/0071_command_sequence.sql:346`), so a new **kind** needs a migration and a
  new **field** on an existing kind does not; a field that carried font bytes would be stored as
  sent, in every row. Take sends `[update(values), play, cue]`, ✎ Update sends `[update(full
  values)]`, and the shared runtime's `update()` writes ids it knows and ignores the rest without
  replaying anything (`templates/shared/base.ts:407-417`). The ± block's partial update is the
  precedent for a merged, never replayed, data write.
- Recovery differs per surface. The `/output` renderer keeps `mergedData`, every key it received
  in `update` or an event payload, reports it as its baseline and restores from it on boot, then
  replays the log tail (`src/output/main.ts:683-716`, `control/outputRecovery.ts`). The local
  relay receiver keeps a merged map and restores by calling the template's `update()` directly
  (`control/localReceiver.ts:59-67,132-153,244-252`); it is pinned by `e2e/local-relay.spec.ts`
  (the reload cases at lines 296 and 335), while `npm run test:local-relay` tests the two relay
  server implementations, not the receiver. The hosted receiver baked into a published graphic
  harvests its report from the DOM text of declared fields (`hostedReceiver.ts:135-148`) and,
  when its report carries no event id, resumes from the log head (`receiverFollowFrom`,
  `src/control/outputRecovery.ts:170-176`, emitted as ES5 at 181 and called at
  `hostedReceiver.ts:298`), so anything outside field data is restored there only from log rows
  after its baseline. A foreign OGraf frame is handed the whole data object
  (`output/foreignOgraf.ts:159` through `ografCallFor`), so an undeclared key would reach a
  stranger's package.
- The draft is one record per selected cue, autosaved after 300 ms; selecting another cue flushes
  it (`control/cueDraft.ts`, `ProductionPage.tsx:1791-1801`). An edit to the on-air cue is saved
  but not sent; `unsentFields` (`cueDraft.ts:115`) compares the cue's **values** with what was
  aired, so a record outside `values` is not counted until that comparison is extended. The
  rundown has an undo history (`home/useRundownHistory.ts`); the only arrow-key binding on the
  page today is the rail resizer's (`home/RailResizer.tsx:160`).
- The hosted page stages into a cue-prefixed buffer whose values override the published cue's
  (`control/cueStaging.ts`); the data API maps declared ids and titles and ignores the rest.
- Team productions merge per whole cue and per whole pool entry, independently
  (`model/teamShowMerge.ts`, labels in `FIELD_LABEL`); personal productions take the remote
  record on conflict and keep the local one as a conflicted copy (`backend/sync.ts`). A read-only
  probe by the 2026-10-25 review found the two ways an operation that writes a pool entry and a
  cue together can be split by a teammate's concurrent edit: a concurrent pool-layer edit keeps
  the old default while the promoted cue's exception is deleted; a concurrent cue-text edit keeps
  the new default while the old exception is restored.

### Styling systems (verified)

- Every catalog design declares the `:root` contract (`--accent`, `--text-color`, `--text-dim`,
  `--panel-bg`, `--font-heading`, `--scale`, optional `--type-scale`) plus the shape tokens it
  reads (`src/model/themeTokens.ts`: thirteen, among them `--display-weight`, the heading weight,
  referenced by 319 files under `src/templates`, and `--font-label`; whether a given graphic
  paints with a token is detected per graphic by `cssPaintsWith`, `src/model/cssVars.ts:178`,
  which follows the `:root` chain through the stylesheet's rules: a conservative capability
  check, not proof of pixels currently on screen). A brand is `ProjectBrand` (palette, typeface,
  tokens, logo). `applyLookToTemplate` (`src/model/packets.ts:372-439`) is a pure
  `(template, brand) => template` that writes only variables the receiving design declares
  (`setCssVariable`, `ensureFontFace`, `ensureNumericFontFace`, `numericFontStack`), but it also
  swaps the first marked `@font-face` block and can write a logo into an allow-listed slot, so
  it is not the same operation as a variable overlay.
- `Show.look` (a copy **captured automatically** from the first graphic added or by a kit) and
  `Show.brandId` (a reference) exist on the production (`shows.ts:353-369`); "Apply brand to all
  graphics" is a comment, not a feature, and the only multi-graphic apply is pack install. There
  is no production-level style that reaches air; a look changes air only by being baked into
  templates and republished. The production page has no palette, font or look control. The
  audience join page reads `audienceBrandFor(show.look)` **at Publish**
  (`control/hostedControl.ts:628`), and a custom font contributes only its family name there,
  while bundled faces are declared against `/fonts` (`audience/audienceBrand.ts:24-27`).
- `scripts/palette-freedom.mjs` (results in `docs/CATALOG_VARIETY.md` §5, 459 designs): a new
  accent reaches every design; 13 keep a literal accent somewhere; a change of **tone** (dark to
  light panels) breaks 148 designs and degrades 189. Colour is free; tone is not.
- Exceptions already live outside `:root`: team colours are `color` fields lifted onto the
  board's root as `--team-a`/`--team-b` (`scoreboards/boardRuntimes.ts`); alert severities and
  quiz "wrong" are literals by design; sponsor, team and crest slots are excluded from the brand
  logo (`BRAND_SLOT_TITLES`). A `:root` overlay leaves all of them alone.
- Imported SVG designs (svg01) declare the contract but paint nothing with it: fills are the
  artwork's own and text uses the artwork's families (`importedDesign/svgFonts.ts`), declared
  under comments that `FONT_BLOCK_RE` matches. Agent-made graphics are asked by the skill contract
  to use the contract vars; the publish bench checks only that `--accent` and `--scale` appear
  (`validation/runtimeBench.ts:916-925`), never that they paint. Foreign OGraf packages have no
  style hook (`control/ografContract.ts`).

### Fonts (verified unless marked)

- The seventeen bundled faces are one woff2 each, the Google "latin" subset: all have
  å ä ö æ ø and their capitals; **none has Š š Ž ž** or the rest of Latin Extended-A. Fifteen
  are variable fonts, so 400 and 700 are real weights; **Bebas Neue and Anton are static 400**,
  nothing sets `font-synthesis`, and the style vocabulary offers 400 to 900 for them, so their
  bold is browser-synthesised (the defaults of lt07, lt33, lt43, lt61, ls08, card83). An
  imported face (`CustomFont`, `src/model/fonts.ts:495-510`) is one file whose `asset.data` is a
  data URL of the font bytes; `customFontFaceCss` declares no weight, and `fontWeights()`
  (`fonts.ts:418-423`) answers 400 to 800 for any family it does not know, so an imported face's
  real weights are unknown and its bold is synthesised too.
- **The Google Fonts import embedded the wrong subset.** `fetchGoogleFont` took the first
  `url()` of the css2 response; the live response lists cyrillic-ext first for Montserrat and
  Roboto and latin-ext first for Bebas Neue, latin last, so the embedded face had no Latin glyphs
  and every letter fell back to Arial. Fixed as its own change (owner decision 3, pull request
  1689, landed 2026-10-24). Whether it caused the 2026-10-23 incidents is **inferred, not
  established**: the affected graphics' font assets were not examined.
- Readiness: the output holds a frame hidden until `load`, releases it onto the fallback face
  after `FRAME_HOLD_CAP_MS` = 3 s with a debug line, and READY reports "Using a fallback font"
  as a degraded line that blocks nothing (`output/stage.ts:547-558`, `control/readiness.ts:287-296`,
  `takeBlockers.ts` has no font rule). **READY's warm pass calls `load()` on every declared face
  that is not yet loaded** (`composeDocument.ts:315-324`), so a face declared in a document is a
  face fetched on warm. Preview `play`/`settle` wait on `fonts.ready` capped at 400 ms. Exported
  overlays and the OGraf real-time load wait on nothing; single-file exports (the CasparCG target
  is one self-contained HTML file, `export/targets/casparcg.ts:1-3`) inline the bytes and fail
  loudly on a missing file; folder exports copy `fonts/<file>` found in `template.css` and
  silently skip a file they cannot fetch (`export/common.ts:58`).
- An unresolved SVG family is a wizard warning, never a block, and falls back to whatever the
  playout machine has installed. The skill's worked example sets `--font-heading: "Inter"` with
  no `@font-face` (`cli/skill/noacg-graphic/references/contract.md:480`); the validator has no
  check for a family without a face.

## The recommended design

### One sentence

A cue carries an optional **adjust** record (place, size, style variables), inheriting a pool
graphic's default and an explicitly activated production look; the production page resolves it
against a qualified measurement of the graphic into one **applied appearance**, Take and Update
carry that appearance as a field on the `update` message every surface already handles, the
output applies place and size as a transform on the NoaCG-owned frame and style as `:root`
variables on the document root, every receiver restores the last applied appearance, and exports
bake the same resolved appearance into the files they write.

### Two mechanisms, chosen by what each can honestly do

| Need | Mechanism | Why this one |
|---|---|---|
| A little left/right/up/down, the other side, about 5% smaller | **Frame adjust**: `translate(dx, dy) scale(s)` about a pivot, on the per-graphic frame NoaCG owns | Works for every native source on NoaCG's output with no template support, applies on air without a replay, and is what comparable renderers do (CasparCG `MIXER FILL`, OBS and vMix transforms). It never recomposes; it says so. Foreign OGraf frames take it once E3 puts them in the workflow |
| Font family, weight, accent and the other contract colours, on one graphic or all | **Style adjust**: `:root` variable overrides in the brand vocabulary, applied at runtime on `documentElement`, baked at export | The contract already exists and every catalog design declares it; `cssPaintsWith` says which variables a design can paint with; exceptions (team colours, severities, logos) already live outside `:root` |

The authored `--scale` knob was considered as the size mechanism for contract graphics (it keeps
full-width bands full-width and respects the auto-fit cap). It is rejected for the operator
control because it would make "Size" mean two different things for two kinds of graphic, and the
SVG text fit does not follow it. It remains the right knob for a designer and may later back a
"Re-anchor" that edits the design.

### Geometry: one coordinate system, a qualified box, and what travels

- **One mapping for PREVIEW and PROGRAM.** Everything is in production-frame px, the stage's
  resolution (`max(pool resolutions, 1920×1080)`). A graphic's frame sits at the stage origin at
  the graphic's own resolution, unscaled, exactly as the output stage places it today. PREVIEW
  adopts that placement: it draws the selected graphic's frame at the stage origin inside a
  production-shaped stage and fits the whole stage to the monitor, instead of contain-fitting and
  centring the graphic alone. A 720p or portrait graphic then shows on PREVIEW where and how
  large PROGRAM will show it, and AC-2's mixed-resolution case means what the operator sees.
- **The measurement** is answered by the graphic's document through an extended `measure` reply
  and is **identified**: by the document (the pool entry's template digest), the cue, the
  effective values and style it was taken for, and the stage revision. A reply that does not
  match the current identity is rejected, and cached geometry is invalidated when any of those
  change: typing a longer name, a source-driven value, a font or template refresh, a Publish.
- **What is measured, honestly.** The reply carries **two rectangles**, both clipped to every
  overflow-clipping ancestor and to the frame (a Range rectangle is not clipped by
  `overflow: hidden`, and every ticker is a window over a wider track). The **information box**
  is the union of the document's safe information: text ranges and images; presets position it,
  and the smallest rendered text size rides with it. The **painted extent** is the union of
  everything the document paints, decoration included (a band, a rule, a scrim that bleeds to the
  frame edge by design, `docs/DESIGN_LANGUAGE.md` §6). Decoration never moves the information
  box, so a full-width band is never translated to a safe inset as though its background were
  text; and "full width" is read off the painted extent, never the information box, because a
  band's text sits well inside its edges (lt63 keeps its words 120 and 128 px in while its
  background reaches both frame edges, `src/templates/lowerThirds/lt63.ts`). Both rectangles are
  **qualified** only when the document has a deterministic settled pose: the settle completed, no
  timeline is still running, and two measurements 250 ms apart agree. A document whose motion has
  no finite end (a marquee, a loop, a staggered reveal that never parks) reports its painted
  extent (the clipping window's rectangle) and no information box; a document that answers
  nothing (a foreign package, a broken template) has no measurement.
- **The pivot and the anchor.** The anchor is a nine-point zone, derived **once** when a record
  is first written, from the zone the qualified box's centre falls in by thirds of the frame, and
  stored on the record, so a longer name never moves the anchor. A hugging design anchors at its
  information box's corner or edge in that zone; a full-width band (a **painted extent** touching
  both horizontal frame edges within 1 px) has its pivot at its horizontal midpoint and its
  anchored vertical edge, **Size and the horizontal presets are disabled for it**, and only
  vertical nudge remains, because a uniform shrink would open its side edges. Painted extents with
  no information box get the same treatment.
- **What travels.** The record stores intent (a place preset, nudges, a scale, the anchor). At
  send, the page folds the record with the qualified box into the **applied appearance**: `dx`,
  `dy`, `s`, the pivot in px, the style variables and the font declarations by name. A place
  preset resolves against the current qualified box, so a strap placed right stays inside the
  right safe inset when a longer name is typed and remeasured before the Take; a nudge is
  absolute px. The resolved form is what travels and what recovery restores; receivers never
  measure. A left-aligned strap placed right keeps its left alignment and grows to the right;
  the summary says so, and a re-anchor that changes alignment is a design edit, not this feature.
- **Stale geometry.** When the current identity has no qualified measurement yet (the operator
  typed and the settle has not completed, the hosted page has no PREVIEW of that cue, a font is
  still loading), a preset cannot be resolved afresh: the surface keeps the **last qualified
  placement** for that cue, marks the block "measuring" (or "no measurement" where none will
  come), and the Take sends that last placement rather than nothing or a guess. Nudges and size
  need no box and always apply.
- **Where the box lives.** The measured box is **not** a member of the inherited record and is
  never written to the show on a PREVIEW settle: every show write stamps `updatedAt` and so
  fires the publish-again comparison, team saves and sync. The page keeps measurements in the
  session's draft part; the box is written into the published payload's cue at Publish and into
  the applied appearance at Take, which is where the hosted page, which applies but does not
  edit, reads it from.

### Scope and precedence

Four scopes exist; the UI exposes three.

| Scope | Record | What it is for |
|---|---|---|
| Pool graphic | `SavedGraphic.adjust` (inside `Show.graphics`) | Every cue of this graphic in this production: the lower third moved for the show, the quiz shrunk. **The default scope of the Adjust block** |
| Cue | `ShowCue.adjust` | The explicit exception: the second lower third on the right while the first stays left |
| Production | an explicitly activated look (`Show.brandId` or `Show.look`, see below) | Typeface and colours for the whole rundown, graphics added later included |
| Library original | nothing | never written by an adjustment |

Rules, each one line:

- **Precedence per property, narrowest wins:** cue > pool graphic > production look > authored.
- **Inherited, not copied.** A record holds only the properties set at that scope; a missing
  property inherits, property by property: a cue that overrides `place` alone still inherits a
  changed `x`. Identity defaults (0 px, scale 1, no variables) apply **after** the fold, never
  before, or inheritance would be masked.
- **Reset removes the record at the scope shown** and reveals the next scope. Each reset is
  labelled by the state it produces, never by the word "everything": "Stop this cue's exception
  (back to bottom-right, the graphic's)", "Reset Presenter strap to as designed", and in the Look
  panel "Turn the look off". A reset sends an explicit identity only when the complete effective
  appearance after it is identity; otherwise the next Take or Update sends the inherited result.
- **The graphic default is the default scope; a cue exception is explicit.** All three
  2026-10-23 cases were for the show, and the likely mistake under pressure is moving one cue
  while the next cue of the same graphic comes up in the old place. Writing a cue exception is a
  deliberate toggle ("Only this cue") that names what it leaves ("the other 3 cues keep
  bottom-right").
- **Promotion is one saved operation.** Making a cue's exception the graphic's default writes the
  pool entry's record and clears the same properties from the cue's record in one show write,
  through one mutator. The team merge is per whole item and can split those halves (the probe
  above); the targeted guard is that a cue exception is **never deleted by a merge**, only by an
  operator: the leftover exception equals the default, the summary counts it ("1 cue keeps its
  own place") and one press clears it. No general collaboration change.
- **`keepStyle` on a cue or pool entry excludes the production look's style only**; the entry's
  own and inherited graphic-level style still apply, and font assets follow whatever variable is
  in effect at that scope. The gesture that writes it is the "As designed" entry in the Type and
  Colour rows; a cue or graphic reset removes it.
- **The production look is activated explicitly.** `Show.look` is captured automatically today,
  so applying it at render would restyle productions nobody adjusted. The Look panel's On writes
  an additive optional `Show.lookApplied: true` and reads `brandId` first, `look` second, with
  the resolved values and the imported face's asset copied into the production at activation so
  a signed-out hosted page and an offline export never depend on a library lookup. Absent
  activation, the historical look applies nothing to graphics. **The audience join page keeps
  today's behaviour**: it reads the activated look when there is one and the captured look
  otherwise, so activation never un-brands an existing join page.
- **Position and size are offered at pool graphic and cue scope only.** A production-wide
  offset has no meaning across different graphics. Style is offered at all three.
- **Every mutation door reads through `readAdjust`** (set, promote, reset, clear exceptions, the
  Look panel's writes): a record written by a newer build is kept unread and the door refuses to
  edit it with the existing read-only wording, the `profile` setters' and deleters' precedent.
- **Lifecycle.** Publish's `refreshGraphicCopies` replaces the template and keeps the records
  (it must invalidate their geometry, which is not stored, so nothing to do); re-adding by name
  copies `adjust` as it copies `layer` and `soundConfig`; duplicating a production copies every
  record (`structuredClone`); a folder move changes nothing; cue copy and paste copies the cue
  record (`pasteCopies` names it); a pack neither carries nor restores records, which the install
  dialog states. `lookApplied` joins `FIELD_LABEL` so a merge loss names it.
- **Two operators:** team productions merge per whole cue and per whole pool entry, so two
  people changing different properties of the same graphic's default still conflict and the loss
  is reported as it is for values; personal productions keep the whole-record behaviour they
  have.

Concrete examples:

- Lower third moved for the show: open Adjust on any Presenter strap cue (scope reads "all 3
  Presenter strap cues"), preset bottom-right, nudge 12 px left. Every cue and every later cue
  moves. On one cue, "Only this cue" then bottom-left: that cue keeps left when the graphic
  default changes again, and the other cues' block reads "1 cue keeps its own place".
- Production look: Archivo, accent `#ff7a00`, turned on in Setup ▾ Look. The score banner's team
  colours (fields) and the alert graphic's severity colours stay; the imported quiz shows "Type
  and colour: as designed (imported artwork)"; one lower third set "As designed" in its Colour
  row keeps amber. Turning the look off returns every graphic that had no exception.

### The record

```ts
/** ADDITIVE OPTIONAL on ShowCue and SavedGraphic; own `v`, read through one reader that keeps a
 *  newer `v` unread (read-only) and drops unknown members of a known one. Absent = nothing set
 *  at this scope. Every member is optional; identity defaults apply after the fold. */
interface AdjustRecord {
  v: 1;
  /** Place preset, resolved against the qualified box at send; absent = no preset. */
  place?: Zone9;
  /** Nudges in production-frame px, added after the preset. */
  x?: number; y?: number;
  /** Scale factor about the pivot. */
  scale?: number;
  /** The pivot's zone, derived once when the record is first written and kept. */
  anchor?: Zone9;
  /** `:root` variables by name without dashes: the four colours, `font-heading`,
   *  `display-weight`, and any TOKEN_VARS token except `font-numeric` (derived). */
  vars?: Record<string, string>;
  /** The face `font-heading` names, by identity only: a bundled id, or an imported face by
   *  family and asset path. Never bytes; the production holds an imported face once. */
  font?: { fontId: string } | { family: string; assetPath: string };
  /** Exclude the production look's style at this scope. */
  keepStyle?: true;
}

/** What travels and what is restored: the fold of all scopes resolved against the box. */
interface AppliedAppearance {
  v: 1;
  frame?: { dx: number; dy: number; s: number; ox: number; oy: number };
  vars?: Record<string, string>;
  fonts?: FontDeclaration[];
}

/** A face the document must be able to resolve, by identity; the bytes come from the surface's
 *  own asset road (below). */
interface FontDeclaration {
  family: string;
  /** `fonts/<file>` for a bundled face, the asset path for an imported one. */
  src: string;
  /** Real supported range; an imported face with unknown metadata declares `[400, 400]`. */
  weight: [number, number];
  style?: 'normal' | 'italic';
  unicodeRange?: string;
}
```

**The font asset road.** A declaration delivers no bytes into an already-composed document, so
each surface resolves `src` its own way: the `/output` renderer and both PROGRAM stages fetch a
bundled face from `/fonts` and an imported face from the published payload's assets (the
production holds it once, under `Show.look.customFont` or a pool template's assets); the
composed document gains the `@font-face` for exactly the faces the applied appearance names,
plus their numeric and label siblings (`numericFontStack`, `ensureFontFace`), never every bundled
face, because READY's warm pass loads every declared face. Collisions (two declarations of one
family with different `src`) are refused at the fold, the earlier declaration winning and the
summary saying so. Loading runs through `document.fonts.load()` with a latest-request guard (a
load that completes after a newer selection or after the session is disposed does nothing), then
the fit hooks run and a fresh measurement is requested. An imported face with unknown weights
offers Regular only and never a synthesised bold; a face that fails to load reads "Using a
fallback font" on READY exactly as today.

### The wire: a field on `update`, carrying the whole applied appearance

Take and ✎ Update already send an `update` message. It gains one optional, versioned field,
`appearance?: AppliedAppearance`, beside `data`. Why a field and not the alternatives:

- **Not a new message kind:** that needs migration 0071's allow-list widened and a second command
  road through every receiver; a field passes the existing check (only `t` and `graphic` are
  validated) and is stored as sent. The field carries names and numbers only, never font bytes,
  so a row stays small; the Supabase row size of an update carrying an appearance is still
  **untested**.
- **Not a reserved key inside `data`:** `data` reaches templates and foreign packages
  (`ografCallFor` passes the whole object), SPX rows, the data API and the hosted staging buffer,
  each with its own rules; a key there would have to be stripped at every boundary. A field
  outside `data` touches none of them.
- **Not a hidden declared field in every template:** portable to SPX and OGraf, but it moves a
  production concern into graphic code and the publish gate, against
  `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6f.

Four rules make it safe, and each is a test:

1. **A partial `update` without `appearance` retains the applied appearance.** The ± block, a
   bound-data row and a source-driven row never touch it.
2. **Take and a full ✎ Update carry the complete effective appearance.** When every scope is
   reset so that the effective appearance is identity, they carry an explicit identity, so
   deleting a record cannot leave an old transform on air; when inheritance remains, they carry
   the inherited result. A never-adjusted production sends no field at all.
3. **Applying an appearance replaces the previous one**; a baked graphic-level transform in an
   exported overlay and a cue-level appearance from the relay replace each other and never
   multiply.
4. **Recovery restores the last applied appearance, never newer preparation.**

What each surface must do (none of it is free; each is a named integration with its own test):

| Surface | Integration | Phase |
|---|---|---|
| Production page (`graphicVerbs.ts`, `cueItems.ts`, `cueDraft.ts`, the session's `draft` and `air` parts) | fold and resolve at send; the draft part carries the record and the measurements; `unsentFields` compares the resolved appearance with what was aired, so the amber dot and the fate line count it | 1 |
| `/output` stage (`stage.ts`, `main.ts`, `outputRecovery.ts`) | apply the frame transform and write the applied record as a `data-appearance` attribute on the frame; keep the last appearance per graphic in the report beside `mergedData` and `state`; re-apply on boot, on log replay, on `swapIn` and on rebuild | 1 |
| PROGRAM on both pages (`PayloadStage`) | the same stage, fed the same rows; the hosted page resolves from the published cue's box because it does not edit | 1 |
| Hosted staging buffer | the buffer stores the record per cue beside the staged values and is cleared with them; a staged record does not override a published one until sent | 1 |
| Export dialog (`showExport.ts`) | lists adjustments as not carried by any target until 1b lands | 1 |
| Hosted receiver in a published graphic (`hostedReceiver.ts`) and local relay receiver (`localReceiver.ts`) | apply on each row **and** on boot restoration (the local receiver's boot calls `update()` directly); report the last appearance with the harvest so an undated report no longer loses it. The document IS the page here, so the transform's host (`<body>`, or one NoaCG wrapper around the body's children) is decided by the sweep | 1b |
| Exported controller (`productionControllerHtml.ts`) and the html-overlay, CasparCG, SPX and OGraf bakes | emitted cues carry the record and the box; its Take resolves and sends the appearance on the relay; `bakeAppearance` writes the graphic-level result | 1b |
| Composed document, live-control run (`composeDocument.ts`) | set variables on `documentElement`; declare the appearance's faces; recompute `--font-numeric`; load with the latest-request guard, refit, remeasure | 2 |
| Foreign OGraf frame | frame transform only; nothing reaches the package | after E3 |
| Templates | nothing | |

A change arriving on `update` for an on-air graphic applies at once with no replay and no
transition in phase 1 (a cut, as a Take is); a short tween is a later option.

### What the operator sees

The cue editor gains one disclosure in the **cue-settings strip**, under the content bands and
beside Operator note and Advanced, closed by default, content-sized inside the one scroller
(`docs/PLAYOUT_DASHBOARD.md` §2e: settings are not content). Its rows wrap to the editor's width
as the field grid does, and its arrow keys bind only while focus is inside the block.

```
PREP · EDITING PREVIEW CUE · Presenter strap (2)
 F0 · NAME        F1 · TITLE
 ─────────────────────────────────────────────────────────────────────────────
 ▾ ADJUST · all 3 Presenter strap cues · bottom-right, 95 %          [ Only this cue ]
   Place   ┌·┬·┬·┐   ◀ ▶ ▲ ▼   x [ −12 ] y [ 0 ] px
           ├·┼·┼·┤
           └·┴●┴·┘
   Size    [ − ]  95 %  [ + ]                                 ← smallest text 22 px
   Type    [ Inter ▾ ]  [ Regular | Medium | Bold | Black ]  [ As designed ]
   Colour  Accent ■  Text ■  Panel ■                          [ As designed ]
   Reset ▾ · Reset Presenter strap to as designed
 OPERATOR NOTE   ▸ Advanced  Layer 1
```

- **Finding it:** the disclosure reads the current state in its summary line even when closed
  ("ADJUST · all 3 Presenter strap cues · bottom-right, 95 %, Archivo", "ADJUST · only this cue ·
  bottom-left", or "ADJUST · as designed"), so a moved graphic is never a mystery. The rundown
  row carries a small glyph when a cue or its graphic is adjusted.
- **Scope:** the block edits the graphic's default and says how many cues that is. "Only this
  cue" turns the block into this cue's exception and names what the other cues keep; pressing it
  again offers "Use for all Presenter strap cues", the one-operation promotion, with the count of
  cues it will move and of exceptions that stay.
- **Place:** a nine-point grid sets the preset (a translate resolved against the qualified box;
  text alignment does not change, and the summary says "placed right, left-aligned" for a
  left-aligned strap). Arrow buttons and keys nudge 1 px, Shift 10 px; the boxes take typed
  values. The pivot shows as the filled dot. While a measurement is pending the grid reads
  "measuring" and keeps the last placement; with no measurement it is disabled and says so; for a
  full-width band the horizontal presets and Size are disabled with "spans the frame".
- **Size:** plus and minus in 5 % steps, Shift 1 %, typed percent, about the pivot. The line
  under it is the readability estimate: the measured smallest text times the scale against the
  category's floors, amber under the secondary floor and red under 16 px, with the remedy named
  when red ("use a lower-third graphic").
- **Type and Colour** are the style adjust at this scope: family from the bundled faces plus the
  production's imported faces, weight from the face's real weights only, and the contract
  colours the design can paint with (`cssPaintsWith`), so a dead control is never drawn. "As
  designed" on a row writes `keepStyle` and reads back as the row's state. A graphic that paints
  none of them shows "Type and colour: as designed (imported artwork)".
- **Undo:** every Adjust write joins the rundown history, so Ctrl+Z reverts a wrong press as it
  reverts a cue move.
- **Preview:** PREVIEW shows the selected cue in stage coordinates with its applied appearance
  and the safe-area guides while the block is open. PROGRAM beside it, at the same scale, is the
  context for phase 1; a dimmed copy of PROGRAM behind PREVIEW is a phase 2 option, deferred if it
  delays type correction.
- **Reaching air:** exactly as today. Take airs the prepared cue with its appearance. For the cue
  on air, the editor's "switch to on-air cue" plus ✎ Update applies place, size and style at
  once without an entrance replay. Preparing cue B of a graphic while cue A of the same graphic
  is on air changes nothing on air until B is taken. Changing the graphic default while A airs
  changes A's next Take or Update, never air by itself; the fate line says a change waits.
  Selecting another cue flushes the draft to the record, as it does for values.
- **Reset** is labelled by the state it produces (above) and the next Take or Update sends the
  result, explicit identity only when nothing is inherited.

**Production look** lives in Setup ▾ → Look (a panel, so the monitors stay on screen):

```
LOOK · this production                                                  [ On | Off ]
 Brand   [ Autumn Quiz ▾ ]   or   Typeface [ Archivo ▾ ]  Weight [ Bold ▾ ]  Accent ■  Text ■  Panel ■
 Type reaches 6 of 9 graphics · Accent reaches 7 of 9
   ▸ Score banner: team colours stay   ▸ Imported quiz: artwork, not adjustable
 Exceptions (1): Presenter strap keeps its own colours                   [Clear exceptions]
 [ Send to on-air graphics ]  (2 on air)                                 [ Turn the look off ]
```

The panel offers the typeface, the heading weight and the four contract colours; a brand's other
shape tokens travel only when a saved brand is chosen, and the panel says so. The reach is
counted **per property** over the pool with `cssPaintsWith` (a graphic that paints the accent but
not the typeface counts once each), opted-out graphics are listed as exceptions, and the
denominator is the pool. On is the activation; Off removes it and sends nothing until the next
Take or Update of each graphic; "Clear exceptions" removes every `keepStyle`. Changing the look
changes PREVIEW at once and reaches air on the next Take of each graphic, or on **"Send to on-air
graphics"**, which is one `update` per cue on air carrying the appearance and **no prepared field
values** (empty `data`), so a half-typed name never airs with a look; the press captures the
on-air instances at the press, rechecks each after every wait, and reports partial completion
("2 of 3 updated; Quiz board went off air"). A tone change (dark panel to light) is allowed but
warned, with the palette-freedom result as the reason. An already-open audience join page
receives the activated look at the next Publish, as it receives the captured look today; an
imported face does not reach the join page (its family name is published, the bytes are not), and
the panel says "Join page: bundled typefaces only".

**Hosted control page and phone:** phase 1 applies the records (its Take and Update carry the
appearance from the published cue's box, PROGRAM shows it) and does not edit them; the Adjust
block itself is drawn there in phase 3, in the one scrolling column, with the arrows as 40 px
buttons. **The exported controller** carries cue-level records in its emitted cues and bakes
graphic-level results into its overlays from phase 1b.

### The quiz, and what to tell the operator

Size handles "a little smaller". When the floor line is red the remedy is conditional, in this
order: resize modestly where the line stays amber or green; use the family's existing lower third
when the content it has to show fits a strap; otherwise a compact companion graphic made for the
purpose, which the agent door produces from a brief in minutes while the cue keeps its values. A
graphic that declares a compact layout as a style choice is design work in `templates/` and the
skill contract, outside this spec.

### Capability matrix

By graphic source, on NoaCG's own output (the `/output` renderer, PROGRAM on both pages):

| Source | Place and size | Type (family, weight) | Colour | Notes |
|---|---|---|---|---|
| Catalog design | yes; a full-width band takes vertical nudge only | yes; family always, weight where the design paints with `--display-weight` (most do; `cssPaintsWith` decides) | accent reaches about 95 % fully: 13 designs keep a literal accent somewhere (palette-freedom) and 11 declare an accent nothing paints (`cssVars.ts:162-166`) | tone change warned |
| Imported SVG (svg01) | yes | no (artwork's own faces) | no (artwork's fills) | says "as designed" |
| Imported raster (imp01) | yes | family yes, per line | text colour no (baked literal) | |
| Agent-made, contract painted | yes | yes | yes | `cssPaintsWith` decides per variable |
| Agent-made, contract unpainted | yes | no | no | validator finding, see below |
| Looping or endless-motion design (tickers) | nudge and size about the painted extent; no presets | as above | as above | no information box |
| Foreign OGraf package | frame only, once E3 hosts it in the workflow; no measurement, so nudge and size only | no | no | no style hook in the standard |
| Server clip or still | no (`imageFit` exists) | n/a | n/a | out of scope |

By playback and export target. Exports resolve the graphic's template exactly as they do today
(the current library template through `templateForSavedGraphic`, the copy as fallback) and
state that revision in the export receipt; the parity promise is "the same applied appearance
over the same template revision", not "the same bytes as the hosted output".

| Target | Cue-level | Graphic-level and look | How | Phase |
|---|---|---|---|---|
| `/output`, PROGRAM, hosted page | live | live | the `appearance` field; bundled fonts from `/fonts`, imported from the payload's assets | 1 (style 2) |
| Exported production controller + overlays (local relay) | via emitted cues and relay rows | baked into each overlay | the transform host the sweep decides, `:root` values and face declarations for style; the relay's appearance replaces the bake (rule 3); every face any cue's record names ships in `fonts/` | 1b |
| html-overlay | not carried (no rundown); listed in the dialog | baked | `bakeAppearance` | 1b |
| CasparCG | not carried; listed | baked | `bakeAppearance`; the target is one self-contained file, so the named faces' bytes are inlined, not referenced | 1b |
| SPX production export | not carried (rows write declared keys only); listed | baked | `bakeAppearance`; parity checked against the SPX renderer path | 1b |
| OGraf package, LiveOS | not carried (no rundown); listed | baked onto NoaCG's canvas element and `:root` | `bakeAppearance`; parity checked in the OGraf host | 1b |
| A generic OGraf host that only sends data | nothing per cue | what was baked | | 1b |
| `.noacgpack.json` | not carried | not carried | the install dialog says so | never |

`applyLookToTemplate` is **not** the bake: it swaps font blocks by a regex that also matches an
imported design's alias faces and it writes logos. `bakeAppearance` is a narrower function over
the same resolved appearance, shared by every target, that **reuses** the existing helpers
(`setCssVariable`, `ensureFontFace`, `ensureNumericFontFace`, `numericFontStack`) rather than
restating their policy, preserves logo markup and an imported design's alias faces, and is the
same appearance the runtime applies as variables, which is how the two paths stay in step.

### Alternatives rejected

| Design | Why not |
|---|---|
| Edit the production's template copies in place ("apply to all" as a destructive patch) | Irreversible without provenance machinery that does not exist (`STARTER_COLLECTIONS_PLAN.md` §86-96), cannot differ per cue, and diverges the copy from the library on every Publish refresh. Owner decision 2 |
| A reserved key inside `update.data` (this spec's first draft) | Reaches templates, foreign packages, SPX rows, the data API and the staging buffer; must be stripped at every boundary |
| A new `ControlMessage` kind for style | Needs a migration of the allow-list and a second command road through every receiver; gives nothing the field does not |
| Hidden declared fields in every template | Portable to SPX and OGraf, but it moves a production concern into graphic code and the publish gate, against §6f |
| `--scale` as the size control | Two meanings of Size across sources; SVG fit does not follow it; frame-anchored designs do not shrink |
| Cue-only editing as the default scope with promotion as the only way to a graphic default | Safer against a persistent mode switch, but every 2026-10-23 case was for the show, and the mistake it invites is moving one cue while the next cue of the same graphic comes up in the old place. The chosen design has no mode: the graphic is the scope and a cue exception is an explicit, named toggle |
| Declaring every bundled face in every output document | Zero plumbing for a family swap, but READY's warm pass loads every declared face, so it would fetch seventeen fonts per graphic on every warm. The appearance names its faces and the document declares exactly those |
| Re-zoning contract graphics by text patch (the old Style panel's `setZone`) | Edits the design, not the cue; not per cue; fails on agent HTML without a `*-box` class. Possible later as "Re-anchor (edits the design)" |
| A free panel of style controls per graphic (a second editor) | Standing non-goal |

### What comparable products do

Read on 2026-10-24 from vendor documentation (named notes in the private folder). Placement and
scale live outside the template everywhere: CasparCG's `MIXER FILL` and `ANCHOR` per layer with a
tween and `MIXER CLEAR`, OBS's scene-item transform with arrow-key nudging and Reset, vMix's
input Position (pan, zoom, crop) applied live. Content and style live inside the template and are
exposed by the designer's choice (SPX data fields, including a `color` type and `prvar` project
variables shared across templates; OGraf schema fields). Update sends data and never replays the
entrance; the OGraf Server API makes that explicit with `skipAnimation` and leaves placement to
an opaque `renderTarget`. Theme scope is per project or composition through a shared variable,
never a cross-template "make everything bolder". The design above follows that split exactly:
frame transform outside, contract variables inside, explicit Update, one shared look.

## Proposed data and rendering changes (design level)

| Module | Change |
|---|---|
| `src/model/shows.ts`, `src/model/packets.ts`, `src/model/cueClipboard.ts`, `src/model/teamShowMerge.ts` | `AdjustRecord` type, `adjust?` on `ShowCue` and `SavedGraphic`, `lookApplied?`; `readAdjust` (newer `v` read-only, unknown members dropped) at every door; mutators `setCueAdjust`, `setGraphicAdjust`, `promoteCueAdjust` (one write), `clearStyleExceptions`; `refreshGraphicCopies`, re-add and `pasteCopies` keep or copy the records; duplicate copies them; the merge never deletes a cue record; `lookApplied` in `FIELD_LABEL` |
| `src/control/cueAdjust.ts` (new, pure) | `effectiveAdjust(show, cue)` fold with defaults after; `measurementId`; `resolveAppearance(effective, measurement, res)`; `presetOffset`, `pivotFor` (hugging and full-width); `floorEstimate(minText, scale, category)`; `styleReach(template, vars)` over `cssPaintsWith`; `fontDeclarations(appearance, production)` with collision refusal; `appearanceEquals` for the unsent comparison |
| `src/control/playoutSession.ts`, `cueDraft.ts`, `graphicVerbs.ts`, `cueItems.ts`, `airState.ts` | the draft part carries the record and the session-owned measurements with their identities; Take and Update fold, resolve and send `appearance`; `aired` keeps the last appearance per graphic; the ± road sends none; "Send to on-air graphics" as a verb with press-time capture and rechecks; the measurement and font lifecycles behind the session's `io` |
| `src/control/controlModel.ts`, `hostedControl.ts` | `update.appearance?` on the message type; `OutputCue.adjust` and `box`, the pool defaults and the activated look in the payload (additive) |
| `src/preview/settleGraphic.ts`, `previewProtocol.ts`, `composeDocument.ts` | the extended, identified `measure` reply (the clipped information box and painted extent, smallest text, settled-pose qualification); the live-control appearance handler (variables on `documentElement`, the named faces' declarations, numeric stack, load with the latest-request guard, refit, remeasure) |
| `src/output/stage.ts`, `main.ts`, `outputRecovery.ts` | apply the frame transform and `data-appearance`; last appearance in the report; re-apply on boot, replay, swap, rebuild |
| `src/components/home/PlayoutMonitors.tsx` | PREVIEW in stage coordinates; the guides |
| `src/control/hostedReceiver.ts`, `localReceiver.ts`, `cueStaging.ts` | apply on dispatch and on boot restoration; report the appearance; stage the record per cue (1b for the receivers) |
| `src/components/home/CueAdjust.tsx` (new, props only), `CueEditor.tsx`, `ProductionSetupMenu.tsx` + `ProductionLook.tsx`, `useRundownHistory.ts` | the block in the settings strip, the Look panel, undo entries; measurement and font state arrive through the session, never component state |
| `src/control/productionControllerHtml.ts`, `src/export/common.ts` (`bakeAppearance`), `showExport.ts`, `targets/*` | the dialog's disclosure (1); emitted records and boxes, the bake sharing the look helpers, font closure over every record, inlined bytes for single-file targets (1b) |
| `src/audience/audienceBrand.ts` | read the activated look when activated, the captured look otherwise |

Behaviour that decides a value is a Node-tested module under `src/control/` or `src/model/`
with its browser, timers, measurement and font loading behind the session's `io`; components
select and commit (`docs/ARCHITECTURE.md` §5, the compiled playout rule). Props-only components
are necessary, not sufficient: measurement identity, async font completion, the applied-state
comparison and the bulk send's press-time capture belong to the session.

**How authoring tools and agents learn what is adjustable.** Nothing new is declared: the
adjustable surface is derived from the `:root` contract a graphic already carries, detected by
`cssPaintsWith`. The skill contract gains one sentence (a graphic that wants its typeface and
colours adjustable paints with the contract variables and ships a real `@font-face`),
`noacg inspect` prints an "Adjustable" line (place and size always; type and each colour when
painted), and `noacg validate` adds two non-blocking findings: `style-contract-unpainted` and
`font-without-face`.

## Typography reliability: prevention, separate from editorial change

Defects, not features; none depends on the adjust record; each lands on its own through the
ordinary merge flow. The Google subset fix is landed (owner decision 3, pull request 1689) and is
not counted here.

1. Bundled families gain the latin-ext woff2 as a second `@font-face` with `unicode-range`, so š
   and ž set in the chosen face; `addReferencedFonts` already copies anything in `template.css`.
   **Phase 2 depends on this while AC-5 keeps Š and Ž in its string.**
2. The weight choice is clamped to the face's real weights (`fontWeights()`), or `font-synthesis:
   none` is emitted, for bundled and imported faces alike (`customFontFaceCss` declares no weight;
   an imported face offers Regular until its real weights are known). **Phase 2 depends on this.**
3. `validateTemplate` reports a non-generic `font-family` with no `@font-face` and extends
   `missing-asset` to `fonts/`; the skill's worked example gets its face.
4. `FONT_BLOCK_RE` in `applyLookToTemplate` skips an imported design's alias faces (inferred
   defect; a Node test over an svg01 template settles it).
5. READY's "Using a fallback font" stays amber and non-blocking; a per-production setting to make
   it a Take blocker is a possible follow-up, not recommended by default.

## Phased delivery

| Phase | Delivers | Depends on | Why in this order |
|---|---|---|---|
| **0. Font prevention** (independent PRs) | items 1 to 4 above | nothing | verified defects |
| **1. Place and size** (owner decision 1; row 32b) | `AdjustRecord` (place, x, y, scale, anchor) at pool-graphic and cue scope with the mutation doors, promotion and lifecycle rules; the identified measurement and PREVIEW in stage coordinates; the Adjust block's Place and Size rows with guides, stale state and the floor line; the `appearance` field and the four rules; the unsent comparison; undo entries; the `/output` stage with `data-appearance` and recovery; PROGRAM on both pages; hosted staging apply and the hosted page applying; the export dialog's disclosure that adjustments are not carried | rows 14, 22, 23, 25 of the production-page run, already passed | the essential priority on the surfaces NoaCG owns outright, so it proves the record, the field and recovery with the least surface. No overlay or bake, no ghost view, no tween |
| **1b. Documents that are the page** (proposed row 32c, not admitted) | first the catalog sweep over `100vw`, `100vh`, `vw` and `vh` units that decides the transform's host in a document with no wrapper; then the hosted and local receivers' apply and boot restoration, the exported controller's emitted records and relay, `bakeAppearance` for the html-overlay, CasparCG (inlined bytes), SPX and OGraf targets with rendered parity checks per target | 1 | the one undecided mechanism, settled by measurement before anything ships it |
| **2. Type and colour per graphic and cue** | `vars`, `font`, `keepStyle`; the Type and Colour rows with "As designed"; `FontDeclaration` and the asset road; the composed document's handler with the latest-request guard, refit and remeasure; `bakeAppearance` for style; skill and `inspect`/`validate` lines; the dimmed PROGRAM behind PREVIEW if it costs nothing | 1, phase 0 items 1 and 2 | typography is the second priority and reuses the brand vocabulary unchanged |
| **3. Production look at playout** | Setup ▾ Look with On/Off, per-property reach, exceptions and "Clear exceptions", "Send to on-air graphics" with press-time capture, the audience page's activated-or-captured rule and its bundled-only limitation; the Adjust block on the hosted page and phone | 2 | the widest scope of the fold already built |
| Later, separate specs | compact layouts declared by graphics; "Re-anchor" for contract graphics; tweened moves; a Take blocker for fallback fonts; imported faces on the join page | | each is design or policy, not plumbing |

Phases 1b, 2 and 3 **await their own admission**; agreement with this design does not admit them.
Foreign OGraf graphics take the frame adjust by construction, but every end-to-end claim about
them is gated behind E3, which puts them in the rundown and the output workflow.

## Placement in the production-page run

Row 32b (L2.1, phase 1) is admitted after L1 and before E1.1 (pull request 1699) with its gate
narrowed on 2026-10-25 to this revision's phase 1: L2 AC-1 to AC-4, AC-8, AC-9's renderer half
(the `/output` renderer and PROGRAM on both pages) and AC-10's unchanged-production part, with the
export dialog's disclosure and no overlay or bake. The receipt is
`../production-page-refactor/evidence/owner-decisions-2026-10-25-l2-gate.md`.

Proposed on 2026-10-25 with the owner's agreement, admitted separately: **row 32c (L2.1b, phase
1b)** after 32b, touching receivers and export targets only; **row 32d (L2.2, phase 2)** after
32c and before E1.1, since it adds no wire member (the appearance field exists from phase 1) and
touches the composed document, the fonts, the editor's rows and the bake; **row 38a (L2.3, phase
3)** after E2.2 and before E3.1, because the bulk send and the hosted page's controls sit on the
dispatch and control seams E2 settles, its foreign-frame acceptance after E3.2b. The file overlaps are real and
sequential ownership is what makes them safe: L1 owns the cue editor, the verbs and the exported
controller; E1 owns the show record's typed envelope, the wire and recovery; E2 owns controls and
dispatch; E3 owns `foreignOgraf.ts`, the stage's foreign frames and recovery; E7 owns cue
metadata. Each row's receipt records its exact touched-file fence against the main of its day.
**Rollback:** an `adjust` record is ignored on read and the `appearance` field is ignored by a
receiver that does not know it; no migration, no new message kind.

## Risks, unresolved questions, experiments

- **Measurement.** The clipped information box, the painted extent and the settled-pose
  qualification are new; the receipt's scratch measurement worked on nine documents with no
  clipping and is only the sketch. A sweep over the catalog (masks, staggered reveals, tickers,
  loops, bleeding decoration, 9:16 and 720p designs) before phase 1's box reply is trusted.
- **Hidden-frame throttling.** A frame translated fully off-screen may be throttled by Chromium
  (`stage.ts:659-667` warns). Clamp the transform so part of the frame stays on stage.
- **The transform's host in documents that are the page.** Undecided; phase 1b's sweep decides
  between `<body>` and one NoaCG wrapper, against the `vw`/`vh` designs.
- **Runtime font change and fit.** Verified that a family swap reflows a staged board; the fit
  hooks must run after `document.fonts.load()`, and a load that completes after a newer selection
  must not overwrite it. Phase 2's blank-page spec covers it.
- **Tone changes.** A light look on dark designs breaks a third of the catalog. The warning is the
  design; whether to refuse outright is an owner taste question for phase 3.
- **Two cues on one layer in quick succession.** The frame is per graphic, so a Take of cue B with
  a different appearance moves the frame as B's entrance starts: a cut, by design.
- **Still untested:** text crispness of a scaled iframe on CasparCG 2.3's Chromium 71; whether
  Chromium's per-node platform-font report names an imported family reliably under Playwright;
  the Supabase row size of an `update` carrying an appearance; the svg01 `FONT_BLOCK_RE`
  collision; glyph coverage of imported faces; the 240 px band.

## Acceptance

Each criterion names its cheapest useful layer (`root/put-durable-check-cheapest-layer-proves`).
Geometry is asserted as **final composed geometry in production px**: the graphic's box inside
its document, composed with the frame's transform and the monitor's or stage's fit, read after a
measurement-complete signal, never after a sleep. px-precision claims live in blank-page specs at
1:1; journeys through the monitors assert the applied appearance the stage wrote
(`data-appearance`) and the direction of movement, since a monitor at 1600×900 draws the stage at
about 0.3.

### AC-1: A lower third moves to the other side, then nudges precisely
On the production page, with a bottom-left lower third cue on PREVIEW: choose the bottom-right
preset; the strap's composed right edge sits at the right safe inset; press ← three times and
Shift+←: the composed box moves 13 px left; typed x and y agree. Type a longer name: the
measurement is re-identified and completes, and the composed right edge is still at the inset
with the anchor unchanged. Take: PROGRAM's `data-appearance` equals PREVIEW's and its composed box
matches. Scenario: Node `scripts/cue-adjust.test.mjs` for `presetOffset`, `pivotFor`, anchor
stability under a changed box and the nudge arithmetic; a blank-page browser spec at 1:1 over
emitted templates for the px claims; a journey in `e2e/production-controls.spec.ts` at 1600×900
for the flow, reading `data-appearance` and direction.

### AC-2: About five percent smaller, with no pivot drift, in one coordinate system
Size − once on lt01 (bottom-left), on a centred board, on a 720p graphic and on a portrait graphic
inside a 1080p production: the strap keeps its left and bottom edges within 1 px and shrinks 5 %;
the board keeps its centre within 1 px; the 720p and portrait graphics' pivots are their own
measured boxes at the stage origin, and PREVIEW and PROGRAM compose them to the same production
px. lt63 (full width) measures an information box inset from both edges and a painted extent
touching both, is classified full-width from the painted extent, offers no Size and no
horizontal preset, and a vertical nudge moves it. Scenario: a blank-page browser spec over
emitted templates driving the real apply path (the stage's frame and the PREVIEW monitor, not a
hand-written transform), asserting composed boxes after the measurement-complete signal and the
two rectangles for lt63; a Node test of `resolveAppearance` for each of the nine anchors and of
the full-width classification and pivot.

### AC-3: The oversized quiz is assessed per board, and the remedy is named
Two separate proofs. Arithmetic: `floorEstimate` over the receipt's boxes and the category floors
from `designRules.ts` gives amber at 18 px for qz01 against the 20 px secondary floor, red at
12 px for the agent-made votes board with "use a lower-third graphic", and no warning for qz05.
Measurement: the live `measure` reply for qz01 and qz05 reports the smallest text within 1 px of
the receipt's numbers after the settled-pose qualification. Scenario: a Node test for the
arithmetic; a blank-page spec for the measurement; the journey reads the line on qz01 and qz05.

### AC-4: Two cues of one graphic keep independent placements, property by property
Cue 1 at the graphic default (bottom-left), cue 2 set "Only this cue" with `place` bottom-right
and nothing else; changing the graphic default's `x` by 10 px moves cue 1 and also moves cue 2
(it inherits `x`); changing the default's `place` leaves cue 2; "Stop this cue's exception"
returns cue 2 to the default; promotion from cue 1 writes the default and clears cue 1's record
in one write. Publish and re-add by name keep both records; copy and paste copies the cue
record; a duplicate carries all records; a newer-`v` record is refused at every door (set,
promote, reset, clear). Both merge probes are reproduced: a concurrent pool-layer edit and a
concurrent cue-text edit around a promotion each end with the exception kept and counted, never
deleted. Scenario: Node tests of `effectiveAdjust` (partial inheritance, promotion, reset), of
`refreshGraphicCopies`, the re-add path, `pasteCopies`, `duplicateShowChecked` and
`teamShowMerge` with the two probes, and of the door guards; the journey for the visible half.

### AC-5: A font family or weight is corrected and the chosen face supplies every glyph
On a lower third with "Åsa Öberg-Ærø Šimon Žáková" and a decomposed "Å", set Type to
Archivo Bold: for a node that contains only that string, Chromium's per-node platform-font report
(`CSS.getPlatformFontsForNode` through Playwright's CDP session) names exactly one family,
Archivo, with a glyph count equal to the string's glyphs, and the computed weight is 700; the
same string drawn with the fallback stack alone renders differently (a canvas comparison), so
fallback use is detectable; the fit re-runs; a selection made while a slower face is still
loading wins over that load; an imported face offers Regular only until its weights are known;
Bebas Neue offers Regular only. Scenario: a Node test of the woff2 glyph-map coverage for the
string (the receipt's parser kept as a script) and of the weight list following `fontWeights()`;
a blank-page browser spec for the rendered-run checks, over a bundled and an imported face.
Depends on phase 0 items 1 and 2.

### AC-6: A shared font or colour change reaches queued graphics and respects exceptions
A look of Archivo and accent `#ff7a00`, turned on, over a pool of a lower third, a scoreboard with
team colours set, an alert graphic and an imported SVG: PREVIEW of each cue shows the new accent
and face where painted, team and severity colours unchanged, the SVG unchanged with the "as
designed" line; the Look panel counts type and accent separately over the pool of four; one lower
third set "As designed" stays. "Send to on-air graphics" with a half-typed name in the editor
sends appearance-only updates (empty `data`), reports "2 of 3" when one graphic goes off air
during the press, and the half-typed name never airs. An export of the same production renders
the same appearance over the same template revision and ships every face a record names.
Scenario: Node tests of the fold, `styleReach` and `fontDeclarations` over emitted templates and
of the bulk send's capture and recheck; the journey over a fixture pool; a rendered export
comparison in a blank-page spec (phase 1b and 2).

### AC-7: A prepared rundown is reused with another programme's style
Duplicate a production, turn on another brand in Setup ▾ Look: every cue previews the new style,
cue exceptions survive the duplicate, the original production is unchanged, a production with an
old captured `look` and no activation shows no change on its graphics, and its join page still
carries the captured look. Scenario: Node tests of the duplicate's record copy, of activation and
of `audienceBrand`'s activated-or-captured rule; the journey.

### AC-8: Changes are prepared without touching air, then applied without a replay
With cue A on air: adjust its place and size (on-air target): PROGRAM's `data-appearance` and
`data-plays` do not change; the fate line reads one waiting change; ✎ Update changes
`data-appearance` and `data-plays` is still unchanged. Prepare cue B of the same graphic: air
unchanged until B is taken. Change the graphic default while A airs: air unchanged, the fate line
counts it. Reset the graphic and Update: with nothing inherited the identity is sent and PROGRAM
returns to the authored place; with a production look still on, the inherited result is sent. A
± press in between retains the applied appearance. A never-adjusted production sends no field.
Scenario: the journey reading `data-appearance` and `data-plays`; Node tests of rules 1 to 3 and
the "no record, no field" rule over `graphicVerbs`.

### AC-9: Adjustments survive restart and reconnect on every surface
Deterministic adapter and boot tests, per surface: the `/output` renderer's boot from a report
carrying an appearance; PROGRAM's rebuild on both pages; the relay receiver's boot restoration
(phase 1b); the hosted receiver's boot from a dated and from an undated report (phase 1b); each
restores the last applied appearance and not a newer prepared one. Backend-dependent reconnect
checks, separately: publish, take an adjusted cue, reload the `/output` renderer and the hosted
page's PROGRAM, both come back with the appearance and no new Take. Exports (phase 1b): the
html-overlay and CasparCG overlays, rendered in a blank page, show the graphic-level box once (no
double scaling); the exported controller's relay rows carry the cue-level appearance; SPX and
OGraf packages carry the graphic-level bake with their own parity checks; the dialog lists what a
target does not carry. Scenario: Node tests over `outputRecovery` and the receivers' restore
functions; `e2e/configured/hosted-control-recovery.spec.ts` extended for the reconnects;
`e2e/local-relay.spec.ts`'s reload cases extended (1b); a blank-page spec rendering the exported
overlays (1b).

### AC-10: Unsupported graphics say so in one line, and nothing else changes for them
An imported SVG shows Place and Size and "Type and colour: as designed (imported artwork)"; a
ticker shows nudge and size about its painted extent and no presets; a full-width band shows
vertical nudge only with "spans the frame"; a foreign OGraf package (after E3) shows nudge and
size and "not available for this package"; a production with no adjust records sends no
`appearance`, the stage sets no transform, the render counts of
`e2e/playout-air-contract.spec.ts` hold and the generated controls are unchanged by behaviour
(the ⚡ block, the fields, the verbs), not by whole-panel byte equality; a record from a newer
build is kept and refused for editing. Scenario: Node tests of `styleReach`, of the sender's "no
record, no field" rule and of the door guards; the existing air-contract spec; the foreign case
under E3's configured output tests.

### AC-11: The 2026-10-23 adjustments run from one screen
From a fresh page: move the lower third to the right and nudge it, shrink the score banner 5 %,
judge the quiz against the floor line and choose the remedy, set the quiz cue's font bold (phase
2), turn a production look on and send it to air (phase 3), make a wrong-scope change on one cue
and recover it with "Stop this cue's exception" and with Ctrl+Z, each prepared on PREVIEW and
taken or updated. The task's outcome is defined in the kit and the recording is kept; no timing
gate. A task of a trial kit (kits never gate) and the dress rehearsal's case in S. Scenario:
`evidence/trial-kit.md` and the S receipt.

## Owner decisions (2026-10-24, one question each, with the recommendation taken)

1. **The first delivery is place and size, per cue with a per-graphic default, on the
   production page; the hosted page applies the records but does not edit them.** Type and
   colour follow in their own row (phase 2), so the row that proves the record, the field and
   recovery carries no font plumbing. On 2026-10-25 the owner delegated the folding-in of two
   further second opinions ("implement the things that you see as good solutions"); the
   narrowing of phase 1 to the surfaces NoaCG owns outright, with documents that are the page
   moved to phase 1b, follows from that.
2. **Production-wide style is a reversible production setting, applied at render and on
   Update, never written into the production's template copies.** Reset deletes a record; a
   graphic that keeps its own look is an exception record; Publish's refresh of the copies from
   the library stays honest. Exports bake the same resolved appearance into the files they write,
   which is a copy leaving the product, not the production's copy.
3. **The Google-font subset defect is fixed now, as its own small change, outside this spec.**
   Landed as pull request 1689 on 2026-10-24. Whether it caused the reported incidents is
   inferred, not established.

## Open decisions for the owner

None open. The owner agreed the design as a whole on 2026-10-25, after the three decisions of
2026-10-24 and the three independent second opinions; the agreement authorizes the design and
its proposed placement (rows 32c, 32d and 38a), not implementation, which waits for the
coordinator to admit each row.

## Evidence

- `evidence/scale-experiment-2026-10-24.md`: the isolated placement and scale experiment over
  seven catalog templates and two agent-made boards, with its method, numbers and limitations.
  The scratch script is not checked in; the receipt describes how to reproduce it over
  `scripts/catalog-emit.mjs`. It measured the smallest visible text without role classification
  or clipping, one browser, no missing fonts, and an assumed 240 px band.
- Source-verified by this research and three independent reviews (2026-10-24 against
  `be0cea068`; 2026-10-25 against `8ebb429b4` and `bb7890068`): the per-graphic frames, the
  PREVIEW and PROGRAM mappings, the wire and its allow-list, the recovery paths and
  `receiverFollowFrom`, the show mutators and `pasteCopies`, the brand helpers and
  `cssPaintsWith`, the bundled fonts' glyph maps and weights, the Google subset defect, READY's
  warm-pass loading, the audience page's publish-time look. Two read-only **merge probes** by the
  2026-10-25 review found the promotion split cases recorded above; this spec did not re-run
  them.
- Inferred, not exercised: the operator-experience recommendations (default scope, reset
  labels, undo), the measurement qualification rule, the `FONT_BLOCK_RE` collision.
- Not run by anyone: browser journeys, export journeys, hardware checks, and the three untested
  items under Risks. Nothing in this spec has passed acceptance; implementation has not started.
