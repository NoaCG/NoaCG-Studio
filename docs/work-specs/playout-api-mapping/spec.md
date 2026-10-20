# E5 — Sample-based API mapping in Connect data

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

After E4.2. Extend the existing whole-graphic Connect flow beneath the monitors, reusing the
production source registry and C1/C5 field matching. No new mandatory tab or per-field button
clutter. Source choice is independent of Fill versus Connect. A configured source can provide
both cue snapshots and live graphic values. Auth setup belongs to E4's trusted adapter.

Owned seams: recipes in `src/control/sourceMapping.ts` (the one shared evaluator; E4, "One
shared evaluator"), source configuration/types, the `productionDataSession` writer adapter and the extracted
cue-editor connection components.
Native list adapters for ticker, schedule, standings and credits remain canonical. E1 later
adds a typed foreign destination; E5 must not embed SPX string conversion in source transforms.
No JavaScript, expression evaluator, general JSONPath language, scraping engine or writeback.

## Mapping contract and operator journey

Connect data → existing source or generic JSON endpoint configuration → Read sample → readable
labels/values → scalar or collection → columns/record key → rendered preview and affected cues
→ Connect. Tree browsing may be available in Advanced; ordinary operation requires no path syntax.
A sample never applies to program. Cancel leaves binding/source configuration unchanged.
Read sample for an authenticated endpoint goes through E4's trusted agent: the browser asks, the
registered agent fetches one sample with its own credential and posts it to `/api/data/source`
with `op: "sample"`, stored for preview and never applied; the browser never holds the endpoint
credential. A public endpoint's sample uses the hosted fetcher with C4's defenses.

Persist a versioned declarative recipe (`v: 1`, in `Show.sources[].config.mapping`, additive
optional, persisted by C2's `sources` column; no migration) referencing source ID, schema/config
revision, stable field IDs and selected paths. A client that meets a higher recipe `v` keeps the
recipe and the last values read-only and evaluates nothing (precedent `readShowProfile`);
`scripts/show-fixture-compat.test.mjs` gains a pre-E5 show and a `v: 2` recipe. V1 operations: select/project columns; filter by one equality
predicate; stable ascending/descending sort with an explicit tie-break ID; limit rows; format
finite numbers and dates with explicit locale/timezone; fallback for missing/null values when
destination permits it. Zero, false and empty string are values, not missing. Fallback never
hides authentication/transport failure or manufactures a record for an unknown entity key.
No unbounded chains or arbitrary operators. Validate before the target adapter. A typed schema
and sample fingerprint detect incompatible changes; preview repair before switching recipe.

Collection identity declaration is reusable by E7. Recipe and collection are shared per graphic;
E7's per-cue selector is a separate consumer argument, not a rewrite of all shared bindings.
Fill copies resolved values into an ordinary cue and detaches them from subsequent changes.
Native adapters still emit their established strings; object/array JSON remains typed upstream.

## Acceptance

### AC-1: A beginner connects and reuses data without path syntax
Using a supplied nested sample, connect two graphics from one source with matching stable keys;
inspect matches, sample, rendered output and consumers. Repair one mismatch; cancel another.
No unintended binding or program change. Downloaded starter data still matches the graphic.
Fill a cue from the same source, then change the source: the cue snapshot stays unchanged.

### AC-2: Transformations are bounded, typed and deterministic
Fixtures cover each supported operation, duplicate keys, stable sorting ties, zero/false/empty,
missing/null, invalid date/number, locale/timezone and a reordered collection. Output passes the
destination schema before dispatch; no silent string coercion of typed values upstream.
Invalid recipe or payload holds last good and offers correction, never a valid-empty disguise.
A genuinely empty list clears the native list through the existing adapter contract.

### AC-3: Save/reload and repair preserve ownership
Save, publish, reload and reconnect without losing recipe, source, stable field keys or affected
consumers. A changed schema marks the mapping for repair, leaves valid prior program data intact
and does not silently retarget fields. Replacing a recipe is explicit and revision-fenced.
Sheet override/Resume, API Pause and read-only connected lists keep their established semantics.

### AC-4: No alternate show-control or credential path is introduced
Source changes never Take, advance, clear or reset graphic behavior. Export includes non-secret
recipes and values only; an imported show needs explicit source rebind. Unsupported recipe
versions are disabled with retained values, not partially evaluated. Data provenance names the
source and mapping; no credentials appear in the page or package.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E5.1 | Versioned recipe/evaluator and target-adapter boundary; AC-2, automated AC-4 | Cloud: new `scripts/source-mapping.test.mjs`, existing native content-format and production-data fixtures. Bounds and rejection cases are behavioral tests, not implementation mirrors. |
| E5.2 | Connect/sample/repair/reuse UI and persistence; AC-1/3/4 | Cloud browser: new `e2e/production-api-mapping.spec.ts`, affected configured publication test, the agent-routed authenticated sample. The unaided operator task joins E8's trial kit (owner, 2026-10-20: a kit, never a gate). |

Rollback: disable only the new recipe version, preserve last validated values and ordinary Fill,
manual entry and C1/C5 connections. Do not erase source configuration or migrate all legacy paths.
