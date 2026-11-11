// NoaCG Bridge's vMix adapter (cli/src/playout/adapters/vmix.ts, docs/work-specs/bridge-vmix-adapter):
// finding vMix on this computer (AC-1), putting the output on an overlay channel and taking it off
// (AC-3), and the failures that must never air anything (AC-6), against a fake vMix TCP API that
// answers the way vMix 29.0.0.49 did (./_fakeVmix.mjs). Run `npm run build` first.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, realpath, rm, rmdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createVmixAdapter, functionLine, outputInputName, titleOf } from '../dist/playout/adapters/vmix.js';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { createBridgeServer, readAction, readTarget } from '../dist/playout/server.js';
import { VMIX_OUTPUT_TOKEN_PREFIX, vmixOverlayCount } from '../dist/playout/protocol.js';
import { SlotMemoryBank } from '../dist/playout/slots.js';
import { parseVmixXml, VmixConnection } from '../dist/playout/vmixTcp.js';
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

const XML_INPUT_KEY = '913caefe-1c82-4548-85c5-fecde6369290';
const XML_INPUT = `<input key="${XML_INPUT_KEY}" number="1" type="Browser" title="Browser marker">Input body</input>`;
const XML_STATE = '<vmix><version>29.0.0.49</version><edition>Trial</edition>' +
  `<inputs>${XML_INPUT}</inputs><overlays><overlay number="7" /><overlay number="8">1</overlay></overlays></vmix>`;

test('vMix state requires well-formed XML throughout the entire frame', () => {
  const invalid = {
    'bare ampersand in input text': XML_STATE.replace('Input body', 'Input & body'),
    'undefined entity in input text': XML_STATE.replace('Input body', 'Input &unknown;'),
    'invalid input comment': XML_STATE.replace('Input body', '<!-- body -- comment -->'),
    'invalid character in input text': XML_STATE.replace('Input body', 'Input\u0001body'),
    'invalid text delimiter': XML_STATE.replace('Input body', 'Input ]]> body'),
    'invalid reference in a nested layer': XML_STATE.replace('Input body', '<layer>&#xD800;</layer>'),
    'undefined entity in an ignored section': XML_STATE.replace('</vmix>', '<audio>&unknown;</audio></vmix>'),
    'invalid comment after the root': XML_STATE + '<!-- bad -- comment -->',
    'unfinished tail after the root': XML_STATE + '<tail',
    'second root': XML_STATE + '<vmix />',
    'missing root close': XML_STATE.replace('</vmix>', ''),
    'DTD': '<!DOCTYPE vmix [<!ELEMENT vmix ANY>]>' + XML_STATE,
    'external DTD': '<!DOCTYPE vmix SYSTEM "urn:vmix-test:doctype">' + XML_STATE,
    'other declared encoding': '<?xml version="1.0" encoding="UTF-16"?>' + XML_STATE,
    'other XML version': '<?xml version="1.1"?>' + XML_STATE,
    'unbound attribute prefix': XML_STATE.replace(' type=', ' type-prefix:label="extra" type='),
    'malformed attribute prefix': XML_STATE.replace(' type=', ' :label="extra" type='),
    'unbound element prefix in ignored data': XML_STATE.replace('Input body', '<extra:layer />'),
    'invalid bound attribute local name': XML_STATE.replace('Input body', '<layer xmlns:m="urn:meta" m:1label="extra" />'),
    'invalid bound element local name': XML_STATE.replace('Input body', '<m:1layer xmlns:m="urn:meta" />'),
    'duplicate expanded attributes': XML_STATE.replace('Input body', '<layer xmlns:a="urn:meta" xmlns:b="urn:meta" a:n="1" b:n="2" />'),
    'namespaced root': XML_STATE.replace('<vmix>', '<vmix xmlns="urn:meta">'),
    'namespaced state table': XML_STATE.replace('<inputs>', '<inputs xmlns="urn:meta">'),
    'namespaced input row': XML_STATE.replace('<input ', '<input xmlns="urn:meta" '),
    'namespaced overlay row': XML_STATE.replace('<overlay number="7"', '<overlay xmlns="urn:meta" number="7"'),
    'namespaced input key': XML_STATE.replace('<input key=', '<input xmlns:m="urn:meta" m:key='),
    'namespaced overlay number': XML_STATE.replace('<overlay number="7"', '<overlay xmlns:m="urn:meta" m:number="7"'),
    'duplicate input number': XML_STATE.replace(XML_INPUT, XML_INPUT + XML_INPUT.replace(XML_INPUT_KEY, 'a13caefe-1c82-4548-85c5-fecde6369290')),
    'CDATA overlay occupant': XML_STATE.replace('>1</overlay>', '><![CDATA[1]]></overlay>'),
    'comment in empty overlay': XML_STATE.replace('number="7" />', 'number="7"><!-- empty --></overlay>'),
    'processing instruction in overlay occupant': XML_STATE.replace('>1</overlay>', '><?mixer field?>1</overlay>'),
    'markup in version': XML_STATE.replace('29.0.0.49', '29.<!-- version -->0.0.49'),
    'child in edition': XML_STATE.replace('Trial', '<name>Trial</name>'),
    'excessive nesting': XML_STATE.replace('Input body', '<layer>'.repeat(128) + '</layer>'.repeat(128)),
  };
  for (const [description, xml] of Object.entries(invalid)) assert.equal(parseVmixXml(xml), undefined, description);
});

test('vMix state accepts real text and nested records without projecting lookalikes', () => {
  const xml = parseVmixXml('\uFEFF<?xml version="1.0" encoding="UTF-8"?><!-- vMix -->' + XML_STATE
    .replace('Browser marker', 'Mélange 🎬 &amp; &quot;screen&quot; &amp;lt;')
    .replace('Input body', 'Input &amp; body<overlay index="1" /><m:entrée xmlns:m="urn:meta" m:title="Nested"><inputs><input /></inputs></m:entrée>')
    .replace('</vmix>', '<metadata><overlays><overlay number="8" /></overlays><![CDATA[metadata]]></metadata></vmix>') + '<!-- done -->');
  assert.deepEqual(xml?.inputs, [{ key: XML_INPUT_KEY, number: 1, type: 'Browser', title: 'Mélange 🎬 & "screen" &lt;' }]);
  assert.deepEqual([...xml.reportedOverlays], [7, 8]);
  assert.deepEqual([...xml.overlays], [[8, 1]]);
});

test('the compiled Bridge rejects malformed XML frame headers and invalid UTF-8', async () => {
  const valid = Buffer.from(XML_STATE);
  const invalid = Buffer.concat([Buffer.from(XML_STATE.replace('</vmix>', '<audio>')), Buffer.from([0xc3]), Buffer.from('</audio></vmix>')]);
  let body = invalid;
  let headerSuffix = '';
  const fake = await startFakeVmix({
    hook(line, socket) {
      if (line !== 'XML') return false;
      socket.write(`XML ${body.length}${headerSuffix}\r\n`);
      socket.write(body);
      return true;
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const status = () => post('/status', { target: { adapter: 'vmix' } });
      assert.equal((await status()).ok, false, 'invalid UTF-8 in ignored XML');
      body = valid;
      headerSuffix = ' extra';
      assert.equal((await status()).ok, false, 'extra word in the XML success header');
      headerSuffix = '';
      assert.equal((await status()).vmix.version, '29.0.0.49');
      assert.deepEqual(fake.functions, []);
    });
  } finally {
    await fake.stop();
  }
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
      const repeated = await act(post, { verb: 'take', item, slot: slot(8), expectedOverlayInput: output.key });
      assert.match(repeated.error?.detail, /cannot verify the current vMix Browser page/);
      assert.equal(fake.functions.length, 3, 'a second take of the live Browser sends no function');

      await act(post, { verb: 'out', item, slot: slot(8) });
      const again = await act(post, { verb: 'take', item, slot: slot(8) });
      assert.equal(again.error?.code, 'refused');
      assert.equal(fake.inputs.filter((i) => i.title === 'NoaCG Evening News').length, 1);
      assert.deepEqual(fake.functions.slice(3), [{ name: 'OverlayInput8Out', params: {} }]);

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

test('AC-4: delayed XML still supplies the complete final observation after AddInput', async () => {
  const fake = await startFakeVmix({ xmlDelayMs: 180 });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const reply = await act(post, { verb: 'take', item, slot: slot(8), expectedOverlayInput: null });
      assert.equal(reply.ok, true, JSON.stringify(reply));
      assert.equal(fake.onChannel(8)?.title, 'NoaCG Evening News');
      assert.deepEqual(fake.functions.map(f => f.name), ['AddInput', 'SetInputName', 'OverlayInput8In']);
    });
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
    assert.equal(r.error.browserAdded, undefined);
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

test('AC-4: malformed XML after a valid marked observation leaves no durable ownership', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'noacg-vmix-xml-'));
  const file = join(folder, 'vmix-outputs.json');
  let observations = 0;
  const fake = await startFakeVmix({
    transformXml(xml) {
      if (!fake.functions.some(fn => fn.name === 'AddInput')) return xml;
      observations += 1;
      return observations === 1 ? xml : xml + '<!-- bad -- trailing comment -->';
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port, outputs: vmixOutputStore(file) }), async (post, base) => {
      const result = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(result.error?.code, 'uncertain', JSON.stringify(result));
      assert.equal(observations, 2);
      assert.deepEqual(fake.functions.map(fn => fn.name), ['AddInput']);
      assert.equal(fake.onChannel(8), undefined);
      await assert.rejects(readFile(file), { code: 'ENOENT' });
      const alias = addedUrl(fake.lines.find(line => line.startsWith('FUNCTION AddInput ')));
      assert.equal((await aliasRequest(base, alias)).status, 403);
    });
  } finally {
    await fake.stop();
    await rm(folder, { recursive: true, force: true });
  }
});

