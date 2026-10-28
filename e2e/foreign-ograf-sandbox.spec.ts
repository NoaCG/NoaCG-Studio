// A FOREIGN OGraf package on the stage (docs/OGRAF_ECOSYSTEM.md §3): the isolated player, the
// host document it loads, the ControlMessage -> OGraf call mapping, and the benign and hostile
// fixtures. The one spec that proves the boundary, and output-first-paint because the stage
// module is what the published graphics load through as well.
// covers: {src/output/{stage.ts,foreignOgraf.ts},src/control/ograf{Host.ts,Contract.ts,Steps.ts},e2e/fixtures/foreign-ograf/**}

import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OgrafReturn } from '../src/output/foreignOgraf';

/**
 * A STRANGER'S OGRAF PACKAGE ON THE OUTPUT STAGE, BEHIND THE BOUNDARY (docs/OGRAF_ECOSYSTEM.md §3).
 *
 * The real /output shell is served with its boot module swapped for a harness that builds the
 * shipped stage (src/output/stage.ts) with one NoaCG graphic and the foreign packages under
 * e2e/fixtures/foreign-ograf/. The page's URL carries a capability-shaped `production` value, and
 * the page holds the same value in localStorage and a cookie: that is the credential the foreign
 * code must never see.
 *
 * The packages are served under /__foreign-ograf/packages/<name>/ from a file map, with CORS open
 * (the frame's origin is opaque). A "controller secret" is served BESIDE the packages with CORS
 * open too, and the internet (exfil.example.com) answers anything: so when the hostile probe
 * cannot reach either, the refusal is the frame's own boundary, not the harness's.
 *
 * Mutation-tested: adding `allow-same-origin` to the foreign frame turns the hostile test red
 * (parent DOM, URL and storage become readable), and dropping the network policy turns it red
 * (the internet and the secret beside the package become reachable).
 */

const FIXTURES = fileURLToPath(new URL('fixtures/foreign-ograf/', import.meta.url));
const CREDENTIAL = `cap-e2e-${Math.random().toString(36).slice(2, 12)}`;
const EXFIL = 'https://exfil.example.com';
/** The pinned OGraf standard a typed envelope names (model/ografTyped.ts `OGRAF_STANDARD`). */
const STANDARD = 'c821671195a077be13bbb96989d4220eea157b99';

const HARNESS = `
import { createOutputStage } from '/src/output/stage.ts';
import { lt01 } from '/src/templates/lowerThirds/lt01.ts';

const q = new URLSearchParams(location.search);
const design = lt01.create();
const graphics = [{ key: 'lt0', html: design.html, css: design.css, js: design.js, assets: [], resolution: design.resolution, fps: design.fps, layer: 10 }];
const foreign = [];
for (const [i, name] of (q.get('foreign') || '').split(',').filter(Boolean).entries()) {
  const packageBase = location.origin + '/__foreign-ograf/packages/' + name + '/';
  const manifest = await (await fetch(packageBase + name + '.ograf.json')).json();
  foreign.push({ key: name, layer: 20 + i, packageBase, manifest, data: name === 'benign' ? { headline: 'Opening night', score: '3' } : {} });
}
const timeout = Number(q.get('timeout')) || undefined;
// PUBLISHED PACKAGES (E3.2a): payload graphics with \`ograf\`, mounted from the base the stage is
// answered. 'walk' shares lt0's layer 10, and its base waits until the spec releases it; 'lost' is a
// package whose base is refused. \`monitor\` gives no base at all, as the production page's monitors.
const mode = q.get('published');
let ografBase;
if (mode) {
  const base = location.origin + '/__foreign-ograf/packages/steps/';
  const manifest = await (await fetch(base + 'steps.ograf.json')).json();
  const pkg = (key, layer) => ({ key, html: '', css: '', js: '', assets: [], resolution: design.resolution, fps: design.fps, layer, ograf: { revision: 'a'.repeat(64), manifest } });
  graphics.push(pkg('walk', 10), pkg('lost', 30));
  let release;
  const released = new Promise((r) => (release = r));
  window.__release = release;
  window.__pkg = pkg;
  window.__asked = [];
  if (mode !== 'monitor') ografBase = (spec, version) => {
    window.__asked.push([spec.key, version ?? null]);
    return spec.key === 'lost' ? Promise.resolve(null) : released.then(() => base);
  };
}
const stage = createOutputStage(document.body, { v: 1, resolution: design.resolution, graphics, cues: [] }, { foreign, ograf: { callTimeoutMs: timeout }, ografBase });
window.__stage = stage;
if (!mode) await stage.whenLoaded();
window.__stageReady = true;
`;

/** Every file of one fixture package, by its path inside the package. */
function packageFiles(name: string): Map<string, Buffer> {
  const root = join(FIXTURES, name);
  const files = new Map<string, Buffer>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(root, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(root);
  return files;
}

const PACKAGES = new Map(['benign', 'hostile', 'steps'].map((name) => [name, packageFiles(name)]));

const TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

interface Served {
  /** Paths asked of the package scope, in order. */
  scope: string[];
  /** Every request that reached the internet. */
  exfil: string[];
  swapped: boolean;
  /** Package paths answered 404, as a file removed from what is served (E3.2b). */
  missing: Set<string>;
}

async function mountHarness(page: Page): Promise<Served> {
  const served: Served = { scope: [], exfil: [], swapped: false, missing: new Set() };
  await page.addInitScript((credential) => {
    // The TOP document only: this script runs in every frame, the sandboxed ones included.
    if (window.top === window) {
      localStorage.setItem('noacg-e2e-credential', credential);
      document.cookie = `noacg_e2e_session=${credential}; path=/`;
    }
  }, CREDENTIAL);
  await page.route('**/foreign-ograf/boot.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: HARNESS }));
  await page.route('**/foreign-ograf/output*', async (route) => {
    const real = await route.fetch({ url: new URL('/output?production=probe', route.request().url()).toString() });
    const html = (await real.text()).replace(
      /<script type="module" src="\/src\/output\/main\.ts[^"]*"><\/script>/,
      '<script type="module" src="/foreign-ograf/boot.js"></script>',
    );
    served.swapped = html.includes('/foreign-ograf/boot.js');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route('**/__foreign-ograf/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    served.scope.push(path);
    const open = { 'access-control-allow-origin': '*' };
    if (path === '/__foreign-ograf/controller-secret.json') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: open, body: JSON.stringify({ credential: CREDENTIAL }) });
    }
    const m = /^\/__foreign-ograf\/packages\/([a-z]+)\/(.+)$/.exec(path);
    const body = m && !served.missing.has(path) ? PACKAGES.get(m[1])?.get(decodeURIComponent(m[2])) : undefined;
    if (!body) return route.fulfill({ status: 404, headers: open, body: 'not in package' });
    const ext = path.slice(path.lastIndexOf('.'));
    return route.fulfill({ status: 200, contentType: TYPES[ext] ?? 'application/octet-stream', headers: open, body });
  });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';
  await page.route(`${EXFIL}/**`, (route) => {
    served.exfil.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: svg });
  });
  return served;
}


