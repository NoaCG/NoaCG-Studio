// guards: src/control/vmixSetup.ts, src/control/playoutLink.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { act, actVmix, finishCasparAllOut, PLAYOUT_DEFAULTS, readVmixOverlays, testVmix } = await import('../src/control/playoutLink.ts');
const { changeVmixOutput, readVmixOutput, vmixOverlay } = await import('../src/control/vmixSetup.ts');

const settings = { ...PLAYOUT_DEFAULTS, agentToken: 'fixture-token', vmix: { overlay: 3 } };
const choice = { settings, url: 'http://127.0.0.1:5284/output?production=owned', title: 'News' };
const health = { ok: true, agent: 'noacg-bridge', v: 2, version: '0.11.0', adapters: ['casparcg', 'vmix'], features: ['vmix-output-key'] };
const ok = { ok: true, v: 2 };
const vmix = { version: '29.0.0.49', edition: 'Trial', overlays: 8, inputs: 2 };
const status = { ...ok, vmix, version: vmix.version, raw: 'VERSION OK', capabilities: ['state'] };
const connected = { ...status, servers: [] };
const acted = { ...ok, raw: 'FUNCTION OK', session: 'fixture', generation: 1 };
const scoped = (rows = {}, info = vmix, loadProblem) => ({
  ...ok, vmix: info, session: 'fixture', observedAt: 1, linked: [], loadProblem,
  overlays: Array.from({ length: info.overlays }, (_, i) => ({ overlay: i + 1, ownsOutput: false, ...rows[i + 1] })),
});
const occupied = { key: '1a111111-aaaa-41aa-8aaa-aaaaaaaaaaaa', number: 1, type: 'Image', title: 'Sponsor' };
const browser = { key: '2b222222-bbbb-42bb-8bbb-bbbbbbbbbbbb', number: 2, type: 'Browser', title: 'NoaCG News' };
const load = { verb: 'take' };
const outOn3 = { verb: 'out', overlay: 3, inputKey: browser.key };
const unload = { verb: 'out', slot: { adapter: 'vmix', overlay: 3 }, item: { kind: 'url', name: choice.url, label: choice.title } };

test('the output uses the highest overlay only when no valid choice fits this vMix', () => {
  assert.equal(vmixOverlay(PLAYOUT_DEFAULTS, 8), 8);
  assert.equal(vmixOverlay(settings, 4), 3);
  assert.equal(vmixOverlay(settings, 1), 1);
});

test('an invalid Bridge health reply does not disprove vMix support', async (t) => {
  let body = null;
  let statusCode;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).pathname, '/health');
    return Response.json(body, { status: statusCode });
  });
  for ([statusCode, body] of [
    [200, null], [200, { ...health, adapters: null }], [200, { ...health, adapters: [1] }],
    [503, { agent: 'noacg-bridge' }], [200, { ...health, v: '2' }],
    [200, { ...health, ok: false, adapters: [] }], [200, { ...health, v: 3 }],
    [200, { ...health, features: ['vmix-output-key', 2] }], [200, { ...health, features: null }],
    [200, { ...health, adapters: [], features: ['vmix-output-key', 2] }],
    [200, { ...health, adapters: ['casparcg'] }],
    [200, { ...health, version: null }],
    [200, { ...health, version: undefined, adapters: ['casparcg'], features: [] }],
    [200, { ...health, error: { hop: 'agent', code: 'refused', detail: 'Refused.' } }],
    [200, { ...health, generation: 3 }],
    [200, { ...health, token: 'not-a-health-field' }],
  ]) {
    const connection = await testVmix(settings);
    assert.equal(connection.supported, undefined);
    assert.equal(connection.result.state, 'bridge');
    const act = await actVmix(settings, () => ({ verb: 'out', slot: { adapter: 'vmix', overlay: 3 }, item: { kind: 'url', name: choice.url, label: choice.title } }));
    assert.equal(act.state, 'bridge');
  }
  body = { ...health, adapters: ['casparcg'], features: ['future-feature'] };
  assert.equal((await testVmix(settings)).supported, false);
  body = { ok: true, agent: 'noacg-caspar', v: 1 };
  const legacy = await testVmix(settings);
  assert.equal(legacy.supported, false);
  assert.equal(legacy.result.state, 'outdated');
});

