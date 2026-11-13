// guards: scripts/configured-target.mjs, e2e/_configured-guard.ts, e2e/configured/_helpers.ts, playwright.live.config.ts, scripts/ograf-walk-common.mjs, .github/workflows/hosted-latency.yml
//
// THE REFUSAL THAT KEEPS A CONFIGURED RUN OFF PRODUCTION (issue #2495), pinned from both ends:
// the rule itself, and the wiring that makes a run actually meet it. The wiring half is the half
// that rots - a guard nothing calls reads exactly like a guard that works - so the globalSetup
// line in the live config, the import in the specs' shared helper and the declaration in
// hosted-latency.yml are each read off disk here.
//
// A SOURCE-TEXT ASSERTION IS A WIRING CHECK AND IS NEVER THE TEST FOR A BEHAVIOUR. It cannot go
// red when the behaviour is reverted unless the behaviour happens to be a spelling, and twice in
// this change's review a behaviour shipped with nothing but one of these behind it. Every rule
// below is pinned by CALLING it, and the call is checked by reverting the line it tests.
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
  // Where the authority ENDS, as well as where it begins. A loopback host and port in the
  // userinfo of somewhere else reads as local to a prefix match, and as evil.example to the URL
  // parser the client uses - the same disagreement the staging comparison is pinned against.
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'http://localhost:54321@evil.example/rest/v1' }).kind, 'refused');
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'https://localhost.example.com:443' }).kind, 'refused');
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'http://127.0.0.1.example.com:54321' }).kind, 'refused');
  // The stack has to be where the URL BEGINS. The two above fail an unanchored pattern as well,
  // for the wrong reason, so these are the cases that pin the anchor: a loopback address carried
  // in a query or a fragment of somewhere else reads as local without it.
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'https://evil.example/?u=http://127.0.0.1:54321/' }).kind, 'refused');
  assert.equal(configuredTarget({ VITE_SUPABASE_URL: 'https://someotherproject00.supabase.co/#http://localhost:54321/' }).kind, 'refused');
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
  assert.match(config, /for \(const name of \[\.\.\.URL_VARS, \.\.\.KEY_VARS, DECLARATION\]\) delete process\.env\[name\];/);
  // The declaration goes with them: "hosted-staging, and no backend URL" is a refusal, not an
  // absence, and the suite that owns no backend would abort over a project it never touches.
  const after = { ...CLOUD_WORKER, [DECLARATION]: HOSTED_STAGING };
  for (const name of [...URL_VARS, ...KEY_VARS, DECLARATION]) delete after[name];
  assert.equal(configuredTarget(after).kind, 'unconfigured');
  // And no word admits a hosted backend except the staging declaration.
  assert.equal(configuredTarget({ ...CLOUD_WORKER, [DECLARATION]: 'deployed-site' }).kind, 'refused');
});

test('the dev server is the run\'s own, and what it serves is judged too', () => {
  // A dev server has two halves that reach a database: the page, built against its
  // VITE_SUPABASE_URL, and the api/ handlers it mounts, which read SUPABASE_URL and an admin key
  // (feed-route.spec.ts and production-data-key-tick.spec.ts import one and run it in the
  // worker; other specs reach the server's own over HTTP). The page's half can be read back out;
  // the server's own half cannot, from outside. So the suite starts its own server - both halves
  // then inherit the environment the run was admitted on - and the page is read back anyway,
  // because Vite fills anything missing from this process out of the environment file.
  assert.match(file('playwright.live.config.ts'), /reuseExistingServer: false,/);
  const guard = file('e2e/_configured-guard.ts');
  assert.match(guard, /_env-probe\.ts/);
  assert.match(guard, /servedTarget\(served, process\.env\)/);
});

