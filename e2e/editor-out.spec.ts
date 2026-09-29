// covers: src/components/editorFoundation/**
// covers: src/blocks/{baseEdits,designLayout,artworkEdits,artworkLayers,svgIdentity,editorAnimation,editorOut,animData,animEdit}.ts
// covers: src/model/structure.ts, src/templates/shared/{animRuntime,easeRuntime}.ts
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx

import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';
import { mkdirSync } from 'node:fs';
import { dropSvg } from './_svg-import';
import { fileURLToPath } from 'node:url';

type Timeline = { pause(): void; kill(): void; time(t: number, silent?: boolean): void; progress(t: number, silent?: boolean): void; render(t: number, silent: boolean, force: boolean): void; duration(): number };
type Runtime = { buildInTimeline(): Timeline; buildOutTimeline(): Timeline; gsap: { globalTimeline: { clear(): void }; killTweensOf(s: string): void } };
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function ready(page: Page) { await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
}
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function data(page: Page) { return page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!); }
async function seek(page: Page, frames: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(frames / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < frames % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(frames / 25)); await ready(page);
}

async function fixture(page: Page, oneStep = false) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  // Ends on a store mutation, the evaluate that failed the nightly as a false navigation (#465).
  await evaluateInPage(page, async (oneStep: boolean) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const store = useTemplateStore.getState();
    store.applyTemplate({ ...store.template, fps: 25, fields: [], layers: [],
      html: '<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="fixture"><div id="box" data-gfx></div><div id="title" data-gfx>Text and box</div></div></body></html>',
      css: 'body{margin:0}.fixture{opacity:0}#box{position:absolute;left:500px;top:400px;width:320px;height:100px;background:#eeb844}#title{position:absolute;left:500px;top:420px;width:320px;height:100px;font:40px Arial;color:#111}',
      js: runtimeJs('Out fixture', emitAnimRegion({ version: 2, root: '.fixture', speed: 1, steps: [
        { name: 'In', duration: 2, ease: 'none', layers: Object.fromEntries(['#box', '#title'].map(s => [s, { x: [{ time: 0, value: -900 }, { time: 1, value: 0 }], opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }])) },
        ...(oneStep ? [] : [{ name: 'Out', duration: 1, ease: 'none', layers: Object.fromEntries(['#box', '#title'].map(s => [s, { x: [{ time: 0, value: 0 }, { time: 1, value: -900 }], opacity: [{ time: 0, value: 1 }, { time: 1, value: 0 }] }])) }]),
      ] })) + '\n// keep this user code',
    }, { resetSampleData: true });
  }, oneStep);
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect((await preview(page)).locator('#title')).toHaveText('Text and box');
}

test('permanent one-step Out offers Set Out at playhead', async ({ page }) => {
  await fixture(page, true);
  await expect(page.getByRole('button', { name: 'Set Out at playhead', exact: true })).toBeVisible();
});

test('Out at 40 percent starts from the live rendered pose', async ({ page }) => {
  await fixture(page);
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const result = await frame.evaluate(() => {
    const w = window as unknown as Runtime;
    w.gsap.globalTimeline.clear();
    const entrance = w.buildInTimeline(); entrance.pause(); entrance.time(entrance.duration() * .4, true);
    const pose = () => ['#box', '#title'].map(s => { const el = document.querySelector(s)!; return [el.getBoundingClientRect().x, Number(getComputedStyle(el).opacity)]; });
    const before = pose();
    entrance.kill(); w.gsap.killTweensOf('*');
    const exit = w.buildOutTimeline(); exit.pause(); exit.render(0, true, true);
    return { before, after: pose() };
  });
  for (let i = 0; i < 2; i++) {
    expect(Math.abs(result.before[i][0] - result.after[i][0])).toBeLessThan(1);
    expect(Math.abs(result.before[i][1] - result.after[i][1])).toBeLessThan(.01);
  }
});

test('one-step Out is an instant cut rather than another entrance', async ({ page }) => {
  await fixture(page, true);
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const duration = await frame.evaluate(() => {
    const w = window as unknown as Runtime;
    w.gsap.globalTimeline.clear(); const entrance = w.buildInTimeline(); entrance.progress(1, true); entrance.kill();
    const exit = w.buildOutTimeline(); exit.pause(); return exit.duration();
  });
  expect(duration).toBe(0);
});