test('vMix replacement requires the exact confirmed overlay and input before dispatch', async (t) => {
  const actions = [];
  let held = occupied;
  let current = choice;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json(scoped({ 3: { input: held } }));
    assert.equal(path, '/act');
    assert.equal(options.headers.authorization, 'Bearer vmix-output-key:fixture-token');
    actions.push(JSON.parse(options.body));
    return Response.json(acted);
  });
  const { replace } = await changeVmixOutput(load, () => current);
  assert.equal(replace.input.key, occupied.key);
  assert.deepEqual(actions, []);

  held = { ...held, key: '2b222222-bbbb-42bb-8bbb-bbbbbbbbbbbb' };
  assert.match((await changeVmixOutput({ ...load, confirmed: replace }, () => current)).message, /input.*changed/);
  current = { ...choice, settings: { ...settings, vmix: { overlay: 4 } } };
  assert.match((await changeVmixOutput({ ...load, confirmed: replace }, () => current)).message, /setup changed/);
  assert.deepEqual(actions, []);

  held = { ...occupied, key: occupied.key.toUpperCase() };
  const upper = { ...replace, input: { ...replace.input, key: replace.input.key.toUpperCase() } };
  assert.equal((await changeVmixOutput({ ...load, confirmed: upper }, () => choice)).completed, true);
  assert.deepEqual(actions, [{
    target: { adapter: 'vmix' },
    action: {
      verb: 'take', slot: { adapter: 'vmix', overlay: 3 }, expectedOverlayInput: occupied.key,
      item: { kind: 'url', label: 'News', name: choice.url + '&name=vMix%20Overlay%203' },
    },
  }]);
});

test('manual Load stays on the displayed overlay while first Publish uses a fresh choice', async (t) => {
  let info;
  let current;
  const actions = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json({ ...status, vmix: info, version: info.version });
    if (path === '/state') return Response.json(scoped({}, info));
    assert.equal(path, '/act');
    actions.push(JSON.parse(options.body).action);
    return Response.json(acted);
  });
  for (const [displayed, selected, fresh] of [
    [8, 8, { ...vmix, version: '28.0.0.42', overlays: 4 }],
    [3, 2, vmix],
  ]) {
    info = fresh;
    current = { ...choice, settings: { ...settings, vmix: { overlay: selected } } };
    assert.match((await changeVmixOutput({ ...load, overlay: displayed }, () => current)).message, /overlay changed.*press Load again/);
  }
  assert.deepEqual(actions, []);

  info = { ...vmix, version: '28.0.0.42', overlays: 4 };
  current = { ...choice, settings: { ...settings, vmix: { overlay: 8 } } };
  assert.equal((await changeVmixOutput(load, () => current)).completed, true);
  assert.deepEqual(actions.map(action => action.slot.overlay), [4]);
});

test('a matched live Browser never verifies Load, even if Bridge omits the diagnostic', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json(scoped({ 3: { input: browser, ownsOutput: true } }));
    assert.fail('unexpected mutation ' + path);
  });
  assert.match((await changeVmixOutput(load, () => choice)).message, /cannot verify the current vMix Browser page/);
  assert.deepEqual(paths, ['/health', '/status', '/state']);
});

test('a stale vMix Browser listener prevents Load but leaves the owned overlay available to Unload', async (t) => {
  const loadProblem = 'This vMix Browser uses NoaCG Bridge port 8899.';
  const actions = [];
  let ownsOutput = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json(scoped({ 3: { input: browser, ownsOutput } }, vmix, loadProblem));
    assert.equal(path, '/act');
    actions.push(JSON.parse(options.body).action);
    return Response.json(acted);
  });
  assert.deepEqual(await changeVmixOutput(load, () => choice), { message: loadProblem });
  ownsOutput = false;
  assert.deepEqual(await changeVmixOutput(load, () => choice), { message: loadProblem });
  assert.deepEqual(actions, []);
  ownsOutput = true;
  await changeVmixOutput(outOn3, () => choice);
  assert.deepEqual(actions.map(action => [action.verb, action.slot, action.expectedOverlayInput]),
    [['out', { adapter: 'vmix', overlay: 3 }, browser.key]]);
});

test('Unload refuses if the Browser moved or changed after the click was offered', async (t) => {
  let reading;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json(reading);
    assert.fail('unexpected Unload ' + path);
  });
  for (reading of [
    scoped({ 4: { input: browser, ownsOutput: true } }),
    scoped({ 3: { input: { ...browser, key: occupied.key }, ownsOutput: true } }),
  ]) {
    const result = await changeVmixOutput(outOn3, () => choice);
    assert.match(result.message, /Browser on Overlay 3 changed/);
  }
});

test('switching adapters during the final health probe sends no vMix action', { timeout: 3000 }, async (t) => {
  const dispatchProbe = Promise.withResolvers();
  const releaseProbe = Promise.withResolvers();
  let healthReads = 0;
  let current = choice;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path === '/health') {
      if (++healthReads === 2) {
        dispatchProbe.resolve();
        await releaseProbe.promise;
      }
      return Response.json(health);
    }
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json(scoped());
    assert.fail('unexpected mutation ' + path);
  });
  const loading = changeVmixOutput(load, () => current);
  await dispatchProbe.promise;
  current = null;
  releaseProbe.resolve();
  assert.deepEqual(await loading, {});
});

