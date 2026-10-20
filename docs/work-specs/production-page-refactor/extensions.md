# Production-page programme: extension contract and exact execution order

Authority: owner, 19 October 2026, “Yes, please turn the selected extensions into precise
executable specs and reconcile the complete plan with current main.” Planning scope is agreed;
this does not authorize implementation, a run, deployment or completed acceptance.
Main reconciliation: `4e067b65674a9bf0a7632430b5dd0772c03a0331`; revised for the owner's
2026-10-20 decisions against `331a98a91` ([receipt](evidence/owner-decisions-2026-10-20.md)).

This document is part of the [parent specification](spec.md). It owns integration of H0 and
E1–E8. Each linked child owns its detailed contract and ACs. The baseline steps and Q's records
retain their requirements and refactor fences. There are **31 named work packages** (22 baseline
+ nine extensions), expanded below into **47 execution phases** so each fits one builder session
and contract, implementation and real-device acceptance have explicit boundaries. The extra
phases are not extra product scope. Friday 23 October is a progress checkpoint, never a
completion deadline.

## Exact phase admission

Use the table below when preparing the existing continuing-project manifest. Keep stable IDs,
full spec path, the **gating** ACs and the one environment in each phase record and worker
brief. Each child's sibling `work.json` is its acceptance record; include it in the existing
project/worker SPEC references. List all nine children as well as the parent/data/Sheet/audience
records in final acceptance. Baseline parent IDs stay `1`, `2+7`, `13a`, etc.; C IDs refer to
data-sources; H/E decimal suffixes are child phases; `S` is the parent's studio phase.

