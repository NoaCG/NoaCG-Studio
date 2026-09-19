> Historical evidence, superseded 2026-09-17. Follow [EDITOR_PLAN.md](../../EDITOR_PLAN.md).
> Original claims and status below are dated history, not current instructions.

# OGraf Studio and the NoaCG authoring architecture

**Research decision record, inspected 2026-09-13. No implementation is authorized by this document.**
This is the primary editor and agent case study supplementing [EDITOR_RESEARCH.md](EDITOR_RESEARCH.md)
and [OGRAF_ECOSYSTEM.md](../../OGRAF_ECOSYSTEM.md). The full-stack boundaries and work packages are in
[OGRAF_FULL_STACK_PLAN.md](../../OGRAF_FULL_STACK_PLAN.md). Existing authoring rulings and the current
student-production priorities remain in force.

## 1. Decision

**Usability correction, 2026-09-14:** the owner's subsequent feedback rejects the current
basic animation/keyframe experience. The source-authority advantages below do not establish
that NoaCG has a better visual editor or that its implemented controls are good enough.
[EDITOR_REBUILD_PLAN.md](EDITOR_REBUILD_PLAN.md) specifies the requested rebuild using Studio
as the interaction reference, with task-based acceptance before capability claims.

Keep NoaCG's editable code document, SVG import/editing, behaviour-to-control contract, independent
CLI and command/recovery architecture. Learn from OGraf Studio's property-track model, explicit
lifecycle markers, shared compilation boundary, revision-checked authoring operations and visual
evidence tools. Use its exported packages as a foreign interoperability target. Do not adopt its
scene model or runtime as NoaCG's foundation.

The answer to "what would we still build if Studio had existed first?" is substantial but narrower
than "our own editor from scratch." We would still build the code-preserving authoring surface,
the route from a student's SVG to bound fields and real scoreboard/quiz behaviour, and the
controller/recovery/CasparCG workflow. We would first compare Studio's implementations before
designing property keys, local loops, atomic agent edits, package validation and reusable asset
handling. These are supported design patterns, not undiscovered problems.

Studio is ahead in breadth of visual animation controls, numeric per-property keys, curve editing,
vector-point editing and structured runtime collections. NoaCG is ahead for its own requirements
in inspectable source authority, imported-artwork field binding, executable behaviour and the
creation-to-production workflow. Neither conclusion makes either implementation a universal winner.

## 2. Evidence and current maturity

The findings below come from pinned source, manifests, lockfiles, test definitions and limited
pure-function probes. They are **not a new end-to-end acceptance of any editor or renderer**.
No external product was installed, no browser suite was run, and no CasparCG hardware was driven
in this research round. The reproducible probe procedure and source inventory are in
[research/ograf-2026-09-13.md](../ograf-2026-09-13.md).

| Project | Inspected revision | Package/version signal | Role in this round |
|---|---|---|---|
| Zero Density OGraf Studio | `3142fc7d02934494931eb14e7dc255393e4110d0` | root 0.17.0; release v0.17 published 2026-09-09 | Primary editor/agent case study |
| Eyevinn ograf-editor | `616841bd949e3a21137579451123f66c292543f0` | package 1.0.0; last commit 2026-06-11 | Smaller direct editor comparison |
| StreamShapers Ferryman | `f34e577fd928f346e22243b856258ec2df26cd84` | package 2.0.12; last commit 2025-10-09 | AE/Lottie conversion and field conventions |
| SuperFlyTV ograf-form | `adc8490b1ab302bbd8470e563cf9649532b6f5f5` | 1.1.0, 2026-09-11 | Independent GDD form oracle |
| SuperFlyTV ograf-devtool | `7f876eb857559a532c9e7a2645636e32360f5231` | last commit 2026-09-11 | Independent package/lifecycle checker |
| SuperFlyTV ograf-server | `f6d86255bfc8cd5aa77fa6ba227b5adcd6d363dd` | last commit 2026-09-11 | Server API and renderer reference |
| EBU OGraf | `c821671195a077be13bbb96989d4220eea157b99` | Graphics v1 and Server API v1 stable | Normative schemas and API definition |

Studio's public repository was created on 2026-08-27. It has tagged executable releases and CI
that invokes `npm run verify`, including generated-contract drift checks, type checks, tests and
builds. This is stronger evidence of engineering intent than a launch page, but a young public
history is not production endurance. `documentVersion` is already 31 in the inspected source;
that indicates extensive internal format evolution, not 31 independently deployed stable formats.
The maintained source contains tests for migration, lifecycle, loops, collections, code generation,
agent sessions and import. This round did not execute or independently endorse that full suite.[^1]

