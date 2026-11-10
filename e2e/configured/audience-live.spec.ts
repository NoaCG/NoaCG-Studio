// covers: src/audience/**, src/components/home/{ProductionAudienceWorkspace.tsx,useAudienceInbox.ts}
// covers: src/components/home/InteractionQuestions.tsx, src/model/questions.ts
// covers: supabase/migrations/0111_audience_questions.sql
// covers: src/join/**, join.html, scripts/app-clean-url.mjs, src/control/joinLogo.ts
// covers: supabase/migrations/0112_join_logos.sql
// covers: supabase/migrations/0113_audience_chat_votes.sql

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview } from 'vite';
import { appCleanUrl } from '../../scripts/app-clean-url.mjs';
import { qrReader } from '../_qr';
import { publishProduction } from '../_publish';
import { test, expect, type Browser } from '@playwright/test';
import { openProductionWithCurrent } from '../_create';
import { createGraphicInEditor, haveCreds, settleSync, signIn, wipeMyGraphics, unpublishForCleanup } from './_helpers';
import { openWorkspace } from '../_workspace';
import { settleDurableWrites } from '../_durable';
import { addQuestion, addResults, goLive, moreWaysIn, stopLive } from '../_interaction';

// THE AUDIENCE LINK, against the real backend — the half of Phase 5 the offline suite cannot own.
//
// Everything in e2e/production-audience.spec.ts runs on the LOCAL provider, so the two things
// that actually broke were invisible to it: publishing mints a slug SERVER-side, and the readable
// name is a claim the DATABASE either accepts or refuses. Both are why the plan doc kept "the
// maintainer's live checklist" as a carried item; this spec is that checklist, run.
//
// It skips without credentials, and it cleans up after itself: the production is unpublished and
// the graphics library wiped, so the throwaway account holds nothing between runs.

// The phone profile of interaction spec AC-5: 1.6 Mbps down, 750 kbps up, 563 ms latency, a new
// context (empty cache) each run, 390 x 844, measured from navigation start to the live question's
// text visible; the median of 5 runs must be under 3 seconds.
const PROFILE = { latency: 563, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 };
const RUNS = 5;
const BUDGET_MS = 3_000;

/** One cold load: a new context, the profile on, and the moment the question's text is on screen. */
async function coldLoad(browser: Browser, url: string, question: string): Promise<number> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript((text) => {
      const w = window as unknown as { __visibleAt?: number };
      const seen = () => {
        if (w.__visibleAt === undefined && document.body?.innerText.includes(text)) w.__visibleAt = performance.now();
      };
      new MutationObserver(seen).observe(document, { subtree: true, childList: true, characterData: true });
    }, question);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILE });
    await page.goto(url, { waitUntil: 'commit' });
    await expect(page.locator('.nj-prompt')).toHaveText(question, { timeout: 30_000 });
    return await page.evaluate(() => (window as unknown as { __visibleAt: number }).__visibleAt);
  } finally {
    await context.close();
  }
}

