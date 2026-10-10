# AC-1 and AC-2: the nightly records the trace and builds the map

Run: nightly.yml dispatched on `claude/e2e-test-dependency-tracing-b56386` at 86036e484,
https://github.com/NoaCG/NoaCG-Studio/actions/runs/38050437755 (2026-10-10, 12:01-12:20 UTC).

## AC-1: per-spec executed files, at no measurable cost

- All 12 shard jobs passed with `NOACG_E2E_TRACE` set, and each uploaded `nightly-trace-<n>`.
- The report job's merge printed: `229 spec(s) traced from 12 shard trace(s), 1190 source file(s);
  0 kept their previous entry (none), 0 have none (none).` Every spec on disk was traced and
  finished.
- The report job's E2E time budget compared the run with the previous scheduled nightly
  (38029240672): `like-for-like 4.36 -> 4.26 s over 2215 tests in both runs (2.2% faster)`, mean
  4.27 s against a 5.50 s ceiling, "Within budget." Tracing adds no measurable test time.
- Locally on 2026-10-10 (Windows, one worker, three spec files, 67 tests), the summed test durations
  were 148.4 s with request logging and 148.2 s with coverage tracing.

## AC-2: the map is built, uploaded, and proposed only from `main` or the schedule

- The report job uploaded `e2e-traced-map` (2,016,308 bytes). It is the `scripts/e2e-traced.json`
  committed on this branch, byte for byte: `sha` 86036e484, `tracedAt` 2026-10-10T12:19:44Z, `run`
  38050437755.
- The `Queue the traced spec map` step was skipped on this branch dispatch, as its condition says
  (`github.event_name == 'schedule' || github.ref == 'refs/heads/main'`).
- The queue path itself (cut `bot/e2e-traced` from origin/main, write the map, commit, force-push,
  stamp, label, auto-merge; no proposal when main already holds the map) is pinned by
  `scripts/e2e-traced.test.mjs` with stubbed `git` and `gh`. Its first real run is the first
  scheduled nightly after landing; it reuses `queuePullRequest` (scripts/queue-pr.mjs), the path
  the quarantine's bot branches land through.

Not checked: a real `bot/e2e-traced` pull request landing through the merge queue. That happens on
the first scheduled nightly after this lands.