Two current maturity signals deserve fixture coverage. Open issue #7 asks for clearer export
guidance for real-time-only/opaque packages used in Resolve. Open PR #8 reports packaged fonts
falling back in independent exports while editor previews and lifecycle certification pass.
These are upstream reports, not reproduced findings of this round. They show why target-specific
acceptance must remain separate from an editor's own pass mark.[^2]

The EBU changelog explicitly makes the Server API stable on **2026-08-13**. Eyevinn's README still
calls it draft. Use the EBU definition, not that stale sentence. An OGraf graphic does not have to
use a particular authoring model, JavaScript animation library, DOM layout or vendor editor.[^3]

## 3. What OGraf Studio actually stores and exports

### Authoring document

Studio stores a typed `Project` containing its identity, author, human graphic version,
`documentVersion`, `mainCompositionId`, render-mode flags and a list of compositions. A composition
contains dimensions, frame rate, layers, lifecycle keyframes/transitions, fields, runtime
collections, procedural patterns, custom-action declarations, assets, design tokens, components
and editor layout. This is an explicit scene document from which code is generated. It is not
the exported OGraf manifest and it is not an HTML document edited in place.[^4]

`Layer` is a discriminated visual object plus stable identity and animation/binding data. The
element types are rectangle, ellipse, text, image, path, pattern, image sequence and Lottie.
Properties include transforms, paint/gradients, text fitting, effects, masking and blending.
There are three distinct relationships that should not be confused:

- `groupId` groups independent layers for authoring.
- `parentId` is an authoring transform parent; translation edits cascade into descendants.
- `clipChildren` supplies runtime clipping of direct children to animated parent bounds.

These are not a general SVG DOM hierarchy. Constraints are applied when composition dimensions
change and their results are baked into tracks. Names, locks, semantics, token links, component
links and timeline folders serve authoring. The compiler keeps the runtime data it needs and
drops those authoring affordances.[^4][^5]

### Compilation and package

The principal path is `Project/Composition -> compileDescriptor -> assembleManifest ->
buildExportArtifactsWithRuntime`. The compiled descriptor resolves field IDs to payload keys,
removes guide layers, resolves asset and pattern references, materializes collection prototypes
and paint order, and records lifecycle frames and property tracks. It is Studio's private runtime
representation, **not an EBU scene schema**.[^5]

`main.js` includes the bundled `GraphicElement` runtime, a JSON descriptor and a default-exported
class extending that runtime. The manifest carries standard OGraf fields, GDD, action durations
and render requirements. The package includes referenced relative assets and optional asset
licence files. Its runtime bundle includes GSAP and the Lottie implementation. Self-contained
execution does not make the runtime's licence disappear.[^6]

There is an important distinction in "same preview and export": the export/compatibility path
shares compiled artifacts and runtime code; the editing canvas also has its own authoring
timeline implementation. Shared types and easing samplers reduce divergence, but they do not
prove pixel equality of every canvas state and the shipped package. NoaCG should compare the
actual exported artifact in a clean host against the authoring view.[^6][^8]

### Source save, reopen and foreign import

`.ogs` is editable JSON source. Legacy `.ogeproj` and `.ogeproj.json` are recognized on open.
`documentVersion` is independent of the graphic's exported version. Normal runtime exports do
not require the `.ogs` document. The importer supports an embedded editable project, recognition
of Studio's compiled descriptor, or a manifest-only fallback. Descriptor recovery cannot restore
all names, groups, guides, constraints or locks; opaque foreign JavaScript is not executed to
recover editable layers. The UI documentation states these losses explicitly.[^7]

Thus Studio's packages can be runtime-interoperable without being fully authoring-interoperable.
The regular MCP ZIP export writes manifest, `main.js` and resources, not the original project.
NoaCG's own source-bearing package with `v_noacg` source pointers/hash is a better fit for a
code-first, independently editable workspace. Keep the two capabilities separately named:
"can play and edit data" versus "can recover editable source." Do not promise foreign layers
merely because a package passes OGraf validation.

## 4. Animation, lifecycle and data

### Independent property tracks

`animationTracks` is canonical per layer: a partial map from supported numeric property names
to keys `{id, frame, value, easing, curve?}`. Legacy whole-transform keys remain an aggregate
view. The custom cubic curve overrides the preset and describes the incoming segment. Transform,
effect parameters, stroke width and gradient-stop offsets can have independent keys. This is
not unrestricted interpolation of every string-valued element property.[^4]

The runtime builds a paused GSAP timeline. Key frames become seconds through the composition
frame rate; label positions come from lifecycle frames. Most transforms become direct GSAP
tweens. Effects, masks, procedural patterns and certain paint properties use shared samplers
or update callbacks. `easingForGsap` delegates to the same cubic/preset sampler used by the model.
The useful reusable idea is one definition of interpolation, not GSAP-specific authoring APIs.[^8]

