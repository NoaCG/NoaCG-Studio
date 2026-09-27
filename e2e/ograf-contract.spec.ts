// covers: src/export/{noacgPackage.ts,targets/ograf*}, src/control/ografContract.ts
//
// The /bridge page (docs/AGENT_CLI.md) and what it composes that nothing else exercises: the
// dual graphic package + the OGraf package reader (export), the neutral scaffold (templates),
// the OGraf manifest -> operator-surface adapter (control). The CLI under cli/ has its own
// package tests (CI) and `npm run bench:cli`; a change there runs no e2e spec.
// covers: {bridge.html,src/bridge/**}
//
// The host document moved out of src/bridge/ (both entries load it) and took its specs along.
// covers: src/control/ografHost.ts

import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { settleDurableWrites } from './_durable';

// The category-agnostic acceptance (docs/AGENT_CLI.md, docs/CONTROL_LAYER.md): NoaCG derives an
// operator surface from a graphic it has never seen and drives it, with ZERO category code.
//
//   1. A hand-written THIRD-PARTY OGraf graphic (e2e/fixtures/ograf/scorebug-demo: semantic keys,
//      two custom actions with a payload schema, stepCount 2 - not a NoaCG template, no fN ids, no
//      NOACG_ANIM) -> the bridge reads it as a conformant package, `ografContract` yields one
//      descriptor per visible property + one button per action + the step summary, and the OGraf
//      host mounts it and drives load / update / custom / play / stop with 2xx ReturnPayloads.
//   2. A TYPELESS NoaCG graphic scaffolded from an ad-hoc field list lands in the library, joins
//      a production, and the production page shows an input per field + Take / Update / Next /
//      Out. Nothing about it is a known category.

const FIXTURE_DIR = fileURLToPath(new URL('fixtures/ograf/scorebug-demo/', import.meta.url));
const FAKE_ORIGIN = 'http://ograf-demo.local';

type Bridge = {
  readPackage(b: Uint8Array, n: string): Promise<{ kind: string; ograf: { errors: string[]; noacg: unknown; contract: { descriptors: { key: string; kind: string; label: string }[]; buttons: { event: string; label: string; payload?: unknown }[]; steps: { count: number; stepped: boolean } } } | null }>;
  inspect(i: unknown): { descriptors: { key: string; kind: string }[]; buttons: { event: string }[] };
  ografHost(o: { packageBase: string; main: string; tag: string; width: number; height: number }): string;
  hostTagFor(id: string, nonce: string): string;
  scaffold(req: unknown): { template: Template };
  types(): Array<{ id: string; events: { id?: string; name?: string; label?: string }[] }>;
};
type Template = { name: string; type: string; html: string; css: string; js: string; fields: { field: string }[] };
type OgrafHost = {
  mount(data: Record<string, unknown>): Promise<{ statusCode: number; statusMessage?: string }>;
  play(params?: unknown): Promise<{ statusCode: number; currentStep?: number }>;
  stop(): Promise<{ statusCode: number }>;
  update(data: Record<string, unknown>): Promise<{ statusCode: number }>;
  custom(id: string, payload?: unknown): Promise<{ statusCode: number; statusMessage?: string }>;
  dispose(): Promise<{ statusCode: number }>;
};
declare global {
  interface Window { noacgBridge: Bridge; __ografHost: OgrafHost; __noacgHostReady?: boolean }
}

async function toBridge(page: Page) {
  await page.goto('/bridge');
  await page.waitForFunction(() => (window as unknown as { __noacgBridgeReady?: boolean }).__noacgBridgeReady === true);
}

function fixtureZipBase64(): Promise<string> {
  const zip = new JSZip();
  for (const name of readdirSync(FIXTURE_DIR)) zip.file(`scorebug-demo/${name}`, readFileSync(resolve(FIXTURE_DIR, name)));
  return zip.generateAsync({ type: 'base64' });
}

/** Serve the fixture folder from a fake origin with CORS open (a module import is cross-origin). */
async function serveFixture(route: Route) {
  const url = new URL(route.request().url());
  const name = url.pathname.replace(/^\/+/, '');
  try {
    const body = readFileSync(resolve(FIXTURE_DIR, name));
    const type = name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    await route.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
  } catch {
    await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
  }
}

