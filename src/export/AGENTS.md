# src/export - export targets & packaging

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate. Exported
packages must be plug-and-play - relative paths, bundled GSAP, no CDN references - and
validation gates every export (root non-negotiables 3 and 4).

Every package preserves `SpxTemplate.resolution` and `fps`. HTML entry points carry the
`noacg-project-format` meta tag for exact round-trip detection; OGraf/LiveOS carry the same
authored-format statement in readable package code/instructions. This is metadata, never
export-time reflow, stretching, or cropping.

- **registry.ts** - 6 targets, each with its own successMessage + ExportContext (the Data
  panel's sampleData rides along so serverless targets can bake it, and the graphic's saved
  control-panel `entries`, which the CALLER resolves - ExportPanel reads them out of the library
  by the working project's `saved.graphicId`, fresh at export time, and they are simply absent
  for a project that was never saved. Only the two targets that bundle an operator page - SPX
  and the HTML overlay - consume them).
- **selfContained.ts** - single-file composer: inline CSS/GSAP/JS/assets/FONTS + extra body
  scripts. ASYNC, because the fonts are fetched to be embedded.
- **bundledFonts.ts** - the one place that knows how a builder font leaves the app. Generated CSS
  always says `url("fonts/<file>")`; there are exactly two ways to honour that, and the package
  shape picks one. A FOLDER package ships the file beside the HTML (common.ts
  `addReferencedFonts`); a SINGLE-FILE package has no sibling to ship to, so `inlineBundledFonts`
  embeds the bytes as a data: URL. Call it AFTER inlineAssetRefs - an imported font is an asset
  and is already substituted by then, so whatever still matches is builder-bundled. A font that
  cannot be fetched THROWS here (the folder writer only skips): nothing downstream fails when a
  face is missing, because `font-display: swap` just paints the fallback, so the graphic would
  play out in the wrong typeface with no error anywhere. That was a real shipped bug in all three
  single-file targets. Pinned by exports.spec.ts, which opens each one alone over `file://` -
  setContent() and srcdoc both inherit the dev server's base URL and hide exactly this class of
  defect.
- **targets/spxStarter.ts** - the one SPX export = spxTarget, id 'spx'; + buildStarterInto,
  reused by the show export. **The template file carries the graphic's own slug**
  (`hairline/hairline.html`, never index.html): SPX rundowns list FILES, and an
  index.html-per-folder package listed every NoaCG template as "index" (real SPX packs name
  every template file - see example_projects/). The show export passes `fileName` so a
  collision-suffixed folder and its file agree (`ticker_2/ticker_2.html`).
- **outputEmbed.ts** - the OUTPUT EMBED: one standalone .html that frames a published production's
  `/output?production=<slug>` URL, downloaded from the production page's Links block beside the URL
  itself (never from the export dialog - it packages no graphics, it IS that link in another
  shape). It exists because an SPX rundown lists template FILES out of ASSETS/templates and has
  nowhere to paste a URL, so the cloud output reached every playout host except the canonical one.
  It is a legal SPX template (definition + the classic play/stop/update/next globals) whose verbs
  move the FRAME only: Play shows it, Stop hides it, and cues stay with the NoaCG operator, because
  the file carries the OUTPUT capability alone - a template that could air a cue would have to
  carry the control slug onto every playout machine. The emitted script is **ES5 with a
  color-scheme meta**, for the two failure modes docs/CLOUD_PLAYOUT.md §3 records: CasparCG 2.3.x's
  ~Chromium 65 CEF rejects the whole file on a `?.`, and Chromium paints a framed page opaque when
  the schemes disagree. `update()` re-points the frame at another production and only reloads on a
  REAL change - a repeat would throw the connection away and rebuild what is on air. Pinned by the
  two embed cases in e2e/productions.spec.ts, which run the generated file for real.
