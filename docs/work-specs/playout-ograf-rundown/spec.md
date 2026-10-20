# E3 — Foreign OGraf packages in the normal library and rundown

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

After E2.2; E6.2 follows E3.2. Implements full-stack F and the related A/E prerequisites. Reuse existing import,
isolated host, asset storage, cue library and output stage. Owned seams:
`src/export/targets/ografImport.ts`, library/template persistence, extracted rundown authoring,
`src/control/ografHost.ts`, `src/output/foreignOgraf.ts`, `stage.ts` and normal command/recovery
adapters. No foreign-to-native source conversion, full Server API, native SDI/NDI engine or Bridge
packaging redesign. The existing importer/CLI is a starting point, not proof of rundown support.

## Package and output contract

Keep original opaque package bytes, manifest revision and asset paths with hashes. Import/save
creates a foreign playable/data-editable library entry, never a blank native scene. Validate
archive path traversal, bounded extraction, asset references and executable isolation before
loading. Foreign graphics cannot access controller credentials, peer graphics or unrestricted
parent messages; origin/instance/token checks bind messages to the right host.

Normal cues reference stable package/version identity and E1 data, with explicit replacement
policy on each layer/channel. Folder, batch All together, exclusive group and output layer are
separate. Same-layer collision is detected before a batch; partial output failure reports each
child. Composite preview, when unavailable, says so. Unknown vendor metadata is preserved but
cannot acquire native control semantics. Asset readiness is separate from Take acceptance.

Recovery uses the existing ordered log/baseline and the package's demonstrable lifecycle.
Do not replay a non-idempotent custom action blindly or infer full state from an action result.
If exact restoration is unknown, report it and require an explicit operator re-cue. No success
from HTTP/log acceptance alone. No non-real-time or deterministic-seek claim without its tests.

## Acceptance

### AC-1: An unfamiliar package survives normal library use
Import at least two independently authored fixtures (one nested/action-rich), save/reload,
create/reorder/duplicate cues and export/reimport with assets intact. Package/version, typed data
and cue identities remain separate. Malformed archive and isolation probes fail safely before
secrets or peer graphics are reachable. Record authorship, licence and pinned hashes.

### AC-2: Normal rundown actions produce actual target rendering
Prepare/Take/Update/step/action/Out on outputs: browser outputs in configured tests (E3.2a,
gating), the laptop helper's scratch CasparCG/Bridge and OBS (non-gating), and the real studio
(parent phase S). Confirm actual target
images, instance IDs and typed payloads. Mix native and foreign cues, same-layer replacement,
All together collision and one failed child; inspect per-child outcomes. Local simulation is
labelled distinctly from the target's last confirmed output.

### AC-3: Restart and failure produce truthful recovery
Drop host/Bridge/controller connections, reload, remove an asset and fail an action. Reject late
old-instance messages; no automatic duplicate non-idempotent action. Restore only proven state;
otherwise display unknown and offer explicit re-cue. Manual native operation remains available.

The former AC-4, outward portability of a native export in an independent controller, left this
run on 2026-10-20 (owner decision F) and is backlog issue
[#1531](https://github.com/NoaCG/NoaCG-Studio/issues/1531). Nothing in the run depends on it.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E3.1 | Foreign library identity, persistence, asset and isolation integration; AC-1 | Cloud: importer/archive/host tests and new `e2e/ograf-library.spec.ts`; explicit malicious fixture isolation probes. |
| E3.2a | Normal mixed rundown, same-layer replacement, All together collision and one failed child; AC-2 on browser outputs | Cloud configured output tests: mixed native and foreign cues, per-child outcomes, simulation labelled apart from last confirmed output. Non-gating: the laptop helper's scratch CasparCG/Bridge and OBS captures on E3.2a's merge SHA. |
| E3.2b | Restart, failure and truthful recovery; AC-3 | Cloud: dropped host/Bridge/controller connections, reload, a removed asset and a failed action; late old-instance messages rejected; no duplicate non-idempotent action. Final cross-feature checks remain E8. |

Rollback: disable foreign entry activation while retaining package/source bytes and typed values.
Stop/dispose only the affected instance; no global clear as a repair shortcut. Preserve normal
native cues and refuse unsupported foreign data on an older deployment.
