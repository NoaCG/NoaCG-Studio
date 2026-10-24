# Playout adjustments: move, size, retype and recolour graphics from the playout page

Status: **draft for the owner, 2026-10-24; the three open decisions (the first delivery's
scope, a reversible production look, the Google-font fix as its own change) were taken the same
day; revised the same day after an independent second opinion (`/so`) whose corrections are
folded in below. Agreement on the design as a whole is not yet given.** Research only: no product
change, no run row, no ledger edit. Where this document says "verified", the code or an isolated
experiment was read or run on main `ad3c7238b` (the second opinion re-read it on `be0cea068`);
"inferred" is a reading not yet exercised; "untested" is a claim nobody has checked. Private
competitor notes with URLs: `docs/private/competitors/PLAYOUT_ADJUSTMENTS_2026-10-24.md` (main
checkout only).

Parent, once admitted: [production-page](../production-page-refactor/spec.md) and its
[extension contract](../production-page-refactor/extensions.md). The proposed placement is a
proposal; `extensions.md` is not edited here.

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
- Automatic following of library edits, operator identity or locking (`docs/GOALS.md`).
- Rewriting the `imageFit` precedent for server still pictures.
- A compact-layout framework for quiz boards. If a graphic wants a strip form, that is a design.

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
  that graphic's own resolution at the stage origin, in layer order (`src/output/stage.ts:348-422`);
  a foreign OGraf package gets the same kind of frame (`src/output/foreignOgraf.ts`), though
  main's `PayloadStage` and output bootstrap do not yet pass the stage's `foreign` option, so
  foreign graphics in the production workflow are E3's work, not a fact today. PROGRAM on the
  production page and the hosted page is the same `createOutputStage` (`home/PayloadStage.tsx`).
  PREVIEW is a different thing: one iframe of the selected cue's graphic with its own fit
  transform (`home/PlayoutMonitors.tsx:188-241`). The exported production controller's monitors
  are per-graphic iframes with a scale transform (`control/productionControllerHtml.ts:454-479`).
  Exported overlays (html-overlay, CasparCG, SPX) have no wrapper: the template document is the
  page.
- **Geometry today is thin.** The box a document reports (`reportGraphicBox`,
  `src/preview/settleGraphic.ts:149`) is the bounding rectangle of the body's first `div`, used
  by `frameGraphic` to crop library cards. It is not the union of visible ink and it reports no
  text sizes. The live-control `measure` command exists as a transport; what it measures must be
  extended for this feature.
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
  `shows.ts:703-741`) and keeps other entry properties; re-adding
  a graphic of the same name constructs a replacement entry that keeps `layer` and `soundConfig`
  explicitly. "Package" is retired: the one grouping is the production; a `.noacgpack.json`
  installs into one; rundown folders do not travel to the published payload or exports.
- The wire is field data and machine events only: `update`, `play`, `stop`, `next`, `event`,
  `snap`, `hello` (`src/control/controlModel.ts:802-815`). The database checks each item's `t`
  against that list and its `graphic` name, and stores the message JSON as sent
  (`supabase/migrations/0071_command_sequence.sql:346`), so a new **kind** needs a migration and a
  new **field** on an existing kind does not. Take sends `[update(values), play, cue]`, ✎ Update
  sends `[update(full values)]`, and the shared runtime's `update()` writes ids it knows and
  ignores the rest without replaying anything (`templates/shared/base.ts:407-417`). The ± block's
  partial update is the precedent for a merged, never replayed, data write.
- Recovery differs per surface. The `/output` renderer keeps `mergedData`, every key it received
  in `update` or an event payload, reports it as its baseline and restores from it on boot, then
  replays the log tail (`src/output/main.ts:683-716`, `control/outputRecovery.ts`). The local
  relay receiver keeps a merged map and restores by calling the template's `update()` directly
  (`control/localReceiver.ts:59-67,132-153,244-252`). The hosted receiver baked into a published
  graphic harvests its report from the DOM text of declared fields (`hostedReceiver.ts:135-148`)
  and, when its report carries no event id, resumes from the log head (`receiverFollowFrom`,
  `src/control/outputRecovery.ts:170-176`, emitted as ES5 at 181 and called at
  `hostedReceiver.ts:298`), so anything outside field data is restored there only from log rows
  after its baseline. A foreign OGraf frame is handed the whole
  data object (`output/foreignOgraf.ts:159` through `ografCallFor`), so an undeclared key would
  reach a stranger's package.
- The draft is one record per selected cue, autosaved after 300 ms; selecting another cue flushes
  it (`control/cueDraft.ts`, `ProductionPage.tsx:1791-1801`). An edit to the on-air cue is saved
  but not sent; `unsentFields` (`cueDraft.ts:115`) compares the cue's **values** with what was
  aired, so a record outside `values` is not counted until that comparison is extended.
- The hosted page stages into a cue-prefixed buffer whose values override the published cue's
  (`control/cueStaging.ts`); the data API maps declared ids and titles and ignores the rest.
- Team productions merge per whole cue and per whole pool entry, not per property
  (`model/teamShowMerge.ts`); personal productions take the remote record on conflict and keep
  the local one as a conflicted copy (`backend/sync.ts`).

### Styling systems (verified)

