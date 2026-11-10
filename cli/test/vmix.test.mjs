// NoaCG Bridge's vMix adapter (cli/src/playout/adapters/vmix.ts, docs/work-specs/bridge-vmix-adapter):
// finding vMix on this computer (AC-1), putting the output on an overlay channel and taking it off
// (AC-3), and the failures that must never air anything (AC-6), against a fake vMix TCP API that
// answers the way vMix 29.0.0.49 did (./_fakeVmix.mjs). Run `npm run build` first.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createVmixAdapter, functionLine, outputInputName, titleOf } from '../dist/playout/adapters/vmix.js';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { createBridgeServer, readAction, readTarget } from '../dist/playout/server.js';
import { VMIX_OUTPUT_TOKEN_PREFIX } from '../dist/playout/protocol.js';
import { SlotMemoryBank } from '../dist/playout/slots.js';
import { parseVmixXml, vmixOverlayCount } from '../dist/playout/vmixTcp.js';
import { vmixOutputId, vmixOutputStore } from '../dist/playout/vmixOutputs.js';
import { startFakeVmix } from './_fakeVmix.mjs';

const OUTPUT = 'https://noacg.studio/output?production=abc123&name=vMix';
const TITLE = 'Evening News';
const item = { kind: 'url', name: OUTPUT, label: TITLE };
const slot = (overlay = 8) => ({ adapter: 'vmix', overlay });
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Everything the adapter may ever ask of vMix: never Program, Preview, a transition or a setting. */
const ALLOWED = /^(AddInput|SetInputName|OverlayInput[1-8](In|Out|Off))$/;

const noServers = { list: async () => [], remember: async () => [], setStudio: async () => null };