There is one sequential admission path; every row depends on the preceding row's PASS. Gating
criteria are only those an agent verifies (owner, 2026-10-20, A): environment **CA** means a
qualified Claude cloud worker plus GitHub Actions. The final owner block (rows 46-47, environment
**OW**: the owner's Windows laptop, the physical Stream Deck and the real studio) is the only part
that waits for the owner. "Laptop" entries are non-gating checks the laptop helper runs on that
phase's merge SHA (parent §9.1); "kit" entries are trial kits on the owner list (D); "Q"
entries are Q records that must be on `main` before that phase is built (data-sources Q).

| # | Phase | Authority | Gating acceptance | Env | Non-gating |
| --- | --- | --- | --- | --- | --- |
| 1 | C0 | [data-sources](../data-sources/spec.md) | data AC-10 structural half, AC-15; audience AC-1/2/3/6/8 paste half; C0 matrix row | CA | - |
| 2 | H0.1 | [Companion qualification](../playout-companion-qualification/spec.md) | H0 AC-1 packaging/guide portion, AC-2, AC-3 (automated, relay and configured) | CA | kit: Companion install and pairing |
| 3 | 1 | [parent](spec.md) | AC-1, AC-15; phase 1 matrix row | CA | laptop: two perf baselines |
| 4 | 2+7 | [parent](spec.md) | AC-3, AC-6, AC-8; phase 2 and 7 matrix rows in full | CA | - |
| 5 | 13a | [parent](spec.md) | AC-2, AC-8; phase 3 row plus `production-data`, `playout-air-contract` | CA | - |
| 6 | C1a | [data-sources](../data-sources/spec.md) | data AC-2, AC-4, AC-12 (fixture test added), AC-13 starter/scalar half; C1a matrix row | CA | - |
| 7 | C1b | [data-sources](../data-sources/spec.md) | data AC-1, AC-3, AC-8, AC-10 inbox half, AC-11, AC-13 mapping half; sheet AC-1 stub, AC-2, AC-5, AC-6, AC-7, AC-8; C1b row | CA | Q: `sheet-latency`, `sheet-endurance` |
| 8 | C1c | [data-sources](../data-sources/spec.md) | data AC-9, AC-13 real-Sheet half; sheet AC-1 real Sheet, AC-3 local program, AC-9; C1c row | CA | - |
| 9 | C2 | [data-sources](../data-sources/spec.md) | data AC-3 published, AC-11, AC-12; sheet AC-3 published, AC-4 to AC-7; tick checks (C2) | CA | Q: `tick-cost-estimate` |
| 10 | C3 | [data-sources](../data-sources/spec.md) | data AC-10, AC-15; sheet AC-11; audience AC-4, AC-8, AC-9 | CA | Q: `youtube` |
| 11 | C4 | [data-sources](../data-sources/spec.md) | data AC-5, AC-6, AC-11 | CA | Q: `feeds` |
| 12 | C5 | [data-sources](../data-sources/spec.md) | data AC-3, AC-7, AC-8 | CA | - |
| 13 | C6 | [data-sources](../data-sources/spec.md) | sheet AC-10; data AC-9, AC-16 status-presentation part | CA | - |
| 14 | C7 | [data-sources](../data-sources/spec.md) | data AC-16 software half; audience AC-5, AC-9; the content trial kit landed | CA | laptop: scratch CasparCG/Bridge + OBS; kit: content |
| 15 | 3 | [parent](spec.md) | AC-2, AC-8 | CA | - |
| 16 | 4 | [parent](spec.md) | AC-2, AC-8 | CA | - |
| 17 | 5 | [parent](spec.md) | AC-2, AC-3, AC-8 | CA | - |
| 18 | 6 | [parent](spec.md) | AC-2, AC-3, AC-6, AC-8 | CA | - |
| 19 | 8 | [parent](spec.md) | AC-2, AC-8 | CA | - |
| 20 | 9 | [parent](spec.md) | AC-2, AC-3, AC-6, AC-8 | CA | - |
| 21 | 10 | [parent](spec.md) | AC-2, AC-3, AC-4 cancellation, AC-8 | CA | - |
| 22 | 11 | [parent](spec.md) | AC-2, AC-3, AC-4 seed/claim/restore, AC-5, AC-6, AC-8, AC-13 | CA | laptop: perf repeat |
| 23 | 12 | [parent](spec.md) | AC-2, AC-3, AC-4 all rows, AC-8 | CA | - |
| 24 | 13b | [parent](spec.md) | AC-2, AC-3, AC-6, AC-7, AC-8, AC-9 render targets | CA | laptop: perf repeat |
| 25 | 14 | [parent](spec.md) | AC-11, AC-12, AC-14 software half (automated rehearsal, data AC-16 reconciliation) | CA | laptop: final perf, scratch outputs |
| 26 | E4.1 | [Trusted JSON acquisition](../playout-external-connectors/spec.md) | E4 AC-1 cloud-worker part; replay server; `endurance.yml` smoke | CA | - |
| 27 | E4.2 | [Trusted JSON acquisition](../playout-external-connectors/spec.md) | E4 AC-1 installed-agent part, AC-2, AC-3, AC-4 | CA | - |
| 28 | E5.1 | [Sample-based API mapping](../playout-api-mapping/spec.md) | E5 AC-2, AC-4 automated | CA | - |
| 29 | E5.2 | [Sample-based API mapping](../playout-api-mapping/spec.md) | E5 AC-1, AC-3, AC-4 | CA | - |
| 30 | E7.1 | [Election graphics and live candidates](../playout-election-package/spec.md) | E7 AC-2, AC-3 (read-only gate and resolver) | CA | - |
| 31 | E7.2a | [Election graphics and live candidates](../playout-election-package/spec.md) | E7 AC-1; the selection writer | CA | - |
| 32 | E7.2b | [Election graphics and live candidates](../playout-election-package/spec.md) | E7 AC-4 software/replay grade | CA | laptop: scratch CasparCG/Bridge + OBS |
| 33 | E1.1 | [Typed OGraf contracts](../playout-ograf-contract/spec.md) | E1 AC-1; AC-3 and AC-4 model and read-gate parts | CA | - |
| 34 | E6.1 | [Declared actions through Companion](../playout-companion-actions/spec.md) | E6 AC-1, AC-2, AC-3 for native actions and typed foreign descriptors | CA | - |
| 35 | E1.2a | [Typed OGraf contracts](../playout-ograf-contract/spec.md) | E1 AC-2 persistence/binding/command-log part; AC-3 wire; AC-4 runtime | CA | - |
| 36 | E1.2b | [Typed OGraf contracts](../playout-ograf-contract/spec.md) | E1 AC-2 output replay/baseline/renderer part; AC-3 mixed-version outputs | CA | - |
| 37 | E2.1 | [Typed OGraf controls](../playout-ograf-controls/spec.md) | E2 AC-1, AC-4 | CA | - |
| 38 | E2.2 | [Typed OGraf controls](../playout-ograf-controls/spec.md) | E2 AC-2, AC-3, AC-4 | CA | - |
| 39 | E3.1 | [Foreign OGraf in the rundown](../playout-ograf-rundown/spec.md) | E3 AC-1 | CA | - |
| 40 | E3.2a | [Foreign OGraf in the rundown](../playout-ograf-rundown/spec.md) | E3 AC-2 in configured output tests | CA | laptop: scratch CasparCG/Bridge + OBS |
| 41 | E3.2b | [Foreign OGraf in the rundown](../playout-ograf-rundown/spec.md) | E3 AC-3 | CA | - |
| 42 | E6.2 | [Declared actions through Companion](../playout-companion-actions/spec.md) | E6 AC-1 to AC-3 through the module, native and foreign | CA | kit: custom and foreign buttons |
| 43 | E8.1a | [Final expanded acceptance](../playout-expanded-acceptance/spec.md) | E8 AC-1 software reconciliation; AC-2 cross-feature cases | CA | - |
| 44 | E8.1b | [Final expanded acceptance](../playout-expanded-acceptance/spec.md) | E8 AC-2 60-minute endurance in `endurance.yml` | CA | - |
| 45 | E8.2 | [Final expanded acceptance](../playout-expanded-acceptance/spec.md) | E8 AC-1 agent evidence complete, AC-4 runbook and capability matrix | CA | kit: E8 AC-3 tasks |
| 46 | H0.2 | [Companion qualification](../playout-companion-qualification/spec.md) | H0 AC-1 owner's guide walk, AC-4; E6 AC-4; the operator's buttons on the deck | OW | - |
| 47 | S | [parent](spec.md) | parent AC-14 real outputs; data AC-16 actual outputs; E3 AC-2, E7 AC-4 and E8 dress rehearsal on the real studio | OW | - |

A child phase can satisfy only its stated subset; passing H0.1 or E1.1 is not a pass for the
whole child. Baseline 14 closes the baseline in software, E8.2 the expanded programme, and the
final owner block both on real hardware. Runtime evidence may be gathered earlier on a suitable
candidate, but must pass dependency/revision review at its formal phase. No parallel writer owns
the same page, model, relay or output seam. The Q worker writes only evidence files, so it runs
beside the ledger. A laptop request or kit never holds a row: a laptop regression becomes a
parent §8 repair, a trial finding an issue. Missing owner hardware holds only H0.2 and S, and
never authorizes substituting simulated evidence there.

## Integration decisions and compatibility

- **Data acquisition:** E4 normalizes typed source JSON and owns reader/revision/failure policy;
  E5 transforms it with bounded recipes; the final target adapter converts to native strings or,
  after E1, typed foreign fields. One shared TypeScript evaluator, `src/control/sourceMapping.ts`
  (created by E4.2, extended by E5.1 and E7.1), evaluates typed JSON, recipes and keyed selectors for the
  browser reader, the C2 server tick and E4's source route alike, and writes its result through
  the existing apply path as the strings and lists that path already understands. SQL keeps
  resolving legacy `Show.bindings`. E1's typed foreign values use their own additive envelope,
  never E5's string adapter. Use the existing production tree/API and one source registry. Do
  not introduce a second command log or live-data store. No source can Take/advance/clear.
- **Live selection:** E7 adds a versioned cue-owned entity selector over a shared collection
  recipe. The aired instance captures the selector; preview is independent. Unknown B never
  borrows A's values. This is declared product work, not a hidden change to legacy binding rules.
- **Read gate before writer:** E1.1 and E7.1 land the read side first: pages and outputs that
  meet a format they do not support refuse it read-only and preserve it (precedent
  `readShowProfile` in `src/model/profile.ts`, enforced at both write doors in
  `src/model/shows.ts`). The writer lands in a later phase and deploy (E1.2a, E7.2a). Output
  readers obey the CasparCG 2.3 Chromium 71 rule of `src/control/payloadVersion.ts`.
- **Native and foreign controls:** E6 owns all Companion actions, native and foreign, through
  the shared dispatcher, so the module's protocol is bumped once and the deck requalified once
  (H0.2). E6.1 runs after E1.1 and types its argument descriptors with E1's model; E6.2 runs after
  E3.2 so foreign actions are invoked on real foreign rundown cues. There is no dependency cycle.
- **Type boundary:** E1 adds explicit foreign typed envelopes while retaining existing native
  wires and source-backed editor authority. Old-client refusal and saved-show compatibility
  tests precede broad foreign support. E3 owns library/package identity and actual rundown use.
- **UI:** keep the current production-page layout; Connect data reveals optional field repair
  underneath the monitors. Reuse ARRANGE, More and pinned controls. Selection, staged edits,
  preview, pending commands and confirmed output are distinct. No general form designer/macros.
- **Qualification:** H0 closes the existing module's delivery and real-device gaps; E6 adds
  custom and foreign actions. Baseline 14 retains the final baseline data checks in software; S
  the real outputs. E8 repeats only affected checks and adds the cross-feature and endurance work.

C0–C7 scope has not expanded into a generic API mapper or keyed candidate selector. Their
non-goals apply to that tranche; E4/E5/E7 now own those later phases within this same programme.
The OGraf full-stack A/E/F work is realized by E1/E2/E3 here, not implemented a second time by a
competing roadmap. Full Server API/native SDI/NDI, a form designer, private Sheets OAuth, licensed
sports feeds, Excel/local-file providers (#1507), SVG/action import redesign, Bridge packaging
changes and the independent-controller portability check (#1531, formerly E3 AC-4) remain
outside the selected run. Their existing roadmap/issues remain authoritative.

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
A limit (a cap, budget or fixture size) may change when the plan's goal needs it, reviewed with
its reason recorded in the pull request; a repair never loosens a check to hide a real failure.

## Evidence and run routing

Follow the **current landed** `.agent-workflows/plan-run.md`, continuing-project runbook,
`verify.md` and `queue-merge` procedures. They own native worker launch/independent checks,
finite project authorization, bounded blocks, supervisor admission, cancellation, retry limits
and recovery. Do not hard-code a provider launcher from an old spec or create another scheduler.
No arbitrary 24-hour project ceiling. The coordinator's home is one Claude cloud session; any
new session continues the same project by typing the same `/plan-run` line (parent §10). Dates without a timezone
use Europe/Helsinki under the current runner; record an explicit-offset project deadline when
the owner starts execution.

For every phase, the existing phase receipt records candidate/landing SHA, AC-by-AC status,
commands and run URLs, environment, package/provider/output versions, screenshots or renderer
payloads where relevant, limitations, rollback and next-phase ownership. `work.json` remains an
acceptance ledger with an honest null review until criteria are actually assessed. A spec hash
or successful worker is not product acceptance. Child paths and AC subsets must be listed in the
existing project record at start; this document does not create a second execution ledger.

Cloud (gating): pure models, transformations, protocol/security/compatibility tests,
generated-panel browser walks, Q's hosted Sheets/feed/YouTube records, package/export and
isolated-host checks, the installed headless agent, the replay server and the endurance workflow.
Laptop helper (non-gating, parent §9.1): Windows performance baselines and repeats, scratch CasparCG/
Bridge and OBS/browser walks. Owner (final block only): the physical deck and the real studio;
human trials run from their kits whenever the owner can. No cloud screenshot substitutes for a
target-system receipt in S. Do not spend a repair retry on missing hardware or denied provider
access; record a blocked prerequisite under current policy and notify.

Use the current targeted Node/browser selections for each touched seam; planned new tests in
children become real tests only when those features are implemented. Run module-specific checks
for Companion separately. Required full suites stay in Actions; no CI measurement/budget rewrite.
E8's endurance runs in its own manual-dispatch workflow (`endurance.yml`), which is not a
required check. Before manual verification dispatch, use the landed existing-run lookup. Reuse
only applicable exact-revision/configuration evidence; changed code/fixtures/provider/
configuration invalidates the affected evidence. Reconcile queued/running work instead of
dispatching duplicate checks.

## Release, failure and completion

The parent release/stop rules apply: each implementation phase can deploy when normally landed;
this is not an isolated months-long release branch. New capabilities must remain disabled or
explicitly unavailable until their prerequisites are ready. Preserve last qualified values and
manual operation. Do not take a package on air merely to test a migration on a real show.
Each child's rollback disables its new capability or restores the prior qualified version,
retaining source/package data and refusing unsafe old-client edits. Never retry an uncertain
non-idempotent action automatically or clear unrelated live layers as recovery.

E4/E7/E8 use an authenticated election replay server we build (E4.1,
`scripts/election-replay-server.mjs`): bearer-authenticated HTTPS serving the recorded fixtures
on a controllable timeline, run beside the trusted agent on the cloud worker, in the Actions job
or on the laptop, never as a Vercel function. Official Finnish/Yle feed access, licence/delivery
arrangement, schema and rate/freshness expectations remain unverified. They are a separate
real-election qualification gate: the software/replay programme can finish with that limitation
explicit, but cannot claim to be approved for election-day feed operation. Actual CasparCG/Bridge,
OBS and a physical Stream Deck are mandatory programme acceptance in the final owner block, not
options.

The final report compares real task capability, not vendor feature counts: where values originate,
what each action affects, and what output is actually confirmed. An accepted baseline is useful
while extensions remain open; only all 47 phases, through S, complete the expanded run.
