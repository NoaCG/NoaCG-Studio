# Playout adjustments: move, size, retype and recolour graphics from the playout page

Status: **draft for the owner, 2026-10-24; the three open decisions (the first delivery's
scope, a reversible production look, the Google-font fix as its own change) were taken the same
day; agreement on the design as a whole is not yet given.** Research only: no product change, no run row, no ledger
edit. Reconciled against main `ad3c7238b`. Where this document says "verified", the code
or an isolated experiment was read or run on that revision; "inferred" is a reading not yet
exercised; "untested" is a claim nobody has checked. Private competitor notes with URLs:
`docs/private/competitors/PLAYOUT_ADJUSTMENTS_2026-10-24.md` (main checkout only).

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

The production page already has everything an adjustment needs around it: one NoaCG-owned frame
per graphic on the output and on both monitors, a prep/live model where nothing airs because it
was typed, a per-cue record, and a brand model whose vocabulary is exactly the one a retint
needs. What is missing is a record for the adjustment and three short code paths that honour it.

## Goal

An operator, on the playout page and under broadcast pressure, moves a graphic a little or to
the other side, makes it about five percent smaller or larger, corrects a font family, weight or
colour on one graphic, or applies one typeface and accent to every graphic already in the
rundown, all prepared on PREVIEW and reaching air through Take or Update, never by being typed.
The library original and other productions are untouched, every change can be reset to the
authored appearance, and a graphic that cannot take a change says so in one line.

## Non-goals

- A second editor. No per-element editing, no recomposition, no layout engine. A graphic that
  needs a different composition for a different place (the half-screen quiz as a lower third)
  needs a design, not an adjustment; see "The quiz, honestly".
- Changing what a graphic's code does. Adjustments live around the graphic (a frame transform)
  or in its declared style contract (`:root` variables); nothing rewrites markup or scripts.
- Rotation, crop, opacity, colour correction filters. Comparable renderers offer them; no
  production has asked.
- A theme vocabulary beyond the brand model that exists (`ProjectBrand`: palette, typeface, shape
  tokens, logo). No new token names.
- Automatic following of library edits, operator identity or locking (`docs/GOALS.md`).
- Rewriting the `imageFit` precedent for server still pictures.

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
- **The output stage holds one sandboxed iframe per pool graphic**, absolutely positioned at the
  production resolution, in layer order (`src/output/stage.ts:348-422`); a foreign OGraf package
  gets the same kind of frame (`src/output/foreignOgraf.ts`). PROGRAM on the production page and
  the hosted page is the same `createOutputStage` (`home/PayloadStage.tsx`); PREVIEW is one
  iframe of the selected cue's graphic with its own fit transform
  (`home/PlayoutMonitors.tsx:188-241`). The exported production controller's monitors are also
  per-graphic iframes with a scale transform (`control/productionControllerHtml.ts:454-479`).
  Exported overlays (html-overlay, CasparCG, SPX) have no wrapper: the template document is the
  page.
- **Isolated experiment** (scratch script over the repo's own `scripts/catalog-emit.mjs`, seven
  templates: lt01, lt63, qz01, qz05, qz13, sb01, sb14, plus the two agent-made boards of
  `e2e/fixtures/agent-made/vote-show.noacgpack.json`, rendered in Chromium at 1920×1080):
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

### The quiz, honestly (verified by measurement)

The catalog quiz boards are 895 to 1179 px wide and 287 to 319 px tall, centred, with their
smallest text at 20 to 32 px. The agent-made "Votes board" of the game-show fixture is 1200×511
at the bottom-left, smallest text 26 px. Fitting into a 240 px lower-third band above the bottom
inset means:

| Graphic | Box | Scale to fit | Smallest text after | Floor |
|---|---|---|---|---|
| qz01 Arena Quiz | 895×287 | 0.84 | 18.4 px | 20 px (card secondary), 28 px primary |
| qz13 Sticker Quiz | 1179×319 | 0.75 | 24.1 px | same |
| Votes board (agent) | 1200×511 | 0.47 | 12.2 px | same |

A half-screen board scaled into a lower-third band fails the readability floor
(`src/model/designRules.ts`, `docs/DESIGN_LANGUAGE.md` §1) on every board measured, and nothing in
the validators sees an outside transform. Scale is enough for "about five percent"; it is not a
way to turn a board into a strip. No quiz board declares a compact layout
(`src/templates/quiz/`); the game-show families ship a separate lower third instead
(`docs/DESIGN_LANGUAGE.md` §8).

### The cue, the wire and recovery (verified)

