import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import type { SimWin } from './_frame';

// OGraf v1 conformance, gated rather than remembered.
//
// exports.spec.ts already drives an exported Graphic through load → update → play → stop. This
// file covers the two halves that a hand check keeps missing:
//
//  * the MANIFEST against the spec's own schema rules, over the WHOLE catalog rather than one
//    sample graphic — the schema declares `additionalProperties: false` on every object and
//    types each property's `default` by its declared `type`, so a single category whose fields
//    differ (a checkbox, a number, a dropdown) can be the only one that emits an invalid file;
//  * the parts of the Web Component contract with a MUST in them — skipAnimation, overlapping
//    action calls, and the ReturnPayload a renderer gets when it calls an action too early or
//    after dispose(). Each one is silent when broken: the graphic keeps animating, or the
//    renderer swallows a rejected promise.
//
// Spec: https://ograf.ebu.io/v1/specification/docs/Specification.html

const SCHEMA_URL = 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

async function downloadOgraf(page: Page, usage?: 'Live' | 'Post-production' | 'Both'): Promise<JSZip> {
  await page.getByTestId('dock-tab-export').click();
  await page.locator('.issue', { hasText: 'OGraf (EBU) export' }).click();
  if (usage) await page.getByTestId('ograf-usage').getByText(usage, { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  return JSZip.loadAsync(readFileSync(await download.path()));
}

/** Serve an exported package from a fake origin — a minimal OGraf renderer's file access. */
async function serve(page: Page, zip: JSZip, origin: string, folder: string) {
  const files = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(new RegExp(`^${folder}/`), ''), await zip.file(name)!.async('nodebuffer'));
  }
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: /\.m?js$/.test(path) ? 'application/javascript' : /\.woff2$/.test(path) ? 'font/woff2' : 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });
  return [...files.keys()];
}

test('every catalog graphic emits a manifest that satisfies the OGraf v1 schema, and a stylesheet addressed to its own element', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // The generator is a pure function of the template, so this runs in-page over the whole
  // catalog rather than exporting 150 zips: what is being proven is that no design's field
  // mix, step count or state machine can produce a manifest a renderer would reject.
  const report = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { buildOgrafManifest, scopeCssToGraphic, graphicSelfSelector, assertScopedCss } = await import('/src/export/targets/ograf.ts');
    const { validateOgrafManifest } = await import('/src/export/targets/ografSchema.ts');
    const failures: string[] = [];
    let checked = 0;
    let withActions = 0;
    let withDurations = 0;
    let scopedSheets = 0;
    for (const variant of Object.values(CATALOG).flat().filter(Boolean)) {
      let template;
      try {
        template = variant.create({});
      } catch {
        continue; // a variant that needs options is covered by the wizard's own specs
      }
      // The stylesheet the package injects, re-addressed to the element and checked by the
      // browser's own parser (the export's fail-closed gate): no rule left on the document, no
      // rule lost. Over the whole catalog, so a selector shape one design uses cannot slip past.
      const self = graphicSelfSelector(template);
      try {
        assertScopedCss(template.css, scopeCssToGraphic(template.css, self), self);
        scopedSheets += 1;
      } catch (err) {
        failures.push(`${template.name} (stylesheet): ${(err as Error).message}`);
      }
      for (const usage of ['live', 'post-production', 'both'] as const) {
        const manifest = buildOgrafManifest(template, usage);
        checked += 1;
        if (Array.isArray(manifest.customActions) && manifest.customActions.length) withActions += 1;
        if (Array.isArray(manifest.actionDurations) && manifest.actionDurations.length) withDurations += 1;
        for (const error of validateOgrafManifest(manifest)) failures.push(`${template.name} (${usage}): ${error}`);
      }
    }
    return { failures: failures.slice(0, 25), failureCount: failures.length, checked, withActions, withDurations, scopedSheets };
  });

  expect(report.checked, 'the catalog sweep found nothing to check').toBeGreaterThan(100);
  expect(report.failures, `${report.failureCount} manifest violations`).toEqual([]);
  // Both optional-but-emitted sections must actually be reached by the sweep, or the check
  // above proves only that the required fields are right.
  expect(report.withActions, 'no graphic exercised the customActions branch').toBeGreaterThan(0);
  expect(report.withDurations, 'no graphic exercised the actionDurations branch').toBeGreaterThan(0);
  expect(report.scopedSheets, 'no stylesheet went through the rewrite').toBeGreaterThan(100);
});

