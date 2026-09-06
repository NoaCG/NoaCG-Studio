# src/model - the data layer

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate.

- **durableStore.ts** - WHERE THE SAVED DOCUMENTS LIVE, and the one place that decides it:
  IndexedDB behind a synchronous in-memory mirror. It replaced localStorage, whose ~5 MB origin
  quota filled after about ten graphics (base64 +33% x UTF-16 x2 x the duplicated Reset
  baseline: a 150 KB logo cost ~820 KB); a desktop profile now reports gigabytes. It does NOT
  replace the Supabase backend - that is the server layer an account unlocks, and the product
  wants both. `DURABLE_KEYS` is the explicit list of what moved (graphics, shows, both working
  slots, saved videos, looks, the retired packet store); it is a list rather than an
  `spx-gfx-` prefix rule so moving a key stays a decision with its hydration-order consequence
  thought through. Everything else - prefs, layout, doc kind, brand, AI settings, sync metadata
  - stays in localStorage: kilobytes, read before hydration by design, and seeded by E2E init
  scripts that cannot reach IndexedDB.
  Three contracts every save path depends on. **Reads are synchronous** (the mirror), so no
  signature in this directory changed; the ONE async step is boot, and `src/main.tsx` must
  hydrate BEFORE importing App, because store/templateStore.ts reads the autosaved project at
  module scope. **A write is confirmed after the call returns**, so a refusal is not that
  call's return value: a caller that branches on it awaits `commitDurableWrites()`, which
  CLAIMS the message (the claim protocol - awaiting the chain resumes on a microtask, the
  generic announcement is scheduled as a macrotask, so a claimer always wins) and reports it in
  its own words; unclaimed failures reach App.tsx as `spx-storage-error`. **A refused write
  rolls the mirror back** and never latches - the library must not go on serving an edit no
  reload would reproduce, and a "the store is full" flag that short-circuits the next write
  deadlocks exactly the write that would clear it. A browser with no IndexedDB, or one holding
  a database written by a NEWER build, degrades to localStorage with the old ceiling rather
  than crashing or downgrading anybody's data.
  **The mirror is PER TAB, so a landed write ANNOUNCES its key** (`BroadcastChannel`) and the
  other tabs re-read that one key and dispatch `spx-data-changed`. Without it two tabs on one
  production ate each other's work, and it needed no second person: every mutator in this
  directory is a read-modify-WHOLE-RECORD write (`patchShow` = loadAllShows -> mutate -> save the
  lot), so a tab holding a mirror from before another tab's write put that old record straight
  back. Reproduced 2026-08-21 - a table authored in a second tab was gone from the database after
  any cue edit in the first. It CLOSES the hazard rather than eliminating it: the re-read is
  async, so a write in the milliseconds before it lands can still win. Removing that last window
  means writing through the DATABASE rather than the mirror, which every synchronous reader here
  is built against. `e2e/cross-tab.spec.ts` pins it, and reads back from a THIRD, fresh tab -
  reading in the first proves nothing, since its mirror never saw the write either way.
- **types.ts** - SpxTemplate (html/css/js + parsed definition - the canonical unit), AssetFile,
  DEFAULT_SETTINGS, plus compatibility re-exports from projectFormat.ts.
- **projectFormat.ts** - the ONE authored-format registry: stable resolution preset IDs,
  aspect groups, FPS values/labels, graphics/video defaults, validation, and exporter capability
  notes. Creation UI and managed AI validation consume it; do not add a second resolution list.
- **spxDefinition.ts** - parse/serialize the `window.SPXGCTemplateDefinition` block inside the
  template HTML.
- **structure.ts** - detectPrefix/countLines + getTemplateParts, the TemplatePart registry: THE
  shared element-identity contract. Numbered sibling families are recognised the same way the
  quiz's `.<prefix>-option-N` rows are: `.<prefix>-level-N` (the alert category's severity
  blocks) each become their own part, labelled by the level word they carry, because the level
  machine gives each one its own opacity track and one shared class matching four elements has
  nowhere to put four different values. DOM-derived `{selector, kind, label, channel}`, single-token
  selectors only. Timeline labels, canvas selection, and step assignment must all name elements
  through it. A masked text line is recognised under ITS OWN graphic's prefix: the host's, or an
  INSERTED graphic's namespaced one (a `data-gfx` root carrying its own `-box` -
  blocks/templateInsert.ts). Such parts carry `inserted: true`, which is how they can be full
  registry parts (selectable, animatable, named by their field titles) while `countLines` - "how
  many lines does THIS design have", what the preset emitters size choreography from - keeps
  counting the host's only.