test('AC-4: incomplete Out readback leaves the result uncertain and sends no other function', async () => {
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
      assert.equal(result.error.browserAdded, true);
      assert.match(result.error.detail, /added the Browser input.*could not confirm it/);
      assert.doesNotMatch(result.error.detail, /did not put it on overlay 8/);
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
  const fake = await startFakeVmix({
    hook(line) {
      if (line.startsWith('FUNCTION SetInputName ')) {
        fake.overlays.set(8, fake.inputs.find(input => input.type === 'Browser').key);
        hide = true;
      }
      return false;
    },
    transformXml: xml => hide ? xml.replace(/<overlay number="8">[^<]+<\/overlay>/, '') : xml,
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const result = await act(post, { verb: 'take', item, slot: slot(3), expectedOverlayInput: null });
      assert.equal(result.ok, false);
      assert.match(result.error.detail, /overlay 8/i);
      assert.equal(fake.onChannel(8), fake.inputs.find(input => input.type === 'Browser'));
      assert.equal(fake.onChannel(3), undefined);
      assert.deepEqual(fake.functions.map(fn => fn.name), ['AddInput', 'SetInputName']);
    });
  } finally {
    await fake.stop();
  }
});

test('AC-4: a kept key identifies overlay occupancy and cannot verify a Browser source', async () => {
  const fake = await startFakeVmix();
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async (post, base) => {
      const command = (verb, expectedOverlayInput) => act(post, {
        verb, item, slot: slot(), ...(verb === 'take' ? { expectedOverlayInput } : {}),
      });
      assert.equal((await command('take', null)).ok, true);
      const kept = fake.onChannel(8);
      const alias = new URL(kept.url);
      assert.equal((await aliasRequest(base, alias)).status, 302);
      kept.url = 'https://example.org/operator-page';
      const count = fake.inputs.length;

      const cases = [
        { verb: 'take', type: 'Browser', occupied: 8, functions: [], refusal: /cannot verify/ },
        { verb: 'take', type: 'Browser', occupied: 3, functions: [], refusal: /cannot verify/ },
        { verb: 'take', type: 'Browser', occupied: null, functions: [], refusal: /cannot verify/ },
        { verb: 'take', type: 'Image', occupied: 8, functions: [], refusal: /no longer a Browser/ },
        { verb: 'out', type: 'Browser', occupied: 8, functions: ['OverlayInput8Out'] },
        { verb: 'out', type: 'Browser', occupied: 3, functions: [] },
        { verb: 'out', type: 'Image', occupied: 8, functions: [] },
        { verb: 'clear', type: 'Browser', occupied: 8, functions: ['OverlayInput8Off'] },
        { verb: 'clear', type: 'Image', occupied: 8, functions: [] },
      ];
      for (const { verb, type, occupied, functions, refusal } of cases) {
        fake.overlays.clear();
        kept.type = type;
        if (occupied !== null) fake.overlays.set(occupied, kept.key);
        const mark = fake.functions.length;
        const state = await post('/state', { target: { adapter: 'vmix' }, outputUrl: OUTPUT });
        assert.equal(state.ok, true);
        assert.deepEqual(state.overlays.filter(row => row.ownsOutput).map(row => row.overlay),
          type === 'Browser' && occupied !== null ? [occupied] : []);
        const result = await command(verb, occupied === 8 ? kept.key : null);
        if (refusal) {
          assert.equal(result.error?.code, 'refused');
          assert.match(result.error.detail, refusal);
          assert.equal(state.loadProblem, result.error.detail);
        } else assert.equal(result.ok, true, JSON.stringify({ verb, type, occupied, result }));
        assert.deepEqual(fake.functions.slice(mark).map(fn => fn.name), functions);
        assert.equal(fake.inputs.length, count);
        assert.equal(kept.title, 'NoaCG Evening News');
        assert.equal(kept.url, 'https://example.org/operator-page');
        assert.equal(fake.onChannel(8), occupied === 8 && functions.length === 0 ? kept : undefined);
      }
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

test('AC-4: scoped state and Unload use the persisted key, and a missing key is replaced', async () => {
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
      assert.match(secondOverlay.error.detail, /cannot verify the current vMix Browser page/);
      assert.equal(fake.onChannel(3), undefined);
      assert.equal((await act(post, { verb: 'out', item: renamed, slot: slot() })).ok, true);
      assert.equal(fake.onChannel(8), undefined);
      assert.equal(fake.inputs.find(input => input.key === key).title, 'NoaCG Evening News');
      assert.equal(fake.functions.at(-1).name, 'OverlayInput8Out');
      assert.equal(fake.functions.filter(f => f.name === 'SetInputName').length, 1);

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


test('AC-4: a kept input that reappears during a replacement stops Load', async () => {
  let restored;
  let reappear;
  const fake = await startFakeVmix({
    hook(line) {
      if ((reappear === 'add' && line.startsWith('FUNCTION AddInput ')) ||
          (reappear === 'name' && line.startsWith('FUNCTION SetInputName '))) {
        fake.inputs.push(restored);
      }
      return false;
    },
  });
  const store = vmixOutputStore();
  const outputs = {
    ...store,
    async read(port) {
      if (reappear === 'read') fake.inputs.push(restored);
      return store.read(port);
    },
  };
  try {
    await withBridge(createVmixAdapter({ port: fake.port, outputs }), async post => {
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).ok, true);
      restored = fake.onChannel(8);
      assert.equal((await act(post, { verb: 'out', item, slot: slot() })).ok, true);
      const mark = fake.functions.length;
      fake.inputs.pop();
      reappear = 'read';
      const beforeAdd = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(beforeAdd.error?.code, 'refused');
      assert.equal(beforeAdd.error.browserAdded, undefined);
      assert.doesNotMatch(beforeAdd.error.detail, /added the Browser input/);
      assert.deepEqual(fake.functions.slice(mark), []);
      fake.inputs.pop();
      reappear = 'add';
      const beforeSave = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(beforeSave.error?.code, 'uncertain');
      assert.equal(beforeSave.error.browserAdded, true);
      assert.match(beforeSave.error.detail, /added the Browser input.*did not put it on overlay 8.*old input returned/);
      assert.deepEqual(fake.functions.slice(mark).map(fn => fn.name), ['AddInput']);
      assert.equal(fake.onChannel(8), undefined);
      assert.equal((await store.read(fake.port)).keys[vmixOutputId(OUTPUT)], restored.key);
      fake.inputs.length = 0;
      reappear = 'name';
      const afterSave = await act(post, { verb: 'take', item, slot: slot() });
      assert.equal(afterSave.error?.code, 'uncertain');
      assert.equal(afterSave.error.browserAdded, true);
      assert.match(afterSave.error.detail, /added the Browser input.*did not put it on overlay 8.*old input returned/);
      assert.deepEqual(fake.functions.slice(mark).map(fn => fn.name), ['AddInput', 'AddInput', 'SetInputName']);
      assert.equal(fake.onChannel(8), undefined);
      const current = fake.inputs.find(input => input.key !== restored.key);
      assert.equal((await store.read(fake.port)).keys[vmixOutputId(OUTPUT)], current.key);
    });
  } finally {
    await fake.stop();
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
        verb: 'take', item: { ...item, label: 'Changed name' }, slot: slot(), expectedOverlayInput: foreign.key.toUpperCase(),
      });
      assert.equal(take.ok, false);
      assert.equal((await state(post)).loadProblem, take.error.detail);
      assert.equal(fake.onChannel(8).key, foreign.key);
      assert.deepEqual(fake.functions.slice(mark).map(f => f.name), ['OverlayInput8Out']);
    }, { port: newPort });
    await withBridge(makeAdapter(), async (post, base) => {
      const restored = await state(post);
      assert.match(restored.loadProblem, /cannot verify the current vMix Browser page/);
      assert.doesNotMatch(restored.loadProblem, /uses NoaCG Bridge port/);
      assert.equal((await aliasRequest(base, alias)).headers.location, OUTPUT);
      const mark = fake.functions.length;
      assert.equal((await act(post, { verb: 'take', item, slot: slot() })).error?.code, 'refused');
      assert.deepEqual(fake.functions.slice(mark), []);
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

for (const failedAt of ['naming', 'naming refusal', 'before Overlay In', 'In refusal', 'after Overlay In']) {
  test('AC-4: a failed Load reports the Browser already added ' + failedAt, async t => {
    const realNow = Date.now.bind(Date);
    let advance = 0;
    t.mock.method(Date, 'now', () => realNow() + advance);
    const fake = await startFakeVmix({
      transformXml(xml) {
        if (failedAt === 'before Overlay In' && fake.functions.some(f => f.name === 'SetInputName')) advance = 8000;
        return xml;
      },
      hook(line, socket) {
        if ((failedAt === 'naming refusal' && line.startsWith('FUNCTION SetInputName ')) ||
          (failedAt === 'In refusal' && line.startsWith('FUNCTION OverlayInput8In '))) {
          socket.write('FUNCTION ER Refused\r\n');
          return true;
        }
        if (failedAt === 'after Overlay In' && line.startsWith('FUNCTION OverlayInput8In ')) {
          socket.destroy();
          return true;
        }
        return false;
      },
    });
    const stored = vmixOutputStore();
    const outputs = {
      ...stored,
      async save(...args) {
        await stored.save(...args);
        if (failedAt === 'naming') advance = 8000;
      },
    };
    try {
      await withBridge(createVmixAdapter({ port: fake.port, outputs }), async post => {
        const reply = await act(post, { verb: 'take', item, slot: slot() });
        assert.equal(reply.ok, false);
        const refusal = failedAt.endsWith('refusal');
        assert.equal(reply.error.code, failedAt === 'after Overlay In' ? 'uncertain' : refusal ? 'refused' : 'unreachable');
        if (refusal) assert.equal(reply.error.raw, 'FUNCTION ER Refused');
        assert.equal(reply.error.browserAdded, true);
        assert.match(reply.error.detail, /added the Browser input/);
        assert.doesNotMatch(reply.error.detail, /Nothing changed/);
        assert.equal(fake.inputs.length, 1);
        assert.equal((await outputs.read(fake.port)).keys[vmixOutputId(OUTPUT)], fake.inputs[0].key);
        assert.equal(fake.onChannel(8), undefined);
        const sent = fake.lines.filter(line => line.startsWith('FUNCTION ')).map(line => line.split(' ')[1]);
        assert.deepEqual(sent, [
          'AddInput', ...(failedAt === 'naming' ? [] : ['SetInputName']),
          ...(['In refusal', 'after Overlay In'].includes(failedAt) ? ['OverlayInput8In'] : []),
        ]);
        if (failedAt === 'after Overlay In') {
          assert.match(reply.error.detail, /may have acted/);
          assert.doesNotMatch(reply.error.detail, /did not put it on overlay 8/);
        } else {
          assert.match(reply.error.detail, /did not put it on overlay 8/);
        }
      });
    } finally {
      await fake.stop();
    }
  });
}

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
    let finalReadAt;
    let queuedReading;
    const target = { adapter: 'vmix' };
    const fake = await startFakeVmix({
      hook(line) {
        if (!armed) return false;
        if (verb === 'take' && line.startsWith('FUNCTION SetInputName ')) finalReadAt = fake.lines.length;
        if (line !== 'XML' || (verb === 'take' && finalReadAt === undefined)) return false;
        const finalRead = verb === 'out' ? 2 : 1;
        if (++reads === finalRead) queuedReading = verb === 'out' ? adapter.status(target) : adapter.overlays(target, OUTPUT);
        if (reads === finalRead + 1) fake.overlays.set(8, foreign.key);
        return false;
      },
    });
    const foreign = fake.add('Image', 'Operator sponsor');
    const adapter = createVmixAdapter({ port: fake.port });
    const take = { verb: 'take', item, slot: slot(8) };
    try {
      if (verb === 'out') assert.equal((await adapter.act(target, take, directTestContext)).ok, true);
      const start = fake.lines.length;
      armed = true;
      const result = await adapter.act(target, verb === 'take' ? { ...take, expectedOverlayInput: null } : { ...take, verb }, directTestContext);
      assert.equal((await queuedReading).ok, true);
      assert.equal(fake.onChannel(8), foreign);
      assert.equal(result.ok, verb === 'out');
      if (verb === 'take') assert.equal(result.error.code, 'uncertain');
      if (verb === 'out') {
        assert.deepEqual(fake.lines.slice(start), ['XML', 'XML', 'FUNCTION OverlayInput8Out', 'XML', 'XML']);
      } else {
        const key = fake.inputs.find(input => input.type === 'Browser').key;
        assert.deepEqual(fake.lines.slice(finalReadAt), ['XML', 'FUNCTION OverlayInput8In Input=' + key, 'XML', 'XML']);
        assert.deepEqual(fake.functions.map(fn => fn.name), ['AddInput', 'SetInputName', 'OverlayInput8In']);
      }
    } finally {
      adapter.close();
      await fake.stop();
    }
  });
}

for (const [problem, cause, code] of [
  ['malformed XML', /XML with something that is not its state/, 'refused'],
  ['selected overlay changed', /overlay 8 changed/, 'refused'],
  ['Browser renamed', /did not confirm the name/, 'uncertain'],
  ['Browser removed', /did not confirm the name/, 'uncertain'],
  ['Browser on another overlay', /Unload the Browser from vMix overlay 7/, 'refused'],
]) {
  test('AC-4: a prepared Load reports the Browser and preserves recovery after ' + problem, async () => {
    let browser;
    const fake = await startFakeVmix({
      hook(line) {
        if (line.startsWith('FUNCTION SetInputName ')) browser = fake.inputs.find(input => input.type === 'Browser');
        if (line !== 'XML' || !browser) return false;
        if (problem === 'selected overlay changed') fake.overlays.set(8, operator.key);
        if (problem === 'Browser renamed') browser.title = 'Operator title';
        if (problem === 'Browser removed') fake.inputs.pop();
        if (problem === 'Browser on another overlay') fake.overlays.set(7, browser.key);
        return false;
      },
      transformXml: xml => browser && problem === 'malformed XML'
        ? xml.replace('</vmix>', '<audio>&unknown;</audio></vmix>')
        : xml,
    });
    const operator = fake.add('Image', 'Live bug');
    const dir = await mkdtemp(join(tmpdir(), 'noacg-vmix-partial-'));
    const file = join(dir, 'vmix-outputs.json');
    const outputs = vmixOutputStore(file);
    try {
      await withBridge(createVmixAdapter({ port: fake.port, outputs }), async (post, base) => {
        const result = await act(post, { verb: 'take', item, slot: slot(), expectedOverlayInput: null });
        assert.equal(result.error.hop, 'target');
        assert.equal(result.error.code, code);
        assert.equal(result.error.browserAdded, true);
        assert.match(result.error.detail, /vMix added the Browser input.*did not put it on overlay 8/);
        assert.match(result.error.detail, cause);
        if (problem === 'malformed XML') assert.match(result.error.raw, /^XML \d+$/);
        assert.equal(fake.onChannel(8), problem === 'selected overlay changed' ? operator : undefined);
        assert.deepEqual(fake.functions.map(f => f.name), ['AddInput', 'SetInputName']);
        assert.equal((await vmixOutputStore(file).read(fake.port)).keys[vmixOutputId(OUTPUT)], browser.key);
        assert.equal((await aliasRequest(base, new URL(browser.url))).headers.location, OUTPUT);
      });
    } finally {
      await fake.stop();
      await rm(file, { force: true });
      await rmdir(dir);
    }
  });
}

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
      assert.equal(result.error.browserAdded, true);
      assert.match(result.error.detail, /added the Browser input.*did not put it on overlay 8.*could not keep the new input key/);
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

test('AC-4: a keyed Unload stays bound to the displayed Browser and overlay', async () => {
  let moveOnRead = false;
  let reads = 0;
  let key;
  const fake = await startFakeVmix({
    hook(line) {
      if (moveOnRead && line === 'XML' && ++reads === 2) {
        fake.overlays.delete(8);
        fake.overlays.set(3, key);
      }
      return false;
    },
  });
  try {
    await withBridge(createVmixAdapter({ port: fake.port }), async post => {
      const selected = slot(8);
      assert.equal((await act(post, { verb: 'take', item, slot: selected })).ok, true);
      key = fake.onChannel(8).key;
      const action = { verb: 'out', item, slot: selected, expectedOverlayInput: key.toUpperCase() };
      const mark = fake.functions.length;
      const other = '1a111111-aaaa-41aa-8aaa-aaaaaaaaaaaa';
      assert.match((await act(post, { ...action, expectedOverlayInput: other })).error?.detail, /overlay 8 changed/);
      assert.equal((await act(post, { ...action, expectedOverlayInput: null })).error?.code, 'usage');
      moveOnRead = true;
      assert.match((await act(post, action)).error?.detail, /overlay 8 changed/);
      assert.equal(fake.onChannel(3)?.key, key);
      assert.deepEqual(fake.functions.slice(mark), []);
      moveOnRead = false;
      assert.equal((await act(post, { ...action, slot: slot(3) })).ok, true);
      assert.deepEqual(fake.functions.slice(mark).map(fn => fn.name), ['OverlayInput3Out']);
    });
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
      { verb: 'take', item, slot: slot(), imageFit: 'fit' },
      { verb: 'take', item: { kind: 'template', name: 'lower-third', label: TITLE }, slot: slot() },
      { verb: 'take', item: { kind: 'media', name: 'clip', label: TITLE }, slot: slot() },
      { verb: 'sequence', slot: slot(), entries: [] },
      { verb: 'ending', slot: slot(), item: { kind: 'media', name: 'clip' } },
    ]) {
      const r = await vmix.act(t, action);
      assert.equal(r.error.code, 'unsupported', `${action.verb} ${action.item?.kind ?? ''}`);
    }
    assert.equal((await vmix.list(t, 'template')).error.code, 'unsupported');
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

test('FUNCTION replies accept bare status and fragmented UTF-8 text among event lines', async () => {
  const refusal = 'FUNCTION ER Entrée introuvable';
  const reply = Buffer.from('ACTS OK Overlay8 1 1\r\nTALLY OK 0120\r\n' + refusal + '\r\n');
  const eventSplit = reply.indexOf(0x0a);
  const split = reply.indexOf(0xc3) + 1;
  const fake = await startFakeVmix({
    hook(line, socket) {
      if (line === 'FUNCTION BareStatus') {
        socket.write('ACTS OK\r\nFUNCTION OK\r\n');
      } else {
        socket.write(reply.subarray(0, eventSplit));
        setTimeout(() => socket.write(reply.subarray(eventSplit, split)), 10);
        setTimeout(() => socket.write(reply.subarray(split, -1)), 20);
        setTimeout(() => socket.write(reply.subarray(-1)), 30);
      }
      return true;
    },
  });
  const conn = new VmixConnection(fake.port);
  try {
    assert.deepEqual(await conn.open(), { ok: true });
    assert.deepEqual(await conn.command('FUNCTION BareStatus', Infinity), { ok: true, status: 'OK', line: 'FUNCTION OK' });
    assert.deepEqual(await conn.command('FUNCTION WithText', Infinity), { ok: true, status: 'ER', line: refusal });
    assert.equal(fake.connections, 1);
  } finally {
    conn.close();
    await fake.stop();
  }
});

const invalidFunctionReplies = [
  ['unknown status', Buffer.from('FUNCTION UNKNOWN Completed\r\n')],
  ['bare LF', Buffer.from('FUNCTION OK\n')],
  ['embedded CR', Buffer.from('FUNCTION OK Completed\r\r\n')],
  ['invalid UTF-8', Buffer.concat([Buffer.from('FUNCTION OK '), Buffer.from([0xff]), Buffer.from('\r\n')])],
  ['tab before status', Buffer.from('FUNCTION\tOK\r\n')],
  ['double space before status', Buffer.from('FUNCTION  OK\r\n')],
  ['leading space', Buffer.from(' FUNCTION OK Completed\r\n')],
  ['leading tab', Buffer.from('\tFUNCTION ER Refused\r\n')],
  ['unexpected length header', Buffer.from('XML 64\r\n')],
  ['malformed ACTS framing', Buffer.from('ACTS OK Overlay8 1 1\n')],
  ['malformed TALLY status', Buffer.from('TALLY ER No tally\r\n')],
  ['oversized event detail', Buffer.from('ACTS OK ' + 'x'.repeat(64 * 1024) + '\r\n')],
];

for (const [fault, invalidReply] of invalidFunctionReplies) {
  test('AC-4: Load leaves placement uncertain after a FUNCTION reply with ' + fault, async () => {
    const fake = await startFakeVmix({
      hook(line, socket) {
        if (!line.startsWith('FUNCTION OverlayInput8In ')) return false;
        const key = new URLSearchParams(line.slice('FUNCTION OverlayInput8In '.length)).get('Input');
        fake.overlays.set(8, key);
        socket.write(Buffer.concat([invalidReply, Buffer.from('FUNCTION OK Completed\r\n')]));
        return true;
      },
    });
    try {
      await withBridge(createVmixAdapter({ port: fake.port }), async post => {
        const reply = await act(post, { verb: 'take', item, slot: slot() });
        assert.equal(reply.ok, false);
        assert.equal(reply.error.code, 'uncertain');
        assert.equal(reply.error.browserAdded, true);
        assert.match(reply.error.detail, /added the Browser input/);
        assert.match(reply.error.detail, /may have acted on it: look at vMix before trying again/);
        assert.doesNotMatch(reply.error.detail, /did not put it on overlay/);
        const key = fake.inputs[0].key;
        assert.equal(fake.onChannel(8)?.key, key);
        const dispatch = 'FUNCTION OverlayInput8In Input=' + key;
        assert.equal(fake.lines.at(-1), dispatch);
        assert.equal(fake.connections, 1);

        const state = await post('/state', { target: { adapter: 'vmix' }, outputUrl: item.name });
        assert.equal(state.ok, true);
        assert.equal(state.overlays[7].input.key, key);
        assert.equal(state.overlays[7].ownsOutput, true);
        assert.equal(fake.connections, 2);
        assert.equal(fake.lines.filter(line => line === dispatch).length, 1);
      });
    } finally {
      await fake.stop();
    }
  });
}

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
    const other = { ...item, name: item.name.replace('abc123', 'other-production') };
    const er = await vmix.act({ adapter: 'vmix' }, { verb: 'take', item: other, slot: slot(7) }, directTestContext);
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
      const loaded = await act(post, { verb: 'take', item, slot: slot(8) });
      assert.equal(loaded.ok, true);
      assert.equal(loaded.v, 2);
      assert.match(loaded.raw, /OverlayInput8In OK/);
      assert.ok(Number.isSafeInteger(loaded.generation));
      const state = await post('/state', { target: { adapter: 'vmix' }, outputUrl: item.name });
      assert.equal(state.ok, true);
      assert.equal(state.v, 2);
      assert.equal(state.session, loaded.session);
      assert.ok(Number.isSafeInteger(state.observedAt));
      assert.deepEqual(state.vmix, { version: '29.0.0.49', edition: 'Trial', overlays: 8, inputs: 2 });
      assert.equal(state.overlays.length, state.vmix.overlays);
      assert.equal(state.overlays[7].ownsOutput, true);
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

// V3's reference model is the operator's observable list: append the requested path, observe its
// selected occurrence running, then remove only the prefix. It never derives state from an ACK.
import { createVmixMedia } from '../dist/playout/vmixMedia.js';

async function playerFixture(t, fakeOptions = {}, adapterOptions = {}, mediaOptions = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'noacg-vmix-player-')));
  for (const name of ['clip A.mp4', 'clip B.mp4', 'still.png', 'sting.wav']) await writeFile(join(root, name), 'fixture');
  const media = createVmixMedia({ defaultFolder: async () => root, ...mediaOptions });
  const fake = await startFakeVmix(fakeOptions);
  const adapter = createVmixAdapter({ port: fake.port, media, ...adapterOptions });
  t.after(async () => { adapter.close(); await fake.stop(); await rm(root, { recursive: true, force: true }); });
  const target = { adapter: 'vmix', port: fake.port };
  const player = (name = 'clips') => ({ adapter: 'vmix', player: name });
  const take = (name, extra = {}) => adapter.act(target, { verb: 'take', slot: player(name === 'sting.wav' ? 'audio' : 'clips'), item: { kind: 'media', name }, cueId: 'cue:' + name, ...extra });
  return { root, fake, adapter, target, player, take, media };
}

