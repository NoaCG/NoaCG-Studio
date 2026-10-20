# E1 — Typed OGraf data and action contracts end to end

Status: agreed planning scope, 19 October 2026; implementation and acceptance unstarted.
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

After E6.2 in the programme; does not block the native connector/election path. Implements the
relevant A/E portions of [OGraf full stack](../../OGRAF_FULL_STACK_PLAN.md), not a second roadmap.
Pin one matching EBU prose/schema/TypeScript revision before edits. Starting reference is the
full-stack plan's `c821671195a077be13bbb96989d4220eea157b99`; record any selected newer revision
and compatibility differences explicitly. Never combine definitions from different revisions.

Owned seams: `src/control/ografContract.ts`, `controlModel.ts`, `src/export/targets/ografSchema.ts`,
`ografImport.ts`, `src/model/types.ts`, `shows.ts`, command validation/persistence,
`src/control/ografHost.ts`, `src/output/foreignOgraf.ts` and existing output recovery adapters.
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
| E1.1 | Pin standard; descriptors, validation, versioned persistence and compatibility design; AC-1/3/4 model portions | Cloud: extend OGraf contract/schema and show-fixture Node tests; exact field/action fixture hashes and migration round trips. |
| E1.2 | Wire, source adapter, command log/recovery and renderer typed round trip; AC-1–4 | Cloud: new `e2e/configured/ograf-typed-data.spec.ts`, actual browser host payload/render evidence, native output regressions. Target CasparCG/OBS qualification follows E3/E8. |

Stop if the schema cannot be represented faithfully or the existing native wire would require
an unreviewed blanket migration. Report a bounded unsupported subset; do not call generic typed
support complete until all required core fixtures pass.
