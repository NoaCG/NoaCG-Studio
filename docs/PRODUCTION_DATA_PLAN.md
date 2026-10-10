# Production Data - plan

A production holds a **tree of live values** that its graphics read from, so an external system
says *"the home score is 4"* and never *"sb03 is on air"*.

**Status (2026-08-19):**

- **Phase 1 SHIPPED** - the manual playground, the binding model, the diff, and the
  Take/Update/preview overlay. Local, no API, no credentials. Detail: **§12**.
- **Phase 2 SHIPPED and APPLIED** - migration `0048` is pushed to the linked project, and
  `PATCH /api/data/patch` + `GET /api/data/state` are live on the existing catch-all. Authoring
  detail is **§13**; what applying it proved, and the live walk, is **§14**.
- **Phase 3, the stepper half, SHIPPED 2026-09-16** - a ± press and an event's `adjust` on a bound
  field move the shared value on both dashboards (§2.9, migration 0060). The rest of Phase 3 - bind
  all by title, and `liveData.ts`'s retirement - is still open (§14's "still open").

Read `docs/CLOUD_PLAYOUT.md` (§7 is the ingress doctrine), `docs/DATA_API.md` (the shipped
first slice) and `docs/INTERACTIVE_PLAYOUT_PLAN.md` D3/D5 first - this plan is a thin layer
over all three, not a fourth data system.

---

## 1. Current-state assessment

### What already exists

| Piece | Where | What it is |
|---|---|---|
| **`ShowDataset`** | `model/shows.ts`, `components/home/ProductionDataWorkspace.tsx` | Production-scoped **tables** (columns with operator labels, rows of strings), additive-optional on `Show`, edited at `#/production/<id>/data`. Bound to fields by WORDS (`datasetValuesForFields`: column label = field title). Loaded into a cue's DRAFT by deliberate operator action. Explicitly **"never a live wire"** (D3). |
| **Production Data API** | `api/data/[...path].ts`, `api/_lib/dataIngest.ts`, migration 0047 | `POST /api/data/update` - per-production `data_key`, labels mapped to `fN` server-side, written as ordinary `update` rows through `control_data_send`. **Graphic-addressed** (`graphic:` or `cue:` names the target). |
| **The command log** | `control_events`, `control/hostedControl.ts` | The durable, DB-ordered transport. Realtime nudge + `control_tail` gap-fill + `control_report` snapshots with per-graphic baselines. The renderer applies rows in order, whoever wrote them. |
| **The local path** | `ProductionPage.runVerb` | Unpublished, verbs drive the local ProgramStage directly. This is what makes the whole surface work offline, with no account. |
| **Contextual controls** | `productionControllerHtml.ts` ~l.620, the two React surfaces | A `-`/`+` press on a **number field of the on-air cue** sends a PARTIAL `update` straight to program (`docs/PLAYOUT_DASHBOARD.md` §7c). Per graphic, per field. |
| **`liveData.ts`** | `control/liveData.ts` | A published-CSV poller **injected into the template's own JS**. Already declared superseded by server-side connectors and "not extended" (CLOUD_PLAYOUT §7). |
| **The audience plane** | `audience/` | Deliberately has **no** method reaching the command log. Not a data source; not touched by this plan. |
| **`prvar`** | `model/types.ts:177` | SPX's own "project variable shared across templates". Parsed and serialized, otherwise inert. |

### Are we accidentally already implementing this?

**Yes - twice, in two incompatible shapes, and neither is what was asked for.**

- `ShowDataset` is **production-scoped but not live**: a bank of authored rows an operator picks
  from.
- The Data API is **live but graphic-scoped**: the caller must name the graphic or a cue.

The middle - *production-scoped **and** live* - is exactly the hole. This plan fills it, and
does not add a third vocabulary.

### The criticism worth stating up front

**The shipped Data API already violates the principle in the brief.** `docs/DATA_API.md` sells
graphic addressing as a feature ("addressing by cue label"), which forces a scoreboard to know
the production's rundown. That is the coupling the brief wants removed. The fix is not to delete
it - it is a legitimate direct-write escape hatch and it works today - but production data
becomes **the primary address**, and `/update` is documented as the low-level path.

### The second thing inspection changed

