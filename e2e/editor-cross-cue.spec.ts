// covers: src/templates/shared/{animRuntime,animRuntimeLegacy,easeRuntime}.ts
// covers: src/blocks/{animEdit,editorOut,editorSteps,editorAnimation,animMigration,animEval,animData}.ts, src/components/editorFoundation/**
// covers: e2e/fixtures/cross-cue.json, e2e/fixtures/interpreter-one-key-hold-v1.js
//
// R1.2a.5 (docs/research/editor-r1-2a-5): the exit belongs to the Out flag (owner decision
// 2026-09-30), and keys and bar bodies dragged across a Step or Out flag land in the other cue at
// their absolute times. Played here by the bundled runtime in the simulator and every exported
// package, and through the editor's own controls. scripts/cross-cue.test.mjs checks the same
// decisions densely in Node.

import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';

type Key = { time: number; value: number | string; ease?: string };
type Step = { name: string; duration: number; ease: string; carried?: number; layers: Record<string, Record<string, Key[]>>; spans?: Record<string, { start: number; end: number }[]> };
type Data = { version: number; root: string; speed: number; steps: Step[] };
type Template = { js: string; html: string; css: string; settings: Record<string, string> };
type Pose = number[];
type Sample = { key: string; t: number };
const TARGETS = ['simulator', 'spx', 'casparcg', 'ograf', 'single-file'];
const LAYERS = ['#box', '#title', '#badge', '#tag'], PROPS = ['x', 'y', 'rotation'];
/** In (1.2 s, still after 0.8), Step 2 (1 s, still after 0.6) revealing the badge and the tag, and
 *  an exit with a designed beat: the title leaves at once, the box 0.2 s later. */
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/cross-cue.json', import.meta.url), 'utf8')) as Data;
const secondsOf = (data: Data) => data.steps.map(s => s.duration / data.speed);
const grid = (end: number, step = .04) => Array.from({ length: Math.round(end / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
const HTML = '<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="fixture"><div id="box" data-gfx></div><div id="title" data-gfx>Cross cue</div><div id="badge" data-gfx>New</div><div id="tag" data-gfx>Tag</div></div></body></html>';
const CSS = 'body{margin:0}.fixture{opacity:0}#box{position:absolute;left:500px;top:400px;width:320px;height:100px;background:#eeb844}#title{position:absolute;left:500px;top:520px;width:320px;height:60px;font:40px Arial;color:#111}#badge{position:absolute;left:860px;top:400px;width:120px;height:60px;background:#2266cc;color:#fff}#tag{position:absolute;left:860px;top:520px;width:160px;height:60px;background:#444;color:#fff}';

async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}

/** A complete template around one animation literal, with the SPX definition a saved graphic has. */
async function template(page: Page, data: Data): Promise<Template> {
  return page.evaluate(async ({ data, html, css }) => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const { spxSteps } = await import('/src/blocks/animMachine.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const settings = { ...store.template.settings, steps: String(spxSteps(data as never)) };
    return { ...store.template, settings, fps: 25, fields: [], layers: [], html: replaceDefinitionInHtml(html, settings as never, []), css,
      js: runtimeJs('Cross-cue fixture', emitAnimRegion(data as never)) };
  }, { data, html: HTML, css: CSS }) as Promise<Template>;
}

/** The registry's result for a batch, or its refusal. */
async function operate(page: Page, t: Template, operations: unknown[]): Promise<Template> {
  const result = await page.evaluate(async ({ t, operations }) => {
    try { return { template: (await import('/src/components/editorFoundation/operations.ts')).applyOperations(t as never, operations as never).template }; }
    catch (error) { return { error: String((error as Error).message ?? error) }; }
  }, { t, operations });
  if ('error' in result) throw new Error(result.error);
  return result.template as unknown as Template;
}
async function dataOf(page: Page, t: Template): Promise<Data> {
  return page.evaluate(async js => (await import('/src/blocks/animData.ts')).parseAnimData(js), t.js) as Promise<Data>;
}

/** What `target` serves for a template: the simulator or single-file document, or a package's files. */
async function build(page: Page, t: unknown, target: string) {
  return page.evaluate(async ({ t, target }) => {
    if (target === 'simulator') return { html: (await import('/src/preview/composeDocument.ts')).composeDocument(t as never, { simulate: true }) };
    if (target === 'single-file') return { html: await (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(t as never) };
    const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(x => x.id === target)!.build(t as never);
    return { files: Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')]))) as Record<string, string> };
  }, { t, target });
}
type Built = Awaited<ReturnType<typeof build>>;

type Run = { poses: Record<string, Pose>; held: Pose; released: Pose; leaving: Pose[] };
/**
 * Load the built graphic in a fresh page and walk it: each pre-Out cue up to `nexts` is sampled at
 * the local times `cues` gives it and settled, Next pressed between them. Then Out, sampled at
 * `exit` seconds on its own clock, found by its length `out` (the Out cue's, unless an earlier step
 * skips carried time).
 */
async function run(page: Page, built: Built, target: string, seconds: number[], { cues = [], nexts = seconds.length - 2, exit, out = seconds[seconds.length - 1] }: { cues?: Sample[][]; nexts?: number; exit: number[]; out?: number }): Promise<Run> {
  const output = await page.context().newPage();
  await output.setViewportSize({ width: 1920, height: 1080 });
  if (built.html) await output.setContent(built.html);
  else {
    const files = built.files!;
    await output.route('http://cue-package.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await output.goto('http://cue-package.local/');
      await output.evaluate(async () => {
        const mod = await import('http://cue-package.local/graphic.mjs'); customElements.define('cue-graphic', mod.default);
        const element = document.createElement('cue-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      });
    } else await output.goto('http://cue-package.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  }
  const result = await output.evaluate(async ({ target, seconds, cues, nexts, exit, out: outSeconds, layers, props }) => {
    type Tl = { pause(): void; time(t: number, s?: boolean): void; progress(p: number, s?: boolean): void; duration(): number };
    const w = window as unknown as Record<string, () => unknown> & { gsap: { getProperty(e: Element, p: string): number; globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Tl[] } } };
    const element = document.querySelector('cue-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
    const command = async (action: 'play' | 'next' | 'stop') => {
      if (target === 'simulator') window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-' + action, data: '{}' } }));
      else if (target === 'ograf') { if (action === 'stop') await element.stopAction({}); else await element.playAction({}); }
      else w[action]();
    };
    const all = () => w.gsap.globalTimeline.getChildren(false, false, true);
    const timeline = (d: number) => {
      const found = all().filter(x => Math.abs(x.duration() - d) < .0001).pop();
      if (!found) throw new Error(`No ${d} s timeline; found ${all().map(x => x.duration()).join(', ')} s`);
      return found;
    };
    const seen = (style: CSSStyleDeclaration) => style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
    const pose = () => layers.flatMap(s => { const e = document.querySelector(s)!; return props.map(p => Number(w.gsap.getProperty(e, p))).concat(seen(getComputedStyle(e))); });
    const poses: Record<string, number[]> = {};
    await command('play');
    let cue = timeline(seconds[0]);
    for (let i = 0; i <= nexts; i++) {
      if (i > 0) { await command('next'); cue = timeline(seconds[i]); }
      cue.pause();
      for (const sample of cues[i] ?? []) { cue.time(sample.t, true); poses[sample.key] = pose(); }
      cue.progress(1, true);
    }
    const held = pose();
    await command('stop');
    const released = pose();
    const out = timeline(outSeconds); out.pause();
    const leaving = exit.map(t => { out.time(t, true); return pose(); });
    return { poses, held, released, leaving };
  }, { target, seconds, cues, nexts, exit, out, layers: LAYERS, props: PROPS });
  await output.close();
  return result;
}
const label = (p: number) => LAYERS[Math.floor(p / (PROPS.length + 1))] + ' ' + [...PROPS, 'seen opacity'][p % (PROPS.length + 1)];
function near(actual: Pose[], expected: Pose[], what: string, tolerance = 2e-3) {
  let worst = { error: 0, at: -1, prop: '' };
  expect.soft(actual.length, what + ': sample count').toBe(expected.length);
  actual.forEach((pose, i) => pose.forEach((v, p) => {
    const error = Math.abs(v - expected[i]?.[p]) - tolerance;
    if (!(error <= 0) && !(error <= worst.error)) worst = { error: Number.isNaN(error) ? Infinity : error, at: i, prop: `${label(p)} ${v} vs ${expected[i]?.[p]}` };
  }));
  expect.soft(worst, `${what}: sample ${worst.at} ${worst.prop} beyond tolerance by ${worst.error}`).toEqual({ error: 0, at: -1, prop: '' });
}

/** The exit's own clock in seconds, and where Set Out lands inside Step 2's motion: frame 38, 0.32 s
 *  into Step 2 (whose motion ends at 0.6 s), so 0.28 s of that motion is carried into Out. */
const EXIT = grid(.9, .05), INTO = 38 / 25, AT = .32, CARRIED = .28;

for (const target of TARGETS) test('the exit belongs to the Out flag in ' + target, async ({ page }) => {
  await open(page);
  const data = fixture(), original = await template(page, data), builtOriginal = await build(page, original, target);
  // The original at its last step: Step 2 sampled where the carried motion will come from, then
  // Out; and from an earlier step, parked after In.
  const carriedTimes = grid(CARRIED, .04).filter(u => u < CARRIED - 1e-9);
  const last = await run(page, builtOriginal, target, secondsOf(data), { cues: [[], carriedTimes.map(u => ({ key: String(u), t: AT + u }))], exit: EXIT });
  const early = await run(page, builtOriginal, target, secondsOf(data), { nexts: 0, exit: EXIT });
  // Out later and Out earlier into still air: Out is untouched, so the exit plays from the press.
  for (const [time, step2] of [[2.4, 1.2], [2, .8]]) {
    const moved = await operate(page, original, [{ kind: 'out.set', time }]), movedData = await dataOf(page, moved);
    expect.soft(movedData.steps.map(s => s.duration), `Out at ${time}: the cues`).toEqual([1.2, step2, .9]);
    expect.soft(movedData.steps[2], `Out at ${time}: the exit is untouched`).toEqual(data.steps[2]);
    const after = await run(page, await build(page, moved, target), target, secondsOf(movedData), { exit: EXIT });
    near([after.held], [last.held], `${target} Out at ${time}: the hold`);
    near(after.leaving, last.leaving, `${target} Out at ${time}: the exit from the press, no pause`);
  }
  // Out inside Step 2's motion: the rest of that motion plays first, then the exit at once.
  const into = await operate(page, original, [{ kind: 'out.set', time: INTO }]), intoData = await dataOf(page, into);
  expect.soft(intoData.steps.map(s => s.duration), 'Out inside Step 2: the cues').toEqual([1.2, AT, Math.round((CARRIED + .9) * 1000) / 1000]);
  expect.soft(intoData.steps[2].carried, 'Out inside Step 2: the carried time').toBe(CARRIED);
  const builtInto = await build(page, into, target), times = [...carriedTimes, ...EXIT.map(v => Math.round((CARRIED + v) * 1e6) / 1e6)];
  const played = await run(page, builtInto, target, secondsOf(intoData), { exit: times });
  near(played.leaving, [...carriedTimes.map(u => last.poses[String(u)]), ...last.leaving], `${target} Out inside Step 2 at the last step: the carried motion, then the exit`);
  // From an earlier step that motion never plays and the exit starts at the press, as before.
  // (Its last sample differs off air: the carried turn is taken with the rest of the end-of-Out pose.)
  const earlier = await run(page, builtInto, target, secondsOf(intoData), { nexts: 0, exit: EXIT, out: .9 });
  near([earlier.released], [early.released], `${target} Out inside Step 2 from an earlier step: the pose at dispatch`);
  near(earlier.leaving.slice(0, -1), early.leaving.slice(0, -1), `${target} Out inside Step 2 from an earlier step: the exit from the press`);
  // Back where it was, Out plays the original, byte for byte.
  expect.soft((await operate(page, into, [{ kind: 'out.set', time: 2.2 }])).js, 'Out inside Step 2 and back').toBe(original.js);
});

for (const target of TARGETS) test('keys moved across a Step flag and the Out flag play the curve the ruler shows in ' + target, async ({ page }) => {
  await open(page);
  const data = fixture(), original = await template(page, data);
  // The title's landing key from In into Step 2, and the box's turn from Step 2 into Out.
  const moved = await operate(page, original, [
    { kind: 'key.move', keys: [{ step: 0, selector: '#title', property: 'x', time: .8 }], delta: .8 },
    { kind: 'key.move', keys: [{ step: 1, selector: '#box', property: 'rotation', time: .6 }], delta: .6 },
  ]);
  const movedData = await dataOf(page, moved);
  expect.soft(movedData.steps.map(s => s.duration), 'the flags stay').toEqual([1.2, 1, .9]);
  expect.soft(movedData.steps[0].layers['#title'].x.map(k => k.time), 'In ends the title on the flag').toEqual([0, 1.2]);
  expect.soft(movedData.steps[1].layers['#title'].x.map(k => k.time), 'Step 2 takes the landing key').toEqual([0, .4]);
  expect.soft(movedData.steps[1].layers['#box'].rotation.map(k => k.time), 'Step 2 keeps the turn up to Out').toEqual([0, 1]);
  expect.soft(movedData.steps[2].layers['#box'].rotation.map(k => k.time), 'Out finishes the turn').toEqual([0, .2]);
  // Every target plays what the editor samples on the ruler, In and Step 2 and Out.
  const inTimes = grid(1.2), stepTimes = grid(1), cues = [inTimes.map(t => ({ key: 'in:' + t, t })), stepTimes.map(t => ({ key: 'step:' + t, t }))];
  const played = await run(page, await build(page, moved, target), target, secondsOf(movedData), { cues, exit: EXIT });
  const expected = await page.evaluate(async ({ data, inTimes, stepTimes, exit, layers, props }) => {
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const identity: Record<string, number> = { x: 0, y: 0, rotation: 0 };
    // Visibility as the runtime shows it: a cue's bars where it has them (its end on the arriving
    // side), else whether the last cue with bars left the layer on screen.
    const shown = (s: string, cue: number, t: number) => {
      const bars = data.steps[cue].spans?.[s], d = data.steps[cue].duration;
      if (bars) return bars.some(b => t >= b.start && (t < b.end || t === d && b.end === d));
      for (let i = cue - 1; i >= 0; i--) { const earlier = data.steps[i].spans?.[s]; if (earlier) return earlier.some(b => b.end === data.steps[i].duration); }
      return true;
    };
    const pose = (cue: number, t: number) => layers.flatMap(s => [...props.map(p => Number(resolveValue(data as never, s, p, cue, t) ?? identity[p])),
      shown(s, cue, t) ? Number(resolveValue(data as never, s, 'opacity', cue, t) ?? 1) : 0]);
    return { in: inTimes.map(t => pose(0, t)), step: stepTimes.map(t => pose(1, t)), out: exit.map(t => pose(2, t).map((v, i) => i % 4 === 3 ? NaN : v)) };
  }, { data: movedData, inTimes, stepTimes, exit: EXIT, layers: LAYERS, props: PROPS });
  near(inTimes.map(t => played.poses['in:' + t]), expected.in, `${target}: In with the moved title key`);
  near(stepTimes.map(t => played.poses['step:' + t]), expected.step, `${target}: Step 2 with both moved keys`);
  // Out's own visibility and opacity are its business; the moved turn is what matters there.
  near(played.leaving.map(p => [p[2]]), expected.out.map(p => [p[2]]), `${target}: Out finishes the box's turn`);
});

test('a graphic saved with the R1.2a.4 interpreter upgrades once and then skips carried motion from an earlier step', async ({ page }) => {
  await open(page);
  const before = readFileSync(new URL('./fixtures/interpreter-one-key-hold-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const into = await operate(page, await template(page, fixture()), [{ kind: 'out.set', time: INTO }]);
  const result = await page.evaluate(async ({ js, before }) => {
    const { ANIM_INTERPRETER_JS, writeOutData } = await import('/src/templates/shared/animRuntime.ts');
    const legacy = await import('/src/templates/shared/animRuntimeLegacy.ts') as Record<string, string>;
    const { prepareOutRuntime } = await import('/src/blocks/animMigration.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { contentHash } = await import('/src/model/contentHash.ts');
    const saved = js.replace(ANIM_INTERPRETER_JS, () => before), upgraded = prepareOutRuntime(saved);
    return { differs: saved !== js, known: contentHash(before.trim()) === legacy.ANIM_INTERPRETER_BEFORE_CARRIED_HASH, upgraded: upgraded === js,
      once: prepareOutRuntime(upgraded) === upgraded, written: writeOutData(saved, parseAnimData(saved)!) === js };
  }, { js: into.js, before });
  expect(result).toEqual({ differs: true, known: true, upgraded: true, once: true, written: true });
});

// ---- The editor ----

async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template) as Promise<Template>; }
async function data(page: Page) { return page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!) as Promise<Data>; }
async function state(page: Page) {
  return page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); return { js: s.template.js, history: s.history.length, future: s.future.length }; });
}
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function editorWith(page: Page, d: Data) {
  await open(page);
  const t = await template(page, d);
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true });
  }, t);
  await ready(page);
  return t;
}
const undo = async (page: Page) => { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); };
const redo = async (page: Page) => { await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); };
const layerRow = (page: Page, selector: string) => page.locator(`.ef-track[data-selector="${selector}"]:not([data-property])`);
/** The diamond on a layer's row at a ruler time, written as the timeline labels it. */
const diamond = (page: Page, selector: string, seconds: string) => layerRow(page, selector).locator(`.ef-timeline-key[aria-label$=" at ${seconds} s"]`);
async function extent(page: Page) { return Number(await page.getByRole('slider', { name: 'Playhead' }).getAttribute('data-extent')); }
/** Press on `handle`, drag it by `seconds` along its lane and, unless `hold`, let go. */
async function dragBy(page: Page, handle: Locator, seconds: number, hold = false) {
  await handle.scrollIntoViewIfNeeded();
  const lane = (await handle.locator('xpath=ancestor::*[contains(@class,"ef-track-lane")]').boundingBox())!, at = (await handle.boundingBox())!;
  const x = at.x + at.width / 2, y = at.y + at.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + seconds / await extent(page) * lane.width, y, { steps: 10 });
  if (hold) return async () => { await page.mouse.up(); };
  await page.mouse.up();
}