- `ShowCue` (`src/model/shows.ts:50-89`) holds field `values`, label, note, hotkey, folder,
  timing, clip playback and `imageFit`; no visual data. Two cues of one graphic differ only in
  values. The pool entry `SavedGraphic` is a **copy** of the library template with a back-link
  (`src/model/packets.ts:39-68`); Publish refreshes the copy from the library
  (`refreshGraphicCopies`, `shows.ts:812-852`) and keeps production-scoped fields such as `layer`
  and `soundConfig`. "Package" is retired: the one grouping is the production; a `.noacgpack.json`
  installs into one; rundown folders do not travel to the published payload or exports.
- The wire is field data and machine events only: `update`, `play`, `stop`, `next`, `event`,
  `snap`, `hello` (`src/control/controlModel.ts:802-815`); the database allow-lists those kinds
  (`supabase/migrations/0071_command_sequence.sql:346`), so a new kind needs a migration. Take
  sends `[update(values), play, cue]`, ✎ Update sends `[update(full values)]` only, and the shared
  runtime's `update()` writes ids it knows and ignores the rest without replaying anything
  (`templates/shared/base.ts:407-417`). The ± block's partial update is the precedent for a key
  that rides `update` and is merged, never replayed.
- Recovery: the `/output` renderer keeps `mergedData`, every key it ever received in `update` or
  an event payload, reports it as its baseline and restores from it on boot
  (`src/output/main.ts:683-716`, `outputRecovery.ts`); the local relay receiver keeps the same
  merged map (`control/localReceiver.ts:59-67,132-153`). The hosted receiver baked into a
  published graphic harvests its report from the DOM text of declared fields
  (`hostedReceiver.ts:135-148`), so a non-field key is restored there only from log rows after
  its baseline.
- The draft is one record per selected cue, autosaved after 300 ms; selecting another cue flushes
  it (`control/cueDraft.ts`, `ProductionPage.tsx:1791-1801`). An edit to the on-air cue is saved
  but not sent, and the editor says how many changes wait (`unsentFields`).
- Team productions merge per cue; personal ones last-write-wins per record
  (`model/teamShowMerge.ts`, `backend/sync.ts`).

### Styling systems (verified)

- Every catalog design declares the `:root` contract (`--accent`, `--text-color`, `--text-dim`,
  `--panel-bg`, `--font-heading`, `--scale`, optional `--type-scale`) plus the shape tokens it
  reads (`src/model/themeTokens.ts`: thirteen, among them `--display-weight`, the heading weight,
  consumed by 26 template files, and `--font-label`). A brand is `ProjectBrand` (palette,
  typeface, tokens, logo). `applyLookToTemplate` (`src/model/packets.ts:372-439`) is a pure
  `(template, brand) => template` that writes only variables the receiving design declares.
- `Show.look` (a captured copy) and `Show.brandId` (a reference) exist on the production
  (`shows.ts:353-369`); "Apply brand to all graphics" is a comment, not a feature, and the only
  multi-graphic apply is pack install. There is no production-level style that reaches air; a
  look changes air only by being baked into templates and republished. The production page has
  no palette, font or look control.
- `scripts/palette-freedom.mjs` (results in `docs/CATALOG_VARIETY.md` §5, 459 designs): a new
  accent reaches every design; 13 keep a literal accent somewhere; a change of **tone** (dark to
  light panels) breaks 148 designs and degrades 189. Colour is free; tone is not.
- Exceptions already live outside `:root`: team colours are `color` fields lifted onto the
  board's root as `--team-a`/`--team-b` (`scoreboards/boardRuntimes.ts`); alert severities and
  quiz "wrong" are literals by design; sponsor, team and crest slots are excluded from the brand
  logo (`BRAND_SLOT_TITLES`). A `:root` overlay leaves all of them alone.
- Imported SVG designs (svg01) declare the contract but paint nothing with it: fills are the
  artwork's own and text uses the artwork's families (`importedDesign/svgFonts.ts`). Agent-made
  graphics are asked by the skill contract to use the contract vars; the publish bench checks only
  that `--accent` and `--scale` appear (`validation/runtimeBench.ts:916-925`), never that they
  paint. Foreign OGraf packages have no style hook (`control/ografContract.ts`).

### Fonts (verified unless marked)

- The seventeen bundled faces are one woff2 each, the Google "latin" subset: all have
  å ä ö æ ø and their capitals; **none has Š š Ž ž** or the rest of Latin Extended-A. Fifteen
  are variable fonts, so 400 and 700 are real weights; **Bebas Neue and Anton are static 400**,
  nothing sets `font-synthesis`, and the style vocabulary offers 400 to 900 for them, so their
  bold is browser-synthesised (the defaults of lt07, lt33, lt43, lt61, ls08, card83).
