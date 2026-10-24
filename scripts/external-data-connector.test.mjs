// guards: src/control/externalSource.ts, scripts/external-data-connector.mjs, scripts/election-replay-server.mjs, scripts/replay-smoke.mjs, api/_lib/feedFetch.ts, src/control/feedSource.ts, docs/research/2026-10-custom-graphics-workflow/election/fixtures/results-*.json
//
// THE TRUSTED JSON AGENT (docs/work-specs/playout-external-connectors/spec.md, phase E4.1; AC-1),
// run in Node against the real modules: a fake clock and network for the limits, and the real
// replay server over real HTTPS for the boundary.
//
// What is pinned, each by behaviour at its edge (the value passes, one past it fails), never by
// reading a constant back:
//   - the read limits: 10 s for the whole read (headers or a stalled body), 2 MiB of body
//     (declared or counted), one read in flight, no queue of missed reads;
//   - the schedule: 5 s after a success, exponential backoff with 50-100 % jitter capped at 60 s
//     after failures, Retry-After honoured (seconds and dates) up to an hour;
//   - the hosted guard: private, loopback, link-local and mapped addresses refused before any
//     connection, a name with one private answer refused whole, the connection pinned to the
//     checked address, every redirect checked, at most five, only https on its own port;
//   - the credential: sent only to the configured origin, an invalid one denied by the server, a
//     config export carrying only its name and refused until rebound, and redacted from logs;
//   - acceptance: a newer downward correction accepted, a duplicate unchanged, older and
//     conflicting revisions stale, malformed input invalid, a valid empty collection accepted;
//   - the replay server's timeline, exact under a fake clock, read through the headless agent.

import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ext = await import('../src/control/externalSource.ts');
const { createConnector, nodeNet, readSource, REDACTED } = await import('./external-data-connector.mjs');
const { DELETED_PERSON, makeTestCertificate, makeToken, startReplayServer } = await import('./election-replay-server.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MiB = 1024 * 1024;
const T0 = Date.parse('2026-10-24T12:00:00.000Z');

// ── Fakes ─────────────────────────────────────────────────────────────────────

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** Timers that run only when the test moves the clock. */
function fakeClock(start = T0) {
  let now = start;
  let timers = [];
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const handle = { at: now + ms, fn };
      timers.push(handle);
      return handle;
    },
    clearTimeout: (handle) => void (timers = timers.filter((t) => t !== handle)),
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        await flush();
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
      }
      now = target;
      await flush();
    },
  };
}

function response(status, text = '', headers = {}) {
  const r = { status, headers, cancelled: false, pulled: false };
  r.cancel = () => void (r.cancelled = true);
  r.body = (async function* () {
    r.pulled = true;
    if (text) yield Buffer.from(text);
  })();
  return r;
}

