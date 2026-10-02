import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createStatusHandler,
  DATABASE_PROBE_TABLE,
  probeConfigFromEnv,
  REALTIME_PROBE_TOPIC,
  STATUS_COMPONENTS,
  type ProbeConfig,
  type ProbeDeps,
  type SocketLike,
  type StatusReport,
} from './statusProbe.js';

const CONFIG: ProbeConfig = {
  url: 'https://projectref.supabase.co',
  publishableKey: 'sb_publishable_test',
  secretKey: 'sb_secret_test',
};

type RealtimeBehaviour = 'ok' | 'error' | 'close' | 'silent' | 'throw';

interface Harness {
  deps: ProbeDeps;
  calls: { url: string; init?: RequestInit }[];
  sockets: { url: string; sent: string[] }[];
  advance(ms: number): void;
}

/** Fake upstreams: `http` answers per path fragment, `realtime` picks the socket's behaviour. */
function harness(opts: {
  http?: (url: string) => Response | 'throw' | 'hang';
  realtime?: RealtimeBehaviour;
  timeoutMs?: number;
  memoMs?: number;
} = {}): Harness {
  let clock = 1_000_000;
  const calls: Harness['calls'] = [];
  const sockets: Harness['sockets'] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const answer = opts.http ? opts.http(url) : new Response(null, { status: 200 });
    if (answer === 'throw') throw new TypeError('fetch failed: getaddrinfo ENOTFOUND projectref.supabase.co');
    if (answer === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    return answer;
  }) as typeof fetch;

  const openSocket = (url: string): SocketLike => {
    const behaviour = opts.realtime ?? 'ok';
    if (behaviour === 'throw') throw new Error('bad url');
    const record = { url, sent: [] as string[] };
    sockets.push(record);
    const socket: SocketLike = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send(data) {
        record.sent.push(data);
        const msg = JSON.parse(data) as { ref: string; topic: string };
        if (behaviour === 'ok' || behaviour === 'error') {
          setTimeout(() =>
            socket.onmessage?.({
              data: JSON.stringify({
                event: 'phx_reply',
                ref: msg.ref,
                topic: msg.topic,
                payload: { status: behaviour, response: { reason: 'internal detail' } },
              }),
            }),
          );
        }
      },
      close() {},
    };
    setTimeout(() => {
      if (behaviour === 'close') socket.onclose?.({});
      else socket.onopen?.({});
    });
    return socket;
  };

  return {
    deps: {
      fetch: fakeFetch,
      openSocket,
      now: () => clock,
      timeoutMs: opts.timeoutMs ?? 50,
      memoMs: opts.memoMs ?? 10_000,
    },
    calls,
    sockets,
    advance(ms) {
      clock += ms;
    },
  };
}

async function call(
  h: Harness,
  path = '/api/status',
  method = 'GET',
  config: ProbeConfig = CONFIG,
): Promise<{ status: number; body: StatusReport; text: string; res: Response }> {
  const handle = createStatusHandler(h.deps, () => config);
  const res = await handle(new Request(`https://noacg.studio${path}`, { method }));
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as StatusReport, text, res };
}

test('every component is checked and reported when all are up', async () => {
  const h = harness();
  const { status, body, res } = await call(h);
  assert.equal(status, 200);
  assert.equal(body.status, 'operational');
  assert.deepEqual(Object.keys(body.components), [...STATUS_COMPONENTS]);
  for (const c of STATUS_COMPONENTS) assert.equal(body.components[c]?.status, 'operational');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.ok(!Number.isNaN(Date.parse(body.checkedAt)));
});

test('the database check runs a real query with the server key; the others use the publishable key', async () => {
  const h = harness();
  await call(h);
  const db = h.calls.find((c) => c.url.includes('/rest/v1/'));
  assert.ok(db, 'database was queried');
  assert.equal(db.url, `${CONFIG.url}/rest/v1/${DATABASE_PROBE_TABLE}?select=key&limit=1`);
  assert.equal(db.init?.method, 'HEAD');
  assert.equal(new Headers(db.init?.headers).get('apikey'), CONFIG.secretKey);
  for (const other of h.calls.filter((c) => c !== db)) {
    assert.equal(new Headers(other.init?.headers).get('apikey'), CONFIG.publishableKey);
    assert.equal(new Headers(other.init?.headers).get('authorization'), null);
  }
  assert.ok(h.calls.some((c) => c.url === `${CONFIG.url}/auth/v1/health`));
  assert.ok(h.calls.some((c) => c.url === `${CONFIG.url}/storage/v1/status`));
});

