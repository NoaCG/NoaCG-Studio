// covers: src/components/HostedControlPage.tsx, src/{model/shows,control/hostedControl}.ts
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer}.tsx
// covers: src/components/{editorFoundation/EditorFoundation,save/{SaveControls,SaveDialogs}}.tsx
// focus
//
// NOACG BRIDGE (docs/BRIDGE.md). The browser half is one file, and the two surfaces it grows are
// already mapped elsewhere for their own reasons - SettingsDialog to analytics/auth, ProductionPage
// into the productions set - so those rules are UNION'd with this one rather than replaced. Without
// this line a change to the link contract would run specs that pin the panels' other contents and
// never the four diagnosis states, which are the whole point of the feature. The channel table and
// the per-cue slot helpers live in playoutLink.ts too, and the rundown is what reads them.
// serverPlayout.ts (with its store and playoutSlots.ts) is what every server verb and every row
// address goes through, and the baselines draw both.
// covers: src/control/{playoutLink,playoutProtocol,serverPlayout,serverPlayoutStore,playoutSlots}.ts
//
// ProductionLinks.tsx is where BridgeAirRow itself lives since the 2026-08-28 split, so it is named
// here rather than left to the `src/components/{home,save}/**` covers line: that rule's set does
// not include this spec, and the ONE button is the whole browser half of the feature.
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer,ProductionLinks}.tsx
//
// Cues over the playout server's library (docs/BRIDGE.md §5): the picker, the cue editor and
// the published payload's playout cues on the hosted page.
// covers: src/components/home/PlayoutItemPicker.tsx
//
// A clip's settings (docs/CLIP_PLAYBACK_PLAN.md phase 3): At the end, fades, level and trim, each as
// it goes out with the Take, the loop rule of the record, audio on its own layer, and a cue a Bridge
// or server cannot honour kept off air with the reason.
// covers: src/control/cuePlayback.ts

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent, openWorkingGraphicInEditor } from './_create';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';
import { parkFocusOffControls } from './_keys';

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

/** A paired studio. Without `patch` it is a record from before channels had names - one
 *  channel, no table - which is what every studio saved before 2026-09-23 holds. */
async function seedSettings(page: Page, patch: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([bridge, token, extra]) => {
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({ agentUrl: bridge, agentToken: token, host: '127.0.0.1', amcpPort: 5250, channel: 1, layer: 20, v: 1, ...extra }),
      );
    },
    [BRIDGE, TOKEN, patch] as const,
  );
}

/** The studio a real broadcast runs: graphics on channel 1, video inserts on channel 2. */
const TWO_CHANNELS = {
  channels: [
    { channel: 1, name: 'Graphics' },
    { channel: 2, name: 'Inserts' },
  ],
  clipChannel: 2,
};

interface FakeBridge {
  missing?: boolean;
  /** The server answers VERSION and cannot list: its media scanner is not running. */
  scannerDown?: boolean;
  /** The server refuses a TAKE onto this channel, the way a channel missing from its config does. */
  refuseTakeOnChannel?: number;
  templates: string[];
  /** What CLS lists; the default is one movie and one still at the top of the media folder. */
  media?: { name: string; kind: string; frames?: number; fps?: number }[];
  /** What `/health` says this Bridge understands; absent is a 0.4 Bridge, which lists nothing. */
  features?: string[];
  /** What `/status` says the server can do; absent is a 0.4 Bridge's answer. */
  capabilities?: string[];
  /** What the server's VERSION answers. */
  serverVersion?: string;
  /** Every action as sent, WITHOUT a take's `cueId`: the envelope each verb has always sent. */
  actions: unknown[];
  /** The cue id each take named, in order (docs/CLIP_PLAYBACK_PLAN.md §6.7), kept apart so the
   *  envelopes above stay pinned exactly as they were. */
  cueIds: string[];
  thumbnails: string[];
}

async function fakeBridge(page: Page, options: Partial<FakeBridge> = {}): Promise<FakeBridge> {
  const state: FakeBridge = { templates: ['BK/SB01', 'HOUSE_STRAP/HOUSE_STRAP', 'HAIRLINE'], actions: [], cueIds: [], thumbnails: [], ...options };
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
      await json(route, 200, {
        ok: true,
        agent: 'noacg-bridge',
        v: 2,
        version: state.features ? '0.5.0' : '0.4.0',
        adapters: ['casparcg'],
        ...(state.features ? { features: state.features } : {}),
      });
      return;
    }
    if (request.headers().authorization !== `Bearer ${TOKEN}`) {
      await json(route, 401, { ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: 'Bad or missing Bridge token.' } });
      return;
    }
    const body = JSON.parse(request.postData() || '{}') as { kind?: string; name?: string; action?: unknown };
    if (path === '/status') {
      await json(route, 200, {
        ok: true,
        v: 2,
        version: state.serverVersion ?? '2.5.0 69e8ad5 Stable',
        raw: '201 VERSION OK',
        ...(state.capabilities ? { capabilities: state.capabilities } : {}),
      });
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
          : (state.media ?? [
              { name: 'GIORNO', kind: 'movie', frames: 1500, fps: 25, bytes: 10485760, changed: '20260814221648' },
              { name: 'JÄÄKIEKKO', kind: 'still', frames: 0, fps: 0, bytes: 259408, changed: '20260922174500' },
            ]);
      await json(route, 200, { ok: true, v: 2, items });
      return;
    }
    if (path === '/thumbnail') {
      state.thumbnails.push(body.name ?? '');
      await json(route, 200, { ok: true, v: 2, png: PNG });
      return;
    }
    if (path === '/act') {
      // What the real Bridge refuses, refused here too: an item must carry a name. The real
      // 2.5.0 walk of 2026-09-22 caught "Take off" sending an empty one that this fake had
      // waved through.
      const a = body.action as { item?: { name?: string } } | undefined;
      if (a && 'item' in a && !a.item?.name) {
        await json(route, 400, { ok: false, v: 2, error: { hop: 'agent', code: 'usage', detail: 'The item has no name.' } });
        return;
      }
    }
    if (path === '/act') {
      const { cueId, ...sent } = (body.action ?? {}) as { cueId?: string };
      state.actions.push(sent);
      if (cueId) state.cueIds.push(cueId);
      const act = body.action as { verb?: string; slot?: { channel?: number } } | undefined;
      if (act?.verb === 'take' && state.refuseTakeOnChannel !== undefined && act.slot?.channel === state.refuseTakeOnChannel) {
        await json(route, 200, {
          ok: false,
          v: 2,
          error: { hop: 'target', code: 'refused', detail: 'CasparCG refused the command: 401 CG ERROR. Check the channel and layer.', raw: '401 CG ERROR' },
        });
        return;
      }
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
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  if (options.saved) {
    // The save controls are in the new editor's header; Home, where the bootstrap lands, has none.
    await openWorkingGraphicInEditor(page);
    await page.getByTestId('save-graphic').click();
    await expect(page.getByTestId('save-dialog')).toBeVisible();
    await page.getByTestId('save-name').fill('Hairline');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-dialog')).toBeHidden();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
  }
  await openProductionWithCurrent(page, 'Evening News');
  // This suite operates CasparCG files. A paired studio alone does not opt a production in.
  await page.evaluate(async () => {
    const m = await import('/src/model/shows.ts');
    const show = m.loadShows().find(s => s.name === 'Evening News')!;
    m.setShowOutputSetup(show.id, { v: 1, destinations: [{ id: 'casparcg', profile: 'casparcg' }] });
    // The page re-renders behind this write: answer from a later task (openProductionWithCurrent).
    await new Promise((resolve) => setTimeout(resolve));
  });
  await settleDurableWrites(page);
}

