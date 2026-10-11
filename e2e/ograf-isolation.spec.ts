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
// load(), play. Each case runs in both mounts (e2e/_ografMount.ts); the cases that only the
// shadow root can pass assert in the shadow run and record what the light run paints.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installGraphicBody } from './_graphicBody';
import { graphicTemplate, inMount, OGRAF_MOUNTS, ografPackages, type GraphicSource, type OgrafMount } from './_ografMount';
import { matches, paritySweep, PARITY_BOUND } from './_ografParity';

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

type Files = Map<string, Buffer>;

/** Build `source`'s OGraf package in the app for `mount`, as package-relative files. */
async function ografFiles(page: Page, source: GraphicSource, mount: OgrafMount): Promise<Files> {
  const files = (await ografPackages(page, await graphicTemplate(page, source), [mount]))[mount];
  if (typeof files !== 'object') throw new Error(`the ${mount} package did not build: ${files}`);
  return files;
}

/** Serve the host page at `/`, with `rules` added to its stylesheet, and each package under `/<folder>/`. */
async function serveRenderer(page: Page, packages: Record<string, Files>, rules = '') {
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (path === '') return route.fulfill({ status: 200, contentType: 'text/html', body: HOST_PAGE.replace('</style>', `${rules}\n</style>`) });
    const [folder, ...rest] = path.split('/');
    const body = packages[folder]?.get(rest.join('/'));
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: /\.m?js$/.test(path) ? 'application/javascript' : /\.woff2$/.test(path) ? 'font/woff2' : 'text/plain',
      body,
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installGraphicBody(page);
  await page.goto(`${ORIGIN}/`);
}

/**
 * Put one package on the stage, load it and land its entrance. `key` names the layer when one
 * package is placed twice (it defaults to the folder), and `left` moves that layer sideways.
 */