type StageHandle = {
  apply(g: string, m: unknown): void;
  requestState(g: string): void;
  states: Map<string, unknown>;
  replies: Map<string, number>;
  ografReturns: Map<string, OgrafReturn[]>;
};

async function openStage(page: Page, foreign: string, published = ''): Promise<void> {
  await page.goto(`/foreign-ograf/output?production=${CREDENTIAL}&foreign=${foreign}${published ? `&published=${published}` : ''}`);
  await page.waitForFunction(() => (window as unknown as { __stageReady?: boolean }).__stageReady === true, undefined, { timeout: 20_000 });
}

const apply = (page: Page, graphic: string, msg: unknown) =>
  page.evaluate(({ graphic, msg }) => (window as unknown as { __stage: StageHandle }).__stage.apply(graphic, msg), { graphic, msg });

const returnsOf = (page: Page, graphic: string) =>
  page.evaluate((g) => [...((window as unknown as { __stage: StageHandle }).__stage.ografReturns.get(g) ?? [])], graphic);

/** Wait for the graphic's n-th reply and return it. */
async function nthReturn(page: Page, graphic: string, n: number): Promise<OgrafReturn> {
  await expect.poll(async () => (await returnsOf(page, graphic)).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(n);
  return (await returnsOf(page, graphic))[n - 1];
}

/** The NoaCG graphic's machine state, asked for and answered AFTER everything already sent to it. */
async function freshState(page: Page, graphic: string): Promise<string> {
  const before = await page.evaluate((g) => (window as unknown as { __stage: StageHandle }).__stage.replies.get(g) ?? 0, graphic);
  await page.evaluate((g) => (window as unknown as { __stage: StageHandle }).__stage.requestState(g), graphic);
  await expect
    .poll(() => page.evaluate((g) => (window as unknown as { __stage: StageHandle }).__stage.replies.get(g) ?? 0, graphic), { timeout: 10_000 })
    .toBeGreaterThan(before);
  return page.evaluate((g) => JSON.stringify((window as unknown as { __stage: StageHandle }).__stage.states.get(g) ?? null), graphic);
}

test.describe('a foreign OGraf package on the output stage', () => {
  let served: Served;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    served = await mountHarness(page);
  });

  test.afterEach(() => {
    expect(served.swapped, 'the /output shell still loads its boot module the way this spec swaps').toBe(true);
  });

  test('loads, plays, updates, steps, runs its custom action and stops through the standard calls', async ({ page }) => {
    await openStage(page, 'benign');
    const frame = page.locator('iframe[title="benign"]');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');

    // The operator surface comes from the manifest alone.
    const contract = await page.evaluate(async () => {
      const { ografContract } = await import('/src/control/ografContract.ts');
      const manifest = await (await fetch('/__foreign-ograf/packages/benign/benign.ograf.json')).json();
      return ografContract(manifest);
    });
    expect(contract.steps).toEqual({ count: 3, stepped: true });
    expect(contract.buttons.map((b: { event: string; payload?: string[] }) => [b.event, b.payload])).toEqual([['highlight', ['tint']]]);

    const board = page.frameLocator('iframe[title="benign"]').locator('.board');
    expect(await nthReturn(page, 'benign', 1)).toEqual({ call: 'mount', statusCode: 200 });
    // Its own package stayed reachable: a sub-module, an image and a data file.
    await expect(board).toHaveAttribute('data-image', 'loaded');
    await expect(board).toHaveAttribute('data-labels', 'loaded');
    await expect(board.locator('.headline')).toHaveText('Opening night');
    await expect(board.locator('.score')).toHaveText('03');
    await expect(board).toHaveAttribute('data-on', 'false');

    await apply(page, 'benign', { t: 'play' });
    expect(await nthReturn(page, 'benign', 2)).toEqual({ call: 'play', statusCode: 200, currentStep: 0 });
    await expect(board).toHaveAttribute('data-on', 'true');
    await expect(board.locator('.round')).toHaveText('Round one');

    await apply(page, 'benign', { t: 'update', data: { headline: 'Final whistle', score: '7' } });
    expect(await nthReturn(page, 'benign', 3)).toEqual({ call: 'update', statusCode: 200 });
    await expect(board.locator('.headline')).toHaveText('Final whistle');
    await expect(board.locator('.score')).toHaveText('07');

    await apply(page, 'benign', { t: 'next' });
    expect(await nthReturn(page, 'benign', 4)).toEqual({ call: 'play', statusCode: 200, currentStep: 1 });
    await apply(page, 'benign', { t: 'next' });
    expect(await nthReturn(page, 'benign', 5)).toEqual({ call: 'play', statusCode: 200, currentStep: 2 });
    await expect(board.locator('.round')).toHaveText('Final round');

    await apply(page, 'benign', { t: 'event', event: 'highlight', payload: { tint: 'silver' } });
    expect(await nthReturn(page, 'benign', 6)).toEqual({ call: 'custom', statusCode: 200 });
    await expect(board).toHaveAttribute('data-tint', 'silver');

    // A snap is NoaCG's machine vocabulary: it reaches no foreign Graphic.
    await apply(page, 'benign', { t: 'snap', snap: { base: 'in' } });
    await apply(page, 'benign', { t: 'stop' });
    expect(await nthReturn(page, 'benign', 7)).toEqual({ call: 'stop', statusCode: 200 });
    await expect(board).toHaveAttribute('data-on', 'false');
    expect(await returnsOf(page, 'benign')).toHaveLength(7);

    // Off air is taken from INSIDE the document, as for a NoaCG layer: the frame stays composited.
    const hostStage = page.frameLocator('iframe[title="benign"]').locator('#stage');
    await page.evaluate(() => (window as unknown as { __stage: { setVisible(v: boolean): void } }).__stage.setVisible(false));
    await expect(hostStage).toHaveCSS('opacity', '0');
    await expect(frame).toHaveCSS('opacity', '1');
    await page.evaluate(() => (window as unknown as { __stage: { setVisible(v: boolean): void } }).__stage.setVisible(true));
    await expect(hostStage).toHaveCSS('opacity', '1');

    // The NoaCG graphic beside it plays as ever.
    const idle = await freshState(page, 'lt0');
    await apply(page, 'lt0', { t: 'play' });
    await expect.poll(() => freshState(page, 'lt0')).not.toBe(idle);
  });

  test('a hostile package is contained, and each refusal is its own', async ({ page }) => {
    await openStage(page, 'benign,hostile');
    const probeText = await page.frameLocator('iframe[title="hostile"]').locator('#probe').textContent({ timeout: 20_000 });
    const probe = JSON.parse(probeText ?? '{}') as { results: Record<string, { outcome: string; detail: string }>; seen: string };
    const outcome = (name: string) => `${name}: ${probe.results[name]?.outcome} (${probe.results[name]?.detail})`;

    // It READS ITS PARENT: the frame's origin is opaque, so the page is another origin to it.
    expect(outcome('parent-dom')).toMatch(/^parent-dom: refused/);
    expect(outcome('parent-url')).toMatch(/^parent-url: refused/);
    expect(outcome('parent-storage')).toMatch(/^parent-storage: refused/);
    expect(outcome('own-storage')).toMatch(/^own-storage: refused/);
    expect(outcome('cookie')).toMatch(/^cookie: refused/);
    // …and nothing it could see anywhere carries the output capability or the session.
    expect(probe.seen).not.toContain(CREDENTIAL);
    expect(probe.seen).not.toContain('noacg-e2e-credential');

    // It FETCHES THE INTERNET: refused before a request leaves (fetch and image here; its beacon
    // is covered by the empty request log at the end).
    expect(outcome('fetch-internet')).toMatch(/^fetch-internet: refused/);
    expect(outcome('image-internet')).toMatch(/^image-internet: refused/);
    // …and it cannot take the page with it.
    expect(outcome('top-navigation')).toMatch(/^top-navigation: refused/);
    expect(page.url()).toContain('/foreign-ograf/output');

    // It WALKS OUT OF ITS PACKAGE: to the secret beside it and into a sibling package.
    expect(outcome('walk-out-fetch')).toMatch(/^walk-out-fetch: refused/);
    expect(outcome('walk-out-import')).toMatch(/^walk-out-import: refused/);
    expect(outcome('walk-out-image')).toMatch(/^walk-out-image: refused/);
    expect(served.scope).not.toContain('/__foreign-ograf/controller-secret.json');
    expect(served.scope.filter((p) => p.startsWith('/__foreign-ograf/packages/benign/') && p.endsWith('format.mjs'))).toHaveLength(1);

    // It COMMANDS ITS NEIGHBOURS: the messages are sent, and nobody obeys them. The NoaCG graphic
    // answers a state request only after everything already posted to it, so its state below
    // already includes the forged `play` if it had been taken.
    expect(outcome('command-neighbours')).toMatch(/^command-neighbours: reached \(posted to 2 neighbours\)/);
    const afterHostile = await freshState(page, 'lt0');
    expect(afterHostile, "the forged state report was not taken as the NoaCG graphic's").not.toContain('forged');
    expect(JSON.parse(afterHostile), 'the forged `play` was not obeyed: lt01 is still off').toEqual({ groups: { main: 'off' } });
    // The port it offered the benign host was refused, so its `play` never ran: the Graphic is off
    // until WE play it. (Here the host already holds the stage's port by then, and it takes one
    // port only; its check that the port comes from its parent is not isolated by this spec.
    // Removing that check alone stays green, measured.)
    await expect(page.frameLocator('iframe[title="benign"]').locator('.board')).toHaveAttribute('data-on', 'false');
    await apply(page, 'benign', { t: 'play' });
    expect(await nthReturn(page, 'benign', 2)).toEqual({ call: 'play', statusCode: 200, currentStep: 0 });
    await expect(page.frameLocator('iframe[title="benign"]').locator('.board')).toHaveAttribute('data-on', 'true');
    // The positive control for the state reading above: a real `play` does change it.
    await apply(page, 'lt0', { t: 'play' });
    await expect.poll(() => freshState(page, 'lt0')).not.toBe(afterHostile);

    // Nothing of it reached the internet at all.
    expect(served.exfil).toEqual([]);

    // A frame that navigates ITSELF away (the one move a sandbox and a CSP cannot forbid) is no
    // longer the host, and the stage sends it nothing more. The new document records any call.
    const hostile = await (await page.locator('iframe[title="hostile"]').elementHandle())!.contentFrame();
    await hostile!.evaluate(() => {
      location.href = 'data:text/html,<script>addEventListener("message", () => { document.title = "got a call"; })</script>';
    });
    await expect.poll(() => hostile!.url()).toMatch(/^data:/);
    await hostile!.waitForLoadState('load');
    await apply(page, 'hostile', { t: 'update', data: { note: 'operator data' } });
    const heard = await hostile!.evaluate(() => new Promise<string>((r) => setTimeout(() => r(document.title), 300)));
    expect(heard, 'a call reached the document the frame navigated to').toBe('');
  });
  test('steps go where the runtime says, out-of-range steps are refused, and no answer reads as done that was not', async ({ page }) => {
    test.setTimeout(90_000);
    // A short host deadline, so a held answer times out inside the test. Every wait below is on an
    // answer or a data attribute the Graphic wrote, never on a sleep.
    await openStage(page, 'benign,steps&timeout=1500');
    const layer = (key: string, run: string, arg?: unknown) =>
      page.evaluate(
        ({ key, run, arg }) => {
          const l = (window as unknown as { __stage: { foreignLayer(k: string): Record<string, (a?: unknown) => unknown> | undefined } }).__stage.foreignLayer(key);
          if (!l) return 'no layer';
          return l[run](arg);
        },
        { key, run, arg },
      );
    const step = (key: string, op: unknown) => layer(key, 'step', op);
    const call = (key: string, msg: unknown) => layer(key, 'call', msg);
    // Starts a call and keeps its answer on the page, for a call whose answer is held.
    const start = (key: string, name: string, msg: unknown) =>
      page.evaluate(
        ({ key, name, msg }) => {
          const w = window as unknown as { __answers?: Record<string, unknown>; __stage: { foreignLayer(k: string): { call(m: unknown): Promise<unknown>; step(o: unknown): Promise<unknown> } } };
          const answers = (w.__answers ??= {});
          answers[name] = 'pending';
          const l = w.__stage.foreignLayer(key);
          const p = (msg as { step?: unknown }).step ? l.step((msg as { step: unknown }).step) : l.call(msg);
          void p.then((a) => (answers[name] = a));
        },
        { key, name, msg },
      );
    const answerOf = (name: string) => page.evaluate((n) => (window as unknown as { __answers: Record<string, unknown> }).__answers[n], name);
    const sentCount = async (key: string) => (await returnsOf(page, key)).length;
    await nthReturn(page, 'benign', 1);
    await nthReturn(page, 'steps', 1);

    // A NoaCG graphic has no OGraf steps: it steps by » Next and recovers by Snap, never as Goto.
    expect(await page.evaluate(() => (window as unknown as { __stage: { foreignLayer(k: string): unknown } }).__stage.foreignLayer('lt0') === undefined)).toBe(true);

    // A FIXED COUNT (benign declares 3). Before any answer, where it is is unknown.
    expect(await step('benign', { delta: 1 })).toEqual({ status: 'refused', reason: 'Where it is is not known yet; Goto a step.' });
    expect(await call('benign', { t: 'play' })).toEqual({ status: 'done', statusCode: 200, currentStep: 0 });
    const before = await sentCount('benign');
    expect(await step('benign', { delta: -1 })).toEqual({ status: 'refused', reason: 'It is on step 1; there is no step before the first.' });
    expect(await step('benign', { goto: 3 })).toEqual({ status: 'refused', reason: 'It has steps 1 to 3; there is no step 4.' });
    expect(await sentCount('benign'), 'a refused step reaches the Graphic not at all').toBe(before);
    expect(await step('benign', { goto: 2, skipAnimation: true })).toEqual({ status: 'done', statusCode: 200, currentStep: 2 });
    expect(await step('benign', { delta: 1 })).toEqual({ status: 'refused', reason: 'It is on step 3 of 3; Out ends it.' });
    expect(await step('benign', { delta: -1 })).toEqual({ status: 'done', statusCode: 200, currentStep: 1 });
    await expect(page.frameLocator('iframe[title="benign"]').locator('.round')).toHaveText('Round two');

    // A DYNAMIC COUNT (steps declares -1): its data says 3, then 5 while it airs.
    const walk = page.frameLocator('iframe[title="steps"]').locator('.walk');
    expect(await call('steps', { t: 'play' })).toEqual({ status: 'done', statusCode: 200, currentStep: 0 });
    expect(await step('steps', { delta: 1 })).toEqual({ status: 'done', statusCode: 200, currentStep: 1 });
    // A step the Graphic refuses moved nothing: it is still where it was, and a relative step counts
    // from there.
    expect(await call('steps', { t: 'update', data: { refuse: 3 } })).toEqual({ status: 'done', statusCode: 200 });
    expect(await step('steps', { goto: 3 })).toEqual({ status: 'rejected', statusCode: 409, statusMessage: 'not that step now' });
    expect(await layer('steps', 'position')).toEqual({ at: 1, declared: -1 });
    // So did an Out it refused.
    expect(await call('steps', { t: 'update', data: { refuseStop: true } })).toEqual({ status: 'done', statusCode: 200 });
    expect(await call('steps', { t: 'stop' })).toEqual({ status: 'rejected', statusCode: 409, statusMessage: 'not out now' });
    expect(await layer('steps', 'position')).toEqual({ at: 1, declared: -1 });
    expect(await call('steps', { t: 'update', data: { refuseStop: false } })).toEqual({ status: 'done', statusCode: 200 });
    expect(await call('steps', { t: 'update', data: { count: 5 } })).toEqual({ status: 'done', statusCode: 200 });
    await expect(walk).toHaveAttribute('data-count', '5');
    expect(await step('steps', { goto: 4, skipAnimation: true })).toEqual({ status: 'done', statusCode: 200, currentStep: 4 });
    await expect(walk).toHaveAttribute('data-skip', 'true');
    expect(await step('steps', { delta: 1 }), 'past its end it answers no step').toEqual({ status: 'done', statusCode: 200 });
    expect(await layer('steps', 'position')).toEqual({ at: 'end', declared: -1 });
    expect(await step('steps', { delta: -1 })).toEqual({ status: 'refused', reason: 'It has played to its end; Goto a step.' });
    expect(await step('steps', { goto: 0 })).toEqual({ status: 'done', statusCode: 200, currentStep: 0 });
    await expect(walk).toHaveAttribute('data-skip', 'false');

    // A HELD STEP WITH A RUNNING LOOP: its playAction never answers, and nothing waits behind it.
    expect(await call('steps', { t: 'update', data: { loop: 2 } })).toEqual({ status: 'done', statusCode: 200 });
    await start('steps', 'held-step', { step: { goto: 2 } });
    await expect(walk).toHaveAttribute('data-step', '2');
    await expect.poll(async () => Number(await walk.getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(5);
    expect(await call('steps', { t: 'event', event: 'mark', payload: { v: 'during the loop' } })).toEqual({ status: 'done', statusCode: 200 });
    await expect(walk).toHaveAttribute('data-mark', 'during the loop');
    expect(await answerOf('held-step')).toBe('pending');
    expect(await step('steps', { delta: 1 }), 'no relative step counts from a step still out').toEqual({ status: 'refused', reason: 'Where it is is not known yet; Goto a step.' });
    // A Goto answered while the held step is still out: the walk is where the newest step left it,
    // and the older step's timeout, answered after, moves nothing.
    expect(await step('steps', { goto: 0 })).toEqual({ status: 'done', statusCode: 200, currentStep: 0 });
    await expect.poll(() => answerOf('held-step'), { timeout: 10_000 }).toEqual({ status: 'timeout', statusMessage: 'no answer within 1500 ms' });
    expect(await layer('steps', 'position')).toEqual({ at: 0, declared: -1 });
    expect(await step('steps', { delta: 1 })).toEqual({ status: 'done', statusCode: 200, currentStep: 1 });

    // HELD, REJECTED AND LATE ACTIONS: a refusal is a refusal, and an answer after the deadline
    // never turns the timeout the operator was told into a success.
    await start('steps', 'held', { t: 'event', event: 'hold' });
    await expect(walk).toHaveAttribute('data-held', '1');
    expect(await call('steps', { t: 'event', event: 'reject' })).toEqual({ status: 'rejected', statusCode: 409, statusMessage: 'not now' });
    expect(await answerOf('held')).toBe('pending');
    await expect.poll(() => answerOf('held'), { timeout: 10_000 }).toEqual({ status: 'timeout', statusMessage: 'no answer within 1500 ms' });
    const told = await sentCount('steps');
    expect(await call('steps', { t: 'event', event: 'release' })).toEqual({ status: 'done', statusCode: 200 });
    await expect(walk).toHaveAttribute('data-held', '0');
    expect(await answerOf('held'), 'the late answer changed nothing').toEqual({ status: 'timeout', statusMessage: 'no answer within 1500 ms' });
    expect((await returnsOf(page, 'steps')).slice(told), 'only the release answered').toEqual([{ call: 'custom', statusCode: 200 }]);

    // AN INSTANCE REPLACED WITH AN ACTION IN FLIGHT: the call is gone with its instance, and the
    // instance after it has seen nothing of it.
    const replaced = await page.evaluate(async () => {
      const { mountForeignOgraf } = await import('/src/output/foreignOgraf.ts');
      const base = location.origin + '/__foreign-ograf/packages/steps/';
      const manifest = await (await fetch(base + 'steps.ograf.json')).json();
      const spec = { key: 'swap', layer: 40, packageBase: base, manifest };
      const resolution = { width: 1920, height: 1080 };
      const first = mountForeignOgraf(document.body, spec, resolution, { callTimeoutMs: 30_000 });
      await first.loaded;
      const played = await first.call({ t: 'play' });
      const held = first.call({ t: 'event', event: 'hold' })!;
      const frames = () => document.querySelectorAll('iframe[title="swap"]').length;
      first.destroy();
      const second = mountForeignOgraf(document.body, spec, resolution, { callTimeoutMs: 30_000 });
      await second.loaded;
      const heldAnswer = await held;
      const after = await first.call({ t: 'event', event: 'release' });
      const secondPlay = await second.call({ t: 'play' });
      const result = { played, heldAnswer, after, secondPlay, frames: frames(), secondReturns: second.returns.map((r) => r.call), at: second.position().at };
      second.destroy();
      return result;
    });
    // A SLOW LOAD DOES NOT EAT A CALL'S ANSWER WINDOW: the host times a call from load()'s answer,
    // and so does this page. A load and an action each inside the 3 s deadline answer done, though
    // together they pass the deadline plus the page's 2 s grace.
    const slow = await page.evaluate(async () => {
      const { mountForeignOgraf } = await import('/src/output/foreignOgraf.ts');
      const base = location.origin + '/__foreign-ograf/packages/steps/';
      const manifest = await (await fetch(base + 'steps.ograf.json')).json();
      const layer = mountForeignOgraf(document.body, { key: 'slow', layer: 41, packageBase: base, manifest, data: { loadMs: 2600 } }, { width: 1920, height: 1080 }, { callTimeoutMs: 3000 });
      const answer = await layer.call({ t: 'event', event: 'slow', payload: { ms: '2600' } })!;
      layer.destroy();
      return answer;
    });
    expect(slow).toEqual({ status: 'done', statusCode: 200 });

    expect(replaced).toEqual({
      played: { status: 'done', statusCode: 200, currentStep: 0 },
      heldAnswer: { status: 'gone' },
      after: { status: 'gone' },
      secondPlay: { status: 'done', statusCode: 200, currentStep: 0 },
      frames: 1,
      secondReturns: ['mount', 'play'],
      at: 0,
    });
  });
  test('a published package mounts from its served base beside a NoaCG graphic, off air when the stage is, and says what it did', async ({ page }) => {
    await openStage(page, '', 'output');
    const outcome = (key: string) => page.evaluate((k) => (window as unknown as { __stage: { ografOutcomes: Map<string, unknown> } }).__stage.ografOutcomes.get(k) ?? null, key);
    // A package whose base is refused is not mounted, and its stage says so in its own word.
    await expect.poll(() => outcome('lost')).toEqual({ i: null, status: 'unmounted', msg: 'its package could not be reached', on: false });
    await expect(page.locator('iframe[title="lost"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __stage: StageHandle & { graphics: string[] } }).__stage.graphics), 'a package is never composed').toEqual(['lt0']);

    // A boot's catch-up: the stage goes off air, and what reaches the package while its base is still
    // being asked for waits, in order. The stage stays dumb about layers: lt0 shares the package's
    // layer and stays as it is (the Take verb owns the same-layer rule, control/graphicVerbs.ts).
    const idle = await freshState(page, 'lt0');
    await apply(page, 'lt0', { t: 'play' });
    await expect.poll(() => freshState(page, 'lt0')).not.toBe(idle);
    const upState = await freshState(page, 'lt0');
    await page.evaluate(() => (window as unknown as { __stage: { setVisible(v: boolean): void } }).__stage.setVisible(false));
    await apply(page, 'walk', { t: 'update', data: { count: 4 } });
    await apply(page, 'walk', { t: 'play' });
    await expect(page.locator('iframe[title="walk"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __stage: { ografOutcomes: Map<string, unknown> } }).__stage.ografOutcomes.has('walk')), 'nothing said before the Graphic answers').toBe(false);

    // Released, the package mounts OFF AIR, so the replay settles unseen, and what reached it while
    // it waited arrives in order.
    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    const walkFrame = page.locator('iframe[title="walk"]');
    await expect(walkFrame).toHaveAttribute('data-ograf', 'foreign');
    await expect(walkFrame).toHaveAttribute('sandbox', 'allow-scripts');
    const instance = await walkFrame.getAttribute('data-instance');
    expect(instance).toMatch(/^[0-9a-f]{8}$/);
    const walk = page.frameLocator('iframe[title="walk"]').locator('.walk');
    const hostStage = page.frameLocator('iframe[title="walk"]').locator('#stage');
    await expect(walk).toHaveAttribute('data-count', '4');
    await expect(walk).toHaveAttribute('data-step', '0');
    await expect(hostStage).toHaveCSS('opacity', '0');
    await page.evaluate(() => (window as unknown as { __stage: { setVisible(v: boolean): void } }).__stage.setVisible(true));
    await expect(hostStage).toHaveCSS('opacity', '1');
    expect(await freshState(page, 'lt0'), 'the NoaCG graphic on the same layer is the stage\'s to leave alone').toBe(upState);
    // The outcome is the output's own reading of the Graphic's answers: its instance, its last
    // call, whether it is up and where.
    await expect.poll(() => outcome('walk')).toEqual({ i: instance, call: 'play', status: 'done', code: 200, step: 0, on: true });

    // Typed data reaches it as typed values; an Out takes it down.
    await apply(page, 'walk', { t: 'update', data: {}, typed: { v: 1, kind: 'values', standard: STANDARD, schema: 's', values: { count: 6 } } });
    await expect(walk).toHaveAttribute('data-count', '6');
    await expect.poll(async () => ((await outcome('walk')) as { call: string }).call).toBe('update');
    expect(((await outcome('walk')) as { on: boolean }).on, 'an update leaves it up').toBe(true);
    await apply(page, 'walk', { t: 'stop' });
    await expect(walk).toHaveAttribute('data-step', '-1');
    await expect.poll(async () => ((await outcome('walk')) as { call: string; on: boolean }).call).toBe('stop');
    expect(((await outcome('walk')) as { on: boolean }).on).toBe(false);

    // A Take whose answer comes after the Out pressed behind it says nothing about being up: the
    // Out's answer is the newest, so the package reads off air (Codex P2 on 229d34f).
    const before = (await returnsOf(page, 'walk')).length;
    await apply(page, 'walk', { t: 'update', data: { playMs: 800 } });
    await apply(page, 'walk', { t: 'play' });
    await apply(page, 'walk', { t: 'stop' });
    await expect.poll(async () => (await returnsOf(page, 'walk')).slice(before).map((r) => r.call), { timeout: 10_000 }).toEqual(['update', 'stop', 'play']);
    await expect.poll(async () => ((await outcome('walk')) as { call: string }).call).toBe('play');
    expect(((await outcome('walk')) as { on: boolean }).on, 'the late Take moved nothing').toBe(false);
    await apply(page, 'walk', { t: 'update', data: { playMs: 0 } });

    // A refusal is reported as one, never as on air.
    await apply(page, 'walk', { t: 'update', data: { refuse: 0 } });
    await apply(page, 'walk', { t: 'play' });
    await expect.poll(() => outcome('walk')).toEqual({ i: instance, call: 'play', status: 'rejected', code: 409, msg: 'not that step now', step: null, on: false });
    // A declared action reaches the mounted package's customAction.
    await apply(page, 'walk', { t: 'event', event: 'mark', payload: {}, typed: { v: 1, kind: 'action', standard: STANDARD, schema: 's', action: 'mark', args: { v: 'typed' } } });
    await expect(walk).toHaveAttribute('data-mark', 'typed');
    await expect.poll(async () => ((await outcome('walk')) as { call: string }).call).toBe('custom');

    // A package a later publication adds is asked for with THAT publication's version, which this
    // output has not adopted yet (output/swap.ts hands it over).
    await page.evaluate(() => {
      const w = window as unknown as { __stage: { add(spec: unknown, version?: string): void }; __pkg: (key: string, layer: number) => unknown };
      w.__stage.add(w.__pkg('later', 31), 'v2');
    });
    await expect(page.locator('iframe[title="later"]')).toHaveAttribute('data-ograf', 'foreign');
    expect(await page.evaluate(() => (window as unknown as { __asked: unknown[] }).__asked)).toContainEqual(['later', 'v2']);
    expect(await page.evaluate(() => (window as unknown as { __asked: unknown[] }).__asked)).toContainEqual(['walk', null]);

    // A NoaCG graphic of the package's name is not swapped in over it: the output says it changes at
    // its next reload, and the package keeps the layer it holds.
    const swapped = await page.evaluate(() => {
      const w = window as unknown as { __stage: { prepare(spec: unknown): { error(): string | null } } };
      return w.__stage.prepare({ key: 'walk', html: '<div></div>', css: '', js: '', assets: [], resolution: { width: 1920, height: 1080 }, fps: 25, layer: 10 }).error();
    });
    expect(swapped).toBe('An imported OGraf package changes on this output when the output reloads.');
    await expect(walkFrame).toHaveCount(1);

    // Removed, its instance goes with every word about it.
    await page.evaluate(() => (window as unknown as { __stage: { remove(k: string): void } }).__stage.remove('walk'));
    await expect(walkFrame).toHaveCount(0);
    expect(await outcome('walk')).toBeNull();
  });

  // RESTART, FAILURE AND TRUTHFUL RECOVERY (E3.2b, AC-3) and the frame adjust (playout adjustments
  // AC-10's foreign case), on the stage. Mutation-tested: without the stage's check that an answer
  // is the CURRENT instance's, the replaced instance's late `gone` is told over the new one and the
  // "never the old instance" assertion goes red; with a remount on any Take (not only a lost
  // instance's), the healthy re-Take reads a new instance; with the appearance's style passed
  // through, `data-appearance` carries `vars`.
  test('a lost instance is mounted again only by a re-cue, its old word is refused, and a removed file and a refused action say what they are', async ({ page }) => {
    await openStage(page, '', 'output&timeout=600');
    type Outcome = { i: string | null; call?: string; status: string; on: boolean; step?: unknown; was?: string; acted?: boolean; unknown?: string; msg?: string };
    const outcome = (key: string) => page.evaluate((k) => (window as unknown as { __stage: { ografOutcomes: Map<string, unknown> } }).__stage.ografOutcomes.get(k) ?? null, key) as Promise<Outcome | null>;
    await page.evaluate(() => {
      const w = window as unknown as { __stage: { onOgraf(cb: (k: string) => void): void; ografOutcomes: Map<string, unknown> }; __told: unknown[] };
      w.__told = [];
      w.__stage.onOgraf((k) => k === 'walk' && w.__told.push(w.__stage.ografOutcomes.get(k)));
      (window as unknown as { __release: () => void }).__release();
    });
    const walkFrame = page.locator('iframe[title="walk"]');
    const walk = page.frameLocator('iframe[title="walk"]').locator('.walk');
    await expect.poll(async () => (await outcome('walk'))?.call).toBe('mount');
    const first = (await walkFrame.getAttribute('data-instance'))!;

    // THE FRAME ADJUST: place and size reach the package's frame, never its document; type and
    // colour reach it not at all, and an update that carries nothing else is no call to it.
    const returned = (await returnsOf(page, 'walk')).length;
    await apply(page, 'walk', { t: 'update', data: {}, appearance: { v: 1, frame: { dx: 40, dy: -20, s: 0.9, ox: 960, oy: 540 }, vars: { accent: '#ff0000' } } });
    await expect(walkFrame).toHaveAttribute('data-appearance', JSON.stringify({ v: 1, frame: { dx: 40, dy: -20, s: 0.9, ox: 960, oy: 540 } }));
    expect(await walkFrame.evaluate((f) => [f.style.transform, f.style.transformOrigin])).toEqual(['translate(40px, -20px) scale(0.9)', '960px 540px']);
    // Taken up, with a refused action (the Graphic's own refusal, its state as it was) and one it took.
    await apply(page, 'walk', { t: 'update', data: { count: 4 } });
    await apply(page, 'walk', { t: 'play' });
    await expect(walk).toHaveAttribute('data-step', '0');
    expect((await returnsOf(page, 'walk')).slice(returned).map((r) => r.call), 'the appearance alone made no call').toEqual(['update', 'play']);
    await apply(page, 'walk', { t: 'event', event: 'reject', payload: {} });
    await expect.poll(() => outcome('walk')).toMatchObject({ i: first, call: 'custom', status: 'rejected', msg: 'not now', on: true, step: 0 });
    expect((await outcome('walk'))?.acted, 'a refused action changed nothing').toBeUndefined();
    await apply(page, 'walk', { t: 'event', event: 'mark', payload: { v: 'once' } });
    await expect(walk).toHaveAttribute('data-mark', 'once');
    await expect.poll(async () => (await outcome('walk'))?.acted).toBe(true);
    // A healthy instance's Take is the same instance (row 40): nothing mounts again by itself, and
    // the action still counts (OGraf promises no Take undoes one).
    await apply(page, 'walk', { t: 'play' });
    await expect.poll(async () => (await outcome('walk'))?.call).toBe('play');
    expect((await outcome('walk'))?.acted).toBe(true);
    expect(await walkFrame.getAttribute('data-instance')).toBe(first);

    // A DROPPED HOST: the frame's document goes away, so the bridge's far end is gone. The next call
    // is answered by nobody, and the page's own deadline says so; nothing mounts again yet.
    await walkFrame.evaluate((f: HTMLIFrameElement) => (f.src = 'about:blank'));
    await apply(page, 'walk', { t: 'next' });
    await expect.poll(() => outcome('walk'), { timeout: 10_000 }).toMatchObject({ i: first, call: 'play', status: 'timeout' });
    await expect(walkFrame).toHaveCount(1);
    expect(await walkFrame.getAttribute('data-instance')).toBe(first);
    // A call still out on the old instance when the re-cue comes ...
    await apply(page, 'walk', { t: 'update', data: { count: 5 } });
    const told = await page.evaluate(() => (window as unknown as { __told: unknown[] }).__told.length);
    // THE RE-CUE: a Take mounts the package again as a new instance naming the one it replaced,
    // given the values held (count 5), then the Take. The action is not repeated.
    await apply(page, 'walk', { t: 'play' });
    await expect(walkFrame).toHaveCount(1);
    await expect.poll(() => walkFrame.getAttribute('data-instance')).not.toBe(first);
    const second = (await walkFrame.getAttribute('data-instance'))!;
    await expect(walk).toHaveAttribute('data-count', '5');
    await expect(walk).toHaveAttribute('data-step', '0');
    expect(await walk.getAttribute('data-mark'), 'no action repeated').toBeNull();
    await expect.poll(() => outcome('walk')).toEqual({ i: second, call: 'play', status: 'done', code: 200, step: 0, on: true, was: first });
    await expect(walkFrame).toHaveAttribute('data-appearance', JSON.stringify({ v: 1, frame: { dx: 40, dy: -20, s: 0.9, ox: 960, oy: 540 } }));
    // ... and nothing the old instance said after that is believed (its call settled `gone`).
    const since = await page.evaluate((n) => (window as unknown as { __told: { i: string | null }[] }).__told.slice(n), told);
    expect(since.length).toBeGreaterThan(0);
    expect(since.every((o) => o.i === second), 'never the old instance').toBe(true);

    // NOT KNOWN AFTER A RESTART (output/main.ts marks it): said until the operator's Take or Out.
    await page.evaluate(() => (window as unknown as { __stage: { markUnknown(k: string, w: string): void } }).__stage.markUnknown('walk', 'its Take was not confirmed before the restart'));
    await expect.poll(async () => (await outcome('walk'))?.unknown).toBe('its Take was not confirmed before the restart');
    await apply(page, 'walk', { t: 'update', data: { count: 6 } });
    await expect(walk).toHaveAttribute('data-count', '6');
    await expect.poll(async () => (await outcome('walk'))?.call).toBe('update');
    expect((await outcome('walk'))?.unknown, 'an update proves nothing').toBe('its Take was not confirmed before the restart');
    await apply(page, 'walk', { t: 'stop' });
    await expect.poll(async () => (await outcome('walk'))?.call).toBe('stop');
    expect((await outcome('walk'))?.unknown).toBeUndefined();

    // A REMOVED FILE: the package's module is no longer served. A re-cue of a lost instance mounts it
    // again and its load is refused, said in its own word; served again, the next re-cue airs it.
    served.missing.add('/__foreign-ograf/packages/steps/graphic.mjs');
    await walkFrame.evaluate((f: HTMLIFrameElement) => (f.src = 'about:blank'));
    await apply(page, 'walk', { t: 'next' });
    await expect.poll(async () => (await outcome('walk'))?.status, { timeout: 10_000 }).toBe('timeout');
    const beforeRemoved = await page.evaluate(() => (window as unknown as { __told: unknown[] }).__told.length);
    await apply(page, 'walk', { t: 'play' });
    await expect.poll(async () => { const o = await outcome('walk'); return o?.i !== second && o?.call; }, { timeout: 10_000 }).toBe('play');
    const refused = (await outcome('walk'))!;
    expect(refused.on, JSON.stringify(refused)).toBe(false);
    expect(refused.status, JSON.stringify(refused)).not.toBe('done');
    const load = await page.evaluate((n) => (window as unknown as { __told: Outcome[] }).__told.slice(n).find((o) => o.call === 'mount'), beforeRemoved);
    expect(load?.i).toBe(refused.i);
    expect(load?.status, JSON.stringify(load)).not.toBe('done');
    served.missing.clear();
    await apply(page, 'walk', { t: 'play' });
    await expect.poll(async () => { const o = await outcome('walk'); return o?.i !== refused.i && o?.call; }, { timeout: 10_000 }).toBe('play');
    expect(await outcome('walk')).toMatchObject({ status: 'done', on: true, was: refused.i });
    await expect(walk).toHaveAttribute('data-count', '6');

    // Manual native operation stays available throughout.
    const idle = await freshState(page, 'lt0');
    await apply(page, 'lt0', { t: 'play' });
    await expect.poll(() => freshState(page, 'lt0')).not.toBe(idle);

    // A boot's catch-up comes back on air only once the package's calls have settled
    // (output/catchUp.ts): `ografSettled` waits for a step the Graphic answers 600 ms late.
    await apply(page, 'walk', { t: 'update', data: { playMs: 600 } });
    await expect.poll(async () => (await outcome('walk'))?.call).toBe('update');
    const waited = await page.evaluate(async () => {
      const s = (window as unknown as { __stage: { apply(g: string, m: unknown): void; ografSettled(): Promise<void> } }).__stage;
      s.apply('walk', { t: 'next' });
      const started = performance.now();
      await s.ografSettled();
      return performance.now() - started;
    });
    expect(waited).toBeGreaterThan(400);
    await expect(walk).toHaveAttribute('data-step', '1');
  });

  test('a monitor that serves no package draws a plate for it while it is up, never an empty picture', async ({ page }) => {
    await openStage(page, '', 'monitor');
    const plate = page.locator('[data-testid="ograf-unavailable"][data-layer="10"]');
    await expect(plate).toBeHidden();
    await expect(page.locator('iframe[title="walk"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __stage: { ografOutcomes: Map<string, unknown> } }).__stage.ografOutcomes.get('walk'))).toEqual({ i: null, status: 'unmounted', msg: 'not loaded on this monitor', on: false });
    await apply(page, 'walk', { t: 'play' });
    await expect(plate).toBeVisible();
    await expect(plate).toHaveText('walk · not shown here');
    await apply(page, 'walk', { t: 'stop' });
    await expect(plate).toBeHidden();
  });
});
