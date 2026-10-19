# Full-run second-opinion prompt: NoaCG playout, data, OGraf and hardware control

Copy this entire document to the reviewing agent. Review candidate prepared 19 October 2026.

---

You are independently reviewing NoaCG's proposed production-page and playout programme.
Assess architecture, completeness, sequencing, live-operation safety and competitive capability.
Challenge the proposal; do not implement features, edit authoritative specs, start a plan run,
contact vendors or treat a recommendation as approved implementation scope.

Give an actionable verdict: what the existing 22 steps deliver, whether the recommended
extensions belong in this run, and whether the resulting product can credibly compete for our
target productions. Do not optimize for the fewest phases or copy competitor feature counts.

## 1. Owner intent and scope status

- We want a reliable, maintainable playout system that ordinary producers can operate, including
  custom graphics, shared external data, cues, previews, live control and recovery.
- The entire existing 22-step sequence plus prerequisite track Q remains. Refactoring is needed
  where it improves ownership, testability and maintenance; do not refactor already-optimal code
  merely to make files smaller. Do not drop a phase outcome silently.
- Target start is 20 October 2026. Friday 23 October is an owner testing/progress checkpoint,
  not a deadline, reason to weaken acceptance or reason to exclude necessary features.
- No arbitrary 24-hour project limit. Work can continue in qualified, resumable blocks. A cloud
  worker's uptime does not prove that coordinator recovery/cross-machine ownership works.
- CasparCG through NoaCG Bridge is the first real production output. An ordinary OBS/browser
  source must also pass. Preserve existing vMix/SPX behavior; expanded qualification can follow.
- Friday includes a physical Stream Deck through Bitfocus Companion. Keyboard emulation is a
  fallback, not proof of the Companion integration.
- The current production-page appearance remains the baseline. Mockups explain interaction
  logic, not a mandatory redesign. Keep manual operation quiet and straightforward.
- Long term, NoaCG should offer an OGraf-compatible controller/server/output stack. Generic
  foreign-template support requires more than parsing a manifest or rendering one package.
- YLE's election use case matters commercially. We need a convincing, installable graphic
  package and end-to-end rehearsal, with per-person data updates and stable candidate identity.

**Status:** the 22-step plan is the agreed planning baseline. This prompt adds a recommended
extension sequence for your review under the owner's permission to propose important additions.
Those extensions are not yet executable work specs or authorization to build. Compare the
baseline alone against the expanded programme, and recommend the final boundary explicitly.
Do not assume "preserve 22 steps" means "only 22 steps are allowed".

## 2. Evidence and authorities

Supplied competitor research used NoaCG baseline
`86e795dc9f66183633d7c99a73bea8c27e4e32f6`. Planning integration was committed on the research
branch as `1c176d427`; distinguish that planning revision from the inspected source baseline.
With repository access, reconcile current main and record any material differences before
claiming a gap. Without access, identify conclusions that rely on this supplied summary.

Read these authorities if available; do not replace their precise acceptance matrices with
this condensed review brief:

- `docs/work-specs/production-page-refactor/spec.md`: 22-step order, ownership, verification,
  performance, execution and stop conditions.
- `docs/work-specs/data-sources/spec.md`, `sheet-data-flow/spec.md`, `audience-flow/spec.md`
  under `docs/work-specs/`: C0–C7, Q, content and source semantics.
- `docs/GOALS.md`, `docs/EDITOR_PLAN.md`, `docs/OGRAF_FULL_STACK_PLAN.md`.
- `docs/CONTROL_PANEL_ANY_GRAPHIC.md`, and the October 19 corrections in
  `docs/CONTROL_PANEL_ROAD.md` and `docs/CONTROL_PANEL_RESEARCH.md`.
- `docs/work-specs/production-page-refactor/evidence/research-integration-2026-10-19.md`:
  adopted findings, source links and nine assigned acceptance scenarios.
- `docs/work-specs/hardware-panel-control/{spec,protocol}.md`, its evidence directory,
  `docs/work-specs/panel-ownership-lease/spec.md`, and `companion-module/`.
- `docs/research/2026-10-custom-graphics-workflow/election/README.md` and
  `election/source-investigation.md`: sample files, local proof and provider-access limits.

