# The OGraf ecosystem - verdicts, boundaries, interop strategy

**Status: research dossier, 2026-08-29. Nothing here authorizes implementation.** This file
extends `docs/OGRAF_FIRST_REVIEW.md` (ratified 2026-08-29) with the ecosystem reading that review
deferred: a verdict per open-source project, the boundary of generic OGraf operation inside NoaCG,
and the evidence bar for claiming interoperability in both directions. Where this file corrects
the review, the correction is also marked in the review's own text as a dated update. The student
push (`docs/GOALS.md`, `## NOW`) is untouched by everything below.

Method: five dedicated research passes on 2026-08-29 read the actual repositories, package
manifests, source files and issue trackers - not product pages. Claims carry their URLs. Refresh
is TIME-driven: treat anything here older than a quarter as stale, and re-check any row before it
decides an architecture.

---

## 1. The verdicts

Vocabulary: **USE** (adopt as a dependency or fixture), **REUSE PARTS** (lift a bounded pattern or
convention, never the codebase), **REFERENCE ONLY** (read it, learn, keep our own), **INTEROP
TARGET** (prove our packages/APIs against it), **NOT RELEVANT NOW**. A project can carry two
verdicts when it plays two roles. The standing rule from the review holds everywhere: nothing is
reused merely because it is open source, and nothing may become a second competing system inside
NoaCG.

| Project | Licence | Verdict | One line |
|---|---|---|---|
| ograf-server (SuperFlyTV) | MIT | **INTEROP TARGET** | the reference Server API implementation; drive our packages through it forever, depend on it never |
| ograf-form (SuperFlyTV) | MIT | **REFERENCE ONLY** (oracle) | the reference GDD-to-controls mapping; cross-check `ografContract.ts` against it, do not embed it |
| ograf-devtool (SuperFlyTV) | MIT | **REFERENCE ONLY + INTEROP TARGET** | borrow its Service-Worker local-package trick; run our packages through it as a compliance check |
| ograf.dev checker (ficosta/ograf) | MIT | **INTEROP TARGET** | the community's 83-rule conformance bar; pass it, and consider contributing the missing CI form |
| EBU `v1/examples` + nytamin/ograf-graphics | MIT | **USE** (fixtures) | the import-side test corpus |
| Eyevinn ograf-editor | MIT | **REFERENCE ONLY** | a scene-model-generates-code editor - the architecture pillar 1 refuses; evidence, not a model |
| Ferryman (StreamShapers) | AGPL-3.0 | **INTEROP TARGET + REUSE PARTS** (conventions) | its packages are the best foreign fixtures; its underscore-field and marker vocabulary is worth speaking, its codebase is not worth embedding |
| SPX-GC (TuomoKu) | MIT | **INTEROP TARGET** | v1.4 plays OGraf packages in SPX rundowns - our two strictest targets converged |
| gstcefsrc (Centricular) | LGPL-2.1 | **REFERENCE ONLY, parked** | an actively-maintained fork-and-fix starting point for a native renderer, not a foundation; dossier in `docs/NATIVE_PLAYOUT_RESEARCH.md` §8 |
| Sofie / timeline-state-resolver (TSR) | MIT | **REFERENCE ONLY** (pattern) | the state-reconciliation pattern for any future device abstraction; the system itself is TV automation we are not building |
| SuperConductor (SuperFlyTV) | AGPL-3.0 | **REFERENCE ONLY** | proves TSR works outside Sofie; a dormant desktop rundown GUI, not our shape |
| casparcg-connection (SuperFlyTV) | MIT | **REFERENCE ONLY today, REUSE candidate later** | our loopback agent's few AMCP lines do not need it; adopt it only the day the CasparCG surface grows real breadth |
| Loopic, DJ HTML Creator, everviz, Erizos, LiveOS, BBright | closed | **NOT RELEVANT NOW** (code); lessons below | closed products; each teaches one thing about where the standard is heading |

### 1a. ograf-server - the reference server, and why it stays external

