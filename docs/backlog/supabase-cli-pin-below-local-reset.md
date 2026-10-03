# The CI pins hold the Supabase CLI at 2.111.0, whose local `db reset` cannot apply 0074

**Filed:** 2026-10-03. **Source:** row DG (`claude/dg-db-reset-after-0074`), measured on a local
stack.

## Why

`supabase db reset` on CLI 2.111.0 stops at `0074_seq_log_index.sql` with `CREATE INDEX
CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`: its local reset hands each
file to the older Go applier as one pipeline, while its `db push`, `migration up` and `start` split
the file around the concurrent build. 2.112.0 fixed the reset. The maintainer laptop's global CLI
was moved to 2.112.0 on 2026-10-03 so local resets work again (revert: `npm i -g
supabase@2.111.0`), but `.github/workflows/configured-suite.yml`, `hosted-latency.yml` and
`post-land.yml` still pin 2.111.0, and their comments call it "the version the project is
developed against". Local and CI now differ by one minor version, which is the drift those pins
exist to prevent. No CI job runs `db reset` today, so nothing is red.

## What it would take

Move the three pins to one version at or above 2.112.0, together, and update the comments that
name 2.111 (`post-land.yml` says "0074 relies on how 2.111 runs `create index concurrently`";
`scripts/db-push.mjs` and `supabase/AGENTS.md` cite 2.111 measurements). Proof: a green configured
suite (it reads `ANON_KEY` and `SERVICE_ROLE_KEY` from `supabase status`; 2.112.0 still prints
both), a hosted-latency run, and a `db:push --dry-run` against production that finds nothing to
push.

## Evidence

- 2.111.0: `supabase db reset` fails at 0074 with 25001, as above.
- 2.112.0, 2.113.0 and 2.119.0: `db reset` applies 0001 to 0075 and seeds, exit 0.
- `supabase/AGENTS.md`, "A concurrent statement runs on its own".