async function place(page: Page, folder: string, tag: string, opts: { key?: string; left?: number } = {}) {
  await page.evaluate(async ({ origin, folder, tag, key, left }) => {
    const mod = await import(`${origin}/${folder}/graphic.mjs`);
    if (!customElements.get(tag)) customElements.define(tag, mod.default);
    type Driver = HTMLElement & { load(p: unknown): Promise<{ statusCode: number }>; playAction(p: unknown): Promise<unknown> };
    const el = document.createElement(tag) as Driver;
    el.dataset.folder = key ?? folder;
    if (left != null) el.style.left = `${left}px`;
    document.getElementById('stage')!.appendChild(el);
    const loaded = await el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
    if (loaded.statusCode !== 200) throw new Error(`load() answered ${JSON.stringify(loaded)}`);
    await el.playAction({ skipAnimation: true });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { origin: ORIGIN, folder, tag, key: opts.key ?? null, left: opts.left ?? null });
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

for (const mount of OGRAF_MOUNTS) test(inMount('two imported SVG designs on one renderer keep their own colours, gradients and hidden layers', mount), async ({ page }) => {
  await page.goto('/app');
  const a = await ografFiles(page, { kind: 'svg', source: illustratorArt('A'), name: 'Quiz Board' }, mount);
  const b = await ografFiles(page, { kind: 'svg', source: illustratorArt('B'), name: 'Score Board' }, mount);
  await serveRenderer(page, { a, b });
  await place(page, 'a', 'ograf-isolation-a');
  await place(page, 'b', 'ograf-isolation-b');

  const points: Record<string, [number, number]> = {
    aClass: [200, 200], bClass: [1500, 200],
    aGradient: [200, 500], bGradient: [1500, 500],
    aHidden: [200, 800], bShown: [1500, 800],
  };
  // Each artwork paints its own colours: neither file's `.st0`, `.st1` nor `SVGID_1_` reaches the
  // design beside it, and A's `.st1` hides A's drawn state and nothing of B's.
  const own = {
    aClass: [255, 0, 0], bClass: [0, 0, 255],
    aGradient: [0, 255, 0], bGradient: [255, 0, 255],
    aHidden: GROUND, bShown: [255, 255, 0],
  };
  expect(await pixels(page, points)).toEqual(own);

  // Taking A off the renderer leaves B exactly as it was: nothing B paints with lived in A.
  await unmount(page, 'a');
  expect(await pixels(page, { bClass: points.bClass, bGradient: points.bGradient, bShown: points.bShown }))
    .toEqual({ bClass: own.bClass, bGradient: own.bGradient, bShown: own.bShown });
});

for (const mount of OGRAF_MOUNTS) test(inMount("a child-combinator rule off `body` matches the design's own top-level elements, and `body.children` lists them", mount), async ({ page }) => {
  await page.goto('/app');
  const files = await ografFiles(page, {
    kind: 'probe',
    name: 'Child Probe',
    html: '<div class="probe-card"></div>',
    css: 'body > .probe-card { position: absolute; left: 0; top: 0; width: 37px; height: 5px; }',
    // What a hand-written template reads off its own page: the top-level elements of its body.
    js: "document.body.setAttribute('data-probe-children', Array.prototype.map.call(document.body.children, function (c) { return c.className || c.tagName.toLowerCase(); }).join(' '));",
  }, mount);
  await serveRenderer(page, { probe: files });
  await place(page, 'probe', 'ograf-isolation-probe');
  const read = await page.evaluate(() => {
    const body = graphicBody(document.querySelector('[data-folder="probe"]')!);
    return {
      width: getComputedStyle(body.querySelector('.probe-card')!).width,
      children: body.getAttribute('data-probe-children')!.split(' '),
    };
  });
  expect(read.width, '`body > .probe-card` matched nothing').toBe('37px');
  // The design's markup exactly as authored - no wrapper between the body and its elements. In
  // the light mount the graphic's own stylesheet comes first (the documented contract,
  // docs/OGRAF.md); in the shadow mount it sits beside the canvas, so the body holds the design
  // and nothing else.
  const expected = mount === 'light' ? ['style', 'probe-card'] : ['probe-card'];
  expect(read.children.slice(0, expected.length), "the template's top-level elements are not the children of its body").toEqual(expected);
  if (mount === 'shadow') expect(read.children, "the stylesheet is among the design's own elements").not.toContain('style');
});

for (const mount of OGRAF_MOUNTS) test(inMount('a stretch design measures the same room whether or not the renderer offsets its stage', mount), async ({ page }) => {
  await page.goto('/app');
  // The stretch runtime as the importer emits it, over a box anchored 1400 px in: its stretch
  // line holds a 600 px run in a 300 px slot, so it asks for 301 px, and the frame edge (4%
  // inside 1920) caps it at 143.2.
  const files = await ografFiles(page, {
    kind: 'probe',
    name: 'Stretch Probe',
    stretch: true,
    html: '<div class="probe-box"><div data-stretch><span data-fit="shrink">wide</span></div></div>',
    css: [
      '.probe-box { position: absolute; left: 1400px; top: 100px; width: calc(300px + var(--stretch-x, 0px)); height: 40px; }',
      '.probe-box [data-stretch] { width: calc(300px + var(--stretch-x, 0px)); overflow: hidden; white-space: nowrap; }',
      '.probe-box [data-fit] { display: inline-block; width: 600px; }',
    ].join('\n'),
  }, mount);
  await serveRenderer(page, { stretch: files });
  const stretchAt = async (left: number) => {
    await page.evaluate((left) => { document.getElementById('stage')!.style.left = `${left}px`; }, left);
    await place(page, 'stretch', 'ograf-isolation-stretch');
    const value = await page.evaluate(() =>
      graphicBody(document.querySelector('[data-folder="stretch"]')!).querySelector<HTMLElement>('.probe-box')!.style.getPropertyValue('--stretch-x'));
    await unmount(page, 'stretch');
    return value;
  };
  const atOrigin = await stretchAt(0);
  expect(atOrigin, 'the fixture did not stretch at all - nothing was proven').toBe('143.2px');
  expect(await stretchAt(240), 'an offset stage changed how far the design stretches').toBe(atOrigin);
});

/** Run one OGraf action on a mounted graphic and return its status code. */
async function act(page: Page, folder: string, action: 'playAction' | 'stopAction' | 'updateAction', params: Record<string, unknown> = {}) {
  return page.evaluate(async ({ folder, action, params }) => {
    const el = document.querySelector(`[data-folder="${folder}"]`) as unknown as Record<string, (p: unknown) => Promise<{ statusCode: number }>>;
    return (await el[action](params)).statusCode;
  }, { folder, action, params });
}

/** Each element's computed opacity and inline style, inside one mounted graphic. */
async function look(page: Page, folder: string, selectors: string[]) {
  return page.evaluate(({ folder, selectors }) => {
    const body = graphicBody(document.querySelector(`[data-folder="${folder}"]`)!);
    return Object.fromEntries(selectors.map((s) => {
      const el = body.querySelector<HTMLElement>(s)!;
      return [s, { opacity: getComputedStyle(el).opacity, inline: el.style.cssText }];
    }));
  }, { folder, selectors });
}

/** Wait until `selectors` are fully shown in one graphic and nothing in it is still tweening. */
async function settled(page: Page, folder: string, selectors: string[]) {
  await expect.poll(() => page.evaluate(({ folder, selectors }) => {
    const body = graphicBody(document.querySelector(`[data-folder="${folder}"]`)!);
    const gsap = (window as unknown as { gsap: { getTweensOf(t: NodeListOf<Element>, onlyActive: boolean): unknown[] } }).gsap;
    return {
      shown: selectors.every((s) => getComputedStyle(body.querySelector(s)!).opacity === '1'),
      moving: gsap.getTweensOf(body.querySelectorAll('*'), true).length,
    };
  }, { folder, selectors }), { message: `${folder} never settled` }).toEqual({ shown: true, moving: 0 });
}

for (const mount of OGRAF_MOUNTS) test(inMount('two reveal designs on one renderer each move and clear only their own elements', mount), async ({ page }) => {
  // The competition reveals hand GSAP ARRAYS of selector strings: every replay resets with
  // `gsap.set(['.reveal-subject', '.reveal-note', ...], { clearProps: 'all' })`, and the winner
  // card's press reveals with `gsap.fromTo(['.reveal-subject', '.reveal-runner'], ...)`. All of
  // them share those class names, so each selector must resolve inside its own graphic.
  await page.goto('/app');
  const award = await ografFiles(page, { kind: 'design', id: 'aw01' }, mount);
  const winner = await ografFiles(page, { kind: 'design', id: 'wn01' }, mount);
  await serveRenderer(page, { award, winner });
  await place(page, 'award', 'ograf-isolation-award');
  await place(page, 'winner', 'ograf-isolation-winner');
  const REVEALED = ['.reveal-subject', '.reveal-runner'];
  const CLEARED = ['.reveal-subject', '.reveal-note', '.reveal-logo', '.reveal-accent'];

  // The winner's press reveals its result. The award's subject is still sealed.
  expect(await act(page, 'winner', 'playAction')).toBe(200);
  await settled(page, 'winner', REVEALED);
  const sealed = (await look(page, 'award', ['.reveal-subject']))['.reveal-subject'].opacity;

  // The award opens; the winner's replay resets the winner and leaves the award as it was.
  expect(await act(page, 'award', 'playAction')).toBe(200);
  await settled(page, 'award', ['.reveal-subject', '.reveal-note', '.reveal-logo']);
  const opened = await look(page, 'award', CLEARED);
  await act(page, 'winner', 'stopAction', { skipAnimation: true });
  await act(page, 'winner', 'playAction', { skipAnimation: true });
  const awardAfter = await look(page, 'award', CLEARED);

  // The other way round: the winner's result is up again, and the award's replay leaves it alone.
  expect(await act(page, 'winner', 'playAction')).toBe(200);
  await settled(page, 'winner', REVEALED);
  const shown = await look(page, 'winner', CLEARED);
  await act(page, 'award', 'stopAction', { skipAnimation: true });
  await act(page, 'award', 'playAction', { skipAnimation: true });
  const winnerAfter = await look(page, 'winner', CLEARED);

  expect(Object.values(opened).every((l) => l.inline !== ''), "the award's open left no inline state to clear - nothing was proven").toBe(true);
  expect({ sealed, award: awardAfter, winner: winnerAfter }, "one design's press or replay reached the other's elements")
    .toEqual({ sealed: '0', award: opened, winner: shown });
});

for (const mount of OGRAF_MOUNTS) test(inMount("a template's `window.document` is its own, when a neighbour mounted first has the same field id", mount), async ({ page }) => {
  // Hand-written code may reach the document through `window`. Every NoaCG design names its first
  // field #f0, and the real document answers with the FIRST #f0 in it: the neighbour's.
  await page.goto('/app');
  const neighbour = await ografFiles(page, { kind: 'probe', name: 'Neighbour', html: '', css: '' }, mount);
  const probe = await ografFiles(page, {
    kind: 'probe',
    name: 'Window Probe',
    html: '',
    css: '',
    js: 'function update(raw) { var data = JSON.parse(raw); if (data.f0 != null) window.document.getElementById(\'f0\').textContent = data.f0; }',
  }, mount);
  await serveRenderer(page, { neighbour, probe });
  await place(page, 'neighbour', 'ograf-isolation-neighbour');
  await place(page, 'probe', 'ograf-isolation-window-probe');
  const field = () => page.evaluate(() => Object.fromEntries(['neighbour', 'probe'].map((folder) =>
    [folder, graphicBody(document.querySelector(`[data-folder="${folder}"]`)!).querySelector('#f0')!.textContent])));
  const before = await field();
  expect(await act(page, 'probe', 'updateAction', { data: { f0: 'Written through window.document' } })).toBe(200);
  expect(await field(), "the probe's update wrote the neighbour's field")
    .toEqual({ neighbour: before.neighbour, probe: 'Written through window.document' });
});

// ── What only the shadow root closes (AC-4 to AC-7, docs/work-specs/ograf-shadow-root/spec.md) ──

for (const mount of OGRAF_MOUNTS) test(inMount('two copies of one imported design each keep their own gradient and fields, and outlive each other', mount), async ({ page }) => {
  // Two copies of one design share every id, so in the light DOM `url(#SVGID_1_--noacg-quiz-board)`
  // resolves to the FIRST copy's gradient: recolouring it per copy, as a colour field or a picture
  // swap does, paints both copies with the first one's colour.
  await page.goto('/app');
  const art = illustratorArt('A').replace('</svg>', '<text id="Caption" x="100" y="1000" style="fill:#FFFFFF;font-size:40px">Copy</text>\n</svg>');
  const board = await ografFiles(page, { kind: 'svg', source: art, name: 'Quiz Board' }, mount);
  await serveRenderer(page, { board });
  await place(page, 'board', 'ograf-isolation-board', { key: 'one' });
  await place(page, 'board', 'ograf-isolation-board', { key: 'two', left: 960 });
  // Each copy recolours ITS OWN gradient.
  await page.evaluate(async () => {
    const colour: Record<string, string> = { one: '#FFFFFF', two: '#0000FF' };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#stage > *'))) {
      for (const stop of Array.from(graphicBody(el).querySelectorAll<SVGElement>('linearGradient stop'))) stop.style.stopColor = colour[el.dataset.folder!];
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await act(page, 'one', 'updateAction', { data: { f0: 'One' } })).toBe(200);
  expect(await act(page, 'two', 'updateAction', { data: { f0: 'Two' } })).toBe(200);
  const fields = () => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('#stage > *'), (el) =>
    [el.dataset.folder!, graphicBody(el).querySelector('#f0')?.textContent ?? null])));
  const points: Record<string, [number, number]> = { oneGradient: [200, 500], twoGradient: [1160, 500], twoClass: [1160, 200] };
  const shown = await pixels(page, points);
  const shownFields = await fields();
  await unmount(page, 'one');
  const after = await pixels(page, { twoGradient: points.twoGradient, twoClass: points.twoClass });
  const afterFields = await fields();

  // Each updateAction wrote only its own copy's field, in either mount: the scoped document did
  // that before the shadow root.
  expect(shownFields).toEqual({ one: 'One', two: 'Two' });
  expect(afterFields).toEqual({ two: 'Two' });
  if (mount === 'light') {
    // The light DOM's failure, recorded rather than asserted (AC-5).
    test.info().annotations.push({ type: 'light mount', description: JSON.stringify({ shown, after }) });
    return;
  }
  expect(shown, "a copy painted with the other copy's gradient").toEqual({ oneGradient: [255, 255, 255], twoGradient: [0, 0, 255], twoClass: [255, 0, 0] });
  expect(after, 'taking the first copy off air changed the second').toEqual({ twoGradient: [0, 0, 255], twoClass: [255, 0, 0] });
});

