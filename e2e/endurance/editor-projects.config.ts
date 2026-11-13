import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { assertConfiguredTarget } from '../../scripts/configured-target.mjs';
import { validateCloudWorkerRequest } from '../../scripts/e2e-workers.mjs';
import { livePort } from '../../scripts/dev-port.mjs';

// The mandatory E4 isolated persistence qualification, carried by unchanged endurance.yml.
// No .env loading: the wrapper supplies only the managed local stack's identity.
// The whole backend rule, not one variable of it (scripts/configured-target.mjs, issue #2495):
// this run's dev server mounts the api/ handlers, which prefer SUPABASE_URL and an admin key, so
// checking only the browser's spelling let an ambient production one through.
assertConfiguredTarget(process.env, 'the isolated persistence qualification');
if (!process.env.E4_PROJECTS_SOURCE || !process.env.E4_PROJECTS_RECEIPT) {
  throw new Error('Start this isolated qualification through npm run qualify:editor-projects.');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = `http://127.0.0.1:${livePort()}`;
export default defineConfig({
  ...validateCloudWorkerRequest(),
  testDir: '.',
  testMatch: 'editor-projects.ts',
  globalTimeout: 5 * 60_000,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: `${root}endurance-output/editor-projects/report.json` }], ['../../scripts/e2e-run-integrity.mjs', { expected: 'e2e/endurance/editor-projects.ts' }]],
  outputDir: `${root}endurance-output/editor-projects/test-results`,
  use: { baseURL: origin, trace: 'retain-on-failure', actionTimeout: 15_000 },
  projects: [{ name: 'isolated-projects', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    cwd: root,
    command: `vite --host 127.0.0.1 --port ${livePort()} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NOACG_E2E_SERVER: '1' },
  },
});
