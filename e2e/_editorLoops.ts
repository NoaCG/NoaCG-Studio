import { readFileSync } from 'node:fs';
import { expect, type Page, type Locator, type TestInfo } from '@playwright/test';
import type { AnimData } from '../src/blocks/animData';
import type { GraphicUsage } from '../src/export/registry';
import type { SpxTemplate } from '../src/model/types';
import { evaluateInPage } from './_evaluate';
import { installGraphicBody } from './_graphicBody';
import { capture, frame, ready, redo, saveReopen, seek, select, source, undo } from './_layerProperty';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/editor-loops.json', import.meta.url), 'utf8')) as AnimData;
const loop = { repeat: -1, yoyo: true, repeatDelay: .25, range: [.1, 1.1] as [number, number], phase: .25 };
const box = '<div data-gfx id="box"></div>';
const svg = '<svg class="imported-design-art" width="1920" height="1080" viewBox="0 0 1920 1080"><rect id="box" data-name="Accent" x="400" y="300" width="360" height="140" fill="#e4b94d"/></svg>';
const CSS = 'body{margin:0}.loop-fixture{opacity:0}div#box{position:absolute;left:400px;top:300px;width:360px;height:140px;background:#e4b94d}#score,#late{position:absolute;left:400px;top:460px;color:white;font:40px Arial}#late{left:800px}';

async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await ready(page);
}

async function template(page: Page, data: AnimData, artwork = box, out = 'manual'): Promise<SpxTemplate> {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="loop-fixture imported-design-box">' +
    artwork + '<div id="score" data-gfx><span id="f0">0</span></div><div id="late" data-gfx>Reveal</div></div></body></html>';
  return page.evaluate(async ({ data, html, css, out }) => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const { spxSteps } = await import('/src/blocks/animMachine.ts');
    const settings = { ...store.template.settings, steps: String(spxSteps(data)), out };
    const fields = [{ field: 'f0', ftype: 'textfield' as const, title: 'Score', value: '0' }];
    return { ...store.template, name: 'Loop fixture', settings, fields, layers: [], fps: 25,
      html: replaceDefinitionInHtml(html, settings, fields), css,
      js: runtimeJs('Loop fixture', emitAnimRegion(data)) + '\n// User source sentinel.\n' };
  }, { data, html, css: CSS, out });
}

async function apply(page: Page, input: SpxTemplate) {
  await evaluateInPage(page, async template => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
  }, input);
  await ready(page);
}

function anim(page: Page) {
  return page.evaluate(async () => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return parseAnimData(t.js)!;
  });
}
const editorPose = async (page: Page) => (await frame(page)).evaluate(() => {
  const w = window as unknown as { gsap: { getProperty(e: Element, p: string): number } };
  const box = document.querySelector('#box')!, score = document.querySelector('#score')!;
  return [Number(w.gsap.getProperty(box, 'x')), Number(getComputedStyle(box).opacity), Number(w.gsap.getProperty(score, 'y'))];
});
async function pose(page: Page, x: number, opacity: number, y: number) {
  await ready(page);
  const want = [x, opacity, y].map(value => Math.round(value * 1000));
  await expect.poll(async () => (await editorPose(page)).map(value => Math.round(value * 1000))).toEqual(want);
}

async function settings(panel: Locator, target: string, speed: number, forever: boolean) {
  await panel.getByLabel('Loop target').selectOption(target);
  await panel.getByLabel('Direction').selectOption(forever ? 'yoyo' : 'repeat');
  await panel.getByLabel('Start (s)').fill(String(.1 / speed));
  await panel.getByLabel('End (s)').fill(String(1.1 / speed));
  await panel.getByLabel('Phase (s)').fill(String(.25 / speed));
  await panel.getByLabel('Delay (s)').fill(String(.25 / speed));
  await panel.getByLabel('Forever').setChecked(forever);
  if (!forever) await panel.getByLabel('Extra passes').fill('1');
  await panel.getByRole('button', { name: 'Apply loop' }).click();
}

