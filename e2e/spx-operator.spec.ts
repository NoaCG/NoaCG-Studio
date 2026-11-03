// covers: src/export/**, src/model/importTemplate.ts
// focus

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { lowerThirdPng } from './_png';
import { dropSvg, intoProduction } from './_svg-import';

// What an SPX operator meets with a NoaCG package, pinned from the real-server walk
// (docs/SPX_ON_A_REAL_SERVER.md §2): the layer each graphic lands on, which files SPX's template
// browser offers, and one Continue more than the graphic has steps. Each case builds the package
// with the real exporter and reads or runs what it wrote.

/** Serve a package's text files at `origin` the way SPX's template server does, and any `pictures`
 *  (by path) as PNGs. */
function serveFiles(target: Page, origin: string, files: Record<string, string>, pictures: string[] = []) {
  return target.route(`${origin}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (pictures.includes(path)) return route.fulfill({ contentType: 'image/png', body: lowerThirdPng(1, 1) });
    const body = files[path];
    if (body === undefined) return route.fulfill({ status: 404, body: '' });
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ contentType: type, body });
  });
}

/** What SPX does on Play or Update: hand the template's update() a payload. */
function update(target: Page, payload: string) {
  return target.evaluate((data) => (window as unknown as { update(d: string): void }).update(data), payload);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
});

test('the SPX export puts each kind of graphic on its own layer inside SPX Solo\'s five', async ({ page }) => {
  // Hairline, Clean Quiz and House Scorebug all declared 7, so SPX 1.2 imported them all at 7 and
  // SPX 1.4 Solo (five layers, anything higher capped to 5) at 5: each Play evicted the last.
  const layers = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { slug } = await import('/src/model/slug.ts');
    const layerOf = async (template: ReturnType<NonNullable<ReturnType<typeof variantById>>['create']>) => {
      const zip = await spxTarget.build(template);
      const name = slug(template.name);
      const html = await zip.file(`${name}/${name}.html`)!.async('string');
      return {
        play: html.match(/"playlayer":\s*"(\d+)"/)?.[1],
        web: html.match(/"webplayout":\s*"(\d+)"/)?.[1],
        readme: (await zip.file(`${name}/README.md`)!.async('string')).match(/plays on layer (\d+)/)?.[1],
      };
    };
    const make = (id: string) => variantById(id)!.create({});
    const hairline = make('lt01');
    const declared = (template: typeof hairline, layer: string) => ({
      ...template,
      settings: { ...template.settings, playlayer: layer, webplayout: layer },
    });
    return {
      hairline: await layerOf(hairline),
      quiz: await layerOf(make('qz04')),
      scorebug: await layerOf(make('sb05')),
      // A number SPX Solo can hold is somebody's choice and survives; one it cannot is replaced.
      chosen: (await layerOf(declared(hairline, '3'))).web,
      tooHigh: (await layerOf(declared(hairline, '9'))).web,
    };
  });
  // Every number agrees inside one package: the definition and the README.
  expect(layers.hairline).toEqual({ play: '2', web: '2', readme: '2' });
  expect(layers.quiz).toEqual({ play: '4', web: '4', readme: '4' });
  expect(layers.scorebug).toEqual({ play: '5', web: '5', readme: '5' });
  expect(layers.chosen).toBe('3');
  expect(layers.tooHigh).toBe('2');
});

test('the production package maps the operator\'s layer order onto SPX\'s range', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { spxShowLayers } = await import('/src/export/showExport.ts');
    const at = (...layers: number[]) => spxShowLayers(layers.map((layer) => ({ layer })));
    return {
      defaults: at(20, 21, 22),
      // Order, not position: the dashboard's numbers decide the stack.
      reordered: at(30, 20, 25),
      // Two graphics the operator put on one layer on purpose still replace each other.
      shared: at(20, 20, 21),
      six: at(20, 21, 22, 23, 24, 25),
      unset: spxShowLayers([{}, { layer: 40 }]),
    };
  });
  expect(result.defaults).toEqual([1, 2, 3]);
  expect(result.reordered).toEqual([3, 1, 2]);
  expect(result.shared).toEqual([1, 1, 2]);
  expect(result.six).toEqual([1, 2, 3, 4, 5, 6]);
  expect(result.unset).toEqual([1, 2]);
});

test('SPX\'s template browser finds only graphics in the single and the production package', async ({ page }) => {
  // SPX lists every .htm and .html in a folder as a template; 1.2.1 skips only dot files, which
  // it then refuses to serve. controlpanel.html sat beside every graphic, and choosing it failed
  // with SPX's "template definition missing". A CasparCG server lists .html the same way.
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { buildShowZip } = await import('/src/export/showExport.ts');
    const listed = (names: string[]) =>
      names.filter((n) => /\.html?$/i.test(n) && !n.split('/').some((part) => part.startsWith('.')));
    const hairline = variantById('lt01')!.create({});
    const quiz = variantById('qz04')!.create({});
    const single = await spxTarget.build(hairline);
    const singleNames = Object.keys(single.files).filter((n) => !single.files[n].dir);
    const singlePanel = singleNames.includes('hairline/controlpanel.shtml');
    const graphics = [hairline, quiz].map((template, i) => ({
      id: `g-${i}`, name: template.name, type: template.type, savedAt: '2026-01-01T00:00:00.000Z', template,
      layer: 20 + i,
    }));
    const show = await buildShowZip({ id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4', name: 'Spx Show', graphics, updatedAt: '2026-01-01T00:00:00.000Z' });
    const showNames = Object.keys(show.files).filter((n) => !show.files[n].dir);
    const text = (zip: typeof single, n: string) => zip.file(n)!.async('string');
    return {
      singleListed: listed(singleNames),
      singlePanel,
      singleReadme: await text(single, 'hairline/README.md'),
      singleGuide: await text(single, 'hairline/GETTING-ON-AIR.md'),
      showListed: listed(showNames).sort(),
      showPanels: showNames.filter((n) => /controlpanel\./.test(n)).sort(),
      showReadme: await text(show, 'spx_show/README.md'),
      showGuide: await text(show, 'spx_show/GETTING-ON-AIR.md'),
    };
  });
  expect(result.singleListed).toEqual(['hairline/hairline.html']);
  // The panel is still in the package, under the name every text in it uses.
  expect(result.singlePanel).toBe(true);
  expect(result.singleReadme).toContain('controlpanel.shtml An operator page');
  expect(result.singleReadme).not.toContain('controlpanel.html');
  expect(result.singleGuide).toContain('controlpanel.shtml');
  expect(result.singleGuide).not.toContain('controlpanel.html');
  // SPX 1.4's Update changes nothing on air (docs/SPX_ON_A_REAL_SERVER.md §2); the guide says so.
  expect(result.singleGuide).toContain('On SPX 1.4, **Update** changes nothing on air');
  expect(result.showListed).toEqual(['spx_show/clean_quiz/clean_quiz.html', 'spx_show/hairline/hairline.html']);
  expect(result.showPanels).toEqual([
    'spx_show/clean_quiz/controlpanel.shtml',
    'spx_show/hairline/controlpanel.shtml',
    'spx_show/show_controlpanel.shtml',
  ]);
  expect(result.showReadme).toContain('show_controlpanel.shtml');
  expect(result.showReadme).not.toContain('controlpanel.html');
  expect(result.showGuide).toContain('show_controlpanel.shtml');
});

test('one Continue past the last step takes the graphic out, as SPX\'s rundown shows it', async ({ page, context }) => {
  // SPX 1.2.1 answers the Continue after the last step with one more `next` and shows the item as
  // stopped; the quiz stayed on air with no Stop offered for it. SPX 1.4 sends `stop` instead.
  // The dual NoaCG package is the same SPX layout and its README gives the same SPX rules, so it
  // carries the guard too (issue #900); its files are under `dual/` here.
  const files = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { buildGraphicPackage } = await import('/src/export/noacgPackage.ts');
    const out: Record<string, string> = {};
    for (const id of ['qz04', 'lt01']) {
      const template = variantById(id)!.create({});
      const zips = [['', await spxTarget.build(template)], ['dual/', await buildGraphicPackage(template)]] as const;
      for (const [prefix, zip] of zips) {
        for (const n of Object.keys(zip.files)) {
          if (!zip.files[n].dir && /\.(html|js|css)$/.test(n)) out[prefix + n] = await zip.file(n)!.async('string');
        }
      }
    }
    return out;
  });
  for (const at of ['', 'dual/']) {
    expect(files[`${at}clean_quiz/clean_quiz.html`]).toContain('id="noacg-spx-steps"');
    // A graphic without steps has no Continue in SPX and carries no guard.
    expect(files[`${at}hairline/hairline.html`]).not.toContain('noacg-spx-steps');
  }
  // The dual package keeps the panel name its CLI documents.
  expect(Object.keys(files)).toContain('dual/clean_quiz/controlpanel.html');

  const air = await context.newPage();
  await serveFiles(air, 'http://spx-steps.local', files);
  for (const at of ['', 'dual/']) {
    await air.goto(`http://spx-steps.local/${at}clean_quiz/clean_quiz.html`, { waitUntil: 'load' });
    const calls = await air.evaluate(() => {
      const w = window as unknown as { play(): void; stop(): void; next(): unknown; stops: number; spyOn: boolean };
      // Count what reaches the template's stop(), the way SPX's own Stop reaches it.
      const stop = w.stop;
      w.stops = 0;
      w.stop = function () { w.stops += 1; return stop.apply(this); };
      const seen: number[] = [];
      w.play();
      w.next(); // the reveal - the one Continue the quiz has
      seen.push(w.stops);
      w.next(); // one too many: SPX 1.2.1's controller now shows the item as stopped
      seen.push(w.stops);
      // A fresh Play starts the count again.
      w.play();
      w.next();
      seen.push(w.stops);
      return seen;
    });
    expect(calls, `${at || 'spx/'} package`).toEqual([0, 1, 1]);
  }
  await air.close();

  // The guard is packaging, not the graphic: importing either package back leaves it out. The
  // dual package hashes its sources as written, guard included, so its OGraf half reads fresh.
  const imported = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { buildGraphicPackage } = await import('/src/export/noacgPackage.ts');
    const { importZipTemplate } = await import('/src/model/importTemplate.ts');
    const template = variantById('qz04')!.create({});
    const out: { code: string; stale?: boolean }[] = [];
    for (const zip of [await spxTarget.build(template), await buildGraphicPackage(template)]) {
      const result = await importZipTemplate('clean_quiz.zip', await zip.generateAsync({ type: 'arraybuffer' }));
      out.push({ code: `${result.template.html}\n${result.template.js}`, stale: result.noacg?.stale });
    }
    return out;
  });
  for (const { code } of imported) {
    expect(code).not.toContain('noacg-spx-steps');
    expect(code).not.toContain('continues >= steps');
  }
  expect(imported[1].stale).toBe(false);
});

