# The Supabase advisor gate is red, and nothing in CI runs it

**Filed:** 2026-09-08. **Source:** weekly quality review (measurement).

## Why

`npm run check:advisors` exits 1 right now. It reports **106 advisor findings against a baseline of
100**, and the six it cannot account for all arrived with the teams feature, which landed after the
baseline was recorded on 2026-08-25:

- `public.is_team_member(p_team uuid)`
- `public.team_join(p_code text, p_display_name text)`
- `public.team_production_save(p_id uuid, p_expected timestamptz, p_doc jsonb)`
- `public.team_rotate_code(p_team uuid)`

all four executable by `authenticated` as `SECURITY DEFINER`, plus one unindexed foreign key on
`team_productions` and one unused index on `team_members`.

**Every one of those falls inside a class the script already accepts** - the definer functions are
the entitlement helpers the RLS policies need, exactly as `ACCEPTED_CLASSES` describes, and the
script prints that justification beside each. So this is almost certainly a baseline that was never
re-recorded, not a security regression. That is the point: **nobody knows, because nobody ran it.**

Grepped `.github/workflows/` and `package.json` on 2026-09-08: `check:advisors` appears in
`package.json` and nowhere else. It is not in `npm run build`, not in `check:freshness` (which is
`check-vendored-versions` + `check-model-ids` + `check-ograf-schema` + `e2e-durations --check`), not
in `weekly-audit.yml`, and not in `post-land.yml` - which is the workflow that applies the very
migrations that create these functions. A gate that runs only when a person remembers it is a
document, and this one has been failing for at least the thirteen days since the teams migrations
landed.

**The token is not the obstacle.** `SUPABASE_ACCESS_TOKEN` already exists as a repository secret and
`post-land.yml` already uses it to push migrations. Nothing new has to be provisioned.

## What it would take

A session, and it splits into two independent halves.

1. **Run it where it fires.** `post-land.yml` already holds the token and already runs
   `migration-drift.mjs` beside `db-push.mjs`. Adding `node scripts/supabase-advisors.mjs` after the
   push catches a new definer function on the landing that created it, which is the only moment the
   author is still in the room. Whether it should fail the job or emit a `::warning` is the one real
   design call - post-land runs AFTER the merge, so a hard failure there is an alarm, not a gate.
   `weekly-audit.yml` is the alternative home and can fail hard, at the cost of a week's latency.
2. **Re-record the baseline for the six**, on its own commit, with the diff read rather than
   trusted - `--update-baseline` accepts everything currently reported, and the script's header says
   so. Do this second: recording first would hide whether step 1 works.

Do not attempt to drive the count toward zero. `scripts/supabase-advisors.mjs`'s header argues, with
the migrations that prove it, that the ~24 `anon`-callable definer functions ARE the capability-URL
model that lets an unauthenticated CasparCG or OBS client hold an output slug, and that the 24
tables with RLS and no policies are deny-all, which is stricter than a policy. This review read that
argument and agrees with it.

## Evidence

- `npm run check:advisors` on 2026-09-08 from the primary checkout, with the token from `.env`:
  exit 1, 106 findings, the six above named as NEW.
- `supabase/advisor-baseline.json`: `recordedAt` 2026-08-25, count 100, split 31
  `authenticated_security_definer_function_executable`, 24 `anon_security_definer_function_executable`,
  24 `rls_enabled_no_policy`, 13 `unindexed_foreign_keys`, 6 `unused_index`,
  2 `multiple_permissive_policies`.
- `grep -rn advisors .github/workflows/ package.json` - one hit, the `package.json` script line.
- `.github/workflows/post-land.yml:35` - `SUPABASE_ACCESS_TOKEN` already wired.
- `node scripts/migration-drift.mjs` on the same day: production and staging both hold all 54
  migrations. No drift; this finding is only about the advisors.

## Trend

- 2026-09-08: baseline 100 (recorded 2026-08-25), live 106, **6 unaccounted**, gate wired into
  0 workflows.
