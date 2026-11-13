# Phase 6 evidence: automatic updates, whole publishes

Design: `../designs/G3.md`. Acceptance: AC-4. Everything here ran on the cloud worker (4 CPUs,
13.4 GiB) against the local Supabase stack (CLI 2.111.0, `scripts/configured-stack.mjs`, accounts
`e2e-s1@noacg.local` and its teammate), with migrations 0117 and 0118 applied on top of `main`.

**AC-4 status.** The correctness half (every save reaches the outputs, no "Publish changes", the
failure and reverse-order cases) passes. On the typical fixture, publishing adds no delay that can be
measured: 10 interleaved pairs show no on minus off difference that can be told from zero (see "Repair:
repeated pairs"). The single pair first reported here (+2 ms) was one draw from a wide spread. On the
large fixture under continuous editing, publishing a whole copy per save adds about 334 ms p95 (see
"Editing while publishing"). **Owner decision (b), recorded on #2361, 2026-11-13:** phase 6
lands with the typical fixture passing; the large fixture is a recorded gap judged at the end of phase
7 with D1 (phase 7 sends only what changed); automatic updates stay off in production until then.
Nothing in this phase turns the `auto_publish` switch on.

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

- `scripts/auto-publish.test.mjs` (12): single flight and newest wins (mutation: dropping the owed
  re-run fails it), transient retries 2, 4, 8 s and red after the second, a refusal not retried
  until a newer save, the next page opened publishes a closed page's save, the 20 s grace for
  another page's save, red after 20 s, no light for a revision already published, 200 random
  rounds of saves, failures, closes and opens ending with the newest save published and never going
  down, the `au` mark read off the wire, a "not allowed" refusal not retried on later saves, and the
  failure classes (a 401 that outlived one session refresh is transient; 403, 42501 and a row-policy
  message are "not allowed"; the guard's "names a save that does not exist" is a guard refusal), and
  a sync that brings no newer save neither lifts a refusal nor restarts the failure count (R7; it
  fails on the code before the fix, where any sync of a personal production cleared both).
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
| A graphic that joins an OBS scene is taken there after an automatic publish, with no press (obs-scenes #2489, Codex on #2488) | Pass (j-0124); with the automatic path's scene join removed it fails (j-0125) |

The new-output step of the first walk also asserts the output read the published copy in its worker,
not on the main thread (R12), through a `window.__noacgWorkerReads` counter the reader bumps on each
answer.

The walk runs with both switches on (`production_copies` and `auto_publish`), the setting automatic
updates will run on. Production today has only `production_copies` on; `auto_publish` stays off there
until the end of phase 7 (owner decision (b)). All pass on that setting (jobs j-0025, j-0026 after the review fixes, j-0029 after the
cleanups, j-0033 with the review steps added, and j-0126 with all seven steps on the final code). The
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
  is three visible lines and the Codex P1 it answers is resolved by inspection. The team Node test and
  a team step in the configured walk are follow-up #2502 (P2), to pass before `auto_publish` goes on.
- Codex on 16c3fa89: an automatic publish skipped the steps a press's publish runs after it lands.
  It did not recompute which graphics' events need the server's time (so a design update that gave a
  graphic a clock could keep its events on the fast road, without `created_at`), which graphics still
  read a Sheet, or take a graphic that joined an OBS scene (the scenes feature landed on `main` during
  this phase). Both paths now share the steps: `publishedFacts` in `useProductionPublish.ts` and one
  scene-join function on the page, with `publishRevision` returning the scenes it replaced. The scene
  join has a walk step that fails without it. The event-road recompute has no test of its own: no
  test observes the road even for a press's publish, and the automatic path now runs the same
  function the press's path does.
- A revision-only update left the row's source columns as a Connect had written them (review on
  #2469): they leave the content digest and ride every revision-only update.

### R20 (owner decision Q1)

`scripts/output-quiet-build.test.mjs`: a changed and an added graphic start no frame while a Take
waits to run on the output, and start once it has; removing the wait fails the test.

### Press to ran (AC-4), production build

Phase 2 harness, test `autopublish`, `MEASURE_BUILD=prod`, unthrottled unless stated, warm cache,
one output. "Ran" is the output's graphic `play()` call, on the one time origin. The harness's loops
and counters exist only in a build made with `VITE_MEASURE_HOOKS=1`: the measure config sets it on
its dev server and refuses a `MEASURE_DIST` built without it, and an ordinary `vite build` carries
none of them (checked: the six harness strings, `noacg-measure-edit-loop`,
`noacg-measure-publish-loop`, `Loop strap`, `__noacgPublisherTally`, `__noacgEdits` and
`__noacgPublishWindows`, are in 0 bundle files of a plain build and in 1 of a hooked build).

Press to sent is unchanged by publishing (p95 20 to 28 ms either way), so the page's own publish
work is off the Take's path; the difference left is the output reading each new version.

#### Editing while publishing (owner decision Q1, G3 section 13)

The design's judged loop pays the save on both sides: the page edits the production continuously,
once with automatic updates on (each save publishes) and once off (each save only saves), so the
difference is the publishing. Harness: test `autopublish` with `MEASURE_EDIT`, production build,
local stack, unthrottled, press to ran at the output.

**At a 3 s edit pace (judged).** Past the sync engine's 2.5 s debounce, so each edit is its own save
and, with updates on, its own publish.

| Loop | Fixture | Samples | On p50 / p95 (ms) | Off p50 / p95 (ms) | p95 difference |
|---|---|---|---|---|---|
| Cue text and values | Typical | 50 + 50 | 67 / 150 | 61 / 148 | +2 in this one pair; 10 pairs show the spread (see "Repair: repeated pairs") |
| Cue text and values | Large | 50 + 50 | 101 / 1502 | 69 / 1168 | +334: recorded gap (owner decision b) |
| Graphic added and removed (reported, not judged) | Typical | 25 + 25 | 66 / 182 | 69 / 661 | publishing is not the cost |
| Design update: the last graphic's stylesheet changed (reported, not judged) | Typical | 25 + 25 | 64 / 172 | 68 / 781 | publishing is not the cost |

Both reported loops read higher with updates off than on: their off runs carry 2 or 3 Takes over 500
ms that land on a save of a changed graphic, and at 25 samples the p95 is the second highest. Neither
loop is judged (owner decision Q1). The design loop ran on the build with the harness hooks (j-0120,
j-0121), with a cue-loop check on that same build reading 68 / 148 ms on, in line with the table (j-0122).

With updates on, every save was a new version: 9 to 10 publishes per typical run, 5 to 6 per large
half. Press to sent stays under 51 ms p95 either way, so the extra time on the large fixture is the
output re-reading each whole copy (6 to 20 MB), which phase 7 removes.

**At a 1 s edit pace (reported, not judged).** Faster than one sync pass, so the result depends on the
sync engine rather than on publishing.

| Loop | Fixture | Samples | On p50 / p95 (ms) | Off p50 / p95 (ms) |
|---|---|---|---|---|
| Cue text and values | Typical | 300 / 250 | 63 / 98 | 64 / 88 |
| Cue text and values | Large | 50 / 50 | 1346 / 1847 | 73 / 129 |

At this pace the debounce never fires, so a run saves only if a sync pass overlaps the edits. On the
large fixture such a pass sets off the sync engine's queued re-run, which then never stops: 28 to 74
saves per run, Takes at 1 to 2 s. It happens with the switch off too (2 of 3 probe runs, 28 and 29
extra saves, a stack probe through source maps showing every pass from the `queued` branch of
`syncNow`) and with it on (4 of 6 runs; the publisher itself made 2 to 4 revision checks and no
catch-up). The large 1 s off runs in the table happened not to fall into it. Filed as #2494, P1,
fixed separately before phase 8; not touched here. Two earlier typical on-runs (256 and 1279 ms p95)
are left out of the 1 s pool: during the second the shared revision sequence rose by 328 against 4 to
8 in every other run, a second writer on the stack (a killed job's browser still editing).

**Why the large off baseline reads about 1.1 s, not the 206 ms of the republish runs.** Different
loops: the republish runs below make no edits, so the large record is never saved; the 3 s off runs
save it 16 to 19 times each. Every run with no save has no Take over 500 ms (republish "nothing
published": p95 206 and 195; 1 s off, where the debounce never fires: 112 and 416). The 3 s off runs
have 2 and 3 Takes of 25 over 500 ms, each landing on a save of the large record, and with 25
samples the p95 is the second highest. Same build family, same machine, load average under 2: the
drift is the per-save cost of the large record, not a regression.

#### Repair: repeated pairs (check 6-c-3476)

The independent check on the merge (7451fbba) ran the same loop as 4 interleaved pairs of 50 and
read p95 439 ms on against 179 ms off, +260. Its per-pair differences were +363, +358, +30 and +15.
The repair ran the same method on the same commit: production build with the harness hooks, local
stack (127.0.0.1), test `autopublish`, `MEASURE_EDIT=cues`, typical fixture, unthrottled, one
output. It ran 10 interleaved pairs, each pair on then off.

| | Takes | p50 (ms) | p95 (ms) | p99 (ms) | Takes of 150 ms or more |
|---|---|---|---|---|---|
| Automatic updates on | 500 | 80 | 256 | 588 | 47 |
| Automatic updates off | 500 | 75 | 431 | 537 | 48 |

Single-run p95 ranged from 100 to 514 ms on both sides: on 122, 151, 184, 193, 202, 256, 445, 483,
498, 514; off 100, 116, 118, 123, 221, 432, 449, 454, 468, 468. A run's p95 is its third-slowest
Take of 50, and a run has 1 to 9 slow ones, so the p95 jumps between about 120 and 470 ms with the
count. A bootstrap over the 10 pairs puts the on minus off p95 between -246 and +133 ms (5th and
95th percentile). Both the first +2 and the check's +260 lie inside that spread. At this noise, AC-4's
50 ms margin cannot be judged with a p95 difference. What the runs do show: p50 is 5 ms higher with
updates on, and the count of slow Takes is the same.

**What makes a Take slow, on both sides.** Temporary probes, not committed, recorded when each Take
reached the output, each page request, each sync pass and its origin, and the page's long tasks
(the browser's Long Tasks API). The probes found:

- Every slow Take reaches the output late and runs at once. The Take's own send leaves the page 130 to
  770 ms after the press, each time just after the page starts uploading a 2.2 MB save of the
  production. Press to sent, as the harness times it, stays near 10 ms.
- Every 3 s edit makes two sync passes, the second a re-run that starts as soon as the first ends
  (46 of 92 passes, the same with updates on and off). This is the sync engine's queued re-run,
  #2494, here on the typical fixture. Each pass holds the page's main thread for 110 to 190 ms. 10 of
  the 14 slow Takes in the four probed runs overlap such a task, against 3 of the 186 fast ones.
- The output's preparation of each new version (reading the copy in its worker, about 200 ms, and
  the graphics' re-check, about 30 ms) never overlapped a slow Take.

So the slow Takes come from the page's save, which runs whether automatic updates are on or off,
and not from publishing. The sync engine is not changed here. #2494's fix, #2497, runs one pass per
pause in editing instead of two per edit. The save's main-thread time is the page's own work that
AC-1 judges.

#### Republishing, nothing edited

With `MEASURE_LOOP=1` the page republishes its saved revision whole, back to back; each republish is a
new version `n`, so every output re-reads the copy each time.

| Fixture | Nothing published p50 / p95 (ms) | Publishing in a loop p50 / p95 (ms) | p95 difference | Presses during a publish | Failures |
|---|---|---|---|---|---|
| Typical (50 + 50) | 72.6 / 113.8 | 96.7 / 131.4 | +17.6 | 49 of 50 | 0 |
| Large (50 + 50) | 96.9 / 206.5 | 121.7 / 252.3 | +45.8 | 50 of 50 | 0 |

Throttled (20 Mbit/s, 50 ms), typical, 25 + 25: 80 / 142 ms nothing published, 78 / 104 ms
publishing; large, 25 + 25: 103 / 215 ms and 101 / 144 ms. The review asked for the large row again:
it no longer finishes on this worker inside the 5 minute job cap (the large fixture build and the
loop's warm-up take most of it; 25, 15, 10 and 8 samples were each stopped at the cap), and a wider
cap needs a queue admission not taken here. The 3 s cue loop above is the controlled measurement that
replaces it and shows the same large result.

R10 (no publish step over 16 ms) is not measured here: a recorded departure. The step timer in
`publishRevision.ts` wraps the gate checks, the cue measuring (`timed(measure)`, which waits on
frames), the payload build, the digests and the body parts, and each value includes the time the step
spends waiting, not only the time it holds the main thread; the `PATCH` itself is outside it. So its
largest value on the large fixture, 7 to 8 s, is a wait (it covers the measuring), and the 41.8 and
67.4 ms on the typical fixture (the first digest of a copy after the page opens) are upper bounds,
not main-thread blocks. What the evidence does show is R10's intent, a Take never waiting on a
publish: press to sent is unchanged by publishing (p95 under 51 ms either way, above), so no publish
step holds a Take. Measuring the main-thread time itself (the browser's Long Tasks API) is left for
phase 7, where the publish path changes.

## Traps met

- This cloud shell's own variables name the hosted project. A configured job queued without the
  local stack's file loaded runs against it, so the spec's service-role switch writes now run only
  when the backend address is local (`LOCAL_STACK` in `publish-guard.spec.ts`).
- The queue refuses a 12-minute cap without a reviewed admission; measurement jobs run at 5 minutes
  with 25 samples each and `--after` so two never share the dev server's port.
- `MEASURE_BUILD=prod` needs `MEASURE_DIST`, a `vite build` made with the stack's variables.
- A READY answer's `n` is graphics ready; the version an output holds is `v.n`.