test('AC-8: Take configures one keyed player and its full list, then replaces without clearing it first', async t => {
  const { fake, adapter, target, player, take, root } = await playerFixture(t, { selectDelayMs: 180 });
  const first = await take('clip A.mp4', { loop: true });
  assert.equal(first.ok, true, JSON.stringify(first));
  const clips = fake.inputs.find(input => input.title === 'NoaCG Clips');
  assert.equal(clips.type, 'VideoList');
  for (const setting of ['autoPlay', 'autoPause', 'autoRestart', 'autoPlayNext']) assert.equal(clips[setting], false);
  assert.equal(clips.loop, true);
  assert.equal(clips.alpha, 255);
  const second = await take('clip B.mp4');
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.notEqual(first.instance, second.instance);
  assert.equal(fake.inputs.filter(input => input.type === 'VideoList').length, 1);
  assert.equal(clips.loop, false);
  assert.deepEqual(clips.list, [join(root, 'clip B.mp4')]);
  assert.equal(clips.selectedIndex, 1);
  assert.equal(clips.state, 'Running');
  assert.equal(fake.functions.some(fn => fn.name === 'ListRemoveAll'), false);
  assert.equal(fake.functions.filter(fn => fn.name === 'AddInput').length, 1);
  assert.equal(fake.functions.filter(fn => fn.name === 'SetAlpha').length, 2);
  assert.ok(fake.functions.filter(fn => fn.params.Input).every(fn => GUID.test(fn.params.Input)));
  assert.ok(fake.functions.every(fn => /^(AddInput|SetInputName|AutoPlayOff|AutoPauseOff|AutoRestartOff|AutoPlayNextOff|LoopOn|LoopOff|SetAlpha|ListAdd|SelectIndex|Play|ListRemove)$/.test(fn.name)));
  const paused = await adapter.act(target, { verb: 'pause', slot: player() });
  assert.equal(paused.ok, true);
  const pausedState = await adapter.overlays(target);
  const state = pausedState.value.players.find(row => row.player === 'clips');
  assert.equal(state.file, 'clip B.mp4');
  assert.equal(state.position, 0);
  assert.equal(state.segment.length, 4);
  assert.equal(state.paused, true);
  assert.equal(state.loop, false);
  assert.equal(state.cueId, 'cue:clip B.mp4');
  assert.equal(state.instance, second.instance);
  assert.equal(state.generation, paused.generation);
  assert.equal((await adapter.act(target, { verb: 'resume', slot: player() })).ok, true);
  for (const ending of ['loop', 'hold']) {
    assert.equal((await adapter.act(target, { verb: 'ending', slot: player(), item: { kind: 'media', name: 'clip B.mp4' }, playback: { end: ending } })).ok, true);
    assert.equal(clips.loop, ending === 'loop');
  }
  const out = await adapter.act(target, { verb: 'out', slot: player() });
  assert.equal(out.ok, true);
  assert.deepEqual(fake.functions.slice(-2).map(fn => fn.name), ['Pause', 'ListRemoveAll']);
  assert.deepEqual(clips.list, []);
  assert.equal((await adapter.overlays(target)).value.players.find(row => row.player === 'clips').producer, 'empty');
  assert.equal(fake.connections, 1);
});

