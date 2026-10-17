# Model route audits

> **PARKED 2026-08-08 as a PLAN - superseded by `docs/AI_PROVIDER_GATEWAY.md` for live route
> and retention policy.** It is NOT superseded as a RECORD: this file is the dated evidence for
> every `zdrAvailable` claim, and `api/_lib/aiModelCatalog.ts`
> cite it by name. Keep appending audits here; do not read the surrounding narrative as strategy.

> **TRANSPORT CHANGED 2026-08-07.** Every audit in the *OpenRouter* sections below was
> performed against per-endpoint listings that answered "which endpoint of this model is
> ZDR-servable". Vercel AI Gateway answers that differently and later: it filters a
> `zeroDataRetention: true` request down to providers under a verified ZDR agreement and
> refuses when none qualifies. There is no per-model retention flag to read and nothing to pin
> by hand, so the old METHOD no longer applies and none of those audits transfers.
>
> The new method is one line long: **make the call and see whether it serves.** The
> gateway-era audit is recorded immediately below. Keep the older sections - they are the
> record of what was true on the old transport.

## 2026-08-07 - Vercel AI Gateway, every catalogued route

**What was measured.** One real `POST /v1/chat/completions` per route, carrying
`providerOptions.gateway = { zeroDataRetention: true, disallowPromptTraining: true }`, on the
team's own credential. The gateway reports what it did in
`choices[0].message.provider_metadata.gateway.routing.planningReasoning`, which is the
evidence quoted below - it names the providers considered and the ones that survived the
filter, so a pass is not inferred from a 200 alone.

| Route | Result | Served by | Gateway's own reasoning |
|---|---|---|---|
| `google/gemini-2.5-flash-lite` | ZDR OK | vertex | 2 attempts → 1 ZDR attempt; ZDR order: vertex |
| `google/gemini-2.5-flash` | ZDR OK | vertex | ZDR order: vertex |
| `alibaba/qwen3-coder-next` | ZDR OK | bedrock | served under ZDR + no-training |
| `openai/gpt-oss-20b` | ZDR OK | togetherai | 6 qualifying providers: togetherai → fireworks → deepinfra → parasail → bedrock → groq |
| `google/gemini-3.1-flash-image` | ZDR OK | vertex | ZDR order: vertex; real image generated, $0.067 |

All five are recorded as `zdrAvailable: true` in `APPROVED_MODEL_CATALOG`.

**What this does NOT establish.** Nothing about quality - that is the NoaCG benchmarks' job
(`docs/AI_LITE_PROMOTION.md`). Nothing about which provider serves a FUTURE call: the routing
set is re-evaluated per request, and `gpt-oss-20b` alone had six qualifying providers, so
"served by togetherai" is an observation rather than a pin. And nothing about a provider's
own published policy, which may differ from the agreement Vercel has negotiated.

**What would invalidate it.** Losing the plan feature (ZDR is Pro/Enterprise; the same call on
Hobby answered `403 ZdrUnauthorizedError`, which the gateway layer reports as
`zdr_unavailable`), or a provider agreement lapsing until no provider of a model qualifies
(`400 no_providers_available`, reported as `retention_unsatisfiable`). Both fail the request
closed rather than routing to a retaining provider, so a lapsed audit shows up as an outage
rather than as a quiet privacy regression.

**Separately: no-training is free on every plan.** `disallowPromptTraining` is the direct
successor to OpenRouter's `data_collection: 'deny'` and carries no plan gate, so it is pinned
on for every managed call and is not configurable. Verified the same day on the then-Hobby
plan, where ZDR was still refused: the no-training-only call served, reporting "all 2 attempts
disallow prompt training". That is what makes the retention floor survive a plan downgrade.

## 2026-08-12 - `inclusionai/ling-3.0-tiny-free` - Lite candidate, REJECTED

**Audited during the model's free window (through ~2026-08-14; it renames to
`inclusionai/ling-3.0-tiny` after, list price ~$0.06/$0.18 per M). NOT added to
`APPROVED_MODEL_CATALOG` - it cannot serve the Lite contract and cannot record a ZDR
verification, and the campaign context is `docs/AI_LITE_BRAND_PLAN.md` §4.**

