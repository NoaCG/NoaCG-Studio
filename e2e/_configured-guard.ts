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
// client writes. The dev server decides where the BROWSER writes, and where the api/ handlers it
// mounts write - which is not the same thing: Vite copies anything missing from this process into
// the server's own environment from the environment file (vite.config.ts), so a page can be built
// against a backend this process never named. A run admitted on a localhost environment would
// then sign in through a page served against production and write there (account.spec.ts changes
// the test account's password through the UI).
//
// So the served backend is read back from the page, exactly as `_offline-guard.ts` reads its
// pins, and judged by the same rule. The config stopped adopting foreign servers as well
// (`reuseExistingServer: false`), because the server's api half cannot be read from outside at
// all; this probe is what notices when the server's own idea of the backend drifts from the one
// this run was admitted on, whoever started it.
//
// The rules themselves, and the incident that bought them, are in scripts/configured-target.mjs.
import { chromium, type FullConfig } from '@playwright/test';
import { assertConfiguredTarget, describeTarget, servedTarget } from '../scripts/configured-target.mjs';
import { livePort } from '../scripts/dev-port.mjs';

// webServer's own deadline has passed by the time this runs. Bound these probes too: a server can
// answer readiness once and then accept connections without ever replying.
const PROBE_TIMEOUT_MS = 10_000;

/** What `import.meta.env.VITE_SUPABASE_URL` resolves to inside the page the suite will drive. */
async function servedBackend(base: string): Promise<string | null> {
  // ANSWERED AT ALL, not answered 2xx. Playwright admits a `webServer` on any status from 200 to
  // 403, so a run can be under way while `/` returns 401 or a 3xx nothing followed. Reading that
  // as "nothing is there" would skip the served check on a server the specs are about to drive,
  // and then say nothing answered - the one sentence guaranteed to send the next person to the
  // wrong place. A status is a status; only a connection error means no server.
  const listening = await fetch(base, { method: 'GET', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Configured guard readiness probe timed out after ${PROBE_TIMEOUT_MS}ms at ${base}.`, { cause: error });
      }
      return false;
    });
  // Nothing listening at all: webServer failed, or a future Playwright reorders the phases. The
  // run is about to fail on its own, and there is no served backend to judge. Deliberately
  // fail-open, as `_offline-guard.ts` is for the same case: the alternative is a guard that turns
  // "the server did not start" into a refusal about backends, which sends the next person looking
  // in the wrong place. The suite starts its own server, so a reachable wrong one is the case
  // that matters and that case answers.
  if (!listening) return null;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Bounded like the probe above: a server that answers `/` and then stalls on `/app` should
    // fail here in ten seconds with this file in the stack, not after Playwright's 30-second
    // navigation default.
    await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded', timeout: PROBE_TIMEOUT_MS });
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

/**
 * The origin the tests will actually drive, taken from the config Playwright loaded rather than
 * assumed. A config that spreads the live one can serve somewhere else entirely:
 * `e2e/configured/measure/measure.config.ts` with `MEASURE_BUILD=prod` puts a build switch on its
 * own port in front of two servers of its own. Probing this suite's usual port there would check
 * a server nobody is driving - skipping the real one, and refusing the run outright if something
 * unrelated happened to be listening.
 */
function origin(config?: FullConfig): string {
  const fromConfig = config?.projects?.map((project) => project.use?.baseURL).find((url) => typeof url === 'string' && url !== '');
  return fromConfig ?? `http://127.0.0.1:${livePort()}`;
}

export default async function configuredGuard(config?: FullConfig): Promise<void> {
  const target = assertConfiguredTarget(process.env, 'the configured suite');

  const base = origin(config);
  const served = await servedBackend(base);
  if (served === null) {
    console.warn(
      `Configured backend - ${describeTarget(target)}. WHAT THE SERVER SERVES WAS NOT CHECKED: nothing answered at ` +
        `${base}, so this run was admitted on its own environment alone. Expect the run to fail next on the server ` +
        `that did not start.`,
    );
    return;
  }

  // The same rule, on the value the page actually holds. `servedTarget` builds that environment by
  // REPLACEMENT rather than from scratch, so every other variable the rule reads comes along
  // without being listed here - the declaration, and `STAGING_SUPABASE_PROJECT_REF`, which a fork
  // sets to name its own staging project. Naming them one by one was how a fork's override got
  // dropped and its correctly configured server refused. It lives in the rule module so it can be
  // tested without a server, and so this file cannot drift into judging the page by its own rule.
  const page = servedTarget(served, process.env);
  if (page.kind === 'refused') {
    throw new Error(
      `Refusing to start the configured suite: the dev server at ${base} SERVES a backend this run does not own. ` +
        `${page.reason}\n\n` +
        `This process's own environment was fine (${describeTarget(target)}), so the server has an environment of its ` +
        `own: either one left running on this port, or values the environment file gave it that this process never ` +
        `named. The specs sign in through that page and write there. Stop that server, take the backend from ` +
        '`supabase status`, and re-run.',
    );
  }

  console.log(`Configured backend - ${describeTarget(target)}; ${base} serves ${describeTarget(page)}`);
}
