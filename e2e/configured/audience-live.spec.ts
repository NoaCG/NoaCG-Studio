import { test, expect } from '@playwright/test';
import { openProductionWithCurrent } from '../_create';
import { createGraphicInEditor, haveCreds, settleSync, signIn, wipeMyGraphics } from './_helpers';

// THE AUDIENCE LINK, against the real backend — the half of Phase 5 the offline suite cannot own.
//
// Everything in e2e/production-audience.spec.ts runs on the LOCAL provider, so the two things
// that actually broke were invisible to it: publishing mints a slug SERVER-side, and the readable
// name is a claim the DATABASE either accepts or refuses. Both are why the plan doc kept "the
// maintainer's live checklist" as a carried item; this spec is that checklist, run.
//
// It skips without credentials, and it cleans up after itself: the production is unpublished and
// the graphics library wiped, so the throwaway account holds nothing between runs.

test.describe(() => {
  test.skip(!haveCreds, 'set E2E_EMAIL / E2E_PASSWORD to run the live audience walk');

  test('publishing derives a readable audience link, and that link opens the join page', async ({
    page,
    context,
  }) => {
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');

    // A production whose NAME is the whole point of the test: nobody types an ending anywhere
    // below, and the link still has to come out readable.
    const productionName = `Friday Night Live ${Date.now()}`;
    await openProductionWithCurrent(page, productionName);

    await page.getByTestId('production-publish').click();
    await expect(page.getByTestId('production-links')).toBeVisible({ timeout: 30_000 });

    // The audience URL is READABLE and derived — not the base64 the column defaults to.
    const joinUrl = (await page.locator('.prod-link-row', { hasText: 'Audience link' }).locator('code').textContent()) ?? '';
    const expected = `friday-night-live-${productionName.split(' ').pop()}`;
    expect(joinUrl).toContain(`/join/${expected}`);

    // …and it RESOLVES. The rewrite that serves /join/<name> is config, not code, so the only
    // honest check is opening the URL an operator would read out.
    const viewer = await context.newPage();
    await viewer.goto(joinUrl);
    await expect(viewer.locator('#join')).toContainText(productionName, { timeout: 20_000 });
    await viewer.close();

    // A hand-picked name still wins — the derived one is a default, not a policy.
    const claimed = `handpicked-${Date.now()}`;
    await page.getByTestId('join-name-input').fill(claimed);
    await page.getByTestId('join-name-claim').click();
    await expect(page.getByTestId('join-name-note')).toContainText(claimed);
    await expect(page.locator('.prod-link-row', { hasText: 'Audience link' }).locator('code')).toContainText(
      `/join/${claimed}`,
    );

    await page.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByTestId('production-publish')).toBeVisible();
    await wipeMyGraphics(page);
  });
});
