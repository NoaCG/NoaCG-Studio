> Historical evidence, superseded 2026-09-17. Follow [EDITOR_PLAN.md](../../EDITOR_PLAN.md).
> Original claims and status below are dated history, not current instructions.

# Professional editor direction, motion, data and AI

Owner correction, 2026-09-17. This is a required scope revision to the unified editor roadmap.
Product implementation and committing remain paused. The first mockup was rejected for
professional quality, timeline clarity and replacing the canvas with code. Its screenshots
are historical evidence, not the accepted design. This document and the revised roadmap
supersede that proposal, including its mandatory Monaco gate and exclusion of loop authoring.

## Product and workspace

Build our own source-backed editor, with the professional workspace discipline of After
Effects and pinned Zero Density OGraf Studio. The outcome is a practical broadcast authoring
environment plus a quicker Starter Collection -> brand -> rundown workflow, not just a
friendlier inspector. Preserve the earlier keep/refactor/replace and licence findings.

- Canvas remains visible in every editor workspace, including AI, data, assets and optional
  code. No Code-only mode. At 1366x768, collapse ancillary docks before sacrificing the canvas.
- Compact application bar; chat with project/assets/brand tabs at left; dominant composition
  at centre; Layers above Properties/Data at right; resizable timeline below. This follows
  the Studio screenshot supplied by the owner, with one shared layer/selection model. Use precise typography, aligned rows,
  quiet borders and restrained selection colour. Avoid oversized toolbar buttons and cards.
- The timeline owns the layer hierarchy and expanded property tracks. If a Layers tab appears
  elsewhere it shares the same selection and identity; do not maintain two competing trees.
- Names, disclosure, visibility/lock, property values, key buttons and time tracks align row
  for row. Collapsed layers show summaries, expanded rows expose independent keys. Separate
  editor lock from output visibility. Selection highlights in canvas, timeline and inspector.
- Layout/Animate remains explicit. Selection does not create keys; changing a property in
  Animate does. A stopwatch enables animation; a property diamond adds/removes a key at the
  playhead. Before/after key navigation, exact frame entry, Delete, nudge, Shift multi-select,
  marquee, snapping and undo must work without discovering hidden menus.
- Monaco is optional and may be deferred. Retain readable code, external editing and source
  preservation irrespective of whether Monaco ships. If included, dock it beside the canvas
  with shared document transactions; never replace the canvas or split undo histories.

The v2 mockup demonstrates placement and a bounded set of interactions, not a real renderer,
Lottie parser, model connection, data connector or export implementation. All those require
the source/runtime and browser acceptance below. No claim of visual parity follows from it.

## Motion contract: one playhead, explicit lifecycle

The composition ruler uses frames with seconds/timecode display at the document frame rate.
Drag the actual playhead or click/drag the ruler to seek; there is no competing scrub slider.
Use the same selected time for canvas, property values, keys and playback. In/out segments
and cue boundaries are visible on that ruler. Dragging a key moves that key, not the playhead.
Escape cancels a gesture; one completed gesture is one undo. Snap and zoom never change data.

Distinguish three controls that are easy to confuse:

1. **Out start marker:** where the authored exit segment begins on the composition ruler.
   Dragging it edits animation timing, not a production timer. Default keeps property keys at
   their absolute frames; shorten into keys -> show affected keys and refuse until the user
   explicitly chooses trim or Scale segment. Never silently move unrelated keys.
2. **Out trigger policy:** manual operator Out by default; optional automatic Out after a
   chosen hold duration. The hold timer starts when the nominated held cue is reached, not
   when loading the graphic. A new Take resets it; an ordinary data update does not. Next
   cancels the old cue's timer and starts a timer only if the new cue explicitly has one.
3. **Preview Out / production Out:** the action that exits the current live state. Rehearsal
   uses the same runtime policy as output. Authoring scrubbing itself never sends live commands.

A held cue is indefinite in live use. The editor's finite hold preview window is a rehearsal
sample, clearly labelled, not a declaration that the graphic must disappear after six seconds.
Next can reveal another cue; the stop count is not increased by local animation loops.
An Out received during In, a hold or a loop begins from the displayed values. Default exit
stops the loop and uses a finite exit transition without a pose jump. An optional finish-cycle
policy must have a bounded maximum wait and visible rehearsal behavior. Define repeated Take,
repeated Out, update during exit, dispose, interrupted Next, and auto/manual trigger races in
the same state machine. Only one exit runs for a given take revision.