test('the guard refuses the incident environment before it probes anything', async (t) => {
  // LEG 1, RUN. The guard's own call was pinned by matching its source text, so swallowing it and
  // carrying on left every test green - the third time in this change's review that a behaviour
  // shipped with nothing but a spelling behind it, and this one is the primary line of defence.
  // No server is needed: leg 1 throws before the probe, which the closed port below establishes.
  const before = { ...process.env };
  for (const name of [...URL_VARS, ...KEY_VARS]) delete process.env[name];
  Object.assign(process.env, CLOUD_WORKER);
  // Restored by DIFFERENCE, not by overwrite: CLOUD_WORKER carries E2E_EMAIL and E2E_PASSWORD,
  // which an assign cannot remove, and leaking credential-shaped values into the child processes
  // the later tests spawn is the thing this file is about.
  t.after(() => {
    for (const name of Object.keys(CLOUD_WORKER)) delete process.env[name];
    Object.assign(process.env, before);
  });
  const guard = (await import(path.join(ROOT, 'e2e/_configured-guard.ts'))).default;
  // Port 1 is closed, which is what makes a rejection here leg 1's: reaching the probe returns
  // the skip rather than throwing.
  await assert.rejects(
    () => guard({ projects: [{ use: { baseURL: 'http://127.0.0.1:1' } }] }),
    /Refusing to start the configured suite\..*PRODUCTION project/s,
  );
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
  // Nor the other way round: the page is judged ALONE, so both URL spellings are replaced rather
  // than merged. Under the staging declaration a local page beside a staging SUPABASE_URL would
  // otherwise be judged as a pair and refused for naming two projects - the page is local, and
  // that is the whole question here. Stop blanking the other spelling and this goes red.
  const declared = { ...LOCAL_STACK, [DECLARATION]: HOSTED_STAGING, SUPABASE_URL: `https://${DEFAULT_STAGING_REF}.supabase.co` };
  assert.equal(servedTarget('http://127.0.0.1:54321', declared).kind, 'local');
});