test('a third-party OGraf package reads as conformant and its operator surface is derived from the manifest', async ({ page }) => {
  await toBridge(page);
  const base64 = await fixtureZipBase64();
  const result = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r = await window.noacgBridge.readPackage(bytes, 'scorebug-demo.zip');
    const c = r.ograf?.contract;
    return {
      kind: r.kind, errors: r.ograf?.errors, noacg: r.ograf?.noacg ?? null,
      descriptors: c?.descriptors.map((d) => `${d.key}:${d.kind}:${d.label}`),
      buttons: c?.buttons.map((bt) => ({ event: bt.event, label: bt.label, payload: bt.payload ?? null })),
      steps: c?.steps,
    };
  }, base64);
  expect(result.kind).toBe('ograf');
  expect(result.errors).toEqual([]);
  expect(result.noacg, 'a third-party package carries no v_noacg').toBeNull();
  // One descriptor per visible property, in manifest order; the hidden one stays out of the form.
  expect(result.descriptors).toEqual(['homeTeam:text:Home team', 'awayTeam:text:Away team', 'homeGoals:number:Home goals', 'awayGoals:number:Away goals']);
  // One button per custom action; the payload schema rides with the one that declares it.
  expect(result.buttons?.map((b) => b.event)).toEqual(['goal', 'reset']);
  expect(result.buttons?.[0].label).toBe('Goal!');
  expect(result.buttons?.[0].payload).not.toBeNull();
  expect(result.buttons?.[1].payload).toBeNull();
  expect(result.steps).toEqual({ count: 2, stepped: true });
});

test('the OGraf host mounts a stranger package and drives every lifecycle call with 2xx', async ({ page, context }) => {
  await toBridge(page);
  const manifest = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'scorebug-demo.ograf.json'), 'utf8')) as { main: string; id: string };
  const hostDoc = await page.evaluate(({ main, id }) => {
    const b = window.noacgBridge;
    return b.ografHost({ packageBase: 'http://ograf-demo.local/', main, tag: b.hostTagFor(id, 'e2e'), width: 1920, height: 1080 });
  }, manifest);
  expect(hostDoc).toContain('__ografHost');

  // The host document is MOUNTED under the app origin and navigated to, as the CLI bench does
  // (a real document with a real base URL); the package itself is cross-origin + CORS.
  const host = await context.newPage();
  const pageErrors: string[] = [];
  host.on('pageerror', (e) => pageErrors.push(e.message));
  await host.route(`${FAKE_ORIGIN}/**`, serveFixture);
  await host.route('**/__noacg-host/e2e.html', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: hostDoc }));
  await host.goto('/__noacg-host/e2e.html', { waitUntil: 'load' });
  await host.waitForFunction(() => window.__noacgHostReady === true, undefined, { polling: 100, timeout: 15_000 }).catch((e) => {
    throw new Error(`host never ready: ${e.message}; page errors: ${pageErrors.join(' | ') || 'none'}`);
  });

  const codes = await host.evaluate(async () => {
    const h = window.__ografHost;
    const out: Record<string, unknown> = {};
    out.mount = (await h.mount({ homeTeam: 'ARS', awayTeam: 'CHE', homeGoals: 0, awayGoals: 0 })).statusCode;
    out.update = (await h.update({ homeGoals: 2 })).statusCode;
    out.homeGoalsPainted = document.querySelector('[data-key="homeGoals"]')?.textContent;
    out.homeTeamPainted = document.querySelector('[data-key="homeTeam"]')?.textContent;
    out.goalAway = (await h.custom('goal', { side: 'away' })).statusCode;
    out.awayGoalsPainted = document.querySelector('[data-key="awayGoals"]')?.textContent;
    const p1 = await h.play();
    out.play = p1.statusCode; out.step0 = p1.currentStep; out.onAfterPlay = document.querySelector('.bug')?.classList.contains('on');
    const p2 = await h.play({ delta: 1 });
    out.next = p2.statusCode; out.step1 = p2.currentStep; out.step1Class = document.querySelector('.bug')?.classList.contains('step-1');
    out.reset = (await h.custom('reset')).statusCode;
    out.resetPainted = document.querySelector('[data-key="homeGoals"]')?.textContent;
    out.unknown = (await h.custom('no-such-action')).statusCode;
    out.stop = (await h.stop()).statusCode;
    out.offAfterStop = !document.querySelector('.bug')?.classList.contains('on');
    out.dispose = (await h.dispose()).statusCode;
    return out;
  });
  expect(codes).toMatchObject({ mount: 200, update: 200, homeGoalsPainted: '2', homeTeamPainted: 'ARS', goalAway: 200, awayGoalsPainted: '1', play: 200, step0: 0, onAfterPlay: true, next: 200, step1: 1, step1Class: true, reset: 200, resetPainted: '0', unknown: 400, stop: 200, offAfterStop: true, dispose: 200 });
  await host.close();
});