export async function authorLocalLoops(page: Page, testInfo: TestInfo) {
  await open(page);
  await verifyLoopCompositionEdits(page);
  const data = fixture();
  data.steps[0].layers['#box'].rotation = [{ time: 0, value: 0 }, { time: 1.3, value: 0 }];
  data.steps[0].layers['#box'].filter = [{ time: 0, value: 'blur(0px)' }, { time: 1.3, value: 'blur(0px)' }];
  const input = await template(page, data);
  await apply(page, input);
  await seek(page, .36);
  await select(page, '#box');
  const panel = page.locator('.ef-loop-controls');
  const edit = panel.getByText('Edit loop', { exact: true });
  await edit.focus();
  await edit.press('Enter');
  await settings(panel, 'x', 1, true);
  await expect.poll(async () => (await anim(page)).steps[0].loops?.['#box']).toEqual({ x: loop });
  await pose(page, 61, .5, 36);
  const local = panel.getByRole('slider', { name: 'Loop playhead' });
  const ruler = page.getByRole('slider', { name: 'Playhead', exact: true });
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await play.press('Enter');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.runFor(100);
  await expect(local).toBeVisible({ timeout: 2000 });
  await local.press('Home');
  await page.clock.runFor(80);
  await expect(play).toBeVisible();
  const parked = await ruler.getAttribute('aria-valuenow');
  await page.clock.runFor(200);
  await expect(ruler).toHaveAttribute('aria-valuenow', parked!);
  await page.clock.resume();
  await seek(page, .36);
  await local.focus();
  await local.press('Home');
  await pose(page, 35, .5, 36);
  await local.press('ArrowRight');
  await expect(local).toHaveAttribute('aria-valuetext', '0.040 seconds');
  await pose(page, 39, .5, 36);
  await local.press('End');
  await pose(page, 35, .5, 36);
  await local.press('ArrowLeft');
  await pose(page, 31, .5, 36);
  await local.press('Home');
  await pose(page, 35, .5, 36);
  await expect(ruler).toHaveAttribute('aria-valuenow', '0.36');
  await capture(page, testInfo.outputPath('local-loop-ruler.png'));
  await panel.getByRole('button', { name: 'Return to composition' }).click();
  await pose(page, 61, .5, 36);

  for (const tab of ['Outline', 'Assistant'] as const) {
    await local.press('Home');
    await pose(page, 35, .5, 36);
    const control = page.getByRole(tab === 'Outline' ? 'tab' : 'button', { name: tab, exact: true });
    await control.click();
    await pose(page, 61, .5, 36);
    if (tab === 'Outline') await page.getByRole('tab', { name: 'Properties', exact: true }).click();
    else await control.click();
    await edit.click();
    await expect(panel.getByLabel('Loop target')).toHaveValue('x');
  }

  const propertyEdit = await source(page);
  await settings(panel, '', 1, false);
  const repeated = { repeat: 1, repeatDelay: .25, range: [.1, 1.1], phase: .25 };
  await expect.poll(async () => (await anim(page)).steps[0].loops?.['#box']).toEqual({ x: repeated, opacity: repeated });
  await expect.poll(async () => page.evaluate(async () => {
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    return (await import('/src/components/editorFoundation/timelineView.ts')).readTimeline(session.port.read()).segments[1].start;
  })).toBeCloseTo(2.1, 6);
  await local.focus();
  await local.press('End');
  await pose(page, 100, 1, 36);
  await panel.getByRole('button', { name: 'Return to composition' }).click();
  await seek(page, 2.08);
  await pose(page, 100, 1, 130);
  const layerEdit = await source(page);
  await undo(page);
  expect((await source(page)).js).toBe(propertyEdit.js);
  await redo(page);
  expect((await source(page)).js).toBe(layerEdit.js);
  const saved = await saveReopen(page, 'E2 HTML loops');
  expect(saved.js).toBe(layerEdit.js);
  expect(saved.js).toContain('// User source sentinel.');
  expect(saved.html).toBe(input.html);
  expect(saved.css).toBe(input.css);
  expect(saved.fields).toEqual(input.fields);
  expect((await anim(page)).steps.map(step => step.layers)).toEqual(data.steps.map(step => step.layers));
}

export async function scrubSvgLoop(page: Page) {
  await open(page);
  const data = fixture();
  data.speed = 2;
  const input = await template(page, data, svg);
  await apply(page, input);
  await seek(page, .2);
  await select(page, '#box');
  const panel = page.locator('.ef-loop-controls');
  await panel.getByText('Edit loop', { exact: true }).click();
  await settings(panel, '', 2, true);
  await expect.poll(async () => (await anim(page)).steps[0].loops?.['#box']).toEqual({ x: loop, opacity: loop });
  const local = panel.getByRole('slider', { name: 'Loop playhead' });
  await local.press('Home');
  await pose(page, 35, .5, 40);
  await local.press('ArrowRight');
  await expect(local).toHaveAttribute('aria-valuetext', '0.040 seconds');
  await pose(page, 43, .5375, 40);
  await local.press('ArrowLeft');
  await pose(page, 35, .5, 40);
  await expect(page.getByRole('slider', { name: 'Playhead', exact: true })).toHaveAttribute('aria-valuenow', '0.2');
  expect((await source(page)).html).toBe(input.html);
}

