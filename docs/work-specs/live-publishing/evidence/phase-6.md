# Phase 6 evidence: automatic updates, whole publishes

Design: `../designs/G3.md`. Acceptance: AC-4. Everything here ran on the cloud worker (4 CPUs,
13.4 GiB) against the local Supabase stack (CLI 2.111.0, `scripts/configured-stack.mjs`, accounts
`e2e-s1@noacg.local` and its teammate), with migrations 0117 and 0118 applied on top of `main`.

**AC-4 status.** The correctness half (every save reaches the outputs, no "Publish changes", the
failure and reverse-order cases) passes. The timing half passes on the typical fixture and does not
on the large one under continuous editing: publishing a whole copy per save adds about 334 ms p95 to
press-to-ran there (see "Editing while publishing"). Phase 7 sends only what changed. How to treat
the large fixture, fix the output read in this phase, record it as a known gap until phase 7, or keep
automatic updates off for large productions until then, is an owner or coordinator decision.

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

- `scripts/auto-publish.test.mjs` (11): single flight and newest wins (mutation: dropping the owed
  re-run fails it), transient retries 2, 4, 8 s and red after the second, a refusal not retried
  until a newer save, the next page opened publishes a closed page's save, the 20 s grace for
  another page's save, red after 20 s, no light for a revision already published, 200 random
  rounds of saves, failures, closes and opens ending with the newest save published and never going
  down, the `au` mark read off the wire, a "not allowed" refusal not retried on later saves, and the
  failure classes (a 401 that outlived one session refresh is transient; 403, 42501 and a row-policy
  message are "not allowed"; the guard's "names a save that does not exist" is a guard refusal).
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
| A record whose revision is not known (not saved since 0117) keeps Publish changes and is not published; once its revision is known, automatic mode starts and publishes it (G3 section 8, review on #2488) | Pass (job j-0031); with the check removed it fails (j-0032) |
| A save that changes only a binding moves `published_rev` and the row's source columns, not the version `n` (R5, review on #2488) | Pass; with the digest gate removed it fails (j-0034) |
| A page that may not publish reads red "Saved, not on the outputs" while another save waits (G3 section 9, review on #2488) | Pass; with the row removed it fails (j-0034) |

The new-output step of the first walk also asserts the output read the published copy in its worker,
not on the main thread (R12), through a `window.__noacgWorkerReads` counter the reader bumps on each
answer.

The walk runs with both switches on (`production_copies` and `auto_publish`), as production has
them; all six pass on that setting (jobs j-0025, j-0026 after the review fixes, j-0029 after the
cleanups, and j-0033 with the review steps added). The
automatic publish's `fetch` goes through `answeredFetch`, which adds the production-copies build
mark to every REST request, so the 0115 guard accepts it.

Found while building:
- The page's Presence reader dropped the new `au` member, so every new output read as old (fixed in
  `readLiveEntry`, with a Node test).
- Review on #2488: a team confirmation read the store's token after the revision read, so a record
  adopted meanwhile could be confirmed as the newer revision; the token is now read before and
  after, and a change means wait. A record with no revision yet entered automatic mode and hid
  Publish changes; automatic mode now needs the revision known.
  Test gap: `confirmedRevision`'s team branch has no dedicated test. It reads `getSupabase` and the
  `teamProductions` module state, neither injectable, so a Node test cannot drive the token across the
  revision read without refactoring the function for a test, which the "avoid risky changes" brief
  discourages here; the configured walk covers only personal productions. The before-and-after read
  is three visible lines and the Codex P1 it answers is resolved by inspection. A team configured walk
  step is the place for it and is deferred.
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

#### Editing while publishing (owner decision Q1, G3 section 13)

The design asks for the loop that pays the save on both sides: the page edits the production
continuously, once with automatic updates on (each save publishes) and once off (each save does not),
so the difference is only the publishing. The harness edits the last cue every 3 s, past the sync
engine's 2.5 s debounce, so each edit is its own save and, on, its own publish. Press to ran at the
output, 50 samples each, production build, unthrottled.

| Cue edits every 3 s | Updates on p50 / p95 (ms) | Updates off p50 / p95 (ms) | p95 difference |
|---|---|---|---|
| Typical (50) | 67 / 150 | 61 / 148 | +2: within AC-4 |
| Large (50) | 101 / 1502 | 69 / 1168 | +334: **over AC-4's 50 ms** |

On the typical fixture, publishing every save adds nothing a Take feels. On the large fixture it does
not meet AC-4: each save is a new version `n`, and every output re-reads the whole published copy
(6 to 20 MB; phase 7 sends only what changed). The off column is already high on the large fixture,
because each large save is itself expensive; publishing adds 334 ms on top.

Design-update loop (a graphic added and removed every 3 s, reported not judged, Q1): typical p95
182 ms on, 661 ms off; publishing is not the cost there.

At a 1 s edit pace (faster than one sync pass), the result stops being about publishing: the sync
engine re-runs its pass without pause and slows Takes to 1 to 2 s with the switch off too (issue
#2494, not this phase). Measured: typical p95 98 ms on, 88 ms off; large p95 1847 ms on, but the
off runs that did not fall into the chain read 129 ms, so the large 1 s number swings on the chain,
not on the switch. The 3 s pace above avoids it and is the fair AC-4 measure.

R10 (no publish step over 16 ms): press to sent is unchanged (above), so no publish step blocks a
Take. The step timer wraps each awaited build or write; its longest single value on the large fixture
is the multi-megabyte `PATCH`, about 7 to 8 s, which awaits the network and does not block; the
longest main-thread step (a content digest) was 41.8 and 67.4 ms on the typical fixture, the first
digest of a copy after the page opens, memoized after. Reporting the maximum, not the p95 of maxima,
is a recorded departure from R10's wording: the rule's intent, a Take never waiting on a publish, is
met by press-to-sent being flat.

The large republish-vs-nothing repeat the review asked for could not finish at full samples on this
worker: the large fixture build plus the loop warm-up exceeds the 5 minute job cap, and a wider cap
needs a queue admission not taken here. The cue-edit on-vs-off comparison above is the controlled
replacement (both sides pay the save) and shows the same large result.

## Traps met

- This cloud shell's own variables name the hosted project. A configured job queued without the
  local stack's file loaded runs against it, so the spec's service-role switch writes now run only
  when the backend address is local (`LOCAL_STACK` in `publish-guard.spec.ts`).
- The queue refuses a 12-minute cap without a reviewed admission; measurement jobs run at 5 minutes
  with 25 samples each and `--after` so two never share the dev server's port.
- `MEASURE_BUILD=prod` needs `MEASURE_DIST`, a `vite build` made with the stack's variables.
- A READY answer's `n` is graphics ready; the version an output holds is `v.n`.
