import { test, expect, type Page, type Route } from '@playwright/test';
import { createProject } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Phase 5: SHOWS — the rundown level. A show collects graphics that run together; its
// export packages every graphic plus ONE aggregated control page (a card per graphic,
// each driving its own BroadcastChannel independently).

async function addCurrentToShow(page: Page, showName: string, create = false): Promise<void> {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  if (create) {
    await section.getByPlaceholder('New production name').fill(showName);
    await section.getByRole('button', { name: 'Create', exact: true }).click();
  } else {
    // A fresh document remounts the panel, so the show needs re-picking by name.
    const value = await section.locator('select option', { hasText: showName }).getAttribute('value');
    await section.locator('select').selectOption(value!);
  }
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');
}

test('a show collects graphics in rundown order and exports one aggregated panel', async ({ page, context }) => {
  // Two graphics into one show, from two separate documents.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await addCurrentToShow(page, 'Evening Show', true);

  await createProject(page, { name: 'Arena Quiz' });
  await addCurrentToShow(page, 'Evening Show');

  // The layer stack, the export and everything else live on the production's own PAGE now —
  // the editor's Productions block is deliberately slim (docs/GOALS_ARCHIVE.md "Student release"
  // step 8): add-current + the link, nothing that could drift from the page.
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Both graphics reached the production, each with its own layer — read off the RUNDOWN, which
  // is the only list of what a production holds (docs/PLAYOUT_DASHBOARD.md §5). Layers are
  // numbers, distinct on arrival from 20 up.
  const cueRows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cueRows).toHaveCount(2);
  await expect(cueRows.nth(0)).toContainText('Hairline');
  await expect(cueRows.nth(0).getByTestId('cue-layer')).toHaveText('L20');
  await expect(cueRows.nth(1)).toContainText('Arena Quiz');
  await expect(cueRows.nth(1).getByTestId('cue-layer')).toHaveText('L21');

  // Export: the target picker (SPX is the remembered default), one folder per graphic + the
  // aggregated show panel.
  await page.getByTestId('export-production').click();
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await expect(page.getByTestId('prod-target-spx')).toBeChecked();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const names = Object.keys(zip.files);
  // Template files carry the GRAPHIC'S NAME (an SPX rundown lists files; index.html-per-folder
  // listed every NoaCG template as "index" — student-release acceptance finding).
  expect(names).toContain('evening_show/hairline/hairline.html');
  expect(names).toContain('evening_show/arena_quiz/arena_quiz.html');
  expect(names).toContain('evening_show/show_controlpanel.html');
  expect(names.filter((n) => n.endsWith('index.html'))).toEqual([]);

  const panelHtml = await zip.file('evening_show/show_controlpanel.html')!.async('string');
  expect(panelHtml).toContain('spx-control-hairline'); // each card on its own channel
  expect(panelHtml).toContain('spx-control-arena_quiz');
  expect(panelHtml).toContain('Select answer'); // the quiz's machine buttons ride along

  // ── Round-trip: the ONE panel drives both graphics independently. ──
  const files = new Map<string, string>();
  for (const n of names) {
    if (!zip.files[n].dir) files.set(n.replace(/^evening_show\//, ''), await zip.file(n)!.async('string'));
  }
  const serve = (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'nf' });
    const ct = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : 'text/html';
    return route.fulfill({ status: 200, contentType: ct, body });
  };

  const third = await context.newPage();
  await third.route('http://show-rt.local/**', serve);
  await third.goto('http://show-rt.local/hairline/hairline.html', { waitUntil: 'load' });

  const quiz = await context.newPage();
  await quiz.route('http://show-rt.local/**', serve);
  await quiz.goto('http://show-rt.local/arena_quiz/arena_quiz.html', { waitUntil: 'load' });

  const panel = await context.newPage();
  await panel.route('http://show-rt.local/**', serve);
  await panel.goto('http://show-rt.local/show_controlpanel.html', { waitUntil: 'load' });

  await expect(panel.locator('.card')).toHaveCount(2);
  const thirdCard = panel.locator('.card', { hasText: 'Hairline' });
  const quizCard = panel.locator('.card', { hasText: 'Arena Quiz' });

  // Play the lower third from ITS card: it enters; the quiz stays at rest.
  await thirdCard.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => third.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect
    .poll(async () =>
      quiz.evaluate(() => {
        const w = window as unknown as { noacgMachineState?: () => { groups: Record<string, string> } };
        return w.noacgMachineState?.().groups.main ?? null;
      }),
    )
    .toBe('off');

  // Drive the quiz from ITS card — the machine advances, the lower third is untouched.
  await quizCard.getByRole('button', { name: '▶ Play' }).click();
  await quizCard.getByRole('button', { name: '⚡ Select answer' }).click();
  await expect
    .poll(async () =>
      quiz.evaluate(() => {
        const w = window as unknown as { noacgMachineState?: () => { groups: Record<string, string> } };
        return w.noacgMachineState?.().groups.main ?? null;
      }),
    )
    .toBe('selected');
  await expect(quizCard.locator('.state-chip')).toContainText('Answer selected');

  await panel.close();
  await quiz.close();
  await third.close();
});