test('a vMix adapter without keyed output actions offers Update and sends no mutation', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    return Response.json(path === '/health' ? { ...health, features: [] } : status);
  });
  assert.match((await changeVmixOutput(load, () => choice)).message, /Update NoaCG Bridge/);
  assert.deepEqual(paths, ['/health', '/status']);
});

test('vMix accepts only route-shaped replies and preserves typed failures', async (t) => {
  let reply;
  const savedWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://noacg.studio' } };
  t.after(() => { globalThis.window = savedWindow; });
  const calls = {
    '/status': async () => (await testVmix(settings)).result,
    '/connect': async () => (await testVmix(settings, true)).result,
    '/state': async () => (await readVmixOverlays(settings, choice.url)).result,
    '/act': async () => actVmix(settings, () => unload),
  };
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname === '/health') return Response.json({ ...health, features: [...health.features, 'future-feature'] });
    requests += 1;
    if (reply === 'lost') throw new Error('lost reply');
    return Response.json(reply[1], { status: reply[0] });
  });
  const successes = { '/status': status, '/connect': connected, '/state': scoped(), '/act': acted };
  const domainError = { hop: 'target', code: 'refused', detail: 'Refused.' };
  for (const [path, call] of Object.entries(calls)) {
    const contradictory = { ...successes[path], error: { hop: 'agent', code: 'usage', detail: 'Invalid request.' } };
    const falseCertainty = { ...successes[path], ok: false, error: domainError };
    const foreignField = path === '/act' ? { vmix } : { generation: 3 };
    for (reply of [
      [200, null], [200, { ok: 'false' }], [200, ok], [503, successes[path]], [200, contradictory],
      [200, falseCertainty], [401, successes[path]], [200, { ...successes[path], ...foreignField }],
    ]) {
      const before = requests;
      const result = await call();
      assert.equal(result.state, 'bridge', path);
      assert.match(result.detail, path === '/act' ? /result is unknown/ : /valid vMix reading/);
      if (path === '/act') assert.equal(result.unknownAction, true);
      assert.equal(requests, before + 1);
    }
    reply = [200, { ...successes[path], futureNote: { value: 'additive' } }];
    assert.equal((await call()).state, 'ok', path);
    for (const [hop, code, valid] of [
      ['target', 'refused', true],
      ['agent', 'usage', path === '/state' || path === '/act'],
      ['agent', 'unsupported', path === '/act'],
      ['target', 'uncertain', path === '/act'],
      ['target', 'not-found', false],
      ['target', 'no-media-scanner', false],
      ['agent', 'uncertain', false],
      ['agent', 'refused', false],
    ]) {
      const label = `${path} 200 ${hop}/${code}`;
      reply = [200, { ok: false, v: 2, error: { hop, code, detail: 'Domain reply.' }, futureField: 1 }];
      const result = await call();
      assert.equal(result.state, valid && hop === 'target' ? 'server' : 'bridge', label);
      assert.match(result.detail, valid ? /Domain reply/ : /valid vMix reading|result is unknown/, label);
      if (path === '/act') assert.equal(result.unknownAction, !valid || code === 'uncertain' ? true : undefined, label);
    }
    reply = [200, { ok: false, v: 2, error: { hop: 'target', code: 'unreachable', setup: 'not-running', detail: 'Start vMix.' } }];
    assert.equal((await call()).detail, 'Start vMix.', path);
    reply = [400, { ok: false, v: 2, error: { hop: 'agent', code: 'usage', detail: 'Invalid request.' } }];
    assert.match((await call()).detail, /Bridge refused the request: Invalid request/);
    reply = [502, { ok: false, v: 2, error: { hop: 'target', code: 'unreachable', detail: 'vMix did not answer.' } }];
    assert.equal((await call()).detail, 'vMix did not answer.', path);
    reply = [401, null];
    assert.equal((await call()).state, 'token', path);
    reply = [403, { ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: 'Invalid origin.' } }];
    assert.match((await call()).detail, /Bridge refused this site/);
  }
  reply = 'lost';
  assert.match((await calls['/act']()).detail, /lost reply.*result is unknown/);
});

