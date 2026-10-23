// covers: src/components/home/{ProductionSetupMenu.tsx,useAudienceInbox.ts}
// covers: src/components/home/ProductionPage.tsx
// covers: src/components/home/{ProductionDataPanel,ProductionDataWorkspace,SourcesLine}.tsx
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/ProductionShell.tsx
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
//
// THE PRODUCTION HEADER, DECLUTTERED (docs/PLAYOUT_DASHBOARD.md §2, owner 2026-10-03: "the
// playout page is getting crowded"). What is pressed live stays in the header; the doors opened
// before a show are one Setup menu left of ■ All out, which always lists Data and Messages
// (data-sources C0: the door never moves); and the two views are in the switcher only while the
// production uses them, so a plain production shows Playout alone. A view the operator is
// standing on never leaves the switcher, and Messages (the Audience view, renamed; its route is
// still `audience`) counts what waits in its inbox. Offline, so Share is absent
// (e2e/auth.spec.ts pins that) and the inbox is the local one.

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { expectPlayoutStillOpen, openWorkspace } from './_workspace';
import { settleDurableWrites } from './_durable';

test('a plain production shows Playout alone, and Setup holds every other door one press away', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Plain Show');

  // No switcher at all: Playout is the only view this production uses.
  await expect(page.getByTestId('production-setup')).toBeVisible();
  await expect(page.locator('.pd-tabs')).toHaveCount(0);
  await expect(page.getByTestId('tab-playout')).toHaveCount(0);
  // Export and the Panel door are no longer header buttons of their own.
  await expect(page.getByTestId('export-production')).toHaveCount(0);
  await expect(page.getByTestId('panel-open')).toHaveCount(0);

  // Setup, in its order: the panel, Playout settings, Export, then the two views, always.
  const setup = page.getByTestId('production-setup');
  await setup.click();
  const menu = page.getByTestId('production-setup-menu');
  await expect(setup).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('menuitem')).toHaveText([
    /Stream Deck panel…\s*Off/,
    /Playout settings…/,
    /Export…/,
    'Data…',
    'Messages…',
  ]);

  // Each door works from there, and choosing one closes the menu.
  await menu.getByTestId('setup-playout-settings').click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('playout-settings')).toBeVisible();
  await page.getByTestId('playout-settings-close').click();
  await expect(page.getByTestId('playout-settings')).toHaveCount(0);

  await setup.click();
  await page.getByTestId('export-production').click();
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await page.getByTestId('production-export-dialog').locator('.gallery-close').click();
  await expect(page.getByTestId('production-export-dialog')).toBeHidden();

  // Escape closes it without choosing anything, and the keys are the operator's again.
  await setup.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('Data… opens Data in its own tab, and once the production has a table Data joins the switcher', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Data Show');

  await page.getByTestId('production-setup').click();
  const [data] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId('setup-data').click()]);
  await expect(data.getByTestId('production-data')).toBeVisible();
  // The view you stand on is listed even before the production uses it: it never vanishes under you.
  await expect(data.getByTestId('tab-data')).toHaveAttribute('aria-current', 'page');
  await expect(data.getByTestId('tab-playout')).toBeVisible();
  await expect(data.getByTestId('tab-audience')).toHaveCount(0);
  await expectPlayoutStillOpen(page);
  await expect(page.getByTestId('tab-data')).toHaveCount(0);

  // A table makes it a production that uses Data: the Playout tab's switcher shows it now, and
  // Setup still lists both views, so neither door moves.
  await data.getByTestId('add-dataset').click();
  await settleDurableWrites(data);
  await expect(page.getByTestId('tab-data')).toBeVisible();
  await expect(page.getByTestId('tab-playout')).toHaveClass(/\bon\b/);
  await page.getByTestId('production-setup').click();
  await expect(page.getByTestId('setup-data')).toHaveText('Data…');
  await expect(page.getByTestId('setup-audience')).toHaveText('Messages…');
});

test('a production with an audience graphic lists Messages, which counts the messages waiting', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await openProductionWithCurrent(page, 'Phone In');

  // An audience card in the pool: Messages is in the switcher from the start, Data is not.
  await expect(page.getByTestId('tab-audience')).toHaveText('Messages');
  await expect(page.getByTestId('tab-data')).toHaveCount(0);
  await expect(page.getByTestId('tab-audience-count')).toHaveCount(0);

  const [audience] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId('tab-audience').click()]);
  await expect(audience.getByTestId('production-audience')).toBeVisible();
  await expect(audience.getByTestId('tab-audience-count')).toHaveCount(0);

  // Three arrive: "Messages 3". Approving one leaves two waiting.
  await audience.getByTestId('audience-simulate').click();
  await expect(audience.getByTestId('tab-audience')).toHaveText('Messages3');
  await expect(audience.getByTestId('tab-audience-count')).toHaveText('3');
  await audience.locator('.pd-aud-row').first().getByTestId('audience-more').click();
  await audience.getByTestId('audience-approve').click();
  await expect(audience.getByTestId('tab-audience-count')).toHaveText('2');
});

