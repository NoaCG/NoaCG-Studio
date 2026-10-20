# E4 — Trusted JSON acquisition through the existing production-data route

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

After baseline 14: provide one reusable generic HTTPS JSON GET connector, executable as a
headless local agent and on a qualified cloud worker. First concrete integration is the
controlled authenticated election replay provider; a public provider can be an extra receipt.
Official Finnish results access is not assumed. Reuse C5's sender and existing production API.
No database driver, OAuth, arbitrary provider webhook, second production store or new Bridge EXE.

Owned seams: new `src/control/externalSource.ts` pure acquisition/result contract,
`scripts/external-data-connector.mjs` headless adapter, existing `productionDataSession`,
`productionDataApi.ts`, `src/model/shows.ts`, `api/data/[...path].ts` and its existing apply path
only where source metadata/atomic acceptance require it. Backend migrations must be additive,
scoped and reviewed under their own rules. No unrelated backend rewrite. E5 owns mapping UI;
E7 owns cue selection. Keep source raw values typed JSON; stringify only in native field adapters.

## Connector contract

Persist non-secret source ID, production ID, approved endpoint, schema/config revision,
credential reference and polling configuration. Secrets are environment/service credentials of
the trusted agent, never graphic scripts, browser storage, exported shows or downloadable packs.
Use TLS validation. Public URL fetches follow C4's redirect/DNS/private-address defenses and
byte/time caps. Private endpoints require an explicitly configured local adapter destination;
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
An owned namespace is replaced coherently through the existing apply path. Use the data catch-all's new `/api/data/source` operation for this versioned connector envelope,
authenticated with the existing production-data credential and scoped to its registered source.
It dispatches through the existing apply writer; it is not a second arbitrary patch endpoint.
The new versioned connector ingress rejects wrong production/epoch/config, duplicate/old revisions and invalid
payload before mutation. Legacy `/patch` and `/update` callers retain their contract. The trusted source-registration/claim operation supplies the current epoch and config revision;
the agent cannot mint its own authoritative epoch. An agent
restart must acquire a new epoch; unordered providers are single-flight and cannot claim upstream
recency from arrival time alone. Successful unchanged reads update checked-at, not changed-at.

Pause prevents application at the trusted apply boundary; latest valid received state can be
retained for Resume, which applies one final diff. Source configuration is shared non-secret setup; the operator chooses a registered agent/source
in Connect and sees whether it is running. UI credentials are never forwarded to a graphic.
A lost reader lease rejects late writes.
Disconnect stops future application and preserves explicit last values; reconnect requires a
new fence. Transport status, provider age and graphic application state remain separate.

## Acceptance

### AC-1: Trusted acquisition is bounded and portable
Run the authenticated fixture provider and agent, deny invalid credentials, follow the configured
rate/timeout/size policies and redact credentials. The same configuration works on a qualified
cloud worker and local agent; an export contains only a credential reference and requires rebind.
Private-address/redirect/DNS bypass tests fail closed for hosted acquisition.

### AC-2: One coherent source revision reaches the existing writer
A scalar and a collection update arrive through the production API and affect bound graphics.
Concurrent writes, duplicate delivery, reordered replies, old config and old owner epochs cannot
overwrite a newer accepted revision. Negative test proves rejection occurs before data mutation.
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
breaking ordinary manual control. Any persisted revision migration has old-show fixtures and a
read-only/disable fallback for clients that cannot understand it.

## Phases and verification

| ID | Deliverable / ready condition | Verification and environment |
| --- | --- | --- |
| E4.1 | Pure versioned acquisition contract, headless agent and authenticated fixture provider; AC-1 | Cloud: new `scripts/external-data-connector.test.mjs` with fake clock/fetch and real fixture HTTP boundary; credential/export and fetch-defense tests. Record supported limits and provider assumptions. |
| E4.2 | Integrate source status, fencing, atomic apply and Pause; AC-2–4 | Cloud: new `e2e/configured/external-data-connector.spec.ts`, source/session Node tests and existing data API compatibility tests; local agent install/restart smoke. Actual outputs join E7/E8. |

If atomic source fencing cannot be enforced in the existing apply route, stop at this contract
boundary and record the minimal required additive change; never claim the sender alone prevents
late writes. Hardware/provider access gaps cannot be replaced by a successful loopback request.
