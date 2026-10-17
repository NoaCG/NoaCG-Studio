// covers: src/export/targets/ograf.ts
//
// AN OGRAF GRAPHIC RUNS ITS TEMPLATE'S LIFECYCLE AS A PAGE DOES. Under SPX and CasparCG the
// template IS a page: its DOM-ready code waits for DOMContentLoaded, which fires once its whole
// script has run, and its timers end with the page. Inside an OGraf renderer the same code runs
// as a component of a page that loaded long ago and outlives it, so graphic.mjs gives the
// template both halves back: its DOM-ready code runs after its whole script (#964), and dispose()
// stops the timers its code started (#989) and removes the listeners and observers it added (#998).
// A graphic set to leave by itself after N ms leaves after its entrance and that hold, as it does
// in the studio preview, SPX and the HTML overlay, unless a later action or dispose() cancels it
// (#1012).
//
// Every package is built by the real OGraf target from a template the real generators made, and
// mounted the way a renderer mounts it: import graphic.mjs, define the element, append it, load().
// The renderer page runs on Playwright's paused clock, so time moves only when a case moves it.

import { test, expect, type Page } from '@playwright/test';
import { installGraphicBody } from './_graphicBody';
import { graphicTemplate, ografFiles, type GraphicSource } from './_ografBuild';

const ORIGIN = 'http://ograf-lifecycle.local';
const START = new Date('2026-10-11T12:00:00Z');
const PAUSED_AT = new Date('2026-10-11T12:00:30Z');

type Result = { statusCode: number; statusMessage?: string; currentStep?: number };
type Action = 'load' | 'playAction' | 'stopAction' | 'dispose';
type Driver = HTMLElement & Record<Action, (p: unknown) => Promise<Result>>;
/** A graphic to build, with its SPX `out` setting when the case sets one. */
type Source = GraphicSource & { out?: string };

/**
 * Build each source's package in the app, then open a bare renderer page serving each under
 * `/<key>/`. Answers the packages' files by key.
 */
async function openRenderer(page: Page, sources: Record<string, Source>) {
  await page.goto('/app');
  const packages = new Map<string, Map<string, Buffer>>();
  for (const [key, source] of Object.entries(sources)) {
    const template = (await graphicTemplate(page, source)) as { settings: Record<string, string> };
    const files = await ografFiles(page, source.out ? { ...template, settings: { ...template.settings, out: source.out } } : template);
    if (typeof files !== 'object') throw new Error(`${key} did not build: ${files}`);
    packages.set(key, files);
  }
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (path === '') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><title>Renderer</title></head><body></body></html>' });
    const [key, ...rest] = path.split('/');
    const body = packages.get(key)?.get(rest.join('/'));
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: /\.m?js$/.test(path) ? 'application/javascript' : 'application/octet-stream', body });
  });
  await installGraphicBody(page);
  await page.clock.install({ time: START });
  await page.goto(`${ORIGIN}/`);
  await page.clock.pauseAt(PAUSED_AT);
  return packages;
}

/** Mount one package and call `action` on it; `load` mounts it first. Answers the ReturnPayload. */
async function act(page: Page, key: string, action: Action): Promise<Result> {
  return page.evaluate(async ({ origin, key, action }) => {
    let el = document.querySelector(`[data-key="${key}"]`) as Driver | null;
    if (!el) {
      const mod = await import(`${origin}/${key}/graphic.mjs`);
      customElements.define(`lifecycle-${key}`, mod.default);
      el = document.createElement(`lifecycle-${key}`) as Driver;
      el.dataset.key = key;
      document.body.appendChild(el);
    }
    const params = action === 'load' ? { data: {}, renderType: 'realtime', renderCharacteristics: {} } : {};
    const { statusCode, statusMessage, currentStep } = await el[action](params);
    return { statusCode, statusMessage, currentStep };
  }, { origin: ORIGIN, key, action });
}

/**
 * The DOM-ready pattern every generated runtime uses, with a variable assigned BELOW it, where
 * sb21's animation region sets its machine. On a page the DOM-ready code sees the variable set.
 */
