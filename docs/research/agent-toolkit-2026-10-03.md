# NoaCG Agent Toolkit, shared authoring and agent distribution

**Research date:** 2026-10-03. **Status:** source inspection and recommendations, no product
implementation or directory submission. Editor scheduling remains in [EDITOR_PLAN.md](../EDITOR_PLAN.md);
agent work remains in [issue #772](https://github.com/NoaCG/NoaCG-Studio/issues/772). This is evidence for those plans.

**Landed 2026-10-09, with what changed since.** "NoaCG Agent Toolkit" below is this research's
proposed name; it was not adopted, and the capability is still called the agent door in
[GOALS.md](../GOALS.md). The tasks it proposed live in issues: directory packaging
[#842](https://github.com/NoaCG/NoaCG-Studio/issues/842), hosted authoring MCP
[#843](https://github.com/NoaCG/NoaCG-Studio/issues/843), the roadmap and revision evidence
[#772](https://github.com/NoaCG/NoaCG-Studio/issues/772), the surface-drift gap
[#770](https://github.com/NoaCG/NoaCG-Studio/issues/770), the listing
[#808](https://github.com/NoaCG/NoaCG-Studio/issues/808). Rechecked on main the same day:

- The editor's R1.3b shared commands (`editorFoundation/commands.ts`, schemas, capability and
  refusal discovery, 2026-10-08) and reviewed model proposals (`proposals.ts`, 2026-10-09) have
  landed. Where sections 1, 3 and 6 say there is no semantic operation query, no proposal
  endpoint or no AI review, that now holds for the CLI and MCP only, not for the editor.
- The CLI and plugin manifests are 0.9.0. MCP still speaks eight authoring verbs.
- `git archive --format=zip HEAD` is 112,309,361 bytes (107.11 MiB). The current
  [checklist](https://claude.com/docs/plugins/pre-submission-checklist) stops validation above
  50 MiB, blocks an unpinned `npx` launcher, and holds a non-shell script run from a repository
  subfolder for a reviewer. `/plugin directory` in Claude Code 2.1.287+ is confirmed by the
  [platform support page](https://claude.com/docs/plugins/platform-support).
- Corrections to the 2026-10-02 marketplace research that its files do not carry: the drafts in
  `agent-marketplaces-2026-10-02/drafts.md` are not ready to send until #842 supplies the
  repository, path and launcher; they must not claim ordinary Claude chat can run the local CLI.
  The unpinned npm-latest launcher that `updates.md` describes is current behaviour, not a
  reviewable default.

## Research spec and evidence limits

**Why:** the agent door is a central creation route, and OGraf Studio now connects external
agents and its embedded assistant to an editable project. Agent directories make adoption easier.
**Goal:** compare current implementations, preserve NoaCG's existing foundations, and leave
individual tasks with dependencies and observable completion criteria.
**Non-goals:** rebuild the editor, adopt Studio's scene format, implement a hosted service,
publish listings, change live permissions, or require a particular model provider.
**Key decisions:** NoaCG Agent Toolkit is the product capability; CLI/MCP/skills/plugins are its
components. Extend existing operations. Keep independent file authoring. Recommend a staged hybrid
distribution. Treat mods and subscription-backed providers as optional later adapters.
**Acceptance:** each requested capability has a current/planned classification and evidence;
reuse identifies licences; distribution distinguishes host support and remaining setup; bounded
tasks are linked from existing plans; documentation checks are recorded.

NoaCG was inspected at **70214bb06f8a0c7547cb5d58740b44d7ff20d84c**. Its tracked CLI/plugin
manifests are **0.8.0**; this report does not establish npm's current published version.
OGraf Studio's default **stable** branch was downloaded read-only at
**78ce33189dd8b55176d770a6bf87d0b87ac2e91d**, dated 2026-10-02, version **0.22.0**.
Use the immutable source links below when repeating this comparison; development branches may differ.
Official host documentation was fetched on the research date.

Implemented means found in source, not independently scenario-proven here. No upstream application,
model call, installed plugin, OAuth login or live renderer was run in this research round.
NoaCG's earlier scenario receipts are identified as earlier evidence. Account availability, actual
directory search ranking, reviewer approval and review duration cannot be inferred from documentation.

## Recommendation

NoaCG should close **semantic editing and review parity**, while continuing to lead with
creation through to operating a production. Publish a truthful local Agent Toolkit package first;
follow with remote MCP plus skills for ordinary Claude/ChatGPT users after safe hosted authoring is
available. A directory listing is a bounded near-term deliverable, not a reason to postpone the
current editor or playout foundations.

The shared-authoring direction is already present. The important work is finishing and exposing
it, not creating another graphics engine. NoaCG's package authoring remains useful for agents that
write HTML/SVG themselves. Semantic operations must make the supported parts of that source
editable by humans and agents without replacing unfamiliar code.

## 1. What the NoaCG Agent Toolkit is today

| Component | Current implementation and significance |
|---|---|
| CLI | [cli/src](../../cli/src), npm @noacg/cli, command noacg. File-oriented scaffold, validate, inspect, screenshot, save and pack; doctor/login/docs and separate hardware/Bridge commands. |
| MCP | [mcp.ts](../../cli/src/mcp.ts), stdio, one noacg tool dispatching eight authoring verbs. Uses command helpers and the same bridge as terminal commands. Live hardware verbs are deliberately excluded. |
| Browser authoring services | [bridgeApi.ts](../../src/bridge/bridgeApi.ts), a stateless /bridge page driven by a contained headless browser. Reuses studio type registry, validation/runtime bench, composition, import/export, control derivation and library-record construction. This page is distinct from the local playout Bridge. |
| Canonical skill | [cli/skill/noacg-graphic](../../cli/skill/noacg-graphic/SKILL.md): contract, fields/actions, sources versus generated files, inspect/validate/render/save loop and pack/rundown handoff. Design guidance and critique are opt-in by the existing owner ruling. |
| Host packages | [cli/plugin](../../cli/plugin/README.md): shared skill, Claude command and Claude/Codex manifests. [cli/plugin-mcp](../../cli/plugin-mcp/README.md): separate optional local MCP launcher. Main plugin starts no server in unrelated sessions. |
| Distribution | Repository marketplace, npm and MCP Registry metadata, release-built Codex upload. Existing [marketplace research](agent-marketplaces-2026-10-02/README.md) and [account checklist](https://github.com/NoaCG/NoaCG-Studio/issues/808) already cover submissions. Listing approval is not established here. |
| Knowledge | Public skill includes contract/package/validator/control plus optional design/critique references; noacg docs exposes these and OGraf knowledge. Repo OGraf/SPX expert skills are development references, not automatically bundled public dependencies. Keep portable expertise underneath the NoaCG workflow. |
| Editor operations | [operations.ts](../../src/components/editorFoundation/operations.ts) handles bounded source transforms for artwork/text/style/layers, keys/easing/moves/trims, Out and steps. Helpers live in src/blocks. |
| Revision/history | [session.ts](../../src/components/editorFoundation/session.ts): document ID, expected source/assets revision, transaction ID, source-preserving batch, transient gesture, one document-port history application, view restoration. [PreviewController](../../src/components/editorFoundation/PreviewController.ts) checks matching source/assets, frame generation and request IDs. |
| AI infrastructure | [AI_PROVIDER_GATEWAY.md](../AI_PROVIDER_GATEWAY.md), [AI_TASK_REGISTRY.md](../AI_TASK_REGISTRY.md) and existing server transport own model routes, credentials, privacy, budget and ledger. Generation/import assistance exists; the new editor's grounded help and reviewed semantic edits are R1.3a/b work. |
| Graphic source | HTML/CSS/JS/assets in the graphic model, supported animation data, SVG identities/structure, fields and behaviour. The dual package derives OGraf output with a v_noacg sourceHash. That hash detects stale generated files; it is not a concurrent-edit lock. |
| Destination | Save admits validated graphics to the library using scoped agent credentials. Pack can send graphics and a rundown to Home for an explicit Install into a production. Existing-production replacement, publication and live operation are separate permission questions. |

### Shared already, incomplete at the editing boundary

Terminal and MCP share helpers, but their dispatch code is separately wired. The
[surface-drift gap](https://github.com/NoaCG/NoaCG-Studio/issues/770) therefore still matters.
Neither entrance currently exposes the EditorOperation batch or EditorSession as an authoring API.
Agents normally edit package files; the visual editor interprets supported source and applies
semantic transforms. The bridge shares validators/exporters, not the live editor's selection,
history or document session.

The beginning of the correct core is **operations + block transforms + EditorSession +
document port**, alongside shared inspect/validation/render/export services. It is currently
under a UI directory, so reuse needs an allowed import seam when exposed to the bridge/server.
Moving a bounded module when a consumer needs it is enough; a new package hierarchy is not required.

EditorSession rejects an already-submitted transaction ID; it does not return a successful replay
receipt. Its counters are session-local. A remote/file adapter needs an explicit revision identity,
durable conflict semantics and retry receipts. External document writes currently clear the session's
local receipt stacks. Extending that seam requires tests, not a claim that all mixed history is solved.

[EDITOR_PLAN.md](../EDITOR_PLAN.md) already specifies shared commands, proposals, source round-trip
and later paired MCP. [GOALS.md](../GOALS.md) is current direction;
[noacg-master-goals.md](../noacg-master-goals.md) and
[AI_PLATFORM_PLAN.md](../AI_PLATFORM_PLAN.md) are historical, not rival roadmaps.

## 2. OGraf Studio architecture at the inspected revision

Immutable source root:
[OGraf Studio 78ce331](https://github.com/zerodensity/ograf-studio/tree/78ce33189dd8b55176d770a6bf87d0b87ac2e91d).

| Layer | What it actually does |
|---|---|
| scene-model | Typed Project containing compositions, stable layer IDs, lifecycle keyframes/transitions, independent property tracks/loops, fields/bindings, assets, layout, design tokens, components, patterns and shaders. Editable .ogs source is separate from compiled output. [types](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/scene-model/src/types.ts) |
| authoring-core | Pure operation application to a cloned project; AuthoringSession checks expectedRevision, tracks changes, holds bounded undo/redo and emits transaction summaries/IDs. Dry runs do not commit. [session](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/authoring-core/src/session.ts), [operation types](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/authoring-core/src/types.ts) |
| agent-tools | Canonical schema/description/handler records with injected workspace and browser ports. Capability sections, compact scene queries, timeline/track sampling, operations, review/capture, asset import, validation, certification and save/export. [records](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/agent-tools/src/toolRecords.ts), [ports](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/agent-tools/src/ports.ts) |
| MCP host | Local Streamable HTTP plus editor WebSocket, bounded workspace paths and browser capture URLs. MCP registration wraps canonical records. Named temporary sessions support browser-free model operations; captures/text measurements/certification require a responsive editor. [host](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/mcp-server/src/index.ts), [workspace](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/mcp-server/src/workspace.ts) |
| Visual editor | React/Vite stores, canvas/property/layer/timeline interfaces, history and bridge synchronization. Accepted remote updates enter named editor history transactions. [history](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/editor/src/state/historyStore.ts), [bridge](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/editor/src/state/agentBridge.ts) |
| In-editor AI | Local-server model loop; 14-tool projection of the same canonical records. Provider credentials stay server-side. Save/export/certification/reset/import are excluded from the model's tool projection. [inAppTools](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/agent-tools/src/inAppTools.ts), [chat agent](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/mcp-server/src/agent/chatAgent.ts) |
| Knowledge | Portable ograf-authoring folder with setup, operation, lifecycle, effects, path, shader/pattern and other references. Its in-app prompt projection is generated and drift-checked. [skill](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/skills/ograf-authoring/SKILL.md) |
| Output | codegen plus shared OGraf runtime and validation compile manifest/module/assets; browser conformance exercises output. Agent saves .ogs plus thumbnail and exports .ograf.zip, confined to the workspace and with explicit confirm/overwrite flags. |

### The canonical-operations claim needs a qualification

MCP and built-in AI demonstrably share tool records and authoring-core. However, visual edits still
use projectStore mutations mirrored to the server; AuthoringSession.replaceExternal clears server
undo stacks because browser history owns those edits. The skill also records a UI/MCP discrepancy
for removing a shader's final key. This is a strong shared semantic model with adapters, not proof
that every visual control routes through a single command bus.

NoaCG should adopt the common-schema/handler pattern and test parity explicitly. Copying Studio's
store mirroring would not automatically unify NoaCG's history.

### Revision, proposal and visual evidence flow

An agent reads IDs and revision, then submits an atomic operation batch. Modes are apply, dry-run,
preview and propose. Preview renders the projected project without committing; propose presents a
candidate in the editor. Review distinguishes connected, responsive and certification-ready.
Captures can use short-lived URLs or inline PNG; motion strips sample lifecycle/transition frames.
Deterministic design QA is advisory and separate from conformance.

Proposals carry baseRevision, operations, affected frames and preview metadata. On the main canvas,
the person can compare the original, inspect frames, accept or reject. Intervening manual edits
make the proposal stale. Acceptance enters editor history as one named batch. An optional
exclusive in-app/external-agent lock supplements optimistic revisions; it is not collaborative CRDT
editing. The server also keeps a bounded change log for re-reading after conflicts.

Selection chips include layers and selected keys/properties. Rectangle/freehand references attach
numbered crops with coordinates, notes, frame and revision. They are temporary context rather than
saved project data. Image support depends on the configured provider.
These are documented and implemented workflows, not independently walked here.
[AI authoring guide](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/docs/AI_AUTHORING.md)

### Editing breadth and save boundaries

Studio exposes layer/group creation, property keys/easing, lifecycle step edits, data fields and
bindings, reusable components/tokens, masks/effects, finite repeaters and runtime GDD collections.
GLSL shader paints expose typed pragma controls that can bind data or animation. Procedural patterns
reference shared vector symbols with deterministic row motion. These operations compile to runtime
output; authored component/link metadata stays in source.
[shader/pattern reference](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/skills/ograf-authoring/references/shaders-and-patterns.md)

Agent save/export performs static/package checks and browser certification before writing.
The inspected save handler snapshots a revision, certifies/captures that snapshot and reports the
revision, but save/export do not take expectedRevision. Do not describe them as a caller-enforced
latest-revision lock. NoaCG should bind admission to an exact immutable snapshot and allow recoverable
draft saves even when deployable output fails validation.
Studio's automated checks are expressly not EBU endorsement or universal renderer certification.
[README limitation](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/README.md)

### Local server and provider model

Studio is a browser editor with an optional local companion. Single-file Windows/Linux releases
serve editor/MCP/bridge on loopback; source builds require Node, standalone builds use Bun.
Visual editing and browser save/export can work without the companion. Workspace path containment,
Host-header middleware, short-lived capture tokens and provider redaction are visible safeguards.
No authenticated multi-user hosted-service design is established by this local model. Loopback
is not permission isolation from another local process; do not expose this server publicly as-is.
[development guide](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/docs/DEVELOPMENT.md)

Provider adapters include Anthropic API, OpenAI-compatible API and Codex App Server using a locally
signed-in Codex CLI. Studio retains tool execution and review. A Claude subscription-backed embedded
provider is not implemented. The [Codex adapter](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/mcp-server/src/agent/codexAdapter.ts)
is a useful reference, but OpenAI still marks App Server dynamic tools experimental.
[official App Server](https://learn.chatgpt.com/docs/app-server)

## 3. Capability comparison

Classification is relative to the inspected Studio source. Planned behaviour is not counted as
current parity. NoaCG evidence is the inventory above and the linked domain contracts/receipts.

| Capability | NoaCG classification | Current difference and architectural consequence |
|---|---|---|
| External Codex authoring | partially implemented | Working package authoring and Codex skill/plugin; Studio can query and mutate live layers/keys. NoaCG semantic editing awaits R1.3b/R3.2. |
| External Claude Code authoring | partially implemented | Same file-authoring loop via plugin or MCP. Studio provides live operation/proposal tools. |
| MCP support | comparable | Both exist. NoaCG stdio/file workflow versus Studio local HTTP/live sessions; transports alone are not the gap. Hosted NoaCG MCP is missing. |
| CLI workflows | already stronger | Dedicated doctor/scaffold/validate/screenshots/save/pack/rundown plus local playout Bridge. Studio is MCP/editor-centered, not an equivalent user CLI. |
| Public install/discovery | partially implemented | NoaCG packages/registry/submission materials exist; approved public-directory installed experience is unverified. No Studio directory listing was established. |
| Reusable agent skills | comparable | Both have portable instructions and references; NoaCG covers broader destinations, Studio deeper scene operations. |
| Capability discovery | partially implemented | types, docs, bridge hello and doctor exist. No semantic supported-operation/schema/context query for agents. Studio has filtered capabilities and compact semantic reads. |
| Structured editable graphics | partially implemented | NoaCG source-backed SVG/layers/animation/fields are real, but arbitrary authored code is not guaranteed visually editable. Studio's native scene is structured by construction. |
| Visual editor integration | partially implemented | Supported source reopens in the editor; agents cannot yet safely co-edit the open session. Studio has live synchronization/review. |
| Agent-created layers/elements | planned but behind | Agents can write markup; semantic stable-ID layer creation is currently internal UI machinery. |
| Timeline/keyframes | partially implemented | NoaCG shipped animation/step slices have operations; external tool access and complete planned controls remain open. Studio exposes independent tracks/easing/loops. |
| OGraf step manipulation | partially implemented | NoaCG UI step operations exist and runtime has Next; agents edit source data. Studio exposes lifecycle-step operations. |
| Fields/bindings | comparable | NoaCG operator fields/actions and binding/control derivation are substantial. Studio has richer structured object/array/runtime-collection authoring; no blanket field parity claim. |
| Stateful graphics | intentionally different | NoaCG explicit machines, operator actions, quizzes/polls/clocks and cross-graphic production control. Studio exposes OGraf actions/data/lifecycle; no equivalent show-control system established. |
| SVG editing | partially implemented | NoaCG prioritizes verbatim imported artwork, field roles and source fidelity. Studio already has editable paths and SVG bundle import. NoaCG's bounded Pen and fuller transforms remain work; imported-art fidelity is an edge to prove, not an automatic win. |
| Shader/effect authoring | planned but behind | R2.2 paint/effects and optional later GPU work. Studio GLSL, composable effect stacks and shader data/animation exist. Do not accelerate this ahead of basic authoring. |
| Procedural graphics | missing | Code-authored procedural graphics are possible, but no structured shared-pattern/repeater tools comparable to Studio. Preserve as reference unless a broadcast task needs them. |
| Reference/canvas-region prompting | planned but behind | Existing image/import assistance is not a new-editor, revision-bound region workflow. Selected-context R1.3a first; regions are later. |
| Screenshot/visual QA | comparable | NoaCG lifecycle/state/event/deterministic-time screenshots and text stress have earlier CLI/MCP evidence. Studio adds track sampling and motion strips tied to a scene revision. Both need actual frame judgment. |
| Proposal preview | planned but behind | Transient manual previews exist; AI candidate diff/frame/strip preview is R1.3b. Studio implements it. |
| Accept/Reject | planned but behind | New-editor AI review is not shipped. Studio commits accepted candidates only and invalidates stale offers. |
| Undo after AI edits | planned but behind | Human EditorSession history exists; shared AI transaction and mixed-history proof remain open. Studio has named accepted batches, with separate browser/server history adapters. |
| Validation/certification | comparable | NoaCG shared admission/runtime/engine checks plus earlier external renderer receipts. Studio static/compiled/browser conformance. Neither proves every renderer or formal EBU certification. |
| OGraf interoperability | comparable | Both output OGraf. NoaCG also accepts foreign packages in isolated output; full library/rundown/Server API route is planned. Studio native-source round-trip is richer. |
| Save editable source | comparable | NoaCG source/assets/animation saved in library and package; Studio .ogs stores scene and authoring metadata. NoaCG must make unsupported editability explicit. |
| Export final graphics | already stronger | NoaCG multi-target packages and production exports; Studio focused .ograf.zip. Preserve the adapter strategy and target-specific verification limits. |
| Concurrent-edit safety | partially implemented | NoaCG UI revisions/preview ordering exist; package agents lack editor-session CAS and exact evidence receipts. Studio live optimistic revisions and stale proposals exist. Neither is full distributed collaboration. |
| Security boundaries | intentionally different | NoaCG scoped account writes, contained bench and separate hardware access. Studio local workspace/loopback/provider isolation. A hosted connector needs tenant auth and hostile-code containment beyond either local model. |
| Local/offline | partially implemented | NoaCG self-host/export/local Bridge exist; default CLI uses a reachable deployment and system browser. Offline requires a reachable local deployment/assets and available CLI dependencies. Studio standalone visual authoring is stronger for installation simplicity; remote AI is still online. |
| Onboarding | partially implemented | NoaCG lazy skill install helps, but Node/browser/account consent remain. Studio executable avoids Node for the editor; external MCP/skill/provider setup remains. |
| Production/rundown/live playout | already stronger | NoaCG can install a graphics pack/rundown and operate browser/CasparCG outputs, with earlier real-target receipts and known limits. No equivalent Studio operating environment established. |
| Brand/templates/components | partially implemented | NoaCG catalog, Brand Creator and pack delivery exist; applying brands across productions and reusable editable components remain work. Studio tokens/style packs/components are already scene-native. |

The highest-value gap is not another animation feature. It is one understandable edit/review
contract across humans, external agents and the assistant. The largest practical advantage is a
complete show system: art, data, actions, package, rundown, preview and playout.

## 4. Recommended shared authoring architecture

Keep one source-backed authoring model and one set of bounded operations. Add consumers to the
current registry; do not persist a parallel AI scene. The logical NoaCG Authoring Core comprises
source inspection/transforms, operation schemas, revision/transaction semantics and validation/
render/output services. It need not become a separate physical package now.

Human editor / built-in assistant / CLI / local or hosted MCP
→ schemas and permission-filtered command adapters
→ existing operations and source transforms
→ exact source/assets snapshot
→ shared inspection, preview, validation and export
→ explicit library/production admission.

Host plugins and optional UI wrap these services; they do not implement graphic editing.

### Command and proposal contract

1. **Discover/read:** protocol/schema version, deployment identity, supported operations and limits,
   document ID, immutable revision, stable target IDs, fields/actions, selected context and bounded
   timeline reads. Report unknown/unsupported regions. View/selection are context, not graphic source.
2. **Draft batch:** document/revision, transaction ID, semantic operations and source/asset changes.
   Validate schemas and applicability before any write. A later unsupported operation aborts the batch.
   Keep file authoring available for creative work beyond supported semantic tools.
3. **Preview:** candidate snapshot + readable changes/affected targets + matching render receipts.
   Use the same composer/runtime. Receipt identifies source/assets, timing/data and target environment.
   A missing capture is reported separately from a successful mutation or failed validation.
4. **Review:** candidate does not alter the authoritative draft. Accept checks the base revision
   again; reject/cancel has no source effect. Manual edits invalidate the candidate. Re-read and
   consciously regenerate/rebase; never force a stale candidate over new edits.
5. **Commit/history:** one accepted batch is one named history entry. Preserve preceding/following
   manual steps, selection, playhead and stable IDs; prune deleted selections. A provider never owns
   the history stack. Check duplicate transaction IDs and offer explicit safe retry outcomes.
6. **Save/export:** admit exactly the snapshot validated/captured. Persist recoverable draft source
   independently of deployable-output gates. Export/publish checks that same revision again.
   Applying an edit, saving, replacing a production revision and taking to air are separate actions.

Local file authoring and live paired authoring need different session adapters but the same pure
operation handlers. First expose supported offline/source operations and exact evidence. Later pair
live sessions with origin/document-bound consent, lease/expiry and expected revision. Do not require a
visible editor for every CLI workflow. File hashes, session revisions and remote persisted revisions
must have explicit mappings rather than treating an incrementing UI counter as a global version.

### AI Assistant implications

R1.3a help reads shipped documentation/capabilities/selection, with no mutation. R1.3b adds a
permission-filtered projection of canonical commands and proposals. Models receive compact context,
not the whole store, every asset or the entire tool catalog. A selected key/property includes its
document and revision; later region crops additionally include frame/coordinates and an ID mapping.
References are untrusted inputs and never expand permissions.

Reuse the current model gateway, credentials, privacy and budget controls. Provider adaptation
converts messages/tool schemas/results and streaming/cancellation; authoring, history, review and
policy remain NoaCG-owned. The same acceptance suite must run with a deterministic fake provider
and more than one real supported model route. There is no need to adopt Studio's 14-tool count.

Support modular providers, but keep local Codex App Server as a later qualification spike:
experimental API/version pinning, sign-in/usage terms, allowed tools, timeout/cancel/process cleanup,
secret redaction and offline/manual fallback all need proof. Do not promise that a user's Claude
subscription can fund an embedded provider simply because Claude Code supports external MCP.

## 5. Claude distribution strategy

The official [build overview](https://claude.com/docs/build/overview) and
[directory publishing guide](https://claude.com/docs/directory/publish) now describe public
GitHub plugin bundles and standalone remote MCP connector listings. Paid accounts can submit;
Team/Enterprise require an Owner or an appropriately delegated Enterprise role. New bundles receive
automated checks/security scans and human initial review. Community versus Verified connector
status and search placement are Anthropic decisions; review time is not fixed.

This is viable for NoaCG. Submit a **NoaCG Agent Toolkit package**, keeping the existing identifier
noacg and the owner's approved display names. Do not rename the installed package to match the
umbrella terminology. A listing must state what it can do on each surface.

### A-D product shapes

| Shape | Setup and reach | Recommendation |
|---|---|---|
| A. Hosted MCP connector | Install/connect → OAuth → cloud tools. No local CLI/browser dependency for the user. Needs real hosted authoring/render service and authorization first. Workflow expertise otherwise lives in tool descriptions/prompts. | Useful standalone listing, not the whole toolkit. |
| B. Claude plugin: MCP + skills | One discoverable bundle; skills teach authoring/QA/handoff and a fixed HTTPS MCP URL appears on its Connectors tab. Connection/authentication remains a separate step. | Best ordinary-user destination once A exists. |
| C. Claude Code development/local plugin | Skills/command, optional local MCP, detected CLI/Node/system browser/local deployment. Can author files and work offline with local dependencies. Hooks/agents/mods only if justified. | Bounded near-term listing using existing code. Be explicit that the current executable workflow is local. |
| D. Hybrid | B for cloud users; C as optional local capabilities with matching schemas, skill knowledge and result links. Capability discovery chooses supported paths. | Recommended staged product. Keep the current lazy plugin/optional MCP split until measured onboarding shows a better choice. |

### What travels across surfaces

The official [platform matrix](https://claude.com/docs/plugins/platform-support) is more precise
than the launch announcement. Skills load in Chat, Cowork and Claude Code. Remote MCP works after
connection. Chat ignores local MCP; Cowork can run it in local sessions. Agents/hooks run in Cowork
and Code, while chat skips them. Mods are Code-specific. Top-level bin executables prevent Chat/
Cowork installation. Account installs sync toward Code; command-line installs remain machine-local.
Code **v2.1.287+ has /plugin directory**, so a directory listing can now be found inside Code.
This is distinct from resolution of a bare marketplace install name.

Current noacg instructions primarily assume shell/file access. Installing those skills in Chat
does not supply a reachable authoring service. A universal badge must not imply a tested scoreboard
workflow there until remote tools exist and the skill has a capability-aware cloud path.

### Submission readiness is not just metadata

The current [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist)
checks the repository as well as the selected folder: archive/layout/size, README/licence, component
paths, launcher pins and readable/disclosed execution. Package launchers must use exact versions;
pinned downloads can still be held for review. Non-shell MCP code in a repository subfolder may
also be held. Bundling large/minified executables is not a shortcut to approval.

NoaCG's main skill package already has manifests, README and licensing metadata. Its optional
MCP launcher resolves a local CLI or imports npx with **unversioned @noacg/cli**, and the normal
bootstrap docs use an unpinned package. Treat that as a readiness gap. Check Node/browser minimums,
resolved CLI version and compatibility before use. Keep user-selected installs separate from the
reviewed default; disclose downloads and the deployment contacted.

The inspected git tree has **7,384 files and 158.75 MiB of file payloads**. The checklist's compressed
repository cap is 50 MiB; `git archive --format=zip HEAD` measured **97.21 MiB** (101,926,924 bytes).
Check total entries including directories and attributes as well. Recommend generating a small
distribution-only repository from canonical sources, addressing this known size blocker and
avoiding scans of unrelated research assets. This is packaging, not a second maintained skill.
Do not create that repository or submit it during this research.

### Authentication and realistic one-click setup

For local users: Find/Install → check or install Node/system browser/CLI → select deployment →
noacg login in the user's browser if saving → author/validate → save link or offline package.
Plugin installation does not grant NoaCG account access. The existing scoped key grants limited
admission; never exchange it for a general account session behind the user's back.

For cloud users: Find/Install → Connect → NoaCG OAuth consent → choose accessible project/
destination → create/edit/preview → open saved draft in NoaCG. OAuth discovery, audience/scopes,
PKCE, refresh/revocation and hosted callback plus Code loopback callback must be implemented and
tested. DCR and CIMD are documented choices; API keys in a public manifest are inappropriate.
[connector authentication](https://claude.com/docs/connectors/building/authentication)

The existing loopback agent login is not remote MCP OAuth. Hosted authoring additionally needs
tenant-scoped documents/assets, limits, safe rendering of supplied code, cancellation, exact-revision
admission and audit records. An authoring connector should not inherit CasparCG/hardware access.
Self-hosted custom endpoints need a separate tested path; fixed hosted URL is the simplest first listing.

### Versions, search, analytics and organizations

Keep plugin/CLI versions coordinated but negotiate protocol capabilities; an old installed plugin
must receive an upgrade explanation rather than corrupting a newer document. Directory versions
are scanned from a tracked Git branch/tag; publication settings and holds determine when users
receive them. Do not assume an npm release updates reviewed skill text.
[submission/update procedure](https://claude.com/docs/plugins/submit)

Use ordinary discoverability text: broadcast graphics, scoreboard, lower third, motion graphics,
CasparCG, OGraf, SVG, OBS and vMix where the packaged workflow supports them. Search inclusion
does not guarantee ranking. The announced portal exposes listing/search funnel information;
published usage includes surface/version/component adoption and errors. Connector dashboards add
per-tool health. Track successful create → open editable → save separately with minimal NoaCG
telemetry; installs alone do not prove adoption.
[directory announcement](https://claude.com/blog/build-plugins-for-claude),
[usage and maintenance](https://claude.com/docs/connectors/building/after-publishing)

Team/Enterprise owners can make plugins unavailable, available, default or required, and control
connector availability. Managed Code settings can restrict marketplaces/force installation.
NoaCG permissions still apply to every user/team; organization installation is not authorization
to read all team projects. Enterprise Managed Auth is a later optional adapter, not a prerequisite.
[organization administration](https://claude.com/docs/plugins/admin)

## 6. Claude Code mods: useful only after the handoff exists

Mods were announced 2026-10-01 and require Code v2.1.287+. A plugin names a module in
hooks/hooks.json modules; it exports register(on, options). Event handlers can observe, rewrite or
answer through next(e). The documented API offers ui/state/store/http/mcp/process and other
namespaces. Generated .claude-plugin/types declarations for the installed Code build govern the
API, which can change.
[worked mod example](https://claude.dev/blog/getting-started-with-claude-code-mods/),
[mods API](https://code.claude.com/docs/en/plugins/mods/api)

| NoaCG use | Assessment |
|---|---|
| Project/graphic, deployment and connection status | A small opt-in band could reduce wrong-project edits during paired work; doctor plus a link already serves independent authoring. Measure the actual confusion first. |
| Validation/preview/export state | Show revision-bound receipts, pending/failed/ready and Open in NoaCG. Never invent a green state from a successful tool invocation. |
| Thumbnail | Documented Image/Raster support is terminal-specific; Svg is Desktop-specific. Test the actual surface; retain a NoaCG preview link. A terminal thumbnail is insufficient for broadcast visual judgment. |
| Pending proposal / Accept / Reject | Buttons are feasible, but must call NoaCG's authenticated revision-checked proposal endpoint. Keep the real comparison in NoaCG. No proposal endpoint exists to wrap today. |
| Certification | Label automated conformance and target evidence separately. A status band must not promise EBU certification. |

Drawing appears in terminal/Code Desktop, not every session where hooks execute; the VS Code chat
surface is a notable difference. Read the [interface table](https://code.claude.com/docs/en/plugins/mods/interface)
before promising previews or actions.

**Recommendation: LATER, optional handoff spike; no mod now.** First fix semantic operations,
proposal review and links. A mod earns implementation only if a measured task becomes easier
than ordinary MCP results and Open in NoaCG. It must work with mods disabled and require no prompt,
permission or tool-call rewriting.

Mods are unsandboxed code with the user's permissions, can read secrets/start processes/network
and affect permissions. Managed sec-default/policy adds controls but does not make a NoaCG mod a
sandbox. This is a materially larger trust/maintenance burden than instructions plus MCP.
Use read-only receipt observation and explicit clicks only; avoid powerful hooks for routine authoring.
[mods trust and platform support](https://code.claude.com/docs/en/plugins/mods/overview)

## 7. Portability and packaging

Keep one canonical NoaCG skill and focused references, generated adapters and drift checks.
The [Agent Skills format](https://agentskills.io/specification) supports SKILL.md metadata,
references/assets/scripts and progressive loading; host support for executable scripts and
permission fields varies. Common format does not guarantee identical tool access or policy.

Recommended portable knowledge: NoaCG package/field/behaviour/animation contracts, supported
semantic operations, revision/conflict handling, visual QA and save/pack handoff; specialized
OGraf lifecycle/GDD and SPX/HTML compatibility references underneath. Host setup belongs in
small adapters. Do not copy repository-only skill wrappers as public dependencies.

OpenAI now documents a portable Agent Plugins root manifest with MCP/skills and host extensions,
while the existing .codex-plugin manifest remains supported. Preserve NoaCG's existing Codex
package, evaluate the portable overlay at a packaging task, and generate manifests from shared
metadata rather than hand-maintain separate workflows.
[package guide](https://developers.openai.com/plugins/build/plugins)

OpenAI also documents importing an existing Claude package and excluding/adapting unsupported
components. Use the same source knowledge but validate each directory artifact independently;
a Claude mod does not become a Codex feature through ZIP conversion. The current skills-only
submission can remain a local agent entry; a hosted MCP package must have a genuine cloud workflow.
[Claude-to-OpenAI submission](https://developers.openai.com/plugins/guides/submit-claude-plugin),
[OpenAI submission](https://developers.openai.com/plugins/deploy/submission)

Stable center: NoaCG operation semantics/revisions and MCP adapters. Optional host UX: commands,
dependency declarations, package manifests, directory metadata, mods and provider-specific
launchers. Other MCP clients need no Claude package to author.

## 8. Open-source reuse findings

Studio root/package declarations and its
[LICENSE](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/LICENSE)
are **AGPL-3.0-only**. No separate permissive skill licence was found in the inspected skill folder.
NoaCG studio is AGPL-3.0-only, but @noacg/cli and current public plugin metadata are Apache-2.0.
These are different reuse destinations. Do not paste Studio skill/code into the Apache package and
leave the existing licence declaration unchanged. Direct reuse requires preserving applicable
copyright/licence/source obligations, documenting changes and examining the resulting distribution.
Prefer an independently written NoaCG reference for standard facts and operation patterns.

| Candidate | Classification | Reason / licence and dependency consequence |
|---|---|---|
| Canonical tool records + in-app filtering | COPY THE PATTERN | Strong schema/handler parity, generated capability/docs/prompt projection. No need for Studio's scene dependencies or exact tool set. |
| Revision/dry-run/proposal/history receipts | COPY THE PATTERN | Fits NoaCG's existing session. Copying AuthoringSession imports Studio model/validation and mismatched history ownership. |
| ograf-authoring setup and operation recipes | LEARN ONLY | Assumes running Studio, Studio tool names/scene and mandatory certification. Wrong universal entry point for NoaCG; no runtime dependency recommended. |
| OGraf invariants and interoperability examples | ADAPT / TEST AGAINST | Write NoaCG-specific references from EBU definitions and measured examples. If actual upstream prose/fixtures are copied, retain AGPL provenance and keep them in a suitable licensed destination. |
| Studio conformance scenarios | TEST AGAINST | Exercise our exported packages in Studio/independent runtimes, compare lifecycle, data, deterministic seek and font readiness. Do not claim a passed suite until run. |
| Compact semantic queries/capability sections | COPY THE PATTERN | Extend types/inspect/docs with supported-operation reads; avoid copying a monolithic tool catalog. |
| SVG bundle/path import | LEARN ONLY / ADAPT selectively | Source/model assumptions differ. Inspect a bounded missing import case first; NoaCG must preserve Illustrator art and unknown source. |
| GLSL/effect/pattern implementation | LEARN ONLY | Valuable reference for later R2.2/GPU work. Requires Studio scene/codegen/render assumptions and WebGL2 target evidence. |
| Codex provider adapter | ADAPT only after qualification | AGPL code destination and experimental App Server protocol; do not put it into the Apache CLI by default. |
| Local-server executable packaging | COPY THE PATTERN | Reduces Node installation, but signing, release matrix and safe launch remain work. Current NoaCG Bridge already uses packaged local tooling. |
| CLI/pack/rundown/multi-target control | NOACG ALREADY BETTER | Preserve the existing path instead of importing a second host/control model. |
| Direct production dependency on Studio packages | LEARN ONLY, no direct reuse recommended | Packages are private workspaces coupled to scene-model/codegen/runtime. Porting is a fork/integration commitment, not a small library install. |

Dependencies are not covered by the root licence alone. Studio editor includes React/Zustand/Immer,
JSZip, html-to-image, react-moveable and **GSAP 3.15.x**; agent-tools depends on authoring-core,
codegen, scene-model, JSZip and Zod 4. The standalone server adds Bun/Express/MCP SDK. Verify exact
locked versions/licences and bundled fonts/logos for any selected transplant. GSAP and artwork
terms need separate inspection; do not infer permissive redistribution from the AGPL root.
[editor manifest](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/apps/editor/package.json),
[agent-tools manifest](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/packages/agent-tools/package.json),
[third-party assets](https://github.com/zerodensity/ograf-studio/blob/78ce33189dd8b55176d770a6bf87d0b87ac2e91d/docs/THIRD_PARTY.md)

There is no component currently recommended as **REUSE DIRECTLY**. The absence is deliberate:
the reusable architectural lessons fit NoaCG, but the copied implementation brings another model.
A later small fixture/helper can earn that classification after its exact files and licence are audited.

## 9. NoaCG's edge and task order

Preserve the largest opportunity: an agent builds a **usable broadcast graphics system**, then
the same product runs it. Prioritize arbitrary SVG/design routes, editable source, stateful
operator controls, data, coherent packs/brands and staged production handoff. Do not treat shaders
or a richer keyframe panel as the whole competitive strategy.

| Horizon / task | User problem, dependencies and completion criteria |
|---|---|
| NOW D1: directory-ready local toolkit | Discovery/setup friction. Existing manifests/skill/release are the foundation. Follow [directory task](https://github.com/NoaCG/NoaCG-Studio/issues/842): reviewed pinned/disclosed install, correct repository shape, fresh-machine scoreboard/pack/open-edit round-trip, ready submission materials. Actual approval is a separate external result. |
| NOW E1: capability/schema seam during R1.3b | An agent cannot know which edits are safe. Extend existing registry with runtime schemas and bounded supported-target/operation reads; move pure seams only as needed. Same payload yields the same source patch for UI/bridge; unknown regions preserved; unsupported operation atomically refused. |
| NEXT E2: assistant proposals within R1.3b | A user needs to see and undo AI edits. Depends on E1 and stable editor/preview. Prove help-only, preview/reject/no-write, accept/one-history-entry, manual conflict, matching render, cancellation, denied publication and two provider routes. |
| NEXT E3: independent CLI semantic round-trip | Agent files must reopen as editable layers/motion. Depends on E1; use source/package adapter without a visible editor. Same operations/limits through terminal/MCP; import/modify/save/reopen preserves supported SVG, fields, step/ease and unknown code. Exact source/assets/evidence receipts. Extend [revision item](https://github.com/NoaCG/NoaCG-Studio/issues/772). |
| NEXT D2: hosted authoring MCP qualification | Ordinary chat cannot run the local CLI. Depends on E1/E3 and safe render/admission primitives. [Hosted task](https://github.com/NoaCG/NoaCG-Studio/issues/843) proves OAuth and tenant confinement, isolated draft authoring and exact receipts before a universal plugin promises this route. |
| NEXT D3: universal plugin + connector submissions | Find/Install/Connect/Create. Depends on D2; generated portable knowledge + fixed hosted MCP URL, capability-aware cloud instructions, independent local extension. Real installed Claude chat/Code and Codex tests; connector and bundle paired under the same organization. |
| NEXT E4: revision-bound temporal evidence | Motion/state defects hide in a settled screenshot. Extend existing screenshot/state QA with bounded diagnostic strips around entrance, step, update, loop seam and interrupted Out. Record time/data/revision; disclose omitted frames. Initial CLI evidence can precede live co-authoring. |
| LATER E5: paired live-document MCP, R3.2 | Manual/agent concurrent edits need a common session. Depends on E2/E3; consent binds origin/document, expiry/reconnect, stale/duplicate checks and mixed undo/redo. Two clients at one revision cannot both commit silently. |
| LATER H1: local subscription provider spike | Reuse a user's agent connection where allowed. Depends on E2; qualify experimental Codex API, terms/auth, tool restriction, cleanup and fallback. No universal-assistant dependency. |
| LATER H2: optional mod handoff spike | Only if Open link/receipt results still cause measured confusion. Depends on E5/proposal endpoint; compare task friction with/without mod, verify disabled/managed/terminal/Desktop behaviour and no added write authority. |
| REFERENCE | Region capture after selected context; shader/pattern/repeater knowledge; Studio operation/conformance fixtures; MCP Apps review UI. Preserve evidence, schedule only for an intended user task and target parity. |

Each addition serves the existing agent/editor/production outcomes, extends current machinery and
preserves provider portability. D1/E1 address immediate work; E2/E3 fit already planned trains.
D2 is real new infrastructure and waits for the safe foundations. E5/H1/H2 do not gate independent
authoring or current playout. Do not add an assemble reasoning engine: pack/rundown exists and the
calling agent can do the planning. Brand propagation, new behaviour primitives and OGraf Server API
remain owned by their existing plans.

## 10. Repeatable acceptance and research receipt

Future semantic-edit verification uses an unfamiliar layered SVG and a fresh graphic outside the
development examples. Have an external agent create/edit a scoreboard with text, colour, SVG art,
entrance, Next and Out; reopen it manually; make a manual change; obtain/reject/accept assistant
changes; undo/redo; change data; save/reopen; install its pack/rundown and rehearse in browser and
the supported CasparCG workflow. Include a second agent's stale revision and an asset change during
capture. Every receipt must identify the exact tested snapshot and list unsupported parts.

For distribution, test from installed artifacts on clean profiles: no preinstalled CLI, stale CLI,
missing browser, missing Node, self-host deployment, revoked key, cancelled consent and denied
organization policy. Code-local and hosted chat are separate scenarios. Verify actual search and
account-sync behaviour after publication; metadata inspection cannot establish them.

**Research receipt:** public source downloaded and pinned; NoaCG/source/plan paths above inspected;
official pages opened; no upstream code vendored; no runtime changes; no submissions or account
actions. The NoaCG baseline archive is 101,926,924 bytes (97.21 MiB), a known Claude submission
size blocker, not a portal scan result.

**Documentation check:** on the original 2026-10-03 branch, 22 pinned upstream source paths
resolved and the documentation gates passed. That branch's plan and backlog edits did not land
as written; see the note at the top. These checks do not prove upstream runtime behaviour,
installed-directory flows or live playout.
