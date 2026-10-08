// The dashboard's fixed shell: the control area is the one scroller and the monitors and the
// rundown sit beside it (docs/PLAYOUT_DASHBOARD.md §2). The stylesheet half is CORE and reaches the
// spec through the focus set; the exported controller carries its own copy of the shell, which the
// spec's third surface drives. `HostedControlPage.tsx` is deliberately NOT here: its DOM needs a
// configured backend, so no offline spec can mount it, and its copy of the wrapper is held by the
// parity contract (docs/CONTROL_PANEL_PARITY.md) instead. The rundown's width and its one-line rows
// (docs/CLIP_PLAYBACK_PLAN.md phase 1) are pinned by playout-rail-width: the handle, the §6.2 row
// table, the clash door and the list following the air. The stylesheet half reaches it through the
// focus set, like the fixed-panes spec.
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer}.tsx
//
// PLAYOUT SETTINGS from the production header: the dialog and the form it shares with Settings.
// bridge-connect drives the form through a fake Bridge; playout-nav owns the doors (Setup ›
// Playout settings…, and the Playout panel's Pair once CasparCG is switched on) and the Back/Home
// pair beside them.
// covers: src/components/{PlayoutSettingsDialog,PlayoutSettingsPanel}.tsx
// covers: src/components/home/{PlayoutPanel,PlayoutStatusControl,ProductionSetupMenu}.tsx

import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// THE PLAYOUT PAGE'S WAY OUT, AND ITS WAY TO CASPARCG (owner, 2026-09-23).
//
// Back and Home are two separate promises. Back returns to wherever you came from - the
// dashboard, the productions list, the graphic you were making - and only falls back to the
// productions list when the page was opened cold (a bookmark, a new tab), where there is nowhere
// to go back to (src/app/router.ts, in-app history depth). Home always goes to the dashboard.
// Every road in here starts from Home or a saved production; none of it opens the editor.
//
// Playout settings sit on the page itself: a door in the header's Setup menu, opening the SAME
// form Settings -> Playout shows (PlayoutSettingsPanel) - a second door onto one stored record,
// never a second copy of it.

/** A production seeded through the model, for the pages that open it by URL. */
async function seededProduction(page: Page): Promise<string> {
  await page.goto('/app');
  // Seed only once the durable store has hydrated, or the seed can be written against a list
  // that is not yet the list (e2e/AGENTS.md, "must WAIT for the disk").
  await awaitDurableReady(page);
  const id = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: 'Guest Strap', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed('Cold Link Show');
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    return show.id;
  });
  await settleDurableWrites(page);
  return id;
}

test('Back returns to where the production was opened from, and Home always goes to the dashboard', async ({ page }) => {
  const id = await seededProduction(page);
  const back = page.getByTestId('production-back');
  const home = page.getByTestId('production-home');

  // Opened from the DASHBOARD: Back returns to the dashboard. It used to jump to the
  // productions list whatever the page was opened from.
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId(`production-row-${id}`).getByTestId('open-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  // Both are labelled words, side by side, and neither is the other.
  await expect(back).toHaveText('← Back');
  await expect(home).toHaveText('Home');
  await back.click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);

  // Opened from the PRODUCTIONS LIST: Home goes to the dashboard, never back to the list...
  await page.getByTestId('home-nav-productions').click();
  await expect(page).toHaveURL(/#\/home\/productions$/);
  await page.getByTestId(`production-row-${id}`).getByTestId('open-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await home.click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);

  // ...while Back, from the same production, returns to the list it came from.
  await page.goBack();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/#\/home\/productions$/);
});

test('a production opened cold goes Back to the productions list, since there is nowhere else', async ({ page, context }) => {
  const id = await seededProduction(page);
  // A NEW TAB: its history holds this page and nothing of the app before it.
  const tab = await context.newPage();
  await tab.goto(`/app#/production/${id}`);
  await expect(tab.getByTestId('production-page')).toBeVisible();
  await tab.getByTestId('production-back').click();
  await expect(tab.getByTestId('home-page')).toBeVisible();
  await expect(tab).toHaveURL(/#\/home\/productions$/);
});

test('the production page opens Playout settings: the same form as Settings, saved to the same place', async ({ page, context }) => {
  const id = await seededProduction(page);
  const tab = await context.newPage();
  await tab.goto(`/app#/production/${id}`);
  await expect(tab.getByTestId('production-page')).toBeVisible();

  // A browser production's panel has no disconnected-server form: CasparCG is switched off.
  await tab.getByTestId('production-status').click();
  const panel = tab.getByTestId('production-status-panel');
  await expect(panel.getByTestId('caspar-switch')).not.toBeChecked();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  await tab.keyboard.press('Escape');

  // Setup › Playout settings… opens the dialog; with CasparCG off it holds no server form.
  await tab.getByTestId('production-setup').click();
  await tab.getByTestId('setup-playout-settings').click();
  const dialog = tab.getByTestId('playout-settings');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('rundown-colors')).toBeVisible();
  await expect(dialog.getByTestId('caspar-host')).toHaveCount(0);
  await dialog.getByTestId('playout-settings-close').click();

  // The per-production switch replaces the output chooser (playout-workflow-simplification AC-4).
  // On, with no Bridge paired, the panel offers Download and Pair (D8), and Pair opens the same
  // dialog, now with its CasparCG section.
  await tab.getByTestId('production-status').click();
  await panel.getByTestId('caspar-switch').click();
  await expect(panel.getByTestId('caspar-switch')).toBeChecked();
  await expect(panel.getByTestId('bridge-download')).toHaveAttribute('href', '/downloads#bridge');
  await panel.getByTestId('bridge-pair').click();
  await expect(dialog).toContainText('CasparCG through NoaCG Bridge');
  await expect(dialog.getByTestId('bridge-download')).toHaveAttribute('href', '/downloads#bridge');

  // One form, one record: a server named here is the server Settings -> Playout shows.
  await dialog.getByTestId('settings-playout').getByTestId('caspar-host').fill('studio-caspar.lan');
  await dialog.getByTestId('playout-settings-close').click();
  await expect(dialog).toHaveCount(0);
  await tab.getByTestId('production-home').click();
  await tab.getByTestId('home-settings').click();
  await tab.getByTestId('settings-nav-playout').click();
  await expect(tab.getByTestId('settings').getByTestId('caspar-host')).toHaveValue('studio-caspar.lan');
});
