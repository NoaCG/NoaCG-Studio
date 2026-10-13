import { test, expect } from '@playwright/test';
import { open, draw, source } from './_layerProperty';
test('leave decision precedes Home on an edited never-saved graphic', async ({page}) => {
 await open(page); await draw(page,.3); const edited=await source(page);
 await page.getByTestId('open-home').click();
 await expect(page.getByTestId('editor-foundation')).toBeVisible();
 await expect(page.getByTestId('home-page')).toHaveCount(0);
 await expect(page.getByTestId('confirm-switch')).toBeVisible();
 expect(await source(page)).toEqual(edited);
 await page.screenshot({path:test.info().outputPath('leave-dialog.png')});
});
