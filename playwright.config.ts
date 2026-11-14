import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { devPort, livePort } from './scripts/dev-port.mjs';
import { devServerSpecs } from './scripts/e2e-dev-server-specs.mjs';
import { localWorkers, validateCloudWorkerRequest } from './scripts/e2e-workers.mjs';

// End-to-end UI-flow tests. These drive the real app, so they verify it the way a user experiences
// it: the dev server by default, the e2e build when NOACG_E2E_ON_BUILD=1 (CI). Run with
// `npm run test:e2e`.
// The port comes from scripts/dev-port.mjs (5174 in the main checkout, a stable per-worktree
// port in a linked worktree), so parallel worktrees never reuse each other's servers.
const base = `http://127.0.0.1:${devPort()}`;
const isCi = Boolean(process.env.CI);
// THE SUITE AGAINST THE BUILT APP (run #1967, plan A step d): `NOACG_E2E_ON_BUILD=1` builds the e2e
// bundle (`npm run build:e2e`) and serves it with `vite preview` on the same port, instead of the dev
// server. A fresh context boots it in about a third of the time. Specs reach app modules through
// `__noacgImport` (src/app/e2eModules.ts), which the build answers from its registry.
const onBuild = process.env.NOACG_E2E_ON_BUILD === '1';
// A few specs test what only the dev server has (a source module swapped over the network, a fresh
// module copy). Each says so in its header, `// runs on: dev server - <why>`
// (scripts/e2e-dev-server-specs.mjs). On the build they run in the "dev" project, against a dev
// server on this checkout's second port, unchanged. The server starts only when this run holds one
// of them: CI names each shard's files in NOACG_E2E_EXPECTED_SPECS.
const devSpecs = onBuild ? devServerSpecs() : [];
const specPattern = (file: string) => new RegExp(`[\\\\/]e2e[\\\\/]${file.slice('e2e/'.length).replace(/\./g, '\\.')}$`);
const devSpecPatterns = devSpecs.map(specPattern);
const expected = process.env.NOACG_E2E_EXPECTED_SPECS?.split(/\s+/).filter(Boolean).map((f) => (f.startsWith('e2e/') ? f : `e2e/${f}`));
const needsDevServer = devSpecs.length > 0 && (!expected || expected.some((f) => devSpecs.includes(f)));
const devBase = `http://127.0.0.1:${livePort()}`;
// The offline guard (globalSetup) checks that server only when this run starts it.
if (needsDevServer) process.env.NOACG_E2E_DEV_SERVER = '1';

// THE BLOB FILE MUST BE UNIQUE PER SHARD, and only Playwright's own `--shard=i/n` makes it so on
// its own - it suffixes the zip with the shard number. Without sharding every runner writes
// `blob-report/report.zip`, and ci.yml's report job downloads all nine artifacts with
// `merge-multiple: true`, which flattens them into ONE directory: eight zips silently overwrite
// the ninth and `merge-reports` builds the combined report from a single shard's data. Since
// 2026-09-04 ci.yml assigns spec files explicitly instead of sharding, so it names the file
// itself through this variable. nightly.yml has done the same since 2026-09-30, and its triage
// reads the names to tell which shard sent no report (scripts/nightly-triage.mjs).
const blobReporter: ReporterDescription = process.env.NOACG_BLOB_NAME
  ? ['blob', { fileName: process.env.NOACG_BLOB_NAME }]
  : ['blob'];
const cloudLimits = validateCloudWorkerRequest();

/** The offline pins every server this suite starts gets (why: the notes on appServer below). */
const serverEnv = {
  VITE_PREVIEW_DEBOUNCE_MS: '50',
  // No file watching (vite.config.ts, `watch`), so a mid-run edit cannot split a module (#1897).
  NOACG_E2E_SERVER: '1',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  // THE SERVER'S OWN HALF (issue #2495). The two above are the BROWSER's; the api/ handlers
  // this server mounts prefer these, and Playwright merges webServer.env over the shell
  // rather than replacing it, so without them a shell that names production hands the
  // offline suite's own dev server a production backend and an admin key - and
  // `e2e/admin.spec.ts` calls a handler that reads `system_settings` with it. CI never set
  // them; a developer's shell does.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
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
  // Hosted Pro is pinned OFF for the same reason every key above is pinned empty: the dev
  // server now mounts the pro-* routes (scripts/aiDevPlugin.mjs), so a developer whose .env
  // switches the tier on would have this suite answering /api/ai/pro-status from their real
  // configuration. e2e/pro.spec.ts pins the ABSENCE of the door and stubs the status itself,
  // and a spec that asserts an absence must not be the thing deciding whether it holds.
  AI_PRO_ENABLED: '',
};