NoaCG already has `NOACG_ANIM`, a step surface, an animation evaluator/editor and a read-only
fallback for legacy code it cannot safely parse. Add independent-property editing through those
code-backed structures. Do not introduce `Composition` as a second authoritative document.
Any proposed persisted extension must specify migration, readable emission and refusal behaviour
for code outside the supported grammar before its UI is built.

### Lifecycle stops on a continuous ruler

Studio has named lifecycle keyframes with roles `start`, `step` and `end`. Their absolute frames
are computed from adjacent transition durations. Moving a lifecycle marker changes those
durations within neighbour bounds. Property keys remain on their own frame ruler; the retime
planner warns about keys stranded at the old marker or beyond a shortened end. "Freely positioned"
therefore means independently retimed within an ordered lifecycle, not unconstrained reordering
or a separate animation per stop.[^9]

Only `step` markers count toward OGraf `stepCount`. Start is the pre-play pose; the first normal
play advances to step 0, play/goto selects a stop, and play beyond the last stop resolves to End
without `currentStep`. Stop explicitly reaches End, using the exit transition rather than walking
every remaining reveal. Actions serialize through a promise tail, so later calls are retained
while earlier calls finish. That meets one permitted concurrency strategy; it is not preemptive
emergency-stop behaviour.[^10]

The pure probes confirmed the basic first-step, absolute-step, past-end and frame-summing paths.
They did not validate animation timing in a browser. Expand the future boundary matrix to negative
`delta`, negative `goto`, first-call jumps, empty steps, dynamic `stepCount`, repeated play, stop
during entry, updates during exit and dispose with pending actions. In particular, source uses
`params.goto ?? ...`; do not adopt it as the normative interpretation of a negative `goto` without
comparing the EBU rule that gives nonnegative goto precedence.[^3][^10]

### Local loops and deterministic seeking

A `LayerLoopClip` has a local duration, phase offset, finite repeat count or indefinite repetition,
property tracks, and activation for either a particular Step or the lifecycle. The local ruler
does not add OGraf steps. Runtime loop state and loop exit transitions live separately from
finite lifecycle progression. This is the correct conceptual distinction for a pulsing bug or
on-air background that must keep moving while a graphic waits for the next cue.[^4][^10]

Non-real-time methods replay the scheduled prefix from a saved baseline, rather than incrementally
advancing a cursor. This supports backward seeking and restoration of data that a later update
would otherwise leave behind. Lottie is sampled from an absolute clock with changed non-real-time
seeks rebuilding its player. These are strong reference patterns, but NoaCG must not advertise
non-real-time support for arbitrary authored JS, wall-clock timers or side-effectful custom
actions until those behaviours have a deterministic contract and tests.[^10]

### Bindings and update behaviour

Fields have stable authoring IDs, public keys, labels, defaults, constraints, recursive object
properties and array item schemas. A layer's ordered `bindings` point from field ID to target
property, optionally through a nested `sourcePath` and value map. The compiler converts IDs to
public `dataKey`s. One field can feed several properties on several layers; this is not a one-field,
one-element limitation. Whole paints and individual gradient stop colours can be bound.[^4][^5]

`compileDataSchema` emits GDD; runtime data is applied through the shared render/binding functions.
The composition also has a frame-based update crossfade. Keep binding, interpolation and update
transition separate in NoaCG: binding identifies the value's consumers; animation describes how
an authored property changes in time; the update phase decides what happens when fresh data arrives.
A replayable show should retain the effective data and its authority, not depend on a feed polled
independently by each preview and output instance.[^11]

### Scoreboards, lists and behaviour limits

Studio's `create_scoreboard` recipe materializes editable grouped layers and constrained fields;
`create_clock` and `create_ticker` similarly expand into ordinary scene objects. Runtime collections
are different: an object-array field drives a contiguous prototype group, a per-item offset,
capacity 1-100 and truncate overflow. Updates replace index-based snapshots with the update
crossfade. There is no implied stable row identity, sorting, pagination or sport-specific rule
engine in that abstraction.[^12]

Most consequentially, `customAction` checks the declared action ID and acknowledges it; it does
not execute authored payload behaviour. The source explicitly calls actions declarative metadata.
Neither a score field nor a button named "increment" proves that a scoreboard can increment,
reset, recover and expose legal actions correctly. NoaCG's existing machine and operator-control
model is the better fit for those requirements. For a generic OGraf host, standard data updates
must remain sufficient to display the score even if the controller cannot interpret NoaCG's
vendor-specific convenience metadata.[^10]

## 5. Imported SVG and AE/Lottie are different problems