test('the walks\' own dev server pins every backend variable the rule reads', async () => {
  // THE THIRD SUITE SERVER. The two offline Playwright configs pin their server's backend empty;
  // the ograf walks start one themselves and pinned only the browser's pair, so the api/ handlers
  // it mounts kept whatever the shell held - the same defect, one directory over, and nothing
  // would have failed if it had stayed. (Not the last server in the repository to spread this
  // process's environment: scripts/ai-bench-server.mjs and scripts/ai-lite-compare.mjs do too,
  // and neither is a configured or e2e run - the second signs the account in on purpose.)
  //
  // The whole env the spawn is given is built here, under a production-shaped environment, rather
  // than read off the constant or matched in the source: the ORDER is the behaviour, and a
  // reversed spread leaves every name in place and every pin dead.
  const { walkServerEnv } = await import('./ograf-walk-common.mjs');
  const served = walkServerEnv(CLOUD_WORKER);
  for (const name of [...URL_VARS, ...KEY_VARS]) {
    assert.equal(served[name], '', `${name} is read by the rule and reaches the walks' server`);
  }
  // And it is the walk's server that gets it.
  assert.match(file('scripts/ograf-walk-common.mjs'), /env: walkServerEnv\(\),/);
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

test('URL_VARS names every backend URL this repository reads from the environment', () => {
  // THE ONE HAND-WRITTEN SET LEFT IN THE RULE. Everything else the rule decides is derived, but
  // URL_VARS is a list, and a list goes stale silently: a third spelling added later would be a
  // backend the guard never looks at, which is exactly the hole issue #2495 is about. So the
  // spellings are read back off the source instead of trusted - an env READ, not a mention, so a
  // name in a comment or a refusal message does not count.
  const sources = globSync(
    ['api/**/*.{ts,tsx,mjs,js}', 'src/**/*.{ts,tsx}', 'scripts/**/*.mjs', 'e2e/**/*.ts', 'vite.config.ts', 'playwright*.config.ts'],
    { cwd: ROOT, exclude: ['**/node_modules/**', '**/dist/**'] },
  );
  const read = /(?:process\.env|import\.meta\.env|\benv)\s*(?:\.\s*([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])/g;
  const spellings = new Map();
  for (const name of sources) {
    for (const match of file(name).matchAll(read)) {
      const variable = match[1] ?? match[2];
      if (!/SUPABASE/.test(variable) || !/URL$/.test(variable)) continue;
      if (!spellings.has(variable)) spellings.set(variable, name);
    }
  }
  // A scanner that found nothing would pass the loop below without reading anything: these two
  // are read in this repository today, so finding fewer means the scan broke, not that the
  // spellings went away.
  assert.ok(sources.length > 100, `expected the source tree, scanned ${sources.length} files`);
  for (const known of URL_VARS) assert.ok(spellings.has(known), `${known} is in URL_VARS but nothing reads it: the scan is broken`);
  for (const [variable, where] of spellings) {
    assert.ok(URL_VARS.includes(variable), `${where} reads ${variable}, a backend URL the rule in configured-target.mjs never looks at`);
  }
});

test('the configs that must refuse a backend they do not own actually refuse it, at load', async () => {
  // The rule is pinned above; this is the WIRING that makes a walk meet it. Swallow the throw in
  // either config and the rule's own cases stay green. Each config is IMPORTED on its own, in a
  // child process with a fake hosted backend: on its own, because running the walk's specs would
  // also meet the helper's refusal and a config that had stopped refusing would look fine. The
  // import starts nothing - these configs build a server command, they do not run it.
  for (const [config, what] of [
    ['playwright.endurance.config.ts', 'the endurance walk'],
    ['e2e/endurance/editor-projects.config.ts', 'the isolated persistence qualification'],
  ]) {
    const loaded = spawnSync(
      process.execPath,
      ['--no-warnings', '-e', `import(${JSON.stringify(`./${config}`)}).then(() => process.exit(0), (error) => { console.log(error.message); process.exit(3); })`],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, VITE_SUPABASE_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role', SUPABASE_SECRET_KEY: '' },
        windowsHide: true,
      },
    );
    const output = `${loaded.stdout}${loaded.stderr}`;
    assert.equal(loaded.status, 3, `${config} loaded a backend it does not own: ${output.slice(0, 400)}`);
    assert.match(output, new RegExp(`Refusing to start ${what}`), output.slice(0, 400));
  }
});

test('the suite with no backend still lists under an environment that names one', () => {
  // playwright.production.config.ts measures the DEPLOYED site and writes nothing, but it shares
  // e2e/configured/ as its directory, so Playwright parses those spec files to resolve its grep
  // and reaches the helper's refusal. Its answer is to hold no backend at all; this is that answer
  // exercised rather than simulated, under the environment that would otherwise stop it.
  // The declaration is in the environment too: it is what `hosted-latency.yml` exports, and a
  // shell reproducing that job carries it. Left standing it says "hosted-staging, and no backend
  // URL", which the rule refuses rather than reading as no backend at all.
  const listed = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.production.config.ts', '--list'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...CLOUD_WORKER, [DECLARATION]: HOSTED_STAGING },
    windowsHide: true,
  });
  const output = `${listed.stdout}${listed.stderr}`;
  assert.doesNotMatch(output, /Refusing to start/, `the production suite refused: ${output.slice(0, 400)}`);
  assert.match(output, /@production/);
  assert.equal(listed.status, 0, output.slice(0, 400));
});

test('the configured suite itself refuses the incident environment, collecting a spec file', () => {
  // THE SECOND LINE OF DEFENCE, RUN. Both of the live suite's own pins - the globalSetup line in
  // the config and the assertion in the module that hands out the admin key - were source text,
  // and text cannot see either swallowed. A spec file is reachable without the globalSetup (a
  // one-off `npx playwright test <file>`, another config), which is why the helper checks too, so
  // the one that matters is pinned by the invocation that reaches both: `--list` collects every
  // spec in the directory, which imports the helper, and runs no test and starts no server.
  const listed = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.live.config.ts', '--list'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...CLOUD_WORKER },
    windowsHide: true,
  });
  const output = `${listed.stdout}${listed.stderr}`;
  // `a configured spec` is the helper's own wording, used at one call site: a refusal from the
  // config's globalSetup, or from anywhere else, says something different.
  assert.match(output, /Refusing to start a configured spec/, output.slice(0, 400));
  assert.match(output, /PRODUCTION project/, output.slice(0, 400));
  assert.notEqual(listed.status, 0, `the suite listed under a production environment: ${output.slice(0, 400)}`);
});
