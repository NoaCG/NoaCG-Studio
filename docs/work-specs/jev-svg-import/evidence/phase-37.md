# Phase 37: Qualify privacy and service-failure behavior

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-6: "Correct decision adapter and explicit consent boundary; server-only credentials;
  request/token/attempt/cost bounds; validated provider policy; deterministic fallback."
- AC-17: "Model/network/quota failure and disabled Jev leave useful import and saved playout;
  prompt injection cannot alter allowed behavior or expose data."
- Row 37: "Verify consent scope, no browser secrets, prompt-injection refusal, quota/budget
  exhaustion, retries, cancellation, unsupported inputs and stale responses. Model-disabled import
  and compiled playout keep working."

## Pinned main

Worktree from `origin/main` `7f5b5b8e54196b07e5b6f016464728d7de7673fd` (PR #2032, row 36).
Previous verified main: that SHA. Revert this row after it lands with
`git revert -m 1 <merge sha>`. Tests and these notes only: a revert changes no product
behaviour, setting or stored data, and there is no migration.

## What this row follows

Row 34 gave no go; row 35 left the SVG model route off (`MODEL_ROUTE_QUALIFIED` false,
`ADMITTED_FAMILIES` empty, `503 profile_disabled` with `fallback: 'deterministic'`); row 36
walked every family from the deterministic proposal. So this row qualifies the gateway, the
registry and the route as they stand, with stubs only. No product source changed, and no paid
call, Gateway call or evaluation dispatch was made.

## Each criterion and its proof

Earlier rows already proved some of these points. They are listed with their tests and were not
repeated. New tests are marked **new**.

| Point | Where it is proved |
| --- | --- |
| Consent scope | **new** `aiDecisionGateway.test.ts` "consent scope": text without an explicit `true` refused at the route (400); an image `href` or `preview`, or a preview on the evidence, refused with or without the choice; no AI-notice consent gives 403 `consent_required`; with the choice only the layer's own values go. Row 31: consent version, lookup error and include-text checks in the adapter. |
| No browser secrets | **new** route test: the server key is only in the provider call's Authorization header, never in the body sent, the browser's answer or a ledger record. **new** e2e "with every AI route failing...": no server-only name (`AI_GATEWAY_API_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_KEY_ENCRYPTION_SECRET`, `IP_HASH_SALT`, provider keys) in any script the page loaded, and the browser's injected env holds only `VITE_*` and Vite's own keys. A limit: the e2e server holds no secret values, so the walk checks names and env keys, not values. |
| Prompt-injection refusal | **new** "the artwork cannot change the questions...": hostile layer names travel only as values in `state`; the questions stay the server's own and name only reader-made ids (`ignore_previous_instructions` is listed `notAsked`); a body carrying `questions`, `model`, `route`, `prompt` or `admittedFamilies` is refused before any call; yes to every family returns no family; a model that adds an answer or a `note` is refused (502), not retried, and none of its words reach the browser. |
| Quota and budget exhaustion | **new** "an exhausted allowance or fleet budget...": daily starts and monthly successes (429 `allowance_exhausted`), fleet spend and fleet concurrency (503 `fleet_capacity`, retryable), the cost ceiling (503), the per-IP burst (429), each with nothing sent or booked. Row 31: user concurrency, duplicate key, billed cost above the ceiling. |
| Retries | **new** "a failing provider is retried once at most...": through the route, a transient 503 then an answer (2 attempts, usable); two 503s, two 429s, two network errors (2 attempts, failed, deterministic); a 400 refusal or another serving model (1 attempt). Row 31: 408 and unreadable answers, the adapter's own bound. |
| Cancellation | Row 31 (adapter, in flight and before start) and row 35 (route and browser client). Not repeated. |
| Unsupported inputs | **new** in the budget test: not JSON, a list, no layers, an unknown layer kind, a short idempotency key and a valid request padded past the body bound, each 400 with the fallback; a GET gets the method guard's 405. Nothing is sent or booked. Row 31: evidence and question bounds. |
| Stale responses | Row 35: refused by the client (`stale`) and the draft's door (`stale-revision`). **new** in the e2e: a 200 that is not a reading is `malformed`. |
| Request, token, attempt and cost bounds | Row 31: evidence, question and whole-request size bounds and the per-route context bound (a token is at least one byte, so the byte bound is the token bound; the task budgets no output tokens), the priced worst case of both attempts, the billed-cost check. **new**: the env clamps below, and the route's body-size bound (a valid request padded past it is refused). |
| Validated provider policy | **new** `aiTaskRegistry.test.ts`: env cost and timeout overrides are clamped; attempts, retry limit and no fallbacks are fixed; a direct provider, an unlisted Jev version or a chat model is refused; no allowed provider is not configured. Row 31: decision and chat tasks never cross, prices from the audited list. |
| Disabled Jev, model, network and quota failure leave a useful import | **new** e2e: every `/api/ai/**` request fails at the network; the browser client answers quota, service, network and garbage replies with the deterministic fallback; then a lower third is dropped, asks nothing, and is saved into a production with no request to the SVG route. **new** registry test: the SVG task on, off or misconfigured leaves graphic analysis's task profile unchanged and adds no allowance. |
| Saved and compiled playout | **new** e2e: Take puts the saved graphic's name and role on air; the saved graphic compiles to SPX, CasparCG and OGraf packages that carry its field and no `/api/ai`, `svg-interpretation` or gateway reference. |

## The database-error defaults (carried from row 31, PR #2002 /so point 2)

On a database read error `systemSettings()` answers no kill switch, and the plan rows answer the
signed-in default plan, which allows `ai.import-analysis`. **new** "a database error cannot turn
the disabled SVG route on", with the database configured but unreachable:

- The settings and plan reads really go to the database and fail. What they then answer (empty
  settings; the free plan allows the task) is the default #2034 reports, so the test does not
  assert it: a fail-closed fix must not read as a regression.
- The shipped SVG route, with its env flag set, answers `503 profile_disabled` before it reads a
  setting, a plan or the body: no database read, no model call.
- With the flag off the task refuses first and reads nothing.
- Even past the verdict and the flag (a later qualified route), nothing is booked or sent: today
  the consent read uses the same database and fails closed; a fix of #2034 would stop it earlier.
  The test accepts a refusal at any of those policy steps, and not `unavailable`, which would mean
  every lookup let the request through to the ledger.

So a database error cannot turn the disabled SVG route on.

For the live image-analysis task the defaults are not safe in every case. It makes no consent
read. When the whole database is down, its ledger reservation fails and nothing is spent. When
only the settings or plan reads fail, an admin's route or feature kill switch and a suspended
account or plan limit are ignored, inside the ledger's quotas and fleet spend. That is product
source outside this row: filed as **#2034** (P2) with the reproduction. No source changed here.

## Decisions

- **The route is tested in the gateway's Node suite, not only in e2e.** The route handler takes
  test seams (`qualified`, `verifyUser`, `admitIp`, the interpretation dependencies), so its
  refusals run at the cheapest layer in milliseconds. The e2e walk keeps only what needs a
  browser: the client's mapping, the import, Take, the packages and the loaded scripts.
- **An unreachable database, not a mocked lookup.** The defaults test points `SUPABASE_URL` at
  `127.0.0.1:9` and makes `fetch` fail, so it runs the real `systemSettings`,
  `resolveUserEntitlement` and `hasCurrentAiConsent`. Every call is recorded; only the database
  address is asked.
- **The defaults are described, not asserted.** A test pinning the fail-open answer would lock
  in the defect #2034 reports.

## Verification

- `api/_lib/aiDecisionGateway.test.ts`: 35 of 35 (30 before, 5 new). `api/_lib/aiTaskRegistry.test.ts`:
  15 of 15 (13 before, 2 new). `npm run test:ai-gateway`: the whole AI suite passes. Both through the api runtime build, as `npm run test:ai-gateway`
  runs them; no network.
- `e2e/jev-svg-preparation.spec.ts` through the job queue: see the PR for the run on the final head.
- Mutations, each caught by a new test: `MODEL_ROUTE_QUALIFIED` true; the consent lookup failing
  open; the admitted-family filter removed; the body-key allowlist removed; non-reader ids asked;
  the cost-ceiling env clamp raised; the route's body-size bound raised.
- `node scripts/check-e2e-protection.mjs --changed origin/main`: OK.

## Traps

- A queued e2e run reads the worktree's files while it runs. A source mutation made then shows
  up in the run (one walk read `MODEL_ROUTE_QUALIFIED` true). Run mutations only after the queued
  job has finished.
- `api/_lib/*.test.ts` compiles under `tsconfig.api.json` before it runs; `Response.json()` is
  `unknown` there, so read refusals through a typed helper.
- The 429 from a provider maps to the route's `provider_unavailable`, whose message reads "did
  not answer in time". No surface shows it while the route is off.
