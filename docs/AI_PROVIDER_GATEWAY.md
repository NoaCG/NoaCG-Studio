# AI provider gateway

NoaCG has one Creative AI system. `AIProvider` remains the product-level interface and the
existing harness remains responsible for DesignSpec routing, catalog assembly, validation,
runtime checks, repair, preferences, and graphic-type context. The gateway is only the model
transport beneath that system.

## Request path

1. The existing SPX or video harness calls `src/ai/modelGateway.ts`.
2. The browser sends a provider-neutral request to `POST /api/ai/generate`.
3. The server selects exactly the requested provider/model route.
4. `api/_lib/aiGateway.ts` adapts the request to Anthropic Messages, OpenAI Responses, or
   OpenAI-compatible Chat Completions (Vercel AI Gateway, Google AI, Hugging Face).
5. The server normalizes text or structured output, errors, token usage, route attempts, and
   optional estimated-cost metadata before returning it to the unchanged harness.

Structured output is re-validated server-side against the request's own JSON Schema
(`schemaAccepts`), because a provider's constrained decoding is a best effort, not a
guarantee. It honours `oneOf`/`anyOf`, `enum`, object `required`/`additionalProperties`,
array `minItems`/`maxItems`/`items`, string `minLength`/`maxLength`/`pattern`, and
`minimum`/`maximum` on both `number` AND `integer`. A violation is a RETRYABLE
`malformed_response`, so the bounded attempt budget re-rolls a stochastic miss instead of
handing the caller a shape it must reject after paying for the call. **A constraint the
validator does not implement is not enforced anywhere** - declare only what it reads.

There is no provider-specific branch in DesignSpec, validation, repair, preference learning,
or UI application logic.

`POST /api/ai/generate` sits behind a per-IP burst gate (`AI_GENERATE_RATE_WINDOW_SEC` /
`AI_GENERATE_RATE_MAX`, default 60 requests per 60 seconds, refused before the body is read).
BYO-key traffic spends the user's own key but passes the same gate - the platform is still the
egress. When Supabase server configuration is present, every gateway execution also writes one
content-free row to the server-write-only `ai_gateway_requests` ledger (migration
`0012_ai_gateway_requests.sql`): task `byo-generate`, user id when known, salted IP hash, key
source, route, normalized tokens, provider cost, and the outcome code. Prompts, messages,
images, generated output, provider bodies, and raw IPs never enter it, and a ledger failure
never fails the generation. It is deliberately separate from Lite's `ai_generations` ledger so
gateway traffic cannot consume Lite's fleet-spend and concurrency budgets.

Provider catalogs are discovered server-side through `GET /api/ai/models`
(`api/_lib/aiModelDiscovery.ts`). Vercel AI Gateway's models listing and Hugging Face's
Inference Providers router supply ids, capabilities, limits, availability, and current prices.
The gateway listing is PUBLIC - a credential only scopes it to the team - so discovery keeps
working in the keyless weekly audit.

**A DIRECT provider (Anthropic, OpenAI, Google) lists its own ids and carries no prices.** Each
answers only for the key that asks, which is why discovery there needs one, and none of the
three publishes a price with its listing - measured, not assumed. So the gateway listing is read
a second time as a PRICE BOOK, matched by `modelPriceKey`, which normalizes away exactly three
differences: the vendor prefix, the dot-vs-dash separator, and the dated snapshot suffix
(`claude-sonnet-4-5-20250929` = `anthropic/claude-sonnet-4.5`). Two rules keep that honest - an
ambiguous key is dropped rather than guessed, and an unreachable price book costs prices but
never the listing itself. The book also supplies the structured-output capability the picker
filters on, so a direct row the harness could not run on is not suggested; the model box takes
free text, so nothing is ever blocked. Rows carry `paidBy` (`user` | `managed`), because a price
nobody can attribute is half an answer. `docs/VIDEO_MODEL_BENCHMARK.md` defines the video
compatibility filter and repeatable quality benchmark.

**The gateway publishes capability TAGS, not a parameter support matrix**, and one
consequence is load-bearing: there is no `structured_outputs` or `response_format` entry in
any model's `supported_parameters` (measured across the whole live listing). Structured
capability is therefore read off the `tool-use` tag - exactly the capability the
forced-function structured mode rides on. Reading the absent field instead would have marked
every model incapable and emptied the picker.

