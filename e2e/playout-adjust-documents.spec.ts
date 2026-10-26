// PLACE AND SIZE IN DOCUMENTS THAT ARE THE PAGE (docs/work-specs/playout-adjustments/spec.md,
// phase 1b): the halves Node cannot prove, as rendered frames.
//
// 1. THE SWEEP that decides the transform's host. Every catalog design whose emitted code uses
//    viewport units (or the window's size, or fixed positioning) is rendered twice: in a frame
//    transformed the way the `/output` stage transforms it (control/cueAdjust.ts `frameCss` on the
//    iframe, what output/stage.ts does), and as the page itself with the same appearance applied to
//    its root by the runtime every receiver and bake uses (control/appearanceRuntime.ts). Beside
//    them, designs whose text fits measure their own boxes (qz01, sb14) and the two lower thirds the
//    phase-1 receipt measured (lt01, lt63). The root must paint what the frame paints.
// 2. THE BAKES, one per target (html-overlay, CasparCG, SPX, OGraf and H2R): a production package
//    built with a placed and resized graphic, its baked file rendered alone, against the same
//    target's file built without place and size, in a frame transformed by the stage's own
//    transform: what `/output` does to a document, done to this one. Compared once landed.
//
// Frames are compared after the same time on a paused page clock. A design that paints two different
// frames from one document mounted twice (a marquee, a loop) is compared net of that: the residual
// is what the root paints differently beyond what the frame paints differently from itself.
// The arithmetic is scripts/cue-adjust.test.mjs; the receivers' restore is local-relay.spec.ts and
// hosted-control.spec.ts.
// covers: src/control/appearanceRuntime.ts, src/control/exportAppearance.ts, src/components/home/exportAppearances.ts, src/export/targets/**, src/export/showExport.ts

import { test, expect, type Browser, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { decodePng } from '../scripts/png-decode.mjs';
import { frameCss, type AppliedAppearance } from '../src/control/cueAdjust';
import { bakeAppearance } from '../src/control/appearanceRuntime';

const ORIGIN = 'http://adjust-docs.local';
const GROUND = [10, 20, 30];
/** The appearance the sweep applies: smaller, so whatever lies beyond the canvas would show, and
 *  moved both ways. */
const SWEEP_LOOK: AppliedAppearance = { v: 1, frame: { dx: -137, dy: -61, s: 0.85, ox: 600, oy: 900 } };
/** Per colour channel, the difference two pixels may have and still match. */
const CHANNEL_TOLERANCE = 24;
/** Pixels the root may paint differently from the frame beyond the frame's own mount-to-mount
 *  difference: antialiasing along edges drawn under a transform of their own (qz01's skewed
 *  badges at 108 % differ by 831). The OGraf parity spec's bound (e2e/_ografParity.ts). qz01 with
 *  the rect mapping removed is 2,328 over the frame. */
const RESIDUAL_BOUND = 1_000;
/** Designs measured beside the viewport-unit ones: two that fit their text to measured boxes, the
 *  hugging strap and the full-width band of the phase-1 receipt. */
const CONTROLS = ['qz01', 'sb14', 'lt01', 'lt63'];

const FONTS = new URL('../public/fonts/', import.meta.url);
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.shtml': 'text/html', '.mjs': 'application/javascript', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
};

/** An OGraf renderer reduced to one Graphic: the package's module mounted on a page of its own. */
const OGRAF_HOST = `<!doctype html><html><head><meta charset="utf-8">
<style>html, body { margin: 0; overflow: hidden; background: transparent; }</style></head><body>
<script type="module">
import Graphic from './graphic.mjs';
customElements.define('noacg-under-test', Graphic);
const el = document.createElement('noacg-under-test');
document.body.appendChild(el);
window.__loaded = el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} }).then((r) => r.statusCode);
window.play = () => el.playAction({});
</script></body></html>`;

/** What the renderer page serves: studio documents by key, package files by path. */
interface Served {
  docs: Map<string, string>;
  files: Map<string, Buffer>;
}

async function openRenderer(browser: Browser, served: Served): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    const type = TYPES[/\.[a-z0-9]+$/i.exec(path)?.[0].toLowerCase() ?? ''] ?? 'text/html';
    if (path === '') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden;background:rgb(${GROUND.join(',')})"><div id="stage" style="position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden"></div></body></html>` });
    }
    if (path.startsWith('doc/')) return route.fulfill({ contentType: 'text/html', body: served.docs.get(path.slice(4)) ?? '' });
    if (path.endsWith('/__host.html')) return route.fulfill({ contentType: 'text/html', body: OGRAF_HOST });
    const file = served.files.get(path);
    if (file) return route.fulfill({ contentType: type, body: file });
    // A studio document's bundled faces resolve beside it, as they do beside /app.
    const face = /(?:^|\/)fonts\/([^/]+\.woff2)$/.exec(path)?.[1];
    if (face) {
      try {
        return route.fulfill({ contentType: 'font/woff2', body: readFileSync(new URL(face, FONTS)) });
      } catch {
        /* not a bundled face */
      }
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
  await page.goto(`${ORIGIN}/`);
  await page.clock.pauseAt(new Date('2026-10-26T12:00:10Z'));
  return page;
}

