import { defineConfig, devices } from '@playwright/test';
import { requireLocalStack } from './scripts/configured-target.mjs';
import { livePort } from './scripts/dev-port.mjs';

// THE ENDURANCE RUN (docs/work-specs/playout-expanded-acceptance/spec.md, phase E8.1b): one walk of
// the whole election data path for the minutes asked, against a local Supabase stack. It is started
// by `npm run endurance:election -- --minutes <n>` (scripts/endurance-election.mjs), which reads the
// stack's identity, makes the account and judges the record; `.github/workflows/endurance.yml` runs
// that by hand only. It is in no other suite: its file is not a `.spec.ts`, so neither the offline
// nor the configured config picks it up, and its one test lasts as long as the run.
const minutes = Number(process.env.ENDURANCE_MINUTES ?? 5);
// The local stack only: the walk publishes, writes and reads as a real production would, and the
// dev server it drives mounts the api/ handlers, which read SUPABASE_URL and an admin key rather
// than the spellings the browser uses. So it asks the configured suite's whole rule
// (scripts/configured-target.mjs, issue #2495), not one variable of it: this file's own pattern
// checked VITE_SUPABASE_URL alone and accepted a bare `http://localhost:` with no port, so an
// ambient production SUPABASE_URL walked straight past it into the server.
try {
  // `requireLocalStack`, not the plain assertion: this walk signs in and deletes the account's
  // productions before it builds an admin client, so it cannot take "no backend named here" for
  // an answer the way the configured suite can - this config loads no environment file, and the
  // Vite server it starts fills what this process left unset out of one.
  requireLocalStack(process.env, 'the endurance walk');
} catch (refusal) {
  throw new Error(
    `${(refusal as Error).message}\n\nStart the walk through npm run endurance:election, which takes every backend variable from the local stack.`,
    { cause: refusal },
  );
}

export default defineConfig({
  testDir: './e2e/endurance',
  testMatch: 'election-endurance.ts',
  // The run, plus its setup and teardown; the workflow's own 90-minute job bounds it from outside.
  timeout: (minutes + 12) * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  // A committed `test.only` would drop every other test in the run; on CI it fails the run instead
  // (cicd-improvement ci05; eslint.config.js refuses it before it is committed).
  forbidOnly: Boolean(process.env.CI),
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
    // No file watching (vite.config.ts, `watch`), so a mid-run edit cannot split a module (#1897).
    env: { NOACG_E2E_SERVER: '1' },
  },
});