<https://github.com/SuperFlyTV/ograf-server>. MIT, TypeScript, active (last push 2026-08-23),
5 contributors dominated by Johan Nyman (nytamin), no releases - shipped as a Docker image.
Yarn monorepo: server (Koa + ws + json-rpc-2.0 + zod), a React 19/MobX renderer page and two
controller pages (controller-default embeds ograf-form).

What its architecture actually is, verified in source:

- **Ingest** is a non-spec multipart zip endpoint (`/serverApi/internal/...`); packages are
  unzipped and keyed by manifest id. **No versioning** - re-upload deletes the previous copy;
  deletes are soft with a 24 h grace so an on-air graphic keeps its cached resources.
- **The renderer is a web page the server serves** and CasparCG/OBS/vMix loads; it dials back
  over a WebSocket speaking JSON-RPC 2.0 and registers itself with a `renderTargetSchema` whose
  `layerId` is a string enum - the renderer-layer page hardcodes **five layers, one graphic
  instance each**. Multiple graphics on one output = multiple layers of one page.
- **The Server API face** (`/ograf/v1`) is generated from the EBU OpenAPI: list/get/delete
  graphics, list/get renderers, and the instance lifecycle (`load`, `updateAction`,
  `playAction`, `stopAction`, `customActions/{id}`, `clear`). Every REST call is proxied as
  JSON-RPC down the renderer's WebSocket.
- **No auth** (namespaces are isolation, not authentication), and **no instance recovery**: a
  renderer page reload re-registers the renderer but restores no loaded graphics -
  `listGraphicInstances()` is a TODO. Recovery is "reload the page, controller re-loads
  everything". With `ts-node` in production deps and a 0.0.5 WebSocket glue lib, this is a
  reference and demo system, not hardened infrastructure - which is fine, because that is its
  job.

**Verdict argued.** The strongest reason to keep it close is exactly the reason not to adopt it:
it is the de-facto reference implementation, maintained by the spec's main author, so driving our
export through it (the 2026-08-18/22 walks, to become the scripted round) is the cheapest
external proof there is, and its generated `/ograf/v1` routes are the conformance oracle for the
Server API facade `/output` will one day wear. Adopting it *inside* NoaCG would import a second
playout system - Koa/JSON-RPC/React-19/MobX beside our command log - that solves less than the
log already solves: the log has durable ordering, boot recovery and per-graphic baselines
(`docs/CLOUD_PLAYOUT.md`); ograf-server has a TODO where recovery goes. The comparison is the
single best piece of evidence yet that the command-log architecture is the right vendor layer
under the standard's deliberately-unspecified territory.

### 1b. ograf-form - the reference GDD mapping, used as an oracle

<https://github.com/SuperFlyTV/ograf-form>. MIT, npm `ograf-form` 1.0.0, a **framework-free Web
Component with zero runtime dependencies** - the best-behaved artifact in the ecosystem. One
maintainer (nytamin). It dispatches on `gddType` prefix with fallback to the JSON basic type,
renders **arrays-of-objects as a real editable table**, and renders customAction payload schemas
the same way - it is what the reference controller embeds. Gaps: no dedicated image preview,
select-multiple, or duration control (they fall back up the GDD ladder); tuples and
patternProperties are TODO.

