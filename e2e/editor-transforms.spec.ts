// covers: src/blocks/{editorAnimation,animEdit,editorOut,editorSteps,animEval,animData,baseEdits}.ts, src/components/editorFoundation/**
// covers: src/templates/catalog.ts, src/templates/shared/animRuntime.ts, src/model/structure.ts
//
// R1.2a.6 full transforms (docs/research/editor-r1-2a-6): the editor edits the transform and
// visibility channels catalog designs animate instead of refusing them. Each control reads the
// runtime's own track (yPercent, scale, autoAlpha, or a layer's motion stored under another selector
// naming the same element) and writes it back in the runtime's units, as one undo; the refusals
// left are the channels that cannot be written exactly. scripts/full-transforms.test.mjs checks the
// adapter and owner rules densely in Node.

import { test, expect, type Page } from '@playwright/test';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';

type Key = { time: number; value: number | string; ease?: string };
type Step = { name: string; duration: number; ease: string; layers: Record<string, Record<string, Key[]>>; spans?: Record<string, { start: number; end: number }[]>; reveals?: string[] };
type Data = { version: number; root: string; speed: number; steps: Step[] };
type Template = { js: string; html: string; css: string; fps: number; settings: Record<string, string> };

async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}
async function catalog(page: Page, id: string): Promise<Template> {
  return page.evaluate(async id => (await import('/src/templates/catalog.ts')).variantById(id)!.create({}), id) as unknown as Promise<Template>;
}
/** The registry's result for a batch, or its refusal. */
async function attempt(page: Page, t: Template, operations: unknown[]): Promise<{ template?: Template; error?: string }> {
  return page.evaluate(async ({ t, operations }) => {
    try { return { template: (await import('/src/components/editorFoundation/operations.ts')).applyOperations(t as never, operations as never).template as never }; }
    catch (error) { return { error: String((error as Error).message ?? error) }; }
  }, { t, operations });
}
async function operate(page: Page, t: Template, operations: unknown[]): Promise<Template> {
  const result = await attempt(page, t, operations);
  if (result.error !== undefined) throw new Error(result.error);
  return result.template!;
}
async function dataOf(page: Page, js: string): Promise<Data> {
  return page.evaluate(async js => (await import('/src/blocks/animData.ts')).parseAnimData(js), js) as Promise<Data>;
}
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template) as Promise<Template>; }
async function history(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().history.length); }
async function data(page: Page) { return dataOf(page, (await source(page)).js); }
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
}
async function editorWith(page: Page, t: Template) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true });
  }, t);
  await ready(page);
}
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function seekFrames(page: Page, frames: number, fps: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(frames / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < frames % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(frames / fps)); await ready(page);
}
async function select(page: Page, selector: string) { await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).click(); await ready(page); }
const undo = async (page: Page) => { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); };
const redo = async (page: Page) => { await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); };
async function field(page: Page, label: string) { return page.locator('.ef-animation-properties').getByRole('textbox', { name: label, exact: true }); }
async function type(page: Page, label: string, value: number) {
  const input = await field(page, label);
  await input.fill(String(value)); await input.press('Enter');
}
/** The layer as the preview renders it: its rect, and GSAP's own channel values and percent box. */
async function rendered(page: Page, selector: string) {
  return (await preview(page)).locator(selector).evaluate(el => {
    const gsap = (window as unknown as { gsap: { getProperty(e: Element, p: string): number } }).gsap, r = el.getBoundingClientRect(), style = getComputedStyle(el);
    const edge = (side: string) => parseFloat(style.getPropertyValue('padding-' + side)) + parseFloat(style.getPropertyValue('border-' + side + '-width'));
    const height = parseFloat(style.height) + (style.boxSizing === 'border-box' ? 0 : edge('top') + edge('bottom'));
    return { x: r.x, y: r.y, width: r.width, height: r.height, box: height, yPercent: gsap.getProperty(el, 'yPercent'), y0: gsap.getProperty(el, 'y'),
      scaleX: gsap.getProperty(el, 'scaleX'), scaleY: gsap.getProperty(el, 'scaleY'), unit: parseFloat(style.getPropertyValue('--scale')) || 1 };
  });
}
/** A pointer drag by (dx, dy) composition pixels from the layer's centre, optionally with Shift held. */
async function drag(page: Page, selector: string, dx: number, dy: number, { shift = false, escape = false } = {}) {
  const r = await rendered(page, selector), board = (await page.locator('.ef-artboard').boundingBox())!, fit = board.width / 1920;
  const x = board.x + (r.x + r.width / 2) * fit, y = board.y + (r.y + r.height / 2) * fit;
  await page.mouse.move(x, y); await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x + dx * fit, y + dy * fit, { steps: 10 });
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
/** A bar body dragged by `frames` on the ruler. */
async function dragBar(page: Page, bar: ReturnType<Page['locator']>, frames: number, fps: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const box = (await ruler.boundingBox())!, extent = Number(await ruler.getAttribute('data-extent'));
  const at = (await bar.boundingBox())!, x = at.x + Math.min(12, at.width / 2), y = at.y + at.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + frames / fps / extent * box.width, y, { steps: 8 });
  await page.mouse.up();
}
const near = (a: number, b: number, tolerance = 1e-3) => Math.abs(a - b) <= tolerance + 1e-9;
/** Every track of every layer but `except`, per cue, as JSON: what an edit must leave byte for byte. */
const untouched = (d: Data, except: string[]) => JSON.stringify(d.steps.map(s => Object.entries(s.layers).filter(([k]) => !except.includes(k))));