**Method.** `node scripts/ai-lite-route-probe.mjs` - one real gateway call per probe through
the production request path (`liteSystemPrompt` + `retrieveLiteReferenceSet` +
`liteReadyOutputFor` + `liteRequestText` + `executeGatewayRequest`) on the locked
`history-lecturer` semantic fixture, `maxAttempts: 1`, plus raw-body replays via the probe's
`--dump-body`. The endpoints listing shows a single provider, `novita`, pricing all zeros
during the window, and `supported_parameters` carrying `tools`/`tool_choice`/`reasoning` but
no `response_format`. Sibling `inclusionai/ling-3.0-flash-free` listed **zero endpoints** the
same day - not servable at all.

| Probe | Result |
|---|---|
| `json-schema` mode, ZDR on | `provider_rejected` (502) |
| `tool` mode, ZDR on | `provider_rejected` (502) - **so ZDR is unavailable on this route** |
| `json-schema` mode, no ZDR | `provider_rejected` (502) - `response_format: json_schema` unsupported, matching the listing |
| `tool` mode, no ZDR, 1,500-32,000 token budgets | thinking mode consumed the whole budget (`finish_reason: length`; 90s timeout at 32k) |
| `tool` mode, no ZDR, thinking off, 1,500-6,000 budgets | `reasoning_tokens: 0`, still `length`: the forced `tool_choice` is IGNORED at production schema size - the model writes its own text-notation tool call in `content` (`[{"name": "emit_noacg_lite_design", "parameters": ...}]`) containing invalid JSON (`"speed": 1,5` - a decimal comma), then degenerates into a whitespace loop until the budget dies |
| Raw replays: temperature 0, and a default-temperature repeat | worse - prose deliberation in `content` (21-23k chars), zero tool calls, budget death both times |

A trivial forced tool call (one-property schema) DID return proper `tool_calls`, so the
failure is schema-size dependent, not a blanket tool-calling absence. Five probes on the real
prompt: 0 of 5 usable, three independent disqualifiers (no `json_schema`, unreliable forced
tools at contract size, no ZDR). Per the predeclared verdict rule in
`docs/AI_LITE_BRAND_PLAN.md` §4.5, the incumbent stays.

**What the audit bought anyway.** The diagnosis added a reusable transport control, measured
and tested: `GatewayRoutingPolicy.thinking: 'off'` emits
`chat_template_kwargs: { enable_thinking: false }` - the Ling/Qwen hybrid-inference Instant
switch (reasoning tokens 155 → 14 on the trivial probe; `AI_LITE_GATEWAY_THINKING=off` on the
Lite profile). The gateway ACCEPTS `reasoning: { enabled: false }` but novita ignores it; the
template kwarg is the one that works. Any future hybrid-inference candidate needs it.

**What this does not establish.** Nothing about the paid `inclusionai/ling-3.0-tiny` route
after the window - same weights, but a different serving is a different candidate identity
(`docs/AI_LITE_PROMOTION.md`); re-probe before considering it. Nothing about quality - no
probe produced a decision to judge.

The register of hand-performed audits behind `APPROVED_MODEL_CATALOG`
(`api/_lib/aiModelCatalog.ts`). `/admin` Models reports a route as **approved** only when it
has an entry in that catalog, and the catalog's `zdrAvailable` flag is an **audited fact, never
a discovered one** (`docs/ADMIN.md` §9) - the provider listing carries no per-model retention
flag. This file is where the "audited" part is written down, so a reader can check the claim
instead of trusting it.

One section per audit. An audit records what was measured, on what date, against what source,
and what it does **not** establish. Quality is never established here: only the NoaCG
benchmarks do that (`docs/AI_LITE_PROMOTION.md`).

## How a ZDR audit is performed

OpenRouter publishes two things this audit reads, both free public GETs that generate no
tokens:

| Source | What it answers |
|---|---|
| `GET /api/v1/models/<author>/<slug>/endpoints` | every endpoint serving the model, its price, context and supported parameters |
| `GET /api/v1/endpoints/zdr` | the subset of all endpoints that OpenRouter will serve under zero-data-retention routing |

A model is ZDR-servable when at least one of its endpoints appears in the second listing.
**Which endpoint that is matters**: `provider: { zdr: true }` narrows routing to the ZDR set,
so a model whose ZDR endpoint differs from its default endpoint behaves differently under the
flag - different context window, sometimes different supported parameters. An audit that reads
the default endpoint and then approves the ZDR flag has audited the wrong thing.

