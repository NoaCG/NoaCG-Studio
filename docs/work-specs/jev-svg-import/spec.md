# Intelligent SVG import and behavior preparation

Draft 4 for whole-plan review, 29 October 2026. **43 serial phases; preparation only.**
Source baseline: `96bb45612f2a183b3d3e18f4287552c1f3e41802`. This spec owns scope,
acceptance and phase order. [phases.json](phases.json) contains the exact phase metadata
for `plan-create`; it contains no execution authorization or live state. All product ACs remain open.

## Goal and boundaries

Import ordinary SVG artwork, identify editable fields/components without prescribed layer names,
resolve only absent behavior intent, and generate the existing appropriate controls. Preserve source
appearance, text/layer identity, corrections, bindings and animation. Named templates stay supported.
A simple reliable lower third reaches working preview without a mandatory mapping checklist.
The graphic can contain several recognizable components: recognition does not imply clock direction,
quiz correctness, reveal policy or a new state machine. Fixed artwork remains a useful fallback.

Mandatory families are lower third, scoreboard, clock, quiz and end credits, plus independent
score+clock. Linked Sheets cover imported credits, existing ticker consumers and suitable imported
scalar/multiline text. A generic moving-SVG ticker compiler is not included: an unfamiliar ticker's
editable fields may work while unsupported motion remains fixed artwork or an explicit limitation.
No new editor, form builder, expression language, state engine, connector, scheduler, persistent cache
service or database migration. No copied third-party artwork/code or runtime dependency.
The three-notice-zone composition challenge measures current limits; it cannot justify a hidden
generic behavior engine or be reported as supported if the existing primitives cannot express it.

The seven new rows (12, 19, 23, 26, 34, 37, 41) improve inspectability, event semantics, second-author
revision, linked-list clarity, continuous content updates, canonical controls and the full journey.
Their implementation is bounded to the existing seams. See [decisions](decisions.md).

## Authority and entry gate

Owner approved a $5 inference-evaluation ceiling and a 14-calendar-day duration; no start instant,
deadline, overnight block-renewal permission or implementation authorization has been supplied.
The owner requested the actual plan and another whole-plan opinion before implementation.
`work.json` remains draft. Creating these files, listing a preparation-only plan or obtaining a green
planning check does not authorize opening a project. The next authorization uses the owner's actual
words and an explicit date/offset; client timezone is Europe/Kiev, independently resolved at launch.

