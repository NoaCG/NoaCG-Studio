// THE TRACE FIXTURE, for the nightly's traced spec map (scripts/e2e-traced.mjs).
//
// Specs import `test` from '@playwright/test' as always. Only a run that sets NOACG_E2E_TRACE
// loads e2e/tsconfig.trace.json (playwright.config.ts), which maps that import here, so every
// test gains this auto fixture without any spec naming it. Everything else is re-exported as is.
//
// It records which repository modules had a function EXECUTE during the test, from V8's own
// function coverage on every page of the test's context. Executed, not loaded: the app imports
// most of src/ eagerly, so a list of loaded files says every spec depends on nearly everything,
// while a function that ran is something the test really used. Binary function coverage is the
// cheapest mode V8 has, and it survives the same-origin reloads and navigations specs make.
//
// Tracing never fails a test: a page that closed before its coverage was read just contributes
// nothing, and the merge keeps the previous entry for any spec that did not finish.
import { test as base, type CDPSession, type Page } from 'playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export * from 'playwright/test';

const dir = process.env.NOACG_E2E_TRACE;

async function startCoverage(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', { callCount: false, detailed: false });
  return session;
}

/** Script URLs with at least one function, beyond the module body itself, that ran. */
async function executedUrls(session: CDPSession): Promise<string[]> {
  const { result } = await session.send('Profiler.takePreciseCoverage');
  return result
    .filter((script) => script.url && script.functions.some((fn, i) => i > 0 && fn.ranges.some((r) => r.count > 0)))
    .map((script) => script.url);
}

export const test = base.extend<{ noacgTrace: void }>({
  noacgTrace: [
    async ({ page }, use, testInfo) => {
      if (!dir) return use();
      const sessions: Promise<CDPSession | null>[] = [startCoverage(page).catch(() => null)];
      await sessions[0];
      const onPage = (other: Page) => sessions.push(startCoverage(other).catch(() => null));
      page.context().on('page', onPage);
      await use();
      page.context().off('page', onPage);
      const urls = new Set<string>();
      for (const session of await Promise.all(sessions)) {
        if (!session) continue;
        try {
          for (const url of await executedUrls(session)) urls.add(url);
        } catch {
          // The page closed before its coverage was read.
        }
      }
      const spec = path.relative(testInfo.project.testDir, testInfo.file).replaceAll('\\', '/');
      mkdirSync(dir, { recursive: true });
      appendFileSync(path.join(dir, `worker-${testInfo.workerIndex}.jsonl`), `${JSON.stringify({ spec, urls: [...urls] })}\n`);
    },
    { auto: true },
  ],
});
