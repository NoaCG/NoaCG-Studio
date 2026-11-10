import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// INSTRUMENTS FOR THE LIVE-PUBLISHING BASELINE (docs/work-specs/live-publishing/spec.md, phase 2,
// "How the agent tests and measures"). Nothing here changes the product: every stamp is taken from
// outside it, by an init script, a fetch wrapper the page cannot tell from fetch, a DevTools
// screencast or a request listener.
//
// ONE TIME ORIGIN: every stamp is `performance.timeOrigin + performance.now()` (or an event's
// `timeStamp` on the same base), in the page that saw it. All pages and outputs run in one
// Playwright run on one machine, so the stamps compare across pages.

/** One stamped event, in epoch milliseconds on the page's high-resolution clock. */
export interface Stamp { t: number }
export interface Press extends Stamp { kind: string; target: string | null; key?: string }
export interface Sent extends Stamp { name: string; end?: number; status?: number; failed?: string; body?: string }
export interface FramePlay { graphic: string; playAt: number; dispatchAt: number | null }

/**
 * The operator page's stamps: every pointerdown and keydown (capture phase, so before any app
 * handler) and every fetch, with its RPC or table name, start and end. The fetch wrapper also keeps
 * the request body for `control_send_seq` so a sample can be matched to its graphic.
 */
export const OPERATOR_STAMPS = () => {
  if (window.top !== window) return;
  const w = window as unknown as { __lpm: { presses: unknown[]; sends: unknown[] } };
  w.__lpm = { presses: [], sends: [] };
  const now = () => performance.timeOrigin + performance.now();
  const target = (e: Event) => {
    const el = e.target as Element | null;
    const hit = el && typeof el.closest === 'function' ? el.closest('[data-testid]') : null;
    return hit ? hit.getAttribute('data-testid') : null;
  };
  for (const kind of ['pointerdown', 'click', 'keydown']) {
    window.addEventListener(kind, (e) => {
      w.__lpm.presses.push({ kind, t: performance.timeOrigin + e.timeStamp, target: target(e), key: (e as KeyboardEvent).key });
    }, true);
  }
  const nameOf = (url: string) => {
    const rpc = /\/rpc\/([a-z_0-9]+)/.exec(url);
    if (rpc) return `rpc:${rpc[1]}`;
    const rest = /\/rest\/v1\/([a-z_0-9]+)/.exec(url);
    if (rest) return `rest:${rest[1]}`;
    const storage = /\/storage\/v1\/object/.test(url);
    if (storage) return 'storage';
    try { return `${new URL(url, location.href).host}${new URL(url, location.href).pathname}`; } catch { return url; }
  };
  // Relayed hardware-panel presses reach the page on its Realtime socket: stamp each frame that
  // names a measurement press id, on arrival, before the app's own handler runs.
  const NativeSocket = window.WebSocket;
  const frames: { t: number; data: string }[] = [];
  (w.__lpm as unknown as { frames: unknown[] }).frames = frames;
  window.WebSocket = class extends NativeSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener('message', (e: MessageEvent) => {
        const t = now();
        // Realtime sends broadcasts as binary frames; read them as text to find the press id.
        const text = typeof e.data === 'string' ? e.data : e.data instanceof ArrayBuffer ? new TextDecoder().decode(e.data) : '';
        if (text.includes('lp2deck:')) frames.push({ t, data: text.slice(0, 600) });
      });
    }
  };
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rec: Record<string, unknown> = { name: nameOf(url), t: now() };
    if (/control_send_seq|control_send_many/.test(url) && typeof init?.body === 'string') rec.body = init.body.slice(0, 2000);
    w.__lpm.sends.push(rec);
    return original(input, init).then(
      (r) => { rec.end = now(); rec.status = r.status; return r; },
      (e) => { rec.end = now(); rec.failed = String(e); throw e; },
    );
  };
};

/**
 * Inside every output graphic frame (the sandboxed srcdoc documents the output stage builds): the
 * moment `window.play()` is called and the first animation frame after it ("render dispatch").
 * `window.play` is wrapped on the first preview command, before the document's own command queue
 * can reach it.
 */
export const FRAME_STAMPS = () => {
  if (window.top === window) return;
  const w = window as unknown as { __lpmFrame: unknown[]; play?: (...a: unknown[]) => unknown; __lpmWrapped?: boolean };
  w.__lpmFrame = [];
  const wrap = () => {
    if (w.__lpmWrapped || typeof w.play !== 'function') return;
    const real = w.play;
    w.__lpmWrapped = true;
    w.play = function (this: unknown, ...args: unknown[]) {
      const rec: Record<string, number | null> = { playAt: performance.timeOrigin + performance.now(), dispatchAt: null };
      w.__lpmFrame.push(rec);
      requestAnimationFrame(() => { rec.dispatchAt = performance.timeOrigin + performance.now(); });
      return real.apply(this, args);
    };
  };
  window.addEventListener('message', (ev) => {
    const msg = ev.data as { type?: string } | null;
    if (msg && msg.type === 'spx-preview-cmd') wrap();
  }, true);
};

export async function instrument(context: BrowserContext): Promise<void> {
  await context.addInitScript(OPERATOR_STAMPS);
  await context.addInitScript(FRAME_STAMPS);
}

export type Lpm = { presses: Press[]; sends: Sent[]; frames?: { t: number; data: string }[] };
export const readLpm = (page: Page): Promise<Lpm> =>
  page.evaluate(() => (window as unknown as { __lpm: { presses: Press[]; sends: Sent[] } }).__lpm);
export const clearLpm = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as unknown as { __lpm: { presses: unknown[]; sends: unknown[] } };
    w.__lpm.presses.length = 0;
    w.__lpm.sends.length = 0;
    const f = (w.__lpm as unknown as { frames?: unknown[] }).frames;
    if (f) f.length = 0;
  });