**Verdict argued.** Embedding it would put two form-generation systems in one product - our
control layer derives `FieldDescriptor[]`/`ControlButton[]` from the same manifest
(`src/control/ografContract.ts`) and renders them through the one generator every NoaCG surface
uses, in the product's own visual language. What ograf-form is genuinely for, for us, is an
**oracle**: feed the same GDD schema to it and to `ografContract.ts` and compare what each
offers the operator - the cheapest way to catch our GDD misreadings (the review's §5 item 1)
and to keep the promised `gddType` adoption honest. One honest asymmetry to record: ograf-form
renders array-of-object tables and nested objects; our descriptor vocabulary cannot yet. That is
a known limit of ours (`ografContract.ts` lists such properties in `notes` rather than drawing
them), not a reason to embed - revisit only if imported packages with table-shaped GDD become a
real operator need.

### 1c. ograf-devtool - borrow the trick, run the check

<https://github.com/SuperFlyTV/ograf-devtool>. MIT, React 18, hosted at
ograf-devtool.superfly.tv. Interactive only - no CLI, no headless mode, so it can never be a
gate. Two things matter:

- **The local-package serving trick is worth lifting as a pattern**: File System Access API plus
  a Service Worker that intercepts the graphic iframe's fetches and answers them from local
  files over BroadcastChannel - a package runs without any upload and without a server. That is
  a proven shape for NoaCG's import-preview of a user's local OGraf package (import v1's
  preview door), compatible with our sandboxed-iframe isolation model (§3).
- **The compliance run stays owed**: the 2026-08-22 round could not register its Service Worker
  in the bench browser (`docs/OGRAF.md`). Retry in an ordinary browser; it is a hand check, low
  cost, third-party eyes.

### 1d. The ograf.dev checker - 83 rules, one curator, community not authority

The ecosystem hub <https://ograf.dev> and its package checker (<https://ograf.dev/check>) are
run by **one person** - Felipe Iasi, a Brazilian broadcast designer/developer (Vizrt-certified,
TV Bandeirantes), from his personal MIT monorepo <https://github.com/ficosta/ograf>. "Not
affiliated with the EBU", by its own footer. Treat it exactly as the backlog watch file says:
evidence of community energy, never authority. Two corrections to prior in-repo claims: the
checker is **83 rules, not 82**, and it is *not* a SuperFlyTV artifact - ograf-devtool's checks
are an older, looser cousin.

The 83 rules span manifest (19), GDD (16), package structure (10), module (9), styling (10),
assets (5) and opt-in sandboxed runtime behaviour (14) - going well past the EBU schemas into
lifecycle timing, shadow-DOM compatibility, relative-URL safety, README/LICENSE/preview-image
presence and font licensing. It is browser-only (drop a zip); there is **no npm package and no
CLI**, so it cannot join CI as-is.

**Verdict argued.** Passing all 83 is the community's definition of a *complete* package, and
several rules (relative URLs, font licensing, preview images) are things our exporter already
does deliberately - the run is mostly harvest. The EBU schema remains the export gate; the
checker is polish and public credibility. The rules being MIT and inspectable also makes
"contribute a CI-runnable `npx` form" a cheap, visible community contribution - but that is
outreach, and outreach is gated (§5).

### 1e. Eyevinn ograf-editor - the cautionary reference

<https://github.com/Eyevinn/ograf-editor>. MIT, vanilla JS + Vite (deps: ajv, file-saver,
monaco), 376 KB, 29 commits, 4 stars, largely AI-co-authored, quiet ~2.5 months - a
low-investment Eyevinn Open Source Cloud catalogue item, not a product with users.

Its architecture is the instructive part: an `OGrafTemplate` **scene model** (drag text, images,
rectangles, circles onto a canvas) from which the manifest and web component are *generated*,
with the scene model round-tripped inside the manifest under `v_` vendor keys - **the vendor
blob is the truth and the code is a build artifact**. Monaco lets you edit the generated code,
but those edits are second-class by construction. Animation is per-element keyframes over the
Web Animations API; steps are per-step visibility + data; there is no SVG import, no state
machine, no non-OGraf target. Honest credits: clean lifecycle emission, offline ajv validation
against the bundled v1 schema, real `skipAnimation` handling, and a renderer-simulating preview.

**Verdict argued.** This is the hidden-scene-model pattern pillar 1 exists to refuse, shipped
small and clean enough to study in an afternoon. Nothing in it does anything NoaCG does not
already do with more reach; its value is (a) as an import fixture source (a *differently
authored* conformant package), and (b) as evidence that others see the same gap and that the
open-editor bar is currently low.

### 1f. Ferryman - the AE road, spoken as conventions, kept as fixtures