test('the validator refuses the manifest mistakes the spec is strict about', async ({ page }) => {
  // A gate nobody has seen fail is not a gate. Each mutation below is a real conformance trap:
  // an un-prefixed vendor field, a default typed against its property, a duplicate action id,
  // a duration for an action that does not exist, and a `main` the package does not contain.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const verdicts = await page.evaluate(async (schemaUrl) => {
    const { validateOgrafManifest, validateOgrafPackage } = await import('/src/export/targets/ografSchema.ts');
    const base = {
      $schema: schemaUrl,
      id: 'noacg-demo',
      name: 'Demo',
      main: 'graphic.mjs',
      supportsRealTime: true,
      supportsNonRealTime: false,
      schema: { type: 'object', properties: { f0: { type: 'string', title: 'Name', default: 'Anna' } } },
      customActions: [{ id: 'select', name: 'Select' }],
    } as Record<string, unknown>;
    const mutate = (patch: Record<string, unknown>) => validateOgrafManifest({ ...base, ...patch }).length;
    return {
      clean: validateOgrafManifest(base).length,
      vendorField: mutate({ noacgFlavour: 'lower-third' }),
      idWithSlash: mutate({ id: 'noacg/demo' }),
      // Schema-legal, renderer-fatal: SuperFly.tv's OGraf server registers a Graphic with
      // customElements.define(manifest.id, …), so an id with no hyphen throws before the
      // Graphic is mounted. Verified against that renderer 2026-08-18 (docs/OGRAF.md).
      idWithoutHyphen: mutate({ id: 'hairline' }),
      idStartingWithADigit: mutate({ id: '3-up' }),
      idWithUppercase: mutate({ id: 'noacg-Hairline' }),
      idReservedByHtml: mutate({ id: 'font-face' }),
      wrongDefault: mutate({ schema: { type: 'object', properties: { f0: { type: 'boolean', default: 'true' } } } }),
      untypedProperty: mutate({ schema: { type: 'object', properties: { f0: { title: 'Name' } } } }),
      duplicateAction: mutate({ customActions: [{ id: 'select', name: 'A' }, { id: 'select', name: 'B' }] }),
      unknownDurationTarget: mutate({ actionDurations: [{ type: 'customAction', customActionId: 'nope', duration: 100 }] }),
      twoPlayDurations: mutate({ actionDurations: [{ type: 'playAction', duration: 1 }, { type: 'playAction', duration: 2 }] }),
      fractionalDuration: mutate({ actionDurations: [{ type: 'stopAction', duration: 12.5 }] }),
      badConstraintKey: mutate({ renderRequirements: [{ resolution: { width: { about: 1920 } } }] }),
      thumbnailNotAnImage: mutate({ thumbnails: [{ file: 'preview.txt' }] }),
      missingMain: validateOgrafPackage(base, ['other.mjs']).length,
      presentMain: validateOgrafPackage(base, ['graphic.mjs']).length,
    };
  }, SCHEMA_URL);

  expect(verdicts.clean).toBe(0);
  expect(verdicts.presentMain).toBe(0);
  for (const [name, count] of Object.entries(verdicts)) {
    if (name === 'clean' || name === 'presentMain') continue;
    expect(count, `${name} was accepted`).toBeGreaterThan(0);
  }
});

test('the exported package declares its steps, durations and canvas — and ships what it names', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  const manifest = JSON.parse(await zip.file('hairline/hairline.ograf.json')!.async('string'));
  const packaged = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .map((name) => name.replace(/^hairline\//, ''));

  expect(manifest.$schema).toBe(SCHEMA_URL);
  // The authored canvas is declared as an `ideal` constraint: a statement of what the graphic
  // was designed for, not a refusal to render anywhere else. Read back off the project rather
  // than hard-coded, so the assertion is "the manifest agrees with the format" and not "the
  // default format is still 1080p25".
  const format = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { resolution, fps } = useTemplateStore.getState().template;
    return { width: resolution.width, height: resolution.height, fps };
  });
  expect(manifest.renderRequirements).toEqual([
    {
      resolution: { width: { ideal: format.width }, height: { ideal: format.height } },
      frameRate: { ideal: format.fps },
    },
  ]);
  // Durations come off the graphic's own timeline, so a host can pre-roll a take.
  const play = manifest.actionDurations.find((d: { type: string }) => d.type === 'playAction');
  const stop = manifest.actionDurations.find((d: { type: string }) => d.type === 'stopAction');
  expect(play.duration).toBeGreaterThan(0);
  expect(stop.duration).toBeGreaterThan(0);
  expect(play.steps.map((s: { step: number }) => s.step)).toEqual(
    Array.from({ length: manifest.stepCount }, (_, i) => i),
  );

  const verdict = await page.evaluate(
    async ({ manifest, packaged }) => {
      const { validateOgrafManifest, validateOgrafPackage } = await import('/src/export/targets/ografSchema.ts');
      return [...validateOgrafManifest(manifest), ...validateOgrafPackage(manifest, packaged)];
    },
    { manifest, packaged },
  );
  expect(verdict, 'the downloaded package is not conformant').toEqual([]);
});

