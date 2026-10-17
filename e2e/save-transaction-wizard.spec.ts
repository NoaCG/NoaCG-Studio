// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/wizard/shell/walkState.ts, src/components/wizard/shell/doors.ts, src/components/wizard/steps/FinishStep.tsx
// covers: src/components/save/StorageAlertDialog.tsx, src/app/router.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 6): the wizard's Finish doors, a write refused
// on the production door and the export door pressed twice while its record write is held.
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';
import { type Write, acted, arm, errors, install, library, release, releasable } from './_saveMatrix';

async function toFinish(page: Page, name: string) {
  await page.goto('/app#/new');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-name').fill(name);
  await install(page);
}

for (const w of ['R', 'L', 'K', 'F'] as Write[]) {
  test(`matrix wizard production door refuse+retry: ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    await toFinish(page, 'Matrix wizard');
    await arm(page, w, 'refuse');
    const go = async () => { await page.getByTestId('wz-finish-production-go').click(); await page.getByTestId('wz-finish-production-confirm-go').click(); };
    await go();
    await expect.poll(() => acted(page)).toEqual([`refuse ${w}`]);
    if (w !== 'F' && w !== 'R') {
      await expect(page.getByTestId('storage-alert')).toBeVisible();
      expect(await library(page)).toHaveLength(w === 'K' ? 1 : 0);
      await page.getByTestId('storage-alert-close').click();
      await go();
    }
    await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
    expect(await errors(page)).toBe(0);
    const all = await library(page);
    expect(all.map(g => g.name)).toEqual(['Matrix wizard']);
    await settleDurableWrites(page);
    const shows = await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows().length);
    expect(shows).toBe(1);
  });
}

for (const renamed of [false, true]) {
  test(`matrix wizard export door double, ${renamed ? 'renamed' : 'same name'}: L`, async ({ page }) => {
    test.setTimeout(120_000);
    await toFinish(page, 'Matrix export');
    await arm(page, 'L', 'hold');
    await page.getByTestId('wz-finish-export').click(); await releasable(page);
    if (renamed) await page.getByTestId('wz-finish-name').fill('Matrix export renamed');
    await page.getByTestId('wz-finish-export').click();
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    await release(page);
    await expect(page.getByTestId('export-window')).toBeVisible();
    await expect.poll(async () => (await library(page)).map(g => g.name)).toEqual([renamed ? 'Matrix export renamed' : 'Matrix export']);
    await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
    expect(await library(page), 'the door minted a second record for one walk').toHaveLength(1);
    expect(await errors(page)).toBe(0);
  });
}
