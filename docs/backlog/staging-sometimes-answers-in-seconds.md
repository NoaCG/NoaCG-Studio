# The staging project sometimes takes seconds to answer, and the hosted suite pays for it

**Filed:** 2026-09-26. **Source:** traces of hosted-latency runs read while fixing issue #382.

## Why

Of the six hosted runs on 2026-09-26 with the sync fix from pull request #442, four passed 48 of
48, including both on `main`. One of the others failed a sign-in because the password grant to
`noacg-staging` did not answer within 20 seconds; it passed on retry. (The sixth hit a team-list
race, fixed in #442, and the helper flake in
`open-production-helper-evaluate-spans-a-frame-load.md`.) Normal answers are 0.2 to 0.6 seconds. In the same run,
the retry's own requests ranged from 0.1 to 15 seconds for the same kinds of query, and an earlier
run recorded one password grant at 6 seconds, almost all of it server wait. If this recurs, the
hosted suite goes red on something that is neither our code nor latency in the sense the job
measures, and a red run stops meaning something again.

`noacg-staging` is a free project (separate free organisation, small compute). It was
`ACTIVE_HEALTHY` and held all 67 migrations when checked, with 6 sessions per test account, so
neither pausing, schema drift nor session build-up explains it.

## What it would take

1. Read the next occurrence first. The hosted job now keeps the failed attempt's trace, so the
   request that stalled and its server wait are in the `hosted-report` artifact.
2. If stalls recur on the server side, the options are the owner's: larger compute for staging
   costs money, and a sign-in helper that reuses one session per run would change what the
   specs exercise.

## Evidence

- Run 36255275830: `output-url-cannot-push.spec.ts` sign-in, dialog still busy after 20 s.
  Its retry trace: `GET /rest/v1/teams` 14.8 s, `documents?kind=eq.video` 14.6 s,
  `/auth/v1/user` 4.3 s, beside 0.3 s answers to the same burst.
- Run 36252087565: one `POST /auth/v1/token` at 6.1 s (5.98 s of server wait).
- Staging state read on 2026-09-26: 6 sessions per test account; the auth audit log is empty
  and the management API's log endpoint did not expose `auth_logs`.
- Separately, the test account collects a saved look per SVG import that nothing removes: 165 on
  2026-09-26, about 12 more per run. After #442 they cost one list request, not one each.
