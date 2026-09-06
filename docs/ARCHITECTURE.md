# NoaCG Studio architecture - the modular monolith

**Binding.** This doc holds the cross-domain rules: the domain registry, the allowed dependency
edges, where new code goes, and the honest list of known debts. Per-domain contracts stay in the
nested `AGENTS.md` files and the docs they reference - this doc never repeats them. Update this
file in the same PR that changes a cross-domain edge.

## 1. Stance

One application, one primary database (the optional Supabase backend), one build. Domains are
directories under `src/` with a declared public seam; parts get changed, tested, or extracted
later **only on demonstrated need** - never for tidiness. The two extractions that exist prove
the bar: `render-worker/` left the bundle because of a non-OSI license, `player-host/` because it
must run on an opaque origin with `sandbox="allow-scripts"`. A constraint the monolith cannot
satisfy (license, origin, trust boundary) justifies extraction; nothing else does.

Many feature branches run in parallel worktrees. The rule that keeps them from colliding: a
feature edits **its own domain plus thin wiring in `components/`**. The moment a feature needs
another domain's internals, stop - extend that domain's public seam in its own small commit
first, then consume the seam.

## 2. Domain registry

Layers are the mental model; the edge table in §3 is the law. Higher layers import lower ones,
never the reverse. `*` = the domain carries its own `AGENTS.md` with the detailed contract and a
thin `CLAUDE.md` import.