for (const width of [1920, 1366, 1093]) test('Set Out reverse, cancel, history, hold and save/reopen ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1920 ? 1080 : width === 1366 ? 768 : 614 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page, true); const original = await source(page);
  await seek(page, 25);
  const canvas = await page.getByTestId('foundation-canvas').boundingBox();
  const button = page.getByRole('button', { name: 'Set Out at playhead', exact: true });
  await button.click(); const prompt = page.getByRole('dialog', { name: 'Reverse entrance' });
  await expect(prompt).toBeVisible(); await ready(page);
  const box = (await prompt.boundingBox())!, anchor = (await button.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(Math.abs(box.y + box.height - anchor.y)).toBeLessThan(16);
  expect(await page.getByTestId('foundation-canvas').boundingBox()).toEqual(canvas);
  mkdirSync('docs/research/editor-r1-1c/built', { recursive: true });
  await page.screenshot({ path: `docs/research/editor-r1-1c/built/choice-${width}.png` });
  await page.keyboard.press('Escape'); await expect(prompt).not.toBeVisible(); await expect(button).toBeFocused();
  const moved = await source(page); expect((await data(page)).steps).toHaveLength(2); expect((await data(page)).steps[0].duration).toBe(1);
  expect((await data(page)).steps[1].layers).toEqual({});
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(original.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(moved.js);
  await button.focus(); await page.keyboard.press('Enter'); await expect(prompt).toBeVisible();
  await page.getByRole('button', { name: 'Yes, reverse' }).click(); await ready(page);
  const reversed = await source(page), keys = await data(page);
  expect(keys.steps[1].layers['#box'].x.map(k => [k.time, k.value])).toEqual([[0, 0], [1, -900]]);
  expect(keys.steps[1].layers['#title'].opacity.map(k => [k.time, k.value])).toEqual([[0, 1], [1, 0]]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(moved.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(reversed.js);
  await seek(page, 0); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByTestId('foundation-clock')).toHaveText('1.00 s');
  const frame = await preview(page);
  await expect(frame.locator('.fixture')).toHaveCSS('opacity', '1');
  await frame.evaluate(() => new Promise<void>(resolve => { let n = 0; const tick = () => ++n < 30 ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }));
  await expect(page.getByTestId('foundation-clock')).toHaveText('1.00 s');
  mkdirSync('docs/research/editor-r1-1c/built', { recursive: true });
  await page.screenshot({ path: `docs/research/editor-r1-1c/built/out-${width}.png` });
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect(frame.locator('.fixture')).toHaveCSS('opacity', '0');
  expect((await source(page)).js).toBe(reversed.js);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Out text and box'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page);
  expect((await source(page)).js).toBe(saved.js);
  expect(errors).toEqual([]);
});

test('manual Out zero frame and extended end use numeric keys with one undo each', async ({ page }) => {
  await fixture(page, true); await seek(page, 25);
  await page.getByRole('button', { name: 'Set Out at playhead' }).click();
  await page.getByRole('button', { name: 'No, author manually' }).click(); await ready(page);
  expect((await data(page)).steps[1].layers).toEqual({});
  await page.locator('.ef-track[data-selector="#box"] .ef-layer').click(); await ready(page);
  await page.getByRole('button', { name: 'Add Position X key', exact: true }).click(); await ready(page);
  expect((await data(page)).steps[1].layers['#box'].x).toEqual([{ time: 0, value: 0 }]);
  const first = await source(page);
  const ruler = page.getByRole('slider', { name: 'Playhead' }); await ruler.focus();
  for (let n = 0; n < 2; n++) await ruler.press('Shift+ArrowRight');
  for (let n = 0; n < 5; n++) await ruler.press('ArrowRight');
  await ready(page);
  const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true });
  await input.fill('-400'); await input.press('Escape'); expect((await source(page)).js).toBe(first.js);
  await input.fill('-400'); await input.press('Enter'); await ready(page);
  expect((await data(page)).steps[1].layers['#box'].x.map(k => [k.time, k.value])).toEqual([[0, 0], [1, -900]]);
  const second = await source(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(first.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(second.js);
  expect((await data(page)).steps[0].layers['#box'].x).toEqual([{ time: 0, value: -900 }, { time: 1, value: 0 }]);
});

test('Out operations preserve clocks and refuse unsupported or stale batches atomically', async ({ page }) => {
  await fixture(page, true);
  const result = await page.evaluate(async () => {
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const original = useTemplateStore.getState().template;
    const refuses: string[] = [];
    const attempt = (template: typeof original, operations: Parameters<typeof applyOperations>[1]) => {
      const source = JSON.stringify(template);
      try { applyOperations(template, operations); return false; }
      catch (error) { refuses.push(String(error)); return source === JSON.stringify(template); }
    };
    const cases = [];
    for (const fps of [25, 30]) for (const speed of [.5, 1, 2]) {
      const d = parseAnimData(original.js)!; d.speed = speed;
      const t = { ...original, fps, js: emitAnimRegion(d) };
      const out = applyOperations(t, [{ kind: 'out.set', time: 1 / speed }]).template;
      const next = parseAnimData(out.js)!;
      cases.push({ fps, speed, duration: next.steps[0].duration, keys: next.steps[0].layers, same: JSON.stringify(d.steps[0].layers) === JSON.stringify(next.steps[0].layers) });
    }
    // Crossing the last In key splits each crossed segment, so one without an exact split refuses.
    const stepped = parseAnimData(original.js)!; stepped.steps[0].layers['#box'].x[1].ease = 'steps(4)';
    const invalid = [attempt({ ...original, js: emitAnimRegion(stepped) }, [{ kind: 'out.set', time: .4 }]), attempt(original, [{ kind: 'out.set', time: NaN }])];
    for (const variant of ['calls', 'spans', 'foreign', 'unknown', 'curve', 'tail']) {
      const d = parseAnimData(original.js)!;
      if (variant === 'calls') d.steps[0].calls = [{ time: .1, call: 'keepCall' }];
      // Hidden at the new hold but shown after it: Out never reveals a hidden layer.
      if (variant === 'spans') d.steps[0].spans = { '#box': [{ start: 1.5, end: 2 }] };
      if (variant === 'curve') d.steps[0].ease = 'customEase';
      let js = emitAnimRegion(d);
      if (variant === 'tail') {
        const { ANIM_INTERPRETER_JS } = await import('/src/templates/shared/animRuntime.ts');
        const { ANIM_INTERPRETER_PRE_OUT_JS } = await import('/src/templates/shared/animRuntimeLegacy.ts');
        js = js.replace(ANIM_INTERPRETER_JS, ANIM_INTERPRETER_PRE_OUT_JS + '\nwindow.customTail = true;');
      }
      if (variant === 'foreign') js = js.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 7;');
      if (variant === 'unknown') js = js.replace('"version": 2', '"extra": true, "version": 2');
      invalid.push(attempt({ ...original, js }, [{ kind: 'out.set', time: 1 }, ...(variant === 'curve' ? [{ kind: 'out.reverse' as const }] : [])]));
    }
    const session = activeEditorSession(), before = session.port.read(), expected = session.version();
    session.execute({ documentId: session.documentId, expected, transactionId: 'move-out', operations: [{ kind: 'out.set', time: 1 }] });
    const after = session.port.read();
    let stale = false;
    try { session.execute({ documentId: session.documentId, expected, transactionId: 'stale-reverse', operations: [{ kind: 'out.reverse' }] }); }
    catch { stale = session.port.read() === after; }
    session.undo(); const undo = session.port.read().js === before.js && !session.canUndo();
    session.redo(); const redo = session.port.read().js === after.js;
    return { cases, invalid, refuses, stale, undo, redo };
  });
  for (const item of result.cases) { expect(item.duration).toBeCloseTo(Math.round(item.fps / item.speed) / item.fps * item.speed); expect(item.same).toBe(true); }
  expect(result.invalid).toEqual(Array(8).fill(true)); expect(result.stale && result.undo && result.redo).toBe(true);
});

test('saved one-step interpreter upgrades once and preserves foreign source', async ({ page }) => {
  await fixture(page, true);
  await page.evaluate(async () => {
    const { ANIM_INTERPRETER_JS } = await import('/src/templates/shared/animRuntime.ts');
    const { ANIM_INTERPRETER_PRE_OUT_JS } = await import('/src/templates/shared/animRuntimeLegacy.ts');
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    store.applyTemplate({ ...store.template, js: store.template.js.replace(ANIM_INTERPRETER_JS, ANIM_INTERPRETER_PRE_OUT_JS) });
  });
  await ready(page); const original = await source(page);
  expect((await data(page)).steps).toHaveLength(1);
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '0');
  expect((await source(page)).js).toBe(original.js);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Legacy single In'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); expect(saved.js).toContain('live-pose-out-v1'); expect(saved.js).toContain('// keep this user code'); expect(saved.html).toBe(original.html);
  expect((await data(page)).steps[1]).toEqual({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  await page.reload(); await ready(page); expect((await source(page)).js).toBe(saved.js);
  const same = await page.evaluate(async () => { const { saveCurrentGraphic } = await import('/src/store/saveActions.ts'); await saveCurrentGraphic(); return (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js; });
  expect(same).toBe(saved.js);
  const foreign = await page.evaluate(async js => {
    const { prepareOutRuntime } = await import('/src/blocks/animMigration.ts');
    const custom = js.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 7;');
    const unknown = js.replace('"version": 2', '"extra": true, "version": 2');
    return prepareOutRuntime(custom) === custom && prepareOutRuntime(unknown) === unknown;
  }, original.js);
  expect(foreign).toBe(true);
});

/** The editor's current template loaded as `target` plays it: simulator document or served package. */
async function executable(page: Page, target: string) {
  const output = await page.context().newPage();
  if (target === 'simulator') {
    const html = await page.evaluate(async () => {
      const template = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      return (await import('/src/preview/composeDocument.ts')).composeDocument(template, { simulate: true });
    });
    await output.setContent(html);
  } else {
    const files = await page.evaluate(async target => {
      const template = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(template);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    await output.route('http://out-package.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await output.goto('http://out-package.local/');
      await output.evaluate(async () => {
        const mod = await import('http://out-package.local/graphic.mjs'); customElements.define('out-graphic', mod.default);
        const element = document.createElement('out-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      });
    } else await output.goto('http://out-package.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  }
  return output;
}

for (const target of ['simulator', 'spx', 'casparcg', 'ograf']) test('40 percent interruption, repeat and replay in executable ' + target, async ({ page }) => {
  await fixture(page);
  const output = await executable(page, target);
  const result = await output.evaluate(async target => {
    type Host = Runtime & { play(): void; stop(): void; __activeTl?: { tl: Timeline }; gsap: Runtime['gsap'] & { globalTimeline: { clear(): void; getChildren(n: boolean, t: boolean, tl: boolean): Timeline[] } } };
    const w = window as unknown as Host;
    const element = document.querySelector('out-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
    const command = async (action: 'play' | 'stop') => {
      if (target === 'simulator') window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-' + action, data: '{}' } }));
      else if (target === 'ograf') { if (action === 'play') await element.playAction({}); else await element.stopAction({}); }
      else w[action]();
    };
    const pose = () => ['#box', '#title'].map(s => { const el = document.querySelector(s)!; return [el.getBoundingClientRect().x - document.querySelector('.fixture')!.getBoundingClientRect().x, Number(getComputedStyle(el).opacity)]; });
    const timeline = (duration: number) => w.gsap.globalTimeline.getChildren(false, false, true).find(t => Math.abs(t.duration() - duration) < .0001)!;
    await command('play'); const entrance = timeline(2); entrance.pause(); entrance.time(.8, true);
    const before = pose(); await command('stop'); const after = pose();
    const exit = timeline(1); exit.pause(); exit.time(.25, true); const quarter = pose();
    await command('stop'); const repeated = pose();
    exit.time(1, true); const final = pose(), hidden = getComputedStyle(document.querySelector('.fixture')!).opacity;
    await command('play'); const replay = pose();
    const second = timeline(2); second.pause(); second.progress(1, true); await command('stop');
    const normal = timeline(1); normal.pause(); normal.time(.5, true); const normalMid = pose();
    return { before, after, quarter, repeated, final, hidden, replay, normalMid };
  }, target);
  for (let i = 0; i < 2; i++) {
    expect(Math.abs(result.before[i][0] - result.after[i][0]), target).toBeLessThan(1);
    expect(Math.abs(result.before[i][1] - result.after[i][1]), target).toBeLessThan(.01);
    expect(result.quarter[i][0]).toBeCloseTo(140, 1); expect(result.quarter[i][1]).toBeCloseTo(.6, 2);
    expect(result.repeated[i]).toEqual(result.quarter[i]);
    expect(result.final[i]).toEqual([-400, 0]); expect(result.replay[i]).toEqual([-400, 0]);
    expect(result.normalMid[i][0]).toBeCloseTo(50, 1); expect(result.normalMid[i][1]).toBeCloseTo(.5, 2);
  }
  expect(result.hidden).toBe('0'); await output.close();
});

for (const target of ['simulator', 'spx', 'casparcg', 'ograf']) test('Out interrupting an In shortened across its keys starts from the live pose in ' + target, async ({ page }) => {
  await fixture(page, true);
  // The keys end at 1 s. Out at 0.6 s moves the rest of the entrance into a 1.4 s exit.
  await evaluateInPage(page, async () => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    store.applyTemplate((await import('/src/blocks/editorOut.ts')).applyOut(store.template, { kind: 'out.set', time: .6 }));
  });
  const output = await executable(page, target);
  const result = await output.evaluate(async target => {
    type Host = Runtime & { play(): void; stop(): void; gsap: Runtime['gsap'] & { globalTimeline: { getChildren(n: boolean, t: boolean, tl: boolean): Timeline[] } } };
    const w = window as unknown as Host;
    const element = document.querySelector('out-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
    const command = async (action: 'play' | 'stop') => {
      if (target === 'simulator') window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-' + action, data: '{}' } }));
      else if (target === 'ograf') { if (action === 'play') await element.playAction({}); else await element.stopAction({}); }
      else w[action]();
    };
    const pose = () => ['#box', '#title'].map(s => { const el = document.querySelector(s)!; return [el.getBoundingClientRect().x - document.querySelector('.fixture')!.getBoundingClientRect().x, Number(getComputedStyle(el).opacity)]; });
    const timeline = (duration: number) => w.gsap.globalTimeline.getChildren(false, false, true).find(t => Math.abs(t.duration() - duration) < .0001)!;
    await command('play'); const entrance = timeline(.6); entrance.pause(); entrance.time(.24, true);
    const before = pose(); await command('stop'); const after = pose();
    const exit = timeline(1.4); exit.pause(); exit.time(.2, true); const middle = pose();
    exit.time(1.4, true);
    return { before, after, middle, hidden: getComputedStyle(document.querySelector('.fixture')!).opacity };
  }, target);
  for (let i = 0; i < 2; i++) {
    expect(Math.abs(result.before[i][0] - result.after[i][0]), target).toBeLessThan(1);
    expect(Math.abs(result.before[i][1] - result.after[i][1]), target).toBeLessThan(.01);
    // Interrupted, each track tweens from its live value to the exit's last key: the entrance's end.
    expect(result.middle[i][0]).toBeCloseTo(158, 1); expect(result.middle[i][1]).toBeCloseTo(.62, 2);
  }
  expect(result.hidden).toBe('0'); await output.close();
});

test('reverse mirrors destination eases and independent entrance keys', async ({ page }) => {
  await fixture(page, true);
  const result = await page.evaluate(async () => {
    const { applyOut } = await import('/src/blocks/editorOut.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const d = parseAnimData(t.js)!;
    d.steps[0].duration = 1;
    d.steps[0].layers['#box'].x = [{ time: .2, value: -900 }, { time: .5, value: -500, ease: 'power2.out' }, { time: 1, value: 0, ease: 'sine.in' }];
    const reverse = parseAnimData(applyOut({ ...t, js: emitAnimRegion(d) }, { kind: 'out.reverse' }).js)!;
    return { keys: reverse.steps[1].layers['#box'].x, original: reverse.steps[0].layers['#box'].x };
  });
  expect(result.keys).toEqual([{ time: 0, value: 0 }, { time: .5, value: -500, ease: 'sine.out' }, { time: .8, value: -900, ease: 'power2.in' }]);
  expect(result.original[1].ease).toBe('power2.out');
});

test('editor Out restarts its playback clock during In', async ({ page }) => {
  await page.clock.install(); await fixture(page); await ready(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(800);
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await page.clock.runFor(200);
  const time = Number(await page.getByRole('slider', { name: 'Playhead' }).getAttribute('aria-valuenow'));
  expect(time).toBeGreaterThan(2.1); expect(time).toBeLessThan(2.3);
  await page.clock.runFor(1100);
  await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '0');
});

test('exit timing preserves leading delay, bypasses waypoints and never reveals unseen layers', async ({ page }) => {
  await fixture(page);
  const result = await (await preview(page)).evaluate(() => {
    const w = window as unknown as Runtime & { NOACG_ANIM: { steps: Array<{ duration: number; ease: string; layers: Record<string, Record<string, Array<{time: number; value: number}>>>; spans?: Record<string, Array<{start: number; end: number}>> }> } };
    w.gsap.globalTimeline.clear();
    w.NOACG_ANIM.steps[0].spans = { '#title': [] };
    w.NOACG_ANIM.steps[1].spans = { '#title': [{start: 0, end: 1}], '#box': [{start: 0, end: .8}] };
    w.NOACG_ANIM.steps[1].layers['#box'].x = [{time: .2, value: 0}, {time: .5, value: 800}, {time: 1, value: -900}];
    const pose = () => ({ x: document.querySelector('#box')!.getBoundingClientRect().x, hidden: getComputedStyle(document.querySelector('#title')!).visibility });
    const entry = w.buildInTimeline(); entry.pause(); entry.time(.8, true);
    const before = pose(); const exit = w.buildOutTimeline(); exit.pause(); exit.time(.1, true); const delay = pose(); exit.time(.6, true); const middle = pose();
    w.buildInTimeline().progress(1, true); const normal = w.buildOutTimeline(); normal.pause(); normal.time(.1, true); const unseen = pose();
    w.gsap.killTweensOf('*'); w.buildOutTimeline(); normal.time(.9, true);
    return { before, delay, middle, unseen, gate: getComputedStyle(document.querySelector('#box')!).visibility };
  });
  expect(result.delay).toEqual(result.before); expect(result.middle.x).toBeCloseTo(-40, 1);
  expect(result.unseen.hidden).toBe('hidden'); expect(result.gate).toBe('hidden');
});

test('author the text and box entrance with controls and drag, then hold and reverse Out', async ({ page }) => {
  await fixture(page, true);
  await page.evaluate(async () => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { writeOutData } = await import('/src/templates/shared/animRuntime.ts');
    const d = parseAnimData(store.template.js)!; d.steps[0].layers = {};
    store.applyTemplate({ ...store.template, js: writeOutData(store.template.js, d)! });
  }); await ready(page); await seek(page, 0);
  const number = async (label: string, value: string) => { const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: label, exact: true }); await input.fill(value); await input.press('Enter'); await ready(page); };
  for (const selector of ['#box', '#title']) {
    await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).click(); await ready(page);
    await number('Position X', '-400');
    for (const property of ['Position X', 'Opacity']) { await page.getByRole('button', { name: 'Enable ' + property + ' animation', exact: true }).click(); await ready(page); }
    const opacity = page.getByRole('spinbutton', { name: 'Opacity %', exact: true }); await opacity.fill('0'); await opacity.press('Enter'); await ready(page);
  }
  await seek(page, 25); await page.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('0.5');
  for (const selector of ['#box', '#title']) {
    await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).click(); await ready(page);
    const bounds = (await page.locator('.ef-selection rect').boundingBox())!, scale = (await page.locator('.ef-artboard').boundingBox())!.width / 1920;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 900 * scale, bounds.y + bounds.height / 2, { steps: 12 }); await page.mouse.up(); await ready(page);
    const opacity = page.getByRole('spinbutton', { name: 'Opacity %', exact: true }); await opacity.fill('100'); await opacity.press('Enter'); await ready(page);
    expect((await data(page)).steps[0].layers[selector].x).toHaveLength(2);
    expect((await data(page)).steps[0].layers[selector].opacity).toEqual([{time: 0, value: 0}, {time: 1, value: 1}]);
  }
  await page.getByRole('button', { name: 'Set Out at playhead' }).click(); await page.getByRole('button', { name: 'Yes, reverse' }).click(); await ready(page);
  const authored = await source(page);
  await seek(page, 0); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible(); await ready(page);
  await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Out', exact: true }).click(); await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '0');
  expect((await source(page)).js).toBe(authored.js);
});

for (const manual of [false, true]) test('wizard text-and-box through ' + (manual ? 'manual' : 'reverse') + ' Out without source replacement', async ({ page }) => {
  await page.goto('/app#/new');
  await dropSvg(page, fileURLToPath(new URL('./fixtures/out-text-box.svg', import.meta.url)));
  await page.locator('.wz-next').click(); await page.getByRole('button', { name: /^Fade Dissolves/ }).click();
  await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  const original = await source(page), d = await data(page), fps = original.fps;
  const selectors = await page.evaluate(async () => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const doc = new DOMParser().parseFromString(t.html, 'text/html');
    return ['#box', '#' + Array.from(doc.querySelectorAll('svg text')).find(el => el.textContent?.trim() === 'Evening report')!.id];
  });
  const select = async (selector: string) => { await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).click(); await ready(page); };
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const advance = async (frames: number) => { await ruler.focus(); for (let i = 0; i < frames; i++) await ruler.press('ArrowRight'); await ready(page); };
  const number = async (value: string) => { const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true }); await input.fill(value); await input.press('Enter'); await ready(page); };
  const opacity = async (value: string) => { const input = page.getByRole('spinbutton', { name: 'Opacity %', exact: true }); await input.fill(value); await input.press('Enter'); await ready(page); };
  // Clear the preset track using the ordinary animation toggle, then author both objects.
  for (const target of Object.keys(d.steps[1].layers)) {
    await select(target);
    await page.getByRole('button', { name: 'Disable Opacity animation', exact: true }).click(); await ready(page); await opacity('100');
  }
  await ruler.focus(); await ruler.press('Home'); await advance(fps);
  await page.getByRole('button', { name: 'Set Out at playhead' }).click(); await page.keyboard.press('Escape');
  await ruler.focus(); await ruler.press('Home'); await ready(page);
  for (const selector of selectors) {
    await select(selector); await number(selector === '#box' ? '-1200' : '-700');
    for (const name of selector === '#box' ? ['Position X'] : ['Position X', 'Opacity']) { await page.getByRole('button', { name: 'Enable ' + name + ' animation', exact: true }).click(); await ready(page); }
    if (selector !== '#box') await opacity('0');
  }
  await advance(fps);
  for (const selector of selectors) { await select(selector); await number(selector === '#box' ? '0' : '530'); if (selector !== '#box') await opacity('100'); }
  await page.getByRole('button', { name: 'Set Out at playhead' }).click();
  await page.getByRole('button', { name: manual ? 'No, author manually' : 'Yes, reverse' }).click(); await ready(page);
  if (manual) {
    for (const selector of selectors) { await select(selector); for (const name of selector === '#box' ? ['Position X'] : ['Position X', 'Opacity']) { await page.getByRole('button', { name: 'Add ' + name + ' key', exact: true }).click(); await ready(page); } }
    await advance(fps);
    for (const selector of selectors) { await select(selector); await number(selector === '#box' ? '-1200' : '-700'); if (selector !== '#box') await opacity('0'); }
  }
  await ruler.focus(); await ruler.press('Home'); await ready(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible(); await ready(page);
  const root = (await data(page)).root;
  await expect((await preview(page)).locator(root)).toHaveCSS('opacity', '1');
  mkdirSync('docs/research/editor-r1-1c/built', { recursive: true });
  await page.screenshot({ path: `docs/research/editor-r1-1c/built/wizard-${manual ? 'manual' : 'reverse'}.png` });
  const held = await (await preview(page)).evaluate(selectors => selectors.map(s => { const el = document.querySelector(s)!; return [el.getBoundingClientRect().x, Number(getComputedStyle(el).opacity)]; }), selectors);
  const html = await page.evaluate(async () => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(t);
  });
  const output = await page.context().newPage(); await output.setViewportSize({width: 1920, height: 1080}); await output.setContent(html);
  const exported = await output.evaluate(({selectors, root}) => {
    const w = window as unknown as Runtime;
    const entry = w.buildInTimeline(); entry.pause(); entry.progress(1, true);
    const held = selectors.map(s => { const el = document.querySelector(s)!; return [el.getBoundingClientRect().x, Number(getComputedStyle(el).opacity)]; });
    const exit = w.buildOutTimeline(); exit.pause(); exit.progress(1, true);
    return { held, hidden: getComputedStyle(document.querySelector(root)!).opacity };
  }, {selectors, root});
  for (let i = 0; i < selectors.length; i++) { expect(exported.held[i][0]).toBeCloseTo(held[i][0], 0); expect(exported.held[i][1]).toBeCloseTo(held[i][1], 2); }
  expect(exported.hidden).toBe('0'); await output.close();
  await page.getByRole('button', { name: 'Out', exact: true }).click(); await expect((await preview(page)).locator(root)).toHaveCSS('opacity', '0');
  const authored = await source(page);
  expect(authored.fields).toEqual(original.fields);
  const retained = await page.evaluate(({before, after, selectors}) => {
    const shape = (html: string) => { const doc = new DOMParser().parseFromString(html, 'text/html'); return selectors.map(s => { const el = doc.querySelector(s)!; return [el.tagName, el.textContent, ...['width', 'height', 'fill', 'font-size'].map(a => el.getAttribute(a))]; }); };
    return JSON.stringify(shape(before)) === JSON.stringify(shape(after));
  }, {before: original.html, after: authored.html, selectors});
  expect(retained).toBe(true);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Wizard text and box Out'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); const saved = await source(page);
  await page.reload(); await ready(page); expect((await source(page)).js).toBe(saved.js);
});

test('Set Out snaps an off-grid playhead and keeps its arriving held side', async ({ page }) => {
  await fixture(page, true);
  const ruler = page.getByRole('slider', { name: 'Playhead' }), bounds = (await ruler.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 1.013 / 2.3, bounds.y + 12); await ready(page);
  await page.getByRole('button', { name: 'Set Out at playhead' }).click();
  await expect(page.getByRole('dialog', { name: 'Reverse entrance' })).toBeVisible();
  await expect(page.getByTestId('foundation-clock')).toHaveText('1.00 s');
  await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  await expect(page.getByTestId('foundation-clock')).toHaveText('1.01 s');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  await expect(page.getByTestId('foundation-clock')).toHaveText('1.00 s');
  await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '1');
});

test('Set Out before the last In key moves the rest of the entrance into Out as one undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page, true); const original = await source(page);
  await seek(page, 10);
  const button = page.getByRole('button', { name: 'Set Out at playhead', exact: true });
  await button.click(); await ready(page);
  await expect(page.locator('.ef-out-error')).toHaveCount(0);
  // The exit now has keys, so there is nothing to reverse or author: no prompt.
  await expect(page.getByRole('dialog', { name: 'Reverse entrance' })).toBeHidden();
  const moved = await source(page), d = await data(page);
  expect(d.steps.map(step => step.duration)).toEqual([.4, 1.6]);
  for (const selector of ['#box', '#title']) {
    expect(d.steps[0].layers[selector]).toEqual({ x: [{ time: 0, value: -900 }, { time: .4, value: -540, ease: 'none' }], opacity: [{ time: 0, value: 0 }, { time: .4, value: .4, ease: 'none' }] });
    expect(d.steps[1].layers[selector]).toEqual({ x: [{ time: 0, value: -540 }, { time: .6, value: 0, ease: 'none' }], opacity: [{ time: 0, value: .4 }, { time: .6, value: 1, ease: 'none' }] });
  }
  await expect(page.getByRole('slider', { name: 'Playhead' })).toHaveAttribute('aria-valuenow', '0.4');
  await page.keyboard.press('Escape'); expect((await source(page)).js).toBe(moved.js);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(original.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(moved.js);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Out across the entrance'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); expect((await data(page)).steps).toEqual(d.steps);
  await page.reload(); await ready(page); expect((await source(page)).js).toBe(saved.js);
  const again = await page.evaluate(async () => { const { saveCurrentGraphic } = await import('/src/store/saveActions.ts'); await saveCurrentGraphic(); return (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js; });
  expect(again).toBe(saved.js);
  expect(errors).toEqual([]);
});

test('a Set Out that fills the exit closes a reverse choice left open', async ({ page }) => {
  await fixture(page, true); await seek(page, 25);
  const button = page.getByRole('button', { name: 'Set Out at playhead', exact: true }), prompt = page.getByRole('dialog', { name: 'Reverse entrance' });
  await button.click(); await expect(prompt).toBeVisible(); await ready(page);
  // With the choice still open, step the playhead back into the entrance and set Out there.
  for (let n = 0; n < 15; n++) await page.getByRole('button', { name: 'Previous frame', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Playhead' })).toHaveAttribute('aria-valuenow', '0.4');
  await expect(prompt).toBeVisible();
  await button.click(); await expect(prompt).toBeHidden(); await ready(page);
  expect((await data(page)).steps[1].layers['#box'].x.map(k => k.time)).toEqual([0, .6]);
});

test('a Set Out that cannot split a crossed segment keeps source and history and says why', async ({ page }) => {
  await fixture(page, true);
  await evaluateInPage(page, async () => {
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const d = parseAnimData(store.template.js)!; d.steps[0].layers['#title'].x[1].ease = 'steps(4)';
    store.applyTemplate({ ...store.template, js: spliceAnimData(store.template.js, d)! });
  });
  await ready(page); await seek(page, 10);
  const state = () => page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); return { js: s.template.js, history: s.history.length, future: s.future.length }; });
  const before = await state();
  await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click();
  await expect(page.locator('.ef-out-error')).toContainText('steps(4)');
  await expect(page.getByRole('dialog', { name: 'Reverse entrance' })).toBeHidden();
  expect(await state()).toEqual(before);
});

test('Set Out inside a Next cue refuses until Step/Next editing, keeping source and history', async ({ page }) => {
  // Out pressed before that cue would play whatever moved into Out (docs/research/editor-r1-2a-2).
  await fixture(page, true);
  await evaluateInPage(page, async () => {
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const d = parseAnimData(store.template.js)!; d.steps[0].duration = 1;
    d.steps.push({ name: 'Step 2', duration: 1, ease: 'none', layers: { '#box': { rotation: [{ time: 0, value: 0 }, { time: .8, value: 90 }] } } },
      { name: 'Out', duration: 0, ease: 'none', layers: {} });
    store.applyTemplate({ ...store.template, js: spliceAnimData(store.template.js, d)! });
  });
  await ready(page); await seek(page, 35);
  const state = () => page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); return { js: s.template.js, history: s.history.length, future: s.future.length }; });
  const before = await state();
  await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click();
  await expect(page.locator('.ef-out-error')).toContainText('Next cue');
  await expect(page.getByRole('dialog', { name: 'Reverse entrance' })).toBeHidden();
  expect(await state()).toEqual(before);
});

