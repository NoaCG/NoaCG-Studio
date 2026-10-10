// THE SHADOW MOUNT PAINTS THE LIGHT MOUNT'S FRAME, measured on a virtual clock.
//
// AC-3 of docs/work-specs/ograf-shadow-root/spec.md. Frames taken on the wall clock differ between
// ANY two mounts of a design that moves, light against light as much as light against shadow (the
// spikes measured it), so every frame here is taken at a stated time on a clock the harness owns
// (decision 5):
//
//  - each renderer page runs on Playwright's page clock, paused, so `Date`, the timers and
//    `requestAnimationFrame` move only when the harness runs it forward;
//  - GSAP's ticker is detached (`GSAP_DETACH_JS`, as the non-real-time document detaches it) and
//    `gsap.updateRoot` is driven from that clock's animation frames;
//  - every CSS animation in the graphic is paused at the sample's time before the frame is taken;
//  - every face and picture is loaded before Play, and every frame is painted afresh (see `sample`).
//
// Each design is mounted in four pages, one per variant, which see the same designs in the same
// order: the light build, the light build again, the shadow build, and the studio's own document
// in an iframe. Light against light again says whether the design is deterministic here at all;
// only then does light against shadow count. Light against the studio document is RECORDED, not
// asserted: at the flip it becomes the reference, and a design that differs there today is an
// OGraf defect older than the shadow root (decision 5).
//
// Every package is built in the app by the real target from a template the real generators made.

import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GSAP_DETACH_JS } from '../src/render/runtimeScript';
import { decodePng } from '../scripts/png-decode.mjs';
import { installGraphicBody } from './_graphicBody';
import { graphicTemplate, ografPackages, type GraphicSource, type OgrafFiles, type OgrafMount } from './_ografMount';

/** Fewer differing pixels than this, a frame matches (the conformance spec's bound). */
export const PARITY_BOUND = 1_000;
/** Per colour channel, the difference two pixels may have and still match (the conformance spec's). */
const CHANNEL_TOLERANCE = 24;
/**
 * Milliseconds after Play: two frames during the entrance and one once it has landed. The clock
 * runs frame by frame to the first, then jumps (every due timer and animation frame fired once on
 * the way): GSAP renders by time, not by frame count, and running every frame of four seconds
 * cost most of the sweep.
 */
const SAMPLES_MS = [300, 800, 4_000];

const ORIGIN = 'http://ograf-parity.local';
const GROUND = 'rgb(10, 20, 30)';
const START = new Date('2026-10-10T12:00:00Z');
/** Where the paused clock stands once a renderer page has loaded: the same instant in every page. */
const PAUSED_AT = new Date('2026-10-10T12:00:30Z');

/** What the renderer serves each package file as: an SVG picture, for one, renders only as image/svg+xml. */
const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'application/javascript', '.js': 'application/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

const GSAP_SOURCE = readFileSync(fileURLToPath(new URL('../src/assets/gsap.min.js', import.meta.url)));
const FONTS_DIR = new URL('../public/fonts/', import.meta.url);
/** The bundled faces the studio documents fetch, read once. */
const fontFiles = new Map<string, Buffer | null>();

/**
 * The renderer page. GSAP is the renderer's (`ensureGsap` uses a `window.gsap` that is already
 * there), loaded first so it can be detached before anything animates, and driven from the page
 * clock's frames. `color-scheme: dark` matches the studio document's, or Chromium paints the
 * studio's iframe opaque.
 */