async function withBridge(adapter, fn, { port = 0, memory } = {}) {
  const server = createBridgeServer({ token: 't', origins: ['https://noacg.studio'], adapters: [casparcgAdapter, adapter], version: '0.0.0-test', servers: noServers, memory }, () => {});
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, token = 't') =>
    (await fetch(`${base}${path}`, { method: 'POST', headers: { Connection: 'close', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try {
    await fn(post, base);
  } finally {
    adapter.close();
    await new Promise((r) => server.close(r));
  }
}

/** A port nothing listens on. */
async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

const act = (post, action, port) => post('/act', { target: { adapter: 'vmix', ...(port ? { port } : {}) }, action });

const aliasDestination = input => new URL(input.url).searchParams.get('output');
const addedUrl = line => new URL(new URLSearchParams(line.slice('FUNCTION AddInput '.length)).get('Value').slice('Browser|'.length));
const directTestContext = { vmixBridgePort: 8899 };

function aliasRequest(base, alias, { path = alias.pathname + alias.search, method = 'GET', host = alias.host, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(base + path, { method, agent: false, headers: { ...headers, host } }, res => {
      res.resume();
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.once('error', reject);
    req.end();
  });
}

// ── The wire and the XML ──────────────────────────────────────────────────────────────────

test("vMix 29's own state XML reads as its version, edition, inputs by key and the overlay channels", async () => {
  // Saved off vMix 29.0.0.49 Trial on 2026-10-12, two transparent images on overlays 3 and 4.
  const xml = parseVmixXml(await readFile(new URL('./fixtures/vmix/29.0.0.49-two-on-overlays.xml', import.meta.url), 'utf8'));
  assert.equal(xml.version, '29.0.0.49');
  assert.equal(xml.edition, 'Trial');
  assert.deepEqual(xml.inputs, [
    { key: '133b54d3-5115-45a1-8711-9adfa7862847', number: 1, type: 'Image', title: 'NoaCG: Probe A & co' },
    { key: 'abc7d904-639e-40ac-b5bb-c2f9666f7409', number: 2, type: 'Image', title: 'NoaCG: Probe B' },
  ]);
  assert.deepEqual([...xml.overlays], [[3, 1], [4, 2]]);
  assert.equal(parseVmixXml('<html>no</html>'), undefined);
  assert.equal(parseVmixXml('<vmix><version>29.0.0.49</version></vmix>'), undefined);
  assert.ok(parseVmixXml('<vmix><version>29.0.0.49</version><edition>Trial</edition><inputs /><overlays /></vmix>'));
});

test('the overlay channels a vMix offers come from its version and edition, not the XML', () => {
  assert.equal(vmixOverlayCount('29.0.0.49', 'Trial'), 8);
  assert.equal(vmixOverlayCount('29.0.0.49', '4K'), 8);
  assert.equal(vmixOverlayCount('28.0.0.42', 'Pro'), 4);
  assert.equal(vmixOverlayCount('29.0.0.49', 'Basic HD'), 1);
  assert.equal(vmixOverlayCount('27.0.0.88', 'Basic'), 1);
});

test('a function line URL-encodes its values, which vMix decodes', () => {
  assert.equal(functionLine('OverlayInput2Out'), 'FUNCTION OverlayInput2Out');
  assert.equal(functionLine('SetInputName', { Input: 'k', Value: 'NoaCG: A & co' }), 'FUNCTION SetInputName Input=k&Value=NoaCG%3A%20A%20%26%20co');
  assert.equal(outputInputName(TITLE), 'NoaCG Evening News');
  // A title is one line of at most 100 characters, never a half character that could not be encoded.
  assert.equal(titleOf({ kind: 'url', name: OUTPUT, label: ' Evening\nNews\u0000 ' }), 'Evening News');
  const long = titleOf({ kind: 'url', name: OUTPUT, label: `${'a'.repeat(99)}😀b` });
  assert.equal(long, `${'a'.repeat(99)}😀`);
  assert.equal(titleOf({ kind: 'url', name: OUTPUT, label: 'Lone \uD800 surrogate' }), 'Lone surrogate');
  assert.doesNotThrow(() => functionLine('SetInputName', { Value: long }));
  assert.equal(titleOf({ kind: 'url', name: OUTPUT, label: ' \n ' }), undefined);
});

test('the Bridge reads a vmix target and slot field by field', () => {
  const adapters = [casparcgAdapter, createVmixAdapter()];
  // No port is the Bridge's own, filled in, so one vMix is one target however a page names it.
  assert.deepEqual(readTarget({ target: { adapter: 'vmix' } }, adapters), { adapter: 'vmix', port: 8099 });
  assert.deepEqual(readTarget({ target: { adapter: 'vmix' } }, [createVmixAdapter({ port: 9100 })]), { adapter: 'vmix', port: 9100 });
  assert.deepEqual(readTarget({ target: { adapter: 'vmix', port: 9000, host: 'elsewhere' } }, adapters), { adapter: 'vmix', port: 9000 });
  assert.throws(() => readTarget({ target: { adapter: 'vmix', port: 70000 } }, adapters), /port is a whole number/);
  assert.throws(() => readTarget({ target: { adapter: 'vmix' } }, [casparcgAdapter]), /no adapter "vmix"/);
  assert.deepEqual(readAction({ action: { verb: 'take', item, slot: slot(4) } }).item, item);
  assert.deepEqual(readAction({ action: { verb: 'clear', slot: slot(4), item } }), { verb: 'clear', slot: slot(4), item });
  assert.throws(() => readAction({ action: { verb: 'out', slot: slot(9) } }), /overlay channel from 1 to 8/);
  assert.throws(() => readAction({ action: { verb: 'out', slot: { adapter: 'vmix', overlay: 0 } } }), /overlay channel from 1 to 8/);
});

// ── AC-1: the Bridge finds vMix on this computer ──────────────────────────────────────────

test('AC-1: /status reports the version, edition, overlay channels and inputs, and /health lists vmix', async () => {
  const fake = await startFakeVmix();
  fake.add('Colour', 'Colour');
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post, base) => {
      const health = await (await fetch(`${base}/health`)).json();
      assert.deepEqual(health.adapters, ['casparcg', 'vmix']);
      // The link routes are a later slice; until they exist the Bridge does not claim them.
      assert.ok(!health.features.includes('vmix-link'));
      const r = await post('/status', { target: { adapter: 'vmix' } });
      assert.equal(r.ok, true);
      assert.equal(r.version, '29.0.0.49');
      assert.deepEqual(r.vmix, { version: '29.0.0.49', edition: 'Trial', overlays: 8, inputs: 1 });
      assert.deepEqual(r.capabilities, ['state']);
      // Connect is the same reading, and Try again on the page.
      const c = await post('/connect', { target: { adapter: 'vmix' } });
      assert.deepEqual([c.ok, c.vmix.overlays, c.servers], [true, 8, []]);
      // Reading is the greeting and XML, and nothing else.
      assert.deepEqual(fake.lines, ['XML', 'XML']);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-1: an older vMix offers four overlay channels and a Basic edition one', async () => {
  for (const [version, edition, overlays] of [
    ['28.0.0.42', '4K', 4],
    ['29.0.0.49', 'Basic HD', 1],
  ]) {
    const fake = await startFakeVmix({ version, edition });
    try {
      const r = await createVmixAdapter({ port: fake.port }).status({ adapter: 'vmix' });
      assert.deepEqual(r.value.vmix, { version, edition, overlays, inputs: 0 });
    } finally {
      await fake.stop();
    }
  }
});

test('AC-1: nothing listening is not-running', async () => {
  const port = await freePort();
  await withBridge(createVmixAdapter({ port }), async (post) => {
    const r = await post('/status', { target: { adapter: 'vmix' } });
    assert.equal(r.ok, false);
    assert.equal(r.error.setup, 'not-running');
    assert.equal(r.error.code, 'unreachable');
    assert.match(r.error.detail, /vMix is not running on this computer/);
  });
});

test('AC-1: a port that never greets is not-vmix within 3 s, and one that greets wrongly at once', async () => {
  const silent = await startFakeVmix({ greeting: null });
  const wrong = await startFakeVmix({ greeting: 'HTTP/1.1 400 Bad Request' });
  try {
    const t0 = Date.now();
    const r = await createVmixAdapter({ port: silent.port }).status({ adapter: 'vmix' });
    const took = Date.now() - t0;
    assert.equal(r.error.setup, 'not-vmix');
    // Three seconds of waiting, and a busy machine's timer slack on top.
    assert.ok(took >= 2900 && took < 4500, `took ${took} ms`);
    assert.deepEqual(silent.lines, [], 'nothing is sent to something that did not greet');
    const t1 = Date.now();
    const w = await createVmixAdapter({ port: wrong.port }).status({ adapter: 'vmix' });
    assert.equal(w.error.setup, 'not-vmix');
    assert.match(w.error.detail, new RegExp(`Something on port ${wrong.port} is not vMix's TCP API`));
    assert.ok(Date.now() - t1 < 1000);
  } finally {
    await silent.stop();
    await wrong.stop();
  }
});

test('AC-1: the port the Bridge was started with (--vmix-port) is used unless a target names another', async () => {
  const a = await startFakeVmix({ version: '29.0.0.49' });
  const b = await startFakeVmix({ version: '28.0.0.42' });
  try {
    const adapter = createVmixAdapter({ port: a.port });
    assert.equal((await adapter.status({ adapter: 'vmix' })).value.version, '29.0.0.49');
    assert.equal((await adapter.status({ adapter: 'vmix', port: b.port })).value.version, '28.0.0.42');
    adapter.close();
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('AC-1: the CLI passes --vmix-port to a real Bridge process', async () => {
  const fake = await startFakeVmix({ version: '28.0.0.42' });
  const config = await mkdtemp(join(tmpdir(), 'noacg-vmix-detect-'));
  const port = await freePort();
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../dist/index.js', import.meta.url)), 'bridge', '--no-open', '--quiet',
    '--port', String(port), '--vmix-port', String(fake.port), '--token', 'fixture-vmix-port',
  ], { stdio: 'ignore', windowsHide: true, env: { ...process.env, APPDATA: config, XDG_CONFIG_HOME: config } });
  const exited = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  try {
    let health;
    for (let attempt = 0; attempt < 30 && !health && child.exitCode === null; attempt += 1) {
      health = await fetch(base + '/health').then(res => res.json()).catch(() => undefined);
      if (!health) await sleep(100);
    }
    assert.ok(health?.adapters.includes('vmix'));
    const status = await fetch(base + '/status', {
      method: 'POST', headers: { Connection: 'close', Authorization: 'Bearer fixture-vmix-port', 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: { adapter: 'vmix' } }),
    }).then(res => res.json());
    assert.equal(status.vmix.version, '28.0.0.42');
    assert.equal(status.vmix.overlays, 4);
    assert.deepEqual(fake.lines, ['XML']);
  } finally {
    child.kill();
    await exited;
    await fake.stop();
    if (process.platform === 'win32') await rmdir(join(config, 'noacg'));
    await rmdir(config);
  }
});

test('AC-4: only one Windows Bridge per data folder can control vMix, even on other ports', {
  skip: process.platform !== 'win32', timeout: 20_000,
}, async () => {
  const config = await mkdtemp(join(tmpdir(), 'noacg-vmix-claim-'));
  const store = join(config, 'noacg', 'vmix-outputs.json');
  const fake = await startFakeVmix();
  const other = await startFakeVmix({ version: '28.0.0.42' });
  const children = new Map();
  const start = async (port) => {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('../dist/index.js', import.meta.url)), 'bridge', '--no-open', '--quiet', '--json',
      '--port', String(port), '--vmix-port', String(fake.port), '--token', 'fixture-vmix-claim',
    ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env: { ...process.env, APPDATA: config } });
    const exited = once(child, 'exit');
    children.set(child, exited);
    await once(child.stdout, 'data', { signal: AbortSignal.timeout(4000) });
    const base = 'http://127.0.0.1:' + port;
    const post = async (route, body) => (await fetch(base + route, {
      method: 'POST', headers: { Connection: 'close', Authorization: 'Bearer fixture-vmix-claim', 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(9000),
    })).json();
    return { base, post, child, exited };
  };
  const target = { adapter: 'vmix' };
  const take = { verb: 'take', item, slot: slot() };
  try {
    const port = await freePort();
    const owner = await start(port);
    const contender = await start(await freePort());
    const health = await fetch(contender.base + '/health').then(res => res.json());
    assert.deepEqual(health.adapters, ['casparcg', 'ograf', 'vmix']);
    assert.equal((await contender.post('/status', { target })).vmix.version, '29.0.0.49');
    assert.equal((await contender.post('/status', { target: { ...target, port: other.port } })).vmix.version, '28.0.0.42');
    assert.equal((await act(owner.post, take)).ok, true);
    const saved = await readFile(store, 'utf8');
    const input = fake.onChannel(8);
    const alias = new URL(input.url);
    const state = await contender.post('/state', { target, outputUrl: OUTPUT });
    assert.equal(state.overlays[7].input.key, input.key);
    assert.equal(state.overlays[7].ownsOutput, undefined);
    assert.match(state.loadProblem, /Another NoaCG Bridge/);
    const mark = fake.functions.length;
    for (const contenderPort of [undefined, other.port]) {
      for (const verb of ['take', 'out']) {
        assert.equal((await act(contender.post, { ...take, verb }, contenderPort)).error.detail, state.loadProblem);
      }
    }
    assert.equal(fake.functions.length, mark);
    assert.deepEqual(other.functions, []);
    assert.equal(await readFile(store, 'utf8'), saved);
    assert.equal((await aliasRequest(owner.base, alias)).headers.location, OUTPUT);

    owner.child.kill();
    await owner.exited;
    assert.equal((await act(contender.post, take)).error.detail, state.loadProblem, 'no automatic handover');
    const recovered = await start(port);
    assert.equal((await aliasRequest(recovered.base, alias)).headers.location, OUTPUT);
    assert.equal((await act(recovered.post, { ...take, verb: 'out' })).ok, true);
    assert.deepEqual(fake.functions.slice(mark).map(fn => fn.name), ['OverlayInput8Out']);
  } finally {
    for (const [child, exited] of children) {
      if (child.exitCode === null) child.kill();
      await exited;
    }
    await Promise.all([fake.stop(), other.stop()]);
    await rm(store, { force: true });
    await rmdir(join(config, 'noacg'));
    await rmdir(config);
  }
});

// ── AC-4: Put on air and Take off drive the output input ──────────────────────────────────

test('AC-4: Put on air adds the output as a Web Browser input, names it and puts it on the channel by key', async () => {
  const fake = await startFakeVmix();
  fake.add('Colour', 'Colour');
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post, base) => {
      const r = await act(post, { verb: 'take', item, slot: slot(8) });
      assert.equal(r.ok, true, JSON.stringify(r));
      const output = fake.onChannel(8);
      assert.equal(output.title, 'NoaCG Evening News');
      assert.equal(output.type, 'Browser');
      // The exact output address arrived through the alias, its `&name=` included.
      assert.equal(aliasDestination(output), OUTPUT);
      assert.deepEqual(
        fake.functions.map((f) => f.name),
        ['AddInput', 'SetInputName', 'OverlayInput8In'],
      );
      const alias = new URL(output.url);
      assert.match(alias.hostname, /^noacg-[0-9a-f]{32}\.localhost$/);
      assert.equal(alias.port, new URL(base).port);
      assert.deepEqual(fake.functions[0].params, { Value: 'Browser|' + alias.href });
      const allowed = await aliasRequest(base, alias);
      assert.equal(allowed.status, 302);
      assert.equal(allowed.headers.location, OUTPUT);
      assert.equal(allowed.headers['cache-control'], 'no-store');
      assert.equal(allowed.headers['referrer-policy'], 'no-referrer');
      assert.equal(allowed.headers['access-control-allow-origin'], undefined);
      assert.equal(allowed.headers['set-cookie'], undefined);
      const wrong = new URL(alias);
      wrong.search = '?output=' + encodeURIComponent(OUTPUT.replace('name=vMix', 'name=other'));
      for (const request of [
        { path: wrong.pathname + wrong.search },
        { path: '/health' },
        { path: '/act', method: 'POST' },
        { path: '/pair', method: 'POST' },
        { method: 'HEAD' },
        { headers: { origin: 'https://noacg.studio' } },
        { host: 'noacg-' + '0'.repeat(32) + '.localhost:' + alias.port },
        { host: alias.hostname + ':8899' },
        { host: '127.0.0.1:' + alias.port },
      ]) {
        const denied = await aliasRequest(base, alias, request);
        assert.ok(denied.status >= 400, JSON.stringify(request));
        assert.equal(denied.headers.location, undefined);
        assert.equal(denied.headers['access-control-allow-origin'], undefined);
      }
      assert.deepEqual(fake.functions[1].params, { Input: output.key, Value: 'NoaCG Evening News' });
      assert.deepEqual(fake.functions[2].params, { Input: output.key });
      assert.equal((await act(post, { verb: 'take', item, slot: slot(8) })).ok, true);
      assert.equal(fake.functions.length, 3, 'a second take of the live Browser sends no function');

      // Again: the input kept for the address is reused, never added twice.
      await act(post, { verb: 'out', item, slot: slot(8) });
      const again = await act(post, { verb: 'take', item, slot: slot(8) });
      assert.equal(again.ok, true);
      assert.equal(fake.inputs.filter((i) => i.title === 'NoaCG Evening News').length, 1);
      assert.deepEqual(fake.functions.slice(-1), [{ name: 'OverlayInput8In', params: { Input: output.key } }]);

      for (const f of fake.functions) {
        assert.match(f.name, ALLOWED, `${f.name} is not a function the adapter may send`);
        if ('Input' in f.params) assert.match(f.params.Input, GUID, `${f.name} names its input by key`);
      }
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: Put on air waits for an input vMix adds a moment after its OK', async () => {
  const fake = await startFakeVmix({ addDelayMs: 400 });
  try {
    const r = await createVmixAdapter({ port: fake.port }).act({ adapter: 'vmix' }, { verb: 'take', item, slot: slot(2) }, directTestContext);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(fake.onChannel(2).title, 'NoaCG Evening News');
  } finally {
    await fake.stop();
  }
});

test('AC-4: two productions put on air at once each get their own input, even when vMix adds them late', async () => {
  const fake = await startFakeVmix({ addDelayMs: 300 });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post) => {
      const other = { ...item, name: 'https://noacg.studio/output?production=xyz&name=vMix' };
      const [a, b] = await Promise.all([act(post, { verb: 'take', item, slot: slot(1) }), act(post, { verb: 'take', item: other, slot: slot(2) })]);
      assert.deepEqual([a.ok, b.ok], [true, true], JSON.stringify([a, b]));
      assert.deepEqual([fake.onChannel(1).title, aliasDestination(fake.onChannel(1))], ['NoaCG Evening News', OUTPUT]);
      assert.deepEqual([fake.onChannel(2).title, aliasDestination(fake.onChannel(2))], ['NoaCG Evening News (2)', other.name]);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: an output added and then not read back is uncertain, never unreachable', async () => {
  const fake = await startFakeVmix({
    hook: (line, sock) => {
      if (line === 'XML' && fake.functions.some((f) => f.name === 'AddInput')) {
        sock.destroy();
        return true;
      }
      return false;
    },
  });
  try {
    const r = await createVmixAdapter({ port: fake.port }).act({ adapter: 'vmix' }, { verb: 'take', item, slot: slot(8) }, directTestContext);
    assert.equal(r.error.code, 'uncertain');
    assert.match(r.error.detail, /could not identify one new output input/);
  } finally {
    await fake.stop();
  }
});

test('AC-4: a concurrent foreign Browser is ignored while the exact marker is delayed', async () => {
  let manual;
  const addition = Promise.withResolvers();
  const fake = await startFakeVmix({
    addDelayMs: 400,
    hook(line) {
      if (line.startsWith('FUNCTION AddInput ')) {
        manual = fake.add('Browser', 'Browser noacg.studio');
        const alias = addedUrl(line);
        fake.add('Browser', 'Browser ' + alias.hostname + '.unrelated');
        addition.resolve(alias);
      }
      return false;
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post, base) => {
      const take = act(post, { verb: 'take', item, slot: slot() });
      const alias = await addition.promise;
      assert.equal((await aliasRequest(base, alias)).headers.location, OUTPUT, 'the Browser can navigate before readback');
      const reply = await take;
      assert.equal(reply.ok, true, JSON.stringify(reply));
      assert.notEqual(fake.onChannel(8).key, manual.key);
      assert.equal(manual.title, 'Browser noacg.studio');
      assert.equal(aliasDestination(fake.onChannel(8)), OUTPUT);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: generic OK and a sole foreign Browser cannot grant ownership', async () => {
  let alias;
  let manual;
  const fake = await startFakeVmix({
    hook(line, socket) {
      if (!line.startsWith('FUNCTION AddInput ')) return false;
      alias = addedUrl(line);
      manual = fake.add('Browser', 'Browser noacg.studio');
      socket.write('FUNCTION OK Completed\r\n');
      return true;
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post, base) => {
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(result.error.code, 'uncertain');
      assert.equal(fake.inputs.length, 1);
      assert.equal(manual.title, 'Browser noacg.studio');
      assert.equal(fake.onChannel(8), undefined);
      assert.deepEqual(fake.functions, []);
      assert.equal((await aliasRequest(base, alias)).status, 403);
      fake.overlays.set(8, manual.key);
      const state = await post('/state', { target: { adapter: 'vmix' }, outputUrl: OUTPUT });
      assert.equal(state.overlays[7].ownsOutput, false);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: malformed and duplicate input or overlay rows cannot authorize a command', async () => {
  const template = (rows, overlays) => '<vmix><version>29.0.0.49</version><edition>Trial</edition><inputs>' + rows + '</inputs><overlays>' + overlays + '</overlays></vmix>';
  const key = '913caefe-1c82-4548-85c5-fecde6369290';
  const input = (id, number) => '<input key="' + id + '" number="' + number + '" type="Browser" title="Browser marker" />';
  for (const bad of [
    input('bad', 1), input(key, '0x1'), 'stray' + input(key, 1), '<group>' + input(key, 1) + '</group>',
    '<![CDATA[stray]]>', input(key, 1).replace('Browser marker', '&#99999999;'),
    input(key, 1).replace('Browser marker', '&unknown;'), input(key, 1).replace('Browser marker', '&#0;'),
  ]) assert.equal(parseVmixXml(template(bad, '<overlay number="8" />')), undefined, bad);
  assert.equal(parseVmixXml(template(input(key, 1), '<overlay number="8" />').replace('<vmix>', '<vmix>stray')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1) + input('', 2), '<overlay number="8" />')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1) + input(key.toUpperCase(), 2), '<overlay number="8" />')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1), '<overlay number="8" /><overlay number="8" />')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1), '<overlay number="8">broken</overlay>')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1), '<overlay number="8">')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1).replace(' />', '>'), '<overlay number="8" />')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1).replace(' key=', ' key="duplicate" key='), '<overlay number="8" />')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1), '<overlay number="8" number="7" />')), undefined);
  assert.equal(parseVmixXml(template(input(key, 1), '<overlay number="8" />').replace('29.0.0.49', 'unknown')), undefined);
  const all = Array.from({ length: 8 }, (_, i) => '<overlay number="' + (i + 1) + '" />').join('');
  assert.equal(parseVmixXml(template(input(key, 1), all + '</overlays><overlays><overlay number="8">1</overlay>')), undefined);
  const nested = template(input(key, 1).replace(' />', '><overlays>' + all + '</overlays></input>'), '<overlay number="8">1</overlay>');
  assert.equal(parseVmixXml(nested).overlays.get(8), 1);
  const fake = await startFakeVmix({
    hook(line, socket) {
      if (line !== 'XML') return false;
      const body = template(input(key, 1), '<overlay number="1" />');
      socket.write('XML ' + Buffer.byteLength(body) + '\r\n' + body);
      return true;
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      assert.equal((await post('/status', { target: { adapter: 'vmix' } })).vmix.overlays, 8);
      assert.equal((await post('/state', { target: { adapter: 'vmix' }, outputUrl: OUTPUT })).ok, false);
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.match(result.error.detail, /did not identify the input on overlay 8/);
      assert.deepEqual(fake.functions, []);
    });
  } finally {
    await fake.stop();
  }
});

