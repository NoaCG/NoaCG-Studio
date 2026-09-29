# The mobile Home layout spec loses a saved seed on the CI runners

**Filed:** 2026-09-29. **Source:** build feedback, two merge-queue runs of the clip playback plan's
phase 5 (`docs/CLIP_PLAYBACK_PLAN.md` §20).

## Why

A save the durable store confirmed did not reach what Home shows, twice, on the runners. If the
cause is in the app rather than the spec, a returning student's phone could open Home to an empty
production list with their work on disk. If it is the spec, it is a flake that has now bounced one
landing and been quarantined (PR #540), so the phone path it guards is untested until it is fixed.

## What it would take

Find the mechanism by fault injection (`e2e/AGENTS.md`, "A race you cannot reproduce is
FAULT-INJECTED"), then fix it where it lives and let the quarantine release the spec by passing.
Hypotheses, none tested yet:

- something in the app's boot or on Home writes a stale whole-record snapshot over the seed after it
  landed (`src/model/AGENTS.md` on read-modify-whole-record writes, `src/model/durableStore.ts`);
- the spec's `import('/src/model/*.ts')` resolves a different module instance from the app's on a
  cold dev server;
- Home reads its counts once at mount, and the same-document `page.goto('/app#/home')` never makes
  it read again.

Small once the mechanism is found; the finding is the work.

## Evidence

- The test: `e2e/layout.spec.ts`, "mobile: Home leads with Productions and a dashboard is two taps
  from open". It seeds a graphic and a production by `page.evaluate` after `awaitDurableReady`,
  then `settleDurableWrites` (no refusal), then `page.goto('/app#/home')`, and waits for
  `open-production`, which never appears. The two waits were added in commit f5ad9e23e; the failure
  came back after them.
- Run 36565972219 (PR #533, shard 3 and its retry both failed) and run 36582456336 (PR #538, shard 6
  failed, retry passed). It passed in the merge groups of PR #531 and of PR #533's second attempt,
  and always passes locally.
- The trace in run 36582456336's `blob-report-6` shows every step in order with no page error; the
  page snapshot shows Home with `Productions 0` and `Graphics 0`.
- None of the code those PRs changed (the production page's playout and rundown) runs on Home.
