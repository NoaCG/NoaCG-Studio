# Operator commands and access data

The admin dashboard and `/api/admin/*` were retired by owner decision on 2026-10-17.
Operations happen in trusted sessions; the weekly product brief brings the information to the
owner. No access tables, policies or user data were removed with the UI.

## 1. Posture

Use the connected Supabase tools in a private operator session, or commands on a trusted machine.
Service credentials stay in environment variables, never in browser code, chat, git or CI logs.
NoaCG agent keys remain scoped to graphics operations; they do not authorize administration.

For a weekly read-only report:

```bash
psql "$NOACG_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/admin-report.sql
```

The same SELECT runs through Supabase's connected SQL tool. It reuses deployed aggregation
functions, returns aggregate data only, and fails explicitly when data is unavailable.
`.agent-workflows/noacg-product-brief.md` defines the report and model-research procedure;
`docs/ROUTINES.md` records delivery. A weekly brief does not replace existing incident alerts.

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
remain available for an operator to inspect what reactivation restores.

Every resolved value is an `EntitlementValue<T>`: the value, its `source`, a display label, and
an expiry. **"Why does this user have access" is not a second query** - it is the field the
resolver already returned, so an operator can explain access using the rule that granted it.

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
`api/render/[...path].ts`) and the handlers themselves live under
`api/_lib/`, where they cost no function slot. The URLs are unchanged.

| Dimension | Enforced by |
|---|---|
| `ai.lite` | `api/_lib/lite/generations.ts`, `judge.ts`, and `status.ts` (so the panel cannot offer what the endpoint would refuse) |
| `ai.import-analysis` | `api/_lib/importAnalysis/analyze.ts` + its `status.ts` |
| `ai.byo-key` | `api/ai/generate.ts`, on the BYO branch only, and only when a token was presented - account-free BYO must keep working |
| `ai.pro` | `api/ai/generate.ts`, on the `surface: 'pro'` discriminator the NoaCG Pro pipeline sets - the same mechanism, honest limit, and testability as `ai.video` below. It also gates `surface: 'spike'`, the bench-only Phase 0 surface (`docs/NOACG_PRO_PLAN.md` §0), which no user reaches and which exists to request forced-tool structured output: a bench surface belonging to Pro must not carry a weaker gate than Pro |
| `ai.video` | `api/ai/generate.ts`, on the `surface: 'video'` discriminator the video harness sets; the decision itself is `gatedFeature()` + `surfaceRefused()` in `api/_lib/entitlements.ts`, so it is testable without a verified token. It binds only a caller the server RECOGNISED - anonymous resolves defaults that carry no account feature, and account-free BYO video works today. See "Gating a surface on a shared endpoint" below for what the check can and cannot do |
| `render.cloud` | `api/render/start.ts` |
| `community.publish` | `community_pack_submit` refuses a community pack submission or update (`0080`). On the retired gallery's bucket, `community_assets_publish_insert` (`0022`) still stands; its tables and their gates went in `0085` |
| `control.hosted` | RLS: the two `control_shows_hosted_*` gates, plus the owner check inside `control_send`, `control_stage` and `control_report` (`0022`) - the RPCs are where an existing page actually costs something |
| `showchat` | RLS: the two `shows_showchat_*` gates and `chat_submissions_showchat_update`, plus the owner check inside `show_accepts` (what the anonymous send-in policy from `0003` already tests) and `show_by_slug`, so the page agrees with the policy (`0022`) |
| `audience` | RLS-shaped, but through RPCs alone (`0035`): every audience write - submit, vote, moderate, set the state, open or close a round - resolves the production's owner and refuses on `feature_denied_for(owner, 'audience')`. The three tables have RLS on and NO policies, so there is no second path to gate. The join resolve is the deliberate exception: a denial folds into `open = false`, because a viewer holding a link should see a closed door rather than an error naming a feature they have never heard of |
| `sync.cloud` | **one path only**: the agent save door `POST /api/me/graphics` (`api/_lib/me/graphics.ts`), through `permits(principal, 'graphics:create')` - the permission rides on this feature (`src/entitlements/permissions.ts`). The browser's own sync is deliberately NOT gated - it would stop a user saving their OWN work, there is no paid tier, and suspension already covers the real need - so the System page's note says how far the switch reaches: it stops agent saves, not sync |
| `graphics:create` (a PERMISSION, not a feature - what a CREDENTIAL may do of what the account may do, `docs/AGENT_SAVE.md`) | `api/_lib/me/graphics.ts` via `api/_lib/principal.ts resolvePrincipal` -> `permits()`. A session carries every permission; a scoped agent key (migration `0050`, minted by `noacg login` through a one-time PKCE-bound code, listed and revoked under Settings → Account → Agent access) carries exactly this one. `playout:operate` is reserved and never granted to a key. The only enforced permission in this release (`ENFORCED_PERMISSION_KEYS`) |
| disabled model routes | `api/_lib/lite/generations.ts`, `judge.ts`, `importAnalysis/analyze.ts`, and the MANAGED branch of `api/ai/generate.ts`. Deliberately not the BYO branch: the switch exists to stop the platform's own spend, and a BYO caller spends their own money on a model they chose |
| AI allowances | `applyEntitlementToLiteProfile()` before the reservation RPC |
| render tier | `resolveTier(signedIn, entitlement.renderTier.value)` |
| render formats | `validateRenderRequest(m, tier, entitlement.renderFormats.value)` |
| template visibility | `api/_lib/templateVisibility.ts` -> `GET /api/me/entitlement` -> the wizard's Browse step |
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
`backend/supabaseProvider.ts` (documents, assets), the old community gallery (retired in `0085`),
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
`public.is_admin(min_role)` is the SECURITY DEFINER predicate used by database policies.
The private admin HTTP endpoints and their separate gate have been retired.

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

