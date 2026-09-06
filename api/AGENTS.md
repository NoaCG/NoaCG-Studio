# api - the server-only Vercel functions

Loaded alongside the root `AGENTS.md` when working in this directory. What each area does is in
the repository map (`docs/ARCHITECTURE.md` §8) and `docs/DEPLOYMENT.md`; this file holds the
platform behaviours that
every local gate passes and production does not.

**The common shape of every trap below: the failure is invisible where you look for it.** Three
of these left production stale for days while `main` stayed green and the Vercel dashboard looked
idle and healthy.

## A `[...path].ts` catch-all routes exactly ONE segment

Vercel's docs describe `[...slug]` as a catch-all over multiple segments. **This deployment does
not behave that way**, and the deployment is what serves users. A path one segment deeper never
reaches any code - Vercel answers its own `NOT_FOUND` page with a request id, not the app's JSON.

Measured 2026-08-14 against `https://noacg.studio`:

| path | result |
|---|---|
| `/api/ai/pro` | the app's own JSON 404 - **routed** |
| `/api/ai/pro/status` | platform `NOT_FOUND` - **never routed** |
| `/api/ai/lite/nonexistent` | Lite's own JSON 404 - routed |
| `/api/ai/lite/a/b` | platform `NOT_FOUND` |
| `/api/ai/tasks/import-analysis` | the app's 405 - routed |
| `/api/ai/tasks/import-analysis/status` | platform `NOT_FOUND` |

Do not argue with the probe. Design routes one segment under the catch-all, and `curl` a new one
against production before believing it exists.

## Vercel typechecks `api/` with the ROOT tsconfig

Not `tsconfig.api.json` - the root one, whose `lib` is `ES2020`. So any ES2021+ LIBRARY api
(`.at()`, `Object.hasOwn`, `Array.findLast`, `structuredClone`) typechecks locally and then fails
the production function build with `TS2550`.

Found 2026-07-30: `id.split('/').at(-1)` in `api/_lib/aiModelDiscovery.ts` landed in `d512f6e` and
**every production deployment failed from then on - twenty in a row** - while `npm run build`
stayed green throughout. Nobody noticed, because the repo was green and prod just silently stopped
updating. Fixed in `8ed762c` by using index arithmetic and dropping `tsconfig.api.json`'s `lib` to
`ES2020`, so the local gate reproduces what Vercel allows instead of being looser. `target` stays
ES2022 - the functions run on Node 24; only the TYPE surface is constrained.

**The signature:** `curl` a new route on prod and get Vercel's platform 404 (`NOT_FOUND` plus an
`arn1::...` request id) rather than your handler's JSON body. The route was never deployed; your
gate did not refuse it.

## A bad `vercel.json` fails BEFORE a deployment exists

2026-08-07: production sat on commit `7ec08a7b` while eight further commits landed on `main`. The
cause was one header source, `/join(/(.*))?` - an unnamed group inside an optional group is not
valid path-to-regexp, though it reads exactly like the `/(.*)` rules beside it.

**Vercel validates the config before it creates a deployment.** So there is no failed build, no
deployment row, and a project page that looks idle and healthy - which is why the owner reported
"no errors on the Vercel page". `gh run list` shows nothing either; no workflow of ours deploys.

When a commit has no deployment at all, read the GitHub commit status before suspecting a webhook:

```bash
gh api repos/NoaCG/NoaCG-Studio/commits/<sha>/status
```

`"Vercel" ... "Deployment failed."` with a `vercel.link/<class>` target naming the fault. **That
status is the only signal.** Reproduce locally with `@vercel/routing-utils`
(`getTransformedRoutes` + `normalizeRoutes`) - the same package Vercel validates with, which is
what `npm run check:vercel-config` does in the build gate.

## With `cleanUrls`, a rewrite must not point at a `.html` destination

2026-08-08: `{"source": "/join/:name", "destination": "/join.html"}` served `NOT_FOUND` on
production, so every audience link an operator copied from the Links panel was dead - while
`/join?p=<slug>` worked perfectly.

`cleanUrls` stores the page at its extensionless path and adds a 308 `/x.html` -> `/x` in the
REDIRECT phase. A rewrite runs AFTER the filesystem handle with `check: true`, re-entering routing
at the filesystem, BELOW that redirect - so `/join.html` matches no file and no route. Fix:
`"destination": "/join"`.

Nothing caught it because the pattern is valid, so `@vercel/routing-utils` accepts it; the dev
server's own plugin rewrites to the real file, so it works locally; and no e2e can see a
config-only fault. `check:vercel-config` now rejects an internal `.html` destination whenever
cleanUrls is on (`internalHtmlDestinations`), with a mutation test beside it.

**The three-second probe, no deploy needed:**
`curl -o /dev/null -w "%{http_code} -> %{redirect_url}"` on `/page.html`. A 308 to `/page` means
cleanUrls owns that path and `.html` is not addressable.

## The 12-function budget is discipline now, not a platform cap

The account moved to Vercel **Pro** (owner, 2026-08-16), so
`exceeded_serverless_functions_per_deployment` at 12 no longer applies. `check:function-budget`
still hard-codes `FUNCTION_CAP = 12` and stays in the build gate on purpose. A new route may be
its own function when a catch-all would be contorted - say so in the PR and raise the constant,
rather than silently exceeding it.

The consolidation that got here (2026-07-30, `56baae7`) moved handlers under `api/_lib/`, which is
not routed and so costs nothing. Deliberately standalone: `render/start` (carries `includeFiles`
for the Remotion bundle), `ai/generate` (300 s, 12 MB bodies), `render/cleanup` (cron target).