const HOST_PAGE = (rules: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>Renderer</title>
<style>
  html, body { margin: 0; overflow: hidden; background: ${GROUND}; }
  #stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
  #stage > * { position: absolute; inset: 0; }
  #stage > iframe { border: 0; width: 1920px; height: 1080px; }
${rules}
</style>
<script src="/gsap.min.js"></script>
<script>
  // GSAP detached from real time, then driven from this window's (virtual) animation frames.
  window.parityDriveGsap = function (win) {
    win.eval(${JSON.stringify(GSAP_DETACH_JS)});
    var g = win.gsap, start = win.performance.now(), base = g.ticker.time;
    (function frame() {
      g.updateRoot(base + (win.performance.now() - start) / 1000);
      win.requestAnimationFrame(frame);
    })();
  };
  window.parityDriveGsap(window);
</script>
</head><body><div id="stage"></div></body></html>`;

/** What a design is built from: `e2e/_ografMount.ts`'s sources, the stretch probe among them. */
export type ParitySource = GraphicSource;

/** The Hairline with the importer's stretch runtime over a box whose line is wider than its slot. */
export const STRETCH_PROBE: ParitySource = {
  kind: 'probe',
  name: 'Stretch Probe',
  stretch: true,
  html: '<div class="probe-box"><div data-stretch><span data-fit="shrink">a line wider than its slot</span></div></div>',
  css: [
    '.probe-box { position: absolute; left: 1400px; top: 100px; width: calc(300px + var(--stretch-x, 0px)); height: 40px; background: #f5a623; }',
    '.probe-box [data-stretch] { width: calc(300px + var(--stretch-x, 0px)); overflow: hidden; white-space: nowrap; }',
    '.probe-box [data-fit] { display: inline-block; width: 600px; }',
  ].join('\n'),
};

/** One way of putting a design on a renderer page: which build, on a page with which rules. */
export interface ParityVariant {
  name: string;
  mount: OgrafMount | 'studio';
  /** Added to the renderer page's stylesheet. */
  rules?: string;
}

/** The mount comparison: light, light again, shadow, and the studio's document. */
const MOUNT_VARIANTS: ParityVariant[] = [
  { name: 'light', mount: 'light' },
  { name: 'lightAgain', mount: 'light' },
  { name: 'shadow', mount: 'shadow' },
  { name: 'studio', mount: 'studio' },
];

/** One design, built for the mounts its variants use: each package as files, the studio's
 *  document as html, or why each could not be built. */
interface Built {
  key: string;
  light?: OgrafFiles;
  shadow?: OgrafFiles;
  studio?: { html: string } | string;
}

/**
 * One design's reading: for every variant after the first, the pixels each of its frames differs
 * from the first variant's, per sample in `SAMPLES_MS` order. A variant that could not show the
 * design has no entry, and says why in `error`.
 */
export interface ParityRow {
  key: string;
  error?: string;
  against: Record<string, number[]>;
}

/** The key a source is reported and served under. */
function sourceKey(source: ParitySource): string {
  if (source.kind === 'design') return source.id;
  if (source.kind === 'lottie') return 'lottie';
  return `${source.kind}-${source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Build each source for `mounts` in the app page (on the app's origin). */
async function build(app: Page, sources: ParitySource[], mounts: Set<ParityVariant['mount']>): Promise<Array<Built | { key: string; error: string }>> {
  const packaged = (['light', 'shadow'] as const).filter((mount) => mounts.has(mount));
  const out: Array<Built | { key: string; error: string }> = [];
  for (const source of sources) {
    const key = sourceKey(source);
    let template: unknown;
    try {
      template = await graphicTemplate(app, source);
    } catch (err) {
      out.push({ key, error: `build: ${String((err as Error)?.message ?? err).slice(0, 300)}` });
      continue;
    }
    const built: Built = { key, ...(packaged.length ? await ografPackages(app, template, packaged) : {}) };
    if (mounts.has('studio')) {
      built.studio = await app.evaluate(async (template) => {
        try {
          const { composeDocument } = await import('/src/preview/composeDocument.ts');
          return { html: composeDocument(template as never) };
        } catch (err) {
          return `build: ${String((err as Error)?.message ?? err).slice(0, 300)}`;
        }
      }, template);
    }
    out.push(built);
  }
  return out;
}

/** A renderer page on a paused clock, serving `served` under `/<key>/<mount>/`. */
async function openRenderer(browser: Browser, served: Map<string, Built>, rules: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    if (path === '') return route.fulfill({ status: 200, contentType: 'text/html', body: HOST_PAGE(rules) });
    if (path === 'gsap.min.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: GSAP_SOURCE });
    // The studio document's bundled faces: `fonts/x.woff2` against the srcdoc's base, this page.
    if (path.startsWith('fonts/')) {
      if (!fontFiles.has(path)) {
        try {
          fontFiles.set(path, readFileSync(new URL(path.slice(6), FONTS_DIR)));
        } catch {
          fontFiles.set(path, null);
        }
      }
      const face = fontFiles.get(path);
      return face ? route.fulfill({ status: 200, contentType: 'font/woff2', body: face }) : route.fulfill({ status: 404, body: 'not found' });
    }
    const [key, mount, ...rest] = path.split('/');
    const files = served.get(key)?.[mount as OgrafMount];
    const body = typeof files === 'object' ? files.get(rest.join('/')) : undefined;
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    const type = CONTENT_TYPES[/\.[a-z0-9]+$/i.exec(path)?.[0].toLowerCase() ?? ''] ?? 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body });
  });
  await page.clock.install({ time: START });
  await installGraphicBody(page);
  await page.goto(`${ORIGIN}/`);
  await page.clock.pauseAt(PAUSED_AT);
  return page;
}