test('AC-8: same-path retake observes the appended occurrence and uses a new instance', async t => {
  const { fake, take, root } = await playerFixture(t, { selectDelayMs: 200 });
  const first = await take('clip A.mp4');
  const second = await take('clip A.mp4');
  assert.equal(first.ok, true);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.notEqual(first.instance, second.instance);
  assert.deepEqual(fake.inputs[0].list, [join(root, 'clip A.mp4')]);
  assert.deepEqual(fake.functions.filter(fn => fn.name === 'SelectIndex').map(fn => fn.params.Value), ['1', '2']);
});

test('AC-8: persisted player keys beat names and unique shortTitle is recovered on a new Bridge', async t => {
  const { fake, media, take, adapter, target } = await playerFixture(t);
  assert.equal((await take('clip A.mp4')).ok, true);
  const input = fake.inputs[0];
  input.title = 'Operator rename';
  assert.equal((await take('clip B.mp4')).ok, true);
  assert.equal(fake.inputs.length, 1);
  input.title = 'NoaCG Clips';
  const fresh = createVmixAdapter({ port: fake.port, media: createVmixMedia({ defaultFolder: async () => await media.folder(fake.port) }) });
  t.after(() => fresh.close());
  assert.equal((await fresh.act(target, { verb: 'take', slot: { adapter: 'vmix', player: 'clips' }, item: { kind: 'media', name: 'clip A.mp4' } })).ok, true);
  assert.equal(fake.functions.filter(fn => fn.name === 'AddInput').length, 1);
  adapter.close();
});