export const nowOn = (page: Page): Promise<number> => page.evaluate(() => performance.timeOrigin + performance.now());

/** Every output frame's play stamps, keyed by nothing: the caller knows which graphic it took. */
export async function framePlays(output: Page): Promise<{ url: string; plays: { playAt: number; dispatchAt: number | null }[] }[]> {
  const out = [];
  for (const frame of output.frames()) {
    if (frame === output.mainFrame()) continue;
    const plays = await frame.evaluate(() => (window as unknown as { __lpmFrame?: { playAt: number; dispatchAt: number | null }[] }).__lpmFrame ?? []).catch(() => []);
    out.push({ url: frame.url(), plays });
  }
  return out;
}

// ── NETWORK: unthrottled, or 20 Mbit/s with 50 ms latency both ways (the spec's throttled case). ──

export type Net = 'fast' | 'slow';
export const NET_CONDITIONS = {
  fast: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  slow: { offline: false, latency: 50, downloadThroughput: (20 * 1_000_000) / 8, uploadThroughput: (20 * 1_000_000) / 8 },
} as const;

export async function throttle(page: Page, net: Net): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NET_CONDITIONS[net]);
  return cdp;
}

// ── BYTES: every request and response body and header of a page, from DevTools' own counts. ──

export interface ByteMeter { reset(): void; total(): { requests: number; up: number; down: number; byName: Record<string, { n: number; up: number; down: number }> } }

/** Count bytes on the wire for one page (and its frames): request bodies plus headers up,
 *  encoded response bytes down (`Network.loadingFinished.encodedDataLength`, headers included),
 *  WebSocket frames both ways. */
export async function meterBytes(page: Page, cdp?: CDPSession): Promise<ByteMeter> {
  const session = cdp ?? (await page.context().newCDPSession(page));
  await session.send('Network.enable');
  const names = new Map<string, string>();
  let byName: Record<string, { n: number; up: number; down: number }> = {};
  let requests = 0;
  const bucket = (name: string) => (byName[name] ??= { n: 0, up: 0, down: 0 });
  const nameOf = (url: string) => {
    const rpc = /\/rpc\/([a-z_0-9]+)/.exec(url);
    if (rpc) return `rpc:${rpc[1]}`;
    const rest = /\/rest\/v1\/([a-z_0-9]+)/.exec(url);
    if (rest) return `rest:${rest[1]}`;
    if (/\/storage\/v1\//.test(url)) return 'storage';
    if (/\/auth\/v1\//.test(url)) return 'auth';
    if (/^data:/.test(url)) return 'data-url';
    try { const u = new URL(url); return u.port === '54421' || /supabase/.test(u.host) ? `api${u.pathname}` : 'app'; } catch { return 'other'; }
  };
  session.on('Network.requestWillBeSent', (e) => {
    const name = nameOf(e.request.url);
    if (name === 'data-url') return;
    names.set(e.requestId, name);
    requests += 1;
    const headers = Object.entries(e.request.headers).reduce((n, [k, v]) => n + k.length + String(v).length + 4, 0);
    const body = e.request.postData ? Buffer.byteLength(e.request.postData) : 0;
    const b = bucket(name);
    b.n += 1;
    b.up += headers + body + e.request.url.length;
  });
  session.on('Network.loadingFinished', (e) => {
    const name = names.get(e.requestId);
    if (name) bucket(name).down += e.encodedDataLength;
  });
  session.on('Network.webSocketFrameSent', (e) => { bucket('websocket').up += Buffer.byteLength(e.response.payloadData); });
  session.on('Network.webSocketFrameReceived', (e) => { bucket('websocket').down += Buffer.byteLength(e.response.payloadData); });
  return {
    reset() { byName = {}; requests = 0; },
    total() {
      let up = 0, down = 0;
      for (const b of Object.values(byName)) { up += b.up; down += b.down; }
      return { requests, up, down, byName: JSON.parse(JSON.stringify(byName)) };
    },
  };
}

// ── FIRST SEEN: a DevTools screencast of the output, every frame with its own capture time. ──

export interface Screencast { frames: { t: number; size: number; hash: string }[]; stop(): Promise<void> }

/** Start a PNG screencast of `page`. A frame's `t` is DevTools' own capture timestamp (epoch ms). */
export async function screencast(page: Page): Promise<Screencast> {
  const { createHash } = await import('node:crypto');
  const cdp = await page.context().newCDPSession(page);
  const frames: Screencast['frames'] = [];
  cdp.on('Page.screencastFrame', (e) => {
    const buf = Buffer.from(e.data, 'base64');
    frames.push({ t: (e.metadata.timestamp ?? 0) * 1000, size: buf.length, hash: createHash('sha1').update(buf).digest('hex') });
    void cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 480, maxHeight: 270, everyNthFrame: 1 });
  return {
    frames,
    async stop() { await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {}); },
  };
}

// ── STATISTICS ──

export function pct(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[i];
}

export function summary(values: number[], failures = 0) {
  const ok = values.filter((x) => Number.isFinite(x));
  return { n: ok.length, failures, p50: pct(ok, 50), p95: pct(ok, 95), min: ok.length ? Math.min(...ok) : null, max: ok.length ? Math.max(...ok) : null };
}

/** Write one result file under test-results/measure/. */
export function writeResult(name: string, data: unknown): string {
  const path = `test-results/measure/${name}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

export const FIXTURE = (process.env.MEASURE_FIXTURE ?? 'typical') as 'typical' | 'large';
export const NET = (process.env.MEASURE_NET ?? 'fast') as Net;
export const SAMPLES = Number(process.env.MEASURE_SAMPLES ?? 50);
