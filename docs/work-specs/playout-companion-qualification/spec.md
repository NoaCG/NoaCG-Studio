# H0 — Qualify the existing Companion and Stream Deck route

Status: agreed planning scope, 19 October 2026; implementation and acceptance unstarted.
Revised 2026-10-20 ([owner decisions](../production-page-refactor/evidence/owner-decisions-2026-10-20.md)).
Reconciled against main `4e067b65674a9bf0a7632430b5dd0772c03a0331`.

## Shared execution contract

Parent: [production-page](../production-page-refactor/spec.md). The
[extension contract and exact sequence](../production-page-refactor/extensions.md) are normative:
file ownership, compatibility, evidence reuse, environment routing, stop/rollback and final
acceptance apply here. All phases below are product/qualification work, not refactor-only moves.
Paths named as new are planned files, not claims that implementation already exists. Use the
existing `/check`, targeted verification and `/queue-merge` procedures when execution starts.
Each phase must pass its gating ACs (the extensions.md table) before the next phase. `work.json` records intent
and acceptance, never worker progress. No implementation or run starts from this document.

## Scope, dependencies and ownership

Qualify existing transport, fix setup/protocol drift and produce an installable developer
package. Reuse `companion-module/`, `src/control/panelFeedback.ts`, `panelRelay.ts`,
`src/components/control/PanelControl.tsx` and the existing relay/backend. Historical acceptance
is in `hardware-panel-control/evidence/`; the lease exists despite older spec prose.
No new score/quiz/graphic-clock action belongs here (E6 owns those); clip transport is distinct.

Owned changes: module packaging/help/presets, hardware-panel and lease documentation, affected
panel tests; a demonstrated runtime defect gets its own named fix and regression, coordinated
with the current page owner. Never rebuild the lease, bypass the relay or change CI policy.
H0.1 follows C0. H0.2 is the first phase of the final owner block, after E8.2 (owner,
2026-10-20, C): one physical deck requalification that also covers E6's custom and foreign
buttons and sets up the operator's buttons on the deck at the same time. Missing hardware holds
only H0.2; it is blocked evidence, never a pass.

## Contract

Use the installed module version and its declared base API. Source manifest placeholders are
filled by the packaging tool; inspect the built archive before diagnosing a mismatch. Pin the
module, packaging tool, Companion, OS, Stream Deck model/firmware, app and Bridge versions.
A developer install is sufficient; public Bitfocus catalogue publication is not a prerequisite.

Document pairing, automatic free-lease acquisition, “Use here”, revocation and one answering
page. Trigger cue uses its stable row target. No answering page means refused, never queued
until one appears. Keep every existing action's semantics, including Take toggle/SPACE policy,
Trigger without changing selection, and clip versus graphic-clock Pause.

## Acceptance

### AC-1: The actual archive installs and pairs from the guide alone
On a clean Companion connection, follow only the guide to install, pair and add the starter
buttons. Archive manifest versions match the packaged module/base; no obsolete answer switch.
Record elapsed time and wrong turns. HELP, protocol, action list and actual 14 verbs agree.
H0.1 checks the archive, the guide against the module and a headless guide walk on a scratch
Companion; in H0.2 the owner follows the guide on his own Companion. A walk by a new operator is
a task in H0.1's trial kit, reported when run and never required (owner, 2026-10-20, D).

### AC-2: Existing actions and feedback traverse the real route
Exercise every declared transport/selection verb through the relay, including retake, update,
next, select-prev and trigger-cue. Assert target, command-log effect and rendered result; Take
produces one intended dispatch, duplicate delivery none. Separate selected, preview, on-air,
allowed, pending and stale feedback. Reconcile all 13 hardware-panel ACs, including the open
October 3 items, against current evidence; retain their existing latency criteria and distinguish
hosted feedback latency from press-to-render time. No new blanket 100 ms budget is introduced.
The reconciliation's laptop items, hardware-panel AC-8 (press-to-first-frame from the laptop),
AC-11 (the timed isolated Companion run) and AC-12 (CasparCG, OBS and vMix), are laptop-helper
checks on H0.1's merge SHA and never gate; anything that needs the physical deck is H0.2.

### AC-3: Ownership and credentials fail safely
With two answering contexts, hidden page, reload, disconnect, expired lease and revoked key,
only the current owner acts. Old/repeated/stale presses cannot affect a replacement cue or another
production. A module credential cannot write directly to the real command log or control another
production; test the actual routes, not an invented table. No secrets in screenshots or logs.

### AC-4: Physical deck and required outputs are observed
Physical Stream Deck buttons drive CasparCG through Bridge and OBS/browser output on the same
candidate. Capture both the target rendering and button feedback; simulated presses alone fail
this criterion. Provide a recovery runbook, previous known-good package and reversible install.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| H0.1 | Inspect current code/receipts, fix guide/protocol/presets and package delivery, and land the Companion trial kit; refresh `hardware-panel-control/work.json` (its spec digest is stale) as part of the reconciliation, with hardware-panel AC-7's hosted latency measured against hosted staging; AC-1 packaging and guide portion plus automated AC-2/3 | Cloud: module's own lint/test/package commands, archive inspection, a headless guide walk on a scratch Companion where qualified, existing panel-feedback and configured relay/lease tests as affected. Package evidence is distinct from the app build. |
| H0.2 | Final owner block: AC-1 (owner's guide walk), AC-4, and E6 AC-4; the operator's buttons set up on the deck | The owner's Windows laptop, Companion and physical deck with CasparCG/Bridge and OBS in the real studio, an agent session beside him recording receipts; hosted service available. Existing configured panel specs support, but do not replace, physical evidence. |

Failure recovery: stop sending, restore the prior module and answering-page setup, revoke a
compromised rehearsal key; do not clear the show or replay buffered presses. Package/publication
failure does not authorize switching to keyboard emulation and calling Companion qualified.
