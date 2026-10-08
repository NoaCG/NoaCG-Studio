# The admin surface and the entitlement system

The private operator surface for NoaCG Studio: who may use what, why, and what the owner can
change without a redeploy. This document is binding for `src/entitlements/`, `src/admin/`,
`api/admin/`, and migrations `0017` onward.

Two things ship together here and must not be confused:

- **Entitlements** answer *what may this user do*. One pure resolver, consulted everywhere.
- **The admin surface** is the private UI and API that edits the inputs to that resolver, plus
  operational controls and an audit trail.

## 1. Posture

**Security is server-side, on every request, without exception.** The admin page is unlinked
and lives at its own URL, but that is convenience, not a control. Anyone may fetch the admin
bundle; it contains no data, no secrets and no schema. Every byte of admin data comes from
`api/admin/*`, and every one of those handlers re-verifies the caller.

**Unauthorized means 404, never 403.** A distinct "forbidden" answer confirms that an admin
system exists and that the endpoint is real. Absent token, invalid token, valid token with no
admin row, suspended admin, and unconfigured backend all return the same generic
`404 { error: { code: 'not_found' } }`. The page renders a plain "Not found" body in that case,
so an unauthorized visitor cannot tell `/admin` from a typo.

**There is no sign-in at `/admin`.** A sign-in form would confirm to anyone who typed the URL
that there is something to sign in to. The owner signs in through the normal app on the same
origin and then opens the page, which reuses that session. With no session, `/admin` is a 404
and stays one. For the same reason the page does not pre-check locally for a backend or a
token before calling the server: a second place deciding "may I be here" is a second thing
that can disagree with the first.

