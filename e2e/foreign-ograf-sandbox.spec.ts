import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const stage = createOutputStage(document.body, { v: 1, resolution: design.resolution, graphics, cues: [] }, { foreign });
window.__stage = stage;
await stage.whenLoaded();
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
}

async function mountHarness(page: Page): Promise<Served> {
  const served: Served = { scope: [], exfil: [], swapped: false };
  const packages = new Map(['benign', 'hostile'].map((name) => [name, packageFiles(name)]));
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
    const body = m ? packages.get(m[1])?.get(decodeURIComponent(m[2])) : undefined;
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

interface OgrafReturn {
  call: string;
  statusCode: number;
  statusMessage?: string;
  currentStep?: number;
}

type StageHandle = {
  apply(g: string, m: unknown): void;
  requestState(g: string): void;
  states: Map<string, unknown>;
  replies: Map<string, number>;
  ografReturns: Map<string, OgrafReturn[]>;
};

async function openStage(page: Page, foreign: string): Promise<void> {
  await page.goto(`/foreign-ograf/output?production=${CREDENTIAL}&foreign=${foreign}`);
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

    // It FETCHES THE INTERNET: refused before a request leaves, by fetch, image and beacon.
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
});
