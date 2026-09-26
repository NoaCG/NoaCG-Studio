# The spx_examples corpus - real-world SPX productions as reference material

`spx_examples/` (repo root, **gitignored - never commit it**) holds ~1.3 GB of real SPX
Graphics productions: shows from a Finnish public broadcaster, the Finnish Radio
Symphony Orchestra and Helsinki Philharmonic packages, Helsinki Music Centre (Musiikkitalo)
with four client re-skins, and SmartPX/Softpix's own commercial template packs (elemento,
two-tone, events, faith, texter, creditsroll, scoreboard, imageLayer, googleslidelayer,
spxSocial, countdown, bug). ~200 HTML templates plus their shared JS/CSS/themes, fonts,
webm/Lottie assets, and on-air reference screenshots (`media/*/examples/*.png`).

## Licensing - why it stays local

Most packs carry the **SPX-GC PREMIUM LICENSE** (SmartPX 2021): use and adapt inside the
organization, **never share or redistribute, as-is or modified**. A broadcaster's show designs
belong to that broadcaster. Bundled fonts (YleNext, Founders Grotesk, etc.) are separately licensed. Exceptions:
`smartpx/Template_Pack_1` is MIT; `bug` and `imageLayer` are CC BY-NC-SA 4.0 (non-commercial,
so still not borrowable for us).

What that means in practice:

