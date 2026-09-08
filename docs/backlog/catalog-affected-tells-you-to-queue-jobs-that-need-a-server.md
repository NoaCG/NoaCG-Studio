# `catalog:affected` prints a step 2 that cannot run as printed

**Filed:** 2026-09-08. **Source:** the 2026-09-04 fit-ladder-truth session (handoff since drained)

## Why
`scripts/catalog-affected.mjs` labels step 1 "no dev server, run it now" and step 2 "enqueue
them", but four of the five step-2 gates (`type-floor`, `field-coverage`, `overflow-sweep`,
`numerals`) measure the app through a dev server they do not start. Queued without one they die
collecting ERR_CONNECTION_REFUSED, and the queue reports "failed and has written nothing yet",
which reads exactly like the change under test having broken the catalog. Measured twice on
2026-09-04: ten jobs queued, eight failed that way; only `catalog-specs.mjs`, which brings its own
Playwright server, ever ran. By hand after `npm run dev:worktree` all five gave verdicts in about
four minutes.

## What it would take
Either those four scripts start a server the way `catalog-specs` does, or step 2's heading names
`npm run dev:worktree` as its precondition. Separately, close the fail-open hole: `devServerPrecheck`
returns `go` when the checkout has no generated `.claude/dev-port.json`, so the guard that exists
never fires there.

## Evidence
`scripts/catalog-affected.mjs:497-500`; `scripts/jobs-store.mjs:755` `devServerPrecheck`;
`scripts/jobs.mjs:1181-1197` `devServerFacts`; `DEV_SERVER_DEPENDENT_SCRIPTS` in
`scripts/command-match.mjs:431` already lists all four.
