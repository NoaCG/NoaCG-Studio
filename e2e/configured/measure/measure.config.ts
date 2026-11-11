import base from '../../../playwright.live.config';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

// THE LIVE-PUBLISHING BASELINE (docs/work-specs/live-publishing/spec.md phase 2): the configured
// suite's own config, pointed at the measurement files only. They are named `*.measure.ts`, so
// neither the configured suite nor its planner ever selects them; they run on purpose, one group
// at a time:
//   MEASURE_FIXTURE=typical|large MEASURE_NET=fast|slow \
//     npx playwright test --config=e2e/configured/measure/measure.config.ts --grep <group>
// Results land in $MEASURE_OUT (default /tmp/noacg-measure); `summarize.mjs` turns them into the receipt's tables.
const PROD = process.env.MEASURE_BUILD === 'prod';
/** Fixed, outside the reserved range (DEV_PORT bypasses the reservation): the main process and the
 *  workers must agree on the port without a reservation file. */
const PROD_PORT = Number(process.env.MEASURE_PORT ?? 6215);

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /\.measure\.ts$/,
  retries: 0,
  timeout: 12 * 60_000,
  reporter: [['list']],
  use: { ...base.use, trace: 'off', actionTimeout: 15_000, ...(PROD ? { baseURL: `http://127.0.0.1:${PROD_PORT}` } : {}) },
  // The dev server runs from the repository root, as the suite's own does. MEASURE_BUILD=prod
  // (phase 3: AC-1 is judged on a production build) puts `buildSwitch.mjs` on the harness's port,
  // in front of the dev server and `vite preview` of the build in MEASURE_DIST (`vite build
  // --outDir <dir>` with the stack's VITE_ variables).
  webServer: PROD ? prodServers() : ({ ...(base.webServer as object), cwd: root } as typeof base.webServer),
});

function prodServers() {
  const dist = process.env.MEASURE_DIST;
  if (!dist) throw new Error('MEASURE_BUILD=prod needs MEASURE_DIST: the outDir of a `vite build` made with the stack variables');
  const port = PROD_PORT;
  const dev = port + 1, prod = port + 2;
  // DEV_PORT: the ports sit outside the reserved range on purpose, beside the harness's own.
  const env = (port: number) => ({ NOACG_E2E_SERVER: '1', DEV_PORT: String(port) });
  return [
    { command: `vite --host 127.0.0.1 --port ${dev} --strictPort`, url: `http://127.0.0.1:${dev}`, reuseExistingServer: false, timeout: 60_000, cwd: root, env: env(dev) },
    { command: `vite preview --host 127.0.0.1 --port ${prod} --strictPort --outDir ${dist}`, url: `http://127.0.0.1:${prod}`, reuseExistingServer: false, timeout: 60_000, cwd: root, env: env(prod) },
    { command: `node e2e/configured/measure/buildSwitch.mjs --port ${port} --dev ${dev} --prod ${prod}`, url: `http://127.0.0.1:${port}/__measure/build`, reuseExistingServer: false, timeout: 60_000, cwd: root },
  ];
}