const lastAction = (bridge: FakeBridge) => bridge.actions[bridge.actions.length - 1];

/** A Bridge from this build in front of a CasparCG 2.5: it plays every setting. It is asked for no
 *  `/state` here (no `state` feature), which this spec does not fake; the clock's specs do. */
const PLAYS_EVERYTHING: Partial<FakeBridge> = { features: ['playback', 'sequence', 'image-fit'], capabilities: ['end', 'fade', 'trim', 'level', 'sequence', 'image-fit'] };

/** Adding keeps the next question selected. Done, then choose a cue to edit or play it. */
async function selectAddedCue(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('picker-added')).toHaveText('Added 1 cue');
  await page.getByTestId('picker-done').click();
  await page.locator('.pd-cue', { hasText: name.split('/').pop()! }).last().getByTestId('select-cue').click();
}

/** A clip on the server, added from the picker and selected in the editor. */
async function addClip(page: Page, name = 'GIORNO'): Promise<void> {
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await (await pickerFile(page, name)).getByTestId('picker-add').click();
  await selectAddedCue(page, name);
  await expect(page.getByTestId('playout-cue-editor')).toBeVisible();
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
}

/** A file in the open picker by its FULL server name: step into each folder on its path, the
 *  way an operator browses, and return its row. */
async function pickerFile(page: Page, name: string) {
  const parts = name.split('/');
  for (const folder of parts.slice(0, -1)) {
    await page.locator(`[data-testid="picker-folder"][data-name="${folder}"]`).click();
  }
  return page.locator(`[data-testid="picker-row"][data-name="${name}"]`);
}

test('the CasparCG file action explains unavailable setup in both add surfaces', async ({ page }) => {
  await fakeBridge(page);
  await productionPage(page);
  // A production that selected CasparCG keeps its setup help while Bridge is unavailable.
  const footer = page.getByTestId('add-from-server');
  await expect(footer).toBeDisabled();
  await expect(footer).toContainText('CasparCG files');
  await page.getByTestId('rundown-add').click();
  const menu = page.getByTestId('menu-add-from-server');
  await expect(menu).toBeDisabled();
  await expect(menu).toHaveAttribute('title', (await footer.getAttribute('title'))!);
});

test('a clip from the server becomes a cue on the clip layer, and Take, Pause, Resume and Out are one command each', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);

  await page.getByTestId('add-from-server').click();
  await expect(page.getByTestId('playout-picker')).toBeVisible();
  // Templates first, browsed as folders: the two folders the server's names open with, then
  // the one template that sits at the top of the template folder.
  await expect(page.getByTestId('picker-folder')).toHaveText([/BK/, /HOUSE_STRAP/]);
  await expect(page.getByTestId('picker-row')).toHaveCount(1);
  await page.getByTestId('picker-media').click();
  const rows = page.getByTestId('picker-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('GIORNO');
  await expect(rows.first()).toContainText('movie · 1:00');
  // A thumbnail was asked for only once the row was on screen, by the server's own name.
  await expect.poll(() => bridge.thumbnails).toContain('GIORNO');
  await rows.first().getByTestId('picker-add').click();
  await selectAddedCue(page, 'GIORNO');

  // The cue: the server's name, the kind word, and the shared clip layer below every graphic -
  // on the studio's one channel, since this studio has named no other.
  const cue = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(cue).toHaveCount(1);
  // The kind is the row's icon now (one-line rows, docs/CLIP_PLAYBACK_PLAN.md §6.2), said in words
  // by its accessible name.
  await expect(cue.getByRole('img', { name: 'Video · 1-10' })).toBeVisible();
  await expect(cue.getByTestId('cue-layer')).toHaveText('1-10');
  await expect(page.getByTestId('playout-cue-editor')).toBeVisible();
  await expect(page.getByTestId('playout-cue-editor')).toContainText('VIDEO');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('playout-cue-status')).toContainText('2.5.0');

  await page.getByTestId('verb-take').click();
  await expect(cue).toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: { adapter: 'casparcg', channel: 1, layer: 10 },
  });
  // The take names its cue, which the Bridge keeps with what it started so a reading can match
  // the slot back to this row after a reload. Only a take carries it.
  const cueId = await cue.getAttribute('data-testid');
  expect(bridge.cueIds).toEqual([cueId!.replace(/^cue-/, '')]);
  // Named on the PROGRAM header: it plays on the server.
  await expect(page.getByTestId('playout-on-air')).toContainText('GIORNO');
  await expect(page.getByTestId('production-note')).toContainText('✓ Take: GIORNO on 1-10');
  // The production is not started, yet the clip IS on air: NoaCG Bridge plays it either way, so
  // the monitor must not say NOT LIVE over it (docs/work-specs/studio-day-playout D16).
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'false');
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · ON AIR');

  await page.getByTestId('playout-pause').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'pause', slot: { channel: 1, layer: 10 } });
  await page.getByTestId('playout-resume').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'resume', slot: { channel: 1, layer: 10 } });

  await page.getByTestId('verb-out').click();
  await expect(cue).not.toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toEqual({ verb: 'out', slot: { adapter: 'casparcg', channel: 1, layer: 10 }, item: { kind: 'media', name: 'GIORNO' } });
  await expect(page.getByTestId('playout-on-air')).toHaveCount(0);
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · NOT PUBLISHED');
});

