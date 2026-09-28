// covers: src/templates/shared/{easeRuntime,animRuntime,animRuntimeLegacy}.ts
// covers: src/blocks/{animEval,animEdit,editorOut,animMigration,editorAnimation,animData}.ts
// covers: src/validation/validateTemplate.ts, src/components/editorFoundation/**, e2e/fixtures/interpreter-pre-g01.js, e2e/fixtures/interpreter-shared-ease-v1.js
//
// G01 shared easing: the editor's sampler, exact split and exact reversal against the SAME
// evaluator executed by the bundled runtime in the simulator and in every exported package.
// Numbers are dense samples, not endpoints: GSAP silently plays power1.out for an ease it
// cannot read, and only a mid-segment sample can see that. R1.2a.1's Set Out across the last In
// key reuses the split, so its In-then-Out playback is compared here on one absolute clock.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';

type Key = { time: number; value: number; ease?: string };
type Data = { version: number; root: string; speed: number; steps: { name: string; duration: number; ease: string; layers: Record<string, Record<string, Key[]>> }[] };
type Pose = number[];
const PROPS = ['x', 'y', 'rotation', 'scaleX', 'opacity'];
const TARGETS = ['simulator', 'spx', 'casparcg', 'ograf', 'single-file'];

/** Two cues, eased with every family G01 claims; opacity overshoots past 1 to exercise clamping. */
function entrance(): Data {
  return { version: 2, root: '.fixture', speed: 1, steps: [
    { name: 'In', duration: 2, ease: 'none', layers: { '#box': {
      x: [{ time: 0, value: -900 }, { time: .8, value: -200, ease: 'power2.out' }, { time: 2, value: 0, ease: 'back.out(1.6)' }],
      y: [{ time: 0, value: 0 }, { time: .8, value: -120, ease: 'bounce.out' }, { time: 2, value: 0, ease: 'cubic-bezier(0.3,-0.4,0.6,1.5)' }],
      rotation: [{ time: 0, value: -30 }, { time: 2, value: 0, ease: 'elastic.out(1, 0.7)' }],
      scaleX: [{ time: 0, value: .5 }, { time: 2, value: 1, ease: 'expo.inOut' }],
      opacity: [{ time: 0, value: 0 }, { time: 1, value: 1, ease: 'back.out(1.6)' }, { time: 2, value: .5, ease: 'power2.in' }],
    } } },
    { name: 'Out', duration: 1, ease: 'none', layers: {} },
  ] };
}

async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}

/** A complete template around one animation literal, built from the running app's modules. */
async function template(page: Page, data: Data, title = false) {
  return page.evaluate(async ({ data, title }) => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    return { ...store.template, fps: 25, fields: [], layers: [],
      html: `<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="fixture"><div id="box" data-gfx></div>${title ? '<div id="title" data-gfx>Text and box</div>' : ''}</div></body></html>`,
      css: 'body{margin:0}.fixture{opacity:0}#box{position:absolute;left:500px;top:400px;width:320px;height:100px;background:#eeb844}#title{position:absolute;left:500px;top:420px;width:320px;height:100px;font:40px Arial;color:#111}',
      js: runtimeJs('Ease fixture', emitAnimRegion(data as never)) };
  }, { data, title });
}

/** Load a template in `target` and sample its layers (#box unless told) through its own play/stop
 *  timelines. Out is pressed after In completes, or at `interruptAt` while it still plays. */