- Every catalog design declares the `:root` contract (`--accent`, `--text-color`, `--text-dim`,
  `--panel-bg`, `--font-heading`, `--scale`, optional `--type-scale`) plus the shape tokens it
  reads (`src/model/themeTokens.ts`: thirteen, among them `--display-weight`, the heading weight,
  referenced by 319 files under `src/templates`, and `--font-label`; whether a given graphic
  paints with a token is measured per graphic by `cssPaintsWith`, never read off a count). A brand is `ProjectBrand` (palette,
  typeface, tokens, logo). `applyLookToTemplate` (`src/model/packets.ts:372-439`) is a pure
  `(template, brand) => template` that writes only variables the receiving design declares, but
  it also swaps the first marked `@font-face` block and can write a logo into an allow-listed
  slot, so it is not the same operation as a variable overlay.
- `Show.look` (a copy **captured automatically** from the first graphic added or by a kit) and
  `Show.brandId` (a reference) exist on the production (`shows.ts:353-369`); "Apply brand to all
  graphics" is a comment, not a feature, and the only multi-graphic apply is pack install. There
  is no production-level style that reaches air; a look changes air only by being baked into
  templates and republished. The production page has no palette, font or look control. The
  audience page reads `Show.look`, not `brandId` (`audience/audienceBrand.ts`).
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
  imported face (`customFontFaceCss`) declares no weight either, so its bold is synthesised too.
- **The Google Fonts import embeds the wrong subset.** `fetchGoogleFont` takes the first
  `url()` of the css2 response (`src/model/googleFonts.ts:127-130`); the live response (fetched
  2026-10-24 with a Chrome user agent, twice, by this research and by the second opinion) lists
  cyrillic-ext first for Montserrat and Roboto and latin-ext first for Bebas Neue, latin last.
  The embedded face therefore has no Latin glyphs (or no ASCII), carries no `unicode-range`, and
  shadows the family name, so every letter falls back to Arial on both the design machine and
  the playout machine. The fix is in flight as its own change (owner decision 3). Whether it is
  the cause of the 2026-10-23 incidents is **inferred, not established**: the affected graphics'
  font assets were not examined.
- Readiness: the output holds a frame hidden until `load`, releases it onto the fallback face
  after `FRAME_HOLD_CAP_MS` = 3 s with a debug line, and READY reports "Using a fallback font"
  as a degraded line that blocks nothing (`output/stage.ts:547-558`, `control/readiness.ts:287-296`,
  `takeBlockers.ts` has no font rule). Preview `play`/`settle` wait on `fonts.ready` capped at
  400 ms. Exported overlays and the OGraf real-time load wait on nothing; single-file exports
  inline the bytes and fail loudly on a missing file; folder exports copy `fonts/<file>` found
  in `template.css` and silently skip a file they cannot fetch (`export/common.ts:58`).
- An unresolved SVG family is a wizard warning, never a block, and falls back to whatever the
  playout machine has installed. The skill's worked example sets `--font-heading: "Inter"` with
  no `@font-face` (`cli/skill/noacg-graphic/references/contract.md:480`); the validator has no
  check for a family without a face.

## The recommended design

### One sentence

A cue carries an optional **adjust** record (place, size, style variables), inheriting a pool
graphic's default and an explicitly activated production look; the production page resolves it
against the box PREVIEW measured into one **applied appearance**, Take and Update carry that
appearance as a field on the `update` message every surface already handles, the output applies
place and size as a transform on the NoaCG-owned frame and style as `:root` variables on the
document root, every receiver restores the last applied appearance, and exports bake the same
resolved appearance into the files they write.

### Two mechanisms, chosen by what each can honestly do

| Need | Mechanism | Why this one |
|---|---|---|
| A little left/right/up/down, the other side, about 5% smaller | **Frame adjust**: `translate(dx, dy) scale(s)` about a pivot, on the per-graphic frame NoaCG owns | Works for every native source on NoaCG's output with no template support, applies on air without a replay, and is what comparable renderers do (CasparCG `MIXER FILL`, OBS and vMix transforms). It never recomposes; it says so. Foreign OGraf frames take it once E3 puts them in the workflow |
| Font family, weight, accent and the other contract colours, on one graphic or all | **Style adjust**: `:root` variable overrides in the brand vocabulary, applied at runtime on `documentElement`, baked at export | The contract already exists and every catalog design declares it; `cssPaintsWith` says which variables a design paints; exceptions (team colours, severities, logos) already live outside `:root` |

The authored `--scale` knob was considered as the size mechanism for contract graphics (it keeps
full-width bands full-width and respects the auto-fit cap). It is rejected for the operator
control because it would make "Size" mean two different things for two kinds of graphic, and the
SVG text fit does not follow it. It remains the right knob for a designer and may later back a
"Re-anchor" that edits the design.

### Geometry: the box, the pivot and what travels

- **Coordinate system.** Everything is in production-frame px (the stage's resolution,
  `max(pool resolutions, 1920×1080)`). A graphic's frame sits at the stage origin at the graphic's
  own resolution, unscaled, so a 720p graphic's box is used as measured; nothing converts.
- **The box** is the union of visible ink (text ranges, painted backgrounds, images), with the
  smallest rendered text size, measured in the graphic's document by an extended `measure`
  reply. Today's `reportGraphicBox` (first `div`) is not it. PREVIEW measures after every settle,
  so the box always reflects the current values; a document that answers nothing (a foreign
  package, a broken template) yields no box.
- **The record stores intent, not px of pivot:** a place preset (`Zone9`) or none, nudges in
  px, a scale factor, and an optional explicit anchor (`Zone9`). The anchor defaults to the zone
  the box's centre falls in, by thirds of the frame, which reproduces the catalog's own zone for
  a hugging design and gives a centred board its centre.
