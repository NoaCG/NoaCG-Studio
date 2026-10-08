// covers: src/components/wizard/steps/{CommunityPacks,SubmitPackSheet}.tsx, src/community/{packs,packChecks,packSources}.ts, supabase/migrations/0079_community_packs.sql
//
// THE COMMUNITY PACK REVIEW LOOP (docs/work-specs/community-packs/spec.md, first slice): a NoaCG
// admin submits a folder of their own graphics from the wizard's shelf, sees it In review,
// approves it from Waiting for review, and a signed-out visitor then finds it beside the seeds and
// installs it as a production with one starter cue per graphic; Take down removes it again and the
// maker reads the reason. A signed-in account that is not an admin gets no submit door (D12).
// Needs the service_role key to mint the two accounts and grant the admin role.

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintAccount, signInOnHome, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';

const canRun = Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);
const ADMIN_EMAIL = 'e2e-pack-admin@example.test';
const MAKER_EMAIL = 'e2e-pack-maker@example.test';
const PASSWORD = 'e2e-pack-review-pw-1';
const PACK = `E2E pack ${Date.now()}`;
/** Frames for a person to look at, off by default: `NOACG_SHOTS=<dir>` writes them. */
const SHOTS = process.env.NOACG_SHOTS ?? '';

async function openShelf(page: Page): Promise<void> {
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click();
  await page.getByTestId('wz-buildmode').locator('[data-build-mode="community"]').click();
  await expect(page.getByTestId('community-packs')).toBeVisible();
  // The optional-analytics banner sits over the lower cards; decline it so it covers nothing.
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible()) await consent.getByRole('button', { name: 'No thanks' }).click();
}