- **The Google Fonts import embeds the wrong subset.** `fetchGoogleFont` takes the first
  `url()` of the css2 response (`src/model/googleFonts.ts:127-130`); the live response (fetched
  2026-10-24 with a Chrome user agent) lists cyrillic-ext first for Montserrat and Roboto and
  latin-ext first for Bebas Neue, latin last. The embedded face therefore has no Latin glyphs
  (or no ASCII), carries no `unicode-range`, and shadows the family name, so every letter falls
  back to Arial on both the design machine and the playout machine. This is the strongest
  candidate for "the font renders differently from the design" and it is a defect independent
  of this spec. The e2e stub serves a single-block response and hides it
  (`e2e/google-fonts.spec.ts:25-43`).
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
  check for a family without a face. Inferred: applying a look to an svg01 graphic replaces the
  artwork's alias `@font-face` (first block matching `FONT_BLOCK_RE`) and drops its typeface.

## The recommended design

### One sentence

A cue carries an optional **adjust** record (position, size, style variables), inheriting a
pool graphic's default and the production's look; the production page prepares it on PREVIEW,
Take and Update carry it in the same `update` data every receiver already merges, the output
applies position and size as a transform on the NoaCG-owned frame and style as `:root`
variables on the document root, and exports bake the graphic-level result into the template.

### Two mechanisms, chosen by what each can honestly do

| Need | Mechanism | Why this one |
|---|---|---|
| A little left/right/up/down, the other side, about 5% smaller | **Frame adjust**: `translate(dx, dy) scale(s)` about an anchor, on the per-graphic frame NoaCG owns | Works for every source on NoaCG's output (catalog, imported SVG, agent-made, foreign OGraf) with no template support, applies on air without a replay, and is what comparable renderers do (CasparCG `MIXER FILL`, OBS and vMix transforms). It never recomposes; it says so |
| Font family, weight, accent and the other contract colours, on one graphic or all | **Style adjust**: `:root` variable overrides in the brand vocabulary, applied at runtime on `documentElement`, baked at export | The contract already exists and every catalog design declares it; `applyLookToTemplate` already knows which variables a design accepts; exceptions (team colours, severities, logos) already live outside `:root` |

The authored `--scale` knob was considered as the size mechanism for contract graphics (it keeps
full-width bands full-width and respects the auto-fit cap). It is rejected for the operator
control because it would make "Size" mean two different things for two kinds of graphic, and the
SVG text fit does not follow it. It remains the right knob for a designer and may later back a
"Re-anchor" that edits the design.

### Scope and precedence

Four scopes exist; the UI exposes three.

| Scope | Record | What it is for |
|---|---|---|
| Cue | `ShowCue.adjust` | This cue only: the second lower third on the right while the first stays left |
| Pool graphic | `SavedGraphic.adjust` (inside `Show.graphics`) | Every cue of this graphic in this production: the lower third moved for the show, the quiz shrunk |
| Production | `Show.look` / `Show.brandId` (exist) | Typeface and colours for the whole rundown, graphics added later included |
| Library original | nothing | never written by an adjustment |

Precedence, per property, narrowest wins: **cue > pool graphic > production look > authored**.
A shared change is **inherited, not copied**: one record at its scope; a narrower record is an
exception and keeps standing when the wider one changes; "Reset" deletes the record at the scope
shown, and the value falls through to the next. Position and size are offered at cue and pool
graphic scope only: a production-wide offset has no meaning across different graphics. Style is
offered at all three.

Concrete examples:

- Lower third moved for the show: Adjust, scope "all cues of Presenter strap", preset
  bottom-right, nudge 12 px left. Both existing cues and every later cue move. One of them is
  then set "this cue" to bottom-left: that cue keeps left when the graphic default changes again.
- Production look: Archivo, accent `#ff7a00`. The score banner's team colours (fields) and the
  alert graphic's severity colours stay; the imported quiz shows "Font and colours: not
  adjustable (imported artwork)"; one lower third is set "this graphic keeps its own colours" and
  stays amber. Reset on the production look returns every graphic that had no exception.
- Two operators: records are per cue and per pool graphic, so the team merge keeps both edits
  unless they touched the same cue; a personal production keeps the whole-record last-write-wins
  it has today.

### The record

```ts
/** ADDITIVE OPTIONAL on ShowCue and SavedGraphic; own `v`, read through one reader that drops
 *  what it does not know (the `profile` precedent). Absent = authored appearance. */
interface AdjustRecord {
  v: 1;
  /** Frame adjust, in production-frame px and a plain factor. Absent members = 0 / 1. */
  x?: number; y?: number; scale?: number;
  /** Anchor the scale and the presets work from: a nine-point zone. Absent = measured. */
  anchor?: Zone9;
  /** Style adjust: `:root` variables by name without dashes, the vocabulary `ProjectBrand`
   *  and TOKEN_VARS already use (`accent`, `font-heading`, `display-weight`, ...). */
  vars?: Record<string, string>;
  /** A bundled face by id, or an imported face by its asset path, when `font-heading` changes:
   *  what has to be declared and shipped so the variable resolves. */
  font?: { fontId: string } | { custom: CustomFont };
  /** This scope opts out of the production look's style (keeps the authored or own values). */
  keepStyle?: true;
}
```

