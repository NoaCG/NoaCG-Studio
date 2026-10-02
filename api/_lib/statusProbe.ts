// The health checks behind GET /api/status, which the outside status page's monitors call
// (docs/STATUS_PAGE.md). Each check exercises the same path a user's studio takes, so a green
// answer means that path works now, not that a process is merely alive:
//
//   database  a real query through the Data API (PostgREST -> Postgres) with the server key
//   auth      the sign-in service's own health route
//   storage   the file service that holds library assets
//   realtime  a websocket join on a private channel, authorised as a hosted output's join is
//
// What the answer never carries: the project URL, keys, service versions or any upstream error
// text. A failure is reported as a short reason code, so the public route is not a probe oracle
// for the backend's internals.

import { apiError, json } from './http.js';

export const STATUS_COMPONENTS = ['database', 'auth', 'storage', 'realtime'] as const;
export type StatusComponent = (typeof STATUS_COMPONENTS)[number];

/** `http_<code>` carries the upstream status number only, never its body. */
export type ProbeReason = 'timeout' | 'unreachable' | 'not_configured' | 'rejected' | `http_${number}`;

export interface ComponentResult {
  status: 'operational' | 'down';
  latencyMs: number;
  reason?: ProbeReason;
}

export interface StatusReport {
  status: 'operational' | 'down';
  /** When the oldest result in this answer was measured (results are reused for `memoMs`). */
  checkedAt: string;
  components: Partial<Record<StatusComponent, ComponentResult>>;
}

export interface ProbeConfig {
  url: string;
  publishableKey: string;
  secretKey: string;
}

/** The smallest WebSocket surface the realtime check needs, so a test can stand in for it. */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface ProbeDeps {
  fetch: typeof fetch;
  openSocket: (url: string) => SocketLike;
  now: () => number;
  /** Per check. A check slower than this reads as down: a user would see it hang. */
  timeoutMs: number;
  /** How long one measurement answers repeat calls on a warm instance. */
  memoMs: number;
}

/** The table the database check reads. Small, always present, read only by the server key. */
export const DATABASE_PROBE_TABLE = 'system_settings';
/**
 * A PRIVATE command-log topic, joined as a hosted output joins one: the join runs Realtime's
 * authorisation query against the `log-<uuid>` read policy (migration 0064), so a fault on that
 * path reads as down. The nil uuid belongs to no show, so the join hears nothing.
 */
export const REALTIME_PROBE_TOPIC = 'realtime:log-00000000-0000-0000-0000-000000000000';

/** The server's Supabase settings, by the same fallback chains as api/_lib/auth.ts and adminAuth.ts. */
export function probeConfigFromEnv(env: Record<string, string | undefined> = process.env): ProbeConfig {
  return {
    url: (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
    publishableKey: (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
    secretKey: (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  };
}

class ProbeFailure extends Error {
  constructor(readonly reason: ProbeReason) {
    super(reason);
  }
}

/** Run one HTTP check, aborting at the deadline. Any non-2xx is a failure with its code. */
async function httpCheck(deps: ProbeDeps, url: string, init: RequestInit): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  let res: Response;
  try {
    res = await deps.fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ProbeFailure(controller.signal.aborted ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }
  // The verdict needs only the status; release the body so the connection returns to the pool.
  await res.body?.cancel().catch(() => undefined);
  if (!res.ok) throw new ProbeFailure(`http_${res.status}`);
}

/** Join a channel over the realtime websocket and wait for the server's ok, as the playout link does. */
function realtimeCheck(deps: ProbeDeps, cfg: ProbeConfig): Promise<void> {
  const wsUrl =
    `${cfg.url.replace(/^http/, 'ws')}/realtime/v1/websocket` +
    `?apikey=${encodeURIComponent(cfg.publishableKey)}&vsn=1.0.0`;
  return new Promise<void>((resolve, reject) => {
    let socket: SocketLike;
    try {
      socket = deps.openSocket(wsUrl);
    } catch {
      reject(new ProbeFailure('unreachable'));
      return;
    }
    let settled = false;
    const finish = (failure: ProbeReason | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Closing a socket that never opened can throw; the verdict is already decided.
      }
      if (failure) reject(new ProbeFailure(failure));
      else resolve();
    };
    const timer = setTimeout(() => finish('timeout'), deps.timeoutMs);
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          topic: REALTIME_PROBE_TOPIC,
          event: 'phx_join',
          payload: { config: { broadcast: { self: false }, presence: { key: '' }, private: true } },
          ref: '1',
          join_ref: '1',
        }),
      );
    };
    socket.onmessage = (ev) => {
      let msg: { event?: unknown; ref?: unknown; payload?: { status?: unknown } };
      try {
        msg = JSON.parse(String(ev.data)) as typeof msg;
      } catch {
        return;
      }
      if (msg.event !== 'phx_reply' || msg.ref !== '1') return;
      finish(msg.payload?.status === 'ok' ? null : 'rejected');
    };
    socket.onerror = () => finish('unreachable');
    socket.onclose = () => finish('unreachable');
  });
}