**Offline and self-hosted instances have no admin surface at all.** With Supabase env unset,
`isBackendConfigured()` is false, every admin endpoint 404s, and the page never leaves its
not-found state. The open editor grows zero auth UI - that contract (root `AGENTS.md`, "Auth
posture") is unchanged by anything here.

**The free core stays free.** `FeatureKey` deliberately contains no key for the editor, the
catalog, local preview, or the six local export targets. There is no lever in this system that
can paywall them, and adding one would contradict `docs/GOALS.md`. Cloud rendering, cloud sync,
hosted control, community and managed AI are gateable because they cost someone money to run.

## 2. The entitlement resolver

`src/entitlements/contract.ts` is a PURE module - no DOM, no `import.meta`, no `process.env`,
no Supabase - held to the same discipline as the render purity trio. It is imported by the
browser, by `api/`, and by the tests. `api/_lib/entitlements.ts` loads the rows with the
service key and calls it; nothing else decides access.

### Precedence

```
default plan  <  assigned plan  <  temporary grant  <  manual override
```

A suspended account short-circuits all four: every feature resolves false. Its plan and limits
stay visible so the admin page can show what reactivation restores.

Every resolved value is an `EntitlementValue<T>`: the value, its `source`, a display label, and
an expiry. **"Why does this user have access" is not a second query** - it is the field the
resolver already returned, which is what stops the admin page from ever explaining access with
a different rule than the one that granted it.

### The neutrality rule

A numeric limit of `null` means *inherit whatever the server already used*: the `AI_LITE_*`
environment configuration for AI, unlimited for storage and projects. Both built-in plans set
every number to `null`, so an instance with no plans, no assignments and no grants resolves to
exactly the behaviour the product shipped with. `api/_lib/entitlements.test.ts` pins this. It
must stay true - introducing entitlements is not allowed to quietly restrict anybody.

### Observe-only limits

`storageBytes` and `projects` are **measured and displayed, never enforced** in this release.
Nothing in the product has ever counted a user's bytes or projects, so there is no baseline
from which to choose a safe number, and an invented one could lock a real person out of saving
their work. `enforceableLimit()` returns null for them regardless of the plan value, so no
server path can act on one by accident. Enforcement is its own later, deliberate change.

### Feature keys

`ai.lite`, `ai.import-analysis`, `ai.pro`, `ai.video`, `ai.byo-key`, `render.cloud`,
`sync.cloud`, `community.publish`, `control.hosted`, `showchat`, `templates.beta`,
`templates.internal`.

Adding one means adding it to `FEATURE_KEYS`, `FEATURE_LABELS`, and both built-in plans - the
test fails otherwise, which is how an unlabelled or default-less key is kept out.

### Plans are data

`plans.key` is a free string. No code branches on a particular plan key, no plan name is
hard-coded anywhere, and a deployment can create, rename and archive plans without a release.
Exactly one plan row may carry `is_default`.

### A plan can name the email domains it covers

`plans.auto_assign_email_domains` (migration 0045). A signed-in user with **no explicit
`user_plans` assignment** inherits the plan whose domains include their email's domain.

It exists because `user_plans` and `user_grants` are both keyed on `user_id`, so **neither can
authorize somebody who has not signed up yet** - which is exactly the population a cohort is
made of. Granting a class access one person at a time means chasing each student after they
register, every course. A domain is the fact that is known in advance.

What it does NOT change:

- **Precedence.** A domain plan lands in the same slot an explicit assignment does, at the same
  rank. An explicit assignment beats it, a grant beats that, a manual override beats that, and
  suspension and the instance-wide kill switch still short-circuit everything. A domain widens
  WHO gets a plan; it never changes what a plan outranks.
- **The one-resolver rule.** The match happens inside `loadEntitlementRows`, so "why does this
  user have access" is still the `sourceLabel` the resolver returned. An env var read somewhere
  else would have been a second decider and a second answer.
- **Content-freeness.** The column holds a domain, never an address. The email is read
  server-side from `auth.users` with the service key and never leaves that function.

Two rules the schema enforces rather than documents: domains are **normalized on write**
(lowercased, `@` stripped, trimmed, deduped, junk dropped), and **one domain may belong to only
one plan** - `plan_email_domains` is a table whose primary key says so, kept in step by a
trigger, because a uniqueness rule spanning the unnested elements of an array column across
rows is not expressible as a Postgres constraint. Two plans claiming one domain would make the
resolver's answer depend on row order, the same non-determinism `0021` prevents for grants.

An **archived** plan is never inherited by domain. Its explicit assignments are somebody's
deliberate decision and keep working; sweeping a whole domain onto an archived plan is not.

`plans.billing` (`{amount_cents, currency, interval, external_price_ref}`) exists so a future
payment integration has somewhere to land. **No code reads it.** Billing is not built here.

### Grants and overrides are one table

`user_grants` with `expires_at` set is a temporary access grant; with `expires_at` null it is a
permanent manual override. They differ only in whether they end, and collapsing them keeps the
precedence order short enough to state in one line. A revoked, future-dated, expired, or
malformed-timestamp grant does not apply - a bad date must never widen access.

### What actually enforces each dimension

A control that writes a row and changes nothing is worse than no control, so this is the map
from a plan/admin dimension to the code that reads it. **Handler paths are the FILES, not the
URLs:** the Vercel Hobby plan caps a deployment at twelve serverless functions, so each area
routes through one catch-all (`api/ai/lite/[...path].ts`, `api/ai/tasks/[...path].ts`,
`api/admin/[...path].ts`, `api/render/[...path].ts`) and the handlers themselves live under
`api/_lib/`, where they cost no function slot. The URLs are unchanged.

| Dimension | Enforced by |
|---|---|
| `ai.lite` | `api/_lib/lite/generations.ts`, `judge.ts`, and `status.ts` (so the panel cannot offer what the endpoint would refuse) |
| `ai.import-analysis` | `api/_lib/importAnalysis/analyze.ts` + its `status.ts` |
| `ai.byo-key` | `api/ai/generate.ts`, on the BYO branch only, and only when a token was presented - account-free BYO must keep working |
| `ai.pro` | `api/ai/generate.ts`, on the `surface: 'pro'` discriminator the NoaCG Pro pipeline sets - the same mechanism, honest limit, and testability as `ai.video` below. It also gates `surface: 'spike'`, the bench-only Phase 0 surface (`docs/NOACG_PRO_PLAN.md` §0), which no user reaches and which exists to request forced-tool structured output: a bench surface belonging to Pro must not carry a weaker gate than Pro |
| `ai.video` | `api/ai/generate.ts`, on the `surface: 'video'` discriminator the video harness sets; the decision itself is `gatedFeature()` + `surfaceRefused()` in `api/_lib/entitlements.ts`, so it is testable without a verified token. It binds only a caller the server RECOGNISED - anonymous resolves defaults that carry no account feature, and account-free BYO video works today. See "Gating a surface on a shared endpoint" below for what the check can and cannot do |
| `render.cloud` | `api/render/start.ts` |
| `community.publish` | `community_pack_submit` refuses a community pack submission or update (`0080`). The older RLS gates on the closed gallery still stand: the two `community_templates_publish_*` gates + `community_assets_publish_insert` on the bucket (`0022`), with moderators exempt on UPDATE |
| `control.hosted` | RLS: the two `control_shows_hosted_*` gates, plus the owner check inside `control_send`, `control_stage` and `control_report` (`0022`) - the RPCs are where an existing page actually costs something |
| `showchat` | RLS: the two `shows_showchat_*` gates and `chat_submissions_showchat_update`, plus the owner check inside `show_accepts` (what the anonymous send-in policy from `0003` already tests) and `show_by_slug`, so the page agrees with the policy (`0022`) |
| `audience` | RLS-shaped, but through RPCs alone (`0035`): every audience write - submit, vote, moderate, set the state, open or close a round - resolves the production's owner and refuses on `feature_denied_for(owner, 'audience')`. The three tables have RLS on and NO policies, so there is no second path to gate. The join resolve is the deliberate exception: a denial folds into `open = false`, because a viewer holding a link should see a closed door rather than an error naming a feature they have never heard of |
| `sync.cloud` | **one path only**: the agent save door `POST /api/me/graphics` (`api/_lib/me/graphics.ts`), through `permits(principal, 'graphics:create')` - the permission rides on this feature (`src/entitlements/permissions.ts`). The browser's own sync is deliberately NOT gated - it would stop a user saving their OWN work, there is no paid tier, and suspension already covers the real need - so the System page's note says how far the switch reaches: it stops agent saves, not sync |
| `graphics:create` (a PERMISSION, not a feature - what a CREDENTIAL may do of what the account may do, `docs/AGENT_SAVE.md`) | `api/_lib/me/graphics.ts` via `api/_lib/principal.ts resolvePrincipal` -> `permits()`. A session carries every permission; a scoped agent key (migration `0050`, minted by `noacg login` through a one-time PKCE-bound code, listed and revoked under Settings → Account → Agent access) carries exactly this one. `playout:operate` is reserved and never granted to a key. The only enforced permission in this release (`ENFORCED_PERMISSION_KEYS`) |
| disabled model routes | `api/_lib/lite/generations.ts`, `judge.ts`, `importAnalysis/analyze.ts`, and the MANAGED branch of `api/ai/generate.ts`. Deliberately not the BYO branch: the switch exists to stop the platform's own spend, and a BYO caller spends their own money on a model they chose |
| AI allowances | `applyEntitlementToLiteProfile()` before the reservation RPC |
| render tier | `resolveTier(signedIn, entitlement.renderTier.value)` |
| render formats | `validateRenderRequest(m, tier, entitlement.renderFormats.value)` |
| template visibility | `api/_lib/templateVisibility.ts` -> `GET /api/me/entitlement` -> the wizard's Browse step and the community gallery |
| beta cohort | the same visibility resolver; membership is never sent to the browser |
| storage / projects | **nothing, deliberately** - observe-only, see above |
| `plans.billing` | **nothing** - stored for a future integration |

**A plan's `render_formats` REPLACES the tier's list** rather than intersecting it: "available
export formats" is a plan dimension in its own right, so a plan must be able to grant a format
its tier does not carry. The other caps stay orthogonal - granting ProRes does not also grant 4K
or five minutes. A plan naming only formats the build does not have falls back to the tier
instead of emptying the list, so a stale row costs one format rather than the feature.

### Gating a surface on a shared endpoint

`POST /api/ai/generate` is a general model proxy. The SPX harness, the brainstorm call, the
video harness and a bare prompt all arrive as the same shape, so "is this video" is not
something the server can read off the request - it has to be told. `AiGatewaySurface`
(`src/ai/modelTypes.ts`) is that telling: an optional, allowlisted `surface` field, stamped
onto every video call by `src/ai/video/videoGateway.ts` - the harness's one door to the
gateway, existing so a new video model call cannot forget the tag and silently stop being
gateable. An unrecognised value is REFUSED rather than dropped, because a dropped label reads
as "the general harness, which nothing gates".

That one-door rule is machine-enforced, in two kinds because neither guard covers the other's
ground. An eslint boundary (`eslint.config.js`, the `src/ai/video` regions) refuses a direct
`../modelGateway` import anywhere in the harness but `videoGateway.ts` itself - it binds call
sites nobody has written yet, which no test can. And the shared video mock (`e2e/_video.ts`)
asserts the tag on every gateway call it answers, with `e2e/video-surface-tag.spec.ts` naming
the contract and pinning the SPX side as untagged - which lint cannot, since the request
builder could drop the field with every import still legal. The failure mode both exist for is
silent: an untagged video call works perfectly and simply escapes the entitlement.

State the limit plainly rather than discovering it later: **the tag is client-supplied.** A
caller who omits it gets the ungated path, and no server-side signal can fix that - a proxy
that will run any prompt cannot know what the answer will be used for. What the check does
buy is real: suspension, a plan that withdraws video, and the instance-wide kill switch all
reach the product's actual video traffic, which is the difference between a switch and a row
nothing reads. A surface that needs enforcement stronger than this needs its own endpoint
with its own profile, the way `ai.lite` and `ai.import-analysis` have one.

### The four RLS-shaped keys: what SQL can and cannot enforce

`sync.cloud`, `community.publish`, `control.hosted` and `showchat` have no endpoint to gate.
Every one of them writes STRAIGHT FROM THE BROWSER through the Supabase client -
`backend/supabaseProvider.ts` (documents, assets), `community/communityData.ts`,
`control/hostedControl.ts`, `showchat/chatData.ts` - so RLS is the only thing in the path.
This section is the design decision for them, written before any migration exists.

**The rejected option is a resolver in SQL.** A `entitlement_allows(feature)` predicate reading
`user_accounts`, `user_plans`, `plans`, `user_grants` and `system_settings` is entirely
buildable - `0018` and `0020` prove the mechanics. It is rejected because it would be a SECOND
AUTHORITY on the one question this whole document exists to keep single: precedence, the
neutrality rule, both built-in plans, temporary-versus-permanent ranking and the
"a malformed date must never widen access" rule would all live twice, in two languages. And on
THIS project the drift could not be caught: the guard would be a differential test running the
SQL and `resolveEntitlement()` over the same matrix, which needs a live database, and there is
no database in CI - migrations are applied by hand with `supabase db push`. Unverifiable
duplication of an access rule is not a tradeoff, it is a defect with a schedule.

**Routing those writes through `api/` is rejected too**, and not on effort. Server code holds
the service key, which BYPASSES RLS - so it would replace a per-row guarantee the database
enforces with an application check that has to be right every time. It would also make every
document upsert a serverless round trip, rewriting the offline-first sync path for the sake of
a gate, and spend from the two remaining function slots.

**A cached resolved answer** - the server writing `(user, feature, allowed)` rows that RLS
reads - keeps one resolver but is a cache in front of access control. Nothing writes it when a
grant expires or a kill switch flips, and both fail modes are wrong: fail-closed locks people
out when a cache write fails, against the neutrality rule and the fail-open posture of
`api/_lib/entitlements.ts`; fail-open makes the gate decorative.

**What shipped (`0022`): only the PRECEDENCE-FREE ABSOLUTES are in SQL, and plan-level gating of
these keys plainly does not bite.** Four inputs win outright in the contract, so a policy testing
them can only ever deny what the resolver also denies:

1. suspension - already enforced, `is_suspended()`;
2. the instance-wide kill switch - `system_settings.disabled_features` contains the key;
3. a permanent manual override that DENIES - a `user_grants` row, `value` false, no `expires_at`,
   not revoked;
4. a TEMPORARY grant that denies, while it is in force (`0023`) - the same row shape with a live
   `expires_at`. It was excluded at first as precedence-bearing, since a temporary grant sits
   below a permanent override; `0021` is what made it safe, because with one active grant per key
   there can be no override sitting above it. Different reasoning from (3), the same conclusion,
   which is why one condition now expresses both.

Plans, defaults and every other use of expiry stay in TypeScript. That is the whole trick: the
part of an entitlement RLS can carry is the part with NO precedence to re-implement, and each
of the four is a single row test. The property that makes it sound is one-directional - the
SQL denial set is a strict subset of the contract's - so the two can never disagree in the
direction that matters, which is denying something the resolver allows.

**That subset property needed a precondition, and `0021` is it.** Two active grants for one key
used to resolve non-deterministically - the API inserted without checking, `user_grants` had no
uniqueness constraint, and `loadEntitlementRows` read the rows with no `ORDER BY` while the merge
is last-wins within a rank. Now the API refuses the clash with an actionable message, a partial
unique index makes the state unreachable, and the loader orders by `created_at` anyway so a
database that has not had `0021` applied still answers the same way twice. "A denying override
exists" and "the resolver denies" are the same statement again. **Note that `0021` must be
applied before any policy relies on it** - the index is the guarantee; the API check is only the
better error message.

**Scope, honestly.** Only three of the four are wired. `community.publish` and `showchat` are
moderation instruments - stopping an abusive account from publishing or collecting send-ins while
it keeps its own work, which is the surgical version of suspension. `control.hosted` costs server
resources and was cheap to wire beside them. `sync.cloud` gates a user from saving their OWN work;
there is no paid tier, the free core stays free (`docs/GOALS.md`), and the only real need is
already covered by suspension - so it stays deliberately unenforced rather than being wired
because the key exists.

**Each key has TWO doors, and gating only the first would have been decorative.** The browser's
own writes are RESTRICTIVE policies, in the additive shape `0018` established - the live ownership
rules are never edited, so a mistake can only deny too much and reverting is a `DROP POLICY`. But
the paths that actually cost something on an EXISTING show are the capability RPCs, which are
SECURITY DEFINER (so no policy applies to them) and are reached by anonymous callers holding an
unguessable slug (so the account being gated is the SHOW'S OWNER, not the caller). Those carry the
check inside the function instead: `show_accepts` - already the anonymous send-in policy's gate -
now also reads false for a denied owner (and `show_by_slug` reports the same, so the send-in page
renders its existing "submissions are closed" state instead of an open form that fails), and
`control_send` / `control_stage` / `control_report` refuse with 42501 before writing. Neither change exposes anything new: same signatures, same
grants, and both questions were already answerable by anyone holding the capability. The answers
only ever become more restrictive.

**Two exemptions and one non-effect, all deliberate.** MODERATORS are exempt from the
`community.publish` UPDATE gate, because otherwise flipping that switch off during an incident
would also freeze the takedowns that are the reason to reach for it. READS and DELETES are
untouched everywhere: a denied account still opens and exports its own work, an already-published
template stays up (a takedown is moderation, not an entitlement), and unpublishing or closing a
show down must never be the thing that gets blocked.

**The function split, and the disclosure it carries.** `feature_denied_for(uuid, text)` answers
about an arbitrary account, so it is revoked from every client role and never granted back - it is
reachable only from inside a SECURITY DEFINER function, where the definer's privileges apply. The
policies call the self-scoped `feature_denied(text)`, which must be granted to `authenticated`
(§7's constraint: a policy expression runs with the querying role's privileges). That grant means
a signed-in caller can ask about their OWN account and learn a denial is absolute rather than
plan-level. Two of the three branches are already public - `is_suspended()` is granted to
`authenticated`, `public_system_notice()` publishes the disabled list to everyone - so the only
new bit is "there is a denying override on my account", about a feature the caller can already
observe they do not have.

**The one edge where the subset property does NOT hold, stated rather than left to be found.** It
holds for every key these gates are pointed at, and would fail for an `ai.*` one: the legacy
`AI_LITE_OVERRIDE_USER_IDS` list widens a false back to true for `ai.` keys only (`contract.ts`,
the `envOverride` branch), so on such a key the contract could ALLOW where the predicate denies -
the single direction this design forbids. It costs nothing today, because the AI keys are gated at
their endpoints and no policy names one; `scripts/admin-security-migration.test.mjs` fails the
build if any gate is ever pointed at an `ai.*` key, so doing it would be a deliberate act rather
than an accident.

### The browser's own entitlement

`GET /api/me/entitlement` returns the caller's resolved answer, so the UI stops guessing from
"is there a user". Auth is optional (anonymous gets the anonymous defaults, not a 401), the
projection is FLAT - values without their sources, because "why" is an operator's question and
shipping it would tell every user which grants exist on their account - and it carries
`hiddenTemplates`, the keys THIS caller may not see.

It is a hide-list rather than a show-list on purpose: the catalog is code and already in the
bundle, so a show-list would enumerate hundreds of ids and would empty the catalog the moment
the endpoint failed. A hide-list degrades the safe way. `src/backend/myEntitlement.ts` caches it
keyed on the access token (signing in or out is exactly a token change, and keying avoids a
value cycle with `auth.ts`), and everything about it is UX - every gated path re-resolves
server-side.

## 3. Roles

`public.admin_users (user_id, role)` with roles `owner | admin | support`, ranked in that order.
`public.is_admin(min_role)` is the SECURITY DEFINER predicate for RLS; the API gate uses a
service-key lookup instead, so an RLS mistake cannot open an endpoint.

**Every predicate here is self-scoped: it answers about the caller, never about a named account.**
`is_admin` takes a minimum ROLE and resolves the subject from `auth.uid()`, and since `0020` so
does `is_suspended()`. Asking about someone else is a privileged question and lives in
`public.admin_user_suspended(user_id)`, which verifies `is_admin('support')` *before* it reads
anything and raises `42501` otherwise - the authorization is inside the function, so a future
mis-grant still cannot leak. `is_admin` and `admin_role_rank` are no longer executable by
`authenticated` at all: nothing called them, and PostgREST publishes every function a role may
execute as `/rest/v1/rpc/<name>`, so an unused one is standing surface that also confirms an
admin system exists.

**Before adding an admin-read policy, read this.** A policy expression is evaluated with the
privileges of the *querying* role, so a policy naming `public.is_admin(...)` requires that role to
hold EXECUTE on it - verified directly against a live database, where the failure is
`42501 permission denied for function`, not a quiet "no rows". Such a migration must re-grant
EXECUTE to `authenticated` in the same change. This is the same constraint that made `0020`
reshape `is_suspended` rather than simply revoke it: the nine suspension policies call it on
every write, so revoking it would have denied writes to every signed-in user.

The table is RLS-on with **no policies**, the pattern proven by `public.moderators` in migration
`0004`: invisible to `anon` and `authenticated` alike. The existing community `moderators` role
is left alone - it is a different job (gallery takedowns) with its own live-verified policies.

Bootstrap is `node scripts/admin.mjs grant <email> owner` run from a trusted machine with the
service-role key in the environment, mirroring `scripts/allowlist.mjs`. There is no
self-promotion path and no first-run "claim this instance" flow.

## 4. The route structure

| Route | Purpose |
|---|---|
| `/admin` | the page (Vite MPA entry `admin.html`), unlinked and `noindex` |
| `GET /api/admin/session` | who am I, and may I be here |
| `GET/POST /api/admin/users` | search, invite |
| `GET/POST /api/admin/user` | detail; state, plan and allowance changes |
| `GET/POST /api/admin/plans` | create, update, archive |
| `GET/POST /api/admin/grants` | grant, revoke |
| `GET /api/admin/overview` | the landing dashboard: activity, adoption, AI cost, operational health (§8) |
| `GET /api/admin/usage` | AI spend, failures, quota pressure |
| `GET /api/admin/models` | live model ELIGIBILITY against the funded-route rules (§9) |
| `GET /api/admin/quality` | what people kept, what they threw away, and what the prompt is nudged by |
| `GET/POST /api/admin/feedback` | the beta inbox and the satisfaction picture; triage (§10) |
| `GET/POST /api/admin/system` | model and feature toggles, maintenance notice |
| `GET/POST /api/admin/templates` | visibility, beta/internal marking, usage |
| `GET /api/admin/audit` | the log |

**`/api/admin/quality` is the only surface that shows the OUTPUT side of the ledger.** The
columns `0011_ai_lite_quality_feedback.sql` records - resolved chassis, intent facet, enumerated
discard reason - were already being read: `ai_lite_variant_quality()` feeds the Lite system prompt
as a tie-breaker (`api/_lib/lite/generations.ts`). So the signal was not unread, it was shaping
output where no human could see it. The section shows the priors the prompt is actually fed and,
separately, the same arithmetic *without* the sample floor, so signal that has not yet crossed
the threshold is visible rather than silently withheld. It stays content-free: ids, counts and
enumerated facets, never a brief or a generated graphic (`src/ai/AGENTS.md`).

Two routes sit outside the admin gate on purpose, and they share one serverless function
(`api/me/[...path].ts`, the same catch-all shape the other four areas use). **`GET
/api/me/entitlement`** answers only about its own caller - see "The browser's own entitlement"
above. **`POST /api/me/feedback`** is how a visitor tells us something (§10). Auth is optional
on both, because the editor has no login wall and neither question needs an account.

The page's sections mirror those endpoints: Overview, Users, Plans, Usage and cost, Output
quality, Feedback, Models, System, Templates, Audit. A `support` role sees all of them read-only; the controls are simply absent
rather than present-and-disabled, because a button that cannot work is a worse answer than no
button.

Every handler is wrapped by `withAdmin(req, minRole)` in `api/_lib/adminAuth.ts`, which:

1. verifies the bearer JWT through the existing `verifyUser()`,
2. looks the caller up in `admin_users` with the service key,
3. answers 404 for every failure mode, identically,
4. re-checks on every request - the admin surface has no session of its own,
5. burst-limits per IP and per actor in front of the body read,
6. writes an `admin_audit_log` row for every mutating call, in the same request.

## 5. The audit log

`public.admin_audit_log` records actor, actor role, action, target type and id, a summary, a
structured detail object, an IP hash, and a timestamp. It stays content-free of secrets in the
same sense as the AI ledgers: no tokens, no passwords, no prompt or template content.

**It is append-only by privilege**: `0030` revokes `update`, `delete` and `truncate` from
`service_role`, leaving `insert` and `select`, and asserts all five facts in a `DO` block that
refuses to apply if any of them is untrue. The table owner can still grant itself back through
the SQL editor - that keeps a genuine legal erasure request possible while making it an
out-of-band act somebody has to decide to perform, rather than something an endpoint can do by
accident.

**That claim was FALSE from `0017` until `0030`, and the reason is worth carrying forward.**
`0017` wrote `grant select, insert ... to service_role` and nothing else, which reads like a
restriction and is not one: Supabase configures `alter default privileges in schema public grant
all on tables to service_role`, so the table was created holding all seven privileges and a
narrower grant adds nothing on top of privileges that are already there. Measured on production
on 2026-08-02, five migrations later: `service_role` held DELETE, UPDATE and TRUNCATE the whole
time.

**"I only granted two privileges" is a different statement from "only two privileges exist",
and on this platform the second one needs its own REVOKE.** The gap survived five migrations of
review because each of them stated the property in a comment. `0028` found the identical defect
in `user_feedback` within a minute of being written, because it asserted the property in a `DO`
block instead - the migration refused to apply until the revoke was actually there.

**So: a privilege guarantee is only real if a migration asserts it.** State it in a comment and
it is a wish. `scripts/admin-security-migration.test.mjs` now fails the build if any migration
claims append-only for a table without revoking the three write privileges from `service_role`
and asserting the result.

Two omissions are deliberate rather than pending. **`funnel_events` keeps DELETE**: it takes a
row per page load, so it is the one ledger that will genuinely need retention pruning, and a
pruning job needs it - `0016` promises server-*write*-only, which is about who may write, and
that part is true. **`ai_generations` and `ai_gateway_requests` keep UPDATE**: their rows
transition through status and cost as a generation runs, and neither claims to be append-only.

## 6. Known limits, stated rather than papered over

- **Suspension is not instant for an already-issued access token.** A Supabase JWT stays valid
  until it expires (an hour by default). Three layers narrow the window: banning the user stops
  refresh, `is_suspended()` in the write RLS policies stops database writes immediately, and the
  API handlers check on every request. A suspended user holding a fresh token can still read
  their own rows for up to that hour. This is a property of stateless JWTs, not a bug to hide.
- **The admin bundle is public.** It must never contain user data, secrets, or a description of
  the schema. Reviewers should treat any such addition as a defect.
- **The user list pages the auth directory and aggregates in memory.** GoTrue has no search and
  no server-side filter, and the Supabase client cannot express a `GROUP BY`, so listing walks
  up to 2000 accounts and sums the 30-day ledger slice in JavaScript. That is the right trade at
  tens of accounts and the wrong one at ten thousand. The `truncated` flag in the response is the
  tripwire: when it starts coming back true, the fix is a database-side view, not a bigger page.
- **`AI_LITE_OVERRIDE_USER_IDS` is legacy.** It resolves as `env-override` and can only widen AI
  access, never remove it. It is removed one release after plans ship. **It is not only an access
  flag:** `liteProfileForUser` also raises a listed id's daily and monthly successes and starts to
  10,000 and its concurrency to at least 2, so every per-user Lite quota stops applying and the
  fleet daily spend ceiling is the only control left for that account.

## 7. Migrations

| Migration | Contents |
|---|---|
| `0017_admin_roles` | `admin_users`, `is_admin()`, `admin_audit_log` |
| `0018_entitlements` | `user_accounts`, `is_suspended()`, suspension added to existing write policies, `plans`, `user_plans`, `user_grants` |
| `0019_system_and_templates` | `system_settings`, `public_system_notice()`, `template_admin` |
| `0020_self_scoped_predicates` | `is_suspended()` loses its argument, the nine policies are repointed, `is_suspended(uuid)` is dropped, `admin_user_suspended()` replaces it for admins, `is_admin`/`admin_role_rank` come off the REST surface |
| `0021_one_active_grant` | pre-existing duplicate active grants are revoked (newest kept), then a PARTIAL UNIQUE index makes one active grant per `(user_id, kind, key)` unreachable |
| `0022_entitlement_absolutes` | `feature_denied_for(uuid, text)` (internal) + the self-scoped `feature_denied(text)`, eight RESTRICTIVE gates for `community.publish`, `showchat` and `control.hosted`, and the owner check inside `show_accepts`, `show_by_slug` and the three control write RPCs |
| `0023_temporary_deny_absolute` | the grant branch of `feature_denied_for` widens to cover a TEMPORARY denying grant while it is in force - safe only because `0021` guarantees no override can sit above it |
| `0024_admin_overview` | `admin_overview_window(from, to)`, `admin_overview_state()`, `admin_overview_mix(from, to)` - read-only aggregation for §8, off the REST surface; plus the two indexes they need (`funnel_events (user_id, event)`, `render_jobs (created_at)`) |
| `0026_overview_outcome_metrics` | corrects the three outcome/cost aggregates `0024` got wrong: `renders_failed` stops counting `expired`, `renders_completed` becomes `renders_delivered` (`complete` OR `expired`, since `complete` is transient), `ai_failures` narrows to `failed` with the refusals split out into `ai_declined`, and `ai_cost_usd` sums only rows that recorded a model so a reservation ceiling is never reported as spend. DROP-and-CREATE, since the column set changes - so it re-asserts the revokes and the grant the DROP discarded |
| `0027_internal_activity_scope` | `user_accounts.internal`, `admin_scope()` (raises on an unknown scope), `admin_internal_user_ids()`, and all three `admin_overview_*` functions re-created with a REQUIRED `p_scope`. Its self-check asserts that external + internal PARTITION all, against the live tables |
| `0028_user_feedback` | `public.user_feedback` - beta notes and generation ratings, the one table allowed to hold user-authored free text. Server-write-only like `funnel_events`; DELETE and TRUNCATE explicitly REVOKED from `service_role` (a grant-only line does not withhold anything on this platform - see §5); its self-check proves the lockdown, the message bound and the reason allowlist all actually bite, and it refused to apply until they did |
| `0030_audit_log_append_only` | revokes `update`, `delete` and `truncate` on `admin_audit_log` from `service_role`, making §5's append-only claim true for the first time - it had been false since `0017`, because a grant-only line withholds nothing against Supabase's default privileges. Asserts the result in a `DO` block, including that the log is still insertable and readable, so an over-tightened lockdown cannot ship either |
| `0035_audience_participation` | the audience plane: three tables with RLS on and NO policies, eleven slug-keyed SECURITY DEFINER RPCs, guard triggers (per-device and per-show caps, the shared `chat_blocklist` mask), and the `audience` kill switch inside every write. Its self-check refuses to apply unless the two UNAUTHENTICATED resolves return no show id, no other slug, no answer key, no tally and no device token, and unless the trigger functions are unreachable from `anon`/`authenticated` |
| `0036_audience_open_round_fix` | `audience_open_round` re-created with every column table-qualified. `0035` closed the previous round with an unqualified `closed_at is null`, which collides with the function's own OUT parameter of that name - a RUNTIME error (42702) no structural self-check could see, since a plpgsql body is resolved only when it runs. Its own self-check therefore CALLS the thing: it opens two rounds and closes one against a throwaway production, and asserts the state pointer follows both ways |
| `0032_variant_quality_external_only` | `ai_lite_variant_quality()` excludes accounts marked internal, so the Lite prompt stops tie-breaking on our own test discards - the same `user_accounts.internal` predicate `0027` uses, so the dashboard and the generator agree about who counts. CREATE OR REPLACE (signature unchanged, ACL survives); asserts that every pair it returns has at least one external contributor |

`0019` is also the one place the admin surface publishes OUTWARD. `public_system_notice()` is a
SECURITY DEFINER function granted to `anon` and `authenticated` that returns exactly two things:
the maintenance notice and the list of features currently switched off. Both are effects a
visitor already experiences, so publishing them lets the app explain itself instead of appearing
broken. Everything else in `system_settings` - beta cohorts, model routing - stays server-side.
The client reads it through `src/backend/systemNotice.ts` and renders `SystemNoticeBar`, which
returns null when there is nothing to say, no backend, or a failed lookup.

`0018` is the risky one: it edits live RLS policies on `documents` and `assets`. The change is
additive (`and not is_suspended(...)`), read access is untouched so a suspended user can still
export their own work, and a regression test covers the unaffected normal user.

`0022` is the second risky one, for the same reason and with the same answer: it adds live write
gates to four more tables, one storage bucket and four SECURITY DEFINER functions. Its `DO` block
asserts the grant every gate depends on, that the cross-user predicate is off the REST surface,
that all eight gates exist AND are restrictive (a permissive policy of the same name would widen
access, since permissive policies are ORed), and then actually flips the kill switch against a
synthetic caller to prove the predicate denies - restoring the setting on the way out, and rolling
the whole transaction back if any assertion fires.

`0020` touches those same live policies, so it carries its own proof rather than asking to be
trusted: a `DO` block impersonates an ordinary authenticated caller and asserts that the
self-check still evaluates (the grant the policies depend on is intact), that `is_suspended(uuid)`
is gone, that `admin_user_suspended` refuses a non-admin, and that `is_admin` is unreachable. Any
failure aborts the migration, so an instance cannot end up half-locked-down. The source side is
pinned offline by `scripts/admin-security-migration.test.mjs` in the build gate; both halves were
mutation-tested (removing a statement makes the matching check fire).

## 8. The overview dashboard, and what every number on it means

The landing section. It exists to answer four questions quickly - are people arriving, are they
making something, is anything broken, and what is it costing - and the whole design follows from
one refusal: **nothing on it is estimated**. Every figure is a count of rows the product already
writes. Where a question cannot be answered from those rows it is not answered; the page names it
under "Not tracked" instead, because an unexplained absence reads as a zero and a zero is
something an operator acts on.

### Where the counting happens, and why it is not the §6 pattern

Every other admin read pages a bounded slice into JavaScript and sums it there. That trade does
not survive `funnel_events`: it takes a row per PAGE LOAD, and the overview needs six windows of
it at once. So the counting is in SQL - `admin_overview_window`, `admin_overview_state` and
`admin_overview_mix` (`0024`), each a bounded indexed aggregate, all three SECURITY DEFINER,
revoked from every client role and reached only with the service key behind `requireAdmin`. The
handler issues a fixed number of small queries no matter how large the ledgers get.

A database that has not had `0024` applied answers `available: false` and the page says the
aggregation is not installed. It never renders a screen of zeroes, which would be
indistinguishable from an instance nobody uses.

### Whose activity: the scope, and why external is the default

**Every usage section counts OTHER PEOPLE unless told otherwise.** `?scope=` takes `external`
(the default), `internal` or `all`, on Overview, Usage and cost, Output quality and Feedback.

It exists because the dashboard was, in effect, a mirror. Measured on production before the
filter was built: **all 43 rows in `ai_generations`, 92 of 93 in `ai_gateway_requests`, all
three renders and four of six `activation` events** were produced by the operator's own accounts
while building and testing the product. Every AI number on the page was a number about us.

- **The mark is explicit, on `user_accounts.internal`** (`0027`), set from the account's own
  admin page and therefore audited like every other account change. It changes NO ACCESS
  whatsoever: nothing in `src/entitlements/` reads it and no policy names it.
- **It is deliberately NOT `admin_users`.** On this instance that would exclude *nothing* - the
  account that produced all 43 generations is a throwaway test account with no admin row, and
  the one account that has an admin row has produced none. Role and internal-ness are different
  facts and come apart in both directions.
- **It is deliberately not a list of emails in code either.** That is a second authority on
  identity, it drifts the day an account is added, it needs a deploy to change, and nobody can
  audit it.
- **External and internal PARTITION all**, which is what makes the filter checkable rather than
  merely plausible - `0027`'s self-check asserts it against the live tables for every additive
  count and both money columns.
- **The count of marked accounts is reported unfiltered**, on the page, beside the control. Zero
  marked accounts means the filter is inert, and an operator has to be able to see that.

**The honest limit, stated on the page as well.** An account-keyed ledger filters exactly:
`ai_generations`, `ai_gateway_requests`, `render_jobs` and `auth.users` all carry a user id.
**The funnel does not**, for most of its rows. A browser is excluded when it has ever carried an
internal user id on a funnel row - which reaches our own signed-in browsing and does NOT reach
signed-out development traffic, because nothing distinguishes it from a stranger's. Every funnel
figure under `external` is therefore an upper bound on external activity, in the same direction
as the opt-out and Do-Not-Track floor `docs/FUNNEL_EVENTS.md` already documents.

Note the direction of the one identifier link this makes: visitor -> "is internal" is used only
to REMOVE rows from a count. Nothing associates a visitor with an account in any output, and no
row is written by it - which is why it does not breach the cross-identifier refusal that
document makes.

**`priors` on Output quality is the one figure the scope does NOT touch**, and that is
deliberate: those are literally the rows the Lite prompt is being handed, so a filtered copy
would describe a prompt nobody is running. What the page reports instead is how much of that
evidence is internal.

**That question is now settled at the source (`0032`): `ai_lite_variant_quality()` itself
excludes internal accounts.** It was decided rather than defaulted, because it changes
production GENERATION behaviour rather than a dashboard. The reasoning: the loop exists to
learn from what USERS keep, and on this instance not one row was a user's - 43 from a throwaway
test account plus 30 from the fallback bench, all of it the developer's own regenerating. A
chassis crossing the sample floor would have been the product tie-breaking on its own testing,
and every bench round made that signal stronger while the eventual real signal got weaker.

**The immediate effect is that the prompt receives no priors at all, and that is correct rather
than a regression.** The feature has no user data yet; feeding it ours is not a weaker version
of it but a different one nobody asked for. `lite/contract.ts` already treats an empty prior set
as normal - it is a tie-breaker applied only after brief, intent and chassis fit - so nothing
downstream changes and no generation can fail for want of one.

**Measured after applying it, and it corrects the framing above: the loop was LATENT, not
active.** Zero rows were ever prior-eligible. A generation only becomes one at
`status = 'accepted'` or `rejection_reason = 'user_discarded'`, and those are written when a
person creates a project from a result or explicitly throws it away - neither of which a
benchmark run does. All 73 rows sat at `usable`, `failed` or `unsupported`, so the prompt was
being fed nothing before `0032` and is being fed nothing after it. What the migration actually
buys is that the FIRST accepted internal generation does not silently start steering the
prompt. It prevents rather than cures, and the distinction is worth keeping straight: an
earlier draft of this section implied the generator was already leaning on our discards, which
the data does not support.

It uses the same `user_accounts.internal` predicate as the scope above, so the dashboard and the
generator cannot disagree about who counts as ours. The `internalPriorRows` figure stays on the
page: it is now the answer to "how much evidence is being correctly withheld" rather than a
warning.

### Time: the one thing two people could otherwise read differently

**Boundaries are local midnight in the reporting timezone**, `ADMIN_REPORT_TIMEZONE` (default
`Europe/Helsinki`). Postgres stores UTC and the function runs UTC, so a boundary picked
implicitly by either would file 01:00 Helsinki activity under the previous day. `periods.ts`
computes the instants and the SQL is told two of them - the timezone lives in exactly one place,
and `periods.test.ts` pins it, including both Helsinki DST changes.

- **Today** = from local 00:00. **This week** = from local Monday 00:00 (ISO). **This month** =
  from the local 1st at 00:00.
- **Every window ends at the moment the page was generated**, so nothing is ever counted over
  time that has not happened.
- **The comparison is the same ELAPSED span one period earlier.** Three days into a month is
  compared with the first three days of the previous month, never with a whole one - otherwise
  every month would show a collapse and then a recovery, both artefacts. The comparison span is
  clamped so it can never run into the current window (31 March against February).
- **Changes are absolute differences, not percentages.** At this instance's volume 2 to 3 is a
  50% rise, and a page that says so cries wolf every morning.
- A window with no comparable span reports "no comparison" rather than a zero.
- **A comparison span older than a metric's own ledger is withheld** ("partial history"). On an
  instance whose funnel is days old, last month is mostly a stretch of time nothing was
  recording, so the difference would render as growth when what changed is that counting began.
  The value is still shown; only the change is suppressed.

  **It is withheld PER LEDGER, not per window**, and that distinction is the whole point: these
  ledgers were switched on months apart (on this instance, accounts 6 July, renders 12 July,
  generations 27 July, funnel and gateway 29 July). A single flag would have to be driven by the
  youngest, so a young funnel would suppress a registration trend that the account directory
  evidences perfectly well. Every metric therefore declares its `AdminLedgerId` - a REQUIRED
  field, so a new metric cannot quietly inherit somebody else's history - and only the rows
  counted from a short ledger lose their comparison. A ledger with no rows at all is left alone:
  it reports zero on both sides, and zero against zero is a true "no change".

### The metrics, and the exact definition of each

Four SHAPES, never mixed and never rendered as the same kind of tile: an event count, a count of
distinct browsers, a count of accounts, and an amount of money. The unit rides every row.

| Metric | Shape | Source | Definition |
|---|---|---|---|
| New accounts | accounts | `auth.users.created_at` | An account row created in the window. An invitation counts when it is SENT, because that is when the row exists. Not the funnel's `signup`, which is email-path-only and would miss every OAuth account |
| Active visitors | browsers | `funnel_events` | Distinct `visitor_id` with any event in the window. A browser, not a person: one human on a phone and a laptop is two |
| Active signed-in accounts | accounts | `funnel_events` | Distinct non-null `user_id` in the window. The only unique-PERSON figure this ledger can honestly give |
| Page loads | events | `funnel_events` | `visit` + `return` rows |
| Graphics created | events | `funnel_events` | `activation` rows whose `detail` is not `video`. One per create, through any door. Not deduplicated per person - that is what "visitors who created something" is for |
| Video projects created | events | `funnel_events` | `activation` rows with `detail = 'video'`. **Only recorded from the release that added the event**; earlier periods read zero because nothing was counting |
| Visitors who created something | browsers | `funnel_events` | Distinct `visitor_id` with an `activation` in the window |
| First-time creators | browsers | `funnel_events` | Of those, the ones with NO `activation` anywhere before the window. Returning creators is the remainder, so the two always sum to the whole |
| Created while signed out / in | events | `funnel_events` | `activation` rows split on `user_id is null`. They sum to graphics + videos |
| Graphics created without an account | events | `funnel_events` | `activation`, not `video`, `user_id is null`. A SUBSET of "graphics created", never an addition to it |
| People creating without an account | browsers | `funnel_events` | Distinct `visitor_id` among those - so one prolific anonymous visitor is not read as adoption |
| Exports completed without an account | events | `funnel_events` | `export` rows with `user_id is null` |
| AI calls with no account at all | events | `ai_gateway_requests` | `user_id is null`. **Independent of the byo/managed split** - anonymity and whose key paid are separate facts, and prod already has an anonymous call on the managed key. Hosted Lite generation can never appear here (`ai_generations.user_id` is `NOT NULL`) |
| Exports completed | events | `funnel_events` | `export` rows, written after the package reaches the disk. **Every row is a success and there is no failure counterpart**, so no export success RATE exists |
| Lite generations started / usable / failed | events | `ai_generations` | Reservations, then `status in ('usable','accepted')` and **`status = 'failed'` only**. They do not sum: one still running is none of them |
| Lite briefs declined as out of scope | events | `ai_generations` | `status = 'unsupported'` - Lite refusing a multi-graphic, advanced-state-machine or too-complex brief. **The guardrail firing, so never counted as a failure**; worth watching as demand for what Lite cannot do yet |
| Accounts using Lite | accounts | `ai_generations` | Distinct `user_id` in the window |
| Lite spend (ours) | USD | `ai_generations.provider_cost_usd` | Summed **only over rows that recorded a model**. A generation that never reached a provider still carries the reservation's cost CEILING, which the fleet-budget check books up front on purpose - counting it overstated spend 6.5× on this instance |
| Gateway calls on our key / on a user key | events | `ai_gateway_requests.key_source` | `managed` versus `byo`. **The BYO half is the user's own money and is never added to a spend figure** - the two tables are separate for exactly this reason (`0012`) |
| Cloud renders submitted / delivered / failed | events | `render_jobs` | All three by SUBMISSION time, so a job submitted inside a window and finished after it is started here and delivered nowhere. That is why they are counts and not a rate. **Delivered = `complete` OR `expired`**; **failed = `failed` only** - see the `expired` note below |
| Render time | duration | `render_jobs` | Median of `updated_at - created_at` over jobs whose output is STILL LIVE (`complete`). It cannot widen to the delivered set: expiring a job overwrites `updated_at` with the deletion time, so an aged-out render would report the age of its file rather than how long it took. Null - not zero - when no live output falls in the window |

**"Made without an account" is its own table**, because the editor has no login wall (root
`AGENTS.md`, "Auth posture") and how much of the product's value reaches people who never sign up
is a product answer rather than a footnote. Every row in it is a SUBSET of the tables above, which
the page states so nobody adds the two together.

Standing figures, not windowed: total accounts, suspended accounts, active grants, grants
expiring within seven days, renders in flight, renders overdue (past their own deadline and still
not terminal - the sweep missed them), and the first row date of each ledger, one per ledger.

### The honest caveats, stated on the page as well as here

- **"Never created anything" is an upper bound.** It counts creates ATTRIBUTED to an account, and
  attribution only happens when the person was signed in at the time. The editor needs no
  account, so somebody who built a graphic before registering is counted as never having created
  one. Closing that gap would mean joining a browser id to an account, which is precisely the
  cross-identifier link `docs/FUNNEL_EVENTS.md` refuses to build.
- **The funnel is inert for anyone self-hosting, opted out, or sending Do Not Track**, so every
  activity figure is a floor rather than a total.
- **Partial history is visible.** Each ledger's first row date is on the page; a window reaching
  back further than one of them reads as zero because nothing was counting yet.
- **Per-template and per-category usage does not exist.** The creation event records the DOOR
  (`template`, `design`, `ai`, `blank`, `import`, `kit`, `video`), never the variant. The
  Templates section says so rather than showing a zero - it used to run a query against columns
  `funnel_events` has never had, which errored on every request and reported every template as
  unused.
- **Retries, repairs and duplicates.** A Lite retry is the SAME `ai_generations` row (the
  reservation is idempotent per `(user_id, idempotency_key)`, and `attempt_count`/`repair_count`
  live on it), so retrying does not inflate the generation count. A create or an export that the
  browser reported twice WOULD be two rows; the funnel has no dedup and none is invented here.
- **Deleted projects are not subtracted.** These are event ledgers: a graphic that was made and
  later deleted was still made. Nothing here counts what currently exists.
- **A terminal state meaning "the system did its job" must never be counted as one meaning "the
  system broke."** `0024` made this mistake three times and it is worth stating as a shape
  rather than as three bugs, because the next metric added here can make it again. A render's
  `expired` is a delivered render whose file aged out. A generation's `unsupported` is Lite
  *correctly refusing* an out-of-scope brief. Both were folded into failure counts, and both
  produced exactly what this page exists to prevent: a number sending an operator to investigate
  a subsystem that is working. Production read "0 completed, 6 failed" about rendering that had
  delivered four of six, and 26 AI "failures" of which seven were refusals the product is
  designed to make. All corrected in `0026`. **When adding an outcome metric, enumerate every
  value the status column can hold and say which of them mean failure - do not pattern-match a
  set that looks terminal.**
- **A reserved cost is not a spent cost.** `reserve_ai_lite_generation` books the session cost
  ceiling into `provider_cost_usd` up front so the fleet-budget admission check is conservative.
  That is right for admission and wrong for "what did this cost us": a generation that dies
  before reaching a provider keeps the ceiling forever. Spend is therefore summed only over rows
  that recorded a model. `0024` did not, and overstated by 6.5×.
- **Both rules live in TWO places, and `0026` only reached one of them.** The overview
  aggregates in SQL, but **Usage and cost** (`api/_lib/admin/usage.ts`) reads `ai_generations`
  straight through PostgREST and classifies in JavaScript - so the migration could not correct
  it, and for a day prod showed `26 failed` and `$0.09` in one section beside `19 failed`,
  `7 declined` and `$0.01` in another, off the same rows. Its `FAILURE` set and its spend sum
  now mirror `0026` exactly, with the vocabulary enumerated in the file. **A metric that exists
  on more than one surface has to be changed on all of them: a migration fixes only the
  surfaces that aggregate in the database.** The fleet-ceiling bar is the deliberate exception -
  it counts every reservation at its ceiling because that is the sum
  `reserve_ai_lite_generation` compares against (`0013`), and a bar that read lower than the
  number doing the refusing would explain nothing on the day generations start being refused.
- **A render's `expired` state is a SUCCESS, not a failure.** `expired` is written in
  exactly one place - `api/render/cleanup.ts`, in the branch guarded by
  `job.state === 'complete'` - so it is unreachable except from completion, and means "finished,
  was downloadable, and the TTL cron has since deleted the blob and kept the row for
  accounting". Counting it beside a genuine `failed` reported four delivered renders as
  failures. The mirror-image half of the same mistake: `complete` is TRANSIENT, so a "completed"
  count built on it decays toward zero on a healthy instance - which is why the honest question
  is "did it ever finish" and the column is `renders_delivered`.

### The daily AI budget bar

Measured the way the RESERVATION function measures it - a **rolling 24 hours over the Lite ledger
alone** (`ai_lite_usage`, `0010`) - and not as the calendar day the windows above use. The ceiling
comes from the live profile rather than a number copied into the UI. A bar drawn against a
differently-measured ceiling would mislead exactly when it matters.

### Content-free, like everything else here

Counts, ids, enumerated slugs and money. No prompt, brief, project name, template body, imported
asset or free-text feedback can reach this response - the ledgers it reads deliberately cannot
hold any (`docs/FUNNEL_EVENTS.md`, `src/ai/AGENTS.md`). The only strings rendered from a ledger
are the enumerated distributions, whose keys are server-written slugs: a creation door, an export
target id, a render format, a rejection code. `funnel_events.detail` additionally carries the
`0016` CHECK constraint that makes free text impossible at the table.

## 9. Model eligibility

`GET /api/admin/models` joins the live provider listing (`aiModelDiscovery.ts`) with this
repository's audited approved-route catalog (`aiModelCatalog.ts`), and answers one mechanical
question: could a NoaCG-funded route point at this model at all?

- **`approved`** - an audited entry in `APPROVED_MODEL_CATALOG`. **`eligible`** - the listing
  clears every check but nothing here has audited or benched it. **`ineligible`** - at least one
  check fails, and the row says which.
- The checks are `FUNDED_ROUTE_PROVIDER`, current availability, structured-output support, and
  the `FUNDED_ROUTE_PRICE_CEILING` applied to each side independently so a cheap input cannot
  subsidize a dear output. An unpriced model is blocked rather than treated as free.
- **Zero-data-retention is an AUDITED fact, never a discovered one.** The listing carries no
  per-model retention flag - routing asks for ZDR per request, and whether a model can actually
  be served that way is checked by hand at promotion. Anything outside the catalog reads "not
  audited"; it never reads "no", which would be an equally unfounded claim in the other
  direction. **The audits themselves are written down in `docs/MODEL_ROUTE_AUDITS.md`**, one
  section each, so the badge can be checked rather than trusted; a `zdrAvailable: true` entry
  whose notes point nowhere fails `aiGateway.test.ts`.
- **"ZDR-servable" and "served ZDR" are two facts, and the second one is code.** The routing
  directive has to be sent, and `POST /api/ai/generate` sent none until
  `api/_lib/aiSurfacePolicy.ts` existed: the profile-owning surfaces (Lite, import analysis)
  build a policy, and everything reached through the generic proxy did not. That module maps a
  tagged surface to its MANAGED-key policy - `zdr`, `data_collection: deny`, no provider
  fallback - and today only `pro` is in it. Video is deliberately absent: its routes are
  user-selectable and unaudited, so a no-fallback ZDR pin would refuse the ones with no ZDR
  endpoint and turn a privacy improvement into an outage. BYO is excluded everywhere, on the
  same line the disabled-route switch draws.
- **The catalog is no longer text-only, and `outputs` is what keeps that honest.** Cataloguing
  the Pro concept route (an image model) broke two invariants that had silently assumed every
  entry was a text one: a registered task's route must decode structured output, and an
  approved route absent from the text listing is an outage. Both were true of every entry until
  they were not. `ApprovedModelEntry.outputs` declares the kind, `approvedTextRoute()` stops an
  image route being pointed at a Lite task, `fundedModelRoute()` refuses one outright (the
  ceiling measures text tokens and misses the `image_output` price that dominates its bill),
  and `missingApprovedRoutes()` reads text entries only so the image route is not reported as
  permanently vanished.
- An approved route the provider has stopped listing is reported as an outage, because the free
  tier fails closed on a route it cannot reach.

**None of the three verdicts is a statement about quality, and the section says so above the
table.** A price table with capability ticks reads like a shortlist unless it is told not to.
Nothing here has generated a token: discovery is a cached GET against a public listing, so
opening the page can never cost money, and no benchmark can be triggered from it. Quality on this
project is established by the NoaCG benchmarks and by nothing else
(`docs/AI_LITE_PROMOTION.md`) - so there is no score column, no ordering by merit and no
"recommended". A provider outage costs this section alone; the rest of `/admin` reads this
instance's own data and is unaffected.

### Sorting, and why it does not breach the no-ranking rule

The table opens in a fixed reading order - approved, then newly discovered, then the rest
alphabetically - and the operator may then sort by route, either price, or context length.
**The rule forbids the PAGE holding an opinion about which model is better, not the operator
asking a question.** Sorting is never the initial state, there is still no score to sort by,
and the arrangement is the reader's own. What would breach the rule is arriving pre-ranked.
Missing values sort last in both directions: an unpriced model is unmeasured, not cheap, and
floating it to the top of an ascending price sort would read as "the cheapest".

### In use is not the same fact as approved

`approved` means "audited, and we may point traffic here"; `usedBy` means "traffic is going
here right now", read live off the task registry (`api/_lib/aiTaskRegistry.ts`) rather than any
table, so it cannot drift from what the gateway obeys. The two come apart in both directions -
an approved route can carry nothing, and **a fallback carrying traffic means the primary is
failing** - which is why both are shown rather than treating approval as deployment.

**Two sources, because the product has two mechanisms**, and both are imported rather than
copied: the task registry for the registered tasks (Lite, import analysis), and
`PRO_STANDARD_ROUTES` for the Pro tier, which pins one curated route per stage and goes through
the generic gateway instead of the registry. That constant lives in the dependency-light
`src/ai/pro/contract.ts`, NOT beside the pipeline that calls it, because `api/` cannot import
`src/ai/pro/pipeline.ts` - that pulls in the gateway, telemetry and the canvas-bearing
compiler. `pipeline.ts` re-exports it, so existing call sites are unaffected. A second copy in
the admin layer would name the wrong model the first time either is re-benched.

`slot` is present only where the distinction exists. A Pro stage pins one route with nothing
behind it, so those rows carry no slot at all - calling one "primary" would invent a spare that
does not exist.

### The image tab carries no verdict, on purpose

`GET /api/admin/models?output=image` lists what the provider serves for image output. **NoaCG Pro
no longer makes an image call at all** (2026-08-15) - the menu stays because the funded route list
still carries the retired concept route and because an image ceiling remains undecided either way.
It has **no eligibility verdict, no blocks and no
eligibility language at all**: `FUNDED_ROUTE_PRICE_CEILING` was set against text generation and
no ceiling for image work has been decided, so applying it here would mark usable models
ineligible against a rule nobody has written. Until such a ceiling is set deliberately, this is
a menu and not a judgement.

**READ THE DATE ON THIS SECTION.** Since 2026-08-15 a Pro generation is ONE text call for a design
language and no image at all (`docs/NOACG_PRO_PLAN.md` §15-16), measured at **~$0.0055** on the
2026-08-15 round. The account below describes the concept-and-reconstruct engine, RETIRED and
DELETED from the tree on 2026-08-15, and is kept because the ceiling and the image-route menu
above were sized against it - and because 86% of that bill being one flat image charge is the
number that argued for replacing it. **The funded route list no longer includes the image route**:
every funded route is ANDed by the availability gate, so funding one nothing calls meant disabling
it from this page would have taken the whole tier down.

**What one Pro generation cost on the retired engine, measured** (`pro-baseline-2026-08-09` in the
eval archive; 4 briefs, 4/4 pass, gateway routes `google/gemini-3.1-flash-image` +
`google/gemini-2.5-flash`):

| | per generation |
|---|---|
| concept image | **$0.0671, flat** - identical on all four briefs (a fixed output-token count per image) |
| interpretation | $0.0068 - $0.0178, brief-dependent (a 2.6x spread on 14% of the bill) |
| **total** | **$0.0777** (range 0.0739 - 0.0849, ±7%) |

The shape is the useful part: **86% of a Pro generation is one flat charge**, so a per-generation
ceiling is a meaningful control and a per-run one only bounds volume.

**The ceiling is $0.15 per generation** (owner, 2026-08-09), a shade under twice the measurement -
room for one dear interpretation or a routine price rise, not for a runaway. It lives in
`PRO_MAX_GENERATION_COST_USD` (`src/ai/pro/contract.ts`) and counts every call in a generation.

**On the live path there is no browser half of it left, and that is the shape rather than an
omission.** The browser ceiling existed to refuse the SECOND call once the first had spent the
budget; with one call the money is already spent by the time a browser could refuse it, and
throwing then would destroy a finished graphic for no saving. The server's `pro-generate` booking
enforces the same constant and is the half a browser was never trusted with. On the retired engine
`compileProConcept` refused before the interpretation when the concept alone had spent it, and
again on the total - and a breach at the concept stage deliberately did NOT throw, because the
image was already billed.

Two limits worth stating rather than discovering. The browser half was enforced in the BROWSER,
from before `pro-generate` existed in `api/_lib/aiTaskRegistry.ts` - so it bounded what the
product did with a caller's own key, and was not a server-side booking of the Lite shape. And an
unreported cost counts as zero, the same reading Lite takes of an actual spend, which makes a route
that publishes no price unbounded here - one more reason every Pro route stays in the audited
catalog. Pinned by `api/_lib/proCostCeiling.test.ts` in the build gate. The route the tier actually draws with IS marked, from
`PRO_STANDARD_ROUTES` - so "no verdict here" never has to be read as "nothing here is used". A price the provider did not publish reads "not published", never
"free" - the same discipline as ZDR reading "not audited" rather than "no".

**ZDR is shown here too, and that is not a verdict creeping back in.** A verdict is this page's
opinion about whether a route may be used; an audit is a thing that either happened or did not.
Withholding the column on the image tab would have let "no verdict here" be read as "nothing
here has been audited", which stopped being true on 2026-08-02.

**The price is `pricing.image_output`, per million OUTPUT IMAGE TOKENS - not `pricing.image`,
and not per image.** Measured against the live listing on 2026-08-01: 38 of 40 image-output
models publish `image_output`; only 4 publish `image`, which prices an image the caller SENDS
IN (vision). Where a model publishes both they disagree by up to ~835x
(`x-ai/grok-imagine-image-quality`: `image` 0.01, `image_output` 0.0000120), so reading the
wrong key does not degrade to a blank cell - it prints a confident wrong price, on the few rows
that show a number at all. Pinned in `api/_lib/aiModelDiscovery.test.ts`.

Converting to a price per image is deliberately NOT done: it needs the token count one image
costs, which varies by model and by resolution and which the listing does not publish
(`google/gemini-2.5-flash-image` happens to be ~1290 tokens, hence its familiar ~$0.039, but
that factor is per-model knowledge, not data). Estimating it would put an unverified money
figure on an operator's screen. Per million keeps the column in the same unit family as the
text prices, where it is at least comparable between models.

There is no video tab: NoaCG video is Remotion/HyperFrames CODE written by text models and
rendered locally, so there is no video-generation route to list.

## 10. Beta feedback and generation ratings

The one surface on this project that carries what a PERSON wrote. Everything else counts rows
the product wrote about itself, and that separation is enforced at the schema rather than by
convention: `user_feedback` (`0028`) is its own table precisely so `ai_generations` and the
`admin_overview_*` aggregates can keep promising that no free text can reach them.

### What already existed, and what this adds

**It is not a second quality system.** `0011_ai_lite_quality_feedback.sql` has recorded a
content-free outcome per Lite generation for a while - resolved chassis, intent facet, an
enumerated discard reason - and `ai_lite_variant_quality()` feeds it back into the Lite prompt
(§4). That is unchanged. This answers the question that one deliberately cannot: **why**, in the
user's own words.

The two are joined rather than parallel. `GENERATION_FEEDBACK_REASONS` in
`src/feedback/contract.ts` IS the `0011` vocabulary minus the two values a user never picks -
`regenerated` and `closed` are written by the app when a result is replaced or the wizard is
closed, so they are implicit signals rather than answers. The Lite outcome endpoint now imports
its full set from the same module, which retired the third copy of that list.

### The two surfaces

- **A generation rating** sits at the BOTTOM of the AI result card, after the readiness rows.
  Two buttons, and pressing one SENDS - there is no submit step between a person and their
  finished graphic. A negative rating then offers enumerated reasons and a text box, as an offer
  rather than a step; a positive one asks nothing further, because "this was good" is already
  complete and the cheap half of the flow must stay cheap.
- **A general beta note** is the quietest button in the topbar. Visible from wherever somebody
  is standing when they get annoyed, and never opening itself. Nothing in this product asks
  "how are we doing?" unprompted.

Both render nothing when no backend is configured - a self-hosted instance has no inbox, and an
offline build grows no UI that cannot work, the same rule the auth surfaces follow.

### What is stored with a note, and what cannot be

The investigation context - tier, model, chassis, intent facet, prompt version - is **derived
server-side** from the generation row, never accepted from the browser. Two reasons: Lite
deliberately never tells the browser which model answered, and a client-supplied value could not
be trusted anyway. It is COPIED onto the feedback row rather than joined, because a Lite retry
rewrites the ledger row in place and a join would silently re-attribute an old complaint to
whatever model ran last.

The two fields the browser MAY declare are `tier` and `variantId`, and only for a generation
with no ledger id at all - Pro, BYO and the offline stub write no `ai_generations` row. Where a
ledger row does resolve, it wins.

Deliberately absent, and unable to be added: the prompt, the brief, the design spec, the
template, any uploaded asset, the page URL, the user agent, and the IP - not even the salted
hash `ai_gateway_requests` keeps.

### Anonymous feedback is the point, not an edge case

The editor has no login wall, and on this instance 114 browsers have visited against six
accounts. A channel only signed-in users could reach would be a channel almost nobody reaches.
So `user_id` is nullable, the endpoint's auth is optional, and the account - when there is one -
comes from the token rather than the body.

The visitor id rides along when the browser already has one. It is **read, never minted**
(`currentVisitorId()`): creating a tracking identifier for somebody out of a click whose whole
purpose was to help us would be exactly backwards, and an opted-out visitor answers null.

### The write path, and why it is a route rather than RLS

No client policy exists on the table - the same posture as `funnel_events` (`0016`). The browser
POSTs to `/api/me/feedback`, which validates against the shared contract and writes with the
service key. That costs one round trip and buys three things: the vocabularies are enforced
somewhere the client cannot edit, a scraped anon key cannot read other people's feedback, and
anonymous submission still works. The route answers `{ recorded: true }` to a dropped submission
as well as a stored one, because a person who just told us something was broken must not then be
shown an error, and a response distinguishing the two would be an oracle for which generation
ids exist. A per-IP burst gate (12/hour, tighter than the funnel's 60/minute) sits in front of
the body read - it is the only route accepting free text from an unauthenticated caller.

### The inbox, and the line it does not cross

`GET /api/admin/feedback` gives the satisfaction summary, the reason distribution, and splits by
model, tier, chassis and area; `POST` sets `status` (`new` / `reviewed` / `resolved`) and an
internal note, audited like every other admin write. Reading is `support`, triaging is `admin`.

- **Ordering is most-negative-first everywhere.** This is an inbox: three complaints must not be
  buried under thirty compliments.
- **No satisfaction percentage below eight ratings.** At n=3 one thumb moves the figure by 33
  points, and a page saying "67% satisfied" off three clicks invites a decision nobody has the
  evidence for - the same reason §8 reports absolute changes rather than percentages.
- **There is no DELETE grant for any role.** An admin surface that can make a complaint
  disappear is one that eventually will. Triage is a status, and what a person wrote stays as
  they wrote it.
- **It is evidence, never a verdict, and the section says so above the tables.** A model
  attracting complaints is a reason to go and look; only a NoaCG benchmark can say a model is
  worse (`docs/AI_LITE_PROMOTION.md`). There is no score, no league table, and the per-model
  split answers "where do I look first", which is a different question from "which is best".
  The no-ranking rule §9 holds for the Models page holds here for the same reason.

### The inbox does not wait to be visited

**The reminder arrives weekly in Claude Code, not by mail.** The owner's ruling, 2026-08-26:
*"I will not remember to go to the admin page."* An inbox that only works for somebody who opens
it is, for feedback, worse than no feedback button - the button teaches users that telling us
something is pointless, and that lesson is not reversible by fixing the page later.

**The mail digest is BUILT AND PARKED** (2026-08-27): it needs a Gmail app password and four
repository secrets, and the owner has no time to wire them. `.github/workflows/feedback-digest.yml`
stays scheduled and stays INERT-GREEN - with the secrets absent it prints a notice and exits 0, so
it costs nothing and turns on the day somebody sets them. What stands in its place is a weekly
ROUTINE (`docs/ROUTINES.md`) that runs `npm run feedback:count` against the local `.env` and
reports the numbers in chat with a link to open `/admin`. Counts travel; what a person wrote stays
behind the admin login, which is stricter than mailing it.

`scripts/feedback-digest.mjs` is one GET against `user_feedback` over a 26-hour window (`--count`
looks back 168 hours instead), ordered most-negative-first like the page. It writes nothing in any
mode: triage stays here, because triage is a write path with an audit trail and a digest is a copy.

Three properties are asserted in `scripts/feedback-digest.test.mjs` (part of `npm run build`)
rather than trusted:

- **Nothing a person wrote reaches the job log.** This repository is public and its Actions logs
  are public with it. A real run prints counts, built from the summary object, which has no
  message field. The one mode that renders a digest to a log is `--dry-run`, and it reads made-up
  fixture rows out of the script file and opens no socket.
- **A missing secret is neutral, never red.** Until the two secrets exist the job says so and
  exits green. A nightly red for a configuration step nobody has taken yet is how an owner learns
  to ignore red.
- **An empty window sends nothing.** A nightly "nothing happened" mail is the fastest way to get
  this address filtered into a folder that never gets opened.

The window overlaps by two hours on purpose, the same tolerance `nightly-drift.yml` uses: GitHub
delays and sometimes drops scheduled runs, a repeated paragraph costs the reader two seconds, and
a missed one is the whole failure being prevented.