- **Resolution at send.** The page folds the record with the measured box into the **applied
  appearance**: `dx`, `dy`, `s`, the pivot `ox, oy` in px, and the style variables with their
  font declarations. A place preset resolves against the current box, so a strap placed right
  stays inside the right safe inset when a longer name is typed and PREVIEW remeasures before
  the Take; a nudge is absolute px. This resolved form is what travels and what recovery
  restores; receivers never measure. A left-aligned strap placed right keeps its left alignment
  and grows to the right; the summary says so, and a re-anchor that changes alignment is a design
  edit, not this feature.
- **No box available** (foreign frame, no answer): presets are disabled with "no measurement",
  nudges and size still work with the pivot at the frame centre, and the record keeps the last
  box it had for the hosted page, which applies but does not edit.

### Scope and precedence

Four scopes exist; the UI exposes three.

| Scope | Record | What it is for |
|---|---|---|
| Cue | `ShowCue.adjust` | This cue only: the second lower third on the right while the first stays left |
| Pool graphic | `SavedGraphic.adjust` (inside `Show.graphics`) | Every cue of this graphic in this production: the lower third moved for the show, the quiz shrunk |
| Production | an explicitly activated look (`Show.brandId` or `Show.look`, see below) | Typeface and colours for the whole rundown, graphics added later included |
| Library original | nothing | never written by an adjustment |

Rules, each one line:

- **Precedence per property, narrowest wins:** cue > pool graphic > production look > authored.
- **Inherited, not copied.** A record holds only the properties set at that scope; a missing
  property inherits. Identity defaults (0 px, scale 1, no variables) apply **after** the fold,
  never before, or inheritance would be masked.
- **Reset removes the record at the scope shown** and reveals the next scope. "Reset this cue"
  returns to the graphic's default; "Reset the graphic" to the production look and authored
  values; "Reset everything" clears all three.
- **Promotion is one saved operation.** "Apply to all <graphic> cues" writes the pool entry's
  record and clears the same properties from the editing cue's record in one show write, so no
  accidental exception is left behind; other cues' explicit exceptions stay and are counted.
- **`keepStyle` on a cue or pool entry excludes the production look's style only**; the entry's
  own and inherited graphic-level style still apply, and font assets follow whatever variable is
  in effect at that scope.
- **The production look is activated explicitly.** `Show.look` is captured automatically today,
  so applying it at render would restyle productions nobody adjusted. The Look panel writes an
  additive optional `Show.lookApplied: true` (or the activation lives on a new record; an
  implementation choice) and reads `brandId` first, `look` second, with the resolved values and
  font asset copied into the production at activation so a signed-out hosted page and an offline
  export never depend on a library lookup. Absent activation, the historical look applies
  nothing; the audience page follows the same resolution.
- **Position and size are offered at cue and pool graphic scope only.** A production-wide
  offset has no meaning across different graphics. Style is offered at all three.
- **Publish and re-add keep the records.** `refreshGraphicCopies` replaces the template and
  keeps other entry properties; re-adding by name must copy `adjust` as it copies `layer` and
  `soundConfig`. A record written by a newer build is kept unread and the UI refuses to edit it,
  the `profile` precedent.
- **Two operators:** team productions merge per whole cue and per whole pool entry, so two
  people changing different properties of the same graphic's default still conflict and the loss
  is reported as it is for values; personal productions keep the whole-record behaviour they
  have.

Concrete examples:

- Lower third moved for the show: Adjust, scope "all cues of Presenter strap", preset
  bottom-right, nudge 12 px left. Both existing cues and every later cue move. One of them is
  then set "this cue" to bottom-left: that cue keeps left when the graphic default changes again.
- Production look: Archivo, accent `#ff7a00`, activated in Setup ▾ Look. The score banner's team
  colours (fields) and the alert graphic's severity colours stay; the imported quiz shows "Type
  and colour: as designed (imported artwork)"; one lower third marked `keepStyle` stays amber.
  Reset on the production look returns every graphic that had no exception.

### The record

```ts
/** ADDITIVE OPTIONAL on ShowCue and SavedGraphic; own `v`, read through one reader that keeps a
 *  newer `v` unread (read-only) and drops unknown members of a known one. Absent = nothing set
 *  at this scope. Every member is optional; identity defaults apply after the fold. */
interface AdjustRecord {
  v: 1;
  /** Place preset, resolved against the measured box at send; absent = no preset. */
  place?: Zone9;
  /** Nudges in production-frame px, added after the preset. */
  x?: number; y?: number;
  /** Scale factor about the pivot. */
  scale?: number;
  /** The pivot's zone; absent = derived from the box. */
  anchor?: Zone9;
  /** Last measured box (production-frame px) and smallest text, for surfaces that cannot
   *  measure (the hosted page applies, never edits). Refreshed on every PREVIEW settle. */
  box?: { x: number; y: number; w: number; h: number; minText?: number };
  /** `:root` variables by name without dashes, the vocabulary ProjectBrand and TOKEN_VARS use. */
  vars?: Record<string, string>;
  /** The face `font-heading` names, so it can be declared and shipped. */
  font?: { fontId: string } | { custom: CustomFont };
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
```

### The wire: a field on `update`, carrying the whole applied appearance

Take and ✎ Update already send an `update` message. It gains one optional, versioned field,
`appearance?: AppliedAppearance`, beside `data`. Why a field and not the alternatives:

