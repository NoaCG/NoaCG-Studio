import { expect, type Page } from '@playwright/test';

/**
 * Real OS auto-repeat. `page.keyboard.down()` sends ONE keydown and never repeats, which is why
 * the first fix for the Space-pan bug looked green while the actual held-key gesture stayed
 * broken - only the first keydown was ever covered. Anything that guards a HELD key needs this.
 */
export async function holdKeyRepeats(page: Page, n: number, code = 'Space', key = ' '): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < n; i++) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', code, key, windowsVirtualKeyCode: key === ' ' ? 32 : 0, autoRepeat: true,
    });
  }
  await cdp.detach();
  await page.waitForTimeout(250);
}

/**
 * Put focus somewhere Space means nothing, so a press can only be answered by the surface under
 * test.
 *
 * Space belongs to a FOCUSED BUTTON (spaceKey.ts), and
 * clicking any panel or toolbar control leaves one focused - the Data tab's "+ Add" is the usual
 * culprit, since adding a field is how these specs get something to aim at. Whether that button
 * is STILL focused when a later Space lands is decided by unrelated timing: the new field arrives
 * selected, and half a second later the Inspector's deferred reveal swaps the Data panel out from
 * under it, dropping focus to the body. Win that race and Space plays; lose it and Space clicks
 * "+ Add" again - a green run and a red one testing different things. So a spec about who owns
 * Space states this precondition instead of inheriting it.
 */
export async function parkFocusOffControls(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // ACTIVATABLE in spaceKey.ts - the same set the app asks about.
  const stillOnAControl = await page.evaluate(() =>
    !!(document.activeElement as HTMLElement | null)?.closest('button, [role="button"], a[href], summary'));
  expect(stillOnAControl).toBe(false);
}