async function execute(page: Page, t: unknown, target: string, times: number[], exitTimes: number[], durations: [number, number], layers = ['#box'], interruptAt?: number) {
  const output = await page.context().newPage();
  await output.setViewportSize({ width: 1920, height: 1080 });
  if (target === 'simulator' || target === 'single-file') {
    const html = await page.evaluate(async ({ t, target }) => target === 'simulator'
      ? (await import('/src/preview/composeDocument.ts')).composeDocument(t as never, { simulate: true })
      : (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(t as never), { t, target });
    await output.setContent(html);
  } else {
    const files = await page.evaluate(async ({ t, target }) => {
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(x => x.id === target)!.build(t as never);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, { t, target });
    await output.route('http://ease-package.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await output.goto('http://ease-package.local/');
      await output.evaluate(async () => {
        const mod = await import('http://ease-package.local/graphic.mjs'); customElements.define('ease-graphic', mod.default);
        const element = document.createElement('ease-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      });
    } else await output.goto('http://ease-package.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  }
  const result = await output.evaluate(async ({ target, times, exitTimes, durations, layers, interruptAt }) => {
    type Tl = { pause(): void; time(t: number, s?: boolean): void; progress(p: number, s?: boolean): void; duration(): number; getChildren(n: boolean, tw: boolean, tl: boolean): { vars: { ease?: unknown }; targets(): Element[]; duration(): number }[] };
    const w = window as unknown as { play(): void; stop(): void; gsap: { getProperty(e: Element, p: string): number; globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Tl[] } } };
    const element = document.querySelector('ease-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
    const command = async (action: 'play' | 'stop') => {
      if (target === 'simulator') window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-' + action, data: '{}' } }));
      else if (target === 'ograf') { if (action === 'play') await element.playAction({}); else await element.stopAction({}); }
      else w[action]();
    };
    const timeline = (d: number) => w.gsap.globalTimeline.getChildren(false, false, true).filter(x => Math.abs(x.duration() - d) < .0001).pop()!;
    const box = document.querySelector('#box')!;
    const pose = () => layers.flatMap(s => { const e = document.querySelector(s)!; return ['x', 'y', 'rotation', 'scaleX'].map(p => Number(w.gsap.getProperty(e, p))).concat(Number(getComputedStyle(e).opacity)); });
    await command('play'); const entry = timeline(durations[0]); entry.pause();
    // Which eases reached GSAP as strings: a recognized one must arrive as the shared function.
    const handed = entry.getChildren(true, true, false).filter(x => x.targets().includes(box) && x.duration() > 0).map(x => typeof x.vars.ease === 'function' ? 'function' : String(x.vars.ease));
    const entering = times.map(t => { entry.time(t, true); return pose(); });
    if (interruptAt === undefined) entry.progress(1, true); else entry.time(interruptAt, true);
    const held = pose(); await command('stop'); const released = pose();
    const exit = timeline(durations[1]); exit.pause();
    const leaving = exitTimes.map(t => { exit.time(t, true); return pose(); });
    return { entering, leaving, handed, held, released };
  }, { target, times, exitTimes, durations, layers, interruptAt });
  await output.close();
  return result;
}

const grid = (end: number, step = .02) => Array.from({ length: Math.round(end / step) + 1 }, (_, i) => Math.round(i * step * 1000) / 1000);
const TOLERANCE = [2e-3, 2e-3, 2e-3, 2e-3, 2e-3];
function near(actual: Pose[], expected: Pose[], label: string, tolerance = TOLERANCE) {
  let worst = { error: 0, at: -1, prop: '' };
  actual.forEach((pose, i) => pose.forEach((v, p) => {
    // A NaN on either side is a failure, never a pass. A pose may hold several layers of PROPS.
    const error = Math.abs(v - expected[i][p]) - tolerance[p % tolerance.length];
    if (!(error <= 0) && !(error <= worst.error)) worst = { error: Number.isNaN(error) ? Infinity : error, at: i, prop: PROPS[p % PROPS.length] + (p >= PROPS.length ? ' (layer ' + Math.floor(p / PROPS.length) + ')' : '') };
  }));
  expect(worst, `${label}: sample ${worst.at} ${worst.prop} beyond tolerance by ${worst.error}`).toEqual({ error: 0, at: -1, prop: '' });
}

for (const target of TARGETS) test('editor sampling equals the executed runtime in ' + target, async ({ page }) => {
  await open(page);
  const times = grid(2);
  const data = entrance();
  const reference = await page.evaluate(async ({ data, times }) => {
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    return times.map(t => ['x', 'y', 'rotation', 'scaleX', 'opacity'].map(p => Number(resolveValue(data as never, '#box', p, 0, t))));
  }, { data, times });
  const run = await execute(page, await template(page, data), target, times, [0], [2, 1]);
  expect(run.handed.length, 'the fixture tweens reached GSAP').toBe(8);
  expect.soft(run.handed, 'every recognized ease reaches GSAP as the shared function').toEqual(Array(8).fill('function'));
  near(run.entering, reference, target);
});

test('a stepped entrance never reverses into a wrong mirror', async ({ page }) => {
  await open(page);
  const data = entrance();
  data.steps[0].duration = 1;
  data.steps[0].layers['#box'] = { x: [{ time: 0, value: -900 }, { time: 1, value: 0, ease: 'steps(1)' }] };
  const reversed = await page.evaluate(async t => {
    try { return (await import('/src/blocks/editorOut.ts')).applyOut(t as never, { kind: 'out.reverse' }).js; } catch (e) { return String((e as Error).message); }
  }, await template(page, data));
  if (!reversed.includes('NOACG_ANIM')) { expect(reversed).toContain('cannot yet be reversed exactly'); return; }
  // Written anyway: then the exit must play the entrance backwards.
  const times = grid(1, .05);
  const run = await execute(page, { ...(await template(page, data)), js: reversed }, 'simulator', times, times.map(x => Math.round((1 - x) * 1000) / 1000), [1, 1]);
  near(run.leaving.map(p => [p[0]]), run.entering.map(p => [p[0]]), 'steps(1) Out(1 - t) against In(t)');
});

for (const target of TARGETS) test('split at 40 percent keeps samples, endpoints and boundary velocity in ' + target, async ({ page }) => {
  await open(page);
  const splits: [string, number][] = [['x', .32], ['x', 1.28], ['y', .32], ['y', 1.28], ['rotation', .8], ['scaleX', .8], ['opacity', 1.4]];
  const h = .01, points = splits.map(([, t]) => t);
  const times = [...new Set([...grid(2), ...points.flatMap(t => [t - h, t, t + h])])].sort((a, b) => a - b);
  const data = entrance();
  const split = await page.evaluate(async ({ data, splits }) => {
    const { splitKeyframeSegment } = await import('/src/blocks/animEdit.ts');
    return splits.reduce((d, [prop, t]) => splitKeyframeSegment(d, 0, '#box', prop, t), data as never) as unknown as Data;
  }, { data, splits });
  // Endpoints: the original keys are untouched and every split writes one sampled key.
  for (const prop of PROPS) {
    const before = data.steps[0].layers['#box'][prop], after = split.steps[0].layers['#box'][prop];
    expect(after.length, prop).toBe(before.length + splits.filter(([p]) => p === prop).length);
    for (const key of before) expect(after.find(k => k.time === key.time)?.value, prop + ' key ' + key.time).toBe(key.value);
  }
  const plain = await execute(page, await template(page, data), target, times, [0], [2, 1]);
  const cut = await execute(page, await template(page, split), target, times, [0], [2, 1]);
  near(cut.entering, plain.entering, target + ' dense samples');
  for (const [prop, t] of splits) {
    const p = PROPS.indexOf(prop), at = (x: number) => times.indexOf(x);
    const key = split.steps[0].layers['#box'][prop].find(k => k.time === t)!;
    expect(Math.abs(cut.entering[at(t)][p] - (prop === 'opacity' ? Math.min(1, Math.max(0, key.value)) : key.value)), prop + ' split endpoint').toBeLessThan(2e-3);
    for (const [a, b] of [[t - h, t], [t, t + h]]) {
      const before = (plain.entering[at(b)][p] - plain.entering[at(a)][p]) / h, after = (cut.entering[at(b)][p] - cut.entering[at(a)][p]) / h;
      expect(Math.abs(after - before), `${prop} velocity ${a}..${b}: ${before} vs ${after}`).toBeLessThan(.3 + Math.abs(before) * 2e-3);
    }
  }
});

for (const target of TARGETS) test('exact reversal plays the entrance backwards in ' + target, async ({ page }) => {
  await open(page);
  const data = entrance();
  data.steps[0].duration = 1.5;
  data.steps[0].layers['#box'] = {
    x: [{ time: 0, value: -900 }, { time: .4, value: -300, ease: 'back.out(1.6)' }, { time: 1, value: 0, ease: 'bounce.out' }],
    y: [{ time: 0, value: -50 }, { time: 1, value: 0, ease: 'cubic-bezier(0.3,-0.4,0.6,1.5)' }],
    rotation: [{ time: 0, value: -20 }, { time: .5, value: 10, ease: 'elastic.out(1, 0.7)' }, { time: 1, value: 0, ease: 'power3.in' }],
    scaleX: [{ time: 0, value: .5 }, { time: 1, value: 1, ease: 'slice(expo.out,0.2,0.9)' }],
    opacity: [{ time: 0, value: 0 }, { time: 1, value: 1, ease: 'sine.out' }],
  };
  const reversed = await page.evaluate(async t => {
    const { applyOut } = await import('/src/blocks/editorOut.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const js = applyOut(t as never, { kind: 'out.reverse' }).js;
    return { js, data: parseAnimData(js) as unknown as Data };
  }, await template(page, data));
  const out = reversed.data.steps[1].layers['#box'];
  // Ownership: the ease INTO each reversed key is the mirror of the original segment's ease.
  expect.soft(out.x).toEqual([{ time: .5, value: 0 }, { time: 1.1, value: -300, ease: 'bounce.in' }, { time: 1.5, value: -900, ease: 'back.in(1.6)' }]);
  expect.soft(out.y).toEqual([{ time: .5, value: 0 }, { time: 1.5, value: -50, ease: 'cubic-bezier(0.4,-0.5,0.7,1.4)' }]);
  expect.soft(out.rotation.map(k => k.ease)).toEqual([undefined, 'power3.out', 'elastic.in(1, 0.7)']);
  expect.soft(out.scaleX[1].ease).toBe('slice(expo.in,0.1,0.8)');
  expect.soft(out.opacity[1].ease).toBe('sine.in');
  const times = grid(1.5, .025);
  const t = { ...(await template(page, data)), js: reversed.js };
  const run = await execute(page, t, target, times, times.map(x => Math.round((1.5 - x) * 1000) / 1000), [1.5, 1.5]);
  near(run.leaving, run.entering, target + ' Out(1.5 - t) against In(t)');
});

/** R1.2a.1: a text-and-box entrance whose keys run past 1.2 s, eased with back, bounce,
 *  cubic-bezier and elastic, a box track that starts after 1.2 s, and a title Out that begins
 *  where its entrance ends. */
function textAndBox(): Data {
  return { version: 2, root: '.fixture', speed: 1, steps: [
    { name: 'In', duration: 2, ease: 'power1.inOut', layers: {
      '#box': {
        x: [{ time: 0, value: -900 }, { time: .8, value: -200, ease: 'power2.out' }, { time: 2, value: 0, ease: 'back.out(1.6)' }],
        y: [{ time: 0, value: 0 }, { time: .8, value: -120, ease: 'bounce.out' }, { time: 2, value: 0, ease: 'cubic-bezier(0.3,-0.4,0.6,1.5)' }],
        scaleX: [{ time: 1.4, value: .8 }, { time: 1.9, value: 1, ease: 'back.out(1.6)' }],
        opacity: [{ time: 0, value: 0 }, { time: 1, value: 1, ease: 'sine.out' }],
      },
      '#title': {
        x: [{ time: 0, value: -900 }, { time: 1.6, value: 0, ease: 'bounce.out' }],
        rotation: [{ time: 0, value: -20 }, { time: 2, value: 0, ease: 'elastic.out(1, 0.7)' }],
        scaleX: [{ time: .4, value: .5 }, { time: 1.8, value: 1 }],
        opacity: [{ time: 0, value: 0 }, { time: 1.5, value: 1, ease: 'cubic-bezier(0.2,0.6,0.4,1)' }],
      },
    } },
    { name: 'Out', duration: 1, ease: 'none', layers: { '#title': {
      x: [{ time: 0, value: 0 }, { time: 1, value: -900, ease: 'power2.in' }],
      opacity: [{ time: 0, value: 1 }, { time: 1, value: 0 }],
    } } },
  ] };
}

for (const target of TARGETS) test('Set Out before the last In key plays In then Out as the original in ' + target, async ({ page }) => {
  await open(page);
  const out = 1.2, h = .01;
  const original = await template(page, textAndBox(), true);
  const crossed = await page.evaluate(async ({ t, out }) => (await import('/src/blocks/editorOut.ts')).applyOut(t as never, { kind: 'out.set', time: out }), { t: original, out });
  // One absolute clock: In plays to its boundary and Out continues from there.
  const absolute = [...new Set([...grid(3), out - h, out, out + h])].sort((a, b) => a - b);
  const play = async (t: unknown, boundary: number, durations: [number, number]) => {
    const run = await execute(page, t, target, absolute.filter(u => u <= boundary),
      absolute.filter(u => u > boundary).map(u => Math.round((u - boundary) * 1000) / 1000), durations, ['#box', '#title']);
    return [...run.entering, ...run.leaving];
  };
  const before = await play(original, 2, [2, 1]), after = await play(crossed, out, [out, 1.8]);
  near(after, before, target + ' In then Out on one clock', [1e-3 + 1e-6]);
  // Boundary velocity on both sides of the new hold, the right side now played by Out. The values
  // alone allow 0.2 units/s here; the stored rounding moves smoothly, so the velocities agree closer.
  const at = (u: number) => absolute.indexOf(u);
  for (let p = 0; p < before[0].length; p++) for (const [a, b] of [[out - h, out], [out, out + h]]) {
    const v0 = (before[at(b)][p] - before[at(a)][p]) / h, v1 = (after[at(b)][p] - after[at(a)][p]) / h;
    expect(Math.abs(v1 - v0), `${PROPS[p % PROPS.length]} of layer ${Math.floor(p / PROPS.length)} velocity ${a}..${b}: ${v0} vs ${v1}`).toBeLessThan(.05 + Math.abs(v0) * 1e-3);
  }
});

for (const target of TARGETS) test('Out interrupting an In shortened across its keys plays each track to its end on the whole curve in ' + target, async ({ page }) => {
  await open(page);
  const out = 1.2, cut = .4, times = grid(1.8, .05);
  const crossed = await page.evaluate(async ({ t, out }) => (await import('/src/blocks/editorOut.ts')).applyOut(t as never, { kind: 'out.set', time: out }), { t: await template(page, textAndBox(), true), out });
  const run = await execute(page, crossed, target, [cut], times, [out, 1.8], ['#box', '#title'], cut);
  // D02: the first frame of the interrupted Out is the live pose.
  near([run.released], [run.held], target + ' no jump when Out interrupts', [1, 1, 1, .01, .01]);
  // Then each exit track tweens from that pose to its last key over its span. A sliced last ease
  // plays as the whole curve it was cut from; stretched as a slice it would swing far past its end.
  const expected = await page.evaluate(async ({ js, held, times, props }) => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { easeCurve, parseEase } = await import('/src/templates/shared/easeRuntime.ts');
    const exit = parseAnimData(js)!.steps[1];
    return times.map(t => ['#box', '#title'].flatMap((selector, layer) => props.map((prop, i) => {
      const keys = exit.layers[selector]?.[prop], live = held[layer * props.length + i];
      if (!keys || keys.length < 2) return live;
      const first = keys[0], last = keys[keys.length - 1], text = last.ease || exit.ease, parsed = parseEase(text);
      const curve = easeCurve(parsed?.kind === 'slice' ? parsed.base.text : text)!;
      const value = live + (Number(last.value) - live) * curve(Math.min(1, Math.max(0, (t - first.time) / (last.time - first.time))));
      return prop === 'opacity' ? Math.min(1, Math.max(0, value)) : value;
    })));
  }, { js: crossed.js, held: run.held, times, props: PROPS });
  near(run.leaving, expected, target + ' interrupted exit');
});

test('reversal and split refuse atomically where no exact form exists', async ({ page }) => {
  await open(page);
  const base = entrance();
  const result = await page.evaluate(async (base: Data) => {
    const { splitKeyframeSegment } = await import('/src/blocks/animEdit.ts');
    const { applyOut } = await import('/src/blocks/editorOut.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const clone = () => JSON.parse(JSON.stringify(base)) as Data;
    const refuse = (make: (d: Data) => Data, split: [string, number]) => {
      const d = make(clone()), before = JSON.stringify(d);
      try { splitKeyframeSegment(d as never, 0, '#box', split[0], split[1]); return 'split'; } catch (e) { return JSON.stringify(d) === before ? String((e as Error).message) : 'mutated'; }
    };
    const splits = {
      bounded: refuse(d => d, ['opacity', .4]),
      equalEndpoints: refuse(d => { d.steps[0].layers['#box'].x[2].ease = 'back.in(1.5)'; return d; }, ['x', 1.52]),
      stepped: refuse(d => { d.steps[0].layers['#box'].x[1].ease = 'steps(4)'; return d; }, ['x', .32]),
      unknown: refuse(d => { d.steps[0].layers['#box'].x[1].ease = 'customEase'; return d; }, ['x', .32]),
      onKey: refuse(d => d, ['x', .8]),
      outside: refuse(d => d, ['x', 2.4]),
    };
    const reverse = (ease: string) => {
      const d = clone(); d.steps[0].layers['#box'] = { x: [{ time: 0, value: -900 }, { time: 1, value: 0, ease }] };
      const t = { ...store.template, js: emitAnimRegion(d as never) };
      try { applyOut(t, { kind: 'out.reverse' }); return 'reversed'; } catch (e) { return String((e as Error).message); }
    };
    const flat = clone(); flat.steps[0].layers['#box'].y = [{ time: 0, value: 5 }, { time: 1, value: 5, ease: 'customEase' }];
    const flatSplit = (splitKeyframeSegment(flat as never, 0, '#box', 'y', .4) as unknown as Data).steps[0].layers['#box'].y;
    return { splits, stepped: reverse('steps(1)'), started: reverse('steps(1,true)'), custom: reverse('customEase'), flatSplit };
  }, base);
  for (const [name, message] of Object.entries(result.splits)) {
    expect(message, name).not.toBe('split'); expect(message, name).not.toBe('mutated');
    expect(message.length, name).toBeGreaterThan(20);
  }
  for (const message of [result.stepped, result.started, result.custom]) expect(message).toContain('cannot yet be reversed exactly');
  // A flat segment is constant under ANY ease, so its split is exact even for an unrecognized one.
  expect(result.flatSplit).toEqual([{ time: 0, value: 5 }, { time: .4, value: 5, ease: 'customEase' }, { time: 1, value: 5, ease: 'customEase' }]);
});

test('a saved pre-G01 interpreter upgrades to play exact eases; a custom one blocks export', async ({ page }) => {
  await open(page);
  const legacy = readFileSync(new URL('./fixtures/interpreter-pre-g01.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const data = entrance();
  const t = await template(page, data);
  // Played, not just read: the preview and an exported package of the OLD saved source upgrade
  // it on the way out and play the cubic-bezier and every other key as the editor samples them.
  const times = grid(2, .05);
  const reference = await page.evaluate(async ({ data, times }) => {
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    return times.map(t => ['x', 'y', 'rotation', 'scaleX', 'opacity'].map(p => Number(resolveValue(data as never, '#box', p, 0, t))));
  }, { data, times });
  const saved = await page.evaluate(async ({ js, legacy }) => js.replace((await import('/src/templates/shared/animRuntime.ts')).ANIM_INTERPRETER_JS, () => legacy), { js: t.js, legacy });
  expect(saved).not.toContain('function noacgEase(');
  for (const target of ['simulator', 'spx']) near((await execute(page, { ...t, js: saved }, target, times, [0], [2, 1])).entering, reference, 'pre-G01 source in ' + target);
  const result = await page.evaluate(async ({ t, legacy }) => {
    const { ANIM_INTERPRETER_JS, writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const { prepareOutRuntime } = await import('/src/blocks/animMigration.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const old = t.js.replace(ANIM_INTERPRETER_JS, () => legacy);
    const custom = old.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 0; window.customTail = true;');
    const data = parseAnimData(old)!;
    const upgraded = prepareOutRuntime(old), written = writeAnimData(old, data), refused = writeAnimData(custom, data);
    const ease = (js: string) => validateTemplate({ ...t, js }).errors.filter(e => e.rule === 'ease').map(e => e.message);
    return {
      replaced: old !== t.js, upgraded: upgraded.includes(ANIM_INTERPRETER_JS), written: !!written && written.includes(ANIM_INTERPRETER_JS),
      once: prepareOutRuntime(upgraded) === upgraded, saveFirst: ease(old).some(m => m.includes('Save the graphic once')),
      refused, customKept: prepareOutRuntime(custom) === custom,
      blocked: validateTemplate({ ...t, js: custom }).errors.some(e => e.rule === 'ease'),
      current: validateTemplate(t).errors.filter(e => e.rule === 'ease').map(e => e.message),
    };
  }, { t, legacy });
  expect(result).toEqual({ replaced: true, upgraded: true, written: true, once: true, saveFirst: true, refused: null, customKept: true, blocked: true, current: [] });
});

test('Set Out reverse in the editor writes mirrored destination eases as one undo', async ({ page }) => {
  await open(page);
  const t = await template(page, { version: 2, root: '.fixture', speed: 1, steps: [{ name: 'In', duration: 1, ease: 'none', layers: { '#box': {
    x: [{ time: 0, value: -900 }, { time: .4, value: -300, ease: 'back.out(1.6)' }, { time: 1, value: 0, ease: 'bounce.out' }],
    opacity: [{ time: 0, value: 0 }, { time: 1, value: 1, ease: 'cubic-bezier(0.2,0.6,0.4,1)' }],
  } } }] });
  // Ends on a store mutation, the evaluate that failed the nightly as a false navigation (#465).
  await evaluateInPage(page, async t => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true }), t);
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  const read = () => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home'); for (let i = 0; i < 25; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Reverse entrance' })).toBeVisible();
  const moved = await read();
  await page.getByRole('button', { name: 'Yes, reverse' }).click();
  await expect.poll(async () => (await read()) !== moved).toBe(true);
  const keys = await page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!.steps[1].layers['#box']);
  expect(keys.x.map(k => k.ease)).toEqual([undefined, 'bounce.in', 'back.in(1.6)']);
  expect(keys.opacity.map(k => k.ease)).toEqual([undefined, 'cubic-bezier(0.6,0,0.8,0.4)']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(read).toBe(moved);
});
