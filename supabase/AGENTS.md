# supabase - migrations, policies and the remote ledger

Loaded alongside the root `AGENTS.md` when working in this directory. `supabase/README.md` covers
what the folder is and how a self-hoster stands an instance up; this file holds the rules that are
only learnable by getting them wrong against a real database.

## Grants are the migration's job, not the host's

**A migration must grant table privileges explicitly.** Until `0051_client_table_grants.sql`
(2026-08-25) not one migration granted anything to `anon` or `authenticated`, and only fourteen
named `service_role` - yet production worked, because hosted Supabase's bootstrap runs
`alter default privileges in schema public grant all on tables to anon, authenticated,
service_role`. A local `supabase start` has no such bootstrap, so every signed-in read came back
`42501 permission denied for table documents` and the app showed "Sync error": 17 of 32 configured
specs failed that way. Self-hostability is a stated pillar, so a schema that only works on the
vendor's default privileges is a product defect, not a test-environment quirk.

Verify with `information_schema.role_table_grants` on a LOCAL stack, never on production - the
hosted project's answer is the one that hides the omission.

**The revoke is the migration's job too.** A migration that grants only what it wants still leaves
whatever the host handed out, and the two statements do not cancel: `0052` had to take back DELETE,
INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE from `anon` and `authenticated` on eighteen
tables, including `anon` on `documents` and `agent_keys`. Say `revoke all … from public, anon,
authenticated` before the narrow grants - the idiom every table from `0010` on already uses - and a
self-check that asserts ABSENCE, not only presence, is what makes the claim checkable.

## A push needs the management token, not a database password

`supabase db push --linked` initialises a temporary login role over the Management API, so
`SUPABASE_ACCESS_TOKEN` alone is enough and there is no database password to find. The token is
ACCOUNT-WIDE - it enumerates every organisation and project, and the same API deletes them - which
is why it lives in `.env` on a maintainer's machine and is deliberately not a CI secret in a public
repo (`scripts/migration-drift.mjs` says the same about reading the ledger).

**There are TWO hosted projects, and both get every migration.** Production is whatever
`VITE_SUPABASE_URL` names; `noacg-staging` is the separate free project the `hosted-latency`
workflow runs against, declared in `scripts/supabase-projects.mjs` because nothing in the app
derives it. The drift check reports both and `.github/workflows/post-land.yml` pushes both after a
landing, production first. By hand, staging needs the ref: `npm run db:push -- --ref <ref>`. Before that was
a mechanism, staging drifted silently - 0053/0054 sat unapplied there for a day and the suite went
red on `PGRST205 Could not find the table 'public.teams'`, which reads like a latency regression
rather than like a database nobody pushed to.

## An extension must exist before the migration that calls it, and be called qualified

Same shape as the grants rule, found the same way, one day apart. `0003_show_chat.sql` used
`gen_random_bytes` in a column default and pgcrypto was not created until `0004` - so the
migrations could not be applied to a fresh HOSTED project at all:
`ERROR: function gen_random_bytes(integer) does not exist (SQLSTATE 42883)`. `0004`'s own comment
said it created the extension "so this migration also applies on a fresh project", which was right
about the need and wrong about the file, and its claim that Supabase ships pgcrypto preinstalled is
false - available, not installed.

**A later migration cannot fix this.** On an empty database `0003` runs before anything added
afterwards, so the repair has to live in the file that needs the extension FIRST. That is the whole
reason the rule is worth stating: the instinctive fix does not work.

**Creating it is only half.** Supabase installs extensions into the `extensions` schema and the
CLI's ephemeral migration role does not carry that schema on its `search_path`, so an unqualified
call fails even once the extension exists. Write `extensions.gen_random_bytes(...)`, as
`0029`/`0035`/`0047` already did and `0003`/`0004`/`0008` now do.

`scripts/extension-order.test.mjs` holds both halves in the build gate. Nothing else can:
**a green nightly says the migrations apply to the CLI's LOCAL image, which ships pgcrypto already
reachable - it says nothing about a fresh hosted project**, and production has had the extension
for months so a push there never re-runs the early files. The only real evidence is a from-scratch
apply against a hosted database: `supabase db reset --linked --yes` against the STAGING project
(`garafohbzmsybtysxphb`, free org) does exactly that, and is how this fix was proven.

If you do that, clear any `search_path` accommodation first. `db reset` wipes schemas but NOT
database-level settings, so an `alter database ... set search_path` from an earlier debugging
session survives the reset and quietly does the work the fix is supposed to be doing.