async function checkComponent(component: StatusComponent, deps: ProbeDeps, cfg: ProbeConfig): Promise<void> {
  if (!cfg.url || !cfg.publishableKey) throw new ProbeFailure('not_configured');
  const apikey = { apikey: cfg.publishableKey };
  switch (component) {
    case 'database':
      if (!cfg.secretKey) throw new ProbeFailure('not_configured');
      // HEAD still runs the query in Postgres; it only drops the body. A missing-table answer
      // would come from PostgREST's schema cache without touching the database, which is why
      // this reads a table that exists rather than probing an arbitrary name.
      return httpCheck(deps, `${cfg.url}/rest/v1/${DATABASE_PROBE_TABLE}?select=key&limit=1`, {
        method: 'HEAD',
        headers: { apikey: cfg.secretKey, authorization: `Bearer ${cfg.secretKey}` },
      });
    case 'auth':
      return httpCheck(deps, `${cfg.url}/auth/v1/health`, { headers: apikey });
    case 'storage':
      return httpCheck(deps, `${cfg.url}/storage/v1/status`, { headers: apikey });
    case 'realtime':
      return realtimeCheck(deps, cfg);
  }
}

async function measure(component: StatusComponent, deps: ProbeDeps, cfg: ProbeConfig): Promise<ComponentResult> {
  const started = deps.now();
  let reason: ProbeReason | undefined;
  try {
    await checkComponent(component, deps, cfg);
  } catch (err) {
    reason = err instanceof ProbeFailure ? err.reason : 'unreachable';
  }
  const latencyMs = Math.max(0, deps.now() - started);
  return reason ? { status: 'down', latencyMs, reason } : { status: 'operational', latencyMs };
}

/** One measurement and when it started; repeat calls inside `memoMs` share it. */
interface Held {
  at: number;
  result: Promise<ComponentResult>;
}

function isStatusComponent(value: string): value is StatusComponent {
  return (STATUS_COMPONENTS as readonly string[]).includes(value);
}

/**
 * The GET /api/status handler. `?component=<name>` checks one component and answers for it
 * alone, so each monitor on the status page can follow one thing; with no query every
 * component is checked. 200 means every component asked about is operational, 503 means at
 * least one is down; the JSON body says which.
 */
export function createStatusHandler(
  deps: ProbeDeps,
  config: () => ProbeConfig = () => probeConfigFromEnv(),
): (req: Request) => Promise<Response> {
  const memo = new Map<StatusComponent, Held>();

  const resultFor = (component: StatusComponent): Held => {
    const now = deps.now();
    const held = memo.get(component);
    if (held && now - held.at < deps.memoMs) return held;
    const fresh = { at: now, result: measure(component, deps, config()) };
    memo.set(component, fresh);
    return fresh;
  };

  return async (req) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return apiError('invalid', `${req.method} not allowed`, 405, {}, { allow: 'GET, HEAD' });
    }
    const asked = new URL(req.url).searchParams.get('component');
    if (asked !== null && !isStatusComponent(asked)) {
      return apiError('invalid', `unknown component; one of: ${STATUS_COMPONENTS.join(', ')}`, 400);
    }
    const components: readonly StatusComponent[] = asked ? [asked] : STATUS_COMPONENTS;
    const held = components.map((c) => resultFor(c));
    const results = await Promise.all(held.map((h) => h.result));

    const report: StatusReport = {
      status: results.every((r) => r.status === 'operational') ? 'operational' : 'down',
      checkedAt: new Date(Math.min(...held.map((h) => h.at))).toISOString(),
      components: Object.fromEntries(components.map((c, i) => [c, results[i]])),
    };
    const res = json(report, report.status === 'operational' ? 200 : 503, { 'x-robots-tag': 'noindex' });
    return req.method === 'HEAD' ? new Response(null, res) : res;
  };
}