test('vMix input and overlay start tags consume attributes in order before a contiguous />', () => {
  const key = '913caefe-1c82-4548-85c5-fecde6369290';
  const input = '<input key="' + key + '" number="1" type="Browser" title="Browser marker" />';
  const overlay = '<overlay number="8">1</overlay>';
  const xml = (inputs = input, overlays = overlay) =>
    '<vmix><version>29.0.0.49</version><edition>Trial</edition><inputs>' + inputs + '</inputs><overlays>' + overlays + '</overlays></vmix>';
  for (const malformed of [
    input.replace('<input', '<input/').replace(' />', '></input>'),
    input.replace(' number=', ' / number=').replace(' />', '></input>'),
    input.replace('/>', '/ >'), input.replace('/>', '//>'),
    input.replace('" number=', '"number='), input.replace(' />', ' junk />'),
    input.replace(' key=', '\u00a0key='), input.replace('/>', '/\u00a0>'),
    input.replace(' />', '><layer unexpected junk /></input>'),
    input.replace(' />', '><layer /></input\u00a0>'),
    input.replace(' />', '><layer></input></layer>'),
  ]) assert.equal(parseVmixXml(xml(malformed)), undefined, malformed);
  for (const malformed of [
    overlay.replace('<overlay', '<overlay/'),
    overlay.replace('>1</overlay>', ' / >'),
    overlay.replace(' number=', '\u00a0number='),
    overlay.replace('>1</', '>\u00a01</'),
    overlay.replace('>1</', '>1<layer /></'),
  ]) assert.equal(parseVmixXml(xml(input, malformed)), undefined, malformed);
  assert.equal(parseVmixXml(xml().replace('</vmix>', '</vmix>\u00a0')), undefined);
  assert.equal(parseVmixXml(xml().replace('29.0.0.49', '\u00a029.0.0.49')), undefined);
  const formatted = xml(
    "<input \n\tkey = '" + key + "' type = 'Browser' number='1' title='Browser > / marker'>\n<layer index='1' />\n</input \t>",
    "<overlay \n number = '7'> \r\n</overlay \t><overlay number='8'> \n1\t </overlay>",
  );
  const parsed = parseVmixXml(formatted);
  assert.equal(parsed?.inputs[0].title, 'Browser > / marker');
  assert.deepEqual([...parsed.reportedOverlays], [7, 8]);
  assert.deepEqual([...parsed.overlays], [[8, 1]]);
});

