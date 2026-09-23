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
// Playout settings sit on the page itself: one door in the header, with a status dot, opening the
// SAME form Settings -> Playout shows (PlayoutSettingsPanel) - a second door onto one stored
// record, never a second copy of it.

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

test('the header opens Playout settings: the same form as Settings, saved to the same place', async ({ page, context }) => {
  const id = await seededProduction(page);
  const tab = await context.newPage();
  await tab.goto(`/app#/production/${id}`);
  await expect(tab.getByTestId('production-page')).toBeVisible();

  // Nothing paired: the door says so without asking the network anything.
  const door = tab.getByTestId('playout-settings-open');
  await expect(door).toHaveAttribute('data-state', 'idle');
  await expect(door).toHaveAttribute('aria-label', /CasparCG not set up/);
  await door.click();

  const dialog = tab.getByTestId('playout-settings');
  await expect(dialog).toBeVisible();
  // WHERE graphics play, answered before the form asks for an address.
  await expect(dialog.getByTestId('playout-system-casparcg')).toContainText('NoaCG Bridge');
  await expect(dialog.getByTestId('playout-browser-source-note')).toContainText('OBS, vMix');
  // The Bridge is one click away, and so is the page that explains it.
  await expect(dialog.getByTestId('bridge-download')).toHaveAttribute('href', /releases\/latest\/download\/NoaCG-Bridge\.exe$/);
  await expect(dialog.getByTestId('playout-settings-downloads')).toHaveAttribute('href', '/downloads#bridge');

  // One form, one record: a server named here is the server Settings -> Playout shows.
  await dialog.getByTestId('settings-playout').getByTestId('caspar-host').fill('studio-caspar.lan');
  await dialog.getByTestId('playout-settings-close').click();
  await expect(dialog).toHaveCount(0);
  await tab.getByTestId('production-home').click();
  await tab.getByTestId('home-settings').click();
  await tab.getByTestId('settings-nav-playout').click();
  await expect(tab.getByTestId('settings').getByTestId('caspar-host')).toHaveValue('studio-caspar.lan');
});
