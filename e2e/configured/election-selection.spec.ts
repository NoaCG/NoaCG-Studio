// covers: src/control/sourceMapping.ts, src/control/selectionAir.ts, src/model/productionData.ts
// covers: src/control/graphicVerbs.ts, src/control/takeBlockers.ts, src/control/productionDataSession.ts
// covers: src/components/home/ProductionPage.tsx, src/components/home/CueEditor.tsx, src/components/home/SelectionHolds.tsx
// covers: src/model/productionState.ts, src/control/hostedControl.ts
//
// LIVE CANDIDATES ON A PUBLISHED PRODUCTION (docs/work-specs/playout-election-package/spec.md,
// phase E7.1; AC-2, AC-3 as far as the read gate and the resolver reach), against the configured
// stack's real database and the dev server's real data routes.
//
// E7.1 lands the reader only, so the selection records are WRITTEN BY THE FIXTURE (`withSelections`,
// the storage seam's whole-record put, which is the sync pull's door): a shared collection recipe
// for one lower third ("Hairline") and cues selecting by district plus candidate. The results are
// written with the production's data key through `/patch`, as `external.e1.candidates`, one
// accepted revision `{schemaRevision, revision, items}` each time, with fictional people. A count
// bug follows `external.e1.status`, so most revisions write a row and the page re-reads the tree;
// the last writes the collection alone, which the page reads on its own cadence.
//
// What is checked is what the renderer receives (the production's update rows, the payload every
// output applies) and what the output shows, never only what the resolver returns:
// - the first walk (AC-2): two cues of one card select two people with the same candidate number;
//   preview B never changes aired A; tree reads held and answered out of order, with A -> B -> A
//   selected meanwhile, never put an older revision on air; an unknown B is not ready to Take; and
//   duplicate keys hold the card on air with its reason.
// - the second (AC-3): a count increase and a newer downward correction each air once, whole; an
//   older and a duplicate revision do not; a deleted person, malformed input and a valid empty list
//   hold the picture with its reason and age shown off air; Pause holds and Resume sends the final
//   values; a lost network recovers; after a reload, another production and an app restart the
//   page holds the AIRED selector, says so off air and sends nothing on its own until Update (D4);
//   a collection-only write still airs; none of it takes, advances or resets the graphic.
// - a page that fell back to protocol 1 (its resolve answered PGRST202) never sends a correction
//   on its own: what airs is held, said off air, and the operator's Update still goes.
// - the last: a page meeting a selection of a later version shows the cue read-only, refuses
//   Take and edit with the reason, and every write door keeps the record byte for byte.

import { test, expect, type APIRequestContext, type APIResponse, type BrowserContext, type Page, type Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { publishProduction } from '../_publish';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY unset - configured-mode spec');

const WIRE = { timeout: 20_000 };
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const RECIPE = {
  v: 1,
  id: 'cands',
  sourceId: 'e1',
  schemaRevision: 1,
  graphic: 'Hairline',
  from: 'candidates',
  key: ['district', 'candidate'],
  fields: { f0: { from: 'name' }, f1: { from: 'votes' } },
};
const pick = (district: string, candidate: number) => ({ v: 1, recipe: 'cands', key: [district, candidate] });
const AINO = 'Aino Aalto';
const BERTTA = 'Bertta Berg';

type Person = { district: string; candidate: number; name: string; votes: number };
/** The fictional field, ranked by votes: Aino and Bertta share candidate number 7. */
const people = (aino: number | null, bertta = 900): Person[] =>
  [
    ...(aino === null ? [] : [{ district: 'D1', candidate: 7, name: AINO, votes: aino }]),
    { district: 'D2', candidate: 7, name: BERTTA, votes: bertta },
    { district: 'D1', candidate: 8, name: 'Cecilia Cole', votes: 800 },
  ].sort((a, b) => b.votes - a.votes);

interface Walk {
  showId: string;
  slug: string;
  dataKey: string;
  output: Page;
}

async function tree(showId: string) {
  const { data, error } = await admin().from('control_shows').select('data, data_key, slug, bindings').eq('id', showId).single();
  if (error) throw new Error(error.message);
  return data as { data: Record<string, unknown>; data_key: string; slug: string; bindings: Record<string, Record<string, string>> | null };
}

/** What the renderer receives: the production's rows for one graphic, oldest first. */
async function rows(showId: string, graphic = 'Hairline') {
  const { data, error } = await admin().from('control_events').select('id, graphic, msg').eq('show_id', showId).eq('graphic', graphic).order('id');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id as number, t: r.msg?.t as string, data: r.msg?.data as Record<string, string> | undefined }));
}
const updates = async (showId: string) => (await rows(showId)).filter((r) => r.t === 'update').map((r) => r.data);
/** The commands that Take, advance, reset or clear the card: a Take is always a `play`, an advance
 *  a `next`, a reset a `snap` or a `stop`, a press an `event`. None of AC-3's events may add one.
 *  Updates are data, and markers and status rows (`cue`, `hello`, `live`, `ping`, `staged`) never
 *  reach a renderer (src/output/stage.ts); a reload may well re-assert the marker. */