test('a deep media library is browsed folder by folder, a long name gives way, and Add never leaves the popover', async ({ page }) => {
  const LONG = 'SPORTS/HOCKEY/2026_FINAL_THIRD_PERIOD_GOAL_REPLAY_SLOW_MOTION_CAMERA_ANGLE_B_WITH_CROWD_SOUND';
  await seedSettings(page);
  await fakeBridge(page, {
    media: [
      { name: LONG, kind: 'movie', frames: 250, fps: 25 },
      { name: 'SPORTS/HOCKEY/INTRO', kind: 'movie', frames: 125, fps: 25 },
      { name: 'SPORTS/FOOTBALL/KICKOFF', kind: 'movie', frames: 50, fps: 25 },
      { name: 'GIORNO', kind: 'movie', frames: 1500, fps: 25 },
    ],
  });
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();

  // The top of the media folder: one folder (with everything under it counted) and one file.
  const picker = page.getByTestId('playout-picker');
  await expect(page.getByTestId('picker-folder')).toHaveCount(1);
  await expect(page.getByTestId('picker-folder')).toContainText('SPORTS');
  await expect(page.getByTestId('picker-folder')).toContainText('3 files');
  await expect(page.getByTestId('picker-row')).toHaveCount(1);
  await expect(page.getByTestId('picker-up')).toBeDisabled();

  // Into SPORTS: two folders and no files; the path line says where this is.
  await page.locator('[data-testid="picker-folder"][data-name="SPORTS"]').click();
  await expect(page.getByTestId('picker-folder')).toHaveText([/FOOTBALL/, /HOCKEY/]);
  await expect(page.getByTestId('picker-row')).toHaveCount(0);
  await expect(page.getByTestId('picker-path')).toContainText('All media');
  await expect(page.getByTestId('picker-path')).toContainText('SPORTS');

  // Into HOCKEY: files by their OWN names, the full server name on hover.
  await page.locator('[data-testid="picker-folder"][data-name="HOCKEY"]').click();
  const long = page.locator(`[data-testid="picker-row"][data-name="${LONG}"]`);
  await expect(long.locator('strong')).toHaveText(LONG.split('/').pop()!);
  await expect(long.locator('.pd-picker-name')).toHaveAttribute('title', LONG);
  // The name truncates and the Add button sits inside the popover, with nothing to scroll sideways.
  const add = long.getByTestId('picker-add');
  const [addBox, pickerBox] = [await add.boundingBox(), await picker.boundingBox()];
  expect(addBox!.x + addBox!.width).toBeLessThanOrEqual(pickerBox!.x + pickerBox!.width);
  expect(await picker.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  expect(await long.locator('strong').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // Up one, then the top crumb: back out the way it came in.
  await page.getByTestId('picker-up').click();
  await expect(page.getByTestId('picker-folder')).toHaveText([/FOOTBALL/, /HOCKEY/]);
  await page.getByTestId('picker-path').getByRole('button', { name: 'All media' }).click();
  await expect(page.getByTestId('picker-row')).toHaveCount(1);

  // Adding from inside a folder still adds the server's full name, and the cue reads its own.
  await (await pickerFile(page, LONG)).getByTestId('picker-add').click();
  await selectAddedCue(page, LONG);
  await expect(page.getByTestId('playout-cue-where')).toContainText(LONG);
  await expect(page.getByTestId('cue-label')).toHaveValue(LONG.split('/').pop()!);
});

test('a clip set to Loop is taken with LOOP, the row says so, and the choice survives a reload', async ({ page }) => {
  // Loop needs nothing new of a Bridge (`PLAY … LOOP` since 0.4), so a 0.4 Bridge offers it.
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);
  await addClip(page);

  const loop = page.getByTestId('clip-end-loop');
  await expect(page.getByTestId('clip-end-hold')).toHaveAttribute('aria-checked', 'true');
  await expect(loop).toBeEnabled();
  await loop.click();
  await expect(loop).toHaveAttribute('aria-checked', 'true');
  const cue = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(cue.getByRole('img', { name: 'Loops until Out' })).toBeVisible();
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: { adapter: 'casparcg', channel: 1, layer: 10 },
    loop: true,
  });
  await expect(page.getByTestId('clip-end-hint')).toContainText('applies at the next Take');
  await page.getByTestId('verb-out').click();

  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.locator('.pd-cue', { hasText: 'GIORNO' }).getByTestId('select-cue').click();
  await expect(page.getByTestId('clip-end-loop')).toHaveAttribute('aria-checked', 'true');

  // Hold again: the next take plays once. The choice lives on the CUE (docs/CLIP_PLAYBACK_PLAN.md §7),
  // and this build never writes the item's old loop flag at all.
  await page.getByTestId('clip-end-hold').click();
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: { adapter: 'casparcg', channel: 1, layer: 10 },
  });
  const stored = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows()[0];
    return { itemLoop: (show.playoutItems ?? []).map((i) => 'loop' in i), end: (show.cues ?? []).map((c) => c.playback?.end ?? null).filter(Boolean) };
  });
  expect(stored).toEqual({ itemLoop: [false], end: ['hold'] });
});

