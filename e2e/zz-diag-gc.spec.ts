import { test, expect } from '@playwright/test';

// DIAG-TEMP: does a forced GC during an awaited evaluate reproduce the CI error?
test('diag: evaluate with dynamic import under forced GC', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible({ timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  let stop = false;
  const gcLoop = (async () => {
    while (!stop) await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  })();
  const errors: string[] = [];
  for (let i = 0; i < 60; i++) {
    try {
      await page.evaluate(async (n) => {
        const { useAdvancedMode } = await import('/src/components/useAdvancedMode.ts');
        await import(`/src/model/prefs.ts?diag=${n}`);
        useAdvancedMode.getState().setAdvanced(n % 2 === 0);
      }, i);
    } catch (e) {
      errors.push(String((e as Error).message).slice(0, 200));
    }
  }
  stop = true;
  await gcLoop;
  console.log('[DIAG] errors', errors.length, JSON.stringify(errors.slice(0, 3)));
});