Studio supports manually editable path elements, masks, gradients, text styles and asset
replacement. These are useful references for editing a shape once it is represented as a Studio
layer. Its SVG bundle import injects supplied CSS, resolves selected relative image/font files
to embedded resources and reports unresolved references. The imported SVG remains **one image
asset**, not an editable decomposition of arbitrary SVG nodes.[^7][^13]

That distinction preserves NoaCG's reason to build import-first authoring. Its SVG route derives
fields and target relationships from the artwork, preserves real markup and attaches behaviours
to that document (`src/assets/svgImport.ts`, `src/templates/importedDesign/`). Do not replace this
with an image-only import. Compare both routes on nested transforms, viewBox/origins, text/tspan,
embedded fonts, gradients, clipping, masks, linked resources and fields that grow their panels.
Unsupported SVG features need a visible fidelity report and source preservation, not silent
conversion to a deceptively editable shape.

Studio's Lottie profile is intentionally different from Ferryman: self-contained JSON, looping
Canvas playback, absolute-time sampling and no dynamic Lottie text/data binding or marker control.
The documented profile excludes external assets/fonts, segmented documents and luma mattes;
expressions are not executed. Treat the exact inspection warnings as authoritative because the
documentation alternates between describing expressions as disabled and as rejected.[^7]

Ferryman keeps the AE/Bodymovin animation as Lottie, exposes underscore-named text/image layers
and uses marker segments (`start`, `next...`, their loop variants, `update`, `stop`). Its OGraf
template loads local Lottie runtime/data, walks markers, replaces content and manages clocks.
NoaCG should copy the **conventions** through a bounded import adapter, with stable nested layer
addresses and duplicate-name diagnostics. It should not translate the entire AE timeline into
editable HTML property tracks or equate Lottie output with After Effects pixel parity.[^14]

Ferryman's inspected wrapper is not a conformance oracle. Source returns objects lacking
`statusCode` on several paths, clamps step targets rather than treating every past-last play as
End, and its `goToTime` expects seconds while the EBU method takes `timestamp` in milliseconds.
`setActionsSchedule` is a placeholder. The default manifest declares non-real-time false, which
avoids promising those optional methods but does not resolve real-time ReturnPayload semantics.
These are source-observed compatibility risks, not results of running a Ferryman export here.
Use it for foreign positive **and negative** fixtures; do not weaken NoaCG's gate to accept every
output unconditionally.[^14]

## 6. Direct comparison with Eyevinn

| Concern | OGraf Studio | Eyevinn ograf-editor | Consequence for NoaCG |
|---|---|---|---|
| Authority | Typed Project/Composition scene source | `OGrafTemplate`: elements, manifest, generated component | Neither proves a second scene model is right for code-as-truth |
| Visual objects | Rich layer union, paths/effects/masks/components | Text, image, rectangle, circle with position/style | Study Studio first for authoring breadth; Eyevinn for a smaller readable generator |
| Animation | Independent numeric property tracks, curves, local loops | Per-element in/out lanes; keys bundle opacity/translation/scale and CSS easing | Same principle of explicit editable animation data, different granularity |
| Step behaviour | Stops on a continuous frame ruler | Step visibility/data snapshots; middle steps snap | Compare both against the intended broadcast use; agreement is not evidence for Studio's exact timeline design |
| Runtime | Bundled GSAP plus samplers and Lottie | Generated Web Animations API code | Keep NoaCG authoring semantics independent of an animation engine |
| Round-trip | `.ogs` source; descriptor recovery loses authoring metadata | `v_ografEditorElements`, `v_ografEditorTimeline`, `v_ografEditorSteps` in manifest; JSON editor snapshot | Source-preserving native packages are valuable; vendor extensions do not make foreign JS editable |
| Data | Explicit property bindings; nested GDD and collections | `{{tokens}}`; mapped JSON/CSV/Google Sheet/RSS feed polling | Prefer controller-owned effective data for replay; expose fan-out explicitly |
| Code editing | Generated deployable module from model | Editable component plus model regeneration | Inspect potential overwrites; a code editor alone is not code authority |
| Validation | Model/schema/package/module/lifecycle plus local visual tools | Bundled EBU schema, tests, separate preview | Keep independent export-host tests |
| Agent surface | Broad revision-checked scene operations and evidence | No comparable MCP layer found in inspected source | Studio is primary evidence here, not Eyevinn |

Eyevinn stores authored lanes under vendor keys, emits only permitted manifest keys plus vendor
extensions and retains component text in its save format. The pure probe confirmed that element
geometry survives in the emitted vendor metadata. The source has explicit foreign-import and
animation-faithfulness tests. Its model still regenerates a component from elements, and a caller
must not assume arbitrary edited JS can survive later visual changes. NoaCG's unsupported-code
refusal/read-only projection is the safer requirement for this product.[^15]