// The two in-app cases run on /app (the hydrated studio), seeding the library and a show through
// the platform's own functions - the way the CLI's save and a future `add` land a graphic - with
// the SAME scaffold the bridge page exposes.
type SeedResult = { showId: string; type: string; fields: string[]; events: string[] };
async function seedShow(page: Page, req: unknown, name: string): Promise<SeedResult> {
  await page.goto('/app');
  const out = await page.evaluate(async ({ req, name }) => {
    const { bridgeApi } = await import('/src/bridge/bridgeApi.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
    const { template } = bridgeApi.scaffold(req as never);
    const typeId = (req as { type?: string }).type;
    const events = typeId ? (bridgeApi.types().find((t) => t.id === typeId)?.events ?? []).map((e) => e.label) : [];
    const { doc, error } = createGraphic(template, { name });
    if (error) throw new Error(error);
    const { show, error: showError } = createShowNamedChecked(name);
    if (showError) throw new Error(showError);
    const added = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    if (added.error) throw new Error(added.error);
    return { showId: show.id, type: template.type, fields: template.fields.map((f) => f.field), events };
  }, { req, name });
  await settleDurableWrites(page);
  return out;
}

test('a typeless NoaCG graphic joins a production and the operator sees every field plus the lifecycle verbs', async ({ page }) => {
  test.setTimeout(90_000);
  const seed = await seedShow(page, { fields: [{ label: 'Artist', kind: 'text', value: 'Anna Lind' }, { label: 'Song', kind: 'text', value: 'Northern lights' }, { label: 'Progress', kind: 'number', value: '42' }], name: 'Now playing' }, 'Now playing');
  expect(seed.type).toBe('blank');
  expect(seed.fields).toEqual(['f0', 'f1', 'f2']);

  await page.goto(`/app#/production/${seed.showId}`);
  const prod = page.getByTestId('production-page');
  await expect(prod).toBeVisible();
  // The lifecycle verbs - the control surface of EVERY field-driven graphic, category or not.
  for (const verb of ['verb-take', 'verb-update', 'verb-next', 'verb-out']) await expect(page.getByTestId(verb)).toBeVisible();
  // One input per field, labelled by the field's own label.
  for (const label of ['Artist', 'Song', 'Progress']) await expect(prod.getByText(label).first()).toBeVisible(); // rendered as "F0 · Artist"
  await expect(prod.getByRole('textbox').or(prod.getByRole('spinbutton')).first()).toBeVisible();
  const inputs = await prod.locator('input:not([type="hidden"]), textarea').count();
  expect(inputs).toBeGreaterThanOrEqual(3);
});

test('a graphic carrying an explicit machine shows its state and event buttons on the production page', async ({ page }) => {
  test.setTimeout(90_000);
  const seed = await seedShow(page, { type: 'scoreboard', design: 'neutral', name: 'Neutral scoreboard' }, 'Neutral scoreboard');
  expect(seed.events.length).toBeGreaterThan(0);
  await page.goto(`/app#/production/${seed.showId}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('machine-state-chip').first()).toBeVisible();
  const escaped = seed.events[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(page.getByRole('button', { name: new RegExp(escaped, 'i') }).first()).toBeVisible();
});