// ---- Catalog ----

test('no catalog layer refuses as another channel: its bar moves and trims and its Position Y keys', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const report = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { sequenceAuthoringReason } = await import('/src/blocks/editorAnimation.ts');
    const { readTimeline } = await import('/src/components/editorFoundation/timelineView.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const CHANNELS = ['transform', 'xPercent', 'yPercent', 'autoAlpha', 'scale'];
    const out = { blocked: 0, designs: new Set<string>(), channel: [] as string[], applied: { move: 0, trim: 0, key: 0 }, refused: {} as Record<string, number>, keyFailures: [] as string[] };
    for (const variants of Object.values(CATALOG)) for (const variant of variants ?? []) {
      const t = variant.create({}) as never as { html: string; js: string; fps: number };
      const d = parseAnimData(t.js);
      if (!d || sequenceAuthoringReason(d)) continue;
      const view = readTimeline(t as never), doc = new DOMParser().parseFromString(t.html, 'text/html');
      for (const part of view.parts) {
        if (part.kind === 'root') continue;
        const node = doc.querySelector(part.selector)!;
        // The data selectors naming this element: its own, or one other naming only it.
        const names = [...new Set(d.steps.flatMap(s => Object.keys(s.layers)))].filter(k => { try { return node.matches(k); } catch { return false; } });
        const owner = names.find(k => k !== part.selector) ?? part.selector;
        const tracks = d.steps.flatMap(s => Object.keys(s.layers[owner] ?? {}));
        if (!(names.some(k => k !== part.selector) || tracks.some(p => CHANNELS.includes(p)))) continue;
        out.blocked++; out.designs.add(variant.id);
        const bar = view.bars.find(b => b.selector === part.selector);
        const frame = d.speed / t.fps;
        const tries: [keyof typeof out.applied, unknown][] = [];
        if (bar) {
          tries.push(['move', { kind: 'layer.move', selector: part.selector, step: bar.step, delta: frame }]);
          if (bar.end - bar.start > 3 / t.fps) tries.push(['trim', { kind: 'layer.trim', selector: part.selector, step: bar.step, interval: bar.interval, edge: 'end', time: (bar.end - bar.cueStart) * d.speed - frame }]);
        }
        // Position Y at the end of the layer's first cue, keeping its pose: y when it animates y, else yPercent.
        const cue = bar?.step ?? 0, time = d.steps[cue].duration, property = tracks.includes('y') ? 'y' : tracks.includes('yPercent') ? 'yPercent' : 'y';
        const value = resolveValue(d, owner, property, cue, time);
        tries.push(['key', { kind: 'animation.key', selector: part.selector, step: cue, property, time, value: typeof value === 'number' ? value : 0, action: 'set' }]);
        for (const [kind, operation] of tries) {
          try { applyOperations(t as never, [operation as never], false); out.applied[kind]++; }
          catch (error) {
            const reason = String((error as Error).message);
            if (/Another source channel/.test(reason)) out.channel.push(variant.id + ' ' + part.selector + ' ' + kind);
            else out.refused[kind + ': ' + reason.replace(/[#.][\w-]+/g, '<layer>').slice(0, 90)] = (out.refused[kind + ': ' + reason.replace(/[#.][\w-]+/g, '<layer>').slice(0, 90)] ?? 0) + 1;
            if (kind === 'key') out.keyFailures.push(variant.id + ' ' + part.selector + ': ' + reason);
          }
        }
      }
    }
    return { ...out, designs: out.designs.size };
  });
  console.log(JSON.stringify(report, null, 1));
  // The reproduction's count: 354 layers in 129 designs refused with the channel refusal.
  expect(report.blocked).toBe(354);
  expect(report.designs).toBe(129);
  expect(report.channel).toEqual([]);
  expect(report.keyFailures).toEqual([]);
  expect(report.applied.key).toBe(354);
  expect(report.applied.move).toBeGreaterThan(300);
  expect(report.applied.trim).toBeGreaterThan(300);
});

// ---- Position through yPercent ----

test('Clean Steps: Position Y reads a row\'s yPercent, and the field and a canvas drag key it at the playhead', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const t = await (async () => { await open(page); return catalog(page, 'card26'); })();
  await editorWith(page, t);
  const fps = t.fps, original = await source(page), steps = await history(page);
  // #f0's reveal runs yPercent 110 to 0 from 0.5 s to 1.2 s of In; 0.8 s is partway.
  await seekFrames(page, Math.round(.8 * fps), fps);
  await select(page, '#f0');
  const at = await rendered(page, '#f0');
  expect(at.yPercent).toBeGreaterThan(1);
  const base = await page.evaluate(async () => (await import('/src/blocks/baseEdits.ts')).baseValues((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template, '#f0').y);
  const shown = Number(await (await field(page, 'Layout offset Y')).inputValue());
  expect(near(shown, base + (at.y0 + at.yPercent * at.box / 100) / at.unit)).toBe(true);

  // The field: ten pixels lower, written as yPercent at the playhead; no y track and no base edit.
  await type(page, 'Layout offset Y', shown + 10); await ready(page);
  const typed = await source(page), keyed = await dataOf(page, typed.js);
  expect(keyed.steps[0].layers['#f0'].y).toBeUndefined();
  const key = keyed.steps[0].layers['#f0'].yPercent.find(k => near(k.time, Math.round(.8 * fps) / fps * keyed.speed))!;
  expect(near(Number(key.value), at.yPercent + 10 * at.unit * 100 / at.box, 5e-3)).toBe(true);
  expect(typed.css).toBe(original.css); expect(typed.html).toBe(original.html);
  await expect.poll(async () => (await rendered(page, '#f0')).y - at.y).toBeCloseTo(10 * at.unit, 1);
  expect(await history(page)).toBe(steps + 1);
  expect(Number(await (await field(page, 'Layout offset Y')).inputValue())).toBeCloseTo(shown + 10, 2);
  await undo(page); expect(await source(page)).toEqual(original);

  // A canvas drag by the same distance writes the same key; Escape first cancels one.
  await drag(page, '#f0', 0, 10, { escape: true }); await ready(page);
  expect(await source(page)).toEqual(original);
  await drag(page, '#f0', 0, 10); await ready(page);
  const dragged = await data(page), moved = dragged.steps[0].layers['#f0'].yPercent.find(k => near(k.time, key.time))!;
  expect(Math.abs(Number(moved.value) - Number(key.value))).toBeLessThan(.2);
  expect(dragged.steps[0].layers['#f0'].y).toBeUndefined();
  expect((await source(page)).css).toBe(original.css);
  expect(await history(page)).toBe(steps + 1);
  await undo(page); expect(await source(page)).toEqual(original);

  // The stopwatch off where yPercent is not 0 refuses beside the control; at rest it removes the
  // row's yPercent keys and keeps the base.
  await page.getByRole('button', { name: 'Disable Layout offset Y animation', exact: true }).click();
  await expect(page.locator('.ef-animation-properties [role=alert]')).toContainText('height');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
  await seekFrames(page, Math.round(1.6 * fps), fps);
  await page.getByRole('button', { name: 'Disable Layout offset Y animation', exact: true }).click(); await ready(page);
  const off = await source(page), offData = await dataOf(page, off.js);
  expect(offData.steps.some(s => s.layers['#f0']?.yPercent)).toBe(false);
  expect(off.css).toBe(original.css);
  expect(untouched(offData, ['#f0'])).toBe(untouched(await dataOf(page, original.js), ['#f0']));
  await undo(page); expect(await source(page)).toEqual(original);
  expect(errors).toEqual([]);
});

// ---- Scale through scale ----

test('Frosted Panel: Scale handles key the box\'s scale track, linked Scale agrees, and one axis refuses', async ({ page }) => {
  await open(page);
  const t = await catalog(page, 'card03');
  await editorWith(page, t);
  const fps = t.fps, original = await source(page), steps = await history(page), box = '.info-card-box';
  // In: scale 0.9 to 1 and y 24 to 0 over 0.6 s; 0.28 s is partway.
  const frames = Math.round(.28 * fps), time = frames / fps;
  await seekFrames(page, frames, fps);
  await select(page, box);
  const before = await rendered(page, box);
  const handle = page.locator('.ef-selection circle').last(), bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2 + 24, { steps: 8 }); await page.mouse.up(); await ready(page);
  const handled = await data(page), tracks = handled.steps[0].layers[box];
  expect(tracks.scaleX).toBeUndefined(); expect(tracks.scaleY).toBeUndefined();
  const scaleKey = tracks.scale.find(k => near(k.time, time * handled.speed))!;
  expect(Number(scaleKey.value)).not.toBeCloseTo(before.scaleX, 3);
  expect(tracks.y.some(k => near(k.time, time * handled.speed))).toBe(true);
  const after = await rendered(page, box);
  expect(after.scaleX).toBeCloseTo(after.scaleY, 6);
  expect(await history(page)).toBe(steps + 1);
  await undo(page); expect(await source(page)).toEqual(original);

  // Linked Scale X by the same ratio writes the same scale key.
  const ratio = Number(scaleKey.value) / before.scaleX;
  const shownX = Number(await (await field(page, 'Scale X %')).inputValue());
  await type(page, 'Scale X %', Math.round(shownX * ratio * 1000) / 1000); await ready(page);
  const typed = (await data(page)).steps[0].layers[box];
  expect(typed.scaleX).toBeUndefined();
  expect(Number(typed.scale.find(k => near(k.time, time * handled.speed))!.value)).toBeCloseTo(Number(scaleKey.value), 2);
  await undo(page); expect(await source(page)).toEqual(original);

  // One axis cannot key a track both axes share: unlinked Scale X and a Shift handle drag refuse.
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  await type(page, 'Scale X %', shownX + 10);
  await expect(page.locator('.ef-animation-properties [role=alert]')).toContainText('share one');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
  await page.getByRole('checkbox', { name: 'Link proportions' }).check();
  const again = (await page.locator('.ef-selection circle').last().boundingBox())!;
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2); await page.mouse.down(); await page.keyboard.down('Shift');
  await page.mouse.move(again.x + again.width / 2 + 30, again.y + again.height / 2 + 6, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift');
  await expect(page.locator('.ef-stage-error')).toContainText('share one');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
});