Effective record for a cue = fold(authored ← production look as vars ← graphic.adjust ←
cue.adjust), computed in one pure function. The production look is read through
`Show.brandId` first and `Show.look` as the fallback, which is the rule `shows.ts:360-368`
states and the audience page should follow too.

### The wire: ride `update`, one reserved key

The effective adjust travels as one reserved key in the `update` data Take and Update already
send, for example `"_noacg": "{\"x\":..}"` (the exact key is an implementation choice; it must
not match the field-id shape `fN`). Why this and not a new message kind:

- Every receiver already merges `update` keys and restores them on boot: the `/output`
  renderer's `mergedData` and report, the local relay's merged map and the output's log replay.
  Recovery after a renderer restart or reconnect needs nothing new.
- PREVIEW's settle, `aired`, `unsentFields` (the amber dot on ✎ Update when an adjustment waits)
  and the exported controller's relay carry it for free.
- No migration of the command allow-list, no new receiver protocol; a receiver that does not
  know the key ignores it, as templates ignore unknown ids today.

What each consumer does with the key (all additive):

- **Output stage** (`src/output/stage.ts apply`): parse, set the frame's `transform` and
  `transform-origin`, forward the message unchanged. Re-apply on `swapIn` (per-graphic
  replacement) and when a frame is rebuilt. A change arriving on `update` for an on-air graphic
  applies at once with no replay; a short transition (about 300 ms) is an implementation choice
  comparable renderers make.
- **Composed document, live-control run** (`src/preview/composeDocument.ts`): apply `vars` on
  `documentElement.style`, so `noacgResetGraphic` cannot wipe them; when `font-heading` changes,
  resolve `--font-numeric` through `numericFontStack` and call the fit hooks once
  `document.fonts.load()` settles. To make a bundled typeface available without plumbing, the
  composer declares the bundled faces' `@font-face` rules in every output document: a browser
  fetches a face only when text uses it, so the cost is text, not bytes.
- **Hosted receiver baked into published graphics and the local relay receiver**: apply the
  same body transform and `documentElement` variables from the key; fonts resolve to the
  `fonts/` folder the export shipped.
- **Templates**: nothing. `update()` ignores the key.

A hidden declared field was considered (the most portable road: SPX rundown rows and OGraf
schemas would carry it). It is rejected because it changes every graphic's code to carry a
production concern, which is the boundary `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6f draws.

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
   Size    [ − ]  95 %  [ + ]                                 ← floor: smallest text 22 px
   Type    [ Inter ▾ ]  [ Regular | Medium | Bold | Black ]
   Colour  Accent ■  Text ■  Panel ■
   Reset ▾ (this cue · the graphic's default · everything)
 OPERATOR NOTE   ▸ Advanced  Layer 1
```

- **Finding it:** the disclosure reads the current state in its summary line even when closed
  ("ADJUST · bottom-right, 95 %, Archivo" or "ADJUST · as designed"), so a moved graphic is never
  a mystery. The rundown row carries a small glyph when a cue or its graphic is adjusted.
- **Place:** a nine-point grid moves the graphic's measured box to that zone's safe inset (a
  translate; text alignment does not change, and the summary says "moved, left-aligned" for a
  left-aligned strap placed right). Arrow buttons and keys nudge 1 px, Shift 10 px, in
  production-frame px; the boxes take typed values. The current anchor shows as the filled dot.
- **Size:** plus and minus in 5 % steps, Shift 1 %, typed percent; scaling is about the anchor,
  so a bottom-left strap shrinks toward bottom-left and a centred board toward its centre. The
  line under it is the readability estimate: the graphic's smallest rendered text (measured on
  PREVIEW through the existing `measure` command) times the scale, against the type floor, in
  amber below it and red below 16 px. A graphic whose box touches both frame edges reads
  "spans the frame: sizing leaves an edge".
- **Type and Colour** are the style adjust at this scope: family from the bundled faces plus the
  production's imported faces, weight from the face's real weights only (never a synthesised
  bold), and the contract colours the design actually paints (`cssPaintsWith`), so a dead control
  is never drawn. A graphic that paints none of them shows "Type and colour: as designed
  (imported artwork)" in place of the rows.
- **Scope switch** at the top of the block: "this cue" or "all <graphic> cues". Saving under
  "all" writes the pool graphic's record and clears the same properties from this cue's record,
  so the operator never leaves an invisible exception behind by accident; other cues' explicit
  exceptions stay and the summary names them ("2 cues keep their own place").
- **Preview:** PREVIEW shows the selected cue with its effective adjust, the safe-area guides
  while the block is open, and a toggle "show on-air graphics" that draws PROGRAM's stage behind
  PREVIEW at reduced opacity, so the quiz is sized against the real score banner. (Both are the
  same stage implementation; the toggle is a second, dimmed `PayloadStage`.)