/**
 * A renderer page's own rules, measured reaching into light-DOM graphics by the spikes: SPX's
 * inherited text settings, a universal reset, and bare element, class and `!important` rules for
 * colour, letter spacing, SVG fill and image opacity.
 */
const RENDERER_RULES = `
  html, body { font-size: 3em; font-family: serif; color: rgb(0, 255, 0); line-height: 3; }
  * { box-sizing: border-box; overflow: hidden; margin: 0; padding: 0; }
  div, span, p, h1, h2, h3 { color: rgb(255, 0, 255) !important; letter-spacing: 12px !important; text-transform: uppercase; }
  rect, path, .st0 { fill: rgb(0, 255, 0) !important; }
  img { opacity: 0.2 !important; }`;

test("a renderer page's own rules do not reach into a shadow-mounted graphic", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.goto('/app');
  // A lower third, a scorebug, a ticker and an imported SVG design, each on a clean renderer page
  // and on one carrying the rules, on the virtual clock of the parity sweep (e2e/_ografParity.ts).
  const rows = await paritySweep(page, browser, [
    { kind: 'design', id: 'lt01' },
    { kind: 'design', id: 'sb01' },
    { kind: 'design', id: 'tk01' },
    { kind: 'svg', name: 'Quiz Board', source: illustratorArt('A') },
  ], {
    variants: [
      { name: 'shadow', mount: 'shadow' },
      { name: 'shadowUnderRules', mount: 'shadow', rules: RENDERER_RULES },
      { name: 'lightUnderRules', mount: 'light', rules: RENDERER_RULES },
    ],
  });
  // What the same rules do to the light mount, recorded: 12,000 to 40,000 pixels in the spikes.
  test.info().annotations.push({ type: 'light mount under the rules', description: JSON.stringify(rows.map((row) => [row.key, row.against.lightUnderRules])) });
  expect(rows.filter((row) => row.error), 'a design did not mount').toEqual([]);
  expect(rows.filter((row) => !matches(row, 'shadowUnderRules')).map((row) => [row.key, row.against.shadowUnderRules]),
    `the renderer page's rules changed a shadow-mounted graphic's frame (bound ${PARITY_BOUND} pixels)`).toEqual([]);
  expect(rows.some((row) => !matches(row, 'lightUnderRules')), 'the rules change no light-mounted frame either - nothing was proven').toBe(true);
});