`Show` is synced **record-level LWW with conflict copies** (D3's named limit, and a conflict copy
drops the production's slugs). Writing live values into the `Show` record on every score bump
would bump `updatedAt` at feed rate and push a doc sync per tick - a reliable way to mint a
conflict copy and un-publish a live production. **Live data must not live in the synced show
document.** §5 splits seed from live state for exactly this reason.

---

## 2. Recommended architecture

### 2.1 Two values, not one

| | **Seed** | **Live tree** |
|---|---|---|
| What | what this production *starts from* | what is true *right now* |
| Where | `Show.data` (additive-optional, synced) | a local durable key, per show id; **and** `control_shows.data` once published |
| Written by | the author, deliberately | operators, contextual controls, the ingress API |
| Travels with | duplicate, export, cloud sync | nothing - it is runtime state |

`Reset` = live := seed. `Clear` = live := `{}`. This mirrors the house doctrine already in
`fieldDescriptors` (`defaultValue` is the per-field Reset target) and "reset is two operations".

### 2.2 Representation

Plain JSON. `string | number | boolean | null | object | array`, nested freely. **No schema, no
declared types, no validation layer** - the brief's instinct is right and the codebase gives no
reason to overrule it. The only typing that exists is the formatting rule at the binding
boundary (§2.4), which is where a type actually has consequences.

Path syntax: dot segments with numeric indices - `match.home.score`, `drivers.0.gap`. One
grammar, no bracket alternative.

### 2.3 Binding: on the production, resolved by the sender

**Reject** `productionData.match.home.score` inside template code. SPX has no such object, so an
exported graphic would stop working the moment it left the studio - that breaks the
"export anywhere, plug-and-play" pillar and adds the parallel rendering architecture the brief
warns against.

**Recommended:** a binding is production state that resolves to ordinary `update()` field values
before anything is sent. The graphic stays a dumb SPX template with `fN` fields; the renderer
learns nothing new.

```
production data  --(bindings)-->  { f1: "4" }  -->  the same `update` row  -->  the same log
```

Stored on the Show, keyed by pool-graphic name then field id:

```ts
/** graphic name -> field id -> production-data path. */
bindings?: Record<string, Record<string, string>>;
```

On `Show` rather than on `SavedGraphic` because a saved graphic is a library record shared with
other productions, and the binding is production-scoped.

**Default, then confirm.** When a graphic is added, each data-carrying field is offered a path
whose last segment matches its title case- and separator-insensitively (`Score A` -> a leaf
`scoreA`). Exactly one match auto-binds; **two matches bind nothing and are reported**, the same
never-guess doctrine as the API's `ambiguous`. Everything is visible and editable in one table.

This is a small explicit mapping surface, which D3 avoided for datasets. It is justified here:
paths are nested and field titles are flat, so the words cannot carry the binding on their own.
The datasets' label rule stays exactly as it is.

### 2.4 Formatting at the boundary

SPX field values are strings. One rule set, applied when a path resolves:

| Value | Becomes |
|---|---|
| string | itself |
| number, boolean | `String(v)` |
| array of scalars | joined with a newline (this is what a `lines`/textarea field wants - a ticker binds to `headlines`) |
| object, array of objects | **not bindable** - bind a deeper path (`drivers.0.name`) |
| missing path | **nothing is written** (§2.6) |

Number formatting (thousands separators, decimals, numerals) stays in the template, where it
already lives. The boundary does not format; it stringifies.

### 2.5 Update model: JSON Merge Patch, absolute values only

One write verb: a **deep merge** with RFC 7386 semantics - `null` deletes a key, arrays replace
wholesale. `match.home.score = 4` is simply the patch `{"match":{"home":{"score":4}}}`, so the
UI's `+1` button, a contextual control and an external POST all speak one language.

**The wire carries absolute values only.** No `+1` on the wire, ever. An increment is a UI
affordance that reads the current value and writes the absolute result - which is exactly what
today's stepper already does. This removes a whole class of concurrent-increment semantics for
free.

Whole-object replacement is a later `PUT`, not needed for Phase 1.

### 2.6 Propagation: resolve at the sender, ride the existing log

1. A patch is merged into the live tree.
2. Bindings are resolved, and the result is **diffed against the last resolved values**.
3. Only fields whose string value **changed** are sent, grouped per graphic, as ordinary
   `update` rows - one row per affected graphic.

Nothing new crosses the wire. Unpublished, this is `runVerb`'s local branch. Published, it is
`sendHostedControlBatch`. Both already exist.

**No new transport.** No WebSockets, no SSE, no polling, no second Realtime channel. The log's
existing Realtime nudge plus `control_tail` gap-fill and `control_report` recovery apply
unchanged, including the renderer-reboot case.

**Graphics that are not live still receive updates.** The output stage preloads every published
graphic, and a hidden graphic's `update()` is harmless. So a bound graphic is already correct
when it is taken - no fill-on-take machinery, no "stale on air" window. The diff in step 3 is
what keeps that affordable.

### 2.7 Bound fields vs cue values - the rule that prevents the worst trap

If a cue carried a value for a bound field, taking that cue after a data update would re-air the
stale prepared value. So:

> **A bound field is not a cue value.** Cues carry unbound fields only. Bound fields come from
> production data, always.

In the cue editor a bound field renders read-only with a link chip, its path, and the current
live value. To override, the operator **unbinds** - one deliberate, visible act. Typing directly
into a live field still works and still wins until the next data write, because later log rows
win; that is the existing doctrine and it is left alone.

### 2.8 Relationship to Data Hub, connectors, PUSH and PULL

The existing boundary is already right and this plan does not move it:

- **PUSH** = an external system patches production data. That is this plan.
- **PULL** = a connector process fetches from a provider and pushes. `scripts/weather-feed.mjs`
  is already exactly that, and it stays outside the app. **No in-app pollers.**
- **`ShowDataset` stays what it is**: a bank of authored rows for deliberate load. It answers a
  different question (many candidate rows) from production data (one current truth). Same tab,
  two panels, no merge.
- **`liveData.ts` is the actual second-system risk** - a CSV poller living inside template code,
  outside the log, invisible to the operator. Recommendation: freeze it now, and schedule its
  retirement once production data ships. Do not extend it.

### 2.9 Contextual controls - agree with the direction, disagree with the timing

`Home +1` **should** ultimately be `patch match.home.score = <current+1>`, and then contextual
controls, the Data workspace and the external API all move one state.

But converting the shipped stepper in Phase 1 is the wrong trade. Today it writes one field on one
on-air cue; on production data it would move every bound graphic. That is a behaviour change to a
verified surface across **three** renderers (two React, one vanilla in
`productionControllerHtml.ts`) in service of an abstraction that has not yet proven itself live.

**Phase 1:** data-scoped steppers live in the Data panel. The field-scoped stepper stays for
unbound fields, unchanged. **Converge in Phase 3**, once bindings have run a real show.

> **CONVERGED 2026-09-16** (`38277938`), which is the half of Phase 3 this section owns. On both
> dashboards a ± press and an event's `adjust` on a bound field move the shared value; an unbound
> field keeps the field stepper; the exported controller, which carries no tree, is untouched.
> Row 10 of `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5 - bind all by title - is still open.

**What converging actually needed, beyond the branch in the two press handlers.**

- **The press boundary is a rule of its own, and it is the inverse of §2.4.** A press computes a
  STRING, because that is what a field holds; the tree is JSON. `retypeLeaf` reads the string back
  into the type the leaf already had, so an operator's bump cannot turn a feed's number into a
  string or a `lines` array into one joined line. Guessing the type from the TEXT - which is what
  `reparseLeaf` does for a value box, correctly - would make a jersey number `07` become 7.
- **A binding may name an array element, and merge-patch cannot address one.** `patchForPath`
  answers null for `drivers.0.gap` by design (§2.5), so a press building its patch that way would
  silently do nothing on a legitimate binding. `withTreeWrites` walks the tree with `setPath` and
  lets `replacementPatch` say the difference; an indexed binding costs a whole-array patch, which
  is the RFC's limit and not a bug in the press.
- **A bound field leaves the field road entirely.** It is off the event's payload, out of the cue
  mirror and out of the hosted staging buffer - §2.7 with nowhere left to leak. A control whose
  every moved field is bound fires BARE, and its figures arrive as the tree's own update rows.
- **The two budgets were conflated and are not any more.** `control_data_patch` marks its rows
  `src:'api'` and charges them to the 25-per-5-s ingest cap, whose whole purpose is that the
  operator keeps the rest. An operator's press charged to it would let a saturated feed refuse the
  operator's own score. Migration 0060 marks an operator's rows `src:'operator'`, which spend only
  the production's ordinary 50-per-5-s allowance.
- **The hosted page had no route to the tree at all.** It holds a control slug and no data key, and
  `control_show_by_slug` returned neither `data` nor `bindings`. 0060 adds `control_data_by_slug`
  and `control_data_patch_by_slug` on that slug, which widens nothing: the same slug already
  appends `update` rows to any graphic through `control_send_many`, and a patch resolves to
  exactly those rows. It also closed a §2.7 hole that surface had from the start - its ⟳ Take sent
  the cue over the staging buffer with no bound overlay, so its own press was regressed by the
  next Take.
- **A page must follow ANY `src`, not `api` alone.** The in-app page re-read the tree when a FEED
  wrote. A press on a phone writes `src:'operator'`, and missing it would leave the app airing a
  stale figure on its next Take.

---

## 3. Phase 1 scope - the Manual Data Playground

Local-first, no backend required, no API. Ships behind nothing.

1. **`model/productionData.ts`** - a pure, import-free module: merge-patch, path get/set/delete,
   flatten-to-leaves (for the picker), the stringify rule, and `resolveBindings(data, bindings)`
   returning `Record<graphicName, Record<fieldId, string>>`. Import-free is deliberate: it makes
   `scripts/production-data.test.mjs` possible (§8) and lets `api/_lib` reuse the file later.
2. **Storage** - `Show.data` (seed, additive-optional) plus a local durable key for the live
   tree, keyed by show id, never synced.
3. **`Show.bindings`** - additive-optional, per §2.3.
4. **The Data tab grows a second panel, above the tables**: `Production data`.
   - A tree/table of path and value, edit in place.
   - Add field (path + value, type inferred from the literal: `4` number, `true` boolean, bare or
     quoted text string, `[...]`/`{...}` JSON).
   - Delete field. Reset to seed. Clear. Save current as seed.
   - A raw JSON view that is editable and round-trips - this is the honest view of a nested tree
     and doubles as the paste target for a sample payload.
   - Test controls, **generated not hard-coded**: every numeric leaf gets a minus/plus pair; there
     is one "randomise" button that perturbs numeric leaves. No sports vocabulary anywhere.
5. **The bindings table** - per pool graphic, its fields against paths, with the live resolved
   value shown beside each. Unresolved and ambiguous rows are called out, not hidden.
6. **Cue editor** - bound fields render read-only with the link chip and live value (§2.7).
7. **Wiring** - any change to the live tree resolves, diffs, and dispatches through the existing
   `runVerb` path.

**Not in Phase 1:** the server column, the API verbs, read-back, connectors, converting the
existing stepper, arrays-of-objects repeat binding, any schema.

---

## 4. Future API path

Phase 1's write path is already `patch -> merge -> resolve -> diff -> log rows`. The API replaces
*who calls it* and *where the tree lives* - not the shape.

**Phase 2 (server ingress), migration 0048:**

- `control_shows.data jsonb not null default '{}'` - the live tree once published.
- `control_shows.bindings jsonb` - pinned at publish beside `panel`/`output`.
- `control_data_patch(p_key text, p_patch jsonb)` - `control_data_send`'s sibling, service-role
  only, same `data_key`, same ingest budget marking. In ONE transaction, with the row locked:
  deep-merge the patch, resolve bindings, diff, insert the resulting `update` rows. Atomic, so two
  writers cannot lose an update, and ordering is the log's own.
- `PATCH /api/data` and `GET /api/data` as **new segments on the existing catch-all** -
  `api/data/[...path].ts` already routes one segment (`check:api-route-depth` measures it). **Zero
  new functions**, which matters: `docs/DATA_API.md` records the endpoint as function 11 of a
  12-function budget.
- `POST /api/data/update` stays, documented as the low-level graphic-addressed path.

The deep merge then exists twice - TypeScript for the local path, plpgsql for the atomic one.
That is a real cost, named rather than hidden. It is pinned by one shared fixture table asserted
on both sides, and the SQL side must be verified by **calling** the function, not by inspecting
its shape.

**Phase 3:** contextual controls converge onto patches (§2.9); `liveData.ts` retires; a Data page
prints the ready-to-paste `curl` for this production, making the playground its own
documentation.

---

## 5. Data model changes

```ts
// model/shows.ts - both ADDITIVE OPTIONAL, so no version bump and no migration (rule 6).
interface Show {
  /** The production's data SEED - what Reset returns to. The live tree is runtime state and
   *  is deliberately NOT here: writing it would bump updatedAt at feed rate and push a doc
   *  sync per tick, which is how a live production mints a conflict copy (D3's named limit). */
  data?: JsonObject;
  /** graphic name -> field id -> production-data path. */
  bindings?: Record<string, Record<string, string>>;
}
```

New local durable key `spx-gfx-production-data` - `{ [showId]: JsonObject }`, never synced, never
exported.

Migration 0048 (Phase 2 only) adds `control_shows.data` + `.bindings` + `control_data_patch`.
Nothing in Phase 1 touches the database.

**Lifecycle answers:**

| Question | Answer |
|---|---|
| Survives refresh? | Seed always (show doc). Live tree yes - the local durable key, or the server row when published. |
| Unpublished? | Server row dies with the other capabilities, exactly as the data key does. Seed and local live tree survive. |
| Duplicated? | Seed and bindings copy (they are show state). Live tree does not - a copy starts from its seed. |
| Exported? | Neither. An exported graphic has no feed; its fields keep their authored defaults. Bindings are a studio-side concept. |
| In the published output payload? | No. The payload is pinned at publish; live data must ride the log or it would be a second, staler truth. Bindings **are** pinned (they are authored state). |
| History? | None. No event sourcing. The command log already is the durable history, already prunable - the brief's instinct is right and the infrastructure is free. |

---

## 6. UI plan

Everything lands on the **existing Data tab** (`#/production/<id>/data`) - no new route, no new
top-level surface.

```
+-- Production data ------------------------ [Reset] [Clear] [Save as seed] --+
|   match.home.name      Finland                                    -  +  x   |
|   match.home.score     3                         number           -  +  x   |
|   match.clock          12:31                                            x   |
|   + Add field                                      [ Raw JSON ]             |
+-- Bindings -----------------------------------------------------------------+
|   House Scorebug   f1 Score A  <- match.home.score   3                      |
|                    f2 Score B  <- match.away.score   2                      |
|                    f4 Referee     (unbound)          [ pick a path ]        |
+-----------------------------------------------------------------------------+
```

Below it, the existing tables panel, unchanged.

The Playout tab stays an operating surface: it gains only the link chip on bound cue fields, and
(Phase 3) steppers that patch. Nothing about the playground clutters a live show, because it is a
different tab - the separation D6 already established.

---

## 7. Security model

**Phase 1: nothing new.** Local, manual, no endpoint, no credential. This is the strongest reason
to keep Phase 1 manual-only.

**Phase 2** reuses 0047 verbatim rather than inventing anything:

- The per-production **`data_key`** authorizes the patch. It is already update-only *by
  construction in the database*, per-production, and rotated by re-publish.
- `control_data_patch` writes nothing but `update` rows and the data column. It still cannot
  play, stop, take or clear - a feed is never an operator.
- The three-layer rate limit (IP / per-production ingest budget / the log's own cap) applies
  unchanged, and the ingest budget stays enforced in the database so operator headroom holds
  across serverless instances.
- 16 KB body cap stays. Scenario C (20 drivers by 5 values) is about 3 KB.
- Cross-production writes are structurally impossible: the key **is** the production address.

**`GET /api/data` is APPROVED for Phase 2** (owner decision, 2026-08-19). An integrator
reconciling after a restart, a crash or a network partition needs to ask what NoaCG currently
believes rather than blindly pushing a whole snapshot. The invariant is therefore restated - in
`docs/DATA_API.md` too - from the weaker

> ~~update-only by construction~~

to the stronger and more useful

> **External integrations manipulate production data, never individual graphic instances. Writes
> describe state, never graphic commands.**

Reading is compatible with that; playing a graphic never is. Scope names (`production:data:read`,
`production:data:write`) are reserved in the design so a later split is additive, but **no scope
system is built** - one key, both verbs, until a real caller needs otherwise.

**Not now:** per-key scopes, multiple keys per production, key naming/rotation UI, audit trails,
per-path permissions. All enterprise API-key management, none of it earned yet.

---

## 8. Testing plan

**Extend, do not duplicate:**

| Existing | Add |
|---|---|
| `scripts/csv.test.mjs` pattern | **new** `scripts/production-data.test.mjs` - transpile the real `model/productionData.ts` and unit-test merge (nested, `null` delete, array replace), path get/set on missing parents, the stringify rule, ambiguous-suggestion refusal, and the resolve+diff. Wired into the build gate's `node --test` list. |
| `e2e/production-data.spec.ts` | the playground walk: add / edit / delete a field, nested paths, an array into a `lines` field, bind a field, live value reaches the preview, reset to seed, reload persistence, deep-link. |
| `e2e/productions.spec.ts` | production isolation (two productions, same paths, no bleed) and duplicate behaviour (seed copies, live tree does not). |
| `e2e/production-controls.spec.ts` | a bound field is read-only in the cue editor; Take does not re-air a stale prepared value; two graphics bound to one path both move. |
| `e2e/production-persistence.spec.ts` | the live tree survives reload while the show doc's `updatedAt` did **not** move - the anti-sync-churn claim, asserted rather than assumed. |
| `e2e/data-api.spec.ts` (Phase 2) | refusal shapes for `PATCH`/`GET`: 401, 503 offline, 405, 413. |
| `e2e/configured/scorebug-output.spec.ts` (Phase 2) | the live path: patch through the real API, the real `/output` renderer moves, a renderer reboot mid-show recovers the bound value. |
| `scripts/*-migration.test.mjs` pattern (Phase 2) | 0048's grants and refusals, **calling** `control_data_patch`, not inspecting it. |

Malformed input is a unit-test concern (bad JSON, a path with empty segments, a cyclic value, a
number where an object was) and belongs in `scripts/production-data.test.mjs`, not in Playwright.

`npm run build` covers typecheck, lint, dependency-cruiser and the unit tests. No catalog change,
so the five catalog gates are not in scope.

---

## 9. Migration and backward-compatibility risks

- **Both new `Show` fields are additive-optional** - no version bump, and an older build reads and
  rewrites the record untouched (rule 6). A production with no `data` and no `bindings` behaves
  exactly as today.
- **Sync churn is the headline risk** and §2.1 is the mitigation. It must be asserted, not
  assumed - hence the `updatedAt` assertion in the persistence spec.
- **The cue-value rule (§2.7) changes existing behaviour** for any field an operator later binds:
  the cue stops carrying it. Bindings are opt-in and start empty, so nothing changes for existing
  productions until someone binds a field.
- **`dataIngest.ts` reuse** - `mapLabelsToFields` stays for `/update`; the patch path must not
  route through it, or graphic addressing sneaks back in.
- **A published production predating 0048** has no `data` column value; normalize to `{}` on read
  rather than failing, per the degrade-honestly rule.
- **`api/` compiles under `tsconfig.api.json` but Vercel typechecks with the ROOT tsconfig** -
  a shared `model/productionData.ts` must stay inside the root config's target.

---

## 10. Explicitly do NOT build

1. Any schema, type declaration or validation layer for the data tree.
2. A runtime `productionData.*` object inside template code (§2.3).
3. A new transport of any kind - WebSocket, SSE, polling, a second Realtime channel.
4. Event sourcing, history, time-travel or an audit trail for data values.
5. In-app connectors or pollers (weather, sports, OpenF1, sheets). Connectors are external
   processes calling the API; `scripts/weather-feed.mjs` is the pattern.
6. Any extension of `liveData.ts`.
7. Repeat/loop binding for arrays of objects. Phase 1 handles Scenario C with indexed paths -
   verbose, honest, and zero new machinery. Revisit only with a real leaderboard in a real show.
   (2026-10-10: an election night, the heaviest leaderboard case, was designed against this list
   in `docs/research/election-night-2026-10-10/demo-spec.md` and needs no row binding: the
   connector writes `label | value` line arrays.)
8. Enterprise API-key management (scopes, multiple keys, rotation UI).
9. Expression or formatting language in the binding (`{{score}} pts`). Formatting lives in the
   template.
10. Merging `ShowDataset` into production data.
11. Converting the shipped stepper controls in Phase 1 (§2.9).

---

## 11. Architectural concerns

- **The biggest risk is fan-out, not transport.** N bound graphics times M updates per second is
  the only way this saturates the log's 50-per-5s cap. The diff in §2.6 is not an optimisation, it
  is the mechanism that keeps a 1 Hz clock inside budget - it must ship with Phase 1, not after.
- **The two deep-merge implementations (§4)** are the one genuine duplication this design accepts,
  bought for write atomicity. If that trade sours, the fallback is optimistic read-modify-write in
  the API with a version check, at the cost of a retry loop.
- **Ambiguity in binding suggestions will be common** - `Name` matching four paths. Refusing to
  guess is right, but the picker must make manual binding fast or operators will bind nothing.
- **`prvar` is a red herring.** SPX's project-variable field exists in the model but is inert
  here, and adopting its semantics would import an SPX-side behaviour we do not control into a
  studio-side concept. Leave it alone.
- **Phase 1's local-only live tree means a published production's data lives in one operator's
  browser.** That is exactly how cues already work, so it is consistent - but it is the honest
  reason Phase 2 is not optional if this is ever used on a real show with two operators.

---

## 12. What Phase 1 landed (2026-08-19)

| File | What |
|---|---|
| `src/model/productionData.ts` (new) | The whole semantic contract, PURE and import-free: merge-patch, paths, the stringify rule, `resolveBindings`, `diffResolved`, `suggestPath`, `parseLiteral`, `reparseLeaf`. |
| `src/model/productionState.ts` (new) | The live tree's storage - plain localStorage, per production, never synced, never in the durable write queue. |
| `src/model/shows.ts` | `Show.data` (the seed) + `Show.bindings`, both additive-optional; `setShowSeedData` + `setFieldBinding`. |
| `src/components/home/ProductionDataPanel.tsx` (new) | The playground and the bindings table. |
| `src/components/home/ProductionDataWorkspace.tsx` | Hosts the panel above the tables; the tables section is renamed "Tables" so "Production data" means one thing. |
| `src/components/home/ProductionPage.tsx` | Owns the tree (the one sender lives here); the resolve/diff/dispatch effect; the bound-value overlay on Take, ✎ Update and the preview; bound fields read out in the cue editor. |
| `scripts/production-data.test.mjs` (new) | 15 unit tests including the merge-patch conformance table; wired into the build gate. |
| `e2e/production-data.spec.ts` | 5 new specs beside the existing 10. |

**Two things the review changed:**

- **`Show.data` is the SEED only, written by a deliberate "Save as seed".** There is no other
  door onto the record, which is what makes the anti-churn rule structural rather than
  remembered. The e2e spec asserts the record stays untouched while values move.
- **`reparseLeaf` exists because of a defect the specs caught.** A scalar array renders as
  newline-joined text, and `<input>` sanitises newlines out of its own value - so editing a list
  in the row editor silently joined it into one string. The row now uses a textarea for
  multi-line values and reads the edit back **in the type it already had**.

### The high-frequency clock question, answered against the real implementation

The concern was raised before building; here are the measured facts.

| Fact | Where | Number |
|---|---|---|
| Per-production command cap | `control_send`, migration 0008 | **50 per 5 s** (10/s) |
| Ingest budget (the API's half) | migration 0047 | 25 per 5 s |
| Log retention | migration 0029 | rows older than **7 days**, deleted **at publish only** |
| Renderer catch-up page | `hostedControl.ts` | 500 rows, up to 40 pages |
| Renderer boot replay start | `output/main.ts` | the per-graphic `control_report` **baseline**, not log zero |

**Delivery is not the problem.** A 1 Hz clock costs one row per second - a tenth of the cap - and
a renderer rebooting mid-show replays from its own debounced report baseline, so catch-up depth
is bounded by report frequency, not by how long the clock has been running. Diff-before-send is
sufficient for Phase 1, and it is what keeps a tree with one moving value at one row rather than
one row per bound graphic.

**Volume is the real cost, and it is deferred honestly.** 3,600 rows per hour per production
accumulate for up to 7 days, and the prune runs only when someone publishes. A production left
running for days without a re-publish grows a large log. Nothing about this needs solving now,
and **no second transport should ever be introduced for it** - the eventual answers, in order of
preference, are: a time-based prune that does not wait for a publish; coalescing repeated writes
to the same path within a window before they become rows; and only then, if ever, a separate
ephemeral delivery policy for values marked as such.

**The better answer for a clock specifically:** a continuously running clock should not be
production data at all. Templates already run their own countdowns locally from a duration field
plus a start event - that is the state-machine model working as designed. Production data is for
values that CHANGE DISCRETELY (a score, a period, a headline, a lap number). Binding a per-second
tick to a data path is the anti-pattern, not the load case to engineer for. That distinction is
worth saying in the integrator docs when Phase 2 ships.

### Verification

- `npm run build` - **exit 0** (typecheck, api typecheck, eslint `--max-warnings 0`,
  dependency-cruiser, the unit-test set, vite build, prerender, secret scan).
- `node --test scripts/production-data.test.mjs` - **15/15**.
- `npx playwright test e2e/production-data.spec.ts` - **15/15** (10 pre-existing + 5 new).
- `npm run test:e2e:focus:queued` - **316/0**.

### Unresolved risks

1. **Phase 1's live tree is per-browser.** A published production operated from two machines has
   two trees, and only the operator's own writes reach air. This is the honest reason Phase 2 is
   not optional for a real multi-operator show; it is not a defect in Phase 1's model, which is
   the same shape cues already have.
2. **The mount reconcile sends every bound field once** per production page open. Idempotent and
   bounded by graphic count, but it is a burst of N rows on a page that was already correct.
   Worth revisiting if a production ever carries many bound graphics.
3. **Binding suggestions will often be ambiguous** in real productions (`Name` matching several
   paths). Refusing to guess is right; whether the datalist picker makes manual binding fast
   enough is unproven until someone binds a real rundown.
4. **`liveData.ts` still exists** - the CSV poller inside template JS, outside the log. It is
   frozen, not retired. It remains the one genuine second data path.

---

## 13. Phase 2, the DB half (2026-08-19)

**Migration `0048_production_data_tree.sql`** - what it adds and why it is shaped this way.
(This section was written before it was applied; §14 records the apply, the live walk, and the
HTTP verbs that followed.)

| Added | What |
|---|---|
| `control_shows.data jsonb not null default '{}'` | the live tree, server-side |
| `control_shows.bindings jsonb not null default '{}'` | pinned at publish beside `panel`/`output` |
| `jsonb_merge_patch(target, patch)` | RFC 7386, the plpgsql twin of `mergePatch` |
| `production_data_format(value)` | the twin of `formatValue`; NULL means WRITE NOTHING |
| `production_data_resolve(data, bindings)` | the twin of `resolveBindings`, as a set of `(graphic, field, value)` |
| `control_data_patch(key, patch)` | merge + resolve + diff + append, in ONE locked transaction |
| `control_data_read(key)` | the approved read-back (§7) |

**Three design points worth keeping:**

- **The diff baseline is derived, never stored.** `control_data_patch` resolves the bindings
  against the tree BEFORE the patch and against the tree AFTER it, and writes only the fields
  whose string differs. There is no "last sent" state to keep true, and a re-sent identical
  score writes no rows at all - which matters because a polling connector re-sends constantly
  and must not spend the production's budget doing it.
- **`for update` is the reason this is an RPC and not function code.** A patch is a
  read-modify-write of one jsonb column; two feeds through separate serverless instances would
  lose one of the two updates. The row is locked and merged in one transaction.
- **Both rate gates count what the call is ABOUT to write** (`v_recent + v_pending > 50`,
  `v_ingest + v_pending > 25`). A patch touching three graphics costs three rows, so a gate
  reading only the trailing count would let one call overshoot by the number of graphics.

**The drift guard is real, and was mutation-tested.** `scripts/merge-patch-conformance.mjs` now
owns the merge rules as data; `scripts/production-data.test.mjs` runs them against the real
TypeScript module, 0048's self-check runs them against the real plpgsql body, and
`scripts/production-data-migration.test.mjs` fails the build if the literal embedded in the
migration stops matching the shared table. Adding a case to the shared file was confirmed to
fail that guard with a message naming the file to update.

**A temp table was removed during review.** The first draft collected the diff in a
`create temporary table`, which inside a `search_path = ''` definer function resolves only
through Postgres's implicit `pg_temp` rule - correct, but a subtlety a reader would have to
know to trust the function. It is a plain aggregate query into a jsonb now.

**One honest formatting difference between the twins:** jsonb preserves a trailing zero, so a
feed sending `3.0` formats as `"3.0"` server-side where TypeScript's `String(3)` gives `"3"`.
Neither is wrong and no template reads the difference, but a connector wanting an exact string
should send a string.

### Authoring-time verification

- `npm run build` - **exit 0** (`definer-grants.test.mjs` covers 0048's new functions).
- `node --test scripts/production-data.test.mjs scripts/production-data-migration.test.mjs` -
  **22/22**, and the conformance guard was mutation-tested rather than assumed.

At this point the plpgsql had never been executed - every check above is static text analysis,
and there is no local Postgres in this checkout. **§14 is where that gap closed**: applying the
migration ran its `do $$` self-check, which calls every body it adds and refuses to apply on any
behavioural failure.

---

## 14. Phase 2 is complete and APPLIED (2026-08-19)

Migration `0048` was pushed to the linked project with `supabase db push`; the ledger read clean
first (0001-0047 present, no drift - **the project note claiming 0047 was unapplied was stale**).
The migration's own self-check ran on apply, which is what finally EXECUTED the plpgsql: every
merge-patch conformance case, the format rules, and the resolve rules all ran against the real
bodies before the migration was allowed to land.

**The HTTP half shipped with it**, as new segments on the existing catch-all - zero new
functions, the endpoint budget untouched:

| Verb | What |
|---|---|
| `PATCH`/`POST /api/data/patch` | merge a patch into the tree; answers the whole tree + what moved |
| `GET /api/data/state` | the read-back an integrator reconciles against |

Named `/data/patch` and `/data/state` rather than `PATCH /api/data`, because the catch-all routes
exactly ONE segment on this deployment (`check:api-route-depth`, measured). `hostedControl.ts`
now publishes `Show.bindings` onto the row, without which the RPC would resolve nothing.

### The live walk (real project, real RPCs, cleaned up afterwards)

A throwaway production row with two bound graphics, driven through `control_data_patch`, then
deleted along with its log rows:

| Sent | Result |
|---|---|
| `{match:{home:{name,score:1},away:{score:0}},headlines:[...]}` | 2 rows: `Ticker {f0:"One\nTwo"}` (array joined) + `Scorebug {f1:"1",f2:"0"}` |
| `{match:{home:{score:2}}}` | 1 row: `Scorebug {f1:"2"}` - **only the changed field, only its graphic** |
| the same patch again | **no rows** - idempotent, no budget spent |
| `{weather:{temp:17.4}}` (unbound) | no rows; the tree still moved |
| `{match:{home:{score:null}}}` | key deleted from the tree, **no row** - the live field keeps its last good value |

Grants were verified from outside too: `anon` calling either RPC gets
`42501 permission denied`, `service_role` with an unknown key gets `unknown data key`.

### What this unblocks

`scripts/sportsdb/productionData.mjs` on `claude/sportsdb-connector-803b2f` stops at
`productionData.patch(productionId, patch)` with a comment naming this contract as "not ours to
build". That call now exists. The connector's remaining work is its own branch's.

### Still open

- The contextual `±` controls still write fields, not paths (§2.9), and `liveData.ts` is still
  frozen rather than retired.

---

## 15. The client follows the server tree (2026-08-19)

The last of the two-truths problems. Once published, `control_shows.data` is the authority - a
feed writes it, the patch RPC merges against it - but the app was still reading and writing its
own localStorage copy, so a feed's write never appeared in the operator's Data tab and the next
patch merged onto a base the operator had already moved.

**The split is now explicit, on one fact: does this production have a data key?**

| | Unpublished | Published |
|---|---|---|
| The tree lives in | `localStorage` (`productionState.ts`) | `control_shows.data` |
| An operator edit | writes local, resolves + dispatches locally | `PATCH /api/data/patch` |
| Field updates reach air via | this page's own dispatch | the RPC's own log rows, followed back |
| A feed's write | n/a | re-read on any `src:'api'` log row |

**The operator surface is now a CLIENT of the documented API** (`control/productionDataApi.ts`),
not a second writer beside it. That is the point: the merge has to be atomic with the row lock,
and that merge is service-role only, so the honest route from a browser is the endpoint that
already fronts it. It also means the integrator's contract is dogfooded by the app itself.

**About the key.** The owner reads their OWN production's `data_key` over RLS
(`control_shows_owner_all` is `for all ... using (auth.uid() = owner_id)`, so the column is
readable by its owner and the service role and nobody else). This is not the "never a web page"
case `docs/DATA_API.md` warns about - that is about shipping a key to viewers. This is the
owner's own key in the owner's own session, and it is strictly WEAKER than the control slug the
same page already holds, which can play, stop and clear graphics.

**Three details that are not cosmetic:**

- **A whole-tree replace is not expressible as a merge patch.** Reset to seed, Clear and applying
  edited Raw JSON all DROP keys, and a patch can only say what it names.
  `replacementPatch(before, after)` walks both sides and emits an explicit `null` per removal,
  and names nothing that did not change.
- **The answer is what we hold, never the object we hoped for.** `patchProductionData` returns
  the tree after the merge, so a feed tick that landed in the same moment is already in it and
  the operator's edit cannot silently overwrite it.
- **`dataKey === undefined` means NOT YET KNOWN, and the local dispatch waits for it.** Treating
  "not resolved" as "offline" would make a published production, opened cold, spend one render
  pushing its last LOCAL tree - stale values, briefly, on air.

### Verification

- `npm run build` exit 0; `production-data.spec.ts` + `productions.spec.ts` +
  `production-controls.spec.ts` **37/37**; unit **17/17** (`replacementPatch` round-trips every
  case through `applyPatch`).
- **The published branch is NOT covered by the offline suite** and was not live-walked: it needs
  an authenticated owner session against the real project, which this session could not create.
  What was verified live is everything under it - the RPCs, the endpoints, the merge, the diff
  (§14) - plus the RLS grant the key read depends on, read from 0008. The uncovered part is the
  wiring in `ProductionPage`, and the way to close it is an owner opening a published
  production's Data tab and watching a `scripts/weather-feed.mjs` tick land in it.

## 16. The mechanism finally has a user-facing example (2026-09-16)

Everything above is the plan's own vocabulary: tree, leaf, path, binding, resolve, patch. None of
it had ever been written down for the person who has to USE it, and the owner's read on
2026-09-16 was the predictable one: *"the production data, the bindings, and the tables are a bit
confusing. How are those supposed to be used?"*

`/docs#data-example` is the answer, and it is deliberately ONE small show rather than a second
reference. "Hall Cup" carries two scoreboards, a ticker and a name strap; the tree holds
`match.scoreA` and a `tickerItems` list; `Bind all by title` binds nine of the thirteen fields and
leaves four alone; a table called Interviews fills the strap a row at a time. The second
scoreboard is there because the headline claim - one value moves every graphic that reads it -
cannot be SHOWN by a pool where no two graphics ever want the same number. Seven screenshots,
all captured from the running app by `node scripts/docs-shots.mjs` (blocks 4 to 9) against that
exact production, so a reader who copies the JSON lands on the pictures.

**The distinction the section exists to draw** is the one §2.8 states architecturally and nobody
outside this file had ever been told: production data is the one thing that is true right now and
wires itself into graphics, and a table is a bank of candidate rows an operator picks from.
Tables were not documented on `/docs` at all before this.

**Two facts a reader needs that this plan implies rather than states.** An unpublished
production's tree is this browser's localStorage (`model/productionState.ts`), so `⬇ Save as
seed` is what makes values travel with the production; published, the server's copy is the
authority and every operator shares it. Both are now on the public page in those words.

**The same defect, found twice in one night, and the better fix won.** Photographing the Data tab
showed `.pd-bind-row` and `.pd-live-row` were both five-track grids that their own rows only ever
filled four of: a bound binding row has no suggestion, and a text leaf has no ± stepper, so in
each case the delete ✕ fell into a wide `fr` track and drew as a slab tens of pixels left of the
✕ on the row above it. Every row also sized its own columns from its own content, so the path
inputs never lined up.

The Data-tab row (`0e49eeec`, `524d9b96`, `70b878a6`) found the same thing independently, from
the other direction, and landed first with a deeper repair: the delete button PINNED to the last
track on both rules, and the label and path columns lifted into `--pd-label-col` /
`--pd-path-col` on `.pd-live` so the tree and the bindings agree with EACH OTHER rather than each
being internally straight, plus an `fr` fallback for both under 900px. That is the version in the
tree; the screenshot row's own placement-by-class fix was dropped whole at the merge rather than
reconciled, because it was the same diagnosis and the narrower answer.

**Nothing in `e2e/` measures either rule's geometry**, which is why a defect this visible survived
in both. Two rows had to look at the screen on the same night to find it.