**A ZDR-servable model is not a ZDR-served model.** The routing directive has to be sent. It
is sent by the profile-owning surfaces (`api/_lib/aiLiteProfile.ts`,
`api/_lib/aiImportAnalysisProfile.ts`, which build a `GatewayExecutionPolicy` carrying
`zdr` and `data_collection`) and **not** by the generic `POST /api/ai/generate` proxy, which
calls `executeGatewayRequest(body, { keyFor })` with no policy argument at all. So for any
route reached through the generic gateway, "can it be served ZDR" and "is it being served ZDR"
are two separate questions and both belong in the audit.

---

## `google/gemini-3.1-flash-image` - NoaCG Pro concept route

**Audited 2026-08-02. Status: evidence complete, awaiting the owner's approval decision.**
Not yet in `APPROVED_MODEL_CATALOG`; `/admin` Models therefore shows it as *in use, eligible,
not audited*, which is the honest reading of the state before this file existed.

### What the route does and what it carries

`PRO_STANDARD_ROUTES.concept` (`src/ai/pro/contract.ts`). One image call per Pro generation,
on the NoaCG-managed key, tagged `surface: 'pro'` and gated on the `ai.pro` feature key.

What leaves the machine on this call is `proConceptPrompt(brief)`: the fixed design wording
plus **the graphic's two text lines and the user's free-text design brief**. On a real lower
third those two lines are a named person and their role - so this route carries third-party
personal data written by the operator, which is the reason retention is worth auditing rather
than assumed. Uploaded artwork does **not** reach this call (v1 sends text only); the
follow-on `interpret` call reads the *generated* concept image, downscaled.

### Measured evidence (2026-08-02, live listings)

`GET /api/v1/models/google/gemini-3.1-flash-image/endpoints` - two endpoints:

| Endpoint | Context | `prompt` /M | `completion` /M | `image_output` /M | On the ZDR list |
|---|---|---|---|---|---|
| **Google** (Vertex) | 131,072 | $0.50 | $3.00 | $60.00 | **yes** |
| Google AI Studio | 65,536 | $0.50 | $3.00 | $60.00 | no |

`GET /api/v1/endpoints/zdr` (703 endpoints on the day) contains
`Google | google/gemini-3.1-flash-image-20260528`.

So: **the model is ZDR-servable, on one of its two endpoints.** Asking for ZDR pins the call
to the Vertex endpoint and doubles the usable context; it does not change the price.

Supported parameters differ between the two, and the difference is worth stating because it is
exactly the trap the method section warns about: the **ZDR endpoint does not advertise
`structured_outputs`** (it lists `response_format`), while the non-ZDR AI Studio endpoint
advertises both. That does not block this route - the concept call asks for an image
(`expect: 'image'`, which sets `modalities: ['image','text']`) and requests no structured
output - but it means a catalog entry for this model must record
`capabilities.structuredOutput: false`, describing the endpoint ZDR routing would actually
select, not the one the default listing shows.

### Alternatives, for completeness

Image-output models with at least one ZDR endpoint on the same day: `google/gemini-2.5-flash-image`
($30.00/M image out), `google/gemini-3.1-flash-lite-image` ($30.00/M), `google/gemini-3.1-flash-image`
($60.00/M), `google/gemini-3-pro-image` ($120.00/M), plus `bytedance-seed/seedream-4.5`,
`microsoft/mai-image-2.5(-pro)` and three `krea/krea-2-*` endpoints. The current route is
therefore not the only ZDR option, and it is not the cheapest one - **which is a fact, not a
recommendation.** The route was chosen by the 2026-07-31 paid Pro round; nothing in this audit
re-opens that.

**NO NoaCG SURFACE CALLS AN IMAGE MODEL SINCE 2026-08-15.** Pro's concept-and-reconstruct engine
was retired by Phase A and deleted, the image route came off the hosted profile's funded list, and
the catalog entry stays as an AUDIT RECORD rather than as a route in use. Picking an image route
again is a fresh decision needing a fresh paid round, not a re-read of this table.

### Price ceiling

`FUNDED_ROUTE_PRICE_CEILING` is $1.00/M input and $5.00/M output. The text sides ($0.50 /
$3.00) clear it. **The $60.00/M image-output side is not measured against anything**, because
no ceiling for image work has been decided - the same gap `docs/ADMIN.md` §9 states for the
image tab. Approving this route does not close that gap and must not be read as having done
so. Observed Pro cost is ~$0.07-0.08 per generation end to end (`src/ai/AGENTS.md`), which is
the number that actually bounds the exposure today.