- **Reaching air:** exactly as today. Take airs the prepared cue with its adjust. For the cue on
  air, the editor's "switch to on-air cue" plus ✎ Update applies position, size and style at once
  without an entrance replay; the fate line counts the waiting change and ✎ Update wears the
  amber dot. Selecting another cue flushes the draft to the record, as it does for values.
- **Reset** is a menu of the three scopes; each deletes one record and the summary shows what
  stands after it.

**Production look** lives in Setup ▾ → Look (a panel, so the monitors stay on screen):

```
LOOK · this production
 Brand   [ Autumn Quiz ▾ ]   or   Typeface [ Archivo ▾ ]  Accent ■  Text ■  Panel ■
 Reaches 7 of 9 graphics          ▸ Score banner: team colours stay    ▸ Imported quiz: artwork, not adjustable
 Exceptions (1): Presenter strap keeps its own colours                 [Clear exceptions]
 [ Preview on selected cue ]      [ Send to on-air graphics ]  (2 on air)       [ Reset look ]
```

The counts come from the same pure fold over the pool and `cssPaintsWith`. Changing the look
changes PREVIEW at once and reaches air on the next Take of each graphic, or on "Send to on-air
graphics", which is one Update per cue on air, listed before the press. A tone change (dark panel
to light) is allowed but warned, with the palette-freedom result as the reason.

**Hosted control page and phone:** phase 1 reads and applies the records (its Take and Update
carry the effective key, PROGRAM shows it); the Adjust block itself is drawn there in phase 3,
in the one scrolling column, with the arrows as 40 px buttons. **The exported controller** bakes
graphic-level adjustments into its overlays and carries cue-level ones in its emitted cues and
relay rows, as it carries values.

### The quiz, and what to tell the operator

Size handles "a little smaller". For "a board into a strip" the honest answer on the surface is
the floor line turning red, and the right remedy is a second graphic in the pool: the game-show
families already ship a lower third, the agent door makes one from a brief in minutes, and the
cue keeps its values. A later, separate change may let a graphic declare a compact layout as a
style choice or state so that one graphic serves both places; that is design work in
`templates/` and the skill contract, not a playout feature.

### Capability matrix

By graphic source, on NoaCG's own output (the `/output` renderer, PROGRAM on both pages):

| Source | Place and size | Type (family, weight) | Colour | Notes |
|---|---|---|---|---|
| Catalog design | yes | yes; weight where `--display-weight` is read (26 files), family always | yes for 97 %; 13 literal welds partial | tone change warned |
| Imported SVG (svg01) | yes | no (artwork's own faces) | no (artwork's fills); logo slot only | says "as designed" |
| Imported raster (imp01) | yes | family yes, per line | text colour no (baked literal) | |
| Agent-made, contract followed | yes | yes | yes | `cssPaintsWith` decides per variable |
| Agent-made, contract ignored | yes | no | no | validator finding, see below |
| Foreign OGraf package | yes (its own frame) | no | no | no style hook in the standard |
| Server clip or still | no (`imageFit` exists) | n/a | n/a | out of scope |

By playback and export target:

| Target | Cue-level adjust | Graphic-level adjust | Production look |
|---|---|---|---|
| `/output`, PROGRAM, hosted page | live, via the key | live | live via vars; fonts from `/fonts` |
| Exported production controller + overlays (local relay) | via relay rows; the overlay receiver applies them | baked into each overlay at export | baked |
| html-overlay, CasparCG template folder | not carried (no rundown) | baked: a wrapper rule for the frame, `applyLookToTemplate` for style | baked |
| SPX production export | not carried (rows write declared keys only) | baked | baked |
| OGraf package, LiveOS | not carried (no rundown) | baked onto NoaCG's canvas element and `:root` | baked |
| A generic OGraf host that only sends data | nothing per cue | what was baked | what was baked |

Baking at export means an exported package reproduces what the production page showed for the
graphic's default; a cue-level exception is listed in the export dialog as "not carried by this
target" rather than silently dropped.

### Alternatives rejected