const READY_PROBE_JS = `
function readyProbe() {
  var probe = document.getElementById('ready-probe');
  probe.setAttribute('data-runs', String(Number(probe.getAttribute('data-runs') || 0) + 1));
  probe.setAttribute('data-later', String(readyProbeLater));
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', readyProbe);
} else {
  readyProbe();
}
var readyProbeLater = 'set';`;

test("a template's DOM-ready code runs once its whole script has, as on a page (#964)", async ({ page }) => {
  await openRenderer(page, {
    probe: { kind: 'probe', name: 'Ready Probe', html: '<div id="ready-probe"></div>', css: '', js: READY_PROBE_JS },
    sb21: { kind: 'design', id: 'sb21' },
    sb22: { kind: 'design', id: 'sb22' },
  });
  expect(await act(page, 'probe', 'load')).toEqual({ statusCode: 200 });
  const probe = await page.evaluate(() => {
    const el = graphicBody(document.querySelector('[data-key="probe"]')!).querySelector('#ready-probe')!;
    return { runs: el.getAttribute('data-runs'), later: el.getAttribute('data-later') };
  });
  expect.soft(probe, 'the DOM-ready code ran before the rest of the script, or not exactly once').toEqual({ runs: '1', later: 'set' });
  // The designs the issue reported: their DOM-ready repaint reads the machine their animation region sets.
  for (const key of ['sb21', 'sb22']) {
    expect(await act(page, key, 'load'), `${key} did not load`).toEqual({ statusCode: 200 });
    expect(await act(page, key, 'playAction'), `${key} did not play`).toMatchObject({ statusCode: 200 });
  }
});

/**
 * One timer of each kind, each counting into the probe for as long as it runs: two by bare call,
 * as the generated runtimes write them, and the frames through `window` under a binding of the
 * template's own named like the timer, as hand-written code may (it must neither stop the package
 * from parsing nor escape dispose()).
 */
const TIMER_PROBE_JS = `
function timerProbe(kind) {
  var probe = document.getElementById('timer-probe');
  probe.setAttribute('data-' + kind, String(Number(probe.getAttribute('data-' + kind) || 0) + 1));
}
setInterval(function () { timerProbe('interval'); }, 100);
(function again() { timerProbe('timeout'); setTimeout(again, 100); })();
const requestAnimationFrame = window.requestAnimationFrame;
(function frame() { timerProbe('frame'); requestAnimationFrame(frame); })();`;

test('dispose() stops the timers the template started, so a countdown stops counting (#989)', async ({ page }) => {
  await openRenderer(page, {
    gt09: { kind: 'design', id: 'gt09' },
    probe: { kind: 'probe', name: 'Timer Probe', html: '<div id="timer-probe"></div>', css: '', js: TIMER_PROBE_JS },
  });
  for (const key of ['gt09', 'probe']) {
    expect(await act(page, key, 'load'), `${key} did not load`).toEqual({ statusCode: 200 });
    expect(await act(page, key, 'playAction'), `${key} did not play`).toMatchObject({ statusCode: 200 });
  }
  // What each one's timers write, read off its canvas, which stays readable once it is off the page.
  const canvases = await page.evaluateHandle(() => {
    const canvas = (key: string) => graphicBody(document.querySelector(`[data-key="${key}"]`)!);
    return { gt09: canvas('gt09'), probe: canvas('probe') };
  });
  const counts = () => canvases.evaluate(({ gt09, probe }) => {
    const p = probe.querySelector('#timer-probe')!;
    return {
      clock: gt09.querySelector('.game-timer-clock')!.textContent,
      interval: p.getAttribute('data-interval'),
      timeout: p.getAttribute('data-timeout'),
      frame: p.getAttribute('data-frame'),
    };
  });
  const started = await counts();
  await page.clock.runFor(1_500);
  const running = await counts();
  for (const key of ['clock', 'interval', 'timeout', 'frame'] as const) {
    expect(running[key], `the ${key} was not running before dispose() - nothing was proven`).not.toBe(started[key]);
  }
  for (const key of ['gt09', 'probe']) expect(await act(page, key, 'dispose')).toEqual({ statusCode: 200 });
  const disposed = await counts();
  await page.clock.runFor(1_500);
  expect(await counts(), "a timer the template started still runs after dispose()").toEqual(disposed);
});