The strongest convergence is **explicit authoring data compiled to an OGraf package**, separate
from the standard itself, with a schema-derived operator contract and lifecycle-aware preview.
They also independently retain authoring information that OGraf alone cannot encode. This supports
NoaCG's existing separation of native source and portable runtime. They differ on the central
animation representation, source packaging, runtime library and feed ownership; those decisions
need use-case evidence, not a vote count. No claim of independent code provenance is made merely
because the repositories belong to different organisations.

## 7. Studio's agent architecture and NoaCG's contract

Studio exposes capabilities and compact semantic scene queries before mutation. The common tool
records feed external MCP and the in-app agent; the latter is a filtered 14-tool projection.
Mutations take `expectedRevision`, operate as atomic batches and support apply, dry-run/proposal
review and undo/redo. The scene vocabulary includes semantic tags, generated IDs, exact-name
selectors that reject ambiguity, property tracks, fields, bindings, groups, effects and components.
It supplies capture, animation strips, track sampling, text measurement and design review so the
agent has evidence beyond a successful mutation response.[^12][^16]

The external interface also provides session creation/open/reset, asset/SVG import, certification,
source saving and ZIP export. `ograf_render_frame` produces a model-based rendering, whereas
`ograf_capture` and browser certification require a responsive editor connection. "Server running"
is not equivalent to "browser ready to certify." Streamable HTTP runs on loopback port 4318;
the editor bridge connects the server-side workspace with the visible authoring session.[^16]

NoaCG currently exposes one MCP tool, `noacg`, with seven verbs: types, scaffold, validate, inspect,
screenshot, docs and save. The CLI has additional commands, including pack and the CasparCG agent.
The MCP implementation delegates to the same command/bridge machinery. The package on disk is
editable HTML/CSS/JS, validation uses the deployment's own gate and bench, and save targets the
library with a scoped key. It is not an MCP interface into a live browser scene.[^17]

| Agent concern | Adoptable lesson | Boundary to preserve |
|---|---|---|
| Discovery | Return supported edits, versions and readiness separately | Do not force a scene recipe or creative style on the external coding agent |
| Concurrent edits | Expected revision/hash and atomic commit | Bind revision to canonical source bytes and assets, not a parallel JSON scene |
| Inspection | Stable element/field/action identity; compact semantic selection | Derive it from code and known metadata; unsupported regions remain explicit |
| Visual evidence | Multi-frame strips, data stress, measured text and changed-area summaries | Render the emitted package; deterministic heuristics cannot judge all design quality |
| Shared tooling | One operation library for UI, CLI and MCP | No second validator/exporter or always-on server just to activate the plugin |
| Review | Show concrete source diff and visual delta, support undo | Preserve existing authorization; do not import Studio's confirmation policy blindly |
| Saving | Associate results with the exact validated artifact/revision | Draft/source saving must not become impossible because a preview cannot run |

A source-level caution reinforces the last row: Studio's package export writes the same artifact
object it certified, but `ograf_save_project` certifies a snapshot and then reads the current
project again before writing it. A concurrent edit during the browser await could separate saved
source from checked output. This is an unexercised race candidate, not a demonstrated failure.
NoaCG's future receipt should name immutable source/artifact hashes and refuse stale commits.[^16]

The owner made interactive co-authoring a required NoaCG capability on 2026-09-17. Add a
revision-checked operation layer around the existing deterministic code transforms and share
it between UI, embedded chat and external MCP. See [professional direction](EDITOR_PROFESSIONAL_DIRECTION.md).
Standalone CLI inspection/authoring must still work without a live Studio window. The existing independent CLI is an advantage for unattended
authoring and portability, not a missing imitation of Studio's localhost server.

## 8. Validation, certification and independent authorities

Studio's checker validates project semantics, bundled official schema, safe package layout,
default module export/API and lifecycle. It creates a disposable document realm and invokes
declared realtime/non-realtime methods. The non-real-time path compares canvas signatures and
collection membership across backward/repeated seeks. This is valuable executable evidence.[^18]

It is not EBU certification. Studio's own README now says so. The checked module is Studio's own
compiler output, and the sampled action/data matrix is finite. For example, the inspected
lifecycle check calls `load` with `renderType`, then supplies default data via update; it does not
by itself test the full `load({data, renderCharacteristics, renderType})` contract. Its seek checks
cannot establish all mixed-action interruption behaviour, fonts, CEF compatibility or physical
output. Treat "certify" as the upstream tool name, not a product claim NoaCG should inherit.[^18]

Use three independent authorities correctly:

1. **EBU schemas, OpenAPI and normative text** define the contract. Pin all referenced schema
   files, not just the manifest root. Mutation-test both positive and negative fixtures.
