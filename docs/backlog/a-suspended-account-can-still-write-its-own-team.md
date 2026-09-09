# A suspended account can still rename its team and rotate its join code

**Filed:** 2026-09-09. **Source:** measurement, while judging the six advisor findings the teams
migrations added (`docs/backlog/advisor-gate-runs-nowhere.md`).

## Why

Migration 0053 states the rule it is following, in its own comment: "Suspension is an absolute
(0020): every table a signed-in account can write carries this, and a new one that did not would be
the hole the absolute is supposed to close." On `teams`, that absolute covers INSERT and stops
there. The live policy set has `teams_not_suspended_insert` as a RESTRICTIVE policy on INSERT and
nothing equivalent on UPDATE, so `teams_owner_update` admits a suspended owner. `team_rotate_code`
has the same shape from the other side: it checks that the caller is signed in and owns the team,
and unlike `team_join` and `team_production_save` it carries no `is_suspended()` test, so a
suspended owner can rotate a join code.

**This is not an escalation, and it should not be read as one.** Both verbs reach only a team the
actor already owns; neither grants access to another account's data, and neither widens what anyone
can see. What it is, is an invariant that the schema states and does not keep. The cost of that is
not today's blast radius - it is that the next person reads the comment, believes suspension is
total, and builds on it.

It is worth naming the one behaviour that is more than cosmetic: rotating a join code invalidates
every outstanding invitation to that team at once. A suspended account can therefore still lock its
teammates out of joining, which is a small denial of service against people who are not suspended.

## What it would take

One migration, and the judgement of whoever owns teams - which is why this is filed rather than
fixed. Two shapes:

1. A RESTRICTIVE `not is_suspended()` policy for UPDATE on `teams`, matching the INSERT one, plus
   the same test inside `team_rotate_code` (a definer function never meets a policy, which is why
   `team_join` and `team_production_save` each repeat it inline).
2. Decide instead that suspension gates CREATION and SHARING rather than every write, and correct
   0053's comment so it describes what the schema actually does.

Option 2 is not a cop-out. "Absolute" is a strong word to have written, and if the intended rule is
narrower then the comment is the defect. What must not survive is the current state, where the
comment and the policy set disagree and a reader cannot tell which one is the decision.

Whichever is chosen, `team_rotate_code` and `teams_owner_update` should end up saying the same
thing, because today they differ from `team_join` and `team_production_save` for no recorded reason.

## Evidence

Live on 2026-09-09, project `kprolrchuldgfrzspthy`:

- `pg_policies` on `teams`: `teams_not_suspended_insert` is RESTRICTIVE and INSERT-only.
  `teams_owner_update` is PERMISSIVE, `using` and `with check` both `owner_id = auth.uid()`, with no
  suspension term and no restrictive policy beside it for UPDATE.
- `pg_get_functiondef`: `team_join` and `team_production_save` both contain `is_suspended`;
  `team_rotate_code` does not. All three raise `42501` for an anonymous caller.
- `team_productions` carries the same INSERT-only shape (`team_productions_not_suspended_insert`),
  but nothing follows from it there: `authenticated` holds no UPDATE privilege on that table at
  all, so the CAS function is the only write path and it does carry the test.

The live state matches the migration source exactly, so this is a design gap rather than drift.
`node scripts/migration-drift.mjs` on the same day: 55 local migrations, production and staging
hold all 55.
