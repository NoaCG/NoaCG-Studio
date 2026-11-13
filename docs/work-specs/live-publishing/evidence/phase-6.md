# Phase 6 evidence: automatic updates, whole publishes

Design: `../designs/G3.md`. Acceptance: AC-4. Everything here ran on the cloud worker (4 CPUs,
13.4 GiB) against the local Supabase stack (CLI 2.111.0, `scripts/configured-stack.mjs`, accounts
`e2e-s1@noacg.local` and its teammate), with migrations 0117 and 0118 applied on top of `main`.

## What was built

- `supabase/migrations/0117_production_revision.sql`: the saved revision `rev` on `documents` (kind
  `show`) and `team_productions`, from one sequence, set by a before-row trigger;
  `team_production_save` answers `rev`. Ordinary migration.
- `supabase/migrations/0118_publication_guard.sql` (live-path): `published_rev` and `published_ver`
  on `control_shows`, two column-list guard triggers, `control_record_rev`,
  `control_output_version`, `auto_publish_on`, `auto_publish_state`. Applies in a quiet window.
- Page: `src/backend/savedRevision.ts` (which stored revision a record is), `src/control/autoPublish.ts`
  (when to publish, retries, the words), `src/control/publishRevision.ts` (one publish of a saved
  revision, Blob body from per-part steps, revision-only update), `src/control/sendsInFlight.ts`
  (Takes first), `src/components/home/useAutoPublish.ts` (runs it on the production page once the
  guard and switch are on), `src/control/playoutStatus.ts` rows, every press-driven publish naming
  its revision (`publishControlShow`).
- Output: `au: 1` in its Presence entry, `src/output/versionCheck.ts` (boot, rejoin, online, every
  30 s, retries 2, 4, 8 s), `src/output/prepare.ts` (a new version at once, newest wins; a re-check
  keeps 15 s), `src/output/payloadReader.ts` (the published copy parsed in a worker), a periodic
  new-build reload only when nothing is on air and no command for 60 s.

## Checks

### Migrations (local stack)

- 0117 and 0118 apply with `supabase migration up` on top of 0115.
- Their self-checks, run again with an account present (a throwaway `auth.users` row, rolled back):
  0117: a client revision is overwritten, a save moves the revision up, an update of another column
  does not, another kind gets none. 0118: an insert records its revision; a newer publication is
  recorded; an older one after it changes nothing; a future revision is refused; a revision-only
  update lower or future is skipped, equal lands; another column leaves the revision; an
  unversioned publish is refused with the switch on and clears the revision with it off. Both pass.
- `scripts/db-push.mjs` classifies 0117 as ordinary and 0118 as live-path with its header, neither
  blocked; `node --test scripts/db-push.test.mjs scripts/control-link-guard-migration.test.mjs
  scripts/extension-order.test.mjs`: 70 pass.

### Node tests

- `scripts/auto-publish.test.mjs` (9): single flight and newest wins (mutation: dropping the owed
  re-run fails it), transient retries 2, 4, 8 s and red after the second, a refusal not retried
  until a newer save, the next page opened publishes a closed page's save, the 20 s grace for
  another page's save, red after 20 s, no light for a revision already published, 200 random
  rounds of saves, failures, closes and opens ending with the newest save published and never going
  down, and the `au` mark read off the wire.
- `scripts/output-version-check.test.mjs` (4): boot and every 30 s, a poke at once, retries
  2, 4, 8 s and within 90 s once answered, an instance without the function stops.
- `scripts/output-reload.test.mjs` (9, one new): a version other than the one held is prepared at
  once; a re-check of the held one keeps the 15 s spacing.
- `scripts/playout-status.test.mjs` (13, two new): amber "Updating outputs", red "Saved, not on the
  outputs", amber "Reload <output> when nothing is on air".
- `node scripts/check-output-reader.mjs` after `vite build`: 27 output modules parse on Chromium 71;
  the worker's body in the bundle is plain ES2017 with no imports.

### Configured browser checks (`e2e/configured/publish-guard.spec.ts`, "automatic updates")

All three pass on the local stack (jobs j-0001 and j-0004):

| AC-4 | Result |
|---|---|
| Cue text, cue order, a graphic added and removed reach every output with no press; "Publish changes" absent | Pass: after each change the publication names the newest save and both outputs hold the new version |
| An old output reads amber "Reload <output> when nothing is on air" and takes changes while a page is open | Pass (`&oldbuild=1` output) |
| Page signal dropped and page closed: a new output reaches the newest version within 90 s | Pass; time in the job's annotation `found-alone-ms` |
| A publish made to fail keeps the save, amber then red "Saved, not on the outputs", the next page opened publishes it | Pass |
| Two publishers finishing in reverse order leave the newer save published | Pass: the older publish was held on the wire until the newer landed |

The walk runs with both switches on (`production_copies` and `auto_publish`), as production has
them; all three pass again on that setting (job j-0025).

Found while building:
- The page's Presence reader dropped the new `au` member, so every new output read as old (fixed in
  `readLiveEntry`, with a Node test).
- The automatic publish's own `fetch` did not carry the production-copies build mark, so with that
  switch on (production) the 0115 guard would have refused every automatic publish. The first walk
  ran with that switch off and missed it. Fixed (the mark is sent) and the walk now turns both
  switches on.
- A revision-only update left the row's source columns as a Connect had written them (review on
  #2469): they leave the content digest and ride every revision-only update.

### R20 (owner decision Q1)

`scripts/output-quiet-build.test.mjs`: a changed and an added graphic start no frame while a Take
waits to run on the output, and start once it has; removing the wait fails the test.

### Press to ran (AC-4), production build

Phase 2 harness, test `autopublish`, `MEASURE_BUILD=prod`, unthrottled, warm cache, one output.
"Ran" is the output's graphic `play()` call, on the one time origin. With `MEASURE_LOOP=1` the page
republishes its saved revision whole, back to back, so every output reads the copy each time.

| Fixture | Nothing published p50 / p95 (ms) | Publishing in a loop p50 / p95 (ms) | p95 difference | Presses during a publish | Failures |
|---|---|---|---|---|---|
| Typical (50 + 50) | 72.6 / 113.8 | 96.7 / 131.4 | +17.6 | 49 of 50 | 0 |
| Large (50 + 50) | 96.9 / 206.5 | 121.7 / 252.3 | +45.8 | 50 of 50 | 0 |

Throttled (20 Mbit/s, 50 ms), typical, 25 + 25: 80 / 142 ms with nothing published, 78 / 104 ms
publishing (5 publishes of 5.4 s each over the run): no slowdown. Large, 25 + 25: 103 / 215 ms
with nothing published, 101 / 144 ms publishing (2 publishes of 17.2 s): no slowdown.

Press to sent is unchanged by publishing (p95 20 to 28 ms either way), so the page's own publish
work is off the Take's path; the difference left is the output reading each new version.

Publish steps (R10): p95 of each publish's longest step 14.2 to 15.5 ms; the longest single steps
were 41.8 and 67.4 ms on the typical fixture: the first digest of each copy after the page opens
(memoized after). In use that first publish happens when the page opens.

Not measured yet: a loop of design updates (owner question Q1).

## Traps met

- The queue refuses a 12-minute cap without a reviewed admission; measurement jobs run at 5 minutes
  with 25 samples each and `--after` so two never share the dev server's port.
- `MEASURE_BUILD=prod` needs `MEASURE_DIST`, a `vite build` made with the stack's variables.
- A READY answer's `n` is graphics ready; the version an output holds is `v.n`.
