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
const { createConnector, createSourceSender, nodeNet, readSource, REDACTED } = await import('./external-data-connector.mjs');
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
    credentialBound: true,
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
    assert.match(ext.parseConnectorConfig({ ...base, endpoint: 'https://a.example/x', credentialRef: 'NOACG_SOURCE_T', credentialBound: 'false' }).error, /credentialBound/);
  });

  test('a credential is a NOACG_SOURCE_ variable, bound only when the config says so', () => {
    const base = { v: 1, sourceId: 's', productionId: 'p', configRevision: 1, endpoint: 'https://a.example/x' };
    for (const ref of ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'NOACG_SOURCE_', 'noacg_source_x']) assert.match(ext.parseConnectorConfig({ ...base, credentialRef: ref }).error, /NOACG_SOURCE_/, ref);
    assert.equal(ext.parseConnectorConfig({ ...base, credentialRef: 'NOACG_SOURCE_X' }).config.credentialBound, false);
    assert.equal(ext.parseConnectorConfig({ ...base, credentialRef: 'NOACG_SOURCE_X', credentialBound: true }).config.credentialBound, true);
    assert.equal(ext.parseConnectorConfig(base).config.credentialBound, true);
    assert.throws(() => ext.bindConnectorCredential(ext.parseConnectorConfig(base).config, 'CRON_SECRET'), /NOACG_SOURCE_/);
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
    const bound = config({ credentialRef: 'NOACG_SOURCE_PROVIDER' });
    const { c } = connector({ config: { credentialRef: 'NOACG_SOURCE_PROVIDER' }, credential: token, net: fakeNet(JSON_OK()) });
    const exported = c.exportConfig();
    const text = JSON.stringify(exported);
    assert.equal(text.includes(token), false);
    assert.equal(exported.credentialRef, 'NOACG_SOURCE_PROVIDER');
    assert.equal(exported.credentialBound, false);
    const reread = ext.parseConnectorConfig(JSON.parse(text));
    assert.ok(reread.ok);
    assert.throws(() => createConnector({ config: reread.config, credential: token, clock: fakeClock() }), /rebind/);
    const rebound = ext.bindConnectorCredential(reread.config, 'NOACG_SOURCE_OTHER');
    assert.deepEqual(rebound, { ...bound, credentialRef: 'NOACG_SOURCE_OTHER' });
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
    // A provider minimum above the cap holds through an outage.
    assert.deepEqual([1, 5].map((n) => ext.nextDelayMs(120_000, n, null, 0)), [120_000, 120_000]);
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

  test('a revision the sender failed to take is offered again until it is', async () => {
    const net = fakeNet(JSON_OK({ revision: 1, n: 1 }));
    const offered = [];
    let fail = 2;
    const { c, clock } = connector({
      net,
      send: async (a) => {
        offered.push([a.status, a.acceptedRevision, a.payload?.n ?? null, a.checkedAt]);
        if (fail-- > 0) throw new Error('sender down');
      },
    });
    await c.readOnce();
    await clock.advance(5000);
    await c.readOnce();
    await clock.advance(5000);
    await c.readOnce();
    await clock.advance(5000);
    await c.readOnce();
    const at = (s) => new Date(T0 + s * 1000).toISOString();
    assert.deepEqual(offered, [
      ['changed', 1, 1, at(0)],
      ['changed', 1, 1, at(5)],
      ['changed', 1, 1, at(10)],
    ]);
    // Taken at last at 10 s, so the read at 15 s sends nothing: the ordinary receipt comes 15 s
    // after the revision was taken (E4.2).
    await clock.advance(9999);
    await c.readOnce();
    assert.equal(offered.length, 3);
    await clock.advance(1);
    await c.readOnce();
    assert.deepEqual(offered.at(-1), ['unchanged', 1, null, at(25)]);
  });

  test('redaction keeps the payload valid, numbers untouched', async () => {
    const net = fakeNet(() => response(200, JSON.stringify({ revision: 1, count: 123456, note: 'id 123456', list: ['123456'] })));
    const { c, sent } = connector({ config: { credentialRef: 'NOACG_SOURCE_A' }, credential: '123456', net });
    await c.readOnce();
    assert.deepEqual(sent[0].payload, { revision: 1, count: 123456, note: `id ${REDACTED}`, list: [REDACTED] });
  });

  test('a provider that echoes the credential cannot pass it to the sender', async () => {
    const net = fakeNet(() => response(200, JSON.stringify({ revision: 1, note: 'seen Bearer sekret-value here' })));
    const { c, sent } = connector({ config: { credentialRef: 'NOACG_SOURCE_A' }, credential: 'sekret-value', net });
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
    const out = await connector({ config: { credentialRef: 'NOACG_SOURCE_A' }, credential: 'sekret-value', net }).c.readOnce();
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

  const localConfig = (url, over = {}) => config({ endpoint: url, mode: 'local', caFile: 'ca.pem', credentialRef: 'NOACG_SOURCE_REPLAY', eventTimePath: 'observed_at', ...over });

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
      const hosted = config({ endpoint: server.url, credentialRef: 'NOACG_SOURCE_REPLAY' });
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
      config: config({ credentialRef: 'NOACG_SOURCE_PROVIDER' }),
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
      const env = { ...process.env, NOACG_SOURCE_REPLAY: token };
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

// ── Gaps the E4.1 check left open, pinned in E4.2 ─────────────────────────────

describe('pinned edges (E4.1 check)', () => {
  const sizedJson = (bytes) => {
    const head = '{"revision":1,"pad":"';
    return `${head}${'x'.repeat(bytes - head.length - 2)}"}`;
  };

  test('(a) the real socket connects to the checked address, not to a fresh lookup of the name', async () => {
    // A certificate for a name no resolver knows: only the pinned address can reach the server.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pin-'));
    try {
      spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1', '-subj', '/CN=pinned.noacg.invalid',
        '-addext', 'subjectAltName=DNS:pinned.noacg.invalid', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore', windowsHide: true });
      const cert = readFileSync(path.join(dir, 'c.pem'));
      const { createServer } = await import('node:https');
      const server = createServer({ cert, key: readFileSync(path.join(dir, 'k.pem')) }, (req, res) => res.end(`{"host":"${req.headers.host}"}`));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const url = new URL(`https://pinned.noacg.invalid:${server.address().port}/r`);
        const res = await nodeNet.request({ url, address: '127.0.0.1', family: 4, headers: {}, signal: new AbortController().signal, ca: cert });
        let text = '';
        for await (const chunk of res.body) text += chunk;
        assert.equal(res.status, 200);
        assert.equal(JSON.parse(text).host, url.host);
      } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('(b) a declared Content-Length of exactly 2 MiB is read', async () => {
    const text = sizedJson(2 * MiB);
    const ok = await connector({ net: fakeNet(() => response(200, text, { 'content-length': String(2 * MiB) })) }).c.readOnce();
    assert.equal(ok.status, 'changed');
  });

  test('(c) a revision exactly one below the accepted one is stale', () => {
    let state = ext.initialSourceState();
    const read = (value) => {
      const out = ext.acceptRead({ sourceId: 's', configRevision: 1, revisionPath: 'revision', eventTimePath: null }, state, { kind: 'body', text: JSON.stringify(value) }, { checkedAt: 'x', ownerEpoch: 1 });
      state = out.state;
      return out.acquisition.status;
    };
    assert.deepEqual([read({ revision: 3, n: 1 }), read({ revision: 2, n: 2 }), read({ revision: 4, n: 3 })], ['changed', 'stale', 'changed']);
  });

  test('(d) 403 is reported as denied, like 401', async () => {
    for (const status of [401, 403]) {
      const a = await connector({ net: fakeNet(() => response(status)) }).c.readOnce();
      assert.deepEqual([a.status, a.error], ['denied', `the provider refused the credential (${status})`]);
    }
  });

  test('(e) stale and invalid answers do not count as failures for the backoff', async () => {
    const answers = [response(503), response(200, '{"revision":5,"n":1}'), response(503), response(200, '{"revision":4,"n":2}'), response(200, 'not json')];
    const { c } = connector({ net: fakeNet(() => answers.shift()) });
    const seen = [];
    for (let i = 0; i < 5; i += 1) {
      const a = await c.readOnce();
      seen.push([a.status, c.state.failures, c.state.nextDelayMs]);
    }
    assert.deepEqual(seen, [
      ['failed', 1, 10_000],
      ['changed', 0, 5000],
      ['failed', 1, 10_000],
      ['stale', 0, 5000],
      ['invalid', 0, 5000],
    ]);
  });

  test('(f) a credential inside a JSON object key is redacted at the seam', async () => {
    const net = fakeNet(() => response(200, JSON.stringify({ revision: 1, 'sekret-value': { 'x sekret-value': 1 } })));
    const { c, sent } = connector({ config: { credentialRef: 'NOACG_SOURCE_A' }, credential: 'sekret-value', net });
    await c.readOnce();
    assert.deepEqual(sent[0].payload, { revision: 1, [REDACTED]: { [`x ${REDACTED}`]: 1 } });
    assert.equal(JSON.stringify(sent).includes('sekret-value'), false);
  });

  test('(g) an unchanged receipt goes at 15 s after the last one, not at 14 999 ms', async () => {
    const clock = fakeClock();
    const { c, sent } = connector({ clock, net: fakeNet(JSON_OK({ revision: 1, n: 1 })) });
    await c.readOnce();
    await clock.advance(14_999);
    await c.readOnce();
    assert.deepEqual(sent.map((a) => a.status), ['changed']);
    await clock.advance(1);
    await c.readOnce();
    assert.deepEqual(sent.map((a) => a.status), ['changed', 'unchanged']);
  });
});

// ── The sender to /api/data/source (E4.2) ─────────────────────────────────────

describe('the sender', () => {
  /** A production that answers the route's shapes; `answer(body)` decides each reply. */
  function fakeRoute(answer) {
    const calls = [];
    const fetchImpl = async (address, init) => {
      const body = JSON.parse(init.body);
      calls.push({ address, auth: init.headers.authorization, body });
      const [status, reply] = answer(body);
      return new Response(JSON.stringify(reply), { status });
    };
    return { calls, fetchImpl };
  }
  const claimed = (epoch, accepted = 0, sequence = null) => [200, { ok: true, claim: `agent:c${epoch}`, ownerEpoch: epoch, acceptedRevision: accepted, providerSequence: sequence, paused: false }];

  test('claims first, continues from the production revision and sends under its epoch', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(4, 9, 7) : [200, { ok: true }]));
    const net = fakeNet(JSON_OK({ revision: 8, n: 1 }));
    const sender = createSourceSender({ address: 'https://x.example/api/data/source', key: 'data-key', config: config(), fetchImpl: route.fetchImpl });
    const { c } = connector({ net, send: sender.send });
    sender.bind(c);
    assert.equal(await sender.claim(), true);
    const a = await c.readOnce();
    assert.deepEqual([a.status, a.ownerEpoch, a.acceptedRevision, a.providerSequence], ['changed', 4, 10, 8]);
    const report = route.calls[1].body;
    assert.deepEqual([report.op, report.claim, report.acquisition.ownerEpoch, report.acquisition.acceptedRevision], ['report', 'agent:c4', 4, 10]);
    assert.equal(route.calls.every((call) => call.auth === 'Bearer data-key'), true);
  });

  test('after a restart the provider\'s current revision is sent whole once, then is unchanged', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(2, 5, 9) : [200, { ok: true }]));
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    const clock = fakeClock();
    const { c } = connector({ clock, net: fakeNet(JSON_OK({ revision: 9, n: 1 })), send: sender.send });
    sender.bind(c);
    await sender.claim();
    const first = await c.readOnce();
    assert.deepEqual([first.status, first.acceptedRevision, first.providerSequence], ['changed', 6, 9]);
    await clock.advance(5000);
    assert.equal((await c.readOnce()).status, 'unchanged');
  });

  test('an older provider revision than the production holds is stale after a restart', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(2, 5, 9) : [200, { ok: true }]));
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    const { c } = connector({ net: fakeNet(JSON_OK({ revision: 8, n: 1 })), send: sender.send });
    sender.bind(c);
    await sender.claim();
    assert.equal((await c.readOnce()).status, 'stale');
  });

  test('a lost fence: the next report claims again, and nothing made under the old epoch is sent', async () => {
    let epoch = 1;
    const route = fakeRoute((b) => {
      if (b.op === 'claim') return claimed(epoch);
      return b.acquisition.ownerEpoch === epoch ? [200, { ok: true }] : [409, { ok: false, refused: 'epoch' }];
    });
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    let n = 0;
    const clock = fakeClock();
    const { c } = connector({ clock, net: fakeNet(() => JSON_OK({ revision: (n += 1), n })()), send: sender.send });
    sender.bind(c);
    await sender.claim();
    await c.readOnce();
    epoch = 2; // another claim took over and lost it again: this agent must claim afresh
    await clock.advance(5000);
    await c.readOnce();
    await clock.advance(5000);
    await c.readOnce();
    await clock.advance(5000);
    await c.readOnce();
    const reports = route.calls.filter((call) => call.body.op === 'report').map((call) => [call.body.acquisition.ownerEpoch, call.body.acquisition.acceptedRevision]);
    // Revision 2 under epoch 1 is refused once; the re-offer after the new claim is dropped, and
    // the next read goes whole under epoch 2.
    assert.deepEqual(reports, [[1, 1], [1, 2], [2, 1]]);
    assert.equal(route.calls.filter((call) => call.body.op === 'claim').length, 2);
  });

  test('a Pause, the 5 s gap and the budget keep the revision for the next read; a held claim sends nothing', async () => {
    const refusals = ['paused', 'too_soon', 'budget'];
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(1) : refusals.length ? [b.acquisition.status === 'changed' ? 409 : 200, { ok: false, refused: refusals.shift() }] : [200, { ok: true }]));
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    const clock = fakeClock();
    const { c } = connector({ clock, net: fakeNet(JSON_OK({ revision: 1, n: 1 })), send: sender.send });
    sender.bind(c);
    await sender.claim();
    for (let i = 0; i < 4; i += 1) {
      await c.readOnce();
      await clock.advance(5000);
    }
    const reports = route.calls.filter((call) => call.body.op === 'report').map((call) => call.body.acquisition.status);
    assert.deepEqual(reports, ['changed', 'changed', 'changed', 'changed']);

    const held = fakeRoute(() => [409, { ok: false, held: true, owner: 'agent' }]);
    const second = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: held.fetchImpl });
    const other = connector({ net: fakeNet(JSON_OK()), send: second.send });
    second.bind(other.c);
    assert.equal(await second.claim(), false);
    await other.c.readOnce();
    assert.deepEqual(held.calls.map((call) => call.body.op), ['claim', 'claim']);
  });

  test('a revision the production already holds, or one too large to fit, is not offered again', async () => {
    for (const refusal of [[409, 'old_revision'], [413, 'too_large'], [413, 'row_too_large']]) {
      let first = true;
      const route = fakeRoute((b) => {
        if (b.op === 'claim') return claimed(1);
        if (!first) return [200, { ok: true }];
        first = false;
        return [refusal[0], { ok: false, refused: refusal[1] }];
      });
      const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
      // The same answer every read: an offer made again would show as a second report.
      const clock = fakeClock();
      const { c } = connector({ clock, net: fakeNet(JSON_OK({ revision: 1, n: 1 })), send: sender.send });
      sender.bind(c);
      await sender.claim();
      for (let i = 0; i < 3; i += 1) {
        await c.readOnce();
        await clock.advance(5000);
      }
      const reports = route.calls.filter((call) => call.body.op === 'report').map((call) => call.body.acquisition.status);
      assert.deepEqual(reports, ['changed'], refusal[1]);
    }
  });

  test('a new claim sends the next read whole, even when the provider has not changed', async () => {
    let claims = 0;
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed((claims += 1), claims === 1 ? 0 : 7) : [200, { ok: true }]));
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    const clock = fakeClock();
    const { c } = connector({ clock, net: fakeNet(JSON_OK({ revision: 1, n: 1 })), send: sender.send });
    sender.bind(c);
    await sender.claim();
    assert.equal((await c.readOnce()).status, 'changed');
    // Another claim (a handover, a lapse): the production holds revision 7 under epoch 2.
    await sender.claim();
    await clock.advance(5000);
    const again = await c.readOnce();
    assert.deepEqual([again.status, again.ownerEpoch, again.acceptedRevision], ['changed', 2, 8]);
  });

  test('a change only outside sendPaths is not a new revision', async () => {
    let tick = 0;
    const { c } = connector({ config: { sendPaths: ['revision', 'score'] }, net: fakeNet(() => JSON_OK({ revision: 1, score: 3, generatedAt: (tick += 1) })()) });
    const seen = [];
    for (let i = 0; i < 3; i += 1) seen.push((await c.readOnce()).status);
    assert.deepEqual(seen, ['changed', 'unchanged', 'unchanged']);
  });

  test('the claim is renewed every 10 s with no read at all, so a slow poll never loses it', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(1) : [200, { ok: true }]));
    const clock = fakeClock();
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl, clock });
    await sender.claim();
    const stop = sender.keepClaim(10_000);
    await clock.advance(9999);
    assert.equal(route.calls.length, 1);
    await clock.advance(1);
    await clock.advance(20_000);
    assert.deepEqual(route.calls.map((call) => [call.body.op, call.body.claim]), [['claim', null], ['claim', 'agent:c1'], ['claim', 'agent:c1'], ['claim', 'agent:c1']]);
    stop();
    await clock.advance(60_000);
    assert.equal(route.calls.length, 4);
  });

  test('a report answered within the renewal interval renewed the lease, so no claim is sent', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(1) : [200, { ok: true }]));
    const clock = fakeClock();
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl, clock });
    const { c } = connector({ clock, net: fakeNet(JSON_OK()), send: sender.send });
    sender.bind(c);
    await sender.claim();
    const stop = sender.keepClaim(10_000);
    await clock.advance(5000);
    await c.readOnce();
    await clock.advance(5000);
    assert.deepEqual(route.calls.map((call) => call.body.op), ['claim', 'report']);
    await clock.advance(10_000);
    assert.deepEqual(route.calls.map((call) => call.body.op), ['claim', 'report', 'claim']);
    stop();
  });

  test('a revision refused as too soon waits the time the production named before it is sent again', async () => {
    const clock = fakeClock();
    // The production refuses every report before 4 s, naming the time left each time.
    const route = fakeRoute((b) => {
      if (b.op === 'claim') return claimed(1);
      const left = T0 + 4000 - clock.now();
      return left > 0 ? [429, { ok: false, refused: 'too_soon', retryMs: left }] : [200, { ok: true }];
    });
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config({ pollMs: 1000 }), fetchImpl: route.fetchImpl, clock });
    const { c } = connector({ clock, config: { pollMs: 1000 }, net: fakeNet(JSON_OK()), send: sender.send });
    sender.bind(c);
    await sender.claim();
    for (let i = 0; i < 6; i += 1) {
      await c.readOnce();
      await clock.advance(1000);
    }
    const reports = route.calls.filter((call) => call.body.op === 'report').map((call) => call.body.acquisition.status);
    // Refused at 0 s, held through 3 s, taken at 4 s.
    assert.deepEqual(reports, ['changed', 'changed']);
  });

  test('a renewal the server did not answer keeps the claim; a refusal ends it', async () => {
    const replies = [claimed(1), [503, {}], [409, { ok: false, refused: 'gone' }]];
    const route = fakeRoute(() => replies.shift());
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    await sender.claim();
    assert.equal(await sender.claim(), false);
    assert.equal(sender.fence?.claim, 'agent:c1');
    assert.equal(await sender.claim(), false);
    assert.equal(sender.fence, null);
  });

  test('a production that stalls ends the request at the deadline, and the revision is offered again', async () => {
    let stall = true;
    const calls = [];
    const fetchImpl = (address, init) => {
      const body = JSON.parse(init.body);
      calls.push(body.op);
      if (body.op === 'claim') return Promise.resolve(new Response(JSON.stringify(claimed(1)[1]), { status: 200 }));
      if (!stall) return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      // Never answers; only the signal ends it.
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    };
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl, timeoutMs: 50 });
    const clock = fakeClock();
    const { c } = connector({ clock, net: fakeNet(JSON_OK({ revision: 1, n: 1 })), send: sender.send });
    sender.bind(c);
    await sender.claim();
    const started = Date.now();
    await c.readOnce();
    assert.ok(Date.now() - started < 2000, 'the stalled report ended at its deadline');
    stall = false;
    await clock.advance(5000);
    await c.readOnce();
    assert.deepEqual(calls, ['claim', 'report', 'report']);
  });

  test('shutdown ends a request in flight', async () => {
    let started;
    const ended = new Promise((resolve) => (started = resolve));
    const fetchImpl = (_address, init) =>
      new Promise((_resolve, reject) => {
        started();
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl, timeoutMs: 60_000 });
    const claiming = sender.claim();
    await ended;
    sender.abort();
    await assert.rejects(claiming, /stopped/);
  });

  test('sendPaths project the payload before it is sent; release lets the claim go', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? claimed(1) : [200, { ok: true }]));
    const cfg = config({ sendPaths: ['revision', 'totals.counted'] });
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: cfg, fetchImpl: route.fetchImpl });
    const sent = [];
    const c = createConnector({ config: cfg, clock: fakeClock(), net: fakeNet(JSON_OK({ revision: 1, big: 'x'.repeat(1000), totals: { counted: 60, other: 1 } })), send: async (a) => (sent.push(a), sender.send(a)) });
    sender.bind(c);
    await sender.claim();
    await c.readOnce();
    assert.deepEqual(sent[0].payload, { revision: 1, totals: { counted: 60 } });
    await sender.release();
    assert.deepEqual(route.calls.at(-1).body, { v: 1, sourceId: 'results', configRevision: 1, op: 'release', claim: 'agent:c1' });
    assert.equal(sender.fence, null);
  });

  test('a sample the production asks for: one read with the credential, projected and redacted, posted under the claim; never a revision', async () => {
    const token = 'provider-secret-123';
    let asks = 0;
    const route = fakeRoute((b) => (b.op === 'claim' ? [200, { ...claimed(3)[1], sample: (asks += 1) === 1 }] : [200, { ok: true }]));
    const cfg = config({ sendPaths: ['revision', 'board'], credentialRef: 'NOACG_SOURCE_X' });
    const net = fakeNet(JSON_OK({ revision: 4, board: [{ id: 1, note: `echo ${token}` }], hidden: 'not sent' }));
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: cfg, fetchImpl: route.fetchImpl });
    const c = createConnector({ config: cfg, credential: token, clock: fakeClock(), net, send: sender.send });
    sender.bind(c);
    await sender.claim();
    await sender.sampling;
    const posted = route.calls.filter((call) => call.body.op === 'sample');
    assert.deepEqual(posted.map((call) => call.body), [{ v: 1, sourceId: 'results', configRevision: 1, op: 'sample', claim: 'agent:c3', sample: { revision: 4, board: [{ id: 1, note: `echo ${REDACTED}` }] } }]);
    assert.equal(net.requests[0].headers.authorization, `Bearer ${token}`, 'the agent reads with its own credential');
    assert.equal(JSON.stringify(route.calls).includes(token), false, 'the credential never reaches the production');
    assert.deepEqual(c.state.acceptedRevision, 0, 'a sample is not a revision');
    // Asked once: a renewal that does not ask reads nothing more.
    await sender.claim();
    await sender.sampling;
    assert.equal(net.requests.length, 1);
  });

  test('a sample read that fails posts nothing, and one ask at a time is read', async () => {
    const route = fakeRoute((b) => (b.op === 'claim' ? [200, { ...claimed(1)[1], sample: true }] : [200, { ok: true }]));
    const net = fakeNet(() => response(500));
    const sender = createSourceSender({ address: 'https://x.example/s', key: 'k', config: config(), fetchImpl: route.fetchImpl });
    const logs = [];
    const c = createConnector({ config: config(), clock: fakeClock(), net, send: sender.send, log: (line) => logs.push(line) });
    sender.bind(c);
    await Promise.all([sender.claim(), sender.claim()]);
    await sender.sampling;
    assert.equal(net.requests.length, 1, 'the second ask waited on the first');
    assert.equal(route.calls.some((call) => call.body.op === 'sample'), false);
    assert.match(logs.join('\n'), /sample not read: the provider answered 500/);
  });
});
