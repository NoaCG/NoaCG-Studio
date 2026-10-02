// covers: src/components/control/{PanelControl.tsx,panel.css}
// covers: src/components/home/ProductionPage.tsx
//
// HARDWARE PANELS ON THE PRODUCTION PAGE, OFFLINE (docs/work-specs/hardware-panel-control/spec.md
// D6; protocol.md §6): what can be checked without a backend. The Panel door is in the header's
// right cluster, left of Export and ■ All out so its changing words never move them, stands down on
// a phone, and before a publish its dialog says to publish once and offers nothing to switch on.
// Pairing, answering and relayed presses need a real backend: e2e/configured/
// panel-production-page.spec.ts walks them.

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';

test('the Panel door sits before Export and All out, and before a publish its dialog says to publish once', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Panel Offline');

  const door = page.getByTestId('panel-open');
  await expect(door).toBeVisible();
  // Nothing runs until the switch is on, and offline there is no switch to put on.
  await expect(door).toHaveAttribute('data-state', 'off');
  await expect(door).toHaveAttribute('aria-label', 'Hardware panels (Off)');

  // Operators reach for Export and ■ All out by position: the door comes before both.
  const x = async (id: string) => (await page.getByTestId(id).boundingBox())?.x ?? NaN;
  const [doorX, exportX, allOutX] = [await x('panel-open'), await x('export-production'), await x('verb-out-all')];
  expect(doorX).toBeLessThan(exportX);
  expect(exportX).toBeLessThan(allOutX);

  await door.click();
  const dialog = page.getByTestId('panel-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('panel-unpublished')).toHaveText('Publish this production once, then pair a panel here.');
  // No switch, no pairing and no list before a publish: the control slug they need does not exist.
  await expect(page.getByTestId('panel-answer')).toHaveCount(0);
  await expect(page.getByTestId('panel-pair')).toHaveCount(0);
  await page.getByTestId('panel-close').click();
  await expect(dialog).toBeHidden();
  await expect(door).toHaveAttribute('data-state', 'off');
});

test('on a phone the Panel door stands down and All out stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Panel Phone');
  await expect(page.getByTestId('panel-open')).toBeHidden();
  const allOut = await page.getByTestId('verb-out-all').boundingBox();
  expect(allOut).not.toBeNull();
  expect(allOut!.x + allOut!.width).toBeLessThanOrEqual(390);
});