for (const [fault, corrupt] of [
  ['missing overlay', xml => xml.replace('<overlay number="7" />', '')],
  ['changed edition', xml => xml.replace('<edition>Trial</edition>', '<edition>Basic HD</edition>')],
  ['malformed input start tag', xml => xml.replace('<input key=', '<input/ key=')],
]) {
  test('AC-4: AddInput cannot keep a key after ' + fault + ' during observation', async () => {
    const fake = await startFakeVmix({
      transformXml(xml) {
        if (!fake.functions.some(fn => fn.name === 'AddInput') || fake.functions.some(fn => fn.name === 'SetInputName')) return xml;
        return corrupt(xml);
      },
    });
    const outputs = vmixOutputStore();
    try {
      await withBridge(createVmixAdapter({ port: fake.port, outputs }), async (post, base) => {
        const result = await act(post, { verb: 'take', item, slot: slot() });
        assert.equal(result.error?.code, 'uncertain', JSON.stringify(result));
        assert.deepEqual(fake.functions.map(fn => fn.name), ['AddInput']);
        assert.deepEqual((await outputs.read(fake.port)).keys, {});
        const alias = addedUrl(fake.lines.find(line => line.startsWith('FUNCTION AddInput ')));
        assert.equal((await aliasRequest(base, alias)).status, 403);
        assert.equal(fake.onChannel(8), undefined);
      });
    } finally {
      await fake.stop();
    }
  });
}