// ---- A layer whose motion lives under another selector ----

test('House Question: #f1 shows and moves the motion stored under .audience-question', async ({ page }) => {
  await open(page);
  const t = await catalog(page, 'aq01');
  await editorWith(page, t);
  const original = await source(page), before = await dataOf(page, original.js), steps = await history(page);
  expect(before.steps[0].layers['.audience-question'].yPercent).toHaveLength(2);
  const row = page.locator('.ef-track[data-selector="#f1"]').first();
  await expect(row.locator('.ef-timeline-key')).toHaveCount(2);
  await dragBar(page, row.locator('.ef-bar').first(), 2, t.fps); await ready(page);
  const moved = await data(page), delta = 2 / t.fps * moved.speed;
  expect(moved.steps[0].layers['.audience-question'].yPercent.map(k => k.time)).toEqual(before.steps[0].layers['.audience-question'].yPercent.map(k => Math.round((k.time + delta) * 1000) / 1000));
  expect(moved.steps.some(s => s.layers['#f1'] || s.spans?.['#f1'])).toBe(false);
  expect(moved.steps[0].spans?.['.audience-question']?.[0].start).toBeCloseTo(delta, 3);
  expect(untouched(moved, ['.audience-question'])).toBe(untouched(before, ['.audience-question']));
  expect(await history(page)).toBe(steps + 1);
  await undo(page); expect(await source(page)).toEqual(original);
});

