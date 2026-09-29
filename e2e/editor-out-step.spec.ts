// covers: src/templates/shared/{animRuntime,animRuntimeLegacy,easeRuntime}.ts
// covers: src/blocks/{animMigration,animMachine,animEval,animData}.ts, src/components/editorFoundation/**
// covers: e2e/fixtures/out-steps.json, e2e/fixtures/interpreter-hold-v1.js
//
// R1.2a.3 Out from any step (docs/research/editor-r1-2a-3): at the last step Out plays its authored
// exit from the held pose; at an earlier step each visible layer leaves from its live pose on the
// interrupted-Out policy and layers from unreached steps stay hidden. Played here by the bundled
// runtime in the simulator and every exported package, and by the editor's own Out button.
// scripts/out-step.test.mjs checks the same decisions in Node.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';

type Key = { time: number; value: number | string; ease?: string };
type Step = { name: string; duration: number; ease: string; layers: Record<string, Record<string, Key[]>>; spans?: Record<string, { start: number; end: number }[]>; reveals?: string[] };
type Data = { version: number; root: string; speed: number; steps: Step[]; machine?: unknown };
type Pose = number[];
const TARGETS = ['simulator', 'spx', 'casparcg', 'ograf', 'single-file'];
const LAYERS = ['#box', '#title', '#badge', '#outside'], PROPS = ['x', 'y', 'rotation', 'opacity'];
/** Cue lengths in seconds at speed 1.25, distinct so each target's timelines are found by length. */
const SECONDS = [.8, .48, .32, .88];
const steps = () => JSON.parse(readFileSync(new URL('./fixtures/out-steps.json', import.meta.url), 'utf8')) as Data;
const HTML = '<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="fixture"><div id="box" data-gfx></div><div id="title" data-gfx>Text and box</div><div id="badge" data-gfx>New</div></div><div id="outside" data-gfx>Outside</div></body></html>';
const CSS = 'body{margin:0}.fixture{opacity:0}#box{position:absolute;left:500px;top:400px;width:320px;height:100px;background:#eeb844}#title{position:absolute;left:500px;top:520px;width:320px;height:60px;font:40px Arial;color:#111}#badge{position:absolute;left:860px;top:400px;width:120px;height:60px;background:#2266cc;color:#fff}#outside{position:absolute;left:500px;top:640px;width:320px;height:60px;background:#444;color:#fff}';

async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}

/** A complete template around one animation literal, built from the running app's modules. */
async function template(page: Page, data: Data) {
  return page.evaluate(async ({ data, html, css }) => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    return { ...store.template, fps: 25, fields: [], layers: [], html, css, js: runtimeJs('Out step fixture', emitAnimRegion(data as never)) };
  }, { data, html: HTML, css: CSS });
}