test('each setting goes out with its Take: Clear with a fade, a fade in, a level and a trim; Out fades', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page, PLAYS_EVERYTHING);
  await productionPage(page);
  await addClip(page);
  const cue = page.locator('.pd-cue', { hasText: 'GIORNO' });

  await page.getByTestId('clip-end-clear').click();
  await expect(cue.getByRole('img', { name: 'Clears at its end' })).toBeVisible();
  await page.getByTestId('clip-fade-out-short').click();
  // What the ending does, and why Play next is off in a rundown with no clip after this one.
  await expect(page.getByTestId('clip-end-hint')).toHaveText(
    'Clears the layer at its end, fading out over its last 0.5 s · Play next is off: no clip after this one plays on 1-10',
  );
  await page.getByTestId('clip-fade-in-long').click();
  // The level, from the keyboard: 12 steps down is -12 dB, saved when the key comes up.
  const level = page.getByTestId('clip-level');
  await level.focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('clip-level-value')).toHaveText('−12 dB');
  // The trim, under Advanced: its summary says what is inside before it is opened.
  await expect(page.getByTestId('clip-advanced-summary')).toHaveText('whole clip');
  await page.getByTestId('clip-advanced-toggle').click();
  await page.getByTestId('clip-trim-in').fill('0:05');
  await page.getByTestId('clip-trim-out').fill('20');
  await page.getByTestId('clip-trim-out').press('Enter');
  await expect(page.getByTestId('clip-advanced-summary')).toHaveText('0:05–0:20');
  // The row and PREVIEW read what the cue plays, not the whole minute of the file.
  await expect(cue.getByTestId('cue-length')).toHaveText('0:15');
  await expect(page.getByTestId('preview-length')).toHaveText('0:15');

  await page.getByTestId('verb-take').click();
  await expect(cue).toContainText('ON AIR');
  await expect.poll(() => bridge.actions.length).toBe(1);
  const take = lastAction(bridge) as { playback: { gain: number } };
  expect(take).toEqual({
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: { adapter: 'casparcg', channel: 1, layer: 10 },
    playback: { end: 'clear', fadeOut: 0.5, fadeIn: 1, gain: take.playback.gain, trim: { in: 5, out: 20 } },
  });
  // -12 dB as the clip's own gain, which the Bridge writes as `AF "volume=0.2512"`; never a MIXER.
  expect(take.playback.gain).toBeCloseTo(0.2512, 4);
  // While it is up, a change says it waits for the next Take.
  await expect(page.getByTestId('clip-end-hint')).toContainText('applies at the next Take');

  // All out, the panic control, cuts whatever the fade out says.
  await page.getByTestId('verb-out-all').click();
  await expect.poll(() => lastAction(bridge)).toEqual({ verb: 'out', slot: { adapter: 'casparcg', channel: 1, layer: 10 }, item: { kind: 'media', name: 'GIORNO' } });
  await expect(cue).not.toContainText('ON AIR');
  await page.getByTestId('verb-take').click();
  await expect(cue).toContainText('ON AIR');

  // Out fades as the cue's fade out says, rather than cutting.
  await page.getByTestId('verb-out').click();
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'out',
    slot: { adapter: 'casparcg', channel: 1, layer: 10 },
    item: { kind: 'media', name: 'GIORNO' },
    fadeOut: 0.5,
  });

  // Back to every default, the cue is the record it was: no playback at all, today's action.
  await page.getByTestId('clip-end-hold').click();
  await page.getByTestId('clip-fade-in-cut').click();
  await page.getByTestId('clip-fade-out-cut').click();
  await page.getByTestId('clip-level-reset').click();
  await page.getByTestId('clip-trim-clear').click();
  await expect(page.getByTestId('clip-advanced-summary')).toHaveText('whole clip');
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toEqual({ verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: { adapter: 'casparcg', channel: 1, layer: 10 } });
  const playback = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return (loadShows()[0].cues ?? []).filter((c) => c.source === 'playout').map((c) => c.playback ?? null);
  });
  expect(playback).toEqual([{ end: 'hold' }]);
});

test('a trim outside the file or ending before it starts is refused in the panel and never saved', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, PLAYS_EVERYTHING);
  await productionPage(page);
  await addClip(page);
  await page.getByTestId('clip-advanced-toggle').click();
  // GIORNO is 1:00 long.
  await page.getByTestId('clip-trim-in').fill('1:30');
  await page.getByTestId('clip-trim-in').press('Enter');
  await expect(page.getByTestId('clip-trim-problem')).toHaveText('The start lies past the end of the 1:00 file.');
  await expect(page.getByTestId('clip-advanced-summary')).toHaveText('whole clip');
  // A start that holds on its own is kept as the box is left...
  await page.getByTestId('clip-trim-in').fill('0:40');
  await page.getByTestId('clip-trim-in').press('Enter');
  await expect(page.getByTestId('clip-advanced-summary')).toHaveText('0:40–end');
  // ...and an end before it, or a time that is not one, is refused and never saved.
  await page.getByTestId('clip-trim-out').fill('0:10');
  await page.getByTestId('clip-trim-out').press('Enter');
  await expect(page.getByTestId('clip-trim-problem')).toHaveText('The end comes after the start.');
  await page.getByTestId('clip-trim-out').fill('soon');
  await page.getByTestId('clip-trim-out').press('Enter');
  await expect(page.getByTestId('clip-trim-problem')).toHaveText('Write a time as 0:05, 1:05.5 or 65.5.');
  await expect(page.getByTestId('clip-advanced-summary')).toHaveText('0:40–end');
  await settleDurableWrites(page);
  const stored = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return (loadShows()[0].cues ?? []).filter((c) => c.source === 'playout').map((c) => c.playback ?? null);
  });
  expect(stored).toEqual([{ trimIn: 40 }]);
});

test('an audio file plays on its own layer, 5, below the clips, and a still offers Hold only', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, {
    ...PLAYS_EVERYTHING,
    media: [
      { name: 'GIORNO', kind: 'movie', frames: 1500, fps: 25 },
      { name: 'STING', kind: 'audio', frames: 75, fps: 25 },
      { name: 'LOGO', kind: 'still', frames: 0, fps: 0 },
    ],
  });
  await productionPage(page);
  await addClip(page, 'STING');
  const sting = page.locator('.pd-cue', { hasText: 'STING' });
  await expect(sting.getByRole('img', { name: 'Audio · 1-5' })).toBeVisible();
  await expect(sting.getByTestId('cue-layer')).toHaveText('1-5');
  await expect(page.getByTestId('playout-cue-editor')).toContainText('AUDIO');
  await addClip(page, 'GIORNO');
  await expect(page.locator('.pd-cue', { hasText: 'GIORNO' }).getByTestId('cue-layer')).toHaveText('1-10');
  await addClip(page, 'LOGO');
  await expect(page.getByTestId('clip-end-still')).toHaveText('Holds until Out');
  await expect(page.getByTestId('clip-end')).toHaveCount(0);
});

