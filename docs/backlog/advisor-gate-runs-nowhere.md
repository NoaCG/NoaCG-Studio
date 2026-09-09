# Nothing in CI runs the Supabase advisor gate

**Filed:** 2026-09-08 as "The Supabase advisor gate is red, and nothing in CI runs it".
**Halved:** 2026-09-09 - the red half is fixed, and this file now covers only the CI half.
**Source:** weekly quality review (measurement).

## Why

`check:advisors` appears in `package.json` and nowhere else. It is not in `npm run build`, not in
`check:freshness`, not in `weekly-audit.yml`, and not in `post-land.yml` - which is the workflow
that applies the very migrations that create the functions the gate reports on. A gate a person has
to remember is a document, and this one proved it: it sat red for thirteen days after the teams
migrations landed because nobody ran it.

The red is now gone (see "What was already done"), which makes the remaining half both smaller and
more urgent. A green gate nothing runs decays back to red the next time anything touches the
schema, and the decay is silent.

## What was already done

`npm run check:advisors` exits 0 as of 2026-09-09. The six findings it could not account for were
read one at a time against the LIVE database and re-recorded into `supabase/advisor-baseline.json`,
which now holds 106 entries recorded on 2026-09-09.

Nothing was fixed, because nothing needed fixing. All six arrived with the teams feature
(migrations 0053 and 0054), which landed after the baseline was recorded on 2026-08-25, and every
one falls inside a class `ACCEPTED_CLASSES` already accepts for a reason that holds for this
occurrence too. The baseline was stale, not the schema. "The six, and why each is accepted" below
records that judgement in full, so a reader can tell a re-record from a cover-up without going
through git.

## What it would take

One session, on a branch that carries nothing else.

**Run the gate somewhere it fires.** `post-land.yml` already holds `SUPABASE_ACCESS_TOKEN`
(line 35, already used to push migrations - nothing new has to be provisioned) and already runs
`migration-drift.mjs` beside `db-push.mjs`. Adding `node scripts/supabase-advisors.mjs` after the
push catches a new definer function on the landing that created it, which is the only moment the
author is still in the room.

The one real design call is whether it fails the job or emits a `::warning`. Post-land runs AFTER
the merge, so a hard failure there is an alarm, not a gate. `weekly-audit.yml` is the alternative
home and can fail hard, at the cost of a week's latency - but it is secret-free on purpose
(`docs/STACK_FRESHNESS.md`), and this check needs a token, which is the reason the script's own
header gives for staying out of it. A third shape worth weighing: warn in post-land AND fail hard
in weekly-audit, which buys same-day notice plus a real gate and costs weekly-audit the property
the freshness doc argues for.

**Why the session that fixed the red half did not also do this.** A gate lands ALONE. That session
ran alongside other branches, and every one of them that merged `main` would have taken in a gate
its own prompt never saw; their red would then read as their own fault, on a check they were never
told about. The wiring was deferred for that reason, not forgotten.

## The six, and why each is accepted

Four are `authenticated_security_definer_function_executable`. That lint asks one question: can a
role reach this function that should not. For a definer function RLS never applies, so what matters
is whether the body does its own authorization. All four do, read in the migration source and then
confirmed against the live database:

- `public.is_team_member(p_team uuid)` - answers only about the CALLING account
  (`m.user_id = auth.uid()`). A caller learns whether they themselves are in a team they already
  named. It leaks nothing about anyone else, and it is definer only because the same predicate
  written inside `team_members`' own SELECT policy would recurse.
- `public.team_join(p_code text, p_display_name text)` - holding the join code IS the
  authorization, the same capability idiom as the control and output slugs. The body refuses an
  anonymous caller and a suspended account before it resolves the code.
- `public.team_production_save(p_id, p_expected, p_doc)` - refuses an anonymous caller, refuses a
  suspended account, and calls `is_team_member` on the row's own team before it writes. Without
  that inner check it would be a hole straight through every policy on the table. The check is
  there, and the migration says why in the comment above it.
- `public.team_rotate_code(p_team uuid)` - the ownership test is the UPDATE's WHERE clause
  (`t.owner_id = v_user`), so a non-owner and a non-existent team take the identical path.

The remaining two are INFO-level performance findings, and neither is a security matter:

- `unindexed_foreign_keys` on `team_productions_updated_by_fkey` - a "who last touched this"
  back-reference, exactly the shape that class is accepted for. Index it when a query against it
  shows up slow.
- `unused_index` on `team_members_user_idx` - 0053 created it for the direction `is_team_member`
  reads from. "Unused" here means teams have no production traffic yet, which is a fact about
  adoption rather than about the index.

Neither was fixed. Both fixes are migrations, and a migration on a branch about a gate would have
made post-land push schema changes for a change that is not about schema.

## Evidence

Verified live on 2026-09-09 against `kprolrchuldgfrzspthy`, because the migration text is a claim
about the database and the advisor reports on the database:

- all four functions are `prosecdef` with `search_path=""`, so no search-path hijack;
- `anon` and `public` hold EXECUTE on NONE of the four; only `authenticated` does, which is what
  the lint is naming and what the design intends;
- `authenticated` holds no INSERT and no UPDATE on `team_members`, so `team_join` really is the
  only write path;
- `authenticated` holds no UPDATE on `team_productions`, so the compare-and-swap function really is
  the only write path and no PostgREST PATCH sits beside it doing the blind write it exists to
  refuse;
- `anon` holds no SELECT on `teams`, `team_members` or `team_productions`;
- all three tables have RLS on WITH policies, so none contributes to `rls_enabled_no_policy`.

The gate itself, same day, from a linked worktree with the token read out of the main checkout's
`.env`:

- before: exit 1, 106 findings, 100 accepted, the six listed as NEW and none listed as gone;
- after `--update-baseline`: exit 0, 106 of 106, "No change against the baseline";
- the baseline diff was 32 insertions and 2 deletions - the six entries plus `recordedAt` and
  `count`. No existing entry was dropped, which is the thing to check on a re-record.

Still true from the 2026-09-08 filing:

- `grep -rn advisors .github/workflows/ package.json` - one hit, the `package.json` line.
- `.github/workflows/post-land.yml:35` - `SUPABASE_ACCESS_TOKEN` already wired.
- `node scripts/migration-drift.mjs`: production and staging both hold every migration. No drift;
  this item is only about the advisors.

## Do not drive the count toward zero

`scripts/supabase-advisors.mjs`'s header argues, with the migrations that prove it, that the ~24
`anon`-callable definer functions ARE the capability-URL model that lets an unauthenticated
CasparCG or OBS client hold an output slug, and that the tables with RLS and no policies are
deny-all, which is stricter than a policy. The 2026-09-08 review read that argument and agreed with
it. Re-reading it on 2026-09-09 while judging the six did not change that.

## Trend

- 2026-09-08: baseline 100 (recorded 2026-08-25), live 106, **6 unaccounted**, gate wired into
  0 workflows.
- 2026-09-09: baseline 106 (recorded 2026-09-09), live 106, **0 unaccounted**, gate wired into
  0 workflows.