test('AC-4: incomplete Out readback cannot authorize a rename', async () => {
  let afterOut = false;
  const fake = await startFakeVmix({
    hook(line) {
      if (line === 'FUNCTION OverlayInput8Out') afterOut = true;
      return false;
    },
    transformXml: xml => afterOut ? xml.replace('<overlay number="8" />', '') : xml,
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).ok, true);
      const mark = fake.functions.length;
      const result = await act(post, { verb: 'out', item: { ...item, label: 'Renamed' }, slot: slot() });
      assert.equal(result.error?.code, 'uncertain', JSON.stringify(result));
      assert.deepEqual(fake.functions.slice(mark).map(fn => fn.name), ['OverlayInput8Out']);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: overlay readback must still show the keyed Browser after In', async () => {
  const fake = await startFakeVmix({
    transformXml: xml => fake.functions.some(fn => fn.name === 'OverlayInput8In') ? xml.replace('type="Browser"', 'type="Image"') : xml,
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(result.error?.code, 'uncertain', JSON.stringify(result));
      assert.deepEqual(fake.functions.map(fn => fn.name), ['AddInput', 'SetInputName', 'OverlayInput8In']);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: an occupied overlay with unrecognized XML content cannot be replaced', async () => {
  const fake = await startFakeVmix({
    transformXml: xml => xml.replace(/(<overlay number="3">)(\d+)(<\/overlay>)/, '$1<![CDATA[$2]]>$3'),
  });
  const sponsor = fake.add('Image', 'Sponsor');
  fake.overlays.set(3, sponsor.key);
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const result = await act(post, { verb: 'take', item, slot: slot(3), expectedOverlayInput: null });
      assert.equal(result.ok, false);
      assert.equal(fake.onChannel(3), sponsor);
      assert.deepEqual(fake.functions, []);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: an omitted other overlay cannot hide a Browser that went live during Load', async () => {
  let hide = false;
  let race = false;
  const fake = await startFakeVmix({
    hook(line) {
      if (race && line.startsWith('FUNCTION SetInputName ')) {
        fake.overlays.set(8, fake.inputs.find(input => input.type === 'Browser').key);
        hide = true;
      }
      return false;
    },
    transformXml: xml => hide ? xml.replace(/<overlay number="8">[^<]+<\/overlay>/, '') : xml,
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot(8) })).ok, true);
      const original = fake.onChannel(8);
      assert.equal((await act(post, { verb: 'out', item, slot: slot(8) })).ok, true);
      race = true;
      const result = await act(post, { verb: 'take', item: { ...item, label: 'Renamed News' }, slot: slot(3) });
      assert.equal(result.ok, false);
      assert.equal(fake.onChannel(8), original);
      assert.equal(fake.onChannel(3), undefined);
      assert.ok(!fake.functions.some(fn => fn.name === 'OverlayInput3In'));
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: a same-named input is never adopted, even when it is a Browser', async () => {
  const fake = await startFakeVmix();
  const manual = fake.add('Browser', 'NoaCG Evening News');
  const image = fake.add('Image', 'NoaCG Evening News (2)');
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post) => {
      fake.overlays.set(8, manual.key);
      assert.equal((await act(post, { verb: 'out', item, slot: slot() })).ok, true);
      assert.equal(fake.onChannel(8), manual);
      assert.deepEqual(fake.functions, []);
      const loaded = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(loaded.ok, true, JSON.stringify(loaded));
      const output = fake.onChannel(8);
      assert.equal(output.title, 'NoaCG Evening News (3)');
      assert.equal(aliasDestination(output), OUTPUT);
      assert.notEqual(output.key, manual.key);
      assert.notEqual(output.key, image.key);
      assert.ok(fake.functions.filter(f => f.params.Input).every(f => f.params.Input === output.key));
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: scoped state and renamed Unload use the persisted key, and a missing key is replaced', async () => {
  const fake = await startFakeVmix();
  const dir = await mkdtemp(join(tmpdir(), 'noacg-vmix-output-'));
  const file = join(dir, 'vmix-outputs.json');
  const makeAdapter = () => createVmixAdapter({ port: fake.port, outputs: vmixOutputStore(file) });
  const renamed = { ...item, label: 'Morning News', name: OUTPUT.replace('name=vMix', 'name=Overlay%208') };
  let key;
  let alias;
  let bridgePort;
  try {
    await withBridge(makeAdapter(), async (post, base) => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).ok, true);
      key = fake.onChannel(8).key;
      alias = new URL(fake.onChannel(8).url);
      bridgePort = Number(new URL(base).port);
    });
    await withBridge(makeAdapter(), async (post, base) => {
      assert.equal((await aliasRequest(base, alias)).headers.location, OUTPUT);
      const reading = async outputUrl => (await post('/state', { target: { adapter: 'vmix' }, outputUrl })).overlays[7];
      assert.equal((await reading(renamed.name)).ownsOutput, true);
      assert.equal((await reading(OUTPUT.replace('abc123', 'someone-else'))).ownsOutput, false);
      assert.equal((await reading(OUTPUT.replace('noacg.studio', 'example.invalid'))).ownsOutput, false);
      const secondOverlay = await act(post, { verb: 'take', item: renamed, slot: slot(3) });
      assert.match(secondOverlay.error.detail, /Unload.*overlay 8/);
      assert.equal(fake.onChannel(3), undefined);
      assert.equal((await act(post, { verb: 'out', item: renamed, slot: slot() })).ok, true);
      assert.equal(fake.onChannel(8), undefined);
      assert.equal(fake.inputs.find(input => input.key === key).title, 'NoaCG Morning News');
      assert.deepEqual(fake.functions.slice(-2).map(f => f.name), ['OverlayInput8Out', 'SetInputName']);

      fake.inputs.splice(fake.inputs.findIndex(input => input.key === key), 1);
      assert.equal((await act(post, { verb: 'take', item: renamed, slot: slot() })).ok, true);
      const replacement = fake.onChannel(8);
      assert.notEqual(replacement.key, key);
      assert.equal(replacement.title, 'NoaCG Morning News');
      const saved = await readFile(file, 'utf8');
      assert.ok(!saved.includes('abc123') && !saved.includes(key));
      assert.equal(JSON.parse(saved).ports[fake.port].keys[vmixOutputId(OUTPUT)], replacement.key);
      assert.equal((await aliasRequest(base, alias)).headers.location, OUTPUT, 'an older preset can still render');
      assert.equal((await aliasRequest(base, new URL(replacement.url))).headers.location, renamed.name);
    }, { port: bridgePort });
    await withBridge(makeAdapter(), async (_post, base) => {
      const otherPort = new URL(base).port;
      assert.equal((await aliasRequest(base, alias, { host: alias.hostname + ':' + otherPort })).status, 403);
    });
  } finally {
    await fake.stop();
    await rm(file, { force: true });
    await rmdir(dir);
  }
});