const MOVES = new Set(['play', 'stop', 'next', 'snap', 'event']);
const transport = async (showId: string) => (await rows(showId)).filter((r) => MOVES.has(r.t)).map((r) => r.t);

/** One accepted revision, written with the production's data key, as an integrator would. */
async function revision(api: APIRequestContext, w: Walk, rev: number, candidates: unknown, status: string | null = `Counted ${rev}`) {
  const answer = await api.patch('/api/data/patch', {
    headers: { authorization: `Bearer ${w.dataKey}` },
    data: { external: { e1: status === null ? { candidates } : { status, candidates } } },
  });
  expect(answer.ok(), await answer.text()).toBe(true);
}
const collection = (rev: number, items: unknown[]) => ({ schemaRevision: 1, revision: rev, items });

/** THE FIXTURE: E7.1 has no writer, so the recipe and the cues' selections are written straight
 *  onto the record through the storage seam's put, and the page is reloaded to read them. */
async function withSelections(page: Page, showId: string, picks: Record<string, unknown>, collections: unknown[] = [RECIPE]) {
  const error = await page.evaluate(
    async ({ id, picks, collections }) => {
      const S = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const show = S.loadShows().find((s) => s.id === id)!;
      const next = { ...show, collections, cues: (show.cues ?? []).map((c) => (picks[c.label] ? { ...c, selection: picks[c.label] } : c)), updatedAt: new Date().toISOString() };
      return S.upsertShows([next as never]) ?? (await commitDurableWrites());
    },
    { id: showId, picks, collections },
  );
  expect(error).toBeNull();
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

/** The production: the card with three cues, a count bug on the status, published, its output open. */
async function production(page: Page, context: BrowserContext, cues: string[]): Promise<Walk> {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await openProductionWithCurrent(page, `Election ${Date.now()}`);
  await addCatalogGraphic(page, showId, 'Underline');
  const error = await page.evaluate(
    async ({ id, cues }) => {
      const S = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const show = S.loadShows().find((s) => s.id === id)!;
      const card = show.graphics.find((g) => g.name === 'Hairline')!;
      const bug = show.graphics.find((g) => g.name === 'Underline')!;
      for (const label of cues) S.addShowCue(id, card.id, { label });
      S.addShowCue(id, bug.id, { label: 'Count' });
      S.setFieldBinding(id, 'Underline', 'f0', 'external.e1.status');
      return commitDurableWrites();
    },
    { id: showId, cues },
  );
  expect(error).toBeNull();
  await withSelections(page, showId, { 'Card A': pick('D1', 7), 'Card B': pick('D2', 7), 'Card C': pick('D9', 1) });
  await publishProduction(page);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await tree(showId)).bindings?.Underline?.f0, WIRE).toBe('external.e1.status');
  const { slug, data_key: dataKey } = await tree(showId);
  const outputSlug = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.outputSlug ?? null, showId);
  expect(outputSlug).toBeTruthy();
  const output = await context.newPage();
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}`);
  return { showId, slug, dataKey, output };
}

const select = (page: Page, label: string) => page.getByTestId('cue-list').locator('.pd-cue').filter({ hasText: label }).first().locator('.pd-cue-label').click();
const preview = (page: Page) => page.frameLocator('[data-testid="production-preview"] iframe').locator('#f0');
const onAir = (w: Walk) => w.output.frameLocator('iframe[title="Hairline"]').locator('#f0');
const onAirLine = (w: Walk) => w.output.frameLocator('iframe[title="Hairline"]').locator('#f1');

async function take(page: Page, label: string) {
  await select(page, label);
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.getByTestId('verb-take').click();
}

test.describe('live candidates', () => {
  test.afterEach(async ({ page }) => {
    await clearPublishedShows(page).catch(() => {});
    await wipeMyGraphics(page).catch(() => {});
  });

  test('AC-2: one card, two people with one number; preview never retargets air; reads out of order; unknown and duplicate keys', async ({ page, context, request }) => {
    test.setTimeout(120_000);
    const w = await production(page, context, ['Card A', 'Card B', 'Card C']);
    await revision(request, w, 1, collection(1, people(1200)));
    await select(page, 'Card B');
    await expect(preview(page)).toHaveText(BERTTA, WIRE);
    await take(page, 'Card A');
    await expect(onAir(w)).toHaveText(AINO, WIRE);
    await expect(onAirLine(w)).toHaveText('1200');
    expect((await updates(w.showId)).at(-1)).toMatchObject({ f0: AINO, f1: '1200' });

    // PREVIEW B: the cue next to it, same candidate number, another district. Air stays A.
    const aired = (await rows(w.showId)).length;
    await select(page, 'Card B');
    await expect(preview(page)).toHaveText(BERTTA);
    await expect(page.getByTestId('cue-candidate')).toHaveText('Live candidate: district D2, candidate 7');
    expect((await rows(w.showId)).length).toBe(aired);
    await expect(onAir(w)).toHaveText(AINO);

    // OUT OF ORDER: the tree read for revision 2 is held while revision 3 (a lower count, reordered)
    // is read and aired; then the held, older read answers. A -> B -> A is selected meanwhile.
    // The first read is FETCHED at once (so it carries revision 2) and its answer kept back.
    const held: { route: Route; response: APIResponse }[] = [];
    let first = true;
    await page.route('**/api/data/state', async (route) => {
      if (!first) return route.continue();
      first = false;
      held.push({ route, response: await route.fetch() });
    });
    await revision(request, w, 2, collection(2, people(1500)));
    await expect.poll(() => held.length, WIRE).toBe(1);
    expect(JSON.stringify(await held[0].response.json())).toContain('"revision":2');
    await revision(request, w, 3, collection(3, people(1400).reverse()));
    await expect(onAirLine(w)).toHaveText('1400', WIRE);
    for (const label of ['Card A', 'Card B', 'Card A']) await select(page, label);
    // Now the older answer lands, after the newer one.
    await held[0].route.fulfill({ response: held[0].response });
    await page.waitForTimeout(1000);
    await expect(preview(page), 'an older read never puts revision 2 back, on PREVIEW either').toHaveText(AINO);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const after = await updates(w.showId);
    expect(after.filter((d) => d?.f1 === '1500'), 'the older revision never airs').toEqual([]);
    const previewLine = page.frameLocator('[data-testid="production-preview"] iframe').locator('#f1');
    await expect(previewLine).toHaveText('1400');
    // One coherent update: every mapped field of one person, from one revision.
    expect(after.at(-1)).toEqual({ f0: AINO, f1: '1400' });
    await expect(onAir(w)).toHaveText(AINO);
    await expect(onAirLine(w)).toHaveText('1400');

    // AN UNKNOWN B is not ready to Take, and borrows nobody's values.
    await select(page, 'Card C');
    await expect(page.getByTestId('verb-take')).toBeDisabled();
    await expect(page.getByTestId('verb-take')).toHaveAttribute('title', /Not ready: revision 3 has no district "D9", candidate 1/);
    await expect(preview(page)).toHaveText('');

    // Take B, then A again: each airs its own person.
    await take(page, 'Card B');
    await expect(onAir(w)).toHaveText(BERTTA, WIRE);
    await take(page, 'Card A');
    await expect(onAir(w)).toHaveText(AINO, WIRE);
    await expect(onAirLine(w)).toHaveText('1400');

    // DUPLICATE KEYS invalidate the selection: A holds on air with the reason, B is not ready.
    const before = (await rows(w.showId)).length;
    await revision(request, w, 4, collection(4, [...people(1450), { district: 'D1', candidate: 7, name: 'Impostor', votes: 1 }]));
    await expect(page.getByTestId('selection-hold')).toContainText('two items share the key district "D1", candidate 7', WIRE);
    await select(page, 'Card B');
    await expect(page.getByTestId('verb-take')).toBeDisabled();
    expect((await rows(w.showId)).length).toBe(before);
    await expect(onAir(w)).toHaveText(AINO);
    await expect(onAirLine(w)).toHaveText('1400');
  });

  test('AC-3: corrections air once; older, duplicate, deleted, malformed, empty, Pause, network, reload, another production and a restart never take, advance or reset', async ({ page, context, request }) => {
    test.setTimeout(120_000);
    const w = await production(page, context, ['Card A', 'Card B']);
    await revision(request, w, 1, collection(1, people(1200)));
    await take(page, 'Card A');
    await expect(onAirLine(w)).toHaveText('1200', WIRE);
    const transported = await transport(w.showId);

    // A count increase, then a newer downward correction: each once, whole.
    await revision(request, w, 2, collection(2, people(1500)));
    await expect(onAirLine(w)).toHaveText('1500', WIRE);
    await revision(request, w, 3, collection(3, people(1300)));
    await expect(onAirLine(w)).toHaveText('1300', WIRE);
    const corrected = await updates(w.showId);
    expect(corrected.slice(-2)).toEqual([{ f0: AINO, f1: '1500' }, { f0: AINO, f1: '1300' }]);

    // An older and a duplicate revision are rejected.
    // Each is told apart by its status line, which the count bug shows on PREVIEW from the tree
    // this page holds: so the page is known to have read it before air is judged.
    await select(page, 'Count');
    const read = (text: string) => expect(preview(page)).toHaveText(text, WIRE);
    await revision(request, w, 2, collection(2, people(9999)), 'Late 2');
    await read('Late 2');
    await revision(request, w, 3, collection(3, people(7777)), 'Again 3');
    await read('Again 3');
    await select(page, 'Card A');
    await expect(onAirLine(w)).toHaveText('1300');
    expect((await updates(w.showId)).length).toBe(corrected.length);

    // A deleted person, malformed input and a valid empty list hold the picture, said off air.
    const hold = page.getByTestId('selection-hold');
    await revision(request, w, 4, collection(4, people(null)));
    await expect(hold).toContainText('revision 4 has no district "D1", candidate 7', WIRE);
    await expect(hold).toContainText(/Showing revision 3, \d+ s old/);
    await revision(request, w, 5, '{"revision": 5, broken');
    await expect(hold).toContainText('the collection is not JSON', WIRE);
    await revision(request, w, 6, collection(6, []));
    await expect(hold).toContainText('revision 6 holds no candidates', WIRE);
    await expect(onAir(w)).toHaveText(AINO);
    await expect(onAirLine(w)).toHaveText('1300');
    expect((await updates(w.showId)).length).toBe(corrected.length);

    // Pause holds what arrives; Resume sends the final values, and the hold ends.
    const pause = (paused: boolean) => page.evaluate(async ({ s, paused }) => (await import('/src/control/productionDataApi.ts')).setAnotherSystemPaused(s, paused), { s: w.slug, paused });
    await pause(true);
    await revision(request, w, 7, collection(7, people(1340)));
    await revision(request, w, 8, collection(8, people(1350)));
    await page.waitForTimeout(1500);
    await expect(onAirLine(w)).toHaveText('1300');
    await pause(false);
    await expect(onAirLine(w)).toHaveText('1350', WIRE);
    await expect(hold).toHaveCount(0);
    expect((await updates(w.showId)).filter((d) => d?.f1 === '1340')).toEqual([]);

    // A lost network (the output shares the context, so it goes dark too): the revision written
    // meanwhile airs once the page reads again.
    await page.context().setOffline(true);
    await revision(request, w, 9, collection(9, people(1360)));
    await page.waitForTimeout(2000);
    await page.context().setOffline(false);
    await revision(request, w, 10, collection(10, people(1370)));
    await expect(onAirLine(w)).toHaveText('1370', WIRE);

    // A REOPENED PAGE (reload, another production and back, an app restart) does not know what other
    // screens did while it was closed: it holds what airs, says so off air, sends nothing on its own,
    // and follows again once the operator presses Update (D4, coordinator's ruling).
    const reopened = async (p: Page, rev: number, votes: number, aired: string) => {
      await expect(p.getByTestId('selection-hold'), 'the hold is said off air').toContainText('the page reopened', WIRE);
      const sent = (await updates(w.showId)).length;
      await revision(request, w, rev, collection(rev, people(votes, 900 + rev)));
      await p.waitForTimeout(6000);
      await expect(onAirLine(w), 'a newer revision does not air on its own').toHaveText(aired);
      await expect(onAir(w)).toHaveText(AINO);
      expect((await updates(w.showId)).length, 'nothing was sent on its own').toBe(sent);
    };
    const update = async (p: Page, votes: string) => {
      await select(p, 'Card A');
      await expect(p.getByTestId('verb-update')).toBeEnabled();
      await p.getByTestId('verb-update').click();
      await expect(onAirLine(w), 'the operator\'s Update airs the newer count').toHaveText(votes, WIRE);
      await expect(p.getByTestId('selection-hold')).toHaveCount(0);
    };

    // RELOAD with the cue's selection changed under it: the hold keeps the AIRED selector.
    await withSelections(page, w.showId, { 'Card A': pick('D2', 7), 'Card B': pick('D2', 7) });
    await reopened(page, 11, 1380, '1370');
    // The hold names what airs, and says the Update it asks for would now take another candidate.
    await expect(page.getByTestId('selection-hold')).toContainText('(D1 · 7) on air');
    await expect(page.getByTestId('selection-hold')).toContainText('Update would take D2 · 7.');
    // The cue's selection back to the aired person (another reload), so Update takes her again.
    await withSelections(page, w.showId, { 'Card A': pick('D1', 7), 'Card B': pick('D2', 7) });
    await expect(page.getByTestId('selection-hold')).toContainText('the page reopened', WIRE);
    await expect(page.getByTestId('selection-hold')).not.toContainText('Update would take');
    await update(page, '1380');

    // ANOTHER PRODUCTION and back, then an app restart (a new page): each holds, then follows.
    await page.evaluate(async () => (await import('/src/app/router.ts')).useRouter.getState().navigate({ view: 'home' }));
    await page.evaluate(async (id) => (await import('/src/app/router.ts')).useRouter.getState().navigate({ view: 'production', id }), w.showId);
    await expect(page.getByTestId('production-page')).toBeVisible();
    await reopened(page, 12, 1390, '1380');
    await update(page, '1390');
    const url = page.url();
    await page.close();
    const restarted = await context.newPage();
    await restarted.goto(url);
    await expect(restarted.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
    await reopened(restarted, 13, 1400, '1390');
    await update(restarted, '1400');
    await expect(onAir(w)).toHaveText(AINO);
    // A feed that moves the collection alone writes no row this page hears: the page's own read of
    // the tree (every 5 s while a cue has a selection) still brings the correction to air.
    await revision(request, w, 14, collection(14, people(1410, 908)), null);
    await expect(onAirLine(w)).toHaveText('1410', WIRE);
    expect((await updates(w.showId)).filter((d) => d?.f0 === BERTTA), 'the current selection never reached air').toEqual([]);
    expect(await transport(w.showId), 'nothing took, advanced or reset the card').toEqual(transported);
    await clearPublishedShows(restarted).catch(() => {});
  });

  test('a page that fell back to protocol 1 never sends a correction on its own: it holds what airs, and the operator\'s Update still goes', async ({ page, context, request }) => {
    test.setTimeout(120_000);
    const w = await production(page, context, ['Card A', 'Card B']);
    // A server without the sequence road answers its resolve PGRST202: this page then sends by row
    // id, with no per-graphic order, for the rest of its life (hostedControl.ts `askSeqRoad`).
    await page.route('**/rest/v1/rpc/control_show_resolve', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.control_show_resolve', details: null, hint: null }) }),
    );
    await page.reload();
    await expect(page.getByTestId('production-page')).toBeVisible();
    await revision(request, w, 1, collection(1, people(1200)));
    await take(page, 'Card A');
    await expect(onAirLine(w)).toHaveText('1200', WIRE);
    expect(await page.evaluate(async (slug) => (await import('/src/control/hostedControl.ts')).sendsInOrder(slug), w.slug), 'the page is on protocol 1').toBe(false);
    const before = (await updates(w.showId)).length;

    await revision(request, w, 2, collection(2, people(1500)));
    await select(page, 'Count');
    await expect(preview(page)).toHaveText('Counted 2', WIRE);
    await expect(page.getByTestId('selection-hold')).toContainText('a newer count arrived: press Update', WIRE);
    await page.waitForTimeout(6000);
    await expect(onAirLine(w), 'what airs is held').toHaveText('1200');
    expect((await updates(w.showId)).length, 'no correction went on its own').toBe(before);

    // Take on a live card takes it off, so the hold sends the operator to Update.
    await expect(page.getByTestId('selection-hold')).toContainText('press Update to send it');
    await select(page, 'Card A');
    await expect(page.getByTestId('verb-update')).toBeEnabled();
    await page.getByTestId('verb-update').click();
    await expect(onAirLine(w), 'the operator\'s Update goes').toHaveText('1500', WIRE);
    await expect(page.getByTestId('selection-hold')).toHaveCount(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a later version of a selection is read-only: no Take, no edit, every byte kept at both write doors', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.keyboard.press('Escape');
    await wipeMyGraphics(page);
    await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
    const showId = await openProductionWithCurrent(page, `Election later ${Date.now()}`);
    await page.evaluate(async (id) => {
      const S = await import('/src/model/shows.ts');
      const card = S.loadShows().find((s) => s.id === id)!.graphics[0];
      for (const label of ['Later card', 'Card A', 'Plain']) S.addShowCue(id, card.id, { label });
      await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    }, showId);
    const later = { v: 2, recipe: 'cands', pick: { rank: 1, district: 'D1' } };
    await withSelections(page, showId, { 'Later card': later, 'Card A': pick('D1', 7) });
    const stored = () =>
      page.evaluate(async (id) => {
        const { durable } = await import('/src/model/durableStore.ts');
        const show = (JSON.parse(durable.getItem('spx-gfx-shows') ?? '[]') as { id: string; cues?: { label: string }[]; collections?: unknown }[]).find((s) => s.id === id)!;
        return { later: JSON.stringify(show.cues!.find((c) => c.label === 'Later card')), a: JSON.stringify(show.cues!.find((c) => c.label === 'Card A')), collections: JSON.stringify(show.collections) };
      }, showId);
    const kept = await stored();
    expect(kept.later).toContain('"pick":{"rank":1,"district":"D1"}');

    await select(page, 'Later card');
    await expect(page.getByTestId('cue-candidate')).toHaveText('This cue’s live candidate was set up by a later version of NoaCG, so it is read-only here.');
    await expect(page.getByTestId('cue-editor')).toHaveAttribute('inert', '');
    await expect(page.getByTestId('verb-take')).toBeDisabled();
    await expect(page.getByTestId('verb-take')).toHaveAttribute('title', /later version of NoaCG/);

    // Every door a page writes through: a note and a rename of the read-only cue, its removal, a
    // typed value on a mapped field, a binding onto a mapped field. Each refuses, and the record
    // keeps its bytes; another cue still edits.
    const refusals = await page.evaluate(async (id) => {
      const S = await import('/src/model/shows.ts');
      const show = S.loadShows().find((s) => s.id === id)!;
      const cue = (label: string) => show.cues!.find((c) => c.label === label)!;
      return {
        noted: S.updateShowCueChecked(id, cue('Later card').id, { note: 'Typed' }).error,
        renamed: S.updateShowCueChecked(id, cue('Later card').id, { label: 'Renamed' }).error,
        removed: S.removeShowCuesChecked(id, [cue('Later card').id]).error,
        mapped: S.updateShowCueChecked(id, cue('Card A').id, { values: { f0: 'Typed' } }).error,
        boundBefore: JSON.stringify(S.loadShows().find((s) => s.id === id)!.bindings ?? {}),
        bound: JSON.stringify(S.setFieldBinding(id, 'Hairline', 'f0', 'results.name').find((s) => s.id === id)!.bindings ?? {}),
        plain: S.updateShowCueChecked(id, cue('Plain').id, { label: 'Plain renamed' }).error,
        published: (await (await import('/src/control/hostedControl.ts')).buildOutputPayload(S.loadShows().find((s) => s.id === id)!)).cues.map((c) => c.label),
        // The exported controller and the SPX rundown send a cue's prepared values the same way.
        ...(await (async () => {
          const E = await import('/src/export/showExport.ts');
          const now = S.loadShows().find((s) => s.id === id)!;
          const text = async (zip: Awaited<ReturnType<typeof E.buildShowZip>>, file: RegExp) => (await Promise.all(zip.file(file).map((f) => f.async('string')))).join('\n');
          return { controller: await text(await E.buildShowZipFor(now, 'html-overlay'), /controller\.html$/), spx: await text(await E.buildShowZip(now), /\.json$/) };
        })()),
      };
    }, showId);
    expect(refusals.noted).toMatch(/cannot change/);
    expect(refusals.renamed).toMatch(/cannot change/);
    expect(refusals.removed).toMatch(/cannot change/);
    expect(refusals.mapped).toMatch(/live candidate/);
    expect(refusals.bound, 'a mapped field never takes a shared binding').toBe(refusals.boundBefore);
    expect(refusals.plain, 'another cue still edits').toBeNull();
    expect(refusals.published, 'no surface takes a candidate cue with its prepared values').toContain('Plain renamed');
    expect(refusals.published).not.toContain('Later card');
    expect(refusals.published).not.toContain('Card A');
    for (const exported of [refusals.controller, refusals.spx]) {
      expect(exported, 'an export keeps the prepared cue').toContain('Plain renamed');
      expect(exported, 'and leaves the candidate cues out').not.toContain('Later card');
      expect(exported).not.toContain('Card A');
    }
    await page.evaluate(async () => (await import('/src/model/durableStore.ts')).commitDurableWrites());
    expect(await stored()).toEqual(kept);
    await page.reload();
    await expect(page.getByTestId('production-page')).toBeVisible();
    expect(await stored(), 'byte for byte after a reload').toEqual(kept);
  });
});