test('offline: the hosted control route answers honestly and the Shows section grows no cloud UI', async ({ page }) => {
  // The e2e server pins offline mode (no Supabase env): the capability route must say so
  // rather than spin, and the Shows section must stay purely local (auth-posture rule).
  await page.goto('/app?control=some-slug');
  await expect(page.locator('.sendin-card')).toContainText('Hosted control needs the cloud backend');

  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await expect(section).toBeVisible();
  await expect(section.getByText(/host.*online/i)).toHaveCount(0);
});

test('shows and videos ride the storage seam (the sync engine sees and writes both kinds)', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { LocalStorageProvider } = await import('/src/backend/storage.ts');
    const { SYNC_KINDS } = await import('/src/backend/sync.ts');
    const { createShow, loadShows } = await import('/src/model/shows.ts');
    const provider = new LocalStorageProvider();

    createShow('Sync Me');
    const shows = await provider.list('show');

    // A pulled video record (another device's save) lands through put(), tombstone and all.
    const videoBody = {
      id: '7f9b2f6a-1111-4222-8333-444455556666',
      name: 'Pulled clip',
      updatedAt: '2026-07-21T00:00:00.000Z',
      project: { kind: 'video', id: '7f9b2f6a-1111-4222-8333-444455556666', name: 'Pulled clip', tsx: 'export default 1' },
    };
    await provider.put({ kind: 'video', id: videoBody.id, updatedAt: videoBody.updatedAt, body: videoBody });
    const videos = await provider.list('video');

    return {
      kinds: SYNC_KINDS,
      showListed: shows.some((r) => (r.body as { name: string }).name === 'Sync Me'),
      showLive: loadShows().some((s) => s.name === 'Sync Me'),
      videoListed: videos.some((r) => r.id === videoBody.id),
    };
  });
  // 'graphic' joined with the graphics library; 'packet' left with the packages retirement
  // (docs/SAVED_CONTENT_MODEL.md - old packet rows stay inert, simply never fetched).
  expect(result.kinds).toEqual(['look', 'brand', 'project', 'show', 'video', 'graphic']);
  expect(result.showListed).toBe(true);
  expect(result.showLive).toBe(true);
  expect(result.videoListed).toBe(true);
});