Before starting the window, complete every item in [readiness.md](readiness.md).
Production row 45 PASS is now reported on `05baf75` in the existing
[heartbeat](https://github.com/NoaCG/NoaCG-Studio/issues/1553#issuecomment-6301497867).
Physical phases remain with the owner; this plan requires the software row-45 gate, not completion
of unrelated studio acceptance. Fresh source/ownership reconciliation still applies.
SVG sanitizer remediation associated with [PR 1452](https://github.com/NoaCG/NoaCG-Studio/pull/1452)
remains open/test-only as checked 29 October and blocks SVG model-render qualification.
Keep its existing repair owner; do not start a competing fix in this plan.
No prepared corpus, protected evaluation workflow, fresh native launch/wake receipt or secret audit
is asserted by this document.

## Product contracts and fixed planning defaults

- **One import contract:** source revision, actual inventory IDs, components, field roles,
  unresolved intent and allowed profile capabilities. Unknown/conflicting/stale references fail
  atomically. Preserve user corrections and use the existing draft/build/validation path.
  Treat names and text as data, never model instructions. No model-generated executable behavior.
- **Fields and appearance:** identify field label/type/default/source/binding through the existing
  mapping UI only when inspection/correction is needed. Do not force every drawn layer editable.
  Outlined text, symbols, complex filters and raster-only artwork keep honest limits; do not claim
  native layers reconstructed from pixels.
- **Clock:** count-up starts manually. Duration starts on Take and holds at zero. Absolute target
  is a persisted instant, unaffected by visibility; no meaningless Pause/Reset buttons. Bare time
  proposes the next occurrence in the user's chosen/local zone with date/zone visibly confirmed.
  Explicit past targets remain expired, never silently roll forward. DST gaps/folds require a
  valid unambiguous selection. Time correction preserves running/held status; New game resets
  scores without implicitly resetting the imported clock. Preserve native defaults and one-full-
  recipe guard. Live mode switching and count-up stop limits are not initial capabilities.
- **Quiz:** new true no-Lock variant removes obsolete Lock controls/states/transitions; existing
  optional-Lock saved graphics remain compatible. Correct answers are operator/content inputs.
  No-Lock uses manual Reveal initially; no-Lock automatic-reveal is unsupported rather than moving
  an existing five-second timer silently. Removing a temporal Step alone is not semantic unlocking.
- **Credits:** one logical content field/list, never one field per name. Role-above and role-beside
  imported style patterns; static, continuous roll and cards. Reuse the native grammar/source
  format. Preview headings and role/name association without requiring JSON. Cards default to
  operator Next; optional timed advancement requires an explicit profile value and tested bounds.
  Preserve grouping across page breaks when it fits; oversized groups/names follow visible overflow
  handling, never silently drop names or substitute a native visual preset.
- **Updates:** credits prepare new source content automatically but an active roll/cards retain
  their snapshot until the next Play/Take. Static credits use the snapshot on Take. Speed changes
  preserve progress. Existing tickers use marquee continuity and flip item-boundary handover;
  empty input intentionally clears. Text updates do not replay unrelated animation. Reuse the
  current manual/source precedence and existing explicit apply controls; no second data owner.
- **Control identity:** canonical field/event IDs with semantic targets; never deduplicate by
  label or +/- delta. Award event and correction are different. Runtime guards refuse an illegal
  event before payload mutation. UI state missing/stale is not proof of legality or renderer health.
  Existing arrangements and software panel capabilities must agree on the live target. Foreign
  OGraf commands retain their distinct validation boundary.
- **Reimport:** verified stable matches preserve field/action identities, source bindings and
  keyframes; added/removed/ambiguous targets are shown for repair. Keep unmatched authored work and
  the prior graphic recoverable. Version rollback is not evidence of reimport reconciliation.
- **Preparation versus output:** AI drafts and library edits cannot silently mutate live output.
  Existing preview, prepare, publish/apply and Take remain authoritative. Transport success,
  rendered state, visual fidelity, conformance and physical host compatibility are separate claims.

## AI route and data policy

Use the existing server task registry, approved model catalog, privacy checks, disclosure,
quotas/reservations, accounting and kill switch. AI Gateway stays behind the NoaCG Vercel backend.
Native decision models need a narrow decision adapter, not a model-name swap in chat completions.
Production uses its qualified server auth (OIDC where configured); protected Actions uses a scoped
Gateway credential. Never copy production secrets into worker briefs or client bundles.

SVG names are permitted by the owner. Default product evidence is a bounded inventory of element
IDs, names, hierarchy, geometry and text shape/length. Actual selected text and rendered preview
require the clearly disclosed AI opt-in; preview inclusion defaults off. Evaluation uses independently
authored synthetic/public placeholders only. No private linked-sheet values, raw project files,
credentials or unrelated assets go to inference. Source refresh/playout never calls AI.

Pinned Jev 1.14 is the first candidate; qualify exact image endpoint, routing/privacy, limits and
billing before using pixels. Compare structured-only Jev and structured+sanitized-preview Jev where
supported, Elephant text, Haiku, ordinary Luna, and the existing Gemini vision baseline, plus the
deterministic importer. General-model answers use the same validated contract; confidence values
are not assumed comparable. No automatic cascade or new paid route outside the admitted shortlist.
Catalog prices/availability are a dated snapshot, not measured performance; recheck before calls.
Current planning snapshot is in [decisions.md](decisions.md). Vision alone cannot bind layer IDs or
supply unstated behavior. Render only sanitized artwork with no uncontrolled external fetches.

**Ceiling:** $5 cumulative across all configurations, retries and possibly charged failures; at most
500 provider attempts and two attempts per logical request. Development allowance up to $2,
holdout up to $3. Reserve a conservative priced cost before calls; reject unpriced routes. Reconcile
uncertain billing before retry. A restarted job must not reset remaining allowance. Use existing
server ledger/storage if it can enforce this; inability to prove durable accounting stops paid
admission and is not permission for a new database migration. No normal-user quota increase.
Disabled/failed/unqualified AI falls back to useful deterministic import; accepted graphics run offline
from inference.

## Corpus and evaluation gate

**Author:** a separate Codex planning/evaluation-authoring session prepares the frozen packet before tuning. It is an explicitly bounded preparation task, not a Codex cloud builder/checker row. Claude integrates and independently checks the packet in row 2. Codex remains an independent plan reviewer and the existing PR-review bot; do not rely on an unqualified Codex native child-launch route.

**Target:** 36 genuinely different designs: six each for lower thirds, scoreboards, clocks, quizzes, credits and combined score-clock. Split each stratum into three development and three held-out designs. Include unnamed/descriptive/multilingual layers, hidden groups, nested transforms and negative/ambiguous cases across the set. The minimum fallback is 24 designs only if explicitly revised before freeze; do not silently shrink 36 to save time.

Keep SVG bytes, labels, provenance, partition and SHA-256 hashes together. Source/hash the holdout packet before prompt or detector tuning. Its content and answer labels stay outside tuning prompts/workspaces until row 9; the evaluation workflow reads the frozen artifact. This is an evaluation protocol, not a claim that repository permissions make accidental access impossible. Codex authors ground truth from intended semantics, not from Jev predictions. Genuine owner/Illustrator exports can supplement the set but never become a waiting dependency. Agent-authored SVGs are labeled synthetic; they do not prove exporter provenance or broad real-world accuracy.

The comparison uses the same SVG designs and ground truth. Include the bounded candidate/vision configurations above; the existing image task proposes rectangles, so account for rectangle-to-SVG-ID mapping and do not pretend raw outputs solve identical tasks. Compare Jev with and without pixels to isolate their contribution. Freeze scoring in row 7 and tuned configurations at the end of row 8. Record complete useful setups, mapping correctness, user decisions/corrections, unsupported inputs, latency, all billed attempts/tokens and spend by family/language. Ticker/multiline binding tests supplement rather than replace the independent recognition corpus.

**Proposed bounded-pilot go rule:** at least one family must show fewer required corrections/decisions than deterministic matching on at least two independent held-out designs, no increased consequential error on that family’s remaining held-out design, and no invalid-reference or critical behavior-intent acceptance. Report the vision comparison, even when it wins. This small corpus qualifies a limited pilot, not a population accuracy guarantee.

**Partial go:** only qualified cases receive model-assisted preparation. The five-family runtime work and regression matrix remain in scope; unsupported AI interpretations retain deterministic import and targeted decisions. A narrow pilot must be labeled as such.

**No go:** if no qualified candidate shows useful gain, required provider/privacy policy fails, or evaluation cannot stay within the approved cap, stop at row 9 and produce a narrowed proposal. Do not mark a failed gate PASS, silently substitute an unqualified provider, skip rows or launch a second plan. The gate report names the selected model and support limits. Useful non-AI work may continue only through a reviewed/admitted revised sequence. Once exposed, the holdout becomes regression evidence; further recognizer tuning requires a new holdout before renewed quality claims.

The frozen recognition corpus contains 36 independent designs: 18 development and 18 holdout,
six strata (five families plus score-clock). Supplemental ticker, multiline and notice-zone fixtures
do not inflate that score. Synthetic fixtures are labeled; exporter names/provenance are never invented.
The separately authored packet must be available before opening the window. No owner artwork or
competitor login is a prerequisite. Freeze at most three candidate configurations plus established
baselines for holdout; report attempts and total spend. The pilot go rule and partial scope remain
explicit; no-go stops row 9 with unmet goals, never a false PASS. Stronger population claims need a
larger independent evaluation.

## Acceptance

### AC-1: Prerequisites and cloud qualification

Sanitizer remediation and production row 45 are landed/checked; exact main and fresh Claude/cloud/browser/Actions qualification are recorded; no ownership overlap.

### AC-2: Independent corpus

Independent, labeled, hashed corpus covers all five families and combined score-clock, with provenance and holdout separation established before tuning.

### AC-3: Import baseline

Existing importer/appearance/field/control baselines are recorded; regressions cannot be hidden by regenerated snapshots.

### AC-4: Validated reversible proposals

Proposals reference real layers, retain unknown intent, reject stale/invalid/conflicting decisions, preserve user edits and apply atomically/idempotently. SVG text remains data.

### AC-5: Minimal preparation and controls

Automatic working preview, existing control renderer and ordinary Finish/save; no routine layer-by-layer acceptance. Material ambiguity alone causes a compact decision.

### AC-6: Provider policy and bounded inference

Correct decision adapter and explicit consent boundary; server-only credentials; request/token/attempt/cost bounds; validated provider policy; deterministic fallback.

### AC-7: Fair evaluation and explicit verdict

Fair deterministic/Jev/eligible-challenger and relevant-vision comparison, frozen scoring/configuration, untouched holdout results, cumulative paid spend and an explicit go/partial-go/stop verdict.

### AC-8: Imported clock runtime

One imported clock reuses match-clock runtime/wire; up/down/start/pause/reset/correction, field identity and recovery work without native regressions. Duration starts on Take.

### AC-9: Absolute target time

A fixed target instant resolves input/date/zone, handles midnight/DST/past targets and survives updates/replay/recovery. Correct hours display and minimal mode-specific controls.

### AC-10: Score and clock independence

Score changes preserve clock origin; clock changes preserve scores/effects. Existing +1/−1/flash semantics, reset scope and lifecycle are tested.

### AC-11: Midpoint evidence

Midpoint evidence, elapsed time, spend, unresolved defects and remaining scope are reconciled without weakening gates.

### AC-12: Quiz profile compatibility

True no-Lock variant removes obsolete controls/paths, handles sealed selection/timers and preserves saved quiz behavior.

### AC-13: Imported credits styling and playback

Imported credits styling supports roles above/beside, multiple names and static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains compatible.

### AC-14: Shared linked-sheet fields

Sheet changes update declared imported credits, ticker and editable multiline-text fields through existing source/data bindings; adapter mapping, failure, empty data, pause/reconnect, closed-page delivery and each existing/selected playback update policy are proven. No AI per refresh.

### AC-15: Animation and reimport preservation

Layers remain editable fields and animation targets; verified-match IDs, keyframes, source bindings and controls survive save/reopen/reimport; unresolved work is protected.

### AC-16: Receiving-host qualification

Generated packages pass existing isolated receiving-host tests; hosted clock recovery is distinguished from standalone capability and physical studio acceptance.

### AC-17: Useful failure fallback

Model/network/quota failure and disabled Jev leave useful import and saved playout; prompt injection cannot alter allowed behavior or expose data.

### AC-18: Optional naming conventions

Existing generated naming docs/examples remain logical and correct, without making their names mandatory.

### AC-19: Release evidence

Full support matrix, exact-merge evidence, limits, spend, rollback/kill switch and owner trial kit accurately describe the delivered scope.

### AC-20: Inspectable field bindings

Selecting a prepared field highlights its actual SVG source; the existing mapping surface shows its editable label, type, sample and binding. A deliberate correction survives reanalysis and save/reopen, including two similar text layers. Routine reliable imports still need no mapping checklist. No new inspector framework or expression editor.

### AC-21: Score event and correction semantics

On unfamiliar imported artwork, +1 awards exactly one point with the correct team's flash, including repeated presses during a flash; -1 and direct numeric correction do not award or retrigger celebration. An illegal event is refused before payload mutation; a failed send does not commit local live values. Report accepted-event/shared-data-write failure distinctly. Reconnect agrees with rendered state. No new delivery/exactly-once protocol is promised.

### AC-22: Second-author quiz revision

In a fresh browser context reopen a saved imported quiz, select the true no-Lock profile, save, and operate Select→Reveal→Reset through the normal UI without code. Keep question/answer fields, source styling and matching animation targets; remove obsolete Lock control/state/timer paths only in that variant. Standard saved quizzes keep their behavior. Test reset from every reachable state and invalid Reveal. A fresh context is a task rehearsal, not a measured novice-user study.

### AC-23: Readable linked credits structure

Show a readable preview of headings, roles and associated names from the declared source/list binding. Preserve zero, one and multiple names per role, row order and one shared source through role-above/role-beside and static/roll/cards. Ambiguous columns get one mapping choice. Do not expose JSON/JSONata, create a field per person, or replace the native list grammar with another collection store. Later rendering rows prove each layout.

### AC-24: Ticker and text continuity

Use the existing ticker renderer and shared source bindings: replace/reorder/delete messages while moving, change speed only, empty then repopulate, and reopen/reconnect. Assert no unintended blank interval or entrance replay for nonempty updates; empty content intentionally clears. Qualify marquee continuity and flip handover at its existing item boundary using frame/time observations. A linked multiline SVG field updates without resetting unrelated motion. This row does not add a general imported-SVG ticker motion compiler; unsupported moving artwork remains an explicit limit.

### AC-25: Canonical control identity

Pin/hide/rename existing controls, save/reopen and reimport matching artwork. Normal UI and the existing configured software-panel harness address the same field/event and correct live cue with consistent labels and known-state availability. Same-label actions with different targets remain distinct; intentional mirrors share canonical identity without double dispatch. Unknown state is not fabricated as confirmed readiness; foreign OGraf actions retain their separate runtime-validation boundary. No new dashboard/layout or physical hardware requirement.

### AC-26: Complete unfamiliar-artwork journey

A fresh independent checker imports unfamiliar labeled fixtures, corrects only a material ambiguity, previews, saves, prepares, takes, updates, takes out, reopens, and replaces artwork through existing UI. Verify off-air draft changes do not alter on-air state before existing explicit apply/Take. Disconnect and recover the isolated software output; distinguish command acceptance, observed renderer state, visual fidelity and package conformance. Exercise three independently operated notice zones with existing primitives as a bounded diagnostic; report unsupported composition without inventing a new engine or claiming that optional challenge passed. No competitor or licensed host access is needed.

## Phases

1. Reconcile prerequisites and qualify the execution route

   Acceptance subset: AC-1. Environment: CA. Depends on: pre-start gate.

   Allowed files: acceptance records only; product source read-only.

   Verification: Read the landed sanitizer-fix receipt and production row-45 PASS; pin current main, qualify coordinator/worker/browser/Actions routes and record file ownership. No product edit.

2. Freeze the independent corpus and labels

   Acceptance subset: AC-2. Environment: CA. Depends on: 1.

   Allowed files: `+e2e/fixtures/jev-svg/manifest.json`; `+e2e/fixtures/jev-svg/dev.expect.json`; `+e2e/fixtures/jev-svg/dev/lower-third-1.svg`; `+e2e/fixtures/jev-svg/dev/lower-third-2.svg`; `+e2e/fixtures/jev-svg/dev/lower-third-3.svg`; `+e2e/fixtures/jev-svg/dev/scoreboard-1.svg`; `+e2e/fixtures/jev-svg/dev/scoreboard-2.svg`; `+e2e/fixtures/jev-svg/dev/scoreboard-3.svg`; `+e2e/fixtures/jev-svg/dev/clock-1.svg`; `+e2e/fixtures/jev-svg/dev/clock-2.svg`; `+e2e/fixtures/jev-svg/dev/clock-3.svg`; `+e2e/fixtures/jev-svg/dev/quiz-1.svg`; `+e2e/fixtures/jev-svg/dev/quiz-2.svg`; `+e2e/fixtures/jev-svg/dev/quiz-3.svg`; `+e2e/fixtures/jev-svg/dev/credits-1.svg`; `+e2e/fixtures/jev-svg/dev/credits-2.svg`; `+e2e/fixtures/jev-svg/dev/credits-3.svg`; `+e2e/fixtures/jev-svg/dev/score-clock-1.svg`; `+e2e/fixtures/jev-svg/dev/score-clock-2.svg`; `+e2e/fixtures/jev-svg/dev/score-clock-3.svg`; `+e2e/fixtures/jev-svg/qualification/ticker.svg`; `+e2e/fixtures/jev-svg/qualification/multiline.svg`; `+e2e/fixtures/jev-svg/qualification/notice-zones.svg`; `+e2e/fixtures/jev-svg/qualification/expect.json`.

   Verification: Verify the separately authored Codex packet: 18 development SVGs plus 18 held-out SVGs in a frozen evaluation artifact, six strata, SHA-256 hashes, provenance and labels. Keep holdout content/answers out of tuning inputs until row 9; repository stores its manifest, not a tuning copy. Add independently authored ticker, multiline and notice-zone qualification fixtures outside the 36-design recognition score. Freeze a separate expectation record for supported outcomes and the optional composition challenge.

3. Record the existing import baseline

   Acceptance subset: AC-3. Environment: CA. Depends on: 2.

   Allowed files: `scripts/svg-import-passes.test.mjs`; `+scripts/jev-svg-baseline.test.mjs`.

   Verification: Run all five families and combined score+clock through current inventory, bindings, preview and existing generated controls. Record appearance and layer IDs; do not regenerate golden output to conceal a difference.

4. Define and validate the SVG proposal contract

   Acceptance subset: AC-4. Environment: CA. Depends on: 3.

   Allowed files: `+src/ai/svgInterpretation/contract.ts`; `+src/ai/svgInterpretation/validate.ts`; `+scripts/jev-svg-contract.test.mjs`.

   Verification: Reject unknown element IDs, conflicting field ownership, unsupported capabilities, stale revisions and injected instructions; unresolved behavior intent stays explicit.

5. Apply the contract through the existing draft

   Acceptance subset: AC-4, AC-5. Environment: CA. Depends on: 4.

   Allowed files: `src/components/wizard/import/draft.ts`; `src/components/wizard/import/fieldAutoMap.ts`; `+src/ai/svgInterpretation/apply.ts`; `+scripts/jev-svg-apply.test.mjs`.

   Verification: Round-trip existing deterministic mappings, preserve corrections and source layers, and prove idempotence and rollback on invalid proposals.

6. Add the server decision adapter and task policy

   Acceptance subset: AC-6. Environment: CA. Depends on: 5.

   Allowed files: `+api/_lib/aiSvgInterpretationProfile.ts`; `+api/_lib/aiDecisionGateway.ts`; `api/_lib/aiTaskRegistry.ts`; `api/_lib/aiModelCatalog.ts`; `+api/_lib/aiDecisionGateway.test.ts`; `api/_lib/aiConsentStore.ts`; `src/ai/consentNotice.ts`.

   Verification: Use mocked provider calls to verify decision payloads, audited prices/routes, size limits, reservations, cancellation, bounded retry and fail-closed privacy policy. No paid call or database migration.

7. Build the comparison and metering harness

   Acceptance subset: AC-6, AC-7. Environment: CA. Depends on: 6.

   Allowed files: `+scripts/jev-svg-eval.mjs`; `+scripts/jev-svg-eval.test.mjs`; `+src/ai/svgInterpretation/evidence.ts`; `+src/ai/svgInterpretation/questions.ts`; `+.github/workflows/jev-svg-eval.yml`.

   Verification: Dry-run the bounded comparison defined in the model refresh: deterministic baseline, structured Jev, image-assisted Jev where qualified, and eligible comparators. Verify model/route/privacy qualification, request size and image accounting, persistent billed-attempt reservations, redaction and total cap. Freeze scoring before paid evaluation.

8. Run bounded development evaluation

   Acceptance subset: AC-7. Environment: CE. Depends on: 7.

   Allowed files: `src/ai/svgInterpretation/evidence.ts`; `src/ai/svgInterpretation/questions.ts`.

   Verification: Use only development designs through the protected Actions job. Compare the declared configurations within the cumulative cap; record useful mappings, corrections, unsupported inputs, privacy eligibility, latency and actual billed costs. Make bounded evidence corrections, then freeze at most three candidate configurations plus established baselines and all model/route/question/adapter/scoring hashes.

9. Evaluate the holdout and decide go or stop

   Acceptance subset: AC-7. Environment: CE. Depends on: 8.

   Allowed files: acceptance records only; product source read-only.

   Verification: Independently evaluate the sealed holdout with frozen configurations. Report file-level correctness, setup effort, languages, latency and total spend; name the recommended model and whether images justify their cost. Apply go/partial-go/stop without tuning against holdout failures or silently switching production providers.

10. Connect qualified model proposals to the existing import flow

   Acceptance subset: AC-5, AC-6. Environment: CA. Depends on: 9.

   Allowed files: `+api/_lib/svgInterpretation/analyze.ts`; `api/ai/tasks/[...path].ts`; `+src/ai/svgInterpretation/client.ts`; `src/components/wizard/import/ImportDesignStep.tsx`; `+e2e/jev-svg-preparation.spec.ts`.

   Verification: Exercise an opt-in preparation request through the task route into a reversible draft; verify timeout, cancellation, stale response and saved-edit protection using a stubbed model. Existing vision flow remains intact.

11. Show minimal decisions and working controls

   Acceptance subset: AC-5. Environment: CA. Depends on: 10.

   Allowed files: `src/components/wizard/import/AnalyzeProposalPanel.tsx`; `src/components/wizard/import/BehaviourSection.tsx`; `e2e/jev-svg-preparation.spec.ts`.

   Verification: Walk all five families with generated controls. Simple lower thirds need no new mapping checklist; missing intent gets one compact decision. Use design-consult plus an executable task rubric; give the owner a trial list.

12. Make inferred fields inspectable and easy to correct

   Acceptance subset: AC-20. Environment: CA. Depends on: 11.

   Allowed files: `src/components/wizard/import/MapSvgFieldsStep.tsx`; `src/components/wizard/import/AnalyzeProposalPanel.tsx`; `src/components/wizard/import/draft.ts`; `src/components/wizard/import/fieldAutoMap.ts`; `e2e/jev-svg-preparation.spec.ts`.

   Verification: Selecting a prepared field highlights its actual SVG source; the existing mapping surface shows its editable label, type, sample and binding. A deliberate correction survives reanalysis and save/reopen, including two similar text layers. Routine reliable imports still need no mapping checklist. No new inspector framework or expression editor.

13. Persist the clock instance and profile

   Acceptance subset: AC-8. Environment: CA. Depends on: 12.

   Allowed files: `src/templates/importedDesign/designTypes.ts`; `src/templates/behaviours/registry.ts`; `+src/templates/behaviours/clock.ts`; `src/templates/importedDesign/behaviour.ts`; `scripts/jev-svg-contract.test.mjs`.

   Verification: Save/reopen one clock with a full recipe; reject duplicate/unsupported clock instances and namespace collisions. Retain the one-full-recipe guard and old documents.

14. Bind the existing match clock to SVG artwork

   Acceptance subset: AC-8. Environment: CA. Depends on: 13.

   Allowed files: `src/templates/importedDesign/artworkFields.ts`; `src/templates/importedDesign/svgBind.ts`; `src/templates/importedDesign/svg.ts`; `src/templates/behaviours/clock.ts`; `+scripts/imported-match-clock.test.mjs`.

   Verification: Drive existing count-up/down runtime through the imported field; preserve the artwork/font/transform and avoid also emitting the old countdown engine for that field.

15. Adapt clock events and recovery

   Acceptance subset: AC-8, AC-10. Environment: CA. Depends on: 14.

   Allowed files: `src/control/matchClockWire.ts`; `src/templates/behaviours/clock.ts`; `e2e/configured/scorebug-output.spec.ts`; `+scripts/imported-clock-wire.test.mjs`.

   Verification: Prove namespaced start/hold/reset effects and server-time anchoring on two outputs, reload and reconnect. Unrelated updates must retain the origin; existing native clocks remain compatible.

16. Resolve absolute target times

   Acceptance subset: AC-9. Environment: CA. Depends on: 15.

   Allowed files: `+src/control/clockTarget.ts`; `+scripts/clock-target.test.mjs`; `src/templates/behaviours/clock.ts`.

   Verification: Inject now/timezone: 7 pm, explicit date, past time, midnight, DST gap/fold and expired target. A resolved target survives resend/replay and uses the existing stamped-countdown contract.

17. Expose only the selected clock controls

   Acceptance subset: AC-8, AC-9. Environment: CA. Depends on: 16.

   Allowed files: `src/components/wizard/import/BehaviourSection.tsx`; `src/templates/behaviours/clock.ts`; `src/templates/shared/matchClock.ts`; `e2e/playout-clock.spec.ts`.

   Verification: Test count-up manual start, duration start-on-Take and target-time display/edits. Preserve native defaults; hours formatting must not break minute/second wire parsing. No live mode selector, or Pause/Reset for an absolute target.

18. Qualify independent score and clock behavior

   Acceptance subset: AC-10. Environment: CA. Depends on: 17.

   Allowed files: `e2e/import-svg-behaviour.spec.ts`; `e2e/configured/scorebug-output.spec.ts`; `scripts/imported-clock-wire.test.mjs`.

   Verification: Rehearse score +1/−1/effects, clock correction, Full time, Out/Take and New game. Verify score reset does not implicitly reset clock, and clock updates do not change scores or flashes. Repair belongs to the owning earlier row if a contract fails.

19. Prove score events and corrections have different effects

   Acceptance subset: AC-21. Environment: CA. Depends on: 18.

   Allowed files: `src/templates/behaviours/score.ts`; `src/control/graphicVerbs.ts`; `src/templates/shared/animRuntime.ts`; `e2e/configured/scorebug-output.spec.ts`; `+scripts/imported-score-event.test.mjs`.

   Verification: On unfamiliar imported artwork, +1 awards exactly one point with the correct team's flash, including repeated presses during a flash; -1 and direct numeric correction do not award or retrigger celebration. An illegal event is refused before payload mutation; a failed send does not commit local live values. Report accepted-event/shared-data-write failure distinctly. Reconnect agrees with rendered state. No new delivery/exactly-once protocol is promised.

20. Review midpoint evidence and remaining scope

   Acceptance subset: AC-11. Environment: CA. Depends on: 19.

   Allowed files: acceptance records only; product source read-only.

   Verification: Independent cumulative rehearsal of rows 1–19; five-line midpoint retro with defects, costs, durations and remaining risks. Keep scope and checks intact; record proposed admissions rather than silently widening files.

21. Implement the true no-Lock quiz variant

   Acceptance subset: AC-12. Environment: CA. Depends on: 20.

   Allowed files: `src/templates/behaviours/quiz.ts`; `src/components/wizard/import/BehaviourSection.tsx`; `e2e/import-svg-behaviour.spec.ts`.

   Verification: Remove unused Lock state/actions/transitions only for the new variant. Preserve the existing optional-Lock behavior for saved graphics and operator-supplied correct answers.

22. Qualify quiz timing and hidden-selection behavior

   Acceptance subset: AC-12. Environment: CA. Depends on: 21.

   Allowed files: `src/templates/behaviours/quiz.ts`; `e2e/configured/imported-quiz-output.spec.ts`; `+scripts/quiz-no-lock.test.mjs`.

   Verification: Exercise sealed selection, reselection, reveal, five-second timer origin, correct/incorrect, replay and reset. Resolve unsupported no-Lock/auto-reveal combinations explicitly instead of moving timers silently.

23. Let a second author revise quiz behavior without rebuilding artwork

   Acceptance subset: AC-22. Environment: CA. Depends on: 22.

   Allowed files: `src/components/wizard/import/BehaviourSection.tsx`; `src/components/wizard/import/draft.ts`; `src/templates/behaviours/quiz.ts`; `e2e/import-svg-behaviour.spec.ts`; `e2e/configured/imported-quiz-output.spec.ts`.

   Verification: In a fresh browser context reopen a saved imported quiz, select the true no-Lock profile, save, and operate Select→Reveal→Reset through the normal UI without code. Keep question/answer fields, source styling and matching animation targets; remove obsolete Lock control/state/timer paths only in that variant. Standard saved quizzes keep their behavior. Test reset from every reachable state and invalid Reveal. A fresh context is a task rehearsal, not a measured novice-user study.

24. Define imported credits content and style bindings

   Acceptance subset: AC-13. Environment: CA. Depends on: 23.

   Allowed files: `src/templates/importedDesign/designTypes.ts`; `src/templates/behaviours/credits.ts`; `src/templates/importedDesign/creditsRoll.ts`; `+scripts/imported-credits-model.test.mjs`.

   Verification: Keep fixed artwork and legacy imports compatible. Identify repeatable role/name styling and stable source anchors; declare unsupported patterns without converting to a native preset.

25. Connect imported content fields to the existing Sheet adapters

   Acceptance subset: AC-14. Environment: CA. Depends on: 24.

   Allowed files: `src/control/contentFormats.ts`; `src/control/sheetSource.ts`; `src/templates/behaviours/credits.ts`; `scripts/source-mapping.test.mjs`; `+scripts/imported-credits-source.test.mjs`; `+scripts/imported-text-source.test.mjs`.

   Verification: Bind declared imported fields without assuming f0. Credits preserve role/name columns, headings/order/multiple names; existing ticker consumers preserve ordered message rows through the existing lines adapter; ordinary text preserves keyed values and multiline content. Save/reopen each binding, distinguish empty from missing values, and retain imported styling. No new connector, poller or arbitrary-text layout engine.

26. Preview linked credits structure using the existing data format

   Acceptance subset: AC-23. Environment: CA. Depends on: 25.

   Allowed files: `src/control/contentFormats.ts`; `src/components/wizard/import/BehaviourSection.tsx`; `src/templates/importedDesign/designTypes.ts`; `src/templates/importedDesign/creditsRoll.ts`; `scripts/imported-credits-source.test.mjs`; `e2e/import-svg-credits.spec.ts`.

   Verification: Show a readable preview of headings, roles and associated names from the declared source/list binding. Preserve zero, one and multiple names per role, row order and one shared source through role-above/role-beside and static/roll/cards. Ambiguous columns get one mapping choice. Do not expose JSON/JSONata, create a field per person, or replace the native list grammar with another collection store. Later rendering rows prove each layout.

27. Render role-above credits using imported styling

   Acceptance subset: AC-13. Environment: CA. Depends on: 26.

   Allowed files: `src/templates/importedDesign/creditsRoll.ts`; `scripts/imported-credits-model.test.mjs`; `e2e/import-svg-credits.spec.ts`.

   Verification: Test repeated roles/names, bold roles, long names and spacing from the sample. Use measured overflow expectations; retain original source text and animation anchors.

28. Render role-beside credits using imported styling

   Acceptance subset: AC-13. Environment: CA. Depends on: 27.

   Allowed files: `src/templates/importedDesign/creditsRoll.ts`; `scripts/imported-credits-model.test.mjs`; `e2e/import-svg-credits.spec.ts`.

   Verification: Test columns, multiple names per role, alignment and overflow using imported samples. Do not substitute cr02 and call it preservation.

29. Qualify continuous roll playback

   Acceptance subset: AC-13. Environment: CA. Depends on: 28.

   Allowed files: `src/templates/importedDesign/creditsRoll.ts`; `src/templates/importedDesign/creditsArtwork.ts`; `e2e/import-svg-credits.spec.ts`.

   Verification: Both editable layouts enter/exit fully, measure after fonts settle and replay consistently. The separate exact-artwork roll retains its existing bounds and motion assertions.

30. Qualify static credits playback

   Acceptance subset: AC-13. Environment: CA. Depends on: 29.

   Allowed files: `src/templates/importedDesign/creditsRoll.ts`; `src/templates/behaviours/credits.ts`; `e2e/import-svg-credits.spec.ts`.

   Verification: Both imported layouts hold without unintended travel; excessive content uses an explicit fit/refusal policy rather than clipping or silently switching layout.

31. Qualify successive credits cards

   Acceptance subset: AC-13. Environment: CA. Depends on: 30.

   Allowed files: `src/templates/importedDesign/creditsRoll.ts`; `src/templates/behaviours/credits.ts`; `e2e/import-svg-credits.spec.ts`.

   Verification: Reuse applicable paging primitives; qualify page boundaries, role/name association, long cards, ordering, replay and the selected automatic/manual advance policy. Existing native presets alone do not prove SVG compatibility.

32. Stage sheet changes without disrupting playback

   Acceptance subset: AC-14. Environment: CA. Depends on: 31.

   Allowed files: `src/templates/importedDesign/creditsRoll.ts`; `src/templates/importedDesign/svg.ts`; `src/control/contentFormats.ts`; `+e2e/imported-credits-live-data.spec.ts`; `src/components/home/SourcesLine.tsx`.

   Verification: Automatic refresh updates prepared content. Under the proposed default an active roll/cards keep their snapshot, newer data is indicated off air and next Play/Take uses it. Do not restart movement or overwrite animation because rows changed. Ticker continuity is qualified separately in row 34; this row changes credits snapshot application only.

33. Qualify Sheet failure and closed-page delivery

   Acceptance subset: AC-14. Environment: CA+CS. Depends on: 32.

   Allowed files: `+e2e/fixtures/jev-sheet-server.mjs`; `scripts/sheet-source.test.mjs`; `scripts/data-tick.test.mjs`; `e2e/configured/production-data-key-sheet.spec.ts`; `e2e/configured/production-data-key-tick.spec.ts`; `e2e/imported-credits-live-data.spec.ts`; `+e2e/imported-text-live-data.spec.ts`.

   Verification: Use a local fake CSV endpoint for denial, timeout, malformed/empty rows and reconnect; exercise server takeover with every operator page closed in Actions. Add one controlled public-sheet probe and record actual cadence. Keep last-good data on failure. Cover imported credits, ticker rows and multiline text; verify content refresh preserves animation state and needs no model request.

34. Qualify ticker and multiline updates without replaying motion

   Acceptance subset: AC-24. Environment: CA. Depends on: 33.

   Allowed files: `src/templates/tickers/shared.ts`; `src/templates/tickers/tickerMotion.ts`; `src/control/contentFormats.ts`; `e2e/imported-text-live-data.spec.ts`; `scripts/ticker-speed.test.mjs`; `+e2e/ticker-linked-update.spec.ts`.

   Verification: Use the existing ticker renderer and shared source bindings: replace/reorder/delete messages while moving, change speed only, empty then repopulate, and reopen/reconnect. Assert no unintended blank interval or entrance replay for nonempty updates; empty content intentionally clears. Qualify marquee continuity and flip handover at its existing item boundary using frame/time observations. A linked multiline SVG field updates without resetting unrelated motion. This row does not add a general imported-SVG ticker motion compiler; unsupported moving artwork remains an explicit limit.

35. Preserve editor layers and field animation

   Acceptance subset: AC-15. Environment: CA. Depends on: 34.

   Allowed files: `src/blocks/svgIdentity.ts`; `src/blocks/artworkLayers.ts`; `src/templates/importedDesign/svgBind.ts`; `e2e/editor-fidelity-trim.spec.ts`.

   Verification: A nested imported layer remains an editable field and animation target through prepare/save/reopen. Verify timing/easing and behavior paint ownership; no new animation feature or editor default switch.

36. Protect source bindings and keys on reimport

   Acceptance subset: AC-15. Environment: CA. Depends on: 35.

   Allowed files: `src/components/wizard/import/draft.ts`; `src/blocks/svgIdentity.ts`; `+src/templates/importedDesign/reimport.ts`; `+e2e/import-svg-reimport.spec.ts`.

   Verification: Keep verified-match IDs, keys, data-source bindings and action identities. Removed/ambiguous layers retain authored work and trigger a reviewed resolution or separate import; no fuzzy matching engine.

37. Preserve action identity across arrangements and control surfaces

   Acceptance subset: AC-25. Environment: CA. Depends on: 36.

   Allowed files: `src/control/controlModel.ts`; `src/control/panelActions.ts`; `src/components/home/ActionArranger.tsx`; `e2e/configured/panel-graphic-actions.spec.ts`; `e2e/configured/panel-production-page.spec.ts`; `e2e/import-svg-reimport.spec.ts`.

   Verification: Pin/hide/rename existing controls, save/reopen and reimport matching artwork. Normal UI and the existing configured software-panel harness address the same field/event and correct live cue with consistent labels and known-state availability. Same-label actions with different targets remain distinct; intentional mirrors share canonical identity without double dispatch. Unknown state is not fabricated as confirmed readiness; foreign OGraf actions retain their separate runtime-validation boundary. No new dashboard/layout or physical hardware requirement.

38. Qualify exports and isolated receiving hosts

   Acceptance subset: AC-16. Environment: CA. Depends on: 37.

   Allowed files: `e2e/ograf-parity.spec.ts`; `e2e/ograf-lifecycle.spec.ts`; `e2e/spx-operator.spec.ts`; `e2e/configured/imported-quiz-output.spec.ts`; `e2e/configured/scorebug-output.spec.ts`.

   Verification: Run the existing isolated player/host paths on generated packages. Distinguish hosted synchronized recovery from standalone-host capability; test clock and credits commands without claiming physical studio acceptance.

39. Qualify privacy and service-failure behavior

   Acceptance subset: AC-6, AC-17. Environment: CA. Depends on: 38.

   Allowed files: `api/_lib/aiDecisionGateway.test.ts`; `api/_lib/aiTaskRegistry.test.ts`; `e2e/jev-svg-preparation.spec.ts`.

   Verification: Verify consent scope, no browser secrets, prompt-injection refusal, quota/budget exhaustion, retries, cancellation, unsupported inputs and stale responses. Model-disabled import and compiled playout keep working.

40. Update optional naming conventions and examples

   Acceptance subset: AC-18. Environment: CA. Depends on: 39.

   Allowed files: `src/templates/behaviours/words.json`; `src/templates/behaviours/layer-names.json`; `docs/SVG_AUTHORING.md`; `docs.html`; `scripts/check-example-layers.test.mjs`; `scripts/behaviour-docs.mjs`.

   Verification: Regenerate existing guidance and verify examples against behavior. Keep names optional; do not hand-maintain duplicate catalogs or redesign templates.

41. Rehearse the complete unfamiliar-artwork workflow

   Acceptance subset: AC-26. Environment: CA. Depends on: 40.

   Allowed files: `e2e/jev-svg-preparation.spec.ts`; `e2e/import-svg-reimport.spec.ts`; `e2e/configured/panel-graphic-actions.spec.ts`; `+e2e/configured/svg-import-journey.spec.ts`.

   Verification: A fresh independent checker imports unfamiliar labeled fixtures, corrects only a material ambiguity, previews, saves, prepares, takes, updates, takes out, reopens, and replaces artwork through existing UI. Verify off-air draft changes do not alter on-air state before existing explicit apply/Take. Disconnect and recover the isolated software output; distinguish command acceptance, observed renderer state, visual fidelity and package conformance. Exercise three independently operated notice zones with existing primitives as a bounded diagnostic; report unsupported composition without inventing a new engine or claiming that optional challenge passed. No competitor or licensed host access is needed.

42. Run the complete qualification matrix

   Acceptance subset: AC-3, AC-5, AC-8, AC-9, AC-10, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17. Environment: CA. Depends on: 41.

   Allowed files: `scripts/jev-svg-baseline.test.mjs`; `scripts/svg-import-passes.test.mjs`; `scripts/fixtures/svg-corpus-passes.json`; `e2e/jev-svg-preparation.spec.ts`; `e2e/imported-credits-live-data.spec.ts`.

   Verification: On the immutable landing, run affected/full Actions gates and cumulative all-family journeys, all six credits combinations and held-out regressions. Record intentional snapshot changes. Reusing exposed holdout is regression evidence, not a fresh blind benchmark.

43. Close evidence and prepare the release kit

   Acceptance subset: AC-19. Environment: CA. Depends on: 42.

   Allowed files: acceptance records only; product source read-only.

   Verification: Produce support matrix, rollout/rollback instructions, total spend, exact-merge receipts and an owner trial list. Demonstrate the kill switch and no-AI fallback; mark any unqualified capability honestly. A planning gate is not product acceptance; conclude implementation only after all required evidence passes. Physical studio acceptance remains separately labeled.

## Execution and verification

CA means a freshly qualified Claude cloud builder/checker plus Actions. CE uses the same actors but
paid calls run only in the protected Actions environment; CS adds the controlled synthetic Sheet
fixture. No phase requires owner hardware. The release kit labels physical studio acceptance separately.

Every row also allows its own `docs/work-specs/jev-svg-import/evidence/phase-NN.md`;
there is no second execution ledger. The existing supervisor alone admits serial rows. Common
acceptance metadata is `work.json`; only a truthful current review changes it. New paths are marked
`+` at first creation; later references consume those paths. Every original/new file boundary is
rechecked against the post-prerequisite pin. An unlisted necessary source change requires explicit
row-boundary reconciliation before work, never a silent wildcard.

Use current `check`, `verify`, `queue-merge`, `cloud-delegate` and `plan-run` procedures.
Run appropriate targeted checks on the worker and full/configured checks in Actions; no whole suite
locally. Read fresh resource/browser qualification. Reuse prior exact-revision evidence only when
its source/inputs apply; never weaken tests, raise limits or regenerate baselines to pass.
A new behavior row may fix only a reproduced defect in its own declared seam. Infrastructure waits
retain the in-flight task and do not consume product-repair attempts. Semantic failures follow the
existing bounded repair and independent diagnosis protocol. Unknown dispatch/billing is reconciled
before replay; a local missing record never proves an external action absent.

Acceptance checkers start fresh from immutable merged revisions, independent of all builders/repairers.
They prove their row's exact subset, not all ACs by association. No production-page unrelated-failure
exception is inherited into this plan; required checks must qualify under its explicit policy.
Midpoint review is row 20, after rows 1–19. Final matrix row 42 and release evidence row 43 retain
all mandatory functional, privacy, preservation and software-output criteria. Optional challenge
shortfalls stay visible and do not certify unsupported features.

## Release and rollback

Keep the task off until qualified. The release kit gives exact supported families/modes, model route
and data disclosure, budget/kill-switch instructions and the existing publication/export flow.
Disable model preparation to fall back without changing saved graphics or playout. Revert defective
code via an isolated repair branch and the merge queue; never discard authored source/keyframes or
source bindings to simplify rollback. User trial/hardware checks are additional evidence, not hidden
unattended phase dependencies. No automatic production activation is implied by this planning change.

## Estimate and final review

43 rows replace the earlier 36-row draft. Using the historical planning assumption of 3 h/row gives
129 h; eight heavier rows at 6 h add 24 h, giving 153 h before queue/rework. A 25–50% allowance gives
191–230 h (about 8–10 continuous days); budget **9–12 elapsed days after prerequisites**, plus
1–2 days of spec/corpus preparation before launch. This is not a promise; the approved 14-day window
is unchanged and cannot auto-extend. If fresh capacity makes it infeasible, revise scope/window before
start rather than promise completion or drop acceptance later. See [runbook](runbook.md) and
[readiness](readiness.md). Whole-plan second opinion is required before implementation.