for (const mount of OGRAF_MOUNTS) test(inMount("a design's own faces and registered properties apply, for exactly as long as a copy is mounted", mount), async ({ page }) => {
  // Chromium applies neither `@font-face` nor `@property` from inside a shadow tree, so the shadow
  // mount lifts both into ONE `<style data-noacg-fonts>` in the renderer's head: put there by the
  // first copy to load, kept while any copy is mounted, taken out with the last (AC-4).
  await page.goto('/app');
  const face = readFileSync(fileURLToPath(new URL('../public/fonts/space-grotesk.woff2', import.meta.url))).toString('base64');
  const probe = await ografFiles(page, {
    kind: 'probe',
    name: 'Face Probe',
    html: '<div class="probe-face">Probe</div><div class="probe-prop"></div>',
    css: [
      '@font-face { font-family: "Probe Face"; src: url("fonts/probe-face.woff2") format("woff2"); }',
      ".probe-face { position: absolute; left: 0; top: 200px; font: 40px 'Probe Face'; color: #fff; }",
      "@property --probe-w { syntax: '<length>'; inherits: false; initial-value: 23px; }",
      '.probe-prop { position: absolute; left: 0; top: 0; width: var(--probe-w); height: 4px; background: #fff; }',
    ].join('\n'),
    assets: [{ path: 'fonts/probe-face.woff2', data: `data:font/woff2;base64,${face}` }],
  }, mount);
  await serveRenderer(page, { probe });
  const read = () => page.evaluate(() => {
    const first = document.querySelector('#stage > *');
    const faces = Array.from(document.fonts);
    return {
      families: [...new Set(faces.map((f) => f.family.replace(/"/g, '')))].sort(),
      loaded: [...new Set(faces.filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))].sort(),
      headStyles: document.head.querySelectorAll('style[data-noacg-fonts]').length,
      propertyWidth: first ? getComputedStyle(graphicBody(first).querySelector('.probe-prop')!).width : null,
    };
  });
  await place(page, 'probe', 'ograf-isolation-face', { key: 'one' });
  const one = await read();
  await place(page, 'probe', 'ograf-isolation-face', { key: 'two' });
  const two = await read();
  await unmount(page, 'one');
  const afterOne = await read();
  await unmount(page, 'two');
  const afterBoth = await read();

  expect(one.loaded, "the design's own imported face is not loaded").toContain('Probe Face');
  expect(one.loaded.length, 'the bundled face is not loaded').toBeGreaterThan(1);
  expect(one.propertyWidth, 'the registered @property has no initial value').toBe('23px');
  expect(two.families, 'a second copy changed which faces the page has').toEqual(one.families);
  expect(afterOne, 'disposing one of two copies took the faces away').toMatchObject({ families: one.families, loaded: one.loaded });
  expect(afterBoth.families, 'the faces outlived the last copy').toEqual([]);
  // The light mount carries its faces in its own stylesheet and puts nothing in the head.
  const expected = mount === 'shadow' ? [1, 1, 1, 0] : [0, 0, 0, 0];
  expect([one, two, afterOne, afterBoth].map((r) => r.headStyles), "the renderer's head did not hold one style per design while it was mounted").toEqual(expected);
});

for (const mount of OGRAF_MOUNTS) test(inMount("a template's own `<style>` in `document.head` styles the template", mount), async ({ page }) => {
  // Under SPX a template that appends a `<style>` to its head styles its own page. In the light
  // mount that head is the renderer's, and the rule stays document-wide; in the shadow mount
  // `document.head` is the graphic's shadow root, so the renderer's page is left as it was (AC-7).
  await page.goto('/app');
  const probe = await ografFiles(page, {
    kind: 'probe',
    name: 'Head Probe',
    html: '<div class="probe-head"></div>',
    css: '.probe-head { position: absolute; left: 0; top: 0; height: 5px; }',
    js: "var probeStyle = document.createElement('style'); probeStyle.textContent = '.probe-head { width: 41px; }'; document.head.appendChild(probeStyle);",
  }, mount);
  await serveRenderer(page, { probe });
  const headBefore = await page.evaluate(() => document.head.querySelectorAll('style').length);
  await place(page, 'probe', 'ograf-isolation-head');
  const read = await page.evaluate(() => ({
    width: getComputedStyle(graphicBody(document.querySelector('#stage > *')!).querySelector('.probe-head')!).width,
    headStyles: Array.from(document.head.querySelectorAll('style')).filter((s) => !s.hasAttribute('data-noacg-fonts')).length,
  }));
  expect(read.width, "the template's own head style does not reach its element").toBe('41px');
  if (mount === 'shadow') expect(read.headStyles, "the template's style landed in the renderer's head").toBe(headBefore);
});