/**
 * Mount one design in one variant's page, Play it, and take a frame at each sample time; then take
 * it off the page. Answers the frames, or why there are none.
 */
async function sample(page: Page, built: Built, mount: ParityVariant['mount'], tag: string): Promise<Buffer[] | string> {
  const own = built[mount];
  if (own === undefined) return 'not built';
  if (typeof own === 'string') return own;
  const mounted = await page.evaluate(async ({ mount, url, tag, studio }) => {
    const stage = document.getElementById('stage')!;
    let doc = document;
    if (mount === 'studio') {
      const frame = document.createElement('iframe');
      await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = studio; stage.appendChild(frame); });
      const win = frame.contentWindow as Window & { play?: () => void };
      if (typeof win.play !== 'function') return 'the studio document has no play()';
      (window as unknown as { parityDriveGsap(w: Window): void }).parityDriveGsap(win);
      doc = frame.contentDocument!;
    } else {
      type Driver = HTMLElement & { load(p: unknown): Promise<{ statusCode: number; statusMessage?: string }> };
      try {
        const mod = await import(url);
        if (!customElements.get(tag)) customElements.define(tag, mod.default);
      } catch (err) {
        return `import: ${String((err as Error)?.message ?? err)}`;
      }
      const el = document.createElement(tag) as Driver;
      stage.appendChild(el);
      const loaded = await el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      if (loaded.statusCode !== 200) return `load ${loaded.statusCode} ${loaded.statusMessage ?? ''}`;
    }
    // Every face the design declares and every picture it holds, in before Play. A face loads
    // when text first needs it, on the network's time and not the page clock's, so a fit that
    // runs at Play would otherwise measure the fallback in one mount and the face in another.
    await Promise.all(Array.from(doc.fonts, (face) => face.load().catch(() => undefined)));
    const holder = stage.firstElementChild!;
    const body = holder instanceof HTMLIFrameElement ? doc.documentElement : graphicBody(holder);
    await Promise.all(Array.from(body.querySelectorAll('img'), (img) => img.decode().catch(() => undefined)));
    await doc.fonts.ready;
    return 'ok';
  }, { mount, url: `${ORIGIN}/${built.key}/${mount}/graphic.mjs`, tag, studio: 'html' in own ? own.html : '' });
  if (mounted !== 'ok') {
    await unmountAll(page);
    return mounted;
  }
  // The work a design does as it loads (the fits it schedules, the faces it waits for) lands first.
  await page.clock.runFor(200);
  const played = await page.evaluate(async () => {
    const el = document.getElementById('stage')!.firstElementChild!;
    if (el instanceof HTMLIFrameElement) {
      (el.contentWindow as unknown as { play(): void }).play();
      return 'ok';
    }
    const result = await (el as unknown as { playAction(p: unknown): Promise<{ statusCode: number; statusMessage?: string }> }).playAction({});
    return result.statusCode === 200 ? 'ok' : `play ${result.statusCode} ${result.statusMessage ?? ''}`;
  });
  if (played !== 'ok') {
    await unmountAll(page);
    return played;
  }
  const frames: Buffer[] = [];
  let at = 0;
  for (const ms of SAMPLES_MS) {
    if (at === 0) await page.clock.runFor(ms);
    else await page.clock.fastForward(ms - at);
    at = ms;
    await page.evaluate(async (ms) => {
      const stage = document.getElementById('stage')!;
      const el = stage.firstElementChild!;
      const doc = el instanceof HTMLIFrameElement ? el.contentDocument! : null;
      // A fresh paint. Left alone, Chromium may move a layer it drew at an earlier moment by a
      // fraction of a pixel rather than draw it again, and which it does depends on when its
      // compositor happened to run: identical DOM, to four decimals of every box, came out a
      // few thousand pixels apart between two pages of the same build. Taking the layers down
      // and up again draws everything from the state it is in now. Chromium's deterministic-
      // rendering switches (all compositor stages before draw, no threaded animation) did not do
      // it. The cost, the same in every variant: a CSS transition lands at its end, and a CSS
      // animation restarts and is then set to the sample's time below. In the studio's document it
      // is that document's own root (hiding the iframe would resize its window and run a design's
      // resize handling on the browser's time), and that is not yet enough there: the studio
      // record still varies between runs.
      const fresh = doc ? doc.documentElement : stage;
      const was = fresh.style.display;
      fresh.style.display = 'none';
      void fresh.offsetWidth;
      fresh.style.display = was;
      void fresh.offsetWidth;
      const body = doc ? doc.documentElement : graphicBody(el);
      for (const animation of body.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = ms;
      }
      await Promise.all(Array.from(body.querySelectorAll('img'), (img) => img.decode().catch(() => undefined)));
      await (doc ?? document).fonts.ready;
    }, ms);
    frames.push(await shoot(page));
  }
  await unmountAll(page);
  return frames;
}