test('a key dragged across a Step flag is one undo, stays selected, nudges a frame and survives save and reopen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const original = await editorWith(page, fixture()), start = await state(page);
  // The title lands at 0.8 s in In; dragged 0.8 s later it lands in Step 2 at 0.4 s.
  await dragBy(page, diamond(page, '#title', '0.80'), .8); await ready(page);
  const once = await data(page);
  expect(once.steps[0].layers['#title'].x.map(k => k.time)).toEqual([0, 1.2]);
  expect(once.steps[1].layers['#title'].x.map(k => [k.time, k.value])).toEqual([[0, once.steps[0].layers['#title'].x[1].value], [.4, 0]]);
  const moved = await state(page);
  expect(moved.history).toBe(start.history + 1);
  await expect(page.getByTestId('key-count')).toHaveText('1 key');
  await expect(diamond(page, '#title', '1.60')).toHaveAttribute('aria-pressed', 'true');
  // A nudge moves it one frame, one more undo.
  await diamond(page, '#title', '1.60').focus(); await page.keyboard.press('ArrowRight'); await ready(page);
  expect((await data(page)).steps[1].layers['#title'].x.map(k => k.time)).toEqual([0, .44]);
  expect((await state(page)).history).toBe(start.history + 2);
  await undo(page); expect((await state(page)).js).toBe(moved.js);
  await undo(page); expect((await state(page)).js).toBe(original.js);
  await redo(page); expect((await state(page)).js).toBe(moved.js);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Cross-cue keys'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page);
  expect((await source(page)).js).toBe(saved.js);
  expect(errors).toEqual([]);
});

