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

## What was observed

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

On A (protocol 1: the new resolve answers PGRST202 and the page keeps today's road):

- j-2482: `playout-both-roads`, `hosted-control-recovery` and `output-cold-boot` passed;
  `command-sequence` skipped both tests (the server has no sequence road), as designed.
- j-2499: `hosted-reveal-after-reload` passed; `late-send-abandoned` failed once (the second Take's
  chip stayed "nothing on air" for 10 s) and passed on its retry. That path is Step 0's unchanged
  proto-1 send; this branch changed only the spec's URL pattern there, which still matches
  `control_send_many`. Recorded as flaky, not investigated further.

## Limitations

- One run of each list (plus Playwright's single retry); no repeat counts.
- The full configured suite was not run on either branch; the lists above are the specs that touch
  the command path, the renderer and the log topics.
- A and B are preview branches with little data; CI's local stack (every migration in the tree)
  is where the configured suite will next run these on protocol 2.
