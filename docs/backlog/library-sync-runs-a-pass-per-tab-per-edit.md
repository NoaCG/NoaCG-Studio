# Library sync runs a full pass in every open tab after every edit

**Filed:** 2026-09-29. **Source:** the production database restart that day, and review of the
fix that made `list()` return summaries.

## Why

On 2026-09-29 the production database stopped answering and restarted (06:42-06:45 UTC), and every
playout Take sent in that window failed. Just before, library sync's lists were timing out: each
pass downloaded the whole library with bodies, and passes came from several tabs at once. `list()`
now returns summaries, so one pass costs about 23 KB instead of about 19 MB for the largest
account, but the NUMBER of passes is unchanged: one edit still causes one pass in every open tab,
and each pass still reads every row of every kind. The load pattern of the incident is still there,
only smaller, and it grows with tabs times edits times library size.

## What it would take

- `src/backend/syncController.ts` `scheduleSync` runs a pass 2.5 s after every `spx-data-changed`.
  `src/model/durableStore.ts` dispatches that event in every other tab when it adopts another
  tab's write, and sync's own pull-writes dispatch it too.
- Either mark adopted writes in the event detail so `scheduleSync` ignores them, or let one tab per
  browser own sync through `navigator.locks` and keep the status chip truthful in the others.
- Acceptance: two tabs open and one edit give exactly one pass, counted in a spec (runSync calls or
  remote `list()` calls); `e2e/sync.spec.ts` and the account-switch specs still pass; a tab that
  closes while holding sync hands it over.

## Evidence

- Supabase edge logs, 2026-09-29 06:39-06:41 UTC: five full graphic lists a minute from one
  account, each 8 to 18 s of origin time, then statement timeouts, then the restart.
- The same account's summary list measured 45 ms and 23 KB against 666 ms and 19 MB with bodies.