const appServer = {
  // The port is passed, not left to vite.config.ts: the server then reserves exactly the number
  // this config is waiting on, or fails loudly (scripts/dev-port.mjs, "asking never reserves").
  command: onBuild
    ? `npm run build:e2e && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${devPort()} --strictPort`
    : `npm run dev -- --host 127.0.0.1 --port ${devPort()} --strictPort`,
  url: base,
  reuseExistingServer: !onBuild,
  timeout: onBuild ? 240_000 : 60_000,
  // Pin the suite to OFFLINE mode regardless of the developer's local .env (which may hold real
  // Supabase creds for live testing). Env vars set here take priority over .env files in Vite,
  // so these empty values win and the app behaves as the no-backend tool the specs assume.
  // Auth/sync live paths are verified separately (supabase/README.md checklist).
  // VITE_RENDER_API is pinned ON: the render section is part of the offline surface the
  // suite covers (the local executor renders with zero backend — the self-host mode).
  // Render specs stub /api/render/* with page.route, so no real render runs in CI.
  // Every managed AI key is pinned EMPTY so AI-adjacent specs exercise the offline
  // stub providers deterministically. Gateway-backed specs mock /api/ai/generate.
  // NOTE: none of this applies when reuseExistingServer adopts a server someone else
  // already started - that path is guarded by globalSetup above, not by this env block.
  // The preview's rebuild debounce is 350 ms for authoring (it stops a rebuild per keystroke
  // in the code editor) and 50 ms here. Every spec waits on the iframe's `data-doc-rev`
  // stamp rather than sleeping, so this shortens the WAIT without changing what any spec
  // observes - and 300 ms per rebuild across 591 tests is minutes of wall clock. Kept above
  // zero so a genuine burst of changes still coalesces into one rebuild the way it does in
  // the product.
  env: serverEnv,
};

/** The dev server the "dev" project runs on, when the suite runs on the build. */
const devServer = {
  command: `npm run dev -- --host 127.0.0.1 --port ${livePort()} --strictPort`,
  url: devBase,
  reuseExistingServer: false,
  timeout: 60_000,
  env: serverEnv,
};