- **Never** copy code, CSS, markup, assets, or fonts from the corpus into the repo, the
  catalog, generated output, or any AI prompt (a prompt exemplar IS redistribution into
  every user's export).
- **Fine:** reading it, measuring it, testing our importer/validator against it locally,
  and writing what we learned in our own words (this document, knowledge cards, design
  numbers). Conventions and techniques are ideas, not expression.

## What the corpus teaches - the real-world SPX dialect

Our `docs/SPX_TEMPLATE_FORMAT.md` describes the convention we GENERATE (each field `fN`
maps to one visible `id="fN"` element). Real production templates mostly do NOT work that
way. The dominant patterns, consistent across three authoring lineages (Softpix/SmartPX,
HMC/Musiikkitalo, and older webcg-era packs):

1. **Hidden data holders + a copy step.** `update()` writes into an invisible block
   (`#hiddenSpxData`, `#SPXdataFields`, `#dataFields`) whose children carry the field ids;
   a template-owned `runTemplateUpdate()` then composes the visible DOM (`f0` -> `text1`,
   `linef0`, ...). The holder doubles as a debug HUD (flip one opacity to see live data).
2. **`update()` drives the IN animation; `play()` is often a no-op.** SPX sends
   update-then-play, so templates render+animate from `update()` after a 50-200 ms
   `setTimeout` "let the DOM settle" delay. The HMC lineage does the opposite
   (play() -> IN). Both ship; an importer must not assume either.
3. **CasparCG string guards everywhere:** `"undefined"`/`"null"` (as strings) and `""`
   are all treated as empty. Some packs write `' '` (a space) rather than `''` to keep
   line-box height.
4. **Multi-line text arrives as literal `<br>`**, so every parser splits on `"<br>"`,
   never `"\n"`, after an `htmlDecode()` round-trip (DOMParser) for entity-escaped Finnish.
5. **Definition placement and syntax are loose.** `SPXGCTemplateDefinition` appears in
   head, in body, even after `</body>`; keys quoted or unquoted; trailing commas. It is a
   JS object literal, never JSON.
6. **Settings vocabulary in the wild:** `playserver` always `"OVERLAY"` (or `"-"` for
   non-graphic device-command items), `webplayout` ALWAYS equals `playlayer`, `out` is
   `"manual"` almost everywhere (rarely `"none"` or a numeric ms value), `dataformat`
   always `"json"`. Layer numbers are used as a design register (2 backdrops ... 20 bug).
7. **ftype extras in production:** `instruction` (no `field` key) and `spacer` (bare
   `{ftype:"spacer"}`) for operator-UI structure; `button` + `fcall` for docs links;
   `filelist` with `assetfolder`+`extension` (also used to pick THEME css and Lottie
   json); `dropdown` item values chosen to be directly usable as CSS values/class names.
   Reserved/magic fields: `comment` (rundown item name, no DOM element) and `epochID`
   (SPX-injected item id).
8. **Field naming is a convention, not a rule:** `f0..fN` content plus reserved high
   numbers (`f99` theme, `f100` help) - but named fields (`pos`, `col`, `styleSelector`)
   ship too, and one pack derives field names from After Effects layer names.
9. **`steps` semantics vary wildly:** `"1"` as default noise, `"2"` with a real state
   machine (falls through to OUT past max, to IN if not started), `"500"`/`"999"`/`"9999"`
   meaning "unbounded continue", and `next()` sometimes means *re-fetch data*, not advance.
10. **Templates talk back to SPX:** `showStopper()` stops the own rundown item via
    `fetch('/api/v1/item/stop/'+epochID)` when a credits roll finishes; `function_onPlay`/
    `function_onStop` settings invoke server-side extensions (`"Name|param|delayMs|field"`);
    a control API can call arbitrary named globals on a playing template (the scoreboard
    plugin drives `updateTemplateField()` directly, bypassing `update()`).
11. **Robustness idioms worth generating:** `window.onerror` -> `console.table`; cancel
    in-flight tweens before OUT (`anime.remove`); read the CURRENT clip-path as the OUT
    animation's start value so an interrupted IN exits gracefully; re-measure and re-init
    node caches on every play.
12. **No text auto-fit exists anywhere.** Overflow is handled by measured marquee scroll
    (duration = overflow px * 6-8 ms), vertical overflow scroll, char-count truncation, or
    `white-space: nowrap; overflow: hidden` clipping. (Our runtime bench + auto-fit are
    genuinely ahead here.)

## Design taste - measured numbers from production

- **Safe areas:** RSO pads the whole window `9vh`; HMC uses a `#safearea` box of
  `92.4vw x 87vh` (3.8% / 6.5% insets) with 8 named position classes; elemento uses
  `154px` side margins (~8%) on a 1920 canvas; one pack implements the safe area as a
  transparent border with theme-controlled widths (visible for setup by changing a color).
- **Vertical registers (1080p):** 160 px (top strap), 540 px (center), ~903 px (lower
  third), HKO lower-third baseline `bottom: 142px`.
- **Type scales (1080p):** name lines 72-92 px, sub-lines 40-50 px; elemento's ladder
  92/67/54/40/32; full-screen titles ~4 vw uppercase with `line-height 0.9`; credits
  roles/names ~3 em with `letter-spacing 0.05em`; negative vertical margins to kill the
  leading gap of condensed faces. 4-5 font-weight ALIASES (`BLACK/BOLD/MEDIUM/REGULAR`)
  re-pointed by themes, never raw family names in templates.
- **Motion vocabulary:** the house primitive is `clip-path: inset()` reveals plus short
  translates. IN 500-2000 ms with `easeOutQuad/Quart/Expo`; **OUT is always much faster
  (often half or less) with easeIn***; **opacity always animates linearly** and briefly,
  separately from movement; staggers 50-400 ms. GSAP-era packs normalize whole timelines
  to a fixed duration.
- **Theming:** minimum viable theme = five `:root` variables (box/accent/text/bg/panel);
  richer packs use a full token vocabulary (colors, sizes, shadows, safe-area paddings,
  even behaviour constants like `--lower-max-message-chars` read from JS). Reskins swap a
  `<link id="DynamicTheme">` href from a field - four client brands ship on identical
  code+HTML with only the token css and images changed.
- **Palettes:** the broadcaster's production graphics are restrained scrims (rgba(0,0,0,0.4) panels,
  white text, one accent); orchestras run saturated non-cliché palettes (RSO teal
  `#04A188`/gold/coral/violet; HKO red `#D40035` with strict fg/bg pairing logic where
  the secondary row's colour is DERIVED from the chosen scheme).
- **Assets:** alpha WebM strips as lower-third plates (1920x185); frame-accurate WebM
  transport (50 fps, keyframed, rAF + currentTime seeking) with segment loops and an
  out-trigger frame; Lottie both as triggered accent (preloaded, `goToAndPlay`) and as
  operator-selectable icon via filelist.
- **Two years of HKO production changes were:** entity decoding, red opacity 0.8 -> 1.0
  (translucent brand red failed on busy footage), a brighter red for 3 em type on black,
  and a line-height fix that was clipping descenders. Character encoding, contrast, and
  clipping are what actually break on air.

### Production deltas vs our DESIGN_LANGUAGE guardrails (RATIFIED 2026-08-02)

Where the measured corpus disagreed with `docs/DESIGN_LANGUAGE.md`, reviewed against the
visual gallery and ruled by the owner:

- **Strap name size:** was 44-64 px; production flagships run 72-92 px (commercial packs
  sit lower). **Ruling: widened to 44-92 px**, upper half reserved for flagship-show looks.
- **Entrance duration:** was capped 0.9 s; production commonly runs 1.0-1.4 s.
  **Ruling: cap raised to 1.4 s**; fast-feel graphics stay at the low end.
- **Staggers:** was 60-150 ms; production ladders reach 400 ms. **Ruling: widened to
  60-250 ms** - the theatrical extreme stays out.
- **Confirmed as-is:** opacity always linear and separate from movement; clip-path
  `inset()` as the reveal primitive; OUT always faster than IN; empty fields collapse
  their boxes.

The rulings live in DESIGN_LANGUAGE.md itself. **The AI prompt stack was synced to them in
one pass on 2026-08-02**, once the Creative Mode pilot's pairwise round had landed:
`src/ai/claudeProvider.ts` `coderSystemPrompt` (entrance window and stagger range),
`src/ai/creative/knowledgeCards.ts` (the strap and card type ranges, the strap/tower/
full-frame motion numbers), and `src/ai/brainstorm.ts` (the entrance window it steers
toward). The stack now states the same numbers as DESIGN_LANGUAGE §1 and §4.

That sync ended the coder prompt's benchmark freeze (docs/CREATIVE_MODE_PLAN.md §8), so
**arm A's numbers from rounds up to and including 2026-08-02 are not comparable with any
later round** - a re-run has to re-baseline the control rather than reuse them.

## How we use it (the plan)

There is no model fine-tuning here - the harness learns through prompts, deterministic
knowledge, validation, and benchmarks. Five workstreams, in value order:

1. **Import-robustness sweep (highest value).** Users will drop exactly these files into
   "Import graphic" / "Open as code" / convertImport. A local-only script
   (`scripts/spx-corpus-sweep.mjs`, corpus path via env/arg, skipped when absent) runs
   every corpus .html through `model/importTemplate.ts` + `validateTemplate` and reports
   parse coverage: definition found, fields extracted, lifecycle detected. Every dialect
   above that we mis-parse is a real-world import bug found for free. The corpus never
   enters CI or the repo; the script and its findings do.

   **The ZIP path joined the sweep on 2026-08-02** and immediately paid for itself. The
   script now builds a real in-memory zip per template (its html plus that folder's
   css/js/assets, other templates' folders left out) and runs `importZipTemplate` beside
   the html import, then names every template where the zip result is WORSE. It is a
   genuinely different code path - the zip importer picks its own entry point and used to
   concatenate every .js under the folder rather than the ones the page loads - and 23 of
   204 templates imported cleanly as a dropped .html and failed as a zip:

   - **ES module files landed in the classic JS pane.** An earlier fix kept INLINE
     `<script type="module">` in the HTML; a module that lives in a .js FILE bypassed it
     entirely and arrived as bare `import`/`export`, a syntax error for the whole template.
   - **Sibling templates were merged.** A pack folder holds several designs and every
     library any of them uses, so one import concatenated three designs' animation files
     (each declaring the same names - a redeclaration SyntaxError) onto ~1.6 MB of jQuery,
     lodash, axios, and both axios builds.

   Both are fixed in `importZipTemplate` (referenced scripts only, in page order, modules
   excluded) and pinned in `e2e/import.spec.ts`, mutation-tested on both halves. The sweep
   now reports **0 templates worse on the zip path**, and the zip path validates 128 of 204
   against the html path's 111. Its remaining honest limit is printed on every run: assets
   above the per-file/per-zip size caps are left out and counted, never silently dropped.
2. **Teach the coder the dialect, not the designs.** Fold the conventions above (in our
   own words) into the places the harness already learns from: `docs/SPX_TEMPLATE_FORMAT.md`
   gains a "real-world dialects" section (holders, reserved fields, steps semantics, ftype
   extras, update-drives-IN); the creative pipeline's knowledge cards and the custom coder's
   contract gain the measured motion/type/safe-area numbers where they differ from what we
   teach today (OUT faster than IN and linear-opacity are already house style - the corpus
   confirms them with numbers).
3. **Reality-grounded brief bank.** DONE 2026-08-02. Corpus graphics described as briefs in
   our own words, judged by our own gates and never by visual similarity to the licensed
   originals: the flagship talk-show guest strap (`lt-talkshow-flagship`), the bilingual
   musician strap that alternates languages on a timer (`lt-bilingual-alternate`) and the
   externally-driven live score strip (`vs-live-score`) in `benchmarks/creative/v1/
   briefs.json`; the paging concert programme board (`programme-loop`) in
   `scripts/ai-bench.mjs`, whose bank is deliberately off-catalog. Two of them exist to
   measure something the corpus taught rather than to add volume - the talk-show strap is
   the bank's only brief that asks for the upper half of the ratified 44-92 px name range,
   and the score strip is the "data updates never cause transitions" rule stated as a brief.
4. **Private visual eval set.** FIRST SLICE DONE 2026-08-02. The on-air screenshots plus
   locally rendered corpus frames form a taste-calibration set for human review and the
   vision judge. Local only, like the bench archives.

   `benchmarks/corpus-eval/v1/set.json` is the CURATION and the only part in the repo:
   pairings and our own written observations, no pixels. `node scripts/spx-eval-set.mjs`
   assembles `spx-corpus-out/eval-set/` from it - a review page plus a machine-readable
   `eval-set.json` for a future judge run - by copying each real ON-AIR frame beside OUR
   RENDER of the same template file. Pairing is the point: the on-air frame says what the
   graphic looked like on the channel with real content over real pictures, the render says
   what the same file produces here with default data over a neutral plate, and only the two
   together separate "the design is like that" from "our render of it is like that". A pair
   whose render is missing is reported INCOMPLETE rather than shown one-sided; the renders
   come from `scripts/spx-corpus-gallery.mjs`, which now takes `--only=<substring>` so the
   six pairs refresh in seconds instead of re-rendering 204 templates.

   The first six pairs are one talk show's whole pack (host strap, guest strap, bio board,
   motto board, song requests, credits roll), each mapped to its template by its own
   definition rather than by filename. What the frames show, recorded as observations and
   NOT as rulings - three of them contradict `docs/DESIGN_LANGUAGE.md` and are filed as
   owner questions in the same file, exactly as the production deltas above were:

   - **Every name line is set LIGHT**, where §1 asks for weight 600-800. Hierarchy in this
     pack comes from size and position; nothing is ever bolded to rank it.
   - **The name-to-title ratio is well under §1's 1.8-2.2:1**, with position carrying the
     difference.
   - **There is no accent colour anywhere.** Our catalog treats one accent as the house
     signature; this production treats zero as its own.

   Which RENDERED frames belong in the set is a taste judgement, so `ownerPicks.frames` is
   deliberately empty rather than guessed by an agent.
5. **Feature backlog signals** (each its own product decision, not part of this doc):
   lyrics/subtitle pager (texter), measured marquee overflow as a validated technique,
   wall-clock countdown with day rollover, operator-facing theme field mapped onto our
   `:root` style contract, bilingual auto-switch, external-control API surface (our
   control layer already covers most of this via events - the corpus shows the operator
   demand is real).

## Exemplar index (read these first, locally)

- `templates/softpix/Template_Pack_1.3/NAME_LEFT.html` + `js/spx_interface.js` - the
  canonical modern lower third and the best-documented lifecycle contract.
- `templates/smartpx/elemento-pack/` - CUSTOMIZE.js (colors AND animation params as one
  user-facing contract), README as a model for exposing a design system to non-developers.
- `templates/HKO/Latest/NimiTG.html` - the most sophisticated single template: 4 positions
  x 3 color schemes x uppercase toggle x optional webm x optional Lottie x bilingual
  switch, all from one definition. Plus `js/spx_videoplayer.js` (frame-accurate WebM) and
  `js/spx_animationHelpers.js` (the fadeIn/moveIn/cropIn helper API).
- `templates/RSO-2024-09-26/RSO_otsikko.html` - measure-then-animate shrink-wrap box,
  interruption-safe OUT; `themes/*.css` - the 5-variable theme contract.
- `templates/softpix/RSO/RSO_lopputekstit.html` + `js/endroll_handler.js` - paged
  multi-column credits from one textarea via a text DSL, self-stop via `epochID`.
- `templates/HKO/Latest/MenuLoop.html` - the most ambitious text-DSL parser (prefix
  grammar, sub-pages, measured looping timeline).
- `templates/musiikkitalo/` - hmc_gfx_2.0.1 vs musiikkitalo_0.1.1 vs KEIKAT re-skins:
  a real project's evolution (multi-theme toolkit -> locked brand + richer inline text
  markup) and proof that a token layer carries four brands on identical code.
- `templates/smartpx/Template_Pack_1/SPX1_HEADLINE_2_STEPS.html` - the clearest `steps`
  state machine. (This pack is MIT.)
- `media/*/examples/*.png` - on-air ground truth of the broadcaster's graphics.
