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
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertConfiguredTarget, configuredTarget, DECLARATION, describeTarget, HOSTED_STAGING, isLocalStackUrl, KEY_VARS, localStackEnv, requireLocalStack, servedTarget, URL_VARS } from './configured-target.mjs';
import { DEFAULT_STAGING_REF } from './supabase-projects.mjs';

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

test('the staging declaration admits the staging project, not merely "not production"', () => {
  // A rotated or mistyped STAGING_SUPABASE_URL is somebody else's database, and the suite deletes
  // rows. The declaration names one project - the one scripts/supabase-projects.mjs already names.
  const elsewhere = { ...CLOUD_WORKER, VITE_SUPABASE_URL: 'https://someotherproject00.supabase.co', [DECLARATION]: HOSTED_STAGING };
  assert.equal(configuredTarget(elsewhere).kind, 'refused');
  assert.match(configuredTarget(elsewhere).reason, /admits the staging project only/);
  // And a fork that keeps its own staging project says so the way the rest of the repo does -
  // including when its secret carries a newline or capitals, which a hostname does not care about.
  assert.equal(configuredTarget({ ...elsewhere, STAGING_SUPABASE_PROJECT_REF: 'someotherproject00' }).kind, HOSTED_STAGING);
  assert.equal(configuredTarget({ ...elsewhere, STAGING_SUPABASE_PROJECT_REF: ' SomeOtherProject00\n' }).kind, HOSTED_STAGING);
});

test('the staging project is the WHOLE host, not a string the URL happens to contain', () => {
  // The rule compares `<ref>.supabase.co` against the host. A substring test would admit each of
  // these, and the declaration is the one door that lets a writing run reach a hosted project at
  // all - so each shape gets its own case, and reverting the comparison turns this red.
  const declared = (url) => configuredTarget({ VITE_SUPABASE_URL: url, [DECLARATION]: HOSTED_STAGING });
  for (const url of [
    `https://${DEFAULT_STAGING_REF}.supabase.co.evil.example`, // a longer host that starts with it
    `https://${DEFAULT_STAGING_REF}.evil.example`, // the ref as somebody else's subdomain
    `https://db.${DEFAULT_STAGING_REF}.supabase.co`, // a host that ends with it
    `https://evil.example/${DEFAULT_STAGING_REF}.supabase.co`, // the ref in the path
    `https://evil.example/?to=${DEFAULT_STAGING_REF}.supabase.co`, // and in a query
    `https://${DEFAULT_STAGING_REF}.supabase.co@evil.example`, // and as a username
  ]) {
    assert.equal(declared(url).kind, 'refused', url);
  }
  // The real project, however it is written: bare, with a path, with a port, shouted.
  for (const url of [
    `https://${DEFAULT_STAGING_REF}.supabase.co`,
    `https://${DEFAULT_STAGING_REF}.supabase.co/rest/v1`,
    `https://${DEFAULT_STAGING_REF}.supabase.co:443`,
    `HTTPS://${DEFAULT_STAGING_REF.toUpperCase()}.SUPABASE.CO`,
  ]) {
    assert.equal(declared(url).kind, HOSTED_STAGING, url);
  }
});

