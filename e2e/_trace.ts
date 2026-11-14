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
import { fileURLToPath } from 'node:url';
import { componentsOf, sourcesOf } from '../scripts/e2e-build-sources.mjs';

export * from 'playwright/test';

const dir = process.env.NOACG_E2E_TRACE;
const ON_BUILD = process.env.NOACG_E2E_ON_BUILD === '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startCoverage(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', { callCount: false, detailed: false });
  return session;
}

async function takeCoverage(session: CDPSession) {
  return (await session.send('Profiler.takePreciseCoverage')).result;
}

/** Script URLs with at least one function, beyond the module body itself, that ran. On the e2e
 *  build a script is a chunk of many modules, so for a chunk this answers source files instead, as
 *  URLs of the same origin: those of the functions that ran, and every component in the chunk,
 *  which the dev server counts on load (scripts/e2e-build-sources.mjs). */
async function executedUrls(session: CDPSession): Promise<string[]> {
  let result: Awaited<ReturnType<typeof takeCoverage>>;
  try {
    result = await takeCoverage(session);
  } catch {
    return []; // The page closed before its coverage was read.
  }
  const urls: string[] = [];
  for (const script of result) {
    if (!script.url) continue;
    const ran = script.functions.filter((fn, i) => i > 0 && fn.ranges.some((r) => r.count > 0));
    const chunk = ON_BUILD ? /^(https?:\/\/[^/]+)\/(assets\/[^?#]+\.js)(?:[?#].*)?$/.exec(script.url) : null;
    if (!chunk) {
      if (ran.length > 0) urls.push(script.url);
      continue;
    }
    // A loaded chunk: the components in it count as the dev server counts them, on load, plus the
    // source of every function that ran.
    const files = [...componentsOf(ROOT, 'dist-e2e', chunk[2]), ...sourcesOf(ROOT, 'dist-e2e', chunk[2], ran.map((fn) => fn.ranges[0].startOffset))];
    for (const file of files) urls.push(`${chunk[1]}/${file}`);
  }
  return urls;
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
        // Unguarded: a page that closed answers nothing inside, but a chunk the build map cannot
        // read fails the test, so a broken build map never quietly records too little.
        for (const url of await executedUrls(session)) urls.add(url);
      }
      const spec = path.relative(testInfo.project.testDir, testInfo.file).replaceAll('\\', '/');
      mkdirSync(dir, { recursive: true });
      appendFileSync(path.join(dir, `worker-${testInfo.workerIndex}.jsonl`), `${JSON.stringify({ spec, urls: [...urls] })}\n`);
    },
    { auto: true },
  ],
});
