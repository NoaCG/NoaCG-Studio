// covers: src/templates/**, src/components/{home,save}/**, src/components/NewGraphicButton.tsx
//
// This spec draws a production page's cue editor, whose every box is a field control.
// covers: src/components/{fields/**,SampleDataPanel.tsx,ControlPanel.tsx,HostedControlPage.tsx}
//
// NOACG BRIDGE (docs/BRIDGE.md). The browser half is one file, and the two surfaces it grows are
// already mapped elsewhere for their own reasons - SettingsDialog to analytics/auth, ProductionPage
// into the productions set - so those rules are UNION'd with this one rather than replaced. Without
// this line a change to the link contract would run specs that pin the panels' other contents and
// never the four diagnosis states, which are the whole point of the feature. The channel table and
// the per-cue slot helpers live in playoutLink.ts too, and the rundown is what reads them.
// serverPlayout.ts (with its store and playoutSlots.ts) is what every server verb and every row
// address goes through, and serverState.ts what the clip clock draws; the baselines draw all three.
// covers: src/control/{playoutLink,playoutProtocol,serverPlayout,serverPlayoutStore,serverState,playoutSlots}.ts
//
// PLAYOUT SETTINGS from the production header: the dialog, the form it shares with Settings, and
// the system list. bridge-connect drives the form through a fake Bridge; playout-nav owns the
// header door and the Back/Home pair beside it.
// covers: src/{components/{PlayoutSettingsDialog,PlayoutSettingsPanel}.tsx,control/playoutSystems.ts}
//
// THE PRODUCTION PAGE AS PICTURES (docs/CLIP_PLAYBACK_PLAN.md §10). The stylesheet is CORE, so a
// CSS change reaches no covers line and runs the focus set instead; without the baselines here, a
// change that moves the dashboard would pass its own gate and turn main red. Four screenshots.
// focus

import { test, expect, type Page, type Route } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { parkFocusOffControls } from './_keys';

// THE PRODUCTION PAGE AS IT LOOKS, pinned as pictures (docs/CLIP_PLAYBACK_PLAN.md §10, phase 0).
//
// The clip playback work starts by moving the rundown, the monitors and the server cue editor out
// of ProductionPage.tsx with NOTHING visible changing. The other playout specs pin what each
// control does; these pin what the whole page looks like, so a moved piece that lays out one pixel
// differently fails here rather than on the owner's screen. A later phase that changes the look on
// purpose re-records them (`--update-snapshots`) in the same commit, and the diff is the review.
//
// Two productions, at the design target (1920x1080) and the supported floor (1366x768,
// docs/PLAYOUT_DASHBOARD.md §2):
//   - GRAPHICS ONLY: a scoreboard, a quiz and two lower thirds; a lower third on air, the
//     scoreboard selected, so its editor with every field is open under the monitors.
//   - MIXED: graphics beside a server clip and a server template on a two-channel studio, through
//     a Bridge faked at the network layer (as in playout-cues.spec.ts); the clip taken, so its
//     row says ON AIR, PROGRAM's header names it and its editor shows the transport.
//
// What moves with the wall clock is masked: the header's session timer and the activity log's
// times. So are the graphics INSIDE the two monitors: how far an entrance has got is timing, and
// how a catalog design draws is the catalog's business, not this page's. The mask is drawn over
// each frame's scaled box, so where the preview sits and how large it is scaled stay pinned.
// Everything else on screen is a function of the seeded record.
//
// Baselines are per platform (`-win32`, `-linux`), because fonts rasterise differently. To
// re-record after a deliberate change, from the same pushed commit:
//
//   npx playwright test e2e/playout-baseline.spec.ts --update-snapshots      # -win32, locally
//   gh workflow run rerecord-screenshots.yml --ref <branch>                  # -linux, on a runner
//   rm e2e/playout-baseline.spec.ts-snapshots/*-linux.png                    # download won't overwrite
//   gh run download <run-id> -n linux-screenshots -D e2e/playout-baseline.spec.ts-snapshots
//
// The run's summary says which pictures changed. Look at both sets before committing them.

const BRIDGE = 'http://127.0.0.1:8899';
const TOKEN = 'e2e-token';

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];

/** The two-channel studio: graphics on 1, inserts on 2, paired with the fake Bridge below. */
async function seedStudio(page: Page): Promise<void> {
  await page.addInitScript(
    ([bridge, token]) => {
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({
          agentUrl: bridge,
          agentToken: token,
          host: '127.0.0.1',
          amcpPort: 5250,
          channel: 1,
          layer: 20,
          v: 1,
          channels: [
            { channel: 1, name: 'Graphics' },
            { channel: 2, name: 'Inserts' },
          ],
          clipChannel: 2,
        }),
      );
    },
    [BRIDGE, TOKEN] as const,
  );
}