test('hosted staging runs only when it says so, and never at the production ref', () => {
  const staging = { ...CLOUD_WORKER, VITE_SUPABASE_URL: `https://${DEFAULT_STAGING_REF}.supabase.co` };
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

test('a message names the variable and the HOST, never the whole value', () => {
  // A hostname is public. The rest of a URL is not necessarily: it can carry a password, and the
  // staging URL is a GitHub secret, which a log masks only on an exact match - so a folded or
  // trimmed copy of it would print in the clear.
  assert.equal(describeTarget(configuredTarget(LOCAL_STACK)), 'local: VITE_SUPABASE_URL=127.0.0.1:54321');
  assert.doesNotMatch(describeTarget(configuredTarget(LOCAL_STACK)), /fake-service-role/);
  const withPassword = configuredTarget({ VITE_SUPABASE_URL: 'https://someone:hunter2@db.example.com/rest' });
  assert.equal(withPassword.kind, 'refused');
  assert.doesNotMatch(withPassword.reason, /hunter2|someone/);
  assert.match(withPassword.reason, /db\.example\.com/);
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

test("the deployed site's own suite ends up with no backend rather than a word that means 'do not check'", () => {
  // playwright.production.config.ts shares e2e/configured/ as its directory, so collecting it
  // imports _helpers.ts. It is anonymous and writes nothing, and it says so by unsetting the
  // backend variables for its own process - which this rule then reads as `unconfigured`.
  const config = file('playwright.production.config.ts');
  assert.match(config, /for \(const name of \[\.\.\.URL_VARS, \.\.\.KEY_VARS\]\) delete process\.env\[name\];/);
  const after = { ...CLOUD_WORKER };
  for (const name of [...URL_VARS, ...KEY_VARS]) delete after[name];
  assert.equal(configuredTarget(after).kind, 'unconfigured');
  // And no word admits a hosted backend except the staging declaration.
  assert.equal(configuredTarget({ ...CLOUD_WORKER, [DECLARATION]: 'deployed-site' }).kind, 'refused');
});

test('the dev server is the run\'s own, and what it serves is judged too', () => {
  // A dev server has two halves that reach a database: the page, built against its
  // VITE_SUPABASE_URL, and the api/ handlers it mounts, which read SUPABASE_URL and an admin key
  // (production-data-key.spec.ts drives them in process). The page's half can be read back out;
  // the server's own half cannot, from outside. So the suite starts its own server - both halves
  // then inherit the environment the run was admitted on - and the page is read back anyway,
  // because Vite fills anything missing from this process out of the environment file.
  assert.match(file('playwright.live.config.ts'), /reuseExistingServer: false,/);
  const guard = file('e2e/_configured-guard.ts');
  assert.match(guard, /_env-probe\.ts/);
  assert.match(guard, /servedTarget\(served, process\.env\)/);
});

test('with nothing listening, the guard says so loudly - and probes the origin it was handed', async (t) => {
  // A local stack in this process, so the guard reaches the probe rather than refusing first.
  const before = { ...process.env };
  for (const name of [...URL_VARS, ...KEY_VARS]) delete process.env[name];
  process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  t.after(() => {
    for (const name of [...URL_VARS, ...KEY_VARS]) delete process.env[name];
    Object.assign(process.env, before);
  });
  // RUN, not read. The two things this proves are the ones a source-text match cannot: that the
  // probe's origin comes from the config Playwright loaded (the measurement harness with
  // MEASURE_BUILD=prod serves on a port of its own), and that the one case the probe cannot judge
  // is a named, loud skip rather than a cheerful pass. Port 1 is closed, so `servedBackend`
  // returns before it launches a browser: no server, no Chromium, milliseconds.
  const guard = (await import(path.join(ROOT, 'e2e/_configured-guard.ts'))).default;
  const warned = [];
  const logged = [];
  const { warn, log } = console;
  console.warn = (message) => warned.push(String(message));
  console.log = (message) => logged.push(String(message));
  try {
    await guard({ projects: [{ use: { baseURL: 'http://127.0.0.1:1' } }] });
  } finally {
    Object.assign(console, { warn, log });
  }
  // A warning, not a log line: in a shard's output an ordinary log reads as a pass.
  assert.deepEqual(logged, []);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /WHAT THE SERVER SERVES WAS NOT CHECKED/);
  // The origin it was HANDED, not this suite's usual port.
  assert.match(warned[0], /nothing answered at http:\/\/127\.0\.0\.1:1\b/);
  // And it still reports the environment it did judge.
  assert.match(warned[0], /local: VITE_SUPABASE_URL=127\.0\.0\.1:54321/);
});

test('a configured spec reads the backend through the guarded helper, not around it', () => {
  // _helpers.ts is where the check sits, so a spec that reads a backend variable of its own would
  // walk past it. (analytics.spec.ts reads VITE_SUPABASE_URL to gate itself and imports no
  // helper; it stubs its network and writes nothing, so it is listed here rather than silently
  // allowed.) The globalSetup covers every RUN; this keeps the second line honest.
  const allowed = new Set(['analytics.spec.ts']);
  const offenders = globSync('*.spec.ts', { cwd: path.join(ROOT, 'e2e/configured') })
    .filter((name) => !allowed.has(name))
    .filter((name) => {
      const text = file(path.join('e2e/configured', name));
      return /process\.env\.(VITE_)?SUPABASE_URL/.test(text) && !/from '\.\/_helpers'/.test(text);
    });
  assert.deepEqual(offenders, [], 'these specs read a backend URL without importing the guarded helper');
});

test('what the page serves is judged by the same rule, in THIS environment', () => {
  // Leg 2 of the model, tested without a server: `servedTarget` is what the guard calls once it
  // has read the page, so the judgement is exercised here rather than only described there.
  const local = { ...LOCAL_STACK };
  assert.equal(servedTarget('http://127.0.0.1:54321', local).kind, 'local');
  // A run admitted on a local environment, whose page is built against production: refused.
  const smuggled = servedTarget('https://kprolrchuldgfrzspthy.supabase.co', local);
  assert.equal(smuggled.kind, 'refused');
  assert.match(smuggled.reason, /PRODUCTION project/);
  // Any other hosted project too, and the admin key is named, never shown.
  const elsewhere = servedTarget('https://someotherproject00.supabase.co', local);
  assert.equal(elsewhere.kind, 'refused');
  assert.doesNotMatch(elsewhere.reason, /fake-service-role/);
  // Built by replacement, so a fork's own staging project is carried through rather than dropped.
  const fork = { ...LOCAL_STACK, [DECLARATION]: HOSTED_STAGING, STAGING_SUPABASE_PROJECT_REF: 'someotherproject00' };
  assert.equal(servedTarget('https://someotherproject00.supabase.co', fork).kind, HOSTED_STAGING);
  // And this process's own SUPABASE_URL cannot vouch for a page that serves something else.
  assert.equal(servedTarget('https://someotherproject00.supabase.co', { ...local, SUPABASE_URL: 'http://127.0.0.1:54321' }).kind, 'refused');
});

test('a run that mints a local stack pins every variable the rule reads', () => {
  // The wrappers each pinned the ones they thought of and spread the rest of the environment,
  // which on a cloud worker is production - and api/_lib prefers SUPABASE_URL and
  // SUPABASE_SECRET_KEY over the spellings the browser uses.
  const pinned = localStackEnv({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'fake-anon', SERVICE_ROLE_KEY: 'fake-service-role' });
  for (const name of [...URL_VARS, ...KEY_VARS]) assert.ok(name in pinned, `${name} is read by the rule but not pinned`);
  assert.equal(configuredTarget({ ...CLOUD_WORKER, ...pinned }).kind, 'local');
  for (const name of ['scripts/configured-trial.mjs', 'scripts/endurance-election.mjs', 'scripts/editor-projects-qualification.mjs']) {
    assert.match(file(name), /\.\.\.localStackEnv\(stack\)/, name);
  }
});

test('a run that writes from its first step needs a local stack, not merely no refusal', () => {
  // "No backend named here" is an answer the configured suite can take - its specs skip without
  // credentials and its verdict refuses a run that executed nothing. The endurance walks cannot:
  // they sign in and delete the account's productions before they build an admin client, and the
  // server they start fills what this process left unset out of the environment file.
  assert.throws(() => requireLocalStack({}, 'the endurance walk'), /needs a local Supabase stack of its own/);
  assert.throws(() => requireLocalStack({}, 'the endurance walk'), /no backend at all/);
  assert.throws(
    () => requireLocalStack({ VITE_SUPABASE_URL: `https://${DEFAULT_STAGING_REF}.supabase.co`, [DECLARATION]: HOSTED_STAGING }, 'the endurance walk'),
    /needs a local Supabase stack/,
  );
  // A half-named environment is the same fault in either direction: each half of the run reads
  // its own variable, and the one left unset is filled from the environment file by the Vite
  // server. LOCAL_STACK names only the browser's, so it is refused here although the configured
  // suite would admit it.
  assert.throws(() => requireLocalStack(LOCAL_STACK, 'the endurance walk'), /SUPABASE_URL must name the local stack too/);
  assert.throws(
    () => requireLocalStack({ SUPABASE_URL: 'http://127.0.0.1:54321', E2E_EMAIL: 'a@b.c', E2E_PASSWORD: 'x' }, 'the endurance walk'),
    /VITE_SUPABASE_URL must name the local stack too/,
  );
  const whole = { ...LOCAL_STACK, ...localStackEnv({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'fake-anon', SERVICE_ROLE_KEY: 'fake-service-role' }) };
  assert.equal(requireLocalStack(whole, 'the endurance walk').kind, 'local');
  // And it is what both endurance configs ask for.
  for (const config of ['playwright.endurance.config.ts', 'e2e/endurance/editor-projects.config.ts']) {
    assert.match(file(config), /requireLocalStack\(process\.env/, config);
  }
});

test('the one local-stack test is the one every local-stack run uses', () => {
  assert.equal(isLocalStackUrl('http://127.0.0.1:54321'), true);
  assert.equal(isLocalStackUrl('HTTP://LOCALHOST:54321'), true);
  assert.equal(isLocalStackUrl('http://localhost'), false);
  assert.equal(isLocalStackUrl(undefined), false);
  // The endurance runs asked the same question with weaker patterns of their own, over one
  // variable. They ask the whole rule now: their dev servers mount the api/ handlers too.
  for (const config of ['playwright.endurance.config.ts', 'e2e/endurance/editor-projects.config.ts']) {
    assert.match(file(config), /requireLocalStack\(process\.env/, config);
    assert.doesNotMatch(file(config), /isLocalStackUrl/, config);
  }
  // And the connector spike's production denylist is this module's, not a second copy.
  assert.match(file('scripts/connector-oauth-spike.mjs'), /import \{ NEVER_REFS \} from '\.\/configured-target\.mjs';/);
});

test('the live config carries the file keys the guard reads, not only the ones a spec reads', () => {
  // A backend left only in the environment file is live for the api/ half (the Vite server copies
  // it in) and invisible to a guard that reads process.env - so the config must backfill both
  // spellings of the URL before the guard runs.
  const config = file('playwright.live.config.ts');
  const backfilled = config.slice(config.indexOf('for (const key of ['), config.indexOf('if (!process.env[key]'));
  for (const name of ['VITE_SUPABASE_URL', 'SUPABASE_URL']) {
    assert.ok(backfilled.includes(`'${name}'`), `${name} is checked by the guard but not loaded from the environment file`);
  }
  // And no key is loaded for the guard's sake: no key changes the verdict, only the wording of a
  // refusal, so loading one would put an admin credential in the runner to buy a better sentence.
  assert.ok(!backfilled.includes("'SUPABASE_SECRET_KEY'"), 'the config must not load an admin key for the guard');
});

test('every config that spreads the live one still loads, and finds the guard', () => {
  // THE FAULT THIS REPLACES A SPELLING-MATCH WITH. Playwright resolves `globalSetup` against the
  // directory of the config file it loaded, so a repo-relative string travels into a config that
  // lives in another folder and resolves against THAT folder: e2e/configured/measure/
  // measure.config.ts died at load with "Cannot find module ./e2e/_configured-guard.ts", before
  // reading a file, and nothing in CI loads it to say so. An absolute path is the fix, and this
  // is the check that notices either way - including for a config added later.
  const spreading = globSync('**/*.config.ts', { cwd: ROOT, exclude: ['node_modules/**', 'dist/**'] })
    .filter((name) => /playwright\.live\.config/.test(file(name)));
  // The live config itself, the instrument config, the measurement harness: if this list ever
  // shrinks, the filter above stopped finding configs rather than the configs going away.
  assert.ok(spreading.length >= 2, `expected configs spreading the live config, found ${spreading.join(', ') || 'none'}`);

  for (const name of [...spreading, 'playwright.live.config.ts']) {
    const listed = spawnSync('npx', ['playwright', 'test', '--config', name, '--list'], {
      cwd: ROOT,
      encoding: 'utf8',
      // A local stack's URL: the guard admits it, so a refusal cannot be mistaken for a config
      // that will not load. `--list` runs no test and starts no server.
      env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '' },
      windowsHide: true,
    });
    const output = `${listed.stdout}${listed.stderr}`;
    assert.doesNotMatch(output, /Cannot find module/, `${name} does not load: ${output.slice(0, 400)}`);
    assert.doesNotMatch(output, /Refusing to start/, `${name} refused a local stack: ${output.slice(0, 400)}`);
  }
});

test('the guard is wired to every configured run and to the specs themselves', () => {
  // A guard nothing calls is the failure this test exists for.
  const config = file('playwright.live.config.ts');
  // Absolute, because the path travels into configs in other folders - see the test above.
  assert.match(config, /globalSetup: fileURLToPath\(new URL\('\.\/e2e\/_configured-guard\.ts', import\.meta\.url\)\)/);
  assert.ok(existsSync(path.join(ROOT, 'e2e/_configured-guard.ts')), 'the guard the config names must exist');
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