2. **ograf-devtool** resolves official schema references, validates the module, invokes lifecycle
   methods and uses a Service Worker to serve local package resources. It is an independent
   implementation and a practical debugging host, not the standard itself.[^19]
3. **ograf-server and the actual target renderer** demonstrate interoperability through a foreign
   controller/renderer path. A clean Chrome test does not certify CasparCG's CEF or an SDI signal.

`ograf-form` 1.1.0 is a useful fourth oracle for operator semantics. It is a framework-free Web
Component with no runtime dependencies declared, dedicated multi-select, GDD fallback, nested
objects and arrays including object tables. The old 1.0.0 dossier's "no select-multiple" claim is
superseded. NoaCG's pure adapter still ignores `gddType`, falls back to strings for standard GDD
colour/multiline, and lists arrays/objects as unsupported. The probe confirmed those differences
and correctly retained dynamic step controls. Keep the native NoaCG control generator; improve
its standards coverage and test against the external form, rather than claiming it already
handles every foreign operator schema.[^20]

## 9. Licence and dependency decision

| Candidate | Exact evidence | Decision and implications |
|---|---|---|
| Studio editor, scene-model, authoring-core, codegen, runtime | Root LICENSE is GNU AGPL v3; package manifests say `AGPL-3.0-only` | Updated 2026-09-17: editor-only utility reuse is a candidate under NoaCG's matching AGPL licence; see the [exact-file review](../editor-design-review-2026-09-17.md). Runtime/codegen reuse remains unselected because output embeds covered runtime and no permissive output exception was found |
| Studio runtime dependencies | lock: GSAP 3.15.0 standard no-charge licence; lottie-web 5.13.0 MIT | An AGPL application licence does not settle GSAP terms or downstream generated-artifact obligations; preserve the existing GSAP replaceability ruling |
| Studio UI/server dependencies | React 19.2.8, Zustand 5.0.15, Immer 11.1.16, react-moveable 0.56.0, Express 5.2.1, ws 8.21.3, Zod 4.4.3, MCP SDK 1.30.0 listed MIT; JSZip 3.10.1 MIT OR GPL-3.0-or-later; Nunito OFL-1.1 | These lockfile declarations identify review scope; they are not a complete transitive licence clearance or reason to import the application stack |
| Eyevinn | LICENSE MIT; package dependencies AJV, file-saver, Monaco | Permissive application code, but no bounded component is selected for import. Patterns and external fixtures suffice |
| Ferryman | LICENSE.txt contains AGPL v3; package `license: GNU` is imprecise; bundled player notice identifies MIT player code | Use conventions/external fixtures. Do not treat the player's notice as permission to copy the whole wrapper or assume AGPL-only versus later-version grant without a specific grant |
| ograf-form | LICENSE MIT, package 1.1.0 with no runtime dependencies | Candidate component for a test-only oracle. Keep its notice, inspect locked tarball/transitive dev tooling when implementing the harness |
| ograf-devtool/server | Root licences MIT; substantial separate application dependencies | Run externally as test targets; do not embed their application stacks |
| EBU schemas/OpenAPI/types/examples | Repository LICENSE MIT | REUSE DIRECTLY as pinned conformance inputs, retaining licence/provenance; individual example assets still need their own rights check |

No new dependency, copied runtime, package publication or licensing representation is made by this
round. NoaCG Studio itself is AGPL-3.0-only; the separate CLI is Apache-2.0. Sharing the application's
licence with Studio does not resolve the CLI boundary, emitted runtime rights or third-party
dependency terms. A future actual reuse proposal needs the precise file set, locked dependency
closure, notices and generated-output distribution analysis. The evidence above is sufficient
to reject premature adoption, not a legal opinion about every possible combined distribution.[^21]

## 10. Subsystem disposition

These labels are decision outcomes, not a claim that code has already been imported. REUSE A
COMPONENT identifies a bounded candidate subject to its stated artifact review.