test('vMix accepts known payload fields only on the route that sends them', async (t) => {
  // Inventory from the HTTP senders, including OGraf, pairing and the terminal's AMCP response.
  const payload = {
    agent: 'noacg-bridge', version: '0.11.0', adapters: ['vmix'], features: ['vmix-output-key'],
    vmix, raw: 'VERSION OK', capabilities: ['state'], servers: [], channels: [],
    channel: 1, session: 'fixture', link: 'fixture', observedAt: 1, slots: [],
    linked: [], overlays: [], loadProblem: 'Check the Browser.', generation: 1, warning: 'Warning.',
    instance: 'take-1', token: 'fixture', code: 202, expiresIn: 120, items: [], renderers: [],
    png: 'fixture', command: 'VERSION', status: '202 OK', lines: [],
  };
  const routes = [
    ['/health', health, () => testVmix(settings)],
    ['/status', status, () => testVmix(settings)],
    ['/connect', connected, () => testVmix(settings, true)],
    ['/state', scoped({}, vmix, payload.loadProblem), () => readVmixOverlays(settings, choice.url)],
    ['/act', { ...acted, warning: payload.warning, instance: payload.instance }, async () => ({ result: await actVmix(settings, () => unload) })],
  ];
  let paths;
  let active;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === active.path) return Response.json(active.body, { status: active.http });
    if (active.path === '/health' && path === '/status') return Response.json(status);
    assert.equal(path, '/health');
    return Response.json(health);
  });
  for (const [path, good, call] of routes) {
    const check = async (body, http, expected, label) => {
      active = { path, body, http };
      paths = [];
      const { result, supported } = await call();
      assert.equal(result.state, expected, label);
      if (path === '/health') assert.equal(supported, expected === 'ok' ? true : undefined, label);
      if (expected === 'bridge') {
        assert.match(result.detail, path === '/health' ? /capability response/ : path === '/act' ? /result is unknown/ : /valid vMix reading/, label);
        if (path === '/act') assert.equal(result.unknownAction, true, label);
      }
      const expectedPaths = path === '/health' || path === '/state' ? [path] : ['/health', path];
      if (path === '/health' && expected === 'ok') expectedPaths.push('/status');
      assert.deepEqual(paths, expectedPaths, label);
    };
    await check({ ...good, futureField: { anything: 'additive' } }, 200, 'ok', path);
    for (const [field, value] of Object.entries(payload)) {
      if (Object.hasOwn(good, field)) continue;
      for (const injected of [value, null]) {
        await check({ ...good, [field]: injected }, 200, 'bridge', `${path} success with ${field}=${JSON.stringify(injected)}`);
      }
    }
    await check({ ...good, error: null }, 200, 'bridge', `${path} success with an error`);
    if (path === '/health') continue;
    for (const [http, hop, code] of [
      [200, 'target', 'refused'], [400, 'agent', 'usage'], [401, 'agent', 'refused'],
      [403, 'agent', 'refused'], [502, 'target', 'unreachable'],
    ]) {
      const failure = { ok: false, v: 2, error: { hop, code, detail: 'Rejected.' } };
      for (const field of Object.keys(payload)) {
        await check({ ...failure, [field]: null }, http, 'bridge', `${path} ${http} failure with ${field}`);
      }
    }
  }
});

test('only unique decoded object names can grant authority to a vMix Bridge reply', async (t) => {
  const addMembers = (body, members) => JSON.stringify(body).slice(0, -1) + ',\n' + members + '}';
  let paths;
  let healthText = JSON.stringify(health);
  let reply;
  let http;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    return path === '/health' ? new Response(healthText) : new Response(reply, { status: http });
  });

  for (healthText of [
    JSON.stringify(health).replace('"adapters"', String.raw`"adapters":[],"ad\u0061pters"`),
    String.raw`{"agent":"noacg-bridge","ag\u0065nt":"noacg-caspar","ok":true,"v":1}`,
  ]) {
    paths = [];
    assert.equal((await testVmix(settings)).supported, undefined);
    assert.match((await actVmix(settings, () => unload)).detail, /valid playout capability response/);
    assert.deepEqual(paths, ['/health', '/health']);
  }

  healthText = JSON.stringify(health);
  http = 200;
  for (const [route, body, call] of [
    ['/status', status, () => testVmix(settings)],
    ['/connect', connected, () => testVmix(settings, true)],
    ['/state', scoped(), () => readVmixOverlays(settings, choice.url)],
  ]) {
    reply = addMembers(body, String.raw`"future":[{"\uD83C\uDFAC":1,"🎬":2}]`);
    paths = [];
    const result = await call();
    assert.equal(result.info, undefined, route);
    assert.match(result.result.detail, /valid vMix reading/, route);
    assert.deepEqual(paths, route === '/state' ? ['/state'] : ['/health', route]);
  }

  const success = JSON.stringify(acted);
  for ([http, reply] of [
    [200, success.replace('"ok"', '"ok":false,"ok"')],
    [200, addMembers(acted, String.raw`"future":{"constructor":1,"\u0063onstructor":2}`)],
    [200, addMembers(acted, String.raw`"future":{"__proto__":1,"__prot\u006f__":2}`)],
    [401, String.raw`{"ok":false,"v":2,"error":{"hop":"target","h\u006fp":"agent","code":"refused","detail":"Rejected."}}`],
  ]) {
    paths = [];
    const result = await actVmix(settings, () => unload);
    assert.equal(result.state, 'bridge');
    assert.equal(result.unknownAction, true);
    assert.match(result.detail, /result is unknown/);
    assert.deepEqual(paths, ['/health', '/act']);
  }

  // String values are opaque to the name check. Siblings, array entries and outer
  // objects can reuse a name, and deep unknown metadata is valid without recursion.
  const depth = 12_000;
  healthText = addMembers(health, String.raw`"future":{"description":"look like \"key\" : { } \\"}`);
  reply = addMembers(acted, String.raw`"\u0066uture":[{"same":1,"__proto__":true},{"same":{"same":3},"constructor":4}],"deep":`
    + '{"same":['.repeat(depth) + 'null' + ']}'.repeat(depth));
  http = 200;
  paths = [];
  assert.equal((await actVmix(settings, () => unload)).state, 'ok');
  assert.deepEqual(paths, ['/health', '/act']);

  // The shared generic reader retains its existing projection for other adapters.
  reply = success.replace('"ok"', '"ok":false,"ok"');
  const casparOut = { verb: 'out', slot: { adapter: 'casparcg', channel: 1, layer: 20 } };
  assert.equal((await act(settings, casparOut)).state, 'ok');
});

