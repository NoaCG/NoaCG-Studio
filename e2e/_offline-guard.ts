// globalSetup for the offline e2e suite: refuse to run against a dev server that is not
// pinned to offline mode.
//
// THE HOLE THIS CLOSES. playwright.config.ts pins the suite offline through `webServer.env`
// (empty Supabase creds, empty AI key and proxy). That env is only applied when PLAYWRIGHT
// STARTS the server. With `reuseExistingServer: true` a server someone already started on
// this checkout's port is adopted as-is and every pin is silently skipped - so a developer's
// real .env decides what the suite runs against, while the config still reads as if it had
// pinned it. The failure is quiet and confusing: backend-sensitive specs fail because the
// visitor is signed out, and AI specs stop exercising the offline stub providers the video
// specs depend on. The config comment already says a real key "must never leak into the
// suite"; a reused server is exactly how it does.
//
// WHAT IT ACTUALLY DOES, AND WHEN. Measured, not assumed: globalSetup runs AFTER webServer,
// so in a normal run the server IS already listening by the time this executes - Playwright
// started it moments earlier. The guard therefore probes on every run and cannot tell "the
// one Playwright just started" from "a foreign one it reused". It does not need to: it reads
// the env the server actually serves, which is pinned in the first case and whatever the
// developer's .env said in the second. Correct either way.
//
// The early return covers only the case where nothing is listening at all (webServer failed,
// or a future Playwright reorders the phases); it is not the common path.
//
// Cost: one headless page load per suite run, ~1s against a ~5min suite.

import { chromium } from '@playwright/test';
import { devPort } from '../scripts/dev-port.mjs';
import { activeRuns, blockingRuns, describeRuns, selfAndAncestors, selfRun } from '../scripts/e2e-runs.mjs';
import { resolve } from 'node:path';
import * as rules from '../scripts/rules.mjs';

/** Keys playwright.config.ts pins EMPTY. A non-empty value means the pin did not apply. */
const MUST_BE_EMPTY = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_AI_PROXY_URL',
] as const;

/**
 * Keys playwright.config.ts pins ON. Checking only MUST_BE_EMPTY left the guard blind in one
 * direction: an adopted server started as a plain `npm run dev` has every pinned-empty key
 * empty already, so it passes - while VITE_RENDER_API, which the config pins to '1', is unset.
 * `ExportSurface` then renders no RenderPanel AT ALL (src/render/config.ts is the one feature
 * detection point), so twelve specs fail with "element(s) not found" against a DOM that never
 * had the section. Measured on 2026-08-29: a 21-minute integration run spent on a dev server
 * left up for screenshots. Same fault as the empty pins, opposite sign, so it belongs here
 * rather than in each spec.
 */
const MUST_BE_SET = ['VITE_RENDER_API'] as const;