test('a cue with a setting an old Bridge cannot play is not taken, and says why; a legacy cue still goes as it did', async ({ page }) => {
  // docs/CLIP_PLAYBACK_PLAN.md §18 case 12: a 0.4 Bridge would drop the fade and play the clip the
  // old way. The page never sends it: Take is off, with the reason and the way out.
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);
  await addClip(page);
  // Set as a newer Bridge's studio would have left it: the controls cannot add it on this one.
  await expect(page.getByTestId('clip-fade-in-short')).toBeDisabled();
  await expect(page.getByTestId('clip-fade-in-short')).toHaveAttribute('title', 'Update NoaCG Bridge to set this.');
  await evaluateInPage(page, async () => {
    const { loadShows, setCuePlayback } = await import('/src/model/shows.ts');
    const show = loadShows()[0];
    const cue = (show.cues ?? []).find((c) => c.source === 'playout')!;
    setCuePlayback(show.id, cue.id, { end: 'clear', fadeOut: 'short' });
  });
  await settleDurableWrites(page);
  await page.reload();
  await page.locator('.pd-cue', { hasText: 'GIORNO' }).getByTestId('select-cue').click();
  const why = 'This cue clears at its end and fades. Update NoaCG Bridge to take it, or set it to Hold and set its fades to Cut.';
  await expect(page.getByTestId('playout-take-blocked')).toHaveText(why);
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', why);
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  expect(bridge.actions).toEqual([]);
  // Going back to the defaults is always offered, and the cue is takeable again, exactly the old way.
  await page.getByTestId('clip-end-hold').click();
  await page.getByTestId('clip-fade-out-cut').click();
  await expect(page.getByTestId('playout-take-blocked')).toHaveCount(0);
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toEqual({ verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: { adapter: 'casparcg', channel: 1, layer: 10 } });
});

test('a cue on air that the Bridge can no longer take still comes OFF by SPACE, and is never re-taken the old way', async ({ page }) => {
  // The Bridge in front of the server changes mid-show (an older one started): the cue on air has a
  // fade it cannot play. Re-take would send it the old way, so it does not; taking it off is not
  // held up by it.
  await seedSettings(page);
  const bridge = await fakeBridge(page, { ...PLAYS_EVERYTHING });
  await productionPage(page);
  await addClip(page);
  await page.getByTestId('clip-fade-in-short').click();
  await page.getByTestId('verb-take').click();
  const cue = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(cue).toContainText('ON AIR');
  const sent = bridge.actions.length;
  delete bridge.features;
  delete bridge.capabilities;
  await expect(page.getByTestId('playout-take-blocked')).toBeVisible({ timeout: 10_000 });
  await parkFocusOffControls(page);
  await page.keyboard.press('r');
  await expect(page.getByTestId('production-note')).toContainText('Take was not sent: This cue fades.');
  expect(bridge.actions.length).toBe(sent);
  await page.keyboard.press(' ');
  await expect(cue).not.toContainText('ON AIR');
  expect(bridge.actions.slice(sent)).toEqual([{ verb: 'out', slot: { adapter: 'casparcg', channel: 1, layer: 10 }, item: { kind: 'media', name: 'GIORNO' } }]);
});

test('a server that cannot do a setting has it off, named by its version', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { features: ['playback', 'sequence'], capabilities: ['end'], serverVersion: '2.2.0 fake Dev' });
  await productionPage(page);
  await addClip(page);
  await expect(page.getByTestId('clip-end-clear')).toBeEnabled();
  await expect(page.getByTestId('clip-fade-in-long')).toBeDisabled();
  await expect(page.getByTestId('clip-fade-in-long')).toHaveAttribute('title', 'CasparCG 2.2.0 cannot do this.');
  await expect(page.getByTestId('clip-level')).toBeDisabled();
});

test('THE LOOP RULE: an older build\'s Loop box still reaches cues nobody chose an ending for here, and never overrules one', async ({ page }) => {
  // docs/CLIP_PLAYBACK_PLAN.md §7 and §18 case 23, with edits made through the SHIPPED function
  // an older build calls (`setPlayoutItemLoop`), not only its reader.
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);
  await addClip(page);
  // A second cue over the same file: one server file is one item, shared by its cues.
  await addClip(page);
  const rows = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(rows).toHaveCount(2);
  const oldBuildLoop = (on: boolean) =>
    evaluateInPage(
      page,
      async (loop) => {
        const { loadShows, setPlayoutItemLoop } = await import('/src/model/shows.ts');
        const show = loadShows()[0];
        setPlayoutItemLoop(show.id, show.playoutItems![0].id, loop);
      },
      on,
    ).then(() => settleDurableWrites(page));
  /** Take a row, see what went out, and take it off again, so the next Take is a take. */
  const takeRow = async (i: number, sent: unknown) => {
    await rows.nth(i).getByTestId('select-cue').click();
    await page.getByTestId('verb-take').click();
    await expect(rows.nth(i)).toContainText('ON AIR');
    await expect.poll(() => lastAction(bridge)).toMatchObject(sent as object);
    expect(lastAction(bridge)).toEqual(sent);
    await page.getByTestId('verb-out').click();
    await expect(rows.nth(i)).not.toContainText('ON AIR');
  };
  const GIORNO = { verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: { adapter: 'casparcg', channel: 1, layer: 10 } };

  // The older build turns Loop on: both cues, neither of which has an ending of its own, loop.
  await oldBuildLoop(true);
  await page.reload();
  await expect(rows.nth(0).getByRole('img', { name: 'Loops until Out' })).toBeVisible();
  await expect(rows.nth(1).getByRole('img', { name: 'Loops until Out' })).toBeVisible();
  await takeRow(0, { ...GIORNO, loop: true });

  // This build sets the first cue to Hold: that cue holds, the other still follows the old flag.
  await page.getByTestId('clip-end-hold').click();
  await expect(rows.nth(0).getByRole('img', { name: 'Loops until Out' })).toHaveCount(0);
  await expect(rows.nth(1).getByRole('img', { name: 'Loops until Out' })).toBeVisible();
  await takeRow(0, GIORNO);
  await takeRow(1, { ...GIORNO, loop: true });

  // The older build ticks Loop again: it cannot re-enable the loop this build turned off.
  await settleDurableWrites(page);
  await oldBuildLoop(true);
  await page.reload();
  await expect(rows.nth(0).getByRole('img', { name: 'Loops until Out' })).toHaveCount(0);
  await takeRow(0, GIORNO);
  // ...and it turns it off for the cue that never had an ending chosen here.
  await oldBuildLoop(false);
  await page.reload();
  await expect(rows.nth(1).getByRole('img', { name: 'Loops until Out' })).toHaveCount(0);

  // Once every cue of the item has its own ending the old flag is read by nothing, and it goes.
  await oldBuildLoop(true);
  await page.reload();
  await rows.nth(1).getByTestId('select-cue').click();
  await page.getByTestId('clip-end-loop').click();
  await settleDurableWrites(page);
  const item = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return 'loop' in loadShows()[0].playoutItems![0];
  });
  expect(item).toBe(false);
});