/**
 * One listener on each object the renderer owns, added the ways the runtimes add them (the
 * document, the page's font set, the window) and the way hand-written code may (a bare call), and
 * a ResizeObserver on the probe itself, each counting into the probe for as long as it is attached.
 * The probe is held from the start, so it can still count once dispose() has taken it off the page.
 */
const LISTENER_PROBE_JS = `
var listenerProbeEl = document.getElementById('listener-probe');
function listenerProbe(kind) {
  listenerProbeEl.setAttribute('data-' + kind, String(Number(listenerProbeEl.getAttribute('data-' + kind) || 0) + 1));
}
document.addEventListener('probe', function () { listenerProbe('document'); });
document.fonts.addEventListener('loadingdone', function () { listenerProbe('fonts'); });
window.addEventListener('probe', function () { listenerProbe('window'); });
addEventListener('bare-probe', function () { listenerProbe('bare'); });
new ResizeObserver(function () { listenerProbe('resize'); }).observe(listenerProbeEl);`;

test('dispose() removes the listeners and observers the template added (#998)', async ({ page }) => {
  await openRenderer(page, {
    svg01: { kind: 'design', id: 'svg01' },
    probe: { kind: 'probe', name: 'Listener Probe', html: '<div id="listener-probe"></div>', css: '#listener-probe { width: 10px; height: 10px; }', js: LISTENER_PROBE_JS },
  });
  // The page's own font set, counting what is listening on it: svg01 refits its text on `loadingdone`.
  await page.evaluate(() => {
    const fonts = document.fonts as FontFaceSet & { listening?: Set<unknown> };
    const listening = (fonts.listening = new Set());
    const add = fonts.addEventListener.bind(fonts);
    const remove = fonts.removeEventListener.bind(fonts);
    fonts.addEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => { listening.add(listener); add(type, listener, options); };
    fonts.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => { listening.delete(listener); remove(type, listener, options); };
  });
  const fontListeners = () => page.evaluate(() => (document.fonts as FontFaceSet & { listening: Set<unknown> }).listening.size);
  for (const key of ['svg01', 'probe']) {
    expect(await act(page, key, 'load'), `${key} did not load`).toEqual({ statusCode: 200 });
    expect(await act(page, key, 'playAction'), `${key} did not play`).toMatchObject({ statusCode: 200 });
  }
  expect(await fontListeners(), 'svg01 and the probe did not both listen on the font set - nothing was proven').toBeGreaterThanOrEqual(2);
  const probe = await page.evaluateHandle(() => graphicBody(document.querySelector('[data-key="probe"]')!).querySelector('#listener-probe')!);
  const counts = () => probe.evaluate((el) => Object.fromEntries(['document', 'fonts', 'window', 'bare', 'resize'].map((kind) => [kind, el.getAttribute(`data-${kind}`)])));
  // Each event once, and a resize of the probe, put back on the page if dispose() took it off. A
  // fresh observer's first answer marks the rendering step every observer still attached answers in.
  const fire = () => probe.evaluate(async (el) => {
    document.dispatchEvent(new Event('probe'));
    document.fonts.dispatchEvent(new Event('loadingdone'));
    window.dispatchEvent(new Event('probe'));
    window.dispatchEvent(new Event('bare-probe'));
    if (!el.isConnected) document.body.appendChild(el);
    el.style.width = `${el.offsetWidth + 7}px`;
    el.style.height = '10px';
    await new Promise<void>((resolve) => new ResizeObserver((_, observer) => { observer.disconnect(); resolve(); }).observe(el));
  });
  const started = await counts();
  await fire();
  const attached = await counts();
  for (const kind of Object.keys(attached)) {
    expect(attached[kind], `the ${kind} listener was not attached before dispose() - nothing was proven`).not.toBe(started[kind]);
  }
  for (const key of ['svg01', 'probe']) expect(await act(page, key, 'dispose')).toEqual({ statusCode: 200 });
  expect.soft(await fontListeners(), 'a graphic still listens on the font set after dispose()').toBe(0);
  const disposed = await counts();
  await fire();
  expect(await counts(), 'a listener or observer the template added still answers after dispose()').toEqual(disposed);
});

/** Counts each exit the graphic plays: the template's own stop(), wrapped where it is declared. */
const EXIT_PROBE_JS = `
var exitProbeStop = stop;
stop = function () {
  var probe = document.getElementById('exit-probe');
  probe.setAttribute('data-exits', String(Number(probe.getAttribute('data-exits') || 0) + 1));
  return exitProbeStop.apply(this, arguments);
};`;