test.describe('community pack review (configured)', () => {
  test.skip(!canRun, 'set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run the community pack review loop');
  test.use({ viewport: { width: 1366, height: 768 } });

  let admin: SupabaseClient;
  const ids: string[] = [];

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    ids.push(await mintAccount(admin, ADMIN_EMAIL, PASSWORD), await mintAccount(admin, MAKER_EMAIL, PASSWORD));
    const { error } = await admin.from('moderators').upsert({ user_id: ids[0], note: 'e2e community packs' });
    if (error) throw new Error(error.message);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('community_packs').delete().in('author_id', ids);
    await admin.from('moderators').delete().in('user_id', ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });

  test('an admin submits a folder, approves it, a visitor installs it, and Take down removes it', async ({ page, browser }) => {
    await signInOnHome(page, ADMIN_EMAIL, PASSWORD);
    await page.evaluate(async (folder) => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { createGraphic, setGraphicsFolder } = await import('/src/model/library.ts');
      const made = variantsFor('lower-third')
        .slice(0, 2)
        .map((v, i) => createGraphic(v.create({}), { name: `Third ${i + 1}`, packageId: null }));
      const failed = made.find((m) => m.error);
      if (failed) throw new Error(failed.error ?? '');
      const error = setGraphicsFolder(made.map((m) => m.doc.id), folder);
      if (error) throw new Error(error);
    }, PACK);

    // SUBMIT: the folder, its two graphics ticked, a description and a chosen name.
    await openShelf(page);
    await page.getByTestId('submit-pack-open').click();
    const sheet = page.getByTestId('submit-pack');
    await sheet.getByTestId('submit-pack-source').selectOption(`folder:${PACK}`);
    await expect(sheet.getByRole('checkbox')).toHaveCount(2);
    await expect(sheet.getByTestId('submit-pack-name')).toHaveValue(PACK);
    await expect(sheet.getByTestId('submit-pack-go')).toBeDisabled();
    await sheet.getByTestId('submit-pack-description').fill('Two lower thirds for a test');
    await sheet.getByTestId('submit-pack-author').fill('Pack Tester');
    await expect(sheet.getByTestId('submit-pack-findings')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/submit-sheet-desktop.png` });
    await sheet.getByTestId('submit-pack-go').click();
    await expect(sheet).toHaveCount(0);
    const mine = page.getByTestId('your-packs').locator('.wz-community-row', { hasText: PACK });
    await expect(mine).toContainText('In review');

    // Nobody else sees it yet.
    const visitor = await browser.newPage();
    await openShelf(visitor);
    await expect(visitor.locator('[data-community-pack="pub-quiz"]')).toBeVisible();
    await expect(visitor.locator('.wz-community-card', { hasText: PACK })).toHaveCount(0);

    // REVIEW: the checks run again on what was stored, then Approve.
    const review = page.getByTestId('waiting-packs').locator('.wz-community-row', { hasText: PACK });
    await expect(review).toContainText('Checks passed');
    await expect(review).toContainText('by Pack Tester');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/review-shelf-desktop.png` });
    if (SHOTS) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByTestId('your-packs').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/review-shelf-phone.png` });
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    await review.getByRole('button', { name: 'Approve' }).click();
    await expect(mine).toContainText('Live');

    // LIVE: a signed-out visitor finds it after the seeds and installs it.
    await openShelf(visitor);
    const card = visitor.locator('.wz-community-card', { hasText: PACK });
    await expect(card).toContainText('by Pack Tester');
    await expect(card).toContainText('CC BY 4.0');
    await expect(card.locator('.wz-mini iframe')).toHaveCount(1, { timeout: 15_000 });
    if (SHOTS) {
      // A live render settles after it mounts; give it a moment before the frame is taken.
      await visitor.setViewportSize({ width: 1366, height: 768 });
      await card.scrollIntoViewIfNeeded();
      await visitor.waitForTimeout(2500);
      await visitor.screenshot({ path: `${SHOTS}/shared-card-desktop.png` });
      await visitor.setViewportSize({ width: 375, height: 812 });
      await card.scrollIntoViewIfNeeded();
      await visitor.waitForTimeout(1500);
      await visitor.screenshot({ path: `${SHOTS}/shared-card-phone.png` });
      await visitor.setViewportSize({ width: 1366, height: 768 });
    }
    await card.getByRole('button', { name: `Install ${PACK}` }).click();
    await expect(visitor.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
    await expect(visitor.getByTestId('select-cue')).toHaveCount(2);

    // An account that is not an admin has no submit door while D12 holds.
    const maker = await browser.newPage();
    await signInOnHome(maker, MAKER_EMAIL, PASSWORD);
    await openShelf(maker);
    await expect(maker.locator('.wz-community-card', { hasText: PACK })).toBeVisible();
    await expect(maker.getByTestId('submit-pack-open')).toHaveCount(0);

    // TAKE DOWN with a reason the maker reads; the shelf stops offering it.
    const live = page.locator('.wz-community-card', { hasText: PACK });
    await live.getByRole('button', { name: 'Take down' }).click();
    await live.getByLabel('Reason the maker reads').fill('Test takedown');
    await live.getByRole('button', { name: 'Take down' }).click();
    await expect(live).toHaveCount(0);
    await expect(mine).toContainText('Taken down');
    await expect(mine).toContainText('Test takedown');
    await openShelf(visitor);
    await expect(visitor.locator('.wz-community-card', { hasText: PACK })).toHaveCount(0);
    // The production installed before the takedown is still the visitor's.
    await visitor.goto('/app#/home/productions');
    await expect(visitor.getByText(PACK).first()).toBeVisible();

    // WITHDRAW: the maker sends the folder again and takes it back before anyone decides.
    await page.getByTestId('submit-pack-open').click();
    const again = page.getByTestId('submit-pack');
    await again.getByTestId('submit-pack-source').selectOption(`folder:${PACK}`);
    await again.getByTestId('submit-pack-name').fill(`${PACK} again`);
    await again.getByTestId('submit-pack-description').fill('Sent to be withdrawn');
    // The name chosen on the previous pack is the only pre-fill (D15).
    await expect(again.getByTestId('submit-pack-author')).toHaveValue('Pack Tester');
    await again.getByTestId('submit-pack-go').click();
    const second = page.getByTestId('your-packs').locator('.wz-community-row', { hasText: `${PACK} again` });
    await expect(second).toContainText('In review');
    await second.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByTestId('withdraw-pack-go').click();
    await expect(second).toContainText('Withdrawn');
    await expect(page.getByTestId('waiting-packs')).toHaveCount(0);
  });
});