test('AC-8: audio and still use the separate intended players, and Clear leaves both lists empty', async t => {
  const { fake, adapter, target, player, take } = await playerFixture(t);
  assert.equal((await take('still.png')).ok, true);
  const clips = fake.inputs.find(input => input.title === 'NoaCG Clips');
  const untouched = structuredClone(clips);
  const before = fake.functions.length;
  assert.equal((await take('sting.wav')).ok, true);
  const audio = fake.inputs.find(input => input.title === 'NoaCG Audio');
  assert.equal(audio.audioAuto, false);
  assert.equal(audio.muted, false);
  assert.deepEqual(clips, untouched);
  assert.ok(fake.functions.slice(before).filter(fn => fn.params.Input).every(fn => fn.params.Input === audio.key));
  const reading = (await adapter.overlays(target)).value.players;
  assert.equal(reading.find(row => row.player === 'clips').producer, 'still');
  assert.equal(reading.find(row => row.player === 'audio').file, 'sting.wav');
  for (const name of ['clips', 'audio']) assert.equal((await adapter.act(target, { verb: 'clear', slot: player(name) })).ok, true);
  assert.ok(fake.inputs.every(input => !input.list.length));
});

test('AC-8: Basic HD names its edition and a missing file preserves vMix File Not Found with its path', async t => {
  const basic = await playerFixture(t, { edition: 'Basic HD' });
  const limited = await basic.take('clip A.mp4');
  assert.equal(limited.ok, false);
  assert.match(limited.error.detail, /Basic HD/);
  assert.equal(basic.fake.functions.length, 0);
  const full = await playerFixture(t);
  const missing = await full.take('missing.mp4');
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'refused');
  assert.ok(missing.error.detail.includes('File Not Found: ' + join(full.root, 'missing.mp4')));
  assert.equal(full.fake.functions.some(fn => fn.name === 'Play'), false);
});