test('only genuine legacy health establishes that the Bridge is outdated for vMix', async (t) => {
  const legacy = { ok: true, agent: 'noacg-caspar', v: 1 };
  let body;
  let http = 200;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).pathname, '/health');
    return Response.json(body, { status: http });
  });
  for (body of [legacy, { ...legacy, futureField: 'additive' }]) {
    const connection = await testVmix(settings);
    assert.equal(connection.supported, false);
    assert.equal(connection.result.state, 'outdated');
    assert.equal((await actVmix(settings, () => unload)).state, 'outdated');
  }
  for (body of [
    { ...legacy, adapters: ['vmix'], features: ['vmix-output-key'], raw: 'route leakage' },
    { ...legacy, version: '0.1.0' }, { ...legacy, features: [] }, { ...legacy, expiresIn: null },
    { ...legacy, error: null }, { ...legacy, ok: false }, { ...legacy, v: '1' },
    { ...legacy, v: 2 }, { ...legacy, agent: 'noacg-bridge' },
  ]) {
    assert.equal((await testVmix(settings)).supported, undefined);
    assert.match((await actVmix(settings, () => unload)).detail, /valid playout capability response/);
  }
  body = legacy;
  http = 401;
  assert.equal((await testVmix(settings)).supported, undefined);
});

test('only a genuine token or origin refusal settles a dispatched vMix action', async (t) => {
  const savedWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://noacg.studio' } };
  t.after(() => { globalThis.window = savedWindow; });
  const refusal = { ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: 'Refused.' } };
  const invalidUtf8 = body => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    bytes[bytes.indexOf(0x7e)] = 0xff;
    return bytes;
  };
  let raw;
  let http;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    assert.equal(path, '/act');
    requests++;
    const response = new Response(raw, { status: http });
    if (raw === 'body read failed') await response.text();
    return response;
  });
  for (http of [401, 403]) {
    for (raw of [null, 'null', JSON.stringify(refusal), JSON.stringify({ ...refusal, futureField: 1 })]) {
      const before = requests;
      const result = await actVmix(settings, () => unload);
      assert.equal(result.unknownAction, undefined);
      assert.match(result.detail, http === 401 ? /rejected this token/ : /refused this site/);
      assert.equal(requests, before + 1);
    }
    for (raw of [
      '{', ' ', new Uint8Array([0xef, 0xbb, 0xbf]), 'body read failed', '{}', '[]', 'false', '0', '""',
      JSON.stringify({ ...refusal, ok: true }), JSON.stringify({ ...refusal, v: 1 }),
      JSON.stringify({ ...refusal, v: 999, error: null }), JSON.stringify({ ...refusal, error: null }),
      JSON.stringify({ ...refusal, error: { ...refusal.error, hop: 'target', code: 'uncertain' } }),
      JSON.stringify({ ...refusal, error: { ...refusal.error, code: 'usage' } }),
      JSON.stringify({ ...refusal, error: { ...refusal.error, detail: '  ' } }),
      JSON.stringify({ ...refusal, error: { ...refusal.error, raw: 'Target answered' } }),
      JSON.stringify({ ...refusal, error: { ...refusal.error, setup: 'not-running' } }),
      invalidUtf8({ ...refusal, error: { ...refusal.error, detail: 'Refused ~' } }),
    ]) {
      const before = requests;
      const result = await actVmix(settings, () => unload);
      assert.equal(result.unknownAction, true, `${http} ${raw}`);
      assert.match(result.detail, /result is unknown/);
      assert.equal(requests, before + 1);
    }
  }

  http = 200;
  raw = invalidUtf8({ ...acted, raw: 'FUNCTION ~' });
  const before = requests;
  assert.equal((await actVmix(settings, () => unload)).unknownAction, true);
  assert.equal(requests, before + 1);

  // The CasparCG path keeps its permissive decode and HTTP refusal handling.
  const casparOut = { verb: 'out', slot: { adapter: 'casparcg', channel: 1, layer: 20 } };
  assert.equal((await act(settings, casparOut)).raw, 'FUNCTION \uFFFD');
  raw = '{';
  http = 401;
  assert.equal((await act(settings, casparOut)).state, 'token');
});