/** A Bridge that answers, a server that is up, and every action accepted. */
async function fakeBridge(page: Page): Promise<void> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await page.route(`${BRIDGE}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/health') return json(route, { ok: true, agent: 'noacg-bridge', v: 2, version: '0.4.0', adapters: ['casparcg'] });
    if (path === '/status') return json(route, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK' });
    return json(route, { ok: true, v: 2, raw: '202 OK' });
  });
}

/**
 * One production, seeded straight into the record from a FIXED list of catalog designs (the first
 * variant of each category named), so a new design never changes these pictures. Returns its id.
 */
async function seedProduction(page: Page, mixed: boolean): Promise<string> {
  await page.goto('/app#/home');
  await awaitDurableReady(page);
  const id = await page.evaluate(async (withServer) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createShowNamed, addGraphicToShow, addPlayoutItem, updateShowCue, loadShows } = await import('/src/model/shows.ts');
    const show = createShowNamed(withServer ? 'Evening News' : 'Friday Quiz');
    const designs = withServer
      ? [variantsFor('lower-third')[0], variantsFor('scoreboard')[0]]
      : [variantsFor('scoreboard')[0], variantsFor('quiz')[0], variantsFor('lower-third')[0], variantsFor('lower-third')[1]];
    for (const variant of designs) addGraphicToShow(show.id, variant.create({}));
    if (withServer) {
      addPlayoutItem(show.id, { adapter: 'casparcg', kind: 'media', name: 'GIORNO', frames: 1500, fps: 25, channel: 2 });
      addPlayoutItem(show.id, {
        adapter: 'casparcg',
        kind: 'template',
        name: 'HOUSE_STRAP/HOUSE_STRAP',
        fields: [
          { field: 'f0', title: 'F0', value: '' },
          { field: 'f1', title: 'F1', value: '' },
        ],
      });
    }
    // A note on the first cue, so the row's second line is pinned carrying one.
    const first = loadShows().find((s) => s.id === show.id)!.cues![0];
    updateShowCue(show.id, first.id, { note: 'after the intro' });
    return show.id;
  }, mixed);
  await settleDurableWrites(page);
  return id;
}

/** The picture, with what the wall clock moves masked, the pointer parked and focus dropped. */
async function expectPage(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await parkFocusOffControls(page);
  await expect(page).toHaveScreenshot(name, {
    mask: [
      page.locator('.pd-clock'),
      page.locator('[data-testid="action-log"] summary .muted'),
      page.locator('.prod-log-time'),
      page.locator('.pd-monitors iframe'),
      // A clip on air counts down in the clip clock and in its row (docs/CLIP_PLAYBACK_PLAN.md §6.4).
      page.locator('.pd-clipclock-time'),
      page.locator('.pd-cue.on-air [data-testid="cue-length"]'),
    ],
    animations: 'disabled',
    caret: 'hide',
    timeout: 20_000,
  });
}

const cueRow = (page: Page, text: string) => page.locator('.pd-cue', { hasText: text });

for (const size of SIZES) {
  test(`graphics only, at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    const id = await seedProduction(page, false);
    await page.goto(`/app#/production/${id}`);
    await expect(page.getByTestId('production-page')).toBeVisible();
    const rows = page.getByTestId('cue-list').locator('.pd-cue');
    await expect(rows).toHaveCount(4);

    // A lower third on air, then the scoreboard selected: PREVIEW, PROGRAM and the long editor.
    await rows.nth(2).getByTestId('select-cue').click();
    await page.getByTestId('verb-take').click();
    await expect(rows.nth(2)).toContainText('ON AIR');
    await rows.nth(0).getByTestId('select-cue').click();
    await expect(page.getByTestId('cue-editor')).toBeVisible();
    await expectPage(page, `graphics-only-${size.width}x${size.height}.png`);
  });

  test(`graphics and server cues, at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await seedStudio(page);
    await fakeBridge(page);
    const id = await seedProduction(page, true);
    await page.goto(`/app#/production/${id}`);
    await expect(page.getByTestId('production-page')).toBeVisible();
    await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(4);

    await cueRow(page, 'GIORNO').getByTestId('select-cue').click();
    await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
    await page.getByTestId('verb-take').click();
    await expect(cueRow(page, 'GIORNO')).toContainText('ON AIR');
    await expect(page.getByTestId('playout-clip-transport')).toBeVisible();
    await expectPage(page, `mixed-${size.width}x${size.height}.png`);
  });
}
