# OGraf-first - the strategic review

**Status: RATIFIED by the owner 2026-08-29, with four amendments, applied below**: the authoring
model is named NoaCG-native/code-as-truth (never "SPX-canonical"); the Server API wording is
corrected (status is pollable, there is no durable/push graphic-state stream); untrusted-package
isolation is a prerequisite for foreign-package import; GSAP is escalated from "probably fine" to
"obtain written clarification; meanwhile preserve replaceability". The GOALS.md rewrite in §13
landed in the same commit as this ratification note.

Originally written as the "understanding written before code moves" that `docs/GOALS.md`'s
"NEXT - OGraf-first, not SPX-first" section demanded, and the costing that "nothing moves until
that is costed" asked for. Every claim
about our own code was verified against the tree on this date; every claim about the standard was
read from the published spec, not from memory. Sources sit at the point of use.

The companion research that already existed and still binds: `docs/NATIVE_PLAYOUT_RESEARCH.md`
(the four native-playout routes and the owner's 2026-08-16 ruling), `docs/OGRAF.md` (the export
and its external validation), `docs/backlog/ograf-ecosystem-watch.md` (the adoption ledger),
`docs/CASPARCG_CONNECT.md` (the shipped AMCP client), `docs/CLOUD_PLAYOUT.md` (the browser-output
contract).

---

## 1. The question, and the verdict up front

The question: can EBU OGraf become the canonical contract around which NoaCG's playout system is
built - editor, controller, server, renderer - rather than something we merely export to? And what
does the road from SPX-first to OGraf-first cost?

**The verdict: yes, as three separate decisions, two cheap and one unnecessary.**

1. **The graphic contract - what a graphic IS to any host - can be OGraf, and effectively already
   is.** Every NoaCG graphic exports as a conformant OGraf v1 Graphic; the action vocabulary maps
   1:1 onto our lifecycle; the operator surface can be derived from a manifest alone
   (`src/control/ografContract.ts`). Making this *normative* - OGraf semantics as the reference,
   SPX as one host of those semantics - is a documentation-and-gates decision, not a rewrite.
2. **The controller-renderer wire can wear the OGraf Server API as its standard face**, in both
   directions, without giving up the command log. The Server API (stable 2026-08-13) deliberately
   specifies no ordering, no durable or push graphic-state stream (status is poll-only), no
   recovery, no auth - the log's entire value lives in exactly the territory the standard leaves
   to vendors, so keeping it is not fighting the standard. What changes: `/output` grows a Server API facade (ingress that writes the log), and
   later the controller learns to speak the Server API outward to third-party renderers.
3. **The authoring model stays NoaCG-native - code as truth - and OGraf has no opinion on it.**
   The canonical internal format is one NoaCG-authored HTML document; it *satisfies* the SPX
   contract, but that is a compatibility property, not its name - `fields` and `settings` are
   derived views (`src/model/types.ts:219`), and everything NoaCG-native rides inside the JS as
   `NOACG_ANIM`. OGraf specifies what a *package* and a *component* are, never how a graphic is
   authored or stored. The code-is-truth pillar and the OGraf direction are orthogonal. Inverting
   the runtime (OGraf component primary, SPX globals as the adapter) is possible but buys no user
   anything today; it stays an option, not a step.

So "OGraf-first" is not a migration off SPX. It is: OGraf becomes the canonical **interchange and
playout** contract; the NoaCG-native code-as-truth document remains the canonical **authoring**
format (and is itself what the OGraf component wraps); SPX narrows to one adapter among six that
also happens to run the strictest validation gate - which it should keep doing, because that gate
is a quality asset independent of any format politics. The phrase "SPX-canonical" is retired
(owner amendment 1): SPX is an adapter off the document, never the document's identity.

## 2. What OGraf v1 actually specifies - and deliberately does not

Two stable halves, both MIT, both at <https://github.com/ebu/ograf>: the **Graphics spec**
(2025-09-17) and the **Server API** (2026-08-13). "Future changes will be backwards-compatible
and/or optional."

**The Graphics spec** defines: the `.ograf.json` manifest (`id`, `name`, `main`,
`supportsRealTime`, `supportsNonRealTime`, plus `schema`, `stepCount`, `customActions`,
`actionDurations`, `renderRequirements`, `thumbnails`); a Web Component with `load` / `dispose` /
`playAction` / `stopAction` / `updateAction` / `customAction` (plus `goToTime` /
`setActionsSchedule` for non-real-time); HTTP-style `ReturnPayload`s; a 0-based step model where
`skipAnimation` on every action is the instant-jump mechanism; and the `v_` prefix as the one
extension door.

