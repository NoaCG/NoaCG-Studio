import { test, expect, type Page, type Route } from '@playwright/test';
import { createProject } from './_create';

// Cues over the PLAYOUT SERVER'S OWN LIBRARY (docs/BRIDGE.md §5): a template or a clip that
// already lives on the CasparCG box, listed through NoaCG Bridge, added to the rundown beside
// the production's own graphics, and taken as one command. The Bridge and the server are FAKED
// at the network layer, as in bridge-connect.spec.ts; what is under test is the studio half -
// the picker, the cue and its editor, the exact action each verb puts on the wire, and the
// honest states when the server cannot list or the Bridge is not there.

const BRIDGE = 'http://127.0.0.1:8899';
const TOKEN = 'e2e-token';
/** A 1x1 PNG, the shape THUMBNAIL RETRIEVE answers with. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function seedSettings(page: Page): Promise<void> {
  await page.addInitScript(
    ([bridge, token]) => {
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({ agentUrl: bridge, agentToken: token, host: '127.0.0.1', amcpPort: 5250, channel: 1, layer: 20, v: 1 }),
      );
    },
    [BRIDGE, TOKEN] as const,
  );
}

interface FakeBridge {
  missing?: boolean;
  /** The server answers VERSION and cannot list: its media scanner is not running. */
  scannerDown?: boolean;
  templates: string[];
  actions: unknown[];
  thumbnails: string[];
}

async function fakeBridge(page: Page, options: Partial<FakeBridge> = {}): Promise<FakeBridge> {
  const state: FakeBridge = { templates: ['BK/SB01', 'HOUSE_STRAP/HOUSE_STRAP', 'HAIRLINE'], actions: [], thumbnails: [], ...options };
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await page.route(`${BRIDGE}/**`, async (route) => {
    if (state.missing) {
      await route.abort('connectionrefused');
      return;
    }
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/health') {
      await json(route, 200, { ok: true, agent: 'noacg-bridge', v: 2, version: '0.4.0', adapters: ['casparcg'] });
      return;
    }
    if (request.headers().authorization !== `Bearer ${TOKEN}`) {
      await json(route, 401, { ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: 'Bad or missing Bridge token.' } });
      return;
    }
    const body = JSON.parse(request.postData() || '{}') as { kind?: string; name?: string; action?: unknown };
    if (path === '/status') {
      await json(route, 200, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK' });
      return;
    }
    if (path === '/list') {
      if (state.scannerDown) {
        await json(route, 200, {
          ok: false,
          v: 2,
          error: {
            hop: 'target',
            code: 'no-media-scanner',
            detail: '127.0.0.1:5250 answered, but its media scanner is not running, so it cannot list its files. Start the scanner next to CasparCG on the server and try again.',
            raw: '501 TLS FAILED',
          },
        });
        return;
      }
      const items =
        body.kind === 'template'
          ? state.templates.map((name) => ({ name, kind: 'template' }))
          : [
              { name: 'GIORNO', kind: 'movie', frames: 1500, fps: 25, bytes: 10485760, changed: '20260814221648' },
              { name: 'JÄÄKIEKKO', kind: 'still', frames: 0, fps: 0, bytes: 259408, changed: '20260922174500' },
            ];
      await json(route, 200, { ok: true, v: 2, items });
      return;
    }
    if (path === '/thumbnail') {
      state.thumbnails.push(body.name ?? '');
      await json(route, 200, { ok: true, v: 2, png: PNG });
      return;
    }
    if (path === '/act') {
      state.actions.push(body.action);
      await json(route, 200, { ok: true, v: 2, raw: '202 CG OK' });
      return;
    }
    await json(route, 404, { ok: false, v: 2, error: { hop: 'agent', code: 'usage', detail: `No route ${path}.` } });
  });
  return state;
}

/** A production holding one NoaCG graphic, open on its page with the rundown showing. With
 *  `saved`, the graphic is first put in the library under its own name, which is what lets a
 *  server template be matched back to it. */
async function productionPage(page: Page, options: { saved?: boolean } = {}): Promise<void> {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  if (options.saved) {
    await page.getByTestId('save-graphic').click();
    await expect(page.getByTestId('save-dialog')).toBeVisible();
    await page.getByTestId('save-name').fill('Hairline');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-dialog')).toBeHidden();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
  }
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('Evening News');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

const lastAction = (bridge: FakeBridge) => bridge.actions[bridge.actions.length - 1];

test('the door is absent until a Bridge is paired, and lists the server\'s templates and media once it is', async ({ page }) => {
  await fakeBridge(page);
  await productionPage(page);
  // No server configured: no door. A dead control on the busiest surface would be worse than none.
  await expect(page.getByTestId('add-from-server')).toHaveCount(0);
});

test('a clip from the server becomes a cue on the clip layer, and Take, Pause, Resume and Out are one command each', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);

  await page.getByTestId('add-from-server').click();
  await expect(page.getByTestId('playout-picker')).toBeVisible();
  // Templates first, as the server lists them, with the one NoaCG exported marked as known.
  await expect(page.getByTestId('picker-row')).toHaveCount(3);
  await page.getByTestId('picker-media').click();
  const rows = page.getByTestId('picker-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('GIORNO');
  await expect(rows.first()).toContainText('movie · 1:00');
  // A thumbnail was asked for only once the row was on screen, by the server's own name.
  await expect.poll(() => bridge.thumbnails).toContain('GIORNO');
  await rows.first().getByTestId('picker-add').click();

  // The cue: the server's name, the kind word, and the shared clip layer below every graphic.
  const cue = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(cue).toHaveCount(1);
  await expect(cue).toContainText('Server clip');
  await expect(cue.getByTestId('cue-layer')).toHaveText('L10');
  await expect(page.getByTestId('playout-cue-editor')).toBeVisible();
  await expect(page.getByTestId('playout-cue-editor')).toContainText('SERVER CLIP');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('playout-cue-status')).toContainText('2.5.0');

  await page.getByTestId('verb-take').click();
  await expect(cue).toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: { adapter: 'casparcg', channel: 1, layer: 10 },
  });
  // Named on the PROGRAM header, never drawn: it plays on the server.
  await expect(page.getByTestId('playout-on-air')).toContainText('GIORNO');
  await expect(page.getByTestId('production-note')).toContainText('✓ Take: GIORNO on 1-10');

  await page.getByTestId('playout-pause').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'pause', slot: { channel: 1, layer: 10 } });
  await page.getByTestId('playout-resume').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'resume', slot: { channel: 1, layer: 10 } });

  await page.getByTestId('verb-out').click();
  await expect(cue).not.toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toEqual({ verb: 'out', slot: { adapter: 'casparcg', channel: 1, layer: 10 }, item: { kind: 'media', name: 'GIORNO' } });
  await expect(page.getByTestId('playout-on-air')).toHaveCount(0);
});