async function built(page: Page, t: SpxTemplate, target: string, usage?: GraphicUsage) {
  return page.evaluate(async ({ t, target, usage }) => {
    if (target === 'simulator') return { html: (await import('/src/preview/composeDocument.ts')).composeDocument(t, { simulate: true }) };
    if (target === 'single-file') return { html: await (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(t) };
    const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(entry => entry.id === target)!.build(t, usage ? { graphicUsage: usage } : undefined);
    return { files: Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(name => !zip.files[name].dir).map(async name =>
      [name.slice(name.indexOf('/') + 1), await zip.file(name)!.async('base64')]))) as Record<string, string> };
  }, { t, target, usage });
}

async function loadExport(output: Page, artifact: Awaited<ReturnType<typeof built>>, target: string, renderType: 'realtime' | 'non-realtime' = 'realtime') {
  if (artifact.html) { await output.setContent(artifact.html); return; }
  const files = artifact.files!;
  await output.route('http://loop-package.local/**', route => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (path === '') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Loop package</title>' });
    const body = files[path];
    return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'),
      contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  if (target !== 'ograf') {
    await output.goto('http://loop-package.local/' + Object.keys(files).find(name => name.endsWith('.html') && !name.includes('controlpanel')));
    return;
  }
  await installGraphicBody(output);
  await output.goto('http://loop-package.local/');
  const status = await output.evaluate(async renderType => {
    const mod = await import('http://loop-package.local/graphic.mjs');
    customElements.define('loop-graphic', mod.default);
    const el = document.createElement('loop-graphic') as HTMLElement & { load(params: unknown): Promise<{ statusCode: number }> };
    document.body.appendChild(el);
    return (await el.load({ data: { f0: '0' }, renderType, renderCharacteristics: {} })).statusCode;
  }, renderType);
  expect(status, 'OGraf package loads').toBe(200);
}

type Timeline = { time(t?: number, suppress?: boolean): number; pause(): Timeline; duration(): number;
  __noacgLoops?: Array<{ animation: { timeScale(value: number): void } }> };

export async function playLoopOutputs(page: Page) {
  await open(page);
  const data = fixture();
  data.steps[0].layers['#box'].scaleX = [{ time: .2, value: 1 }, { time: 1, value: 3 }];
  data.steps[0].loops = { '#box': { x: loop, opacity: loop, scaleX: loop } };
  data.steps[1].duration = .42;
  data.steps[1].layers['#score'] = { x: [{ time: 0, value: 20 }, { time: .2, value: 100 }] };
  data.steps[1].loops = { '#score': { x: { repeat: 1, yoyo: true, range: [0, .2] } } };
  data.steps[2].layers['#score'] = { x: [{ time: 0, value: 100 }, { time: .5, value: -100 }] };
  data.steps[2].layers['#box'].scale = [{ time: 0, value: 4 }, { time: .5, value: 1 }];
  data.machine = { groups: [{
    id: 'main', initial: 'off', defaultPath: ['in', 'reveal', 'out'],
    states: ['off', 'in', 'reveal', 'out'].map(id => ({ id })),
    transitions: [{ from: 'in', to: 'reveal', trigger: 'operator', event: 'reveal' }],
  }] };
  const input = await template(page, data, svg);
  for (const target of ['simulator', 'spx', 'casparcg', 'ograf', 'single-file']) {
    const output = await page.context().newPage();
    try {
      const errors: string[] = [];
      output.on('pageerror', error => errors.push(error.message));
      await loadExport(output, await built(page, input, target), target);
      const samples = await output.evaluate(async target => {
        const w = window as unknown as {
          play(): void; next(): void; stop(): void; update(data: object): void;
          noacgSnap(assignments: object, options: object): void;
          gsap: { getProperty(e: Element, p: string): number; globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Timeline[] } };
        };
        const el = document.querySelector('loop-graphic') as HTMLElement & {
          playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown>; updateAction(p: unknown): Promise<unknown>;
          _runtime: { snap(assignments: object, options: object): void };
        };
        const body = target === 'ograf' ? graphicBody(el) : document;
        const command = async (name: 'play' | 'next' | 'stop') => {
          if (target === 'simulator') window.dispatchEvent(new MessageEvent('message', { source: window,
            data: { type: 'spx-preview-cmd', cmd: 'sim-' + name, data: '{}' } }));
          else if (target === 'ograf') {
            if (name === 'stop') await el.stopAction({});
            else await el.playAction({});
          } else w[name]();
        };
        const timelines = () => w.gsap.globalTimeline.getChildren(false, false, true);
        const current = () => timelines().findLast(tl => tl.__noacgLoops?.length)!;
        const take = (tl: Timeline, at: number) => { tl.pause().time(at, true); return snapshot(); };
        const snapshot = () => {
          const shape = body.querySelector('#box')!;
          return [Number(w.gsap.getProperty(shape, 'x')), Number(getComputedStyle(shape).opacity),
            Number(w.gsap.getProperty(body.querySelector('#score')!, 'y'))].map(x => Math.round(x * 1000) / 1000);
        };
        await command('play');
        const first = current();
        const sequence = [.35, 1.6, 2.1, .05, .35].map(at => take(first, at));
        first.__noacgLoops![0].animation.timeScale(2);
        const afterScale = snapshot();
        const faster = take(first, .4);
        if (target === 'ograf') await el.updateAction({ data: { f0: '7' } });
        else w.update({ f0: '7' });
        const score = body.querySelector('#f0')!.textContent;
        await command('next');
        take(first, 2.1);
        const afterNext = take(current(), .42)[0];
        await command('stop');
        const releasedAfterNext = snapshot();
        const outShape = body.querySelector('#box')!;
        const outAxes = ['scaleX', 'scaleY'].map(axis => Number(w.gsap.getProperty(outShape, axis)));
        const out1 = timelines().findLast(tl => Math.abs(tl.duration() - .5) < .001)!;
        take(out1, .5);
        await command('play');
        const replay = current();
        const held = take(replay, .35);
        await command('stop');
        const released = snapshot();
        const out = timelines().findLast(tl => Math.abs(tl.duration() - .5) < .001)!;
        const midpoint = take(out, .25);
        await command('stop');
        const sameOut = timelines().findLast(tl => Math.abs(tl.duration() - .5) < .001) === out;
        take(out, .5);
        const hidden = Number(getComputedStyle(body.querySelector('.loop-fixture')!).opacity);
        const late = Number(getComputedStyle(body.querySelector('#late')!).opacity);
        const snaps = [1, 2].map(() => {
          const assignments = { main: 'in' }, options = { timers: false };
          if (target === 'ograf') el._runtime.snap(assignments, options);
          else w.noacgSnap(assignments, options);
          return snapshot();
        });
        return { sequence, afterScale, faster, score, afterNext, releasedAfterNext, outAxes, held, released, midpoint, sameOut, hidden, late, snaps };
      }, target);
      expect(errors, target).toEqual([]);
      expect(samples, target).toEqual({
        sequence: [[60, .75, 35], [60, .75, 130], [20, .5, 130], [20, .5, 5], [60, .75, 35]],
        afterScale: [60, .75, 35], faster: [70, .813, 40], score: '7', afterNext: 70, releasedAfterNext: [70, .813, 130],
        outAxes: [2.125, 4], held: [60, .75, 35], released: [60, .75, 35], midpoint: [-20, .375, 35],
        sameOut: true, hidden: 0, late: 0, snaps: [[90, 1, 130], [90, 1, 130]],
      });
    } finally { await output.close(); }
  }

  await verifyPublicStyledOut(page);

  // The foundation editor composes preceding cues to reconstruct a parked pose.
  await page.clock.install();
  await apply(page, input);
  await seek(page, 1.72);
  await pose(page, 90, 1, 130);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await page.clock.runFor(120);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.runFor(100);
  await ready(page);
  const elapsed = await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const session = activeEditorSession();
    return session.port.view().time - 1.72;
  });
  expect(elapsed).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(.5);
  expect((await editorPose(page))[0]).toBeCloseTo(90 + (-100 - 90) * elapsed / .5, 3);
  const scoreX = await (await frame(page)).evaluate(() => {
    const w = window as unknown as { gsap: { getProperty(e: Element, p: string): number } };
    return Number(w.gsap.getProperty(document.querySelector('#score')!, 'x'));
  });
  expect(scoreX).toBeCloseTo(20 + (-100 - 20) * elapsed / .5, 3);

  // An explicit upgrade gives earlier range-less finite loops the same cue clock.
  await page.clock.resume();
  const mixed = fixture();
  mixed.steps[0].loops = { '#box': {
    x: { repeat: 1, yoyo: true },
    opacity: { repeat: 0, range: [.4, .8] },
  } };
  mixed.steps[0].spans = { '#score': [{ start: .2, end: 1.3 }] };
  mixed.steps[1].spans = { '#score': [{ start: 0, end: .4 }] };
  delete mixed.steps[1].reveals;
  mixed.steps[0].hides = ['#late'];
  const mixedInput = await template(page, mixed);
  await apply(page, mixedInput);
  await seek(page, 1.8);
  await pose(page, 20, 1, 130);
  const flag = await page.evaluate(async () => {
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const template = session.port.read();
    const { readTimeline } = await import('/src/components/editorFoundation/timelineView.ts');
    const { authoringPosition } = await import('/src/components/editorFoundation/animationAuthoring.ts');
    const bars = readTimeline(template).bars.filter(bar => bar.step === 0);
    return { barEnd: bars.find(bar => bar.selector === '#score')?.end,
      hideEnd: bars.find(bar => bar.selector === '#late')?.end, position: authoringPosition(template, '#score', 1.8) };
  });
  expect(flag).toEqual({ barEnd: 1.8, hideEnd: 1.3, position: { step: 0, time: 1.8 } });
  const ograf = await built(page, mixedInput, 'ograf');
  const manifestFile = Object.entries(ograf.files!).find(([file]) => file.endsWith('.ograf.json'))!;
  const manifest = JSON.parse(Buffer.from(manifestFile[1], 'base64').toString('utf8'));
  expect(manifest.actionDurations.find((action: { type: string }) => action.type === 'playAction').steps[0]).toEqual({ step: 0, duration: 1800 });
}