<https://github.com/Streamshapers/StreamShapers-Ferryman>, hosted free at
ferryman.streamshapers.com. **AGPL-3.0** (the GitHub sidebar's "GPL-3.0" is wrong - LICENSE.txt
is Affero), React 18 + CRA + Electron, lottie-web vendored, ~10 months quiet in the open repo
while the energy moves to a commercial-looking After Effects CEP extension that embeds it.

Its model, verified in source and docs: input is a Bodymovin/Lottie JSON; **editable layers are
a naming convention** (`_headline`, `_image` - underscore prefix surfaces the layer as a
template field); the animation is a **sealed artifact** - fields are surgical replacements of
text sourceData/image asset paths inside the Lottie JSON, replayed by lottie-web, so AE motion
arrives pixel-perfect because nothing re-interprets it. **AE comp markers named `start`, `stop`,
`next`, `loop`, `update` segment the timeline** and are the whole behaviour vocabulary - steps
without a state machine. The OGraf export writes the manifest, a generated `graphic.mjs`, the
rewritten Lottie JSON and a **vendored ~300 KB lottie-web player in every package**, plus SPX
metadata under `v_spx` in the same manifest - one manifest, vendor keys per target (the same
move as our `v_noacg`). Fidelity is capped by lottie-web's support matrix forever, and they say
so.

**Verdict argued.** Three separable things:

1. **Fixtures: the best available.** Ferryman packages are spec-pointing, structurally unlike
   anything we emit (external `lib/` runtime, marker-derived steps, `v_spx` keys), and produced
   by the one third-party tool EBU-adjacent users actually run. No public gallery exists -
   generate them on demand at the hosted app from any Bodymovin JSON with `_named` layers.
2. **Conventions worth speaking, someday**: NoaCG already treats Lottie as a sealed asset
   (`lottie_light`, injected on use). "Import a Lottie whose `_layers` become fields and whose
   markers map onto the default path" is conceptually one adapter inside our existing stance -
   an AE ingestion road at a fraction of Ferryman's surface. Backlog, with its why
   (`docs/backlog/ograf-lottie-ferryman-conventions.md`).
3. **The codebase: no.** Embedding it buys a React/CRA/Electron stack and - the real cost - a
   second *authoring* model whose steps can never join `NOACG_ANIM`'s groups, guards or snap.
   Licence is compatible (AGPL, same as ours); architecture is not.

### 1g. SPX-GC - the convergence nobody had recorded

<https://github.com/TuomoKu/SPX-GC>. MIT, active (v1.4.1, May 2026). **v1.4 shipped full OGraf
support**: OGraf packages sit in SPX rundowns beside SPX templates and play out, with SPX's own
vendor metadata riding a `v_spx` field in the manifest. SPX is listed on ograf.dev as a
Controller and its server as a Renderer.

**What it means for us**, and it is the sweep's best single finding: our two strictest existing
contracts converged. A conformant OGraf package now plays in SPX 1.4+ *as well as* a native SPX
export - so the OGraf half of the dual package earns SPX playout on its own, and an SPX-GC round
(load a NoaCG OGraf package into an SPX 1.4 rundown, drive it) joins the interop suite as a
cheap, high-credibility fixture round. It also confirms the review's read that the ecosystem's
controller/renderer side adopts OGraf by *wrapping* it rather than rebuilding around it.

### 1h. The closed products - one lesson each

- **Loopic** (loopic.io/ograf): one-click OGraf export from the nearest wizard-shaped
  competitor. Authoring-side OGraf adoption is commoditising; export alone differentiates
  nobody.
- **DJ HTML Creator**: closed Windows desktop keyframe editor exporting self-contained HTML for
  CasparCG/OBS/vMix/SPX *and* OGraf *and* Lottie. Multi-format export is the editor norm - the
  anything-goes pillar is the market's shape, not our eccentricity.
- **everviz**: charts/maps as OGraf-compatible packages, partnered with SPX for playout. OGraf
  is becoming the interchange for content verticals - a vertical we need not build, because a
  compliant chart package could one day be *imported* instead.
