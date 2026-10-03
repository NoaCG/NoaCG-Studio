// covers: src/components/control/{PanelControl.tsx,panel.css}
// covers: src/components/home/ProductionPage.tsx
//
// HARDWARE PANELS ON THE PRODUCTION PAGE, OFFLINE (docs/work-specs/hardware-panel-control/spec.md
// D6; protocol.md §6): what can be checked without a backend. The Panel door is in the header's
// Setup menu (docs/PLAYOUT_DASHBOARD.md §2, 2026-10-03), and Setup sits before ■ All out; a
// switched-off panel shows nothing else in the header. Setup stands down on a phone, and before a
// publish the panel's dialog says to publish once and offers nothing to switch on. Pairing,
// answering, relayed presses and the header's "Panel ✓" need a real backend:
// e2e/configured/panel-production-page.spec.ts walks them.

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';

test('the Panel door is in Setup, before All out, and before a publish its dialog says to publish once', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Panel Offline');

  // Off, the panel has no status in the header: only Setup, and ■ All out after it.
  await expect(page.getByTestId('panel-header-status')).toHaveCount(0);
  const x = async (id: string) => (await page.getByTestId(id).boundingBox())?.x ?? NaN;
  const [setupX, allOutX] = [await x('production-setup'), await x('verb-out-all')];
  expect(setupX).toBeLessThan(allOutX);

  await page.getByTestId('production-setup').click();
  const door = page.getByTestId('panel-open');
  await expect(door).toBeVisible();
  // Nothing runs until the switch is on, and offline there is no switch to put on.
  await expect(door).toHaveAttribute('data-state', 'off');
  await expect(door).toHaveAttribute('aria-label', 'Hardware panels (Off)');

  await door.click();
  // Choosing the item closes the menu and opens the dialog.
  await expect(page.getByTestId('production-setup-menu')).toHaveCount(0);
  const dialog = page.getByTestId('panel-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('panel-unpublished')).toHaveText('Publish this production once, then pair a panel here.');
  // No switch, no pairing and no list before a publish: the control slug they need does not exist.
  await expect(page.getByTestId('panel-answer')).toHaveCount(0);
  await expect(page.getByTestId('panel-pair')).toHaveCount(0);
  await page.getByTestId('panel-close').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('panel-header-status')).toHaveCount(0);
});

test('on a phone Setup and its Panel door stand down and All out stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Panel Phone');
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-setup')).toBeHidden();
  const allOut = await page.getByTestId('verb-out-all').boundingBox();
  expect(allOut).not.toBeNull();
  expect(allOut!.x + allOut!.width).toBeLessThanOrEqual(390);
});