test('AC-7: unsupported player actions, ambiguous slots and output-keyed tokens send no TCP command', async t => {
  const { adapter, target, player, fake } = await playerFixture(t);
  for (const action of [
    { verb: 'update', slot: player(), data: { title: 'x' } },
    { verb: 'next', slot: player() },
    { verb: 'take', slot: player(), item: { kind: 'template', name: 'x' } },
    { verb: 'take', slot: player(), item: { kind: 'media', name: 'clip A.mp4' }, imageFit: 'fit' },
    { verb: 'take', slot: player(), item: { kind: 'media', name: 'clip A.mp4' }, playback: { gain: 0.5 } },
    { verb: 'take', slot: player(), item: { kind: 'media', name: '../clip A.mp4' } },
  ]) assert.equal((await adapter.act(target, action)).ok, false);
  assert.equal((await adapter.thumbnail(target, 'clip A.mp4')).ok, false);
  assert.equal((await adapter.list(target, 'template')).ok, false);
  assert.deepEqual(fake.lines, []);
  await withBridge(adapter, async post => {
    for (const slot of [{ adapter: 'vmix', player: 'clips', overlay: 8 }, { adapter: 'vmix', player: 'wrong' }]) {
      const reply = await post('/act', { target, action: { verb: 'out', slot } });
      assert.equal(reply.ok, false);
    }
    const keyed = await post('/act', { target, action: { verb: 'out', slot: player() } }, VMIX_OUTPUT_TOKEN_PREFIX + 't');
    assert.equal(keyed.ok, false);
    const expect = await post('/act', { target, action: { verb: 'out', slot: player(), expectedOverlayInput: XML_INPUT_KEY } });
    assert.equal(expect.ok, false);
    assert.deepEqual(fake.lines, []);
  });
});

test('AC-7: an applied Play with a dropped reply stays uncertain and is never resent', async t => {
  let drop = true;
  const { fake, take, adapter, target } = await playerFixture(t, {
    afterFunction(name, params, socket) {
      if (name !== 'Play' || !drop) return false;
      drop = false;
      socket.destroy();
      return true;
    },
  });
  const reply = await take('clip A.mp4');
  assert.equal(reply.ok, false);
  assert.equal(reply.error.code, 'uncertain');
  assert.equal(fake.inputs[0].state, 'Running');
  assert.equal(fake.functions.filter(fn => fn.name === 'Play').length, 1);
  const state = await adapter.overlays(target);
  assert.equal(state.ok, true);
  assert.equal(state.value.players[0].instance, undefined);
  assert.equal(fake.functions.filter(fn => fn.name === 'Play').length, 1);
  assert.equal(fake.connections, 2);
});

test('AC-7: cleanup ER reports refused after observed playback and retains that instance without retry', async t => {
  let refuseCleanup = false;
  const { fake, take, adapter, target } = await playerFixture(t, {
    hook(line, socket) {
      if (!refuseCleanup || !line.startsWith('FUNCTION ListRemove ')) return false;
      socket.write('FUNCTION ER Removal refused by vMix\r\n');
      return true;
    },
  });
  assert.equal((await take('clip A.mp4')).ok, true);
  refuseCleanup = true;
  const reply = await take('clip B.mp4');
  assert.equal(reply.ok, false);
  assert.equal(reply.error.code, 'refused');
  assert.match(reply.error.detail, /observed playing.*Removal refused by vMix/);
  const state = (await adapter.overlays(target)).value.players[0];
  assert.equal(state.file, 'clip B.mp4');
  assert.equal(state.cueId, 'cue:clip B.mp4');
  assert.ok(state.instance);
  assert.equal(fake.lines.filter(line => line.startsWith('FUNCTION ListRemove ')).length, 1);
  assert.equal(fake.inputs[0].list.length, 2);
});

test('AC-8: other writers invalidate ending authority and serialized takes keep their own instances', async t => {
  const { take, adapter, target, player, fake, root } = await playerFixture(t);
  const [first, second] = await Promise.all([take('clip A.mp4'), take('clip B.mp4')]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.generation, first.generation + 1);
  const current = (await adapter.overlays(target)).value.players[0];
  assert.equal(current.instance, second.instance);
  fake.inputs[0].list[0] = join(root, 'clip A.mp4');
  const before = fake.functions.length;
  const ending = await adapter.act(target, { verb: 'ending', slot: player(), item: { kind: 'media', name: 'clip B.mp4' }, playback: { end: 'loop' } });
  assert.equal(ending.ok, false);
  assert.equal(fake.functions.length, before);
  assert.equal((await adapter.overlays(target)).value.players[0].instance, undefined);
});

test('AC-8: unfinished creation retains its GUID and an unknown Add is never automatically repeated', async t => {
  let stopAtName = true;
  const first = await playerFixture(t, {
    afterFunction(name, params, socket) {
      if (name !== 'SetInputName' || !stopAtName) return false;
      stopAtName = false;
      socket.destroy();
      return true;
    },
  });
  assert.equal((await first.take('clip A.mp4')).error.code, 'uncertain');
  assert.equal((await first.take('clip A.mp4')).ok, true);
  assert.equal(first.fake.functions.filter(fn => fn.name === 'AddInput').length, 1);
  const second = await playerFixture(t, {
    afterFunction(name, params, socket) {
      if (name !== 'AddInput') return false;
      socket.destroy();
      return true;
    },
  });
  assert.equal((await second.take('clip A.mp4')).error.code, 'uncertain');
  assert.equal((await second.take('clip A.mp4')).error.code, 'refused');
  assert.equal(second.fake.functions.filter(fn => fn.name === 'AddInput').length, 1);
});

test('AC-9: HTTP media reads and picker require pairing and never take a root path from the page', async t => {
  const { adapter, target, fake, media, root } = await playerFixture(t);
  await withBridge(adapter, async post => {
    assert.equal((await post('/studio', { target }, '')).ok, false);
    assert.equal((await post('/vmix/choose-folder', { target }, '')).ok, false);
    for (const field of ['path', 'mediaFolder', 'folder', 'studio']) {
      assert.equal((await post('/studio', { target, [field]: root })).ok, false);
      assert.equal((await post('/vmix/choose-folder', { target, [field]: root })).ok, false);
    }
    assert.equal((await post('/studio', { target })).mediaFolder, root);
    const list = await post('/list', { target, kind: 'media' });
    assert.equal(list.ok, true);
    assert.equal(list.items.length, 4);
    assert.ok(list.items.every(item => item.name === item.path && !item.path.includes(root)));
    assert.equal((await post('/list', { target, kind: 'media', path: '../' })).ok, false);
    const taken = await post('/act', { target, action: { verb: 'take', slot: { adapter: 'vmix', player: 'clips' }, item: { kind: 'media', name: 'clip A.mp4' }, cueId: 'http-cue' } });
    assert.equal(taken.ok, true, JSON.stringify(taken));
    const state = await post('/state', { target });
    assert.equal(state.players[0].instance, taken.instance);
    assert.equal(state.players[0].generation, taken.generation);
    assert.equal(state.players[0].cueId, 'http-cue');
    // The V2 overlay input wire shape never leaks the absolute paths present in the XML list.
    fake.overlays.set(3, fake.inputs[0].key);
    const overlays = await post('/state', { target });
    assert.deepEqual(Object.keys(overlays.overlays[2].input).sort(), ['key', 'number', 'title', 'type']);
    assert.equal(JSON.stringify(overlays.overlays).includes(root), false);
  });
});

test('AC-7: unanswered cleanup stops uncertain and a separate state read never resends it', async t => {
  const fixture = await playerFixture(t, {
    afterFunction(name, params, socket) {
      if (name !== 'ListRemove') return false;
      socket.destroy();
      return true;
    },
  });
  assert.equal((await fixture.take('clip A.mp4')).ok, true);
  const reply = await fixture.take('clip B.mp4');
  assert.equal(reply.ok, false);
  assert.equal(reply.error.code, 'uncertain');
  assert.equal(fixture.fake.functions.filter(fn => fn.name === 'ListRemove').length, 1);
  const state = await fixture.adapter.overlays(fixture.target);
  assert.equal(state.ok, true);
  assert.equal(state.value.players[0].file, 'clip B.mp4');
  assert.equal(fixture.fake.functions.filter(fn => fn.name === 'ListRemove').length, 1);
});

test('AC-8: foreign or ambiguous player identities refuse without adding or addressing an input', async t => {
  for (const inputs of [
    [{ type: 'Browser', title: 'NoaCG Clips' }],
    [{ type: 'VideoList', title: 'NoaCG Clips' }, { type: 'VideoList', title: 'NoaCG Clips' }],
  ]) {
    const fixture = await playerFixture(t, { inputs });
    const reply = await fixture.take('clip A.mp4');
    assert.equal(reply.ok, false);
    assert.equal(reply.error.code, 'refused');
    assert.equal(fixture.fake.functions.length, 0);
  }
});

test('AC-8: a simultaneous unmarked list creation grants no player ownership', async t => {
  let fake;
  const fixture = await playerFixture(t, {
    afterFunction(name) {
      if (name === 'AddInput') fake.add('VideoList', 'List');
      return false;
    },
  });
  fake = fixture.fake;
  const reply = await fixture.take('clip A.mp4');
  assert.equal(reply.ok, false);
  assert.equal(reply.error.code, 'uncertain');
  assert.deepEqual(fake.functions.map(fn => fn.name), ['AddInput']);
});

