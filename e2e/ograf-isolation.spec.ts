// covers: src/export/targets/ograf.ts, src/templates/importedDesign/{stretch,svg}.ts, src/assets/svgImport.ts
// covers: src/templates/shared/animRuntime.ts, src/blocks/editorGroups.ts
//
// TWO GRAPHICS, ONE RENDERER (issue #789). An OGraf renderer mounts every layer as a Web Component
// in ONE document, so anything a graphic carries that is document-wide reaches the graphic beside
// it. e2e/ograf-conformance.spec.ts pins the template's own stylesheet, the field ids and the host
// page. This file pins the rest: the artwork's own `<style>` and gradient ids inside an imported
// SVG's markup, a child-combinator rule off `body`, a stretch design measured on a renderer that
// does not put its stage at the origin, and what the graphic's shadow root closes
// (docs/work-specs/ograf-shadow-root/spec.md): two copies of one design, a renderer page's own
// rules, the design's faces in the renderer's head, and a template's own `document.head`.
//
// Every package here is built by the real OGraf target from a template the real generators made,
// and mounted the way a renderer mounts it: import graphic.mjs, define the element, append it,
// load(), play.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installGraphicBody } from './_graphicBody';
import { graphicTemplate, ografFiles, type GraphicSource } from './_ografBuild';
import { matches, paritySweep, PARITY_BOUND } from './_ografParity';
import { installDoor } from './_door';

// This file serves documents the app does not boot; they need the door too (e2e/_door.ts).
test.beforeEach(({ context }) => installDoor(context));

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