test('connect validates every remembered server and preserves a complete optional Studio setup', async (t) => {
  const server = { host: 'playout.local', port: 5250 };
  const studio = { channels: [{ channel: 1, name: 'Graphics' }], output: { channel: 1, layer: 0 }, newMedia: 1 };
  let servers;
  t.mock.method(globalThis, 'fetch', async url => Response.json(new URL(url).pathname === '/health' ? health : { ...connected, servers }));
  for (servers of [
    [null], [server, { ...server, port: 65536 }], [{ ...server, host: 'bad host' }],
    [{ ...server, studio: null }], [{ ...server, studio: { ...studio, channels: [null] } }],
    [{ ...server, studio: { ...studio, output: { channel: 1, layer: -1 } } }],
  ]) {
    const result = await testVmix(settings, true);
    assert.equal(result.info, undefined);
    assert.match(result.result.detail, /valid vMix reading/);
  }
  servers = [server, { ...server, host: 'other.local', studio: { ...studio, futureField: 1 } }];
  assert.deepEqual((await testVmix(settings, true)).info, vmix);
});

test('vMix reports only the overlay count its version and edition support', async (t) => {
  let info;
  let version;
  t.mock.method(globalThis, 'fetch', async url => Response.json(new URL(url).pathname === '/health' ? health : { ...status, version, vmix: info }));
  for (info of [
    { ...vmix, overlays: 7 }, { ...vmix, overlays: 4 }, { ...vmix, edition: 'Basic HD' },
    { ...vmix, edition: '' }, { ...vmix, version: 'v29' }, { ...vmix, version: '29.0.49' },
    { ...vmix, version: '28.0.0.42' },
  ]) {
    version = info.version;
    assert.equal((await testVmix(settings)).info, undefined, JSON.stringify(info));
  }
  for (info of [
    vmix, { ...vmix, version: '28.0.0.42', edition: '4K', overlays: 4 },
    { ...vmix, edition: 'Basic HD', overlays: 1 },
    { ...vmix, version: '30.0.0.1', edition: 'Future edition' },
  ]) {
    version = info.version;
    assert.deepEqual((await testVmix(settings)).info, info);
  }
  version = '29.0.0.49';
  assert.equal((await testVmix(settings)).info, undefined);
});

test('an unknown sent result stays visible for its original overlay after a settings change', async (t) => {
  let current = choice;
  const dispatches = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json(scoped());
    dispatches.push(JSON.parse(options.body).action.slot.overlay);
    current = { ...choice, settings: { ...settings, vmix: { overlay: 4 } } };
    return Response.json(null);
  });
  const outcome = await changeVmixOutput(load, () => current);
  assert.match(outcome.message, /^The action targeted Overlay 3\. The vMix action result is unknown/);
  assert.deepEqual(dispatches, [3]);
});

test('a partial Load is reported against the original destination after a same-production change', async (t) => {
  const address = 'http://fixture-user:fixture-pass@127.0.0.1:8899/fixture-path?fixture-query';
  const first = { ...choice, settings: { ...settings, agentUrl: address } };
  const overlayChanged = { ...first, settings: { ...first.settings, vmix: { overlay: 4 } } };
  const pairingChanged = { ...first, settings: { ...first.settings, agentUrl: 'http://127.0.0.1:8900' } };
  const otherProduction = { ...first, url: choice.url + '&other=1' };
  const detail = 'vMix added the Browser input. Bridge did not put it on overlay 3.';
  const uncertain = 'vMix added the Browser input. The overlay command may have acted.';
  const original = 'Load targeted Overlay 3 on the Bridge at 127.0.0.1:8899. ';
  let current;
  let after;
  let error;
  let dispatches;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const route = url.slice(url.lastIndexOf('/'));
    if (route === '/health') return Response.json(health);
    if (route === '/status') return Response.json(status);
    if (route === '/state') return Response.json(scoped());
    assert.equal(route, '/act');
    dispatches.push([url, JSON.parse(options.body).action.slot.overlay]);
    current = after;
    return Response.json({ ok: false, v: 2, error });
  });

  for (const [latest, added, code, cause, message] of [
    [first, true, 'refused', detail, detail],
    [overlayChanged, true, 'refused', detail, original + detail],
    [pairingChanged, true, 'refused', detail, original + detail],
    [pairingChanged, true, 'uncertain', uncertain, original + uncertain],
    [otherProduction, true, 'refused', detail, undefined],
    [null, true, 'refused', detail, undefined],
    [overlayChanged, undefined, 'refused', 'An unmarked refusal.', undefined],
  ]) {
    current = first;
    after = latest;
    error = { hop: 'target', code, detail: cause, browserAdded: added };
    dispatches = [];
    const result = await changeVmixOutput({ ...load, overlay: 3 }, () => current);
    assert.deepEqual(result, message ? { message } : {});
    assert.deepEqual(dispatches, [[address + '/act', 3]]);
  }
});