test('AC-4: a kept Browser on the old HTTP port refuses Load, but can still be unloaded', async () => {
  const fake = await startFakeVmix();
  const dir = await mkdtemp(join(tmpdir(), 'noacg-vmix-port-'));
  const file = join(dir, 'vmix-outputs.json');
  const makeAdapter = () => createVmixAdapter({ port: fake.port, outputs: vmixOutputStore(file) });
  const state = (post) => post('/state', { target: { adapter: 'vmix' }, outputUrl: OUTPUT });
  let oldPort;
  let newPort;
  let alias;
  try {
    await withBridge(makeAdapter(), async (post, base) => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).ok, true);
      oldPort = Number(new URL(base).port);
      newPort = await freePort();
      alias = new URL(fake.onChannel(8).url);
    });
    await withBridge(makeAdapter(), async (post, base) => {
      const alreadyOn = await state(post);
      const mark = fake.functions.length;
      const stillOn = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(stillOn.ok, false, JSON.stringify({ oldPort, newPort, stillOn }));
      assert.match(stillOn.error.detail, new RegExp('port ' + oldPort));
      assert.deepEqual(fake.functions.slice(mark), []);
      assert.equal(alreadyOn.overlays[7].ownsOutput, true);
      assert.equal(alreadyOn.loadProblem, stillOn.error.detail);
      assert.equal((await aliasRequest(base, alias, { host: alias.hostname + ':' + newPort })).status, 403);

      assert.equal((await act(post, { verb: 'out', item, slot: slot() })).ok, true);
      assert.deepEqual(fake.functions.slice(mark).map(f => f.name), ['OverlayInput8Out']);
      const foreign = fake.add('Browser', 'Another operator');
      fake.overlays.set(8, foreign.key);
      const take = await act(post, {
        verb: 'take', item: { ...item, label: 'Changed name' }, slot: slot(), expectedOverlayInput: foreign.key,
      });
      assert.equal(take.ok, false);
      assert.equal((await state(post)).loadProblem, take.error.detail);
      assert.equal(fake.onChannel(8).key, foreign.key);
      assert.deepEqual(fake.functions.slice(mark).map(f => f.name), ['OverlayInput8Out']);
    }, { port: newPort });
    await withBridge(makeAdapter(), async (post, base) => {
      assert.equal((await state(post)).loadProblem, undefined);
      assert.equal((await aliasRequest(base, alias)).headers.location, OUTPUT);
    }, { port: oldPort });
  } finally {
    await fake.stop();
    await rm(file, { force: true });
    await rmdir(dir);
  }
});


test('AC-4: a dropped AddInput cannot grant ownership and retry uses a fresh address', async () => {
  let oldAlias;
  const fake = await startFakeVmix({
    hook(line, socket) {
      if (!oldAlias && line.startsWith('FUNCTION AddInput ')) {
        oldAlias = addedUrl(line);
        socket.destroy();
        return true;
      }
      return false;
    },
  });
  const dir = await mkdtemp(join(tmpdir(), 'noacg-vmix-orphan-'));
  const file = join(dir, 'vmix-outputs.json');
  const makeAdapter = () => createVmixAdapter({ port: fake.port, outputs: vmixOutputStore(file) });
  let bridgePort;
  try {
    await withBridge(makeAdapter(), async (post, base) => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).error.code, 'uncertain');
      assert.equal(fake.lines.filter(line => line.startsWith('FUNCTION AddInput ')).length, 1);
      assert.equal((await aliasRequest(base, oldAlias)).status, 403);
      bridgePort = Number(new URL(base).port);
    });
    const orphan = fake.add('Browser', 'Browser ' + oldAlias.hostname);
    await withBridge(makeAdapter(), async (post, base) => {
      assert.equal((await aliasRequest(base, oldAlias)).status, 403);
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).ok, true);
      assert.equal(fake.lines.filter(line => line.startsWith('FUNCTION AddInput ')).length, 2);
      const current = fake.onChannel(8);
      assert.notEqual(current.key, orphan.key);
      assert.notEqual(new URL(current.url).hostname, oldAlias.hostname);
      assert.equal(orphan.title, 'Browser ' + oldAlias.hostname);
      assert.equal((await aliasRequest(base, new URL(current.url))).headers.location, OUTPUT);
    }, { port: bridgePort });
  } finally {
    await fake.stop();
    await rm(file, { force: true });
    await rmdir(dir);
  }
});