test('production export packages for the other registry targets through the same per-graphic builders', async ({ page }) => {
  // The target picker's build path (buildShowZipFor): every non-SPX flavor reuses the
  // per-graphic target packagers verbatim, merged under one show folder. Pin the layouts and
  // that the CasparCG flavor actually PLAYS (self-contained, host-driven, no receiver).
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const third = variantsFor('lower-third')[0].create({});
    const quiz = variantsFor('quiz')[0].create({});
    const graphics = [third, quiz].map((template, i) => ({
      id: `g-${i}`, name: template.name, type: template.type, savedAt: '2026-01-01T00:00:00.000Z', template,
      layer: 20 + i,
    }));
    const show = { id: 'b0b0b0b0-c1c1-4d2d-8e3e-f4f4f4f4f4f4', name: 'Flavor Show', graphics, updatedAt: '2026-01-01T00:00:00.000Z', hostedSlug: 'x' };

    const list = async (targetId: string) => {
      const zip = await buildShowZipFor(show, targetId);
      const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
      return { names, zip };
    };

    const caspar = await list('casparcg');
    const overlay = await list('html-overlay');
    const ograf = await list('ograf');
    // The lower third's own file, named by its slug inside its own folder.
    const casparHtmlPath = caspar.names.find((n) => /^flavor_show\/([^/]+)\/\1\.html$/.test(n))!;
    const casparHtml = await caspar.zip.file(casparHtmlPath)!.async('string');
    // The aggregated field reference: one table per graphic, each on its own layer, with the
    // IDs a playout client sends. And the GUIDE ONLY DESCRIBES WHAT IS IN THE FOLDER — the
    // CasparCG flavor bundles no launcher, so it must not name one (acceptance round 2).
    const casparFields = await caspar.zip.file('flavor_show/FIELDS.md')!.async('string');
    const overlayFields = await overlay.zip.file('flavor_show/FIELDS.md')!.async('string');
    const casparGuide = await caspar.zip.file('flavor_show/GETTING-ON-AIR.md')!.async('string');
    const overlayGuideText = await overlay.zip.file('flavor_show/GETTING-ON-AIR.md')!.async('string');
    return {
      casparNames: caspar.names,
      overlayHasShowPanel: overlay.names.includes('flavor_show/show_controlpanel.html'),
      overlayGuide: overlay.names.includes('flavor_show/GETTING-ON-AIR.md'),
      ografManifests: ograf.names.filter((n) => n.endsWith('.ograf.json')).length,
      casparHtml,
      casparReceiverFree: !casparHtml.includes('== HOSTED CONTROL'),
      casparFields,
      overlayFields,
      ografHasFields: ograf.names.includes('flavor_show/FIELDS.md'),
      casparGuideNamesLauncher: casparGuide.includes('Start controller.cmd'),
      overlayGuideNamesLauncher: overlayGuideText.includes('Start controller.cmd'),
      overlayHasLauncher: overlay.names.includes('flavor_show/Start controller.cmd'),
    };
  });

  // Each graphic is its own CasparCG sub-package: folder + self-contained html + README. The
  // GRAPHIC files are counted, so the operator page each sub-package has carried since
  // 2026-09-04 is filtered out - the sibling counts in e2e/wizard-kit.spec.ts read the same way.
  expect(
    result.casparNames.filter(
      (n) => /^flavor_show\/[^/]+\/[^/]+\.html$/.test(n) && !n.endsWith('controlpanel.html'),
    ),
  ).toHaveLength(2);
  // …and every one of those sub-packages carries the panel, not just the first.
  expect(result.casparNames.filter((n) => n.endsWith('/controlpanel.html'))).toHaveLength(2);
  expect(result.casparNames.filter((n) => n.endsWith('README.md')).length).toBeGreaterThanOrEqual(3); // per graphic + the show's
  expect(result.overlayHasShowPanel).toBe(true);
  expect(result.overlayGuide).toBe(true);
  expect(result.ografManifests).toBe(2);
  expect(result.casparReceiverFree).toBe(true);

  // Every flavor ships the field/ID reference, and the production one indexes each graphic by
  // its own playout layer.
  expect(result.ografHasFields).toBe(true);
  expect(result.casparFields).toContain('| ID | Field | Type | Default value |');
  expect(result.casparFields).toContain('| `f0` |');
  expect(result.casparFields).toMatch(/\|\s*20\s*\|.+\|\s*\d+\s*\|/); // the layer index row
  // Each graphic carries the CasparCG CLIENT's steps for ITS OWN layer — the production is
  // where "which number goes in the video layer box" actually differs per graphic.
  expect(result.casparFields.match(/## In the CasparCG Client/g)).toHaveLength(2);
  expect(result.casparFields).toContain('Set the video layer to 20');
  expect(result.casparFields).toContain('Set the video layer to 21');
  // The overlay flavour drives its graphics from the bundled controller, so the client steps
  // would be noise there — they ship only where a CasparCG server receives the package.
  expect(result.overlayFields).not.toContain('In the CasparCG Client');
  // A guide names the launcher only where the launcher is.
  expect(result.overlayHasLauncher).toBe(true);
  expect(result.overlayGuideNamesLauncher).toBe(true);
  expect(result.casparGuideNamesLauncher).toBe(false);

  // The CasparCG flavor plays like the host drives it.
  const view = await page.context().newPage();
  await view.setContent(result.casparHtml, { waitUntil: 'load' });
  await view.evaluate(() => {
    (window as unknown as { update(raw: string): void }).update('{"f0":"Caspar Flavor"}');
    (window as unknown as { play(): void }).play();
  });
  await expect
    .poll(async () => view.locator('.lower-third, .quiz').first().evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await view.close();
});

test('a production package never carries the hosted receiver, and each graphic gets its own playout layer', async ({ page }) => {
  // Student-release acceptance regression (2026-08-05): a PUBLISHED show used to bake the
  // hosted-log receiver into every exported graphic. Under SPX/CasparCG the HOST drives the
  // template, and the receiver's boot recovery snapped the graphic to its last REPORTED state
  // (usually off) one RPC round-trip after play() — "the graphic flashes in and disappears"
  // on real hardware. The package is the offline door: no receiver, published or not.
  // Cloud-driven browser sources are the HTML-overlay flavor's job, opt-in.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { buildShowZip } = await import('/src/export/showExport.ts');
    const { slug } = await import('/src/model/slug.ts');
    const third = variantsFor('lower-third')[0].create({});
    const ticker = variantsFor('ticker')[0].create({});
    // Layers are the numbers the OPERATOR chose (docs/PLAYOUT_DASHBOARD.md §5) — addGraphicToShow
    // hands out 20, 21, … so a hand-built pool states the same thing explicitly.
    const graphics = [third, ticker].map((template, i) => ({
      id: `g-${i}`, name: template.name, type: template.type, savedAt: '2026-01-01T00:00:00.000Z', template,
      layer: 20 + i,
    }));
    const base = { id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', name: 'Baked Show', graphics, updatedAt: '2026-01-01T00:00:00.000Z' };
    const backend = { ref: 'testref', key: 'sb_publishable_testkey' };

    const zip = await buildShowZip({ ...base, hostedSlug: 'slug-under-test' }, { hostedBackend: backend });
    const texts: Record<string, string> = {};
    for (const n of Object.keys(zip.files)) {
      if (!zip.files[n].dir && /\.(html|js|md)$/.test(n)) texts[n] = await zip.file(n)!.async('string');
    }
    const jsPaths = Object.keys(texts).filter((n) => n.endsWith('js/template.js'));
    const layerOf = (name: string) => {
      const html = texts[`baked_show/${slug(name)}/${slug(name)}.html`];
      return {
        play: html?.match(/"playlayer":\s*"(\d+)"/)?.[1] ?? null,
        web: html?.match(/"webplayout":\s*"(\d+)"/)?.[1] ?? null,
      };
    };

    return {
      anyReceiver: jsPaths.some((p) => texts[p].includes('== HOSTED CONTROL')),
      snapshotClean: graphics.every((g) => !g.template.js.includes('== HOSTED CONTROL')),
      // The package declares the STORED layer number, verbatim — every generated template used
      // to say playlayer '7', so two templates in one SPX rundown evicted each other.
      thirdLayer: layerOf(third.name),
      tickerLayer: layerOf(ticker.name),
      guideShipped: Object.keys(texts).some((n) => n.endsWith('GETTING-ON-AIR.md')),
    };
  });
  expect(result.anyReceiver).toBe(false);
  expect(result.snapshotClean).toBe(true);
  expect(result.thirdLayer).toEqual({ play: '20', web: '20' });
  expect(result.tickerLayer).toEqual({ play: '21', web: '21' });
  expect(result.guideShipped).toBe(true);
});