test('a server template takes the next free layer, carries its typed fields as JSON data, and Update, Next and Out follow', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await productionPage(page);

  await page.getByTestId('add-from-server').click();
  // A template NoaCG did not make: the field ids are typed once, beside the name.
  await page.getByTestId('picker-field-ids').fill('f0, f1');
  await (await pickerFile(page, 'HOUSE_STRAP/HOUSE_STRAP')).getByTestId('picker-add').click();
  await selectAddedCue(page, 'HOUSE_STRAP/HOUSE_STRAP');

  const cue = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  await expect(cue.getByRole('img', { name: 'Server template · 1-21' })).toBeVisible();
  // The production's own graphic holds 20, so the template took the next free one.
  await expect(cue.getByTestId('cue-layer')).toHaveText('1-21');
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
  await selectAddedCue(page, 'HAIRLINE');
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
  await selectAddedCue(page, 'NEW1/POWER_CLOCK');
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
  await selectAddedCue(page, 'GIORNO');
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
  await selectAddedCue(page, 'GIORNO');
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

test('one rundown cues a template on the graphics channel and a clip on the insert channel, any cue can move, and All out clears both', async ({ page }) => {
  await seedSettings(page, TWO_CHANNELS);
  const bridge = await fakeBridge(page);
  await productionPage(page);

  // A server template: the NoaCG output's channel, stored as its number, on a layer above the output.
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-field-ids').fill('f0');
  await (await pickerFile(page, 'HOUSE_STRAP/HOUSE_STRAP')).getByTestId('picker-add').click();
  await selectAddedCue(page, 'HOUSE_STRAP/HOUSE_STRAP');
  const strap = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  await expect(strap.getByTestId('cue-layer')).toHaveText('1-21');
  const editor = page.getByTestId('playout-cue-editor');
  await expect(editor.getByTestId('playout-channel')).toHaveValue('1');
  await expect(editor.getByTestId('playout-channel').locator('option:checked')).toHaveText('1 · Graphics');
  // Picked from the named channels, never typed.
  await expect(editor.getByTestId('playout-channel').locator('option')).toHaveText(['1 · Graphics', '2 · Inserts']);

  // A clip from the same server: the insert channel, on the clip layer.
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.locator('[data-testid="picker-row"][data-name="GIORNO"]').getByTestId('picker-add').click();
  await selectAddedCue(page, 'GIORNO');
  const clip = page.locator('.pd-cue', { hasText: 'GIORNO' });
  await expect(clip.getByTestId('cue-layer')).toHaveText('2-10');
  // A clip shows its channel and layer beside its note, as a template does, with nothing to open
  // first (owner, 2026-10-01: moving a clip to another channel is as easy as another layer).
  await expect(editor.getByTestId('playout-channel')).toBeVisible();
  await expect(editor.getByTestId('playout-channel')).toHaveValue('2');
  await expect(editor.getByTestId('playout-layer')).toHaveValue('10');
  await expect(editor.getByTestId('clip-advanced-summary')).toHaveText('whole clip');
  await expect(editor.getByTestId('playout-cue-where')).toContainText('2-10');
  const stored = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return (loadShows()[0].playoutItems ?? []).map((i) => ({ name: i.name, channel: i.channel ?? null }));
  });
  expect(stored).toEqual([
    { name: 'HOUSE_STRAP/HOUSE_STRAP', channel: 1 },
    { name: 'GIORNO', channel: 2 },
  ]);

  // Both taken from the one rundown, each on its own channel.
  await strap.getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(strap).toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'take', slot: { channel: 1, layer: 21 } });
  await clip.getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(clip).toContainText('ON AIR');
  await expect.poll(() => lastAction(bridge)).toEqual({
    verb: 'take',
    item: { kind: 'media', name: 'GIORNO' },
    slot: { adapter: 'casparcg', channel: 2, layer: 10 },
  });
  await expect(page.getByTestId('production-note')).toContainText('✓ Take: GIORNO on 2-10');
  await expect(page.getByTestId('playout-on-air')).toContainText('(1-21)');
  await expect(page.getByTestId('playout-on-air')).toContainText('(2-10)');

  // The override, on a cue that is ON AIR: the pick moves the cue for its NEXT take, and Out
  // still reaches 1-21 where it actually is, so nothing is stranded on the old channel.
  await strap.getByTestId('select-cue').click();
  await editor.getByTestId('playout-channel').selectOption('2');
  await expect(strap.getByTestId('cue-layer')).toHaveText('2-21');
  await page.getByTestId('verb-out').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'out', slot: { channel: 1, layer: 21 } });
  await expect(strap).not.toContainText('ON AIR');
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'take', slot: { channel: 2, layer: 21 } });
  await expect(strap).toContainText('ON AIR');

  // Moved back while on air and RE-TAKEN with no Out between: the copy on 2-21 comes off
  // first, so the move never leaves a second strap stranded on the old channel.
  await editor.getByTestId('playout-channel').selectOption('1');
  const mark = bridge.actions.length;
  await page.getByTestId('verb-retake').click();
  await expect.poll(() => bridge.actions.length - mark).toBe(2);
  expect(bridge.actions.slice(mark)).toMatchObject([
    { verb: 'out', slot: { channel: 2, layer: 21 }, item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' } },
    { verb: 'take', slot: { channel: 1, layer: 21 } },
  ]);
  await expect(strap).toContainText('ON AIR');

  // All out: one Out per cue this rundown has up, each on the slot it went to, and nothing else
  // - no channel-wide CLEAR that would take another client's layers with it.
  const before = bridge.actions.length;
  await page.getByTestId('verb-out-all').click();
  await expect(strap).not.toContainText('ON AIR');
  await expect(clip).not.toContainText('ON AIR');
  await expect.poll(() => bridge.actions.length - before).toBe(2);
  const outs = bridge.actions.slice(before) as { verb: string; slot: { channel: number; layer: number } }[];
  expect(outs.map((a) => `${a.verb} ${a.slot.channel}-${a.slot.layer}`).sort()).toEqual(['out 1-21', 'out 2-10']);
  await expect(page.getByTestId('playout-on-air')).toHaveCount(0);

  // The hosted control page is told the same address: the published payload carries each server
  // cue's channel and its name, and survives the reader the hosted page uses.
  const published = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { buildOutputPayload, readOutputPayload } = await import('/src/control/hostedControl.ts');
    const payload = readOutputPayload(JSON.parse(JSON.stringify(await buildOutputPayload(loadShows()[0]))));
    return (payload?.playoutCues ?? []).map((c) => ({ name: c.name, channel: c.channel, channelName: c.channelName, layer: c.layer }));
  });
  expect(published).toEqual([
    { name: 'HOUSE_STRAP/HOUSE_STRAP', channel: 1, channelName: 'Graphics', layer: 21 },
    { name: 'GIORNO', channel: 2, channelName: 'Inserts', layer: 10 },
  ]);
});

