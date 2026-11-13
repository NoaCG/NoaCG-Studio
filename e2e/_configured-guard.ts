// globalSetup for every configured run (playwright.live.config.ts, and the instrument config that
// spreads it): refuse to start unless the backend is one this run owns.
//
// WHY HERE. Playwright runs `globalSetup` before the first test and before any spec module is
// imported, which is earlier than any write - including the service-key writes several specs make
// in `beforeAll`. It is also the one place every entry point passes through, whatever started it:
// `npm run test:e2e:live`, a CI step, `scripts/configured-trial.mjs`, a bare `npx playwright test
// --config=playwright.live.config.ts`. `e2e/_offline-guard.ts` closes the offline suite's
// equivalent hole from the same seam, for the same reason.
//
// WHY NOT AT CONFIG SCOPE, one line earlier. The config module is imported by things that are not
// runs - `scripts/dev-port-readonly.test.mjs` imports all three configs to prove loading one
// reserves no port - and those imports happen on machines whose `.env` legitimately points at
// production. A refusal there would fail a unit test for having a production `.env`, which is not
// the fault being fixed. `webServer` starts between the two points; it is a Vite dev server, it
// writes nothing, and the run dies before a single test.
//
// TWO QUESTIONS, NOT ONE. The environment this process holds decides where the specs' own admin
// client and the api/ handlers write. The dev server decides where the BROWSER writes - and with
// `reuseExistingServer: true` that can be a server somebody started earlier, carrying their own
// `.env`, which no amount of checking this process's variables can see. A run admitted on a
// localhost environment would then sign in through a page served against production and write
// there (account.spec.ts changes the test account's password through the UI). So the served
// backend is read from the page itself, exactly as `_offline-guard.ts` reads its pins, and judged
// by the same rule.
//
// The rules themselves, and the incident that bought them, are in scripts/configured-target.mjs.
import { chromium } from '@playwright/test';
import { assertConfiguredTarget, configuredTarget, DECLARATION, describeTarget } from '../scripts/configured-target.mjs';
import { livePort } from '../scripts/dev-port.mjs';

// webServer's own deadline has passed by the time this runs. Bound these probes too: a server can
// answer readiness once and then accept connections without ever replying.
const PROBE_TIMEOUT_MS = 10_000;

/** What `import.meta.env.VITE_SUPABASE_URL` resolves to inside the page the suite will drive. */
async function servedBackend(base: string): Promise<string | null> {
  const listening = await fetch(base, { method: 'GET', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then((response) => response.ok)
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Configured guard readiness probe timed out after ${PROBE_TIMEOUT_MS}ms at ${base}.`, { cause: error });
      }
      return false;
    });
  // Nothing listening at all: webServer failed, or a future Playwright reorders the phases. The
  // run is about to fail on its own, and there is no served backend to judge.
  if (!listening) return null;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
    // Vite does not inline `import.meta.env.VITE_*` in dev, so the value cannot be read by
    // fetching text; e2e/_env-probe.ts exists to be evaluated inside a real page, where it
    // resolves to exactly what the app sees.
    const probed = await page.evaluate(async () => {
      const probe = (await import('/e2e/_env-probe.ts')) as { VITE_SUPABASE_URL?: unknown };
      return String(probe.VITE_SUPABASE_URL ?? '');
    });
    return probed;
  } finally {
    await browser.close();
  }
}

export default async function configuredGuard(): Promise<void> {
  const target = assertConfiguredTarget(process.env, 'the configured suite');

  const base = `http://127.0.0.1:${livePort()}`;
  const served = await servedBackend(base);
  if (served === null) {
    console.log(`Configured backend - ${describeTarget(target)} (no server to probe at ${base})`);
    return;
  }

  // The same rule, on the value the page actually holds. The declaration is carried over so a
  // declared staging run is judged as one; everything else has to be a local stack.
  const page = configuredTarget({ VITE_SUPABASE_URL: served, [DECLARATION]: process.env[DECLARATION] ?? '' });
  if (page.kind === 'refused') {
    throw new Error(
      `Refusing to start the configured suite: the dev server at ${base} SERVES a backend this run does not own. ` +
        `${page.reason}\n\n` +
        `This process's own environment was fine (${describeTarget(target)}), so the server is one that was already ` +
        `running when Playwright looked (reuseExistingServer), carrying whatever environment file started it. The ` +
        `specs sign in through that page and write there. Stop that server and re-run, so Playwright starts its own.`,
    );
  }

  console.log(`Configured backend - ${describeTarget(target)}; served by ${base}: ${served || 'nothing'}`);
}