test('skipAnimation lands the action instantly, in real time', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  await serve(page, zip, 'http://ograf-skip.local', 'hairline');

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-skip.local/graphic.mjs');
    customElements.define('ograf-skip-under-test', mod.default);
    type Driver = HTMLElement & {
      load(p: unknown): Promise<{ statusCode: number }>;
      playAction(p: unknown): Promise<{ statusCode: number; currentStep?: number }>;
      stopAction(p: unknown): Promise<{ statusCode: number }>;
      dispose(p?: unknown): Promise<unknown>;
    };
    // EACH PHASE IS READ OFF THE ELEMENT THAT CARRIES IT, and they are not the same element.
    //
    // `.lower-third` is the positioned container the interpreter REVEALS at time 0 and hides
    // again at the end of the exit; it is the on-air/off-air flag and it holds no content of its
    // own. `.lower-third-box` is what the entrance actually animates (opacity 0 -> 1).
    //
    // The entrance is therefore read off the BOX. Reading it off the root measured whether the
    // reveal had FIRED, which until 2026-09-03 took an animation frame and so happened to read 0
    // right after playAction resolved. The interpreter now paints an entrance's first frame
    // during the cue (templates/shared/animRuntime.ts, noacgPaintFirstFrame), so the root reads 1
    // immediately whether or not the action was skipped, and the control below stopped
    // discriminating - which is exactly what that control is there to notice, and it did.
    //
    // The exit stays on the ROOT, because off air is the root's business: the graphic's own reset
    // clears the inline properties when the exit ends, and the box has no CSS opacity of its own,
    // so it returns to 1 while the root sits at 0. Reading the exit off the box would assert that
    // an off-air graphic is fully opaque.
    const boxOpacity = (el: HTMLElement) => getComputedStyle(el.querySelector('.lower-third-box')!).opacity;
    const rootOpacity = (el: HTMLElement) => getComputedStyle(el.querySelector('.lower-third')!).opacity;
    // ONE graphic at a time, disposed before the next is mounted. The template's own runtime
    // addresses its elements with document-wide selectors — exactly as it does under SPX, where
    // a template owns its page — so two instances of the same design sharing one document would
    // write over each other. An OGraf renderer gives each Graphic its own document; this test
    // must not pretend otherwise (docs/OGRAF.md, "Known limits").
    const drive = async (run: (el: Driver) => Promise<Record<string, string>>) => {
      const el = document.createElement('ograf-skip-under-test') as Driver;
      document.body.appendChild(el);
      await el.load({ data: { f0: 'Anna Andersson', f1: 'Reporter' }, renderType: 'realtime', renderCharacteristics: {} });
      const out = await run(el);
      await el.dispose({});
      el.remove();
      return out;
    };

    // The control: a normal play is still mid-entrance the moment it resolves.
    const control = await drive(async (el) => {
      await el.playAction({});
      return { entrance: boxOpacity(el) };
    });

    // skipAnimation: the same actions, each already at its settled frame — no waiting.
    const skipped = await drive(async (el) => {
      await el.playAction({ skipAnimation: true });
      const entrance = boxOpacity(el);
      await el.stopAction({ skipAnimation: true });
      return { entrance, exit: rootOpacity(el) };
    });

    return { control: control.entrance, skipped: skipped.entrance, skippedExit: skipped.exit };
  });

  expect(result.skipped, 'playAction({skipAnimation}) left the entrance animating').toBe('1');
  // The box ends the exit fully faded — off air, with nothing left to animate out.
  expect(result.skippedExit, 'stopAction({skipAnimation}) left the exit animating').toBe('0');
  expect(result.control, 'the control case was already settled — the assertion proves nothing').not.toBe('1');
});

test('the loaded Graphic resolves its own fonts and images against the PACKAGE, not the host page', async ({ page }) => {
  // A Graphic is a component inside somebody else's document. A relative `fonts/inter.woff2`
  // in the injected CSS therefore resolves against the RENDERER's directory, not the package —
  // and the failure is silent, because `font-display: swap` paints the fallback face. Found by
  // loading a real package into SuperFly.tv's OGraf server, which requested
  // /renderer/renderer-layer/fonts/inter.woff2, got a 404, and aired the graphic in Arial
  // (docs/OGRAF.md, "What an external renderer said"). Under SPX the same path is correct,
  // because there the template IS the document — which is why nothing local caught it.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  const origin = 'http://ograf-assets.local';
  await serve(page, zip, origin, 'hairline');

  const result = await page.evaluate(async (origin) => {
    const mod = await import(`${origin}/graphic.mjs`);
    customElements.define('ograf-assets-under-test', mod.default);
    type Driver = HTMLElement & { load(p: unknown): Promise<unknown>; dispose(p?: unknown): Promise<unknown> };
    const el = document.createElement('ograf-assets-under-test') as Driver;
    document.body.appendChild(el);
    await el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
    const css = el.querySelector('style')!.textContent!;
    const refs = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
    // Fetching each one is the dangling-reference half: the fake origin 404s anything the
    // package does not contain, so a 200 means the file is really there under that path.
    const statuses = await Promise.all(
      refs.filter((ref) => !ref.startsWith('data:')).map(async (ref) => `${ref} -> ${(await fetch(ref)).status}`),
    );
    await el.dispose({});
    el.remove();
    return { refs, statuses, sawFontFace: /@font-face/.test(css) };
  }, origin);

  expect(result.sawFontFace, 'this design ships no bundled font — pick one that does').toBe(true);
  expect(result.refs.length, 'the injected CSS references nothing at all').toBeGreaterThan(0);
  for (const ref of result.refs) {
    // Absolute, and pointing INTO the package. A `data:` URL is already self-contained.
    expect(ref.startsWith(`${origin}/`) || ref.startsWith('data:'), `"${ref}" is not package-relative`).toBe(true);
  }
  expect(result.statuses.length, 'nothing was fetched — the containment half proves nothing').toBeGreaterThan(0);
  for (const line of result.statuses) expect(line, 'the package does not contain what its CSS names').toContain('-> 200');
});