test('a value SPX hands over HTML-escaped goes on air as typed', async ({ page, context }) => {
  // SPX escapes every value it plays and turns a line break into <br> first (cleanUpString,
  // docs/SPX_ON_A_REAL_SERVER.md §11): `Anna O'Brien & Sons` aired as `Anna O&#039;Brien &amp; Sons`
  // and the News Strip's items were joined by a literal `&lt;br&gt;` (issue #788).
  const files = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const out: Record<string, string> = {};
    for (const id of ['lt01', 'tk01']) {
      const zip = await spxTarget.build(variantById(id)!.create({}));
      for (const n of Object.keys(zip.files)) {
        if (!zip.files[n].dir && /\.(html|js|css)$/.test(n)) out[n] = await zip.file(n)!.async('string');
      }
    }
    return out;
  });
  const html = Object.keys(files).filter((n) => /^([^/]+)\/\1\.html$/.test(n)).sort();
  expect(html).toEqual(['hairline/hairline.html', 'news_strip/news_strip.html']);
  for (const n of html) expect(files[n]).toContain('id="noacg-spx-text"');

  const air = await context.newPage();
  await serveFiles(air, 'http://spx-text.local', files);
  const spxUpdate = (fields: Record<string, string>) => update(air, JSON.stringify(fields));

  // The values exactly as SPX 1.4.1 delivered them on the real server.
  await air.goto('http://spx-text.local/hairline/hairline.html', { waitUntil: 'load' });
  await spxUpdate({ f0: 'Anna O&#039;Brien &amp; Sons', f1: 'Line one&lt;br&gt;Line two &lt;b&gt;' });
  expect(await air.locator('#f0').textContent()).toBe("Anna O'Brien & Sons");
  expect(await air.locator('#f1').textContent()).toBe('Line one\nLine two <b>');
  // Text stays text: the typed <b> is a character, not an element.
  expect(await air.locator('#f1 b').count()).toBe(0);

  await air.goto('http://spx-text.local/news_strip/news_strip.html', { waitUntil: 'load' });
  await spxUpdate({ f0: 'First story&lt;br&gt;Second story &amp; more' });
  const items = await air.locator('#ticker-track .ticker-item').allTextContents();
  expect([...new Set(items)]).toEqual(['First story', 'Second story & more']);
  expect(await air.locator('#ticker-track').textContent()).not.toMatch(/&lt;|&gt;|&amp;|<br/);
  await air.close();

  // The script is packaging, not the graphic: importing the package back leaves it out.
  const imported = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { importZipTemplate } = await import('/src/model/importTemplate.ts');
    const zip = await spxTarget.build(variantById('lt01')!.create({}));
    const result = await importZipTemplate('hairline.zip', await zip.generateAsync({ type: 'arraybuffer' }));
    return `${result.template.html}\n${result.template.js}`;
  });
  expect(imported).not.toContain('noacg-spx-text');
  expect(imported).not.toContain('asTyped');
});