test.describe(() => {
  test.skip(!haveCreds, 'set E2E_EMAIL / E2E_PASSWORD to run the live audience walk');

  test('publishing derives a short readable link: Interaction shows its QR and downloads, all three doors open the page, the name and page settings reach phones, and Add Join card adds one cue (interaction AC-5, AC-6, AC-11)', async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(150_000);
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');

    // A production whose NAME is the whole point of the test: nobody types an ending anywhere
    // below, and the link still has to come out readable.
    const productionName = `Friday Night Live ${Date.now()}`;
    const showId = await openProductionWithCurrent(page, productionName);

    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });

    // The audience URL is READABLE, derived and SHORT: /j/<name> (interaction spec D2). Links lists
    // it with the people links and points to Interaction for the rest.
    await page.keyboard.press('Escape');
    await page.getByTestId('production-setup').click();
    await page.getByTestId('setup-links').click();
    const joinUrl = (await page.getByTestId('join-url').locator('code').textContent()) ?? '';
    const expected = `friday-night-live-${productionName.split(' ').pop()}`;
    expect(joinUrl).toBe(`${new URL(page.url()).origin}/j/${expected}`);
    await expect(page.getByTestId('production-links').getByTestId('join-name-input')).toHaveCount(0);
    await page.getByTestId('production-links-close').click();

    // INTERACTION ▸ JOIN: the QR code decodes to the link; Copy and both downloads carry it.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const ws = await openWorkspace(page, 'audience');
    const join = ws.getByTestId('join-published');
    await expect(join.getByTestId('join-link')).toHaveText(joinUrl);
    const reader = await qrReader(browser);
    try {
      expect(await reader.read(await join.getByTestId('join-qr').screenshot()), 'the QR on screen').toBe(joinUrl);
      await join.getByTestId('join-copy').click();
      await expect(join.getByTestId('join-copy')).toHaveText('✓ Copied');
      expect(await ws.evaluate(() => navigator.clipboard.readText())).toBe(joinUrl);
      const [png] = await Promise.all([ws.waitForEvent('download'), join.getByTestId('join-qr-png').click()]);
      expect(png.suggestedFilename()).toBe(`join-${expected}.png`);
      const { readFileSync } = await import('node:fs');
      expect(await reader.read(readFileSync((await png.path())!)), 'the downloaded PNG').toBe(joinUrl);
      const [svg] = await Promise.all([ws.waitForEvent('download'), join.getByTestId('join-qr-svg').click()]);
      expect(svg.suggestedFilename()).toBe(`join-${expected}.svg`);
      const drawn = await browser.newPage({ viewport: { width: 500, height: 500 } });
      await drawn.setContent(`<body style="margin:0">${readFileSync((await svg.path())!, 'utf8').replace('<svg ', '<svg width="480" height="480" ')}</body>`);
      expect(await reader.read(await drawn.locator('svg').screenshot()), 'the downloaded SVG').toBe(joinUrl);
      await drawn.close();

      // All three doors open the page: the short link, the readable one and the query form.
      const viewer = await context.newPage();
      for (const door of [joinUrl, joinUrl.replace('/j/', '/join/'), joinUrl.replace(`/j/${expected}`, `/join?p=${expected}`)]) {
        await viewer.goto(door);
        await expect(viewer.locator('#join .nj-title'), door).toHaveText(productionName, { timeout: 20_000 });
      }

      // PAGE SETTINGS reach phones on their next read, with no publish (interaction spec D4).
      await ws.getByTestId('join-page-title').fill('Tonight on the walk');
      await ws.getByTestId('join-page-waiting').fill('Back after the break');
      await ws.getByTestId('join-page-waiting').blur();
      await expect(async () => {
        await viewer.goto(joinUrl);
        await expect(viewer.locator('#join .nj-title')).toHaveText('Tonight on the walk', { timeout: 3_000 });
        await expect(viewer.locator('#join .nj-waiting')).toHaveText('Back after the break', { timeout: 3_000 });
      }).toPass({ timeout: 30_000 });

      // THE LOGO (migration 0112): the look's logo is published to the public join-logos bucket at
      // a path named by the production and the file's hash, and the phone shows it from there. A
      // new logo is a new path and shows on the next read; removing it shows none.
      const setLogo = (colour: string | null) =>
        ws.evaluate(
          async ({ id, colour }) => {
            const { editShowLook } = await import('/src/model/shows.ts');
            const { paletteById } = await import('/src/model/wizard.ts');
            let logo;
            if (colour) {
              const canvas = document.createElement('canvas');
              canvas.width = 160;
              canvas.height = 48;
              const ctx = canvas.getContext('2d')!;
              ctx.fillStyle = colour;
              ctx.fillRect(0, 0, 160, 48);
              logo = { path: 'images/logo.png', data: canvas.toDataURL('image/png') };
            }
            const { error } = editShowLook(id, { styleTag: 'noacg', palette: paletteById('noacg'), fontId: 'space-grotesk', customFont: null, ...(logo ? { logo } : {}) });
            if (error) throw new Error(error);
            // The page re-reads the production on this event, as after another tab's write.
            window.dispatchEvent(new Event('spx-data-changed'));
          },
          { id: showId, colour },
        );
      const phoneLogo = async () => {
        await viewer.goto(joinUrl);
        await expect(viewer.locator('#join .nj-title')).toHaveText('Tonight on the walk', { timeout: 5_000 });
        const img = viewer.locator('img.nj-logo');
        if ((await img.count()) === 0) return null;
        await expect(img).toBeVisible({ timeout: 5_000 });
        return img.evaluate((i: HTMLImageElement) => ({ src: i.src, width: i.naturalWidth }));
      };
      await setLogo('#ff3366');
      let first = '';
      await expect(async () => {
        const shown = await phoneLogo();
        expect(shown?.src).toMatch(new RegExp(`/storage/v1/object/public/join-logos/[0-9a-f-]{36}/${showId}/[0-9a-f]{64}\\.png$`));
        expect(shown?.width).toBe(160);
        first = shown!.src;
      }).toPass({ timeout: 40_000 });
      await setLogo('#3366ff');
      await expect(async () => {
        const shown = await phoneLogo();
        expect(shown?.src).toMatch(/join-logos/);
        expect(shown?.src).not.toBe(first);
      }).toPass({ timeout: 40_000 });
      await setLogo(null);
      await expect(async () => expect(await phoneLogo()).toBeNull()).toPass({ timeout: 40_000 });
      await viewer.close();

      // ADD JOIN CARD TO RUNDOWN: one press, one Join card cue whose Join link is this link.
      const joinCues = () =>
        ws.evaluate(async (id) => {
          const { loadShows } = await import('/src/model/shows.ts');
          const show = loadShows().find((x) => x.id === id)!;
          const linkField = new Map(show.graphics.map((g) => [g.id, (g.template.fields ?? []).find((f) => f.title === 'Join link')?.field]));
          return (show.cues ?? []).filter((c) => linkField.get(c.sourceId)).map((c) => c.values?.[linkField.get(c.sourceId)!] ?? null);
        }, showId);
      expect(await joinCues()).toEqual([]);
      await join.getByTestId('join-card-add').click();
      await expect(ws.getByTestId('audience-note')).toContainText('Join card added', { timeout: 20_000 });
      await settleDurableWrites(ws);
      expect(await joinCues()).toEqual([joinUrl]);
      await join.getByTestId('join-card-add').click();
      await expect.poll(joinCues, { timeout: 20_000 }).toEqual([joinUrl, joinUrl]);

      // A hand-picked name still wins, claimed here beside the code; the code follows it.
      const claim = join.getByTestId('join-name-claim');
      await expect(claim).toBeDisabled();
      await join.getByTestId('join-name-input').fill('   ');
      await expect(claim).toBeDisabled();
      const claimed = `handpicked-${Date.now()}`;
      await join.getByTestId('join-name-input').fill(claimed);
      await claim.click();
      await expect(ws.getByTestId('join-name-note')).toContainText(`/j/${claimed}`, { timeout: 20_000 });
      const renamed = joinUrl.replace(`/j/${expected}`, `/j/${claimed}`);
      await expect(join.getByTestId('join-link')).toHaveText(renamed);
      expect(await reader.read(await join.getByTestId('join-qr').screenshot()), 'the QR after the rename').toBe(renamed);
      // Typing again clears the verdict: a note left under a different name is about the wrong name.
      await join.getByTestId('join-name-input').fill('another-name');
      await expect(ws.getByTestId('join-name-note')).toHaveCount(0);
    } finally {
      await reader.close();
    }

    await ws.close();
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
    // The message sources sit in the folded "More ways in" (docs/work-specs/interaction/spec.md).
    await moreWaysIn(messages);
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

  test('questions on the server: Go live and Stop are atomic, stale and closed sends are refused, Clear empties, answers keep their round (interaction AC-2, AC-3, AC-4, AC-7)', async ({
    page,
    context,
  }) => {
    // docs/work-specs/interaction/spec.md R1 to R9 and R18, against migration 0111 itself: the
    // functions are called directly, as an operator page and a phone would call them, and from two
    // pages at once for the race.
    test.setTimeout(115_000);
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');
    const showId = await openProductionWithCurrent(page, `Questions Live ${Date.now()}`);
    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    const slugs = await page.evaluate(async (id) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const show = loadShows().find((s) => s.id === id)!;
      return { control: show.hostedSlug!, join: show.joinSlug! };
    }, showId);
    expect(slugs.control).toBeTruthy();
    expect(slugs.join).toBeTruthy();

    /** One RPC from `tab`: its data, or its error message. */
    const rpc = (tab: typeof page, fn: string, args: Record<string, unknown>) =>
      tab.evaluate(
        async ([name, params]) => {
          const { getSupabase } = await import('/src/backend/supabase.ts');
          const { data, error } = await (await getSupabase())!.rpc(name as string, params as Record<string, unknown>);
          return { data, error: error?.message ?? null };
        },
        [fn, args] as const,
      );
    const VOTE = { id: 'q-vote', type: 'choice', text: 'Who wins?', options: ['Home', 'Away'] };
    const OPEN = { id: 'q-open', type: 'open', text: 'Ask the coach' };
    const live = async (q: object, tab = page) => {
      const answer = await rpc(tab, 'audience_go_live', { p_slug: slugs.control, p_question: q });
      expect(answer.error).toBeNull();
      return answer.data as { id: string; revision: number };
    };
    const vote = (round: { id: string; revision: number }, option: number, device = 'device-configured-1') =>
      rpc(page, 'audience_vote', { p_join_slug: slugs.join, p_device: device, p_round: round.id, p_option: option, p_revision: round.revision });
    const answer = (round: { id: string; revision: number }, body: string, device = 'device-configured-1') =>
      rpc(page, 'audience_submit', { p_join_slug: slugs.join, p_device: device, p_author: '', p_body: body, p_round: round.id, p_revision: round.revision });
    const openRounds = async () =>
      ((await rpc(page, 'audience_rounds_list', { p_slug: slugs.control })).data as { id: string; closed_at: string | null }[]).filter((r) => !r.closed_at);
    const state = async () => (await rpc(page, 'audience_set_join', { p_slug: slugs.control, p_patch: {} })).data as { round: string | null; open: boolean };
    const tally = async (round: { id: string }) => ((await rpc(page, 'audience_tally', { p_slug: slugs.control, p_round: round.id })).data as { total: number }[])[0].total;

    // Go live, a vote, then another question: the vote's round closes and refuses (AC-3).
    const v1 = await live(VOTE);
    expect((await vote(v1, 1)).error).toBeNull();
    const o1 = await live(OPEN);
    expect((await openRounds()).map((r) => r.id)).toEqual([o1.id]);
    expect((await vote(v1, 0)).error).toContain('that question has closed');
    expect(await tally(v1)).toBe(1);

    // An answer is filed under its round; after Stop one is refused (AC-3, AC-7).
    expect((await answer(o1, 'Filed under the open question')).error).toBeNull();
    const stopped = await rpc(page, 'audience_stop', { p_slug: slugs.control, p_round: o1.id });
    expect(stopped.error).toBeNull();
    expect((await answer(o1, 'Too late')).error).toContain('that question has closed');
    const listed = (await rpc(page, 'audience_list', { p_slug: slugs.control })).data as { body: string; round_id: string | null }[];
    expect(listed.map((r) => [r.body, r.round_id])).toEqual([['Filed under the open question', o1.id]]);
    // The phone names a round, never a question: a round of no open question is refused, and so is
    // an answer aimed at a vote.
    expect((await answer({ id: v1.id, revision: v1.revision }, 'Aimed at the vote')).error).toContain('that question has closed');
    // The paste door files only under a round of this production (R13).
    expect((await rpc(page, 'audience_operator_add', { p_slug: slugs.control, p_items: [{ body: 'Elsewhere', round_id: '00000000-0000-4000-8000-000000000000' }] })).error).toContain('not a question of this production');
    expect((await rpc(page, 'audience_operator_add', { p_slug: slugs.control, p_items: [{ body: 'Pasted under it', round_id: o1.id }] })).error).toBeNull();
    // The old forms, which named no round, are gone (R19); the old state writers refuse (R18).
    expect((await rpc(page, 'audience_submit', { p_join_slug: slugs.join, p_device: 'device-configured-1', p_author: '', p_body: 'Old page' })).error).not.toBeNull();
    expect((await rpc(page, 'audience_set_join', { p_slug: slugs.control, p_patch: { open: true, mode: 'comment' } })).error).not.toBeNull();
    expect((await rpc(page, 'audience_open_round', { p_slug: slugs.control, p_kind: 'poll', p_question: 'Old', p_options: ['A', 'B'], p_correct: null })).error).not.toBeNull();

    // Going live again continues the same count; a phone that voted changes its vote (AC-2).
    const v2 = await live(VOTE);
    expect(v2.id).toBe(v1.id);
    expect(v2.revision).toBe(v1.revision);
    expect((await vote(v2, 0)).error).toBeNull();
    expect(await tally(v2)).toBe(1);

    // Clear results is refused while live, then empties, and an edit going live moves the revision:
    // a phone holding the old options is refused (AC-2, AC-4).
    expect((await rpc(page, 'audience_clear_results', { p_slug: slugs.control, p_question: 'q-vote' })).error).toContain('stop the question');
    await rpc(page, 'audience_stop', { p_slug: slugs.control, p_round: v2.id });
    expect((await rpc(page, 'audience_go_live', { p_slug: slugs.control, p_question: { ...VOTE, text: 'Changed' } })).error).toContain('has answers');
    expect((await rpc(page, 'audience_clear_results', { p_slug: slugs.control, p_question: 'q-vote' })).error).toBeNull();
    expect(await tally(v2)).toBe(0);
    const v3 = await live({ ...VOTE, options: ['Away', 'Home', 'Draw'] });
    expect(v3.revision).toBe(v1.revision + 2);
    expect((await vote(v2, 1)).error).toContain('that question has closed');
    expect(await tally(v3)).toBe(0);
    await rpc(page, 'audience_stop', { p_slug: slugs.control, p_round: v3.id });

    // Chat votes through the operator door (AC-10, migration 0113): each voter once, the latest by
    // platform time whatever order the calls arrive in, nothing said before the question went live,
    // no display name as a voter, a closed round refused as closed, phone and chat apart and summed,
    // and a burst of 500 past the phones' burst cap and apart from the message throttle.
    const c1 = await live({ id: 'q-chat', type: 'choice', text: 'Chat picks?', options: ['Red', 'Blue', 'Green'] });
    const rounds = (await rpc(page, 'audience_rounds_list', { p_slug: slugs.control })).data as { id: string; opened_at: string }[];
    const openedAt = Date.parse(rounds.find((r) => r.id === c1.id)!.opened_at);
    const said = (seconds: number) => new Date(openedAt + seconds * 1000).toISOString();
    const chatVotes = (items: object[], round: { id: string } = c1) =>
      rpc(page, 'audience_operator_votes', { p_slug: slugs.control, p_round: round.id, p_items: items });
    const tallied = async () =>
      ((await rpc(page, 'audience_tally', { p_slug: slugs.control, p_round: c1.id })).data as { counts: number[]; phone_counts: number[]; chat_counts: number[]; total: number }[])[0];
    expect((await vote(c1, 0)).error).toBeNull();
    const first = await chatVotes([
      { voter: 'yt:UCchatA', option: 1, at: said(2) },
      { voter: 'yt:UCchatA', option: 2, at: said(1) },
      { voter: 'tw:500001', option: 2, at: said(1) },
      { voter: 'tw:500002', option: 0, at: said(-5) },
      { voter: 'Nina K', option: 0, at: said(1) },
    ]);
    expect(first).toEqual({ data: 2, error: null });
    // An earlier-said vote arriving later does not replace a newer one; the same message again
    // leaves one vote.
    expect((await chatVotes([{ voter: 'yt:UCchatA', option: 0, at: said(1.5) }])).data).toBe(0);
    expect((await chatVotes([{ voter: 'tw:500001', option: 2, at: said(1) }])).error).toBeNull();
    expect(await tallied()).toMatchObject({ counts: [1, 1, 1], phone_counts: [1, 0, 0], chat_counts: [0, 1, 1], total: 3 });
    const burst = Array.from({ length: 500 }, (_, n) => ({ voter: `tw:${900000 + n}`, option: n % 3, at: said(3) }));
    expect(await chatVotes(burst)).toEqual({ data: 500, error: null });
    expect((await tallied()).total).toBe(503);
    expect((await chatVotes(burst.concat(burst[0]))).error).toContain('at most 500');
    await rpc(page, 'audience_stop', { p_slug: slugs.control, p_round: c1.id });
    expect((await chatVotes([{ voter: 'tw:500003', option: 0, at: said(4) }])).error).toContain('that question has closed');
    expect((await tallied()).total).toBe(503);

    // Two operators press Go live on different questions at the same moment, from two pages: one
    // round is open and the state points at it (AC-3).
    const second = await context.newPage();
    await second.goto(page.url());
    await expect(second.getByTestId('production-setup')).toBeVisible({ timeout: 30_000 });
    const [a, b] = await Promise.all([
      rpc(page, 'audience_go_live', { p_slug: slugs.control, p_question: OPEN }),
      rpc(second, 'audience_go_live', { p_slug: slugs.control, p_question: { id: 'q-third', type: 'open', text: 'Third' } }),
    ]);
    expect([a.error, b.error]).toEqual([null, null]);
    const open = await openRounds();
    expect(open).toHaveLength(1);
    const now = await state();
    expect(now.round).toBe(open[0].id);
    expect(now.open).toBe(true);
    await rpc(page, 'audience_stop', { p_slug: slugs.control, p_round: open[0].id });
    expect((await state()).open).toBe(false);

    await second.close();
    await unpublishForCleanup(page);
    await wipeMyGraphics(page);
  });

  test('the rehearsal walk: a phone joins by the QR, answers an Open question and a vote, results air through Take, three questions (interaction AC-15; audience AC-5)', async ({
    page,
    browser,
  }, testInfo) => {
    // interaction AC-15, first run at the end of phase 3, and audience-flow AC-5, walked on the
    // local stack: a phone-sized browser joins by the link the studio's QR code carries, answers an
    // Open question and a vote, the answer and the result go to the rundown and air only through
    // Take, and the room moves through three questions. The phone's screens are attached for the
    // walk's record (docs/work-specs/interaction/evidence/phase-3.md). Since phase 5 the vote airs
    // on one of the result boards (a donut as a lower third) rather than the House Vote board, and
    // since phase 6 the third question is a Word question whose word cloud airs through Take.
    test.setTimeout(150_000);
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Polls', 'Result Donut Lower');
    const walkTitle = `Audience Walk ${Date.now()}`;
    await openProductionWithCurrent(page, walkTitle);
    await publishProduction(page);
    await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('production-setup').click();
    await page.getByTestId('setup-links').click();
    const link = async (id: string) => ((await page.getByTestId(id).locator('code').textContent()) ?? '').trim();
    const presenterUrl = await link('presenter-url');
    expect(presenterUrl).toContain('/join?pv=');
    await page.getByTestId('production-links-close').click();
    const nothingOnAir = () => expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
    // Program holds one frame per layer: each check reads its own graphic's frame.
    const program = (title: string) => page.frameLocator(`[data-testid="program-stage"] iframe[title="${title}"]`);

    const messages = await openWorkspace(page, 'audience');
    // The link a phone camera reads, from the QR code's pixels.
    // The code is drawn once the published state has loaded; read it until it decodes.
    const reader = await qrReader(browser);
    await expect(messages.getByTestId('join-published')).toBeVisible({ timeout: 30_000 });
    let joinUrl = '';
    await expect
      .poll(async () => (joinUrl = (await reader.read(await messages.getByTestId('join-qr').screenshot())) ?? ''), { timeout: 20_000 })
      .toContain('/j/');
    await reader.close();

    // Question 1, Open.
    await addQuestion(messages, 'open', 'What should we ask on the walk?');
    await goLive(messages, 'What should we ask on the walk?');

    // The phone: a small touch screen, nothing wider than it, an answer sent.
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await phoneContext.newPage();
    const shot = async (name: string) => testInfo.attach(`phone-${name}`, { body: await phone.screenshot(), contentType: 'image/png' });
    await phone.goto(joinUrl);
    await expect(phone.locator('#join .nj-prompt')).toHaveText('What should we ask on the walk?', { timeout: 20_000 });
    await expect(phone.locator('#join .nj-send')).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot('1-open-question');
    await phone.locator('#nj-author').fill('Ana');
    await phone.locator('#nj-body').fill('Sent from a phone on the walk');
    await phone.locator('#join .nj-send').tap();
    await expect(phone.locator('#join .nj-mine')).toContainText('Sent from a phone on the walk', { timeout: 20_000 });
    await shot('2-open-sent');
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

    // The answer goes to the rundown on a message card and airs through Take.
    await row.getByTestId('audience-prepare').click();
    await row.getByTestId('audience-choose-card').filter({ hasText: 'House Q&A' }).click();
    await expect(messages.getByTestId('audience-note')).toContainText('✓');
    await settleDurableWrites(messages);
    await nothingOnAir();
    const answerCue = page.locator('.pd-cue', { hasText: 'Sent from a phone on the walk' });
    await expect(answerCue).toHaveCount(1, { timeout: 20_000 });
    await answerCue.click();
    await nothingOnAir();
    await page.getByTestId('verb-take').click();
    await expect(program('House Q&A').locator('body')).toContainText('Sent from a phone on the walk', { timeout: 20_000 });

    // Question 2, a vote: going live closes question 1; the phone votes; the result airs via Take.
    await addQuestion(messages, 'choice', 'Who wins the walk?', ['Home', 'Away']);
    await goLive(messages, 'Who wins the walk?');
    await expect(phone.locator('#join .nj-opt')).toHaveCount(2, { timeout: 20_000 });
    await shot('3-vote');
    await phone.locator('#join .nj-opt').nth(1).tap();
    await expect(phone.locator('#join .nj-opt').nth(1)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await shot('4-voted');
    await expect(messages.getByTestId('audience-tally-1')).toHaveText('1', { timeout: 20_000 });
    // Chat votes too (AC-10, walked again in phase 4): a chat source in this tab (the test source,
    // standing in for Twitch) says `1`, `b` and a line that is not a vote. The panel shows phone and
    // chat apart and summed; the line that is not a vote reaches the inbox.
    await moreWaysIn(messages);
    await messages.evaluate(async (title) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const show = loadShows().find((s) => s.name === title)!;
      const seam = (window as unknown as { __noacgChatIntake: { for(id: string): { addTest(): { push(a: string, t: string, id: string, x: { voter: string }): void } } } }).__noacgChatIntake;
      const chat = seam.for(show.id).addTest();
      chat.push('Chat One', '1', 'walk-1', { voter: 'tw:910001' });
      chat.push('Chat Two', 'b', 'walk-2', { voter: 'tw:910002' });
      chat.push('Chat Three', 'Great walk so far', 'walk-3', { voter: 'tw:910003' });
    }, walkTitle);
    await expect(messages.getByTestId('audience-tally-0')).toHaveText('1', { timeout: 20_000 });
    await expect(messages.getByTestId('audience-tally-1')).toHaveText('2', { timeout: 20_000 });
    await expect(messages.getByTestId('audience-tally-split-0')).toHaveText('0 phone · 1 chat');
    await expect(messages.getByTestId('audience-tally-split-1')).toHaveText('1 phone · 1 chat');
    await expect(messages.getByTestId('chat-source-stats')).toHaveText('1 in · 2 votes · 0 dropped');
    await testInfo.attach('studio-phone-and-chat-votes', { body: await messages.getByTestId('audience-tally').screenshot(), contentType: 'image/png' });
    await addResults(messages, 'Result Donut Lower');
    await settleDurableWrites(messages);
    // Staging sent nothing: Program still holds the answer and not the vote.
    await expect(program('House Q&A').locator('body')).toContainText('Sent from a phone on the walk');
    await expect(program('Result Donut Lower').locator('body')).not.toContainText('Who wins the walk?');
    const voteCue = page.locator('.pd-cue', { hasText: 'Vote —' });
    await expect(voteCue).toHaveCount(1, { timeout: 20_000 });
    await voteCue.click();
    await page.getByTestId('verb-take').click();
    await expect(program('Result Donut Lower').locator('body')).toContainText('Who wins the walk?', { timeout: 20_000 });
    await expect(program('Result Donut Lower').locator('body')).toContainText('Away');
    // The donut's legend carries both options, under the question the room voted on.
    await expect(program('Result Donut Lower').locator('.poll-donut')).toHaveCount(1);
    await expect(program('Result Donut Lower').locator('.poll-row')).toHaveCount(2);
    await testInfo.attach('program-result-donut', { body: await page.getByTestId('program-stage').screenshot(), contentType: 'image/png' });

    // Question 3, a Word question (AC-14, walked from phase 6): the phone sends one word, the
    // operator hides one, the word cloud goes to the rundown and airs through Take with the shown
    // words only. Then Stop leaves phones the waiting text.
    await addQuestion(messages, 'word', 'One word for tonight?');
    await goLive(messages, 'One word for tonight?');
    await expect(phone.locator('#join .nj-prompt')).toHaveText('One word for tonight?', { timeout: 20_000 });
    await shot('5-third-question');
    await phone.locator('#nj-word').fill('Sparkling');
    await phone.locator('#join .nj-send').tap();
    await expect(phone.locator('#join .nj-word')).toHaveText('Sparkling', { timeout: 20_000 });
    await expect(phone.locator('#nj-word')).toHaveCount(0);
    await shot('6-word-sent');
    // A second phone (its own browser, so its own device) sends a word the operator will hide.
    const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const second = await secondContext.newPage();
    await second.goto(joinUrl);
    await second.locator('#nj-word').fill('Boring');
    await second.locator('#join .nj-send').tap();
    await expect(second.locator('#join .nj-word')).toHaveText('Boring', { timeout: 20_000 });
    await expect(messages.getByTestId('word-text')).toHaveText(['Boring', 'Sparkling'], { timeout: 20_000 });
    await messages.getByTestId('word-row').filter({ hasText: 'Boring' }).getByTestId('word-hide').click();
    await expect(messages.getByTestId('word-row').filter({ hasText: 'Boring' })).toHaveClass(/hidden/);
    await messages.getByTestId('word-stage').click();
    await messages.getByTestId('word-choose-board').filter({ hasText: 'House Word Cloud' }).click();
    await expect(messages.getByTestId('audience-note')).toContainText('✓ Added a word cloud cue on “House Word Cloud” with 1 word', { timeout: 20_000 });
    await settleDurableWrites(messages);
    // Staging sent nothing: the off-air word cloud still holds its own sample words.
    expect(await program('House Word Cloud').locator('.audience-word').allTextContents()).not.toContain('Sparkling');
    const wordCue = page.locator('.pd-cue', { hasText: 'Words:' });
    await expect(wordCue).toHaveCount(1, { timeout: 20_000 });
    await wordCue.click();
    await page.getByTestId('verb-take').click();
    await expect(program('House Word Cloud').locator('.audience-word')).toHaveText(['Sparkling'], { timeout: 20_000 });
    await testInfo.attach('program-word-cloud', { body: await page.getByTestId('program-stage').screenshot(), contentType: 'image/png' });
    await stopLive(messages, 'One word for tonight?');
    await expect(phone.locator('#join .nj-waiting')).toBeVisible({ timeout: 20_000 });
    await shot('7-waiting');

    await phoneContext.close();
    await secondContext.close();
    await presenter.close();
    await messages.close();
    await unpublishForCleanup(page);
    await wipeMyGraphics(page);
  });

  test('the built join page shows the live question within 3 seconds on a slow phone network, median of 5 (interaction AC-5)', async ({ page, browser }) => {
    // It measures the page phones get: the join entry BUILT and served by Vite's preview server
    // with the app's own clean URLs (scripts/app-clean-url.mjs), so all three doors are also
    // proven in preview. The suite's dev server serves unbundled modules and its own client
    // (about 2.5 MB at this profile), which no phone loads.
    test.setTimeout(240_000);
    const outDir = mkdtempSync(join(tmpdir(), 'noacg-join-'));
    await build({
      configFile: false,
      root: process.cwd(),
      logLevel: 'warn',
      plugins: [appCleanUrl()],
      build: { outDir, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: { join: 'join.html' } } },
    });
    const server = await preview({
      configFile: false,
      root: process.cwd(),
      logLevel: 'warn',
      plugins: [appCleanUrl()],
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0 },
    });
    try {
      await signIn(page);
      await settleSync(page);
      await wipeMyGraphics(page);
      await createGraphicInEditor(page, 'Polls', 'House Vote');
      await openProductionWithCurrent(page, `Cold Load ${Date.now()}`);
      await publishProduction(page);
      await expect(page.getByTestId('production-status-panel')).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press('Escape');

      const ws = await openWorkspace(page, 'audience');
      const question = 'Who wins tonight on the slow network?';
      await addQuestion(ws, 'choice', question, ['The home side', 'The visitors']);
      await goLive(ws, question);
      const name = ((await ws.getByTestId('join-link').textContent()) ?? '').trim().split('/j/')[1];
      expect(name, 'the Interaction link is the short /j/ form').toBeTruthy();
      const address = server.httpServer.address();
      const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

      for (const door of [`/j/${name}`, `/join/${name}`, `/join?p=${name}`]) {
        const viewer = await browser.newPage();
        await viewer.goto(`${origin}${door}`);
        await expect(viewer.locator('.nj-prompt'), `preview ${door}`).toHaveText(question, { timeout: 20_000 });
        await viewer.close();
      }

      const times: number[] = [];
      for (let i = 0; i < RUNS; i++) times.push(await coldLoad(browser, `${origin}/j/${name}`, question));
      const median = [...times].sort((a, b) => a - b)[Math.floor(RUNS / 2)];
      const line = `cold load to the live question, ms: ${times.map(Math.round).join(', ')}; median ${Math.round(median)}`;
      console.log(line);
      test.info().annotations.push({ type: 'cold-load', description: line });
      expect(median, line).toBeLessThan(BUDGET_MS);

      await ws.close();
      await unpublishForCleanup(page);
      await wipeMyGraphics(page);
    } finally {
      await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
