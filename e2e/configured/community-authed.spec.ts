// covers: src/components/home/{HomePage,GraphicRow}.tsx
// covers: supabase/migrations/0078_community_gallery_closed.sql, supabase/migrations/0085_community_gallery_retired.sql
import { test, expect } from '@playwright/test';
import { settleDurableWrites } from '../_durable';
import { dismissWizard, haveCreds, settleSync, signIn, wipeMyGraphics } from './_helpers';

// The Era 5.5 community gallery closed to publishing (owner, 2026-10-08: the community shares
// reviewed packs only) and its tables are retired (0085). A signed-in account finds no publish
// entry, and a publish sent around the UI is refused by the server - the boundary is the server,
// not the missing button. The community-assets bucket stays, still refusing every upload.

test.describe('community gallery closed to publishing (configured / signed-in)', () => {
  test.skip(!haveCreds, 'set E2E_EMAIL + E2E_PASSWORD to run the authed community suite');

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await dismissWizard(page);
    await settleSync(page);
    await wipeMyGraphics(page);
  });

  test.afterEach(async ({ page }) => {
    await wipeMyGraphics(page);
  });

  test('a saved graphic offers no publish entry to a signed-in account', async ({ page }) => {
    const seeded = await page.evaluate(async () => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { createGraphic } = await import('/src/model/library.ts');
      const template = variantsFor('lower-third')[0].create({});
      return createGraphic({ ...template, name: 'Closed gallery E2E' }, { name: 'Closed gallery E2E' }).error;
    });
    expect(seeded).toBeNull();
    await settleDurableWrites(page);
    await page.goto('/app#/home/graphics');
    const row = page.locator('.lib-row', { hasText: 'Closed gallery E2E' });
    await expect(row).toBeVisible();
    await row.getByTestId('row-menu').click();
    await expect(page.getByTestId('export-graphic')).toBeVisible(); // the menu IS open
    await expect(page.getByTestId('publish-graphic')).toHaveCount(0);
    await expect(page.getByTestId('publish-sheet')).toHaveCount(0);
  });

  test('the server refuses a direct publish and a community-assets upload', async ({ page }) => {
    const answer = await page.evaluate(async () => {
      const sb = (await (await import('/src/backend/supabase.ts')).getSupabase())!;
      const { data: who } = await sb.auth.getUser();
      const uid = who.user!.id;
      // Refused either way: by 0078's policy while the table exists, as an unknown table after 0085.
      const insert = await sb
        .from('community_templates')
        .insert({ kind: 'graphic', name: 'Closed gallery E2E', summary: '', body: {} })
        .select('id');
      const upload = await sb.storage
        .from('community-assets')
        .upload(`${uid}/closed-gallery-e2e`, new Blob(['x'], { type: 'text/plain' }), { upsert: false });
      return {
        insertCode: insert.error?.code ?? null,
        insertMessage: insert.error?.message ?? '',
        uploadRefused: Boolean(upload.error),
        uploadMessage: upload.error?.message ?? '',
      };
    });
    // 42501: 0078's policy refused it, on a database 0085 has not reached yet (hosted staging until
    // it is pushed there). PGRST205: no such table. Keep only PGRST205 once 0085 is everywhere.
    expect(['42501', 'PGRST205'], answer.insertMessage).toContain(answer.insertCode);
    expect(answer.uploadRefused, 'an upload to the public community bucket must be refused').toBe(true);
    expect(answer.uploadMessage).toMatch(/row-level security/i);
  });
});