## Task registry and approved-route catalog

Managed free-tier tasks are declared in the server task registry
(`api/_lib/aiTaskRegistry.ts`): per task, the structured-contract reference and version,
allowed tiers, token/image limits, timeout/retry, route policy, and ledger kind. The first
task is `lite-design-spec` - NoaCG Lite re-expressed over the same `AI_LITE_*`
configuration with its public URLs and behavior unchanged.

Free-tier routes must additionally be entries in the server-only approved-route catalog
(`api/_lib/aiModelCatalog.ts`); the registry fails closed (`profile_not_configured`) on
any route outside it, including the Lite skin-judge route. The catalog's `openWeights`
flag is promotion-time preference metadata (open wins at benchmark parity), never a
per-request gate. BYO-key traffic is not catalog-constrained - the caller spends their own
key on an explicitly chosen route. Details: `docs/AI_TASK_REGISTRY.md`.

The second registered task is `imported-graphic-analysis`
(`POST /api/ai/tasks/import-analysis` + `-status` + `-outcome`, flag
`AI_TASK_IMPORT_ANALYSIS_ENABLED` default off): one vision call over the user's
client-side-downscaled artwork, proposal-only, same trust ladder as Lite (fail-closed
route, durable profile-scoped ledger - migration 0015 - burst gate, sign-in, cost
ceilings, atomic quota reservation). The image is analyzed and dropped, never stored.

## NoaCG Lite

NoaCG Lite is a server-owned product profile over the same gateway and harness. Its browser
client calls `POST /api/ai/lite/generations` with a typed brief, not an arbitrary system
prompt, provider, model, route, or fallback. The server builds a versioned compact catalog
prompt, enforces the fixed route policy, and returns either one allowlisted catalog
DesignSpec or an explicit unsupported decision. The existing browser harness then calls the
real `variant.create()` assembler, deterministic design adjustments, static validation, the
safety screen, and the live runtime bench. The result is an ordinary `SpxTemplate`.

Lite cannot enter raw generation, the custom coder, polish, import conversion, code
modification, code repair, or the three-alternative path. One focused structured-spec repair
or one fixed fallback may run, but both share a hard two-attempt session ceiling. A
deterministic compilation or runtime failure is recorded as a NoaCG platform failure and is
never sent to a model for code repair.

The optional skin vision judge (`POST /api/ai/lite/judge`, `AI_LITE_JUDGE_*` settings)
follows the same posture: server-owned route and prompt, fail-closed pricing and provider
allowlist, the same ZDR policy, cost capped per call and accounted on the generation's
ledger row. The submitted hold frame is judged and dropped - never stored.

The public status endpoint returns only availability, supported product categories, public
input limits, and remaining allowance. It never returns provider names, model ids, prices,
endpoint slugs, keys, or fallback rules. Primary and fallback routes, provider endpoints,
prices, prompt version, allowances, concurrency, fleet spend, timeouts, and the kill switch
are server configuration. Changing the selected Lite model needs no browser deployment.

The durable `ai_generations` ledger is server-write-only. It records ids, salted IP hashes,
profile and prompt version, status, resolved category, route accounting, normalized tokens,
provider cost, timing, and machine-readable rule codes. It does not store prompts,
conversations, images, fonts, DesignSpecs, templates, generated code, provider bodies, or
raw IP addresses. Successful validation and user acceptance are separate outcome events, so
cost per machine-usable and cost per accepted graphic can be measured without collecting
student content.

The first quality release is lower-third-only. Its DesignSpec carries a broad intent facet
and an explicit semantic role for each of its one or two lines, so the server can reject
missing requested names, roles, teams, headlines, or other field meanings before compilation.
Six audited chassis carry compact positive and negative routing guidance. Custom palettes
also receive deterministic primary and secondary text-contrast checks.

Migration `0011_ai_lite_quality_feedback.sql` adds only the resolved chassis id, broad intent
facet, and an enumerated discard reason to the server-only ledger. After a configurable
minimum sample count, accepted and discarded totals become a subtle chassis tie-breaker in
the trusted server prompt. The brief and semantic fit always outrank this aggregate prior,
and no prompt, template, screenshot, or generated artifact is retained.

## Disclosure and consent

