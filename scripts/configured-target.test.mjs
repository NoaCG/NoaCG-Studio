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
import { assertConfiguredTarget, configuredTarget, DECLARATION, DEPLOYED_SITE, describeTarget, HOSTED_STAGING } from './configured-target.mjs';

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

test('a capital letter is not a disguise: hostnames fold before they are judged', () => {
  // Hostnames are case-insensitive, so HTTPS://KPROL….supabase.co IS production. Folding matters
  // most exactly where a declaration is present, because that is the one path that admits a
  // hosted URL at all.
  const shouted = 'HTTPS://KPROLRCHULDGFRZSPTHY.SUPABASE.CO';
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: shouted }).kind, 'refused');
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: shouted, [DECLARATION]: HOSTED_STAGING }).kind, 'refused');
  assert.match(configuredTarget({ VITE_SUPABASE_URL: shouted, [DECLARATION]: HOSTED_STAGING }).reason, /PRODUCTION project/);
  // And the other direction: a local stack shouted at is still a local stack.
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'HTTP://LOCALHOST:54321' }).kind, 'local');
});

test("the deployed site's own suite declares itself, and may not carry an admin key", () => {
  // playwright.production.config.ts shares e2e/configured/ as its directory, so collecting it
  // imports _helpers.ts; its URL is the deployed site on purpose and it writes nothing.
  assert.equal(configuredTarget({ [DECLARATION]: DEPLOYED_SITE, PRODUCTION_URL: 'https://noacg.studio' }).kind, DEPLOYED_SITE);
  const withKey = configuredTarget({ [DECLARATION]: DEPLOYED_SITE, SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role' });
  assert.equal(withKey.kind, 'refused');
  assert.match(withKey.reason, /Unset it/);
  assert.doesNotMatch(withKey.reason, /fake-service-role/);
});

test('the writing suite does not accept the deployed-site declaration, whoever set it', () => {
  // The guard module admits it; the configured suite's own globalSetup then refuses it, so a
  // shell that exports that word cannot point a signing-in, row-writing run at a hosted project.
  const guard = file('e2e/_configured-guard.ts');
  assert.match(guard, /target\.kind === DEPLOYED_SITE/);
  assert.match(guard, /throw new Error\(/);
});

test('the live config carries the file keys the guard reads, not only the ones a spec reads', () => {
  // A backend left only in the environment file is live for the api/ half (the Vite server copies
  // it in) and invisible to a guard that reads process.env - so the config must backfill both
  // spellings of the URL before the guard runs.
  const config = file('playwright.live.config.ts');
  const backfilled = config.slice(config.indexOf('for (const key of ['), config.indexOf('if (!process.env[key]'));
  for (const name of ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']) {
    assert.ok(backfilled.includes(`'${name}'`), `${name} is checked by the guard but not loaded from the environment file`);
  }
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
  // And the deployed site's suite, which declares itself in the config rather than in a shell.
  assert.match(file('playwright.production.config.ts'), /process\.env\[DECLARATION\] \?\?= DEPLOYED_SITE;/);
});