// ---- Channels that cannot be written exactly ----

test('refusals: a raw transform, a selector naming several layers or two naming one, autoAlpha bars; autoAlpha keys', async ({ page }) => {
  await open(page);
  const t = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createArtwork } = await import('/src/blocks/baseEdits.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    let template = useTemplateStore.getState().template;
    const root = parseAnimData(template.js)!.root;
    const made: string[] = [];
    for (let i = 0; i < 5; i++) { const next = createArtwork(template, { shape: 'rectangle', x: -600 + i * 220, y: -200, width: 160, height: 90 }); template = next.template; made.push(next.selector); }
    // Two layers share the class .pair; .solo names only the fourth.
    const id = (s: string) => s.slice(1);
    let html = template.html;
    for (const [s, cls] of [[made[1], 'pair'], [made[2], 'pair'], [made[3], 'solo']] as const) html = html.replace(new RegExp(`id="${id(s)}"`), `id="${id(s)}" class="${cls}"`);
    const layers = {
      [made[0]]: { transform: [{ time: 0, value: 'translateX(0px)' }, { time: 1, value: 'translateX(80px)' }] },
      '.pair': { x: [{ time: 0, value: 0 }, { time: 1, value: 40 }] },
      [made[3]]: { x: [{ time: 0, value: 0 }, { time: 1, value: 40 }] }, '.solo': { y: [{ time: 0, value: 0 }, { time: 1, value: 20 }] },
      [made[4]]: { autoAlpha: [{ time: 0, value: 0 }, { time: 1, value: 1 }] },
    };
    return { ...template, fps: 25, html, js: replaceRegionWithAnimData(template.js, { version: 2, root, speed: 1, steps: [{ name: 'In', duration: 2, ease: 'none', layers }, { name: 'Out', duration: 1, ease: 'none', layers: {} }] })!, made };
  }) as Template & { made: string[] };
  const [transform, shared, , twice, alpha] = t.made;
  const refuse = async (operation: unknown, pattern: RegExp) => {
    const result = await attempt(page, t, [operation]);
    expect(result.error, JSON.stringify(operation)).toMatch(pattern);
  };
  const key = (selector: string, property: string, value = 10) => ({ kind: 'animation.key', selector, step: 0, property, time: .5, value, action: 'set' });
  await refuse(key(transform, 'x'), /transform/);
  await refuse(key(transform, 'scaleX', 1.2), /transform/);
  // Time edits never read a unit: a raw transform's bar and keys still move.
  const movedTransform = await dataOf(page, (await operate(page, t, [{ kind: 'layer.move', selector: transform, step: 0, delta: .2 }])).js);
  expect(movedTransform.steps[0].layers[transform].transform.map(k => k.time)).toEqual([.2, 1.2]);
  await refuse({ kind: 'layer.move', selector: shared, step: 0, delta: .2 }, /several layers/);
  await refuse(key(shared, 'x'), /several layers/);
  await refuse({ kind: 'layer.move', selector: twice, step: 0, delta: .2 }, /two selectors/);
  await refuse(key(twice, 'y'), /two selectors/);
  // Opacity on an autoAlpha layer keys autoAlpha; its bar refuses.
  const keyed = await dataOf(page, (await operate(page, t, [key(alpha, 'autoAlpha', .5)])).js);
  expect(keyed.steps[0].layers[alpha].autoAlpha.map(k => k.time)).toEqual([0, .5, 1]);
  expect(keyed.steps[0].layers[alpha].opacity).toBeUndefined();
  await refuse(key(alpha, 'opacity', .5), /autoAlpha/);
  await refuse({ kind: 'layer.move', selector: alpha, step: 0, delta: .2 }, /autoAlpha/);
  await refuse({ kind: 'layer.trim', selector: alpha, step: 0, interval: 0, edge: 'end', time: 1.5 }, /autoAlpha/);

  // In the editor the bar's refusal shows beside it and changes nothing.
  const { made: _made, ...plain } = t; void _made;
  await editorWith(page, plain as Template);
  const original = await source(page), steps = await history(page);
  await dragBar(page, page.locator(`.ef-track[data-selector="${alpha}"] .ef-bar`).first(), 5, 25);
  await expect(page.locator(`.ef-track[data-selector="${alpha}"] .ef-bar-error`)).toContainText('autoAlpha');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
});

