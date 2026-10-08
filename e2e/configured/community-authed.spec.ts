// covers: src/community/communityData.ts, src/components/home/{HomePage,GraphicRow}.tsx
// covers: supabase/migrations/0078_community_gallery_closed.sql
import { test, expect } from '@playwright/test';
import { settleDurableWrites } from '../_durable';
import { dismissWizard, haveCreds, settleSync, signIn, wipeMyGraphics, wipeMySubmissions } from './_helpers';

// The Era 5.5 community gallery is CLOSED to publishing (owner, 2026-10-08): the community shares
// reviewed packs only. A signed-in account finds no publish entry, and the database refuses a
// publish sent around the UI - the boundary is the server, not the missing button. What was
// already published stays read-only, so browsing still answers.

test.describe('community gallery closed to publishing (configured / signed-in)', () => {
  test.skip(!haveCreds, 'set E2E_EMAIL + E2E_PASSWORD to run the authed community suite');

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await dismissWizard(page);
    await settleSync(page);
    await wipeMyGraphics(page);
  });

  test.afterEach(async ({ page }) => {
    // Should the closure ever regress, the refused insert below becomes a live row: withdraw it.
    await wipeMySubmissions(page);
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

  test('the database refuses a direct publish and a community-assets upload', async ({ page }) => {
    const answer = await page.evaluate(async () => {
      const sb = (await (await import('/src/backend/supabase.ts')).getSupabase())!;
      const { data: who } = await sb.auth.getUser();
      const uid = who.user!.id;
      const insert = await sb
        .from('community_templates')
        .insert({ kind: 'graphic', name: 'Closed gallery E2E', summary: '', body: {} })
        .select('id');
      const upload = await sb.storage
        .from('community-assets')
        .upload(`${uid}/closed-gallery-e2e`, new Blob(['x'], { type: 'text/plain' }), { upsert: false });
      const browse = await sb.rpc('community_list', { p_kind: null, p_category: null, p_limit: 1, p_offset: 0 });
      return {
        insertCode: insert.error?.code ?? null,
        insertMessage: insert.error?.message ?? '',
        uploadRefused: Boolean(upload.error),
        uploadMessage: upload.error?.message ?? '',
        browseError: browse.error?.message ?? null,
      };
    });
    expect(answer.insertCode, answer.insertMessage).toBe('42501');
    expect(answer.insertMessage).toMatch(/community_publishing_closed/);
    expect(answer.uploadRefused, 'an upload to the public community bucket must be refused').toBe(true);
    expect(answer.uploadMessage).toMatch(/row-level security/i);
    expect(answer.browseError, 'browsing what was already published still answers').toBeNull();
  });
});
