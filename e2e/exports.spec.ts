import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openExportWindow, skipOldEditor } from './_create';
import JSZip from 'jszip';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';

// The CasparCG and OGraf export targets — not just zip-structure checks: the CasparCG
// file is loaded and driven with an XML payload, and the OGraf Graphic is imported and
// taken through its load/updateAction/playAction contract.

async function createHairline(page: Page) {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
}

async function downloadTarget(page: Page, label: string, ografUsage?: 'Live' | 'Post-production' | 'Both'): Promise<JSZip> {
  await openExportWindow(page);
  await page.locator('.issue', { hasText: label }).click();
  if (ografUsage) {
    await page.getByTestId('ograf-usage').getByText(ografUsage, { exact: true }).click();
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  return JSZip.loadAsync(readFileSync(await download.path()));
}

test("a saved graphic's control entries ride into its own export, not just the show's", async ({ page }) => {
  // Entries are authored on the library RECORD (the control-panel page), never in the code, so
  // the Export panel has to read them back out at export time — otherwise the operator who built
  // up named rows downloads a panel with an empty switcher.
  await createHairline(page);
  await page.evaluate(async () => {
    const { createGraphic, newEntry } = await import('/src/model/library.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const store = useTemplateStore.getState();
    const field = store.template.fields[0]?.field ?? 'f0';
    const { doc } = createGraphic(store.template, {
      name: store.template.name,
      entries: [
        newEntry('Anna · Presenter', { [field]: 'Anna Andersson' }),
        newEntry('Björn · Reporter', { [field]: 'Björn Berg' }),
      ],
    });
    store.setSaved({ graphicId: doc.id, dirty: false, status: 'idle' });
  });

  // EVERY package that bundles an operator page carries them: the folder one, and the two
  // single-file ones, which inline their assets but read the same entries. The CasparCG package
  // joined that list on 2026-09-04 and the entries had to come with it — a fallback panel with
  // no saved rows is a panel an operator has to retype the show into.
  for (const label of ['SPX export', 'HTML overlay (OBS / vMix)', 'CasparCG export']) {
    const zip = await downloadTarget(page, label);
    const path = Object.keys(zip.files).find((n) => n.endsWith('controlpanel.html'))!;
    const html = await zip.file(path)!.async('string');
    expect(html, label).toContain('Anna · Presenter');
    expect(html, label).toContain('Björn Berg');
  }
});

test('export panel offers all six targets', async ({ page }) => {
  await createHairline(page);
  await openExportWindow(page);
  for (const label of ['SPX export', 'HTML overlay (OBS / vMix)', 'H2R Graphics export', 'CasparCG export', 'OGraf (EBU) export', 'LiveOS (NetOn.Live) export']) {
    await expect(page.locator('.issue', { hasText: label })).toBeVisible();
  }
});

test('h2r: GDD fields embedded, and the play() toggle drives entrance then exit', async ({ page }) => {
  await createHairline(page);
  const zip = await downloadTarget(page, 'H2R Graphics export');
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  expect(names.sort()).toEqual(['hairline/FIELDS.md', 'hairline/README.md', 'hairline/hairline.html']);

  const html = await zip.file('hairline/hairline.html')!.async('string');
  // The GDD block H2R parses into editable inputs — property keys match the element ids.
  // The script tag MUST carry name="graphics-data-definition": without it H2R never finds
  // the block and shows no editable fields (the bug the real-app test surfaced).
  const gddMatch = html.match(/<script name="graphics-data-definition" type="application\/json\+gdd">\s*([\s\S]*?)\s*<\/script>/);
  expect(gddMatch).toBeTruthy();
  const gdd = JSON.parse(gddMatch![1]);
  expect(gdd.properties.f0.label).toBe('Name');
  expect(gdd.properties.f1.label).toBe('Title');
  expect(gdd.properties.f0.gddType).toBe('single-line');
  expect(html).not.toMatch(/src=["'](?:\.\/)?js\//); // nothing external left

  // Drive it exactly like H2R: update(json string), then play() on air, play() again off air.
  const view = await page.context().newPage();
  await view.setContent(html, { waitUntil: 'load' });
  await view.evaluate(() => {
    (window as unknown as { update(raw: string): void }).update('{"f0":"H2R Works"}');
    (window as unknown as { play(): void }).play(); // toggle ON — entrance
  });
  await expect(view.locator('#f0')).toHaveText('H2R Works');
  await expect
    .poll(async () => view.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await view.evaluate(() => (window as unknown as { play(): void }).play()); // toggle OFF — exit
  await expect
    .poll(async () => view.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
  await view.close();
});

test('export target choice is remembered as the default across reloads', async ({ page }) => {
  await createHairline(page);
  await openExportWindow(page);
  await page.locator('.issue', { hasText: 'CasparCG export' }).click();
  // Reload: the restored project opens directly (no wizard over a returning user's work);
  // the Export tab must preselect the remembered target.
  // Project autosave is intentionally debounced, so wait for the real persistence record
  // instead of racing a reload against that debounce under full-suite load.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { loadProject } = await import('/src/model/project.ts');
        return loadProject()?.template.name ?? null;
      }),
    )
    .toBe('Hairline');
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.wz-modal')).toBeHidden();
  await openExportWindow(page);
  await expect(page.locator('.issue', { hasText: 'CasparCG export' }).locator('input[type="radio"]')).toBeChecked();
});

test('html overlay: self-contained, autoplays with the Data panel values, control panel bundled', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  // Type a custom value in the Data panel — the export must bake it in.
  await page.getByTestId('dock-tab-data').click();
  const nameInput = page.locator('.panel-body input').first();
  await nameInput.fill('Overlay Works');
  const zip = await downloadTarget(page, 'HTML overlay (OBS / vMix)');
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  expect(names.sort()).toEqual([
    'hairline/FIELDS.md',
    'hairline/GETTING-ON-AIR.md',
    'hairline/README.md',
    'hairline/Start controller.cmd',
    'hairline/controlpanel.html',
    'hairline/hairline.html',
    'hairline/payload.json',
    'hairline/relay.ps1',
    'hairline/relay.py',
    'hairline/start-controller.command',
    'hairline/start-controller.sh',
  ]);

  const html = await zip.file('hairline/hairline.html')!.async('string');
  expect(html).toContain('Autoplay for browser sources');
  expect(html).toContain('spx-control-receiver'); // the BroadcastChannel receiver is inlined
  expect(html).not.toMatch(/src=["'](?:\.\/)?js\//); // nothing external left

  // Load the exported file like OBS would: no calls from outside — it must play itself.
  const view = await page.context().newPage();
  await view.setContent(html, { waitUntil: 'load' });
  await expect(view.locator('#f0')).toHaveText('Overlay Works'); // baked value, not the default
  await expect
    .poll(async () => view.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1'); // play() ran on load
  await view.close();
});

test('casparcg: one self-contained html that speaks JSON and CasparCG XML', async ({ page }) => {
  await createHairline(page);
  const zip = await downloadTarget(page, 'CasparCG export');
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  expect(names.sort()).toEqual([
    'hairline/FIELDS.md',
    'hairline/GETTING-ON-AIR.md',
    'hairline/README.md',
    // The fallback operator page, and the graphic answers it. A CasparCG server drives through
    // its own client and needs neither — but this package is also what a room is left holding
    // when the playout machine is not there, and until 2026-09-04 the panel was simply absent,
    // so nothing could pair with a CasparCG export at all.
    'hairline/controlpanel.html',
    'hairline/hairline.html',
  ]);

  // FIELDS.md is what makes a CasparCG client usable: the client sends ids, and only the
  // package can say which id is the name and which the title (acceptance round 2, 2026-08-05).
  const fields = await zip.file('hairline/FIELDS.md')!.async('string');
  expect(fields).toContain('| `f0` | Name |');
  expect(fields).toContain('| `f1` | Title |');
  expect(fields).toContain('<componentData id="f0">');
  // The CasparCG CLIENT's own walkthrough, carrying THIS graphic's name, layer and defaults —
  // a student who has never sent a CG command cannot turn `CG 1-20 ADD …` into "which box do
  // I type the name in" (owner, 2026-08-05: they use the default CasparCG Client).
  expect(fields).toContain('## In the CasparCG Client');
  expect(fields).toContain('locate\n   `hairline`');
  expect(fields).toMatch(/Set the video layer to \d+/);
  // The key/value grid is pre-filled from this graphic's own defaults, keyed by ID.
  expect(fields).toMatch(/\| Key \| Value \|/);
  expect(fields).toMatch(/\| `f0` \| .+ \|/);
  // The AMCP form survives below it — another client, a script, a bug report.
  expect(fields).toContain('CasparCG classic XML');
  // And the guide only ever describes what is actually in the folder — a CasparCG package
  // carries no relay on purpose, so it must not name the overlay flavour's launcher.
  const guide = await zip.file('hairline/GETTING-ON-AIR.md')!.async('string');
  expect(guide).toContain('FIELDS.md');
  expect(guide).not.toContain('Start controller.cmd');

  const html = await zip.file('hairline/hairline.html')!.async('string');
  expect(html).toContain('CasparCG data shim');
  expect(html).not.toMatch(/src=["'](?:\.\/)?js\//); // nothing external left
  // …and the receiver the bundled panel talks to, on the channel the panel was built for.
  expect(html).toContain('spx-control-receiver');
  expect(html).toContain("new BroadcastChannel('spx-control-hairline')");
  const casparPanel = await zip.file('hairline/controlpanel.html')!.async('string');
  expect(casparPanel).toContain('spx-control-hairline');

  // Load the exported file for real and drive it like a CasparCG server would.
  const view = await page.context().newPage();
  await view.setContent(html, { waitUntil: 'load' });
  await view.evaluate(() => {
    (window as unknown as { update(raw: string): void }).update(
      '<templateData><componentData id="f0"><data id="text" value="Caspar Works"/></componentData></templateData>',
    );
    (window as unknown as { play(): void }).play();
  });
  await expect(view.locator('#f0')).toHaveText('Caspar Works');
  await expect
    .poll(async () => view.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await view.close();
});

test('spx: the folder package plays like a host drives it, and a late update never hides it', async ({ page }) => {
  // The coverage gap behind the student-release acceptance failure: the SPX FOLDER package
  // was asserted on (files, references) but never PLAYED. Drive it in the host's order —
  // update, play, then another update landing mid-air (SPX's webplayout updates whenever the
  // operator edits) — and require the graphic to still be on screen afterwards.
  await createHairline(page);
  const zip = await downloadTarget(page, 'SPX export');
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  // The template file carries the graphic's own name (an SPX rundown lists files; index.html
  // listed every NoaCG template as "index"), and the on-air guide travels in the package.
  expect(names).toContain('hairline/hairline.html');
  expect(names).toContain('hairline/GETTING-ON-AIR.md');
  expect(names.filter((n) => n.endsWith('index.html'))).toEqual([]);

  // Inline the external refs so the folder package plays inside setContent.
  const inline = (src: string) => src.replace(/<\/script>/gi, '<\\/script>');
  const css = await zip.file('hairline/css/template.css')!.async('string');
  const js = await zip.file('hairline/js/template.js')!.async('string');
  const gsap = await zip.file('hairline/js/gsap.min.js')!.async('string');
  const html = (await zip.file('hairline/hairline.html')!.async('string'))
    .replace(/<link[^>]*href=["'](?:\.\/)?css\/template\.css["'][^>]*>/i, `<style>${css}</style>`)
    .replace(/<script[^>]*src=["'](?:\.\/)?js\/gsap\.min\.js["'][^>]*><\/script>/i, () => `<script>${inline(gsap)}</script>`)
    .replace(/<script[^>]*src=["'](?:\.\/)?js\/template\.js["'][^>]*><\/script>/i, () => `<script>${inline(js)}</script>`);

  const view = await page.context().newPage();
  await view.setContent(html, { waitUntil: 'load' });
  const opacity = () => view.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity);
  await view.evaluate(() => {
    (window as unknown as { update(raw: string): void }).update('{"f0":"SPX Works"}');
    (window as unknown as { play(): void }).play();
  });
  await expect.poll(opacity).toBe('1');
  // The late update — this must write fields only, never reset or hide the running graphic.
  await view.evaluate(() => (window as unknown as { update(raw: string): void }).update('{"f0":"Still Here"}'));
  await view.waitForTimeout(700);
  await expect(view.locator('#f0')).toHaveText('Still Here');
  expect(await opacity()).toBe('1');
  await view.close();
});

test('liveos: the OGraf package with LiveOS instructions — same graphic, LiveOS README', async ({ page }) => {
  await createHairline(page);
  const liveosZip = await downloadTarget(page, 'LiveOS (NetOn.Live) export');

  // The package IS an OGraf v1 Graphic (LiveOS's HTML5 graphics engine is OGraf-compliant):
  // manifest + graphic.mjs + bundled GSAP, plus a LiveOS-specific README.
  const names = Object.keys(liveosZip.files).filter((n) => !liveosZip.files[n].dir);
  expect(names).toEqual(
    expect.arrayContaining([
      'hairline/README.md',
      'hairline/graphic.mjs',
      'hairline/hairline.ograf.json',
      'hairline/lib/gsap.min.js',
    ]),
  );
  const manifest = JSON.parse(await liveosZip.file('hairline/hairline.ograf.json')!.async('string'));
  expect(manifest.$schema).toBe('https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json');
  expect(manifest.main).toBe('graphic.mjs');
  expect(manifest.schema.properties.f0.title).toBe('Name');
  const readme = await liveosZip.file('hairline/README.md')!.async('string');
  expect(readme).toContain('LiveOS');
  expect(readme).toContain('OGraf');

  // The Graphic itself must be byte-identical to the OGraf export — the driven OGraf
  // contract test below covers this exact module, so the two targets can never drift.
  const ografZip = await downloadTarget(page, 'OGraf (EBU) export');
  expect(await liveosZip.file('hairline/graphic.mjs')!.async('string')).toBe(
    await ografZip.file('hairline/graphic.mjs')!.async('string'),
  );
  expect(await liveosZip.file('hairline/hairline.ograf.json')!.async('string')).toBe(
    await ografZip.file('hairline/hairline.ograf.json')!.async('string'),
  );
});

test('ograf: a valid v1 Graphic whose Web Component passes the action contract', async ({ page }) => {
  await createHairline(page);
  const zip = await downloadTarget(page, 'OGraf (EBU) export');

  // The manifest carries the spec's required fields + the field-driven data schema.
  const manifest = JSON.parse(await zip.file('hairline/hairline.ograf.json')!.async('string'));
  expect(manifest.$schema).toBe('https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json');
  // Prefixed and hyphenated, because a renderer registers the Graphic as
  // customElements.define(manifest.id, …) — see docs/OGRAF.md, "Known limits".
  expect(manifest.id).toBe('noacg-hairline');
  expect(manifest.main).toBe('graphic.mjs');
  expect(manifest.supportsRealTime).toBe(true);
  expect(manifest.supportsNonRealTime).toBe(false);
  expect(manifest.schema.properties.f0.title).toBe('Name');
  expect(manifest.schema.properties.f1.title).toBe('Title');

  // Serve the package from a fake origin and take the Graphic through its lifecycle
  // exactly like an OGraf renderer: define → load → updateAction → playAction → stopAction.
  const files = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(/^hairline\//, ''), await zip.file(name)!.async('string'));
  }
  await page.route('http://ograf-test.local/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-test.local/graphic.mjs');
    customElements.define('ograf-under-test', mod.default);
    const el = document.createElement('ograf-under-test') as HTMLElement & {
      load(p: unknown): Promise<{ statusCode: number }>;
      updateAction(p: unknown): Promise<unknown>;
      playAction(p: unknown): Promise<{ currentStep?: number }>;
      stopAction(p: unknown): Promise<unknown>;
      dispose(): Promise<unknown>;
    };
    document.body.appendChild(el);
    const loaded = await el.load({ data: { f0: 'OGraf Works', f1: 'Contract Test' } });
    const gsapType = typeof (window as { gsap?: unknown }).gsap;
    const afterLoad = el.querySelector('#f0')?.textContent;
    await el.updateAction({ data: { f0: 'Updated Name' } });
    const afterUpdate = el.querySelector('#f0')?.textContent;
    const played = await el.playAction({});
    await new Promise((r) => setTimeout(r, 700));
    const opacity = getComputedStyle(el.querySelector('.lower-third')!).opacity;
    await el.stopAction({});
    await el.dispose();
    const cleared = el.innerHTML === '';
    return { statusCode: loaded.statusCode, gsapType, afterLoad, afterUpdate, currentStep: played.currentStep, opacity, cleared };
  });

  expect(result.gsapType).toBe('object');
  expect(result.statusCode).toBe(200);
  expect(result.afterLoad).toBe('OGraf Works');
  expect(result.afterUpdate).toBe('Updated Name');
  expect(result.currentStep).toBe(0);
  expect(result.opacity).toBe('1');
  expect(result.cleared).toBe(true);
});

test('ograf: non-real-time schedule seeks are deterministic in shuffled order', async ({ page }) => {
  await createHairline(page);
  const capabilities = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { buildOgrafManifest } = await import('/src/export/targets/ograf.ts');
    const template = useTemplateStore.getState().template;
    return (['live', 'post-production', 'both'] as const).map((usage) => {
      const manifest = buildOgrafManifest(template, usage);
      return [manifest.supportsRealTime, manifest.supportsNonRealTime];
    });
  });
  expect(capabilities).toEqual([
    [true, false],
    [false, true],
    [true, true],
  ]);

  const zip = await downloadTarget(page, 'OGraf (EBU) export', 'Both');
  const manifest = JSON.parse(await zip.file('hairline/hairline.ograf.json')!.async('string'));
  expect(manifest.supportsRealTime).toBe(true);
  expect(manifest.supportsNonRealTime).toBe(true);

  const files = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(/^hairline\//, ''), await zip.file(name)!.async('nodebuffer'));
  }
  await page.route('http://ograf-offline.local/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: path.endsWith('.mjs') || path.endsWith('.js')
        ? 'application/javascript'
        : path.endsWith('.woff2')
          ? 'font/woff2'
          : 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-offline.local/graphic.mjs');
    customElements.define('ograf-offline-under-test', mod.default);
    const el = document.createElement('ograf-offline-under-test') as HTMLElement & {
      load(p: unknown): Promise<unknown>;
      setActionsSchedule(p: unknown): Promise<unknown>;
      goToTime(p: unknown): Promise<unknown>;
      dispose(): Promise<unknown>;
    };
    document.body.appendChild(el);
    await el.load({
      data: { f0: 'Initial', f1: 'Reporter' },
      renderType: 'non-realtime',
      renderCharacteristics: {},
    });
    await el.setActionsSchedule({
      schedule: [
        { timestamp: 0, action: { type: 'playAction', params: {} } },
        { timestamp: 500, action: { type: 'updateAction', params: { data: { f0: 'Updated' } } } },
        { timestamp: 3000, action: { type: 'stopAction', params: {} } },
      ],
    });
    const snapshot = async (timestamp: number) => {
      await el.goToTime({ timestamp });
      const doc = el.querySelector('iframe')!.contentDocument!;
      const root = doc.querySelector('.lower-third')!;
      return {
        timestamp,
        text: doc.querySelector('#f0')?.textContent,
        opacity: getComputedStyle(root).opacity,
        transform: getComputedStyle(root).transform,
      };
    };
    const sequential = [];
    for (const timestamp of [120, 3100, 5600]) sequential.push(await snapshot(timestamp));
    const shuffled = [];
    for (const timestamp of [5600, 120, 3100, 5600]) shuffled.push(await snapshot(timestamp));
    await el.dispose();
    return { sequential, shuffled };
  });

  expect(result.shuffled[0]).toEqual(result.shuffled[3]);
  for (const expected of result.sequential) {
    expect(result.shuffled.find((frame) => frame.timestamp === expected.timestamp)).toEqual(expected);
  }
  expect(result.sequential[0].text).toBe('Initial');
  expect(result.sequential[1].text).toBe('Updated');
});

test('ograf: post-production intent is blocked for non-deterministic code', async ({ page }) => {
  await createHairline(page);
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const store = useTemplateStore.getState();
    store.applyTemplate({ ...store.template, js: `${store.template.js}\nMath.random();\n` });
  });
  await openExportWindow(page);
  await page.locator('.issue', { hasText: 'OGraf (EBU) export' }).click();
  await page.getByTestId('ograf-usage').getByText('Both', { exact: true }).click();
  await expect(page.getByText('Unseeded randomness is not deterministic.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Validate & download/ })).toBeDisabled();
});

test('ograf: scheduled custom actions reconstruct branching machine state', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  const zip = await downloadTarget(page, 'OGraf (EBU) export', 'Post-production');
  const files = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(/^arena_quiz\//, ''), await zip.file(name)!.async('nodebuffer'));
  }
  await page.route('http://ograf-branch.local/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: path.endsWith('.js') || path.endsWith('.mjs') ? 'application/javascript' : path.endsWith('.woff2') ? 'font/woff2' : 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });

  const frames = await page.evaluate(async () => {
    const mod = await import('http://ograf-branch.local/graphic.mjs');
    customElements.define('ograf-branch-under-test', mod.default);
    const el = document.createElement('ograf-branch-under-test') as HTMLElement & {
      load(p: unknown): Promise<unknown>;
      setActionsSchedule(p: unknown): Promise<unknown>;
      goToTime(p: unknown): Promise<unknown>;
    };
    document.body.appendChild(el);
    await el.load({ data: {}, renderType: 'non-realtime', renderCharacteristics: {} });
    await el.setActionsSchedule({
      schedule: [
        { timestamp: 0, action: { type: 'playAction', params: {} } },
        { timestamp: 500, action: { type: 'customAction', params: { id: 'select', payload: { f6: 'C' } } } },
        { timestamp: 1000, action: { type: 'customAction', params: { id: 'lock', payload: {} } } },
        { timestamp: 1800, action: { type: 'customAction', params: { id: 'judge', payload: {} } } },
      ],
    });
    const out = [];
    for (const timestamp of [2200, 400, 1400, 2200]) {
      await el.goToTime({ timestamp });
      const frame = el.querySelector('iframe')!;
      const win = frame.contentWindow as Window & { noacgMachineState(): { groups: Record<string, string> } };
      out.push({
        timestamp,
        selected: frame.contentDocument!.querySelector('#f6')?.textContent,
        groups: win.noacgMachineState().groups,
      });
    }
    return out;
  });
  expect(frames[0]).toEqual(frames[3]);
  expect(frames[1].groups).not.toEqual(frames[2].groups);
  expect(frames[2].selected).toBe('C');
});

test('ograf: the machine\'s operator events are custom actions, guarded like every surface', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  const zip = await downloadTarget(page, 'OGraf (EBU) export');

  // The manifest declares the machine's events with their control labels + payload schemas.
  const manifest = JSON.parse(await zip.file('arena_quiz/arena_quiz.ograf.json')!.async('string'));
  const actions = manifest.customActions as { id: string; name: string; schema?: { properties: Record<string, unknown> } }[];
  expect(actions.map((a) => [a.id, a.name])).toEqual([
    ['select', 'Select answer'],
    ['lock', 'Lock it in'],
    ['revealChoice', 'Reveal choice'],
    ['judge', 'Reveal correct'],
    ['audience', 'Show audience result'],
  ]);
  expect(Object.keys(actions[0].schema!.properties)).toEqual(['f6']); // selectedAnswer rides `select`
  expect(Object.keys(actions[3].schema!.properties)).toEqual(['f5']); // correctAnswer rides `judge`
  expect(Object.keys(actions[4].schema!.properties)).toEqual(['f7']); // audienceResults rides `audience`

  const files = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(/^arena_quiz\//, ''), await zip.file(name)!.async('string'));
  }
  await page.route('http://ograf-quiz.local/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-quiz.local/graphic.mjs');
    customElements.define('ograf-quiz-under-test', mod.default);
    const el = document.createElement('ograf-quiz-under-test') as HTMLElement & {
      load(p: unknown): Promise<unknown>;
      playAction(p: unknown): Promise<{ currentStep?: number }>;
      customAction(p: unknown): Promise<{ statusCode: number; currentStep?: number }>;
      dispose(): Promise<unknown>;
    };
    document.body.appendChild(el);
    await el.load({ data: {} });
    await el.playAction({}); // on air: the question waypoint

    // `select` carries its payload atomically; a branch move keeps the walk pointer.
    const selected = await el.customAction({ id: 'select', payload: { f6: 'C' } });
    const f6 = el.querySelector('#f6')?.textContent;
    const locked = await el.customAction({ id: 'lock' });
    // After Lock, `select` is STRUCTURALLY illegal — the guard drops the event AND its
    // payload (no arrow leaves `locked` for it), exactly like every other surface.
    const late = await el.customAction({ id: 'select', payload: { f6: 'D' } });
    const f6AfterLate = el.querySelector('#f6')?.textContent;
    // From `locked`, `judge` rejoins the walk at the reveal waypoint — the pointer follows.
    const judged = await el.customAction({ id: 'judge' });
    const unknown = await el.customAction({ id: 'nonsense' });
    await el.dispose();
    return {
      selected: selected.currentStep,
      f6,
      locked: locked.currentStep,
      late: late.currentStep,
      f6AfterLate,
      judged: judged.currentStep,
      unknownStatus: unknown.statusCode,
    };
  });

  expect(result.selected).toBe(0);
  expect(result.f6).toBe('C'); // the payload landed with the accepted event
  expect(result.locked).toBe(0);
  expect(result.late).toBe(0);
  expect(result.f6AfterLate).toBe('C'); // the guarded-out event's payload never applied
  expect(result.judged).toBe(1); // judge moved the machine onto the reveal waypoint
  expect(result.unknownStatus).toBe(400);
});

// ── Fonts actually arrive ────────────────────────────────────────────────────────────────
//
// Generated CSS references a bundled face as url("fonts/<file>.woff2"), which a FOLDER package
// satisfies by shipping the file beside the HTML and a SINGLE-FILE package can only satisfy by
// embedding the bytes. The single-file half was missing: casparcg, h2r and html-overlay emitted
// the reference and wrote no font, so those graphics played out in the fallback stack.
//
// It hid twice over — `font-display: swap` renders fallback text instead of erroring, and every
// other check in this file loads an export through setContent() or a srcdoc, both of which
// inherit the DEV SERVER's base URL, where /fonts/ happens to exist. So this test insists on the
// real destination: the file alone in a directory, opened over file://, with no sibling anything.

// A single-file export must survive its own autoplay. The overlay target BAKES the Data panel's
// values into a load handler, and a filelist field's value is an asset path — so the markup's
// correctly inlined data: URL got overwritten by `images/<file>` the moment the page loaded, in
// a package that has no images/ folder. The logo painted on frame one and then disappeared, with
// no console error: a broken <img alt=""> over transparent video looks like an empty slot.
// Measured before the fix on cr01 — naturalWidth 0 and a failed file:// request.
const IMAGE_ROUNDTRIP = `(async () => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  let tpl = null, field = null;
  for (const variant of Object.values(CATALOG).flat().filter(Boolean)) {
    for (const opts of [{ logo: true }, {}]) {
      let t; try { t = variant.create(opts); } catch (e) { continue; }
      const f = t.fields.find((x) => x.ftype === 'filelist');
      if (f) { tpl = t; field = f; break; }
    }
    if (field) break;
  }
  if (!field) return { skipped: true };
  tpl.assets = [...(tpl.assets ?? []), { path: 'images/acme-logo.png', data: PNG }];
  field.value = 'images/acme-logo.png';
  const sampleData = {};
  for (const f of tpl.fields) sampleData[f.field] = f.value ?? '';

  const target = EXPORT_TARGETS.find((t) => t.id === 'html-overlay');
  const zip = await target.build(tpl, { sampleData });
  let html = '', panel = '';
  for (const [p, f] of Object.entries(zip.files)) {
    if (!/\\.html$/i.test(p)) continue;
    if (/controlpanel/i.test(p)) panel = await f.async('string');
    else html = await f.async('string');
  }
  // The panel's per-graphic images entries: value is what gets SENT, src is what it paints.
  var images = [];
  var m = panel.match(/var GRAPHICS = (\\[[\\s\\S]*?\\]);/);
  if (m) { try { images = (JSON.parse(m[1])[0] || {}).images || []; } catch (e) { images = []; } }
  return {
    skipped: false,
    html,
    rawPaths: (html.match(/images\\/acme-logo\\.png/g) || []).length,
    images,
  };
})()`;

test('a single-file export survives its own autoplay: the baked logo stays inlined', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const built = (await page.evaluate(IMAGE_ROUNDTRIP)) as {
    skipped: boolean;
    html: string;
    rawPaths: number;
    images: { value: string; label: string; src: string }[];
  };
  test.skip(built.skipped, 'no catalog variant produces an image field');

  expect(built.rawPaths, 'a raw images/ path survived into the single-file export').toBe(0);

  // The bundled panel sits beside a package with no images/ folder, so a picked value has to
  // be the embedded bytes: sending a relative path would blank the graphic's inlined image.
  expect(built.images.length, 'the panel offered no images to pick').toBeGreaterThan(0);
  expect(
    built.images.filter((i) => !i.value.startsWith('data:')).map((i) => i.value),
    'the panel would send a relative path a single-file package cannot resolve',
  ).toEqual([]);
  expect(
    built.images.filter((i) => !i.src.startsWith('data:')).map((i) => i.src),
    'the panel would paint a thumbnail from a path that is not in the package',
  ).toEqual([]);
  // The operator still reads the asset's real name, not a 20 KB data URL.
  expect(built.images.every((i) => i.label === 'images/acme-logo.png')).toBe(true);

  const dir = testInfo.outputPath('overlay-lone');
  mkdirSync(dir, { recursive: true });
  const onDisk = nodePath.join(dir, 'index.html');
  writeFileSync(onDisk, built.html, 'utf8');

  const lone = await page.context().newPage();
  const failed: string[] = [];
  lone.on('requestfailed', (r) => failed.push(r.url().slice(0, 120)));
  await lone.goto(`file://${onDisk.replace(/\\/g, '/')}`);
  await lone.waitForTimeout(800); // let the autoplay load handler run and call update()
  const broken = await lone.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((el) => el.getAttribute('src'))
      .filter((el) => el.naturalWidth === 0)
      .map((el) => `${el.id || '(no id)'} -> ${el.src.slice(0, 60)}`),
  );
  await lone.close();

  expect(broken, 'an image was broken AFTER the autoplay block ran').toEqual([]);
  expect(failed, 'the lone export requested a file that is not there').toEqual([]);
});

// ── Nothing dangles ──────────────────────────────────────────────────────────────────────
//
// The dangling-reference class of export bug degrades SILENTLY: a relative path packaging
// never satisfies renders as a missing image / fallback font / dead script over transparent
// video, with nothing on screen to say so (docs/GOALS_ARCHIVE.md "Student release" step 10 — the
// exported-file half of the recovery drills). The fonts test below covers url(fonts/…)
// specifically; this walk covers EVERY relative reference in every text entry of every
// target — src/href attributes and url() alike, including ../ hops (the SPX css-in-subfolder
// convention) — and fails the target that ships a path its own zip cannot resolve.

const REL_REFS = [
  /(?:src|href)=["']([^"']+)["']/gi, // markup
  /url\(["']?([^"')]+)["']?\)/gi, // stylesheets (inline or .css)
];

/** Resolve `ref` against the directory of `entryPath`, folding ../ — zip paths, not URLs. */
function resolveZipRef(entryPath: string, ref: string): string {
  const dir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/') + 1) : '';
  const parts = (dir + ref).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

test('no export target ships a relative reference its own package cannot resolve', async ({ page }) => {
  test.setTimeout(180_000);
  await createHairline(page);

  for (const label of [
    'SPX export',
    'HTML overlay (OBS / vMix)',
    'H2R Graphics export',
    'CasparCG export',
    'OGraf (EBU) export',
    'LiveOS (NetOn.Live) export',
  ]) {
    const zip = await downloadTarget(page, label);
    const texts = await textEntries(zip);
    const packaged = new Set(Object.keys(zip.files).filter((p) => !zip.files[p].dir));

    const dangling: string[] = [];
    for (const [entryPath, text] of Object.entries(texts)) {
      if (/\.(md|json)$/i.test(entryPath)) continue; // prose and manifests, not loadable refs
      // A standalone JS module is scanned by the CONFORMANCE spec instead, not here. These are
      // CSS and markup patterns: inside a module the real references live in JSON-escaped
      // strings that neither pattern can see (`url(\"fonts/x.woff2\")` has a backslash where the
      // pattern wants a quote), while the module's own code reads as one — `new URL(ref, base)`
      // is an `url(…)` match under the /i flag. Only whole .js/.mjs FILES are skipped; the
      // single-file targets embed their script inside .html and are still scanned in full.
      if (/\.m?js$/i.test(entryPath)) continue;
      for (const pattern of REL_REFS) {
        for (const [, ref] of text.matchAll(pattern)) {
          // Only PACKAGE-relative references are the package's to satisfy.
          if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref)) continue;
          const clean = ref.split(/[?#]/)[0];
          if (!clean) continue;
          if (!packaged.has(resolveZipRef(entryPath, clean))) {
            dangling.push(`${entryPath} -> ${ref}`);
          }
        }
      }
    }
    expect(dangling, `${label}: references files its own package does not contain`).toEqual([]);
  }
});

/** Text entries of a package, keyed by path (binaries skipped). */
async function textEntries(zip: JSZip): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir || /\.(woff2?|ttf|otf|png|jpe?g|gif|webp|avif)$/i.test(entryPath)) continue;
    out[entryPath] = await entry.async('string');
  }
  return out;
}

const FONT_REF = /url\(["']?(?:\.\/)?fonts\/([\w./-]+\.(?:woff2|woff|ttf|otf))["']?\)/gi;

test('every export target carries the fonts its own code references', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await createHairline(page);

  const targets = [
    { label: 'SPX export', singleFile: false },
    { label: 'HTML overlay (OBS / vMix)', singleFile: true },
    { label: 'H2R Graphics export', singleFile: true },
    { label: 'CasparCG export', singleFile: true },
    { label: 'OGraf (EBU) export', singleFile: false },
    { label: 'LiveOS (NetOn.Live) export', singleFile: false },
  ];

  for (const { label, singleFile } of targets) {
    const zip = await downloadTarget(page, label);
    const texts = await textEntries(zip);
    const packaged = new Set(Object.keys(zip.files).filter((p) => !zip.files[p].dir));

    // Any relative font reference that survives packaging must have a file to resolve to.
    // (An embedded font is a data: URL and no longer matches, which is the point.)
    const dangling: string[] = [];
    for (const [entryPath, text] of Object.entries(texts)) {
      const dir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/') + 1) : '';
      for (const [, file] of text.matchAll(FONT_REF)) {
        if (!packaged.has(`${dir}fonts/${file}`)) dangling.push(`${entryPath} -> fonts/${file}`);
      }
    }
    expect(dangling, `${label}: references a font the package does not contain`).toEqual([]);

    // Wherever the bytes go, the licence goes: OFL §2 wants each redistributed copy to CONTAIN
    // the copyright notice and the licence, as a stand-alone file (the folder packages'
    // FONT_LICENSES.md) or a human-readable header (the single-file targets' HTML comment).
    // It is triggered by redistribution, so shipping the product free does not retire it.
    const carriesFonts =
      Object.keys(zip.files).some((p) => /\.(woff2?|ttf|otf)$/i.test(p)) ||
      Object.values(texts).some((t) => t.includes('data:font/'));
    expect(carriesFonts, `${label}: shipped no font bytes at all — the graphic has no typography`).toBe(true);
    const everything = Object.values(texts).join('\n');
    expect(
      everything.includes('SIL OPEN FONT LICENSE Version 1.1'),
      `${label}: carries font bytes but not the OFL licence text`,
    ).toBe(true);
    expect(
      everything.includes('Copyright 2020 The Inter Project Authors'),
      `${label}: carries font bytes but not the per-font copyright notices`,
    ).toBe(true);

    if (!singleFile) continue;

    // The single-file targets get the real test: alone on disk, over file://, nothing beside it.
    // Every @font-face the graphic declares must still reach status "loaded".
    const htmlEntry = Object.keys(texts).find((p) => /\.html$/i.test(p) && !/controlpanel/i.test(p))!;
    const dir = testInfo.outputPath(`lone-${label.replace(/\W+/g, '-')}`);
    mkdirSync(dir, { recursive: true });
    const onDisk = nodePath.join(dir, 'index.html');
    writeFileSync(onDisk, texts[htmlEntry], 'utf8');

    const lone = await page.context().newPage();
    await lone.goto(`file://${onDisk.replace(/\\/g, '/')}`);
    const faces = await lone.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts).map((f) => `${f.family.replace(/["']/g, '')}:${f.status}`);
    });
    await lone.close();

    expect(faces.length, `${label}: the graphic declares no @font-face at all`).toBeGreaterThan(0);
    expect(faces.filter((f) => !f.endsWith(':loaded')), `${label}: a font did not load from file://`).toEqual([]);
  }
});
