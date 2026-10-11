# `supabase/` — the open backend for self-hosters

This folder is everything a self-hoster needs to stand up their own instance of the **open**
features (auth, cloud persistence, remote realtime control). It is deliberately part of the
AGPL-3.0 repo: schema and RLS are not secrets, and withholding them would break self-hostability.

**What is NOT here (by design):** billing, the metered AI gateway, and social-ingestion edge
functions, plus all secrets (`service_role` key, Stripe, social API keys). Those live in a separate
private repo and are wired into the hosted instance at deploy time only. The app talks to them over
a stable HTTP contract, never by importing their code. See `../docs/ERA5_PLAN.md`.

> **Status: code-first (Era 5.0).** These migrations and config are written and reviewed but not yet
> applied against a live project in this repo's CI (the app runs fully offline without them). The
> per-phase "live-verify" checklists in `docs/ERA5_PLAN.md` are the maintainer's runbook for
> validating auth/RLS/realtime against a real Supabase.

## Stand up an instance

```bash
# Local stack (needs Docker):
supabase start          # applies migrations/ + seed.sql
# or push to a hosted project:
supabase link --project-ref <your-ref>
supabase db push        # applies migrations/ (schema + RLS + auth hook)
```

**On the hosted project these apply themselves.** A branch landing through the merge queue runs the
push as soon as it reaches `origin/main`, so a migration is never left waiting for someone to
remember it. The command behind that is `npm run db:push`, and it needs nobody's
permission — `scripts/db-push.mjs` reads every pending migration, classifies each statement, applies
the ones that can only add, and REFUSES the ones that can remove something (a DROP, TRUNCATE,
DELETE FROM, column-type change, RENAME, `disable row level security`, `owner to`, `alter database`,
or a REVOKE on an object the same migration did not create), reporting instead. It fails closed on a
statement shape it does not recognise, refuses to push onto a drifted ledger, and prints the
before/after grant, column, policy and ledger diff so "it applied" is evidence rather than a claim.
A refusal is answered per version — `npm run db:push -- --allow 0052` — and never in bulk. It needs
`SUPABASE_ACCESS_TOKEN` in `.env` and no database password; `SUPABASE_PROJECT_REF` points a run at
staging instead.

Underneath it, **`supabase db push` is the only supported way to apply these.** The remote ledger
(`supabase_migrations.schema_migrations`) keys every applied migration by the four-digit `version`
taken from the filename, and `db push` decides what is pending by comparing that column against
`migrations/`. Applying a file by any other route — pasting it into the SQL editor, or an agent
calling a Supabase MCP `apply_migration` tool — records it under a *generated timestamp* version
instead. The schema change lands, but the ledger no longer matches the filenames, so the next
`db push` treats those files as pending and re-runs them; `create policy` and `create trigger` have
no `if not exists`, so it fails partway through against a live database. This drifted once already
(0012–0019, repaired 2026-07-30) and the symptom is silent until someone pushes. If it happens
again, repair the ledger's `version`/`name` columns to match the filenames — never re-run the SQL.