**The data model is GDD, not plain JSON Schema.** The manifest's `schema` `$ref`s the GDD object
schema; GDD (formerly SuperFlyTV's spec, folded into the OGraf repo 2026-02) is a JSON Schema
subset plus `gddType`, `gddOptions`, `hidden` and `order`, built to auto-generate operator input
forms. Standard `gddType`s: `single-line`, `multi-line`, `file-path`, `file-path/image-path`,
`select`, `select-multiple`, `color-rrggbb`, `color-rrggbbaa`, `percentage`, `duration-ms` -
with graceful degradation (`image-path` -> `file-path` -> `string`).

**The Server API** is REST between "Controllers" and "Renderers": `GET /graphics[/{id}]`,
`DELETE /graphics/{id}` (default merely unlists, protecting on-air content), `GET /renderers[/{id}]`
(returning `renderCharacteristics`, `status`, and a `renderTargetSchema` - a GDD schema describing
what a render target identifier looks like, e.g. `{"bank":1,"layer":14}`; layers/channels are
deliberately vendor-shaped), and instance lifecycle under
`/renderers/{id}/target/graphicInstance/`: `load`, `playAction`, `stopAction`, `updateAction`,
`customActions/{id}`, `clear`.

**Deliberately outside the standard** - this list is the most load-bearing paragraph in the
review, because it is where our architecture lives:

- no graphics **upload** endpoint (ingest is vendor-specific)
- no **auth** (issue #31, on hold); status is **poll-only**, and narrower than this review first
  said (**corrected 2026-08-30**): `GET /renderers/{id}` reports the **renderer's** status - the
  `status` object is on `RendererInfo` - while the instance listing (`RenderTargetInfo`) carries no
  status, no step and no data at all, only which Graphic is loaded where. There is no durable or
  push graphic-state stream, no event subscription, no history. **A Graphic's own
  `ReturnPayload.result` is undeclared on every GraphicInstance action response** while being
  declared on the Renderer's own custom action in the same file - filed upstream as
  <https://github.com/ebu/ograf/issues/82>, and designed around, without waiting on it, in
  `docs/OGRAF_STATE_IN_FIELDS.md`
- no **preview vs program**, no **rundowns**, no multi-graphic coordination
- no **state machines** - state = data plus a linear step position; no parallel groups, no
  transitions, no guards
- no **clocks/timers**, no **audience interaction**
- **lists/tables**: `array`-of-`object` is legal GDD data, but no table `gddType` and no specified
  GUI presentation for arrays
- **versioning**: the `version` field exists, its scheme is explicitly out of scope

Ecosystem, 2026-08: SuperFlyTV's `ograf-server` and `ograf-devtool` (both MIT) are the de-facto
reference implementations; Loopic exports OGraf; StreamShapers Ferryman converts After
Effects/Lottie to OGraf; BBright announced native OGraf in its ST 2110 playout for IBC 2026;
TV 2 Denmark ran a national election on it. **CasparCG has no native OGraf producer yet**
("soon-ish", SuperFly, April 2026) - today CasparCG plays OGraf via ograf-server's renderer page.
The community ecosystem list is <https://ograf.dev/ecosystem> (~30 products, PR to one JSON file);
NoaCG is not on it. No public evidence names Yle as an adopter; the EBU says broadcasters run it
without naming them.

## 3. Where NoaCG already is - further along than GOALS.md admits

The GOALS.md section says "nothing changes today" as if OGraf work were all ahead of us. The tree
says otherwise:

- **Export**: the deepest adapter in the registry (`src/export/targets/ograf.ts`, ~950 lines vs
  ~80-160 for the others), the only target with a transcribed spec validator gating every export,
  a weekly drift check against the published EBU files (`scripts/check-ograf-schema.mjs`), three
  dedicated e2e specs, and two externally-validated rounds in a renderer nobody here wrote
  (`docs/OGRAF.md`). All 1470 catalog manifests validate against the EBU's own schema files.
- **Import, halfway**: `src/export/targets/ografImport.ts` reads any package, validates it,
  derives the operator contract; `src/bridge/ografHost.ts` is a minimal working OGraf renderer;
  `noacg inspect`/`validate` drive a stranger's package through its whole lifecycle;
  `e2e/ograf-contract.spec.ts` renders the real control components from a hand-written third-party
  manifest. What is refused, deliberately and in three places: turning a foreign package into an
  *editable* template (`cli/src/commands/save.ts:47`).
- **The control-plane bridge exists**: `src/control/ografContract.ts` maps `schema.properties` ->
  `FieldDescriptor[]` and `customActions` -> `ControlButton[]` - the exact shapes all six existing
  operator surfaces render. No second control system was built, which is precisely the property an
  OGraf-first pivot needs.
- **The dual package** (`src/export/noacgPackage.ts`): one folder that is simultaneously the SPX
  package and a conformant OGraf Graphic, with `v_noacg` carrying the editable sources. Proven in
  the external renderer 2026-08-22 and mechanically 2026-08-26.
- **CasparCG**: Stage 1 of `docs/NATIVE_PLAYOUT_RESEARCH.md` §6 shipped as
  `docs/CASPARCG_CONNECT.md` - a real AMCP client (`cli/src/commands/caspar.ts`) behind a
  loopback agent, driving an unmodified server. Never yet accepted against real hardware
  (owner-queue item of 2026-08-25 still open).

What does **not** exist: OGraf packages in the library, an OGraf host in preview or `/output`, any
Server API endpoint, any controller-side Server API client, the ecosystem listing.

## 4. The mapping - NoaCG concepts onto OGraf

| NoaCG | OGraf | Fit |
|---|---|---|
| `update` / `play` / `stop` / `next` | `updateAction` / `playAction` / `stopAction` / `playAction({delta:1})` | 1:1, shipped |
| operator **event** (+ payload) | `customAction({id, payload})` | 1:1, shipped; guards stay inside the graphic (an illegal event answers 200 and moves nothing) |
| fields (`fN`) | `schema` properties keyed `fN`, `title` carrying the label | shipped; standard-legal; `FIELDS.md` translates |
| field kinds (`ftype`) | **GDD `gddType`** | **we under-use the standard here** - see §5 |
| steps / `defaultPath` | `stepCount` + the `playAction` walk | by construction: `stepCount` derives from `defaultPath.length - 1` (`src/blocks/animMachine.ts:87-94`) |
| "data never causes transitions" | same rule in the spec | identical house rule |
| snap (recovery, preview) | `skipAnimation` on any action; `playAction({goto, skipAnimation})` | **step-axis snap is fully expressible**; group-axis snap is not (§5) |
| machine state report `{groups}` | `ReturnPayload.currentStep` (scalar); `result` is graphic-specific | scalar loses the chip and greying; `result` is standard-shaped but **undeclared on the Server API's GraphicInstance responses** (§2, issue 82) - the answer that works today is state in FIELDS, `docs/OGRAF_STATE_IN_FIELDS.md` |
| adjust (+1 riding an event) | payload value; we ship the absolute figure | works; `v_noacg.adjust` restores the stepper UI on re-import |
| lists (pipe-lines in one textarea) | one `string` property (or GDD `array`-of-`object`) | ours is honest but opaque; GDD arrays have no specified GUI either - no standard answer to adopt yet |
| clocks | none | stays graphic-internal; the origin-stamped value (`"45:00@<epoch>"`) is just a string field to any host |
| production / cues / layers | none; render targets are vendor-shaped via `renderTargetSchema` | controller-plane, stays NoaCG |
| staged-vs-take, audience plane, data hub | none | controller-plane, stays NoaCG |
| command log, ordering, boot recovery | none (no push, no ordering, no history) | transport-plane, stays NoaCG - the standard is silent, not opposed |

**The misunderstanding check the prompt asked for** - concepts we might have wrongly assumed need
extensions:

- **State machines do not need a protocol extension.** The machine lives inside the graphic's own
  code, and a foreign renderer drives it entirely through `customAction` - proven live in
  SuperFly's server with `escalate`/`standDown` and the scoreboard's `goalA`/`goalB`. The spec's
  designers left state to the graphic on purpose; we happen to have built exactly the shape they
  left room for.
- **Snap-for-recovery of *imported* graphics needs no extension**: `load` + `updateAction` +
  `playAction({goto, skipAnimation})` reaches any step instantly. Our group-level `snap` is only
  richer than the standard for machine-bearing graphics - which, when they are ours, carry
  `v_noacg` anyway.
- **Field kinds were a genuine misreading**: we invented `v_noacg.kind` where the standard already
  provides `gddType` for most of the same values (§5).

**What legitimately stays `v_` (isolated, optional, ignorable):** control-surface presentation
(`section`, `destructive`, `adjust` deltas), the dual package's editable-source pointers and
content hash, and the graphic TYPE. All already implemented that way; a stranger's renderer
ignores every one of them by spec.

## 5. Where we currently fight the standard, honestly

Small list, all fixable, none structural:

1. **`v_noacg.kind` duplicates GDD `gddType`.** Our export writes a vendor hint for what
   `single-line` / `multi-line` / `select` / `color-rrggbb` / `image-path` already say in the
   standard's own vocabulary - and our importer's kind-recovery ladder
   (`ografContract.ts:49-69`) checks `v_noacg.kind` before standard signals. Backwards. Emit
   `gddType` (keep `v_noacg.kind` only for kinds GDD lacks), and read `gddType` first on import.
   This is the purest instance of the review's principle: use the EBU contract where it already
   solves the problem.
2. **The exporter is narrower than the step model**: `Math.max(1, steps)` (`ograf.ts:278`) can
   never emit `stepCount: 0` (fire-and-forget - which a template with SPX auto-`out` genuinely is)
   or `-1` (dynamic). The importer already handles both.
3. **`version` is hardcoded `"1.0.0"`** - a re-export of a changed graphic carries the same
   version. The spec leaves the scheme to us; we simply have no template versioning to feed it.
   Honest fix needs a versioning decision, not a one-liner.
4. **The step-walk arithmetic exists twice** (real-time `_playAction` at `ograf.ts:739` and the
   offline bridge string at `ograf.ts:370`), and only one copy is driven by the conformance spec.
   Drift risk, not a defect yet.
5. **Data keys are `f0`, `f1`, ...** - SPX convention leaking into the public schema. Standard-legal
   (GDD `title` carries the label), and changing keys would break every existing consumer and the
   SPX contract itself. Keep; the fN-to-label table (`FIELDS.md`) is the accepted cost.
6. **Cosmetics with no deadline**: `SpxTemplate`/`SpxField` type names, `spx-gfx-*` storage keys
   (owner: do not rename), inert SPX settings (`uicolor`, `dataformat`) written by ~500 emitters
   and read by nothing.

The one real architectural seam is not OGraf's doing: `window.SPXGCTemplateDefinition` as the
in-document field store (`src/model/spxDefinition.ts`) is the hardest choke point of any future
canonical-format change. `src/model/fieldModel.ts:8-10` already names the way out ("one shared
Template Definition across Remotion, SPX, and operator controls"). That work is real but is not a
precondition for anything in this review.

## 6. The controller-renderer wire - Server API as the face, the log as the truth

The core tension found in the control plane: NoaCG playout is *a durable ordered log many dumb
followers replay* - dedupe by row id, hole-refill, per-graphic recovery baselines, capability
slugs, `at` timestamps off the row's `created_at` (`src/control/hostedControl.ts`,
`src/control/outputRecovery.ts`). The Server API is *stateless REST calls to a renderer*. Neither
can replace the other, and neither has to:

- **Renderer side (do this): `/output` implements the Server API as an ingress facade.** A
  `load`/`playAction`/`updateAction`/`customAction` call translates to the same rows the dashboard
  writes; the log keeps ordering, recovery and multi-operator agreement underneath. This is
  structurally identical to what the Production Data API already is (external data as `update`
  rows, `docs/DATA_API.md`) - the pattern is proven in-house. It is also the item
  `docs/backlog/cli-roadmap.md` calls "the only item that puts NoaCG on the list MXMZ is on."
  The standard's own silences help: no auth specified (our capability slugs are the vendor
  answer), no upload endpoint (our library is the vendor answer), render targets vendor-shaped
  (`renderTargetSchema` can describe our production/layer addressing verbatim).
- **Controller side (later): the dashboard speaks Server API outward** to third-party renderers -
  BBright, ograf-server, whatever IBC produces. The graphic travels as our own OGraf package; the
  operator surface derives from the manifest exactly as `ografContract.ts` does today. What is
  honestly lost against our own renderer: the recovery doctrine (renderer status is pollable, but
  the standard has no push stream and no replayable history) and the state chip (scalar
  `currentStep`). A NoaCG graphic can narrow the second gap legally by returning its group map in
  `ReturnPayload.result` - **but that field is undeclared on every GraphicInstance action response**
  (§2; upstream issue 82), so it can only ever be a bonus for a host that happens to forward it.
  **The load-bearing answer is `docs/OGRAF_STATE_IN_FIELDS.md`**: operator-visible behaviour state
  lives in FIELDS, owned by the controller and obeyed by the graphic, which needs no return channel.
- **What never goes on the standard wire**: `snap` as a group-level verb, the `cue`/`staged` meta
  rows, `at` timestamps. They stay log-internal. No extension proposal to EBU is warranted now;
  if the working group ever standardises a push channel or state feedback (open issues suggest
  they know), we adopt it then.

## 7. Import - the proof of being OGraf-first

The prompt's bar: receive a package from another compliant editor, understand it, generate
operator controls, play it - through the same controller that runs native graphics. Findings:

**The standard gives us enough to build the controls generically.** GDD exists precisely to
auto-generate data forms; `customActions` carry `name`, `description` and a payload schema "used
to validate the action parameters as well as auto-generate a GUI"; `stepCount` fixes the step
semantics; `actionDurations` even time the buttons. `ografContract.ts` plus
`e2e/ograf-contract.spec.ts` already demonstrate the derivation end to end. Two honest
degradations, both already handled: no state feedback means every button offers as live (the
permanent note the contract appends), and unknown `gddType`s degrade down the GDD hierarchy.

**What is missing is residence, not understanding**: the library cannot hold a foreign package
(`importZipTemplate` requires an `.html` entry), the preview and `/output` stage have no OGraf
host (the bridge's `ografHost.ts` is the seed), and a production's graphic pool cannot contain
one.

**Prerequisite: isolation (owner amendment 3).** A foreign package is untrusted code, and it does
not ship into the library, the preview or `/output` before it runs behind a real boundary. The
pattern already exists in-repo - the player-host: loaded with `sandbox="allow-scripts"` only,
never `allow-same-origin`, postMessage with a per-session nonce. An imported OGraf Graphic gets
the same posture: its own sandboxed document, package assets served from an isolated scope, and
no capability URL, storage key or backend credential reachable from inside the frame. The bridge's
`ografHost.ts` runs in a CLI/dev context and is *not* that boundary. Isolation is its own rung on
the ladder, ahead of import v1 - a prerequisite, not a feature. The shape of the work: a library item of kind "OGraf package" - playable, data-editable,
action-drivable, exportable unchanged, **not code-editable** (it has no NoaCG sources, and the
spec never promised editability; `noacg save` is right to refuse). Recovery for such a graphic
uses the standard's own snap: replay to step via `playAction({goto, skipAnimation})`.

**The reverse direction is already the stronger half** - our packages run in a foreign renderer,
externally validated twice and re-checked mechanically. What upgrades it from anecdote to claim is
the test suite (§9) and the ecosystem listing.

## 8. CasparCG's place

Exactly what the prompt proposes, and the code already agrees: **a renderer/playout integration
behind the system, never the internal protocol.** The shipped integration treats CasparCG as a
dumb HTML producer - one `PLAY <ch>-<layer> [HTML] <output-url>`, then everything flows through
the log (`src/control/casparLink.ts:311`); there is no `CG ADD`/`CG INVOKE` anywhere, and AMCP
never touches the studio's data model. That is the correct boundary and it should be defended.

Near-term: accept the shipped Stage 1 against the school's real hardware (open owner-queue item) -
that closes "our own client drives CasparCG through the complete production workflow". Watch for
CasparCG's native OGraf producer; when it lands, our packages play there natively and CasparCG
becomes an interop test target (§9), which is the "reference implementation while we learn" role.
Long-term, CasparCG's GPLv3 codebase is an architecture reference for any native renderer
(GPLv3 and AGPLv3 are mutually compatible via each licence's section 13) - learn from it freely,
never copy from it into the MIT CLI.

The Production URL path stays, unchanged, as export parity already promises
(`docs/CLOUD_PLAYOUT.md` §6): browser-source simplicity is a feature the deeper architecture must
not spend.

## 9. The interoperability test suite - what "genuinely OGraf-compatible" means

Have today: schema conformance on every export + CI (mutation-tested ajv against the published
files), weekly drift check, lifecycle drive in our own host, two hand-recorded external rounds.

To claim compatibility rather than assert it, add - in rough order of value per effort:

1. **Scripted external-renderer round**: the 2026-08-18/22 SuperFly `ograf-server` walk as a
   repeatable script (upload via its zip endpoint, drive via its HTTP API, assert the
   `ReturnPayload`s), run when the component or manifest changes shape - today it reruns only
   when somebody remembers.
2. **Foreign-fixture corpus for import**: the EBU's own `v1/examples/` (minimal, l3rd-name,
   ograf-logo, renderer-test) plus one Loopic export and one Ferryman conversion, each loaded,
   inspected, control-derived and driven through the full lifecycle in our host, with expected
   payloads pinned. (`e2e/ograf-contract.spec.ts`'s hand-written fixture grows into this.)
3. **GDD coverage table**: every standard `gddType` asserted to produce the right control, and
   the degradation ladder (`image-path` -> `file-path` -> `string`) exercised.
4. **`ograf.dev/ecosystem` listing** - the public, third-party-visible claim
   (`docs/IBC_LISTING_CHECKLIST.md` is written; IBC session 12 September).
5. **ograf-devtool compliance run** - blocked once on a Service Worker registration issue; retry.
6. **Server API contract tests** against the `/output` facade once it exists, straight off the
   published OpenAPI (`server-api.yaml`).
7. **CasparCG-native round** - the day its OGraf producer ships.
8. **Non-real-time determinism**: `goToTime` frame-identity where `supportsNonRealTime` is
   declared (the virtual-clock harness exists in the render plane).

## 10. The native renderer - long-term, and it stays parked

`docs/NATIVE_PLAYOUT_RESEARCH.md` already made the strategic call (owner, 2026-08-16: own the
client and the agent, rent the engine forever; revisit "maybe when we are a million-dollar
enterprise") and nothing found in this review reopens it. What this review adds is the
hardware-level detail, so the file of record can be precise when the question returns:

- **Licensing is workable with one structure.** The DeckLink SDK EULA's clause 0.1 exempts the
  include folders, which carry their own Boost-style permissive licence - so an open-source app
  vendors the headers only and dynamically loads the driver the user installs. That is exactly
  what OBS (GPLv2) and macadam (Apache-2.0) do. Never redistribute the SDK's samples, docs or
  libs. FFmpeg's stricter "nonfree" stance on DeckLink builds is policy, not law; OBS and
  CasparCG ship GPL binaries on the headers' permissive licence.
- **Fill+key**: `IDeckLinkKeyer` external mode outputs fill on one SDI connector and key as luma
  on a second, **hardware-synchronized when the card's own fill/key mode is used** (driving them
  as two independent sub-devices is the known one-frame-off failure). Cards: Duo 2, Quad 2,
  8K Pro. Alpha formats `bmdFormat8BitARGB`/`BGRA`, newer cards `10BitYUVA`. Keying is
  HD-strong/4K-limited, which fits a 1080p50 school pipeline.
- **The clock is the design problem.** Scheduled playback is a pull model - the card's
  `ScheduledFrameCompleted` callback drives you. CasparCG's single most important idea: it
  replaced `requestAnimationFrame` inside CEF with a version paced by the channel tick, which is
  clocked by the card. The browser is slaved to the SDI clock, never the reverse. Any renderer
  that "captures at 60 and hopes" is wrong by construction.
- **The traps, confirmed**: premultiplied alpha end-to-end (Chromium composites premultiplied;
  the ATEM keyer has a "Pre Multiplied" toggle; declare once, agree everywhere), full-range sRGB
  to limited-range Rec.709 conversion, ~415 MB/s GPU readback at 1080p50, and the true long-term
  cost - the 24/7 CEF maintenance treadmill (pinned versions, watchdogs, scheduled restarts;
  CasparCG's changelog is fifteen years of it).
- **ATEM reality check**: ATEMs frame-sync every input, so genlock is belt-and-braces rather than
  mandatory - but the fill/key pair must be co-timed *with each other* at the source, which the
  card's fill/key mode guarantees. **The ATEM Mini line has no fill/key path** (HDMI, no
  reference, no alpha) - proper linear key needs the SDI tier (Television Studio, SDI
  Pro/Extreme, Constellation). The school workflow the prompt sketches is the SDI tier.
- **The sobering comparator**: Singular.live, far better funded, deliberately does not own this
  layer - its official SDI story is "run our HTML output inside vMix". Every browser-graphics
  company delegates the hard real-time part. If the agent is ever built, GStreamer (LGPL) remains
  the engine of record per the existing research; macadam's header-vendoring is the licensing
  template; and the renderer is its own AGPLv3 process consuming the same published output
  contract, so abandoning it strands nothing.

Sequencing consequence: the renderer enters the roadmap only as the last rung of a ladder whose
earlier rungs (CasparCG acceptance, Server API facade, desktop-client sketch) each ship value
alone - and only after the editor/controller/SVG/CLI foundations are excellent, which is the
prompt's own ordering.

## 11. Licences, verified

| Component | Licence | Consequence |
|---|---|---|
| OGraf spec + schemas | MIT (repo-wide since 2026-04) | free to implement, transcribe, embed |
| ograf-server, ograf-devtool, GDD | MIT (GDD repo archived into ograf) | free to script against, learn from, reuse |
| CasparCG Server | GPLv3+ | compatible with our AGPLv3 app (GPLv3 §13); **never** into the MIT `noacg` CLI; as an external process driven over AMCP: no constraint at all |
| DeckLink SDK headers | Boost-style permissive (EULA cl. 0.1 exempts `/Include`) | vendor headers only, dynamic-load the driver; samples/docs/libs stay restrictive - internal use only |
| Desktop Video driver | proprietary, user-installed | runtime dependency only (OBS/CasparCG posture) |
| CEF / Chromium | BSD-3 (+ attributions) | fine |
| OBS code | GPLv2-only | **not** AGPLv3-compatible - learn, never copy |
| macadam | Apache-2.0 | reusable; the header-vendoring pattern to copy |
| atem-connection, casparcg-connection, Companion, Sofie | MIT | reusable anywhere, any tier |
| NDI SDK | royalty-free, EULA obligations | per `docs/NATIVE_PLAYOUT_RESEARCH.md` §5: EULA coverage, ndi.video links, version currency |
| Remotion | custom, non-OSI | already quarantined (exact-pinned separate packages, sandboxed player-host) - keep |
| GSAP | custom "Standard No-Charge" (free since Webflow, 2025-04), non-OSI | **owner action (amendment 4): obtain written clarification from Webflow/GSAP** on the prohibited-uses clause - the licence prohibits use "in tools that allow users to build visual animations without code" that compete with *Webflow's visual animation building*, and NoaCG is a no-code animation tool. Until an answer arrives, **preserve replaceability**: GSAP stays behind its one seam (the bundled `src/assets/gsap.min.js` plus the frozen emitted interpreter - `NOACG_ANIM` itself is declarative data), and no new GSAP-only surface area is added |

So "OGraf is MIT" holds, and the wider plan's licensing is clean **provided the boundaries hold**:
GPL/AGPL material never enters the MIT CLI or any permissive package; any future native renderer is
its own AGPLv3 process; DeckLink headers only, never SDK samples; Remotion stays quarantined. GSAP
is the one item resolved by escalation rather than assumption: the defence (broadcast graphics are
not Webflow website animation; we emit real GSAP code) is plausible but unconfirmed, so written
clarification is sought and replaceability is preserved until it arrives.

## 12. Sequencing - what moves when

**Now.** The push is whatever `docs/GOALS.md`, `## NOW` names, and nothing in this review
competes with it. What may START is the register's call, not this review's: `docs/PROGRAMMES.md`,
"P6 OGraf & Interoperability" records that P6 may start now. The SVG importer walks and the CLI
publish decision stay the priorities the prompt restates.

**Soon after - bounded, high leverage, in order:**

1. **`ograf.dev/ecosystem` listing** - checklist written, ~45 minutes of owner time, IBC is
   12 September. Cheapest credibility per minute in this document.
2. **CasparCG Stage 1 hardware acceptance** - the shipped AMCP client against the school rig
   (open owner-queue item). Closes "our client proves the complete production workflow".
3. **GDD adoption** - emit standard `gddType`s, read them first on import; fix `stepCount` 0/-1;
   deduplicate the step-walk arithmetic. Small, pure standard-alignment.
4. **Scripted interop round + foreign-fixture corpus** (§9 items 1-3) - turns the compatibility
   claim into a machine-checked fact.

**Next - the structural pieces, each shippable alone, isolation first:**

5. **Untrusted-package isolation**: the player-host sandbox pattern applied to OGraf hosting -
   the prerequisite for anything foreign entering the app.
6. **OGraf import v1**: foreign packages as first-class library and production-pool citizens -
   playable, data-editable, operator-controlled through the existing dashboard, not code-editable.
7. **`/output` as an OGraf Server API renderer**: the ingress facade over the command log, with
   contract tests off the published OpenAPI. The item that puts NoaCG on the supported-engine
   lists.

**Then:** the controller speaking the Server API outward to third-party renderers; the desktop
client sketch (`docs/backlog/noacg-desktop-client.md`) when its time comes.

**Research, explicitly parked:** the native renderer (Stage 2+ of the existing research), ST 2110,
genlock lab work. The park stands on the owner's 2026-08-16 ruling; §10 above is the dossier for
the day it is reopened.

## 13. What changes in GOALS.md - and what must not

**Keep, verbatim:** the "One link, live anywhere" north star (it is the user-value sentence and
the new direction serves it rather than replacing it); the four pillars; the NOW section and its
deadline; the SPX validation gate as the strictest export gate; the CLOUD_PLAYOUT three-route
output model including the Production URL; the native-playout park.

**Rewrite one section - RATIFIED and applied.** "NEXT - OGraf-first, not SPX-first" said only
"understanding is owed before code moves"; this document is that understanding, the owner ratified
the rewrite on 2026-08-29 with the four amendments, and the section now in GOALS.md is the record
(it also absorbed the two OGraf bullets from the agent-door section's "Future" list). Its ladder,
in order: ecosystem listing (owner, IBC 12 Sept); CasparCG Stage 1 accepted on real hardware;
GDD alignment (standard `gddType`, honest `stepCount` 0/-1, one step-walk); the interop suite;
**untrusted-package isolation** (prerequisite); **OGraf import v1**; **`/output` speaks the OGraf
Server API**; then the controller outward, the desktop client, the native SDI renderer - the last
still parked on the 2026-08-16 ruling. The GSAP written-clarification line rides the same section
so the licence question cannot be forgotten under it.

**Also applied (amendment 1):** the "Anything-goes export" paragraph and `AGENTS.md`'s pillar no
longer say "SPX-canonical" - the source is named NoaCG-native/code-as-truth, SPX an adapter and
the strictest validation target, OGraf the canonical interchange and playout contract.

**Not changed:** SPX is removed from nothing; no new scene model; the Server API does not replace
the command log; no EBU extension proposal; no native-renderer scheduling.

---

## Update, 2026-08-29 evening - the ecosystem research round

`docs/OGRAF_ECOSYSTEM.md` (same date) read the ecosystem's actual repositories and corrects or
extends this review in four places; the review's verdicts otherwise stand.

1. **Sequencing (§12) is reordered by owner ruling, 2026-08-29 evening (relayed via the wave
   coordinator): working OGraf playout on the EXISTING output architecture comes first, and ALL
   outreach - the ograf.dev listing, EBU pitch or working-group contact - is gated behind NoaCG
   being something EBU/YLE can test in a real production.** The "soon after" item 1 above (the
   listing as cheapest credibility) is superseded by that gate; the GOALS.md ladder carries it.
2. **The package checker is 83 rules, not 82, and is not SuperFlyTV's**: it is Felipe Iasi's
   personal MIT project (<https://github.com/ficosta/ograf>), browser-only, no CLI - community
   evidence, not authority (`docs/OGRAF_ECOSYSTEM.md` §1d).
3. **SPX-GC v1.4 ships OGraf playout** - OGraf packages play in SPX rundowns via a `v_spx`
   vendor field. New since this review's ecosystem paragraph (§2); it strengthens the verdict:
   our OGraf export now earns SPX playout on its own (`docs/OGRAF_ECOSYSTEM.md` §1g).
4. **ograf-server, read at source level, has no auth and no instance recovery after a renderer
   reload** (`listGraphicInstances()` is a TODO) - direct confirmation of §6's claim that the
   command log's value lives in territory the standard and its reference implementation leave
   open (`docs/OGRAF_ECOSYSTEM.md` §1a).
