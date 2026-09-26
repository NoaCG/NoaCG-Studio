# The e2e helper that opens a production can lose its evaluate to a frame load

**Filed:** 2026-09-26. **Source:** hosted-latency run 36256306109, read while fixing issue #382.

## Why

`openProductionWithCurrent` in `e2e/_create.ts` is used about 59 times across the suite. Its one
`page.evaluate` creates the production, adds the working graphic, awaits `commitDurableWrites()`
and then navigates. In run 36256306109, `hosted-control-recovery.spec.ts` failed there once with
"Execution context was destroyed, most likely because of a navigation" and passed on retry. The
failed attempt's trace shows no new main-document request, so the page did not reload. That
matches `docs/research/editor-save-promise-collection.md`: Chromium collects the promise of an
evaluate that is still pending while a child frame navigates, and Playwright reports it with that
misleading text. Here the mutations re-render Home and its frames while the evaluate awaits the
durable write. Any suite that uses the helper can go red on it, not only the hosted one.

## What it would take

Restructure the helper so no evaluate is pending across a frame navigation, with the same end
state (production made with the working graphic, durable, its page open). For example, do the
imports first, then mutate and navigate synchronously and return, and wait for durability without
spanning the production page's frame loads. Reproduce first by fault injection, as the research
doc describes (force garbage collection on child-frame navigation), then show the new helper
survives it.

## Evidence

- Run 36256306109, artifact `hosted-report`,
  `test-results/hosted-control-recovery-*/trace.zip` (kept because the hosted job now passes
  `--trace=retain-on-failure`).
- `docs/research/editor-save-promise-collection.md` for the mechanism and the diagnostic.
