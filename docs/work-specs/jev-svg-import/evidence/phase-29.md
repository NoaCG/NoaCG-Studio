# Phase 29: Qualify exports and isolated receiving hosts

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-16: "Generated packages pass existing isolated receiving-host tests; hosted clock recovery is
  distinguished from standalone capability and physical studio acceptance."
- Row 29: "Run the existing isolated player/host paths on generated packages. Distinguish hosted
  synchronized recovery from standalone-host capability; test clock and credits commands without
  claiming physical studio acceptance."

Builder: Claude Code cloud worker created by coordinator `session_017SdbwQ6d3pRaakjohGfCcC`,
environment `env_017nuiDZBW9smUNLdWVQK8cf`. Tests only: no product file changed. No model call,
no spend; the holdout was not read.

## Pinned main

Worktree created from `5dbc3f642c7cb848cdb15665e04a75b6945bfdb6` (PR #1993, row 28) after a fresh
fetch. Previous verified main: that SHA. Merge-group CI, push CI, configured-suite, Post-landing
and Quarantine all succeeded on it.

## Three things, kept apart

| What | Meaning | Where it is proven | Claimed here |
|---|---|---|---|
| Hosted synchronized recovery | Our hosted `/output` rejoins a running clock after a reboot, from the hosted log | `e2e/configured/scorebug-output.spec.ts` (real backend, two outputs) | Yes, for an imported duration (new) and a count-up (row 9) |
| Standalone-host capability | An exported package in a foreign or isolated host with no wire: an OGraf renderer, SPX | `e2e/ograf-lifecycle.spec.ts`, `e2e/spx-operator.spec.ts`, `e2e/ograf-parity.spec.ts` | Yes, the commands below. No server stamps the clock: it counts from that host's own clock, and a reload has no log to rejoin |
| Physical studio acceptance | Real playout hardware, real SPX or OGraf servers, a real studio | Not here | No. The release row (40) labels it separately |

## What each host proves on generated packages

Every package is the graphic the import road saved: the wizard is walked on a jev fixture
(`score-clock-1.svg`, `credits-1.svg`), finished into a production, and the library's template is
built by the real exporter. No package is hand-made.

- **OGraf renderer, no wire** (`ograf-lifecycle.spec.ts`, two new tests, the existing renderer
  mount on Playwright's paused clock):
  - Count-up clock: the manifest's custom actions are exactly `clock_start`, `clock_pause`,
    `clock_reset`. A Take holds the drawn time; Start counts on the renderer's clock (12:08 to
    12:11 in 3.5 s); Pause holds; a correction sent as `updateAction` while held is the time shown
    and Start counts on from it; a score sent while it runs leaves the clock alone; Reset is the
    drawn time and keeps the score.
  - Duration clock: waits off air; the Take starts it from the renderer's own Take; Pause holds,
    Reset is the drawn time; Out and a fresh Take are a new count of its length.
  - Cards (credits): the manifest's custom action is `nextCard`. The list arrives as `load` data,
    the Take shows the first card, a card with no card time waits, `nextCard` turns to the second,
    and the last card holds.
  - Roll (credits): the list moves up the frame on the renderer's clock; a list sent on air waits
    and the next Take rolls it (row 24's snapshot rule).
- **SPX, no wire** (`spx-operator.spec.ts`, one new test, the package served as SPX serves it):
  SPX's rundown has no clock button (no `button` field); the package's own control page carries
  them and sends them on its channel, which the test posts exactly as that page does. Count-up:
  Play holds, Start, Pause, a correction through SPX's Update, a score Update that resends the
  start time does not pull the clock back, Reset. Duration: starts on SPX's Play, Stop and Play is
  a new count. Cards: SPX has no custom actions, so the wizard's card time (3 s) turns the cards;
  the last one holds. No page error.
- **OGraf parity** (`ograf-parity.spec.ts`): the two fixtures' drawings, fields bound, paint the
  studio's frame in the default slice (28 designs, 0 failing). Parity builds through
  `e2e/_ografBuild.ts`, which makes field-only imports, so it checks the drawing, not the clock or
  credits runtime; the lifecycle tests above run those.
- **Hosted output, real backend** (`configured/scorebug-output.spec.ts`, one new test): an imported
  duration published and rendered by two `/output` pages. The Take starts both; a correction typed
  while it runs moves both; one output reloads and must come back with an origin from before the
  reboot (not the reboot instant), within the fast road's spread of the other output, showing the
  same second within 2 s. The configured imported quiz (`configured/imported-quiz-output.spec.ts`)
  already runs a generated package through hosted boot recovery and is unchanged.

## #1886, qualified

#1886 (P2): a duration's Take, and a correction typed while an imported clock runs, can ride the
fast road, which carries no server time, so each output stamps that row with its own arrival.

- Reproduction: the new configured test measures the two outputs' origins after the Take and after
  the running correction, and the rebooted output's origin against the other's, and records the
  three numbers on the test (annotation `1886`, and a `[#1886]` log line). It runs only in CI:
  this worker has no Docker daemon for a local stack.
- **Measured (CI run 41566156768, head `ddefc4df`, local Supabase stack): Take spread 0 ms,
  running correction spread 0 ms, rebooted output 0 ms from the other. #1886 did not reproduce
  on this path.** A spread of exactly 0 means both outputs stamped each row with the same server
  `created_at`; a fast-road frame carries none, and the renderer then falls back to its own clock
  (`rowInstant`, `src/control/matchClockWire.ts`), which would give a few to tens of ms here. So on
  this stack these rows reached both outputs through their durable, server-stamped copy.
- **Why, read in code: that is by design on protocol 2.** A hosted output that resolves its
  production on the numbered log (protocol 2, migration 0071) never joins the fast road:
  `src/output/main.ts` (the `seqMode` branch, "No fast road") follows `seq-<show>`, and only the
  protocol 1 branch passes `onCommand`; `followControlLog`'s `seq` option in
  `src/control/hostedControl.ts` says the same for every protocol 2 follower. Every numbered row
  carries the server's `created_at` (`0071_command_sequence.sql`). So #1886's race (a fast copy
  stamped on arrival, the durable copy dropped as a duplicate) can only happen on an output that
  follows protocol 1: a server without the numbered log, or a resolve marked legacy.
- **Recommendation to the coordinator:** re-scope #1886 to protocol 1 outputs, or close it if no
  protocol 1 output remains in production. This row changes no product file and does not edit
  the issue.
- Both outputs share one machine and one clock, so this setup is a lower bound: the issue's real
  risk, clocks that differ between machines, cannot show here. The reboot number is the issue's
  "a reload can move it" case; at 0 ms it did not move.
- Bound: under 1.5 s each, the fast road's spread the issue expects with room for a loaded runner.
  The test does not assert the spread is zero; that would assert the fix.
- Product fix: none in this row. The row's files are tests only, and the issue's fix (send those
  rows on the slow road, about +0.5 s on those presses) is a latency trade-off the issue leaves to
  the owner. If the coordinator wants it fixed, the files are `src/control/hostedControl.ts`
  (`mayBeFast`) and `src/control/matchClockWire.ts`.

## Decisions

- **Wizard-made packages, not hand-built templates.** A template built in the page could drift from
  what the import road saves; walking the wizard costs about 10 s per graphic and tests the real
  thing.
- **The renderer mount helper takes a made template** (`kind: 'made'`) and `act` takes optional
  params, so the existing mount runs unchanged for the earlier cases.
- **Clock reads sit half a second past a whole count.** An event fires a frame after its call on
  every host; reading at exactly 3.000 s caught the frame before the third second.
- **SPX clock buttons go through the package's control channel**, since that is the only road an
  SPX operator has to them. Calling `noacgDispatch` directly would skip the receiver the package ships.
- **No change to `configured/imported-quiz-output.spec.ts`.** It already proves a generated
  imported package through hosted boot recovery; a second hosted credits walk would add nothing the
  standalone credits tests and row 24's journeys do not.

## Limits

- Standalone hosts count a clock from their own clock: two standalone hosts agree only as far as
  their clocks and their operators' presses agree. That is the documented no-wire behaviour (row 9
  W4), not a defect.
- On a host with no custom actions (SPX), cards need a card time (row 23's limit).
- The SPX test drives the package's control channel from the air page itself, as one page; the
  control page as a second tab is the existing `controlpanel` road and is not walked here.

## Traps

- `jobs.mjs` refuses a direct `playwright test` in cloud; queue each selection.
- A roll sent a new list on air keeps the one it took (row 24). A test expecting the new rows at
  once is a faulty expectation, not a defect.

## Verification

- `e2e/ograf-lifecycle.spec.ts`: the four existing tests pass with the changed mount helper
  (j-0002); the two new ones pass after the two fixes in Decisions and Traps (j-0004).
- `e2e/spx-operator.spec.ts` new test 1/1 (j-0006).
- Both specs whole on the final test code: `ograf-lifecycle.spec.ts` and `spx-operator.spec.ts`
  13/13 (j-0008).
- `e2e/ograf-parity.spec.ts` 3/3, 28 designs, 0 failing (j-0007).
- `npm run gates -- run --changed origin/main` 34/34; `check-e2e-protection --changed origin/main`
  OK; eslint and `tsc --noEmit` clean on the four specs.
- The configured test runs only in CI; its result is the PR's configured selection.

## Review rounds

- `/check` inline review: one finding, fixed (an empty clock text could pass the correction wait).
- PR review bot on `3acdd0d0` (PR opened): completed, no findings.
- `/so` on `3acdd0d0` (`session_017SdbwR22kWehQUJbnJoab6`): AGREE WITH CORRECTIONS, A-. Point 1,
  blocking, evidence only (class delayed review, family #1886 evidence): the #1886 numbers were not
  yet stated, and the 1.5 s bound cannot tell the two roads apart. Taken: numbers above, the
  0-against-more-than-0 reading and the one-machine lower bound, in these notes and beside
  `FAST_ROAD_SPREAD_MS`. Point 3 (class faulty test expectation): output B was compared with A's
  Take origin; each output is now compared with its own. Points 2, 4, 6, 7 agree. Point 5 stays a
  documented limit (the SPX control page itself is not walked; Limits).
- CI on `3acdd0d0` (run 41565561149): the configured job failed before any test, on the local
  stack's port 54322 (#1865); its one re-run was cancelled by the push of `ddefc4df`.
- CI on `ddefc4df` (run 41566156768): every job green except Reviewed (the coordinator's stamp);
  configured selection triggered, subset, 1 spec (`scorebug-output.spec.ts`, 3 passed).
- PR review bot on `6a7fdfa7` (one manual request): no findings. CI on `6a7fdfa7` (run
  41567097709): CI gate green, configured 1 spec, 3 passed, the same 0 / 0 / 0 ms.
- Final `/so` on `6a7fdfa7` (`session_017SdbwR3jBipuFcw1hsBtb9`): AGREE WITH CORRECTIONS, A-.
  Points 2 and 3 confirm the earlier two are resolved. Point 1, blocking, notes only (class
  faulty test expectation, family #1886 evidence): "the test cannot tell" was wrong, the code
  tells (protocol 2 outputs never join the fast road). Taken above and in the spec's comment.
  Points 4 to 6 non-blocking: the 1.5 s bound stays a safety net; scope clean; the SPX control
  page as a second tab stays a documented limit (Limits).

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-29-build')"

Tests and notes only; nothing persisted changes.
