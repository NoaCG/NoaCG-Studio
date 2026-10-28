import { defineConfig, devices } from '@playwright/test';
import { livePort } from './scripts/dev-port.mjs';

// THE ENDURANCE RUN (docs/work-specs/playout-expanded-acceptance/spec.md, phase E8.1b): one walk of
// the whole election data path for the minutes asked, against a local Supabase stack. It is started
// by `npm run endurance:election -- --minutes <n>` (scripts/endurance-election.mjs), which reads the
// stack's identity, makes the account and judges the record; `.github/workflows/endurance.yml` runs
// that by hand only. It is in no other suite: its file is not a `.spec.ts`, so neither the offline
// nor the configured config picks it up, and its one test lasts as long as the run.
const minutes = Number(process.env.ENDURANCE_MINUTES ?? 5);
// The local stack only: the walk publishes, writes and reads as a real production would.
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.VITE_SUPABASE_URL ?? '')) {
  throw new Error('the endurance walk runs against a local Supabase stack only: start it through npm run endurance:election');
}

export default defineConfig({
  testDir: './e2e/endurance',
  testMatch: 'election-endurance.ts',
  // The run, plus its setup and teardown; the workflow's own 90-minute job bounds it from outside.
  timeout: (minutes + 12) * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'endurance-output/test-results',
  use: {
    baseURL: `http://127.0.0.1:${livePort()}`,
    trace: 'off',
    // A click that cannot land fails within seconds, never by waiting out the hour.
    actionTimeout: 15_000,
  },
  projects: [{ name: 'endurance', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `vite --host 127.0.0.1 --port ${livePort()} --strictPort`,
    url: `http://127.0.0.1:${livePort()}`,
    // Its own server, always: one already on this port may carry another backend.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