test('a key drag the runtime cannot play shows its reason while held and changes nothing, and Escape cancels', async ({ page }) => {
  await editorWith(page, fixture());
  const before = await state(page);
  // The box's fade-in key at 0.4 s held past its Out key at 2.4 s would pass it.
  const release = await dragBy(page, diamond(page, '#box', '0.40'), 2.2, true);
  const reason = page.getByRole('alert').filter({ hasText: /pass/ });
  await expect(diamond(page, '#box', '0.40')).toHaveClass(/is-refused/); await expect(reason).toBeVisible();
  await release!(); await ready(page);
  expect(await state(page)).toEqual(before); await expect(reason).toBeVisible();
  // Escape during a legal drag leaves the key where it was.
  const cancel = await dragBy(page, diamond(page, '#box', '0.40'), .2, true);
  await page.keyboard.press('Escape'); await cancel!(); await ready(page);
  expect(await state(page)).toEqual(before);
});

test('a bar body dragged across a Step flag moves its visibility and keys at their absolute times as one undo', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const original = await editorWith(page, fixture()), start = await state(page);
  // The tag shows 0.2 to 0.6 s into Step 2; twelve frames earlier it starts in In and parks on the flag.
  // Its first bar on the row: In hides it and draws none.
  const bar = layerRow(page, '#tag').locator('.ef-bar').first();
  await dragBy(page, bar, -.48); await ready(page);
  const d = await data(page);
  expect([d.steps[0].spans!['#tag'], d.steps[1].spans!['#tag']]).toEqual([[{ start: .92, end: 1.2 }], [{ start: 0, end: .12 }]]);
  expect(d.steps[0].layers['#tag'].x.map(k => k.time)).toEqual([.92, 1.2]);
  expect(d.steps[1].layers['#tag'].x.map(k => [k.time, k.value])).toEqual([[0, d.steps[0].layers['#tag'].x[1].value], [.12, 0]]);
  expect((await state(page)).history).toBe(start.history + 1);
  await undo(page); expect((await state(page)).js).toBe(original.js);
});

