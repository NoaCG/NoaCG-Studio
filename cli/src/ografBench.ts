// The OGraf HOST bench: mount a third-party OGraf package under the app origin and drive its Web
// Component the way a renderer does (load -> update -> every custom action -> play -> next ->
// stop -> dispose), collecting every ReturnPayload. A module import needs a real http(s) URL and
// a component's `new URL(…, import.meta.url)` needs a base, so the package is served by
// `context.route` from the zip's own files at `/__noacg-package/<nonce>/…` - no server, same
// origin, still inside the contained context (the mount is the one extra allowlist entry).

import { randomBytes } from 'node:crypto';
import type { BridgeClient, OgrafPackageRead } from './bridgeClient.js';
import { paintBackground, shoot } from './screenshot.js';

const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'application/javascript',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export interface OgrafBenchStep {
  action: string;
  statusCode: number;
  statusMessage?: string;
  currentStep?: number;
}

export interface OgrafBenchResult {
  steps: OgrafBenchStep[];
  errors: string[];
  /** PNG of the host page after mount + play, when asked for. */
  screenshot?: Uint8Array;
}

/** Drive one third-party Graphic end to end in the contained context. */
export async function ografBench(
  bridge: BridgeClient,
  read: OgrafPackageRead,
  files: Map<string, Uint8Array>,
  opts: { screenshot?: boolean; timeoutMs?: number; background?: string | null; backgroundArg?: string } = {},
): Promise<OgrafBenchResult> {
  const nonce = randomBytes(6).toString('hex');
  const base = `${bridge.origin}/__noacg-package/${nonce}/`;
  const manifestDir = read.manifestPath.includes('/') ? read.manifestPath.slice(0, read.manifestPath.lastIndexOf('/') + 1) : '';
  bridge.bench.allow(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await bridge.bench.context.route(`${base}**`, (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(base).pathname.length));
    const body = files.get(`${manifestDir}${rel}`) ?? files.get(rel);
    if (!body) return route.fulfill({ status: 404, body: 'not in package' });
    const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
    return route.fulfill({
      status: 200,
      contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
      body: Buffer.from(body),
    });
  });

  const m = read.manifest;
  const main = typeof m.main === 'string' ? m.main : 'graphic.mjs';
  const id = typeof m.id === 'string' ? m.id : 'graphic';
  const req = Array.isArray(m.renderRequirements) && m.renderRequirements[0] && typeof m.renderRequirements[0] === 'object'
    ? (m.renderRequirements[0] as { resolution?: { width?: { ideal?: number; exact?: number }; height?: { ideal?: number; exact?: number } } })
    : null;
  const width = req?.resolution?.width?.ideal ?? req?.resolution?.width?.exact ?? 1920;
  const height = req?.resolution?.height?.ideal ?? req?.resolution?.height?.exact ?? 1080;
  const tag = await bridge.hostTagFor(id, nonce);
  const hostHtml = await bridge.ografHost({ packageBase: base, main, tag, width, height });

  const page = await bridge.bench.newPage();
  const steps: OgrafBenchStep[] = [];
  const errors: string[] = [];
  try {
    await page.setViewportSize({ width, height });
    // The host document is MOUNTED under the app origin as well and navigated to - a real
    // document with a real base URL, not a setContent'd one - and the ready wait polls on an
    // interval (a second page's rAF can stall while the bridge page holds the foreground).
    const hostUrl = `${bridge.origin}/__noacg-host/${nonce}.html`;
    await bridge.bench.context.route(hostUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: hostHtml }));
    await page.goto(hostUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as { __noacgHostReady?: boolean }).__noacgHostReady === true, undefined, { polling: 100, timeout: opts.timeoutMs ?? 20_000 });

    const defaults: Record<string, unknown> = {};
    for (const d of read.contract.descriptors) defaults[d.key] = d.kind === 'number' ? Number(d.defaultValue) || 0 : d.kind === 'toggle' ? d.defaultValue === 'true' : d.defaultValue;
    const drive = async (action: string, fn: string, ...args: unknown[]): Promise<OgrafBenchStep> => {
      const payload = (await page.evaluate(
        async ({ fn, args }) => {
          const host = (window as unknown as { __ografHost: Record<string, (...a: unknown[]) => Promise<unknown>> }).__ografHost;
          return host[fn](...args);
        },
        { fn, args },
      )) as { statusCode?: number; statusMessage?: string; currentStep?: number };
      const step: OgrafBenchStep = { action, statusCode: payload?.statusCode ?? 200, ...(payload?.statusMessage ? { statusMessage: payload.statusMessage } : {}), ...(typeof payload?.currentStep === 'number' ? { currentStep: payload.currentStep } : {}) };
      steps.push(step);
      if (step.statusCode >= 400) errors.push(`ograf-host: ${action} -> ${step.statusCode}${step.statusMessage ? ` ${step.statusMessage}` : ''}`);
      return step;
    };
    await drive('load', 'mount', defaults, { resolution: { width, height } });
    await drive('updateAction', 'update', defaults);
    for (const b of read.contract.buttons) {
      const payload: Record<string, unknown> = {};
      for (const key of b.payload ?? []) payload[key] = defaults[key] ?? '';
      await drive(`customAction ${b.event}`, 'custom', b.event, payload);
    }
    await drive('playAction', 'play', {});
    if (read.contract.steps.count > 1 || read.contract.steps.count === -1) await drive('playAction {delta:1}', 'play', { delta: 1 });
    let screenshot: Uint8Array | undefined;
    if (opts.screenshot) {
      // Settle a moment, then shoot the host page as it stands (the graphic on air), over the
      // asked-for ground if there is one.
      await page.waitForTimeout(1200);
      await paintBackground(page, opts.background, opts.backgroundArg);
      screenshot = new Uint8Array(await page.screenshot({ omitBackground: true, type: 'png' }));
    }
    await drive('stopAction', 'stop', {});
    await drive('dispose', 'dispose');
    return { steps, errors, ...(screenshot ? { screenshot } : {}) };
  } catch (e) {
    errors.push(`ograf-host: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return { steps, errors };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export { shoot };