test('AC-8: an acknowledged AudioOn that leaves the list muted cannot make audio setup successful', async t => {
  const { fake, take } = await playerFixture(t, { ignore: ['AudioOn'] });
  const result = await take('sting.wav');
  assert.equal(result.ok, false, 'a muted audio list cannot satisfy successful setup');
  assert.equal(result.error.code, 'uncertain');
  assert.equal(fake.functions.filter(fn => fn.name === 'AudioOn').length, 1);
  assert.equal(fake.functions.some(fn => fn.name === 'Play'), false);
  assert.equal(fake.inputs[0].muted, true);
});

test('AC-8: missing or malformed mute readback after AudioOn remains uncertain without resend', async t => {
  for (const mute of [undefined, 'maybe']) {
    let afterAudioOn = false;
    const fixture = await playerFixture(t, {
      afterFunction(name) { if (name === 'AudioOn') afterAudioOn = true; return false; },
      transformXml(xml) {
        if (!afterAudioOn) return xml;
        return xml.replace(/ muted="[^"]*"/g, mute === undefined ? '' : ' muted="' + mute + '"');
      },
    });
    const reply = await fixture.take('sting.wav');
    assert.equal(reply.ok, false);
    assert.equal(reply.error.code, 'uncertain');
    assert.equal(fixture.fake.functions.filter(fn => fn.name === 'AudioOn').length, 1);
    assert.equal(fixture.fake.functions.some(fn => fn.name === 'Play'), false);
  }
});

const muteFaults = [
  { label: 'muted', value: 'True' },
  { label: 'missing', value: undefined },
  { label: 'malformed', value: 'unknown' },
];

function unreadableMute(xml, fault) {
  return xml.replace(/ muted="[^"]*"/g, fault.value === undefined ? '' : ' muted="' + fault.value + '"');
}

test('AC-8: a reused audio player with unconfirmed readiness refuses Take before another function', async t => {
  for (const fault of muteFaults) {
    let broken = false;
    const fixture = await playerFixture(t, {
      inputs: [{ type: 'VideoList', title: 'NoaCG Audio' }],
      transformXml: xml => broken ? unreadableMute(xml, fault) : xml,
    });
    assert.equal((await fixture.take('sting.wav')).ok, true);
    broken = true;
    const before = fixture.fake.functions.length;
    const reply = await fixture.take('sting.wav');
    assert.equal(reply.ok, false, fault.label);
    assert.equal(reply.error.code, 'refused', fault.label);
    assert.equal(fixture.fake.functions.length, before, fault.label);
  }
});

test('AC-8: audio Take stops at the first matching stage with unconfirmed readiness', async t => {
  for (const [command, absent] of [
    ['AudioOn', 'SetAlpha'], ['SetAlpha', 'ListAdd'], ['ListAdd', 'SelectIndex'], ['Play', 'ListRemove'],
  ]) {
    for (const fault of muteFaults) {
      let broken = false;
      const fixture = await playerFixture(t, {
        inputs: [{ type: 'VideoList', title: 'NoaCG Audio' }],
        afterFunction(name) { if (name === command) broken = true; return false; },
        transformXml: xml => broken ? unreadableMute(xml, fault) : xml,
      }, { timeoutMs: 600 });
      const reply = await fixture.take('sting.wav');
      const label = command + ', ' + fault.label;
      assert.equal(reply.ok, false, label);
      assert.equal(reply.error.code, 'uncertain', label);
      assert.equal(fixture.fake.functions.filter(fn => fn.name === command).length, 1, label);
      assert.equal(fixture.fake.functions.some(fn => fn.name === absent), false, label);
      assert.equal((await fixture.adapter.overlays(fixture.target)).value.players[1].instance, undefined, label);
    }
  }
});

test('AC-8: a replacement of the same audio path checks each prefix removal and keeps observed identity', async t => {
  for (const removal of [1, 2]) {
    for (const fault of muteFaults) {
      let removed = 0;
      const fixture = await playerFixture(t, {
        inputs: [{ type: 'VideoList', title: 'NoaCG Audio', state: 'Running' }],
        afterFunction(name) { if (name === 'ListRemove') removed += 1; return false; },
        transformXml: xml => removed >= removal ? unreadableMute(xml, fault) : xml,
      }, { timeoutMs: 600 });
      const input = fixture.fake.inputs[0];
      input.list = [join(fixture.root, 'sting.wav'), join(fixture.root, 'sting.wav')];
      input.selectedIndex = 2;
      const reply = await fixture.take('sting.wav');
      const label = 'removal ' + removal + ', ' + fault.label;
      assert.equal(reply.ok, false, label);
      assert.equal(reply.error.code, 'uncertain', label);
      assert.equal(removed, removal, label);
      assert.equal(input.list.length, 3 - removal, label);
      const state = (await fixture.adapter.overlays(fixture.target)).value.players[1];
      assert.equal(state.file, 'sting.wav', label);
      assert.equal(state.cueId, 'cue:sting.wav', label);
      assert.ok(state.instance, label);
    }
  }
});

test('AC-8: audio Resume refuses before Play or stays uncertain afterward when readiness is unconfirmed', async t => {
  for (const phase of ['before', 'after']) {
    for (const fault of muteFaults) {
      let resuming = false;
      let resumed = false;
      const fixture = await playerFixture(t, {
        inputs: [{ type: 'VideoList', title: 'NoaCG Audio' }],
        afterFunction(name) { if (resuming && name === 'Play') resumed = true; return false; },
        transformXml: xml => resuming && (phase === 'before' || resumed) ? unreadableMute(xml, fault) : xml,
      }, { timeoutMs: 600 });
      const taken = await fixture.take('sting.wav');
      assert.equal(taken.ok, true);
      assert.equal((await fixture.adapter.act(fixture.target, { verb: 'pause', slot: fixture.player('audio') })).ok, true);
      resuming = true;
      const before = fixture.fake.functions.length;
      const reply = await fixture.adapter.act(fixture.target, { verb: 'resume', slot: fixture.player('audio') });
      const label = phase + ' Play, ' + fault.label;
      assert.equal(reply.ok, false, label);
      assert.equal(reply.error.code, phase === 'before' ? 'refused' : 'uncertain', label);
      assert.deepEqual(fixture.fake.functions.slice(before).map(fn => fn.name), phase === 'before' ? [] : ['Play'], label);
      assert.equal((await fixture.adapter.overlays(fixture.target)).value.players[1].instance, taken.instance, label);
    }
  }
});

test('AC-8: mute-only changes preserve the selected audio instance through state, Pause and ending', async t => {
  const fixture = await playerFixture(t, { inputs: [{ type: 'VideoList', title: 'NoaCG Audio' }] });
  const taken = await fixture.take('sting.wav');
  assert.equal(taken.ok, true);
  fixture.fake.inputs[0].muted = true;
  const slot = fixture.player('audio');
  const paused = await fixture.adapter.act(fixture.target, { verb: 'pause', slot });
  const ending = await fixture.adapter.act(fixture.target, {
    verb: 'ending', slot, item: { kind: 'media', name: 'sting.wav' }, playback: { end: 'loop' },
  });
  const current = (await fixture.adapter.overlays(fixture.target)).value.players[1];
  for (const result of [paused, ending]) {
    assert.equal(result.ok, true);
    assert.equal(result.instance, taken.instance);
  }
  assert.equal(current.instance, taken.instance);
  assert.equal(current.cueId, 'cue:sting.wav');
  assert.equal(current.paused, true);
  assert.equal(current.loop, true);
  assert.equal(fixture.fake.inputs[0].muted, true);
  assert.equal(fixture.fake.functions.filter(fn => fn.name === 'AudioOn').length, 1);
});

test('AC-8: Clips need no mute observation and a short held clip may complete during prefix cleanup', async t => {
  let fake;
  const fixture = await playerFixture(t, {
    inputs: [{ type: 'VideoList', title: 'NoaCG Clips' }],
    transformXml: xml => unreadableMute(xml, { value: undefined }),
    afterFunction(name) {
      if (name === 'ListRemove') {
        const input = fake.inputs[0];
        input.state = 'Completed';
        input.position = input.duration;
      }
      return false;
    },
  });
  fake = fixture.fake;
  assert.equal((await fixture.take('clip A.mp4')).ok, true);
  const replacement = await fixture.take('clip B.mp4');
  assert.equal(replacement.ok, true, JSON.stringify(replacement));
  const state = (await fixture.adapter.overlays(fixture.target)).value.players[0];
  assert.equal(state.file, 'clip B.mp4');
  assert.equal(state.position, state.segment.length);
  assert.equal(state.instance, replacement.instance);
});