/** How a mount starts: Play called by the harness, or the file's own autoplay (the overlay's). */
type Start = 'play' | 'autoplay';

/**
 * Mount `path` in a 1920×1080 frame at the stage origin, transformed by `look` as the stage
 * transforms a frame (none: the document applies its own), load every face it declares, start it,
 * and take a frame after each of `samples` ms. Answers the frames.
 */
async function framesOf(page: Page, path: string, look: AppliedAppearance | null, start: Start, samples: number[]): Promise<Buffer[]> {
  const css = frameCss(look);
  const ready = await page.evaluate(async ({ url, transform, origin }) => {
    const stage = document.getElementById('stage')!;
    stage.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;left:0;top:0;border:0;width:1920px;height:1080px;color-scheme:normal';
    frame.style.transform = transform;
    frame.style.transformOrigin = origin;
    await new Promise((resolve) => { frame.onload = resolve; frame.src = url; stage.appendChild(frame); });
    const win = frame.contentWindow as Window & { __loaded?: Promise<number> };
    if (win.__loaded && (await win.__loaded) !== 200) return 'the Graphic did not load';
    const doc = frame.contentDocument!;
    await Promise.all(Array.from(doc.fonts, (face) => face.load().catch(() => undefined)));
    await doc.fonts.ready;
    return 'ok';
  }, { url: `${ORIGIN}/${path}`, transform: css.transform, origin: css.origin });
  expect(ready, path).toBe('ok');
  await page.clock.runFor(200);
  if (start === 'play') {
    await page.evaluate(() => {
      const frame = document.querySelector('#stage iframe') as HTMLIFrameElement;
      void (frame.contentWindow as unknown as { play(): unknown }).play();
    });
  }
  const out: Buffer[] = [];
  let at = 0;
  for (const ms of samples) {
    await page.clock.runFor(ms - at);
    at = ms;
    out.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } }));
  }
  return out;
}