test('AC-4: a take without time for complete input attribution sends no AddInput', async () => {
  const fake = await startFakeVmix();
  try {
    await withBridge(createVmixAdapter({ port: fake.port, timeoutMs: 3000 }), async post => {
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.match(result.error.detail, /not enough time to add/);
      assert.deepEqual(fake.functions, []);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-1 and AC-4: a missing or blank edition cannot authorize placeholder overlays', async () => {
  let edition = '';
  const fake = await startFakeVmix({
    edition: 'Basic HD',
    transformXml: xml => xml.replace('<edition>Basic HD</edition>', edition),
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      for (edition of ['', '<edition>   </edition>']) {
        assert.equal((await post('/status', { target: { adapter: 'vmix' } })).ok, false);
        assert.equal((await act(post, { verb: 'take', item, slot: slot(8) })).ok, false);
      }
      assert.deepEqual(fake.functions, []);
    });
  } finally {
    await fake.stop();
  }
});

test('the vMix greeting uses the remaining request budget without diagnosing a non-vMix port', async () => {
  const fake = await startFakeVmix({ greeting: null });
  try {
    const adapter = createVmixAdapter({ port: fake.port, timeoutMs: 50 });
    const result = await adapter.status({ adapter: 'vmix' });
    assert.equal(result.error.setup, undefined);
    assert.match(result.error.detail, /request deadline/);
    adapter.close();
  } finally {
    await fake.stop();
  }
});

test('a queued same-slot HTTP vMix action uses its original deadline', async t => {
  const command = Promise.withResolvers();
  const second = Promise.withResolvers();
  const fake = await startFakeVmix({
    hook(line, socket) {
      if (line !== 'FUNCTION OverlayInput8Out') return false;
      fake.overlays.delete(8);
      command.resolve(socket);
      return true;
    },
  });
  const output = fake.add('Browser', 'NoaCG Evening News');
  fake.overlays.set(8, output.key);
  const outputs = vmixOutputStore();
  await outputs.save(fake.port, { keys: { [vmixOutputId(OUTPUT)]: output.key } });
  const memory = new SlotMemoryBank();
  const serial = memory.serial.bind(memory);
  let arrivals = 0;
  t.mock.method(memory, 'serial', (...args) => {
    if (++arrivals === 2) second.resolve();
    return serial(...args);
  });
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  try {
    await withBridge(createVmixAdapter({ port: fake.port, outputs }), async post => {
      const action = { verb: 'out', item, slot: slot(8) };
      const first = act(post, action);
      const socket = await command.promise;
      const queued = act(post, action);
      await second.promise;
      now += 7001;
      socket.write('FUNCTION OK Completed\r\n');
      const [sent, expired] = await Promise.all([first, queued]);
      assert.equal(sent.error.code, 'uncertain', 'the first Out was sent without confirmed readback');
      assert.equal(expired.error.code, 'unreachable');
      assert.equal(expired.error.setup, undefined);
      assert.match(expired.error.detail, /request deadline/);
      assert.deepEqual(fake.lines, ['XML', 'XML', 'FUNCTION OverlayInput8Out']);
    }, { memory });
  } finally {
    await fake.stop();
  }
});

for (const verb of ['out', 'take']) {
  test('AC-4: a queued reading cannot interleave with the final ' + verb + ' check', async () => {
    let armed = false;
    let reads = 0;
    let queuedReading;
    const target = { adapter: 'vmix' };
    const fake = await startFakeVmix({
      hook(line) {
        if (!armed || line !== 'XML') return false;
        if (++reads === 2) queuedReading = verb === 'out' ? adapter.status(target) : adapter.overlays(target, OUTPUT);
        if (reads === 3) fake.overlays.set(8, foreign.key);
        return false;
      },
    });
    const foreign = fake.add('Image', 'Operator sponsor');
    const adapter = createVmixAdapter({ port: fake.port });
    const take = { verb: 'take', item, slot: slot(8) };
    try {
      assert.equal((await adapter.act(target, take, directTestContext)).ok, true);
      const key = fake.onChannel(8).key;
      if (verb === 'take') assert.equal((await adapter.act(target, { ...take, verb: 'out' })).ok, true);
      const start = fake.lines.length;
      armed = true;
      const result = await adapter.act(target, verb === 'take' ? { ...take, expectedOverlayInput: null } : { ...take, verb }, directTestContext);
      assert.equal((await queuedReading).ok, true);
      assert.equal(fake.onChannel(8), foreign);
      assert.equal(result.ok, verb === 'out');
      if (verb === 'take') assert.equal(result.error.code, 'uncertain');
      const mutation = verb === 'out' ? 'OverlayInput8Out' : 'OverlayInput8In Input=' + key;
      assert.deepEqual(fake.lines.slice(start), ['XML', 'XML', 'FUNCTION ' + mutation, 'XML', 'XML']);
    } finally {
      adapter.close();
      await fake.stop();
    }
  });
}

test('AC-4: an overlay change during a prepared Load is left alone', async () => {
  const fake = await startFakeVmix({
    hook(line) {
      if (line.startsWith('FUNCTION SetInputName ')) fake.overlays.set(8, operator.key);
      return false;
    },
  });
  const operator = fake.add('Image', 'Live bug');
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const result = await act(post, { verb: 'take', item, slot: slot(), expectedOverlayInput: null });
      assert.match(result.error.detail, /overlay 8 changed/);
      assert.equal(fake.onChannel(8), operator);
      assert.deepEqual(fake.functions.map(f => f.name), ['AddInput', 'SetInputName']);
    });
  } finally {
    await fake.stop();
  }
});

test('a version-marked token only authorizes vMix /act and still needs the paired secret', async () => {
  const fake = await startFakeVmix();
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const target = { adapter: 'vmix' };
      const request = { target, action: { verb: 'take', item, slot: slot(), expectedOverlayInput: null } };
      const marked = VMIX_OUTPUT_TOKEN_PREFIX + 't';
      assert.equal((await post('/status', { target }, marked)).ok, false);
      assert.equal((await post('/act', { ...request, target: { adapter: 'casparcg', host: '127.0.0.1' } }, marked)).ok, false);
      assert.equal((await post('/act', request, VMIX_OUTPUT_TOKEN_PREFIX + 'wrong')).ok, false);
      assert.deepEqual(fake.functions, []);
      assert.equal((await post('/act', request, marked)).ok, true);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: failed storage cannot acquire or rename an output', async () => {
  const fake = await startFakeVmix();
  const dir = await mkdtemp(join(tmpdir(), 'noacg-vmix-corrupt-'));
  const file = join(dir, 'vmix-outputs.json');
  const newer = '{"v":99,"ports":{},"redirects":{}}';
  try {
    await writeFile(file, newer);
    await withBridge(createVmixAdapter({ port: fake.port, outputs: vmixOutputStore(file) }), async post => {
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.match(result.error.detail, /could not read or keep/);
      assert.deepEqual(fake.functions, []);
      assert.equal(await readFile(file, 'utf8'), newer);
    });
    const memory = vmixOutputStore();
    await withBridge(createVmixAdapter({ port: fake.port, outputs: {
      ...memory,
      save() { throw Error('Disk write failed after AddInput'); },
    } }), async (post, base) => {
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(result.error.code, 'uncertain');
      assert.deepEqual(fake.functions.map(f => f.name), ['AddInput']);
      assert.equal(fake.onChannel(8), undefined);
      assert.equal((await aliasRequest(base, new URL(fake.inputs[0].url))).status, 403);
    });
  } finally {
    await fake.stop();
    await rm(file, { force: true });
    await rmdir(dir);
  }
});

