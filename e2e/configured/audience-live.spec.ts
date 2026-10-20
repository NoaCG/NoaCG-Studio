import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { openProductionWithCurrent } from '../_create';
import { createGraphicInEditor, haveCreds, settleSync, signIn, wipeMyGraphics, unpublishForCleanup } from './_helpers';
import { openWorkspace } from '../_workspace';
import { settleDurableWrites } from '../_durable';

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

    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });

    // The audience URL is READABLE and derived — not the base64 the column defaults to. It is one of
    // the people links, under Setup › Links… (playout-workflow-simplification AC-8).
    await page.keyboard.press('Escape');
    await page.getByTestId('production-setup').click();
    await page.getByTestId('setup-links').click();
    const joinUrl = (await page.getByTestId('join-url').locator('code').textContent()) ?? '';
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
    await expect(page.getByTestId('join-url').locator('code')).toContainText(`/join/${claimed}`);
    await page.getByTestId('production-links-close').click();

    await unpublishForCleanup(page);
    await expect(page.getByTestId('production-publish')).toBeVisible();
    await wipeMyGraphics(page);
  });

  test('a pasted message on a published production goes through the operator door, and prepares safely', async ({ page }) => {
    // data-sources C0, the published half: paste reaches the REAL inbox through
    // `audience_operator_add` (migration 0095, the control slug), survives a reload because the
    // database holds it, and prepares a cue on a card the operator accepts; a batch over 100 is
    // refused by the server itself; a binding on the card's prepared Question is refused.
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');
    const showId = await openProductionWithCurrent(page, `Paste Live ${Date.now()}`);
    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');

    const messages = await openWorkspace(page, 'audience');
    await messages.getByTestId('message-paste-name').fill('Ana');
    await messages.getByTestId('message-paste-body').fill('Pasted on a published production');
    await messages.getByTestId('message-paste-add').click();
    const row = messages.locator('.pd-aud-row', { hasText: 'Pasted on a published production' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId('audience-provenance')).toHaveText('Pasted');
    await messages.reload();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // The server's own bound, asked directly: 101 items is refused before anything is written.
    const refused = await messages.evaluate(async (id) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const slug = loadShows().find((s) => s.id === id)?.hostedSlug;
      const sb = await getSupabase();
      const items = Array.from({ length: 101 }, (_, i) => ({ body: `bulk ${i}` }));
      const { error } = await sb!.rpc('audience_operator_add', { p_slug: slug, p_items: items });
      return error?.message ?? null;
    }, showId);
    expect(refused).toContain('at most 100');
    await expect(messages.locator('.pd-aud-row', { hasText: 'bulk 0' })).toHaveCount(0);

    // A lower third holds no message, so Prepare offers the cards; one press adds card and cue.
    await row.getByTestId('audience-prepare').click();
    await expect(row.getByTestId('audience-no-destination')).toBeVisible();
    await row.getByTestId('audience-choose-card').first().click();
    await expect(messages.getByTestId('audience-note')).toContainText('It airs when you Take it', { timeout: 20_000 });
    await settleDurableWrites(messages);

    // The card's Question now holds a prepared message: a binding on it is refused.
    const bound = await messages.evaluate(async (id) => {
      const shows = await import('/src/model/shows.ts');
      const show = shows.loadShows().find((s) => s.id === id)!;
      const card = show.graphics.find((g) => (g.template.fields ?? []).some((f) => f.title === 'Question'))!;
      const question = (card.template.fields ?? []).find((f) => f.title === 'Question')!.field;
      shows.setFieldBinding(id, card.name, question, 'feed.question');
      return shows.loadShows().find((s) => s.id === id)?.bindings?.[card.name]?.[question] ?? null;
    }, showId);
    expect(bound).toBeNull();

    await messages.close();
    await unpublishForCleanup(page);
    await wipeMyGraphics(page);
  });
});