test('pause and resume an interrupted Out retain its live exit trajectory', async ({ page }) => {
  await page.clock.install(); await fixture(page); await ready(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.clock.runFor(800);
  await page.getByRole('button', { name: 'Out', exact: true }).click(); await page.clock.runFor(250);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.runFor(32);
  const frame = await preview(page), pose = () => frame.locator('#box').evaluate(el => [el.getBoundingClientRect().x, Number(getComputedStyle(el).opacity)]);
  const before = await pose();
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.clock.runFor(32);
  const after = await pose();
  expect(Math.abs(after[0] - before[0])).toBeLessThan(40); expect(Math.abs(after[1] - before[1])).toBeLessThan(.05);
  await page.clock.runFor(1200); await expect(frame.locator('.fixture')).toHaveCSS('opacity', '0');
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.clock.runFor(2100);
  await expect(frame.locator('.fixture')).toHaveCSS('opacity', '1');
});

test('known two-cue predecessor plays Out read-only without source mutation', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const { ANIM_INTERPRETER_JS } = await import('/src/templates/shared/animRuntime.ts');
    const { ANIM_INTERPRETER_PRE_OUT_JS } = await import('/src/templates/shared/animRuntimeLegacy.ts');
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    store.applyTemplate({ ...store.template, js: store.template.js.replace(ANIM_INTERPRETER_JS, ANIM_INTERPRETER_PRE_OUT_JS) });
  }); await ready(page);
  const before = await source(page);
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect((await preview(page)).locator('.fixture')).toHaveCSS('opacity', '0');
  expect((await source(page)).js).toBe(before.js);
});