test('a Picture and a CasparCG single file played from SPX show what was picked and typed', async ({ page, context }) => {
  // Issue #888: the text script stayed off in the Picture graphic (no setFieldValue), so a file
  // picked as `Q&A.jpg` arrived as `Q&amp;A.jpg` and the picture was blank; and the CasparCG
  // single file, whose guide says how to play it from SPX, carried no script at all. A filelist
  // path is now decoded in any template.
  const built = await page.evaluate(async () => {
    const { createPictureTemplate } = await import('/src/templates/picture.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { casparTarget } = await import('/src/export/targets/casparcg.ts');
    const { importZipTemplate } = await import('/src/model/importTemplate.ts');
    const out: Record<string, string> = {};
    const picture = await spxTarget.build(createPictureTemplate());
    // Imported back from its SPX package, a Picture is a plain graphic that keeps its filelist field.
    const { template: reimported } = await importZipTemplate(
      'pictures.zip',
      await picture.generateAsync({ type: 'arraybuffer' }),
    );
    const zips = [
      ['', picture],
      ['again/', await spxTarget.build(reimported)],
      ['', await casparTarget.build(variantById('lt01')!.create({}))],
    ] as const;
    for (const [prefix, zip] of zips) {
      for (const n of Object.keys(zip.files)) {
        if (!zip.files[n].dir && /\.(html|js|css)$/.test(n)) out[prefix + n] = await zip.file(n)!.async('string');
      }
    }
    return { files: out, reimportedType: reimported.type };
  });
  expect(built.reimportedType).toBe('blank');
  const files = built.files;
  const air = await context.newPage();
  // The picked files exist under their own names, so a path that reaches the server as named shows.
  const picked = ['', 'again/'].flatMap((at) => [`${at}pictures/images/Q&A.jpg`, `${at}pictures/images/O'Brien.png`]);
  await serveFiles(air, 'http://spx-routes.local', files, picked);
  const pictureShown = () =>
    air.locator('#f0').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

  // The values as SPX 1.4.1's cleanUpString hands them over.
  for (const at of ['pictures/pictures.html', 'again/pictures/pictures.html']) {
    await air.goto(`http://spx-routes.local/${at}`, { waitUntil: 'load' });
    await update(air, JSON.stringify({ f0: 'images/Q&amp;A.jpg' }));
    expect(await air.locator('#f0').getAttribute('src')).toBe('images/Q&A.jpg');
    await expect.poll(pictureShown).toBe(true);
    await update(air, JSON.stringify({ f0: 'images/O&#039;Brien.png' }));
    expect(await air.locator('#f0').getAttribute('src')).toBe("images/O'Brien.png");
    await expect.poll(pictureShown).toBe(true);
  }

  await air.goto('http://spx-routes.local/hairline/hairline.html', { waitUntil: 'load' });
  await update(air, JSON.stringify({ f0: 'Anna O&#039;Brien &amp; Sons' }));
  expect(await air.locator('#f0').textContent()).toBe("Anna O'Brien & Sons");
  // A CasparCG client's XML still reaches the template through the data shim, and as typed.
  await update(air, '<templateData><componentData id="f0"><data id="text" value="AT&amp;amp;T"/></componentData></templateData>');
  expect(await air.locator('#f0').textContent()).toBe('AT&amp;T');
  await air.close();

  // Imported and exported again, the single file carries the script once, so SPX's escaping is
  // undone once: a typed `AT&amp;T` still reads `AT&amp;T`.
  const again = await page.evaluate(async (html) => {
    const { importHtmlTemplate } = await import('/src/model/importTemplate.ts');
    const { casparTarget } = await import('/src/export/targets/casparcg.ts');
    const { template } = importHtmlTemplate('hairline.html', html);
    const zip = await casparTarget.build(template);
    return {
      imported: `${template.html}\n${template.js}`,
      html: await zip.file(/^[^/]+\/[^/]+\.html$/).find((f) => !/controlpanel/.test(f.name))!.async('string'),
    };
  }, files['hairline/hairline.html']);
  expect(again.imported).not.toContain('noacg-spx-text');
  expect(again.imported).not.toContain('asTyped');
  expect(again.html.match(/id="noacg-spx-text"/g)).toHaveLength(1);
  // The CasparCG data shim is packaging too, so it comes back once as well (issue #901).
  expect(again.imported).not.toContain('CasparCG data shim');
  expect(again.html.match(/CasparCG data shim/g)).toHaveLength(1);
  const reair = await context.newPage();
  await serveFiles(reair, 'http://spx-again.local', { 'hairline.html': again.html });
  await reair.goto('http://spx-again.local/hairline.html', { waitUntil: 'load' });
  await update(reair, JSON.stringify({ f0: 'AT&amp;amp;T' }));
  expect(await reair.locator('#f0').textContent()).toBe('AT&amp;T');
  // And a CasparCG client's XML still reaches the re-exported template.
  await update(reair, '<templateData><componentData id="f0"><data id="text" value="Second take"/></componentData></templateData>');
  expect(await reair.locator('#f0').textContent()).toBe('Second take');
  await reair.close();
});

// ── GENERATED IMPORTED PACKAGES ON SPX, A HOST WITH NO WIRE (docs/work-specs/jev-svg-import row 29, AC-16) ──
//
// Standalone-host capability: the graphic the import road saved, packaged by the real SPX
// exporter and driven only as SPX drives it (update, play, stop) and as the package's own control
// page does (its channel's `event` message, which is how an SPX operator reaches a clock button:
// SPX's rundown has none). Nothing stamps the clock, so it counts from this machine's own clock,
// and a reload has no log to rejoin. Hosted recovery is e2e/configured/scorebug-output.spec.ts.
// Physical studio acceptance is not claimed here.

const SCORE_CLOCK_SVG = fileURLToPath(new URL('./fixtures/jev-svg/dev/score-clock-1.svg', import.meta.url));
const CREDITS_SVG = fileURLToPath(new URL('./fixtures/jev-svg/dev/credits-1.svg', import.meta.url));

/** Import `svg` through the wizard, let `choose` set its behaviour, finish it into a new
 *  production, and answer the SPX package of the graphic the library saved, as text files. */
async function importedSpx(page: Page, svg: string, name: string, choose: () => Promise<void>): Promise<Record<string, string>> {
  await page.goto('/app');
  await dropSvg(page, svg);
  await choose();
  await intoProduction(page, name, `${name} Show`);
  return page.evaluate(async (name) => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const zip = await spxTarget.build(loadGraphics().find((g) => g.name === name)!.template);
    const out: Record<string, string> = {};
    for (const n of Object.keys(zip.files)) {
      if (!zip.files[n].dir && /\.(html|js|css)$/.test(n)) out[n] = await zip.file(n)!.async('string');
    }
    return out;
  }, name);
}