| Layer | Domain | Owns | Public seam (import these) |
|---|---|---|---|
| 0 kernel | `model/` * | SpxTemplate, parse/serialize, persisted formats + migrations, library/shows/packets, field + structure contracts | the module named for the concern (`types`, `spxDefinition`, `library`, `structure`, `fieldModel`, ...) |
| 0 kernel | `assets/` | data-URL helpers, vendored gsap/lottie, OFL.txt | `assetUtils`, the vendored files |
| 0 kernel | `entitlements/` | the PURE entitlement contract: feature/limit keys, plan + grant shapes, the precedence merge and its per-value source (docs/ADMIN.md) | `contract` |
| 0 kernel | `feedback/` | the PURE feedback contract: rating axis, enumerated reason vocabularies, area and triage states, the submission shape (docs/ADMIN.md §10) | `contract` |
| 1 transforms | `blocks/` * | deterministic `(template) => template` patchers, Timeline v2 engine, `NOACG_ANIM` literal, state-machine graph + mutators | `registry`, `animData`, `animMachine`, `machineEdit`, named patcher modules |
| 1 transforms | `templates/` * | wizard catalog, assemblers, graphic types, `:root` style contract | `catalog`, `variant.create(options)`, `types/` registry, `defaultTemplate` (the store's seed) |
| 1 transforms | `validation/` | the export + AI gate, runtime bench, the PUBLISH gate (`publishGate` = validate + share-safety bench; the one gate behind the community door, the bridge, hosted publish and production export) and the production-grain LIBRARY->AIR gate (`productionGate`, docs/AGENT_SAVE.md §4) | `validateTemplate`, `runtimeBench`, `publishGate`, `productionGate` |
| 1 transforms | `preview/` | srcdoc composition | `composeDocument` |
| 1 transforms | `editor/` | Monaco view-only helpers (comment visibility) | `commentVisibility` |
| 1 transforms | `format/` | code formatting (docs/FORMATTING.md) | `formatCode` |
| 2 services | `backend/` | THE Supabase client, auth, sync engine, asset externalization, the caller's own entitlement (`myEntitlement`) | `config` (`isBackendConfigured`, `loadBackendConfig`), `supabase` (`getSupabase`), `auth`, `syncController`, `myEntitlement` |
| 2 services | `ai/` * + `ai/video/` | generation harnesses, providers, settings/preferences | `getAiProvider()`, `getVideoAiProvider()`, `settings`, `preferences` |
| 2 services | `export/` * | 6 targets + packet/show packaging | `registry`, `common` |
| 2 services | `render/` * | RenderManifest, schedule, tiers, job client | `manifest`, `schedule`, `limits` (the PURE trio), `client` |
| 2 services | `control/` | ControlMessage protocol, 3 receivers, panel generators | `controlModel`, `receiverScript`, `controlPanelHtml`, `realtimeControl`, `hostedReceiver`, `hostedControl` |
| 2 services | `video/` | video compile/validate/bridge pipeline | `compile`, `validate`, `playerBridge`, `videoFonts` |
| 2 services | `community/`, `showchat/` | shared templates, audience send-in | `communityData`, `chatData` |
| 2 services | `packs/` | the downloadable GRAPHICS PACK format (`.noacgpack.json`): parse/normalize, validate through the export gate, install as a production with layers + cues | `graphicsPack` |
| 2 services | `audience/` | the AUDIENCE plane (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5): ONE `AudienceBackend` interface, the in-memory rehearsal provider, the Supabase provider over migration 0035's slug-keyed RPCs, and the framework-free join renderer | `audienceTypes` (the interface + limits), `localAudience`, `audienceData` (`createSupabaseAudience`), `joinSurface` |
| 3 app | `store/` * | editor UI state, undo, save link | `templateStore` (`applyTemplate`), `saveActions`, `videoProjectStore`, `docKindStore` |
| 3 app | `app/` | hash router | `router` |
| 3 app | `components/` *, `landing/` *, `teach/` | the React shell, landing, tooltips | (top of the graph - nothing imports these) |
| 3 app | `admin/` | the PRIVATE admin page: its own MPA entry (`admin.html` -> `/admin`), the wire types, the authorized fetch client (docs/ADMIN.md) | (top of the graph - nothing imports these) |
| 3 app | `output/` | the browser-output RENDERER: its own MPA entry (`output.html` -> `/output`), a capability URL loaded by CasparCG/OBS/vMix (docs/CLOUD_PLAYOUT.md) | (top of the graph - nothing imports these) |
| 3 app | `join/` | the public AUDIENCE page: its own MPA entry (`join.html` -> `/join`), the capability URL a viewer's phone opens. It reads the slug off the URL and mounts `audience/joinSurface` - every decision about what a viewer may see lives in `audience/` and in migration 0035 | (top of the graph - nothing imports these) |
| 3 app | `ograf/` | the free OGraf STARTERS page: its own MPA entry (`ograf.html` -> `/ograf`, docs/OGRAF.md) - curated catalog graphics as downloadable OGraf packages, built by the real exporter at click time | (top of the graph - nothing imports these) |
| 3 app | `bridge/` | the headless BRIDGE page: its own MPA entry (`bridge.html` -> `/bridge`, noindex, docs/AGENT_CLI.md) - the platform's scaffold / validate / bench / package / inspect functions exposed on `window.noacgBridge` for the `noacg` CLI and MCP server to drive through a headless browser; holds no account, no key, no store | (top of the graph - nothing imports these) |

## 3. Allowed edges (the ratchet)

The current, curated import graph. **Adding a new domain-to-domain edge requires editing this
table in the same PR, with one sentence of justification in the commit.** Everything may import
`model/`, `assets/`, `entitlements/` and `feedback/`; those four are omitted from the lists. The
last two earn it the same way: a pure contract that imports nothing, with consumers in the
browser, in `api/` and in the admin page, where a second copy of the answer IS the defect the
module exists to prevent. Edges not listed
here and not in §6 are wrong - fix the code, not the table.

- `templates` -> blocks (`animData`, `animMachine`, shared runtime)
- `blocks` -> templates (preset data tables + `shared/animRuntime`, `shared/textFit`)
- `validation` -> blocks, templates, preview
- `preview`, `editor`, `format`, `backend`, `landing`, `teach` -> (kernel only)
- `store` -> blocks, validation, templates (`defaultTemplate` only - the store's initial document,
  when no project is saved, is the first catalog variant)
- `ai` -> templates, blocks, validation, video, backend (`getAccessToken` only - proxy metering)
- `video` -> validation, render
- `render` -> control, preview, showchat, backend (`getAccessToken` only)
- `export` -> blocks, control (the panel/receiver generators are control's declared packaging seam),
  validation (`productionGate` only - a production export is a door a library draft leaves
  through, and the builder itself refuses an invalid graphic so the promise holds for every
  caller, not only the dialog that shows the verdict; docs/AGENT_SAVE.md);
  `export/targets/ograf.ts` -> `render/runtimeScript.ts` (the shared deterministic virtual clock)
- `control` -> blocks, backend, audience (`audienceBrand` only - publishing carries the production's
  look into the audience plane's own state, and the audience domain owns that shape; a copy of the
  mapping in the publish path would be a second opinion about what a viewer's page looks like),
  validation (`productionGate` only - publishing is the library->air boundary, and
  `publishControlShow` refuses an invalid graphic before it pins anything to an output URL)
- `audience` -> backend (the Supabase provider is eleven slug-keyed RPCs through `getSupabase()`;
  it reaches no other domain, which is what keeps "nothing viewer-written airs without an
  operator" structural - there is nowhere for it to write a command)
- `community` -> backend, validation
- `packs` -> validation (a pack installs only through the ONE export gate - the importer refusing
  what export would refuse is the whole safety story of installing a file somebody handed you)
- `admin` -> backend (`getAccessToken` + `isBackendConfigured` only - every fact it shows comes
  from `api/admin/*`, never from another domain)
- `showchat` -> backend, control
- `output` -> control, preview, backend (the renderer follows the hosted-control log through
  `control/hostedControl`, composes each published graphic through `preview/composeDocument`,
  and feature-detects the backend; it reads no store, no components, no templates)
- `join` -> audience, backend (the join page mounts the shared join surface over the Supabase
  audience provider and feature-detects the backend; it reads no store, no components, no
  templates, and no control module - a viewer's page must not even be able to name the command log)
- `ograf` -> templates, model, preview, export (the free OGraf starters page, docs/OGRAF.md:
  it builds real catalog templates, previews them through `preview/composeDocument` +
  `frameGraphic`, and packages them through the OGraf export target - the page's downloads ARE
  the exporter; it reads no store, no components, no backend)
- `bridge` -> templates, blocks (`animData` - is the region data-shaped?), model, validation,
  community (`gate` only), preview, export, packs, control (the headless bridge page,
  docs/AGENT_CLI.md: it composes the studio's OWN functions - the type registry and neutral
  scaffold, the authored-region converter, `publishGate` + the runtime bench + readiness + the
  engine scan, `composeDocument`, the dual graphic package + the OGraf package reader, the pack
  wire entry, the control generator + the OGraf contract adapter - for a headless driver; it
  reads no store, no components, no backend, and holds no account or key)
- `app` -> (nothing)
- `components` -> any lower domain, **through its seam column in §2**

Hard invariants (all machine-enforced - 1-4 by eslint, 5 and the whole edge table by
dependency-cruiser; §7):

1. **`@supabase/supabase-js` is value-imported only inside `backend/`** (type-only imports of
   `SupabaseClient` are fine anywhere). All client access goes through `getSupabase()`; all
   feature detection through `isBackendConfigured()` / `loadBackendConfig()`. The injected
   receiver scripts hand-roll their transport by design (an exported graphic carries no bundle)
   but still read config through `backend/config`.
2. **The render purity trio** (`render/manifest.ts`, `schedule.ts`, `limits.ts`) stays DOM-free,
   `?raw`-free, `import.meta`-free - `api/` and `render-worker/` compile these same files.
3. **`store/` is imported only by `components/` and `App.tsx`.** Processing domains (ai, export,
   render, control, video, backend, community) never touch the store - they take and return
   plain documents.
4. **Nothing imports `components/`.** UI is the top of the graph.
5. **`model/` imports nothing above layer 0** except the one grandfathered edge in §6 (`model -> editor`,
   type-only) and the one temporary shim there.

## 4. Where does new code go

| The change is... | It lives in |
|---|---|
| a new persisted shape, or any shape change to one | `model/` - version + migration in the same commit (root `AGENTS.md` rule 6) |
| a deterministic edit to template code | a named patcher in `blocks/` |
| a new catalog template, variant, pack, or graphic type | `templates/` |
| a new export target or packaging convention | `export/targets/` + the registry |
| a shipped graphics pack, or the pack-file format | `src/packs/` (format + install); pack template sources under `scripts/packs/`, built into `public/packs/` |
| an operator surface, protocol message, or receiver | `control/` |
| an AI model transport or credential boundary | `api/ai/` + `api/_lib/aiGateway.ts`; shared browser-safe contracts in `ai/modelTypes.ts` |
| prompt, harness, provider, or AI settings work | `ai/` (SPX) or `ai/video/` |
| manifest, schedule, tier, or render-job work | `render/` (respect the purity trio) |
| a cloud table, sync kind, or auth change | `backend/` + `supabase/migrations/` (RLS in the same migration) |
| a new gateable feature, plan dimension, or access rule | `entitlements/contract.ts` - one resolver, one precedence order (docs/ADMIN.md); the server loader and the admin surface consume it, never re-decide it |
| a new PERMISSION a credential may carry (what a key / token may do of what the account may do), or a new credential kind | `entitlements/permissions.ts` (the pure vocabulary + `permits`) and ONE more branch in `api/_lib/principal.ts resolvePrincipal` - never a second check (docs/AGENT_SAVE.md) |
| a new door from the library to air (publish, export, a renderer) | it calls `validation/productionGate.ts` before crossing - the gate lives in the code that crosses, not in the dialog that shows the verdict |
| video compile/validate/bridge work | `video/` |
| editor UI state, undo, save/guard flow | `store/` |
| a panel, dialog, or canvas interaction | `components/` - thin, per §5 |

New sync kind: the checklist is the seam, deliberately not a registry - extend the `SyncKind`
union + `SINGLETON_KINDS` (`backend/storage.ts`), `SYNC_KINDS` (`backend/sync.ts`), the
`LocalStorageProvider` branches (`backend/storage.ts`), the tombstone purge
(`backend/syncController.ts`), and widen `documents_kind_check` in a migration (0009 is the
model to copy).

## 5. UI thinness

A component may **select** a helper and **commit** its result; it may never **be** the transform.
Concretely: calling a `blocks/`/`model/` function and passing the result to `applyTemplate` is
the pattern; assembling document coherence inline -
`applyTemplate({ ...template, js, settings, html: replaceDefinitionInHtml(...) })` - is not.
When a change needs a transform that does not exist, write it as a named, exported function in
`blocks/` (or `model/` for parse/serialize concerns) and call it. Logic files without JSX do not
live under `components/`.

Grandfathered offenders (hoist the inline assembly into `blocks/` **when you are already
touching that code path** - never as a drive-by campaign): `CanvasInteraction.tsx` (13 inline
`applyTemplate` sites), `StepTimeline.tsx:375` and `:388`, `Inspector.tsx:280`, and
`components/wizard/draft.ts` (a 430-line logic module parked in the UI tree - move it toward
`blocks/`/`templates/` when next reworked).

## 6. Known debts (grandfathered, shrink-only)

Each entry is an accepted violation of §3. Fix it when already touching the file; a fix deletes
the row. Do not add rows without updating §3's justification trail.

| Edge | Where | Smallest safe fix |
|---|---|---|
| model -> editor | `model/prefs.ts:5` type-only `CommentVisibility` | accepted - type-only, harmless; move the type to `model/` if ever inconvenient |
| model <-> assets | `fonts.ts` <-> `assetUtils` | accepted - kernel siblings, both layer 0 |
| blocks -> templates presets | `blocks/presetRegistry.ts` imports 8 preset tables | accepted - data-table aggregation, no logic cycle; revisit only if a preset ever imports blocks logic |
| model -> templates | `model/wizard.ts` is a RE-EXPORT SHIM for `templates/contract.ts` + `templates/importedDesign/designSvgTypes.ts` (docs/WORKFLOW_ARCHITECTURE.md §5.5, domain row 1) | temporary, one landing: rewrite the importers to the new paths, then delete the shim and its `.dependency-cruiser.cjs` allowance together |

## 7. Enforcement roadmap

- **Stage A - wired.** The "Architecture Stage A" blocks in `eslint.config.js` pin invariants 1,
  3, and 4 of §3 via `@typescript-eslint/no-restricted-imports` (zero new dependencies; part of
  `npm run lint` and the build gate). Because flat-config rule options **replace** rather than
  merge when several blocks match a file, `src/` is split into disjoint regions, each carrying
  the full restriction set for its region - keep it that way when editing. Invariant 2 is
  pinned by the purity-trio block in the same file: `no-restricted-globals` (DOM/environment
  globals) plus `no-restricted-syntax` (query-suffix imports, `import.meta`) scoped to exactly
  `render/manifest.ts`, `schedule.ts`, and `limits.ts` - different rule names than the Stage A
  regions, so they compose instead of replacing each other's options.
- **Stage B - wired.** `dependency-cruiser` (devDependency) runs in `npm run build` next to
  eslint (`npm run depcruise` standalone). `.dependency-cruiser.cjs` is default-deny: its
  `allowed` array IS §3's edge table, so a new cross-domain edge edits the doc and the config in
  the same PR; the §6 debts appear as commented allowances that get deleted with their rows. The
  `no-circular` rule bans cycles made entirely of value imports (the module-init-time hazard);
  cycles containing an `import type` edge are tolerated - they are erased at compile time, and
  the registry/type-hub patterns in `export/`, `ai/`, and `templates/shared` depend on them.
  Scope is `src/` only: `api/`, `render-worker/`, and `player-host/` are separate programs whose
  sanctioned imports into `src/render` and the pure `src/ai/modelTypes.ts` contract live
  outside this graph. This subsumes invariant 5 -
  with the purity trio in Stage A, every §3 invariant is now machine-enforced.

Both stages are wired, so §3 needs no further tooling. `scripts/e2e-affected.mjs` stays a second,
coarser domain map (its `CORE` list is the "shared kernel" statement) used for test selection
rather than enforcement; keep it in step with this doc when domains move.

## 8. Repository map

What lives where, one line per directory. `*` marks a directory with its own `AGENTS.md` (and a
thin `CLAUDE.md` importing it) carrying the binding per-area contract - read that file before
editing the area. This map is reference; the law is §2 and §3 above.

```
src/                     (* = has its own AGENTS.md; read it, this line is only the label)
  model/ *     SpxTemplate types, SPX parse/serialize, catalog data, fonts, brand, library, shows
  templates/ * the wizard catalog and its contract (contract.ts), the :root style contract, the
               GRAPHIC TYPE registry
  store/ *     templateStore.ts (zustand) - the applyTemplate/undo choke point; saveActions.ts
  blocks/ *    deterministic transforms: blocks, field editing, Timeline v2, animMachine.ts
  ai/ *        the SPX GENERATION HARNESS; ai/video/ is the parallel VIDEO motion harness
  export/ *    the export registry - 6 targets + whole-SHOW export + packaging conventions
  render/ *    RenderManifest, HOLD schedule, tier limits, virtual clock, job store (docs/RENDER.md)
  landing/ *   the landing page's GSAP motion system. POLICY: never fakes product UI
  components/ * the React app: AppShell, CodeEditor, timeline dock, Inspector, canvas/, wizard/,
               auth/, save/, home/, video/, icons.tsx
  styles/ *    the app's stylesheet in 30 PARTS, one per surface. styles/index.css IS the
               cascade order - append a new part where its rules already sat, never re-sort;
               the DIALOG ANATOMY every dialog shares is binding and lives there
  app/         router.ts - HASH ROUTING for /app (docs/SAVED_CONTENT_MODEL.md §3)
  preview/     composeDocument.ts - inlines CSS + GSAP + JS + assets into the iframe srcdoc
  editor/      Monaco VIEW-only helpers (comment visibility as decorations, never edits)
  video/       the video pipeline: compile, validate, fonts (SINGLE source, so preview == render)
  validation/  validateTemplate.ts (export + AI gate) + runtimeBench.ts (the live-iframe bench)
  control/     the CONTROL LAYER (docs/CONTROL_LAYER.md): ONE generator, the ControlMessage
               protocol, three receivers, the staged-vs-take model
  backend/     the OPTIONAL Supabase backend: config.ts isBackendConfigured is the ONE
               feature-detection point (unset env = pure offline mode); auth, sync, assets
  audience/    the AUDIENCE plane (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5): ONE AudienceBackend
               interface + localAudience / audienceData providers, and joinSurface.ts as the one
               renderer the public page and the operator preview both mount. The interface has NO
               method reaching the command log - that is how "nothing viewer-written airs without
               an operator" is structural rather than remembered
  community/   shared templates (signed-in only), validated + benched at publish AND import
  entitlements/ the PURE access contract (docs/ADMIN.md): ONE resolver, precedence
               default < plan < temporary grant < manual override, every value carrying WHY;
               permissions.ts = what a CREDENTIAL may do (docs/AGENT_SAVE.md)
  feedback/    the PURE feedback contract (docs/ADMIN.md §10) - one vocabulary, four consumers
  admin/       the PRIVATE admin page. Never a security boundary. Usage sections count OTHER
               PEOPLE by default (the ScopePicker excludes internal accounts)
  output/      the browser-output RENDERER - one persistent transparent capability URL per
               production, following the hosted-control log with boot recovery (docs/CLOUD_PLAYOUT.md)
  bridge/      the headless BRIDGE page (/bridge, docs/AGENT_CLI.md): the platform's own
               scaffold / validate / bench / compose / package / inspect functions on
               window.noacgBridge, driven by the `noacg` CLI + MCP server through a headless
               browser
cli/           the `noacg` CLI + MCP server (its own package, published to npm) - an external
               coding agent's door, over the bridge page of whatever deployment NOACG_URL names;
               `login`/`save` hold a SCOPED AGENT KEY (docs/AGENT_SAVE.md, docs/AGENT_CLI.md)
public/fonts/  the 17 bundled woff2 fonts (served at /fonts, copied into exports). A picked
               GOOGLE family (model/googleFonts.ts) is fetched at design time and embedded in
               template.assets like an upload - never referenced by the emitted code
src/assets/    bundled gsap.min.js, lottie.min.js, OFL.txt (the ONE licence source) + asset helpers
src/docs/ *    the PUBLIC docs page's stylesheet and its one progressive module (the page itself
               is docs.html at the root; the AGENTS.md here is the contract for both)
src/teach/     the Monaco tooltips
scripts/       dev-port + port-registry (the per-worktree RESERVATION), the catalog quality gates,
               ai-compare + ai-bench (both SPEND TOKENS), render-smoke, worktree-activity (who else
               is in flight), merge-order (which branch should land FIRST), hooks/
api/           server-only Vercel functions: the render service, the AI model gateway, Lite
               profile/allowance, sealed user-key endpoints, the production DATA API
               (docs/DATA_API.md - external data as update rows in the control log),
               api/admin/* behind _lib/adminAuth.ts (404 for every refusal), the agent-key +
               save routes under api/me (docs/AGENT_SAVE.md). Typechecked by tsconfig.api.json
render-worker/ the Remotion renderer, and player-host/ the preview host - own exact-pinned packages
player-host/   so the non-OSI licence never enters the AGPL bundle. Built into public/player-host/
               as ONE self-contained page, loaded with sandbox="allow-scripts" ONLY (never add
               allow-same-origin), postMessage with a per-session nonce
```

## 9. The ten pages

The app is a Vite MPA. Clean URLs come from the `app-clean-url` plugin in dev and preview, and
from Vercel `cleanUrls` in production - so a page is reached without its `.html`.

| URL | Entry | What it is |
|---|---|---|
| `/` | `index.html` | static landing, no React; carries a redirect shim so old root `?chat=`/`?template=` share links land on `/app` with their query |
| `/docs` | `docs.html` | PUBLIC docs home - static, indexed, no React; guides for SVG import, OBS/vMix, CasparCG, the playout dashboard and the agent door (`src/docs/`) |
| `/app` | `app.html` | the studio: home, wizard, productions - the editor is its Advanced surface. E2E specs navigate here |
| `/admin` | `admin.html` | PRIVATE admin surface - unlinked, `noindex`, a plain 404 for everyone the server does not recognise (`docs/ADMIN.md`) |
| `/output?production=<slug>` | `output.html` | the transparent browser-output RENDERER a production client (CasparCG/OBS/vMix) loads once (`docs/CLOUD_PLAYOUT.md`) |
| `/join/<name>` | `join.html` | PUBLIC audience page (also `/join?p=<slug>`, `?pv=<slug>` for the presenter view) - vanilla TS, `noindex` (`docs/INTERACTIVE_PLAYOUT_PLAN.md` Phase 5) |
| `/terms` | `terms.html` | PUBLIC terms for accounts and optional hosted services |
| `/privacy` | `privacy.html` | PUBLIC privacy policy, including managed AI and Custom/BYO processing |
| `/ograf` | `ograf.html` | PUBLIC free OGraf starters - built by the real exporter on click (`src/ograf/`, `docs/OGRAF.md`) |
| `/bridge` | `bridge.html` | the headless BRIDGE the `noacg` CLI / MCP server drives (`src/bridge/`, `docs/AGENT_CLI.md`); `noindex`, no account, no key |