// ---- The R1.2a.4 and R1.2a.5 edits on a catalog graphic ----

test('Clean Steps: a row\'s bar across a Step flag, trim, key move, key ease, Add Step and Set Out are one undo each and reopen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const t = await catalog(page, 'card26');
  await editorWith(page, t);
  const fps = t.fps, original = await source(page), before = await dataOf(page, original.js);
  const steps = await history(page);
  // #f2 appears with Step 3; its bar dragged five frames later carries its reveal across Step 4's flag.
  const row = page.locator('.ef-track[data-selector="#f2"]').first();
  await dragBar(page, row.locator('.ef-bar').first(), 5, fps); await ready(page);
  const moved = await data(page), delta = 5 / fps * moved.speed;
  expect(await history(page)).toBe(steps + 1);
  expect(moved.steps[2].spans?.['#f2']).toEqual([{ start: delta, end: before.steps[2].duration }]);
  expect(moved.steps[2].layers['#f2'].yPercent[0]).toEqual({ time: delta, value: 110 });
  expect(untouched(moved, ['#f2'])).toBe(untouched(before, ['#f2']));
  await undo(page); expect(await source(page)).toEqual(original);
  await redo(page); expect(await data(page)).toEqual(moved);
  const barMoved = await source(page);

  // The rest through the registry, each one transaction.
  const execute = (operation: unknown) => page.evaluate(async operation => {
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [operation as never] });
  }, operation);
  const edits = [
    { kind: 'layer.trim', selector: '#f2', step: 2, interval: 0, edge: 'end', time: before.steps[2].duration - 2 / fps * moved.speed },
    { kind: 'key.move', keys: [{ step: 0, selector: '#f0', property: 'yPercent', time: .5 }], delta: 2 / fps * moved.speed },
    { kind: 'key.ease', keys: [{ step: 0, selector: '#f0', property: 'yPercent', time: 1.2 }], preset: 'easeIn' },
    { kind: 'step.add', time: 1.2 + .45 + .45 + .3 },
    { kind: 'out.set', time: 1.2 + .45 * 4 + .45 + .2 },
  ];
  for (const edit of edits) {
    const at = await history(page), prior = await source(page);
    await execute(edit); await ready(page);
    expect(await history(page), JSON.stringify(edit)).toBe(at + 1);
    expect((await source(page)).js, JSON.stringify(edit)).not.toBe(prior.js);
  }
  const edited = await source(page);
  for (let i = 0; i < edits.length; i++) await undo(page);
  expect(await source(page)).toEqual(barMoved);
  for (let i = 0; i < edits.length; i++) await redo(page);
  expect(await source(page)).toEqual(edited);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Clean Steps transforms');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  expect((await source(page)).js).toBe(edited.js);
  expect(errors).toEqual([]);
});

