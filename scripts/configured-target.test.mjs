// guards: scripts/configured-target.mjs, e2e/_configured-guard.ts, e2e/configured/_helpers.ts, playwright.live.config.ts, .github/workflows/hosted-latency.yml
//
// THE REFUSAL THAT KEEPS A CONFIGURED RUN OFF PRODUCTION (issue #2495), pinned from both ends:
// the rule itself, and the wiring that makes a run actually meet it. The wiring half is the half
// that rots - a guard nothing calls reads exactly like a guard that works - so the globalSetup
// line in the live config, the import in the specs' shared helper and the declaration in
// hosted-latency.yml are each read off disk here.
//
// The environments below are FAKE: a made-up project ref in a production-shaped URL, and keys
// that are the word "fake". Nothing in this file reaches a network, which is also the only honest
// way to test a guard whose failure mode is reaching one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfiguredTarget, configuredTarget, DECLARATION, describeTarget, HOSTED_STAGING } from './configured-target.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (name) => readFileSync(path.join(ROOT, name), 'utf8');

/** The shape of the 2026-11-13 incident: a cloud worker's own environment. */
const CLOUD_WORKER = {
  VITE_SUPABASE_URL: 'https://kprolrchuldgfrzspthy.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'fake-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
  E2E_EMAIL: 'someone@example.com',
  E2E_PASSWORD: 'fake',
};

const LOCAL_STACK = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'fake-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
  E2E_EMAIL: 'e2e-s1@noacg.local',
  E2E_PASSWORD: 'noacg-e2e-local-pw',
};

test('the environment that wrote to production is refused, and the message says why', () => {
  const target = configuredTarget(CLOUD_WORKER);
  assert.equal(target.kind, 'refused');
  assert.match(target.reason, /PRODUCTION project/);
  // The refusal has to be actionable without naming the key's VALUE: the key is why it mattered.
  assert.match(target.reason, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(target.reason, /fake-service-role/);
  assert.throws(() => assertConfiguredTarget(CLOUD_WORKER, 'the configured suite'), /Refusing to start the configured suite/);
});

test('the local stack both CI jobs mint is allowed, on either spelling of this machine', () => {
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://127.0.0.1:54321/']) {
    const target = configuredTarget({ ...LOCAL_STACK, VITE_SUPABASE_URL: url });
    assert.equal(target.kind, 'local', url);
    assert.doesNotThrow(() => assertConfiguredTarget({ ...LOCAL_STACK, VITE_SUPABASE_URL: url }));
  }
});

test('any other hosted project is refused, production ref or not', () => {
  // The catastrophic case is production, but a run that deletes rows in SOMEBODY ELSE's project is
  // not better for being a different mistake - and the incident's URL was only production because
  // that is what the container happened to hold.
  const target = configuredTarget({ ...CLOUD_WORKER, VITE_SUPABASE_URL: 'https://someotherproject.supabase.co' });
  assert.equal(target.kind, 'refused');
  assert.match(target.reason, /not a local Supabase stack/);
  assert.match(target.reason, /supabase start/);
});

test('a host with no port is not a stack, however local it reads', () => {
  // `supabase start` always publishes a port. A bare `http://localhost` is something else
  // entirely - a proxy, a tunnel, a forwarder - and what sits behind it is unknown.
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'http://localhost' }).kind, 'refused');
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'https://localhost.example.com:443' }).kind, 'refused');
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'http://127.0.0.1.example.com:54321' }).kind, 'refused');
});

test('api/ reads SUPABASE_URL as well, so a local VITE_SUPABASE_URL cannot smuggle a hosted one past', () => {
  // api/_lib/* prefer SUPABASE_URL over VITE_SUPABASE_URL, and e2e/configured/feed-route.spec.ts
  // and production-data-key-tick.spec.ts run that server-side half in process. Checking only the
  // variable the browser reads would leave the server half pointed anywhere.
  const target = configuredTarget({ ...LOCAL_STACK, SUPABASE_URL: 'https://kprolrchuldgfrzspthy.supabase.co' });
  assert.equal(target.kind, 'refused');
  assert.match(target.reason, /PRODUCTION project/);

  const other = configuredTarget({ ...LOCAL_STACK, SUPABASE_URL: 'https://someotherproject.supabase.co' });
  assert.equal(other.kind, 'refused');
  assert.match(other.reason, /^.*\bSUPABASE_URL\b/);
});

test('hosted staging runs only when it says so, and never at the production ref', () => {
  const staging = { ...CLOUD_WORKER, VITE_SUPABASE_URL: 'https://garafohbzmsybtysxphb.supabase.co' };
  assert.equal(configuredTarget(staging).kind, 'refused');
  assert.equal(configuredTarget({ ...staging, [DECLARATION]: HOSTED_STAGING }).kind, HOSTED_STAGING);
  // The declaration is not a master key: production stays refused with it set.
  assert.equal(configuredTarget({ ...CLOUD_WORKER, [DECLARATION]: HOSTED_STAGING }).kind, 'refused');
  // Nor is a near miss a declaration.
  assert.equal(configuredTarget({ ...staging, [DECLARATION]: 'staging' }).kind, 'refused');
  assert.match(configuredTarget({ ...staging, [DECLARATION]: 'staging' }).reason, /only value/);
});

test('no backend at all is allowed, because a run with none skips itself and is judged for it', () => {
  // Every configured spec gates on E2E_EMAIL / E2E_PASSWORD, and the suite's verdict refuses a run
  // that executed nothing (configured-suite.yml). Refusing here instead would turn a loud zero
  // into a crash, and it closes no hole: an unset URL reaches nothing.
  const target = configuredTarget({});
  assert.equal(target.kind, 'unconfigured');
  assert.match(describeTarget(target), /no backend configured/);
  // A declaration with nothing to declare is a misconfiguration, not an empty environment.
  assert.equal(configuredTarget({ [DECLARATION]: HOSTED_STAGING }).kind, 'refused');
});

test('the description names the target and prints no key', () => {
  assert.equal(describeTarget(configuredTarget(LOCAL_STACK)), 'local: VITE_SUPABASE_URL=http://127.0.0.1:54321');
  assert.doesNotMatch(describeTarget(configuredTarget(LOCAL_STACK)), /fake-service-role/);
});

test('the guard is wired to every configured run and to the specs themselves', () => {
  // A guard nothing calls is the failure this test exists for.
  const config = file('playwright.live.config.ts');
  assert.match(config, /globalSetup: '\.\/e2e\/_configured-guard\.ts'/);
  assert.match(file('e2e/_configured-guard.ts'), /assertConfiguredTarget\(process\.env/);
  // playwright.instrument.config.ts spreads the live config, so it inherits that globalSetup.
  assert.match(file('playwright.instrument.config.ts'), /\.\.\.live,/);
  // The specs' shared helper, where the service-role key is handed out.
  const helpers = file('e2e/configured/_helpers.ts');
  assert.match(helpers, /assertConfiguredTarget\(process\.env/);
  assert.ok(
    helpers.indexOf('assertConfiguredTarget(process.env') < helpers.indexOf('export const SERVICE_ROLE_KEY'),
    'the check must run before the key is exported',
  );
  // The one declared exception, in the one workflow that owns it.
  assert.match(file('.github/workflows/hosted-latency.yml'), /NOACG_CONFIGURED_TARGET: hosted-staging/);
});