Every AI action that sends content off the user's machine is gated by a first-use
disclosure notice (ratified decision 2, 2026-07-28): prompts and
uploaded images may be sent to an external AI provider; sensitive or confidential material
must not be uploaded; ZDR-capable routes are preferred where available but retention
across providers is not guaranteed. The wording and version live in
`src/ai/consentNotice.ts` - shared by the browser dialog and the server record, so they
cannot drift. Acceptance is stored client-side for anonymous users and server-side for
signed-in users (`POST /api/ai/consent`, table `ai_consents`, migration
`0014_ai_consent.sql` - timestamp + notice version, nothing else); bumping
`AI_NOTICE_VERSION` forces renewed acceptance everywhere. Offline/stub generations never
show the notice - nothing leaves the machine.

ZDR routing is the DEFAULT for every free-tier task route (`requireZdr` in the task
profile); turning it off is an explicit, audited, per-task server decision.

## Configuration

Browser-visible values are non-secret:

- `VITE_AI_PROVIDER`: `vercel`, `anthropic`, `openai`, `google`, or `huggingface`.
- `VITE_AI_MODEL`: an opaque model id for the selected provider.
- `VITE_AI_FALLBACKS`: optional JSON array of ordered `{provider, model}` routes.

`vercel` is the MANAGED transport - Vercel AI Gateway's OpenAI-compatible Chat Completions
API at `https://ai-gateway.vercel.sh/v1`, and the only provider NoaCG funds. The other four
are the BRING-YOUR-OWN-KEY set: three direct provider APIs, plus one alternative gateway, for
a route or capability the managed transport does not carry. **Only those four are ever shown
to a user** (`AI_PROVIDERS` in `src/ai/settings.ts`); which transport NoaCG spends its own
money through is not a product decision, and no user-facing string names it.

Managed keys are server-only:

