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

  test('a message Sheet on a published production imports through the operator door, once per row', async ({ page }) => {
    // data-sources C3, the published half: Sheet rows reach the REAL inbox through
    // `audience_operator_add` with their row identity as `external_id`; the database's unique index
    // (migration 0098) keeps one row per id even for two calls at once; `audience_operator_settle`
    // removes an unused candidate whose row left the Sheet and keeps a used one, marked.
    test.setTimeout(110_000);
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');
    const showId = await openProductionWithCurrent(page, `Sheet Messages Live ${Date.now()}`);
    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');

    const tab = { csv: 'Name,Message,Source,Reference\nAna,Kept once,WhatsApp,+358 40 000 0001\nBo,Leaves unused,,\nCy,Used then gone,,\n' };
    await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv }),
    );
    const messages = await openWorkspace(page, 'audience');
    await messages.getByTestId('chat-add-platform').selectOption('sheet');
    await messages.getByTestId('sheet-add-link').fill('https://docs.google.com/spreadsheets/d/1NoaCGMessageSheetLive0000/edit#gid=0');
    await messages.getByTestId('chat-add-connect').click();
    const rows = messages.locator('.pd-aud-row');
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    await expect(rows.filter({ hasText: 'Kept once' }).getByTestId('audience-provenance')).toHaveText('Sheet: Messages · WhatsApp · +358 40 000 0001');

    // The database holds them: a reload reads them back, once each, while the reader keeps reading.
    await messages.reload();
    await expect(rows).toHaveCount(3, { timeout: 20_000 });

    const slugOf = async () =>
      messages.evaluate(async (id) => {
        const { loadShows } = await import('/src/model/shows.ts');
        return loadShows().find((s) => s.id === id)?.hostedSlug ?? null;
      }, showId);
    const slug = await slugOf();
    expect(slug).toBeTruthy();

    // Two adds of one id at the same moment: one row, and neither call fails.
    const raced = await messages.evaluate(async (s) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = (await getSupabase())!;
      const items = [{ body: 'Raced import', external_id: 'yt:configured-race' }];
      const [a, b] = await Promise.all([
        sb.rpc('audience_operator_add', { p_slug: s, p_items: items }),
        sb.rpc('audience_operator_add', { p_slug: s, p_items: items }),
      ]);
      return { added: (a.data?.length ?? 0) + (b.data?.length ?? 0), errors: [a.error?.message, b.error?.message].filter(Boolean) };
    }, slug);
    expect(raced).toEqual({ added: 1, errors: [] });
    await messages.getByTestId('audience-filter-all').click();
    await expect(rows.filter({ hasText: 'Raced import' })).toHaveCount(1, { timeout: 20_000 });

    // Cy's message is used (prepared into a cue elsewhere); then Bo's and Cy's rows leave the Sheet.
    const used = await messages.evaluate(async (s) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = (await getSupabase())!;
      const { data } = await sb.rpc('audience_list', { p_slug: s });
      const cy = (data as { id: string; body: string }[]).find((r) => r.body === 'Used then gone')!;
      const { error } = await sb.rpc('audience_update', { p_slug: s, p_id: cy.id, p_patch: { used_at: new Date().toISOString() } });
      return error?.message ?? null;
    }, slug);
    expect(used).toBeNull();
    tab.csv = 'Name,Message,Source,Reference\nAna,Kept once,WhatsApp,+358 40 000 0001\n';
    await expect(rows.filter({ hasText: 'Leaves unused' })).toHaveCount(0, { timeout: 30_000 });
    const gone = rows.filter({ hasText: 'Used then gone' });
    await expect(gone.getByTestId('audience-withdrawn')).toHaveText('no longer in the Sheet', { timeout: 20_000 });
    await expect(rows.filter({ hasText: 'Kept once' })).toHaveCount(1);

    // A prefix that is not a Sheet source's is refused by the server.
    const refused = await messages.evaluate(async (s) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const { error } = await (await getSupabase())!.rpc('audience_operator_settle', { p_slug: s, p_prefix: 'yt:', p_present: [] });
      return error?.message ?? null;
    }, slug);
    expect(refused).toContain('not an imported source');
    await expect(rows.filter({ hasText: 'Raced import' })).toHaveCount(1);

    await messages.close();
    await unpublishForCleanup(page);
    await wipeMyGraphics(page);
  });

  test('the published walk: a phone sends a message and a vote, the presenter view follows, and only Take airs (audience AC-5)', async ({
    page,
    browser,
  }) => {
    // audience-flow AC-5, walked on the local stack (data-sources C7): the join page on a
    // phone-sized browser, the presenter view and a vote on air. A submitted message reaches the
    // inbox; presenter selection changes the presenter view and takes no graphic; the staged vote
    // airs only through the operator's Take.
    test.setTimeout(115_000);
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Polls', 'House Vote');
    await openProductionWithCurrent(page, `Audience Walk ${Date.now()}`);
    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('production-setup').click();
    await page.getByTestId('setup-links').click();
    const link = async (id: string) => ((await page.getByTestId(id).locator('code').textContent()) ?? '').trim();
    const joinUrl = await link('join-url');
    const presenterUrl = await link('presenter-url');
    expect(joinUrl).toContain('/join/');
    expect(presenterUrl).toContain('/join?pv=');
    await page.getByTestId('production-links-close').click();
    const nothingOnAir = () => expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

    const messages = await openWorkspace(page, 'audience');
    await messages.getByTestId('audience-open').check();

    // The phone: a small touch screen, nothing wider than it, a message sent.
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await phoneContext.newPage();
    await phone.goto(joinUrl);
    await expect(phone.locator('#join .nj-send')).toBeVisible({ timeout: 20_000 });
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await phone.locator('#nj-author').fill('Ana');
    await phone.locator('#nj-body').fill('Sent from a phone on the walk');
    await phone.locator('#join .nj-send').tap();
    await expect(phone.locator('#join .nj-mine')).toContainText('Sent from a phone on the walk', { timeout: 20_000 });
    const row = messages.locator('.pd-aud-row', { hasText: 'Sent from a phone on the walk' });
    await expect(row).toBeVisible({ timeout: 20_000 });

    // The presenter view: pointing at the message changes it and airs nothing.
    const presenter = await page.context().newPage();
    await presenter.goto(presenterUrl);
    await expect(presenter.locator('#join')).toContainText('Nothing queued yet.', { timeout: 20_000 });
    await row.getByTestId('audience-more').click();
    await messages.getByTestId('audience-presenter-now').click();
    await expect(presenter.locator('#join .nj-prompt')).toHaveText('Sent from a phone on the walk', { timeout: 20_000 });
    await nothingOnAir();

    // The vote: the phone votes, the operator stages it, and nothing airs until Take.
    await messages.getByTestId('audience-round-question').fill('Who wins the walk?');
    await messages.getByTestId('audience-round-options').fill('Home\nAway');
    await messages.getByTestId('audience-round-open').click();
    await expect(phone.locator('#join .nj-opt')).toHaveCount(2, { timeout: 20_000 });
    await phone.locator('#join .nj-opt').nth(1).tap();
    await expect(phone.locator('#join .nj-opt').nth(1)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expect(messages.getByTestId('audience-tally-1')).toHaveText('1', { timeout: 20_000 });
    await messages.getByTestId('audience-round-stage').click();
    await settleDurableWrites(messages);
    await nothingOnAir();
    const voteCue = page.locator('.pd-cue', { hasText: 'Vote —' });
    await expect(voteCue).toHaveCount(1, { timeout: 20_000 });
    await voteCue.click();
    await nothingOnAir();
    await page.getByTestId('verb-take').click();
    const program = page.frameLocator('[data-testid="program-stage"] iframe');
    await expect(program.locator('body')).toContainText('Who wins the walk?', { timeout: 20_000 });
    await expect(program.locator('body')).toContainText('Away');

    await phoneContext.close();
    await presenter.close();
    await messages.close();
    await unpublishForCleanup(page);
    await wipeMyGraphics(page);
  });
});