## 4. Operations without a page

The role commands use `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`):

```bash
node scripts/admin.mjs list
node scripts/admin.mjs grant person@example.com support
node scripts/admin.mjs revoke person@example.com
```

These are trusted operator commands, not a self-service role API. Grant only an existing account.
Future collaborators can use a narrowly scoped roles UI when that becomes a real workflow;
Supabase remains the source of truth either way.

For other changes, first read the current schema and target row in an authenticated operator
session, state the exact intended change, and write it with an `admin_audit_log` entry in one
transaction. Verify the resulting row and the live product behavior. Do not recreate a web API
just to wrap occasional SQL. Existing product endpoints `/api/me/entitlement` and
`/api/me/feedback` remain; they authorize their own caller and do not depend on a dashboard.

| Operation | Existing source of truth |
|---|---|
| Users, invitations and identity | Supabase Auth admin tools; `auth.users` for private inspection |
| Suspension and internal/test marking | `user_accounts`; suspension is enforced by server/RLS |
| Plans, assignments, domain access | `plans`, `user_plans`, `plan_email_domains`; use the resolver in §2 |
| Temporary grants and overrides | `user_grants`; preserve expiry and active-grant uniqueness |
| Feature/model kill switches and beta cohort | `system_settings`; approved model ids remain in `api/_lib/aiModelCatalog.ts` |
| Template visibility | `template_visibility`; live reader `api/_lib/templateVisibility.ts` |
| Feedback triage | `user_feedback.status`, `admin_note`, `reviewed_by`, `reviewed_at`; never delete a complaint |
| Generation quality | `ai_generations` outcomes and `ai_lite_variant_quality()`; priors feed the generator |
| Operational changes | `admin_audit_log`; aggregate actions in the weekly brief, details in a focused session |

Use current CHECK constraints and `src/entitlements/contract.ts` for valid keys and values.
For access mutations, include actor, reason, target and before/after values in the audit entry,
never secrets or user-authored graphics. Verify expiry and the effective entitlement, not only
that a row exists. Read-only support work never changes access.

## 5. The audit log

`admin_audit_log` records actor, role, action, target, summary, structured detail and timestamp.
Migration 0030 makes it append-only for `service_role`: SELECT and INSERT, no UPDATE, DELETE or
TRUNCATE. Supabase default privileges are additive, so narrowing privileges requires REVOKE;
`scripts/admin-security-migration.test.mjs` retains the migration assertions. Existing history
is preserved. The role CLI records out-of-band changes with a null actor and its script identity.

## 6. Reporting limits

External activity excludes internal accounts using migration 0027's shared functions; display
internal testing separately. Report periods are rolling seven-day UTC instants, paired with the
preceding seven days. New accounts come from Auth creation timestamps, not a signup click.
Opted-out/self-hosted users and local preview/export activity are incomplete. Export events count
successful downloads; export failure rates are not tracked. Do not sum Lite and gateway costs
without reconciling their accounting boundaries. Missing data or a query failure is not zero.

## 7. Migrations

Keep the deployed schema and its history: 0017 admin roles/audit, 0018 entitlements, 0019 system
settings/template visibility, 0020 self-scoped predicates, 0021 active-grant uniqueness, 0022–0023
entitlement absolutes, 0024–0027 aggregate activity/outcome/scope reporting, 0028 feedback, 0029
feedback privacy and 0030 audit immutability. Later account/storage/agent policies remain live.
There is no schema migration for dashboard retirement.

## 8. Weekly product report

`scripts/admin-report.sql` reads current/previous activity for external, internal and all users;
current account/render/grant state; feedback sentiment plus the entire unresolved backlog;
generation outcomes; recent operator actions; and disabled routes/features. Counts and money
are aggregated in SQL by the existing functions rather than truncated client-side row scans.
No emails, user ids, feedback messages, prompts or assets appear in its result. A focused private
session can investigate one of those counts when requested.

## 9. Models

The weekly brief researches new models against the current graphics harness and cites provider
release notes. A recommendation is not a promotion: model policy, approved routes, pricing and
benchmarks remain in `docs/AI_TASK_REGISTRY.md` and `api/_lib/aiModelCatalog.ts`. Changing a model
or spending on a benchmark belongs to an implementation session with an approved budget.

## 10. Beta feedback and generation ratings

The live feedback form, contract, storage and `/api/me/feedback` remain. Visitors can submit
without an account; rate limiting and validation stay at the server boundary. Feedback is a
separate content channel: user messages never join AI telemetry or routine/public CI logs.
The weekly brief reports new notes and all unresolved feedback, including old entries. Inspect
messages only in a focused private operator session; triage changes status with an audit entry.