/** A network whose DNS is `dns` (host → addresses) and whose answers come from `respond`. */
function fakeNet(respond, dns = { 'api.example.com': ['93.184.216.34'] }) {
  const net = {
    lookups: [],
    requests: [],
    lookup: async (host) => {
      net.lookups.push(host);
      return (dns[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
    request: async (req) => {
      net.requests.push(req);
      return respond(req, net.requests.length);
    },
  };
  return net;
}

const JSON_OK = (body = { revision: 1, n: 1 }) => () => response(200, JSON.stringify(body), { 'content-type': 'application/json' });

function config(over = {}) {
  const parsed = ext.parseConnectorConfig({
    v: 1,
    sourceId: 'results',
    productionId: 'prod1',
    endpoint: 'https://api.example.com/results',
    configRevision: 1,
    revisionPath: 'revision',
    ...over,
  });
  assert.ok(parsed.ok, parsed.error);
  return parsed.config;
}

function connector({ config: configOver, clock = fakeClock(), ...over } = {}) {
  const sent = [];
  const logs = [];
  const c = createConnector({ config: config(configOver), clock, random: () => 1, send: async (a) => void sent.push(a), log: (line) => logs.push(line), ...over });
  return { c, sent, logs, clock };
}

// ── The configuration and its export ─────────────────────────────────────────

describe('configuration', () => {
  test('a secret, a timeout or a byte cap in the file is refused, never quietly used', () => {
    for (const key of ['token', 'authorization', 'timeoutMs', 'maxBytes']) {
      const parsed = ext.parseConnectorConfig({ v: 1, sourceId: 's', productionId: 'p', endpoint: 'https://a.example/x', configRevision: 1, [key]: 'x' });
      assert.equal(parsed.ok, false, key);
      assert.match(parsed.error, new RegExp(`unknown configuration keys: ${key}`));
    }
  });

  test('only https; a local destination must name its certificate authority; a newer version is refused', () => {
    const base = { v: 1, sourceId: 's', productionId: 'p', configRevision: 1 };
    assert.match(ext.parseConnectorConfig({ ...base, endpoint: 'http://a.example/x' }).error, /https/);
    assert.match(ext.parseConnectorConfig({ ...base, endpoint: 'https://u:p@a.example/x' }).error, /user name/);
    assert.match(ext.parseConnectorConfig({ ...base, endpoint: 'https://127.0.0.1:9/x', mode: 'local' }).error, /caFile/);
    assert.match(ext.parseConnectorConfig({ ...base, endpoint: 'https://a.example/x', caFile: 'ca.pem' }).error, /local destination only/);
    assert.match(ext.parseConnectorConfig({ ...base, v: 2, endpoint: 'https://a.example/x' }).error, /version 2/);
    assert.match(ext.parseConnectorConfig({ ...base, endpoint: 'https://a.example/x', credentialRef: 'T', credentialBound: 'false' }).error, /credentialBound/);
  });

  test('polls every 5 s by default, never under 1 s or the provider minimum', () => {
    const base = { v: 1, sourceId: 's', productionId: 'p', configRevision: 1, endpoint: 'https://a.example/x' };
    assert.equal(ext.parseConnectorConfig(base).config.pollMs, 5000);
    assert.equal(ext.parseConnectorConfig({ ...base, pollMs: 1000 }).ok, true);
    assert.equal(ext.parseConnectorConfig({ ...base, pollMs: 999 }).ok, false);
    assert.equal(ext.parseConnectorConfig({ ...base, pollMs: 30_000, providerMinPollMs: 30_000 }).ok, true);
    assert.equal(ext.parseConnectorConfig({ ...base, pollMs: 29_999, providerMinPollMs: 30_000 }).ok, false);
  });

  test('read limits move only inside the recorded envelope', () => {
    assert.deepEqual(ext.readLimits(), { timeoutMs: 10_000, maxBytes: 2 * MiB });
    assert.deepEqual(ext.readLimits({ timeoutMs: '30000', maxBytes: String(8 * MiB) }), { timeoutMs: 30_000, maxBytes: 8 * MiB });
    assert.throws(() => ext.readLimits({ timeoutMs: '30001' }), /timeoutMs/);
    assert.throws(() => ext.readLimits({ maxBytes: String(8 * MiB + 1) }), /maxBytes/);
  });

  test('an export carries only the credential name, unbound, and the agent refuses it until rebound', () => {
    const token = makeToken();
    const bound = config({ credentialRef: 'PROVIDER_TOKEN' });
    const { c } = connector({ config: { credentialRef: 'PROVIDER_TOKEN' }, credential: token, net: fakeNet(JSON_OK()) });
    const exported = c.exportConfig();
    const text = JSON.stringify(exported);
    assert.equal(text.includes(token), false);
    assert.equal(exported.credentialRef, 'PROVIDER_TOKEN');
    assert.equal(exported.credentialBound, false);
    const reread = ext.parseConnectorConfig(JSON.parse(text));
    assert.ok(reread.ok);
    assert.throws(() => createConnector({ config: reread.config, credential: token, clock: fakeClock() }), /rebind/);
    const rebound = ext.bindConnectorCredential(reread.config, 'OTHER_TOKEN');
    assert.deepEqual(rebound, { ...bound, credentialRef: 'OTHER_TOKEN' });
    assert.doesNotThrow(() => createConnector({ config: rebound, credential: token, clock: fakeClock() }));
    assert.throws(() => createConnector({ config: rebound, credential: null, clock: fakeClock() }), /not set on this machine/);
  });
});

// ── Acceptance ────────────────────────────────────────────────────────────────

describe('acceptance', () => {
  const cfg = { sourceId: 's', configRevision: 3, revisionPath: 'revision', eventTimePath: 'at' };
  const at = { checkedAt: '2026-10-24T12:00:00.000Z', ownerEpoch: 7 };
  const body = (value) => ({ kind: 'body', text: JSON.stringify(value) });
  const run = (reads, c = cfg) => {
    let state = ext.initialSourceState();
    return reads.map((read) => {
      const out = ext.acceptRead(c, state, read, at);
      state = out.state;
      return out.acquisition;
    });
  };

  test('a newer revision with a lower count is accepted; a repeat is unchanged; older and conflicting are stale', () => {
    const out = run([
      body({ revision: 2, votes: 3700, at: 't2' }),
      body({ at: 't2', votes: 3700, revision: 2 }),
      body({ revision: 3, votes: 3680 }),
      body({ revision: 1, votes: 3500 }),
      body({ revision: 3, votes: 9999 }),
    ]);
    assert.deepEqual(
      out.map((a) => [a.status, a.acceptedRevision, a.providerSequence ?? null]),
      [
        ['changed', 1, 2],
        ['unchanged', 1, 2],
        ['changed', 2, 3],
        ['stale', 2, null],
        ['stale', 2, null],
      ],
    );
    assert.equal(out[0].providerEventTime, 't2');
    assert.deepEqual(out[2].payload, { revision: 3, votes: 3680 });
    assert.equal('payload' in out[1], false);
    for (const a of out) assert.deepEqual([a.v, a.sourceId, a.configRevision, a.ownerEpoch, a.checkedAt], [1, 's', 3, 7, at.checkedAt]);
  });

  test('malformed input, a missing revision and a failed read hold the last good; a valid empty collection is accepted', () => {
    const out = run([
      body({ revision: 1, list: [1] }),
      { kind: 'body', text: '{"revision": 2, "list": [' },
      body({ list: [] }),
      { kind: 'problem', status: 'failed', error: 'x' },
      body({ revision: 2, list: [] }),
    ]);
    assert.deepEqual(
      out.map((a) => [a.status, a.acceptedRevision]),
      [
        ['changed', 1],
        ['invalid', 1],
        ['invalid', 1],
        ['failed', 1],
        ['changed', 2],
      ],
    );
    assert.deepEqual(out[4].payload, { revision: 2, list: [] });
  });

  test('JSON nested too deeply to compare is invalid, not a crash', () => {
    const deep = `${'['.repeat(200_000)}${']'.repeat(200_000)}`;
    const [ok, out] = run([body({ revision: 1 }), { kind: 'body', text: deep }], { ...cfg, revisionPath: null });
    assert.equal(ok.status, 'changed');
    assert.deepEqual([out.status, out.acceptedRevision], ['invalid', 1]);
  });

  test('a provider without a revision is judged by content alone', () => {
    const out = run([body([1]), body([1]), body([]), body([1])], { ...cfg, revisionPath: null });
    assert.deepEqual(
      out.map((a) => a.status),
      ['changed', 'unchanged', 'changed', 'changed'],
    );
    assert.equal(out[3].acceptedRevision, 3);
  });
});

// ── The schedule ──────────────────────────────────────────────────────────────

describe('schedule', () => {
  test('the delay formula: poll after success, doubling with jitter, cap 60 s, Retry-After as a floor up to an hour', () => {
    assert.equal(ext.nextDelayMs(5000, 0, null, 0), 5000);
    assert.deepEqual([1, 2, 3, 4, 9].map((n) => ext.nextDelayMs(5000, n, null, 1)), [10_000, 20_000, 40_000, 60_000, 60_000]);
    assert.deepEqual([1, 2, 3, 4, 9].map((n) => ext.nextDelayMs(5000, n, null, 0)), [5000, 10_000, 20_000, 30_000, 30_000]);
    assert.equal(ext.nextDelayMs(5000, 1, 90_000, 1), 90_000);
    assert.equal(ext.nextDelayMs(5000, 0, 3_600_000, 0), 3_600_000);
    assert.equal(ext.nextDelayMs(5000, 0, 3_600_001, 0), 3_600_000);
    assert.equal(ext.retryAfterMs('Sat, 24 Oct 2026 12:00:30 GMT', T0), 30_000);
  });

  async function readTimes({ random, respond, seconds }) {
    const clock = fakeClock();
    const net = fakeNet(respond);
    const times = [];
    const wrapped = { ...net, request: async (req) => (times.push((clock.now() - T0) / 1000), net.request(req)) };
    const { c } = connector({ clock, net: wrapped, random });
    c.start();
    await clock.advance(seconds * 1000);
    c.stop();
    return times;
  }

  test('failures back off by doubling to the 60 s cap, with jitter between half and all of it', async () => {
    const failing = () => response(503);
    assert.deepEqual(await readTimes({ random: () => 1, respond: failing, seconds: 200 }), [0, 10, 30, 70, 130, 190]);
    assert.deepEqual(await readTimes({ random: () => 0, respond: failing, seconds: 100 }), [0, 5, 15, 35, 65, 95]);
  });

  test('a success returns to the 5 s poll', async () => {
    const respond = (_req, n) => (n <= 2 ? response(503) : JSON_OK()());
    assert.deepEqual(await readTimes({ random: () => 1, respond, seconds: 41 }), [0, 10, 30, 35, 40]);
  });

  test('Retry-After is honoured to the millisecond, in seconds and as a date', async () => {
    const seconds = (_req, n) => (n === 1 ? response(429, '', { 'retry-after': '90' }) : JSON_OK()());
    assert.deepEqual(await readTimes({ random: () => 0, respond: seconds, seconds: 90 }), [0, 90]);
    assert.deepEqual(await readTimes({ random: () => 0, respond: seconds, seconds: 89.999 }), [0]);
    const date = (_req, n) => (n === 1 ? response(503, '', { 'retry-after': new Date(T0 + 45_000).toUTCString() }) : JSON_OK()());
    assert.deepEqual(await readTimes({ random: () => 0, respond: date, seconds: 49 }), [0, 45]);
  });
});

// ── The read's limits ─────────────────────────────────────────────────────────

describe('limits', () => {
  /** A request that answers only when its signal aborts, as a stalled server does. */
  const stalled = (req) => new Promise((_resolve, reject) => req.signal.addEventListener('abort', () => reject(new Error('aborted'))));

  test('a read that has not answered in 10 s fails; at 9.999 s it is still waiting', async () => {
    const { c, clock } = connector({ net: fakeNet(stalled) });
    let done = null;
    c.readOnce().then((a) => (done = a));
    await clock.advance(9_999);
    assert.equal(done, null);
    await clock.advance(1);
    assert.equal(done.status, 'failed');
    assert.match(done.error, /did not answer in 10 seconds/);
  });

  test('a body that stalls after its headers fails at 10 s too', async () => {
    const respond = (req) => ({
      status: 200,
      headers: {},
      cancel() {},
      body: (async function* () {
        yield Buffer.from('{"revision":');
        await new Promise((resolve) => req.signal.addEventListener('abort', resolve));
        throw new Error('aborted');
      })(),
    });
    const { c, clock } = connector({ net: fakeNet(respond) });
    let done = null;
    c.readOnce().then((a) => (done = a));
    await clock.advance(9_999);
    assert.equal(done, null);
    await clock.advance(1);
    assert.match(done.error, /did not answer in 10 seconds/);
  });

  /** A JSON document of exactly `bytes` bytes. */
  const sized = (bytes) => {
    const head = '{"revision":1,"pad":"';
    return `${head}${'x'.repeat(bytes - head.length - 2)}"}`;
  };

  test('a 2 MiB body is read; one byte more is refused, counted or declared', async () => {
    const ok = await connector({ net: fakeNet(() => response(200, sized(2 * MiB))) }).c.readOnce();
    assert.equal(ok.status, 'changed');
    const over = await connector({ net: fakeNet(() => response(200, sized(2 * MiB + 1))) }).c.readOnce();
    assert.equal(over.status, 'failed');
    assert.match(over.error, /larger than 2097152 bytes/);
    let declared;
    const net = fakeNet(() => (declared = response(200, '{}', { 'content-length': String(2 * MiB + 1) })));
    const refused = await connector({ net }).c.readOnce();
    assert.match(refused.error, /larger than/);
    assert.equal(declared.pulled, false);
    assert.equal(declared.cancelled, true);
  });

  test('a body over the cap stops being read at the cap', async () => {
    let chunks = 0;
    const r = { status: 200, headers: {}, cancelled: false };
    r.cancel = () => void (r.cancelled = true);
    r.body = (async function* () {
      for (;;) {
        chunks += 1;
        yield Buffer.alloc(MiB);
      }
    })();
    const out = await connector({ net: fakeNet(() => r) }).c.readOnce();
    assert.match(out.error, /larger than/);
    assert.equal(chunks, 3);
    assert.equal(r.cancelled, true);
  });

  test('one read in flight: a second read shares it, and the schedule never stacks reads', async () => {
    const net = fakeNet(stalled);
    const { c, clock } = connector({ net });
    const first = c.readOnce();
    assert.equal(c.readOnce(), first);
    c.start();
    await clock.advance(9_000);
    c.readOnce();
    assert.equal(net.requests.length, 1);
    // The read times out at 10 s; the next waits out its 10 s backoff, and no missed read is made up.
    await clock.advance(10_999);
    assert.equal(net.requests.length, 1);
    await clock.advance(1);
    assert.equal(net.requests.length, 2);
    c.stop();
  });
});

describe('stopping and faults', () => {
  test('a read cut short by stop() reports nothing and is not a timeout', async () => {
    const stalled = (req) => new Promise((_resolve, reject) => req.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const { c, sent, logs, clock } = connector({ net: fakeNet(stalled) });
    const pending = c.readOnce();
    await clock.advance(3_000);
    c.stop();
    assert.equal(await pending, null);
    assert.deepEqual([sent.length, logs.length, c.state.failures], [0, 0, 0]);
  });

  test('a log that cannot be written does not stop the polling or count as a failure', async () => {
    const net = fakeNet(JSON_OK());
    let throws = 1;
    const { c, clock } = connector({
      net,
      log: () => {
        if (throws-- > 0) throw new Error('EPIPE');
      },
    });
    c.start();
    await clock.advance(10_000);
    assert.equal(net.requests.length, 3);
    assert.equal(c.state.failures, 0);
    c.stop();
  });

  test('a provider that echoes the credential cannot pass it to the sender', async () => {
    const net = fakeNet(() => response(200, JSON.stringify({ revision: 1, note: 'seen Bearer sekret-value here' })));
    const { c, sent } = connector({ config: { credentialRef: 'TOKEN_A' }, credential: 'sekret-value', net });
    await c.readOnce();
    assert.equal(sent[0].payload.note, `seen Bearer ${REDACTED} here`);
  });
});

// ── The hosted guard ──────────────────────────────────────────────────────────

describe('hosted guard', () => {
  const read = (endpoint, net) => connector({ config: { endpoint }, net }).c.readOnce();

  test('private, loopback, link-local and mapped addresses are refused before any connection', async () => {
    for (const endpoint of ['https://10.0.0.1/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://[::ffff:127.0.0.1]/x', 'https://[fd00:ec2::254]/x']) {
      const net = fakeNet(JSON_OK());
      const out = await read(endpoint, net);
      assert.equal(out.status, 'refused', endpoint);
      assert.equal(net.requests.length, 0, endpoint);
    }
  });

  test('a name with any private answer is refused whole; a public one is pinned to the checked address', async () => {
    const mixed = fakeNet(JSON_OK(), { 'api.example.com': ['93.184.216.34', '10.1.2.3'] });
    assert.equal((await read('https://api.example.com/x', mixed)).status, 'refused');
    assert.equal(mixed.requests.length, 0);
    const good = fakeNet(JSON_OK(), { 'api.example.com': ['2606:2800:220:1::1', '93.184.216.34'] });
    assert.equal((await read('https://api.example.com/x', good)).status, 'changed');
    assert.equal(good.requests[0].address, '93.184.216.34');
    assert.equal(good.requests[0].url.hostname, 'api.example.com');
    assert.deepEqual(good.lookups, ['api.example.com']);
  });

  test('another port, and a name that does not resolve, are not read', async () => {
    assert.equal((await read('https://api.example.com:8443/x', fakeNet(JSON_OK()))).status, 'refused');
    assert.equal((await read('https://nowhere.example.com/x', fakeNet(JSON_OK()))).status, 'failed');
  });

  test('every redirect is checked again: private, metadata, plain http and a name resolving private all refused', async () => {
    const dns = { 'api.example.com': ['93.184.216.34'], 'inside.example.com': ['192.168.1.5'] };
    for (const location of ['https://10.0.0.1/x', 'https://169.254.169.254/latest/meta-data', 'http://api.example.com/x', 'https://inside.example.com/x', 'https://api.example.com:22/x']) {
      const net = fakeNet((_req, n) => (n === 1 ? response(302, '', { location }) : JSON_OK()()), dns);
      const out = await read('https://api.example.com/results', net);
      assert.equal(out.status, 'refused', location);
      assert.equal(net.requests.length, 1, location);
    }
  });

  test('five redirects are followed; the sixth is refused', async () => {
    const hops = (count) => fakeNet((_req, n) => (n <= count ? response(301, '', { location: `/hop${n}` }) : JSON_OK()()));
    assert.equal((await read('https://api.example.com/results', hops(5))).status, 'changed');
    const six = hops(6);
    const out = await read('https://api.example.com/results', six);
    assert.equal(out.status, 'refused');
    assert.match(out.error, /more than 5 times/);
    assert.equal(six.requests.length, 6);
  });

  test('the bearer header goes to the configured origin only, kept on a same-origin redirect', async () => {
    const dns = { 'api.example.com': ['93.184.216.34'], 'cdn.example.net': ['93.184.216.35'] };
    const net = fakeNet((_req, n) => (n === 1 ? response(302, '', { location: '/moved' }) : n === 2 ? response(302, '', { location: 'https://cdn.example.net/r' }) : JSON_OK()()), dns);
    const out = await connector({ config: { credentialRef: 'TOKEN_A' }, credential: 'sekret-value', net }).c.readOnce();
    assert.equal(out.status, 'changed');
    assert.deepEqual(
      net.requests.map((r) => [r.url.href, r.headers.authorization ?? null]),
      [
        ['https://api.example.com/results', 'Bearer sekret-value'],
        ['https://api.example.com/moved', 'Bearer sekret-value'],
        ['https://cdn.example.net/r', null],
      ],
    );
    assert.equal(net.requests[0].headers.accept, 'application/json');
  });

  test('a local destination reads only its own origin', async () => {
    const net = fakeNet((_req, n) => (n === 1 ? response(302, '', { location: 'https://127.0.0.1:9999/other' }) : JSON_OK()()));
    const out = await readSource({
      config: config({ endpoint: 'https://127.0.0.1:8443/results', mode: 'local', caFile: 'ca.pem' }),
      credential: null,
      net,
      maxBytes: MiB,
      signal: new AbortController().signal,
      now: () => T0,
    });
    assert.equal(out.status, 'refused');
    assert.match(out.error, /outside the configured local destination/);
    assert.equal(net.requests.length, 1);
  });
});

// ── The real boundary: the replay server over HTTPS ───────────────────────────

describe('replay server', () => {
  let dir;
  let cert;
  let key;
  let token;
  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'replay-'));
    ({ cert, key } = makeTestCertificate(path.join(dir, 'tls')));
    token = makeToken();
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const localConfig = (url, over = {}) => config({ endpoint: url, mode: 'local', caFile: 'ca.pem', credentialRef: 'REPLAY_TOKEN', eventTimePath: 'observed_at', ...over });

  test('the timeline, read through the agent under one fake clock, is exact; unchanged receipts every 15 s at most; nothing leaks the token', async () => {
    const clock = fakeClock();
    const server = await startReplayServer({ token, cert, key, clock: clock.now, stepMs: 5000 });
    try {
      const sent = [];
      const logs = [];
      const c = createConnector({ config: localConfig(server.url), credential: token, ca: cert, clock, random: () => 0, send: async (a) => void sent.push(a), log: (l) => logs.push(l) });
      const seen = [];
      for (let i = 0; i < 9; i += 1) {
        seen.push([server.step(), await c.readOnce()]);
        await clock.advance(5000);
      }
      assert.deepEqual(
        seen.map(([step, a]) => [step, a.status, a.acceptedRevision, a.providerSequence ?? null]),
        [
          ['count-01', 'changed', 1, 1],
          ['count-increase', 'changed', 2, 2],
          ['duplicate', 'unchanged', 2, 2],
          ['correction-down', 'changed', 3, 3],
          ['older', 'stale', 3, null],
          ['malformed', 'invalid', 3, null],
          ['person-deleted', 'changed', 4, 4],
          ['empty-collection', 'changed', 5, 5],
          ['empty-collection', 'unchanged', 5, 5],
        ],
      );
      const byStep = Object.fromEntries(seen.map(([step, a]) => [step, a]).reverse());
      const aino = (a) => a.payload.candidates.find((x) => x.candidate_id === 'FI2027_02_101').votes;
      assert.deepEqual([aino(byStep['count-01']), aino(byStep['count-increase']), aino(byStep['correction-down'])], [3500, 3700, 3680]);
      assert.equal(byStep['correction-down'].providerEventTime, '2027-02-20T18:00:10Z');
      assert.equal(byStep['correction-down'].payload.candidates.some((x) => x.candidate_id === DELETED_PERSON), true);
      assert.equal(byStep['person-deleted'].payload.candidates.some((x) => x.candidate_id === DELETED_PERSON), false);
      assert.deepEqual(byStep['empty-collection'].payload.candidates, []);
      // The duplicate came 5 s after a change and the last read 5 s after one: neither is sent.
      assert.deepEqual(
        sent.map((a) => a.status),
        ['changed', 'changed', 'changed', 'stale', 'invalid', 'changed', 'changed'],
      );
      await clock.advance(10_000);
      assert.equal((await c.readOnce()).status, 'unchanged');
      assert.equal(sent.at(-1).status, 'unchanged');
      assert.equal('payload' in sent.at(-1), false);
      const everything = JSON.stringify({ sent, logs, exported: c.exportConfig() });
      assert.equal(everything.includes(token), false);
    } finally {
      await server.close();
    }
  });

  test('the timeline waits for the first authorized read', async () => {
    const clock = fakeClock();
    const server = await startReplayServer({ token, cert, key, clock: clock.now, stepMs: 5000 });
    try {
      await clock.advance(60_000);
      assert.equal(server.step(), 'count-01');
      const c = createConnector({ config: localConfig(server.url), credential: token, ca: cert, clock });
      assert.equal((await c.readOnce()).providerSequence, 1);
      await clock.advance(4_999);
      assert.equal(server.step(), 'count-01');
      await clock.advance(1);
      assert.equal(server.step(), 'count-increase');
    } finally {
      await server.close();
    }
  });

  test('an invalid or missing credential is denied by the server and backs off', async () => {
    const server = await startReplayServer({ token, cert, key });
    try {
      for (const credential of ['wrong-token', `${token}x`]) {
        const c = createConnector({ config: localConfig(server.url), credential, ca: cert, clock: fakeClock(), random: () => 1 });
        const out = await c.readOnce();
        assert.equal(out.status, 'denied');
        assert.match(out.error, /401/);
        assert.equal('payload' in out, false);
        assert.equal(c.state.nextDelayMs, 10_000);
      }
      const open = createConnector({ config: localConfig(server.url, { credentialRef: null }), ca: cert, clock: fakeClock() });
      assert.equal((await open.readOnce()).status, 'denied');
    } finally {
      await server.close();
    }
  });

  test('TLS validation stays on: a certificate the run does not trust is not read', async () => {
    const server = await startReplayServer({ token, cert, key });
    try {
      const other = makeTestCertificate(path.join(dir, 'other'));
      const out = await createConnector({ config: localConfig(server.url), credential: token, ca: other.cert, clock: fakeClock() }).readOnce();
      assert.equal(out.status, 'failed');
      assert.match(out.error, /could not be reached/);
      assert.throws(() => createConnector({ config: localConfig(server.url), credential: token, ca: null, clock: fakeClock() }), /certificate authority/);
    } finally {
      await server.close();
    }
  });

  test('hosted acquisition of the same loopback server fails closed before connecting', async () => {
    const server = await startReplayServer({ token, cert, key });
    try {
      let connections = 0;
      const counting = { ...nodeNet, request: (o) => (connections++, nodeNet.request(o)) };
      const hosted = config({ endpoint: server.url, credentialRef: 'REPLAY_TOKEN' });
      const out = await createConnector({ config: hosted, credential: token, net: counting, clock: fakeClock() }).readOnce();
      assert.equal(out.status, 'refused');
      assert.equal(connections, 0);
    } finally {
      await server.close();
    }
  });

  test('a credential that reaches an error message is redacted in the log', async () => {
    const logs = [];
    const c = createConnector({
      config: config({ credentialRef: 'PROVIDER_TOKEN' }),
      credential: token,
      net: fakeNet(JSON_OK()),
      clock: fakeClock(),
      send: async () => {
        throw new Error(`upstream echoed Bearer ${token}`);
      },
      log: (l) => logs.push(l),
    });
    await c.readOnce();
    const text = logs.join('\n');
    assert.equal(text.includes(token), false);
    assert.match(text, new RegExp(`Bearer \\${REDACTED.slice(0, -1)}\\]`));
  });

  test('the same configuration runs as a headless agent process; its log and export carry no token', async () => {
    const server = await startReplayServer({ token, cert, key, stepMs: 60_000 });
    try {
      writeFileSync(path.join(dir, 'ca.pem'), cert);
      const file = path.join(dir, 'connector.json');
      writeFileSync(file, JSON.stringify({ ...localConfig(server.url), caFile: 'ca.pem', pollMs: 1000 }));
      const script = path.join(ROOT, 'scripts/external-data-connector.mjs');
      const env = { ...process.env, REPLAY_TOKEN: token };
      const child = spawn(process.execPath, [script, '--config', file, '--minutes', '0.04'], { env, windowsHide: true });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      const code = await new Promise((resolve) => child.on('close', resolve));
      assert.equal(code, 0, err);
      const reports = out.trim().split('\n').map((line) => JSON.parse(line));
      assert.equal(reports[0].status, 'changed');
      assert.equal(reports[0].acceptedRevision, 1);
      assert.match(err, /results changed accepted=1/);
      const exported = spawnSync(process.execPath, [script, '--config', file, '--export'], { env, encoding: 'utf8', windowsHide: true });
      assert.equal(exported.status, 0, exported.stderr);
      assert.equal(JSON.parse(exported.stdout).credentialBound, false);
      writeFileSync(path.join(dir, 'exported.json'), exported.stdout);
      const refused = spawnSync(process.execPath, [script, '--config', path.join(dir, 'exported.json'), '--minutes', '0.01'], { env, encoding: 'utf8', windowsHide: true });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /rebind/);
      for (const text of [out, err, exported.stdout, exported.stderr, refused.stderr, readFileSync(path.join(dir, 'exported.json'), 'utf8')]) assert.equal(text.includes(token), false);
    } finally {
      await server.close();
    }
  });
});