Evidence labels: **Code** = inspected implementation; **Plan** = written commitment, not shipped;
**Documented** = vendor technical documentation; **Claim** = marketing; **Recommendation** =
judgment. Commercial competitors were not installed or exercised in the supplied research.
There is no measured usability/performance ranking. Existing NoaCG receipts describe particular
revisions and setups, not a fresh qualification of the final candidate.

## 3. Architecture and operator contracts to preserve

**One source of truth.** Reuse the existing production JSON tree, merge patches, bindings,
generated controls, presentation profiles, native machine groups and ordered command log.
`productionData.ts` and `/api/data/state` / `/api/data/patch` already exist. Do not add a competing
data store, scene model, panel-owned score/clock or second playout command owner.

**Refactoring versus features.** Refactor phases preserve wire formats, persisted compatibility,
keyboard behavior and existing output semantics. New product behavior belongs in declared content
or extension phases. One owner holds liveCue within the production page/session; selection is
separate. HostedControlPage is prepared for later reuse, not migrated wholesale in this run.
Defects found during extraction must be reproduced and fixed separately, not concealed as moves.

**Fill versus Connect.** Fill copies a snapshot into one cue. Connect is a live relationship
shared by the graphic's cues. A Sheet can provide either live values or rows an operator copies;
the source type never decides whether something is live. Prepared messages remain ordinary
cue-owned values and never change because their source changes.

**Quiet, contextual connection.** In the current control panel beneath the monitors, one
graphic-level "Connect data…" action opens setup and reveals optional small field connectors.
Done hides setup controls without pausing data. Reuse or add a source, select a tab/table/subtree,
inspect sample values and rendered output, review matches and affected cues, then confirm once.
There is no mandatory new connections tab or beginner JSON-path editor.

**Whole-graphic matching.** Prefer explicit stable field keys; otherwise propose unique scoped
name matches. Never silently apply ambiguous matches, overwrite bindings, connect unrelated
graphics or create bindings on first data arrival. One reader serves a reused source. Custom
native graphics can download starter CSV (`Field ID,Label,Value`) with defaults/current content;
existing ticker/schedule/standings/credits/rows adapters keep their own useful formats. Row reorder
must not change identity. A missing mapped scalar row is an error; an explicitly blank value can
clear. Malformed input must not masquerade as a valid empty list.

**Overrides and reliability.** A manual Sheet scalar correction updates the shared value and
persists until that source cell changes. Pause holds it; Resume applies cells changed while paused.
Connected lists remain read-only. API writes have their own policy: planned suppress-and-diff/
held-update Pause, or explicitly stop the sender. No ineffective Pause button. Failed/malformed
reads hold last-good values; valid empty input has explicit adapter-specific clearing behavior.
Missing legacy paths retain existing semantics; null is not silently redefined as clear.

**Reading modes.** Browser Sheet reading is about every five seconds under one lease; a server
tick about once a minute covers published sources when all controller pages close. Show actual
mode/cadence, last checked and last changed. Successful unchanged reads are healthy. Provider
event age is distinct from transport success and is a later provider capability where needed.
Late results from a previous reader owner must not overwrite a newer owner's values or status.

**Protected staging.** Both normal and Advanced connection paths refuse live binding to prepared
message body/name destinations. Candidate identity is not row position. Duplicate arrivals,
edits, deletions, refresh and reconnect must not alter an approved cue or stage duplicates.

**Data, behavior and animation differ.** Data can animate a number change inside its current
state, but must not implicitly Take, advance, reveal, reset or remove graphics. A quiz reveal
and clock can be independent native machine groups. OGraf steps are held operator positions,
not a complete state graph; a held step can animate. Foreign legality may be unknown. An action
result is not a standardized state subscription or full recovery snapshot.

**Truthful operation.** Distinguish selected, previewed, staged, ready, pending and confirmed.
Label simulation versus actual target output; an HTTP success/accepted command is not proof of
rendered pixels. Retained monitor images after disconnect must not look freshly live. Keep
folders, All together batches, exclusive replacement groups and output layers/channels distinct.
Expose child failures/collisions/unknown outcomes and replacement policy. Label unsupported
composite preview honestly. Do not introduce routine confirmation dialogs for Take/Out/score.

