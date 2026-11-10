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
// Results land in test-results/measure/*.json; `summarize.mjs` turns them into the receipt's tables.
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /\.measure\.ts$/,
  retries: 0,
  timeout: 12 * 60_000,
  reporter: [['list']],
  use: { ...base.use, trace: 'off', actionTimeout: 15_000 },
  // The dev server runs from the repository root, as the suite's own does.
  webServer: { ...(base.webServer as object), cwd: root } as typeof base.webServer,
});