Pinned Studio supports ordered start/step/end markers with adjacent transition durations and
layer-local loops. Its inspected action queue serializes calls; it is not proof of preemptive
Out semantics. Our proposed interrupt behavior therefore needs its own tests. See
[Studio lifecycle source](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/ograf-runtime/src/lifecycle.ts)
and [layer-loop types](https://github.com/zerodensity/ograf-studio/blob/3142fc7d02934494931eb14e7dc255393e4110d0/packages/scene-model/src/types.ts).
The owner clarified that “Lubic” means **Loopic**. Its
[Composition API](https://docs.loopic.io/api/composition/) exposes `outroFrame`, and its
[default Stop middleware](https://docs.loopic.io/api/loopic/) starts the main composition
animation from the frame designated as Outro Action. Its
[animation guide](https://docs.loopic.io/user-guide/animation/) creates property keys at the
playhead and edits easing in the inspector. These are documented semantics, not a recorded
Loopic browser acceptance walk. The designated outro frame is the appropriate reference for
NoaCG's Out-start marker; our live interruption contract still needs independent validation.

## Lottie, loops, paint and effects are required

Existing seams: `src/blocks/lottieInsert.ts`, `src/assets/lottieSupport.ts`, bundled local
player and self-contained exporters. Retain those foundations; the current insertion path
alone does not satisfy timeline authoring.

- Import packaged Lottie JSON/assets with a compatibility report; identify missing fonts,
  external references, expressions and unsupported render features before a misleading preview.
  Choose a bounded supported renderer/profile. No remote dependencies in generated packages.
- A Lottie layer has trim in/out, native frame rate, speed, offset, fit, playback mode and
  loop range. Show its clip in the timeline. Map composition time to native frame explicitly,
  including documents with different frame rates and reverse seeks.
- A layer-local loop has start/end, activation cue/lifecycle, duration, phase and finite or
  indefinite repeats. Animated HTML/SVG properties and Lottie may both use the loop contract.
  A secondary local-clip ruler is available when editing a loop; the composition canvas stays.
- Seamless means no unintended discontinuity at the repeat boundary. Compare end/start value
  and velocity for editable properties, inspect Lottie boundary frames, and flag a visible
  seam. Do not promise any imported file can become seamless through a checkbox. The curated
  animated bug and holding background must pass repeated-cycle pixel review.
- Lottie marker segments can initialize In/loop/Out ranges when present. Manual range controls
  remain required without markers. Editing native Lottie paths is outside this release; a
  Lottie asset is a timed layer, not a promise to recreate the After Effects composition.
- Author solid, linear and radial gradients with editable stops and gradient geometry.
  Support shape/path clipping and alpha masks, inversion and explicit source association.
  Author a composable ordered effect stack initially covering blur, drop shadow and colour
  adjustment (brightness/saturation). Duplicate, reorder, disable and animate supported numeric
  parameters. Explicitly prevent mask cycles and deleting a referenced source without repair.
- Emit readable CSS/SVG/animation patches through known adapters; keep unsupported filters
  untouched. Sample effect order, masks and gradients in preview and every exported target.
  Missing target support is a surfaced compatibility decision, never a silent flat replacement.

## Data and reusable packages

Brand roles and component defaults use the existing Home brand records and TemplatePack
provenance. Applying a brand previews all selected graphics, respects local overrides and is
one undoable transaction. Starter templates exercise required capabilities: lower third,
headline, animated logo bug, looping holding screen, end screen; add an object-array scoreboard
or results-list fixture for data acceptance, without quietly changing the five-item Starter set.

Data authoring must bind text, images and colours to scalar fields, nested GDD objects, arrays
and runtime collections. A Data dock separates schema, bindings, sample data and live source.
Use stable identities internally and public paths in exports. One field may feed multiple
properties; type-check each target and show missing/null/type mismatch fallbacks. Define
precedence explicitly: design/brand default -> valid bound value -> authored animation delta
where supported. Conflicting ownership of a property must be shown and resolved, not depend
on which effect runs last. Colours are replace bindings unless a documented animated operation
applies; don't imply arbitrary arithmetic on every property.

Runtime collections repeat a named prototype group from an object-array field with stable item
keys, layout direction/gap, max visible count, empty state and overflow/paging policy. They are
different from Starter Collections, which are reusable sets of graphic templates. Editing the
prototype updates generated items; editing sample data does not rewrite authored markup.

The first live adapter is schema-validated JSON with configurable polling through the existing
controller/backend boundary. Manual and recorded sample data require no service. The controller
owns one effective data snapshot/revision and sends it to preview and output; don't let each
renderer independently poll. Store source secrets outside graphic packages; use an allowlisted
server connector when credentials or CORS require it. Stale/disconnected status retains the
last good value by default, with explicit reset. Out-of-order updates cannot roll data back.
Rehearsal can record and replay updates deterministically. Arbitrary connector marketplaces
are later scope; live updates and nested/array authoring are completion requirements now.

Export adapters must state per-target representation for nested objects/arrays/collections.
OGraf emits the valid GDD contract. SPX/CasparCG use supported update payloads or an explicit
mapping/serialization adapter with compatibility report. Basic shared fixtures must work on all
three; an unsupported advanced transport is blocked or deliberately mapped, never discarded.

## AI throughout the editor and external tools

Code audit: `src/ai/modelGateway.ts` calls `/api/ai/generate`; `api/_lib/aiGateway.ts` includes
Vercel AI Gateway and provider adapters. `api/ai/generate.ts` already has rate limiting,
credential, routing and ledger seams. `cli/src/mcp.ts` exposes the current independent tool
door. Retain these. Do not create a second provider settings screen, validator or exporter.
The current CLI/MCP does not already edit the active browser document; that bridge is new work.

Define the operation registry in M1, alongside the document transaction, and expose each
implemented operation to UI and agents as it lands. Embedded chat is not left until M8.
Operations cover inspection, selection references, set text/style/layout, objects/assets,
property keys, cue timing/loops, paints/effects, data bindings and brand application. Every
mutation takes document ID, expected source/asset revision and an atomic operation batch.
Results include changed targets, source diff, new revision and preview readiness. A stale
proposal is re-inspected/re-proposed rather than automatically rebased. Failed validation
changes nothing; cancel stops pending tools; one batch is one undo. Never apply to live output
merely because the model changed an editor draft.

The left AI dock keeps selection chips, conversation, progress/cancel and a changed-items
summary beside the visible canvas, with Layers and Properties still available at right. Explicit simple edit requests can apply under the user's existing
authorization with Undo. Multi-operation generated designs have preview/review; destructive
replacement and production deployment remain explicit actions. Show frame strips for motion
changes. A successful tool response alone is not evidence of a good-looking graphic.

Ground the helper in versioned NoaCG docs, operation schemas and current document/selection.
Start with retrieval and tool calling, not training a custom model. A lightweight hosted model
handles explanations and bounded basic edits; harder authoring can use BYOK or the user's
external agent. Pick model IDs from a current capability-tested listing at implementation time,
then pin and evaluate them. Never promise that a cheap model can safely perform arbitrary JS.

Free-to-user is a hosted allowance, not zero cost to NoaCG. Proposed initial service envelope:
20 helper turns per visitor/day, one concurrent turn, <=6,000 input and 1,000 output tokens per
turn, <=4 tool calls, one repair attempt. These are configurable planning defaults, subject to
measured task success and an owner-approved total service budget before launch. Enforce a
server-side daily/monthly spend ceiling, anonymous abuse limits, cancellation and no automatic
upgrade to a paid route. At exhaustion keep manual editing, local help and the existing own-agent
route available. Offline/self-hosted without a backend must still create, save, preview and
export, with no phantom auth UI. No paid model call or service launch is authorized by this plan.

Current authentication evidence, checked 2026-09-17:

| Route | Decision |
|---|---|
| Hosted helper | NoaCG's server-managed route/allowance; no customer API key needed. Requires budgeted backend service, not a secret in the browser. |
| BYO API key | Existing provider credential path; clear billing owner and explicit fallback choices. Vercel gateway authentication and provider BYOK are different credentials. |
| External Claude Code/Codex via MCP/CLI | Required. User uses their normal supported agent environment; NoaCG tools operate on the same portable source and validated operation registry. |
| Embedded Codex connection | Feasible candidate through a local companion running documented app-server APIs with provider-owned sign-in. Separate connection/pairing/security spike before promising support in a browser-only deployment. |
| Embedded Claude subscription connection | Candidate only through the unmodified Claude Code binary and its own sign-in under applicable terms. Do not offer our own Claude.ai OAuth or collect session tokens; API key remains the dependable embedded-chat route. |

[Vercel authentication/BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok)
requires gateway authentication separately from provider credentials.
[Codex app-server](https://developers.openai.com/codex/app-server) documents managed ChatGPT
login and account/rate-limit APIs. This supports a local integration investigation, not a
promise that a static website can start a local process or spend a subscription via Vercel.
[Claude's current product/authentication rules](https://code.claude.com/docs/en/legal-and-compliance)
allow the unmodified binary under stated terms with each user authenticating directly, while
restricting third-party collection or intermediation of Claude credentials. Its
[June 15 SDK billing update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
paused a billing change; that is not permission to extract subscription tokens. Recheck all
provider terms at the integration milestone. Keep these adapters optional for the first release.

The local companion must pair explicitly with the browser origin and exact document, bind
loopback with authentication, refuse other origins/documents, and distinguish disconnected
from render-ready. Standalone CLI use must not require an open editor. Generated graphics
use the documented editable grammar and stable targets; unknown custom JS remains preserved
with capability explanations. Round-trip through CLI -> visual edit -> CLI -> export must not
flatten a graphic or silently replace source. External file changes conflict-check active drags.

## Additional baseline and acceptance cases

These extend B01-B11. B12 is conditional on shipping Monaco; source round-trip is required B17.

| ID | Required proof and negative case | Owner phase |
|---|---|---|
| B13 | Direct ruler/playhead seek and frame entry; key retime independent of seek; editable Out boundary; manual/auto exit and interruption from In/loop; repeated actions; no jump | M3, M4 |
| B14 | Imported Lottie at differing FPS, trims/ranges, seamless repeated loop, reverse seek, interruption/Out and clean-host packages; reject missing assets/unsupported features honestly | M4a |
| B15 | Gradient stops/geometry, mask/source, ordered effects and animated supported parameters; undo/save/reopen/export parity; reject cyclic/dangling masks | M4a |
| B16 | Bind text/image/colour to object/array values; grow/shrink/reorder collection by stable item ID; missing fields and empty/overflow states; stale feed/reconnect and deterministic replay; target compatibility | M4b |
| B17 | CLI-generated graphic -> visual edit -> MCP edit -> save/reopen -> three exports/internal rehearsal; exact unrelated source preservation; stale concurrent edit refused | M1, M2a, M4c |
| B18 | Free helper explanation/basic edit, BYOK and external tool equivalence; selection context; cancel, invalid tools, stale revision, undo, quota/timeout and offline fallback; real model task quality separately measured | M2a, M4c |

Fixture additions: one bounded Lottie with visible seamless loop and exit, one intentionally
unsupported Lottie; gradient/masked title with two ordered effects; three-entry results array
with stable IDs plus missing/empty/reordered/overflow updates; replayable recorded JSON feed;
CLI-authored source with one supported and one custom region; deterministic model responses
for transaction failures plus a cost-capped, separately authorized live model evaluation.
Each fixture needs source/hash, current NoaCG result, pinned Studio result where comparable,
negative cases, save/undo/export observations and explicit not-implemented classification.
Existing stress observations are not evidence for these new cases. Do not label M0 complete.

## Remaining decisions before implementation

Review v2 workspace/timeline with the owner, finish the previously listed M0 baseline gaps,
and record source-before/after examples for loop/effect/data operations plus the state machine
event table. Confirm the supported Lottie profile and per-target complex-data mapping with
fixtures. Establish which runtime/source schema extensions require migrations on read. Keep
subscription connection spikes and hosted spend approval separate from basic-editor acceptance.
The roadmap owns order and status; this document owns the expanded interaction contracts.

## Revised mockup evidence

[Professional v2 screenshots and interaction receipt](../editor-professional-proposal-2026-09-17/README.md)
record the tested proposal. The first mockup remains rejected; v2 awaits owner review.

## Owner-supplied Studio screenshot

The owner supplied `C:/downloads/ograf-studio-editor.png`, identifying its arrangement as a
preferred reference. It shows chat left, canvas centre with rulers and compact tools, Layers
above Properties at right, and a full-width property timeline with lifecycle markers,
keyframes and easing below. Adopt that spatial hierarchy and density. Keep chat and
properties visible together; closing a dock returns space to the canvas. Optional code must
not replace the canvas. The timeline tree and right Layers tree are projections of one model.
The visible curve editor is a reference for later easing precision; custom Bezier authoring
remains explicitly deferred until the required preset/keyframe interactions are accepted.

[Reference screenshot](../editor-professional-proposal-2026-09-17/ograf-studio-owner-reference.png)
is retained verbatim. The screenshot does not establish its runtime version, performance,
animation semantics or licence status and does not replace the pinned source comparison.