- **Erizos Studio** (v3.4) and **LiveOS/NetOn.Live**: established platforms adding OGraf as a
  renderer input mode - playout-side compliance as a checkbox. LiveOS remains our re-badged
  OGraf export target.
- **BBright**: OGraf rendering inside ST 2110/UHD master-control playout (IBC 2026; technical
  detail thin). The most conservative tier of the industry accepted the format; when their
  engine is testable, it is an interop target for our packages, not before.

**The pattern across all six**: authoring-side adoption is broad and shallow (everyone exports
packages); the 2026 announcements cluster on the *playout* side. Demand for good OGraf packages
is growing faster than the supply of good authoring - which is precisely the side NoaCG is
strong on, and precisely why the owner's playout-first sequencing (§5) points at the scarce
half we do not yet have: being a place OGraf graphics *run*.

### 1i. Sofie, SuperConductor, casparcg-connection - patterns, not products

**Sofie / timeline-state-resolver (TSR)**
(<https://github.com/Sofie-Automation/sofie-timeline-state-resolver>, MIT, active). Sofie's
architecture split is deliberate latency engineering: Core (show logic, operator UI, possibly
cloud) never sends "do X now" - every operator action regenerates a declarative **Timeline** of
what should be on air, and the **playout-gateway**, running next to the hardware, feeds it to
TSR, which "resolves the expected state, diffs the state against current state, and sends
commands to devices where necessary". The ecosystem's reusable shape is its **three-layer
split**: pure *transport* libraries (`casparcg-connection`, `atem-connection` - connection as a
state machine with keepalive and reconnect, never a raw socket), pure *state-model + diff*
libraries (`casparcg-state`, `atem-state`), and TSR as the orchestrator composing the two per
device (CasparCG, ATEM, vMix, OBS, HyperDeck, OSC/HTTP/TCP/WebSocket and more). Standalone use
outside Sofie is an explicit design goal (a typings-only package exists for exactly that), and
SuperConductor proves it.

The lesson worth keeping, stated carefully against our own architecture: in TSR, **recovery is
re-diffing intent from a blank slate, never replaying a command history** - a device restart
invalidates the tracked state and the ordinary diff path rebuilds it. NoaCG's command log is not
in tension with this: the log transports *operator intent* durably, and the `/output` renderer
already recovers from per-graphic baselines rather than full replay (`docs/CLOUD_PLAYOUT.md`) -
which is the reconciler idea in log clothing. The transferable rule is for any FUTURE
playout-device adapter (a grown CasparCG agent, OBS, vMix): expose "apply this desired state",
keep a per-device connection state machine underneath, and make restart, late-join and boot
recovery the same code path. Documented here as the pattern; nothing is built until a second
device class exists.

**SuperConductor** (<https://github.com/SuperFlyTV/SuperConductor>, AGPL-3.0 - the app is
copyleft while the libraries are MIT). Electron rundown GUI over TSR, with the same UI/execution
split miniaturized (TSR-Bridge can run remote, next to the devices). Functional but **dormant**:
last release v0.11.3 on 2024-02-22, last commit 2025-02-05, 70 open issues - SuperFlyTV's
attention is on the libraries, not the app. What it proves is that TSR genuinely works without
Sofie Core; the reusable asset in that ecosystem is TSR and the connection/state libraries,
never the apps on top.

**casparcg-connection** (<https://github.com/SuperFlyTV/casparcg-connection>, MIT, very
active - v7.0.0 on 2026-08-26). Strongly-typed promise-based AMCP: one typed method per
command, serialized queueing (AMCP has no request ids, so response matching depends on strict
ordering - the library owns it), multi-line/XML response parsing, reconnect plus a PING
keepalive for silent half-open sockets, AMCP 2.1/2.3 differences internalized. **The adoption
rule for us**: the shipped loopback agent (`docs/CASPARCG_CONNECT.md` - PLAY/STOP/VERSION, one
line at a time) is correctly minimal and gains nothing from the dependency today; adopt
casparcg-connection the moment the CasparCG surface needs INFO/template-data parsing or
unattended long-running connections, because response framing, interleaving and half-open
sockets are exactly what a naive client gets wrong first.

### 1j. ebu/ograf itself - what moved since the Server API went stable

Since 2026-08-13 the repo's motion is doc-consistency polish: open issues on graphic data
validation semantics (#75/#79), a schema description omitting `load()` (#80), customActions doc
vs schema mismatch (#81), and audio for non-real-time graphics (#77). **Nothing on auth, push or
state streaming, upload endpoints, or table/array GUI guidance; no v1.1 planning visible.** The
review's load-bearing "deliberately outside the standard" list is stable - the vendor territory
our command log occupies is not about to be standardised out from under us. The open doc issues
are small, contributable items where an outside PR would be visible - gated as outreach (§5).

---

## 2. Generic OGraf operation inside NoaCG - the boundary

What it means for a foreign conforming package to be a **first-class playable object**, and
where first-class ends. The operations, against what exists today:

| Operation | Today | Missing for first-class |
|---|---|---|
| inspect | `noacg inspect` prints the derived operator surface from any package (`ografImport.ts` -> `ografContract.ts`) | in-app surface for the same read |
| validate | `noacg validate` mounts and drives the full lifecycle; manifest + package checked on read | nothing structural |
| load / play / stop / update / custom actions / steps / dispose | `src/bridge/ografHost.ts` does all of it in the CLI's contained bench context | the same host **behind the isolation boundary** (§3), in preview and `/output` |
| edit exposed data | the derived `FieldDescriptor[]` is the same shape every control surface renders | residence: a library item of kind "OGraf package" so a production can hold one |
| place on a render target | our production/layer addressing is exactly the vendor-shaped `renderTargetSchema` the standard expects | the `/output` stage mounting a foreign Graphic on a layer |
| recover | the standard's own snap: `load` + `updateAction` + `playAction({goto, skipAnimation})` | wiring that replay into the per-graphic recovery baseline the log already keeps |

Two boundary rules, both already enforced once and to be kept enforced:

1. **Data-editable and playable, never structurally editable.** A foreign package has no NoaCG
   sources; `noacg save` refuses to turn one into an editable template
   (`cli/src/commands/save.ts`), and that refusal is correct. The ONE door to structural
   editing is our own `v_noacg` block with shipped sources and a matching content hash
   (`ografImport.ts` - a stale hash is detected and said). The Eyevinn editor sharpens the rule
   from the other side: its packages carry *their* scene model in *their* vendor keys, which are
   as opaque to us as ours are to them. Foreign vendor blobs are never interpreted as editable
   structure - the manifest's public contract (schema, actions, steps) is the whole interface.
2. **The operator surface derives from the manifest alone** - no NoaCG-specific authoring
   metadata may ever be *required* to operate a foreign package. `v_noacg` hints improve our own
   round trip (and the GDD alignment work makes standard `gddType` the first-read signal);
   their absence must always degrade to a working panel, as `ografContract.ts` already does.
   The honest degradations stay stated, not hidden: no state feedback means every action offers
   as live; unknown GDD shapes are listed in `notes` rather than half-drawn.

What a foreign package does NOT get, stated so nobody builds it by accident: membership in the
wizard/catalog roads, the editor, the AI harness, SPX/CasparCG single-file exports (it has no
NoaCG document to compose), or the video pipeline. It is a playable, data-editable, recoverable
production citizen - the renderer and controller side of the product, not the authoring side.

## 3. The isolation model - what imported executable code requires

An OGraf package is arbitrary executable web code. Before one enters the library, the preview or
`/output`, it runs behind a real boundary - the review made isolation a prerequisite (owner
amendment 3); this section specifies it.

**Threat model.** The package's code must not reach: NoaCG auth/session state, capability URLs,
local/durable storage keys, the Supabase client or its tokens, other productions' data or
control links, the parent page's DOM, or the network beyond its own package scope.

**The pattern exists in-repo and is already load-bearing** - the player-host posture:
`sandbox="allow-scripts"` with **no** `allow-same-origin` (an opaque origin, so the frame's code
cannot read cookies/storage of any origin - `src/components/video/VideoPlayerFrame.tsx`,
`src/preview/composeDocument.ts`), postMessage with a per-session nonce, and the `/output`
stage's frames already carrying `sandbox="allow-scripts"` (`src/output/stage.ts:143`).

**The shape for OGraf hosting:**

- One sandboxed iframe per foreign Graphic, running an `ografHost.ts`-style host document; the
  host document is the boundary adapter - it alone registers the custom element, calls the
  lifecycle, and speaks `ReturnPayload`s back over nonce-checked postMessage. `ControlMessage`
  events map onto `customAction` exactly as the contract module already defines.
- One-graphic-per-frame also dissolves two documented light-DOM limits at once
  (`docs/OGRAF.md` known limits): same-design instances no longer collide, and a foreign
  graphic's CSS cannot reach a neighbour.
- Package files are served from an isolated scope, never the app origin's ambient paths: the
  bridge already mounts packages under a dedicated route with an allowlist
  (`src/bridge/ografHost.ts` header); in-app, the ograf-devtool Service-Worker pattern (§1c) is
  the proven local-file variant. Either way the component's `new URL('./x', import.meta.url)`
  resolves inside the package and nowhere else.
- The bridge's `ografHost.ts` itself is NOT the boundary (CLI/dev context; the review says so) -
  it is the seed of the host *document*, which becomes safe only inside the sandboxed frame.
- Non-goals, honestly: `allow-scripts` still permits CPU burn and its own fetches inside the
  frame where a CSP is not imposed on the host document; a hostile package can be slow or ugly.
  The boundary's promise is confinement, not curation - the bench and validation remain the
  quality gates.

## 4. Interop strategy - the evidence bar, both directions

"NoaCG supports OGraf" is a claim with a definition, and the definition is bidirectional and
never circular (our own host proves only that a package satisfies our reading of the contract).

**Direction A - NoaCG graphic -> foreign renderer/controller.** Evidence ladder, in order of
cost:

1. Schema conformance on every export against the EBU's published files, mutation-tested, plus
   weekly drift check - **shipped** (`docs/OGRAF.md`).
2. The scripted **ograf-server round** (upload via its zip endpoint, drive via `/ograf/v1`,
   assert `ReturnPayload`s) - graduates the two hand walks; reruns when the component or
   manifest changes shape.
3. **The 83-rule checker pass** - the community bar (§1d).
4. **The SPX-GC 1.4 round** - a NoaCG OGraf package in an SPX rundown (§1g).
5. **ograf-devtool run** - the blocked hand check, retried (§1c).
6. When testable: CasparCG's native OGraf producer (still "soon-ish"), Erizos, LiveOS, BBright.

**Direction B - foreign graphic -> NoaCG controller/renderer.** The fixture corpus, each package
loaded, inspected, control-derived and driven through the full lifecycle - first in the bench
host (exists), then behind the §3 boundary in preview and `/output` (the real claim):

- **EBU `v1/examples`**: `minimal`, `l3rd-name`, `ograf-logo`, `renderer-test` - small and
  canonical.
- **nytamin/ograf-graphics** - the community stash: MIT, mostly AI-generated, "as is" - messy
  real-world variety, which is the point.
- **Ferryman output** - generated on demand at the hosted app (§1f): external runtime,
  marker-derived steps, `v_spx` keys - the structurally-different case.
- **An Eyevinn ograf-editor export** - WAAPI motion, `v_` scene blob, per-step visibility.
- **A Loopic export**, when one is obtainable (closed product; no public gallery).

**The bar for the public claim**: both directions machine-checked in CI (A2 + the B corpus), at
least one *third-party-witnessed* round each way, and - per the owner's sequencing ruling (§5) -
a real production playable end-to-end on our own output architecture before anything is claimed
anywhere public. `e2e/ograf-contract.spec.ts`'s hand-written manifest grows into the B corpus;
the GDD coverage table from the review's §9 rides along (every standard `gddType` producing the
right control, the degradation ladder exercised, ograf-form as the oracle - §1b).

## 5. Sequencing - what binds, in what order

**Owner ruling, 2026-08-29 (evening, relayed via the wave coordinator; binding on this file):
build WORKING OGraf playout first, on the EXISTING NoaCG output architecture - the `/output`
renderer and the durable command log - never a separate playout system. All outreach - the
ograf.dev listing, any EBU pitch or working-group contact, public claims - is gated behind
NoaCG being something EBU/YLE can test in a real production.** This reorders the ratified
ladder's first rung (the listing was previously "cheapest credibility per minute"); the GOALS.md
NEXT section carries the same gate, and the review's §12 carries a dated update note.

**Must influence current work:** only discipline, no tasks. What may START is the register's call
and not this file's: `docs/PROGRAMMES.md`, "P6 OGraf & Interoperability" records that P6 may start
now, and the date under `docs/GOALS.md` `## NOW` is the forecast of when the push matters rather
than a wait (owner ruling, 2026-09-03). This paragraph used to read "nothing new starts before
2026-09-12", which the ruling retired; its twin in `docs/OGRAF_FIRST_REVIEW.md` §12 was corrected
first. The student push's CasparCG/SVG decisions are already compatible with everything above -
machines live inside the graphic, steps are the default path, the control contract derives from
the document. Nothing found in this research asks the current push to change course, and nothing
here may delay it.

**Next major work after the editor-playout foundations - one road, in dependency order:**

1. **GDD alignment** (already on the ladder): emit standard `gddType`, read it first on import,
   honest `stepCount` 0/-1, one step-walk - with ograf-form as the cross-check oracle.
2. **Untrusted-package isolation** (§3) - the prerequisite.
3. **OGraf import v1**: the library item of kind "OGraf package"; playable, data-editable,
   operated by the existing dashboard; the fixture corpus (§4 B) is its test suite.
4. **OGraf playout on the existing output architecture**: `/output` mounts foreign Graphics on
   layers behind the boundary, recovery replays via the standard's snap on the log's baselines -
   the owner-ruled next-major item, and the thing no ecosystem product gives its users today
   (the reference server itself has no recovery, §1a).
5. **`/output` wears the Server API facade** (already on the ladder): ingress that writes the
   log; contract tests off the published OpenAPI, with ograf-server as the behavioural oracle.

**Gated outreach, only after a real production runs on the above:** ograf.dev listing (one
curator, approachable - §1d), the checker-CI community contribution, ebu/ograf doc PRs
(#79/#80/#81 are open and small), any EBU/YLE-facing pitch.

**Backlog (filed, one file each, each with its why):** the 83-rule checker pass
(`ograf-checker-83-rules.md`), the SPX-GC 1.4 interop round (`spx-gc-ograf-round.md`), the
ograf-form oracle harness (`ograf-form-oracle.md`), the Ferryman convention adapter
(`ograf-lottie-ferryman-conventions.md`).

**Research only, explicitly parked:** the native renderer - gstcefsrc's dossier now sits in
`docs/NATIVE_PLAYOUT_RESEARCH.md` §8, and its verdict (fork-and-fix, the pacing contract
unsolved outside CasparCG) *strengthens* the 2026-08-16 park; ST 2110; TSR-style device
abstraction until a second device class actually exists.

---

## Sources

Five dedicated research passes, 2026-08-29, reading repositories, package manifests, sources and
issue trackers; URLs inline throughout. In-repo grounding: `docs/OGRAF_FIRST_REVIEW.md`,
`docs/OGRAF.md`, `docs/CLOUD_PLAYOUT.md`, `docs/NATIVE_PLAYOUT_RESEARCH.md`,
`src/control/ografContract.ts`, `src/export/targets/ografImport.ts`, `src/bridge/ografHost.ts`,
`src/output/stage.ts`, `docs/backlog/ograf-ecosystem-watch.md`.