export async function playTimedLoopOverlay(page: Page) {
  await open(page);
  const data = fixture();
  data.steps[0].loops = { '#box': { x: loop } };
  const input = await template(page, data, box, '250');
  const output = await page.context().newPage();
  try {
    await output.clock.install();
    await loadExport(output, await built(page, input, 'html-overlay'), 'html-overlay');
    const root = output.locator('.loop-fixture');
    await output.clock.runFor(1350);
    await expect(root).toHaveCSS('opacity', '1');
    const first = await output.locator('#box').evaluate(el => getComputedStyle(el).transform);
    await output.clock.runFor(100);
    expect(await output.locator('#box').evaluate(el => getComputedStyle(el).transform)).not.toBe(first);
    await output.clock.runFor(850);
    await expect(root).toHaveCSS('opacity', '0');
  } finally { await output.close(); }
  await verifyTimedOgraf(page);
}

async function verifyLoopCompositionEdits(page: Page) {
  const data = fixture();
  const input = await template(page, data, box + '<div id="spare" data-gfx></div>');
  const result = await page.evaluate(async original => {
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { anchorKeyReason, applyAnimation, applyKeyPaste, captureKeyClipboard } = await import('/src/blocks/editorAnimation.ts');
    const { createPath } = await import('/src/blocks/editorPaths.ts');
    const { placeGraphicImage } = await import('/src/blocks/editorImages.ts');
    const { applyEditorLoop } = await import('/src/blocks/editorLoops.ts');
    const asset = { path: 'images/test.png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9p0AAAAASUVORK5CYII=' };
    const source = { ...original, assets: [asset],
      html: original.html.replace('loop-fixture imported-design-box', 'loop-fixture imported-design imported-design-box'),
      css: original.css + '#spare{position:absolute;left:20px;top:20px;width:40px;height:40px}' };
    const settings = { kind: 'loop.set' as const, selector: '#box', step: 0, property: 'x',
      loop: { repeat: 1, repeatDelay: .25, range: [.1, 1.1] as [number, number], phase: .25 } };
    const geometry = { x: 20, y: 30, width: 25, height: 30 };
    const points = { points: [{ x: 5, y: 10 }, { x: 30, y: 30 }], closed: false };
    const path = (template: SpxTemplate, time: number) => createPath(template, points, time);
    const image = (template: SpxTemplate, time: number) => placeGraphicImage(template, asset.path, geometry, time);
    const spans = (template: SpxTemplate, selector: string) => parseAnimData(template.js)!.steps.map(step => step.spans?.[selector]);
    const refuse = (run: () => unknown) => {
      try { run(); return ''; } catch (cause) { return String(cause); }
    };
    const placed = (template: SpxTemplate, time: number) => {
      const drawn = path(template, time), added = image(drawn.template, time);
      return { template: added.template, selectors: [drawn.selector, added.selector],
        spans: [spans(added.template, drawn.selector), spans(added.template, added.selector)] };
    };
    const looped = applyEditorLoop(source, settings), baseline = placed(source, 1.4);
    const placedAfterLoop = placed(looped, 2.2);
    const refusedPlacement = [1.3, 1.6, 2.1].flatMap(time => [
      refuse(() => path(looped, time)), refuse(() => image(looped, time)),
    ]);

    const anchor = (time: number) => ({ kind: 'animation.key' as const, selector: '#spare', step: 0,
      property: 'noacgAnchorX' as const, time, value: 12, action: 'set' as const, baseValues: { anchorX: 20, anchorY: 20 } });
    const pivot = applyAnimation(source, anchor(.3)), loopedPivot = applyEditorLoop(pivot, settings);
    const anchorOperations = (template: SpxTemplate) => {
      const copied = captureKeyClipboard(template, [{ selector: '#spare', property: anchor(0).property, step: 0, time: .3 }]);
      const written = applyKeyPaste(applyAnimation(template, anchor(.55)), { kind: 'key.paste', keys: copied, step: 0, time: .65 });
      return parseAnimData(written.js)!.steps[0].layers['#spare'][anchor(0).property].map(key => key.time);
    };
    const mismatched = { ...pivot, js: spliceAnimData(pivot.js, parseAnimData(loopedPivot.js)!)! };
    const invalidDelay = refuse(() => applyEditorLoop(source, { ...settings, loop: { ...settings.loop, repeat: -1, repeatDelay: 1e306 } }));
    return { before: baseline.spans, after: placedAfterLoop, refusedPlacement,
      anchors: [anchorOperations(pivot), anchorOperations(loopedPivot)], mismatch: anchorKeyReason(mismatched, '#spare'), invalidDelay };
  }, input);
  const spans = [[], [{ start: .1, end: .4 }], [{ start: 0, end: .5 }]];
  expect(result.before).toEqual([spans, spans]);
  expect(result.after.spans).toEqual([spans, spans]);
  for (const refused of result.refusedPlacement) expect(refused).toContain("Move the playhead outside the loop's extra time");
  expect(result.anchors).toEqual([[.3, .55, .65], [.3, .55, .65]]);
  expect(result.mismatch).toContain('its animation is preserved');
  expect(result.invalidDelay).toContain('finite nonnegative delay');
  await apply(page, result.after.template);
  for (const [at, visibility] of [[2.16, 'hidden'], [2.24, 'visible']] as const) {
    await seek(page, at);
    const stage = await frame(page);
    for (const selector of result.after.selectors) {
      await expect.poll(() => stage.locator(selector).evaluate(node => getComputedStyle(node).visibility)).toBe(visibility);
    }
  }
}

