// covers: src/export/targets/ograf.ts, src/templates/importedDesign/{stretch,svg}.ts, src/assets/svgImport.ts
//
// TWO GRAPHICS, ONE RENDERER (issue #789). An OGraf renderer mounts every layer as a Web Component
// in ONE document, in its light DOM, so anything a graphic carries that is document-wide reaches
// the graphic beside it. e2e/ograf-conformance.spec.ts pins the template's own stylesheet, the
// field ids and the host page. This file pins the carriers that were still open: the artwork's
// own `<style>` and gradient ids inside an imported SVG's markup, a child-combinator rule off
// `body`, and a stretch design measured on a renderer that does not put its stage at the origin.
//
// Every package here is built by the real OGraf target from a template the real generators made,
// and mounted the way a renderer mounts it: import graphic.mjs, define the element, append it,
// load(), play.

import { test, expect, type Page } from '@playwright/test';

const ORIGIN = 'http://ograf-isolation.local';
const GROUND = [10, 20, 30];

/**
 * The renderer page: a stage whose children are the layers, positioned the way ografHost.ts
 * positions them. Moving the stage's `left` is what a centred or offset renderer does.
 */
const HOST_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>Renderer</title>
<style>
  html, body { margin: 0; overflow: hidden; background: rgb(${GROUND.join(', ')}); }
  #stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
  #stage > * { position: absolute; inset: 0; }
</style></head>
<body><div id="stage"></div></body></html>`;

type Files = Record<string, string>;

/**
 * What a package is built from, always through the real generators:
 *  - `svg`: an imported SVG design, built the way the import road builds one - the markup
 *    through `importSvgMarkup`, the template through the SVG variant's own `create` - and named,
 *    as the Finish step names it, so two designs carry two manifest ids;
 *  - `catalog`: the Hairline lower third with a probe added to its markup, stylesheet and code
 *    (`stretch` appends the importer's stretch runtime for a `probe` design instead of `js`).
 */
type Source =
  | { kind: 'svg'; name: string; source: string }
  | { kind: 'catalog'; name: string; html: string; css: string; js?: string; stretch?: boolean };

/** Build an OGraf package in the app; the files come back base64, package-relative. */
async function ografFiles(page: Page, from: Source): Promise<Files> {
  return page.evaluate(async (from) => {
    const { ografTarget } = await import('/src/export/targets/ograf.ts');
    let template;
    if (from.kind === 'svg') {
      const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
      const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
      const svg = importSvgMarkup(from.source);
      const designSvg = { markup: svg.markup, width: svg.width, height: svg.height, fields: [], images: [], outlines: [], fonts: [] };
      template = { ...IMPORTED_SVG.create({ designSvg } as never), name: from.name };
    } else {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { stretchRuntimeJs } = await import('/src/templates/importedDesign/stretch.ts');
      const base = variantById('lt01')!.create({} as never);
      const js = from.stretch ? stretchRuntimeJs('probe') : from.js ?? '';
      template = {
        ...base,
        name: from.name,
        html: base.html.replace(/<body([^>]*)>/i, (open) => open + from.html),
        css: `${base.css}\n${from.css}`,
        js: `${base.js}\n${js}`,
      };
    }
    const zip = await ografTarget.build(template);
    const out: Record<string, string> = {};
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue;
      out[name.slice(name.indexOf('/') + 1)] = await zip.file(name)!.async('base64');
    }
    return out;
  }, from);
}

/** Serve the host page at `/` and each package under `/<folder>/`. */
async function serveRenderer(page: Page, packages: Record<string, Files>) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (path === '') return route.fulfill({ status: 200, contentType: 'text/html', body: HOST_PAGE });
    const [folder, ...rest] = path.split('/');
    const body = packages[folder]?.[rest.join('/')];
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: /\.m?js$/.test(path) ? 'application/javascript' : 'text/plain',
      body: Buffer.from(body, 'base64'),
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${ORIGIN}/`);
}