test('two DIFFERENT graphics in one document do not write into each other', async ({ page }) => {
  // An OGraf renderer mounts every layer as a Web Component in ONE document — that is the
  // arrangement the standard is for. Our field convention is `getElementById('fN')` and the
  // ids are the same in every design, so before this was scoped, updating the graphic on
  // layer 1 rewrote the graphic on layer 0: document.getElementById answered with whichever
  // #f0 came first. Measured on SuperFly.tv's OGraf server (docs/OGRAF.md). Two instances of
  // the SAME design is a different, still-documented limit — class-keyed GSAP selectors
  // cannot be told apart — which is why this test uses two different designs.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await serve(page, await downloadOgraf(page), 'http://ograf-a.local', 'hairline');
  await createProject(page, { category: 'Info cards', name: 'Public Advisory' });
  await serve(page, await downloadOgraf(page), 'http://ograf-b.local', 'public_advisory');

  const result = await page.evaluate(async () => {
    type Driver = HTMLElement & {
      load(p: unknown): Promise<unknown>;
      updateAction(p: unknown): Promise<unknown>;
      playAction(p: unknown): Promise<unknown>;
    };
    const mount = async (origin: string, tag: string, data: Record<string, string>) => {
      const mod = await import(`${origin}/graphic.mjs`);
      customElements.define(tag, mod.default);
      const el = document.createElement(tag) as Driver;
      document.body.appendChild(el);
      await el.load({ data, renderType: 'realtime', renderCharacteristics: {} });
      await el.playAction({});
      return el;
    };
    const a = await mount('http://ograf-a.local', 'ograf-neighbour-a', { f0: 'A owns this' });
    const b = await mount('http://ograf-b.local', 'ograf-neighbour-b', {});
    // Update ONLY b. a must be untouched, and b must actually have changed.
    await b.updateAction({ data: { f0: 'B owns this' } });
    return {
      a: a.querySelector('#f0')?.textContent,
      b: b.querySelector('#f0')?.textContent,
      duplicateIds: document.querySelectorAll('#f0').length,
    };
  });

  expect(result.duplicateIds, 'the two graphics did not both mount an #f0 — nothing was proven').toBe(2);
  expect(result.b, "the updated graphic's own field did not change").toBe('B owns this');
  expect(result.a, 'updating one graphic rewrote the graphic beside it').toBe('A owns this');
});

test('actions called concurrently, too early, or after dispose all answer with a ReturnPayload', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  await serve(page, zip, 'http://ograf-contract.local', 'hairline');

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-contract.local/graphic.mjs');
    customElements.define('ograf-contract-under-test', mod.default);
    type Driver = HTMLElement & {
      load(p: unknown): Promise<{ statusCode: number }>;
      playAction(p: unknown): Promise<{ statusCode: number; currentStep?: number }>;
      stopAction(p: unknown): Promise<{ statusCode: number }>;
      updateAction(p: unknown): Promise<{ statusCode: number }>;
      customAction(p: unknown): Promise<{ statusCode: number }>;
      dispose(p?: unknown): Promise<{ statusCode: number }>;
    };
    const el = document.createElement('ograf-contract-under-test') as Driver;
    document.body.appendChild(el);

    // An action before load() has nothing to act on: a status code, never a rejected promise.
    const early = await el.updateAction({ data: { f0: 'Too soon' } });

    // The renderer MUST call load() and wait for it before any action.
    await el.load({ data: { f0: 'Anna', f1: 'Reporter' }, renderType: 'realtime', renderCharacteristics: {} });

    // Concurrency: three actions issued without awaiting the previous one. The spec forbids
    // ignoring them, and they must land in arrival order — the last update wins.
    const pending = [
      el.playAction({}),
      el.updateAction({ data: { f0: 'Second' } }),
      el.updateAction({ data: { f0: 'Third' } }),
    ];
    const settled = await Promise.all(pending);
    const afterConcurrent = el.querySelector('#f0')?.textContent;

    const unknownAction = await el.customAction({ id: 'no-such-action' });
    const disposed = await el.dispose({});
    const afterDispose = await el.playAction({});

    return {
      early: early.statusCode,
      settled: settled.map((r) => r.statusCode),
      firstStep: (settled[0] as { currentStep?: number }).currentStep,
      afterConcurrent,
      unknownAction: unknownAction.statusCode,
      disposed: disposed.statusCode,
      afterDispose: afterDispose.statusCode,
      cleared: el.innerHTML === '',
    };
  });

  expect(result.early, 'an action before load() should answer 4xx, not throw').toBe(409);
  expect(result.settled, 'a concurrent action was ignored').toEqual([200, 200, 200]);
  expect(result.firstStep).toBe(0);
  expect(result.afterConcurrent, 'concurrent updates did not land in arrival order').toBe('Third');
  expect(result.unknownAction).toBe(400);
  expect(result.disposed).toBe(200);
  expect(result.afterDispose, 'an action after dispose() should answer 4xx, not throw').toBe(409);
  expect(result.cleared).toBe(true);
});

