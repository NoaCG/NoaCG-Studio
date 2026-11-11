// covers: src/templates/shared/{animRuntime,animRuntimeLegacy,easeRuntime}.ts, src/model/spxDefinition.ts
// covers: src/blocks/{animEdit,editorSteps,editorOut,editorAnimation,animMigration,animMachine,animEval,animData}.ts, src/components/editorFoundation/**
// covers: e2e/fixtures/steps-authoring.json, e2e/fixtures/interpreter-step-out-v1.js
//
// R1.2a.4 step authoring (docs/research/editor-r1-2a-4): Add Step at the playhead, rename, delete
// and flag drags keep every key and bar at its absolute time on the concatenated ruler, as one undo
// each, and refuse atomically where the runtime could not play the result exactly. Played here by
// the bundled runtime in the simulator and every exported package, and through the editor's own
// controls. scripts/step-authoring.test.mjs checks the same decisions densely in Node.

import { test, expect, type Page } from '@playwright/test';
import { installGraphicBody } from './_graphicBody';
import { readFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';

type Key = { time: number; value: number | string; ease?: string };
type Step = { name: string; duration: number; ease: string; layers: Record<string, Record<string, Key[]>>; spans?: Record<string, { start: number; end: number }[]>; reveals?: string[]; hides?: string[] };
type Data = { version: number; root: string; speed: number; steps: Step[]; machine?: unknown };
type Template = { js: string; html: string; css: string; settings: Record<string, string> };
type Pose = number[];
type Sample = { key: string; t: number; left?: boolean };
const TARGETS = ['simulator', 'spx', 'casparcg', 'ograf', 'single-file'];
const LAYERS = ['#box', '#title', '#badge', '#tag'], PROPS = ['x', 'y', 'rotation'];
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/steps-authoring.json', import.meta.url), 'utf8')) as Data;
/** Cue lengths in seconds. The fixture's cues, and the halves of every split below, have distinct
 *  lengths, so each target's timelines are found by length. */
const secondsOf = (data: Data) => data.steps.map(s => s.duration / data.speed);
const HTML = '<!doctype html><html><head><link rel="stylesheet" href="css/template.css"><script src="js/gsap.min.js"></script><script src="js/template.js"></script></head><body><div class="fixture"><div id="box" data-gfx></div><div id="title" data-gfx>Step by step</div><div id="badge" data-gfx>New</div><div id="tag" data-gfx>Tag</div></div></body></html>';
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
      js: runtimeJs('Steps fixture', emitAnimRegion(data as never)) };
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

type Run = { poses: Record<string, Pose>; held: Pose; visible: string[]; released: Pose; leaving: Pose[]; retaken?: Pose };
/**
 * Load the built graphic in a fresh page and walk it. With `cues`, each pre-Out cue is sampled at its
 * local times (a `left` sample reads visibility a microsecond earlier, the left limit) and settled,
 * and Next is pressed at every flag; otherwise `nexts` Next cues are played and settled. Then Out,
 * sampled at `exit` seconds on its own clock.
 */
async function run(page: Page, built: Built, target: string, seconds: number[], { cues, nexts = seconds.length - 2, exit, layers = LAYERS, props = PROPS, root = '.fixture', retake = false, svgParent, interruptAt, outLength, repeatStopAt }:
  { cues?: Sample[][]; nexts?: number; exit: number[]; layers?: string[]; props?: string[]; root?: string; retake?: boolean; svgParent?: string; interruptAt?: number; outLength?: number; repeatStopAt?: number }): Promise<Run> {
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
      await installGraphicBody(output);
      await output.goto('http://step-package.local/');
      await output.evaluate(async () => {
        const mod = await import('http://step-package.local/graphic.mjs'); customElements.define('step-graphic', mod.default);
        const element = document.createElement('step-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      });
    } else await output.goto('http://step-package.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  }
  const result = await output.evaluate(async ({ target, seconds, cues, nexts, exit, layers, props, root, retake, svgParent, interruptAt, outLength, repeatStopAt }) => {
    type Tl = { pause(): void; time(t: number, s?: boolean): void; progress(p: number, s?: boolean): void; duration(): number };
    const w = window as unknown as Record<string, () => unknown> & { gsap: { getProperty(e: Element, p: string): number; globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Tl[] } } };
    const element = document.querySelector('step-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
    const body: ParentNode = target === 'ograf' ? graphicBody(element) : document;
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
    // Opacity as seen: 0 for a layer a bar or a reveal hides, and scaled by how much of it its
    // nearest clipping parent inside the graphic shows (a row waiting below its mask is hidden too).
    const clipped = (e: Element) => {
      const r = e.getBoundingClientRect();
      for (let p = e.parentElement; p && !p.matches(root); p = p.parentElement) {
        if (getComputedStyle(p).overflow === 'visible') continue;
        const q = p.getBoundingClientRect(), w = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)), h = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
        return r.width * r.height ? w * h / (r.width * r.height) : 1;
      }
      return 1;
    };
    const seen = (e: Element, style: CSSStyleDeclaration) => style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity) * clipped(e);
    const parent = svgParent ? body.querySelector<SVGGraphicsElement>(svgParent) : null;
    const matrix = (e: Element) => {
      const { a, b, c, d, e: x, f: y } = parent!.getScreenCTM()!.inverse().multiply((e as SVGGraphicsElement).getScreenCTM()!);
      return [a, b, c, d, x, y];
    };
    const svgOpacity = (e: Element) => {
      let opacity = 1;
      for (let node: Element | null = e; node && !node.matches(root); node = node.parentElement) opacity *= seen(node, getComputedStyle(node));
      return opacity;
    };
    const pose = () => layers.flatMap(s => {
      const e = body.querySelector(s)!;
      return parent ? [...matrix(e), svgOpacity(e)] : props.map(p => Number(w.gsap.getProperty(e, p))).concat(seen(e, getComputedStyle(e)));
    });
    const shown = (s: string) => {
      const e = body.querySelector(s)!, style = getComputedStyle(e);
      return parent ? svgOpacity(e) > 0 : style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
    };
    const poses: Record<string, number[]> = {}, width = parent ? 7 : props.length + 1;
    await command('play');
    let cue = timeline(seconds[0]);
    const walked = cues ? seconds.length - 2 : nexts;
    for (let i = 0; i <= walked; i++) {
      if (i > 0) { await command('next'); cue = timeline(seconds[i]); }
      cue.pause();
      for (const sample of cues?.[i] ?? []) {
        cue.time(sample.t, true);
        const at = pose();
        if (sample.left) { cue.time(Math.max(0, sample.t - 1e-6), true); const before = pose(); at.forEach((_, j) => { if (j % width === width - 1) at[j] = before[j]; }); }
        poses[sample.key] = at;
      }
      if (i === walked && interruptAt !== undefined) cue.time(interruptAt, true);
      else cue.progress(1, true);
    }
    const held = pose(), visible = layers.filter(shown);
    await command('stop');
    const released = pose();
    const duration = outLength ?? seconds[seconds.length - 1], out = timeline(duration); out.pause();
    const leaving: Pose[] = [];
    for (const t of exit) {
      out.time(t, true);
      if (t === repeatStopAt) {
        await command('stop');
        if (timeline(duration) !== out) throw new Error('Repeated Stop replaced its live timeline.');
      }
      leaving.push(pose());
    }
    const result = { poses, held, visible, released, leaving };
    if (!retake) return result;
    await command('play');
    timeline(seconds[0]).pause();
    return { ...result, retaken: pose() };
  }, { target, seconds, cues, nexts, exit, layers, props, root, retake, svgParent, interruptAt, outLength, repeatStopAt });
  await output.close();
  return result;
}

/** Sample keys on the concatenated ruler for `data`: every point, on each side of a flag ('a' the
 *  arriving cue's end, 'd' the departing cue's start) and, away from this graphic's flags, the value
 *  there ('d') and its left limit ('a'), so two graphics whose flags differ compare key by key. */