- **taxonomy.ts** - the DISCOVERY facet registries (docs/TEMPLATE_TAXONOMY_PROPOSAL.md): stable
  kebab-case ids + display labels for programme families/formats (each format carries the
  VERBATIM workbook `sheetName` packs.ts uses), the 27 graphic categories (controlled
  subtypes, coverage class, `relevance: 'all'`) and their TEN CATEGORY GROUPS (the browse
  shelves — `CATEGORY_GROUP_OF` is total over GraphicCategoryId, the PRESET_MOTION pattern,
  so a new category cannot ship without a browse home; groups are browse furniture ONLY and
  never select playout behaviour), structures, field semantics, capabilities,
  placements, the per-preset motion intensity/style table (total over AnimPresetId — a new
  preset without a row is a type error), style-family labels, and the search alias table
  (aliases resolve to SETS of facet values). **The alias table is THREE declared tables —
  `ALIASES_EN` / `ALIASES_SV` / `ALIASES_FI` — merged into one `ALIASES` with their keys
  folded through the exported `normalizeSearchText`**, the same fold `templates/search.ts`
  runs over a typed query: that is what lets a locale table be written in the spelling people
  actually type ("ämne", "siirtymä") and still be found. Colliding keys UNION their targets;
  they never overwrite. Two rules when adding one: a key that is also an English word the
  catalog uses will DELETE that word's text matches (alias expansion consumes the phrase), and
  a purpose word must fan across every FORM that serves it, since a category says what a
  graphic is and never what it is for (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §20.3).
  **`OCCASIONS` is FACET I - the MOMENT a graphic is for** (§21, shipped 2026-09-06): a closed
  five-value vocabulary on the show's own clock (`pre-show`, `coming-up`, `break`,
  `technical-problem`, `sign-off`), each declaring the PHRASES a confused person types. The
  phrases are folded into `ALIASES` automatically, so the declaration IS the search behaviour and
  a phrase cannot fail to reach its occasion. **The rule for admitting a new one is written next
  to the list and GATED** by `validateTaxonomy` (ceiling 8, floor 3 designs, every phrase
  resolving); the axis is a clock, so a value that is not a MOMENT - a form, a show type, a look -
  has nowhere to sit. Which designs carry which moment is declared in src/templates/meta.ts, not
  here. Pure data; derivation lives in
  src/templates/templateMeta.ts, the browse engine in src/templates/search.ts.
- **designRules.ts** - the CANONICAL on-air legibility rules (docs/DESIGN_RULES_PLAN.md): the
  owner's size table (role x standard/safe mode x viewing profile, % of the frame's short
  side), weight/stroke/safe-area/contrast floors, the prompt blocks GENERATED from those
  constants, and the per-project `ProjectLegibility` settings (viewing target + the
  'relaxed'/'safe' floors tri-state; `normalizeLegibility` makes the default serialize to
  NOTHING). Prompting, the spike instruments and the product validator's warn-first checks
  (validation/designRulesWarnings.ts) all READ this module; nothing copies a number. Math
  pinned by `scripts/design-rules.test.mjs` in the build gate. Extend additively.
- **wizard.ts** - a RE-EXPORT SHIM, kept for one landing (docs/WORKFLOW_ARCHITECTURE.md §5.5,
  domain row 1). The template contract it held - categories, variants, WizardOptions, palettes,
  field plans - lives in templates/contract.ts, and the Import-graphic shapes (`DesignSvg*`,
  `DesignArt`) in templates/importedDesign/designTypes.ts; read those contracts there. Every
  importer in this directory takes types only. The next landing rewrites the importers to the
  new paths and deletes the shim.
