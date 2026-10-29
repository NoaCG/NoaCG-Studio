# E1 — Typed OGraf data and action contracts end to end

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

E1.1 after E7.2b and before E6.1, whose argument types follow it; E1.2a and E1.2b after E6.1
(owner, 2026-10-20). Does not block the native connector/election path. Implements the
relevant A/E portions of [OGraf full stack](../../OGRAF_FULL_STACK_PLAN.md), not a second roadmap.
Pin one matching EBU prose/schema/TypeScript revision before edits. Starting reference is the
full-stack plan's `c821671195a077be13bbb96989d4220eea157b99`; record any selected newer revision
and compatibility differences explicitly. Never combine definitions from different revisions.

Owned seams: `src/control/ografContract.ts`, `controlModel.ts`, `src/export/targets/ografSchema.ts`,
`ografImport.ts`, `src/model/types.ts`, `shows.ts`, command validation/persistence,
`src/control/ografHost.ts`, `src/output/foreignOgraf.ts`, existing output recovery adapters, and
the typed foreign target adapter in `src/control/sourceMapping.ts` (E1.2a: E5's typed values reach
a foreign field in E1's envelope, never as E5's strings).
Respect the source-backed editor/native model. Do not convert all native fields or SPX wires to
JSON, introduce a second scene or redesign authoring.

## Contract

Retain JSON types through imported schema, defaults, saved cue values, binding adapter, command
payload, output replay/baseline and renderer call. Use an explicit versioned/discriminated
foreign value/action envelope; preserve the legacy native string branch. No inference from a
string that happens to look like a number/boolean/JSON object. E4/E5 already keep upstream JSON.

Supported core: strings, finite numbers/integers, booleans, typed enums, nested objects and
arrays, required/default values, declared constraints, and complete custom-action argument
schemas. Preserve null/missing distinction when allowed. Keep asset/URI identity separate from
image widgets. Unknown schema keywords/features generate path-specific capability notes; do
not offer a plausible widget or quietly strip a field. Existing native constraints remain intact.

Version stored foreign data and command capability negotiation additively. An old client/renderer
must refuse unsupported new envelopes, not stringify them. Migration fixtures cover existing
native and foreign saved shows. Keep opaque original package/schema bytes for repair and export.
The typed foreign value travels in this spec's own discriminated envelope, never through E5's
`sourceMapping.ts` string output.

**Read gate first (2026-10-20).** E1.1 lands only the reading side: pages and outputs recognize the
envelope; one that meets an envelope version it does not support shows the cue read-only, refuses
to send or render it with a visible reason and preserves the bytes (precedent `readShowProfile`
in `src/model/profile.ts`, enforced at both write doors in `src/model/shows.ts`). The output's
reader reaches outputs through Vite's `es2017` build target (`vite.config.ts`), which CasparCG 2.3's
Chromium 71 can parse, with runtime APIs shimmed in `output.html`; its test checks the built
output bundle, and a reader module shared with Node uses no DOM. Only E1.2a, a later deploy, writes envelopes, and it
sends one only to an output whose seen report advertises the E1.1 reader; any other output gets
a "reload this output" refusal instead of a stringified value.

## Acceptance

### AC-1: Schema/value preservation has a pinned authority
Fixture schema/prose/types share the recorded EBU revision. Nested values, boolean/numeric enums,
defaults, required values, null/missing and typed action arguments validate correctly. Unsupported
features report exact paths and reasons. No supposed one-level object support is assumed.

### AC-2: Types survive persistence, binding and actual renderer dispatch
Save/reload a foreign cue, connect E5 typed values, publish, Update, reconnect and restore an
output baseline. Capture payloads at the renderer and rendered values: types and argument shapes
match the schema on every route. Invalid data fails before dispatch without corrupting last good.

### AC-3: Native compatibility and mixed-version behavior are explicit
Existing native fields, exported SPX/OGraf packages, legacy `/patch` and `/update`, command-log
replay and known hardware verbs retain semantics. Older unsupported foreign clients fail visibly
without rewriting persisted data. A reader cannot mistake the new envelope for ordinary fields.

### AC-4: Migration and rollback do not lose source or live state
Round-trip saved/imported fixtures through the new version. Disabling typed foreign editing
preserves original package and values; an older deployment refuses those cues safely. Keep an
export/backup and deterministic migration receipt; no destructive down-migration during a show.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E1.1 | Pin the standard; descriptors, validation, versioned persistence and the read gate. AC subset: AC-1 in full; AC-3's model and read-gate parts (native fields, exported packages and legacy `/patch`/`/update` fixtures unchanged; an unsupported envelope refused read-only by pages and the Chromium 71 output reader; no reader mistakes it for ordinary fields); AC-4's model parts (migration round trips of saved and imported fixtures, typed editing disabled without losing package or values, deterministic migration receipt) | Cloud: extend OGraf contract/schema and show-fixture Node tests; exact field/action fixture hashes and migration round trips; the output reader's test against the built `es2017` output bundle. |
| E1.2a | The writer: persistence, E5 typed values through the source adapter, command payload, publish, Update and command log with output capability negotiation. AC subset: AC-2's persistence/binding/command-log part; AC-3's wire and hardware-verb part; AC-4's runtime part | Cloud: new `e2e/configured/ograf-typed-data.spec.ts` (save/reload, connect, publish, Update, reconnect) and native output regressions. |
| E1.2b | Output replay, baseline and the renderer typed round trip. AC subset: AC-2's output replay/baseline/renderer part; AC-3's mixed-version output part | Cloud: actual browser host payload and render evidence, output recovery tests, an old-reader output refusing visibly. Target CasparCG/OBS qualification follows E3 and S. |

Stop if the schema cannot be represented faithfully or the existing native wire would require
an unreviewed blanket migration. Report a bounded unsupported subset; do not call generic typed
support complete until all required core fixtures pass.