test('an imported clock and imported cards made by the import road run on SPX\'s calls and the package\'s own control page', async ({ page, context }) => {
  test.setTimeout(90_000);
  const clockFiles = await importedSpx(page, SCORE_CLOCK_SVG, 'Spx Count Up', () => page.getByTestId('map-svg-clock-mode').selectOption('count-up').then(() => {}));
  const durationFiles = await importedSpx(page, SCORE_CLOCK_SVG, 'Spx Duration', () => page.getByTestId('map-svg-clock-mode').selectOption('duration').then(() => {}));
  const cardFiles = await importedSpx(page, CREDITS_SVG, 'Spx Cards', async () => {
    await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
    const picker = page.getByTestId('map-svg-recipe-credits');
    const role = await picker.locator('option').evaluateAll((options) => (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
    await picker.selectOption(role);
    await page.getByTestId('map-svg-credits-playback').selectOption('cards');
    // SPX has no custom actions, so the cards turn on a card time (row 23).
    await page.getByTestId('map-svg-credits-advance').fill('3');
    await page.getByTestId('map-svg-credits-advance').blur();
  });
  const files = { ...clockFiles, ...durationFiles, ...cardFiles };
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['spx_count_up/spx_count_up.html', 'spx_duration/spx_duration.html', 'spx_cards/spx_cards.html']));
  // SPX's rundown offers the fields; the clock buttons live on the package's control page.
  const definition = (html: string) => JSON.parse(html.match(/SPXGCTemplateDefinition = (\{[\s\S]*?\n\});/)![1]) as { DataFields: Array<{ field: string; ftype: string; value: string }> };
  expect(definition(files['spx_count_up/spx_count_up.html']).DataFields.map((f) => f.ftype)).not.toContain('button');
  expect(Object.keys(files)).toContain('spx_count_up/controlpanel.shtml');

  const air = await context.newPage();
  const errors: string[] = [];
  air.on('pageerror', (e) => errors.push(e.message));
  await serveFiles(air, 'http://spx-imported.local', files);
  await air.clock.install({ time: new Date('2026-11-14T18:00:00Z') });
  const clock = () => air.locator('.imported-design-clock').evaluate((el) => (el.textContent ?? '').trim());
  // What the package's control page posts for a clock button, on the channel its receiver opens.
  const press = (html: string, event: string) => air.evaluate(({ channel, event }) => {
    new BroadcastChannel(channel).postMessage({ t: 'event', event });
  }, { channel: html.match(/new BroadcastChannel\('([^']+)'\)/)![1], event });
  const call = (fn: 'play' | 'stop') => air.evaluate((fn) => (window as unknown as Record<string, () => void>)[fn](), fn);

  // COUNTING UP: SPX's Play shows the drawn time and holds it; Start counts on this machine's clock.
  // Half a second over each whole count: an event fires a frame after its message.
  const upHtml = files['spx_count_up/spx_count_up.html'];
  await air.goto('http://spx-imported.local/spx_count_up/spx_count_up.html', { waitUntil: 'load' });
  await update(air, JSON.stringify({ f0: 'FIELD', f1: '2', f2: '12:08', f3: '5', f4: 'SHORE' }));
  await call('play');
  await air.clock.runFor(3_000);
  expect(await clock()).toBe('12:08');
  await press(upHtml, 'clock_start');
  await air.clock.runFor(3_500);
  expect(await clock()).toBe('12:11');
  await press(upHtml, 'clock_pause');
  await air.clock.runFor(4_000);
  expect(await clock(), 'Pause holds').toBe('12:11');
  // An operator correction is SPX's Update with a new time; a score Update leaves the clock alone.
  await update(air, JSON.stringify({ f0: 'FIELD', f1: '2', f2: '5:00', f3: '5', f4: 'SHORE' }));
  await air.clock.runFor(1_000);
  expect(await clock()).toBe('5:00');
  await press(upHtml, 'clock_start');
  await air.clock.runFor(2_500);
  await update(air, JSON.stringify({ f0: 'FIELD', f1: '3', f2: '5:00', f3: '5', f4: 'SHORE' }));
  await air.clock.runFor(1_000);
  expect(await air.locator('#f1').textContent()).toBe('3');
  expect(await clock(), 'resending the time it started from does not pull it back').toBe('5:03');
  await press(upHtml, 'clock_reset');
  await air.clock.runFor(1_000);
  expect(await clock()).toBe('12:08');

  // A DURATION starts on SPX's Play, from this machine's own clock.
  await air.goto('http://spx-imported.local/spx_duration/spx_duration.html', { waitUntil: 'load' });
  await update(air, JSON.stringify({ f0: 'FIELD', f1: '2', f2: '12:08', f3: '5', f4: 'SHORE' }));
  await air.clock.runFor(2_000);
  expect(await clock(), 'off air it waits').toBe('12:08');
  await call('play');
  await air.clock.runFor(3_500);
  expect(await clock()).toBe('12:05');
  // Stop and Play again: a new count of its length.
  await call('stop');
  await air.clock.runFor(2_000);
  await call('play');
  await air.clock.runFor(1_500);
  expect(await clock()).toBe('12:07');

  // CARDS ON A CARD TIME: SPX's Update carries the list, Play shows the first card, and the card
  // time turns to the next with no button; the last one holds.
  const cardFields = definition(files['spx_cards/spx_cards.html']).DataFields;
  const list = cardFields.find((f) => f.value.includes('Research'))!.field;
  const time = cardFields.find((f) => f.value === '3')!.field;
  await air.goto('http://spx-imported.local/spx_cards/spx_cards.html', { waitUntil: 'load' });
  await update(air, JSON.stringify({ [list]: 'Research:\nNia Vale\nTomas Fen\n\nSound:\nAri Moss', [time]: '3' }));
  await call('play');
  const rows = () => air.locator('.imported-design-credits-row').allTextContents();
  await air.clock.runFor(1_500);
  expect(await rows()).toEqual(['Research', 'Nia Vale', 'Tomas Fen']);
  await air.clock.runFor(4_000);
  expect(await rows()).toEqual(['Sound', 'Ari Moss']);
  await air.clock.runFor(6_000);
  expect(await rows(), 'the last card holds').toEqual(['Sound', 'Ari Moss']);
  expect(errors).toEqual([]);
  await air.close();
});