function plan(data: Data, points: number[]) {
  const seconds = secondsOf(data), last = seconds.length - 1;
  const starts = seconds.reduce<number[]>((acc, s, i) => [...acc, acc[i] + s], [0]);
  const cues: Sample[][] = seconds.slice(0, last).map(() => []);
  for (const point of points) {
    const key = point.toFixed(4), flag = starts.findIndex((s, i) => i > 0 && i <= last && Math.abs(s - point) < 1e-9);
    if (flag > 0) {
      cues[flag - 1].push({ key: key + ':a', t: seconds[flag - 1] });
      if (flag < last) cues[flag].push({ key: key + ':d', t: 0 });
      continue;
    }
    const c = starts.findIndex((s, i) => i < last && point >= s - 1e-9 && point < starts[i + 1]);
    cues[c].push({ key: key + ':d', t: point - starts[c] });
    if (point > 0) cues[c].push({ key: key + ':a', t: point - starts[c], left: true });
  }
  return cues;
}
const flagsOf = (data: Data) => secondsOf(data).slice(0, -1).reduce<number[]>((acc, s) => [...acc, acc[acc.length - 1] + s], [0]).slice(1);
const grid = (end: number, step = .02) => Array.from({ length: Math.round(end / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
/** Walk both graphics on one set of points (a grid and every flag of either) and Out from the last step. */
async function ruler(page: Page, target: string, pairs: { data: Data; built: Built }[]) {
  const total = flagsOf(pairs[0].data).slice(-1)[0];
  const points = [...new Set([...grid(total), ...pairs.flatMap(p => flagsOf(p.data))].map(p => Math.round(p * 1e6) / 1e6))].sort((a, b) => a - b);
  const exit = grid(secondsOf(pairs[0].data).slice(-1)[0]);
  return Promise.all(pairs.map(async ({ data, built }) => {
    const walked = await run(page, built, target, secondsOf(data), { cues: plan(data, points), exit });
    return { ...walked.poses, ...Object.fromEntries(walked.leaving.map((pose, i) => ['out:' + exit[i], pose])) };
  }));
}
const label = (p: number, props = PROPS) => LAYERS[Math.floor(p / (props.length + 1))] + ' ' + [...props, 'seen opacity'][p % (props.length + 1)];
function same(actual: Record<string, Pose>, expected: Record<string, Pose>, what: string, { tolerance = 1e-3, props = PROPS, layers = LAYERS } = {}) {
  expect.soft(Object.keys(actual).sort(), what + ': the same samples').toEqual(Object.keys(expected).sort());
  let worst = { error: 0, at: '' };
  const width = props.length + 1;
  for (const [key, pose] of Object.entries(actual)) pose.forEach((v, p) => {
    // A layer hidden on both sides shows none of its values: a join may start them from another value there.
    const seen = p - p % width + width - 1;
    if (p !== seen && pose[seen] === 0 && expected[key]?.[seen] === 0) return;
    const error = Math.abs(v - (expected[key]?.[p] ?? NaN)) - tolerance;
    if (!(error <= 0) && !(error <= worst.error)) worst = { error: Number.isNaN(error) ? Infinity : error, at: `${key} ${layers[Math.floor(p / width)]} ${[...props, 'seen opacity'][p % width]} ${v} vs ${expected[key]?.[p]}` };
  });
  expect.soft(worst, `${what}: ${worst.at} beyond ${tolerance} by ${worst.error}`).toEqual({ error: 0, at: '' });
}
function near(actual: Pose[], expected: Pose[], what: string, tolerance = [2e-3]) {
  let worst = { error: 0, at: -1, prop: '' };
  actual.forEach((pose, i) => pose.forEach((v, p) => {
    const error = Math.abs(v - expected[i][p]) - tolerance[p % tolerance.length];
    if (!(error <= 0) && !(error <= worst.error)) worst = { error: Number.isNaN(error) ? Infinity : error, at: i, prop: `${label(p)} ${v} vs ${expected[i][p]}` };
  }));
  expect.soft(worst, `${what}: sample ${worst.at} ${worst.prop} beyond tolerance by ${worst.error}`).toEqual({ error: 0, at: -1, prop: '' });
}
/** D02's dispatch bound: under 1 px per position channel (and a degree) and .01 opacity. */
const DISPATCH = [1, 1, 1, .01];

/** The expected exit, from the app's own shared ease and sampler: from an earlier step the
 *  interrupted-Out policy (live value to each track's last key over its span, whole last curve,
 *  a final jump where its segment starts) with a one-key or zero-time track holding its live value
 *  until the exit ends (owner decision 2026-09-30); from the last step the authored Out. */
function model(page: Page, data: Data, held: Pose, visible: string[], times: number[], kind: 'early' | 'authored') {
  return page.evaluate(async ({ data, held, visible, times, kind, layers, props }) => {
    const { easeCurve, parseEase } = await import('/src/templates/shared/easeRuntime.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const exit = data.steps[data.steps.length - 1], index = data.steps.length - 1, all = [...props, 'opacity'];
    return times.map(t => layers.flatMap((s, l) => all.map((p, i) => {
      const u = t * data.speed, live = held[l * all.length + i], keys = exit.layers[s]?.[p];
      const clamp = (v: number) => p === 'opacity' ? Math.min(1, Math.max(0, v)) : v;
      if (!visible.includes(s) || !keys) return live;
      if (kind === 'authored') return clamp(Number(resolveValue(data as never, s, p, index, u)));
      const first = keys[0], last = keys[keys.length - 1];
      if (keys.length < 2 || last.time <= first.time) return clamp(u >= exit.duration - 1e-9 ? Number(last.value) : live);
      const text = last.ease || exit.ease, parsed = parseEase(text);
      const from = parsed?.kind === 'jump' ? keys[keys.length - 2].time : first.time;
      if (u < from) return live;
      const curve = easeCurve(parsed?.kind === 'slice' ? parsed.base.text : text)!;
      return clamp(live + (Number(last.value) - live) * curve(Math.min(1, (u - from) / (last.time - from))));
    })));
  }, { data, held, visible, times, kind, layers: LAYERS, props: PROPS });
}

/** Add Step positions in frames at 25 fps: on a key, on a bar edge, inside a held segment and
 *  inside a Next cue. Each also splits eased segments of other tracks. */
const ADDS = [10, 14, 18, 28];
const EXIT = grid(secondsOf(fixture()).slice(-1)[0]);

for (const target of TARGETS) test('step authoring keeps playback on the ruler in ' + target, async ({ page }) => {
  await open(page);
  const data = fixture(), original = await template(page, data), builtOriginal = await build(page, original, target);
  for (const frame of ADDS) {
    const added = await operate(page, original, [{ kind: 'step.add', time: frame / 25 }]), addedData = await dataOf(page, added);
    expect.soft(addedData.steps.length, `frame ${frame}: one more cue`).toBe(data.steps.length + 1);
    expect.soft(added.settings.steps, `frame ${frame}: the step count`).toBe(String(data.steps.length));
    expect.soft(added.html, `frame ${frame}: the SPX definition`).toContain(`"steps": "${data.steps.length}"`);
    const [after, before] = await ruler(page, target, [{ data: addedData, built: await build(page, added, target) }, { data, built: builtOriginal }]);
    same(after, before, `${target}: Add Step at frame ${frame}, In, Next at every flag and Out`);
    // Delete gives back the exact source.
    const cue = addedData.steps.findIndex((_, i) => i > 0 && Math.abs(flagsOf(addedData)[i - 1] - frame / 25) < 1e-9);
    const removed = await operate(page, added, [{ kind: 'step.delete', step: cue }]);
    expect.soft([removed.js === original.js, removed.html === original.html, removed.settings.steps], `frame ${frame}: Add Step then Delete`).toEqual([true, true, original.settings.steps]);
  }
  // Deleting the fixture's own Step joins it into In and plays the same.
  const joined = await operate(page, original, [{ kind: 'step.delete', step: 1 }]), joinedData = await dataOf(page, joined);
  expect.soft(joined.settings.steps).toBe('1');
  const [one, two] = await ruler(page, target, [{ data: joinedData, built: await build(page, joined, target) }, { data, built: builtOriginal }]);
  same(one, two, `${target}: Delete Step 2`);
  // A flag drag plays the same.
  const moved = await operate(page, original, [{ kind: 'step.move', step: 1, time: 30 / 25 }]), movedData = await dataOf(page, moved);
  const [dragged, still] = await ruler(page, target, [{ data: movedData, built: await build(page, moved, target) }, { data, built: builtOriginal }]);
  same(dragged, still, `${target}: Step 2 dragged to frame 30`);
  // Parked at a new flag, an earlier step: Out leaves from the live pose, and the badge's one-key
  // Out track holds its live value until the exit ends.
  const split = await operate(page, original, [{ kind: 'step.add', time: 18 / 25 }]), splitData = await dataOf(page, split);
  const early = await run(page, await build(page, split, target), target, secondsOf(splitData), { nexts: 0, exit: EXIT });
  expect.soft(early.visible, `${target} at the new flag: the badge is on screen`).toContain('#badge');
  near([early.released], [early.held], `${target} at the new flag: no jump when Out is pressed`, DISPATCH);
  near(early.leaving, await model(page, splitData, early.held, early.visible, EXIT, 'early'), `${target} at the new flag: the interrupted exit`);
  // From the last step the one-key track still cuts: the badge takes -40 as Out starts.
  const last = await run(page, builtOriginal, target, secondsOf(data), { nexts: 1, exit: EXIT });
  expect.soft(last.released[2 * (PROPS.length + 1) + 1], `${target} at the last step: the one-key Out track cuts`).toBe(-40);
  near(last.leaving, await model(page, data, last.held, last.visible, EXIT, 'authored'), `${target} at the last step: the authored exit`);
});

test('a graphic saved with the R1.2a.3 interpreter upgrades once and then holds a one-key Out track', async ({ page }) => {
  await open(page);
  const before = readFileSync(new URL('./fixtures/interpreter-step-out-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const data = fixture(), t = await template(page, data);
  const saved = await page.evaluate(async ({ js, before }) => js.replace((await import('/src/templates/shared/animRuntime.ts')).ANIM_INTERPRETER_JS, () => before), { js: t.js, before });
  expect(saved).not.toBe(t.js);
  for (const target of ['simulator', 'spx', 'ograf']) {
    const run1 = await run(page, await build(page, { ...t, js: saved }, target), target, secondsOf(data), { nexts: 0, exit: EXIT });
    near(run1.leaving, await model(page, data, run1.held, run1.visible, EXIT, 'early'), `R1.2a.3 source in ${target}: the one-key track holds`);
  }
  const result = await page.evaluate(async ({ js, saved, before }) => {
    const { ANIM_INTERPRETER_JS, writeOutData } = await import('/src/templates/shared/animRuntime.ts');
    const legacy = await import('/src/templates/shared/animRuntimeLegacy.ts') as Record<string, string>;
    const { prepareOutRuntime } = await import('/src/blocks/animMigration.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { contentHash } = await import('/src/model/contentHash.ts');
    const upgraded = prepareOutRuntime(saved);
    return { known: contentHash(before.trim()) === legacy.ANIM_INTERPRETER_BEFORE_ONE_KEY_HOLD_HASH, upgraded: upgraded === js, once: prepareOutRuntime(upgraded) === upgraded,
      written: writeOutData(saved, parseAnimData(saved)!) === js, current: upgraded.includes(ANIM_INTERPRETER_JS) };
  }, { js: t.js, saved, before });
  expect(result).toEqual({ known: true, upgraded: true, once: true, written: true, current: true });
});

// ---- The editor ----

async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template) as Promise<Template>; }
async function data(page: Page) { return page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!) as Promise<Data>; }
async function history(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().history.length); }
async function state(page: Page) { const t = await source(page); return { js: t.js, html: t.html, steps: t.settings.steps, history: await history(page) }; }
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
}
/** The editor on a paused-clock-ready page with `t` applied. */
async function editorWith(page: Page, t: Template | Data) {
  await page.clock.install(); await open(page);
  const applied = 'steps' in t ? await template(page, t) : t;
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true });
  }, applied);
  await ready(page);
  return applied;
}
async function seekFrames(page: Page, frames: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(frames / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < frames % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(frames / 25)); await ready(page);
}
const flag = (page: Page, name: string) => page.getByRole('button', { name: name + ' flag', exact: true });
/** Drag a flag by `frames` on the ruler (the ruler reports its extent in seconds); `hold` keeps the
 *  pointer down at the end and returns its release. */