| Design | Why not |
|---|---|
| Edit the production's template copies in place ("apply to all" as a destructive patch) | Irreversible without provenance machinery that does not exist (`STARTER_COLLECTIONS_PLAN.md` §86-96), cannot differ per cue, and diverges the copy from the library on every Publish refresh |
| A new `ControlMessage` kind for style | Needs a migration of the allow-list, four receivers and new recovery storage; gives nothing the `update` key does not |
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
| `src/model/shows.ts`, `src/model/packets.ts` | `AdjustRecord` type, `adjust?` on `ShowCue` and `SavedGraphic`; `readAdjust` (drops unknown, keeps `v`); mutators `setCueAdjust`, `setGraphicAdjust`; `refreshGraphicCopies` and re-add keep `adjust` as they keep `layer` |
| `src/control/cueAdjust.ts` (new, pure) | `effectiveAdjust(show, cue)` fold; `presetOffset(box, zone, res)`; `frameTransform(adjust, box)`; `floorEstimate(minFontPx, scale)`; `styleReach(template, vars)` over `cssPaintsWith`; the reserved key's encode/decode |
| `src/control/graphicVerbs.ts`, `cueItems.ts` | Take and Update fold the key into the data they already send |
| `src/control/hostedControl.ts` | `OutputCue.adjust` and the pool default in the payload (additive), so the hosted page and the exported controller read them |
| `src/output/stage.ts` | apply the frame transform from the key; re-apply on swap and rebuild |
| `src/preview/composeDocument.ts` | live-control handler for `vars` and `font`; bundled `@font-face` declarations in output documents |
| `src/control/hostedReceiver.ts`, `localReceiver.ts` | apply the key to `body` and `documentElement` |
| `src/components/home/CueAdjust.tsx` (new, props only), `CueEditor.tsx`, `PlayoutMonitors.tsx`, `ProductionSetupMenu.tsx` + a `ProductionLook.tsx` | the block, the guides and ghost toggle, the Look panel |
| `src/export/common.ts`, `showExport.ts`, `targets/*` | bake graphic-level frame rule and `applyLookToTemplate` with the effective style; list cue-level exceptions the target cannot carry |
| `src/audience/audienceBrand.ts` | read the production look through the same fold |

Everything that decides a value is a Node-tested module under `src/control/` or `src/model/`;
components select and commit (`docs/ARCHITECTURE.md` §5, the compiled playout rule).

**How authoring tools and agents learn what is adjustable.** Nothing new is declared: the
adjustable surface is derived from the `:root` contract a graphic already carries, measured by
`cssPaintsWith`. The skill contract gains one sentence (a graphic that wants its typeface and
colours adjustable paints with the contract variables and ships a real `@font-face`),
`noacg inspect` prints an "Adjustable" line (place and size always; type and each colour when
painted), and `noacg validate` adds two non-blocking findings: `style-contract-unpainted` and
`font-without-face`.

## Typography reliability: prevention, separate from editorial change

These are defects, not features, and none depends on the adjust record. Each is small and can
land on its own:

1. `fetchGoogleFont` selects the `/* latin */` block (and `latin-ext` as a second face with its
   `unicode-range`), and the e2e stub serves a real multi-block response.
2. Bundled families gain the latin-ext woff2 as a second `@font-face` with `unicode-range`, so š
   and ž set in the chosen face; `addReferencedFonts` already copies anything in `template.css`.
