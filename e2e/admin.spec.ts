// covers: api/me/**, scripts/meDevPlugin.mjs, src/backend/myEntitlement.ts
// covers: src/components/useMyEntitlement.ts, src/entitlements/**
//
// The dashboard is retired; this live-product entitlement regression remains.
import { test, expect } from '@playwright/test';
import { resultTotal } from './_browse';

test('offline: the entitlement endpoint is absent and the catalog stays whole', async ({ page, request }) => {
  const response = await request.get('/api/me/entitlement');
  const body = response.ok() ? ((await response.json()) as { hiddenTemplates: string[] }) : null;
  // Either the route answers the anonymous defaults, or it is not there at all. What it must
  // never do is come back with something hidden.
  if (body) expect(body.hiddenTemplates).toEqual([]);

  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  // The browse grid renders real cards, so nothing filtered the catalog away. Read the
  // step's own count line rather than the cards: the grid shows a first page now
  // (re-design/handoff.md §2b), and the claim here is about the CATALOG, not the page.
  await expect(page.locator('.wz-variant').first()).toBeVisible();
  expect(await resultTotal(page)).toBeGreaterThan(5);
});
