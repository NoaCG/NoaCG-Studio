# The configured specs on the migrated branch B and the unmigrated branch A (AC-12, 13, 17)

2026-09-30. Two temporary preview branches of the production project, never production itself:
A (`lfxjwjatjoimhualnjxb`, at migration 0067, no Step 2) and B (`vtuceehslknhtenwdyvu`, with 0069, the
live- read policy and 0070). The app was this branch's worktree in every run
(`playwright.live.config.ts`, the preview-branch wrapper choosing the branch), through the job queue.

## Runs

- **j-2482, before rebasing onto Step 0's send deadline.** On B: `command-sequence`,
  `playout-both-roads`, `output-url-cannot-push`, `hosted-control-recovery`, `output-realtime-floor`,
  `follow-status-is-visible`, `output-cold-boot`, `hosted-reveal-after-reload`. On A:
  `playout-both-roads`, `hosted-control-recovery`, `output-cold-boot`, `command-sequence`.
- **j-2499, after rebasing onto Step 0's send deadline (#559) and fixing two specs.** On B:
  `command-sequence`, `hosted-reveal-after-reload`, `late-send-abandoned`, `playout-both-roads`. On A:
  `late-send-abandoned`, `hosted-reveal-after-reload`.
- **j-2517, the finished branch after review, simplify and the merge of rows A, E and F.** On B:
  the eight specs of j-2482 plus `late-send-abandoned` and `operator-outage-not-unpublished`. On A:
  `hosted-control-recovery`, `playout-both-roads`, `command-sequence`, `late-send-abandoned`,
  `operator-outage-not-unpublished`.
- **j-2523 and j-2524, the two failures of j-2517 looked into**, with a temporary console line (not
  committed) where a press decides its road and where the id-road follower starts and ends a tail
  read. j-2523: `late-send-abandoned` three times on A with no retries, then `command-sequence` and
  `late-send-abandoned` three times each on B. j-2524: `late-send-abandoned` three times on A with
  `src/` and the spec checked out from `origin/main` (d0642028d), the same console line added.
- **j-2525, after merging Step 1's live path (#563) and making the live topic one join per page.**
  On B: `verify-b.mjs` (burst, refill, epoch, race, mixed), the harness's S5 five times, and the
  eleven specs of j-2517 plus `live-health`. On A: `live-health`, `hosted-control-recovery`,
  `playout-both-roads`, `command-sequence`, `operator-outage-not-unpublished`, `output-cold-boot`,
  `late-send-abandoned`.
- **j-2526, B after migration 0068 itself was applied there.** Until then B carried only a stand-in
  for 0068's read policy (`live-policy-b.sql`, applied when 0068 was not written yet), so no page
  could track Presence on B. 0068 as it stands on `claude/p6-step1-presence-migration` (59f798a3e)
  was applied through the Management API and the stand-in dropped: B then has exactly 0068's two
  policies on the live topic, 0069 and 0070. Specs: `live-health`, `command-sequence`,
  `playout-both-roads`, `follow-status-is-visible`, `output-realtime-floor`.

- **j-2558, after the second review's fixes and the numbered frames' move to `seq-<show>`**
  (tip abb6c01, B with 0068, 0070 and 0071 as in the tree, `seq-topic.md`). On B: the eleven
  specs of j-2525 (`command-sequence` now five tests) and `verify-b.mjs` (burst, refill, legacy,
  epoch, race, mixed). On A: `live-health`, `hosted-control-recovery`, `playout-both-roads`,
  `command-sequence`, `operator-outage-not-unpublished`, `output-cold-boot`.

## What was observed

- **j-2558:** on B, 15 of 15 passed, including the three new `command-sequence` tests (two
  batches, a failed first numbered join, a Presence close mid-burst) and `live-health` with its
  refused-`live-` renderer back on "realtime: following" (Presence no longer carries commands);
  `verify-b.mjs` burst (6 of 6 trials on the last press, 55P03 now reaching the page), refill (3
  of 3 with one read), epoch, race (5 of 5) and mixed old and new clients all passed; its legacy
  scenario booted proto 2 because the probe's old reports had moved its baselines, so the legacy
  boot was re-run on its own after clearing them (j-2561, `legacy-boot.md`: `legacy: true`, then
  `false`). On A, 5 passed and `command-sequence`'s 5 skipped (no sequence road), as designed.

On B (protocol 2 end to end: pages send `control_send_seq`, renderers follow `live-<show>`):

- j-2482: 7 passed, 2 failed, and both failures were the tests, not the product:
  `hosted-reveal-after-reload` intercepts the renderer's reports by `control_output_report`, which a
  protocol-2 renderer does not call (it reports through `control_output_report_seq`), so its fast
  round held nothing; and the new late-Take test ended on `not.toContainText` over an element that
  does not exist, which Playwright fails. Both fixed (the report pattern now matches both RPCs; the
  notice is read with `allInnerTexts`). Everything else passed, including `output-url-cannot-push`
  with its new forged numbered frame on `live-<show>` (air did not move, no forged row in the log).
