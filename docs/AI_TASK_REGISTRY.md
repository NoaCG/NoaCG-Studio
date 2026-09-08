# AI task registry and approved-route model catalog

Two server-only modules; the browser never sees either. Together they are the gate every
NoaCG-funded model call passes: a task declares what it needs, and a route serves it only if
the approved-route catalog carries it. The transport itself is `docs/AI_PROVIDER_GATEWAY.md`.

## The task registry (`api/_lib/aiTaskRegistry.ts`)

A typed map `taskId -> TaskProfile`. `TaskProfile` is `LiteProfile` generalized
LITERALLY - and nothing more (no capability negotiation until a third harness needs it,
plan §13):

| Field | Meaning |
| --- | --- |
| `schema` | The task's structured output contract - identity + version, never the schema itself. The schema stays owned by the task's harness. |
| `tiers` | Who may run it: `anonymous`, `free`, `byo`, `paid`. Lite is `['free']`. |
| `limits` | Token budgets plus `maxImages` / `maxImageResolution` for vision tasks (Lite: 0 / null - logos ride the deterministic browser pipeline). |
| `timeoutMs`, `maxAttempts`, `retryLimit` | The bounded execution policy handed to the gateway. |
| `routePolicy` | Primary + explicit fallbacks, prices, gateway provider allowlist, ZDR requirement, structured mode, per-call cost ceiling, and `imageRoutes` (below). |
| `ledger` | Which ledger the task writes and the row discriminator (`ai_generations` pins its values with a CHECK constraint - a new value ships its migration in the same commit). |

The first registered task is **`lite-design-spec`**: a VIEW over `liteProfile()`, so the
`AI_LITE_*` environment stays single-sourced and the public `/api/ai/lite/*` endpoints
keep their URLs, request shapes, and behavior. Quotas, concurrency, fleet spend, and the
reservation ledger remain the policy layer (`aiLiteStore` + migrations 0010-0013); the
registry does not duplicate them.

