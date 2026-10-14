# AC-9: retired coverage names its replacement

**Verdict: pass.**

- **Phase 7** (https://github.com/NoaCG/NoaCG-Studio/pull/1188, merge `f033d163`) retired 11
  tests from `e2e/import-svg.spec.ts`: 100 declarations down to 89.
  - 8 of them ran; the other 3 were already skipped under #800.
  - Each has one line under `## Test maintenance` in `spec.md`, naming the harness record or
    reading, and the sidecar, that guard it.
  - Five cases are drawn in no corpus file. These got `READINGS` in
    `scripts/svg-import-passes.test.mjs`: the walk's own file, through the corpus's `RECORD` and
    the export gate. The build notes give the reason for this departure.
- **The gate.** `check:e2e-protection` passed on the pull request. The independent check
  (https://github.com/NoaCG/NoaCG-Studio/pull/1193) re-ran it on #1188's own diff: OK, with 11
  entries for 11 retired titles.
- **The claims.** The check broke each rule on purpose in its own worktree, one probe per rule. Every retired
  rule's named guard failed (table in its notes). Two lines promised more than their guard
  checked; neither lost a running guard.
  - **`static-prefix`.** The words "stay drawn" were guarded only by a quiz-board record the
    line did not name.
  - **A bare `<symbol>` outside `<defs>`.** It had no guard, before or after the retirement.
- **Both fixed in https://github.com/NoaCG/NoaCG-Studio/pull/1194** (Closes #1192, merged before
  this review). The reading now fails when a `static:` row is taken off the artwork, and the line
  names the quiz-board records. The hidden-text reading carries a bare `<symbol>`, which dropping
  `symbol` alone now fails. Each was shown by its probe before landing.
- **Kept, not retired.** Growth, the ladder, gestures and the preview stayed. So did every test
  whose only other guard is a skipped one: the outline ranking walk, whose other guard is the
  skipped 1070. That is noted on #800:
  https://github.com/NoaCG/NoaCG-Studio/issues/800#issuecomment-6165149725
- **Saving.** 8 running walks left the merge gate, at about 3 s each (the file's average), so
  roughly half a minute. The recorded minutes fall at the next `e2e-durations-refresh`.