**Generated controls first.** ARRANGE, labels, sections, More and pinning already exist. Profiles
reference capabilities, never secretly implement them. COMBINE was removed on October 2;
do not resurrect it as a macro language. Responsive presets need stable IDs, compatibility checks
and reversible generated fallback that preserves the saved arrangement. Sports/quiz task trials
must prove need beyond ARRANGE before a free-layout designer is considered.

## 4. Existing 22-step baseline, preserved in order

Each numbered step waits for the previous step's verified PASS. The readiness column summarizes
the outcome; the authoritative spec's test matrix, assessment and material-change rules still
apply. Refactor steps preserve behavior rather than delivering unlisted features.

| Step | Phase | Work and ready condition |
| --- | --- | --- |
| 1 | C0 | Paste messages and safe staging; correct destination selection, immutable prepared cue values, durable inbox/deduplication and binding refusal work through both entry points. |
| 2 | 1 | Establish regression safety net before extraction; decide suspected bound-adjust/resolve/navigation defects on evidence; preserve existing semantics; retain two comparable Windows performance baselines. |
| 3 | 2+7 | Extract store primitive, session skeleton and production-data session. One writer, unresolved-key gating, lifecycle/disposal and both published/local roads pass both phases' checks. |
| 4 | 13a | Extract CueEditor JSX by props only. No state/ownership move or behavior change; existing editor and data journeys pass. |
| 5 | C1 | Native paste/list adapters, local Sheets, whole-graphic matching, starter CSV, optional field repair and visible sources. Real Sheet round trip, invalid/ambiguous mapping and cancellation proved; one local reader with D4 overrides. |
| 6 | C2 | Persist published bindings/sources immediately without republish; leases, server tick, Pause and handover. Closed-page cadence/cost measured; old-owner responses rejected; unchanged cells preserve overrides. |
| 7 | C3 | Sheet message candidates, message picker, YouTube comments and live chat. Prepared cues remain independent; first-page handling, durable identity and key opt-in are qualified. |
| 8 | C4 | RSS/Atom feeds through the guarded reader. Parsed/deduplicated output, malformed versus empty, last-good hold, redirects/address checks, cache and limits pass; retain a real-feed receipt. |
| 9 | C5 | Discoverable "Another system" API card, generated example and prepared collector/sender; whole-graphic saved mapping, receipt and corrections work. Prove Pause or label stop-sender fallback. No generic API mapper yet. |
| 10 | C6 | Legacy Sheet migration/docs and truthful operation. Retained/migrated paths avoid double writers; source/target/pending/confirmed/unknown/group status uses actual available observations. No new renderer acknowledgement protocol hidden here. |
| 11 | C7 | Combined technical rehearsal through actual CasparCG/Bridge and OBS/browser; include custom Sheet/API examples, recovery, independent quiz/clock and group failures. Prepare final human trial; required blocked routes stay unverified. |
| 12 | 3 | Extract ProductionShell/CueActions presentation by props. Panel, actions, keyboard and rendering behavior match the characterized baseline. |
| 13 | 4 | Extract production publish/slot/link orchestration. Publication guards, correct destinations and status/recovery remain intact. |
| 14 | 5 | Extract Take blockers/server verbs. Same readiness decisions and command semantics; no wrong-target or duplicate sends. |
| 15 | 6 | Extract Bridge observation/lifecycle. Start/restart/stop and stale callbacks are proved with controlled I/O/clocks and relevant journeys. |
| 16 | 8 | Extract rundown authoring. Undo/history/storage, folders, cross-tab and selection behavior remain unchanged. |
| 17 | 9 | Extract cue arming/timing. Fake-clock, visibility, recovery, stop and disposal checks show no orphaned or repeated automatic action. |
| 18 | 10 | Extract folder playout. Held sends, cancellation, All out, partial acceptance and disposal remain safe and inspectable. |
| 19 | 11 | Move liveCue ownership once into air state/session wire, alone. Late answers, reload/reconnect, duplicate delivery and production switching are verified; independent high-scrutiny assessment and performance repeat. |
| 20 | 12 | Extract graphic verbs, dispatch and view, including hardware-panel snapshots. Mouse, keyboard and panel agree on target and legality; full required configured checks and independent assessment. |
| 21 | 13b | Move draft ownership and final editor subscriptions. Preview, unsent state, labels, Update and panel feedback stay fresh; reduced root renders cannot pass by freezing consumers. Performance repeat and independent assessment. |
| 22 | 14 | Baseline close-out: completed-build automated suites, performance, real outputs and full unaided human trial. All baseline criteria satisfied or explicitly incomplete; preserve evidence attribution and compiled control-module ownership rule. |

