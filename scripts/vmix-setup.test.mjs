// guards: src/control/vmixSetup.ts, src/control/playoutLink.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { act, PLAYOUT_DEFAULTS } = await import('../src/control/playoutLink.ts');
const { changeVmixOutput, vmixOverlay } = await import('../src/control/vmixSetup.ts');

const settings = { ...PLAYOUT_DEFAULTS, agentToken: 'fixture-token', vmix: { overlay: 3 } };
const choice = { settings, url: 'http://127.0.0.1:5284/output?production=owned', title: 'News' };
const health = { agent: 'noacg-bridge', v: 2, adapters: ['casparcg', 'vmix'], features: ['vmix-output-key'] };
const status = { ok: true, vmix: { version: '29.0.0.49', edition: 'Trial', overlays: 8, inputs: 2 } };
const occupied = { key: '1a111111-aaaa-41aa-8aaa-aaaaaaaaaaaa', number: 1, type: 'Image', title: 'Sponsor' };

test('the output uses the highest overlay only when no valid choice fits this vMix', () => {
  assert.equal(vmixOverlay(PLAYOUT_DEFAULTS, 8), 8);
  assert.equal(vmixOverlay(settings, 4), 3);
  assert.equal(vmixOverlay(settings, 1), 1);
});

test('vMix replacement requires the exact confirmed overlay and input before dispatch', async (t) => {
  const actions = [];
  let held = occupied;
  let current = choice;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/health') return Response.json(health);
    if (path === '/status') return Response.json(status);
    if (path === '/state') return Response.json({ ok: true, overlays: [{ overlay: 3, input: held, ownsOutput: false }] });
    assert.equal(path, '/act');
    assert.equal(options.headers.authorization, 'Bearer vmix-output-key:fixture-token');
    actions.push(JSON.parse(options.body));
    return Response.json({ ok: true });
  });
  const { replace } = await changeVmixOutput('take', () => current);
  assert.equal(replace.input.key, occupied.key);
  assert.deepEqual(actions, []);

  held = { ...held, key: '2b222222-bbbb-42bb-8bbb-bbbbbbbbbbbb' };
  assert.match((await changeVmixOutput('take', () => current, replace)).message, /input.*changed/);
  current = { ...choice, settings: { ...settings, vmix: { overlay: 4 } } };
  assert.match((await changeVmixOutput('take', () => current, replace)).message, /setup changed/);
  assert.deepEqual(actions, []);

  held = occupied;
  await changeVmixOutput('take', () => choice, replace);
  assert.deepEqual(actions, [{
    target: { adapter: 'vmix' },
    action: {
      verb: 'take', slot: { adapter: 'vmix', overlay: 3 }, expectedOverlayInput: occupied.key,
      item: { kind: 'url', label: 'News', name: choice.url + '&name=vMix%20Overlay%203' },
    },
  }]);
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
    if (path === '/state') return Response.json({ ok: true, overlays: [{ overlay: 3, ownsOutput: false }] });
    assert.fail('unexpected mutation ' + path);
  });
  const load = changeVmixOutput('take', () => current);
  await dispatchProbe.promise;
  current = null;
  releaseProbe.resolve();
  assert.deepEqual(await load, { message: undefined });
});

test('a vMix adapter without keyed output actions offers Update and sends no mutation', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    return Response.json(path === '/health' ? { ...health, features: [] } : status);
  });
  assert.match((await changeVmixOutput('take', () => choice)).message, /Update NoaCG Bridge/);
  assert.deepEqual(paths, ['/health', '/status']);
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
