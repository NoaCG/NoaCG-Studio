# Editor save evaluation collected during preview reload

Investigated 2026-09-20. Covers the B04 failure originally recorded in
`docs/backlog/b04-save-reopen-races-a-navigation-on-ci-only.md` (closed by this change).

## Reproduction and diagnosis

The reported failures were pull-request runs 35506928446 (including a rerun) and
35511897692. Push runs 35506924934 and 35511896186 passed. Local repeats also passed.
The failing trace from 35511897692 has the same main-frame URL before and after the
save evaluation, the name `Export proof`, and the visible status `Saved`. Its Vite
WebSocket has only the initial connected message, with no full reload. There is no
new main-document request. The router preserves the query string.

Playwright 1.61.1's Chromium `rewriteError` converts several protocol errors into
`Execution context was destroyed, most likely because of a navigation`. That text
alone does not establish a navigation. The temporary diagnostic workflow preserved
`error.message` at that rewrite point; it did not retry tests or change the app.

| Experiment | Result |
| --- | --- |
| Fresh worktree, original two export cases, j-1544 | 2 passed, 22.8s |
| Entire original editor spec, CI tracing and raw protocol logging, j-1545 | 18 passed, 2.9m |
| Original editor spec, diagnostic push run 35513970889 | 18 passed |
| Original editor spec, diagnostic pull-request run 35513988334 | 18 passed, 1.9m |
| Original export cases, collect garbage on each child-frame navigation, j-1546 | Catalog failed at the exact save evaluation; SVG passed |
| Same collection pressure with the Save dialog, j-1547 | 2 passed, 26.9s |
| Original evaluation with collection only on the save's next frame navigation, j-1548 | 2 passed, 25.9s |

The reproduced error before Playwright rewrites it is:

```
Protocol error (Runtime.callFunctionOn): Promise was collected
```

No main-frame navigation or renderer crash was reported during that failing save.
The failure also affects catalog when collection timing changes. A single explicit
collection did not reliably reproduce it, so it is not presented as a deterministic
regression test. The original push/pull-request correlation is real, but the new
unmodified pull-request run passes: event type alone is not a sufficient cause.
We have not identified why the original runners reached that collection boundary.

For reproduction, register this diagnostic before the existing test body, using a
Chromium CDP session. Keep the original save evaluation unchanged:

```ts
const cdp = await page.context().newCDPSession(page);
page.on('crash', () => console.log('renderer crashed'));
page.on('framenavigated', frame => {
  console.log(frame === page.mainFrame() ? 'main' : 'child', frame.url());
  if (frame !== page.mainFrame()) {
    void cdp.send('HeapProfiler.collectGarbage').catch(() => {}); // allow teardown
  }
});
```

The misleading wording also has an upstream report:
[Playwright #41826](https://github.com/microsoft/playwright/issues/41826).
That report concerns cross-frame promises; it is supporting context, not proof of
which promise Chromium collected in this application.

## Fix and coverage

All three save/reopen paths in `editor-base-edits.spec.ts` now use the real Save
button and naming dialog. They assert the dialog closes, the status is Saved, the
name is adopted, and the preview becomes ready. B04 also asserts the editor URL
stays unchanged. No remote evaluation waits on the save promise across the preview
reload. The existing durable-write barrier remains before the explicit reload.

Source equality, field behavior, geometry and SPX/CasparCG/OGraf export assertions
remain in place for both fixtures. No product code, retry count, timeout or
quarantine entry changed. Temporary workflow, dependency instrumentation and copied
specs are removed. The existing spec mapping selects this file for CI.

## Final local verification

- `npm run build`: passed, including repository gates, typecheck, lint and production
  bundle. The build-tier script suite ran 1,803 tests with no failures (one existing skip).
- Unmodified Playwright, final editor spec with `--workers=1 --trace=retain-on-failure`:
  18 passed in 1.5 minutes (j-1549).
- `node scripts/e2e-affected.mjs --json --integration origin/main`: selects
  `editor-base-edits.spec.ts`, one shard, no quarantined tests.
- Review and simplification ran inline over the scoped test/evidence diff; no further
  changes were needed. Visual taste review is not applicable: no product code changed.