/** How many pixels of two frames differ by more than the tolerance in a colour channel. */
function differing(a: Buffer, b: Buffer): number {
  const pa = decodePng(a);
  const pb = decodePng(b);
  let count = 0;
  for (let i = 0; i < pa.samples.length; i += pa.channels) {
    for (let c = 0; c < 3; c++) {
      if (Math.abs(pa.samples[i + c] - pb.samples[i + c]) > CHANNEL_TOLERANCE) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** Pixels that are not the ground: proof a frame shows something. */
function painted(a: Buffer): number {
  const p = decodePng(a);
  let count = 0;
  for (let i = 0; i < p.samples.length; i += p.channels) {
    if (Math.abs(p.samples[i] - GROUND[0]) + Math.abs(p.samples[i + 1] - GROUND[1]) + Math.abs(p.samples[i + 2] - GROUND[2]) > 30) count += 1;
  }
  return count;
}

/** The root's frames against the frame transform's, net of the frame's own mount-to-mount
 *  difference, per sample. */
async function residuals(page: Page, framed: string, rooted: string, look: AppliedAppearance, start: Start, samples: number[]) {
  const ref = await framesOf(page, framed, look, start, samples);
  const again = await framesOf(page, framed, look, start, samples);
  const root = await framesOf(page, rooted, null, start, samples);
  return samples.map((ms, i) => ({ ms, painted: painted(ref[i]), noise: differing(ref[i], again[i]), residual: differing(ref[i], root[i]) - differing(ref[i], again[i]) }));
}

test('the sweep: every viewport-unit design paints the same with the transform on its root as in a transformed frame', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const swept = await page.evaluate(async ({ controls, look }) => {
    const { CATALOG, variantById } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const units = /\b\d*\.?\d+(?:vw|vh|vmin|vmax|[sld]v[wh])\b|\binner(?:Width|Height)\b|position\s*:\s*fixed/;
    const listed = Object.values(CATALOG).flat().filter((v) => {
      const t = v!.create({} as never);
      return units.test(`${t.html}\n${t.css}\n${t.js}`);
    }).map((v) => v!.id).sort();
    const docs = [...listed, ...controls].map((id) => {
      const html = composeDocument(variantById(id)!.create({} as never));
      const bake = `<script>${look}</script>`;
      return { id, framed: html, rooted: html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${bake}\n</body>`) };
    });
    return { listed, docs };
  }, { controls: CONTROLS, look: bakeAppearance(SWEEP_LOOK)[0].js });
  // The designs the decision was taken on. A new one joins the sweep by itself; one that leaves
  // means the regex no longer reads the catalog.
  expect(swept.listed).toEqual(expect.arrayContaining(['tk21', 'tr05', 'tr10', 'tr11', 'tr12']));

  const served: Served = { docs: new Map(), files: new Map() };
  for (const d of swept.docs) {
    served.docs.set(`${d.id}-framed`, d.framed);
    served.docs.set(`${d.id}-rooted`, d.rooted);
  }
  const renderer = await openRenderer(browser, served);
  const rows: string[] = [];
  for (const d of swept.docs) {
    const r = await residuals(renderer, `doc/${d.id}-framed`, `doc/${d.id}-rooted`, SWEEP_LOOK, 'play', [400, 1_500, 4_000]);
    rows.push(`${d.id}: ${r.map((s) => `${s.ms}ms painted ${s.painted} noise ${s.noise} residual ${s.residual}`).join(' | ')}`);
    expect(Math.max(...r.map((s) => s.painted)), `${d.id} painted nothing at any sample`).toBeGreaterThan(1_000);
    for (const s of r) expect(s.residual, `${d.id} at ${s.ms} ms:\n${rows.join('\n')}`).toBeLessThanOrEqual(RESIDUAL_BOUND);
  }
  console.log(rows.join('\n'));
  await renderer.context().close();
});

/** The package files of `zip`, by path under `prefix`, the enclosing project folder kept. */
async function filesOf(b64: string, prefix: string, into: Map<string, Buffer>) {
  const zip = await JSZip.loadAsync(b64, { base64: true });
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) into.set(`${prefix}/${name}`, await zip.file(name)!.async('nodebuffer'));
  }
}

test('each target bakes the graphic\'s place and size into its files, painting what the stage paints', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const TARGETS = ['html-overlay', 'casparcg', 'spx', 'ograf', 'h2r'];
  const built = await page.evaluate(async (targets) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const { measureExportAppearances } = await import('/src/components/home/exportAppearances.ts');
    const show = shows.createShowNamed('Placed Show');
    // lt01 to the other side and 10 % smaller: a preset against its measured box, a size about it.
    for (const id of ['lt01', 'qz01']) {
      const tpl = variantById(id)!.create({} as never);
      const { doc } = createGraphic(tpl, { name: tpl.name });
      shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    }
    const pool = shows.loadShows().find((s) => s.id === show.id)!;
    shows.setGraphicAdjust(show.id, pool.graphics[0].id, { place: 'br', scale: 0.9 });
    // qz01 larger and down, so a fit that read rects through the transform would refit its words.
    shows.setGraphicAdjust(show.id, pool.graphics[1].id, { y: 40, scale: 1.08 });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    const out: Record<string, { baked: string; plain: string; looks: Record<string, unknown> }> = {};
    for (const target of targets) {
      const appearances = await measureExportAppearances(fresh, target);
      const baked = await buildShowZipFor(fresh, target, { appearances });
      const plain = await buildShowZipFor(fresh, target);
      out[target] = { baked: await baked.generateAsync({ type: 'base64' }), plain: await plain.generateAsync({ type: 'base64' }), looks: appearances!.graphics };
    }
    return { out, graphics: fresh.graphics.map((g) => ({ id: g.id, name: g.name })) };
  }, TARGETS);

  const served: Served = { docs: new Map(), files: new Map() };
  for (const target of TARGETS) {
    await filesOf(built.out[target].baked, target, served.files);
    await filesOf(built.out[target].plain, `plain-${target}`, served.files);
  }
  const renderer = await openRenderer(browser, served);
  const paths = [...served.files.keys()];
  const rows: string[] = [];
  for (const target of TARGETS) {
    for (const g of built.graphics) {
      const look = built.out[target].looks[g.id] as AppliedAppearance;
      expect(look.frame, `${target}: ${g.name} has a place and size to bake`).toBeTruthy();
      const slug = g.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const file = target === 'ograf'
        ? paths.find((p) => p.startsWith(`${target}/`) && p.endsWith(`/${slug}/graphic.mjs`))?.replace(/graphic\.mjs$/, '__host.html')
        : paths.find((p) => p.startsWith(`${target}/`) && new RegExp(`/${slug}/${slug}\\.html$`).test(p));
      expect(file, `${target}: ${g.name}'s file in ${paths.filter((p) => p.startsWith(`${target}/`)).join(', ')}`).toBeTruthy();
      expect(served.files.get(file!.replace(/__host\.html$/, 'graphic.mjs'))!.toString()).toContain('noacgApplyAppearance(');
      expect(served.files.get(`plain-${file!}`.replace(/__host\.html$/, 'graphic.mjs'))!.toString()).not.toContain('noacgApplyAppearance');
      const r = await residuals(renderer, `plain-${file!}`, file!, look, target === 'html-overlay' ? 'autoplay' : 'play', [600, 4_000]);
      rows.push(`${target} ${g.name}: ${r.map((s) => `${s.ms}ms painted ${s.painted} noise ${s.noise} residual ${s.residual}`).join(' | ')}`);
      for (const s of r) expect(s.residual, `${target} ${g.name} at ${s.ms} ms:\n${rows.join('\n')}`).toBeLessThanOrEqual(RESIDUAL_BOUND);
    }
  }
  console.log(rows.join('\n'));
  await renderer.context().close();
});
