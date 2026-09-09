---
kind: agent
date: 2026-09-09
---
# A single browser walk no longer waits for a whole suite's worth of memory

The job queue charged every command it did not recognise a full Playwright suite: one
suite-equivalent, and with it a demand for 4 GB of free RAM before the job may start. On the night
of 2026-09-09 that refused j-0888 - one OGraf renderer walk, a single page - for about three hours
with "only 2.0-3.2 GB RAM free, needs 4.0", while six other sessions landed around it. The session
shipped pull request 212 with the renderer states read out of the DOM and no pictures.

Two things were wrong. A job could not declare what it weighs at all: `costOf` read a `cost` field
off the record and `addJob` never wrote one, so the field was dead. And the fallback for an
unknown command was the heaviest thing on the machine. Both are fixed, and the 4 GB floor is
untouched: a real suite is still refused on a short box, which on this laptop it should be.

## The route, under a minute

In any worktree, with the queue's own store (this uses a throwaway one so nothing real runs):

```
export NOACG_JOBS_DIR=/tmp/qdir
node scripts/jobs.mjs add "node scripts/ograf-external-walk.mjs --server C:/tmp/x"
node scripts/jobs.mjs add "npm run test:e2e:affected"
```

**What to look at.** On a laptop with about 3 GB free, the walk answers `starting now` and the
suite answers `only 3.1 GB RAM free, needs 4.0`. Before this change both said the second thing.
Then declare a cost yourself: `npm run queue -- "<command>" --cost 0.25` writes `"cost": 0.25`
into the job's JSON file in that directory, the listing prints it in the `[...]` column, and the
RAM the job demands scales with it. A cost outside `0 < cost <= 1` is refused at the point it is
typed. Cancel what you queued (`node scripts/jobs.mjs cancel j-0001`) and delete the directory.

Measured on this laptop at 3215 MB free, 2026-09-09. Branch `claude/ay-per-job-cost`.