- `AI_GATEWAY_API_KEY`, **or** the `VERCEL_OIDC_TOKEN` a Vercel deployment is issued
  automatically. OIDC is the intended production credential - it rotates without anyone
  touching a secret - and an explicit key wins where both exist, matching the gateway's own
  precedence. Locally, `vercel env pull` writes the token to `.env.local` and the dev server
  loads it into `process.env` exactly as production does.
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY` (or the conventional `GEMINI_API_KEY`)
- `HF_TOKEN` - Hugging Face issues USER ACCESS TOKENS, not API keys, and the token needs the
  **Inference Providers** permission or every call answers 401. `HUGGINGFACE_TOKEN` and the
  older `HUGGINGFACE_API_KEY` are still read, so an existing deployment keeps working.

Optional user-provided keys require `AI_KEY_ENCRYPTION_SECRET` with at least 32 characters.
The key is submitted once to `PUT /api/ai/credentials`, sealed with AES-256-GCM, and stored
in a SameSite=Strict, HttpOnly cookie scoped to `/api/ai`. Client JavaScript cannot read it.
The credential endpoint requires a same-origin mutation. Old raw keys found in the historical
`spx-gfx-ai` localStorage record are deleted and are never retransmitted automatically.

When Supabase server configuration is present, a managed key requires a valid signed-in user.
A user-provided key remains usable without an account because the browser owns the sealed
credential. A pure self-host with no Supabase configuration may expose its managed key to its
own users; operators are responsible for access control at that deployment boundary.

## Routing, retries, and cost

The primary route is the selected provider/model. Cross-route fallback happens only through
the explicit ordered `fallbacks` list. An empty list means the request never changes provider
or model, so the gateway cannot silently move work to a more expensive route.

Each route has a bounded timeout (`AI_TIMEOUT_MS`, default 120000, clamped to 5000-300000)
and retry limit (`AI_RETRY_LIMIT`, default 1, clamped to 0-2). Only transient network,
timeout, rate-limit, and provider-availability failures retry. After a route is exhausted,
an explicitly configured fallback may run.

Usage is normalized to input, output, and total tokens. Gateway-reported cost (`usage.cost`,
the same field and the same meaning OpenRouter used - verified against a live call) is kept
when present. Cached input and reasoning tokens are normalized when providers report
them. Other estimates are emitted only when the operator supplies current prices
through `AI_MODEL_PRICING_JSON`, keyed by `provider:model` with `inputPerMillion` and
`outputPerMillion`. Missing pricing produces no estimate rather than a stale claim.

The reported cost is tokens only. Vercel AI Gateway also bills each Custom Reporting write,
$0.075 per 1,000, one per unique tag on a request, and every managed call carries one
`surface:*` tag: $0.000075 per served request, measured exactly on the eval ledgers of runs
41620061986 and 41621970771 on chat completions and `/v1/evaluate` alike (#2015). A request the
gateway refuses before inference was charged nothing. `gatewayRequestFeeUsd` prices the fee
from the tags actually sent (`AI_GATEWAY_TAG_WRITE_USD` overrides the price); the gateway
executor adds it once to a served reply's estimate and marks it with `usage.requestFeeUsd`, so
no caller adds it twice, and every task's priced worst case (`worstAttemptCostUsd`, the decision
adapter's `attemptCeilingUsd`) includes it. A user's own key on a direct provider pays none.

Provider response bodies and credentials are never copied into errors or logs. User-facing
errors use stable gateway codes and sanitized messages.

### The managed routing policy, and what the gateway does not offer

For managed calls the server sends `providerOptions.gateway`: zero-data-retention routing, an
audited PROVIDER-SLUG allowlist, cheapest-provider-first, and a per-surface spend tag. Lite
still fails closed when the allowlist or the current price entry is missing.

Several OpenRouter directives have **no Vercel equivalent**, and their loss is a real
behaviour change rather than a rename:

| OpenRouter | Vercel AI Gateway | What carries it now |
| --- | --- | --- |
| `provider.zdr` | `gateway.zeroDataRetention` | Same guarantee, enforced gateway-side - see below |
| `data_collection: 'deny'` | `gateway.disallowPromptTraining` | Direct successor, and **free on every plan** - pinned on for every managed call, never configurable |
| `allow_fallbacks: false` | *(none)* | Subsumed: a retention filter narrows the routing set BEFORE any fallback is chosen, so no non-compliant provider is left to fall back onto |
| `require_parameters` | *(none)* | Nothing. It mattered because OpenRouter endpoints of one model differed; a gateway model slug resolves to providers serving one contract |
| `max_price` | *(none)* | **The server alone.** The approved-catalog price snapshot, `fundedRoutePrice`'s ceiling, and each task's `maxProviderCostUsd` booking. `sort: 'cost'` asks for the cheapest eligible provider, which is a preference, not a cap |
| `only` (endpoint names) | `gateway.only` (provider slugs) | Coarser, and no longer about retention - only about who runs the weights and at what precision |
| `x-title` / `http-referer` | `gateway.tags` | Better: attribution is queryable per surface in the spend report, where a header never was |

The `max_price` row is the one to keep in mind. A price that moved under us used to be refused
by the provider at request time; now it surfaces as a ledger overrun instead, so the audited
catalog snapshot has to be refreshed deliberately rather than trusted to expire.

### Retention: two filters, one free and one plan-gated

Managed calls send both, and the gateway ANDs them.

**`disallowPromptTraining` is the floor, and it costs nothing.** It routes only to providers
that do not train on the prompt - the direct successor to OpenRouter's `data_collection:
'deny'` - and it is available on **every plan**, so it is pinned on for every managed call and
is deliberately not configurable. Nothing can turn it off, including turning ZDR off.

**`zeroDataRetention` is the strict superset, and it is a Vercel Pro/Enterprise feature.** On
a plan without it the gateway answers `403 ZdrUnauthorizedError`, classified as its own
normalized code `zdr_unavailable` - distinct from `provider_rejected` because the fix is a plan
or an audited policy decision rather than a key. The provider body is READ to make that
distinction and never copied into an error or a log.

Keeping the two separate is what makes the floor survive: a deployment that cannot have ZDR
still gets no-training, instead of choosing between failing every call and sending prompts to
a provider free to train on them.

With ZDR required (the default), a plan that lacks it makes every managed Lite,
import-analysis and Pro call **fail closed**. Three server-only switches decide that, each an
explicit and audited choice: `AI_LITE_REQUIRE_ZDR`, `AI_IMPORT_ANALYSIS_REQUIRE_ZDR`, and
`AI_SURFACE_REQUIRE_ZDR` (NoaCG Pro). All default to on. A filter that no provider of the
requested model satisfies is a different failure - `400 no_providers_available`, reported as
`retention_unsatisfiable` - because a better plan will not fix it, though a different model
might.

Every catalogued route was **verified serving under ZDR on 2026-08-07**, one real call each,
recorded in `docs/MODEL_ROUTE_AUDITS.md` (the dated audit log - parked as a plan, live as the
record); `zdrAvailable` is that recorded result and nothing
else. The /admin Models page shows *verified* / *not verified* accordingly, and flipping one to
true stays reserved for whoever actually makes the verifying call.

The `AI_LITE_*` settings documented in `.env.example` are private Vercel environment
variables. `AI_LITE_ENABLED` defaults off. Production enablement also requires Supabase
authentication, the `0010_ai_generations.sql` and `0011_ai_lite_quality_feedback.sql`
migrations, a Supabase secret key, a managed gateway credential, an `IP_HASH_SALT` of at
least 16 characters, an audited gateway provider list, and - while `AI_LITE_REQUIRE_ZDR`
stays on - a Vercel plan that includes ZDR (Pro or Enterprise). Lite stays unavailable instead of falling back to an in-memory quota
ledger or the development IP-hash salt when that durable configuration is incomplete.

`scripts/check-client-secrets.mjs` rejects provider key names with a public build prefix and
secret-looking values in client source and the final browser bundle. Real-token benchmark
scripts use the server gateway and never seed provider credentials into localStorage.

## Structured output

The established harness schemas are sent through:

- Anthropic forced tools.
- OpenAI Responses `text.format` JSON schema.
- Vercel AI Gateway OpenAI-compatible `response_format` JSON schema.

Every parsed result is validated again on the server against the same schema before it reaches
DesignSpec or template code. A missing field, wrong type, unknown field where
`additionalProperties` is false, or malformed JSON is a normalized `malformed_response`.

**A TRUNCATED answer is reported as truncation, on every adapter.** Reasoning tokens are output
tokens: they count against `maxTokens` and they are spent BEFORE the model writes anything, so a
budget sized for the answer alone gets cut off mid-object and the half-JSON that arrives is
indistinguishable from a model that cannot follow a schema. Anthropic (`stop_reason`) and OpenAI
(`incomplete_details`) always checked their own signal; the Vercel adapter did not, and its
`finish_reason: 'length'` surfaced as a plain "invalid structured result" - which cost an hour of
instrumented diagnosis and five already-paid concept images on 2026-08-08
(`benchmarks/pro/round-2026-08-08/ROUND.md` §3). All three now report it in the same words, not
retryable, because a second attempt on the same budget truncates in the same place. Pinned by
`aiGateway.test.ts`, including a negative control so the guard cannot start swallowing good
answers.

Call sites build the budget with **`outputBudget(expectedAnswerTokens)`** (`src/ai/modelTypes.ts`),
which adds `REASONING_HEADROOM_TOKENS` on top - so a call states what its answer needs and nothing
has to remember that thinking is billed first. A literal `maxTokens` is the shape of the bug.
`NOACG_DEBUG_STRUCTURED=1` logs `finish_reason` and the usage block locally when a structured call
misbehaves; neither survives into the normalized result a caller sees.

The gateway normally uses JSON Schema response formatting. An audited managed route may
instead use a forced function tool when the model supports tools but not response formatting
(`AI_LITE_GATEWAY_STRUCTURED_MODE=tool`). The tool arguments pass through the same schema
revalidation before reaching the harness. `structuredOutputMode` is NoaCG's own field and is
never forwarded to the gateway as a routing directive.

The real-token Lite benchmark may use an explicitly enabled in-process ledger on a local
non-production server. Deployed Lite always requires the durable server ledger; the evaluation
override fails closed in production and on Vercel.

## Future adapters

A new bring-your-own-key provider is five things and no more: a `ProviderAdapter` (model it on
the Hugging Face one - same chat-completions shape, same parser, no second structured-output
dialect), an id in `AI_PROVIDER_IDS`, a `managedAiKey` entry, an `AI_PROVIDERS` row with the
label a user reads, and a listing in both `aiModelDiscovery.ts` and
`scripts/check-model-ids.mjs`. Google, added 2026-08-14, is the worked example.

Ollama, vLLM, and rented GPU inference are future `ProviderAdapter` implementations. They
must enter through the same server interface and normalized result contract. Local hosting,
model downloads, GPU lifecycle, queues, and worker orchestration are deliberately out of
scope for this phase. No local provider should create another Creative AI harness.