## A policy expression runs with the QUERYING role's privileges

The caller must hold EXECUTE on every function a policy names, **even a `SECURITY DEFINER` one**.
Revoking a predicate does not quietly make the policy fall back to denying - the whole statement
fails with `42501 permission denied for function`. `is_suspended` is called by nine restrictive
policies on every write, so revoking it would have denied documents, assets, community publishes,
control shows and uploads to every signed-in user.

The instinctive fix for "this function is exposed" is `revoke execute`. For anything a policy
references, that is an outage. Change the function's SHAPE instead - dropping the `uuid` argument
removed the probe while keeping the grant the policies need.

## A migration must never change the session role

`supabase db push` connects as an unprivileged `cli_login_postgres` and elevates with
`SET SESSION ROLE postgres`. A `RESET ROLE` inside a migration drops the session back down, and
the CLI then cannot write `supabase_migrations.schema_migrations` - the whole migration rolls back
on `permission denied for schema supabase_migrations`, an error that looks entirely unrelated to
what you changed.

## A self-check proves SHAPE, never behaviour - so CALL the thing

Migration 0035 shipped `audience_open_round` broken and every gate said yes. Its body closed the
previous round with an unqualified `where ... closed_at is null`, while the function's own
`RETURNS TABLE` declares an OUT parameter named `closed_at` - so every call failed at runtime with
`42702 column reference "closed_at" is ambiguous`.

Nothing caught it because **a plpgsql body is not resolved at CREATE time.** The function
compiles, `to_regprocedure` finds it, `pg_get_function_result` reports the right columns, the
grants are right; 0035's self-check asserted all of that and passed. Only calling it fails.

- In a self-check, CALL it: insert a throwaway row against a real owner, run the function, assert
  the effect, delete the row (that is what 0036 does). Shape checks are still worth having - they
  are just not evidence that it works.
- In any `RETURNS TABLE` plpgsql function, **table-qualify every column reference in the body**.
  `RETURNS TABLE (...)` silently creates a variable per column; six of that function's seven OUT
  names were also columns of the table it writes.
- **Never edit an applied migration to fix it.** 0035 stayed exactly as applied; 0036 is the fix.

## Apply migrations with `npm run db:push`, never the MCP tool

**You should not have to run this at all.** A branch landing through `npm run queue:merge` applies
whatever production is missing as soon as it is on `origin/main` (`.github/workflows/post-land.yml`). Reach
for the command by hand only when a push refused, or when a migration arrived some other way.

Applying to the hosted project needs no permission and no waiting: `npm run db:push` classifies
every pending statement, applies what can only add, and REFUSES what can remove - a DROP, TRUNCATE,
DELETE FROM, column-type change, RENAME, `disable row level security`, `owner to`, `alter database`,
or a REVOKE on an object the same migration did not create. It fails CLOSED on a shape it does not
recognise, so a new kind of statement stops at `scripts/db-push.test.mjs` in the build rather than
mid-push. A refusal is answered by naming the version - `npm run db:push -- --allow 0052` - and the
run prints the before/after grant, column, policy and ledger diff, which is the evidence that the
migration did what its header claims. It drives `supabase db push` underneath, so everything below
still holds.


The remote ledger keys each migration by the four-digit `version` parsed from the filename
(`0017_admin_roles.sql` -> version `0017`, name `admin_roles`), and `db push` decides what is
pending by diffing that column against this folder.

The Supabase MCP `apply_migration` tool mints its OWN timestamp version (`20260730062721`) and
stuffs the whole filename into `name`. The schema change lands correctly, and then **the damage is
silent and deferred**: everything works until the next `db push`, which sees those files as
pending and re-runs them against the live database. `create policy` and `create trigger` have no
`if not exists`, so it fails partway through. `list_migrations` looks fine in between, because it
prints whatever is in the table.

Confirm with `supabase migration list --linked` - every row should read `local == remote`. A row
with an empty `remote`, or a bare timestamp with an empty `local`, is drift. Repair by UPDATEing
`version`/`name` in place to match the filenames, in one transaction with a post-check that fails
unless every version is four digits. Never re-run the migration to "fix" the ledger.

## Two branches must never mint the same number

The loser is SILENTLY SKIPPED by `db push`, which still reports success.
`node scripts/merge-order.mjs` detects this across every branch ahead of `main` and returns
`hold`; renumber the UNAPPLIED one.