| Subsystem/reference | Classification | Rationale |
|---|---|---|
| EBU schemas/OpenAPI/types | **REUSE DIRECTLY** | Standard definitions with verified MIT repository licence; do not transcribe them |
| ograf-form in an isolated comparison harness | **REUSE A COMPONENT** | Small MIT, no declared runtime dependencies; a second opinion on our generated controls |
| Studio visual scene document | **LEARN ONLY** | Rich model, but replaces NoaCG source authority and imports a large coupled runtime |
| NoaCG source-bearing package and unsupported-code fallback | **NOACG ALREADY HAS THE BETTER MODEL** | Fits independent coding tools and preserves arbitrary source |
| Studio independent numeric tracks and incoming curves | **COPY THE PATTERN** | Improve NoaCG's code-backed animation representation and shared evaluator |
| Studio lifecycle stops and local loops | **COPY THE PATTERN** | Separates cue progression from continuous motion; prove interruption semantics independently |
| Studio groups, masks and vector path tools | **LEARN ONLY** | Good interaction evidence; not an imported-SVG decomposition engine |
| NoaCG SVG-to-fields and behaviour attachment | **NOACG ALREADY HAS THE BETTER MODEL** | Directly serves the student's own artwork and current production goal |
| Studio multi-target field binding and structured collections | **COPY THE PATTERN** | Explicit fan-out and bounded array prototypes, without adopting a private scene document |
| NoaCG executable machine/control contract | **NOACG ALREADY HAS THE BETTER MODEL** | Implements real operator actions; Studio's custom actions are acknowledgements |
| Studio atomic revision edits and shared tool records | **COPY THE PATTERN** | Prevent stale mutations and duplicated UI/agent semantics |
| Studio capture/strip/sampling tools | **COPY THE PATTERN** | Gives the agent visual and temporal evidence; keep NoaCG's independent CLI |
| Studio draft-save gated on certification | **LEARN ONLY** | Useful caution: recoverable source saving and deployable-package gates have different purposes |
| Studio shared artifact compilation/checking | **COPY THE PATTERN** | Receipt must attach to exact bytes and revision, with independent host verification |
| Studio and Eyevinn exports | **INTEROP TEST TARGET** | Foreign runtime packages plus round-trip limits; preserve vendor metadata without requiring it to play |
| Eyevinn WAAPI lanes and metadata emission | **COPY THE PATTERN** | Small explicit data-to-runtime path; no need to copy the generator |
| Ferryman AE/Lottie marker and field convention | **COPY THE PATTERN** | Bounded sealed-asset import path |
| Ferryman emitted packages | **INTEROP TEST TARGET** | Include expected failures; wrapper is not normative |
| ograf-devtool | **INTEROP TEST TARGET** | Independent schema/module/lifecycle checks |
| ograf-server | **INTEROP TEST TARGET** | Standard controller/renderer API reference, not NoaCG's recovery substrate |
| NoaCG durable command ordering/recovery | **NOACG ALREADY HAS THE BETTER MODEL** | Solves NoaCG-specific persistence and recovery requirements outside OGraf |
| CasparCG output path | **INTEROP TEST TARGET** | Immediate real-production acceptance target; retain the existing external engine |
| Future native renderer | **LEARN ONLY** | Editor architecture supplies no evidence for device pacing, SDI key/fill or long-run reliability |

## 11. What remains to be proven

The research is sufficient to keep the architectural boundaries and specify independent work
packages. It is not sufficient to select a replacement animation runtime, promise editable
round-tripping of arbitrary OGraf, claim a full GDD control surface, endorse Studio's packaged
fonts, or promise deterministic NoaCG non-real-time playback. The next evidence is concrete:
the same imported quiz/scoreboard, property-track and local-loop stress graphics, a nested GDD
table, a self-contained Lottie sample and a font-bearing package, checked in clean foreign hosts.
The task definitions and execution order are in the full-stack plan.

## Sources

All source paths below are pinned to the revisions in section 2. Access date: 2026-09-13. GitHub
issue/release pages are time-sensitive evidence. Tests in a repository establish intended coverage,
not a claim that this research ran them.