test("a show export bakes each graphic's saved library entries into both panels", async ({ page }) => {
  // Entries live on the library GraphicDoc, not on the show's embedded copy — the export must
  // resolve them out of the library (by graphicId, unique-name fallback) so the aggregated
  // show panel AND each graphic's own controlpanel.html carry the switcher.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const panels = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic, newEntry } = await import('/src/model/library.ts');
    const { buildShowZip } = await import('/src/export/showExport.ts');

    // A saved library graphic with two named entries.
    const template = variantsFor('lower-third')[0].create({});
    const firstField = template.fields[0]?.field ?? 'f0';
    const { doc } = createGraphic(template, {
      name: 'Presenter LT',
      entries: [
        newEntry('Anna · Presenter', { [firstField]: 'Anna Andersson' }),
        newEntry('Björn · Reporter', { [firstField]: 'Björn Berg' }),
      ],
    });

    // A show whose embedded copy links back to that record by graphicId (addGraphicToShow).
    const graphic = {
      id: 'g-entries', name: doc!.template.name, type: doc!.template.type,
      savedAt: '2026-01-01T00:00:00.000Z', template: doc!.template, graphicId: doc!.id,
    };
    const show = {
      id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5', name: 'Entries Show',
      graphics: [graphic], updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const zip = await buildShowZip(show);
    const at = (suffix: string) => {
      const path = Object.keys(zip.files).find((n) => n.endsWith(suffix))!;
      return zip.file(path)!.async('string');
    };
    return { aggregated: await at('show_controlpanel.html'), perGraphic: await at('presenter_lt/controlpanel.html') };
  });

  for (const html of [panels.aggregated, panels.perGraphic]) {
    expect(html).toContain('Anna · Presenter');
    expect(html).toContain('Björn · Reporter');
    expect(html).toContain('Anna Andersson');
    expect(html).toContain('Björn Berg');
  }
});

