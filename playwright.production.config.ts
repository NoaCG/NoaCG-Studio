import { validateCloudWorkerRequest } from './scripts/e2e-workers.mjs';
import { defineConfig, devices } from '@playwright/test';
import { DECLARATION, KEY_VARS, URL_VARS } from './scripts/configured-target.mjs';

// THE DEPLOYED SITE'S OWN SUITE - the tier nothing else in this repository covers.
//
// The offline config builds and serves the app itself; the configured one (playwright.live.config.ts)
// runs a Vite DEV SERVER against the real backend. Both are the repository's idea of the app, and
// the gap between that and https://noacg.studio is not theoretical: on 2026-09-10 the deep link
// `noacg save` prints was measured failing on production while the spec that asserts it passed on
// the dev server, and the difference hid for six days because nothing here ever loaded the
// deployed bundle.
//
// WHAT MAY RUN HERE. Production is a real deployment with real users' data in it, so this suite
// is deliberately tiny and deliberately ANONYMOUS: only tests tagged `@production`, which must
// need no account, write nothing, and leave no trace. That restriction is also what lets CI run
// it - the account the configured suite signs into is a local stack's, and no production
// credential exists in this repository or its secrets.
//
//   npx playwright test --config=playwright.production.config.ts       # against noacg.studio
//   PRODUCTION_URL=https://staging.example npm run test:e2e:production # or any deployment
//
// .github/workflows/deploy-verify.yml runs it on every production deployment and on the same
// four-times-a-day schedule as the version check beside it.
// THIS SUITE HAS NO BACKEND (issue #2495). Its target is `baseURL` below; it signs in nowhere and
// writes nothing. But it shares `e2e/configured/` as its directory, so Playwright loads those spec
// files to resolve the `grep`, and that reaches `_helpers.ts`, which refuses a backend a
// configured run does not own - a shell with a production environment file exported would abort a
// suite that could not have touched it. Saying the true thing is enough: in THIS process there is
// no backend and no admin key, so the shared rule sees none. It cannot affect the deployed site
// being measured, and a key that is not in the environment cannot be used by a loaded spec module.
//
// A KNOWN COMPROMISE, recorded rather than hidden (#2504): a config reaching into the whole
// process's environment so another module's import-time side effect will pass is the wrong seam.
// The right one is to hand the key out through an accessor, so the check runs where a spec writes
// instead of where its file is parsed, after which these two lines go away. That change touches
// twenty-four specs - twenty-one build an admin client from the pair and three more write with
// the key over raw REST - which is why it is its own issue and not this one's.
// THE DECLARATION GOES TOO. Without it, a shell that has declared the staging target - the one
// `hosted-latency.yml` exports, and anyone reproducing that job - leaves this process saying
// "hosted-staging, and no backend URL", which the rule refuses rather than reading as no backend.
// The suite then aborts collecting its own anonymous tests over a declaration about a project it
// never touches.
for (const name of [...URL_VARS, ...KEY_VARS, DECLARATION]) delete process.env[name];

const cloudLimits = validateCloudWorkerRequest();

export default defineConfig({
  ...cloudLimits,
  // The same directory the configured suite uses, filtered by tag: a deep link is one behaviour
  // and deserves ONE spec file, whichever server it is pointed at. `grep` is what keeps the rest
  // of that suite - which signs in, writes records and deletes them - away from production.
  testDir: './e2e/configured',
  grep: /@production/,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  // The public internet, from a CI runner: one retry, so a dropped request is not an alarm.
  retries: 1,
  // A committed `test.only` would drop every other test in the run; on CI it fails the run instead
  // (cicd-improvement ci05; eslint.config.js refuses it before it is committed).
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['./scripts/e2e-run-integrity.mjs']],
  use: {
    baseURL: process.env.PRODUCTION_URL || 'https://noacg.studio',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'production', use: { ...devices['Desktop Chrome'] } }],
  // No webServer: the whole point is that nothing local is involved.
});
