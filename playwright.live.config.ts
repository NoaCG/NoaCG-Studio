import { validateCloudWorkerRequest } from './scripts/e2e-workers.mjs';
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
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
  // SUPABASE_URL is here for the GUARD rather than for a spec. The Vite server this config starts
  // copies every missing file key into its own environment (vite.config.ts) and mounts the real
  // api/ handlers, which read SUPABASE_URL in preference to VITE_SUPABASE_URL (api/_lib/*), and
  // two specs drive that server-side half in process. A value left only in the file would
  // therefore be live for the api half and invisible to e2e/_configured-guard.ts, which reads
  // process.env. It is a hostname, and it changes the guard's verdict.
  //
  // SUPABASE_SECRET_KEY is deliberately NOT here. No key changes the verdict - the guard names one
  // only in the wording of a refusal - so loading it from the file would put an admin credential
  // into the runner and every worker to buy a better sentence, which is the material issue #2495
  // is about.
  'SUPABASE_URL',
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
// secrets). They write real rows and clean up after, so since issue #2495 the BACKEND IS CHECKED
// rather than advised: the run is refused unless it is pointed at a LOCAL stack of its own
// (`supabase start`, which is what both CI jobs mint), whatever the environment file says. A
// hosted project is no longer a legitimate target for a developer run - the rule, its one
// declared exception and the incident behind it are in scripts/configured-target.mjs.
const cloudLimits = validateCloudWorkerRequest();

export default defineConfig({
  ...cloudLimits,
  testDir: './e2e/configured',
  // WHICH BACKEND THIS RUN MAY TOUCH, decided before the first test (issue #2495). The suite
  // writes real rows, deletes them and holds an admin key, and until this existed the only thing
  // choosing the project was whatever `VITE_SUPABASE_URL` the shell happened to carry - which on
  // a cloud worker is PRODUCTION. e2e/_configured-guard.ts refuses anything but a stack the run
  // owns; scripts/configured-target.mjs holds the rule and the incident that bought it.
  //
  // ABSOLUTE, and it has to be. Playwright resolves `globalSetup` against the directory of the
  // CONFIG FILE it loaded, and configs in other folders spread this one - e2e/configured/measure/
  // measure.config.ts is the live-publishing measurement harness. A repo-relative string travels
  // into those and resolves against their folder, so the config dies at load with "Cannot find
  // module" before it reads a single file, and nothing in CI loads them to say so.
  globalSetup: fileURLToPath(new URL('./e2e/_configured-guard.ts', import.meta.url)),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // One retry: these specs cross the real network to Supabase, and the first auth call from a cold
  // browser context can stall past the expect timeout (observed 2026-07-08; identical re-run green).
  retries: 1,
  // A committed `test.only` would drop every other test in the run; on CI it fails the run instead
  // (cicd-improvement ci05; eslint.config.js refuses it before it is committed).
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['./scripts/e2e-run-integrity.mjs']],
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
    // No file watching (vite.config.ts, `watch`), so a mid-run edit cannot split a module (#1897).
    env: { NOACG_E2E_SERVER: '1' },
  },
});