- **onAirGuide.ts** - GETTING-ON-AIR.md, the playout-side quick guide bundled into the SPX,
  CasparCG, HTML-overlay and show packages (condensed from docs/PLAYOUT_INTEGRATION.md - keep
  them in agreement). It carries the control panel's connectivity truth: BroadcastChannel is
  origin-scoped, so the panel pairs only over one http(s) origin in one browser - never over
  file:// (private opaque origins) and never into OBS/vMix/CasparCG's own engine.
  **IT ONLY DESCRIBES WHAT THE CALLER ACTUALLY BUNDLED** (`onAirGuideMd({ localController })`,
  acceptance round 2): one text served every flavour, so a CasparCG or SPX package - which
  carries no relay ON PURPOSE - told its reader to double-click a "Start controller.cmd" that
  was never written into it. A guide that names a missing file reads as a broken export. The
  no-launcher flavours instead say what DOES steer them and point at the overlay target for a
  double-click operator page; the launcher FILENAMES appear only in packages that carry them,
  which is what `e2e/exports.spec.ts` asserts by absence. **The operator page is the same rule
  and has its own option** (`controlPanel`, added 2026-09-04): the caller passes the panel's
  path as its reader would type it from where the guide sits, and passes nothing when the
  package has none - OGraf, LiveOS and H2R bundle no panel, a show root has
  `show_controlpanel.html` while the per-graphic ones are a folder down, and `buildShowZipFor`
  READS which case it is off the files it just wrote rather than off the target id. The first
  cut of that section was unconditional and told an OGraf package's reader to open a
  `controlpanel.html` that was nowhere in the zip.