test('Set Out inside a Next cue carries its motion into Out as one undo, and the Out flag moves later with its exit', async ({ page }) => {
  const original = await editorWith(page, fixture()), start = await state(page);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < 3; i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < 8; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(INTO)); await ready(page);
  await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click(); await ready(page);
  await expect(page.locator('.ef-out-error')).toHaveCount(0);
  const d = await data(page);
  expect([d.steps[1].duration, d.steps[2].duration, d.steps[2].carried]).toEqual([AT, 1.18, CARRIED]);
  expect((await state(page)).history).toBe(start.history + 1);
  await undo(page); expect((await state(page)).js).toBe(original.js);
  // Dragged five frames later, the Out flag takes the exit with it and the graphic holds longer.
  const flag = page.getByRole('button', { name: 'Out flag', exact: true }), box = (await ruler.boundingBox())!, at = (await flag.boundingBox())!;
  await page.mouse.move(at.x + 1, at.y + at.height / 2); await page.mouse.down();
  await page.mouse.move(at.x + 1 + .2 / await extent(page) * box.width, at.y + at.height / 2, { steps: 8 }); await page.mouse.up(); await ready(page);
  const later = await data(page);
  expect(later.steps[1].duration).toBe(1.2);
  expect(later.steps[2]).toEqual(fixture().steps[2]);
});