3. The weight choice is clamped to the face's real weights (`fontWeights()`), or `font-synthesis:
   none` is emitted, so Bebas Neue and Anton stop faking bold.
4. `validateTemplate` reports a non-generic `font-family` with no `@font-face` and extends
   `missing-asset` to `fonts/`; the skill's worked example gets its face.
5. `FONT_BLOCK_RE` in `applyLookToTemplate` skips an imported design's alias faces (inferred
   defect; a Node test over an svg01 template settles it).
6. READY's "Using a fallback font" stays amber and non-blocking; a per-production setting to make
   it a Take blocker is a possible follow-up, not recommended by default.

## Phased delivery

| Phase | Delivers | Depends on | Why in this order |
|---|---|---|---|
| **0. Font prevention** (independent PRs) | items 1 to 5 above | nothing | verified defects; the Google subset bug alone explains most "wrong font" reports |
| **1. Place and size** | `AdjustRecord` (x, y, scale, anchor), cue and pool-graphic scope, the Adjust block's Place and Size rows, guides, floor line, ghost toggle, Take and Update, output stage, recovery, exported controller and baked wrapper rule in every export, hosted page applying (not editing) | rows 14, 22, 23, 25 of the production-page run (the editor, the verbs, the draft part, phase 14), already passed | the essential priority; the frame transform needs no template cooperation, so it is the smallest useful delivery and proves the record, the key and the exports |
| **2. Type and colour per graphic and cue** | `vars` and `font` on the record, the Type and Colour rows, bundled faces declared in output documents, fit re-run, receivers, bake through `applyLookToTemplate`, skill and `inspect`/`validate` lines | phase 1 (the record and the key), phase 0 item 3 (real weights) | typography is the second priority and reuses the brand vocabulary unchanged |
| **3. Production look at playout** | Setup ▾ Look reading `brandId`/`look`, reach count, exceptions, "Send to on-air graphics", audience page alignment, the Adjust block on the hosted page and phone | phase 2 | rundown reuse is valuable, and it is only the widest scope of the fold already built |
| Later, separate specs | compact layouts declared by graphics; "Re-anchor" for contract graphics; tweened moves; a Take blocker for fallback fonts | | each is design or policy, not plumbing |

Phase 2 is not blocked by phase 1 beyond the record's shape, so the two can be built by two rows
in sequence with no rework. Deferring 3 costs nothing a production needs before 2 exists.

## Proposed placement in the production-page run

A proposal for the owner and the coordinator; `extensions.md` and the run's ledger are not edited.

- **Phase 0** is outside the run: ordinary fixes through `/queue-merge`.
- **Row "L2.1" (phase 1)** after L1 (pinned live controls, proposed between rows 32 and 33) and
  before E1.1: both touch `CueEditor.tsx`, so they run in sequence; nothing in E1 to E7 touches
  the frame or the cue record. Environment CA; gates AC-1 to AC-4, AC-8, AC-9's frame half.
- **Rows "L2.2" and "L2.3" (phases 2 and 3)** after E2.2 and before E3.1, so a foreign package's
  frame-only capability is drawn by the same block E2 settles; gates AC-5 to AC-7, AC-9, AC-10.
- **E8.1a** adds the cross-feature case (an adjusted cue bound to a source, a pinned adjusted
  graphic); **E8.2's kit** and **S** take AC-11.
- **File fence:** the modules in the table above; no parallel writer on the page.
- **Rollback:** an `adjust` record is ignored on read and the key is ignored by every receiver;
  no migration, no wire change.

## Risks, unresolved questions, experiments

- **Hidden-frame throttling.** A frame translated fully off-screen may be throttled by Chromium
  (`stage.ts:659-667` warns). Clamp the transform so at least part of the frame stays on stage;
  experiment before phase 1 settles the clamp.
- **The PREVIEW measurement.** The anchor and floor line need the graphic's box and smallest
  text, read from PREVIEW after settle. `frameGraphic`'s `GraphicBox` and the `measure` command
  exist; a graphic that reports nothing (a foreign package) gets the frame centre as anchor and
  no floor line. Untested on foreign packages.
- **Body transform inside exported overlays.** Verified on seven templates; `100vw` designs
  (`tickers/tk21.ts:59`, `transitions/premiumArchetypes.ts:122`) would mis-measure under it.
  The exporter can wrap the body's children in one NoaCG div instead; a sweep over the catalog
  through `scripts/catalog-emit.mjs` decides which.
- **Runtime font change and fit.** Verified that a family swap reflows a staged board; the fit
  hooks must be called after `document.fonts.load()`, and an imported face arriving late must
  not leave the fallback face on air. Phase 2's blank-page spec covers it.
- **Tone changes.** A light look on dark designs breaks a third of the catalog. The warning is the
  design; whether to refuse outright is an owner taste question for phase 3.
- **The reserved key on the SPX production export.** Rows write declared keys only, so the key is
  dropped there by construction; confirm no SPX surface displays unknown keys.
- **Two cues on one layer in quick succession.** The frame is per graphic, so a Take of cue B
  with a different adjust moves the frame as B's entrance starts. That is the intended behaviour;
  a tween would make it visible as motion. Decide tween or cut in phase 1 (recommend cut).
- **Still untested:** the Google-subset defect against the owner's own graphics (which families
  the affected graphics used); the svg01 `FONT_BLOCK_RE` collision; glyph coverage of imported
  faces.

## Acceptance

Each criterion names its cheapest useful layer (`root/put-durable-check-cheapest-layer-proves`).

### AC-1: A lower third moves to the other side, then nudges precisely
On the production page, with a bottom-left lower third cue on PREVIEW: choose the bottom-right
preset; PREVIEW shows the strap's box with its right edge at the right safe inset; press ← three
times and Shift+←: the box moves 13 px left; typed x and y agree. Take: PROGRAM's frame carries
the same transform, read off the stage. Scenario: Node `scripts/cue-adjust.test.mjs` for
`presetOffset` and the nudge arithmetic; a journey in `e2e/production-controls.spec.ts` at
1600×900 reading the PREVIEW and PROGRAM frames' computed transforms.

### AC-2: About five percent smaller, with no anchor drift
Size − once on lt01 (bottom-left) and on a centred board: the bottom-left strap keeps its left
and bottom edges within 1 px and shrinks 5 %; the board keeps its centre within 1 px. Scenario:
a blank-page browser spec over emitted templates (the research experiment, kept as the test),
asserting the measured boxes; a Node test of `frameTransform` for each of the nine anchors.

### AC-3: The oversized quiz is assessed, and the alternative is named
Shrinking a quiz board to fit a 240 px band turns the floor line red with the measured smallest
text (qz01: 18 px at 0.84), and the line names the remedy ("use a lower-third graphic").
Scenario: Node test of `floorEstimate` with the measured numbers; the journey reads the line.
The evidence receipt records the three measurements above and states that scale alone fails.

### AC-4: Two cues of one graphic keep independent placements
Cue 1 at the graphic default (bottom-left), cue 2 set "this cue" bottom-right; changing the
graphic default to a 10 px nudge moves cue 1 and leaves cue 2; Reset on cue 2 returns it to the
default; the summary of cue 1 reads "1 cue keeps its own place" while the exception stands.
Scenario: Node test of `effectiveAdjust`; the journey.

### AC-5: A font family or weight is corrected and Nordic letters render in the chosen face
On a lower third with "Åsa Öberg-Ærø" typed, set Type to Archivo Bold: PREVIEW's text reports
Archivo at 700, every glyph in the face (no fallback face in `document.fonts` for those
characters), and the text fits re-run; Bebas Neue offers Regular only. Scenario: a blank-page
browser spec reading computed `font-family`, `font-weight` and `document.fonts.check` for the
string; a Node test that the weight list follows `fontWeights()`.

### AC-6: A shared font or colour change reaches queued graphics and respects exceptions
A production look of Archivo and accent `#ff7a00` over a pool of a lower third, a scoreboard with
team colours set, an alert graphic and an imported SVG: PREVIEW of each cue shows the new accent
and face where painted, team and severity colours unchanged, the SVG unchanged with the "as
designed" line; the Look panel counts "3 of 4"; one lower third marked keepStyle stays. Scenario:
Node test of the fold and `styleReach` over emitted templates; the journey over a fixture pool.