**Q before C1:** after C0 is available for its early paste trial, measure 20 real Sheet edits,
one hour of five-second export reads, five feed fixtures, actual YouTube comment/live access,
and server-tick cost. The current Sheet target with a page open is within ten seconds across
at least 20 edits, reporting the slowest. A missed qualification stops C1 for an explicit decision;
do not silently loosen the target. Closed-page latency is separately measured at the slower tick.

The full newcomer trial is at baseline step 22: four of five participants complete each named
task unaided and answer the comprehension questions correctly; report medians without inventing
a time target. Q is an early pilot, not replacement acceptance. Questions cover what Take does,
what a Sheet edit changes, whether a prepared message changes, value provenance, action target,
and confirmed output versus preview/pending.

## 5. Recommended expansion to review: H0 and E1–E8

Recommendation: retain the 22 steps as a stable baseline, then deliver the most important
competitive extensions in the same coordinated programme. H0 starts early for Friday, with
coordinated file ownership; E1–E8 follow baseline close-out sequentially by default. Step 22
remains a valid baseline acceptance checkpoint, not a claim that the expanded programme is done.
E8 is the expanded programme's final acceptance. This proposes 31 named work packages plus Q,
not 31 equally sized tasks; split a package if its risk/ready condition needs smaller phases.

Challenge this recommendation against a narrower alternative: baseline 22 + H0 now, with
E1–E8 as clearly scheduled follow-up. Explain the lost production capability of each deferral.

| Package | Scope / dependencies | Ready condition |
| --- | --- | --- |
| H0. Companion delivery and qualification | Existing module, current published app/backend and owner's Windows/deck setup. Prepare early; do not wait for Bitfocus publication. Coordinate documentation with C6 and repeat affected checks at baseline 22/E8. | Reproducible developer-package install; corrected setup guide and starter layout; actual deck Take/Out/Update/Next/selection/clip transport, button feedback, hidden page, reload, reconnect, revocation and stale/repeated presses exercised through CasparCG/Bridge. Record installed versions and failures. |
| E1. Typed OGraf contract | Existing full-stack A/E, pinned EBU revision, native compatibility design. | Define and test types through storage, binding, dispatch and renderer boundary; numbers/booleans/enums, objects/arrays, required/default values and full action argument schemas retained. Explicit unsupported features and native-string compatibility/migration; no blanket wire rewrite. |
| E2. Typed generated controls and step/action targets | E1; current generated panel and full-stack E/F. | Render/validate typed field and argument forms; correct URI/hidden semantics; dynamic steps, backward/relative movement, Goto and supported animation options. Precise unsupported snap/action notes; preview/program targets explicit; actual payload and rendered-result evidence. |
| E3. Foreign OGraf in normal library/rundown | E1/E2 plus existing isolation/asset host. | Import/save/reload unfamiliar packages, create cues, prepare/Take/Update/steps/actions/Out, resolve assets and recover on normal production outputs. Layer replacement and unknown legality explicit. Native export also works in an independent controller without NoaCG metadata; report lost conveniences. |
| E4. Trusted external connector foundation | Existing production API/source ownership plus E1 representation decisions; select one actual provider before implementation. | Endpoint/authentication hosted in a trusted service or optional local adapter; one authenticated scalar/collection sample; secrets excluded from templates/show exports. Defined polling/push support, errors, retries, dedupe/order/rate limits and Pause semantics; unsupported webhooks explicit. |
| E5. Sample-based bounded API mapping | E4, existing Connect entry, source identity and final target adapters. | Readable sample → scalar/collection/stable ID → bounded select/filter/sort/limit/format/fallback → validated rendered preview → explicit Connect. Test malformed/empty/missing values, reordered records, stale/out-of-order input and source failure. No general scripting language or data-triggered Take. |
| E6. Declared graphic controls through Companion | Existing relay, baseline verb extraction, E1/E2 capability/type contracts. | Discover and invoke declared graphic actions with stable capability/target IDs and typed arguments, same legality and dispatcher as UI; score +1/-1, quiz reveal and a graphic clock work with feedback. Old module compatibility, duplicate/stale refusal and no wrong-target action proved. No arbitrary JS/macro execution or data-key impersonation. |
| E7. Installable election package and keyed candidate selection | Baseline data/output; E5 for selected API route; E6 where hardware controls are used. Agent-authored package, not SVG-import redesign. | Party board, candidate card, count bug and ticker install with starter files/assets; operator selects a stable candidate ID; all fields/updates follow that candidate coherently through reorder/correction/reconnect. Rehearse counts, downward correction, duplicate/old snapshots, feed loss, manual hold and restart on actual CasparCG. Simulation and qualified live-feed operation get separate verdicts. |
| E8. Expanded production and interoperability acceptance | All included packages; final candidate and real setup. | Reconcile earlier evidence against material changes; run affected end-to-end/human/hardware walks. No final pass with missing mandatory route, fake output confirmation, unqualified required feed or unsafe ownership. Record tested operating envelope, unsupported capabilities, operator runbook and rollback/recovery. |

