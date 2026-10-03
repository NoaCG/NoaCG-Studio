// covers: src/components/home/{ProductionSetupMenu.tsx,useAudienceInbox.ts}
// covers: src/components/home/ProductionPage.tsx
//
// THE PRODUCTION HEADER, DECLUTTERED (docs/PLAYOUT_DASHBOARD.md §2, owner 2026-10-03: "the
// playout page is getting crowded"). What is pressed live stays in the header; the doors opened
// before a show are one Setup menu left of ■ All out; and the Data and Audience views are in the
// switcher only while the production uses them, so a plain production shows Playout alone. A
// view the operator is standing on never leaves the switcher, and Audience counts what waits in
// its inbox. Offline, so Share is absent (e2e/auth.spec.ts pins that) and the audience is the
// rehearsal one, whose inbox lives in the Audience tab itself.

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { expectPlayoutStillOpen } from './_workspace';
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

  // Setup, in its order: the panel, Playout settings, Export, then the two views it does not use.
  const setup = page.getByTestId('production-setup');
  await setup.click();
  const menu = page.getByTestId('production-setup-menu');
  await expect(setup).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('menuitem')).toHaveText([
    /Stream Deck panel…\s*Off/,
    /Playout settings…/,
    /Export…/,
    'Add data source…',
    'Turn on audience…',
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

test('Add data source opens Data in its own tab, and once the production has a table Data joins the switcher', async ({ page }) => {
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
  // Setup stops offering it.
  await data.getByTestId('add-dataset').click();
  await settleDurableWrites(data);
  await expect(page.getByTestId('tab-data')).toBeVisible();
  await expect(page.getByTestId('tab-playout')).toHaveClass(/\bon\b/);
  await page.getByTestId('production-setup').click();
  await expect(page.getByTestId('setup-data')).toHaveCount(0);
  await expect(page.getByTestId('setup-audience')).toBeVisible();
});

test('a production with an audience graphic lists Audience, which counts the submissions waiting', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Q&A' });
  await openProductionWithCurrent(page, 'Phone In');

  // An audience card in the pool: Audience is in the switcher from the start, Data is not.
  await expect(page.getByTestId('tab-audience')).toBeVisible();
  await expect(page.getByTestId('tab-data')).toHaveCount(0);
  await expect(page.getByTestId('tab-audience-count')).toHaveCount(0);

  const [audience] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId('tab-audience').click()]);
  await expect(audience.getByTestId('production-audience')).toBeVisible();
  await expect(audience.getByTestId('tab-audience-count')).toHaveCount(0);

  // Three arrive: "Audience 3". Approving one leaves two waiting.
  await audience.getByTestId('audience-simulate').click();
  await expect(audience.getByTestId('tab-audience')).toHaveText('Audience3');
  await expect(audience.getByTestId('tab-audience-count')).toHaveText('3');
  await audience.locator('.pd-aud-row').first().getByTestId('audience-approve').click();
  await expect(audience.getByTestId('tab-audience-count')).toHaveText('2');
});