test('a production holding two designs with the same name ships two distinct manifest ids', async ({ page }) => {
  // The OGraf spec requires ids to be unique per package, and a renderer registers each Graphic
  // with `customElements.define(manifest.id, class)` — a repeat id throws before the second
  // graphic is ever mounted. No two CATALOG designs share a name any more (catalog-baseline
  // holds that), but a production still reaches two same-named graphics the ordinary way: the
  // same design added twice, which is what a show does the moment it needs two straps of one
  // look. What keeps them apart is the show export renaming the second graphic before any
  // target packages it — the id derives from that same renamed template, so folder, file and id
  // carry the suffix together. Sourcing the id anywhere else would let them disagree.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const find = (category: string, name: string) => variantsFor(category).find((v) => v.name === name)!;
    const ident = find('corner-bug', 'House Ident');
    const pair = [ident, ident];
    const graphics = pair.map((variant, i) => {
      const template = variant.create({});
      return {
        id: `g-${i}`, name: template.name, type: template.type,
        savedAt: '2026-01-01T00:00:00.000Z', template, layer: 20 + i,
      };
    });
    const show = {
      id: 'c1c1c1c1-d2d2-4e3e-8f4f-a5a5a5a5a5a5', name: 'Duplicate Name Show',
      graphics, updatedAt: '2026-01-01T00:00:00.000Z', hostedSlug: 'x',
    };
    const zip = await buildShowZipFor(show, 'ograf');
    const manifestPaths = Object.keys(zip.files).filter((n) => n.endsWith('.ograf.json'));
    const ids: string[] = [];
    for (const path of manifestPaths) ids.push(JSON.parse(await zip.file(path)!.async('string')).id);
    return { sourceNames: pair.map((v) => v.name), manifestPaths, ids };
  });

  // Both graphics really do carry the same name — otherwise the test proves nothing.
  expect(result.sourceNames).toEqual(['House Ident', 'House Ident']);
  expect(result.ids, 'the OGraf ids must be distinct AND carry the folders\' own suffix').toEqual([
    'noacg-house-ident',
    'noacg-house-ident-2',
  ]);
  expect(result.manifestPaths).toEqual([
    'duplicate_name_show/house_ident/house_ident.ograf.json',
    'duplicate_name_show/house_ident_2/house_ident_2.ograf.json',
  ]);
});

// ── The graphic as a COMPONENT in somebody else's page ─────────────────────────────────────
//
// A renderer mounts every Graphic in ONE document - its own. Under SPX and CasparCG the
// template IS the document, so its stylesheet may size `body`, hide its overflow and set its
// font; injected into a renderer's light DOM the same rules restyle the HOST page, and with
// two graphics on two layers the last one loaded wins. Same shape as the three 2026-08-18
// findings (docs/OGRAF.md): correct where the template owns its page, wrong the moment it is
// a component. One mount proves both halves: the host page is untouched, AND the graphic
// still paints the frame the studio paints - the second is what a fix that merely deleted the
// `body` rule would lose (the heading font is inherited from it). The rewrite itself is pinned
// on a hand-written sheet below, and the export's own gate is shown refusing.

const HOST_ORIGIN = 'http://ograf-host.local';
const HOST_BACKGROUND = 'rgb(10, 20, 30)';

/**
 * A minimal renderer page, served from the SAME origin as the package (the arrangement
 * SuperFly.tv's ograf-server uses). Its stylesheet sets every property the template's own
 * `html, body` rule carries, at the same specificity and earlier in the document, so a leaked
 * rule wins the cascade and shows. The one paragraph has nothing but the browser's default
 * margins and box-sizing - the values a leaked `*` reset zeroes. `color-scheme: dark` matches
 * the studio document's meta, or Chromium paints the reference iframe opaque (root AGENTS.md).
 */
