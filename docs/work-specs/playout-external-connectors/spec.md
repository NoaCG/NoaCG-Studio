# E4 — Trusted JSON acquisition through the existing production-data route

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

After baseline 14: provide one reusable generic HTTPS JSON GET connector, executable as a
headless agent on a qualified cloud worker and as an installed agent outside Vercel. The first
concrete integration is our own authenticated election replay server (below); a public provider
can be an extra receipt. Official Finnish results access is not assumed. Reuse C5's sender and
existing production API. No database driver, OAuth, arbitrary provider webhook, second production
store or new Bridge EXE.

Owned seams: new `src/control/externalSource.ts` pure acquisition/result contract,
`scripts/external-data-connector.mjs` headless agent, `scripts/election-replay-server.mjs`,
`productionDataSession` (created by parent phase 2+7), `productionDataApi.ts`,
`src/model/shows.ts`, `api/data/[...path].ts` and its existing apply path only where source
metadata/atomic acceptance require it, and `src/control/sourceMapping.ts`, which E4.2 creates as
the one shared evaluator (below). Backend migrations are additive, scoped and reviewed under
their own rules. No unrelated backend rewrite. E5 owns mapping UI and recipes; E7 owns cue
selection. Keep source raw values typed JSON; stringify only in native field adapters.

**One shared evaluator (2026-10-20).** `src/control/sourceMapping.ts` is a pure module (ES2020
library surface, no DOM, `.ts` runtime imports only) that `api/` imports as
`../../src/control/sourceMapping.js`, as `api/render/start.ts` already imports `src/render/`.
It evaluates a source's typed JSON for its consumers and returns, per affected graphic, the
strings and lists the existing native adapters and apply path already understand. E4.2 creates it
with the identity projection (a scalar path to its string, a collection path through the existing
list adapters); E5.1 adds recipes and E7.1 keyed selectors to the same module. The browser
reader, the C2 server tick and this route all call it, so a value is resolved the same way
wherever it is read. SQL keeps resolving legacy `Show.bindings` through `control_data_apply`
unchanged. E1's typed foreign values travel in E1's own envelope, never through this module's
string output.

## Connector contract

Persist non-secret source ID, production ID, approved endpoint, schema/config revision,
credential reference and polling configuration. Secrets are environment/service credentials of
the trusted agent, never graphic scripts, browser storage, exported shows or downloadable packs.
Use TLS validation. Public URL fetches follow C4's redirect/DNS/private-address defenses and
byte/time caps. Private endpoints require an explicitly configured local agent destination;
never turn a generic hosted fetcher into unrestricted private-network access.

V1 supports GET, no body, JSON response, optional bearer authorization header, one in-flight
read per source. Default poll interval is five seconds, adjustable to the provider's documented
minimum; enforce request timeout (10 s) and response cap (2 MiB), configurable only through
trusted deployment settings with a recorded envelope. Honor Retry-After; exponential backoff
with jitter capped at 60 s, no accumulated retry queue. These are connector defaults, not changes
to the agreed Sheet cadence. Event-driven or signed webhook protocols are explicitly unsupported
until their provider policy is specified; existing external scripts may still use C5's API.

A normalized acquisition has source ID, config revision, owner epoch, monotonically accepted
revision, checked-at, optional provider event time/sequence, status and typed payload. Persist
only needed status/revision alongside existing source state; no second live-data authority.
An owned namespace is replaced coherently through the existing apply path. The data catch-all's
new `/api/data/source` operation carries this versioned connector envelope, authenticated with
the existing production-data credential and scoped to its registered source. It dispatches
through the existing apply writer; it is not a second arbitrary patch endpoint. It rejects wrong
production/epoch/config, duplicate/old revisions and invalid payload before mutation. Legacy
`/patch` and `/update` callers retain their contract.

**Registration and epoch are C2's lease.** A source is registered by the ordinary
`Show.sources` write that C2 persists to the row. The agent claims it through
`/api/data/source` with `op: "claim"`, which calls the same lease operation the browser reader
and the server tick use, and receives the current epoch and config revision; the agent cannot
mint its own authoritative epoch. An agent restart claims a new epoch; unordered providers are
single-flight and cannot claim upstream recency from arrival time alone. Successful unchanged
reads update checked-at, not changed-at.

Pause prevents application at the trusted apply boundary; latest valid received state can be
retained for Resume, which applies one final diff. Source configuration is shared non-secret
setup; the operator chooses a registered agent/source in Connect and sees whether it is running.
UI credentials are never forwarded to a graphic. A lost reader lease rejects late writes.
Disconnect stops future application and preserves explicit last values; reconnect requires a
new fence. Transport status, provider age and graphic application state remain separate.

## Ingress limits (owner, 2026-10-20, G)

The owner approved a planned ingress limit for this route, separate from `/patch` and `/update`
(16 KiB bodies, unchanged), sized for one real election production:

- **Body cap 256 KiB** per `/api/data/source` request: about 1,000 candidate records after
  projection to the fields graphics use (around 150 bytes each) plus headroom. The agent projects
  before sending; the 2 MiB cap applies only to what it reads from the provider.