test('AC-9: Take and Resume refuse an outside-root or wrong-kind selected file before any function', async t => {
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'noacg-vmix-outside-')));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const outsideFile = join(outside, 'outside.mp4');
  await writeFile(outsideFile, 'outside');
  for (const selected of ['outside', 'wrong kind']) {
    const fixture = await playerFixture(t, { inputs: [{ type: 'VideoList', title: 'NoaCG Clips', state: 'Paused' }] });
    const input = fixture.fake.inputs[0];
    const file = selected === 'outside' ? outsideFile : join(fixture.root, 'sting.wav');
    input.list = [file];
    input.selectedIndex = 1;
    input.duration = 4000;
    const slot = fixture.player();
    const resumed = await fixture.adapter.act(fixture.target, { verb: 'resume', slot });
    const taken = await fixture.take('clip A.mp4');
    for (const result of [resumed, taken]) {
      assert.equal(result.ok, false, selected);
      assert.equal(result.error.code, 'refused', selected);
      assert.match(result.error.detail, /Clear or Out/, selected);
    }
    assert.equal(fixture.fake.functions.length, 0, selected);
    assert.equal((await fixture.adapter.act(fixture.target, { verb: 'pause', slot })).ok, true, selected);
    assert.equal((await fixture.adapter.act(fixture.target, { verb: 'out', slot })).ok, true, selected);
    input.list = [file];
    input.selectedIndex = 1;
    input.state = 'Running';
    assert.equal((await fixture.adapter.act(fixture.target, { verb: 'clear', slot })).ok, true, selected);
    assert.deepEqual(fixture.fake.functions.map(fn => fn.name), ['Pause', 'Pause', 'ListRemoveAll', 'Pause', 'ListRemoveAll']);
    assert.equal(input.list.length, 0);
  }
});

test('AC-9: the picker waits without the mixer turn and publishes its choice after an active Take', async t => {
  const newRoot = await realpath(await mkdtemp(join(tmpdir(), 'noacg-vmix-new-media-')));
  await writeFile(join(newRoot, 'clip B.mp4'), 'new media');
  t.after(() => rm(newRoot, { recursive: true, force: true }));
  let releaseAlpha;
  let finishPicker;
  let pickerStarted;
  let takeStarted;
  let publishStarted;
  const inDialog = new Promise(resolve => { pickerStarted = resolve; });
  const inTake = new Promise(resolve => { takeStarted = resolve; });
  const publishing = new Promise(resolve => { publishStarted = resolve; });
  const fixture = await playerFixture(t, {
    inputs: [{ type: 'VideoList', title: 'NoaCG Clips' }],
    afterFunction(name, params, socket) {
      if (name !== 'SetAlpha' || releaseAlpha) return false;
      releaseAlpha = () => socket.write('FUNCTION OK Completed\r\n');
      takeStarted();
      return true;
    },
  }, {}, {
    picker: () => new Promise(resolve => { finishPicker = resolve; pickerStarted(); }),
  });
  const choose = fixture.media.chooseFolder;
  fixture.media.chooseFolder = (port, publish) => choose(port, save => {
    publishStarted();
    return publish(save);
  });
  const picker = fixture.adapter.chooseFolder(fixture.target);
  await inDialog;
  const take = fixture.take('clip A.mp4');
  await inTake;
  finishPicker(newRoot);
  try {
    await Promise.race([publishing, picker.then(() => { throw Error('The new root published while Take held the mixer turn.'); })]);
    assert.equal(await fixture.adapter.mediaFolder(fixture.target), fixture.root);
  } finally {
    releaseAlpha();
  }
  const taken = await take;
  assert.equal(taken.ok, true, JSON.stringify(taken));
  assert.equal((await picker).mediaFolder, newRoot);
  assert.equal(fixture.fake.functions.find(fn => fn.name === 'ListAdd').params.Value, join(fixture.root, 'clip A.mp4'));
  const count = fixture.fake.functions.length;
  assert.equal((await fixture.adapter.act(fixture.target, { verb: 'resume', slot: fixture.player() })).ok, false);
  assert.equal((await fixture.take('clip B.mp4')).ok, false);
  assert.equal(fixture.fake.functions.length, count);
  assert.equal((await fixture.adapter.act(fixture.target, { verb: 'clear', slot: fixture.player() })).ok, true);
  assert.equal((await fixture.take('clip B.mp4')).ok, true);
  assert.equal(fixture.fake.functions.findLast(fn => fn.name === 'ListAdd').params.Value, join(newRoot, 'clip B.mp4'));
});

test('AC-9: unreadable vMix setup cannot make V2 overlay state fail', async t => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'noacg-vmix-unreadable-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'vmix-setup.json');
  await writeFile(file, '{invalid json');
  const outputs = vmixOutputStore();
  const fixture = await playerFixture(t, {
    inputs: [{ type: 'Browser', title: 'NoaCG Evening News' }],
  }, { outputs }, { file });
  const key = fixture.fake.inputs[0].key;
  fixture.fake.overlays.set(8, key);
  await outputs.save(fixture.fake.port, { keys: { [vmixOutputId(OUTPUT)]: key } });
  await withBridge(fixture.adapter, async post => {
    const scoped = await post('/state', { target: fixture.target, outputUrl: OUTPUT });
    assert.equal(scoped.ok, true, JSON.stringify(scoped));
    assert.equal(scoped.overlays[7].input.key, key);
    assert.equal(scoped.overlays[7].ownsOutput, true);
    assert.equal(scoped.players, undefined);
    const generic = await post('/state', { target: fixture.target });
    assert.equal(generic.ok, true, JSON.stringify(generic));
    assert.equal(generic.overlays[7].input.key, key);
    assert.equal(generic.players, undefined);
    assert.match((await post('/studio', { target: fixture.target })).error.detail, /vmix-setup\.json/);
    assert.equal((await fixture.take('clip A.mp4')).ok, false);
    assert.equal(fixture.fake.functions.length, 0);
  });
});

test('AC-8: a reserved display-only title confers no fallback ownership and sends no function', async t => {
  for (const displayed of ['NoaCG Clips', 'NoaCG Clips - existing.mp4']) {
    const fixture = await playerFixture(t, {
      inputs: [{ type: 'VideoList', title: displayed }],
      transformXml: xml => xml.replace(/ shortTitle="[^"]*"/g, ''),
    });
    const result = await fixture.take('clip A.mp4');
    assert.equal(result.ok, false, displayed);
    assert.equal(result.error.code, 'refused', displayed);
    assert.deepEqual(fixture.fake.functions, [], displayed);
  }
});


test('AC-8: HTTP player instances belong to the Bridge session and disappear on restart', async t => {
  const fixture = await playerFixture(t);
  const slot = fixture.player();
  const request = { target: fixture.target };
  let session;
  await withBridge(fixture.adapter, async post => {
    const taken = await post('/act', {
      ...request, action: { verb: 'take', slot, item: { kind: 'media', name: 'clip A.mp4' }, cueId: 'wire-cue' },
    });
    assert.equal(taken.ok, true, JSON.stringify(taken));
    session = taken.session;
    assert.ok(taken.instance.startsWith(session + '.'));
    for (const verb of ['pause', 'resume']) {
      const result = await post('/act', { ...request, action: { verb, slot } });
      assert.equal(result.ok, true);
      assert.equal(result.session, session);
      assert.equal(result.instance, taken.instance);
      const reading = await post('/state', request);
      assert.equal(reading.session, session);
      assert.equal(reading.players[0].instance, taken.instance);
      assert.equal(reading.players[0].cueId, 'wire-cue');
    }
  });
  const restarted = createVmixAdapter({ port: fixture.fake.port, media: fixture.media });
  await withBridge(restarted, async post => {
    const reading = await post('/state', request);
    assert.equal(reading.ok, true);
    assert.notEqual(reading.session, session);
    assert.equal(reading.players[0].file, 'clip A.mp4');
    assert.equal(reading.players[0].instance, undefined);
    assert.equal(reading.players[0].cueId, undefined);
  });
});