async function dragFlag(page: Page, name: string, frames: number, hold = false) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const box = (await ruler.boundingBox())!, extent = Number(await ruler.getAttribute('data-extent'));
  const at = (await flag(page, name).boundingBox())!, x = at.x + 1, y = at.y + at.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + frames / 25 / extent * box.width, y, { steps: 8 });
  if (hold) return async () => { await page.mouse.up(); };
  await page.mouse.up();
}
const undo = async (page: Page) => { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); };
const redo = async (page: Page) => { await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); };

test('Add Step and Set Out refuse a crossed clip-path track without changing the document', async ({ page }) => {
  const withClip = fixture();
  for (const step of withClip.steps.slice(0, -1)) {
    step.layers['#box'].clipPath = [{ time: 0, value: 'inset(100%)' }, { time: step.duration, value: 'inset(0%)' }];
  }
  const refuses = /Only numeric tracks split exactly/;
  await editorWith(page, withClip);
  const original = await source(page), entries = await history(page);
  await seekFrames(page, 10);
  await page.getByRole('button', { name: 'Add Step at playhead', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: refuses })).toBeVisible();
  expect(await source(page)).toEqual(original);
  expect(await history(page)).toBe(entries);
  await seekFrames(page, 30);
  await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click();
  await expect(page.locator('.ef-out-controls').getByRole('alert')).toContainText(refuses);
  expect(await source(page)).toEqual(original);
  expect(await history(page)).toBe(entries);
});

test('an Out-only pivot starts at the CSS base again on the next take in every package', async ({ page }) => {
  await open(page);
  const data = fixture(), out = data.steps.at(-1)!;
  const raw = [{ time: 0, value: '40px' }, { time: out.duration, value: '55px' }];
  out.layers['#raw-pivot'] = { '--base-anchor-x': raw };
  const original = await template(page, data);
  original.html = original.html.replace('</div></body>', '<div id="raw-pivot" data-gfx></div></div></body>');
  original.css += '\n#raw-pivot { --base-anchor-x: 40px; transform-origin: var(--base-anchor-x) 10px; }';
  const key = (step: number, time: number, value: number) => ({ kind: 'animation.key', selector: '#box', property: 'noacgAnchorX', step, time, value, action: 'set', baseValues: { anchorX: 100, anchorY: 50 } });
  const t = await operate(page, original, [key(2, 0, 100), key(2, out.duration, 180)]);
  expect(t.html).toBe(original.html);
  expect((await dataOf(page, t)).steps.at(-1)!.layers['#raw-pivot']['--base-anchor-x']).toEqual(raw);
  const seconds = secondsOf(data);
  for (const target of TARGETS) {
    const control = await run(page, await build(page, original, target), target, seconds,
      { nexts: 0, exit: [seconds.at(-1)!], layers: ['#raw-pivot'], props: ['--base-anchor-x'], retake: true });
    const result = await run(page, await build(page, t, target), target, seconds,
      { nexts: 0, exit: [seconds.at(-1)!], layers: ['#box', '#raw-pivot'], props: ['--base-anchor-x'], retake: true });
    expect([result.held[0], result.leaving[0][0], result.retaken?.[0]], target).toEqual([100, 180, 100]);
    expect([control.held[0], control.leaving[0][0]], target + ' raw source plays').toEqual([40, 55]);
    expect([result.held[2], result.leaving[0][2], result.retaken?.[2]], target + ' raw source is preserved').toEqual([40, 55, control.retaken?.[0]]);
  }
  const split = await operate(page, t, [key(0, 0, 100), key(0, 1, 180), { kind: 'layer.duplicate', selector: '#box' }, { kind: 'step.add', time: .4 }]);
  const splitData = await dataOf(page, split);
  for (const selector of ['#box', '#box-copy-1']) {
    expect(splitData.steps[0].layers[selector].noacgAnchorX.at(-1)?.value).toBe(140);
    expect(splitData.steps[1].layers[selector].noacgAnchorX[0].value).toBe(140);
  }
  expect(splitData.steps.at(-1)!.layers['#raw-pivot']['--base-anchor-x']).toEqual(raw);
});