- **Write budget:** the existing per-production ingest budget (25 update rows in any 5 seconds,
  the operator keeping the other 25) is shared, not raised. One accepted revision per source per
  5 seconds, producing at most one update row per affected graphic. A revision that would need
  more rows than the budget has left is refused whole before any mutation and the agent retries
  at its next read; the last good values stay on air. An unchanged payload sends a payload-free
  checked receipt at most every 15 seconds: no tree write and no rows.
- **Realtime payload check:** every update row a revision would append is at most 64 KiB
  serialized, checked before the append; a larger one refuses the revision with a named error.
  This stays below Supabase's smallest broadcast limit (256 KB on Free; 3,000 KB on Pro) and its
  1,024 KB Postgres-change limit, so it holds on any plan.

**Storage, version gate and rollback.** E4.2's one additive migration adds
`production_source_snapshots` (production, source, config revision, owner epoch, accepted
revision, checked-at, changed-at, byte size, typed payload) and the fenced apply function behind
`/api/data/source`. Snapshot rows and the connector envelope carry `v: 1`; a reader that meets a
higher `v` holds the source read-only: it keeps the last values, applies nothing and offers no
edit (precedent `readShowProfile` in `src/model/profile.ts`). Old-show fixtures:
`scripts/show-fixture-compat.test.mjs` gains a show saved by the pre-E4 build (C0–C7 sources and
bindings) that loads and plays unchanged, and one carrying `v: 2` that loads read-only. Rollback:
pause the source or switch the connector off; snapshots, recipes and last values stay; there is
no destructive down-migration.

## Replay server and endurance workflow (2026-10-20, F and fix 4)

`scripts/election-replay-server.mjs` replaces the external replay provider: a small Node HTTPS
server, bearer-authenticated, serving the recorded election fixtures on a controllable timeline
(count increases, a newer downward correction, malformed, duplicate and older revisions, a valid
empty collection, a deleted person). It runs beside the trusted agent: on the cloud worker, inside
the Actions job, or on the laptop, as an explicitly configured local agent destination with a
test certificate that only that run trusts, so TLS validation stays on. It is never a Vercel
function: the function budget is nearly full (`docs/DEPLOYMENT.md`). E7 and E8 use it.

E4.1 also adds `.github/workflows/endurance.yml`: `workflow_dispatch` only, `timeout-minutes: 90`,
inputs for minutes and record count, running the replay server, the agent and the production
path. It is not a required check, and no existing workflow's timeout changes. E4.1 proves it
with a short replay smoke so its landing and permissions are settled long before E8.1b runs it
for 60 minutes.

## Acceptance

### AC-1: Trusted acquisition is bounded and portable
Run the replay server and the agent, deny invalid credentials, follow the configured rate/timeout/
size policies and redact credentials. The same configuration works as a headless agent on a
qualified cloud worker (E4.1) and as an agent installed from the documented steps outside Vercel,
including restart and credential rotation (E4.2, exercised on the cloud worker; a laptop install
is optional). An export contains only a credential reference and requires rebind.
Private-address/redirect/DNS bypass tests fail closed for hosted acquisition.

### AC-2: One coherent source revision reaches the existing writer
A scalar and a collection update arrive through the production API and affect bound graphics.
Concurrent writes, duplicate delivery, reordered replies, old config and old owner epochs cannot
overwrite a newer accepted revision. Negative test proves rejection occurs before data mutation,
including a revision over the body cap, the remaining write budget or the 64 KiB row check.
An unchanged successful read remains healthy; malformed input holds last good; valid empty JSON
collections remain valid input to E5. Provider age is unknown if the provider has no such signal.

### AC-3: Pause, restart and failure retain honest state
Pause blocks application even if the sender keeps reading; Resume applies the final validated
diff once. Kill/restart the agent, rotate its credential, close controllers and interrupt the
network. No duplicate reader/writer, old-owner overwrite, stale Take or claim of fresh output.
Unconfigured private/OAuth/webhook providers report unsupported rather than silently trying them.

### AC-4: Rollback preserves existing production callers
Current C0–C7 Sheet, feed, `/patch`, `/update` and exported native graphic fixtures still work.
Disable the connector and restore its prior non-secret config without erasing last values or
breaking ordinary manual control. The persisted snapshot version has old-show fixtures and the
read-only fallback above for clients that cannot understand it.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E4.1 | Pure versioned acquisition contract, headless agent, replay server and `endurance.yml`; AC-1 cloud-worker part | Cloud: new `scripts/external-data-connector.test.mjs` with fake clock/fetch and a real replay-server HTTP boundary; credential/export and fetch-defense tests; one `endurance.yml` smoke run. Record supported limits and provider assumptions. |
| E4.2 | `sourceMapping.ts` identity projection, the claim through C2's lease, source status, fencing, ingress limits, atomic apply, Pause, the migration; AC-1 installed-agent part, AC-2–4 | Cloud: new `e2e/configured/external-data-connector.spec.ts`, source/session Node tests, limit and version-gate tests, existing data API compatibility tests; the documented agent install, restart and credential rotation on the cloud worker. Actual outputs join E7/E8. |

If atomic source fencing cannot be enforced in the existing apply route, stop at this contract
boundary and record the minimal required additive change; never claim the sender alone prevents
late writes. A provider access gap cannot be replaced by a successful loopback request.
