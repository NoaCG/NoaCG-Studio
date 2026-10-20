# E7 — Installable election graphics and cue-specific live candidates

Status: agreed planning scope, 19 October 2026; implementation and acceptance unstarted.
Revised 2026-10-20 for the owner's decisions
([receipt](../production-page-refactor/evidence/owner-decisions-2026-10-20.md)): phases pass on
criteria an agent checks on a cloud worker or in Actions; owner-only items wait only in the
final owner block; human trials are kits.
Reconciled against main `4e067b65674a9bf0a7632430b5dd0772c03a0331`.

## Shared execution contract

Parent: [production-page](../production-page-refactor/spec.md). The
[extension contract and exact sequence](../production-page-refactor/extensions.md) are normative:
file ownership, compatibility, evidence reuse, environment routing, stop/rollback and final
acceptance apply here. All phases below are product/qualification work, not refactor-only moves.
Paths named as new are planned files, not claims that implementation already exists. Use the
existing `/check`, targeted verification and `/queue-merge` procedures when execution starts.
Each phase must pass its listed ACs before the next dependent phase. `work.json` records intent
and acceptance, never worker progress. No implementation or run starts from this document.

## Scope, dependencies and ownership

After E5.2 for this run. Package authoring/replay research can use C5 independently, but that is
not a substitute for the E4/E5 integration acceptance. Four agent-authored native graphics:
party board, candidate card, count bug and ticker, with starter data, assets and installation
instructions. Keep SVG import unchanged. Use fictional candidates and labelled synthetic results.

Owned seams: keyed selectors in `src/control/sourceMapping.ts` (the one shared evaluator E4.2
creates and E5.1 extends; no separate selection evaluator), versioned source/selection metadata
in `src/model/shows.ts`, existing production-data/session and extracted cue/air ownership seams,
package fixtures and affected tests. Reuse the native graphic source/export format; the research
folder's existing fixtures are inputs, not production-qualified packages. No seat projection
from national vote shares, licensed photos, newsroom scraping or implicit real-provider claim.
Results come from E4's authenticated election replay server (`scripts/election-replay-server.mjs`),
never an external provider.

## Selection contract

Persist a shared collection recipe with source ID, schema revision, stable key and field map.
Persist a cue-owned `selection` record (version 1, recipe ID, entity key) outside ordinary graphic
field values. Old cues without it preserve existing behavior. The aired instance captures the
cue's effective selection at Take; preview/draft changes do not retarget it. An explicit Update
may change an aired cue's selection only after validating the full replacement record, using
that captured instance/target. Update to a different candidate is one coherent field update.

Resolve all mapped fields for one entity from one accepted source revision. Identity includes
district plus candidate identifier; row position and candidate number alone are insufficient.
Last-good cache is scoped by production/source/recipe-schema/entity/instance as appropriate;
it must never substitute A for a missing B. Unknown B with no valid record makes that card not
ready to Take/Update; an already aired A that disappears holds A with an off-air warning until
an explicit operator decision. A valid empty collection clears list graphics but cannot create
a valid candidate record. Missing required candidate fields invalidate the whole candidate;
optional fields use declared fallbacks. Duplicate keys invalidate collection selection.

Connected candidate fields are read-only in this new mode. A correction comes from the source;
for manual operation, explicitly Fill a detached cue snapshot or Pause the connection to hold
current data. Pause/Resume follows the API source contract: no buffered intermediate revisions
are aired and only the latest valid snapshot is resolved on Resume. Existing scalar Sheet
manual override semantics remain unchanged. Reconnecting a detached cue is explicit.

Version the persisted selector additively; unsupported clients must refuse editing/Taking the
new selection mode and preserve its data, rather than flatten it into legacy shared bindings.
**Read gate first (2026-10-20).** E7.1 lands the reader and the refusal: a page that meets a
`selection` record or recipe version it does not support shows that cue read-only, refuses
Take/Update/edit with a reason and keeps the record byte for byte (precedent `readShowProfile`,
enforced at both write doors in `src/model/shows.ts`). Only E7.2a, a later deploy, lands the
writer that creates selection records, so every page loaded after E7.1 already refuses rather
than flattens. Outputs receive resolved values only; if the builder finds the output payload
carries selector metadata, the output reader follows the same gate under the CasparCG 2.3
Chromium 71 rule of `src/control/payloadVersion.ts`.
Exported rehearsal packs contain resolved defaults, schema/recipe, selector metadata and assets,
never credentials. Offline installation operates in explicitly labelled replay/manual mode.

## Acceptance

### AC-1: Four graphics install with matching starter data
Install into an empty rehearsal production; import starter files without manual cell-by-cell
binding. Preview and Take party totals, candidate card, count bug and ticker. Assets, fonts and
labels survive export/reimport. Instructions distinguish editorial inputs from result data.

### AC-2: Stable live selection cannot mix candidates or targets
Two cues share one card template and select different IDs, including identical candidate numbers
in different districts. Reorder rankings and rapidly switch A → B → A while reads complete out
of order. Preview B never changes aired A; each actual rendered card has one entity/revision.
Unknown/duplicate/missing keys and partial records follow the contract, including B never valid.
Capture renderer payloads and visible output, not only the resolver return value.

### AC-3: Correction, hold and recovery preserve show intent
Replay count increases and a newer downward correction; reject older and duplicate revisions.
Pause, source failure, malformed response, valid empty, deleted person, reload, reader handover,
network recovery and app restart do not Take/advance/reset a running graphic. Held content and
its age are visible off air. Recovered program uses the aired selector, not current selection.

### AC-4: Actual election rehearsal has an honest qualification verdict
Run the four graphics through hosted production data to outputs, using authenticated E4 replay
acquisition and E5 mapping. Record source/package/version hashes, clock/cadence, manual recovery
and operating limits. Grade separately: software/replay rehearsal on browser outputs (E7.2b,
gating), actual CasparCG/Bridge and OBS/browser in the real studio (parent phase S), official
live-feed access/contract and production feed qualification (unverified until obtained). February is rehearsal; the researched election date is 18 April
2027. No Yle readiness claim from a loopback demo. Missing live access does not invalidate the
honestly labelled simulator product, but forbids claiming election-day feed qualification.

## Phases and verification

Every gating criterion is checked on a cloud worker or in Actions (owner, 2026-10-20, A).

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E7.1 | Read gate, keyed selectors in `sourceMapping.ts`, coherent resolver, instance capture and old-show compatibility; AC-2/3 | Cloud: new `scripts/keyed-selection.test.mjs`, `e2e/configured/election-selection.spec.ts` with selection records written by fixtures; hold responses, change productions, reload and inspect renderer payloads; an older-format page refuses read-only. |
| E7.2a | The selection writer and the four-graphic installable package with starter files; AC-1 | Cloud package/export tests; install into an empty rehearsal production, import starter files, preview and Take on browser outputs, export/reimport with assets and fonts. |
| E7.2b | Replay rehearsal through E4 and E5 to hosted production data and outputs; AC-4 software/replay grade | Cloud: the replay server, the trusted agent and E5 mapping driving the four graphics on the published production; renderer payloads and browser-output captures; the operation runbook. Non-gating: the laptop helper's scratch CasparCG/Bridge and OBS walks on E7.2b's merge SHA. The real-studio grade is parent phase S. |

New custom deck actions are E6, not a dependency cycle here.

Rollback: disable new selection mode and leave program on its validated last state. Restore a
rehearsal backup or explicitly use a detached manual cue; do not silently reinterpret selectors
as legacy paths. Retain source revisions/receipts to investigate mixed or rejected updates.