test('Browser creation is a fact only on valid replies to the dispatched vMix Load', async (t) => {
  const take = { ...unload, verb: 'take' };
  const marked = { hop: 'target', code: 'refused', detail: 'The overlay changed.', browserAdded: true };
  let paths;
  let body;
  let http;
  let dispatched;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === '/health') return Response.json(health);
    if (path === '/act') dispatched?.(JSON.parse(options.body).action);
    return new Response(body, { status: http });
  });
  const failure = (error, v = 2) => JSON.stringify({ ok: false, v, error });

  http = 200;
  body = failure(marked);
  for (const [route, call] of [
    ['/status', () => testVmix(settings)],
    ['/connect', () => testVmix(settings, true)],
    ['/state', () => readVmixOverlays(settings, choice.url)],
  ]) {
    paths = [];
    const { result } = await call();
    assert.equal(result.browserAdded, undefined);
    assert.match(result.detail, /valid vMix reading/);
    assert.deepEqual(paths, route === '/state' ? ['/state'] : ['/health', route]);
  }

  for (const [action, code, error, expected] of [
    [take, 200, marked, { state: 'server', browserAdded: true }],
    [take, 200, { ...marked, code: 'unreachable' }, { state: 'server', browserAdded: true }],
    [take, 200, { ...marked, code: 'uncertain' }, { state: 'server', browserAdded: true, unknownAction: true }],
    [take, 200, { ...marked, browserAdded: undefined }, { state: 'server' }],
    [unload, 200, marked, { state: 'bridge', unknownAction: true }],
    [{ ...unload, verb: 'clear' }, 200, marked, { state: 'bridge', unknownAction: true }],
    [take, 200, { ...marked, browserAdded: false }, { state: 'bridge', unknownAction: true }],
    [take, 200, { ...marked, browserAdded: null }, { state: 'bridge', unknownAction: true }],
    [take, 200, { ...marked, browserAdded: 'true' }, { state: 'bridge', unknownAction: true }],
    [take, 200, { ...marked, code: 'unreachable', setup: 'not-running' }, { state: 'bridge', unknownAction: true }],
    [take, 200, { ...marked, code: 'unsupported' }, { state: 'bridge', unknownAction: true }],
    [take, 400, { ...marked, hop: 'agent', code: 'usage' }, { state: 'bridge', unknownAction: true }],
    [take, 401, { ...marked, hop: 'agent' }, { state: 'bridge', unknownAction: true }],
    [take, 502, { ...marked, code: 'unreachable' }, { state: 'bridge', unknownAction: true }],
  ]) {
    paths = [];
    http = code;
    body = failure(error);
    const { state, browserAdded, unknownAction } = await actVmix(settings, () => action);
    assert.deepEqual({ state, browserAdded, unknownAction }, { browserAdded: undefined, unknownAction: undefined, ...expected });
    assert.deepEqual(paths, ['/health', '/act']);
  }

  http = 200;
  for (body of [
    failure(marked, 1),
    failure(marked).replace('"browserAdded"', String.raw`"browserAdded":false,"brow\u0073erAdded"`),
  ]) {
    paths = [];
    const result = await actVmix(settings, () => take);
    assert.equal(result.browserAdded, undefined);
    assert.equal(result.unknownAction, true);
    assert.deepEqual(paths, ['/health', '/act']);
  }

  const original = { ...unload };
  dispatched = action => {
    assert.equal(action.verb, 'out');
    original.verb = 'take';
  };
  paths = [];
  body = failure(marked);
  const result = await actVmix(settings, () => original);
  assert.equal(result.browserAdded, undefined);
  assert.equal(result.unknownAction, true);
  assert.deepEqual(paths, ['/health', '/act']);
});

