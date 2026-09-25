import { test, expect, type Route, type Page, type BrowserContext } from '@playwright/test';
import { bootstrapGraphic, openExportWindow } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { relayServe, routeOrigin } from './_relay';

// The LOCAL-CONTROL door (offline local control, no command line): the overlay package
// bundles a localhost relay (two stdlib implementations of protocol v1) + double-click
// launchers, the panel gains a relay SEND transport, and every overlay graphic carries a
// relay RECEIVER that polls the ordered log. The server implementations are conformance-
// tested for real in scripts/local-relay.test.mjs (npm run test:local-relay); THIS spec
// drives both browser ends against an in-spec implementation of the same protocol, so the
// panel's sends and the graphic's receiver are pinned to v1 without spawning a server.

test('the overlay package ships the local-control bundle, and panel drives graphic through the relay protocol', async ({ page, context }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openExportWindow(page);
  await page.locator('.issue', { hasText: 'HTML overlay (OBS / vMix)' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

  // The bundle: relay implementations, launchers per OS, the manifest.
  for (const wanted of ['relay.ps1', 'relay.py', 'Start controller.cmd', 'start-controller.command', 'start-controller.sh', 'payload.json']) {
    expect(names, wanted).toContain(`hairline/${wanted}`);
  }
  const payload = JSON.parse(await zip.file('hairline/payload.json')!.async('string'));
  expect(payload.v).toBe(1);
  expect(payload.graphics[0].file).toBe('hairline.html');

  const graphicHtml = await zip.file('hairline/hairline.html')!.async('string');
  const panelHtml = await zip.file('hairline/controlpanel.html')!.async('string');
  expect(graphicHtml).toContain('== LOCAL RELAY');
  expect(panelHtml).toContain('/relay/ping');

  // ── Drive both ends against an in-spec relay (protocol v1, same shapes the conformance
  //    harness pins on the real servers). ──
  const rows: { id: number; graphic: string; stream: string; msg: unknown }[] = [];
  let head = 0;
  const files = new Map<string, string>([
    ['hairline.html', graphicHtml],
    ['controlpanel.html', panelHtml],
  ]);
  const serve = (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/relay/ping') {
      return route.fulfill({ json: { ok: true, v: 1, head } });
    }
    if (url.pathname === '/relay/head') return route.fulfill({ json: { head } });
    if (url.pathname === '/relay/log') {
      const after = Number(url.searchParams.get('after') ?? '0');
      return route.fulfill({ json: { rows: rows.filter((r) => r.id > after).slice(0, 500), head } });
    }
    if (url.pathname === '/relay/send') {
      const body = route.request().postDataJSON() as { graphic?: string; stream?: string; msg?: unknown; items?: { graphic: string; stream?: string; msg: unknown }[] };
      const items = body.items ?? [body as { graphic: string; stream?: string; msg: unknown }];
      for (const item of items) rows.push({ id: ++head, graphic: String(item.graphic), stream: item.stream || 'program', msg: item.msg });
      return route.fulfill({ json: { head } });
    }
    const file = files.get(url.pathname.replace(/^\//, ''));
    if (file == null) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: 'text/html', body: file });
  };

  // The "OBS side": the graphic on the relay origin. Its autoplay runs on load; take it off
  // air first so the relay-driven play is unambiguous.
  const graphic = await context.newPage();
  await graphic.route('http://relay-host.local/**', serve);
  await graphic.goto('http://relay-host.local/hairline.html', { waitUntil: 'load' });
  await graphic.evaluate(() => (window as unknown as { stop(): void }).stop());
  await expect
    .poll(async () => graphic.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');

  // The operator side: the panel in "another browser" — a page with NO BroadcastChannel
  // reach (different Playwright context) so only the relay can carry the commands.
  const other = await context.browser()!.newContext();
  const panel = await other.newPage();
  await panel.route('http://relay-host.local/**', serve);
  await panel.goto('http://relay-host.local/controlpanel.html', { waitUntil: 'load' });
  await expect(panel.locator('#status')).toContainText('local relay', { timeout: 6000 });
  // Relay hosting stands the no-listener banner down (its sends are one-way into OBS).
  await panel.waitForTimeout(2800);
  await expect(panel.locator('#nolisten')).toBeHidden();

  await panel.locator('.field', { hasText: 'Name' }).locator('input[type="text"]').first().fill('Via Relay');
  await panel.getByRole('button', { name: '▶ Play' }).click();

  // The graphic's receiver polls the log and applies update + play.
  await expect(graphic.locator('#f0')).toHaveText('Via Relay', { timeout: 6000 });
  await expect
    .poll(async () => graphic.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  await panel.close();
  await other.close();
  await graphic.close();
});

test('the production controller: preview shows the cue without airing it, Take airs it, tallies follow the log', async ({ page, context }) => {
  // The exported LOCAL-CONTROL production package's operator surface (the page the launcher
  // opens): cue rundown + verbs + PREVIEW/PROGRAM monitors, everything through relay v1.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantsFor('lower-third')[0].create({});
    const { doc } = createGraphic(tpl, { name: 'Anchor Strap' });
    const show = shows.createShowNamed('Controller Show');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id)!;
    // Two cues on the one graphic: Anna, then Ben (the classic lower-third rundown).
    const cue1 = fresh0.cues![0];
    shows.updateShowCue(show.id, cue1.id, { label: 'Anna', values: { f0: 'Anna Andersson' } });
    shows.addShowCue(show.id, fresh0.graphics[0].id, { label: 'Ben', values: { f0: 'Ben Bergman' } });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
      files.set(n.replace(/^controller_show\//, ''), await zip.file(n)!.async('string'));
    }
  }
  expect([...files.keys()]).toContain('controller.html');
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const graphicFile = manifest.graphics[0].file;
  expect([...files.keys()]).toContain(graphicFile);

  const { serve } = relayServe(files);
  const origin = 'http://ctl-host.local';

  // The "OBS side": the graphic addressed as a PROGRAM stream source — managed, so it must
  // NOT autoplay; it waits for the log.
  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${graphicFile}?stream=program`, { waitUntil: 'load' });
  await air.waitForTimeout(600);
  expect(await air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

  // The controller.
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');
  await expect(ctl.locator('.cue')).toHaveCount(2);

  // → Preview: the PVW monitor's copy plays with Anna; AIR stays dark.
  await ctl.locator('.cue', { hasText: 'Anna' }).click();
  await ctl.locator('#v-preview').click();
  const pvwFrame = ctl.frameLocator('#stage-pvw iframe');
  await expect(pvwFrame.locator('#f0')).toHaveText('Anna Andersson', { timeout: 6000 });
  await expect
    .poll(async () => pvwFrame.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(ctl.locator('.cue', { hasText: 'Anna' })).toHaveClass(/on-pvw/);
  expect(await air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

  // ⟳ Take: the program source plays with Anna; the cue wears the red tally; the PGM
  // monitor mirrors air.
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f0')).toHaveText('Anna Andersson', { timeout: 6000 });
  await expect
    .poll(async () => air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(ctl.locator('.cue', { hasText: 'Anna' })).toHaveClass(/on-air/);
  const pgmFrame = ctl.frameLocator('#stage-pgm iframe');
  await expect(pgmFrame.locator('#f0')).toHaveText('Anna Andersson', { timeout: 6000 });

  // Taking Ben on the same graphic REPLACES the layer (same instance, new data).
  await ctl.locator('.cue', { hasText: 'Ben' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f0')).toHaveText('Ben Bergman', { timeout: 6000 });
  await expect(ctl.locator('.cue', { hasText: 'Ben' })).toHaveClass(/on-air/);

  // The dashboard's shared vocabulary reached the exported page too
  // (docs/PLAYOUT_DASHBOARD.md §5): every cue row states the LAYER its graphic airs on, and the
  // rundown is the only list — there is no separate layer panel on any of the three surfaces.
  await expect(ctl.locator('.cue').first().locator('.sub')).toContainText(/^L\d+ · /);
  await expect(ctl.locator('.cue').first().locator('.lay')).toHaveText(/^L\d+$/);
  // Distinct layers here, so no row wears the clash colour — and the rail's foot, which used to
  // hold the layer panel, is gone entirely.
  await expect(ctl.locator('.cue .lay.clash')).toHaveCount(0);
  await expect(ctl.locator('.rail-foot')).toHaveCount(0);

  // SPACE is Take here as well — and never while a field has focus, which is the guard that
  // matters: the cue's fields are on this same surface.
  //
  // The guard is checked by what the SPACE DID, not by what did not change: "the other cue is
  // still on air" passes on its first poll, before a broken guard's take could possibly have
  // landed, so it proves nothing (it passed with the guard deleted). A space that reaches the
  // input cannot race — a broken guard calls preventDefault and the character never arrives.
  await ctl.locator('.cue', { hasText: 'Anna' }).click();
  const field = ctl.locator('.field input').first();
  await field.click();
  await field.fill('Anna');
  await ctl.keyboard.press('Space');
  await ctl.keyboard.type('A');
  await expect(field).toHaveValue('Anna A');

  // Focus off the fields: now SPACE takes the selected cue.
  await ctl.locator('.verbs').click({ position: { x: 5, y: 5 } });
  await ctl.keyboard.press('Space');
  await expect(ctl.locator('.cue', { hasText: 'Anna' })).toHaveClass(/on-air/);

  // ■■ All out clears air.
  await ctl.locator('#v-allout').click();
  await expect
    .poll(async () => air.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity), { timeout: 6000 })
    .toBe('0');
  await expect(ctl.locator('#live-line')).toContainText('nothing on air');

  await ctl.close();
  await air.close();
});

// ── BOOT RECOVERY over the relay (docs/CLOUD_PLAYOUT.md's recovery discipline, local half) ──
// A browser source reloads: OBS restarts, a machine wakes, someone refreshes the wrong window.
// The graphic used to boot at the log HEAD and come back BLANK - off air, every field at the
// design's own defaults - and stay that way until an operator happened to press something.
// Measured before the fix on this exact walk: a board aired at 89 with its clock at 9:55 came
// back invisible, reading 88 and 10:00, with nine rows sitting unread in the log.
//
// The log IS the history, so the fix is a BOUNDED replay rather than a new report channel:
// start at the last `play` for this graphic and stream, run it off air, settle, come back.

/**
 * A relay that can be made to LOSE a request, so a spec can drop one on purpose. `drop` is
 * asked for every request the source makes and answers with the path to fail, which is the
 * one thing a busy machine and a relay that has not started yet do to a fetch.
 */
function dropping(serve: (r: Route) => unknown, drop: () => string | null) {
  return (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    return path === drop() ? route.abort('failed') : serve(route);
  };
}

/** Build the Cup Tie package once and serve it over an in-spec relay. */
async function cupTiePackage(page: Page, context: BrowserContext, origin: string, drop?: () => string | null) {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantById('sb09')!.create({});      // House Match Board: 88-84, clock from 10:00
    const { doc } = createGraphic(tpl, { name: 'House Match Board' });
    const show = shows.createShowNamed('Cup Tie');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, fresh0.cues![0].id, { label: 'Kick-off' });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    return (await buildShowZipFor(fresh, 'html-overlay')).generateAsync({ type: 'base64' });
  });
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
  }
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const { serve, rows } = relayServe(files);
  const air = await context.newPage();
  await routeOrigin(air, origin, drop ? dropping(serve, drop) : serve);
  await air.goto(`${origin}/${manifest.graphics[0].file}?stream=program`, { waitUntil: 'load' });
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');
  return { air, ctl, rows };
}

/** What the reloaded source is showing: whether it is on air, and the two live values. */
const airState = (air: Page) =>
  air.evaluate(() => ({
    opacity: getComputedStyle(document.documentElement).opacity,
    score: document.querySelector('#f1')?.textContent ?? null,
    clock: document.querySelector('#f5')?.textContent ?? null,
  }));

test('a relay browser source reloaded mid-show comes back on air, with the score and the real match time', async ({ page, context }) => {
  test.setTimeout(180_000);
  const { air, ctl } = await cupTiePackage(page, context, 'http://relay-recover.local');

  // A show happens: the board airs, a goal is bumped on air, the clock starts.
  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f5')).toHaveText('10:00', { timeout: 10_000 });
  await ctl.locator('.field', { hasText: /^F1 · / }).locator('button.step', { hasText: '+' }).click();
  await expect(air.locator('#f1')).toHaveText('89', { timeout: 10_000 });
  await ctl.locator('#editor-events').getByRole('button', { name: '⚡ Start clock' }).click();
  await expect(air.locator('#f5')).toHaveText('9:55', { timeout: 20_000 });

  // THE RELOAD - and nothing else. No operator touches anything after this point.
  const at = Date.now();
  await air.reload({ waitUntil: 'load' });
  // The receiver HIDES the page only once its relay fetch has answered, so right after `load`
  // the root still reads opacity 1 over the design's own defaults (88, 10:00) - a poll on the
  // opacity alone passed at once and read the pre-replay picture whenever the fetch was slower
  // than the first sample (measured under a busy machine). Wait for the RECOVERED value, which
  // is the thing under test, then for the page to be back on air.
  await expect
    .poll(() => airState(air).then((s) => s.score), { timeout: 15_000, message: 'the goal must survive the reload' })
    .toBe('89');
  await expect.poll(() => airState(air).then((s) => s.opacity), { timeout: 15_000 }).toBe('1');
  const back = await airState(air);

  expect(back.score, 'the goal must survive the reload').toBe('89');
  // The clock kept running: it reads later than it did before the reload, by about the wall
  // time that passed. Asserting a fixed string here would be asserting the clock had STOPPED.
  const elapsed = (Date.now() - at) / 1000;
  const behind = (t: string) => 10 * 60 - ((parseInt(t.split(':')[0], 10) || 0) * 60 + (parseInt(t.split(':')[1], 10) || 0));
  expect(behind(back.clock!)).toBeGreaterThanOrEqual(5);          // never back at the 10:00 seed
  expect(behind(back.clock!)).toBeLessThanOrEqual(5 + elapsed + 2);

  await ctl.close();
  await air.close();
});

test('a reloaded browser source reads the log from where it left off, not from row 0', async ({ page, context }) => {
  test.setTimeout(180_000);
  // THE REPLAY was bounded by the last play; the READ under it was not. Recovery fetched the log
  // from ROW 0 every time - and relay-log.jsonl is appended to and never rotated, so row 0 is not
  // this show, it is every show this package has ever run, up to 20,000 rows at 500 a fetch
  // before the graphic may paint. The hosted plane never pays that: a renderer starts from its
  // own last report. The local half now keeps the same kind of baseline itself, on the relay's
  // origin, and reads from the play it names.
  const origin = 'http://relay-bound.local';
  const { air, ctl, rows } = await cupTiePackage(page, context, origin);

  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f5')).toHaveText('10:00', { timeout: 10_000 });
  await ctl.locator('.field', { hasText: /^F1 · / }).locator('button.step', { hasText: '+' }).click();
  await expect(air.locator('#f1')).toHaveText('89', { timeout: 10_000 });

  // The baseline is written on a debounce after the rows land, and it is a PERSISTED format, so
  // its shape is pinned here rather than only implied by the behaviour below.
  const readBaseline = () =>
    air.evaluate(() => localStorage.getItem('noacg.relay.baseline.House Match Board.program'));
  // Wait for the baseline to have CAUGHT UP WITH THE BUMP, not merely to exist. It is written on
  // a debounce and the boot itself writes one, so "the key is there" is true well before the goal
  // is in it - which is a 88-vs-89 flake that passed on this laptop and failed in CI.
  await expect
    .poll(async () => JSON.parse((await readBaseline()) ?? '{}').data?.f1 ?? null, {
      timeout: 15_000,
      message: 'the bumped score must reach the merged half of the baseline',
    })
    .toBe('89');
  const baseline = JSON.parse((await readBaseline())!) as {
    v: number;
    from: number;
    cursor: number;
    data: Record<string, string>;
  };
  expect(baseline.v).toBe(1);

  // Which row the airing began at - the log itself, read the way the receiver reads it.
  const play = rows.filter((r) => r.graphic === 'House Match Board' && r.stream === 'program' && (r.msg as { t: string }).t === 'play').pop();
  expect(play, 'the take must have put a play row on the wire').toBeTruthy();
  expect(baseline.from).toBe(play!.id);

  // Watch what the reloaded source actually asks for. A route added later wins, and falls back
  // to the relay underneath it, so this observes without replacing anything.
  //
  // ONLY THE RELOADED DOCUMENT'S READS COUNT, and telling them apart is the whole difficulty: the
  // page still on screen is a live receiver polling every 400 ms with its OWN cursor, so a poll
  // that slipped between this route and the navigation used to be recorded as if it were the boot
  // read - measured at 7 where the boot asks for 4, which is exactly what reddened CI on
  // 2026-08-25 and then passed on a re-run of the same commit. Waiting it out cannot fix it; the
  // window never closes, it only narrows. The receiver's own boot ORDER separates them with no
  // timing left to lose: /relay/ping is sent once, by probe(), at the top of a fresh document and
  // never again, so the first ping this route sees IS the reload, and every log read after it
  // belongs to the new document.
  const reads: number[] = [];
  let rebooted = false;
  await air.route(`${origin}/relay/*`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/relay/ping') rebooted = true;
    else if (rebooted && url.pathname === '/relay/log') reads.push(Number(url.searchParams.get('after') ?? '0'));
    return route.fallback();
  });
  // Let the LIVE page poll through the recorder before the reload, so the separation above is
  // exercised rather than merely written down: without it this spec passes even with the filter
  // deleted, and the flake it was written for comes straight back.
  await air.waitForTimeout(600);

  await air.reload({ waitUntil: 'load' });
  await expect
    .poll(() => airState(air).then((s) => s.score), { timeout: 20_000, message: 'the bound must not cost the recovery' })
    .toBe('89');
  await expect.poll(() => airState(air).then((s) => s.opacity), { timeout: 15_000 }).toBe('1');

  // THE BOUND: the boot read starts one row before the play, so the airing comes back in full
  // and nothing older than it is fetched at all. Row 0 - the old behaviour - would be a 0 here.
  expect(reads.length, 'the reloaded source must have read the log').toBeGreaterThan(0);
  expect(reads[0]).toBe(play!.id - 1);

  await ctl.close();
  await air.close();
});

test('a baseline that describes a log which no longer exists is thrown away, not trusted', async ({ page, context }) => {
  test.setTimeout(180_000);
  // THE BOUND IS A CACHE, and a cache needs to know when it is stale. Row numbers alone cannot
  // say: a relay whose relay-log.jsonl was deleted starts counting from 1 again, and once the
  // new show passes the old cursor the saved numbers look perfectly plausible while meaning
  // different rows. So the read starts one row BEFORE the airing's play precisely so that row
  // comes back and can be checked - and when it is not that play, the baseline is dropped and
  // the old full walk runs.
  const origin = 'http://relay-reset.local';
  const { air, ctl, rows } = await cupTiePackage(page, context, origin);

  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f5')).toHaveText('10:00', { timeout: 10_000 });

  // Wait for the baseline to name the AIRING, not merely to exist: the boot writes one of its own
  // with nothing on air, and reading `from` out of that one measures the wrong moment.
  const key = 'noacg.relay.baseline.House Match Board.program';
  const read = () => air.evaluate((k) => localStorage.getItem(k), key);
  await expect
    .poll(async () => (JSON.parse((await read()) ?? '{}').from as number | undefined) ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const from = JSON.parse((await read())!).from as number;
  // The whole point of the test is that a DIFFERENT row sits at that number in the new log.
  expect(from, 'the airing must not begin at the very first row').toBeGreaterThan(1);

  // The log is replaced: same relay, same head, brand-new numbering. This graphic aired at row
  // 1 in it and its score is 3 - and row `from` now belongs to somebody else entirely.
  const fresh = [
    { id: 1, graphic: 'House Match Board', stream: 'program', msg: { t: 'play' } },
    { id: 2, graphic: 'House Match Board', stream: 'program', msg: { t: 'update', data: { f1: '3' } } },
  ];
  for (let id = 3; id <= from + 1; id += 1) {
    fresh.push({ id, graphic: 'Other Board', stream: 'program', msg: { t: 'update', data: { f0: 'x' } } });
  }
  rows.length = 0;
  rows.push(...fresh);

  await air.reload({ waitUntil: 'load' });

  // The full walk finds the play at row 1 and the score after it, so the board comes back ON AIR
  // reading 3. Trusting the stale baseline would start at row `from`, find no play at all, and
  // leave a live board dark while its fields quietly updated underneath.
  await expect(air.locator('.scoreboard')).toHaveCSS('opacity', '1', { timeout: 20_000 });
  await expect(air.locator('#f1')).toHaveText('3', { timeout: 10_000 });

  await ctl.close();
  await air.close();
});

test('one lost relay request at boot does not cost the airing', async ({ page, context }) => {
  test.setTimeout(180_000);
  // RECOVERY READS THE LOG ONCE, so every fetch on the way in is the only chance it gets - and
  // both of them used to treat a failure as an ANSWER. A log read that never returned was handed
  // on as a short log, and a short log says exactly what an empty one says: this graphic never
  // aired, leave it blank. A ping that never returned was read as "no relay on this origin",
  // which is the 404 a plain static host gives, and the block went quiet for good.
  //
  // Neither is exotic. A busy machine loses a fetch; a student's OBS scene loads its browser
  // source before they double-click the relay launcher, so the FIRST ping is answered by
  // nobody. Measured against the old code, one dropped request either way brought a board that
  // was live at 89 back at 88 and off air - and it stayed there through eight seconds of a
  // relay that was by then perfectly healthy. The test is that walk, twice, one request dropped.
  let lose: string | null = null;
  const { air, ctl } = await cupTiePackage(page, context, 'http://relay-lossy.local', () => lose);

  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f5')).toHaveText('10:00', { timeout: 10_000 });
  await ctl.locator('.field', { hasText: /^F1 · / }).locator('button.step', { hasText: '+' }).click();
  await expect(air.locator('#f1')).toHaveText('89', { timeout: 10_000 });

  // THE LOG READ IS LOST. The relay answers the probe, then fails the read the recovery
  // depends on - and is healthy again a second and a half later, which the retry must find.
  lose = '/relay/log';
  await air.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1_500);
  lose = null;
  await expect
    .poll(() => airState(air).then((s) => s.score), { timeout: 20_000, message: 'a lost log read must not lose the airing' })
    .toBe('89');
  await expect.poll(() => airState(air).then((s) => s.opacity), { timeout: 15_000 }).toBe('1');

  // THE PROBE IS LOST - the relay is not answering at all when the source loads, the way it is
  // not answering before the launcher has been double-clicked. The source must join late, not
  // give up: nothing else will ever tell it the relay arrived.
  lose = '/relay/ping';
  await air.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1_500);
  lose = null;
  await expect
    .poll(() => airState(air).then((s) => s.score), { timeout: 20_000, message: 'a source that loaded before the relay answered must still join' })
    .toBe('89');
  await expect.poll(() => airState(air).then((s) => s.opacity), { timeout: 15_000 }).toBe('1');

  await ctl.close();
  await air.close();
});

test('relay recovery is never watchable, and a graphic that was never on air stays off', async ({ page, context }) => {
  test.setTimeout(180_000);
  const { air, ctl } = await cupTiePackage(page, context, 'http://relay-quiet.local');

  // NOTHING has aired yet. A reload here must recover NOTHING - a graphic that was never
  // played is supposed to be blank, and replaying a show nobody started is worse than blank.
  await air.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3_000);
  expect((await airState(air)).opacity).toBe('1');       // not left hidden by a replay that never ran
  await expect(air.locator('.scoreboard')).toHaveCSS('opacity', '0');

  // Now air it, then take it OFF air, then reload: still blank, because that is the picture
  // the log describes. Recovery restores what was on, never what once was.
  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f5')).toHaveText('10:00', { timeout: 10_000 });
  // The take button IS the off switch once its cue is live - the controller relabels it.
  await expect(ctl.locator('#v-take')).toContainText('TAKE OFF', { timeout: 10_000 });
  await ctl.locator('#v-take').click();
  await expect(air.locator('.scoreboard')).toHaveCSS('opacity', '0', { timeout: 10_000 });

  await air.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3_000);
  await expect(air.locator('.scoreboard')).toHaveCSS('opacity', '0');
  expect((await airState(air)).opacity).toBe('1');

  await ctl.close();
  await air.close();
});

test('a scorebug over the relay: the stepper bumps the score on air, and the clock verbs run it', async ({ page, context }) => {
  test.setTimeout(180_000);
  // THE OFFLINE HALF of Phase 4's end-to-end proof. Everything above drives a lower third,
  // whose whole behaviour is "show these words" - a scoreboard is the first exported graphic
  // that has to keep RUNNING after the take, so this covers the two things that make it one:
  // a score bumped from the controller's stepper, and the clock verbs actually starting and
  // holding a clock inside the aired overlay. No Supabase, no hosted log - the bundled local
  // relay, which is what a student running the exported package on one machine actually uses.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    // sb05 - the house scorebug: counts UP from 0:00, so a running clock is visibly moving
    // rather than merely being reported as running.
    const tpl = variantById('sb05').create({});
    const { doc } = createGraphic(tpl, { name: 'House Scorebug' });
    const show = shows.createShowNamed('Match Night');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id);
    shows.updateShowCue(show.id, fresh0.cues[0].id, {
      label: 'Kick off',
      values: { f0: 'ASHTON', f1: '0', f2: 'MARSKE', f3: '0', f4: '1H' },
    });
    const fresh = shows.loadShows().find((s) => s.id === show.id);
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    // Strip whatever folder the production's own name produced, rather than one hard-coded
    // slug - the package is named after the show.
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
      files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
    }
  }
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const graphicFile = manifest.graphics[0].file;

  const { serve } = relayServe(files);
  const origin = 'http://sport-host.local';

  // The OBS side: the overlay addressed as the program source. Managed, so it waits.
  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${graphicFile}?stream=program`, { waitUntil: 'load' });

  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await ctl.locator('.cue', { hasText: 'Kick off' }).click();
  // Off air the −/+ pair is greyed (docs/PLAYOUT_DASHBOARD.md §7c): it acts on air, so before
  // the take there is nothing for it to act on, and it says so rather than staging in silence.
  await expect(ctl.locator('.field', { hasText: 'Score A' }).locator('button.step').first()).toBeDisabled();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f0')).toHaveText('ASHTON', { timeout: 10_000 });
  await expect.poll(async () => air.locator('.scoreboard').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

  // The bump below ACTS ON AIR, so the precondition has to be stated rather than assumed: the
  // controller learns what is live from the LOG, on its own poll, and a press that lands before
  // that row arrives stages instead of airing - which looks exactly like a broken bump.
  await expect(ctl.locator('.cue', { hasText: 'Kick off' })).toHaveClass(/on-air/, { timeout: 10_000 });

  // THE SCORE, bumped rather than typed. The exported controller renders the number field as
  // −/value/+ (it is a third renderer and deliberately has no operator step-size box, unlike
  // the two React surfaces), so locate the row by its label and press +.
  const scoreRow = ctl.locator('.field', { hasText: 'Score A' });
  const plus = scoreRow.locator('button.step', { hasText: '+' });
  await plus.click();
  // A goal on the LIVE cue airs on the press: this is the ± LIVE NUMBERS bump
  // (docs/PLAYOUT_DASHBOARD.md §7c), the one data write that does not wait for a verb, and it
  // travels as a partial carrying that field alone. The cue keeps the new value in step, so a
  // later ⟳ Take or ✎ Update cannot regress the score. The payload SHAPE is pinned in
  // production-controls.spec.ts; here the point is that the aired board really moved.
  await expect(scoreRow.locator('input[type="number"]')).toHaveValue('1');
  await expect(air.locator('#f1')).toHaveText('1', { timeout: 10_000 });
  await plus.click();
  await expect(air.locator('#f1')).toHaveText('2', { timeout: 10_000 });
  // ✎ Update pushes the whole cue to the live graphic without re-animating the board - the
  // deliberate other half, and it agrees with the bumps rather than undoing them.
  await ctl.locator('#v-update').click();
  await expect(air.locator('#f1')).toHaveText('2', { timeout: 10_000 });

  // THE CLOCK. Its whole point is that it keeps moving with nobody touching it, so the only
  // honest assertion is two reads separated by real seconds - a single frame proves nothing.
  const clockNow = () => air.locator('.scoreboard-clock').textContent();
  await ctl.locator('#editor-events').getByRole('button', { name: '⚡ Start clock' }).click();
  const started = await clockNow();
  await expect.poll(async () => (await clockNow()) !== started, { timeout: 15_000 }).toBe(true);

  // Held is the other half, and the one an operator notices when it is wrong: after Stop the
  // value must be the SAME across two reads several seconds apart.
  await ctl.locator('#editor-events').getByRole('button', { name: '⚡ Stop clock' }).click();
  await air.waitForTimeout(1200);            // let any in-flight tick land before sampling
  const held = await clockNow();
  await air.waitForTimeout(2500);
  expect(await clockNow()).toBe(held);

  // Reset returns to the design's own period start, which is what makes a second half one
  // press - and it is 0:00 here because this design counts up from there.
  await ctl.locator('#editor-events').getByRole('button', { name: '⚡ Reset to period start' }).click();
  await expect.poll(async () => clockNow(), { timeout: 10_000 }).toBe('0:00');
  // The score is DATA and no clock verb touches it: it survived all three.
  await expect(air.locator('#f1')).toHaveText('2');

  await ctl.close();
  await air.close();
});
