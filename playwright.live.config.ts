import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';
import { livePort } from './scripts/dev-port.mjs';

// Playwright's runner (Node) does NOT auto-load .env — only Vite does, and only for its own dev
// server. Load the project's .env here so the specs can read the test-account creds from a FILE
// (E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY, plus VITE_SUPABASE_URL for the moderator
// admin client) instead of the command line. Inline env vars still win — we only fill what's missing.
const fileEnv = loadEnv('development', process.cwd(), '');
// VITE_SUPABASE_ANON_KEY is here for the analytics specs, which gate on BOTH halves of the
// Supabase pair: without it they skipped themselves on every run of this suite, silently.
for (const key of [
  'E2E_EMAIL',
  'E2E_PASSWORD',
  'E2E_TEAMMATE_EMAIL',
  'E2E_TEAMMATE_PASSWORD',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]) {
  if (!process.env[key] && fileEnv[key]) process.env[key] = fileEnv[key];
}

// Configured-mode E2E — the AUTHENTICATED community flows the offline suite (playwright.config.ts)
// cannot cover, because that one pins Vite to offline mode. This config instead runs a dev server WITH
// the real Supabase backend from .env; the specs sign in via the topbar dialog as a THROWAWAY test
// account (E2E_EMAIL / E2E_PASSWORD) and exercise publish → browse → import → moderate against it.
//
// Opt-in and secret-free: run with `npm run test:e2e:live`. The specs skip themselves when E2E_EMAIL /
// E2E_PASSWORD are unset, so a public clone or a creds-less CI never runs them (and never needs the
// secrets). They write real rows to the configured project and clean up after — point .env at a
// test/staging Supabase project or a throwaway account, never a production tenant with real users.
export default defineConfig({
  testDir: './e2e/configured',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // One retry: these specs cross the real network to Supabase, and the first auth call from a cold
  // browser context can stall past the expect timeout (observed 2026-07-08; identical re-run green).
  retries: 1,
  reporter: [['list']],
  use: {
    // The live suite runs beside the offline one, so it takes the dev port's odd neighbour
    // (5175 in the main checkout; per-worktree otherwise — see scripts/dev-port.mjs).
    baseURL: `http://127.0.0.1:${livePort()}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'configured', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `vite --host 127.0.0.1 --port ${livePort()} --strictPort`,
    url: `http://127.0.0.1:${livePort()}`,
    reuseExistingServer: true,
    timeout: 60_000,
    // NO Supabase override here (unlike the offline config): Vite loads VITE_SUPABASE_URL / _ANON_KEY
    // from .env, so the app runs in configured mode. The editor itself is open (no login wall);
    // account features gate themselves, and the specs sign in through the topbar dialog.
  },
});