test('scoped vMix state grants overlay authority only as a complete fresh snapshot', async (t) => {
  let reading;
  const requests = [];
  const earlier = { ...vmix, version: '28.0.0.42', overlays: 4 };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json({ ...status, version: earlier.version, vmix: earlier });
    if (path === '/state') return Response.json(reading);
    requests.push(JSON.parse(options.body).action);
    return Response.json(acted);
  });

  const wrongKey = { ...browser, key: '3c333333-cccc-43cc-8ccc-cccccccccccc', number: 3 };
  for (reading of [
    { ...scoped(), overlays: [{ overlay: 99, ownsOutput: true }] },
    scoped({ 8: { overlay: 7 } }),
    scoped({ 8: { ownsOutput: true } }),
    scoped({ 8: { ownsOutput: true, input: occupied } }),
    scoped({ 8: { input: { ...browser, key: 'not-a-guid' } } }),
    scoped({ 8: { input: { ...browser, number: 0 } } }),
    scoped({ 8: { input: { ...browser, title: false } } }),
    scoped({ 8: { input: browser, ownsOutput: true } }, { ...vmix, inputs: 0 }),
    scoped({ 7: { input: browser, ownsOutput: true }, 8: { input: browser } }),
    scoped({ 7: { input: browser, ownsOutput: true }, 8: { input: wrongKey, ownsOutput: true } }),
    scoped({ 7: { input: browser }, 8: { input: { ...browser, title: 'Different' } } }),
    scoped({ 8: { ownsOutput: undefined } }, vmix, 'The key store is unavailable.'),
    scoped({}, { ...vmix, overlays: 7 }),
    ...[
      [null], [{ id: '', output: {}, live: [] }], [{ id: 'show', output: [], live: [] }],
      [{ id: 'show', output: { onOverlay: 9 }, live: [] }],
      [{ id: 'show', output: {}, live: ['cue', false] }],
    ].map(linked => ({ ...scoped(), linked })),
  ]) {
    assert.equal((await readVmixOutput(settings, choice.url)).overlay, undefined);
    assert.match((await changeVmixOutput(load, () => choice)).message, /valid vMix reading/);
  }
  const diagnosticRows = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, { ownsOutput: undefined }]));
  reading = scoped(diagnosticRows, vmix, 'The key store is unavailable.');
  assert.deepEqual(await changeVmixOutput(load, () => choice), { message: 'The key store is unavailable.' });
  assert.deepEqual(requests, []);

  reading = {
    ...scoped({ 6: { input: browser } }),
    linked: [{ id: 'show', output: { onOverlay: 6 }, live: ['cue'], futureNote: true }],
  };
  const unset = { ...choice, settings: { ...settings, vmix: undefined } };
  assert.equal((await changeVmixOutput(load, () => unset)).completed, true);
  assert.equal(requests[0].slot.overlay, 8);
  assert.equal((await changeVmixOutput(load, () => choice)).completed, true);
  assert.equal(requests[1].slot.overlay, 3);
  reading = scoped({ 4: { input: browser, ownsOutput: true }, 8: { input: browser, ownsOutput: true } });
  assert.equal((await changeVmixOutput({ ...outOn3, overlay: 4 }, () => choice)).completed, true);
  assert.equal(requests[2].slot.overlay, 4);
  assert.equal(requests[2].expectedOverlayInput, browser.key);
});

test('a native Clear cancelled during the health probe does not reach the Bridge', { timeout: 3000 }, async (t) => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let canClear = true;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).pathname, '/health');
    entered.resolve();
    await release.promise;
    return Response.json(health);
  });
  const clear = act(settings, { verb: 'clear', slot: { adapter: 'casparcg', channel: 1, layer: 10 } }, () => canClear);
  await entered.promise;
  canClear = false;
  release.resolve();
  assert.equal(await clear, null);
});

test('accepted All out after navigation reads the original CasparCG slot before cutting', { timeout: 3000 }, async (t) => {
  for (const change of ['navigation', 'occupant', 'adapter']) {
    await t.test(change, async (t) => {
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      const paths = [];
      let mounted = true;
      let casparAllowed = true;
      const slot = { adapter: 'casparcg', channel: 2, layer: 10 };
      const action = { verb: 'out', slot };
      t.mock.method(globalThis, 'fetch', async (url, options) => {
        const path = new URL(url).pathname;
        paths.push(path);
        if (path === '/health') {
          entered.resolve();
          await release.promise;
          return Response.json(health);
        }
        const body = JSON.parse(options.body);
        if (path === '/state') {
          assert.equal(body.channel, slot.channel);
          if (change === 'adapter') casparAllowed = false;
          return Response.json({ ok: true, session: 'original', slots: [{ layer: slot.layer, instance: change === 'occupant' ? 'replacement' : 'original.1' }] });
        }
        assert.equal(path, '/act');
        assert.deepEqual(body.action, action);
        return Response.json({ ok: true });
      });
      const clearing = finishCasparAllOut(settings, action, () => casparAllowed, () => mounted, current => current.instance === 'original.1');
      await entered.promise;
      mounted = false;
      release.resolve();
      assert.equal((await clearing)?.state ?? null, change === 'navigation' ? 'ok' : null);
      assert.deepEqual(paths, ['/health', '/state', ...(change === 'navigation' ? ['/act'] : [])]);
    });
  }
});