test('the realtime check joins a channel over the websocket, as the playout link does', async () => {
  const h = harness();
  await call(h, '/api/status?component=realtime');
  assert.equal(h.sockets.length, 1);
  assert.match(h.sockets[0].url, /^wss:\/\/projectref\.supabase\.co\/realtime\/v1\/websocket\?apikey=sb_publishable_test&vsn=1\.0\.0$/);
  const join = JSON.parse(h.sockets[0].sent[0]) as {
    event: string;
    topic: string;
    payload: { config: { private?: boolean } };
  };
  assert.equal(join.event, 'phx_join');
  assert.equal(join.topic, REALTIME_PROBE_TOPIC);
  // Private, on a topic the hosted-output read policy covers, so the join runs its authorisation.
  assert.equal(join.payload.config.private, true);
  assert.match(REALTIME_PROBE_TOPIC, /^realtime:log-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('one component down makes the answer 503 and names it, the rest stay operational', async () => {
  const h = harness({ http: (url) => new Response('upstream detail', { status: url.includes('/auth/') ? 502 : 200 }) });
  const { status, body } = await call(h);
  assert.equal(status, 503);
  assert.equal(body.status, 'down');
  assert.deepEqual(body.components.auth, { status: 'down', latencyMs: 0, reason: 'http_502' });
  assert.equal(body.components.database?.status, 'operational');
  assert.equal(body.components.realtime?.status, 'operational');
});

test('a hanging upstream reads as a timeout, a refused connection as unreachable', async () => {
  const hang = await call(harness({ http: () => 'hang' }), '/api/status?component=auth');
  assert.equal(hang.status, 503);
  assert.equal(hang.body.components.auth?.reason, 'timeout');

  const refused = await call(harness({ http: () => 'throw' }), '/api/status?component=storage');
  assert.equal(refused.body.components.storage?.reason, 'unreachable');
});

test('realtime: a refused join, a dropped socket and silence are each down', async () => {
  const cases: [RealtimeBehaviour, string][] = [
    ['error', 'rejected'],
    ['close', 'unreachable'],
    ['silent', 'timeout'],
    ['throw', 'unreachable'],
  ];
  for (const [behaviour, reason] of cases) {
    const { status, body } = await call(harness({ realtime: behaviour }), '/api/status?component=realtime');
    assert.equal(status, 503, behaviour);
    assert.equal(body.components.realtime?.reason, reason, behaviour);
  }
});

test('a missing backend configuration is down, never silently operational', async () => {
  const { status, body } = await call(harness(), '/api/status', 'GET', { url: '', publishableKey: '', secretKey: '' });
  assert.equal(status, 503);
  for (const c of STATUS_COMPONENTS) assert.equal(body.components[c]?.reason, 'not_configured');

  // Without the server key only the database check is impossible.
  const noSecret = await call(harness(), '/api/status', 'GET', { ...CONFIG, secretKey: '' });
  assert.equal(noSecret.body.components.database?.reason, 'not_configured');
  assert.equal(noSecret.body.components.auth?.status, 'operational');
});

test('the answer never carries the project address, a key or upstream error text', async () => {
  const h = harness({
    http: () => new Response('relation "x" does not exist at db.projectref.supabase.co', { status: 500 }),
    realtime: 'error',
  });
  const { text } = await call(h);
  for (const secret of ['projectref', 'supabase', CONFIG.publishableKey, CONFIG.secretKey, 'internal detail', 'relation']) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
});

test('one component answers alone, and only that one is checked', async () => {
  const h = harness();
  const { status, body } = await call(h, '/api/status?component=auth');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body.components), ['auth']);
  assert.equal(h.calls.length, 1);
  assert.equal(h.sockets.length, 0);
});

test('an unknown component is a 400 and a write method a 405', async () => {
  const unknown = await call(harness(), '/api/status?component=billing');
  assert.equal(unknown.status, 400);
  const post = await call(harness(), '/api/status', 'POST');
  assert.equal(post.status, 405);
});

test('HEAD answers with the same status and no body', async () => {
  const up = await call(harness(), '/api/status', 'HEAD');
  assert.equal(up.status, 200);
  assert.equal(up.text, '');
  const down = await call(harness({ http: () => new Response(null, { status: 503 }) }), '/api/status', 'HEAD');
  assert.equal(down.status, 503);
});

test('repeat calls inside the memo window share one measurement, then it is measured again', async () => {
  const h = harness({ memoMs: 10_000 });
  const handle = createStatusHandler(h.deps, () => CONFIG);
  const get = (): Promise<Response> => handle(new Request('https://noacg.studio/api/status?component=auth'));
  await get();
  await get();
  assert.equal(h.calls.length, 1);
  h.advance(10_000);
  await get();
  assert.equal(h.calls.length, 2);
});

test('the server resolves the Supabase variables as the rest of api/ does', () => {
  assert.deepEqual(
    probeConfigFromEnv({
      VITE_SUPABASE_URL: 'https://a.supabase.co/',
      VITE_SUPABASE_ANON_KEY: ' pk ',
      SUPABASE_SERVICE_ROLE_KEY: 'sk',
    }),
    { url: 'https://a.supabase.co', publishableKey: 'pk', secretKey: 'sk' },
  );
  assert.deepEqual(
    probeConfigFromEnv({
      SUPABASE_URL: 'https://b.supabase.co',
      VITE_SUPABASE_URL: 'https://a.supabase.co',
      SUPABASE_ANON_KEY: 'pk2',
      SUPABASE_SECRET_KEY: 'sk2',
      SUPABASE_SERVICE_ROLE_KEY: 'sk',
    }),
    { url: 'https://b.supabase.co', publishableKey: 'pk2', secretKey: 'sk2' },
  );
});