test('the layer stack reorders and removes; deleting the show keeps nothing behind', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await addCurrentToShow(page, 'Reorder Show', true);
  await createProject(page, { name: 'Arena Quiz' });
  await addCurrentToShow(page, 'Reorder Show');

  // The layer stack lives on the production PAGE now (the editor block is slim by design).
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Arena Quiz went in last, so it took the next free number. Restacking is TYPING a number, not
  // walking arrows (docs/PLAYOUT_DASHBOARD.md §5), and the RUNDOWN is where the numbers are read:
  // there is no layer list any more.
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  const rowFor = (name: string) => rows.filter({ hasText: name }).first();
  await expect(rowFor('Arena Quiz').getByTestId('cue-layer')).toHaveText('L21');
  await expect(rowFor('Hairline').getByTestId('cue-layer')).toHaveText('L20');
  await rowFor('Hairline').getByTestId('select-cue').click();
  await page.getByTestId('graphic-layer').fill('30');
  await expect(rowFor('Hairline').getByTestId('cue-layer')).toHaveText('L30');
  await expect(rowFor('Arena Quiz').getByTestId('cue-layer')).toHaveText('L21');

  // Removal is the row's ⋯. Each graphic has one cue, so removing that cue takes the graphic with
  // it — and the menu item says so before it is pressed.
  await rowFor('Hairline').getByTestId('cue-menu').click();
  await expect(page.getByTestId('delete-cue')).toHaveText('Remove cue and graphic');
  await page.getByTestId('delete-cue').click();
  await expect(rows).toHaveCount(1);

  // Deleting the production is a Home action (two-step, on its row).
  await page.getByTestId('production-back').click();
  const row = page.locator('[data-testid^="production-row-"]', { hasText: 'Reorder Show' });
  await row.getByRole('button', { name: 'Delete Reorder Show' }).click();
  await row.getByRole('button', { name: 'Delete?' }).click();
  await expect(page.locator('[data-testid^="production-row-"]', { hasText: 'Reorder Show' })).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    // Through the model, not the raw key: the productions live in the durable store now.
    const { loadAllShows } = await import('/src/model/shows.ts');
    const list = loadAllShows();
    return { live: list.filter((s) => !s.deleted).length, payloads: list.map((s) => s.graphics.length) };
  });
  expect(stored.live).toBe(0); // tombstoned, payload stripped
  expect(stored.payloads).toEqual([0]);
});

test('a rundown export ships the LIVE graphic, not the snapshot from when it was added', async ({ page }) => {
  // Save the graphic to the library so the rundown copy carries a graphicId, then add it.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
  await addCurrentToShow(page, 'Live Rundown', true);

  // Edit the LIBRARY graphic after it is in the production — a distinctive marker in the CSS.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* EDITED-AFTER-ADD */\n' });
    // Re-save so the library record (not just the working doc) carries the edit.
    const { saveCurrentGraphic } = await import('/src/store/saveActions.ts');
    saveCurrentGraphic();
  });

  // The export lives on the production page (the editor's block is slim by design).
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('export-production').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const css = await zip.file('live_rundown/anchor_l3/css/template.css')!.async('string');
  // The export carries the edit made AFTER the graphic was added — the live library template,
  // not the snapshot embedded at add time.
  expect(css).toContain('EDITED-AFTER-ADD');
});

test('Home lists productions and the production page exports the package', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await addCurrentToShow(page, 'Home Production', true);

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  const row = page.locator('[data-testid^="production-row-"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Home Production');
  await expect(row).toContainText('1 graphic');
  // Adding a graphic auto-creates its first cue (docs/CLOUD_PLAYOUT.md §2).
  await expect(row).toContainText('1 cue');

  // The export door is on the ROW too now (acceptance ask: export straight from Home), with
  // the same target picker the production page opens.
  await row.getByTestId('export-production-row').click();
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  expect(await download.suggestedFilename()).toMatch(/production\.zip$/);
  await page.getByTestId('production-export-dialog').locator('.gallery-close').click();
  await expect(page.getByTestId('production-export-dialog')).toBeHidden();

  // The production page owns everything about one production — including the offline export.
  await row.getByTestId('open-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('export-production')).toBeVisible();

  // Packages are retired (docs/GOALS_ARCHIVE.md "Student release" step 3): no Packages nav on Home.
  await page.getByTestId('production-back').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('home-nav-packages')).toHaveCount(0);
});