/** Build `source`'s OGraf package in the app, as package-relative files. */
async function packageOf(page: Page, source: GraphicSource): Promise<Files> {
  const files = await ografFiles(page, await graphicTemplate(page, source));
  if (typeof files !== 'object') throw new Error(`the package did not build: ${files}`);
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
async function place(page: Page, folder: string, tag: string, opts: { key?: string; left?: number; skipAnimation?: boolean } = {}) {
  await page.evaluate(async ({ origin, folder, tag, key, left, skipAnimation }) => {
    const mod = await import(`${origin}/${folder}/graphic.mjs`);
    if (!customElements.get(tag)) customElements.define(tag, mod.default);
    type Driver = HTMLElement & { load(p: unknown): Promise<{ statusCode: number }>; playAction(p: unknown): Promise<unknown> };
    const el = document.createElement(tag) as Driver;
    el.dataset.folder = key ?? folder;
    if (left != null) el.style.left = `${left}px`;
    document.getElementById('stage')!.appendChild(el);
    const loaded = await el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
    if (loaded.statusCode !== 200) throw new Error(`load() answered ${JSON.stringify(loaded)}`);
    await el.playAction({ skipAnimation });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { origin: ORIGIN, folder, tag, key: opts.key ?? null, left: opts.left ?? null, skipAnimation: opts.skipAnimation ?? true });
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
  const a = await packageOf(page, { kind: 'svg', source: illustratorArt('A'), name: 'Quiz Board' });
  const b = await packageOf(page, { kind: 'svg', source: illustratorArt('B'), name: 'Score Board' });
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

test('two keyed SVG groups keep independent pivots through interrupted Out and remount', async ({ page }) => {
  await page.goto('/app');
  const draft = await graphicTemplate(page, { kind: 'probe', name: 'Shared renderer pivots', css: '',
    html: '<svg id="pivot-art" width="960" height="270"><rect id="part-a" data-gfx width="100" height="50"/><rect id="part-b" data-gfx x="200" width="100" height="50"/></svg>' });
  const make = async (opening: number, inTime: number, outTime: number) => {
    const source = await page.evaluate(async ({ draft, opening, inTime, outTime }) => {
      const { parseAnimData } = await __noacgImport('/src/blocks/animData.ts');
      const { replaceRegionWithAnimData } = await __noacgImport('/src/templates/shared/animRuntime.ts');
      const { applyOperations } = await __noacgImport('/src/components/editorFoundation/operations.ts');
      const template = draft as Parameters<typeof applyOperations>[0], data = parseAnimData(template.js)!;
      data.steps = [{ name: 'In', duration: inTime, ease: 'none', layers: {} }, { name: 'Out', duration: outTime, ease: 'none', layers: {} }];
      const selector = '#group-1';
      const key = (step: number, time: number, value: number) => ({ kind: 'animation.key' as const, selector, step, time, value, property: '--base-anchor-x' as const, action: 'set' as const });
      return applyOperations({ ...template, js: replaceRegionWithAnimData(template.js, data)! }, [
        { kind: 'group.create', selectors: ['#part-a', '#part-b'], box: { x: 0, y: 0, width: 300, height: 50 } },
        { kind: 'base.set', selector, values: { scaleX: 2, anchorX: 10, anchorY: 25 } },
        key(0, 0, opening), key(0, inTime, opening + 20), key(1, 0, opening + 20), key(1, outTime, opening + 40),
      ]).template;
    }, { draft, opening, inTime, outTime });
    const files = await ografFiles(page, source);
    if (typeof files === 'string') throw new Error(files);
    return files;
  };
  const a = await make(20, .8, .52), b = await make(35, .92, .68);
  await serveRenderer(page, { a, b });
  const tagA = 'ograf-isolation-pivot-a', tagB = 'ograf-isolation-pivot-b';
  const matrix = (key: string, seek?: { duration: number; at: number }) => page.evaluate(({ key, seek }) => {
    if (seek) {
      type Timeline = { duration(): number; pause(): Timeline; time(at: number, suppress: boolean): void };
      const gsap = (window as unknown as { gsap: { globalTimeline: { getChildren(nested: boolean, tweens: boolean, timelines: boolean): Timeline[] } } }).gsap;
      const timeline = gsap.globalTimeline.getChildren(false, false, true).find(t => Math.abs(t.duration() - seek.duration) < .0001);
      if (!timeline) throw new Error(`No ${seek.duration} timeline`);
      timeline.pause().time(seek.at, true);
    }
    const body = graphicBody(document.querySelector(`[data-folder="${key}"]`)!);
    const parent = body.querySelector<SVGGraphicsElement>('#pivot-art')!, group = body.querySelector<SVGGraphicsElement>('#group-1')!;
    return parent.getScreenCTM()!.inverse().multiply(group.getScreenCTM()!).e;
  }, { key, seek });
  await place(page, 'a', tagA, { skipAnimation: false });
  expect(await matrix('a', { duration: .8, at: .4 })).toBeCloseTo(-30, 3);
  await place(page, 'b', tagB, { skipAnimation: false });
  expect.soft(await matrix('b', { duration: .92, at: .46 })).toBeCloseTo(-45, 3);
  expect(await matrix('a')).toBeCloseTo(-30, 3);
  await page.evaluate(async () => {
    const elements = Array.from(document.querySelectorAll('#stage > *')) as (HTMLElement & { stopAction(p: unknown): Promise<unknown> })[];
    await Promise.all(elements.map(el => el.stopAction({})));
  });
  expect.soft(await matrix('a', { duration: .52, at: .26 })).toBeCloseTo(-45, 3);
  expect.soft(await matrix('b', { duration: .68, at: .34 })).toBeCloseTo(-60, 3);
  await unmount(page, 'a');
  expect.soft(await matrix('b')).toBeCloseTo(-60, 3);
  await place(page, 'a', tagA, { skipAnimation: false });
  expect.soft(await matrix('a', { duration: .8, at: .4 })).toBeCloseTo(-30, 3);
  expect.soft(await matrix('b')).toBeCloseTo(-60, 3);
});

test('owned pivots leave raw same-name GSAP tracks alone in a shared OGraf renderer', async ({ page }) => {
  await page.goto('/app');
  const draft = await graphicTemplate(page, { kind: 'probe', name: 'Mixed renderer pivots',
    css: '#pivot-box {position:absolute;left:20px;top:20px;width:320px;height:100px}',
    html: '<div id="pivot-box" data-gfx></div><svg width="960" height="270"><rect id="pivot-a" data-gfx width="90" height="60"/><rect id="pivot-b" data-gfx x="180" width="90" height="60"/></svg>' });
  const folders = ['raw', 'ordinary', 'group'] as const;
  const durations = { raw: [.74, .42], ordinary: [.82, .5], group: [.9, .58] };
  const packages: Record<string, Files> = {};
  for (const folder of folders) {
    const source = await page.evaluate(async ({ draft, folder, durations: [inTime, outTime] }) => {
      const { parseAnimData } = await __noacgImport('/src/blocks/animData.ts');
      const { replaceRegionWithAnimData } = await __noacgImport('/src/templates/shared/animRuntime.ts');
      const { applyOperations } = await __noacgImport('/src/components/editorFoundation/operations.ts');
      const template = draft as Parameters<typeof applyOperations>[0], data = parseAnimData(template.js)!;
      data.speed = 1;
      data.steps = [{ name: 'In', duration: inTime, ease: 'none', layers: {} }, { name: 'Out', duration: outTime, ease: 'none', layers: {} }];
      if (folder === 'raw') {
        for (const [step, a, b] of [[0, 70, 210], [1, 90, 230]]) {
          data.steps[step].layers['#pivot-box'] = {
            noacgAnchorX: [{ time: 0, value: a }, { time: data.steps[step].duration, value: a + 20 }],
            noacgSvgGroupPivotX: [{ time: 0, value: b }, { time: data.steps[step].duration, value: b + 20 }],
          };
        }
        const init = "var probe = document.getElementById('pivot-box'); probe.noacgAnchorX = 1; probe.noacgSvgGroupPivotX = 2;";
        return { ...template, js: replaceRegionWithAnimData(template.js, data) + '\n' + init,
          css: template.css + '\n#pivot-box {--base-anchor-x: 40px; transform-origin:var(--base-anchor-x) 20px}' };
      }
      const selector = folder === 'group' ? '#group-1' : '#pivot-box';
      const property = folder === 'group' ? '--base-anchor-x' : 'noacgAnchorX';
      const key = (step: number, time: number, value: number) => ({ kind: 'animation.key' as const, selector, property,
        step, time, value, action: 'set' as const, baseValues: { anchorX: 160, anchorY: 50 } });
      const start = folder === 'group' ? 135 : 160;
      const keyed = [key(0, 0, start), key(0, inTime, start + 20), key(1, 0, start + 20), key(1, outTime, start + 40)];
      if (folder === 'ordinary') {
        data.steps[0].layers[selector] = { __noacgPivot_0: [{ time: 0, value: 5 }, { time: inTime, value: 9 }] };
        data.steps[1].layers[selector] = { __noacgPivot_0: [{ time: 0, value: 9 }, { time: outTime, value: 13 }] };
      }
      const js = replaceRegionWithAnimData(template.js, data)! + (folder === 'ordinary' ? "\ndocument.getElementById('pivot-box').__noacgPivot_0 = 5;" : '');
      return applyOperations({ ...template, js }, folder === 'group'
        ? [{ kind: 'group.create', selectors: ['#pivot-a', '#pivot-b'], box: { x: 0, y: 0, width: 270, height: 60 } }, ...keyed]
        : keyed).template;
    }, { draft, folder, durations: durations[folder] });
    const files = await ografFiles(page, source);
    if (typeof files === 'string') throw new Error(files);
    packages[folder] = files;
  }
  await serveRenderer(page, packages);
  const sample = (folder: typeof folders[number], cue: 0 | 1) => page.evaluate(({ folder, duration, cue }) => {
    type Timeline = { duration(): number; pause(): Timeline; time(at: number, suppress: boolean): void };
    type Gsap = { plugins: Record<string, unknown>; getProperty(el: Element, name: string): number;
      globalTimeline: { getChildren(nested: boolean, tweens: boolean, timelines: boolean): Timeline[] } };
    const gsap = (window as unknown as { gsap: Gsap }).gsap;
    const timeline = gsap.globalTimeline.getChildren(false, false, true).find(t => Math.abs(t.duration() - duration) < .0001);
    if (!timeline) throw new Error('No ' + duration + ' timeline');
    timeline.pause().time(duration / 2, true);
    const body = graphicBody(document.querySelector('[data-folder="' + folder + '"]')!);
    const node = body.querySelector(folder === 'group' ? '#group-1' : '#pivot-box')!;
    const pivot = getComputedStyle(node).getPropertyValue('--base-anchor-x');
    if (folder === 'ordinary' && Number(gsap.getProperty(node, '__noacgPivot_0')) !== (cue === 0 ? 7 : 10)) throw new Error('The private accessor replaced a raw property');
    return folder === 'raw'
      ? [pivot, gsap.getProperty(node, 'noacgAnchorX'), gsap.getProperty(node, 'noacgSvgGroupPivotX'),
        'noacgAnchorX' in gsap.plugins, 'noacgSvgGroupPivotX' in gsap.plugins]
      : pivot;
  }, { folder, duration: durations[folder][cue], cue });
  const mount = (folder: typeof folders[number]) => place(page, folder, 'ograf-isolation-mix-' + folder, { skipAnimation: false });
  for (const order of [folders, ['ordinary', 'group', 'raw'] as const]) {
    for (const folder of order) {
      await mount(folder);
      expect.soft(await sample(folder, 0)).toEqual(folder === 'raw' ? ['40px', 80, 220, false, false] : folder === 'ordinary' ? '170px' : '145px');
    }
    expect.soft(await sample('raw', 0)).toEqual(['40px', 80, 220, false, false]);
    await page.evaluate(async () => {
      const graphics = [...document.querySelectorAll('#stage > *')] as (HTMLElement & { stopAction(p: unknown): Promise<unknown> })[];
      await Promise.all(graphics.map(el => el.stopAction({})));
    });
    expect.soft(await sample('raw', 1)).toEqual(['40px', 95, 235, false, false]);
    expect.soft(await sample('ordinary', 1)).toBe('185px');
    expect.soft(await sample('group', 1)).toBe('160px');
    await unmount(page, 'ordinary'); await mount('ordinary');
    expect.soft(await sample('ordinary', 0)).toBe('170px');
    expect.soft(await sample('raw', 1)).toEqual(['40px', 95, 235, false, false]);
    await page.reload();
  }
});

test("a child-combinator rule off `body` matches the design's own top-level elements, and `body.children` lists them", async ({ page }) => {
  await page.goto('/app');
  const files = await packageOf(page, {
    kind: 'probe',
    name: 'Child Probe',
    html: '<div class="probe-card"></div>',
    css: 'body > .probe-card { position: absolute; left: 0; top: 0; width: 37px; height: 5px; }',
    // What a hand-written template reads off its own page: the top-level elements of its body.
    js: "document.body.setAttribute('data-probe-children', Array.prototype.map.call(document.body.children, function (c) { return c.className || c.tagName.toLowerCase(); }).join(' '));",
  });
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
  // The design's markup exactly as authored, and only it: no wrapper between the body and its
  // elements, and the graphic's own stylesheet beside the canvas in its shadow root, not in it.
  expect(read.children[0], "the template's top-level elements are not the children of its body").toBe('probe-card');
  expect(read.children, "the stylesheet is among the design's own elements").not.toContain('style');
});

test('a stretch design measures the same room whether or not the renderer offsets its stage', async ({ page }) => {
  await page.goto('/app');
  // The stretch runtime as the importer emits it, over a box anchored 1400 px in: its stretch
  // line holds a 600 px run in a 300 px slot, so it asks for 301 px, and the frame edge (4%
  // inside 1920) caps it at 143.2. And the same runtime as a design imported before the edge walk
  // stopped at the canvas carries it in its saved code, which the export upgrades (#925).
  const savedBefore = await page.evaluate(async () => {
    const { stretchRuntimeJs } = await __noacgImport('/src/templates/importedDesign/stretch.ts');
    const now = 'for (var el = box; el && el !== document.body; el = el.offsetParent) x += el.offsetLeft;';
    const js = stretchRuntimeJs('probe');
    if (!js.includes(now)) throw new Error('the stretch runtime no longer walks its edge as this case expects - update the case');
    return js.replace(now, 'for (var el = box; el; el = el.offsetParent) x += el.offsetLeft;');
  });
  const probe = {
    kind: 'probe' as const,
    name: 'Stretch Probe',
    html: '<div class="probe-box"><div data-stretch><span data-fit="shrink">wide</span></div></div>',
    css: [
      '.probe-box { position: absolute; left: 1400px; top: 100px; width: calc(300px + var(--stretch-x, 0px)); height: 40px; }',
      '.probe-box [data-stretch] { width: calc(300px + var(--stretch-x, 0px)); overflow: hidden; white-space: nowrap; }',
      '.probe-box [data-fit] { display: inline-block; width: 600px; }',
    ].join('\n'),
  };
  await serveRenderer(page, {
    stretch: await packageOf(page, { ...probe, stretch: true }),
    saved: await packageOf(page, { ...probe, js: savedBefore }),
  });
  const stretchAt = async (folder: string, left: number) => {
    await page.evaluate((left) => { document.getElementById('stage')!.style.left = `${left}px`; }, left);
    await place(page, folder, `ograf-isolation-${folder}`);
    const value = await page.evaluate((folder) =>
      graphicBody(document.querySelector(`[data-folder="${folder}"]`)!).querySelector<HTMLElement>('.probe-box')!.style.getPropertyValue('--stretch-x'), folder);
    await unmount(page, folder);
    return value;
  };
  for (const [folder, label] of [['stretch', 'the design'], ['saved', 'a design saved before #924']]) {
    const atOrigin = await stretchAt(folder, 0);
    expect(atOrigin, `${label} did not stretch at all - nothing was proven`).toBe('143.2px');
    expect(await stretchAt(folder, 240), `an offset stage changed how far ${label} stretches`).toBe(atOrigin);
  }
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

test('two reveal designs on one renderer each move and clear only their own elements', async ({ page }) => {
  // The competition reveals hand GSAP ARRAYS of selector strings: every replay resets with
  // `gsap.set(['.reveal-subject', '.reveal-note', ...], { clearProps: 'all' })`, and the winner
  // card's press reveals with `gsap.fromTo(['.reveal-subject', '.reveal-runner'], ...)`. All of
  // them share those class names, so each selector must resolve inside its own graphic.
  await page.goto('/app');
  const award = await packageOf(page, { kind: 'design', id: 'aw01' });
  const winner = await packageOf(page, { kind: 'design', id: 'wn01' });
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

test("a template's `window.document` is its own, when a neighbour mounted first has the same field id", async ({ page }) => {
  // Hand-written code may reach the document through `window`. Every NoaCG design names its first
  // field #f0, and the real document answers with the FIRST #f0 in it: the neighbour's.
  await page.goto('/app');
  const neighbour = await packageOf(page, { kind: 'probe', name: 'Neighbour', html: '', css: '' });
  const probe = await packageOf(page, {
    kind: 'probe',
    name: 'Window Probe',
    html: '',
    css: '',
    js: 'function update(raw) { var data = JSON.parse(raw); if (data.f0 != null) window.document.getElementById(\'f0\').textContent = data.f0; }',
  });
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

// ── What the shadow root closes (AC-4 to AC-7, docs/work-specs/ograf-shadow-root/spec.md) ──

test('two copies of one imported design each keep their own gradient and fields, and outlive each other', async ({ page }) => {
  // Two copies of one design share every id, so in one tree `url(#SVGID_1_--noacg-quiz-board)`
  // resolves to the FIRST copy's gradient: recolouring it per copy, as a colour field or a picture
  // swap does, painted both copies with the first one's colour in the light DOM, before the shadow
  // root gave each copy its own tree.
  await page.goto('/app');
  const art = illustratorArt('A').replace('</svg>', '<text id="Caption" x="100" y="1000" style="fill:#FFFFFF;font-size:40px">Copy</text>\n</svg>');
  const board = await packageOf(page, { kind: 'svg', source: art, name: 'Quiz Board' });
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

  // Each updateAction wrote only its own copy's field.
  expect(shownFields).toEqual({ one: 'One', two: 'Two' });
  expect(afterFields).toEqual({ two: 'Two' });
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

test("a renderer page's own rules do not reach into the graphic", async ({ page, browser }) => {
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
      { name: 'clean', mount: 'ograf' },
      { name: 'underRules', mount: 'ograf', rules: RENDERER_RULES },
    ],
  });
  expect(rows.filter((row) => row.error), 'a design did not mount').toEqual([]);
  expect(rows.filter((row) => !matches(row, 'underRules')).map((row) => [row.key, row.against.underRules]),
    `the renderer page's rules changed a graphic's frame (bound ${PARITY_BOUND} pixels)`).toEqual([]);
  // The control: the same rules restyle what they can reach, the renderer page's own elements.
  // In the light DOM they changed these designs' frames by 12,000 to 40,000 pixels (the spikes).
  await serveRenderer(page, {}, RENDERER_RULES);
  const reached = await page.evaluate(() => {
    const span = document.getElementById('stage')!.appendChild(document.createElement('span'));
    const style = getComputedStyle(span);
    return { color: style.color, letterSpacing: style.letterSpacing };
  });
  expect(reached, "the rules restyle nothing on the renderer's page either - nothing was proven").toEqual({ color: 'rgb(255, 0, 255)', letterSpacing: '12px' });
});

test("a design's own faces and registered properties apply, for exactly as long as a copy is mounted", async ({ page }) => {
  // Chromium applies neither `@font-face` nor `@property` from inside a shadow tree, so the export
  // lifts both into ONE `<style data-noacg-fonts>` in the renderer's head: put there by the first
  // copy to load, kept while any copy is mounted, taken out with the last (AC-4).
  await page.goto('/app');
  const face = readFileSync(fileURLToPath(new URL('../public/fonts/space-grotesk.woff2', import.meta.url))).toString('base64');
  const probe = await packageOf(page, {
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
  });
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
  expect([one, two, afterOne, afterBoth].map((r) => r.headStyles), "the renderer's head did not hold one style per design while it was mounted").toEqual([1, 1, 1, 0]);
});

test("a template's own `<style>` in `document.head` styles the template", async ({ page }) => {
  // Under SPX a template that appends a `<style>` to its head styles its own page. Here
  // `document.head` is the graphic's shadow root, so the rule styles the template and the
  // renderer's page is left as it was (AC-7). In the light DOM it was the renderer's head.
  await page.goto('/app');
  const probe = await packageOf(page, {
    kind: 'probe',
    name: 'Head Probe',
    html: '<div class="probe-head"></div>',
    css: '.probe-head { position: absolute; left: 0; top: 0; height: 5px; }',
    js: "var probeStyle = document.createElement('style'); probeStyle.textContent = '.probe-head { width: 41px; }'; document.head.appendChild(probeStyle);",
  });
  await serveRenderer(page, { probe });
  const headBefore = await page.evaluate(() => document.head.querySelectorAll('style').length);
  await place(page, 'probe', 'ograf-isolation-head');
  const read = await page.evaluate(() => ({
    width: getComputedStyle(graphicBody(document.querySelector('#stage > *')!).querySelector('.probe-head')!).width,
    headStyles: Array.from(document.head.querySelectorAll('style')).filter((s) => !s.hasAttribute('data-noacg-fonts')).length,
  }));
  expect(read.width, "the template's own head style does not reach its element").toBe('41px');
  expect(read.headStyles, "the template's style landed in the renderer's head").toBe(headBefore);
});