test('empty Out immediately clears a visible static layer outside the root', async ({ page }) => {
  await fixture(page);
  const result = await (await preview(page)).evaluate(() => {
    const w = window as unknown as Runtime & { revealNextStep(): Timeline; NOACG_ANIM: {steps: Array<{name: string; duration: number; ease: string; layers: Record<string, Record<string, Array<{time: number; value: number}>>>; reveals?: string[]}>} };
    const outside = document.createElement('div'); outside.id = 'outside'; outside.textContent = 'Visible extra'; document.body.appendChild(outside);
    w.NOACG_ANIM.steps.splice(1, 0, {name: 'Reveal', duration: .4, ease: 'none', reveals: ['#outside'], layers: {'#outside': {opacity: [{time: 0, value: 0}, {time: .4, value: 1}]}}});
    w.NOACG_ANIM.steps[2] = {name: 'Out', duration: 0, ease: 'none', layers: {}};
    w.gsap.globalTimeline.clear(); const entry = w.buildInTimeline(); entry.pause(); entry.progress(1, true);
    const next = w.revealNextStep(); next.pause(); next.progress(1, true);
    const before = getComputedStyle(outside).opacity;
    const exit = w.buildOutTimeline(); exit.pause(); exit.render(0, true, true);
    return {before, duration: exit.duration(), after: getComputedStyle(outside).opacity, root: getComputedStyle(document.querySelector('.fixture')!).opacity};
  });
  expect(result).toEqual({before: '1', duration: 0, after: '0', root: '0'});
});