test('the edited Clean Steps plays in the simulator and SPX as the editor samples it', async ({ page }) => {
  await open(page);
  const t = await catalog(page, 'card26');
  const edited = await operate(page, t, [
    { kind: 'animation.key', selector: '#f0', step: 0, property: 'yPercent', time: .9, value: 40, action: 'set' },
    { kind: 'layer.move', selector: '#f2', step: 2, delta: .2 },
  ]);
  const d = await dataOf(page, edited.js);
  expect(d.steps[0].layers['#f0'].yPercent.map(k => k.time)).toEqual([.5, .9, 1.2]);
  // In around #f0's new key; the Steps around #f2's bar, which now starts 0.2 s into Step 3.
  const times = [[0, .3, .5, .6, .7, .8, .9, 1, 1.1, 1.2], [0, .1, .2, .3, .45], [0, .1, .19, .21, .3, .4, .45], [0, .1, .19, .21, .3, .45]];
  const expected = await page.evaluate(async ({ d, times }) => {
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const { shownWithoutBars } = await import('/src/blocks/animEdit.ts');
    return [0, 1, 2, 3].map(cue => times[cue].map(t => ['#f0', '#f2'].map(s => {
      const spans = d.steps[cue].spans?.[s];
      const shown = spans ? spans.some(b => t >= b.start - 1e-9 && t < b.end + (b.end === d.steps[cue].duration ? 1e-9 : 0)) : shownWithoutBars(d as never, s, cue);
      return [Number(resolveValue(d as never, s, 'yPercent', cue, t) ?? 0), shown ? 1 : 0];
    })));
  }, { d, times });
  for (const target of ['simulator', 'spx']) {
    const built = await page.evaluate(async ({ t, target }) => {
      if (target === 'simulator') return { html: (await import('/src/preview/composeDocument.ts')).composeDocument(t as never, { simulate: true }) };
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(x => x.id === target)!.build(t as never);
      return { files: Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')]))) as Record<string, string> };
    }, { t: edited, target });
    const output = await page.context().newPage();
    await output.setViewportSize({ width: 1920, height: 1080 });
    if ('html' in built && built.html) await output.setContent(built.html);
    else {
      const files = (built as { files: Record<string, string> }).files;
      await output.route('http://transforms.local/**', route => {
        const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
        return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html' });
      });
      await output.goto('http://transforms.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
    }
    const played = await output.evaluate(async ({ target, durations, times }) => {
      type Tl = { pause(): void; time(t: number, s?: boolean): void; progress(p: number, s?: boolean): void; duration(): number };
      const w = window as unknown as Record<string, () => unknown> & { gsap: { getProperty(e: Element, p: string): number; globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Tl[] } } };
      const command = (action: 'play' | 'next') => target === 'simulator'
        ? window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-' + action, data: '{}' } })) : w[action]();
      const timeline = (d: number) => w.gsap.globalTimeline.getChildren(false, false, true).filter(x => Math.abs(x.duration() - d) < .0001).pop()!;
      const pose = () => ['#f0', '#f2'].map(s => { const e = document.querySelector(s)!; return [Number(w.gsap.getProperty(e, 'yPercent')), getComputedStyle(e).visibility === 'hidden' ? 0 : 1]; });
      const cues: number[][][][] = [];
      for (let cue = 0; cue < 4; cue++) {
        if (cue === 0) command('play'); else command('next');
        await new Promise(r => setTimeout(r, 50));
        const tl = timeline(durations[cue]); tl.pause();
        cues.push(times[cue].map(t => { tl.time(t, true); return pose(); }));
        tl.progress(1, true);
      }
      return cues;
    }, { target, durations: d.steps.map(s => s.duration / d.speed), times });
    await output.close();
    for (let cue = 0; cue < 4; cue++) for (let i = 0; i < expected[cue].length; i++) for (let l = 0; l < 2; l++) {
      const what = `${target} cue ${cue} at ${times[cue][i]} s, ${['#f0', '#f2'][l]}`;
      expect(Math.abs(played[cue][i][l][0] - expected[cue][i][l][0]), what).toBeLessThan(2e-3);
      expect(played[cue][i][l][1], what + ' visibility').toBe(expected[cue][i][l][1]);
    }
  }
});