/** Never print a real secret; a leaked key must not end up in CI logs. */
function redact(value: string): string {
  return value.length <= 8 ? '***' : `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;
}

/**
 * Wait out any browser-driving job - a suite, a catalog sweep or a bench - in ANOTHER checkout
 * of this repo before starting this one.
 *
 * The Claude Code guard hook refuses an overlapping run too, but it can only see commands that
 * go through a tool call - it cannot stop a developer typing `npm run test:e2e` in a terminal,
 * or a script invoking Playwright some way nobody predicted. globalSetup is the one place every
 * entry point passes through, whatever started it, so the universal net belongs here.
 *
 * It WAITS rather than refusing, because at this point the run has already been asked for and
 * queuing is what the caller wanted anyway: two suites on one 16 GB machine do not finish sooner
 * than two run back to back (measured: 59 browser shells, 35 MB of free RAM, everything else on
 * the box paging), they only make the wait miserable. The cap exists so a mis-detected process
 * can never hang a run forever - past it we proceed and let the machine cope, which is exactly
 * the old behaviour.
 *
 * Skipped under CI: each runner has one job, `activeRuns` would only ever see this run's own
 * siblings on a shared machine, and a hosted gate must never sit waiting on a heuristic.
 */
const QUEUE_TIMEOUT_MS = 30 * 60_000;

// webServer's deadline ends before globalSetup. Bound these separate HTTP probes too: a
// server can answer readiness once and then keep accepting connections without replying.
const PROBE_TIMEOUT_MS = 10_000;

async function waitForOtherRuns(): Promise<void> {
  if (process.env.CI) return;
  const me = resolve(process.cwd());
  // THIS run is not "another checkout", however its command line reads. A linked worktree has
  // no node_modules of its own, so the Playwright CLI it runs lives in the MAIN checkout and
  // `rootOfCommand` attributes the run there - `exclude: me` then never matches and the guard
  // waits out its whole 30-minute cap behind this very process. Excluding our own process
  // chain as well is the identity that path-matching cannot supply.
  const mine = selfAndAncestors();
  // WHO GOES FIRST when two runs start together. A run waiting here is indistinguishable in the
  // process table from one driving a browser, so before `blockingRuns` existed two simultaneous
  // starts each queued behind the other and both sat out the full cap below. `blockingRuns`
  // yields only to work that is AHEAD of this run in a total order both sides compute the same
  // way; scripts/e2e-runs.mjs carries the reasoning.
  const self = selfRun(mine);
  const deadline = Date.now() + QUEUE_TIMEOUT_MS;
  let announced = false;
  const others = () => blockingRuns(activeRuns({ exclude: me, excludePids: mine }), self);

  for (let runs = others(); runs.length > 0; runs = others()) {
    if (Date.now() > deadline) {
      console.warn(
        `Still waiting after ${QUEUE_TIMEOUT_MS / 60_000} min - starting anyway. Active elsewhere:\n${describeRuns(runs)}`,
      );
      return;
    }
    if (!announced) {
      announced = true;
      console.log(
        `Queued behind browser-driving work in another checkout - starting when it finishes ` +
          `(node scripts/e2e-runs.mjs --all to watch):\n${describeRuns(runs)}\n` +
          rules.text('root/enqueue-browser-driving-work-rather-than'),
      );
    }
    await new Promise((done) => setTimeout(done, 5_000));
  }
}

export default async function offlineGuard(): Promise<void> {
  await waitForOtherRuns();
  const base = `http://127.0.0.1:${devPort()}`;

  const alreadyRunning = await fetch(base, { method: 'GET', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then((r) => r.ok)
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Offline guard readiness probe timed out after ${PROBE_TIMEOUT_MS}ms at ${base}.`, { cause: error });
      }
      return false;
    });
  if (!alreadyRunning) return; // Nothing to inspect; see the note above.

  const browser = await chromium.launch();
  let env: Record<string, unknown>;
  let managedProviders: string[];
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
    env = await page.evaluate(async () => {
      const probe = (await import('/e2e/_env-probe.ts')) as Record<string, unknown>;
      return { ...probe };
    });
    const aiSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    const aiConfig = await fetch(`${base}/api/ai/config`, { signal: aiSignal })
      .then((response) => response.json())
      .catch((error: unknown) => {
        // Body reads can reject with AbortError instead of TimeoutError. The signal
        // identifies our deadline in both phases without depending on that distinction.
        if (aiSignal.aborted) {
          throw new Error(`Offline guard AI configuration probe timed out after ${PROBE_TIMEOUT_MS}ms at ${base}/api/ai/config.`, { cause: error });
        }
        throw error;
      }) as {
      providers?: { id?: string; managedKey?: boolean }[];
    };
    managedProviders = (aiConfig.providers ?? [])
      .filter((provider) => provider.managedKey)
      .map((provider) => provider.id ?? 'unknown');
  } finally {
    await browser.close();
  }

  const leaked = MUST_BE_EMPTY.filter((k) => String(env[k] ?? '').trim() !== '');
  const missing = MUST_BE_SET.filter((k) => {
    const value = String(env[k] ?? '').trim();
    return value === '' || value === '0';
  });
  if (leaked.length === 0 && missing.length === 0 && managedProviders.length === 0) return;

  const detail = [
    ...leaked.map((k) => `  ${k} = ${redact(String(env[k]))}`),
    ...missing.map((k) => `  ${k} is unset (the config pins it to '1')`),
  ].join('\n');
  const managed = managedProviders.length
    ? `\n  server AI providers = ${managedProviders.join(', ')} (key values withheld)`
    : '';
  throw new Error(
    `Refusing to run the offline e2e suite against a server that is not offline-pinned.\n\n` +
      `A dev server is already listening on ${base}, so Playwright reused it ` +
      `(reuseExistingServer) and webServer.env was never applied. Its env does not match the ` +
      `pins:\n\n${detail}${managed}\n\n` +
      `Stop that server and re-run, so Playwright starts its own pinned one.\n` +
      `(Started via the preview tools? Stop it there. This checkout's port comes from ` +
      `scripts/dev-port.mjs.)`,
  );
}