/** Mount one package on the stage, load it and land its entrance. */
async function mount(page: Page, folder: string, tag: string) {
  await page.evaluate(async ({ origin, folder, tag }) => {
    const mod = await import(`${origin}/${folder}/graphic.mjs`);
    if (!customElements.get(tag)) customElements.define(tag, mod.default);
    type Driver = HTMLElement & { load(p: unknown): Promise<{ statusCode: number }>; playAction(p: unknown): Promise<unknown> };
    const el = document.createElement(tag) as Driver;
    el.dataset.folder = folder;
    document.getElementById('stage')!.appendChild(el);
    const loaded = await el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
    if (loaded.statusCode !== 200) throw new Error(`load() answered ${JSON.stringify(loaded)}`);
    await el.playAction({ skipAnimation: true });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { origin: ORIGIN, folder, tag });
}

/** Dispose one mounted graphic and take it off the stage, as a renderer clears a layer. */
async function unmount(page: Page, folder: string) {
  await page.evaluate(async (folder) => {
    const el = document.querySelector(`[data-folder="${folder}"]`) as HTMLElement & { dispose(p: unknown): Promise<unknown> };
    await el.dispose({});
    el.remove();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, folder);
}

/** The RGB of each point as painted, read off a real screenshot. */
async function pixels(page: Page, points: Record<string, [number, number]>): Promise<Record<string, number[]>> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ png, points }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = `data:image/png;base64,${png}`; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => [name, Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))]));
  }, { png, points });
}

/**
 * An Illustrator-shaped artwork with Illustrator's own collisions: every file names its classes
 * `.st0`, `.st1` and its first gradient `SVGID_1_`. A draws on the left half, B on the right, and
 * each colour is one only its own artwork can paint.
 */
function illustratorArt(side: 'A' | 'B'): string {
  const x = side === 'A' ? 100 : 1400;
  const own = side === 'A'
    ? { st0: '#FF0000', st1: 'display:none;', gradient: '#00FF00' }
    : { st0: '#0000FF', st1: 'fill:#FFFF00;', gradient: '#FF00FF' };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator 30.1.0, SVG Export Plug-In . SVG Version: 9.03 Build 0)  -->
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 1920 1080" width="1920" height="1080" xml:space="preserve">
<style type="text/css">
	.st0{fill:${own.st0};}
	.st1{${own.st1}}
</style>
<linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="${x}" y1="0" x2="${x + 200}" y2="0">
	<stop offset="0" style="stop-color:${own.gradient}"/>
	<stop offset="1" style="stop-color:${own.gradient}"/>
</linearGradient>
<g id="Board">
	<rect x="${x}" y="100" class="st0" width="200" height="200"/>
	<rect x="${x}" y="400" style="fill:url(#SVGID_1_);" width="200" height="200"/>
</g>
<g id="Moment" class="st1">
	<rect x="${x}" y="700" ${side === 'A' ? 'style="fill:#FFFFFF;" ' : ''}width="200" height="200"/>