Before any extension runs, it needs an authoritative child spec: scope/non-goals, current-source
reconciliation, dependencies, owning files/contracts, observable acceptance, environment,
compatibility/migration, verification, failure behavior and rollback. This review is meant to
improve that decomposition, not authorize workers to implement these table cells as loose wishes.

Still later unless you establish a concrete need: general responsive layout presets beyond
ARRANGE, rich collection authoring, private Sheets/OAuth, Excel/local-file providers (#1507),
licensed sports feeds, new high-rate transport, SVG/custom-action import redesign, Bridge EXE
packaging changes, full NoaCG OGraf Server API and native SDI/NDI engine. Existing full-stack
packages G/J own the latter. Server and renderer are separate responsibilities; CasparCG hosting
a graphic does not itself constitute an OGraf server. Do not silently promote these options.

## 6. Companion: facts and gaps the review must respect

The repository has `companion-module/`, version 0.1.1 at the inspected checkout, with its own
build/test/package commands outside the app's normal build. Code supplies Take, Re-take, Update,
Next, Out, previous/next selection, clip Pause/Resume/toggle, All out, Select cue, Take cue and
Trigger cue. Per-cue Take toggles; Trigger plays/restarts without changing selection/preview or
starting a rundown sequence. A selected-row Take follows the page's SPACE policy; do not label
every Take as unconditionally airing. Clip Pause is not data-source Pause or a graphic clock.

Route: Stream Deck → Companion module → NoaCG cloud relay → answering operator page → existing
dispatcher/output path. The module does not call Bridge/AMCP or write the command log directly.
It requires a published production, cloud connection and answering page. No page means refusal,
not queued execution. The current lease auto-acquires a free panel on the production page;
"Use here" transfers ownership. Older HELP still describes a removed answer switch.

There are October 2 receipts for real Companion module presses through CasparCG 2.5.0, OBS and
vMix, and later page/lease tests. The physical deck was deliberately not used. A historical
scorebug preview-branch measurement recorded p50 168 ms for ten presses, versus keyboard 115 ms;
this is not a current or universal latency guarantee. The October 3 review left some command,
hosted-feedback timing, credential-boundary and operator-documentation evidence incomplete.
Reconcile subsequent tests before declaring these still-open implementation defects.

Issue https://github.com/NoaCG/NoaCG-Studio/issues/809 was open on October 19 for Bitfocus
publication; the expected public module repository returned 404. Do not assume catalogue install.
A developer package is the existing documented rehearsal route (Companion 4.3+ compatibility
claimed by module docs; older actual receipt used Companion 5.0.6). Verify the installed version.
No vendor outreach is authorized. Current module actions do not expose arbitrary graphic events
or value adjustment: E6 is a real extension, not an instructions-only task.

## 7. Election proof: what success and uncertainty mean

Use synthetic results and fictional candidates, with parties, candidates, districts, assets and
versioned result snapshots. Candidate IDs must distinguish the same candidate number in different
districts. Existing local research proved one fixed candidate's data through real binding/render
functions and a loopback HTTP stand-in; it did not prove per-cue live candidate selection, a real
provider, hosted API/auth/database/realtime, or actual election-day outputs.

The key new capability is selecting person A versus B on a reusable card without binding by row
position, showing mixed-person fields, or breaking graphic-shared versus cue-owned semantics.
Require an explicit selection/state contract before E7; do not casually change Fill/Connect to
solve it. Counts, percentages and status should come from one validated coherent revision.
Newer downward corrections are valid. Old revisions/duplicates must not replay stale results.

The researched official provenance is Finland's Ministry of Justice, with Yle receiving official
results; Yle's exact feed and the 2027 media delivery contract are unverified. Use an adapter/replay
simulator until actual access/schema is obtained. Do not scrape a newsroom website and call that
a qualified election feed. Photos, logos, translations and editorial copy are separate inputs.
Seat projections are not inferred from national vote percentages. February 2027 is rehearsal;
the planned real parliamentary election is 18 April 2027, not February.

## 8. Competitive evidence and the comparison we need

Use the completed findings below; do not repeat broad research unless a disputed detail changes
your recommendation. Identify evidence gaps, and cite the exact supporting source for new claims.

- Erizos documents type-matched controls, reusable panels, source/feed/variable setup and scripted
  REST/WebSocket integrations. Adopt contextual setup; scripts do not establish a universal
  no-code mapper or production-wide recovery policy. Vendor group metadata is mutual exclusion,
  not a standard OGraf batch. https://docs.erizos.tv/userguide/UIBuilder/UserInterface/
  https://docs.erizos.tv/userguide/UIBuilder/UIManager/DataVariables/
- Pixotope 26.3 documents automatic forms, custom layouts, sample-based Data Mapper, OGraf import,
  typed action forms, target selection and step controls. Form Builder has destructive reset and
  layout/widget limitations; Data Mapper and OGraf coverage are distinct claims. Browser preview
  is not necessarily actual output; same-layer replacement can omit Out. Do not copy these limits.
  https://help.pixotope.com/phc/26.3/using-the-form-builder
  https://help.pixotope.com/phc/26.3/using-data-mapper
  https://help.pixotope.com/phc/26.3/using-live-controller-with-ograf
- Singular/uno documents staged Update with immediate-update exceptions, shared/global data,
  typed tables and starter Sheets, task-specific controls and a separate stream transport.
  Do not add a second transport before measurement. Stable control IDs matter for panel reuse.
  https://developer.singular.live/singular-basics/controlling-overlays-in-studio-and-uno/studio-reference
  https://support.singular.live/hc/en-us/articles/56565366205849-Table-Control-Node
- Lino documents distinct selected/play/availability/channel states and inspectable grouped
  children. This does not prove arbitrary state introspection or durable recovery.
  https://docs.zerodensity.io/reality-5.8/user-guide/lino/lino-playout-module/rundown-area
- Ross/Chyron document shared scoped parameters and panels; Viz Datacenter/Flowics document API
  configuration, sample schemas and local bridging. Reuse those patterns, not several mandatory
  products or a competitor's authentication limitation.
  https://docs.vizrt.com/datacenter-user-guide/2.1/Rest_Webserver.html
  https://support.flowics.com/en/articles/8869213-working-with-data-inputs
- MXMZ markets sports-specific panels, feeds, multichannel rundowns and automation. Public
  marketing does not settle custom mapping, failure handling, licensing or a generic panel editor.
  https://www.mxmz.com/products/operator
- OGraf reference: https://ograf.ebu.io/v1/specification/docs/Specification.html . Pin a single
  matching prose/schema/TypeScript revision in tests. SuperFlyTV server/form/devtool and third-party
  OGraf Studio packages are useful fixtures; none alone is a conformance authority. Pixotope
  Discovery is an optional restricted evaluation, not live-I/O qualification.

Correct the old claim that only Singular generates controls: Erizos and Pixotope do too. NoaCG's
potential distinction is a complete beginner-to-production journey, native state-aware controls
and portable graphics. It is not a proven advantage until task and interoperability evidence exists.

Assess separately: small live productions, school/sports/quiz use, YLE election demo versus
election-day readiness, foreign OGraf controller, and a full broadcast server/renderer offering.
Do not give a single invented "90% parity" score. State where external engines provide capability
and where NoaCG itself owns it. No refactor can prove we will never need another refactor.

## 9. Execution, verification and stop rules

- One coordinated project, one writer of shared phase-owned code at a time. Separate feature
  worktrees, independent assessment and merge-queue landing; no direct main writes.
- Cloud: ordinary implementation/review, Node tests, targeted browser checks and accessible
  provider qualification. Actions: required authoritative broad suites. Local Windows: performance,
  installed Companion/deck/CasparCG/Bridge/OBS, device/network behavior and human trials.
- Record revision, material inputs, environment, fixtures, versions, test/run IDs and limitations.
  Before manual CI dispatch, look for an existing matching run; reuse only under the repository's
  actual verification rules. No skipping required checks, relabeling failed runs or modifying the
  GitHub Teams measurement experiment to improve apparent speed.
- Current parent policy is conservative: changes to source/tests/scripts/package inputs invalidate
  affected evidence; control/page changes reach all its matrix rows. Review this cost honestly;
  do not promise savings that the current policy does not allow. Evidence-only exceptions remain
  exactly as specified. Broad checks are not repeated solely because a session changed.
- Current Windows performance comparisons: medians +5 ms and p90 +10 ms for click→command/played/
  painted, RPC/ws medians +15%, freeze p90 +10 ms; two baselines first. An outlier is rerun at
  24 rounds before judgment. No extrapolation to vendor performance or physical SDI latency.
- Stop on confirmed regression, stale/wrong target, duplicate non-idempotent execution, broken
  ownership, invalid migration or missing required qualification. Infrastructure failure is not
  grounds to revert healthy code. Revert through the normal queue; resume with explicit evidence.
- Phase ready means implementation outcome plus applicable tests, independent review and recorded
  acceptance—not "code written", "HTTP 200", "test file exists" or "looks right in a mockup".
- Runner requires a separately supplied finite operating deadline and qualified checkpoint/recovery
  route at actual start. Do not confuse that operational lease with a product completion deadline,
  Friday's checkpoint or an invented 24-hour scope cap.

## 10. Required review output

1. Lead with your verdict on the baseline and the expanded proposal, including the production
   categories each could credibly serve after acceptance. Separate capability from proof.
2. Return a prioritized gap table: finding → existing code/plan → real missing capability →
   include/refine/defer/remove → phase/dependency → observable acceptance → evidence confidence.
3. Challenge H0/E1–E8 individually. Is the decomposition safe, too broad, unnecessarily sequential
   or missing a prerequisite? Give a revised phase order without silently dropping baseline work.
4. Identify important competitive gaps that remain even after expansion. Recommend additions
   only when tied to an operator task, production requirement and testable completion condition.
5. Review identity, ownership, source failure, staging, typed data, native/foreign legality,
   partial groups, output confirmation and recovery. Examine the candidate-selection contract
   particularly closely. Name failures and fixes, not generic "add more tests" advice.
6. Give a Friday Companion readiness checklist: install route/version, current ownership UI,
   actual physical keys, output evidence, feedback, loss/reconnect and what needs code versus docs.
   Distinguish transport/clip controls from arbitrary graphic actions.
7. Identify duplicate phases, already-built features and unsupported competitive claims. State
   whether the remaining architecture seams plausibly support growth; do not promise zero future
   maintenance or wholesale rewrite avoidance without explaining the ownership boundaries.
8. List only explicit product decisions still needed, with a recommendation and consequences.
   Finish with: "Run as proposed", "Run after these changes", or "Do not start yet", and why.

We want an ambitious but reviewable programme whose operator can answer: **Where did this value
come from? What will this button affect? What is actually on air?**