async function verifyPublicStyledOut(page: Page) {
  for (const [target, style, authored] of [
    ['spx', 'fade', false], ['spx', 'push-left', false], ['spx', 'wipe-left', true], ['ograf', 'fade', false],
  ] as const) {
    const data = fixture();
    data.steps[0].loops = { '#box': { x: loop } };
    data.steps[2].calls = [{ time: 0, call: 'countStyleSwap' }];
    data.machine = { groups: [{ id: 'main', initial: 'off', defaultPath: ['in', 'reveal', 'out'],
      states: ['off', 'in', 'reveal', 'out'].map(id => ({ id })),
      transitions: [{ from: authored ? 'in' : 'reveal', to: 'out', trigger: authored ? 'operator' : 'lifecycle',
        event: authored ? 'leave' : 'stop', style, duration: .6, ease: 'none' }],
    }] };
    const input = await template(page, data);
    const probe = { ...input, js: input.js +
      '\nfunction countStyleSwap() { var root = document.querySelector(".loop-fixture"); root.dataset.styleSwaps = String((Number(root.dataset.styleSwaps) || 0) + 1); }\n' };
    const context = await page.context().browser()!.newContext();
    try {
      const output = await context.newPage();
      await output.clock.install();
      await loadExport(output, await built(page, probe, target), target);
      await output.clock.pauseAt(await output.evaluate(() => Date.now() + 100));
      await output.evaluate(({ target, authored }) => {
        type Styled = Timeline & { call(fn: () => void, params: null, at: number): void; progress(value: number, suppress: boolean): void };
        const w = window as unknown as {
          play(): void; stop(): void; noacgDispatch(event: string): Styled; noacgStyledOut: Styled | null;
          gsap: { getProperty(element: Element, prop: string): number;
            globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Styled[] } };
          styledOutProbe: (operation: 'play' | 'stop' | 'repeat' | 'sample' | 'settle') => Promise<unknown>;
        };
        type Status = { statusCode: number; statusMessage?: string };
        const el = document.querySelector('loop-graphic') as HTMLElement & { playAction(p: object): Promise<Status>; stopAction(p: object): Promise<Status> };
        const body = target === 'ograf' ? graphicBody(el) : document;
        const root = body.querySelector('.loop-fixture')!, box = body.querySelector('#box')!;
        const exit = () => target === 'spx' ? w.noacgStyledOut
          : w.gsap.globalTimeline.getChildren(false, false, true).findLast(tl => Math.abs(tl.duration() - .6) < .001);
        const command = async (name: 'play' | 'stop') => {
          if (target === 'spx') { w[name](); return; }
          const result = name === 'stop' ? await el.stopAction({}) : await el.playAction({});
          if (result.statusCode !== 200) throw new Error(result.statusMessage || 'OGraf action failed');
        };
        let active: Styled | null | undefined;
        const snapshot = () => {
          const css = getComputedStyle(root);
          const clip = [...css.clipPath.matchAll(/(-?[\d.]+)(?:%|px)/g)].map(match => Number(match[1]));
          return { x: Number(w.gsap.getProperty(box, 'x')), time: active?.time() ?? 0,
            pose: [Number(css.opacity), Number(w.gsap.getProperty(root, 'xPercent')), clip[1] ?? 0, clip[3] ?? clip[1] ?? 0] };
        };
        const swaps = () => Number(root.getAttribute('data-style-swaps') ?? 0);
        w.styledOutProbe = async operation => {
          if (operation === 'play') { await command('play'); active = null; }
          if (operation === 'stop') {
            if (authored) active = w.noacgDispatch('leave');
            else { await command('stop'); active = exit(); }
            if (!active) throw new Error('Public Stop did not start a styled exit');
            return { ...snapshot(), duration: active.duration() };
          }
          if (operation === 'repeat') {
            const before = snapshot();
            await command('stop');
            return { before, after: snapshot(), same: exit() === active };
          }
          if (operation === 'settle') {
            let callbacks = 0;
            active!.call(() => { callbacks++; }, null, .15);
            const before = swaps();
            active!.progress(1, true);
            active!.progress(1, true);
            return { callbacks, swaps: swaps() - before, opacity: snapshot().pose[0] };
          }
          return snapshot();
        };
      }, { target, authored });

      type Sample = { x: number; time: number; pose: number[] };
      type Operation = 'play' | 'stop' | 'repeat' | 'sample' | 'settle';
      function observe<T>(operation: Operation) {
        return output.evaluate(async operation =>
          (window as unknown as { styledOutProbe(operation: Operation): Promise<T> }).styledOutProbe(operation), operation);
      }
      const label = target + ' ' + style;
      const play = async () => {
        await observe('play');
        await output.clock.runFor(352);
        const sample = await observe<Sample>('sample');
        expect(Math.abs(sample.x - 60), label).toBeLessThan(4);
        return sample;
      };
      for (const repeated of [false, true]) {
        const live = await play();
        const out = await observe<Sample & { duration: number }>('stop');
        expect(out.x, label).toBe(live.x);
        expect(out.time, label).toBeCloseTo(0, 6);
        expect(out.duration, label).toBeCloseTo(.6, 6);
        let elapsed = 0;
        for (const at of [96, 192, 400, 496]) {
          await output.clock.runFor(at - elapsed);
          elapsed = at;
          const sample = await observe<Sample>('sample');
          expect(Math.abs(sample.time - at / 1000), label).toBeLessThan(.025);
          const leaving = sample.time < .3;
          const rest = leaving ? 1 - sample.time / .3 : (.6 - sample.time) / .3;
          if (style === 'fade') expect(sample.pose[0], label).toBeCloseTo(leaving ? rest : 0, 4);
          else if (style === 'push-left') expect(sample.pose[1], label).toBeCloseTo(leaving ? -120 * (1 - rest) : 120 * rest, 2);
          else expect(sample.pose[leaving ? 2 : 3], label).toBeCloseTo(100 * (leaving ? 1 - rest : rest), 2);
          if (repeated && (at === 96 || at === 400)) {
            const result = await observe<{ before: Sample; after: Sample; same: boolean }>('repeat');
            expect(result.same, label).toBe(true);
            expect(result.after, label).toEqual(result.before);
          }
        }
        await output.clock.runFor(640 - elapsed);
        expect((await observe<Sample>('sample')).pose, label).toEqual([0, 0, 0, 0]);
      }
      await play();
      await observe('stop');
      expect(await observe('settle'), label).toEqual({ callbacks: 0, swaps: 1, opacity: 0 });
    } finally { await context.close(); }
  }
}