Then point the app at it via `.env` (see `../.env.example`):

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>   # public; RLS is the real boundary
```

With those unset, the app runs in pure offline localStorage mode — no login, no sync, exports
unchanged.

**There is no login wall (Era 5.6 — the open editor).** With a backend configured, the editor is
still open to everyone: anyone can create, preview, and export with no account. Signing in (topbar
"Sign in" → dialog) only unlocks the account features — cloud sync, community, show chat, AI.
Signup is **open** (migration `0006`); to re-close it to the invite allowlist, ship a migration
restoring the `0002` body of `enforce_allowlist`.

## Capacity - what fits inside the plan, and what stops us leaving it

The hosted project runs on Supabase **Pro**, whose included quota is **8 GB of database disk**,
**100 GB of Storage**, **250 GB of egress/month** and **100,000 monthly active users**. Overage is
billed per GB ($0.125 database, $0.021 Storage, $0.09 egress), so "how many accounts fit" is a real
number, not a shrug. Migration `0039` turns that number into ceilings the database enforces.

**Sized for 1000 accounts.** Measured on 2026-08-12 with the live project at 22 MB of database and
2.3 MB of Storage:

| Resource | Per account | 1000 accounts | Included | Headroom |
|---|---|---|---|---|
| Database | ~1 MB (44 documents, 10 kB body average) | ~1-4 GB | 8 GB disk | ~2x |
| Storage | 50 MB ceiling (`storage_quotas`) | 50 GB | 100 GB | 2x |
| Egress | 50 MB, if every account pulls its assets once a month | 50 GB | 250 GB | 5x |
| Auth | 1 MAU | 1000 MAU | 100,000 MAU | 100x |

At that shape 1000 accounts cost the flat $25/month and nothing else. **Storage is what breaks
first** if the estimate is wrong, which is why it is the resource with a hard ceiling rather than a
hope.

**What the ceilings are** (all in `0039`, tunable by updating `public.storage_quotas` as the
service role - no migration needed):

- **8 MB per file** on both buckets (`storage.buckets.file_size_limit`, previously unlimited). The
  app's own caps are lower: 3 MB per video asset, 12 MB of media per shared template.
- **50 MB per account** in `user-assets`, **200 MB per publisher** in `community-assets`, enforced
  as a RESTRICTIVE policy on `storage.objects` that ANDs with the existing ownership policies.
- **70 GB and 10 GB per bucket**, so even a signup wave stops writing at 80 GB total, well below
  the 100 GB that starts billing.
- **Retention crons** for every table that grows on its own: `control_events` 14 days (the publish
  path already prunes at 7), `render_jobs` 30 days, `ai_gateway_requests` 180 days,
  `ai_generations` 365 days, `funnel_events` 90 days (from `0037`).

**What is deliberately NOT capped:** database row size. Assets are externalized to Storage before a
row is written (`src/backend/assets.ts`), so `documents.body` holds code and field data - 10 kB on
average, 244 kB at the worst measured. A cap there would buy nothing and could refuse a legitimate
save.

**Two limits that are not about size, and bite before any of the above:**

- **Realtime peak connections: 500** (then $10 per 1000). The control plane sends over the
  stateless REST broadcast endpoint and the audience plane polls, so a live show does not hold one
  socket per viewer. Keep it that way.
- **Storage image transformations: 100 per month**, then $5 per 1000. This is Pro-only and looks
  free; it is not. Do not enable on-the-fly resizing for thumbnails without doing the arithmetic
  first.

Usage is visible per resource on the organization's usage page. The **Spend Cap** (billing
settings) is the last line of defence: with it on, exceeding a quota restricts the project rather
than billing for the overage.

## Advisor warnings — the count that will never be zero, and the ones that must be

`node scripts/supabase-advisors.mjs` fetches the dashboard's security and performance advisors and
diffs them against `supabase/advisor-baseline.json`, failing only on a finding that is NEW. The
count itself is not a target, and driving it to zero would mean dismantling the product:

- **~24 `anon_security_definer_function_executable`.** The capability-URL model. A CasparCG or OBS
  client holding an output slug, and an operator on a phone holding a control link, are
  unauthenticated by construction (`docs/CLOUD_PLAYOUT.md`, `docs/CONTROL_LAYER.md`). RLS takes no
  parameters, so a secret-slug capability can only be expressed as a definer function taking
  `p_slug`. `SECURITY INVOKER` would end browser output and the public join page.
- **~31 `authenticated_security_definer_function_executable`.** Mostly the same functions again,
  plus the RLS predicate helpers — `is_moderator`, `is_suspended`, `feature_denied`,
  `storage_within_quota`, `show_accepts`. A policy's expression runs as the QUERYING role, so the
  role must hold EXECUTE on every function the policy names. Revoking one does not harden the
  policy; it makes it fail closed. This is why a predicate cannot be locked down by revoking it.
- **21 `rls_enabled_no_policy`.** RLS on with no policies is DENY-ALL: nothing but `service_role`
  and definer functions can reach the table, which is stricter than any policy. No client code
  selects from these tables (checked against every `from('…')` in `src/`).

What is NOT permanent is an ACCIDENT wearing the same lint name. Supabase's default privileges
grant EXECUTE on every new function in `public` to `anon`, `authenticated` and `service_role` as
explicit per-role grants at CREATE time, so `revoke … from public` removes nothing and a migration
that says nothing about roles ships an open function. That happened twice —
`storage_within_quota` (0039, fixed by 0041) and the two identity trigger functions (0040, fixed by
0042). **Every definer function in `public` must name the ROLES it revokes**, and
`scripts/definer-grants.test.mjs` fails the build if one does not.

**The same bootstrap has a mirror image for TABLES, and it is the one that bites a self-hoster.**
Supabase also sets `alter default privileges in schema public grant all on tables to anon,
authenticated, service_role`, so on a hosted project a migration that grants nothing still works.
Postgres itself grants a new table to nobody but its owner, so the identical SQL applied to a stack
without that bootstrap produces a schema the app cannot read - `documents` exists, RLS is on, the
policies are right, and every signed-in request comes back `42501 permission denied for table
documents`. Nothing in `migrations/` granted a table privilege to a client role until **`0051`**,
which states the whole matrix explicitly; `scripts/client-grants-migration.test.mjs` now fails the
build if a policy admits `anon` or `authenticated` to a command that no migration grants. When
adding a table, **grant it in the same migration** - and remember 0028's lesson in reverse: a grant
that adds nothing on a hosted project is exactly the grant a self-hoster cannot do without.
**Revoke in the same migration too** (`revoke all … from public, anon, authenticated` before the
narrow grants, the idiom every table from `0010` on already uses): `0052` had to take back seven
privileges on eighteen tables precisely because the earlier files stated only what they wanted and
let the host supply the rest.

Dashboard-only, so no migration can fix them: leaked-password protection (Auth → Passwords, on
since 2026-08-13) and the Auth connection strategy (`auth_db_connections_absolute` — Auth holds a
fixed 10 connections; switch it to percentage-based the day the instance is resized up, or the
resize does nothing for Auth).

## Contents

- `config.toml` — project settings for the open features. Auth is **invite-only**: the
  Before-User-Created hook (`enforce_allowlist`) is the gate. Google OAuth needs
  `SUPABASE_AUTH_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_GOOGLE_SECRET` in the deploy env.
- `migrations/0001_documents.sql` — the `documents` table, per-user RLS, the `updated_at`
  trigger, and the private `user-assets` Storage bucket + its RLS. Binaries live in Storage, not in
  `body` jsonb. (It also created an `assets` back-reference table, removed by `0052` — nothing ever
  wrote it, and dedupe was never in it: `src/backend/assets.ts` keys each object
  `{uid}/{content_hash}`, so identical bytes land on the same object without a row anywhere.)
- `migrations/0002_auth_allowlist.sql` — the `allowlist` table and the `enforce_allowlist` auth
  hook. Add invitees with `insert into allowlist (email) values ('…');` (service_role / SQL editor).
- `migrations/0003_show_chat.sql` — the show-chat send-in queue, moderation, and abuse trigger.
- `migrations/0004_community_templates.sql`, `0005_community_moderator_read.sql` — the Era 5.5
  community gallery. It closed to publishing in `0078` and `0085` dropped its tables and browse RPCs
  once they were proven empty. What remains of it: the global `moderators` role + `is_moderator()`,
  which community packs use (make someone a moderator with
  `insert into moderators (user_id) values ('<their-auth-uid>');` as service_role), and the
  `community-assets` bucket, which refuses every upload and still holds what was uploaded before.
- `migrations/0006_open_signup.sql` — **open signup** (Era 5.6): `enforce_allowlist` now allows
  every sign-up; the hook wiring and the allowlist table stay, so re-closing is a one-function
  migration. Abuse posture for public instances: require email confirmation (Auth → Sign In/Up)
  and enable captcha (Auth → Attack Protection) in the dashboard.
- `migrations/0051_client_table_grants.sql` — the table privileges `anon`, `authenticated` and
  `service_role` had only ever inherited from hosted Supabase's default privileges, stated in SQL so
  a stack built with `supabase start` is readable too. Grants only, narrowed per table to what each
  table's own RLS policies already admit — a verified no-op on the hosted project. See the table
  half of "Advisor warnings" above.
- `migrations/0052_inherited_grants_tightened.sql` — the half `0051` named and did not do: it
  REVOKES what the bootstrap over-granted, so the hosted matrix equals what `0051` states rather than
  exceeding it. `anon` and `authenticated` held all seven privileges on all nineteen tables from
  `0001`–`0050`, including `anon` on `documents`, `agent_keys` and `allowlist` — inert, because RLS
  denies them, but inert by the policies rather than by the SQL, so the day one of those tables gains
  a permissive policy `anon` inherits its reach with nothing saying it should. Its self-check asserts
  ABSENCE as well as presence, which is what `0051` could not do without refusing to apply. It also
  drops the never-written `assets` table (see `0001` above); `service_role` is untouched, so `0028`
  and `0030`'s append-only grants stay exactly as they are.
- `seed.sql` — local-dev-only allowlist seed.

Migrations are ordered by filename and are **immutable once shipped** — change the schema by adding
a new migration, never by editing an applied one.

## Verifying live (maintainer checklist)

The app is built code-first: `npm run build` + offline E2E prove the offline path and the pure sync
logic, but the server paths below need a real project. Do these once after connecting:

**Auth (5.1, reworked in 5.6 — the open editor + open signup)**
1. With your `.env` pointing at the project, `npm run dev` → open `/app`: the EDITOR loads with no
   login wall; the topbar shows a "Sign in" button, and the AI tab / 🌐 Community prompt for
   sign-in. (The root `/` is the public landing page.) Google OAuth returns to `/app` — the
   dashboard's Auth → URL Configuration must allowlist that redirect URL.
2. Sign up with ANY email via the dialog → account created (0006 open signup; live-verified
   2026-07-08 with a throwaway address, then deleted). Sign in → the dialog closes; the topbar
   shows your email + "Sign out".
3. Public-instance hardening (dashboard): require email confirmation (Auth → Sign In/Up) and
   enable captcha (Auth → Attack Protection). Config.toml sets `enable_confirmations = true` for
   CLI-managed instances, but the HOSTED dashboard setting is separate — check it there.

**Cloud sync (5.2a)**
4. Signed in, open 📦 Packets, save a graphic into a packet → the topbar sync pill goes
   "Syncing…" → "Synced". In the dashboard, Table Editor → `documents` shows a `packet` row owned by
   your user.
5. Sign in as the SAME user in another browser/profile → the packet appears (pull works).
6. Delete the packet on one device → after sync it disappears on the other (tombstone propagates),
   and the `documents` row has `deleted = true`.
7. **RLS isolation (the security check):** sign in as a SECOND user → they must NOT see the first
   user's packets, and the `documents`/`assets` selects return only their own rows. (RLS, not the
   UI, is the boundary.)

If 3 or 7 fails, stop and fix the policy/hook/trigger before inviting testers — those are
the security guarantees.