const HOST_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>Renderer</title>
<style>
  html { margin: 0; overflow: hidden; }
  body { margin: 0; width: 640px; height: 360px; overflow: auto; background: ${HOST_BACKGROUND}; font-family: serif; }
</style></head>
<body>
  <p id="renderer-note">Renderer UI</p>
  <div id="stage" style="position: absolute; left: 0; top: 0;"></div>
</body></html>`;

/** What a leaked stylesheet would change on the host page - every value asserted stable. */
const HOST_FIXTURE = {
  width: '640px', height: '360px', overflow: 'auto', background: HOST_BACKGROUND, font: 'serif',
  noteMargin: '16px', noteBox: 'content-box',
};

/** Per-channel tolerance when two frames are compared, and the ground a pixel must differ from to count as painted. */
const CHANNEL_TOLERANCE = 24;
const GROUND_TOLERANCE = 3;

function hostSnapshot(page: Page): Promise<typeof HOST_FIXTURE> {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const note = getComputedStyle(document.getElementById('renderer-note')!);
    return {
      width: body.width, height: body.height, overflow: body.overflowY, background: body.backgroundColor,
      font: body.fontFamily, noteMargin: note.marginTop, noteBox: note.boxSizing,
    };
  });
}

test("mounting a Graphic leaves the renderer's page as it was, and paints the studio's own frame", async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  // The created project's canvas, its field defaults, and the studio's own document for it.
  const { format, data, studioDoc } = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { template } = useTemplateStore.getState();
    return {
      format: { width: template.resolution.width, height: template.resolution.height },
      data: Object.fromEntries(template.fields.map((f) => [f.field, f.value])),
      studioDoc: composeDocument(template),
    };
  });
  const zip = await downloadOgraf(page);
  await serve(page, zip, HOST_ORIGIN, 'hairline');
  // Registered after serve(): the newest route runs first, so `/` is the page and not a 404.
  await page.route(`${HOST_ORIGIN}/`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: HOST_PAGE }));
  await page.setViewportSize(format);
  await page.goto(`${HOST_ORIGIN}/`);
  const shoot = async () => (await page.screenshot({ clip: { x: 0, y: 0, ...format } })).toString('base64');

  // The fixture is what it claims, or the comparison below proves nothing.
  const before = await hostSnapshot(page);
  expect(before).toEqual(HOST_FIXTURE);

  // The reference: the studio's own document, in an iframe the size of the canvas, played and
  // settled the way the Graphic settles under skipAnimation. Both frames are painted by the
  // same browser on the same machine over the same ground, so the platform's font rasteriser
  // cancels out (e2e/AGENTS.md on text geometry).
  await page.evaluate(({ doc, format }) => {
    const frame = document.createElement('iframe');
    frame.name = 'studio';
    frame.style.cssText = `display:block;border:0;width:${format.width}px;height:${format.height}px`;
    frame.srcdoc = doc;
    document.getElementById('stage')!.appendChild(frame);
  }, { doc: studioDoc, format });
  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[name="studio"]');
    return typeof (frame?.contentWindow as unknown as SimWin | undefined)?.play === 'function';
  });
  await page.evaluate(async () => {
    type Studio = SimWin & { gsap: { globalTimeline: { getChildren(a: boolean, b: boolean, c: boolean): Array<{ progress(n: number): void }> } } };
    const win = document.querySelector<HTMLIFrameElement>('iframe[name="studio"]')!.contentWindow as unknown as Studio;
    await win.document.fonts.ready;
    win.play!();
    if (win.noacgSnap && win.noacgMachineState) win.noacgSnap(win.noacgMachineState().groups);
    else win.gsap.globalTimeline.getChildren(true, true, true).forEach((tl) => tl.progress(1));
    await win.document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const reference = await shoot();
  await page.evaluate(() => document.querySelector('iframe[name="studio"]')!.remove());

  // The mount: load, then land the entrance instantly.
  const box = await page.evaluate(async ({ origin, data }) => {
    const mod = await import(`${origin}/graphic.mjs`);
    customElements.define('ograf-host-under-test', mod.default);
    type Driver = HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> };
    const el = document.createElement('ograf-host-under-test') as Driver;
    document.getElementById('stage')!.appendChild(el);
    await el.load({ data, renderType: 'realtime', renderCharacteristics: {} });
    await el.playAction({ skipAnimation: true });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const s = getComputedStyle(el);
    return { display: s.display, position: s.position, width: s.width, height: s.height, overflow: s.overflowY };
  }, { origin: HOST_ORIGIN, data });
  const mounted = await shoot();

  const after = await hostSnapshot(page);
  expect(after, 'the graphic restyled the page it was mounted in').toEqual(HOST_FIXTURE);

  // The other half of the same decision: the `html, body` box the template was authored
  // against now belongs to the graphic's OWN element - a block of the authored size and the
  // containing block its design positions against. A custom element is display:inline by
  // default, where width and height are no-ops and the graphic has no box at all.
  expect(box).toEqual({ display: 'block', position: 'relative', width: `${format.width}px`, height: `${format.height}px`, overflow: 'hidden' });

  const verdict = await page.evaluate(async ({ reference, mounted, ground, channel, groundTolerance }) => {
    const decode = (b64: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `data:image/png;base64,${b64}`;
      });
    const pixels = (img: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [a, b] = await Promise.all([decode(reference), decode(mounted)]);
    const pa = pixels(a);
    const pb = pixels(b);
    const bg = ground.match(/\d+/g)!.map(Number);
    let painted = 0;
    let differing = 0;
    for (let i = 0; i < pa.length; i += 4) {
      if ([0, 1, 2].some((c) => Math.abs(pa[i + c] - bg[c]) > groundTolerance)) painted += 1;
      if ([0, 1, 2].some((c) => Math.abs(pa[i + c] - pb[i + c]) > channel)) differing += 1;
    }
    return { painted, differing, total: pa.length / 4 };
  }, { reference, mounted, ground: HOST_BACKGROUND, channel: CHANNEL_TOLERANCE, groundTolerance: GROUND_TOLERANCE });

  expect(verdict.total).toBe(format.width * format.height);
  // The reference frame shows a graphic at all - otherwise two blank frames agree trivially.
  expect(verdict.painted, 'the studio document painted nothing').toBeGreaterThan(5_000);
  // Same fonts, same positions, same ground: the frames are pixel-identical (measured 0 on
  // 2026-09-02). The bound is an order of magnitude under what the comparison measured with
  // the heading aired in the fallback face - 10,204 differing pixels for a 54 px name - so a
  // fix that drops the inherited font fails here while any rasteriser jitter would not.
  expect(verdict.differing, 'the mounted graphic paints a different frame than the studio').toBeLessThan(1_000);
});

test('the stylesheet rewrite is exact on every shape it has to survive, and the export gate refuses a leak', async ({ page }) => {
  // Every catalog design goes through the rewrite in the manifest sweep above. This is the
  // rewrite's own contract, on one hand-written sheet: a brace inside a comment, a comma and a
  // brace inside a string, a brace inside an unquoted url(), an apostrophe inside a comment in
  // a selector list, `html, body`, a middle duplicate, `*`, `:root`, uppercase `BODY`,
  // `html > body`, `html.dark body`, `:is(:root, .x)`, `:not(body)`, `@font-face`,
  // `@keyframes`, a grouped `@media` and `@starting-style`. Then the gate: a rule that would
  // still reach the document, or a rule the rewrite lost, refuses the export.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const S = ':where([data-noacg-graphic="noacg-demo"])';
  const sample = [
    '/* canvas { in a comment } */',
    '* { margin: 0 }',
    'html, body {',
    '  width: 1920px;',
    '}',
    'body, html, .x { color: red }',
    ':root { --accent: #f5a623; }',
    'BODY { margin: 0 }',
    'html > body .x, html.dark body .y { color: blue }',
    ':is(:root, .x) .y { color: green }',
    '.a :not(body) { color: teal }',
    ".a /* don't */ , .b, body { color: red }",
    '.u { background: url(data:image/svg+xml,<svg>{</svg>) }',
    '@font-face { font-family: "Inter"; src: url(\'fonts/inter.woff2\'); }',
    '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }',
    '@media (max-width: 800px) {',
    '  body .x, .y:is(.a, .b) { color: red; }',
    '}',
    '@starting-style { body { opacity: 0 } .lt { opacity: 0 } }',
    '.lower-third, body .other { content: "a, b { }"; }',
    ':root.dark .z, html body .w { color: blue }',
    '',
  ].join('\n');
  const expected = [
    '/* canvas { in a comment } */',
    `${S}, ${S} * { margin: 0 }`,
    `${S} {`,
    '  width: 1920px;',
    '}',
    `${S}, ${S} .x { color: red }`,
    `${S} { --accent: #f5a623; }`,
    `${S} { margin: 0 }`,
    `${S} .x, ${S}.dark .y { color: blue }`,
    `:is(${S}, ${S} .x) .y { color: green }`,
    `${S} .a :not(${S}) { color: teal }`,
    `${S} .a /* don't */, ${S} .b, ${S} { color: red }`,
    `${S} .u { background: url(data:image/svg+xml,<svg>{</svg>) }`,
    '@font-face { font-family: "Inter"; src: url(\'fonts/inter.woff2\'); }',
    '@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }',
    '@media (max-width: 800px) {',
    `  ${S} .x, ${S} .y:is(.a, .b) { color: red; }`,
    '}',
    `@starting-style { ${S} { opacity: 0 } ${S} .lt { opacity: 0 } }`,
    `${S} .lower-third, ${S} .other { content: "a, b { }"; }`,
    `${S}.dark .z, ${S} .w { color: blue }`,
    '',
  ].join('\n');

  const report = await page.evaluate(async ({ sample, S }) => {
    const { scopeCssToGraphic, assertScopedCss } = await import('/src/export/targets/ograf.ts');
    const refusal = (original: string, scoped: string) => {
      try {
        assertScopedCss(original, scoped, S);
        return 'accepted';
      } catch (err) {
        return (err as Error).message;
      }
    };
    const scoped = scopeCssToGraphic(sample, S);
    return {
      scoped,
      // The gate accepts the exact rewrite - so it is exercised by the sweep, not bypassed.
      accepted: refusal(sample, scoped),
      // A gate nobody has seen fail is not a gate: a rule left on the document, a rule lost.
      leak: refusal('body { margin: 0 }', 'body { margin: 0 }'),
      lost: refusal('.a { } .b { }', `${S} .a { }`),
    };
  }, { sample, S });

  expect(report.scoped).toBe(expected);
  expect(report.accepted).toBe('accepted');
  expect(report.leak).toContain("would still address the renderer's document");
  expect(report.lost).toContain('changed its rule count');
});