[^1]: Zero Density, [package manifest](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/package.json), [CI](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/.github/workflows/ci.yml), [factory/version](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/factory.ts), [v0.17 release](https://github.com/zerodensity/ograf-studio/releases/tag/v0.17), [repository metadata](https://api.github.com/repos/zerodensity/ograf-studio).
[^2]: Zero Density, [issue 7](https://github.com/zerodensity/ograf-studio/issues/7), [font-export PR 8](https://github.com/zerodensity/ograf-studio/pull/8), open at inspection. No proposed PR code is treated as part of the pinned main revision.
[^3]: EBU, [changelog](https://github.com/ebu/ograf/blob/c821671195a077be13bbb96989d4220eea157b99/CHANGELOG.md), [Graphics specification](https://github.com/ebu/ograf/blob/c821671195a077be13bbb96989d4220eea157b99/v1/specification/docs/Specification.md), [Server OpenAPI](https://github.com/ebu/ograf/blob/c821671195a077be13bbb96989d4220eea157b99/v1/specification/open-api/server-api.yaml).
[^4]: Zero Density, [scene types](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/types.ts), [migrations](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/migrations.ts).
[^5]: Zero Density, [descriptor compiler](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/codegen/src/compileDescriptor.ts), [manifest assembly](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/codegen/src/assembleManifest.ts).
[^6]: Zero Density, [artifact builder](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/codegen/src/buildExportArtifacts.ts), [runtime bundle configuration](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/vite.config.ts).
[^7]: Zero Density, [user guide](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/docs/USER_GUIDE.md), [OGraf import](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/apps/editor/src/state/importOgraf.ts), [source extensions](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/projectSource.ts).
[^8]: Zero Density, [runtime timeline](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/buildRuntimeTimeline.ts), [easing adapter](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/easing.ts), [authoring timeline](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/apps/editor/src/canvas/masterTimeline.ts).
[^9]: Zero Density, [lifecycle retiming](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/lifecycleRetime.ts), [marker frames](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/keyframeTiming.ts).
[^10]: Zero Density, [GraphicElement](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/GraphicElement.ts), [step resolution](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/lifecycle.ts), [loop sampling](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/loopRendering.ts).
[^11]: Zero Density, [GDD compiler](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/codegen/src/compileDataSchema.ts), [bound rendering](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/renderElement.ts).
[^12]: Zero Density, [broadcast recipes](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/broadcastRecipes.ts), [runtime collections](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/runtimeCollections.ts), [tool records](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/agent-tools/src/toolRecords.ts).
[^13]: Zero Density, [SVG bundle importer](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/svgBundleImport.ts), [path editing](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/pathEditing.ts).
[^14]: StreamShapers, [OGraf wrapper](https://github.com/Streamshapers/StreamShapers-Ferryman/blob/f34e577fd928f346e22243b856258ec2df26cd84/public/template/Ograf/graphic.mjs), [field discovery](https://github.com/Streamshapers/StreamShapers-Ferryman/blob/f34e577fd928f346e22243b856258ec2df26cd84/src/Context/GlobalStateContext.js), [export settings](https://github.com/Streamshapers/StreamShapers-Ferryman/blob/f34e577fd928f346e22243b856258ec2df26cd84/src/Dialogs/Export/OgrafExport.js).
[^15]: Eyevinn, [OGrafTemplate](https://github.com/Eyevinn/ograf-editor/blob/616841bd949e3a21137579451123f66c292543f0/src/models/OGrafTemplate.js), [import/export](https://github.com/Eyevinn/ograf-editor/blob/616841bd949e3a21137579451123f66c292543f0/src/services/ExportImportService.js), [code editor](https://github.com/Eyevinn/ograf-editor/blob/616841bd949e3a21137579451123f66c292543f0/src/components/CodeEditor.js), [tests](https://github.com/Eyevinn/ograf-editor/tree/616841bd949e3a21137579451123f66c292543f0/test).
[^16]: Zero Density, [tool records](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/agent-tools/src/toolRecords.ts), [authoring session](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/authoring-core/src/session.ts), [in-app subset](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/agent-tools/src/inAppTools.ts), [AI authoring documentation](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/docs/AI_AUTHORING.md).
[^17]: NoaCG, [agent door](../../AGENT_CLI.md), [MCP source](../../../cli/src/mcp.ts), [native model](../../../src/model/types.ts), [generic OGraf controls](../../../src/control/ografContract.ts), [source package](../../../src/export/noacgPackage.ts). See the research evidence file for the local base revision.
[^18]: Zero Density, [browser compatibility checker](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/apps/editor/src/state/ografCompatibility.ts), [official schema bundle](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/validation/src/officialSchemas.ts), [README qualification](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/README.md).
[^19]: SuperFlyTV, [devtool schema/module checks](https://github.com/SuperFlyTV/ograf-devtool/blob/7f876eb857559a532c9e7a2645636e32360f5231/client/src/lib/graphic/verify.js), [Service Worker](https://github.com/SuperFlyTV/ograf-devtool/blob/7f876eb857559a532c9e7a2645636e32360f5231/client/src/service-worker.js), [lifecycle host](https://github.com/SuperFlyTV/ograf-devtool/blob/7f876eb857559a532c9e7a2645636e32360f5231/client/src/renderer/LayerHandler.js).
[^20]: SuperFlyTV, [ograf-form package](https://github.com/SuperFlyTV/ograf-form/blob/adc8490b1ab302bbd8470e563cf9649532b6f5f5/package.json), [multi-select](https://github.com/SuperFlyTV/ograf-form/blob/adc8490b1ab302bbd8470e563cf9649532b6f5f5/src/lib/components/gdd-elements/gdd-elements/select-multiple.ts), [array/table controls](https://github.com/SuperFlyTV/ograf-form/blob/adc8490b1ab302bbd8470e563cf9649532b6f5f5/src/lib/components/gdd-elements/json-elements/array.ts).
[^21]: Licence/dependency source files for every project are linked individually in [the evidence inventory](../ograf-2026-09-13.md#licence-evidence). Studio's [locked dependencies](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/package-lock.json) and [runtime package licence](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/package.json) are particularly relevant to exported artifacts.