export default defineConfig({
  ...cloudLimits,
  testDir: './e2e',
  // The authed community flows live in e2e/configured and run under playwright.live.config.ts (a
  // configured, signed-in backend). The exhaustive catalog calibration tripwire lives in
  // e2e/catalog and runs under playwright.catalog.config.ts (npm run test:e2e:catalog) - it is a
  // catalog-wide quality gate, not a feature-flow test, so it stays out of the default merge-gate
  // suite the same way the authed flows do.
  testIgnore: ['**/configured/**', '**/catalog/**'],
  // 60 s, not Playwright's 30 s default, because this suite's tests are much fatter than that
  // default assumes. Measured over a full run on an otherwise idle box (569 tests, 4 workers):
  // 47 tests take 18 s or more, and nine of them sit between 24 s and 38 s - a wizard walk, a
  // video generation with its live probe, or a Monaco mount is seconds of real work, and the
  // heaviest legitimate test (three complete wizard walks) needs 38 s all by itself. At a 30 s
  // budget that whole band was a coin toss, which is exactly what "a different test in the same
  // file fails each run" looked like. The budget was the false deadline, not the app.
  //
  // This is not a retry in disguise: a test still gets exactly one attempt, and the failure it
  // reports is still the first one. What changed is that the deadline now sits above the work
  // rather than through the middle of it. `expect` stays at 7 s - that one bounds a RENDER, and
  // a wrong assertion should still report in seconds; the few waits that bound a download or a
  // generation instead say so at the call site.
  timeout: 60_000,
  expect: { timeout: 7_000 },
  // The looser budget must not become a place for tests to quietly get slower. Anything past
  // 45 s is named in the report, so growth shows up as a listed slow test rather than as a
  // random red six months later.
  reportSlowTests: { max: 10, threshold: 45_000 },
  // The suite is parallel-safe: every test gets a fresh browser context (isolated storage),
  // the dev server is stateless in the pinned offline mode, and the render specs stub their
  // API per-page. fullyParallel spreads the big spec files (timeline-v2 is ~40 tests) across
  // workers instead of leaving the largest file as the serial critical path.
  // Local worker count is DERIVED FROM FREE MEMORY at load, not hardcoded - the constraint is
  // memory, not cores, and how much is free is a property of the moment rather than of the
  // machine (scripts/e2e-workers.mjs holds the measurements and the arithmetic). It always
  // keeps a reserve back for whatever the developer is doing while the suite runs, prints the
  // number and its reason so a run's duration stays explainable, and honours E2E_WORKERS.
  //
  // GitHub's smaller runners use one worker each and scale across eight independent shards
  // instead: more than the same aggregate concurrency, without several browsers and one Vite
  // server fighting over a single runner. Sharding is per-TEST, not per-file (verified against
  // run 30539377062: of 97 spec files, exactly the 3 sitting on a shard boundary were split),
  // so no single fat spec file can become the critical path however high the shard count goes.
  fullyParallel: true,
  workers: isCi ? 1 : localWorkers(),
  retries: 0,
  // A committed `test.only` would drop every other test in the run; on CI it fails the run instead
  // (cicd-improvement ci05; eslint.config.js refuses it before it is committed).
  forbidOnly: Boolean(process.env.CI),
  // Blob reports make independently sharded runs mergeable. Keep a line reporter too so a
  // failure is readable in the live Actions log without downloading the combined report,
  // and the github reporter so each failing test lands as an annotation on the commit/PR.
  // The integrity reporter fails a run that cannot be a verdict - a full disk, a truncated run -
  // even when every test it saw passed (scripts/e2e-run-integrity.mjs).
  // A run that sets NOACG_E2E_TRACE (main's push run, the nightly) records which source each spec
  // executed: the tsconfig maps the specs' Playwright import to e2e/_trace.ts, and the reporter
  // gathers what it wrote (scripts/e2e-traced.mjs).
  ...(process.env.NOACG_E2E_TRACE ? { tsconfig: './e2e/tsconfig.trace.json' } : {}),
  reporter: [
    ...(isCi ? [['line'], ['github'], blobReporter] : [['list']]),
    ...(process.env.NOACG_E2E_TRACE ? [['./scripts/e2e-trace-reporter.mjs']] : []),
    ['./scripts/e2e-run-integrity.mjs'],
  ] as ReporterDescription[],
  // Refuses to run against an already-running dev server that is not offline-pinned. The
  // webServer.env below only applies when Playwright STARTS the server; reuseExistingServer
  // adopts an existing one as-is, silently skipping every pin. See e2e/_offline-guard.ts.
  globalSetup: './e2e/_offline-guard.ts',
  use: {
    baseURL: base,
    // There are deliberately no retries to disguise flakes, so CI collects diagnostics on the
    // first failure rather than waiting for a retry that will never happen. The one second run
    // a failed spec gets is ci.yml's `e2e-retry` job on main and in the merge group, and it
    // leaves a record: a fail-then-pass writes the spec into e2e/quarantine.json through the
    // merge queue (scripts/e2e-quarantine.mjs), which is the opposite of a retry nobody sees.
    //
    // Locally that setting is off, and it is the single largest local speed win measured here.
    // `retain-on-failure` does not mean "record only failures" - the tracer runs for EVERY
    // test, capturing snapshots, network and screenshots, and the artifact is DISCARDED when
    // the test passes. On a green run that is pure cost. Same 119-test set, same machine,
    // 4 workers, only this setting different:
    //
    //     retain-on-failure   229.2 s   85.7% avg CPU    320 MB free at the low point
    //     off                 151.8 s   72.5% avg CPU    651 MB free
    //
    // 34% of the wall clock, on runs that pass - which is nearly all of them. The trade is
    // that a local failure arrives without a trace, and the answer is to ask for one on the
    // single spec that failed rather than to pay for 782 of them up front:
    //
    //     npx playwright test <spec> --trace on
    //
    // Screenshots stay on: they cost almost nothing (one capture, only when a test fails) and
    // they are usually enough to tell "the app broke" from "the selector moved".
    // DOM snapshots replay the entire editor/preview tree at every action, even when a test
    // passes and its trace is discarded. Keep the action/source/console trace and filmstrip,
    // plus the failure screenshot below, without paying for interactive DOM replay. Tests,
    // assertions, waits, isolation and retry policy are unchanged. Bounded measurements:
    // docs/work-specs/e2e-trace-overhead/spec.md.
    trace: { mode: isCi ? 'retain-on-failure' : 'off', snapshots: false },
    screenshot: 'only-on-failure',
  },
  projects: onBuild
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: ['**/configured/**', '**/catalog/**', ...devSpecPatterns] },
        { name: 'dev', use: { ...devices['Desktop Chrome'], baseURL: devBase }, testMatch: devSpecPatterns },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [appServer, ...(needsDevServer ? [devServer] : [])],
});