- **fonts.ts** - bundled OFL typeface registry + CustomFont import helpers. Each face carries
  **`tabularFigures`**, MEASURED by `scripts/numerals.mjs --fonts` and never declared by hand:
  six of the seventeen bundled faces render uneven digits even under
  `font-variant-numeric: tabular-nums`, which is why `numericFontStack` exists and why a blanket
  declaration was not the rule (DESIGN_LANGUAGE §1). Measured ACROSS a face's weight range -
  Oswald's digits are even at 400 and span 16% of the em at 700, the weight every sport
  scoreboard sets them at. An imported face is measured at import
  (`registerAndMeasureFont`); an absent flag reads as "cannot".
  Each non-tabular face also declares **`numericFallbackId`** - the bundled sibling its numbers
  are set in instead, sharing a style family so the voice survives (Oswald -> Saira, Playfair ->
  Source Serif 4, DM Sans -> Outfit). Paired by hand, because every heuristic picked badly: by
  registry order a scoreboard gets the wrong width, by fallback stack Oswald gets a face that
  only exists at weight 400. Mono is the last resort, for an imported face with no pairing.
  **Any face a variable points at has to SHIP.** `ensureFontFace` is that guarantee and every
  path that can retarget a typeface calls it: `templates/shared/base.ts` at build,
  `ensureNumericFontFace` on a typeface swap or a look applied to an existing graphic, the
  wizard's `buildDraftTemplate` for `cssVarOverrides` (applied AFTER the build, so the build
  cannot cover them), and the editor's `setVar`. Skip it anywhere and the export references
  bytes nobody wrote, which `font-display: swap` hides until playout. `fontByStack` reads a
  `font-family` value back to its bundled record, which is what lets those paths ask.
- **styleVocabulary.ts** - the WORDS and ranges the two style surfaces render: the role label
  for each `:root` variable (a user-facing name, never CSS jargon), the group it belongs to,
  which tokens are lengths and over what range, the shadow presets, and the two size ladders.
  It exists because the wizard and the editor had each written those separately and disagreed -
  most visibly the S/M/L ladders, where a graphic sized L in the wizard read as something else
  the moment the Style panel opened.
