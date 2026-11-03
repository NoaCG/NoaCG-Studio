# A watch on the production database's load

Why: on 2026-11-03 the production database stalled and crashed. Supabase's warning email arrived
about 1.5 hours after the stall, and nothing here was looking at memory or disk. The owner moved
production to Small compute the same day and asked to keep an eye on the load, because safe and
reliable playout depends on it.

## Behaviour

Every 30 minutes a scheduled job reads production's system metrics and service health, twice over
60 seconds for the rates. It alarms through the usual rolling issue, `Production database load is
red`, when any of these holds:

- memory available is under 15% of the total
- more than half of the swap is in use
- memory is thrashing: over 100 major page faults per second
- disk traffic is above half of the compute size's sustained baseline
- a service is not healthy, or the numbers could not be read

The issue closes itself on the next healthy run, and a repeat of the same finding adds no comment.
Each run's numbers stay in its step summary. `npm run load` prints the same report on demand.

## Non-goals

- Changing compute automatically. A size change restarts the database, so a person decides it.
- Reducing the database's work. That is separate work, measured from what this job reports.
- Catching a spike shorter than the gap between runs. GitHub also delays scheduled runs, so this
  is an early warning and not a pager.

## Acceptance

- The judgement and the report are pinned by `scripts/production-load.test.mjs` without a network.
- Run by hand against production, the script reads real numbers and reports them healthy.
- After landing, a dispatched run on `main` reads production with the CI token and is green.