### AC-7: A prepared rundown is reused with another programme's style
Duplicate a production, change its brand in Setup ▾ Look: every cue previews the new style, cue
exceptions survive the duplicate, and the original production is unchanged. Scenario: the
journey, with the original's records compared before and after.

### AC-8: Changes are prepared without touching air, then applied without a replay
With cue A on air: adjust its place and size in the editor (on-air target): PROGRAM's frame and
`data-plays` do not change; the fate line reads one waiting change; ✎ Update moves the frame and
`data-plays` is still unchanged; Re-take replays as today. Scenario: the journey reading
`data-plays` and the frame transform on PROGRAM.

### AC-9: Adjustments survive restart, reconnect and the exports that can carry them
Publish, take an adjusted cue, reload the output: the frame transform and style are back without
a new Take. Export the production: the html-overlay and CasparCG overlays carry the graphic-level
frame rule and `:root` values; the exported controller's relay rows carry the cue-level key and
its overlays apply it; SPX and OGraf packages carry the graphic-level bake and the dialog lists
the cue-level exception as not carried. Scenario: `e2e/configured/hosted-control-recovery.spec.ts`
extended; Node tests over the export builders reading the emitted CSS; the exported-controller
case in `e2e/production-controls.spec.ts`.

### AC-10: Unsupported graphics say so in one line, and nothing else changes for them
A foreign OGraf package in the pool shows Place and Size and the line "Type and colour: not
available for this package"; an imported SVG shows "as designed (imported artwork)"; a
production with no adjust records renders the generated page byte for byte and the output stage
sets no transform. Scenario: Node tests of `styleReach`; `e2e/playout-air-contract.spec.ts`
render counts hold; a byte comparison of the generated panel before and after.

### AC-11: The 2026-10-23 adjustments run from one screen, timed
From a fresh page: move the lower third to the right and nudge it, shrink the score banner 5 %,
set the quiz cue's font bold, each prepared on PREVIEW and taken or updated; the presses and the
time between them are recorded. A task of a trial kit (kits never gate) and the dress rehearsal's
case in S. Scenario: `evidence/trial-kit.md` and the S receipt.

## Owner decisions (2026-10-24, one question each, with the recommendation taken)

1. **The first delivery is place and size, per cue with a per-graphic default, on the
   production page; the hosted page applies the records but does not edit them.** Type and
   colour follow in their own row (phase 2), so the row that proves the record, the key and the
   exports carries no font plumbing.
2. **Production-wide style is a reversible production setting, applied at render and on
   Update, never written into the production's template copies.** Reset deletes a record; a
   graphic that keeps its own look is an exception record; Publish's refresh of the copies from
   the library stays honest. Exports bake the effective result into the files they write, which
   is a copy leaving the product, not the production's copy.
3. **The Google-font subset defect is fixed now, as its own small change, outside this spec.**
   It is verified, contained and the likely cause of the reported mismatches; it lands through
   the ordinary merge flow and phase 0 keeps only the remaining prevention items.

## Open decisions for the owner

None open. The three questions of 2026-10-24 are answered above. What waits is agreement on the
design as a whole and the coordinator's admission of the proposed rows.

## Evidence

None yet. The research experiment script and its measurements are in this session's scratch
folder; the numbers it produced are quoted above and will be re-run as AC-2's spec.
