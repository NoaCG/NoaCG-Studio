# A push run and a dispatched run share one concurrency group, so the pair is a coin flip

**Filed:** 2026-09-05, from the review of `claude/r-mistake-triggers` (altitude finding 2). A
build-gate change, so its own row: a gate lands alone.

## Why

`ci.yml` puts every run of one ref in `group: ci-${{ github.ref }}` with `cancel-in-progress` off
`main`. A push run and a `workflow_dispatch` run for the same branch therefore cannot both live,
and which survives depends on the order two webhooks register, which is not stable: "Pushing and
dispatching in one breath is a coin flip, and I lost it once"
(the 2026-09-04 refusals-say-why handoff and three more the same two days, all since drained;
the rule it produced is the trap `root/read-which-jobs-ran-before-believing`). When
the dispatch loses, the push run survives with the narrow plan the dispatch was issued to avoid.
`scripts/hooks/guard-command.mjs` now refuses the pair in ONE shell command, which is the shape
the matcher can see; two back-to-back commands, two sessions, or `auto-merge.mjs`'s own stand-in
dispatch race exactly the same way and no hook sees them.

## What

`group: ci-${{ github.ref }}-${{ github.event_name }}`, one line, so a push run and a dispatched
run for one ref stop cancelling each other; each event kind still cancels its own predecessor. Two
things to check before landing it, because `auto-merge.mjs` leans on the current behaviour: the
gate's `waitForCi` dispatches a run as a stand-in when the push webhook is late and reads the
listing to pick the run, so with two live runs per ref `selectCiRun` must still choose the one
for the verified sha; and the residual race the queue-merge contract documents (a late push
webhook cancelling the dispatched run mid-watch) goes away, so that paragraph can be cut. When it
lands, retire the push-and-dispatch refusal in `guard-command.mjs` and its matcher tests.

## Evidence

`.github/workflows/ci.yml` lines around `concurrency:`; `.agent-workflows/queue-merge.md`, "THE
GATE NO LONGER WAITS ON A WEBHOOK"; `docs/MISTAKE_TRIGGERS.md`, "The 2026-09-05 read", second row.