test('a graphic set to leave by itself leaves after its entrance and hold, unless a later action cancels it (#1012)', async ({ page }) => {
  const HOLD = 3_000;
  const probe = (name: string, out: string): Source => ({ kind: 'probe', name, html: '<div id="exit-probe"></div>', css: '', js: EXIT_PROBE_JS, out });
  const keys = ['timed', 'manual', 'stopped', 'replayed', 'disposed'];
  const packages = await openRenderer(page, {
    timed: probe('Timed Exit', String(HOLD)),
    manual: probe('Manual Exit', 'manual'),
    stopped: probe('Stopped Exit', String(HOLD)),
    replayed: probe('Replayed Exit', String(HOLD)),
    disposed: probe('Disposed Exit', String(HOLD)),
  });
  // The entrance, read off the manifest: a timed playAction lasts the entrance, the hold and the exit.
  const manifestOf = (key: string) => {
    const files = packages.get(key)!;
    const name = [...files.keys()].find((file) => file.endsWith('.ograf.json'))!;
    return JSON.parse(files.get(name)!.toString('utf8')) as { stepCount: number; actionDurations: Array<{ type: string; duration: number }> };
  };
  const timed = manifestOf('timed');
  const duration = (type: string) => timed.actionDurations.find((d) => d.type === type)!.duration;
  const entrance = duration('playAction') - HOLD - duration('stopAction');
  expect(timed.stepCount, 'a timed graphic plays in and out by itself').toBe(0);
  expect(manifestOf('manual').stepCount).toBe(1);
  expect(entrance, 'the probe has no entrance, so nothing proves the hold starts after it').toBeGreaterThan(0);

  for (const key of keys) expect(await act(page, key, 'load'), `${key} did not load`).toEqual({ statusCode: 200 });
  // Each probe element is held from the start, so it can still count once dispose() has taken it off the page.
  const probes = await page.evaluateHandle((keys) => keys.map((key) => graphicBody(document.querySelector(`[data-key="${key}"]`)!).querySelector('#exit-probe')!), keys);
  const exits = () => probes.evaluate((els, keys) => Object.fromEntries(els.map((el, i) => [keys[i], Number(el.getAttribute('data-exits') || 0)])), keys);

  expect(await act(page, 'timed', 'playAction'), 'a timed graphic has no step to report').toEqual({ statusCode: 200 });
  expect(await act(page, 'manual', 'playAction')).toEqual({ statusCode: 200, currentStep: 0 });
  for (const key of ['stopped', 'replayed', 'disposed']) expect(await act(page, key, 'playAction')).toEqual({ statusCode: 200 });
  await page.clock.runFor(1_000);
  expect(await act(page, 'stopped', 'stopAction')).toEqual({ statusCode: 200 });
  expect(await act(page, 'disposed', 'dispose')).toEqual({ statusCode: 200 });
  await page.clock.runFor(1_000);
  expect(await act(page, 'replayed', 'playAction')).toEqual({ statusCode: 200 });
  // 2 s in. The first plays' holds end HOLD after their entrances have landed.
  await page.clock.runFor(entrance + HOLD - 2_000 - 50);
  expect(await exits(), 'a timed graphic left before its entrance and hold were over').toEqual({ timed: 0, manual: 0, stopped: 1, replayed: 0, disposed: 0 });
  await page.clock.runFor(100);
  expect(await exits(), 'the timed graphic did not leave by itself, or a cancelled exit still ran').toEqual({ timed: 1, manual: 0, stopped: 1, replayed: 0, disposed: 0 });
  // The second play scheduled an exit of its own, 2 s after the first one's.
  await page.clock.runFor(2_000);
  expect(await exits(), 'a replayed graphic did not leave after its second hold').toEqual({ timed: 1, manual: 0, stopped: 1, replayed: 1, disposed: 0 });
  await page.clock.runFor(10_000);
  expect(await exits(), 'a graphic waiting for Stop left by itself, or an exit ran twice').toEqual({ timed: 1, manual: 0, stopped: 1, replayed: 1, disposed: 0 });
});
