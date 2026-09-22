# Row Q - the "Execution context was destroyed" flake in import-svg.spec.ts

Date: 2026-09-22. Branch: `claude/q-navigation-race-flake`. Status: **investigation, not a fix.
Not queued**, on the coordinator's instruction (the session lost time to an API 529 and the owner
is closing the laptop). The branch holds diagnostic edits that must NOT land as they are.

## What failed

Both CI failures stopped in the same helper step, `switchToAdvancedMode` (`e2e/_create.ts:70`),
called from the spec-local `createProject` in `e2e/import-svg.spec.ts:45`:

- run 35660280413 attempt 1 (row L), shard 1/9, test at `:1809` ("a field drawn on the artwork").
- run 35655396527 (row H), shard 9/9, test at `:2224` ("the followers of a growing panel").

Each failed about 4 s into the test, on the first `page.evaluate` after the wizard walk. CI runs
one worker per shard, so no other test shared the dev server at that moment.

## What the evidence says

I read the two CI traces (`test-results-1`, `test-results-9` artifacts). **Neither shows a
navigation.** The whole test has one `goto`, one document request for `/app`, one
`[vite] connecting` / `connected` pair and no second page load. Frame snapshots stay on
`/app#/new/step/fields` right up to the error. The failure screenshot shows the wizard's Fields
step intact, with the typed values in place.

So the message is misleading. Playwright's `rewriteError` (`playwright-core/lib/coreBundle.js`,
`CRExecutionContext.evaluateWithArguments`) turns ANY CDP error on `Runtime.callFunctionOn` that
is not a JavaScript exception into "Execution context was destroyed, most likely because of a
navigation". The real CDP error is thrown away. The brief's premise, a helper that evaluates
while the page navigates, does not match these two traces. What stopped the evaluate is still
unknown. Candidates, none proven: the page's promise or the utility-script object being collected
while the evaluate awaits the dynamic `import()`, or a renderer-side CDP hiccup under CI load.
I have not found a Vite reload or app code that navigates the main frame. The only
`location.reload`/`replace` calls in `src/` are auth pages and error fallbacks.

## Local reproduction: none so far

All runs went through the job queue on a fresh worktree, so the Vite dep cache was cold, as on CI:

| Job    | Run                                                                       | Result      |
|--------|---------------------------------------------------------------------------|-------------|
| j-1705 | whole `import-svg.spec.ts`, `--workers 1`                                 | 99/99 pass  |
| j-1706 | the two tests, `--repeat-each 10 --workers 4`                             | 20/20 pass  |
| j-1708 | `e2e/zz-diag-gc.spec.ts`: 60 evaluates with dynamic imports while CDP forces GC in a loop | 0 errors |
| j-1710 | the two tests with a forced-GC loop on the page, `--repeat-each 5 --workers 2` | 10/10 pass |

Per-test navigation and Vite-console logging, which is the `DIAG-TEMP` `beforeEach` in the spec,
showed exactly one page load per test. The only exceptions were two tests that reload on purpose.

## What is on the branch (diagnostics, revert before landing)

- `playwright.config.ts`: `stdout: 'pipe'` on `webServer` (marked `DIAG-TEMP`), so Vite's
  "optimized dependencies changed. reloading" would show in the run log. It never appeared.
- `e2e/import-svg.spec.ts`: a `DIAG-TEMP` `beforeEach` that logs main-frame navigations and
  `[vite]` console lines. It also runs a forced-GC CDP loop unless `DIAG_GC=0`.
- `e2e/zz-diag-gc.spec.ts`: the standalone GC stress spec. Delete it before landing.
- Local only, not committed: I patched `node_modules/playwright-core/lib/coreBundle.js` to append
  the original CDP error (`[DIAG-ORIG: ...]`) to the rewritten message. No run failed, so it
  printed nothing.

## Proposed next step

1. **Get the real error from CI.** One CI run with the `DIAG-ORIG` patch applied through a
   `postinstall`-style step or `patch-package`, on a branch that runs shards 1 and 9 a few times.
   It shows what CDP actually said. Without that, any fix is a guess.
2. **The fix I would make whatever the cause, since it removes the step that fails.** Stop
   flipping Advanced mode with an in-page `evaluate` in the middle of a walk. The spec-local
   `createProject` in `e2e/import-svg.spec.ts` and every other `switchToAdvancedMode` caller (28
   call sites in 12 specs) can turn the pref on before the walk with `enableAdvancedMode` (an init
   script, `e2e/_create.ts:39`), before their `goto`. The wizard then renders the Advanced footer
   from boot, and no evaluate is left in flight at that point. The catch is that these specs test
   the DEFAULT walk up to Create. Each caller needs a check that Advanced mode changes nothing on
   its steps before the door. If that does not hold, drive the real Settings toggle instead.
   Either way it is a UI action Playwright waits on, not a raw evaluate. Files: `e2e/_create.ts`,
   `e2e/import-svg.spec.ts`, plus the other 11 specs if the helper changes shape.
3. Prove it the way the brief asks. Use `--repeat-each 10 --workers 4` through the queue, and
   CI shard runs too, because the local box has not reproduced it once.

No retries were added and no timeouts widened.

check: not run. Nothing is queued.
