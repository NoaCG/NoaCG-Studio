# Production-page programme: extension contract and exact execution order

Authority: owner, 19 October 2026, “Yes, please turn the selected extensions into precise
executable specs and reconcile the complete plan with current main.” Planning scope is agreed;
this does not authorize implementation, a run, deployment or completed acceptance.
Main reconciliation: `4e067b65674a9bf0a7632430b5dd0772c03a0331`.

This document is part of the [parent specification](spec.md). It owns integration of H0 and
E1–E8. Each linked child owns its detailed contract and ACs. The original 22 baseline steps and
Q retain their order, requirements and refactor fences. There are **31 named work packages**
(22 baseline + nine extensions), expanded below into **40 execution phases plus Q** so contract,
implementation and real-device acceptance have explicit boundaries. The extra phases are not
extra product scope. Friday 23 October is a progress checkpoint, never a completion deadline.

## Exact phase admission

Use the table below when preparing the existing continuing-project manifest. Keep stable IDs,
full spec path, phase-scoped ACs and environments in each worker brief. Each child's sibling
`work.json` is its acceptance record; include it in the existing project/worker SPEC references.
List all nine children as well as the parent/data/Sheet/audience records in final acceptance. Baseline parent IDs stay
`1`, `2+7`, `13a`, etc.; C IDs refer to data-sources. H/E decimal suffixes are child phases.
The default is one sequential admission path. H0.1 follows C0, so the original paste-first
commitment stands; H0.2 follows C7, sharing its available local output setup before more refactors.
Every row depends on the preceding row's PASS. Q is a prerequisite track before C1, with its
paste trial after C0; it is not audience-voting hardening or a numbered implementation phase.