test('SVG group pivot ownership is checked again before ungrouping or editing saved keys', async ({ page }) => {
  await open(page);
  const original = await template(page, fixture());
  original.html = original.html.replace('</div></body>', '<svg width="960" height="270"><rect id="pivot-a" data-gfx width="90" height="60"/><rect id="pivot-b" data-gfx x="200" width="50" height="40"/></svg></div></body>');
  const selector = '#group-1', property = '--base-anchor-x';
  const grouped = await operate(page, original, [{ kind: 'group.create', selectors: ['#pivot-a', '#pivot-b'], box: { x: 0, y: 0, width: 250, height: 60 } }]);
  const ungroup = [{ kind: 'group.ungroup', selector }];
  const editCss = (t: Template, key: string, value: string) => page.evaluate(async ({ t, selector, key, value }) => ({
    ...t, css: (await import('/src/blocks/edit.ts')).setCssDeclaration(t.css, selector, key, value),
  }), { t, selector, key, value });
  for (const [key, value] of [['transform', 'matrix(1,0,0,1,20,0)'], ['--noacg-group-x', '20'], ['--base-x', 'calc(20px)']]) {
    const conflict = await editCss(grouped, key, value);
    await expect.soft(operate(page, conflict, ungroup), key).rejects.toThrow('conflicting pivot owner');
  }
  expect((await operate(page, grouped, ungroup)).html).not.toContain('id="group-1"');
  const unknown = { ...grouped, html: grouped.html.replace('data-noacg-group-pivot="frame-v1"', 'data-noacg-group-pivot="frame-v2"') };
  await expect.soft(operate(page, unknown, ungroup)).rejects.toThrow('unrecognized pivot format');
  await expect.soft(operate(page, unknown, [{ kind: 'base.set', selector, values: { anchorX: 10, anchorY: 20 } }])).rejects.toThrow('unrecognized pivot format');
  await expect.soft(operate(page, unknown, [{ kind: 'animation.key', selector, property: 'rotation', step: 0, time: .4, value: 25, action: 'set' }])).rejects.toThrow('unrecognized pivot format');
  const escaped = { ...grouped, css: grouped.css.replace(/(#group-1\s*\{[^}]*)(\})/, '$1--base-\\61 nchor-x: 99px;$2') };
  await expect.soft(operate(page, escaped, ungroup)).rejects.toThrow('conflicting pivot owner');

  const key = { selector, property, step: 0, time: .4 };
  const set = { kind: 'animation.key', ...key, value: 80, action: 'set' };
  const keyed = await operate(page, grouped, [set, { ...set, time: .1, value: 125 }]);
  const capture = (t: Template) => page.evaluate(async ({ t, key }) =>
    (await import('/src/blocks/editorAnimation.ts')).captureKeyClipboard(t as never, [key]), { t, key });
  const keys = await capture(keyed);
  const operations = [
    { kind: 'key.paste', keys, step: 0, time: .8 },
    { kind: 'key.move', keys: [key], delta: .1 },
    { kind: 'key.ease', keys: [key], preset: 'bounce' },
  ];
  const conflict = await editCss(keyed, 'transform', 'matrix(1,0,0,1,20,0)');
  await expect.soft(capture(conflict)).rejects.toThrow('conflicting pivot owner');
  for (const operation of operations) {
    expect((await operate(page, keyed, [operation])).js).not.toBe(keyed.js);
    await expect.soft(operate(page, conflict, [operation]), operation.kind).rejects.toThrow('conflicting pivot owner');
  }
  const unrelated = { ...key, selector: '#box', property: 'opacity', time: .5 };
  expect((await operate(page, conflict, [{ kind: 'key.move', keys: [unrelated], delta: .1 }])).js).not.toBe(conflict.js);

  const precise = await operate(page, grouped, [{ kind: 'base.set', selector, values: { anchorX: 1e-9, anchorY: 20 } }]);
  expect(precise.css).toContain('--base-anchor-x: 1e-9px;');
  const rekeyed = await operate(page, precise, [{ ...set, value: 1e-9 }]);
  expect(rekeyed.css).toBe(precise.css);
  expect((await dataOf(page, rekeyed)).steps[0].layers[selector][property]).toEqual([{ time: .4, value: .001 }]);
});

test('ordinary anchor keys refuse competing CSS variables and source style rules', async ({ page }) => {
  await open(page);
  const original = await template(page, fixture());
  const key = { kind: 'animation.key', selector: '#box', property: 'noacgAnchorX', step: 0, time: .4, value: 80, action: 'set', baseValues: { anchorX: 160, anchorY: 50 } };
  expect((await operate(page, original, [key])).js).not.toBe(original.js);
  const rawData = fixture();
  rawData.steps[0].layers['#box']['--base-anchor-x'] = [{ time: 0, value: '40px' }];
  await expect(operate(page, await template(page, rawData), [key])).rejects.toThrow('already has a raw pivot track');
  const foreignName = fixture();
  foreignName.steps[0].layers['#title'].noacgAnchorX = [{ time: .4, value: '40px' }];
  const foreign = await template(page, foreignName);
  const moved = await operate(page, foreign, [{ kind: 'key.move', keys: [{ step: 0, selector: '#title', property: 'noacgAnchorX', time: .4 }], delta: .2 }]);
  expect((await dataOf(page, moved)).steps[0].layers['#title'].noacgAnchorX).toEqual([{ time: .6, value: '40px' }]);
  await expect(operate(page, foreign, [key])).rejects.toThrow('already uses an editor pivot channel name');
  const conflicts = [
    { ...original, css: original.css + '\nbody #box { --base-anchor-x:25px !important; }' },
    { ...original, css: original.css.replace('#box{', '#box{--base-anchor-x:25px !important;') },
    { ...original, html: original.html.replace('</head>', '<style>#box { transform-origin: 25px 25px !important; }</style></head>') },
    { ...original, css: original.css.replace('#box{', '#box{--base-anchor-x:25px;--base-anchor-y:50px;transform-origin:0 var(--base-anchor-y);') },
    { ...original, css: original.css.replace('#box{', '#box{--base-anchor-x:25px;--base-\\61 nchor-x:25px;--base-anchor-y:50px;transform-origin:var(--base-anchor-x) var(--base-anchor-y);') },
    { ...original, css: original.css.replace('#box{', '#box{transform-origin:25px 50px 20px;') },
    { ...original, css: original.css.replace('#box{', '#box{transform-origin:inherit;') },
    { ...original, css: original.css.replace('#box{', '#box{transition-duration:.2s;') },
    { ...original, css: original.css + '\n#box:hover { transform-origin: 0 0; }' },
    { ...original, css: original.css + '\nbody { & #box { all: unset; } }' },
    { ...original, css: original.css + '\n#box { @media (min-width: 1px) { --base-anchor-x: 25px !important; } }' },
    { ...original, css: original.css + '\n@property --base-anchor-x { syntax: "<number>"; inherits: false; initial-value: 0; }' },
    { ...original, css: original.css + '\n@PROPERTY /* authored */ --base-anchor-x { syntax: "<number>"; inherits: false; initial-value: 0; }' },
    { ...original, html: original.html.replace('</head>', '<style>@property /* authored */ --base-anchor-x { syntax: "<number>"; inherits: false; initial-value: 0; }</style></head>') },
    { ...original, css: '@import url("data:text/css,%23box%7Btransform-origin%3A0%7D");\n' + original.css },
  ];
  for (const conflict of conflicts) await expect.soft(operate(page, conflict, [key])).rejects.toThrow('competing pivot CSS');
  const scoped = { ...original, css: original.css + '\n@scope (.fixture) { #box { transform-origin: 0 0; } }' };
  await expect(operate(page, scoped, [key])).rejects.toThrow('transform-origin is set by another rule');

  const authored = { ...original, css: original.css.replace('#box{', '#box{--base-anchor-x /* owner */: /* pixels */ 100px;--base-anchor-y:50px;transform-origin:var(--base-anchor-x) var(--base-anchor-y);--base-anchor-X:75px;/* ; --base-anchor-x:75px; { } */') };
  const keyed = await operate(page, authored, [key]);
  const baked = await operate(page, keyed, [{ ...key, action: 'disable', baseValues: { anchorX: 80, anchorY: 50 } }]);
  expect(baked.css).toContain('--base-anchor-x /* owner */: /* pixels */ 80px;');
  expect(baked.css).toContain('--base-anchor-X:75px;/* ; --base-anchor-x:75px; { } */');

  const svg = { ...original, html: original.html.replace('</div></body>', '<svg class="imported-design-art" width="960" height="270"><text id="pivot-text" data-gfx x="20" y="60">Text</text></svg></div></body>') };
  const staticEdit = { kind: 'base.set', selector: '#pivot-text', values: { anchorX: 30, anchorY: 20 } };
  expect((await operate(page, svg, [staticEdit])).css).toContain('--base-anchor-x: 30px');
  await expect(operate(page, { ...svg, css: svg.css + '\n@PROPERTY /* authored */ --base-anchor-x { syntax: "<number>"; inherits: false; initial-value: 0; }' }, [staticEdit]))
    .rejects.toThrow('competing pivot CSS');
});

test('keyed pivots refuse other paint consumers while preserving independent artwork', async ({ page }) => {
  await open(page);
  const original = await template(page, fixture());
  const html = original.html.replace('id="box" data-gfx></div>', 'id="box" data-gfx><span id="pivot-child">Child</span></div>');
  const key = { kind: 'animation.key', selector: '#box', property: 'noacgAnchorX', step: 0, time: 0, value: 160, action: 'set', baseValues: { anchorX: 160, anchorY: 50 } };
  const descendant = { ...original, html, css: original.css + '\n#pivot-child { padding-left: var(--base-anchor-x, 10px); }' };
  const refusal = 'uses its pivot value in other artwork CSS';
  for (const css of [
    '#box { --measure: var(--base-anchor-x, 10px); padding-left: var(--measure); }',
    '#box { --measure: var(--base-anchor-x, 10px); } #pivot-child { --base-anchor-x: 10px; padding-left: var(--measure); }',
    '@media (min-width: 100px) { #pivot-child::before { content: "x"; padding-left: var(--base-anchor-y, 10px); } }',
    '#pivot-child:not(:hover)::before { content: "x"; padding-left: var(--base-anchor-x, 10px); }',
    '@keyframes drift { to { padding-left: var(--base-anchor-x, 10px); } } #pivot-child { animation: drift 1s; }',
  ]) await expect.soft(operate(page, { ...original, html, css: original.css + '\n' + css }, [key]), css).rejects.toThrow(refusal);
  for (const css of [
    ':root { --measure: var(--base-anchor-x, 10px); } #pivot-child { padding-left: var(--measure); }',
    '#pivot-child { --base-anchor-x: 10px; padding-left: var(--base-anchor-x); }',
  ]) expect((await operate(page, { ...original, html, css: original.css + '\n' + css }, [key])).html).toBe(html);
  for (const changedHtml of [
    html.replace('id="pivot-child"', 'id="pivot-child" style="padding-left:var(--base-anchor-x,10px)"'),
    html.replace('</head>', '<style>#pivot-child {padding-left:var(--base-anchor-x,10px)}</style></head>'),
  ]) await expect(operate(page, { ...original, html: changedHtml }, [key])).rejects.toThrow(refusal);
  const inherited = fixture();
  inherited.steps[0].layers['#pivot-child'] = { '--base-anchor-x': [{ time: 0, value: 'inherit' }] };
  const inheritedSource = await template(page, inherited);
  await expect(operate(page, { ...inheritedSource, html, css: original.css + '\n#pivot-child {--base-anchor-x:10px;padding-left:var(--base-anchor-x)}' }, [key])).rejects.toThrow(refusal);

  const svg = { ...original, html: original.html.replace('</div></body>', '<svg class="imported-design-art" width="960" height="270"><text id="pivot-text" data-gfx x="20" y="60"><tspan stroke-width="var(--base-anchor-x, 3px)">Text</tspan></text></svg></div></body>') };
  await expect(operate(page, svg, [{ ...key, selector: '#pivot-text', value: 30, baseValues: { anchorX: 30, anchorY: 20 } }])).rejects.toThrow(refusal);
  const group = { ...original, html: original.html.replace('</div></body>', '<svg width="960" height="270"><defs><g id="symbol"><path id="clone-paint" stroke-width="var(--base-anchor-x, 5px)" d="M0 0L5 5"/></g></defs><rect id="part-a" data-gfx width="90" height="60"/><rect id="part-b" data-gfx x="180" width="90" height="60"/><use href="#symbol"/></svg></div></body>') };
  const grouped = await operate(page, group, [{ kind: 'group.create', selectors: ['#part-a', '#part-b'], box: { x: 0, y: 0, width: 270, height: 60 } }]);
  const groupKey = { ...key, selector: '#group-1', property: '--base-anchor-x', value: 80 };
  expect((await operate(page, grouped, [groupKey])).html).toBe(grouped.html);
  const reachable = { ...grouped, html: grouped.html.replace('<rect id="part-a"', '<use href="#symbol"/><rect id="part-a"') };
  const clonedOwner = { ...grouped, html: grouped.html.replace('</svg>', '<use href="#group-1"/></svg>') };
  const nestedClone = { ...grouped, html: grouped.html.replace('</defs>', '<g id="second-symbol"><use href="#group-1"/></g></defs>').replace('</svg>', '<use href="#second-symbol"/></svg>') };
  for (const conflict of [reachable, clonedOwner, nestedClone, { ...grouped, css: grouped.css + '\n#part-a { stroke-width: var(--base-anchor-x, 135px); }' }]) {
    await expect.soft(operate(page, conflict, [groupKey])).rejects.toThrow(refusal);
  }

  await editorWith(page, descendant);
  const row = page.locator('.ef-track[data-selector="#box"]');
  await row.locator('.ef-layer').click(); await ready(page);
  const before = await source(page), entries = await history(page);
  const painted = page.frameLocator('iframe[title="Foundation graphic preview"]').locator('#pivot-child');
  await expect(painted).toHaveCSS('padding-left', '10px');
  await expect(page.locator('.ef-anchor')).toContainText(refusal);
  await expect(page.getByRole('button', { name: 'Enable Anchor X animation', exact: true })).toHaveCount(0);
  await expect(operate(page, before, [key])).rejects.toThrow(refusal);
  await expect(painted).toHaveCSS('padding-left', '10px');
  await expect(row).toHaveClass(/is-selected/);
  expect(await source(page)).toEqual(before);
  expect(await history(page)).toBe(entries);
});

test('a canonical SVG pivot paints the same precise pose across a cue cut', async ({ page }) => {
  await open(page);
  const data: Data = { version: fixture().version, root: '.fixture', speed: 1, steps: [
    { name: 'In', duration: .96, ease: 'none', layers: {} },
    { name: 'Out', duration: .32, ease: 'none', layers: {} },
  ] };
  const original = await template(page, data);
  original.html = original.html.replace('</div></body>', '<svg id="precision-parent" width="960" height="270"><rect id="a" data-gfx width="90" height="60"/><rect id="b" data-gfx x="180" width="50" height="40"/></svg></div></body>');
  const selector = '#group-1', property = '--base-anchor-x';
  const grouped = await operate(page, original, [{ kind: 'group.create', selectors: ['#a', '#b'], box: { x: 0, y: 0, width: 230, height: 60 } }]);
  const key = (time: number, value: number) => ({ kind: 'animation.key', selector, property, step: 0, time, value, action: 'set' });
  const authored = await operate(page, grouped, [{ kind: 'base.set', selector, values: { scaleX: 16, anchorX: 100, anchorY: 30 } }, key(0, 100), key(.96, 100.000098)]);
  const split = await operate(page, authored, [{ kind: 'step.add', time: .48 }]);
  const splitData = await dataOf(page, split);
  expect(splitData.steps[0].layers[selector][property].at(-1)).toEqual({ time: .48, value: 100000049, ease: 'none' });
  const sample = { svgParent: '#precision-parent', layers: [selector], exit: [0] };
  const expectedTranslation = (1 - 16) * 100.000049;
  for (const target of TARGETS) {
    const before = await run(page, await build(page, authored, target), target, secondsOf(data), { ...sample, cues: [[{ key: 'mid', t: .48 }]] });
    const after = await run(page, await build(page, split, target), target, secondsOf(splitData), { ...sample, cues: [[{ key: 'arriving', t: .48 }], [{ key: 'departing', t: 0 }]] });
    expect(before.poses.mid[4], target + ' unsplit matrix').toBeCloseTo(expectedTranslation, 3);
    expect(after.poses.arriving[4], target + ' arriving matrix').toBeCloseTo(expectedTranslation, 3);
    expect(after.poses.departing[4], target + ' departing matrix').toBeCloseTo(expectedTranslation, 3);
  }
});

test('canonical SVG groups keep their cue pivots in every saved package', async ({ page }) => {
  await open(page);
  const init = { time: 0, value: '40px 25px' };
  const data: Data = { version: fixture().version, root: '.fixture', speed: 1, steps: [
    { name: 'In', duration: .8, ease: 'none', layers: { '#old-pivot': { transformOrigin: [init], rotation: [{ time: 0, value: 35 }] } } },
    { name: 'Step 2', duration: .56, ease: 'none', layers: { '#old-pivot': { transformOrigin: [init] } } },
    { name: 'Out', duration: .72, ease: 'none', layers: { '#old-pivot': { transformOrigin: [init] } } },
  ] };
  const original = await template(page, data);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="270" viewBox="35 24 960 270">
    <g id="matrix-parent" transform="translate(100 80) rotate(30) scale(2 1.5)">
      <g id="old-pivot" data-gfx data-noacg-group data-group-x="20" data-group-y="30" data-group-width="80" data-group-height="50"><rect id="old-member" x="20" y="30" width="80" height="50"/></g>
      <rect id="matrix-a" data-gfx x="180" y="90" width="90" height="60" fill="orange"/><path id="matrix-b" data-gfx d="M370 170 L450 170 L420 230 Z" fill="red"/>
      <rect id="future-a" data-gfx x="500" y="100" width="80" height="60"/><rect id="future-b" data-gfx x="600" y="180" width="40" height="30"/>
    </g></svg>`;
  original.html = original.html.replace('</div></body>', svg + '</div></body>');
  original.css += '\n.fixture svg { overflow: visible; }\n#old-pivot {transform-box: fill-box; --base-anchor-x: 40px; --base-anchor-y: 25px; transform-origin: var(--base-anchor-x) var(--base-anchor-y);}\n';
  const grouped = await operate(page, original, [
    { kind: 'group.create', selectors: ['#matrix-a', '#matrix-b'], box: { x: 180, y: 90, width: 270, height: 140 } },
    { kind: 'group.create', selectors: ['#future-a', '#future-b'], box: { x: 500, y: 100, width: 140, height: 110 } },
  ]);
  expect(grouped.html).toContain('id="group-1" data-gfx data-noacg-group data-noacg-group-pivot="frame-v1"');
  expect(grouped.html).toContain('id="group-2" data-gfx data-noacg-group data-noacg-group-pivot="frame-v1"');
  expect((await dataOf(page, grouped)).steps).toEqual(data.steps);
  const olderBefore = await run(page, await build(page, original, 'simulator'), 'simulator', secondsOf(data),
    { svgParent: '#matrix-parent', layers: ['#old-pivot'], exit: [0] });
  await expect(operate(page, grouped, [{ kind: 'animation.key', selector: '#old-pivot', step: 0, time: .2, property: '--base-anchor-x', value: 40, action: 'set' }]))
    .rejects.toThrow('This older SVG group keeps its saved pivot');

  const a = '#group-1', b = '#group-2';
  const customData = structuredClone(data);
  const customJs = (await template(page, customData)).js.replace('function noacgPaintFirstFrame(', '// Custom preview instrument\nfunction noacgPaintFirstFrame(');
  const custom = { ...original, js: customJs };
  const customGroup = await operate(page, custom, [{ kind: 'group.create', selectors: ['#matrix-a', '#matrix-b'], box: { x: 180, y: 90, width: 270, height: 140 } }]);
  expect(customGroup.html).not.toContain('data-noacg-group-pivot');
  expect(customGroup.js).toContain('// Custom preview instrument');
  expect((await dataOf(page, customGroup)).steps.every(step => step.layers[a].transformOrigin?.[0].time === 0)).toBe(true);
  const conflict = { ...grouped, css: grouped.css + '\nsvg g { transform-box: stroke-box; }' };
  await expect(operate(page, conflict, [{ kind: 'animation.key', selector: a, step: 0, time: .2, property: '--base-anchor-x', value: 135, action: 'set' }]))
    .rejects.toThrow('conflicting pivot owner');
  const withReveal = await page.evaluate(async ({ grouped, selector }) => {
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const source = parseAnimData(grouped.js)!;
    source.steps[1].reveals = [selector];
    return { ...grouped, js: spliceAnimData(grouped.js, source)! };
  }, { grouped, selector: b });
  const key = (selector: string, step: number, time: number, property: string, value: number) =>
    ({ kind: 'animation.key', selector, step, time, property, value, action: 'set' });
  const authored = await operate(page, withReveal, [
    { kind: 'base.set', selector: a, values: { x: 17.375, y: -9.25, rotation: 35, scaleX: 1.4, scaleY: .8, anchorX: 135.00049, anchorY: 70 } },
    { kind: 'base.set', selector: b, values: { x: -14, y: 23, rotation: 24, scaleX: 1.25, scaleY: .75 } },
    key('#matrix-a', 0, 0, 'x', 0), key('#matrix-a', 0, .6, 'x', -80),
    key(a, 0, 0, '--base-anchor-x', 135.00049), key(a, 0, .6, '--base-anchor-x', 95),
    key(a, 1, .12, '--base-anchor-y', 90), key(a, 1, .48, '--base-anchor-y', 110),
    key(b, 1, .12, '--base-anchor-x', 45), key(b, 1, .4, '--base-anchor-x', 55),
    key(a, 2, 0, '--base-anchor-x', 95), key(a, 2, .56, '--base-anchor-x', 130), key(a, 2, .72, '--base-anchor-y', 110),
    { ...key('#box', 2, 0, 'noacgAnchorX', 100), baseValues: { anchorX: 100, anchorY: 50 } }, key('#box', 2, .72, 'noacgAnchorX', 180),
  ]);
  await editorWith(page, authored);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('SVG cue pivots');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  await page.reload(); await ready(page);
  const saved = await source(page);
  expect([saved.html, saved.css, saved.js]).toEqual([authored.html, authored.css, authored.js]);
  const savedData = await dataOf(page, saved), seconds = secondsOf(savedData);
  const stepRoundTrip = await operate(page, saved, [{ kind: 'step.add', time: .32 }, { kind: 'step.move', step: 1, time: .36 }, { kind: 'step.delete', step: 1 }]);
  expect(await dataOf(page, stepRoundTrip)).toEqual(savedData);
  const carried = await operate(page, stepRoundTrip, [{ kind: 'out.set', time: 1.04 }]);
  const carriedData = await dataOf(page, carried), carriedSeconds = secondsOf(carriedData);
  expect(carriedSeconds).toEqual([.8, .24, .96]);
  expect(carriedData.steps.map(step => step.layers[a]?.transformOrigin)).toEqual([undefined, undefined, undefined]);
  const rejoined = await operate(page, carried, [{ kind: 'out.set', time: 1.36 }]);
  expect(await dataOf(page, rejoined)).toEqual(savedData);
  const bounded = await operate(page, saved, [
    { kind: 'group.trim', selector: a, step: 0, interval: 0, edge: 'end', time: .72 },
    ...['#matrix-a', '#matrix-b'].map(selector => ({ kind: 'layer.trim', selector, step: 0, interval: 0, edge: 'end', time: .72 })),
  ]);
  expect((await dataOf(page, bounded)).steps[0].layers[a]).toEqual(savedData.steps[0].layers[a]);
  const moved = await operate(page, bounded, [{ kind: 'group.move', selector: a, step: 0, delta: .04 }]);
  const movedIn = (await dataOf(page, moved)).steps[0];
  expect(movedIn.layers[a]['--base-anchor-x']).toEqual(savedData.steps[0].layers[a]['--base-anchor-x'].map((key, i) => ({ ...key, time: [.04, .64][i] })));
  expect(movedIn.layers['#matrix-a'].x.map(key => key.time)).toEqual([.04, .64]);
  expect(movedIn.spans?.[a]).toEqual([{ start: .04, end: .76 }]);
  const duplicate = await operate(page, saved, [{ kind: 'layer.duplicate', selector: a }]);
  const copies = (await dataOf(page, duplicate)).steps[0].layers;
  const copy = Object.keys(copies).find(id => id !== a && copies[id]['--base-anchor-x']?.length)!;
  expect(copy).toBeTruthy();
  expect(copies[copy]).toEqual(copies[a]);
  expect(duplicate.html).toContain(`id="${copy.slice(1)}" data-gfx data-noacg-group data-noacg-group-pivot="frame-v1"`);
  const bake = (selector: string, step: number, time: number, axis: 'x' | 'y', value: number) => ({ ...key(selector, step, time, '--base-anchor-' + axis, value), action: 'disable', baseValues: { [axis === 'x' ? 'anchorX' : 'anchorY']: value } });
  const baked = await operate(page, saved, [bake(a, 0, .3, 'x', 115.000245), bake(a, 1, .3, 'y', 100), bake(b, 1, .3, 'x', 45 + 10 * .18 / .28),
    { kind: 'step.add', time: .32 }, { kind: 'step.delete', step: 1 }]);
  expect((await dataOf(page, baked)).steps.some(step => [a, b].some(id => step.layers[id]?.['--base-anchor-x'] || step.layers[id]?.['--base-anchor-y']))).toBe(false);

  function composed(x: number, y: number, angle: number, sx: number, sy: number, px: number, py: number) {
    const radians = angle * Math.PI / 180;
    const a = Math.cos(radians) * sx, b = Math.sin(radians) * sx, c = -Math.sin(radians) * sy, d = Math.cos(radians) * sy;
    return [a, b, c, d, x + px - a * px - c * py, y + py - b * px - d * py];
  }
  const expected = (x: number, y: number, moved: number, future: number, showing: number) => {
    const main = composed(17.375, -9.25, 35, 1.4, .8, 180 + x, 90 + y);
    const child = [...main]; child[4] += main[0] * moved; child[5] += main[1] * moved;
    const later = composed(-14, 23, 24, 1.25, .75, 500 + future, 155);
    return [...main, 1, ...child, 1, ...main, 1, ...later, showing];
  };
  const match = (actual: Pose, wanted: Pose, label: string) => {
    expect(actual).toHaveLength(wanted.length);
    actual.forEach((value, i) => expect(value, `${label}, matrix component ${i}`).toBeCloseTo(wanted[i], 3));
  };
  const samples = { svgParent: '#matrix-parent', layers: [a, '#matrix-a', '#matrix-b', b] };
  for (const target of TARGETS) {
    const built = await build(page, saved, target);
    const normal = await run(page, built, target, seconds, { ...samples, exit: [0, .28, .72], retake: true, repeatStopAt: .28,
      cues: [[{ key: 'in', t: 0 }, { key: 'arriving', t: .8 }], [{ key: 'departing', t: 0 }, { key: 'inside', t: .3 }]] });
    match(normal.poses.in, expected(135.00049, 70, 0, 70, 0), target + ' In before future group');
    match(normal.poses.arriving, expected(95, 70, -80, 70, 0), target + ' arriving at flag');
    match(normal.poses.departing, expected(95, 90, -80, 45, 1), target + ' departing and revealing');
    match(normal.poses.inside, expected(95, 100, -80, 45 + 10 * .18 / .28, 1), target + ' inside Next');
    match(normal.leaving[1], expected(112.5, 110, -80, 55, 1), target + ' authored Out');
    match(normal.leaving[2], expected(130, 110, -80, 55, 1), target + ' Out terminal');
    match(normal.retaken!, expected(135.00049, 70, 0, 70, 0), target + ' next Take');

    const early = await run(page, built, target, seconds, { ...samples, nexts: 0, interruptAt: .3, exit: [0, .28, .72] });
    match(early.released, expected(115.000245, 70, -40, 70, 0), target + ' early Out live pose');
    match(early.leaving[1], expected(122.5001225, 70, -40, 70, 0), target + ' early Out holds single Y');
    match(early.leaving[2], expected(130, 110, -40, 70, 0), target + ' early Out takes terminal Y');

    const carriedOutput = await build(page, carried, target);
    const carriedOut = await run(page, carriedOutput, target, carriedSeconds, { ...samples, exit: [0, .24, .52, .96] });
    match(carriedOut.leaving[0], expected(95, 90 + 20 / 3, -80, 45 + 10 * .12 / .28, 1), target + ' carried Out starts at the cut');
    match(carriedOut.leaving[1], expected(95, 110, -80, 55, 1), target + ' finishes carried motion');
    match(carriedOut.leaving[2], expected(112.5, 110, -80, 55, 1), target + ' authored Out follows the carry');
    match(carriedOut.leaving[3], expected(130, 110, -80, 55, 1), target + ' carried Out terminal');

    const skipped = await run(page, carriedOutput, target, carriedSeconds,
      { ...samples, nexts: 0, interruptAt: .3, outLength: .72, exit: [0, .28, .72] });
    match(skipped.leaving[0], early.leaving[0], target + ' early Out skips unreached carry');
    match(skipped.leaving[1], early.leaving[1], target + ' early Out keeps live Y during carry skip');
    match(skipped.leaving[2], early.leaving[2], target + ' early Out keeps the terminal value');

    const baseOnly = await run(page, await build(page, baked, target), target, seconds, { ...samples, exit: [.72], retake: true,
      cues: [[{ key: 'in', t: 0 }], [{ key: 'departing', t: 0 }]] });
    const bakedFuture = 45 + 10 * .18 / .28;
    match(baseOnly.poses.in, expected(115.000245, 100, 0, bakedFuture, 0), target + ' baked pivot before reveal');
    match(baseOnly.poses.departing, expected(115.000245, 100, -80, bakedFuture, 1), target + ' keyless group still reveals');
    match(baseOnly.retaken!, expected(115.000245, 100, 0, bakedFuture, 0), target + ' baked retake');
  }
  const mixed = await build(page, saved, 'simulator');
  const lastInterrupted = await run(page, mixed, 'simulator', seconds, { ...samples, interruptAt: .3, exit: [0, .28, .72] });
  match(lastInterrupted.held, expected(95, 100, -80, 45 + 10 * .18 / .28, 1), 'last cue live pose');
  match(lastInterrupted.leaving[1], expected(112.5, 110, -80, 45 + 10 * .18 / .28, 1), 'last cue interrupted Out');
  const olderAfter = await run(page, mixed, 'simulator', seconds, { svgParent: '#matrix-parent', layers: ['#old-pivot'], exit: [0] });
  match(olderAfter.held, olderBefore.held, 'older group unchanged beside new group');
  const ordinary = await run(page, mixed, 'simulator', seconds, { nexts: 0, layers: ['#box'], props: ['--base-anchor-x'], exit: [.72], retake: true });
  expect([ordinary.held[0], ordinary.leaving[0][0], ordinary.retaken![0]]).toEqual([100, 180, 100]);
});

test('Add Step, rename, delete and drags are one undo each and survive save and reopen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const original = await editorWith(page, fixture()), start = await state(page);
  await seekFrames(page, 10);
  await page.getByRole('button', { name: 'Add Step at playhead', exact: true }).click(); await ready(page);
  expect((await data(page)).steps.map(s => [s.name, s.duration])).toEqual([['In', .5], ['Step 2', .7], ['Step 3', .6], ['Out', 1]]);
  const added = await state(page);
  expect([added.steps, added.history]).toEqual(['3', start.history + 1]);
  await expect(flag(page, 'Step 2')).toBeVisible(); await expect(flag(page, 'Step 3')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Playhead' })).toHaveAttribute('aria-valuenow', '0.4');
  // Delete from the keyboard restores the exact source; undo and redo walk both.
  await flag(page, 'Step 2').focus(); await page.keyboard.press('Delete'); await ready(page);
  expect({ ...(await state(page)), history: 0 }).toEqual({ ...start, history: 0 });
  await undo(page); expect((await state(page)).js).toBe(added.js);
  await redo(page); expect((await state(page)).js).toBe(original.js);
  await undo(page); expect((await state(page)).js).toBe(added.js);
  // Rename inline: Enter commits one undo, Escape and an unchanged name change nothing.
  await flag(page, 'Step 2').dblclick();
  const name = page.getByRole('textbox', { name: 'Step name', exact: true });
  await name.fill('Headline'); await name.press('Enter'); await ready(page);
  expect((await data(page)).steps[1].name).toBe('Headline');
  const renamed = await state(page); expect(renamed.history).toBe(added.history + 1); expect(renamed.html).toBe(added.html);
  await flag(page, 'Headline').dblclick(); await name.fill('Other'); await name.press('Escape');
  await flag(page, 'Headline').dblclick(); await name.press('Enter');
  expect(await state(page)).toEqual(renamed);
  await undo(page); expect((await data(page)).steps[1].name).toBe('Step 2'); await redo(page);
  // A drag moves the flag, never the motion: In and Headline repartition, keys keep their times.
  await dragFlag(page, 'Headline', 2); await ready(page);
  expect((await data(page)).steps.map(s => s.duration)).toEqual([.6, .6, .6, 1]);
  const dragged = await state(page); expect(dragged.history).toBe(renamed.history + 1);
  await undo(page); expect((await state(page)).js).toBe(renamed.js); await redo(page); expect((await state(page)).js).toBe(dragged.js);
  // A nudge is one frame and one undo.
  await flag(page, 'Headline').focus(); await page.keyboard.press('ArrowRight'); await ready(page);
  expect((await data(page)).steps[0].duration).toBe(.65); expect(await history(page)).toBe(dragged.history + 1);
  // Escape during a drag cancels it.
  const nudged = await state(page), release = await dragFlag(page, 'Headline', 3, true);
  await page.keyboard.press('Escape'); await release!();
  expect(await state(page)).toEqual(nudged);
  // The context menu deletes it.
  await flag(page, 'Headline').click({ button: 'right' });
  await page.getByRole('menu', { name: 'Step' }).getByRole('menuitem', { name: 'Delete step' }).click(); await ready(page);
  expect((await data(page)).steps.map(s => s.name)).toEqual(['In', 'Step 2', 'Out']);
  expect((await source(page)).settings.steps).toBe('2');
  await undo(page); expect((await state(page)).js).toBe(nudged.js);
  // Save, reopen and a second save agree.
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Step authoring'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page);
  expect((await source(page)).js).toBe(saved.js); await expect(flag(page, 'Headline')).toBeVisible();
  const again = await page.evaluate(async () => { const { saveCurrentGraphic } = await import('/src/store/saveActions.ts'); await saveCurrentGraphic(); return (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js; });
  expect(again).toBe(saved.js);
  expect(errors).toEqual([]);
});

test('nearby flags keep separate readable hit targets at their stored times', async ({ page }) => {
  await page.setViewportSize({ width: 1093, height: 720 });
  const data = fixture();
  data.steps.splice(1, 0, { name: 'Headline reveal', duration: .05, ease: 'none', layers: {} });
  await editorWith(page, data);
  const first = flag(page, 'Headline reveal');
  const second = flag(page, data.steps[2].name);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const bounds = (await ruler.boundingBox())!, extent = Number(await ruler.getAttribute('data-extent'));
  const [firstTime, secondTime] = flagsOf(data);
  const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
  expect(a.x).toBeLessThan(b.x);
  const sameLane = Math.abs(a.y - b.y) < .5;
  if (sameLane) expect(a.x + a.width).toBeLessThanOrEqual(b.x + .5);
  else expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(a.height);
  expect(a.x).toBeCloseTo(bounds.x + firstTime / extent * bounds.width, 0);
  expect(b.x).toBeCloseTo(bounds.x + secondTime / extent * bounds.width, 0);
  await expect(first).toHaveAttribute('title', /^Headline reveal/);
  await ruler.screenshot({ path: test.info().outputPath('nearby-flags.png') });
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('F2');
  await expect(page.getByRole('textbox', { name: 'Step name', exact: true })).toHaveValue('Headline reveal');
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
});

test('an immediate Out keeps its hit area at the start of the ruler', async ({ page }) => {
  const data = fixture();
  data.steps = [{ ...data.steps[0], duration: 0, layers: {}, spans: undefined }, data.steps.at(-1)!];
  await editorWith(page, data);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const start = (await ruler.boundingBox())!.x;
  const out = flag(page, 'Out'), box = (await out.boundingBox())!;
  expect(box.x).toBeCloseTo(start, 0);
  expect(box.width).toBeGreaterThan(0);
  await out.click();
  await expect(out).toBeFocused();
  await expect(out).toHaveAttribute('aria-pressed', 'true');
  await expect(ruler).toHaveAttribute('aria-valuenow', '0');
});

test('clicking the passive In label seeks the ruler', async ({ page }) => {
  await editorWith(page, fixture());
  const original = await source(page), slider = page.getByRole('slider', { name: 'Playhead' });
  await seekFrames(page, 10);
  await page.locator('span.ef-flag').filter({ hasText: /^In$/ }).click();
  expect(Number(await slider.getAttribute('aria-valuenow'))).toBeLessThan(.2);
  expect(await source(page)).toEqual(original);
});

test('a saved zero-duration Step and Out have separate hit targets at the same time', async ({ page }) => {
  for (const inLength of [1.2, 0]) {
    const data = fixture();
    data.steps[0] = { name: 'In', duration: inLength, ease: 'none', layers: {} };
    data.steps[1] = { name: 'Instant cue', duration: 0, ease: 'none', layers: {} };
    await editorWith(page, data);
    const before = await source(page);
    const step = flag(page, 'Instant cue'), out = flag(page, 'Out');
    const a = (await step.boundingBox())!, b = (await out.boundingBox())!;
    expect(a.x).toBeCloseTo(b.x, 4);
    expect(a.width).toBeGreaterThanOrEqual(24);
    expect(a.y).not.toBe(b.y);
    if (inLength === 0) {
      const entrance = (await page.locator('.ef-flag').filter({ hasText: /^In$/ }).boundingBox())!;
      expect(entrance.x).toBeCloseTo(a.x, 4);
      expect(entrance.width).toBeGreaterThanOrEqual(24);
      expect([a.y, b.y]).not.toContain(entrance.y);
    }
    await page.getByRole('slider', { name: 'Playhead' }).screenshot({ path: test.info().outputPath(`coincident-flags-${inLength}.png`) });
    await step.click();
    await expect(step).toHaveAttribute('aria-pressed', 'true');
    await out.click();
    await expect(out).toHaveAttribute('aria-pressed', 'true');
    expect(await source(page)).toEqual(before);
  }
});

test('close positive flag intervals stay readable and operable at their stored times', async ({ page }) => {
  await page.setViewportSize({ width: 1093, height: 720 });
  for (const [gap, outLength] of [[.001, .6], [.04, 12]]) {
    const data = fixture();
    data.speed = 1;
    data.steps = [
      { name: 'In', duration: .4, ease: 'none', layers: {} },
      { name: 'Short cue', duration: gap, ease: 'none', layers: {} },
      { name: 'Out', duration: outLength, ease: 'none', layers: {} },
    ];
    await editorWith(page, data);
    const before = await source(page), step = flag(page, 'Short cue'), out = flag(page, 'Out');
    const slider = page.getByRole('slider', { name: 'Playhead' });
    for (const width of [1093, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      await expect.poll(async () => (await step.boundingBox())!.width).toBeGreaterThanOrEqual(24);
      const bounds = (await slider.boundingBox())!, extent = Number(await slider.getAttribute('data-extent'));
      const [a, b] = await Promise.all([step.boundingBox(), out.boundingBox()]);
      expect(a!.x).toBeCloseTo(bounds.x + .4 / extent * bounds.width, 0);
      expect(b!.x).toBeCloseTo(bounds.x + (.4 + gap) / extent * bounds.width, 0);
      expect(a!.y).not.toBe(b!.y);
      await slider.screenshot({ path: test.info().outputPath(`close-flags-${gap}-${width}.png`) });
      await step.click();
      await expect(step).toHaveAttribute('aria-pressed', 'true');
      await out.focus();
      await out.press('Enter');
      await expect(out).toHaveAttribute('aria-pressed', 'true');
      await step.focus();
      await step.press('Space');
      await expect(step).toHaveAttribute('aria-pressed', 'true');
    }
    expect(await source(page)).toEqual(before);
  }
});

test('flags stay ordered: a drag or nudge onto or past a neighbour refuses and changes nothing', async ({ page }) => {
  // Step 2 ends in settled air (its keys stop at 0.6 of 0.8), so Out can move into it (R1.2a.2).
  const settled = fixture(); settled.steps[1].duration = 0.8;
  await editorWith(page, settled);
  // The Out flag drags as Set Out: two frames earlier, into that air, is one undo.
  const start = await state(page);
  await dragFlag(page, 'Out', -2); await ready(page);
  expect((await data(page)).steps[1].duration).toBe(.7);
  const before = await state(page), alert = page.getByRole('alert').filter({ hasText: /frame/ });
  expect(before.history).toBe(start.history + 1);
  // Step 2 sits at frame 24 between In (0) and Out (38). Held past Out, the flag shows the refusal.
  const release = await dragFlag(page, 'Step 2', 15, true);
  await expect(flag(page, 'Step 2')).toHaveClass(/is-refused/); await expect(alert).toBeVisible();
  await release!(); await ready(page);
  expect(await state(page)).toEqual(before); await expect(alert).toBeVisible();
  for (const frames of [14, -24, -30, 20]) { await dragFlag(page, 'Step 2', frames); expect(await state(page), `drag by ${frames}`).toEqual(before); }
  // One frame before Out is the shortest legal cue.
  await dragFlag(page, 'Step 2', 13); await ready(page);
  expect((await data(page)).steps[1].duration).toBe(.05);
  const shortest = await state(page);
  await flag(page, 'Step 2').focus(); await page.keyboard.press('ArrowRight');
  await expect(alert).toBeVisible(); expect(await state(page)).toEqual(shortest);
  // Add Step on a flag or after Out refuses beside its button.
  const add = page.getByRole('button', { name: 'Add Step at playhead', exact: true });
  for (const [frames, reason] of [[37, /flag/], [0, /flag/], [42, /after Out/]] as const) {
    await page.clock.resume(); await seekFrames(page, frames);
    await add.click();
    await expect(page.getByRole('alert').filter({ hasText: reason })).toBeVisible();
    expect(await state(page)).toEqual(shortest);
  }
  // Out never moves onto or before the last Step.
  await dragFlag(page, 'Out', -3);
  expect(await state(page)).toEqual(shortest);
});

test('at a flag an existing layer keys the arriving end and a layer starting there its departing start', async ({ page }) => {
  await editorWith(page, fixture());
  // Step 2's flag: #box is on screen through it; #tag's bar starts there, so it is hidden on arrival.
  await seekFrames(page, 24);
  const preview = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const hidden = () => preview.evaluate(() => getComputedStyle(document.querySelector('#tag')!).visibility);
  await page.locator('.ef-track[data-selector="#tag"] .ef-layer').click(); await ready(page);
  await expect(page.locator('.ef-key-controls').first()).toContainText('Step 2 start');
  const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true });
  // The departing pose is x -200 on top of the base, whatever the arriving preview holds.
  const shown = Number(await input.inputValue());
  await input.fill(String(shown + 50)); await input.press('Enter'); await ready(page);
  expect((await data(page)).steps[1].layers['#tag'].x[0]).toEqual({ time: 0, value: -150 });
  expect(await hidden()).toBe('hidden');
  await page.locator('.ef-track[data-selector="#box"] .ef-layer').click(); await ready(page);
  await expect(page.locator('.ef-key-controls').first()).toContainText('In end');
  // A mixed selection drags as one: #box keys In at its end, #tag keys Step 2 at zero.
  await page.locator('.ef-track[data-selector="#tag"] .ef-layer').click({ modifiers: ['Control'] }); await ready(page);
  await expect(page.getByTestId('segment-targets')).toContainText('In end'); await expect(page.getByTestId('segment-targets')).toContainText('Step 2 start');
  const before = await history(page), board = (await page.locator('.ef-artboard').boundingBox())!, scale = board.width / 1920;
  const bounds = (await page.locator('.ef-selection rect').first().boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 40 * scale, bounds.y + bounds.height / 2, { steps: 8 });
  expect(await hidden()).toBe('hidden');
  await page.mouse.up(); await ready(page);
  const after = await data(page);
  expect(after.steps[0].layers['#box'].x.slice(-1)[0].time).toBe(1.2);
  expect(after.steps[1].layers['#tag'].x[0].time).toBe(0);
  expect(Math.round(Number(after.steps[1].layers['#tag'].x[0].value))).toBe(-110);
  expect(await history(page)).toBe(before + 1);
  expect(await hidden()).toBe('hidden');
  // A click on the flag inspects Step 2 at its start: the tag is shown and every edit writes Step 2.
  await flag(page, 'Step 2').click(); await ready(page);
  expect(await hidden()).toBe('visible');
  await expect(page.getByTestId('segment-targets')).not.toContainText('In end');
  // Moving the playhead leaves the inspection, past Out too: edits there land in Out, not Step 2.
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('End'); await ready(page);
  await expect(page.getByTestId('segment-targets')).toContainText('Out end');
});

test('at 30 fps Add Step parks the playhead on its own flag, on the arriving side', async ({ page }) => {
  // Flags are stored at 3 decimals, a hair off the 30 fps frame the playhead was on: a seek to that frame lands on the flag.
  const t = await editorWith(page, fixture());
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate({ ...(t as object), fps: 30 } as never, { resetSampleData: true });
  }, t);
  await ready(page);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < 10; i++) await ruler.press('ArrowRight');
  await ready(page);
  await page.getByRole('button', { name: 'Add Step at playhead', exact: true }).click(); await ready(page);
  const at = await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { readTimeline } = await import('/src/components/editorFoundation/timelineView.ts');
    const session = activeEditorSession();
    return { time: session.port.view().time, flag: readTimeline(session.port.read()).segments[1].start };
  });
  expect(at.time).toBe(at.flag); expect(Math.abs(at.flag - 10 / 30)).toBeLessThan(0.0005);
  await page.locator('.ef-track[data-selector="#box"] .ef-layer').click(); await ready(page);
  await expect(page.locator('.ef-key-controls').first()).toContainText('In end');
  // Walked off by a frame and back, the playhead is on the flag again.
  await ruler.focus(); await ruler.press('ArrowRight'); await ready(page);
  await expect(page.locator('.ef-key-controls').first()).not.toContainText('In end');
  await ruler.press('ArrowLeft'); await ready(page);
  await expect(page.locator('.ef-key-controls').first()).toContainText('In end');
});

test('a flag drag the runtime cannot play shows its reason while held and changes nothing', async ({ page }) => {
  // Step 2's box slides on a stepped ease, which no flag splits exactly. (Out moved later takes its
  // exit along now, so R1.2a.1's refusal to cross an Out key is gone: docs/research/editor-r1-2a-5.)
  const stepped = fixture(); stepped.steps[1].layers['#box'].x[1].ease = 'steps(4)';
  await editorWith(page, stepped);
  const before = await state(page), reason = page.getByRole('alert').filter({ hasText: /steps\(4\)/ });
  const release = await dragFlag(page, 'Out', -5, true);
  await expect(flag(page, 'Out')).toHaveClass(/is-refused/); await expect(reason).toBeVisible();
  await release!(); await ready(page);
  expect(await state(page)).toEqual(before); await expect(reason).toBeVisible();
});

async function editorPose(page: Page) {
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  return frame.evaluate(({ layers, props }) => {
    const w = window as unknown as { gsap: { getProperty(e: Element, p: string): number } };
    const seen = (style: CSSStyleDeclaration) => style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
    return layers.flatMap(s => { const e = document.querySelector(s)!; return props.map(p => Number(w.gsap.getProperty(e, p))).concat(seen(getComputedStyle(e))); });
  }, { layers: LAYERS, props: PROPS });
}

test('the editor Out button from an earlier flag holds a one-key Out track as the simulator does', async ({ page }) => {
  const data = fixture(), t = await editorWith(page, data), simulator = await build(page, t, 'simulator');
  await page.clock.resume(); await seekFrames(page, 24);
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
  const runtime = await run(page, simulator, 'simulator', secondsOf(data), { nexts: 0, exit: times });
  near([held], [runtime.held], 'editor parked at Step 2: the pose Out leaves from');
  near(poses, runtime.leaving, 'editor Out from Step 2 against the simulator');
  near(poses, await model(page, data, held, runtime.visible, times, 'early'), 'editor Out from Step 2');
});

test('card26 keeps its reveals appearing where they did when a step is added, deleted or moved', async ({ page }) => {
  await open(page);
  const t = await page.evaluate(async () => (await import('/src/templates/catalog.ts')).variantById('card26')!.create({})) as unknown as Template;
  const rows = ['#f0', '#f1', '#f2', '#f3', '#f4'], props = ['yPercent'];
  const d = await dataOf(page, t), built = await build(page, t, 'simulator');
  const compare = async (next: Template, what: string) => {
    const nd = await dataOf(page, next), total = flagsOf(d).slice(-1)[0];
    const points = [...new Set([...grid(total, .05), ...flagsOf(d), ...flagsOf(nd)].map(p => Math.round(p * 1e6) / 1e6))].sort((a, b) => a - b);
    const exit = grid(secondsOf(d).slice(-1)[0], .05);
    const [a, b] = await Promise.all([[nd, next], [d, t]].map(async ([data, template]) => {
      const walked = await run(page, await build(page, template, 'simulator'), 'simulator', secondsOf(data as Data), { cues: plan(data as Data, points), exit, layers: rows, props, root: (data as Data).root });
      return { ...walked.poses, ...Object.fromEntries(walked.leaving.map((pose, i) => ['out:' + exit[i], pose])) };
    }));
    same(a, b, what, { props, layers: rows });
  };
  void built;
  // Add Step inside the reveal of #f2 (Step 3): it still appears with Step 3.
  const added = await operate(page, t, [{ kind: 'step.add', time: (1.2 + .45 + .2) }]);
  expect((await dataOf(page, added)).steps[2].reveals).toEqual(['#f2']);
  await compare(added, 'card26 Add Step inside Step 3');
  // Delete Step 3: #f2 gets explicit bars and still appears where Step 3 began.
  await compare(await operate(page, t, [{ kind: 'step.delete', step: 2 }]), 'card26 Delete Step 3');
  // Drag Step 4's flag later by five frames.
  await compare(await operate(page, t, [{ kind: 'step.move', step: 3, time: 1.2 + .9 + .2 }]), 'card26 Step 4 dragged later');
});