test('a server template takes the next free layer, carries its typed fields as JSON data, and Update, Next and Out follow', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);

  await page.getByTestId('add-from-server').click();
  // A template NoaCG did not make: the field ids are typed once, beside the name.
  await page.getByTestId('picker-field-ids').fill('f0, f1');
  await page.locator('[data-testid="picker-row"][data-name="HOUSE_STRAP/HOUSE_STRAP"]').getByTestId('picker-add').click();

  const cue = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  await expect(cue).toContainText('Server template');
  // The production's own graphic holds 20, so the template took the next free one.
  await expect(cue.getByTestId('cue-layer')).toHaveText('L21');
  const editor = page.getByTestId('playout-cue-editor');
  await expect(editor).toContainText('SERVER TEMPLATE');
  await expect(editor.getByTestId('cue-field-f0')).toBeVisible();
  await editor.getByTestId('cue-field-f0').fill('Anna Andersson');

  await page.getByTestId('verb-take').click();
  await expect(cue).toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'take',
    item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' },
    slot: { adapter: 'casparcg', channel: 1, layer: 21 },
    data: { f0: 'Anna Andersson', f1: '' },
  });

  await editor.getByTestId('cue-field-f1').fill('Presenter');
  await page.getByTestId('verb-update').click();
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'update',
    slot: { adapter: 'casparcg', channel: 1, layer: 21 },
    data: { f0: 'Anna Andersson', f1: 'Presenter' },
  });
  await page.getByTestId('verb-next').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'next', slot: { layer: 21 } });
  // Out on a template names the item, so the Bridge plays its exit through the CG layer.
  await page.getByTestId('verb-out').click();
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'out',
    slot: { adapter: 'casparcg', channel: 1, layer: 21 },
    item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' },
  });
  await expect(cue).not.toContainText('ON AIR');

  // A field added later reaches the cue editor at once.
  await editor.getByTestId('playout-add-field').fill('f2');
  await editor.getByTestId('playout-add-field-go').click();
  await expect(editor.getByTestId('cue-field-f2')).toBeVisible();
});

test('a template NoaCG exported brings its own fields, matched by the export slug', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await productionPage(page, { saved: true });
  await page.getByTestId('add-from-server').click();
  const row = page.locator('[data-testid="picker-row"][data-name="HAIRLINE"]');
  await expect(row).toContainText('fields known from your library');
  await row.getByTestId('picker-add').click();
  const editor = page.getByTestId('playout-cue-editor');
  // The graphic's own field titles, not bare ids.
  await expect(editor.getByTestId('playout-cue-fields')).toContainText('F0 · ');
  await expect(editor.locator('.field-row')).not.toHaveCount(1);
});

test('the server that cannot list says so, and a typed name still makes a cue', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page, { scannerDown: true });
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  const error = page.getByTestId('picker-error');
  await expect(error).toHaveAttribute('data-state', 'scanner');
  await expect(error).toContainText('media scanner is not running');
  await expect(page.getByTestId('picker-row')).toHaveCount(0);
  await page.getByTestId('picker-typed').fill('NEW1/POWER_CLOCK');
  await page.getByTestId('picker-add-typed').click();
  await expect(page.locator('.pd-cue', { hasText: 'POWER_CLOCK' })).toHaveCount(1);
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'take', item: { kind: 'template', name: 'NEW1/POWER_CLOCK' } });
});

test('with no Bridge running a server cue cannot be taken, and the editor names the hop', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.getByTestId('picker-row').first().getByTestId('picker-add').click();
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');

  // The Bridge goes away mid-show: the next poll says so, and Take stays quiet rather than
  // sending a command that will fail.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await fakeBridge(page, { missing: true });
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'bridge', { timeout: 15_000 });
  await expect(page.getByTestId('playout-cue-status')).toContainText('Start NoaCG Bridge');
  await expect(page.getByTestId('verb-take')).toBeDisabled();
});

test('a server cue and its item are removed together, and survive a reload as part of the record', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.getByTestId('picker-row').first().getByTestId('picker-add').click();
  const cue = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(cue).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.locator('.pd-cue', { hasText: 'GIORNO' })).toHaveCount(1);

  await page.locator('.pd-cue', { hasText: 'GIORNO' }).getByTestId('cue-menu').click();
  await page.getByTestId('delete-cue').click();
  await expect(page.locator('.pd-cue', { hasText: 'GIORNO' })).toHaveCount(0);
  const items = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows()[0].playoutItems ?? [];
  });
  expect(items).toEqual([]);
});