async function verifyTimedOgraf(page: Page) {
  for (const [kind, repeat, wait] of [
    ['forever', -1, 2000], ['finite', 1, 2800], ['styled', 1, 2000], ['measured', 1, 3900],
  ] as const) {
    const data = fixture(), styled = kind === 'styled', measured = kind === 'measured';
    data.steps = styled ? [data.steps[0], data.steps[2]] : [data.steps[0]];
    data.steps[0].loops = { '#box': { x: { ...loop, repeat } } };
    if (measured) data.steps[0].dynamics = [{ time: 0, build: 'measureLoopEntrance' }];
    data.machine = { groups: [{
      id: 'main', initial: 'off', defaultPath: styled ? ['in', 'out'] : ['in'],
      states: (styled ? ['off', 'in', 'out'] : ['off', 'in']).map(id => ({ id })),
      transitions: styled ? [{ from: 'off', to: 'in', trigger: 'lifecycle', event: 'play', style: 'fade', duration: 1.3, ease: 'none' }]
        : [{ from: 'in', to: 'off', trigger: 'operator', event: 'quiet' }],
    }] };
    const input = await template(page, data, box, '700');
    if (measured) input.js += '\nfunction measureLoopEntrance() { var tl = gsap.timeline(); tl.to("#score", { y: 320, duration: 3.2, ease: "none" }); return tl; }';
    const artifact = await built(page, input, 'ograf', 'both');
    if (styled) {
      const [, encoded] = Object.entries(artifact.files!).find(([name]) => name.endsWith('.ograf.json'))!;
      const manifest = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      expect(manifest.actionDurations.find((entry: { type: string }) => entry.type === 'playAction').duration).toBe(2500);
    }
    for (const mode of ['realtime', 'non-realtime'] as const) {
      // Playwright pauses the entire browser context's clock, including its other frames.
      const context = await page.context().browser()!.newContext();
      const output = await context.newPage();
      try {
        if (mode === 'realtime') await output.clock.install();
        await loadExport(output, artifact, 'ograf', mode);
        if (mode === 'realtime') await output.clock.pauseAt(await output.evaluate(() => Date.now() + 100));
        await output.evaluate(async mode => {
          const el = document.querySelector('loop-graphic') as HTMLElement & {
            playAction(p: object): Promise<{ statusCode: number }>;
            setActionsSchedule(p: object): Promise<{ statusCode: number }>;
          };
          const result = mode === 'realtime' ? await el.playAction({}) : await el.setActionsSchedule({
            schedule: [{ timestamp: 0, action: { type: 'playAction', params: {} } }],
          });
          if (result.statusCode !== 200) throw new Error('OGraf could not begin timed Play: ' + result.statusCode);
        }, mode);

        const samples = [];
        let elapsed = 0;
        for (const at of [350, 600, 1400, 1700, wait - 40, wait + 40, wait + 1500]) {
          if (mode === 'realtime') await output.clock.runFor(at - elapsed);
          elapsed = at;
          samples.push(await output.evaluate(async ({ mode, at }) => {
            const el = document.querySelector('loop-graphic') as HTMLElement & {
              _step: number;
              goToTime(p: { timestamp: number }): Promise<{ statusCode: number }>;
            };
            let view = window, body: ParentNode = graphicBody(el);
            if (mode === 'non-realtime') {
              const result = await el.goToTime({ timestamp: at });
              if (result.statusCode !== 200) throw new Error('OGraf could not render timed Play: ' + result.statusCode);
              const frame = graphicBody(el).querySelector('iframe')!;
              view = frame.contentWindow!;
              body = frame.contentDocument!;
            }
            const gsap = (view as unknown as { gsap: { getProperty(e: Element, p: string): number } }).gsap;
            return {
              x: Number(gsap.getProperty(body.querySelector('#box')!, 'x')),
              opacity: Number(view.getComputedStyle(body.querySelector('.loop-fixture')!).opacity),
              step: mode === 'realtime' ? el._step : (view as Window & { __ografStep: number }).__ografStep,
            };
          }, { mode, at }));
        }
        const label = mode + ' ' + kind;
        if (styled) expect(samples[2].x, label).toBe(20);
        else {
          expect(samples[0].x, label).toBeGreaterThan(54);
          expect(samples[0].x, label).toBeLessThan(66);
          expect(samples[1].x, label).toBeGreaterThan(79);
          expect(samples[1].x, label).toBeLessThan(91);
          expect(samples.slice(0, 5).map(sample => sample.opacity), label).toEqual([1, 1, 1, 1, 1]);
        }
        if (repeat === -1) expect(samples[2].x - samples[3].x, label).toBeGreaterThan(20);
        expect(samples[4].opacity, label).toBe(1);
        expect([samples[4].step, samples[5].step], label).toEqual([0, -1]);
        expect(samples.at(-1)!.opacity, label).toBe(0);
      } finally { await context.close(); }
    }
  }
}