test('nothing replaces the NoaCG output: a server item on its slot is refused with the reason, and a new template never defaults there', async ({ page }) => {
  // The output on 1-21, so the template's usual default (the layer after the pool graphic's 20) is
  // exactly the output's slot.
  await seedSettings(page, { ...TWO_CHANNELS, layer: 21 });
  const bridge = await fakeBridge(page);
  await productionPage(page);

  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-field-ids').fill('f0');
  await (await pickerFile(page, 'HOUSE_STRAP/HOUSE_STRAP')).getByTestId('picker-add').click();
  await selectAddedCue(page, 'HOUSE_STRAP/HOUSE_STRAP');
  const strap = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  await expect(strap.getByTestId('cue-layer')).toHaveText('1-22');

  // A clip moved onto the output's slot: the editor says why Take is off, and Take sends nothing.
  await addClip(page);
  const clip = page.locator('.pd-cue', { hasText: 'GIORNO' });
  const editor = page.getByTestId('playout-cue-editor');
  await editor.getByTestId('playout-channel').selectOption('1');
  await editor.getByTestId('playout-layer').fill('21');
  await expect(clip.getByTestId('cue-layer')).toHaveText('1-21');
  const reason = 'Layer 21 on Channel 1 is the NoaCG output. Choose another layer for this.';
  await expect(editor.getByTestId('playout-take-blocked')).toHaveText(reason);
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', reason);
  expect(bridge.actions).toEqual([]);

  // One layer above the output is the operator's to use: it plays over the graphics.
  await editor.getByTestId('playout-layer').fill('22');
  await expect(editor.getByTestId('playout-take-blocked')).toHaveCount(0);
  await page.getByTestId('verb-take').click();
  await expect.poll(() => lastAction(bridge)).toMatchObject({ verb: 'take', slot: { channel: 1, layer: 22 } });
});

test('a take on a slot another cue holds replaces it, and a channel the studio does not name stays listed as itself', async ({ page }) => {
  await seedSettings(page, TWO_CHANNELS);
  const bridge = await fakeBridge(page, PLAYS_EVERYTHING);
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.locator('[data-testid="picker-row"][data-name="GIORNO"]').getByTestId('picker-add').click();
  await selectAddedCue(page, 'GIORNO');
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.locator('[data-testid="picker-row"][data-name="JÄÄKIEKKO"]').getByTestId('picker-add').click();
  await selectAddedCue(page, 'JÄÄKIEKKO');
  const giorno = page.locator('.pd-cue', { hasText: 'GIORNO' });
  const still = page.locator('.pd-cue', { hasText: 'JÄÄKIEKKO' });

  // Both clips share 2-10: taking the second replaces the first on the server, so the first
  // row stops saying ON AIR and All out sends one Out, not two.
  await giorno.getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(giorno).toContainText('ON AIR');
  await still.getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(still).toContainText('ON AIR');
  await expect(giorno).not.toContainText('ON AIR');
  const before = bridge.actions.length;
  await page.getByTestId('verb-out-all').click();
  await expect(still).not.toContainText('ON AIR');
  await expect.poll(() => bridge.actions.length - before).toBe(1);
  expect(bridge.actions[before]).toMatchObject({ verb: 'out', slot: { channel: 2, layer: 10 } });

  // A production made in a studio with a channel 5 opens here with that cue still on 5.
  await page.evaluate(async () => {
    const { loadShows, setPlayoutItemChannel } = await import('/src/model/shows.ts');
    const show = loadShows()[0];
    setPlayoutItemChannel(show.id, show.playoutItems![0].id, 5);
    // Landed, not just accepted, before the reload below reads it back.
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    await commitDurableWrites();
  });
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.locator('.pd-cue', { hasText: 'GIORNO' }).getByTestId('select-cue').click();
  await page.getByTestId('clip-advanced-toggle').click();
  const pick = page.getByTestId('playout-cue-editor').getByTestId('playout-channel');
  await expect(pick).toHaveValue('5');
  await expect(pick.locator('option:checked')).toHaveText('5 · not in Settings');
  await expect(page.locator('.pd-cue', { hasText: 'GIORNO' }).getByTestId('cue-layer')).toHaveText('5-10');
});