</g>
</svg>`;
}

test('two imported SVG designs on one renderer keep their own colours, gradients and hidden layers', async ({ page }) => {
  await page.goto('/app');
  const a = await ografFiles(page, { kind: 'svg', source: illustratorArt('A'), name: 'Quiz Board' });
  const b = await ografFiles(page, { kind: 'svg', source: illustratorArt('B'), name: 'Score Board' });
  await serveRenderer(page, { a, b });
  await mount(page, 'a', 'ograf-isolation-a');
  await mount(page, 'b', 'ograf-isolation-b');

  const points: Record<string, [number, number]> = {
    aClass: [200, 200], bClass: [1500, 200],
    aGradient: [200, 500], bGradient: [1500, 500],
    aHidden: [200, 800], bShown: [1500, 800],
  };
  // Each artwork paints its own colours: neither file's `.st0`, `.st1` nor `SVGID_1_` reaches the
  // design beside it, and A's `.st1` hides A's drawn state and nothing of B's.
  expect(await pixels(page, points)).toEqual({
    aClass: [255, 0, 0], bClass: [0, 0, 255],
    aGradient: [0, 255, 0], bGradient: [255, 0, 255],
    aHidden: GROUND, bShown: [255, 255, 0],
  });

  // Taking A off the renderer leaves B exactly as it was: nothing B paints with lived in A.
  await unmount(page, 'a');
  expect(await pixels(page, { bClass: points.bClass, bGradient: points.bGradient, bShown: points.bShown }))
    .toEqual({ bClass: [0, 0, 255], bGradient: [255, 0, 255], bShown: [255, 255, 0] });
});

test("a child-combinator rule off `body` matches the design's own top-level elements, and `body.children` lists them", async ({ page }) => {
  await page.goto('/app');
  const files = await ografFiles(page, {
    kind: 'catalog',
    name: 'Child Probe',
    html: '<div class="probe-card"></div>',
    css: 'body > .probe-card { position: absolute; left: 0; top: 0; width: 37px; height: 5px; }',
    // What a hand-written template reads off its own page: the top-level elements of its body.
    js: "document.body.setAttribute('data-probe-children', Array.prototype.map.call(document.body.children, function (c) { return c.className || c.tagName.toLowerCase(); }).join(' '));",
  });
  await serveRenderer(page, { probe: files });
  await mount(page, 'probe', 'ograf-isolation-probe');
  const read = await page.evaluate(() => {
    const el = document.querySelector('[data-folder="probe"]')!;
    return {
      width: getComputedStyle(el.querySelector('.probe-card')!).width,
      children: el.getAttribute('data-probe-children')!.split(' '),
    };
  });
  expect(read.width, '`body > .probe-card` matched nothing').toBe('37px');
  // The graphic's own stylesheet first (the documented contract, docs/OGRAF.md), then the
  // design's markup exactly as authored - no wrapper between the body and its elements.
  expect(read.children.slice(0, 2), "the template's top-level elements are not the children of its body").toEqual(['style', 'probe-card']);
});

test('a stretch design measures the same room whether or not the renderer offsets its stage', async ({ page }) => {
  await page.goto('/app');
  // The stretch runtime as the importer emits it, over a box anchored 1400 px in: its stretch
  // line holds a 600 px run in a 300 px slot, so it asks for 301 px, and the frame edge (4%
  // inside 1920) caps it at 143.2.
  const files = await ografFiles(page, {
    kind: 'catalog',
    name: 'Stretch Probe',
    stretch: true,
    html: '<div class="probe-box"><div data-stretch><span data-fit="shrink">wide</span></div></div>',
    css: [
      '.probe-box { position: absolute; left: 1400px; top: 100px; width: calc(300px + var(--stretch-x, 0px)); height: 40px; }',
      '.probe-box [data-stretch] { width: calc(300px + var(--stretch-x, 0px)); overflow: hidden; white-space: nowrap; }',
      '.probe-box [data-fit] { display: inline-block; width: 600px; }',
    ].join('\n'),
  });
  await serveRenderer(page, { stretch: files });
  const stretchAt = async (left: number) => {
    await page.evaluate((left) => { document.getElementById('stage')!.style.left = `${left}px`; }, left);
    await mount(page, 'stretch', 'ograf-isolation-stretch');
    const value = await page.evaluate(() =>
      (document.querySelector('[data-folder="stretch"] .probe-box') as HTMLElement).style.getPropertyValue('--stretch-x'));
    await unmount(page, 'stretch');
    return value;
  };
  const atOrigin = await stretchAt(0);
  expect(atOrigin, 'the fixture did not stretch at all - nothing was proven').toBe('143.2px');
  expect(await stretchAt(240), 'an offset stage changed how far the design stretches').toBe(atOrigin);
});
