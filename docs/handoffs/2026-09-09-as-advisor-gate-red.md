# Row AS - the gate that is red and that nothing runs

**Branch:** `claude/as-advisor-gate-red`, queued. **Gate:** `npm run build` green twice (once per
commit); CI run 34408681799 on `7de4215c` green with Build, Factory gates, E2E plan and CI gate all
success and the E2E shards skipped by CI's own plan job, since no product code changed.
**check: run in full** - `review: discarded+inline`, `simplify: inline`, `verify: inline`,
`taste: not applicable`. Stamp written and verified to cover the tip.

## No security hole was found, and here is what that verdict rests on

The row asked for this first if any of the six turned out to be real, so: **none of them is.** All
four `SECURITY DEFINER` functions do their own authorization inside the body, which is the only
thing that protects a definer function because RLS never applies to one. `is_team_member` answers
only about the calling account; `team_join` treats holding the code as the authorization and
refuses anonymous and suspended callers first; `team_production_save` refuses anonymous and
suspended callers and then calls `is_team_member` on the row's own team; `team_rotate_code` puts
the ownership test in the UPDATE's WHERE clause. The two remaining findings are INFO-level
performance notes.

**The reason to believe that is not the migration text.** I read the migrations, then queried the
live project, because the migration files are a claim about the database and the advisor reports on
the database. The live answers: all four are `prosecdef` with `search_path=""`; neither `anon` nor
`public` holds EXECUTE on any of them; `authenticated` holds no INSERT or UPDATE on `team_members`
and no UPDATE on `team_productions`, so the two RPCs really are the only write paths; `anon` holds
no SELECT on any of the three tables; and the live policy set matches the source expression for
expression.

**The trap that made the live check worth doing, and that the next person should not have to
rediscover.** Commit `8e31b649`, "Close four authorization gaps the teams schema left open", edited
migrations `0053` and `0054` **in place** instead of adding a new migration. An already-applied
migration is not re-run by `supabase db push`, so that hardening could have existed in git and not
in the database, and anyone reading the migration files would have seen a fix that was not there.
It is there - `pg_get_functiondef` shows `team_production_save` carrying both its suspension test
and its membership test - but the only reason I know that is the query. **Reading a migration file
does not tell you what the database contains whenever a migration was edited after it was applied.**

## What landed

Two commits.

`7de4215c` re-records `supabase/advisor-baseline.json` from 100 entries to 106. The diff added
exactly the six and dropped none, which I verified key by key rather than trusting the counts: 106
declared equals 106 actual, keys sorted, zero of the old 100 missing. The commit message carries the
per-function judgement so the record survives without this file.

`a6f5355a` rewrites `docs/backlog/advisor-gate-runs-nowhere.md` around the half that is still open
and files one new backlog item.

**I deliberately did half the item, and the backlog file says so in its own text.** The gate is not
wired into CI on this branch. Sibling rows were live tonight, and every one of them that merged
`main` would have taken in a gate its own prompt never saw; their red would then read as their own
fault on a check nobody told them about. The remaining half is written up with the three candidate
shapes and the one real design call (hard failure in `post-land` is an alarm rather than a gate,
because post-land runs after the merge; `weekly-audit` can fail hard but is secret-free on purpose
and this check needs a token).

## The finding that came out of the live queries

`docs/backlog/a-suspended-account-can-still-write-its-own-team.md`. Migration 0053 states that
suspension is an absolute covering "every table a signed-in account can write". On `teams` that
holds for INSERT and stops: `teams_owner_update` has no suspension term and no restrictive policy
beside it, and `team_rotate_code` carries no `is_suspended()` test where `team_join` and
`team_production_save` both do. A suspended owner can therefore still rename their team and rotate
its join code.

**It is not an escalation and I did not treat it as one** - both verbs reach only a team the actor
already owns. What it is, is a stated invariant the schema does not keep, and the cost is the next
person believing the comment. The one consequence beyond cosmetics: rotating a code invalidates
every outstanding invitation at once, so a suspended account can lock out teammates who are not
suspended. Filed rather than fixed, because the fix is a migration and it belongs to whoever owns
teams - and because a migration on a branch about a gate would have made post-land push schema
changes for a change that is not about schema.

## The check chain, and why the review leg says `discarded+inline`

**The delegated code-review pass scoped itself against the stale local `main` and has to be
discarded.** Local `main` is **29 commits behind** `origin/main` in this worktree. The pass reviewed
`main...HEAD` and reported 56 files; the true diff against the merge base was 2. Every one of its
four findings was in `cli/` - work that landed tonight as pull request 203 and that my row was told
not to touch. This is the exact failure `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`
already describes, now with a fourth measured instance.

**It also spawned a subagent, and that is the part not yet written down anywhere.** I spawned
nothing deliberately. The forked `code-review` skill did, and the subagent went and measured graphic
type ids and design-id column widths for the CLI's `noacg types` table - another row's landed work.
Its report reached the orchestrator, which relayed it to me. So a mis-scoped review does not merely
return wrong findings; it spends a subagent on another row's files and puts a report into the wrong
inbox. Worth knowing when weighing how to fix the scoping bug.

The `simplify` skill returned fan-out instructions rather than a result, so that leg ran inline over
reuse, simplification, efficiency and altitude. It found two defects in my own docs and I fixed
both: a bullet filed under a "still true from the 2026-09-08 filing" heading that was actually a
fresh re-run, and a day count that would drift as the file aged.

## For whoever owns `cli/` next - unverified, from a discarded pass

Pass these on rather than acting on them; I did not verify them and my row was told to stay out of
`cli/`.

- `cli/src/commands/types.ts:42` - `Math.max(60, Math.min(200, Math.floor(columns)))` floors the
  layout at 60 columns while the elision still runs, so the claim is that below 60 the line wraps
  anyway **and** shows less than it used to. The floor is real; I read the line. Whether the
  consequence holds I did not test.
- `cli/src/output.ts:117` - the claim is that `refuseStrayArgs(args, 1)` with no `example` prints
  "everything this verb takes is a flag" for four verbs that take a positional path, which would be
  wrong advice for an unquoted path containing a space.
- `cli/src/commands/caspar.ts:489` - the claim is that a comment asserting no flag can hold a space
  is wrong about `caspar play --url`.

**One thread I did close, so nobody chases it:** the stray subagent's caveat that `neutral` is 7
characters while design ids max at 6 is **not** a defect in that table. `neutral` is its own
yes/no column (`types.ts:30` and `:36`), not a value in the sized `designs` column. The report
itself flagged the distinction correctly; I am recording the resolution so it does not become a row.

## Nothing here needs the owner

No money, no account, no identity, no irreversible step. The one judgement call - whether a stale
recorded set justifies `--update-baseline` - is mine and it is written down in two places he can
disagree with: the commit message and the backlog file.

## Pointers

- `scripts/supabase-advisors.mjs` - the header explains why this is a baseline check rather than a
  plain advisor run, and its argument against driving the count to zero is sound; I re-read it while
  judging the six and it did not change my verdict.
- `supabase/advisor-baseline.json` - 106 entries, recorded 2026-09-09.
- `docs/backlog/advisor-gate-runs-nowhere.md` - the CI half, with the design call laid out.
- `docs/backlog/a-suspended-account-can-still-write-its-own-team.md` - the new finding.
- The token comes from the **main checkout's** `.env`; a linked worktree has none and
  `scripts/read-dotenv.mjs` reaches across for it. Running the gate from a worktree works.
- `node scripts/migration-drift.mjs` on 2026-09-09: 55 local migrations, production and staging
  hold all 55.
