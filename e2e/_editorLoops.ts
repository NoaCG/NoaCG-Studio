import { readFileSync } from 'node:fs';
import { expect, type Page, type Locator, type TestInfo } from '@playwright/test';
import type { AnimData } from '../src/blocks/animData';
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
    const settings = { ...store.template.settings, steps: '2', out };
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
  const input = await template(page, fixture());
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
  expect((await anim(page)).steps.map(step => step.layers)).toEqual(fixture().steps.map(step => step.layers));
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

async function built(page: Page, t: SpxTemplate, target: string) {
  return page.evaluate(async ({ t, target }) => {
    if (target === 'simulator') return { html: (await import('/src/preview/composeDocument.ts')).composeDocument(t, { simulate: true }) };
    if (target === 'single-file') return { html: await (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(t) };
    const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(entry => entry.id === target)!.build(t);
    return { files: Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(name => !zip.files[name].dir).map(async name =>
      [name.slice(name.indexOf('/') + 1), await zip.file(name)!.async('base64')]))) as Record<string, string> };
  }, { t, target });
}

async function loadExport(output: Page, artifact: Awaited<ReturnType<typeof built>>, target: string) {
  if (artifact.html) { await output.setContent(artifact.html); return; }
  const files = artifact.files!;
  await output.route('http://loop-package.local/**', route => {
    const path = new URL(route.request().url()).pathname.slice(1);
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
  await output.evaluate(async () => {
    const mod = await import('http://loop-package.local/graphic.mjs');
    customElements.define('loop-graphic', mod.default);
    const el = document.createElement('loop-graphic') as HTMLElement & { load(params: unknown): Promise<void> };
    document.body.appendChild(el);
    await el.load({ data: { f0: '0' }, renderType: 'realtime', renderCharacteristics: {} });
  });
}

type Timeline = { time(t?: number, suppress?: boolean): number; pause(): Timeline; duration(): number;
  __noacgLoops?: Array<{ animation: { timeScale(value: number): void } }> };

export async function playLoopOutputs(page: Page) {
  await open(page);
  const data = fixture();
  data.steps[0].loops = { '#box': { x: loop, opacity: loop } };
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
        const afterNext = snapshot()[0];
        await command('stop');
        const releasedAfterNext = snapshot();
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
        return { sequence, afterScale, faster, score, afterNext, releasedAfterNext, held, released, midpoint, sameOut, hidden, late, snaps };
      }, target);
      expect(errors, target).toEqual([]);
      expect(samples, target).toEqual({
        sequence: [[60, .75, 35], [60, .75, 130], [20, .5, 130], [20, .5, 5], [60, .75, 35]],
        afterScale: [60, .75, 35], faster: [70, .813, 40], score: '7', afterNext: 70, releasedAfterNext: [70, .813, 130],
        held: [60, .75, 35], released: [60, .75, 35], midpoint: [-20, .375, 35],
        sameOut: true, hidden: 0, late: 0, snaps: [[90, 1, 130], [90, 1, 130]],
      });
    } finally { await output.close(); }
  }
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
}