test("AC-4: Take off and Clear act only when the channel holds the output, with the channel's own Out or Off", async () => {
  const fake = await startFakeVmix({ outDelayMs: 200 });
  const other = fake.add('Image', 'Sponsor bug');
  try {
    const vmix = createVmixAdapter({ port: fake.port });
    const t = { adapter: 'vmix' };
    // Nothing on the channel: already off, nothing sent.
    let r = await vmix.act(t, { verb: 'out', item, slot: slot(8) });
    assert.deepEqual([r.ok, r.raw], [true, 'already off: overlay 8 holds nothing']);
    // The operator's own input on the channel: left alone.
    fake.overlays.set(8, other.key);
    r = await vmix.act(t, { verb: 'out', item, slot: slot(8) });
    assert.deepEqual([r.ok, r.raw], [true, 'already off: overlay 8 holds "Sponsor bug"']);
    r = await vmix.act(t, { verb: 'clear', item, slot: slot(8) });
    assert.equal(r.ok, true);
    assert.equal(fake.onChannel(8), other);
    assert.deepEqual(fake.functions, []);
    // The output on it: Out with the channel's transition, Clear at once.
    r = await vmix.act(t, { verb: 'take', item, slot: slot(8) }, directTestContext);
    assert.equal(r.ok, true);
    const output = fake.onChannel(8);
    fake.functions.length = 0;
    r = await vmix.act(t, { verb: 'out', item, slot: slot(8) });
    assert.equal(r.ok, true);
    fake.overlays.set(8, output.key);
    r = await vmix.act(t, { verb: 'clear', item, slot: slot(8) });
    assert.equal(r.ok, true);
    assert.deepEqual(
      fake.functions.map((f) => f.name),
      ['OverlayInput8Out', 'OverlayInput8Off'],
    );
    // A channel this vMix does not have is refused after the one read that says so.
    const v28 = await startFakeVmix({ version: '28.0.0.42', edition: '4K' });
    const r28 = await createVmixAdapter({ port: v28.port }).act(t, { verb: 'take', item, slot: slot(5) });
    assert.match(r28.error.detail, /overlay channels 1 to 4/);
    assert.deepEqual(v28.lines, ['XML']);
    await v28.stop();
    vmix.close();
  } finally {
    await fake.stop();
  }
});

test('AC-4: a take, Take off or Clear without the production title sends nothing', async () => {
  const fake = await startFakeVmix();
  try {
    const vmix = createVmixAdapter({ port: fake.port });
    for (const action of [
      { verb: 'take', item: { kind: 'url', name: OUTPUT }, slot: slot(8) },
      { verb: 'out', slot: slot(8) },
      { verb: 'clear', slot: slot(8) },
    ]) {
      const r = await vmix.act({ adapter: 'vmix' }, action);
      assert.equal(r.error.code, 'usage', action.verb);
    }
    const r = await vmix.act({ adapter: 'vmix' }, { verb: 'take', item: { ...item, name: 'file:///C:/x.html' }, slot: slot(8) });
    assert.match(r.error.detail, /http or https/);
    assert.equal(fake.connections, 0);
  } finally {
    await fake.stop();
  }
});

// ── failure never airs anything ─────────────────────────────────────────────────────

test('every verb vMix cannot honour is refused before anything is sent', async () => {
  const fake = await startFakeVmix();
  try {
    const vmix = createVmixAdapter({ port: fake.port });
    const t = { adapter: 'vmix' };
    for (const action of [
      { verb: 'update', slot: slot(), data: { f0: 'x' } },
      { verb: 'next', slot: slot() },
      { verb: 'pause', slot: slot() },
      { verb: 'resume', slot: slot() },
      { verb: 'take', item: { kind: 'template', name: 'lower-third', label: TITLE }, slot: slot() },
      { verb: 'take', item: { kind: 'media', name: 'clip', label: TITLE }, slot: slot() },
      { verb: 'sequence', slot: slot(), entries: [] },
      { verb: 'ending', slot: slot(), item: { kind: 'media', name: 'clip' } },
    ]) {
      const r = await vmix.act(t, action);
      assert.equal(r.error.code, 'unsupported', `${action.verb} ${action.item?.kind ?? ''}`);
    }
    assert.equal((await vmix.list(t, 'media')).error.code, 'unsupported');
    assert.equal((await vmix.thumbnail(t, 'x')).error.code, 'unsupported');
    assert.equal(fake.connections, 0);
  } finally {
    await fake.stop();
  }
});

test('a connection dropped mid-function answers uncertain, nothing is resent, and the next request reconnects', async () => {
  let dropped = 0;
  const fake = await startFakeVmix({
    hook: (line, sock) => {
      if (line.startsWith('FUNCTION OverlayInput') && dropped === 0) {
        dropped += 1;
        sock.destroy();
        return true;
      }
      return false;
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post, base) => {
      const r = await act(post, { verb: 'take', item, slot: slot(8) });
      assert.equal(r.ok, false);
      assert.equal(r.error.code, 'uncertain');
      assert.match(r.error.detail, /look at vMix before trying again/);
      const status = await post('/status', { target: { adapter: 'vmix' } });
      assert.equal(status.ok, true);
      assert.equal(fake.connections, 2);
      assert.equal(fake.lines.filter((l) => l.startsWith('FUNCTION OverlayInput')).length, 1, 'never sent twice');
    });
  } finally {
    await fake.stop();
  }
});

test('a function vMix never answers is uncertain after the reply wait, and a refusal is refused', async () => {
  const fake = await startFakeVmix({
    hook: (line, sock) => {
      if (line.startsWith('FUNCTION OverlayInput8In')) return true; // silence
      if (line.startsWith('FUNCTION OverlayInput7In')) {
        sock.write('FUNCTION ER Input not found\r\n');
        return true;
      }
      return false;
    },
  });
  try {
    const vmix = createVmixAdapter({ port: fake.port, replyMs: 300 });
    const r = await vmix.act({ adapter: 'vmix' }, { verb: 'take', item, slot: slot(8) }, directTestContext);
    assert.equal(r.error.code, 'uncertain');
    const er = await vmix.act({ adapter: 'vmix' }, { verb: 'take', item, slot: slot(7) }, directTestContext);
    assert.equal(er.error.code, 'refused');
    assert.match(er.error.detail, /FUNCTION ER Input not found/);
    vmix.close();
  } finally {
    await fake.stop();
  }
});

test('vMix closing reads not-running until it is back', async () => {
  const fake = await startFakeVmix();
  const vmix = createVmixAdapter({ port: fake.port });
  assert.equal((await vmix.status({ adapter: 'vmix' })).ok, true);
  await fake.stop();
  const closed = await vmix.status({ adapter: 'vmix' });
  assert.equal(closed.error.setup, 'not-running');
  const back = await startFakeVmix({ port: fake.port });
  try {
    assert.equal((await vmix.status({ adapter: 'vmix' })).ok, true);
  } finally {
    vmix.close();
    await back.stop();
  }
});

test('one connection serves every reading and every action, with subscription lines between replies', async () => {
  // As measured: an overlay line arrives before the FUNCTION OK of the call that caused it.
  const fake = await startFakeVmix({ actsAlways: true });
  fake.add('Image', 'Sponsor bug');
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post) => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot(8) })).ok, true);
      const state = await post('/state', { target: { adapter: 'vmix' } });
      assert.equal(state.ok, true);
      assert.equal(state.overlays.length, 8);
      assert.deepEqual(state.overlays[7].input, { key: fake.onChannel(8).key, number: 2, title: 'NoaCG Evening News', type: 'Browser' });
      assert.equal(state.overlays[0].input, undefined);
      assert.deepEqual(state.linked, []);
      await Promise.all([post('/state', { target: { adapter: 'vmix' } }), post('/status', { target: { adapter: 'vmix' } }), act(post, { verb: 'out', item, slot: slot(8) })]);
      assert.equal(fake.onChannel(8), undefined);
      assert.equal(fake.connections, 1);
    });
  } finally {
    await fake.stop();
  }
});
