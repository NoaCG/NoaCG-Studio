# Pixotope 26.3 comparison: proposed NoaCG roadmap changes

19 October 2026. Proposal for review only. No feature implementation, executable-plan amendment,
issue mutation or implementation run. The existing 22-step production plan remains intact.

**Recommendation:** retain the current production run; next strengthen typed action forms and
foreign-package operation in the existing OGraf work packages. Extend Arrange modestly after
those contracts work. Do not build a separate Form Builder or control system.

## Evidence and limits

Fetched main is `86e795dc9f66183633d7c99a73bea8c27e4e32f6`, exactly the supplied research baseline.
The named control/import/output files and roadmap documents have no intervening main changes
relative to this branch's base. The production-plan refinements committed here at `4a861003e`
are additional planning work, not implemented main capabilities.

| Finding | Repository evidence | Status |
| --- | --- | --- |
| Generated inputs and native event availability | [controlModel.ts](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/src/control/controlModel.ts), `fieldDescriptors`, `eventButtons`, `isEventLegal` | Implemented; native state legality cannot be inferred for a foreign manifest with no state graph |
| Production Arrange | [profile.ts](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/src/model/profile.ts), `ArrangeEntry` | Order, labels, sections, hiding and pinning exist; COMBINE was removed and must remain removed |
| Action arguments | [ografContract.ts:203](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/src/control/ografContract.ts#L203), `eventPayload` in controlModel | Action schemas currently become payload-key lists; no independent typed argument descriptor/form. Native payload assembly stringifies values |
| Structured fields and type preservation | `kindForProperty`, `gddKind`, `defaultFor` in the same adapter; `ForeignOgrafSpec.data` | Objects/arrays/multi-select have no generated control; numeric enum options become strings and toggle defaults use string values. This establishes an audit need, not a measured failure of every end-to-end route. Export defaults already have typed handling |
| Multi-manifest import | [ografImport.ts:51](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/src/export/targets/ografImport.ts#L51), `findManifestPath` | Chooses the shallowest manifest, with name sorting as tie-breaker; no package-wide selection |
| Foreign playback | [foreignOgraf.ts](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/src/output/foreignOgraf.ts), `stage.ts`; [#791](https://github.com/NoaCG/NoaCG-Studio/issues/791) | Isolated stage and inspection foundations exist; first-class library/rundown workflow remains planned |
| Validator classification | [ografSchema.ts:430](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/src/export/targets/ografSchema.ts#L430) | Renderer custom-element ID compatibility is explicitly acknowledged in code but included in the conformance error list |
| Outward Server API client | [Bridge OGraf adapter](https://github.com/NoaCG/NoaCG-Studio/blob/86e795dc9f66183633d7c99a73bea8c27e4e32f6/cli/src/playout/adapters/ograf.ts); [#790](https://github.com/NoaCG/NoaCG-Studio/issues/790) | Existing client foundation and uncertain-result handling; this is not a shipped NoaCG Server API facade or a Pixotope qualification |

Recorded verification is narrower than the roadmap: `e2e/ograf-contract.spec.ts` contains
manifest/host and GDD fallback cases (including omission of multi-select); sandbox and
conformance specs exist. `docs/OGRAF.md`, 10 September external walk, records a successful
SuperFly server sequence and visible action states. Those are historical/test-source evidence,
not freshly executed tests, Pixotope results, or proof of production foreign-package import.

Primary documentation rechecked: [OGraf control](https://help.pixotope.com/phc/26.3/using-live-controller-with-ograf)
describes generated action forms, preview/program targeting, step controls, folder/ZIP/internal
library import, single-layer browser preview and immediate same-layer replacement. Its server
import source is Pixotope's own stored library; arbitrary external-server selection is unproven.
[Form Builder](https://help.pixotope.com/phc/26.3/using-the-form-builder) starts with existing
bindings, allows unsuitable widget substitutions and requires a single root container for
responsive behavior. These are documented capabilities, not hands-on findings.

The [release notes](https://help.pixotope.com/phc/26.3/whats-new) establish Discovery OGraf support;
[Discovery](https://help.pixotope.com/phc/26.3/using-pixotope-discovery) documents full Live Controller,
HD file/WebRTC output, online licensing, single-machine and noncommercial use. Its evaluation
does not qualify SDI/NDI or failover. [System requirements](https://help.pixotope.com/phc/26.3/system-requirements)
specify Windows and supported NVIDIA hardware. No Pixotope runtime test was run here.

The [installation guide](https://help.pixotope.com/phc/26.3/install-pixotope) confirms port 16219.
The supplied research reports `/ograf/v1`; the linked [HTTP API page](https://help.pixotope.com/phc/26.3/ograf-server-api-http)
was not retrievable in this review, so its exact endpoint contract remains to be rechecked during
qualification. An API exposed by Pixotope supports investigating NoaCG → Pixotope control; it
does not prove that Live Controller can drive NoaCG or another vendor's server.

## Decisions mapped to existing work

Work-package letters below are from [OGRAF_FULL_STACK_PLAN.md §8](../../OGRAF_FULL_STACK_PLAN.md).
These are refinements of existing initiatives, not additional competing projects.

| Opportunity | Decision, placement and size | Dependency and acceptance |
| --- | --- | --- |
| Current Sheet/API control-panel workflow | **Adopt** the separation of graphic capability, production presentation/bindings and execution. Keep the existing production run's C1/C5/C7 and final 14; small acceptance clarification only | Data update never invokes Take/Next/Out or an action. Arrange cannot redirect a connection or change field identity. Preserve native string-based contracts while testing supported boundary conversions; no global value-model rewrite |
| Conformance versus host compatibility | **Adapt**, package A; focused validator/diagnostic change after the current run | Separate standard errors from named-host restrictions and warnings. A standard-valid ID unsuitable for one host remains standard-valid; that host can still refuse playback. Preserve safe generated export IDs; verify against pinned official schema and an affected host |
| Independent typed action forms | **Adopt**, package E, first substantial OGraf follow-up; medium cross-surface work | Build on shared descriptors and command dispatch. An argument absent from graphic data has a usable control. Required/default/enum/range rules validate before dispatch. `false`, `0` and numeric enums reach a test graphic with exact JSON types. Editing/cancelling sends nothing; submitting targets the intended preview or program instance once |
| Nested objects, arrays and multi-select | **Adapt**, package E after the scalar action/type slice; medium work | Declare a supported GDD/schema subset. Preserve nesting and array types through validation, dispatch and reload; unsupported structures show a specific limitation, never silently vanish or stringify. Do not promise arbitrary JSON Schema editors |
| Foreign library/rundown operation | **Adopt**, package F and #791, before broad form customization; larger integration | Depends on A/E and immutable identity below. Import, reopen, cue, preview, Take/Update/Next/Out and recover using the existing command log and sandbox. No native-source conversion of opaque code, no new cue system. Prove current output routes, fonts/assets, isolation and truthful failures |
| Package selection and versions | **Adapt**, F with D's revision contract; larger staged work | F's first production release pins content hash + selected manifest + declared identity/version and never hot-replaces on-air bytes. Initially refuse ambiguous multi-manifest input visibly. Then add an explicit list of all manifests, per-entry validation and scoped/shared assets. Later explicit version upgrades, dependency policy and reviewed data/profile migrations; no silent ID collision resolution |
| Compatible widget overrides and responsive groups | **Adapt**, existing ARRANGE/profile work after typed controls; modest extension | Restrict choices by schema (e.g. bounded number → input/slider), stable control IDs and automatic responsive groups. Resizing at 1366×768/125% zoom keeps actions reachable. Reset restores generated layout without deleting bindings or changing payloads/legality; no second form schema |
| Fixed-payload action buttons | **Defer** beyond typed forms; evaluate under E/Arrange | Current profile cannot change press semantics. Any later preset must explicitly bind validated typed arguments to one existing action, with clear target; no arbitrary JSON editor, macro sequence or invented event |
| Continue/Goto/Delta/skipAnimation | **Adapt**, E/F lifecycle controls | Test `stepCount` 0, 1, >1 and -1 against the pinned standard and returned currentStep. No invented finite bound for dynamic steps. Optional advanced controls use existing command ordering; metadata never supplies missing action legality |
| Server API interoperability | **Adapt**, #790 and G/H; larger later delivery, bounded investigation can happen sooner | Retain standard envelopes, instance addressing and uncertain-result handling. Qualify the existing outward adapter against Pixotope separately from building NoaCG's inbound facade. Share G's identity/recovery contract; H investigation need not wait for G implementation. Import/upload is not assumed to be a standard API operation |
| Unrestricted visual Form Builder; COMBINE; copied replacement semantics | **Avoid** in this plan | No demonstrated need justifies the additional authoring/control system. Keep NoaCG's current layer/recovery policy and qualify differences per target; do not adopt immediate removal as a universal replacement rule |

Recommended order: **current 22-step production run → A conformance/type fixtures → E scalar
action forms and exact-type dispatch → F minimum safe foreign production workflow → E structured
controls and F bulk/version upgrades → modest Arrange extensions → G/H production interoperability**.
E structured controls needed by a particular F package become prerequisites for that package,
not a reason to claim support for all packages. B remains the existing CasparCG acceptance work;
J/native SDI/NDI renderer choices stay later. Editor R1/R3 remains authoring work, not the home
for production-specific forms. A bounded external-server test may inform E/F/G/H sooner.

## Verification and decisions to settle

- **Typed boundary:** enumerate descriptor → draft → persistence → command → host conversions,
  separately for native values and foreign action payloads. Prefer an additive OGraf schema-aware
  codec within the existing contract. Decide draft lifetime per action/instance and default-versus-
  omitted behavior; do not confuse same-named action arguments with bound graphic properties.
- **Capabilities:** select the first supported structured-schema subset using independent fixtures.
  Use standard/GDD defaults without NoaCG metadata. No state graph means no inferred native legality;
  existing connection/instance readiness guards and returned failures still apply.
- **Updates:** distinguish omitted properties, explicit empty values and null where permitted.
  Observe the pinned OGraf semantics rather than assuming the NoaCG `/patch` API is identical.
- **Persistence:** choose additive/versioned representation and migration/refusal rules before
  changing payloads, profiles or package identity. Update/rollback leaves existing cues pinned
  until an explicit reviewed change. Package assets/dependencies must remain isolated and resolvable.
- **Evidence:** Node conversion/validation tests, affected existing control/OGraf journeys, a real
  independent package and actual output receipts. NoaCG's exporter validating its own output alone
  is insufficient. Reuse unchanged evidence under current policy; no CI-policy change is proposed.

These are technical decisions for the bounded E/F specifications; no new owner decision is
needed to continue reviewing this proposal. Adding any of this implementation to the current
production run would require an explicit scope revision, rather than being inferred from comparison.

## Bounded Discovery investigation (planned, not executed)

Use one authorized Windows/NVIDIA evaluation machine, Discovery account, exact 26.3 build and
driver record, synthetic data and a scratch show. Proposed cap: two two-hour test blocks after
installation/access are ready. At the cap, retain partial results; no product repair or feature
implementation is included. Keep this evaluation separate from Friday's required NoaCG acceptance.

Pin four packages by source revision, package hash and licence: a NoaCG lower third; a scoreboard
with typed custom-action arguments (including an argument absent from its data schema); a multi-step
graphic; and an independently authored EBU example. If the required scoreboard or independent
fixture does not exist, record that prerequisite instead of silently implementing it in this task.

| Test group | Actions | Required observation |
| --- | --- | --- |
| Imports/assets | Each package via folder and ZIP; reopen through internal library; two manifests in a controlled fixture | Which entries were selected, preserved manifest IDs/versions, fonts/images/modules loaded, unsupported cases clearly reported |
| Generated controls/types | Check labels/defaults; edit bool, numeric enum, 0, false and action-only argument; send partial update, omit a property, submit invalid values | UI values, actual submitted JSON types, graphic result and unchanged unrelated values recorded separately |
| Steps/lifecycle | Take, Continue, Goto, negative Delta, skipAnimation, Out; include dynamic/unknown steps as a labeled probe | Returned step and visible transition agree; out-of-range/error behavior recorded, not guessed |
| Preview/program/layers | Edit and invoke action in Preview while another instance is on air; two layers; same-layer replacement | Actual output proves target separation; record replacement behavior and whether the outgoing animation ran |
| Custom form | Start from generated controls, regroup, resize, try one compatible and one unsuitable widget, bind one fixed action payload, reset | Data/action bindings and types retained or precise failures captured; operator can still reach controls |
| Package update/recovery | Reimport identical bytes, then same ID with changed version/content; reload controller and restart renderer mid-operation | Existing cue/air behavior, cached assets and migration prompts recorded. Lost acknowledgement is uncertain; never blindly replay a non-idempotent score action or Next |
| HTTP control | Confirm documented base/port on the installed build; discover renderer/target; load, update, play/custom/stop and inspect | Record request/response, graphic instance, status and output. First qualify the protocol manually; use existing NoaCG adapter only within its supported capabilities |
| External-server selection | Separately inspect whether Live Controller accepts an independent server address and can operate it | A visible documented setting plus a successful independent-target walk is evidence. Internal-library import or Pixotope's own HTTP listener is not |

For each case retain **controller/HTTP acknowledgement** and **actual VideoIO file/WebRTC
output capture** as separate evidence, with timestamp, instance/layer, expected/observed result
and pass/fail/blocked/not-tested. Browser preview alone does not establish output behavior.
If instrumenting input receipt would require modifying a package, use a separately hashed test
variant and do not present it as the unchanged production export. Discovery's limits remain
explicit; SDI/NDI and multi-machine recovery require separate licensed qualification.

Review outcome requested: accept or adjust this prioritization and the small current-run
acceptance clarifications, then reconcile approved changes into the canonical specs before
assembling the complete plan for the owner's independent second opinion.