// THE DATA OVERVIEW (data-sources C1c, AC-9; sheet-data-flow AC-9): Data opens on what the
// production uses, in the one vocabulary - every source with who reads it, how often, last checked
// and last changed, and Pause; every value under where it comes from with the graphics showing
// it. Paths, the seed, Raw JSON and the per-field table sit behind Advanced, and still work.
test('Data opens on an overview of sources and values in the one vocabulary, and Advanced holds the rest', async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: 'Name,Value\nName,Ann Lee\nTitle,"Chief\nEditor"\n' }),
  );
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Overview Night');
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill('https://docs.google.com/spreadsheets/d/1NoaCGStubSheet0000000000/edit#gid=0');
  await review.getByTestId('cue-connect-read').click();
  await review.getByTestId('cue-connect-label').fill('Guests');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('sources-line')).toContainText('checked');

  const data = await openWorkspace(page, 'data');
  const overview = data.getByTestId('data-overview');
  // The source: what it is, who reads it and how often, checked versus changed, who follows it.
  const source = overview.getByTestId(/^data-source-s[0-9a-f]+$/);
  await expect(source.locator('h4')).toHaveText('Sheet: Guests');
  await expect(source.getByTestId('data-source-reader')).toHaveText('Read by another tab of this production, about every 5 s');
  await expect(source.getByTestId('data-source-status')).toHaveText(/^checked \d+ s ago · changed \d+ s ago$/);
  await expect(source.getByTestId('data-source-users')).toHaveText('Followed by Hairline');
  // Its value, by the name the Sheet gives it, and the graphic showing it.
  const name = overview.getByTestId(/^data-item-sheet\..*\.values\.Name$/);
  await expect(name).toContainText('Name');
  await expect(name.getByTestId('data-item-value')).toHaveValue('Ann Lee');
  await expect(name.getByTestId('data-item-users')).toHaveText('Shown by Hairline');
  // A cell with a line break is read here, never typed into a one-line box that would flatten it.
  const lines = overview.getByTestId(/^data-item-sheet\..*\.values\.Title$/);
  await expect(lines.getByTestId('data-item-value')).toHaveText('2 lines: Chief … · edit it in the Sheet');

  // The default surface speaks the one vocabulary.
  const words = await data.getByTestId('production-data').evaluate((el) => (el as HTMLElement).innerText);
  expect(words).not.toMatch(/\bpaths?\b|\bseed\b|raw json|\bbindings?\b/i);

  // Advanced holds the tree by its paths, and it still works: a value added there is local
  // content on the overview, with no freshness to report because nothing reads it.
  await data.getByTestId('data-advanced-toggle').click();
  await expect(data.getByTestId('data-raw-toggle')).toBeVisible();
  await expect(data.getByTestId('production-bindings')).toBeVisible();
  await data.getByTestId('data-new-path').fill('show.title');
  await data.getByTestId('data-new-value').fill('Helsinki');
  await data.getByTestId('data-add').click();
  const local = data.getByTestId('data-local');
  const title = local.getByTestId('data-item-show.title');
  await expect(title.getByTestId('data-item-value')).toHaveValue('Helsinki');
  await expect(title.getByTestId('data-item-users')).toHaveText('Not shown by any graphic');
  await expect(local).not.toContainText('checked');
  // A value typed on the overview is the same value Advanced shows.
  await title.getByTestId('data-item-value').fill('Tampere');
  await title.getByTestId('data-item-value').press('Enter');
  await expect(data.getByTestId('data-value-show.title')).toHaveValue('Tampere');

  // Pause from the overview reaches the Playout line; Resume reads again.
  await source.getByTestId('data-source-pause').click();
  await expect(source.getByTestId('data-source-reader')).toHaveText('Paused: not read until Resume');
  await expect(page.getByTestId('sources-line')).toContainText('Sheet: Guests · paused');
  await source.getByTestId('data-source-pause').click();
  await expect(page.getByTestId('sources-line')).toContainText('checked', { timeout: 10_000 });
});