/** What `target` serves for a template: the simulator or single-file document, or a package's files. */
async function build(page: Page, t: unknown, target: string) {
  return page.evaluate(async ({ t, target }) => {
    if (target === 'simulator') return { html: (await import('/src/preview/composeDocument.ts')).composeDocument(t as never, { simulate: true }) };
    if (target === 'single-file') return { html: (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(t as never) };
    const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(x => x.id === target)!.build(t as never);
    return { files: Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')]))) as Record<string, string> };
  }, { t, target });
}

type Run = { held: Pose; visible: string[]; released: Pose; leaving: Pose[]; appeared: string[]; root: string; nextAfterOut?: { same: boolean; started: boolean } };
/** Load the built graphic in a fresh page and play `nexts` Next cues after In, each settled, the
 *  last one stopped at `at` of its length when given; press Out and sample the exit at `times`. */
async function execute(page: Page, built: Awaited<ReturnType<typeof build>>, target: string, nexts: number, times: number[], { at, checkNext = false }: { at?: number; checkNext?: boolean } = {}): Promise<Run> {
  const output = await page.context().newPage();
  await output.setViewportSize({ width: 1920, height: 1080 });
  if (built.html) await output.setContent(built.html);
  else {
    const files = built.files!;
    await output.route('http://step-package.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await output.goto('http://step-package.local/');
      await output.evaluate(async () => {
        const mod = await import('http://step-package.local/graphic.mjs'); customElements.define('step-graphic', mod.default);
        const element = document.createElement('step-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      });
    } else await output.goto('http://step-package.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  }
  const result = await output.evaluate(async ({ target, nexts, times, at, checkNext, layers, seconds }) => {
    type Tl = { pause(): void; time(t: number, s?: boolean): void; progress(p: number, s?: boolean): void; duration(): number };
    const w = window as unknown as Record<string, () => unknown> & { gsap: { getProperty(e: Element, p: string): number; globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Tl[] } } };
    const element = document.querySelector('step-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
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
    // Opacity as seen: a hidden layer reads 0 whether a bar hid it (visibility) or a reveal pre-armed it.
    const seen = (style: CSSStyleDeclaration) => style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
    const pose = () => layers.flatMap(s => { const e = document.querySelector(s)!; return ['x', 'y', 'rotation'].map(p => Number(w.gsap.getProperty(e, p))).concat(seen(getComputedStyle(e))); });
    const shown = (s: string) => { const style = getComputedStyle(document.querySelector(s)!); return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0; };
    await command('play');
    let cue = timeline(seconds[0]);
    for (let i = 0; i <= nexts; i++) {
      if (i > 0) { await command('next'); cue = timeline(seconds[i]); }
      cue.pause();
      if (i === nexts && at !== undefined) cue.time(cue.duration() * at, true); else cue.progress(1, true);
    }
    const held = pose(), visible = layers.filter(shown), hidden = layers.filter(s => !visible.includes(s));
    await command('stop');
    const released = pose();
    const exit = timeline(seconds[3]); exit.pause();
    const appeared = new Set<string>();
    const leaving = times.map(t => { exit.time(t, true); hidden.filter(shown).forEach(s => appeared.add(s)); return pose(); });
    const root = getComputedStyle(document.querySelector('.fixture')!).opacity;
    let nextAfterOut;
    if (checkNext) {
      exit.time(.2, true);
      const before = JSON.stringify(pose()), count = all().length;
      // OGraf's playAction after Out plays again (its step model), so ask its runtime for next().
      if (target === 'simulator') await command('next');
      else if (target === 'ograf') (element as unknown as { _runtime: { next(): unknown } })._runtime.next();
      else w.next();
      nextAfterOut = { same: JSON.stringify(pose()) === before, started: all().length !== count };
    }
    return { held, visible, released, leaving, appeared: [...appeared], root, nextAfterOut };
  }, { target, nexts, times, at, checkNext, layers: LAYERS, seconds: SECONDS });
  await output.close();
  return result;
}

/** The expected exit, from the app's own shared ease and sampler: the interrupted-Out policy (live
 *  value to last key over the track's span, whole last curve, a final jump where its segment starts,
 *  cuts for one-key tracks) or the authored Out from the held pose. A press-revealed layer outside
 *  the root that Out does not animate fades over 0.3 units on GSAP's default ease. */
function model(page: Page, data: Data, run: Run, times: number[], kind: 'interrupted' | 'authored') {
  return page.evaluate(async ({ data, held, visible, times, kind, layers, props }) => {
    const { easeCurve, parseEase } = await import('/src/templates/shared/easeRuntime.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const exit = data.steps[data.steps.length - 1], index = data.steps.length - 1;
    return times.map(t => layers.flatMap((s, l) => props.map((p, i) => {
      const u = t * data.speed, live = held[l * props.length + i], keys = exit.layers[s]?.[p];
      const clamp = (v: number) => p === 'opacity' ? Math.min(1, Math.max(0, v)) : v;
      if (!visible.includes(s)) return live;
      if (!keys) return s === '#outside' && p === 'opacity' ? live * (1 - easeCurve('power1.out')!(Math.min(1, u / Math.min(.3, exit.duration)))) : live;
      if (kind === 'authored') return clamp(Number(resolveValue(data as never, s, p, index, u)));
      const first = keys[0], last = keys[keys.length - 1];
      if (keys.length < 2 || last.time <= first.time) return clamp(Number(first.value));
      const text = last.ease || exit.ease, parsed = parseEase(text);
      const from = parsed?.kind === 'jump' ? keys[keys.length - 2].time : first.time;
      if (u < from) return live;
      const curve = easeCurve(parsed?.kind === 'slice' ? parsed.base.text : text)!;
      return clamp(live + (Number(last.value) - live) * curve(Math.min(1, (u - from) / (last.time - from))));
    })));
  }, { data, held: run.held, visible: run.visible, times, kind, layers: LAYERS, props: PROPS });
}

const grid = (end: number, step = .02) => Array.from({ length: Math.round(end / step) + 1 }, (_, i) => Math.round(i * step * 1000) / 1000);
const label = (p: number) => LAYERS[Math.floor(p / PROPS.length)] + ' ' + PROPS[p % PROPS.length];
function near(actual: Pose[], expected: Pose[], what: string, tolerance = [2e-3]) {
  let worst = { error: 0, at: -1, prop: '' };
  actual.forEach((pose, i) => pose.forEach((v, p) => {
    // A NaN on either side is a failure, never a pass.
    const error = Math.abs(v - expected[i][p]) - tolerance[p % tolerance.length];
    if (!(error <= 0) && !(error <= worst.error)) worst = { error: Number.isNaN(error) ? Infinity : error, at: i, prop: `${label(p)} ${v} vs ${expected[i][p]}` };
  }));
  expect.soft(worst, `${what}: sample ${worst.at} ${worst.prop} beyond tolerance by ${worst.error}`).toEqual({ error: 0, at: -1, prop: '' });
}
/** D02's dispatch bound: under 1 px per position channel (and a degree) and .01 opacity. */
const DISPATCH = [1, 1, 1, .01];
const TIMES = grid(.88);

for (const target of TARGETS) test('Out from each step leaves from what is on screen in ' + target, async ({ page }) => {
  await open(page);
  const data = steps(), built = await build(page, await template(page, data), target);
  // Earlier steps: parked after In, and after the first of two Next cues.
  for (const [nexts, unreached] of [[0, ['#badge', '#outside']], [1, ['#outside']]] as const) {
    const where = `${target} parked ${nexts ? 'after Step 2' : 'after In'}`;
    const run = await execute(page, built, target, nexts, TIMES, { checkNext: nexts === 0 });
    expect.soft(LAYERS.filter(s => !run.visible.includes(s)), where + ': unreached layers are hidden').toEqual([...unreached]);
    near([run.released], [run.held], where + ': no jump when Out is pressed', DISPATCH);
    near(run.leaving, await model(page, data, run, TIMES, 'interrupted'), where + ': the interrupted exit');
    expect.soft(run.appeared, where + ': nothing from an unreached step appears').toEqual([]);
    expect.soft(run.root, where + ': the root is hidden at the end').toBe('0');
    if (run.nextAfterOut) expect.soft(run.nextAfterOut, where + ': Next after Out plays nothing').toEqual({ same: true, started: false });
  }
  // The last step: the authored exit from the held pose, as before.
  const last = await execute(page, built, target, 2, TIMES);
  near(last.leaving, await model(page, data, last, TIMES, 'authored'), target + ' after Step 3: the authored exit');
  // Out during In and during each Next cue: interrupted, as before.
  for (const nexts of [0, 1, 2]) {
    const where = `${target} 40% into ${['In', 'Step 2', 'Step 3'][nexts]}`;
    const run = await execute(page, built, target, nexts, TIMES, { at: .4 });
    near([run.released], [run.held], where + ': no jump when Out is pressed', DISPATCH);
    near(run.leaving, await model(page, data, run, TIMES, 'interrupted'), where + ': the interrupted exit');
  }
});

async function editorPose(page: Page) {
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  return frame.evaluate(layers => {
    const w = window as unknown as { gsap: { getProperty(e: Element, p: string): number } };
    const seen = (style: CSSStyleDeclaration) => style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
    return layers.flatMap(s => { const e = document.querySelector(s)!; return ['x', 'y', 'rotation'].map(p => Number(w.gsap.getProperty(e, p))).concat(seen(getComputedStyle(e))); });
  }, LAYERS);
}
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    return Math.abs(Number(document.querySelector('[data-testid=foundation-canvas]')!.getAttribute('data-pose-time')) - view.time) < .00001;
  })).toBe(true);
}

test('the editor Out button from a flag plays what the simulator plays', async ({ page }) => {
  await page.clock.install(); await open(page);
  const data = steps(), t = await template(page, data);
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true });
  }, t);
  await ready(page);
  const simulator = await build(page, t, 'simulator');
  // The flag after In (an earlier step: two Next cues remain), then the last flag.
  for (const [frames, nexts, kind] of [[20, 0, 'interrupted'], [40, 2, 'authored']] as const) {
    // The preview answers on animation frames, so seek on a running clock and sample on a paused one.
    await page.clock.resume();
    const ruler = page.getByRole('slider', { name: 'Playhead' });
    await ruler.focus(); await ruler.press('Home');
    for (let i = 0; i < frames / 10; i++) await ruler.press('Shift+ArrowRight');
    await expect(ruler).toHaveAttribute('aria-valuenow', String(frames / 25)); await ready(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    const held = await editorPose(page), times: number[] = [], poses: Pose[] = [];
    await page.getByRole('button', { name: 'Out', exact: true }).click();
    for (let k = 0; k < 6; k++) {
      await page.clock.runFor(k ? 130 : 20);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.clock.runFor(100); await ready(page);
      times.push(await page.evaluate(async () => {
        const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
        const { readTimeline } = await import('/src/components/editorFoundation/timelineView.ts');
        const session = activeEditorSession();
        return session.port.view().time - readTimeline(session.port.read()).out;
      }));
      poses.push(await editorPose(page));
      if (k < 5) await page.getByRole('button', { name: 'Play', exact: true }).click();
    }
    const runtime = await execute(page, simulator, 'simulator', nexts, times);
    near([held], [runtime.held], `editor parked at frame ${frames}: the pose Out leaves from`);
    near(poses, runtime.leaving, `editor Out from frame ${frames} against the simulator`);
    near(poses, await model(page, data, { ...runtime, held }, times, kind), `editor Out from frame ${frames}`);
  }
});

test('a graphic saved with the R1.2a.2 interpreter upgrades once and then leaves from any step', async ({ page }) => {
  await open(page);
  const before = readFileSync(new URL('./fixtures/interpreter-hold-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const data = steps(), t = await template(page, data);
  const saved = await page.evaluate(async ({ js, before }) => js.replace((await import('/src/templates/shared/animRuntime.ts')).ANIM_INTERPRETER_JS, () => before), { js: t.js, before });
  expect(saved).toContain('Capability: shared-ease-v2.');
  expect(saved).not.toBe(t.js);
  for (const target of ['simulator', 'spx', 'ograf']) {
    const run = await execute(page, await build(page, { ...t, js: saved }, target), target, 0, TIMES);
    near([run.released], [run.held], `R1.2a.2 source in ${target}: no jump when Out is pressed after In`, DISPATCH);
    near(run.leaving, await model(page, data, run, TIMES, 'interrupted'), `R1.2a.2 source in ${target}: the interrupted exit`);
  }
  const result = await page.evaluate(async ({ js, saved, before }) => {
    const { ANIM_INTERPRETER_JS, writeOutData } = await import('/src/templates/shared/animRuntime.ts');
    const { ANIM_INTERPRETER_BEFORE_STEP_OUT_HASH } = await import('/src/templates/shared/animRuntimeLegacy.ts') as Record<string, string>;
    const { prepareOutRuntime } = await import('/src/blocks/animMigration.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { contentHash } = await import('/src/model/contentHash.ts');
    const upgraded = prepareOutRuntime(saved);
    return { known: contentHash(before.trim()) === ANIM_INTERPRETER_BEFORE_STEP_OUT_HASH, upgraded: upgraded === js, once: prepareOutRuntime(upgraded) === upgraded,
      written: writeOutData(saved, parseAnimData(saved)!) === js, current: upgraded.includes(ANIM_INTERPRETER_JS) };
  }, { js: t.js, saved, before });
  expect(result).toEqual({ known: true, upgraded: true, once: true, written: true, current: true });
});

test('a machine graphic parked at its first state keeps its authored exit', async ({ page }) => {
  await open(page);
  const data = steps();
  data.machine = await page.evaluate(async d => (await import('/src/blocks/animMachine.ts')).deriveMachine(d as never), data);
  const t = await template(page, data);
  for (const target of ['simulator', 'ograf']) {
    const run = await execute(page, await build(page, t, target), target, 0, TIMES);
    // As before: the Out's first keys apply as it starts, here the box at its last-step x of 300.
    expect.soft(run.released[0], target).toBe(300);
    near(run.leaving, await model(page, data, run, TIMES, 'authored'), `machine in ${target}: the authored exit`);
  }
});