test("a mounted Graphic's timeline calls still fire — an operator action PAINTS, not just answers 200", async ({ page }) => {
  // THE DEFECT THIS PINS, found on 2026-09-09 by driving an imported quiz board in SuperFly.tv's
  // ograf-server (docs/OGRAF.md): every custom action answered 200, the machine moved, and not
  // one drawn state ever lit.
  //
  // The animation interpreter fires a step's lifecycle calls and its measured-motion builders by
  // NAME, through `window[name]` and never eval (blocks/animData.ts). Under SPX the template owns
  // the page, so `function applySelection()` is also `window.applySelection`. Inside a Graphic the
  // same code runs inside `initTemplate`, so that declaration is LOCAL and the renderer's window
  // has never heard of it — the call resolved to undefined and the interpreter skipped it in
  // silence. A quiz that locks and reveals nothing is the worst answer a Graphic can give a
  // renderer, and no status code reports it, which is why this reads the DOM.
  //
  // A catalog quiz is the subject rather than an imported board because it is what CI can build
  // in one line; the mechanism is the same one, and it is the mechanism that broke.
  await createProject(page, 'Arena Split');
  const zip = await downloadOgraf(page);
  await serve(page, zip, 'http://ograf-calls.local', 'arena_split');

  const manifestName = Object.keys(zip.files).find((n) => n.endsWith('.ograf.json'))!;
  const manifest = JSON.parse(await zip.file(manifestName)!.async('string'));
  // The pick rides the action as its payload, keyed by the field id the manifest declares — the
  // same route a renderer's operator surface takes.
  const select = (manifest.customActions ?? []).find((a: { id: string }) => a.id === 'select');
  expect(select, 'the quiz board declares no "select" action to drive').toBeTruthy();
  const pickField = Object.keys(select.schema?.properties ?? {})[0];
  expect(pickField, '"select" carries no field for the answer chosen').toBeTruthy();
  const letters: string[] = (manifest.schema?.properties?.[pickField]?.enum ?? []).filter((v: string) => v !== '');
  expect(letters.length, 'the answer field offers no choices').toBeGreaterThan(0);

  const result = await page.evaluate(
    async ({ pick, field }) => {
      const mod = await import('http://ograf-calls.local/graphic.mjs');
      customElements.define('ograf-calls-under-test', mod.default);
      type Driver = HTMLElement & {
        load(p: unknown): Promise<{ statusCode: number }>;
        playAction(p: unknown): Promise<{ statusCode: number }>;
        customAction(p: unknown): Promise<{ statusCode: number }>;
        dispose(p?: unknown): Promise<unknown>;
      };
      const el = document.createElement('ograf-calls-under-test') as Driver;
      document.body.appendChild(el);
      await el.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
      await el.playAction({ skipAnimation: true });
      const before = el.querySelectorAll('.quiz-sel').length;
      const action = await el.customAction({ id: 'select', payload: { [field]: pick }, skipAnimation: true });
      const after = el.querySelectorAll('.quiz-sel').length;
      await el.dispose({});
      el.remove();
      return { statusCode: action.statusCode, before, after };
    },
    { pick: letters[0], field: pickField },
  );

  expect(result.statusCode, 'the select action was refused').toBe(200);
  expect(result.before, 'a row was already marked before anything was picked').toBe(0);
  // The whole point: 200 was never the question.
  expect(result.after, 'select answered 200 and marked no answer row — the timeline call never fired').toBe(1);
});
