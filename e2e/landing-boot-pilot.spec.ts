import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
// covers: none
test('measure warm app readiness in fresh contexts', async ({ browser, baseURL }) => {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const start = performance.now();
    await page.goto(baseURL + '/app#/home');
    const navigationMs = performance.now() - start;
    await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
    samples.push({ navigationMs, readyMs: performance.now()-start });
    await context.close();
  }
  writeFileSync('boot-pilot.json', JSON.stringify(samples, null, 2));
  console.log('BOOT_PILOT', JSON.stringify(samples));
});