// CHARACTERISATION (docs/CLIP_PLAYBACK_PLAN.md §10, phase 0): today's exact wire for every verb on
// a server clip and a server template, pinned before the production page is split, so the moved
// code can be held to it byte for byte. It also pins the one behaviour phase 2 will change on
// purpose: what is up on the server is PAGE MEMORY, so a reload forgets it and sends nothing.
test('every verb sends the same action after a drag reorder and after a reload, and a reload forgets what is up', async ({ page }) => {
  await seedSettings(page, TWO_CHANNELS);
  const bridge = await fakeBridge(page);
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-field-ids').fill('f0');
  await (await pickerFile(page, 'HOUSE_STRAP/HOUSE_STRAP')).getByTestId('picker-add').click();
  await selectAddedCue(page, 'HOUSE_STRAP/HOUSE_STRAP');
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.locator('[data-testid="picker-row"][data-name="GIORNO"]').getByTestId('picker-add').click();
  await selectAddedCue(page, 'GIORNO');
  await page.keyboard.press('Escape');

  // The drag: the clip, dropped on the first row, moves to the top of the rundown.
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('GIORNO');
  await rows.nth(2).dragTo(rows.nth(0));
  await expect(rows.nth(0)).toContainText('GIORNO');
  await expect(rows.nth(1)).toContainText('Hairline');
  await expect(rows.nth(2)).toContainText('HOUSE_STRAP');
  const clip = page.locator('.pd-cue', { hasText: 'GIORNO' });
  const strap = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  const CLIP_SLOT = { adapter: 'casparcg', channel: 2, layer: 10 };
  const STRAP_SLOT = { adapter: 'casparcg', channel: 1, layer: 21 };
  const CLIP_ITEM = { kind: 'media', name: 'GIORNO' };
  const STRAP_ITEM = { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' };

  // The clip: Take, Pause, Resume, Out - one action each, exactly these.
  await clip.getByTestId('select-cue').click();
  let mark = bridge.actions.length;
  await page.getByTestId('verb-take').click();
  await expect(clip).toContainText('ON AIR');
  await page.getByTestId('playout-pause').click();
  await page.getByTestId('playout-resume').click();
  await page.getByTestId('verb-out').click();
  await expect(clip).not.toContainText('ON AIR');
  await expect.poll(() => bridge.actions.length - mark).toBe(4);
  expect(bridge.actions.slice(mark)).toEqual([
    { verb: 'take', item: CLIP_ITEM, slot: CLIP_SLOT },
    { verb: 'pause', slot: CLIP_SLOT, item: CLIP_ITEM },
    { verb: 'resume', slot: CLIP_SLOT, item: CLIP_ITEM },
    { verb: 'out', slot: CLIP_SLOT, item: CLIP_ITEM },
  ]);

  // The template: Take with its data, Update, Next, Out.
  await strap.getByTestId('select-cue').click();
  await page.getByTestId('playout-cue-editor').getByTestId('cue-field-f0').fill('Anna');
  mark = bridge.actions.length;
  await page.getByTestId('verb-take').click();
  await expect(strap).toContainText('ON AIR');
  await page.getByTestId('playout-cue-editor').getByTestId('cue-field-f0').fill('Ben');
  await page.getByTestId('verb-update').click();
  await page.getByTestId('verb-next').click();
  await page.getByTestId('verb-out').click();
  await expect(strap).not.toContainText('ON AIR');
  await expect.poll(() => bridge.actions.length - mark).toBe(4);
  expect(bridge.actions.slice(mark)).toEqual([
    { verb: 'take', item: STRAP_ITEM, slot: STRAP_SLOT, data: { f0: 'Anna' } },
    { verb: 'update', slot: STRAP_SLOT, data: { f0: 'Ben' } },
    { verb: 'next', slot: STRAP_SLOT, item: STRAP_ITEM },
    { verb: 'out', slot: STRAP_SLOT, item: STRAP_ITEM },
  ]);

  // Up again, then a reload. The order is the record's; what is on the server is not.
  await clip.getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(clip).toContainText('ON AIR');
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();
  mark = bridge.actions.length;
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(rows.nth(0)).toContainText('GIORNO');
  await expect(rows.nth(2)).toContainText('HOUSE_STRAP');
  await expect(clip).not.toContainText('ON AIR');
  await expect(page.getByTestId('playout-on-air')).toHaveCount(0);
  await expect(page.getByTestId('verb-out-all')).toBeDisabled();
  await clip.getByTestId('select-cue').click();
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('verb-out')).toBeDisabled();
  await expect(page.getByTestId('playout-clip-transport')).toHaveCount(0);
  expect(bridge.actions.length - mark, 'a reload sends nothing to the server').toBe(0);

  // …and the same Take, byte for byte.
  await page.getByTestId('verb-take').click();
  await expect(clip).toContainText('ON AIR');
  await expect.poll(() => bridge.actions.length - mark).toBe(1);
  expect(lastAction(bridge)).toEqual({ verb: 'take', item: CLIP_ITEM, slot: CLIP_SLOT });
});

test('a re-take onto a channel the server refuses leaves nothing marked ON AIR, since the old copy already came off', async ({ page }) => {
  await seedSettings(page, TWO_CHANNELS);
  const bridge = await fakeBridge(page, { refuseTakeOnChannel: 2 });
  await productionPage(page);
  await page.getByTestId('add-from-server').click();
  await page.getByTestId('picker-field-ids').fill('f0');
  await (await pickerFile(page, 'HOUSE_STRAP/HOUSE_STRAP')).getByTestId('picker-add').click();
  await selectAddedCue(page, 'HOUSE_STRAP/HOUSE_STRAP');
  const strap = page.locator('.pd-cue', { hasText: 'HOUSE_STRAP' });
  await page.getByTestId('verb-take').click();
  await expect(strap).toContainText('ON AIR');

  // Moved to a channel this server does not have, then re-taken: the copy on 1-21 comes off,
  // the take on 2-21 is refused, and the row stops claiming anything is up.
  await page.getByTestId('playout-cue-editor').getByTestId('playout-channel').selectOption('2');
  await page.getByTestId('verb-retake').click();
  await expect(page.getByTestId('production-note')).toContainText('did not reach the playout server');
  expect(bridge.actions.slice(-2)).toMatchObject([
    { verb: 'out', slot: { channel: 1, layer: 21 } },
    { verb: 'take', slot: { channel: 2, layer: 21 } },
  ]);
  await expect(strap).not.toContainText('ON AIR');
  await expect(page.getByTestId('playout-on-air')).toHaveCount(0);
});