- **themeTokens.ts** - the SHAPE half of the `:root` style contract, and DESIGN_LANGUAGE §8's
  family table in code: panel blur/radius/shadow/keyline, accent weight/glow/ink, the label
  face + tracking + colour, display weight + tracking, with values for all four `StyleTag`
  families. `resolveTokens(family, ...overrides)` layers a design's disagreements over its
  family; **that override map is conformance debt, and its size is the metric** (§8's own rule
  is "reuse the exact token values, don't improvise per category"). `tokenVarsCss` emits ONLY
  the tokens the consuming stylesheet actually reads - same no-dead-knobs doctrine as the
  imported design's missing `--type-scale`. Values are complete CSS values (`calc(18px *
  var(--scale))`, `none`, `50%`), never bare numbers, so one token covers a scaled length, a
  keyword and a percentage without the consuming rule knowing which it got. Shadow-slot
  neutral is `NO_SHADOW` (`0 0 0 0 transparent`), because these compose into comma-separated
  `box-shadow` lists and `none, none` is invalid CSS. **`accentInk` is `var(--panel-bg)` in
  three families and a LITERAL dark in glass** - the other three panel on a near-black, so
  their panel colour doubles as the ink for text sitting on an accent fill, while a glass
  panel is `rgba(255,255,255,0.10)`, a translucent WHITE. Resolving the ink to that made every
  glass design that floods a chip render its text invisible (it shipped that way in qz03's
  answer chip). An ink also has to be OPAQUE: a translucent one washes out over a coloured
  chip even at the right hue. Deliberately absent: density (unmeasured,
  genuinely per-design), the sport skew (`skewX(0deg)` is not inert - it makes a stacking
  context), and motion feel (it lives in the NOACG_ANIM block, not in CSS).
- **csv.ts** - the shared CSV/TSV/JSON table READER (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 7),
  no dependency. It is a real RFC-4180 state machine rather than a `split(',')` because a
  spreadsheet export carries quoted commas, quoted NEWLINES and doubled quotes, and a split gets
  all three wrong QUIETLY - the table looks imported and is wrong on air. Also: separator
  detection (a semicolon export must not become one fat column), a UTF-8 BOM stripped before it
  becomes part of the first column LABEL, and JSON in the two shapes people actually have -
  anything else is refused with a reason, never coerced. `importShowDataset` (shows.ts) lands
  the result as an ordinary editable dataset; there is deliberately no link back to the file.
  Gate: `scripts/csv.test.mjs`, in the build.
- **brand.ts** - the BRAND's payload shape (`ProjectBrand`: palette, typeface, shape tokens, plus
  the additive-optional `logo` asset and `notes`) and WHICH brand is the default. A brand IS a
  saved look (packets.ts), so the anonymous singleton that every wizard Create used to overwrite
  is retired: `defaultBrandId` ('spx-gfx-default-brand') POINTS at one, and `loadBrand()` -
  which lives in packets.ts beside the store it reads, or the two modules form an import cycle
  the dependency gate refuses - resolves it. The old 'spx-gfx-brand' key is never written by the
  app again, only READ (`legacyBrandOffer`, and captureLookFromTemplate's style-family fallback)
  and carried by the sync seam. `MAX_BRAND_LOGO_BYTES` is measured against real 512 px marks,
  not chosen.
- **aiThread.ts** - the Create-with-AI CONVERSATION a graphic was created from (the talk turns
  of components/wizard/steps/AiStep.tsx), captured at create so the graphic carries the reasoning
  that produced it. Persisted BESIDE aiSpec as `SavedProject.aiThread` / `GraphicDoc.aiThread`,
  both ADDITIVE OPTIONAL - rule 6 says additive fields never bump the version, so it rides the
  sync record exactly as aiSpec does (NO version bump, no migration). Only the talk turns travel;
  the wizard's heavy per-generation "Bring back" snapshots are a session affordance the editor
  can't show and would be quota-heavy to persist. `normalizeThread` is the migrate-on-read guard
  (unknown version -> "no thread", never a crash). Shown read-only in the editor's AI panel
  (components/AIPromptPanel.tsx).
- **imagePurpose.ts** - what an uploaded picture is FOR, in ONE place so the SPX card, the video
  card and both prompt builders cannot drift: `asset` (use it as it is - the only purpose that
  BUNDLES, plus the fixed/swappable `AssetBinding`), `layout` (make one like this), `mood` (take
  the look and feel), `plate` (make it work over this). Labels and hints live here too, because
  they are the words the user reads on every surface. `guessPurpose` is the deterministic
  preselect (probeAsset - alpha + a small footprint is a mark) and deliberately guesses ONLY
  between `asset` and `mood`: the other two are intents no pixel reveals. Lives in the model
  layer for the same reason generationSpec.ts does - VideoProject PERSISTS it as `assetUses`,
  and model imports nothing above layer 0.
- **generationSpec.ts** - the AI "More control" panel's user-authored GenerationSpec (category
  id union, SpecFieldDef on FieldKind, fonts as CustomFont choices, animation intent incl. the
  intensity->speed x easing map) + the cross-session draft ('spx-gfx-ai-spec-draft'). Lives HERE
  (not src/ai) because SavedProject and GraphicDoc persist it as `aiSpec` (additive optional);
  the category REGISTRY that interprets it is src/ai/spec/categories.ts. Version-1 migrate-on-read
  via normalizeSpec; an unknown version degrades to "no spec", never a crash.
- **graphicDoc.ts** - the PURE half of the library record: `GraphicDocBase<spec, thread,
  legibility>` (the shape generic over the three app-only payload types, plus the additive
  optional `origin {tool, version}` - provenance of an agent-saved graphic, never proof of
  anything), `newGraphicDoc(template, {id?, now?})` and `isGraphicDocShape` (a shape check that
  never executes template code). ES2020-safe with no storage imports, so a server function and
  the CLI can mint/check the same record `library.ts` persists (docs/AGENT_CLI.md).
- **contentHash.ts** - `sourceHash({html, css, js})`: the FNV content hash of a template's three
  sources, recorded in a dual package's `v_noacg.sourceHash` so a generated OGraf half can be
  told stale from fresh (export/targets/ografImport.ts). `importTemplate.ts` peeks the same
  block on a zip import: the shallowest `*.ograf.json`'s `v_noacg.type` restores the graphic TYPE
  (else `blank`, as before) and its `stale` flag rides on the result - nothing else about the
  import lane changed.
- **library.ts** - the FLAT graphics LIBRARY (docs/SAVED_CONTENT_MODEL.md): every durably
  saved graphic is ONE `GraphicDoc` with a STABLE uuid (durable key 'spx-gfx-graphics', sync kind
  'graphic', supabase migration 0009) - template + baseline + the control panel's `entries`
  (`ControlEntry` named data rows) + `activeEntryId`, plus the AI provenance `aiSpec` +
  `aiThread` (both ADDITIVE OPTIONAL - version stays 1). `packageId` is DEPRECATED inert data
  (packages retired - docs/GOALS_ARCHIVE.md "Student release" step 3; not nulled, because rewriting
  the whole library would storm sync). Packet conventions (updatedAt LWW, tombstones).
  `migrateEmbeddedGraphics` still extracts a legacy v1 packet's embedded graphics into the
  library UNDER THEIR OWN ids (convergent across devices); it runs on every loadAllGraphics.
- **packets.ts** - LOOKS ('spx-gfx-looks', captureLookFromTemplate/applyLookToTemplate) plus
  the RETIRED package store's read seam: no UI reads or writes packages and the 'packet' sync
  kind is gone (rows stay inert); what remains is loadAllPackets + upsertPacket for
  library.ts's v1 extraction, and the `SavedGraphic` shape shows.ts pools reuse.
  **A look carries SHAPE as well as colour** (`ProjectBrand.tokens`, additive optional - no
  version bump, no migration): radius, blur, edge, lift, accent weight and glow, the kicker
  face and both trackings, the heading weight. Colour and typeface alone never made one design
  read as another's sibling - a glass card and a sport slab share a palette and still look like
  two products, because what separates them is the shape. Two rules keep it honest: `setIf`
  writes only a token the RECEIVING design already declares, so a look can never graft a
  variable onto a design that consumes none (the dead-knob failure `tokenVarsCss` exists to
  prevent); and `--font-numeric` is deliberately NOT captured, because it is DERIVED from the
  typeface in use and carrying it would push the source's numeric face onto a target whose own
  face needs a different answer. A carried `--font-label` goes through `ensureFontFace`.
- **shows.ts** - the PRODUCTION unit (docs/CLOUD_PLAYOUT.md + docs/CONTROL_LAYER.md; the UI word
  is "production", the old "rundown"): the graphic POOL (name-keyed, one renderer instance each)
  plus the CUE rundown (`cues` - additive optional data rows over the pool, many
  cues per graphic; a pool replace KEEPS the entry id so cues never orphan).
  **`graphics` order IS the layer stack, in PAINT order** - index 0 furthest back, the last entry
  on top - carried unchanged into the published payload and out to the output stage's z-indexes.
  Both surfaces that show it (the production page, the editor's Productions block) reverse it for
  display, because a layer panel lists the front first; `moveShowGraphic(+1)` therefore means
  "forward". Every pool graphic holds its OWN on-air cue, so several are live at once. Packet conventions
  ('spx-gfx-shows', updatedAt LWW, tombstones), sync kind 'show'; `hostedSlug` (control page) +
  `outputSlug` (browser output) record the published capabilities, `publishedAt` the pin point -
  all three stripped from sync conflict copies.
  Also the production-data SEED (`data`) and field BINDINGS (`bindings`), both additive-optional -
  see productionData.ts / productionState.ts below for why the LIVE tree is deliberately not here.
- **productionData.ts** - PRODUCTION DATA's whole semantic contract (docs/PRODUCTION_DATA_PLAN.md):
  a production-scoped tree of live JSON values, the paths that address it, and the resolution of
  field BINDINGS into ordinary `{ fN: "…" }` updates. **It imports nothing, touches no DOM and no
  storage**, which is deliberate twice over: `scripts/production-data.test.mjs` transpiles this
  one file to assert the rules directly, and the hosted ingress planned for Phase 2 compiles the
  same source rather than growing a second opinion. Three rules live here and nowhere else -
  a write is ABSOLUTE STATE (`mergePatch` is RFC 7386; nothing in the file can express "+1", so a
  retried write cannot corrupt a value); a binding RESOLVES TO FIELD VALUES (so the template stays
  a plain SPX graphic and an export keeps working with no feed); and a MISSING PATH WRITES NOTHING
  (a live field keeps its last good value - freeze is not-writing). `diffResolved` is not an
  optimisation: the log caps a production at 50 commands per 5 s, so one moving value must cost
  one row.
- **productionState.ts** - the live tree's STORAGE, and the reason it is not on the `Show` record:
  that record syncs record-level LWW with conflict copies that drop the production's slugs, so
  per-tick writes would unpublish a live production. Plain localStorage (`spx-gfx-production-data`,
  keyed by show id), never synced, deliberately NOT in the durable IndexedDB queue. `Show.data` is
  the authored SEED only, written by one deliberate act - there is no other door onto the record,
  which is what makes the anti-churn rule structural rather than remembered.
- **easings.ts** - the easing catalog; the doctrine is in src/templates/AGENTS.md +
  DESIGN_LANGUAGE §4.
- **cssVars.ts** - `:root` variable read/write helpers plus the colour model (`parseCssColor` /
  `formatCssColor` / `contrastRatio`); the doctrine is in src/blocks/AGENTS.md.
- **slug.ts** - the folder/zip/channel slug, shared by control and export (in the kernel so
  neither imports the other).
- **externalRefs.ts** - `ensureExternalRefs`: an imported template's HTML references the css/js/
  gsap files a Starter package ships beside it; the importer and the SPX Starter packager share it.
- **project.ts** - the current working project, autosaved to localStorage 'spx-gfx-project' so a
  reload restores the last graphic. One slot: creating a new graphic overwrites it (durable saves
  go to the LIBRARY via the Save button). Carries the save LINK - `graphicId` (which library
  record this document IS) + `dirty` - so a reload keeps an honest Saved/Unsaved badge.
  Soft-delete tombstone for cloud-sync parity.
- **importTemplate.ts** - import an EXISTING template (.html file or SPX-style zip) and split it
  into the editor's three panes; foreign templates rarely follow the house contracts, so the
  Style/Motion panels degrade gracefully, validation shows what's missing, and the AI panel's
  "Make SPX-ready" is the guided fix path.
- **layout.ts** - the desktop DOCKABLE-PANEL layout (localStorage 'spx-gfx-layout', version 3):
  three docks (left/right/bottom), each a `DockState` {panels, active, size}, plus `timelineSize`
  (the centre's canvas/timeline split). `PanelId` = code | inspector | data | control | style |
  assets | ai | export. A panel not in any dock is intentionally CLOSED (not re-added on load -
  AppShell offers it from a dock's "+"). loadLayout migrates: v2 gets 'assets' inserted once
  right after 'style' (v2 semantics say absent = closed, so without the version bump no existing
  user would ever see the new tab); anything older resets to the default; the mobile layout
  ignores all of this. See src/components/AGENTS.md (AppShell / WorkspaceDock).
- **prefs.ts** - small device-level workflow defaults (localStorage 'spx-gfx-prefs'):
  defaultExportTarget, timelineCollapsed, renderSettings, commentVisibility (the code editors'
  comment view mode - src/editor/), advancedMode (the editor-visibility switch, read live via
  components/useAdvancedMode - docs/GOALS_ARCHIVE.md "Student release" step 4), libraryView (Home's
  graphics library as cards or as a dense list - which one is right depends on the library's
  size and the screen, not on the graphic, so it is a setting rather than session state).
  Not synced; keep it tiny.
- **id.ts** - uuid() that ALWAYS returns a valid RFC-4122 v4, even where crypto.randomUUID is
  undefined (plain-HTTP LAN hosts, CasparCG's CEF). Record ids must be real UUIDs: the cloud
  `documents.id` column is a uuid PK, and a non-UUID id would be rejected by Postgres and poison
  sync.
- **videoTypes.ts** - VideoProject, the canonical unit of the AI VIDEO editor ("Video or
  animation with AI"): ONE composition source + duration/fps/size/transparency + assets (the
  exact AssetFile shape, sync-ready) + `assetUses` (what each upload is FOR - imagePurpose.ts;
  ADDITIVE OPTIONAL, so no version bump and no migration, and an absent map means every asset is
  composition material. It lives on the PROJECT rather than in the wizard because a video project
  is created instantly and its first generation runs later, in the shell - a reference kept in
  wizard state would never be read) + `inputs` (editable inputs, below) + AI chat history and
  motion plan. Parallel to SpxTemplate - the two worlds never mix; `kind: 'video'` is the
  serialized discriminant. **`engine: 'remotion' | 'hyperframes'`** (VIDEO_ENGINES carries the
  wizard-card metadata) picks which source field is live - `tsx` (a single-file React/Remotion
  module, the default) or `html` (a standalone HyperFrames composition; runtime in
  src/video/hyperframes/) - chosen at creation, never converted; read/write the active source
  through `videoSource(p)`/`withVideoSource(p, code)`. Records stored before the field load as
  'remotion' (videoProject.ts normalize). Also DocKind and createDefaultVideoProject
  (engine-matched starter composition).
  **VideoInput** = the video project's Template Definition, the counterpart of an SPX
  DataField: `{ key, type: text|number|color|select|image, label, value, default, options?/
  min?/max?/step? }`. The AI declares a handful (via the emit tool) so a non-technical user
  edits the content in the Content panel WITHOUT touching TSX; the composition reads them from
  its `fields` prop as `fields.<key> ?? default`. An `image` input's value is the LOGICAL NAME
  of a project asset (the counterpart of an SPX `filelist` filename): the composition resolves
  it against the `assets` prop it already receives (`assets[String(fields.logo ?? '')]`), so an
  image input adds NO bytes to the render manifest budget. `videoFieldValues(inputs)` builds
  the `{key: value}` bag passed as `fields` into BOTH the live preview (VideoPlayerFrame
  set-props) and the render (buildVideoManifest inputProps). `mergeVideoInputs(prev, next)`
  adopts a regenerated set while keeping values the user already edited - and a provider that
  simply DIDN'T re-declare its inputs must send `null`, not `[]`, or the merge empties the user's
  Content panel and reverts their text to the code defaults (`[]` means "no editable content" and
  is honoured as such; see ai/video/claudeVideoProvider.ts).
  `videoInputDescriptor(input)` is the adapter to the shared `FieldDescriptor` (fieldModel.ts)
  the Content panel renders - the same descriptor an SPX DataField becomes.
  **`authoredFor`** = the settings the current code was WRITTEN against (null until a generation
  lands). The AI plans motion to a duration and a frame and writes the resulting numbers into the
  code; changing the settings afterwards changes the player and the renderer but NOT that code, so
  a shortened piece loses its exit and a composition that paints its own background still renders
  opaque under `transparent`. `settingsDrift(project)` says what no longer matches, in the user's
  words, and `driftRequest(project)` is the refinement that brings the code up to date (the
  Settings panel's one-click offer).
- **videoInputInfer.ts** - reads a composition's editable inputs OUT OF ITS CODE: every
  `fields.<key> ?? <literal>` the module reads, typed from the fallback (a hex string is a colour,
  a number is a number, an `assets[String(fields.x ?? '')]` lookup is an image). The code is the
  source of truth, so it decides what is editable - a hand-written field gets the same control the
  AI would have declared. `contentInputs(declared, tsx)` is what the Content panel shows: declared
  inputs first and unchanged (they carry labels/options/bounds a fallback can't express), then
  whatever else the code reads. A read with NO literal fallback is ignored on purpose - without a
  default there is nothing to show, reset to, or type the control from.
- **fieldModel.ts** - the canonical editable-field vocabulary shared across the two authoring
  worlds. `FieldKind` = the kinds the product supports (text/lines/number/color/select/toggle/
  image); the video Template Definition uses the `VideoFieldKind` subset (`VideoInputType`,
  text/number/color/select/image). **`FieldDescriptor`** is the shared SHAPE both worlds adapt
  into - `{key, label, kind, defaultValue, options?, min?/max?/step?}` - plus `FieldValue`
  (string | number) and `clampToField`. An SPX DataField becomes one via control/controlModel.ts
  `fieldDescriptors`; a VideoInput via videoTypes.ts `videoInputDescriptor`. **Every surface that
  edits a field renders descriptors, never raw fields**, so the SPX Data panel, the SPX operator
  panel, and the video Content panel are literally the same component
  (components/fields/FieldControl.tsx) and cannot drift. A new field kind is added HERE, mapped
  in the two adapters, and rendered once.
- **videoProject.ts** - video persistence mirroring project.ts/packets.ts: current slot
  'spx-gfx-video-project' (autosave; returns false on quota so the shell can WARN - video
  assets are big) + saved list 'spx-gfx-video-saved' with soft-delete tombstones.
- **docKind.ts** - the persisted editor-world switch ('spx-gfx-doc-kind'); App.tsx branches
  AppShell vs VideoAppShell on it. Falls back to 'spx' when the video slot is empty.
- **videoLayout.ts** - the video shell's own layout prefs (localStorage 'spx-gfx-video-layout'):
  just codeRatio + codeCollapsed. Separate from layout.ts on purpose - the video shell has a
  simple code|preview split, not the SPX dockable workspace.