- **Not a new message kind:** that needs migration 0071's allow-list widened and a second command
  road through every receiver; a field passes the existing check (only `t` and `graphic` are
  validated) and is stored as sent.
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
2. **Take and a full ✎ Update carry the complete effective appearance**, including an explicit
   identity when every scope is reset, so deleting a record cannot leave an old transform on air.
3. **Applying an appearance replaces the previous one**; a baked graphic-level transform in an
   exported overlay and a cue-level appearance from the relay replace each other and never
   multiply.
4. **Recovery restores the last applied appearance, never newer preparation.**

What each surface must do (none of it is free; each is a named integration with its own test):

| Surface | Integration |
|---|---|
| Production page (`graphicVerbs.ts`, `cueItems.ts`, `cueDraft.ts`, the session's `draft` and `air` parts) | fold and resolve at send; the draft part carries the record; `unsentFields` compares the resolved appearance with what was aired, so the amber dot and the fate line count it |
| `/output` stage (`stage.ts`, `main.ts`, `outputRecovery.ts`) | apply the frame transform and the variables; keep the last appearance per graphic in the report beside `mergedData` and `state` (one more field of the report payload, or a reserved member of the report JSON); re-apply on boot, on log replay, on `swapIn` and on rebuild |
| PROGRAM on both pages (`PayloadStage`) | the same stage, fed the same rows; the hosted page resolves from the stored `box` because it does not edit |
| Hosted staging buffer | the buffer stores the record per cue beside the staged values and is cleared with them; a staged record does not override a published one until sent |
| Hosted receiver in a published graphic (`hostedReceiver.ts`) | apply on each row; report the last appearance with its harvest so an undated report no longer loses it |
| Local relay receiver (`localReceiver.ts`) | apply on dispatch **and** on boot restoration, which today calls `update()` directly |
| Exported controller (`productionControllerHtml.ts`) | emitted cues carry the record and the box; its Take resolves and sends the appearance on the relay |
| Composed document, live-control run (`composeDocument.ts`) | set variables on `documentElement`; declare the bundled faces so a family swap resolves; recompute `--font-numeric`; call the fit hooks after `document.fonts.load()`, and ignore a load that completes after a newer selection |
| Foreign OGraf frame | frame transform only; nothing reaches the package |
| Templates | nothing |

A change arriving on `update` for an on-air graphic applies at once with no replay and no
transition in phase 1 (a cut, as a Take is); a short tween is a later option.

### What the operator sees

The cue editor gains one disclosure in PREP, closed by default, beside Operator note and
Advanced. It edits the selected cue's record, with a scope switch.

```
PREP · EDITING PREVIEW CUE · Presenter strap (2)
 F0 · NAME        F1 · TITLE
 ▾ ADJUST · this cue                              [this cue | all Presenter strap cues]
   Place   ┌·┬·┬·┐   ◀ ▶ ▲ ▼   x [ −12 ] y [ 0 ] px         ← from graphic: bottom-right
           ├·┼·┼·┤
           └·┴●┴·┘
   Size    [ − ]  95 %  [ + ]                                 ← smallest text 22 px
   Type    [ Inter ▾ ]  [ Regular | Medium | Bold | Black ]
   Colour  Accent ■  Text ■  Panel ■
   Reset ▾ (this cue · the graphic's default · everything)
 OPERATOR NOTE   ▸ Advanced  Layer 1
```

- **Finding it:** the disclosure reads the current state in its summary line even when closed
  ("ADJUST · bottom-right, 95 %, Archivo" or "ADJUST · as designed"), so a moved graphic is never
  a mystery. The rundown row carries a small glyph when a cue or its graphic is adjusted.
- **Place:** a nine-point grid sets the preset (a translate resolved against the current box;
  text alignment does not change, and the summary says "placed right, left-aligned" for a
  left-aligned strap). Arrow buttons and keys nudge 1 px, Shift 10 px; the boxes take typed
  values. The pivot shows as the filled dot. With no measurement the grid is disabled and says so.
- **Size:** plus and minus in 5 % steps, Shift 1 %, typed percent, about the pivot. The line
  under it is the readability estimate: the measured smallest text times the scale against the
  category's floors, amber under the secondary floor and red under 16 px, with the remedy named
  when red ("use a lower-third graphic"). A graphic whose box touches both frame edges reads
  "spans the frame: sizing leaves an edge".
- **Type and Colour** are the style adjust at this scope: family from the bundled faces plus the
  production's imported faces, weight from the face's real weights only, and the contract
  colours the design actually paints (`cssPaintsWith`), so a dead control is never drawn. A
  graphic that paints none of them shows "Type and colour: as designed (imported artwork)".
- **Scope switch** at the top of the block: "this cue" or "all <graphic> cues". Saving under
  "all" is the one-operation promotion above; the summary names remaining exceptions ("2 cues
  keep their own place"). Changing the graphic default while one of its cues is on air changes
  that cue's next Take or Update, never air by itself; the fate line says a change waits.
- **Preview:** PREVIEW shows the selected cue with its applied appearance and the safe-area
  guides while the block is open. PROGRAM beside it, at the same scale, is the context for
  phase 1; a dimmed copy of PROGRAM behind PREVIEW is a phase 2 option.
- **Reaching air:** exactly as today. Take airs the prepared cue with its appearance. For the cue
  on air, the editor's "switch to on-air cue" plus ✎ Update applies place, size and style at
  once without an entrance replay. Preparing cue B of a graphic while cue A of the same graphic
  is on air changes nothing on air until B is taken. Selecting another cue flushes the draft to
  the record, as it does for values.
- **Reset** is a menu of the three scopes; each deletes one record, and the next Take or Update
  sends the identity, so what was on air is cleared explicitly, never by omission.

**Production look** lives in Setup ▾ → Look (a panel, so the monitors stay on screen):

```
LOOK · this production                                                  [ On | Off ]
 Brand   [ Autumn Quiz ▾ ]   or   Typeface [ Archivo ▾ ]  Accent ■  Text ■  Panel ■
 Type reaches 6 of 9 graphics · Accent reaches 7 of 9
   ▸ Score banner: team colours stay   ▸ Imported quiz: artwork, not adjustable
 Exceptions (1): Presenter strap keeps its own colours                   [Clear exceptions]
 [ Send to on-air graphics ]  (2 on air)                                 [ Reset look ]
```

The reach is counted **per property** over the pool with `cssPaintsWith` (a graphic that paints
the accent but not the typeface counts once each), opted-out graphics are listed as exceptions,
and the denominator is the pool. Turning the look on is the activation; changing it changes
PREVIEW at once and reaches air on the next Take of each graphic, or on "Send to on-air
graphics", which is one Update per cue on air, listed before the press. A tone change (dark
panel to light) is allowed but warned, with the palette-freedom result as the reason.

**Hosted control page and phone:** phase 1 applies the records (its Take and Update carry the
appearance, PROGRAM shows it) and does not edit them; the Adjust block itself is drawn there in
phase 3, in the one scrolling column, with the arrows as 40 px buttons. **The exported
controller** bakes graphic-level results into its overlays and carries cue-level records in its
emitted cues, as it carries values.

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
| Catalog design | yes | yes; family always, weight where the design paints with `--display-weight` (most do; `cssPaintsWith` decides) | accent reaches about 95 % fully: 13 designs keep a literal accent somewhere (palette-freedom) and 11 declare an accent nothing paints (`cssVars.ts:162-166`) | tone change warned |
| Imported SVG (svg01) | yes | no (artwork's own faces) | no (artwork's fills) | says "as designed" |
| Imported raster (imp01) | yes | family yes, per line | text colour no (baked literal) | |
| Agent-made, contract painted | yes | yes | yes | `cssPaintsWith` decides per variable |
| Agent-made, contract unpainted | yes | no | no | validator finding, see below |
| Foreign OGraf package | frame only, once E3 hosts it in the workflow | no | no | no style hook in the standard |
| Server clip or still | no (`imageFit` exists) | n/a | n/a | out of scope |

By playback and export target. Exports resolve the graphic's template exactly as they do today
(the current library template through `templateForSavedGraphic`, the copy as fallback) and
state that revision in the export receipt; the parity promise is "the same applied appearance
over the same template revision", not "the same bytes as the hosted output".

| Target | Cue-level | Graphic-level and look | How |
|---|---|---|---|
| `/output`, PROGRAM, hosted page | live | live | the `appearance` field; fonts from `/fonts` |
| Exported production controller + overlays (local relay) | via emitted cues and relay rows | baked into each overlay | one wrapper rule for the frame, `:root` values and face declarations for style; the relay's appearance replaces the bake (rule 3); every face any cue's record names ships in `fonts/` |
| html-overlay, CasparCG template folder | not carried (no rundown); listed in the export dialog | baked | as above, through one `bakeAppearance(template, applied)` that writes variables and faces and never touches logos or an imported design's alias faces |
| SPX production export | not carried (rows write declared keys only); listed | baked | the same bake |
| OGraf package, LiveOS | not carried (no rundown); listed | baked onto NoaCG's canvas element and `:root` | the same bake |
| A generic OGraf host that only sends data | nothing per cue | what was baked | |

`applyLookToTemplate` is **not** the bake: it swaps font blocks by a regex that also matches an
imported design's alias faces and it writes logos. The bake is a narrower function over the same
resolved appearance, shared by every target, and the runtime overlay is the same appearance
applied as variables, which is how the two paths stay in step.

### Alternatives rejected

| Design | Why not |
|---|---|
| Edit the production's template copies in place ("apply to all" as a destructive patch) | Irreversible without provenance machinery that does not exist (`STARTER_COLLECTIONS_PLAN.md` §86-96), cannot differ per cue, and diverges the copy from the library on every Publish refresh. Owner decision 2 |
| A reserved key inside `update.data` (this spec's first draft) | Reaches templates, foreign packages, SPX rows, the data API and the staging buffer; must be stripped at every boundary |
| A new `ControlMessage` kind for style | Needs a migration of the allow-list and a second command road through every receiver; gives nothing the field does not |
| Hidden declared fields in every template | Portable to SPX and OGraf, but it moves a production concern into graphic code and the publish gate, against §6f |
| `--scale` as the size control | Two meanings of Size across sources; SVG fit does not follow it; frame-anchored designs do not shrink |
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
| `src/model/shows.ts`, `src/model/packets.ts` | `AdjustRecord` type, `adjust?` on `ShowCue` and `SavedGraphic`, `lookApplied?`; `readAdjust` (newer `v` read-only, unknown members dropped); mutators `setCueAdjust`, `setGraphicAdjust`, `promoteCueAdjust` (one write); `refreshGraphicCopies` and re-add keep `adjust`; duplicate copies records |
| `src/control/cueAdjust.ts` (new, pure) | `effectiveAdjust(show, cue)` fold with defaults after; `resolveAppearance(effective, box, res)`; `presetOffset`, `pivotFor`; `floorEstimate(minText, scale, category)`; `styleReach(template, vars)` over `cssPaintsWith`; `appearanceEquals` for the unsent comparison |
| `src/control/playoutSession.ts`, `cueDraft.ts`, `graphicVerbs.ts`, `cueItems.ts`, `airState.ts` | the draft part carries the record; Take and Update fold, resolve and send `appearance`; `aired` keeps the last appearance per graphic; the ± road sends none |
| `src/control/controlModel.ts`, `hostedControl.ts` | `update.appearance?` on the message type; `OutputCue.adjust`, the pool defaults and the activated look in the payload (additive) |
| `src/preview/settleGraphic.ts`, `previewProtocol.ts`, `composeDocument.ts` | the extended box reply (ink union, smallest text); the live-control appearance handler (variables on `documentElement`, bundled face declarations, numeric stack, fit after `fonts.load()` with a stale-load guard) |
| `src/output/stage.ts`, `main.ts`, `outputRecovery.ts` | apply the frame transform; last appearance in the report; re-apply on boot, replay, swap, rebuild |
| `src/control/hostedReceiver.ts`, `localReceiver.ts`, `cueStaging.ts` | apply on dispatch and on boot restoration; report the appearance; stage the record per cue |
| `src/components/home/CueAdjust.tsx` (new, props only), `CueEditor.tsx`, `PlayoutMonitors.tsx`, `ProductionSetupMenu.tsx` + `ProductionLook.tsx` | the block, the guides, the Look panel; measurement arrives through the session, never through component state |
| `src/control/productionControllerHtml.ts`, `src/export/common.ts` (`bakeAppearance`), `showExport.ts`, `targets/*` | emitted records and boxes; the bake; font closure over every record; the dialog's list of what a target does not carry |
| `src/audience/audienceBrand.ts` | read the activated look through the same fold |

Behaviour that decides a value is a Node-tested module under `src/control/` or `src/model/`
with its browser, timers and font loading behind the session's `io`; components select and
commit (`docs/ARCHITECTURE.md` §5, the compiled playout rule). Props-only components are
necessary, not sufficient: measurement, async font completion and the applied-state comparison
belong to the session.

**How authoring tools and agents learn what is adjustable.** Nothing new is declared: the
adjustable surface is derived from the `:root` contract a graphic already carries, measured by
`cssPaintsWith`. The skill contract gains one sentence (a graphic that wants its typeface and
colours adjustable paints with the contract variables and ships a real `@font-face`),
`noacg inspect` prints an "Adjustable" line (place and size always; type and each colour when
painted), and `noacg validate` adds two non-blocking findings: `style-contract-unpainted` and
`font-without-face`.

## Typography reliability: prevention, separate from editorial change

Defects, not features; none depends on the adjust record; each lands on its own through the
ordinary merge flow. The Google subset fix is already its own change (owner decision 3) and is
not counted here.

1. Bundled families gain the latin-ext woff2 as a second `@font-face` with `unicode-range`, so š
   and ž set in the chosen face; `addReferencedFonts` already copies anything in `template.css`.
2. The weight choice is clamped to the face's real weights (`fontWeights()`), or `font-synthesis:
   none` is emitted, for bundled and imported faces alike (`customFontFaceCss` declares no weight).
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
| **1. Place and size** (owner decision 1) | `AdjustRecord` (place, x, y, scale, anchor, box) at cue and pool-graphic scope; the Adjust block's Place and Size rows with guides and the floor line; the `appearance` field and the four rules; measurement; the unsent comparison; the output stage, PROGRAM, hosted staging and both receivers' apply and restore; the hosted page applying; the exported controller and its overlays (emitted records, relay, bake); the html-overlay and CasparCG bake of graphic-level results; the export dialog's disclosure for SPX and OGraf | rows 14, 22, 23, 25 of the production-page run, already passed | the essential priority; the frame transform needs no template cooperation, so it proves the record, the field, recovery and the bake with the least surface. No ghost view, no tween |
| **1b. SPX and OGraf bake** (bounded row) | the same bake in the SPX and OGraf targets with rendered parity checks | 1 | parity for the two foreign-host exports, disclosed rather than silent until it lands |
| **2. Type and colour per graphic and cue** | `vars`, `font`, `keepStyle`; the Type and Colour rows; bundled faces declared in output documents; fit re-run with the stale-load guard; receivers; `bakeAppearance` for style; skill and `inspect`/`validate` lines; the dimmed PROGRAM behind PREVIEW | 1, phase 0 item 2 | typography is the second priority and reuses the brand vocabulary unchanged |
| **3. Production look at playout** | Setup ▾ Look with activation, per-property reach, exceptions, "Send to on-air graphics", audience page alignment; the Adjust block on the hosted page and phone | 2 | the widest scope of the fold already built |
| Later, separate specs | compact layouts declared by graphics; "Re-anchor" for contract graphics; tweened moves; a Take blocker for fallback fonts | | each is design or policy, not plumbing |

Foreign OGraf graphics take the frame adjust by construction, but every end-to-end claim about
them is gated behind E3, which puts them in the rundown and the output workflow.

## Proposed placement in the production-page run

A proposal for the owner and the coordinator; `extensions.md` and the run's ledger are not
edited. The run is sequential and between rows 29 and 32 at the time of writing; admission goes
through the coordinator, preserving the active worker's scope and the existing row identifiers.

- **Phase 0** is outside the run: ordinary fixes through `/queue-merge`.
- **Row "L2.1" (phase 1) with its own stable identifier after 32a (L1) and before 33 (E1.1).**
  The file overlaps are real and sequential ownership is what makes them safe: L1 owns the cue
  editor, the verbs and the exported controller; E1 owns the show record, the wire and recovery;
  E2 owns controls and dispatch; E3 owns `foreignOgraf.ts`, the stage and recovery; E7 owns cue
  metadata. L2.1 runs after L1 and E7.2b have landed and before E1.1 starts, and its receipt
  records the exact file list against the main of its day.
- **Row "L2.1b" (phase 1b)** anywhere after L2.1; it touches export targets only.
- **Rows "L2.2" and "L2.3" (phases 2 and 3)** after E2.2 and before E3.1 for the native surfaces;
  their foreign-frame acceptance (AC-10's foreign case) is taken after E3.2b.
- **E8.1a** adds the cross-feature case (an adjusted cue bound to a source, a pinned adjusted
  graphic); **E8.2's kit** and **S** take AC-11.
- **Rollback:** an `adjust` record is ignored on read and the `appearance` field is ignored by a
  receiver that does not know it; no migration, no new message kind.

## Risks, unresolved questions, experiments

- **Measurement.** The ink-union box and smallest text are new; the receipt's scratch measurement
  worked on nine documents and is the sketch. Settle timing, hidden holders and SVG transforms
  need a sweep over the catalog before phase 1's box reply is trusted.
- **Hidden-frame throttling.** A frame translated fully off-screen may be throttled by Chromium
  (`stage.ts:659-667` warns). Clamp the transform so part of the frame stays on stage.
- **Body transform inside exported overlays.** Verified on seven templates; `100vw` designs
  (`tickers/tk21.ts:59`, `transitions/premiumArchetypes.ts:122`) would mis-measure under it. The
  exporter can wrap the body's children in one NoaCG div instead; a sweep decides which.
- **Runtime font change and fit.** Verified that a family swap reflows a staged board; the fit
  hooks must run after `document.fonts.load()`, and a load that completes after a newer selection
  must not overwrite it. Phase 2's blank-page spec covers it.
- **Tone changes.** A light look on dark designs breaks a third of the catalog. The warning is the
  design; whether to refuse outright is an owner taste question for phase 3.
- **Two cues on one layer in quick succession.** The frame is per graphic, so a Take of cue B with
  a different appearance moves the frame as B's entrance starts: a cut, by design.
- **Still untested:** the Google-subset defect against the owner's own graphics; the svg01
  `FONT_BLOCK_RE` collision; glyph coverage of imported faces; the 240 px band.

## Acceptance

Each criterion names its cheapest useful layer (`root/put-durable-check-cheapest-layer-proves`).

### AC-1: A lower third moves to the other side, then nudges precisely
On the production page, with a bottom-left lower third cue on PREVIEW: choose the bottom-right
preset; the strap's **rendered** right edge sits at the right safe inset on PREVIEW; press ← three
times and Shift+←: the rendered box moves 13 px left; typed x and y agree. Type a longer name:
PREVIEW remeasures and the right edge stays at the inset. Take: PROGRAM's rendered box matches.
Scenario: Node `scripts/cue-adjust.test.mjs` for `presetOffset`, `pivotFor` and the nudge
arithmetic; a journey in `e2e/production-controls.spec.ts` at 1600×900 reading rendered boxes
through the monitors' documents, not transform strings.

### AC-2: About five percent smaller, with no pivot drift
Size − once on lt01 (bottom-left), on a centred board and on a 720p graphic in a 1080p
production: the strap keeps its left and bottom edges within 1 px and shrinks 5 %; the board
keeps its centre within 1 px; the 720p graphic's pivot is its own measured box. Scenario: a
blank-page browser spec over emitted templates driving the real apply path (the stage's frame,
not a hand-written transform), asserting measured boxes; a Node test of `resolveAppearance` for
each of the nine anchors.

### AC-3: The oversized quiz is assessed per board, and the remedy is named
Shrinking qz01 to fit a 240 px band turns the floor line amber at 18 px against the 20 px
secondary floor; the agent-made votes board turns it red at 12 px with "use a lower-third
graphic"; qz05 fits without shrinking and shows no warning. Scenario: a Node test of
`floorEstimate` over measured boxes and the category floors from `designRules.ts`; the journey
reads the line on two of the three.

### AC-4: Two cues of one graphic keep independent placements
Cue 1 at the graphic default (bottom-left), cue 2 set "this cue" bottom-right; changing the
graphic default to a 10 px nudge moves cue 1 and leaves cue 2; Reset on cue 2 returns it to the
default; promotion from cue 1 clears its own record in the same write. Publish and re-add by
name keep both records; a newer-`v` record is kept and refused for editing. Scenario: Node tests
of `effectiveAdjust` (partial inheritance, promotion, reset), of `refreshGraphicCopies` and the
re-add path, and of the team merge with two edits to the same entry; the journey for the visible
half.

### AC-5: A font family or weight is corrected and the chosen face supplies every glyph
On a lower third with "Åsa Öberg-Ærø Šimon Žáková" and a decomposed "Å", set Type to
Archivo Bold: the rendered face for every glyph is Archivo at 700 (read from the rendered font,
not from `document.fonts.check`, which can answer true while a fallback paints); the fit re-runs;
a selection made while a slower face is still loading wins over that load; Bebas Neue offers
Regular only. Scenario: a blank-page browser spec reading the rendered fonts per glyph
(Chromium's per-glyph font report through the devtools protocol, or a canvas comparison against
the face's own rendering) over a glyph-map check of the woff2; a Node test that the weight list
follows `fontWeights()`.

### AC-6: A shared font or colour change reaches queued graphics and respects exceptions
A look of Archivo and accent `#ff7a00`, activated, over a pool of a lower third, a scoreboard with
team colours set, an alert graphic and an imported SVG: PREVIEW of each cue shows the new accent
and face where painted, team and severity colours unchanged, the SVG unchanged with the "as
designed" line; the Look panel counts type and accent separately over the pool of four; one lower
third marked `keepStyle` stays. An export of the same production renders the same appearance
over the same template revision. Scenario: Node tests of the fold and `styleReach` over emitted
templates; the journey over a fixture pool; a rendered export comparison in a blank-page spec.

### AC-7: A prepared rundown is reused with another programme's style
Duplicate a production, activate another brand in Setup ▾ Look: every cue previews the new
style, cue exceptions survive the duplicate, the original production is unchanged, and a
production with an old captured `look` and no activation shows no change. Scenario: Node tests of
the duplicate's record copy and of activation; the journey.

### AC-8: Changes are prepared without touching air, then applied without a replay
With cue A on air: adjust its place and size (on-air target): PROGRAM's rendered box and
`data-plays` do not change; the fate line reads one waiting change; ✎ Update moves the box and
`data-plays` is still unchanged. Prepare cue B of the same graphic: air unchanged until B is
taken. Change the graphic default while A airs: air unchanged, the fate line counts it. Reset the
graphic and Update: the identity is sent and PROGRAM returns to the authored place. A ± press
in between retains the applied appearance. Scenario: the journey reading `data-plays` and the
rendered box on PROGRAM; Node tests of rules 1 to 3 over `graphicVerbs`.

### AC-9: Adjustments survive restart and reconnect on every surface, and the exports that carry them
Publish, take an adjusted cue, then separately: reload the `/output` renderer; reload PROGRAM on
the production page and on the hosted page; reboot an exported overlay on the local relay;
reboot a published graphic with the hosted receiver. Each comes back with the last applied
appearance and no new Take. Export the production: the html-overlay and CasparCG overlays,
rendered in a blank page, show the graphic-level box; the exported controller's relay rows carry
the cue-level appearance and its overlays apply it once (no double scaling); SPX and OGraf
packages carry the graphic-level bake once 1b lands and the dialog lists the cue-level exception
as not carried. Scenario: `e2e/configured/hosted-control-recovery.spec.ts` extended per surface;
`npm run test:local-relay` conformance for the relay receiver; a blank-page spec rendering the
exported overlays.

### AC-10: Unsupported graphics say so in one line, and nothing else changes for them
An imported SVG shows Place and Size and "Type and colour: as designed (imported artwork)"; a
foreign OGraf package (after E3) shows Place and Size and "not available for this package"; a
production with no adjust records sends no `appearance`, the stage sets no transform, the
render counts of `e2e/playout-air-contract.spec.ts` hold and the generated controls are
unchanged by behaviour (the ⚡ block, the fields, the verbs), not by whole-panel byte equality.
Scenario: Node tests of `styleReach` and of the sender's "no record, no field" rule; the
existing air-contract spec; the foreign case under E3's configured output tests.

### AC-11: The 2026-10-23 adjustments run from one screen
From a fresh page: move the lower third to the right and nudge it, shrink the score banner 5 %,
judge the quiz against the floor line and choose the remedy, set the quiz cue's font bold
(phase 2), find and apply Reset, each prepared on PREVIEW and taken or updated. The task's
outcome is defined in the kit and the recording is kept; no timing gate. A task of a trial kit
(kits never gate) and the dress rehearsal's case in S. Scenario: `evidence/trial-kit.md` and the
S receipt.

## Owner decisions (2026-10-24, one question each, with the recommendation taken)

1. **The first delivery is place and size, per cue with a per-graphic default, on the
   production page; the hosted page applies the records but does not edit them.** Type and
   colour follow in their own row (phase 2), so the row that proves the record, the field and the
   exports carries no font plumbing.
2. **Production-wide style is a reversible production setting, applied at render and on
   Update, never written into the production's template copies.** Reset deletes a record; a
   graphic that keeps its own look is an exception record; Publish's refresh of the copies from
   the library stays honest. Exports bake the same resolved appearance into the files they write,
   which is a copy leaving the product, not the production's copy.
3. **The Google-font subset defect is fixed now, as its own small change, outside this spec.**
   It is verified and contained; whether it caused the reported incidents is inferred, not
   established. It lands through the ordinary merge flow and phase 0 keeps only the remaining
   prevention items.

## Open decisions for the owner

None open. The three questions of 2026-10-24 are answered above. What waits is agreement on the
design as a whole and the coordinator's admission of the proposed rows.

## Evidence

- `evidence/scale-experiment-2026-10-24.md`: the isolated placement and scale experiment over
  seven catalog templates and two agent-made boards, with its method, numbers and limitations.
  The scratch script is not checked in; the receipt describes how to reproduce it over
  `scripts/catalog-emit.mjs`. It measured the smallest visible text without role classification,
  one browser, no missing fonts, and an assumed 240 px band.
- The second opinion of 2026-10-24 re-verified the frame, wire, recovery, scope, font and quiz
  findings against main `be0cea068` by source review, font binary inspection and live Google CSS
  fetches, and did not run browser or export journeys. Its corrections are folded into this text.
- Implementation receipts land under `evidence/` as the programme's procedure requires.