const sessions = new WeakMap<Page, CDPSession>();

/**
 * The canvas as a PNG, through the DevTools protocol with its fast encoder: a sweep takes
 * thousands of frames, and identical pixels still encode to identical bytes.
 */
async function shoot(page: Page): Promise<Buffer> {
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  const { data } = await session.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
    optimizeForSpeed: true,
  });
  return Buffer.from(data, 'base64');
}

/** Dispose whatever is on the stage and take it off, as a renderer clears a layer. */
async function unmountAll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const stage = document.getElementById('stage')!;
    for (const el of Array.from(stage.children)) {
      const graphic = el as Element & { dispose?: (p: unknown) => Promise<unknown> };
      if (typeof graphic.dispose === 'function') await graphic.dispose({});
      el.remove();
    }
  });
  await page.clock.fastForward(100);
}

/** How many pixels of two same-sized frames differ by more than the tolerance in a colour channel. */
function differing(a: Buffer, b: Buffer): number {
  const pa = decodePng(a);
  const pb = decodePng(b);
  if (pa.channels !== pb.channels || pa.samples.length !== pb.samples.length) throw new Error('parity: two frames of different shapes');
  const colours = pa.channels >= 3 ? 3 : 1;
  let count = 0;
  for (let i = 0; i < pa.samples.length; i += pa.channels) {
    for (let c = 0; c < colours; c++) {
      if (Math.abs(pa.samples[i + c] - pb.samples[i + c]) > CHANNEL_TOLERANCE) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/**
 * Build every source, mount it in each variant (by default `MOUNT_VARIANTS`), and compare every
 * variant's frames with the first's.
 */
export async function paritySweep(app: Page, browser: Browser, sources: ParitySource[], opts: { variants?: ParityVariant[] } = {}): Promise<ParityRow[]> {
  const variants = opts.variants ?? MOUNT_VARIANTS;
  const built = await build(app, sources, new Set(variants.map((v) => v.mount)));
  const served = new Map<string, Built>();
  for (const b of built) if (!('error' in b)) served.set(b.key, b);
  const pages: Page[] = [];
  const rows: ParityRow[] = [];
  try {
    for (const variant of variants) pages.push(await openRenderer(browser, served, variant.rules ?? ''));
    for (const [index, design] of built.entries()) {
      if ('error' in design) {
        rows.push({ key: design.key, error: design.error, against: {} });
        continue;
      }
      // Every variant is taken even when one fails, so the pages keep seeing the same designs.
      const frames: Record<string, Buffer[]> = {};
      const errors: string[] = [];
      for (const [i, variant] of variants.entries()) {
        const taken = await sample(pages[i], design, variant.mount, `parity-${index}-${design.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
        if (typeof taken === 'string') errors.push(`${variant.name}: ${taken}`);
        else frames[variant.name] = taken;
      }
      const first = frames[variants[0].name];
      const against: Record<string, number[]> = {};
      for (const variant of variants.slice(1)) {
        const other = frames[variant.name];
        // Byte-identical PNGs are identical frames, which most are: decode only the ones that are not.
        if (first && other) against[variant.name] = first.map((png, i) => (png.equals(other[i]) ? 0 : differing(png, other[i])));
      }
      rows.push({ key: design.key, ...(errors.length ? { error: errors.join('; ') } : {}), against });
    }
  } finally {
    await Promise.all(pages.map((page) => page.context().close()));
  }
  return rows;
}

/** Every sample of `name` under the bound. */
export function matches(row: ParityRow, name: string): boolean {
  return !!row.against[name] && row.against[name].every((n) => n < PARITY_BOUND);
}

/**
 * The rows of a `MOUNT_VARIANTS` sweep that fail parity: a design both light mounts agree on whose
 * shadow frame differs or does not exist. A design the two light mounts disagree on is not
 * compared (`unstable`), and the studio document is a record, never a failure here.
 */
function parityFailures(rows: ParityRow[]): ParityRow[] {
  return rows.filter((row) => matches(row, 'lightAgain') && !matches(row, 'shadow'));
}

/** The rows of a `MOUNT_VARIANTS` sweep whose two light mounts disagree, so nothing about them is proven. */
function unstable(rows: ParityRow[]): ParityRow[] {
  return rows.filter((row) => !matches(row, 'lightAgain'));
}

/** What a `MOUNT_VARIANTS` sweep read, one line per design that is not a clean match. */
function report(label: string, rows: ParityRow[]): string {
  const odd = rows.filter((row) => row.error || !matches(row, 'lightAgain') || !matches(row, 'shadow') || !matches(row, 'studio'));
  return [
    `[ograf-parity] ${label}: ${rows.length} designs, ${unstable(rows).length} not compared, ${parityFailures(rows).length} failing, ` +
      `${rows.filter((row) => row.against.studio && !matches(row, 'studio')).length} differ from the studio document`,
    ...odd.map((row) => `[ograf-parity]   ${row.key} ${JSON.stringify(row.against)}${row.error ? ` ${row.error}` : ''}`),
  ].join('\n');
}

/**
 * The verdict on a `MOUNT_VARIANTS` sweep of `expected` designs, printed and attached as well, so
 * a job's log carries what it read. Every design builds (`refusable` lets the import road refuse
 * a source on purpose) and mounts in every variant but the studio's; no design both light mounts
 * agree on paints a different shadow frame; and a design whose light mounts disagree proves
 * nothing either way, which a few may, but a unit where many do has stopped measuring. The studio
 * document is a record, never a failure here.
 */
export async function expectParity(label: string, rows: ParityRow[], expected: number, opts: { refusable?: boolean } = {}) {
  console.log(report(label, rows));
  await test.info().attach(`${label}.json`, { body: JSON.stringify(rows, null, 1), contentType: 'application/json' });
  expect(rows.length, `${label} compared nothing`).toBe(expected);
  const refused = rows.filter((row) => /^build: /.test(row.error ?? ''));
  if (!opts.refusable) expect(refused, `${label}: a design did not build`).toEqual([]);
  expect(rows.filter((row) => row.error && !refused.includes(row) && !/^studio: [^;]*$/.test(row.error)), `${label}: a design did not mount`).toEqual([]);
  expect(parityFailures(rows), `${label}: the shadow mount paints a different frame (bound ${PARITY_BOUND} pixels)`).toEqual([]);
  const built = rows.filter((row) => !refused.includes(row));
  expect(unstable(built).length, `${label}: too many designs painted two different frames from one build`).toBeLessThanOrEqual(Math.ceil(built.length / 10));
}
