// Diagnostic failure, not a passing suite. Example (enqueue, never launch beside a suite):
// npm run queue -- "npx playwright test --config scripts/e2e-readiness.config.mjs offline.spec.ts" --cap 2
// Optional NOACG_READINESS_FIXTURE: readiness, guard-root (default), guard-config, guard-body.
// The real offline config and globalSetup do the work; only this fixture's server and safety
// caps differ. Production webServer caps remain 60 seconds, and the guard uses its real limit.
import { fileURLToPath } from 'node:url';
import config from '../playwright.config.ts';

const mode = process.env.NOACG_READINESS_FIXTURE ?? 'guard-root';
if (!['readiness', 'guard-root', 'guard-config', 'guard-body'].includes(mode)) {
  throw new Error(`Unknown readiness fixture mode: ${mode}`);
}
export default {
  ...config,
  testDir: fileURLToPath(new URL('../e2e', import.meta.url)),
  globalSetup: fileURLToPath(new URL('../e2e/_offline-guard.ts', import.meta.url)),
  globalTimeout: 45_000,
  reporter: 'list',
  webServer: {
    // The app's server: the offline config's first entry (playwright.config.ts).
    ...[config.webServer].flat()[0],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: `node scripts/e2e-readiness-fixture.mjs ${mode}`,
    stdout: 'pipe',
    reuseExistingServer: false,
    timeout: 3_000,
  },
};