The second is **`imported-graphic-analysis`** (plan §6): one server-owned vision call
over the user's downscaled artwork, proposal-only, behind
`AI_TASK_IMPORT_ANALYSIS_ENABLED` (default off). Endpoints
`/api/ai/tasks/import-analysis` (+ `-status`, `-outcome`), profile
`api/_lib/aiImportAnalysisProfile.ts`, browser harness `src/ai/importAnalysis/`
(contract + client + deterministic normalizer), UI = the Import Graphic Text step's
`AnalyzeProposalPanel` applying accepted suggestions as ordinary `DesignFieldSpec`s. Its
ledger rows ride `ai_generations` with `profile = 'import-analysis'` (migration 0015,
which makes usage counting and reservation PROFILE-SCOPED - one task's traffic never
consumes another's quotas or fleet budget). Quotas per ratified decision 3: 1 image
(downscaled to at most 1920x1080 client-side), 10 successful analyses/day, 100/month.
The launch route is settled by the vision benchmark (plan §8) before the flag turns on.

The third is **`pro-generate`** - hosted NoaCG Pro, behind `AI_PRO_ENABLED` (default off).
It is the one task whose model calls are made by the BROWSER pipeline through the generic
gateway proxy rather than by an endpoint of its own, because the pipeline that decides what
to ask for runs there. So the task splits in two: `POST /api/ai/pro-generations` opens a
RESERVATION against `ai_generations` with `profile = 'pro'` (migration 0044), booking the
whole generation's worst case, and `/api/ai/generate` admits each managed Pro call against
that reservation and settles its real provider cost into it
(`api/_lib/pro/managedCall.ts`). `/api/ai/pro-status` reports availability and the
allowance; `/api/ai/pro-outcome` records what became of the generation, never what it cost -
the server that spent the money writes that. Profile `api/_lib/aiProProfile.ts`, browser
session client `src/ai/pro/session.ts`, wire types `src/ai/pro/types.ts`.

**All three are SINGLE SEGMENTS under `/api/ai/`, and that is a platform constraint rather
than a style choice.** Measured on production 2026-08-14: a `[...path].ts` function here
routes exactly ONE segment. `/api/ai/pro` reached the shared table and answered its own JSON
404; `/api/ai/pro/status` never reached any code and got the platform's `NOT_FOUND`. The same
probe agrees across the tree - `/api/ai/lite/nonexistent` is answered by Lite's router while
`/api/ai/lite/a/b` is a platform 404. So a nested path costs a FUNCTION (Lite works only
because `api/ai/lite/[...path].ts` is one), and two spare against the Hobby cap of 12 is not
headroom to spend on a route table. `scripts/check-api-route-depth.mjs` is the gate.

**`imported-graphic-analysis` had the same break and is fixed the same way.** Its `/status` and
`/outcome` siblings were platform 404s; they are now `import-analysis-status` and
`import-analysis-outcome`, single segments under `api/ai/tasks/[...path].ts` like the analysis
call itself. Nobody had hit it because the task is flag-gated off. The gate reads BOTH sides of
the question from the tree - every `/api/` path named anywhere under `src/`, against the
catch-all directories under `api/` - so a new client file or a new function is covered without
the script being edited, and a path builder's interpolation counts as exactly one segment.

**Where the reservation binds.** It needs an accounts backend and the ledger. A self-hosted
instance with a gateway key and no Supabase has neither, so the requirement does not apply
there and managed Pro behaves as it always did. Where the ledger DOES exist, it binds
whether or not hosted Pro is switched on: on a deployment that can meter Pro spend,
unmetered managed Pro spend is exactly the thing being closed.

`taskConfigured(task)` is the fail-closed gate the Lite endpoints now call (generalizing
`liteProfileConfigured()`): every managed gateway route needs a current price and a provider
endpoint allowlist, and every free/anonymous-tier route must be a catalog-approved entry
that is also **funded-eligible** (below). A misconfigured route refuses with
`profile_not_configured` - never a silent fallback.

Free and anonymous tiers are exactly the tiers NoaCG pays for, which is why they carry
both constraints; `byo` and `paid` spend the caller's own money on routes they chose, so
neither the catalog nor the price ceiling applies to them. **Hosted Pro is labelled `free`
for that reason and not as a product claim**: it is the surface the product will charge
for, but until a user's money is what pays, NoaCG's is - and labelling it `paid` early
would switch the funded-route gate off on the most expensive surface in the tree.

### `imageRoutes` - which bound applies to a route that draws

Two rules here are built around reading a structured TEXT answer at a per-token price, and
both refuse an image entry on purpose: `approvedTextRoute` is false for one, and
`fundedModelRoute` answers no for every image entry because the funded price ceiling
measures input/output text tokens and **no ceiling for image work has been decided**
(docs/ADMIN.md §9).

Pro's concept route is a catalogued, audited, ZDR-verified image model, so it needs the
question answered rather than dodged. `TaskRoutePolicy.imageRoutes` names which of a task's
routes are called for image output. It does not waive a bound - it says which one applies:

- catalog approval is still required, unchanged;
- the per-token price ceiling does not apply, because it would clear or refuse the route on
  a rule that misses most of its bill;
- what bounds the spend instead is `maxProviderCostUsd`, **booked per generation** before
  the call and settled after it.

Absent (the default) means the task sends only text requests and both rules apply unchanged,
so Lite's and import-analysis's gates are byte-identical to before it existed. An UNDECLARED
image route is still refused, so this is not a general exemption.

## The approved-route catalog (`api/_lib/aiModelCatalog.ts`)

Entries `{ route, openWeights, capabilities {vision, coding, structuredOutput,
contextWindow}, price, zdrAvailable, notes }`, audited by hand at promotion time
(`docs/AI_LITE_PROMOTION.md`). The catalog's price snapshot is the base of Lite's price
table (`approvedModelPrices()`), so catalog and policy cannot drift; `AI_LITE_PRICING_JSON`
may adjust a price but cannot approve a route.

**`openWeights` is promotion-time preference metadata, never a per-request gate**
(ratified decision, plan §15.1): at benchmark parity the open-weight candidate wins the
route, but a superior proprietary model is never excluded for closed weights alone.

**The funded-route rule IS a gate** (ratified decision, plan §15.5 - *who pays decides the
route*). A route NoaCG funds must go through `FUNDED_ROUTE_PROVIDER` (`vercel`) and
price at or under `FUNDED_ROUTE_PRICE_CEILING` (1.00 in / 5.00 out per million). OpenAI
and Anthropic models are reachable only through a user's own sealed key, so they never
enter this catalog. Two layers enforce it:

- `fundedModelRoute(route, price?)` prices against the caller's **effective** table, not
  the audited snapshot, so an `AI_LITE_PRICING_JSON` override cannot move the free tier
  onto a route the project would not pay for.
- A catalog test refuses any entry that could never serve a funded route, so a
  non-gateway or over-ceiling addition fails the build rather than only failing later
  at request time.

Raise the ceiling deliberately (it is one constant plus its test), not to admit a single
model that just missed. Revisit the whole rule when there is revenue.

Live provider listings (current prices, context windows, availability) come from the
discovery module `api/_lib/aiModelDiscovery.ts` (`GET /api/ai/models`) - discovery is a
listing, not an approval.

## Adding a task (the checklist the second consumer followed)

1. Register the task id and its `TaskProfile` derivation in `aiTaskRegistry.ts`.
2. Approve its routes in the catalog (benchmark first; open-weight preference at parity).
   A task with a free or anonymous tier can only be approved onto a funded-eligible
   route - cheap and reachable through the managed Vercel AI Gateway transport.
3. If it writes `ai_generations` with a new `profile` value, ship the CHECK-constraint
   migration in the same commit (`root/version-every-persisted-format-ship-breaking`) - and
   keep older
   deployments working: Lite deliberately stays on its 0010-era RPC names so the code
   deploy never depends on the migration being applied first (`aiLiteStoreSupabase.ts`).
4. Rate-limit through `admitTaskIp(taskId, ipHash)` - per-task windows, pre-body, never
   an entitlement.
5. Gate the UI on the task's status endpoint (invisible offline and when disabled), on
   `needsSignIn`, and on the first-use disclosure notice (`useAiConsent`).
6. Pin the gate in `api/_lib/aiTaskRegistry.test.ts` (`scripts/run-ai-gateway-tests.mjs`,
   part of `npm run build`) and the UI's flag-off absence in a stub-first e2e spec.
