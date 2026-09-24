# A migration that adds an index reddens post-land until somebody re-records the advisor baseline

**Filed:** 2026-09-24. **Source:** the advisor re-record after pull request #402 (migration 0065)

## Why

`scripts/supabase-advisors.mjs` fails post-land on any finding that is new since
`supabase/advisor-baseline.json`, including a new member of a class it already accepts. For most
classes that is right: a new table with RLS and no policies is exactly what the check exists to
catch. For `unused_index` (level INFO) it is certain noise. Every new index is unused on the day
it lands, because the feature it serves has had no production traffic yet, and the baseline
cannot be recorded ahead of the landing because production does not have the index until the
migration applies. So every migration that adds an index turns post-land red on every landing
after it, until production happens to use the index or somebody re-records. On 2026-09-24 that
was two red runs (36029914027, 36044954410) and a wave row's worth of reading. A real finding
arriving during that window would look exactly the same.

## What it would take

In `scripts/supabase-advisors.mjs`, report a NEW `unused_index` finding at INFO level as a
warning that does not set exit code 1, when the index it names is created by a migration in
`supabase/migrations/`. Every other class keeps failing on a new member. Pull the decision into a
pure function with a `node --test` file, since the script has none today, and update the
"A new member of an accepted class still fails" paragraph in `docs/STACK_FRESHNESS.md` to name
the one exception and why it holds.

The alternative, letting a migration's own commit add a pending acceptance to the baseline, was
considered and is worse: the author has to remember it, and the baseline would then list an entry
the live report does not yet carry.

## Evidence

- Post-land runs 36029914027 and 36044954410: `NEW since the baseline: [INFO] unused_index
  agent_packages_user_created_idx`, exit 1.
- The same index had 5 scans by about 20:25 UTC the same evening, and the next live check read
  `109 advisor findings; 109 accepted in the baseline.`