### The finding that changes the decision

**Pro traffic does not currently request ZDR, and cannot.** `api/ai/generate.ts` calls
`executeGatewayRequest(body, { keyFor })` with no `GatewayExecutionPolicy`, so no
`provider.zdr`, no `data_collection: 'deny'` and no endpoint pinning is sent on the concept or
the interpret call. `google/gemini-2.5-flash` - the interpret route, already in the catalog
with `zdrAvailable: true` - inherits the same gap: its flag was audited for the **Lite judge**
route, where `aiLiteProfile` does send the policy.

Recording `zdrAvailable: true` for the concept route while the requests go out without the
flag would put a privacy claim on the admin page that production does not honour. That is the
same defect shape §9 already forbids in the other direction ("it never reads *no*, which would
be an equally unfounded claim").

### Verified against the live provider, 2026-08-02

The audit above establishes that the model *can* be served ZDR. This section records that it
actually *is* - the claim was measured with real calls rather than left resting on a listing.

**Two text probes first** (`$0.0000111` total), carrying the exact block `surfaceRoutePolicy()`
sends - `zdr: true`, `data_collection: 'deny'`, `allow_fallbacks: false`,
`max_price {1.0, 5.0}`:

| Route | HTTP | Served by |
|---|---|---|
| `google/gemini-3.1-flash-image` (concept) | 200 | **Google** |
| `google/gemini-2.5-flash` (interpret) | 200 | **Google** |

`Google` is the ZDR-listed Vertex endpoint. The model's other endpoint reports as
`Google AI Studio` and is absent from `/api/v1/endpoints/zdr`, so the provider name in the
response is itself the evidence that ZDR routing selected the audited endpoint.

**Then one real concept generation** (`$0.067267`), adding `modalities: ['image','text']` - the
only thing a production call has that the text probe did not:

- HTTP 200, served by **Google**, `finish_reason: stop`
- one image, `image/png`, 956 KB, parsing cleanly as the data URL `parseImageDataUrl()` requires
- **1120 image tokens**, `$0.067267`

So the whole chain is now evidenced rather than argued: `api/ai/generate.ts` attaches the
directives (`aiGenerate.test.ts`, in the build gate), OpenRouter accepts them, and the audited
ZDR endpoint serves. **`require_parameters: false` is what makes the image case work** - with it
true, OpenRouter would filter on advertised parameters and `modalities` is not one, which is why
that field is false in the policy and why this call is the test of it.

**A measured per-image cost, as ONE measurement rather than a rule.** §9 of `docs/ADMIN.md`
declines to convert `image_output` per-million into a price per image, because the token count
varies by model and resolution and the listing does not publish it. That still holds. What this
call adds is a single data point: a 1920x1080-framed lower-third concept cost **1120 image
tokens**, which at the published `$60`/M is `$0.0672` - and the arithmetic matching the invoice
independently confirms the audited price is the right key (`image_output`, not `image`).

Worth knowing about the cost shape: **a failure here would have been free.** An unresolvable
provider filter errors before generating, so the charge only lands when everything already
works. That makes this probe cheap to repeat whenever the policy or the route changes.

### Recommendation

**Approve, conditionally: catalog the route and wire the policy in the same change.**

1. Add `google/gemini-3.1-flash-image` to `APPROVED_MODEL_CATALOG` with
   `openWeights: false`, `capabilities: { vision: true, coding: false, structuredOutput: false,
   contextWindow: 131_072 }`, `price: { inputPerMillion: 0.50, outputPerMillion: 3.00 }`,
   `zdrAvailable: true`, and a note pointing here.
2. Give the Pro surface a managed route policy - `zdr: true`, `data_collection: 'deny'`,
   `allow_fallbacks: false` - applied server-side in `api/ai/generate.ts` for
   `surface: 'pro'` on the **managed** key only. Never on the BYO branch: a user spending their
   own key on their own chosen model is not ours to route.
3. Re-audit `google/gemini-2.5-flash` under the Pro surface at the same time - it is the same
   gap on a route that is already approved.

Rejecting step 2 while accepting step 1 is the one combination this audit advises against: it
is the state that produces a false claim on the operator's screen.

**Approval is the owner's.** Nothing above promotes anything; the catalog entry is written only
after an explicit yes.
