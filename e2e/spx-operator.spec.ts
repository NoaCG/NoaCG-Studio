// covers: src/export/**, src/model/importTemplate.ts
// focus

import { test, expect } from '@playwright/test';

// What an SPX operator meets with a NoaCG package, pinned from the real-server walk
// (docs/SPX_ON_A_REAL_SERVER.md §2): the layer each graphic lands on, which files SPX's template
// browser offers, and one Continue more than the graphic has steps. Each case builds the package
// with the real exporter and reads or runs what it wrote.

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
  const files = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const out: Record<string, string> = {};
    for (const id of ['qz04', 'lt01']) {
      const zip = await spxTarget.build(variantById(id)!.create({}));
      for (const n of Object.keys(zip.files)) {
        if (!zip.files[n].dir && /\.(html|js|css)$/.test(n)) out[n] = await zip.file(n)!.async('string');
      }
    }
    return out;
  });
  expect(files['clean_quiz/clean_quiz.html']).toContain('id="noacg-spx-steps"');
  // A graphic without steps has no Continue in SPX and carries no guard.
  expect(files['hairline/hairline.html']).not.toContain('noacg-spx-steps');

  const air = await context.newPage();
  await air.route('http://spx-steps.local/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    const body = files[path];
    if (body === undefined) return route.fulfill({ status: 404, body: '' });
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ contentType: type, body });
  });
  await air.goto('http://spx-steps.local/clean_quiz/clean_quiz.html', { waitUntil: 'load' });
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
  expect(calls).toEqual([0, 1, 1]);
  await air.close();

  // The guard is packaging, not the graphic: importing the package back leaves it out.
  const imported = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { spxTarget } = await import('/src/export/targets/spxStarter.ts');
    const { importZipTemplate } = await import('/src/model/importTemplate.ts');
    const zip = await spxTarget.build(variantById('qz04')!.create({}));
    const result = await importZipTemplate('clean_quiz.zip', await zip.generateAsync({ type: 'arraybuffer' }));
    return `${result.template.html}\n${result.template.js}`;
  });
  expect(imported).not.toContain('noacg-spx-steps');
  expect(imported).not.toContain('continues >= steps');
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
  await air.route('http://spx-text.local/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    const body = files[path];
    if (body === undefined) return route.fulfill({ status: 404, body: '' });
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ contentType: type, body });
  });
  const spxUpdate = (fields: Record<string, string>) =>
    air.evaluate((json) => (window as unknown as { update(d: string): void }).update(json), JSON.stringify(fields));

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