- j-2499: 5 of 5 passed: both `command-sequence` tests (a press another screen overtook is refused
  as stale, writes nothing, and the operator reads "House Scorebug was changed from another screen,
  so air did not change."; a Take held 6 s arrives after the Out, is refused as superseded and never
  airs), `hosted-reveal-after-reload`, Step 0's `late-send-abandoned` (its interception widened to
  both send RPCs) and `playout-both-roads`.
- j-2517: 10 passed, 1 flaky (`command-sequence`'s late-Take test, passed on its retry); both are
  explained below the protocol-1 results.
- j-2525 (merged with Step 1): `verify-b.mjs` 5 of 5 scenarios (burst: 6 of 6 trials ended on the
  last press on air, on the server and on the chip; refill: 3 of 3 healed with one read and one
  entrance; epoch; race: 5 of 5 one landed and one stale; mixed old and new clients), S5 5 of 5,
  and 11 of 12 specs passed. `live-health` failed on both attempts: the hosted page's health line
  stayed on the heartbeat because no output appeared in its Presence peers. Cause: B had only the
  stand-in read policy, and a Presence track needs 0068's insert policy.
- j-2526 (0068 applied): 6 of 6 passed, `live-health` included: the output announced itself and
  both operator pages read it from Presence on the same channel that carries the numbered frames,
  and the output whose live join the spec refuses said "NOT JOINED" and still aired the Take (from
  its boot catch-up).

On A (protocol 1: the new resolve answers PGRST202 and the page keeps today's road):

- j-2482: `playout-both-roads`, `hosted-control-recovery` and `output-cold-boot` passed;
  `command-sequence` skipped both tests (the server has no sequence road), as designed.
- j-2499: `hosted-reveal-after-reload` passed; `late-send-abandoned` failed once (the second Take's
  chip stayed "nothing on air" for 10 s) and passed on its retry. That path is Step 0's unchanged
  proto-1 send; this branch changed only the spec's URL pattern there, which still matches
  `control_send_many`.
- j-2517: 3 passed, 2 skipped (`command-sequence`), and `late-send-abandoned` failed on both
  attempts: the chip stayed "nothing on air" after a Take, once at the first Take and once at the
  second.
- j-2525 (merged with Step 1): 5 passed (`live-health` on its heartbeat fallback, A having no
  0068), 2 skipped (`command-sequence`), and `late-send-abandoned` failed on both attempts, as
  below.
- j-2523 (this branch) and j-2524 (main's code): `late-send-abandoned` failed 3 of 3 on each. In
  all six, the console line said the Take was pressed while the page's id-road follower was
  reading the tail, so the press took the durable road: nothing moved on the page's own monitor,
  the held request was then abandoned, and no row ever came back to move it. On a shared instance
  nearly every row arrives with a gap in front of it (the ids are global, and other sessions were
  writing), and the spec presses Take right after a row of its own arrives (the cue selection's
  staged row, the Out's rows). So it is protocol 1's documented stand-down meeting a busy
  instance, the same on main; this branch does not change that path. Recorded as K7 in
  `step-2-design.md`; not fixed here.

On B, the two failures of j-2517 were:

- `command-sequence`, the late-Take test, flaky (passed on its retry): the Take's first request
  was held, but the page's resend 1.9 s after the press was let through and reached the server
  before the Out when the machine was loaded, so the Take applied, the Out followed it, and the
  held first request was answered as a duplicate (`ok: true`). Air ended on the Out, in press
  order; the spec's scenario had not happened. The spec now holds every attempt of the delayed
  press (design D-q). j-2523: `command-sequence` 6 of 6 and `late-send-abandoned` 3 of 3 on B.
  Fault-injected in j-2529 with a temporary copy of the test that presses the Out 2.5 s after the
  Take, so the resend always leaves first: holding only the first request, the held attempt was
  answered `{"ok":true,"duplicate":true}` and the test failed on the same line as the flake;
  holding every attempt, it was answered `superseded` and the test passed, as did both
  `command-sequence` tests in the same run.
- `output-cold-boot` passed, with one `400` from `control_output_report_seq` in its output log:
  the spec unpublishes the production while the output page is still open, and the report after
  the Out then finds no production ('unknown output page'), as `control_output_report` always
  answered in that case.

## Limitations

- Repeat counts only where a failure was looked into (j-2523, j-2524: three each); otherwise one
  run of each list plus Playwright's single retry.
- `late-send-abandoned` does not pass on A, on main's code or this branch's (K7 in
  `step-2-design.md`); on a protocol-2 server it passed every run.
- j-2527 (B: `live-health`, `command-sequence`, `hosted-control-recovery`, `output-cold-boot`, 5 of
  5; A: `live-health`, `hosted-control-recovery`, 2 of 2) ran with a wait, since taken out, for a
  live-topic removal in flight before the same page joined that production again. A temporary
  fault-injection spec (j-2530, j-2531: leave the topic and join it again at once, three rounds on
  B) saw the second join report SUBSCRIBED with the wait and without it, so the race it guarded
  does not happen with supabase-js 2.110 and the wait was removed; the join as it stands is the
  one j-2525 and j-2526 verified.
- The full configured suite was not run on either branch; the lists above are the specs that touch
  the command path, the renderer and the log topics.
- A and B are preview branches with little data; CI's local stack (every migration in the tree)
  is where the configured suite will next run these on protocol 2.