| Ordinal | Phase ID | Authority | Ready condition / environment |
| --- | --- | --- | --- |
| 1 | C0 | [data-sources](../data-sources/spec.md) | Baseline step 1; its phase acceptance and verification/environment matrix, unchanged |
| 2 | H0.1 | [Companion qualification](../playout-companion-qualification/spec.md) | Packaging/docs and automated protocol evidence; cloud |
| 3 | 1 | [parent](spec.md) | Baseline step 2; its phase acceptance and verification/environment matrix, unchanged |
| 4 | 2+7 | [parent](spec.md) | Baseline step 3; its phase acceptance and verification/environment matrix, unchanged |
| 5 | 13a | [parent](spec.md) | Baseline step 4; its phase acceptance and verification/environment matrix, unchanged |
| 6 | C1 | [data-sources](../data-sources/spec.md) | Baseline step 5; its phase acceptance and verification/environment matrix, unchanged |
| 7 | C2 | [data-sources](../data-sources/spec.md) | Baseline step 6; its phase acceptance and verification/environment matrix, unchanged |
| 8 | C3 | [data-sources](../data-sources/spec.md) | Baseline step 7; its phase acceptance and verification/environment matrix, unchanged |
| 9 | C4 | [data-sources](../data-sources/spec.md) | Baseline step 8; its phase acceptance and verification/environment matrix, unchanged |
| 10 | C5 | [data-sources](../data-sources/spec.md) | Baseline step 9; its phase acceptance and verification/environment matrix, unchanged |
| 11 | C6 | [data-sources](../data-sources/spec.md) | Baseline step 10; its phase acceptance and verification/environment matrix, unchanged |
| 12 | C7 | [data-sources](../data-sources/spec.md) | Baseline step 11; its phase acceptance and verification/environment matrix, unchanged |
| 13 | H0.2 | [Companion qualification](../playout-companion-qualification/spec.md) | AC-1–4; local physical deck, hosted relay, CasparCG/Bridge + OBS |
| 14 | 3 | [parent](spec.md) | Baseline step 12; its phase acceptance and verification/environment matrix, unchanged |
| 15 | 4 | [parent](spec.md) | Baseline step 13; its phase acceptance and verification/environment matrix, unchanged |
| 16 | 5 | [parent](spec.md) | Baseline step 14; its phase acceptance and verification/environment matrix, unchanged |
| 17 | 6 | [parent](spec.md) | Baseline step 15; its phase acceptance and verification/environment matrix, unchanged |
| 18 | 8 | [parent](spec.md) | Baseline step 16; its phase acceptance and verification/environment matrix, unchanged |
| 19 | 9 | [parent](spec.md) | Baseline step 17; its phase acceptance and verification/environment matrix, unchanged |
| 20 | 10 | [parent](spec.md) | Baseline step 18; its phase acceptance and verification/environment matrix, unchanged |
| 21 | 11 | [parent](spec.md) | Baseline step 19; its phase acceptance and verification/environment matrix, unchanged |
| 22 | 12 | [parent](spec.md) | Baseline step 20; its phase acceptance and verification/environment matrix, unchanged |
| 23 | 13b | [parent](spec.md) | Baseline step 21; its phase acceptance and verification/environment matrix, unchanged |
| 24 | 14 | [parent](spec.md) | Baseline step 22; its phase acceptance and verification/environment matrix, unchanged |
| 25 | E4.1 | [Trusted JSON acquisition through the existing production-data route](../playout-external-connectors/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 26 | E4.2 | [Trusted JSON acquisition through the existing production-data route](../playout-external-connectors/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 27 | E5.1 | [Sample-based API mapping in Connect data](../playout-api-mapping/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 28 | E5.2 | [Sample-based API mapping in Connect data](../playout-api-mapping/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 29 | E7.1 | [Installable election graphics and cue-specific live candidates](../playout-election-package/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 30 | E7.2 | [Installable election graphics and cue-specific live candidates](../playout-election-package/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 31 | E6.1 | [Native declared graphic actions through Companion](../playout-companion-actions/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 32 | E6.2 | [Native declared graphic actions through Companion](../playout-companion-actions/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 33 | E1.1 | [Typed OGraf data and action contracts end to end](../playout-ograf-contract/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 34 | E1.2 | [Typed OGraf data and action contracts end to end](../playout-ograf-contract/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 35 | E2.1 | [Generated typed OGraf forms, steps and action targets](../playout-ograf-controls/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 36 | E2.2 | [Generated typed OGraf forms, steps and action targets](../playout-ograf-controls/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 37 | E3.1 | [Foreign OGraf packages in the normal library and rundown](../playout-ograf-rundown/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 38 | E3.2 | [Foreign OGraf packages in the normal library and rundown](../playout-ograf-rundown/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |
| 39 | E8.1 | [Final expanded production acceptance](../playout-expanded-acceptance/spec.md) | Exact AC subset and environment in child phase table; contract/software first |
| 40 | E8.2 | [Final expanded production acceptance](../playout-expanded-acceptance/spec.md) | Exact AC subset and environment in child phase table; child completion, including required local receipts |

A child phase can satisfy only its stated subset; passing H0.1 or E1.1 is not a pass for the
whole child. Baseline 14 closes the baseline; E8.2 closes the entire programme. Runtime evidence
may be gathered earlier on a suitable candidate, but must pass dependency/revision review at
its formal phase. No parallel writer owns the same page, model, relay or output seam. Q keeps
its existing separately coordinated qualification path. Missing hardware pauses its dependent
phase; it does not authorize substituting simulated evidence or silently reordering the ledger.

## Integration decisions and compatibility

- **Data acquisition:** E4 normalizes typed source JSON and owns reader/revision/failure policy;
  E5 transforms it with bounded recipes; the final target adapter converts to native strings or,
  after E1, typed foreign fields. Use the existing production tree/API and one source registry.
  Do not introduce a second command log or live-data store. No source can Take/advance/clear.
- **Live selection:** E7 adds a versioned cue-owned entity selector over a shared collection
  recipe. The aired instance captures the selector; preview is independent. Unknown B never
  borrows A's values. This is declared product work, not a hidden change to legacy binding rules.
- **Native controls:** E6 uses native declared capabilities and the shared dispatcher; it does
  not wait for foreign controls. E1/E2 then provide the typed foreign contract; E8.1 integrates
  and proves the same Companion route for those actions. There is no dependency cycle.
- **Type boundary:** E1 adds explicit foreign typed envelopes while retaining existing native
  wires and source-backed editor authority. Old-client refusal and saved-show compatibility
  tests precede broad foreign support. E3 owns library/package identity and actual rundown use.
- **UI:** keep the current production-page layout; Connect data reveals optional field repair
  underneath the monitors. Reuse ARRANGE, More and pinned controls. Selection, staged edits,
  preview, pending commands and confirmed output are distinct. No general form designer/macros.
- **Qualification:** H0 closes the existing module's delivery and real-device gaps; E6 adds new
  custom actions. Baseline 14 retains final baseline data/human/output checks. E8 repeats only
  affected checks and adds the cross-feature, foreign-action, endurance and expanded human work.

C0–C7 scope has not expanded into a generic API mapper or keyed candidate selector. Their
non-goals apply to that tranche; E4/E5/E7 now own those later phases within this same programme.
The OGraf full-stack A/E/F work is realized by E1/E2/E3 here, not implemented a second time by a
competing roadmap. Full Server API/native SDI/NDI, a form designer, private Sheets OAuth, licensed
sports feeds, Excel/local-file providers (#1507), SVG/action import redesign and Bridge packaging
changes remain outside the selected run. Their existing roadmap/issues remain authoritative.

## File ownership and implementable boundaries

Each child names inspected source seams and planned files. Before a phase, resolve any rename
introduced by baseline refactoring against current main and record an exact touched-file fence
in the existing phase receipt; this is a mapping of ownership, not permission to widen scope.
Production behavior belongs in `src/control/` and pure models; components expose orchestration
and presentation. E4 and E6 may extend their existing backend validation boundary, with additive
migrations under the repository's rules. All extension changes are product changes with their
own regressions, separate from baseline extraction commits.

Before a contract-changing phase lands: record old/new wire and persisted examples, version and
unsupported-client behavior, caller inventory, publication/restore path, compatibility tests and
rollback. Prefer additive discriminated versions; keep credentials outside shows/packages. Existing
native shows and exported graphics must still load and operate. Never stringify unknown typed
values or reinterpret an unsupported recipe as a legacy binding. No destructive migration is
implied by this plan. A necessary scope/authority change follows the parent's existing stop rule.

## Evidence and run routing

Follow the **current landed** `.agent-workflows/plan-run.md`, continuing-project runbook,
`verify.md` and `queue-merge` procedures. They own native worker launch/independent checks,
finite project authorization, bounded blocks, supervisor admission, cancellation, retry limits
and recovery. Do not hard-code a provider launcher from an old spec or create another scheduler.
No arbitrary 24-hour project ceiling; no promised unattended cloud takeover without fencing and
wake qualification. Dates without a timezone use Europe/Helsinki under the current runner;
record an explicit-offset project deadline when the owner starts execution.

For every phase, the existing phase receipt records candidate/landing SHA, AC-by-AC status,
commands and run URLs, environment, package/provider/output versions, screenshots or renderer
payloads where relevant, limitations, rollback and next-phase ownership. `work.json` remains an
acceptance ledger with an honest null review until criteria are actually assessed. A spec hash
or successful worker is not product acceptance. Child paths and AC subsets must be listed in the
existing project record at start; this document does not create a second execution ledger.

Cloud: pure models, transformations, protocol/security/compatibility tests, generated-panel
browser walks, qualified hosted API/Sheets/feed/YouTube tests, package/export and isolated-host
checks. Local: owner Windows performance baselines, private connector endpoints, Companion
installation and physical deck, actual CasparCG/Bridge and OBS/browser, newcomer trials.
Foreign controller software may run in cloud if its required environment is qualified. No
cloud screenshot substitutes for a target-system output receipt. Do not spend a repair retry on
missing hardware or denied provider access; record a blocked prerequisite under current policy.

Use the current targeted Node/browser selections for each touched seam; planned new tests in
children become real tests only when those features are implemented. Run module-specific checks
for Companion separately. Required full suites stay in Actions; no CI measurement/budget rewrite.
Before manual verification dispatch, use the landed existing-run lookup. Reuse only applicable
exact-revision/configuration evidence; changed code/fixtures/provider/configuration invalidates
the affected evidence. Reconcile queued/running work instead of dispatching duplicate checks.

## Release, failure and completion

The parent release/stop rules apply: each implementation phase can deploy when normally landed;
this is not an isolated months-long release branch. New capabilities must remain disabled or
explicitly unavailable until their prerequisites are ready. Preserve last qualified values and
manual operation. Do not take a package on air merely to test a migration on a real show.
Each child's rollback disables its new capability or restores the prior qualified version,
retaining source/package data and refusing unsafe old-client edits. Never retry an uncertain
non-idempotent action automatically or clear unrelated live layers as recovery.

A controlled authenticated replay provider is required for E4/E7/E8. Official Finnish/Yle feed
access, licence/delivery arrangement, schema and rate/freshness expectations remain unverified.
They are a separate real-election qualification gate: the software/replay programme can finish
with that limitation explicit, but cannot claim to be approved for election-day feed operation.
Actual CasparCG/Bridge, OBS and physical Companion are mandatory programme acceptance, not options.

The final report compares real task capability, not vendor feature counts: where values originate,
what each action affects, and what output is actually confirmed. An accepted baseline is useful
while extensions remain open; only all required criteria through E8.2 complete the expanded run.