- **fieldReference.ts** - FIELDS.md, the package's DATA CONTRACT: the ID/field/type/default
  table plus dropdown values, filelist/checkbox/hidden notes, the steps line, buttons, and
  paste-ready JSON + CasparCG `componentData` payloads built from the graphic's OWN ids.
  `casparClientStepsMd` is the **CasparCG Client** walkthrough (the official SVT client, which
  is what the owner's students use): find the template in the Library, drag it into the
  rundown, set the video layer to the number the graphic declares, fill the key/value grid with
  IDS not names, then Play/Update/Next/Stop. It carries THAT graphic's own template name, layer
  and default values, so the steps are followed rather than adapted - a student who has never
  sent a CG command cannot turn `CG 1-20 ADD …` into "which box do I type the name in". The
  AMCP form stays below it for another client, a script, or a bug report. It ships in the two
  packages a CasparCG server actually receives (the CasparCG target and the SPX folder package,
  which the README tells you to drop into an SPX **or** CasparCG templates directory) and
  nowhere else - on a host that shows the fields by name, the steps would be noise.
  **Every package ships it** - all six single-graphic targets and both production builders -
  because a playout client speaks ids (`{"f0": "…"}`) and nothing on its screen says which id
  is the title. `showFieldReferenceMd` is the production edition: an index of every graphic by
  its playout layer, then one table each. One generator for all of them, so a package's
  documented ids can never disagree with the ids it ships.
- **localControl.ts + local-relay/** - the LOCAL-CONTROL bundle the overlay flavors ship
  (single overlay + the production overlay package): relay.ps1 (Windows PowerShell 5.1) and
  relay.py (python3), TWO stdlib implementations of ONE versioned protocol (v1: /relay/ping,
  /relay/head, /relay/log?after=N, POST /relay/send, static files from the package root,
  rows persisted to relay-log.jsonl), plus double-click launchers per OS and payload.json
  (the package manifest). The panel gains a relay SEND transport (controlPanelHtml
  `sendRelay`, probe on /relay/ping) and every overlay graphic carries the relay RECEIVER
  (control/localReceiver.ts - polls the log, `?stream=` aware, inert over file:// or plain
  static hosting). This is the only route into a graphic loaded by OBS/vMix's separate
  browser engine. Both servers are conformance-tested for real by
  `npm run test:local-relay` (scripts/local-relay.test.mjs - keep protocol changes in BOTH
  implementations and that harness); the browser ends are pinned by e2e/local-relay.spec.ts
  against an in-spec v1 implementation. SPX/CasparCG packages carry NO relay on purpose -
  the playout host is the controller there.
- **targets/htmlOverlay.ts** - OBS/vMix browser source: an autoplay block fills fields from baked
  sampleData -> definition defaults, then play(). An auto-out `out` = N ms setting rides
  along: the block measures the entrance from a paused throwaway timeline and schedules
  stop() at entrance + delay (the bundled control panel's Stop still works sooner). Receiver
  + controlpanel.html bundled.
- **targets/h2r.ts** - H2R Custom HTML: GDD block from DataFields + play()-toggle shim.
- **targets/casparcg.ts** - selfContained + JSON/XML data shim. Receiver + controlpanel.html
  bundled (`inlineAssets`, because the package is one file). **It carried neither until
  2026-09-04**, so the standalone panel could not pair with a CasparCG package for ANY graphic -
  the file it looked for was not in the zip. That read as an imported-design defect because the
  imported board was measured against a catalog graphic exported to a DIFFERENT target; commit
  3ed7793a carries both the correction and the fix. A CasparCG server drives
  through its own client and needs none of this; the panel is what a room falls back to when the
  playout machine is not there, which is the whole reason the package carries it.
- **targets/ografSchema.ts** - THE CONFORMANCE GATE, and the reason "we export to the EBU's open
  standard" is a checkable claim rather than a slogan. The published manifest schema is seven
  JSON-Schema files; they are transcribed here as a validator (one function per schema file, same
  names, so a spec revision is a readable diff) because shipping a JSON-Schema engine for one
  manifest is the no-unnecessary-dependencies rule read backwards. Two rules it exists for, both
  silent when broken: EVERY object in the spec is `additionalProperties: false` with a
  `^v_.*` escape, so any field we invent that is not `v_`-prefixed invalidates the whole
  manifest; and `gdd/basic-types.json` types a property's `default` BY ITS DECLARED TYPE, so a
  checkbox declared `"type": "boolean"` carrying the SPX string `"true"` is invalid - a host
  either rejects it or coerces it into something else on air. `validateOgrafPackage` is the
  dangling-refs doctrine for OGraf: a `main` (or thumbnail) the package does not contain fails at
  the renderer as a network error the operator reads as "the graphic is broken".
  It also carries the ONE rule that is not in the schema: the manifest `id` must be something
  `customElements.define` accepts. A renderer may register the Graphic by its id (SuperFly.tv's
  OGraf server does), and the HTML standard wants a leading ASCII lowercase letter plus a hyphen -
  so `hairline` is a spec-valid id that no browser can register, and the load fails before the
  Graphic is mounted. That is why ids are `noacg-<slug>` (`ografGraphicId`).
  `addOgrafPackage` runs BOTH - manifest before writing, package after - so every target built on
  it inherits the gate. Coverage is `e2e/ograf-conformance.spec.ts`, which sweeps the WHOLE
  catalog in all three export intents (a single category's field mix can be the only invalid one)
  and mutation-tests the validator itself.
- **targets/ograf.ts** - EBU OGraf v1: manifest from DataFields + graphic.mjs Web Component;
  AMD-guarded gsap loader. Export intent maps to live/non-real-time manifest capabilities.
  The manifest also declares `renderRequirements` (the authored canvas + fps as `ideal`
  constraints - a statement of what it was designed for, never `exact`, which would tell a 1080p
  renderer to refuse a 4K-authored graphic) and `actionDurations` MEASURED off the graphic's own
  NOACG_ANIM timeline (entrance, per-step, exit; speed-corrected to ms) so a host can pre-roll a
  take. A custom action's duration is `-1` (the spec's "dynamic") because it depends on the
  machine's current state, and a template whose timeline we cannot read emits no durations at all
  - the spec's answer to unknown is silence, not a guess.
  Three MUSTs of the Web Component contract live in the generated class, and each is invisible
  when missing: `skipAnimation` lands an action instantly (via the template's OWN `noacgSnap`,
  which composes a state's settled pose with callbacks suppressed - so a skipped play is
  pixel-identical to a finished one), every action runs through ONE serial chain because the spec
  forbids ignoring a call that arrives while a previous one is pending, and no action ever
  rejects: too early or after `dispose()` answers `409`, an internal failure `500`. A renderer
  can log a status code; it cannot log an unhandled rejection.
  THREE MORE, the first two found only by loading a package into a renderer we did not write
  (docs/OGRAF.md "What an external renderer said", 2026-08-18) and the third in the checker round
  after it, because a Graphic is a COMPONENT INSIDE SOMEBODY ELSE'S DOCUMENT while under SPX the
  template IS the document - which is why the local specs and the SPX targets could never see any
  of them. Relative asset references in the injected CSS/markup are
  resolved against `import.meta.url` (`withPackageUrls`) - a package-relative `fonts/x.woff2` was
  fetched from the RENDERER's directory, 404'd, and `font-display: swap` aired the graphic in the
  fallback face with no error anywhere. And the template's runtime is handed a `document` SCOPED
  to its own element (`scopedDocument`, passed as the `document` parameter of `initTemplate`, so
  the template's code text is still untouched) - the field convention is `getElementById('fN')`
  with the same ids in every design, so with two graphics on two layers of one renderer, updating
  one rewrote the other. `dispose()` kills tweens on its own subtree for the same reason. And the
  template's STYLESHEET is re-addressed from the document to the element before injection
  (`scopeCssToGraphic`): `html, body` and `:root` become the element, `*` its subtree, every other
  rule is nested under `:where([data-noacg-graphic=<id>])` at zero specificity - the attribute
  `_claimCanvas()` stamps at load, beside `GRAPHIC_BOX_CSS`, which makes the element the canvas
  (`display: block; position: relative`, the authored box, clipped). Injected as written, the
  starters' `body` rule forced the RENDERER's page to 1920x1080, hid its overflow and changed its
  font, and two layers fought over it. The scoped `document` answers `body` and `documentElement`
  with the element for the same reason - the studio's `--scale` reads and `body.clientWidth`
  measure the canvas, not the host page. Pinned by `e2e/ograf-conformance.spec.ts` (host page
  untouched, frame pixel-identical to the studio document, every catalog sheet scoped).
  The broadcaster-facing summary is `docs/OGRAF.md` - keep it in agreement with this target.
  Non-real-time seeks rebuild an isolated document and replay the OGraf action schedule through
  `render/runtimeScript.ts`'s virtual clock, so timestamp order cannot leak state. The target's
  conservative compatibility gate must pass before `supportsNonRealTime` is advertised.
  `addOgrafPackage` is reused by **targets/liveos.ts** in explicit live-only mode - LiveOS's HTML5
  graphics engine is OGraf-compliant, so that target is the same live package with NetOn.Live
  install steps in the README.
- **showExport.ts** - whole SHOW -> one zip: a Starter folder per graphic + ONE aggregated
  show_controlpanel.html (a card per graphic, each on its own channel). Each graphic's saved
  control-panel ENTRIES are resolved out of the LIBRARY at export time (model/library.ts
  `entriesForSavedGraphic`, by graphicId with a unique-name fallback - the SAME resolver the
  hosted control page uses) and baked into both the aggregated panel and each graphic's own
  controlpanel.html; entries are never embedded in the show, so there is no persisted-shape
  change to migrate (docs/SAVED_CONTENT_MODEL.md §4). **Two playout rules it owns
  (student-release acceptance, 2026-08-05): NO hosted receiver, published or not** - the
  package is the offline door and SPX/CasparCG are the controller; a baked log follower's boot
  recovery snapped graphics to their last reported (off) state right after the host's play()
  ("flashes in and disappears" on real hardware; cloud-driven browser sources are the
  HTML-overlay flavor's opt-in job) - **and DISTINCT playout layers per pool graphic**
  (`showGraphicLayer`: 5 + pool index, capped at SPX's webplayout 20), because every generated
  template declaring playlayer '7' meant two templates in one rundown evicted each other.
  **`buildShowZipFor(show, targetId)` is the production TARGET PICKER's build** (the
  acceptance round's "couldn't choose the platform"): 'spx' keeps the dedicated builder
  above; every other registry id runs the generic merge - each pool graphic goes through the
  per-graphic `target.build()` VERBATIM (so a target fix reaches the production package by
  construction) and the files merge under one show folder, with the same playout rules
  applied through `exportTemplateFor` (live template, receiver strip, layers,
  collision-suffixed names). The overlay flavor adds the aggregated show_controlpanel.html
  (inline assets); the UI is components/home/ProductionExportDialog.tsx, opened from the
  production page and the Home row, validation-gated per graphic (non-negotiable 4).
  **The gate lives in the BUILDERS** (docs/AGENT_SAVE.md §4): `buildShowZip` and the generic
  branch of `buildShowZipFor` both call `assertProductionGate` (validation/productionGate.ts -
  `publishGate` per pool graphic over the live library template) before packaging, so an
  invalid graphic cannot export whoever calls them; the dialog shows the SAME verdict
  (`productionGateFailures`), never a second opinion. The edge is `export -> validation`,
  `productionGate` only (docs/ARCHITECTURE.md §3). Pinned by e2e/production-gate.spec.ts.
- **noacgPackage.ts** - the DUAL graphic package (docs/AGENT_CLI.md): ONE folder that is both the
  SPX starter layout (`<slug>.html`, `css/template.css`, `js/template.js`, `js/gsap.min.js`,
  images/, fonts/ - the editable SOURCES) and a valid OGraf v1 package (`<slug>.ograf.json` +
  `graphic.mjs` - GENERATED, never edited). `addGraphicPackage(root, template, {thumbnail?})`
  builds the SPX half with `buildStarterInto`, reads the three source files back, and hands the
  OGraf exporter `lib` paths pointing at the shared `js/` copies (so the package carries ONE
  gsap) plus the `v_noacg` vendor block; `buildGraphicPackage` zips it under `<slug>/`. The
  agent workspace, the bridge's `exportPackage`, and the Import door's round trip all use it.
- **targets/ograf.ts `v_noacg`** - the manifest's only NoaCG-specific content, all under the
  spec's `v_` vendor prefix and ignored by every renderer: per-property `v_noacg.kind` (the
  control kind the JSON-schema type collapsed), per-action `v_noacg {section, destructive}`,
  and at the root `noacgVendorBlock()` = `{format:'noacg-graphic', version:1, type, source
  {html,css,js}, sourceHash, generator}` when the package ships sources. `thumbnails` is written
  only when the caller supplies a raster (the CLI's settled on-air shot; the in-app export
  ships none).
- **targets/ografImport.ts** - the READER: `readOgrafPackage(files)` finds the shallowest
  manifest, validates manifest + package, reads `v_noacg` (`readNoacgVendorBlock`), compares the
  recorded `sourceHash` with the shipped sources (`stale`), and derives the operator contract for
  ANY manifest through `control/ografContract.ts`. A package without `v_noacg.source` is a
  third-party graphic: validated, inspectable, hostable in the bench - not importable as a
  template (future, docs/AGENT_CLI.md).
- **common.ts** - addSharedAssets, addReferencedFonts, injectControlReceiver + addControlPanel,
  `fonts/FONT_LICENSES.md` (beside the bytes, not at the package root - see below).

## Font licensing (the rule: the licence follows the BYTES)

The seven bundled faces are OFL 1.1. §2 requires every redistributed copy of the font software
to CONTAIN the copyright notice and the licence - as a stand-alone text file, a human-readable
header, or readable metadata. A LINK satisfies none of those, and §2 is triggered by
REDISTRIBUTION, not by sale, so the product being free does not retire it. The binaries have
name ID 13 stripped and an empty WOFF2 metadata block, so there is no in-binary fallback either.

`src/assets/OFL.txt` is the single source: the full licence plus all seven copyright lines. It
sits in `src/assets/` beside the other bundled-and-inlined sources rather than next to the fonts
in `public/`, because Vite refuses `?raw` imports out of the public directory. It is imported
into `model/fonts.ts` as `FONT_LICENSE_NOTE` (stand-alone form) and `fontLicenseComment()`
(header form), and read from disk by the two build scripts that embed font bytes. Two
consequences worth remembering:
`addReferencedFonts` keys the notice off the BYTES in the package (CSS refs OR a font in
`template.assets`) rather than off a regex match, and a surface that embeds fonts and cannot
ship a sibling file - a single-file export, the player host, the generated worker CSS - carries
the header instead. exports.spec.ts asserts every package that ships font bytes also ships the
text.

The stand-alone copy goes at **`fonts/FONT_LICENSES.md`**, inside the folder it licenses rather
than at the package root, so that the licence survives someone lifting `fonts/` into another
project - which is exactly the redistribution §2 is about. It moved there on 2026-08-29: the
ograf.dev package checker's S-07 and A-03 both look for a licence path under `fonts/` and cannot
see a root file, so every NoaCG package read as an unlicensed font drop while carrying a
perfectly good notice one directory up. Assert the TEXT, not the path, when testing this.

## Packaging conventions

- Asset paths: uploads land at `images/<file>` (fonts at `fonts/<file>`); the export zip wraps
  everything in one project folder, so extracting into a templates folder yields
  `[TemplatesFolder]/<project>/<project>.html` + `<project>/images/<file>` - the layout SPX and
  CasparCG expect. Both of those exporters use `zip.folder(slug(name))`.
- Uploads are base64 data URLs in `template.assets[]`; the preview inlines them, the exporter
  decodes them to real files. The Assets panel may nest ONE user folder inside a bucket
  (`images/logos/<file>`) - every writer zips `asset.path` verbatim, so nesting flows through.
- Lottie: a template that uses a Lottie animation (detector `assets/lottieSupport.ts`) ships
  the bundled player - `js/lottie.min.js` in folder packages (addSharedAssets), inlined in
  single-file targets, `lib/lottie.min.js` + an `ensureLottie()` loader in OGraf packages,
  where the embedded TEMPLATE_HTML also gets its `.json` assets inlined as data: URLs (an
  embedded string has no base URL to resolve a relative path against). The generated
  bootstrap decodes data: URLs inline (atob, no fetch), so single-file exports play from
  file:// too; the folder starter keeps the real `lottie/<file>.json` and plays over http
  (SPX's normal serving mode).

## The dangling-reference defect class

Referred to across the repo as "the dangling-refs doctrine"; this is it.

> A generated artifact carries a RELATIVE reference to a resource that the packaging step for
> THAT artifact does not place where the reference resolves at its destination - and nothing
> fails loudly, so the output degrades quietly instead of erroring.

Check for it in every new export or packaging surface. Three real instances shipped before the
class was named (all fixed 2026-07-20, all found by measurement rather than review):

1. **Fonts in single-file exports.** casparcg/h2r/htmlOverlay emitted `url("fonts/x.woff2")` and
   shipped no font file. `font-display: swap` painted the fallback, so graphics played out in the
   wrong typeface with no error anywhere. `bundledFonts.ts inlineBundledFonts` embeds the bytes,
   and a font that cannot be fetched now THROWS rather than degrading.
2. **The overlay's baked logo erased itself.** `composeSelfContainedHtml` ran `inlineAssetRefs`
   over html and css but NOT over the appended scripts, and the overlay bakes sampleData into a
   load handler. A filelist field's value is an asset path, so `update()` on load overwrote the
   correctly-inlined data URL with a dangling path: the logo painted on frame one, then vanished.
3. **The overlay's control panel offered unresolvable images.** Its picker listed asset PATHS
   beside a package with no `images/` folder. Fixed by separating label (the path, what the
   operator reads) from src (the data URL, what paints) from value (a path beside a folder
   package, a data URL beside a single-file one - `renderControlPanelHtml(…, { inlineAssets })`).

**The existing e2e suite could not see any of them**, because each one renders successfully. The
gate is `e2e/exports.spec.ts`, which walks every relative reference in all six targets over
`file://` and fails when one does not resolve inside its own package.
