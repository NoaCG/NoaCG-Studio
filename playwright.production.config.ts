import { defineConfig, devices } from '@playwright/test';

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
export default defineConfig({
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
  reporter: [['list']],
  use: {
    baseURL: process.env.PRODUCTION_URL || 'https://noacg.studio',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'production', use: { ...devices['Desktop Chrome'] } }],
  // No webServer: the whole point is that nothing local is involved.
});
