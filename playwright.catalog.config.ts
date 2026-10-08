import { defineConfig, devices } from '@playwright/test';
import { devPort } from './scripts/dev-port.mjs';
import { localWorkers } from './scripts/e2e-workers.mjs';

// The catalog-wide quality gate: e2e/catalog/catalog-bench.spec.ts's calibration tripwire benches
// every catalog variant across every category. It's excluded from the default offline suite
// (playwright.config.ts's testIgnore) because it only needs to run when the catalog or the
// runtime bench itself changes - same reasoning as scripts/type-floor.mjs and
// scripts/overflow-sweep.mjs, which are also NOT part of the default merge-gate suite.
//
// Run with `npm run test:e2e:catalog`. Same offline pinning as the default suite (no backend,
// no AI provider) - the tripwire only exercises src/validation/runtimeBench.ts against
// src/templates/catalog.ts, so it needs nothing else from the app.
const base = `http://127.0.0.1:${devPort()}`;
export default defineConfig({
  testDir: './e2e/catalog',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  // Same memory-derived count as playwright.config.ts, and this is the gate that needs it most:
  // it benches every catalog variant, so it runs longest and holds the machine for the whole of
  // it. CI keeps a fixed 4 - a hosted runner's free memory says nothing useful about how much
  // work it can take, and its load is not shared with anyone trying to use the machine.
  workers: process.env.CI ? 4 : localWorkers(),
  retries: 0,
  reporter: [['list'], ['./scripts/e2e-run-integrity.mjs']],
  // Also the cross-checkout queue: two suites on one 16 GB laptop exhaust it rather than
  // sharing it, and this one overlapping anything else is the worst case of that.
  globalSetup: './e2e/_offline-guard.ts',
  use: {
    baseURL: base,
    // `retries: 0` above means on-first-retry never fires, so this costs nothing either way -
    // it is left as the honest description of when a trace would be wanted.
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The port is passed so the server reserves exactly the number this config waits on.
    command: `npm run dev -- --host 127.0.0.1 --port ${devPort()} --strictPort`,
    url: base,
    reuseExistingServer: true,
    timeout: 60_000,
    // The SAME offline pin as playwright.config.ts, including the managed AI keys - the
    // offline guard reads the server's real env, so a checkout with a local .env fails the
    // guard under any shorter list (found the day a worktree first carried one).
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_RENDER_API: '1',
      VITE_AI_PROVIDER: '',
      VITE_AI_MODEL: '',
      VITE_AI_PROXY_URL: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GOOGLE_API_KEY: '',
      GEMINI_API_KEY: '',
      AI_GATEWAY_API_KEY: '',
      VERCEL_OIDC_TOKEN: '',
      HF_TOKEN: '',
      HUGGINGFACE_TOKEN: '',
      HUGGINGFACE_API_KEY: '',
      AI_KEY_ENCRYPTION_SECRET: '',
      // Pinned off with the keys above, and in BOTH offline configs: this list enumerates what
      // it clears, so a new switch added to only one of them is a real credential reaching one
      // suite's dev server (measured on Google, 2026-08-14).
      AI_PRO_ENABLED: '',
    },
  },
});
