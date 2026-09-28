# The nightly "Execution context was destroyed" flake (#465)

Investigated 2026-09-22 (row Q, branch `claude/q-navigation-race-flake`, deleted since) and
2026-09-28 (row D). This note keeps row Q's evidence, because its branch is gone. The
earlier save/reopen case is in `editor-save-promise-collection.md`.

## The failures

Each one is a `page.evaluate` whose function awaits `import('/src/…')` and ends on a store
mutation. Each fails with exactly `page.evaluate: Execution context was destroyed, most likely
because of a navigation.`, full stop included.

| Nightly run | Date | Site | Last statement |
|---|---|---|---|
| 35819865445 | 09-23 | `import-svg.spec.ts:2224` via `switchToAdvancedMode` (`_create.ts:70`) | `setAdvanced(true)` |
| 36297010617 | 09-27 | `video-project.spec.ts:505` (Ctrl+Z behind My videos) | `patchSettings({ fps: 50 })` |
| 36382079215 | 09-28 | `editor-out.spec.ts:35`, the `fixture` of `:471` | `applyTemplate(...)` |

Row H and row L's PR runs (35655396527, 35660280413) failed at the same `import-svg` site. The
`import-svg` site no longer exists: `switchToAdvancedMode` skips its test since the old editor
closed (2026-09-24), so only the other two remain.

## Row Q's evidence (2026-09-22)

- **The traces show no navigation.** Row Q read both CI traces of the `import-svg` failures. Each
  had one `goto`, one document request for `/app`, and one `[vite] connecting`/`connected` pair.
  The frame snapshots stayed on `/app#/new/step/fields` up to the error. The failure screenshot
  showed the wizard's Fields step intact, with the typed values still in place.
- **The message is Playwright's rewrite.** `rewriteError` in `CRExecutionContext.evaluateWithArguments`
  (`playwright-core/lib/coreBundle.js`, Playwright 1.61.1) turns every protocol error on
  `Runtime.callFunctionOn` that is not a JavaScript exception or a closed session into that
  sentence, and drops the original error.
- **Local non-reproduction.** All runs went through the job queue on a fresh worktree (cold
  Vite cache):

  | Job | Run | Result |
  |---|---|---|
  | j-1705 | whole `import-svg.spec.ts`, `--workers 1` | 99/99 pass |
  | j-1706 | the two tests, `--repeat-each 10 --workers 4` | 20/20 pass |
  | j-1708 | a stress spec: 60 evaluates with dynamic imports while CDP forces GC in a loop | 0 errors |
  | j-1710 | the two tests with a forced-GC loop on the page, `--repeat-each 5 --workers 2` | 10/10 pass |

  A `DIAG-TEMP` `beforeEach` logged navigations and Vite console lines. It showed one page load
  per test, apart from two tests that reload on purpose. Piping the web server's stdout never
  showed Vite's "optimized dependencies changed. reloading".

## What row D established (2026-09-28)

1. **The full stop means "not a navigation".** Playwright has two spellings. A context-destroyed
   event rejects a pending evaluate as "...because of a navigation", with no full stop
   (`FrameManager.contextDestroyed`). V8 sends that event before it fails the evaluate's
   callbacks, so a real navigation reaches the spec in that form. The rewritten protocol error is
   the only form with the full stop, and every nightly failure has it.
2. **`Promise was collected` produces exactly that message.** A page evaluate awaiting an orphaned
   promise, followed by `HeapProfiler.collectGarbage`, fails through `page.evaluate` with the
   nightly's exact text, full stop included. Over raw CDP the same case reads
   `Protocol error (Runtime.evaluate): Promise was collected`.
3. **The bundled V8 holds the evaluation promise weakly.** Playwright 1.61.1 bundles Chromium
   149.0.7827.55. Its V8 still has the 2023 change "[inspector] Hold on weakly to the evaluation
   promise". V8 reversed that on 2026-07-27 in commit `5177b10891e65108c1a19dfc56bff4e58d79d216`,
   "fix(inspector): hold on to promises" (crbug 536271637). That commit keeps the promise strong
   until it settles or the request is cancelled. Step 2 confirms the weak hold: under a strong
   one the orphan would hang, not be collected.
4. **A promise that ran to its end is collected too.** In the real editor-out fixture body, sent
   as a plain `Runtime.evaluate` under a 50 ms CDP GC loop, 4 of 6 evaluates failed with
   `Promise was collected`. Page markers showed the last statement had run (`applyTemplate`, about
   40 ms before the error). So the collection comes after the promise settles and before the
   inspector reports it, while the page runs the work that the last statement queued. A pending
   dynamic import is not the cause: evaluates awaiting fresh, cached and joined imports under
   forced GC (including `gc()` right after `import()`) all resolved, 360 of 360.
5. **Keeping the promise reachable closes the window.** The same body, with the promise also held
   in a page-side registry until the reply, passed 36 of 36 under 10 to 50 ms GC loops.

Not reproduced here: the collection through `page.evaluate` itself. Playwright's utility script
wraps the function's promise in its own async function, which narrows the window to the page work
queued after that wrapper settles. The unmodified fixture through `page.evaluate` passed 24 of 24
under 20 and 30 ms GC loops, and 12 of 12 under 250 ms. The CI mechanism is therefore inferred
from points 1 to 4, not observed.

## The change

`e2e/_evaluate.ts` exports `evaluateInPage(page, fn, arg?)`. It sends the evaluate over its own
CDP session and holds the promise in `globalThis.__e2eEvaluations` until the reply arrives. A
protocol error is thrown with Chrome's own words (`evaluateInPage: Chrome failed the evaluate:
…`), and a page exception as `the page function threw: …`. There is no retry: once the promise
is held, a retry has nothing left to absorb. The two live sites use it: the editor-out
`fixture` and the video Ctrl+Z test's `state`/`patchSettings` pair.

Verification is in the PR and the #465 comment. It covers fault injection of the real specs
under a CDP GC loop, green with the registry and red with it removed (mutation). The red run's
message names `Promise was collected`. The repeat run was through the job queue.

## If it comes back

- A failure through `evaluateInPage` now names Chrome's error. `Promise was collected` would mean
  something other than the evaluation promise was collected: look at what the function awaits.
- The same shape (a store mutation as the last statement of a `page.evaluate`) is common across
  the suite. Move a site that fails this way to `evaluateInPage`. Do not add a retry, and do not
  widen a timeout.
- A Playwright release that bundles a Chromium with V8 `5177b108` removes the cause at the root.
  After that upgrade, a plain `page.evaluate` is safe again.
