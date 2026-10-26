// covers: src/control/sourceMapping.ts, src/control/selectionAir.ts, src/model/productionData.ts
// covers: src/control/graphicVerbs.ts, src/control/takeBlockers.ts, src/control/productionDataSession.ts
// covers: src/components/home/ProductionPage.tsx, src/components/home/CueEditor.tsx, src/components/home/SelectionHolds.tsx
// covers: src/model/productionState.ts, src/control/hostedControl.ts
// covers: api/data/?...path?.ts, scripts/election-replay-server.mjs, scripts/external-data-connector.mjs
// covers: supabase/migrations/0102_source_collections.sql, src/model/shows.ts
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
// - a page meeting a selection of a later version shows the cue read-only, refuses Take and edit
//   with the reason, and every write door keeps the record byte for byte.
// - E7.2a, AC-1: the shipped election rehearsal package installs, publishes, takes its starter
//   count through the data API as a results source would, and airs all four graphics on a browser
//   output; the cue editor's Live candidate menu (the writer) moves the aired card at Update.
// - E7.2b, AC-4 (software/replay grade): the same package on its published production, its results
//   read from the election replay server by the trusted agent (E4) through the source route, the
//   party board and count bug through the source's E5 recipe and the candidates as the published
//   collection's leaf (migration 0102). The whole timeline drives the four graphics on a browser
//   output: what each renderer receives, what the output shows, a capture per step, and the time
//   from the provider's change to the picture (docs/work-specs/playout-election-package/
//   rehearsal.md). Loopback replay only: no claim about a real results feed or studio.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type APIResponse, type BrowserContext, type Page, type Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { publishProduction } from '../_publish';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';
import { makeTestCertificate, makeToken, startReplayServer } from '../../scripts/election-replay-server.mjs';

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
const updates = async (showId: string, graphic = 'Hairline') => (await rows(showId, graphic)).filter((r) => r.t === 'update').map((r) => r.data);
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

/** The repository's file at `path`. */
const repoFile = (file: string) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const readJson = (file: string) => JSON.parse(readFileSync(repoFile(file), 'utf8'));
/** The election rehearsal source, as its runbook registers it (E7.2b). */
const REPLAY_SOURCE = 'docs/work-specs/playout-election-package/replay-source.json';
const ELECTION_GRAPHICS = ['Party totals', 'Count bug', 'Ticker', 'Candidate card'];

/** A fresh account's election package, installed from the shipped file and published: its id. */
async function installElection(page: Page): Promise<string> {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await page.goto('/app#/home/productions');
  await page.getByTestId('import-pack-card').getByTestId('import-pack-file').setInputFiles(repoFile('public/packs/election-rehearsal.noacgpack.json'));
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(6);
  const showId = await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows().find((s) => s.name === 'Election night rehearsal')!.id);
  await publishProduction(page);
  await page.keyboard.press('Escape');
  return showId;
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
    await expect(page.getByTestId('cue-candidate-pick')).toHaveValue(JSON.stringify(['cands', ['D2', 7]]));
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
    await expect(page.getByTestId('unordered-sends'), 'and says so').toBeVisible();
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

  test('AC-1 (E7.2a): the election package installs, publishes and airs all four graphics on a browser output', async ({ page, context, request }) => {
    test.setTimeout(120_000);
    const showId = await installElection(page);
    const { data_key: dataKey } = await tree(showId);
    // The starter count, written as a results source writes it: the plain tree, the data key.
    const starter = JSON.parse(readFileSync(fileURLToPath(new URL('../../packs/election-rehearsal/starter/revision-1.json', import.meta.url)), 'utf8'));
    const answer = await request.patch('/api/data/patch', { headers: { authorization: `Bearer ${dataKey}` }, data: starter });
    expect(answer.ok(), await answer.text()).toBe(true);
    const outputSlug = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.outputSlug ?? null, showId);
    const output = await context.newPage();
    await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}`);
    const on = (title: string, sel: string) => output.frameLocator(`iframe[title="${title}"]`).locator(sel);

    await take(page, 'Party totals');
    await expect(on('Party totals', '#f7'), 'a bound share, from the results').toHaveText('22.3%', WIRE);
    await expect(on('Party totals', '#f5'), 'an editorial name, from the cue').toHaveText('National Coalition');
    await take(page, 'Count status');
    await expect(on('Count bug', '#f2')).toHaveText('60 of 100 areas counted', WIRE);
    await take(page, 'Headlines');
    await expect(on('Ticker', '.tk-crawl')).toContainText('Polls have closed', WIRE);
    await take(page, 'Aino Example');
    await expect(on('Candidate card', '#f0')).toHaveText('Aino Example', WIRE);
    await expect(on('Candidate card', '#f2')).toHaveText('3,500');

    // The writer: the aired cue picks Leo (the same number, another district); air keeps Aino
    // until Update, which airs Leo's whole record as one update.
    await page.getByTestId('cue-candidate-pick').selectOption(JSON.stringify(['candidates', ['01', 101]]));
    await expect(page.getByTestId('cue-candidate-unsent')).toBeVisible();
    await expect(on('Candidate card', '#f0')).toHaveText('Aino Example');
    await page.getByTestId('verb-update').click();
    await expect(on('Candidate card', '#f0')).toHaveText('Leo Example', WIRE);
    expect((await updates(showId, 'Candidate card')).at(-1)).toMatchObject({ f0: 'Leo Example', f1: 'Finns Party · Helsinki', f2: '2,900', f5: '#E8B428' });
    await output.close();
  });

  test('an instance without migration 0102 still publishes and connects: the bindings and sources go, the collections wait', async ({ page }) => {
    // PostgREST refuses a write naming a column it does not have (PGRST204): stand in for a server
    // that has not run 0102 by refusing every control_shows write that names `collections`.
    await page.route('**/rest/v1/control_shows*', async (route) => {
      const body = route.request().postData() ?? '';
      if (route.request().method() !== 'GET' && body.includes('"collections"')) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'collections' column of 'control_shows' in the schema cache" }) });
      }
      return route.continue();
    });
    const showId = await installElection(page);
    const row = async () => (await admin().from('control_shows').select('bindings, sources, collections').eq('id', showId).single()).data!;
    const published = await row();
    expect([Object.keys(published.bindings).sort(), published.sources, published.collections]).toEqual([['Count bug', 'Party totals'], [], null]);
    const source = readJson(REPLAY_SOURCE);
    expect(await page.evaluate(async ({ id, source }) => (await import('/src/model/shows.ts')).connectConnectorSource(id, source, [], null).error, { id: showId, source })).toBeNull();
    await expect.poll(async () => ((await row()).sources ?? []).map((s: { id: string }) => s.id), WIRE).toEqual(['election']);
    expect((await row()).collections).toBeNull();
    await expect(page.getByTestId('production-note')).toHaveCount(0);
    // Once the server has the column (0102 applied), the page that opens the production gives the
    // row its collections, only because the row has none.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.reload();
    await expect(page.getByTestId('production-page')).toBeVisible();
    await expect.poll(async () => ((await row()).collections ?? []).map((c: { id: string }) => c.id), WIRE).toEqual(['candidates']);
  });

  test('AC-4 (E7.2b): the replay through the trusted agent drives all four graphics on the published production', async ({ page, context, baseURL }, info) => {
    test.setTimeout(120_000);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'election-replay-'));
    const tls = makeTestCertificate(path.join(dir, 'replay'));
    const token = makeToken();
    // One step lasts a day: the walk moves the provider's timeline by hand.
    const replay = await startReplayServer({ token, cert: tls.cert, key: tls.key, stepMs: 86_400_000, timeline: 'package' });
    let agent: ReturnType<typeof spawn> | null = null;
    let log = '';
    try {
      const showId = await installElection(page);

      // The source, registered as the runbook's file says (the write Connect data makes); the pack's
      // bindings already follow `external.election.*`, so no field is connected by hand.
      const registration = readJson(REPLAY_SOURCE);
      const source = { ...registration, config: { ...registration.config, endpoint: replay.url } };
      const refused = await page.evaluate(async ({ id, source }) => (await import('/src/model/shows.ts')).connectConnectorSource(id, source as never, [], null).error, { id: showId, source });
      expect(refused).toBeNull();
      // The row carries the source and the collection recipe at once (no new publish).
      await expect.poll(async () => {
        const { data } = await admin().from('control_shows').select('sources, collections').eq('id', showId).single();
        return [(data?.sources ?? []).map((s: { id: string }) => s.id), (data?.collections ?? []).map((c: { id: string }) => c.id)];
      }, WIRE).toEqual([['election'], ['candidates']]);
      const { data_key: dataKey } = await tree(showId);

      // The agent, as installed (docs/DATA_API.md), with the runbook's configuration.
      const config = { ...readJson('docs/work-specs/playout-election-package/replay-agent.json'), endpoint: replay.url };
      writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(config));
      agent = spawn(process.execPath, [repoFile('scripts/external-data-connector.mjs'), '--config', path.join(dir, 'agent.json'), '--send', `${baseURL}/api/data/source`], {
        env: { ...process.env, NOACG_DATA_KEY: dataKey, NOACG_SOURCE_REPLAY: token },
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      agent.stderr!.on('data', (chunk) => (log += chunk));
      const accepted = async () => (await admin().from('production_source_snapshots').select('accepted_revision').eq('show_id', showId).eq('source_id', 'election').maybeSingle()).data?.accepted_revision ?? 0;
      const state = async () => (await admin().from('production_source_snapshots').select('status').eq('show_id', showId).eq('source_id', 'election').maybeSingle()).data?.status?.state;
      await expect.poll(accepted, WIRE).toBe(1);
      // Through the source route: the collection is one revision's JSON text (not the seed's object),
      // and the count bug's time is the recipe's own formatting of the provider's `observed_at`.
      const first = (await tree(showId)).data as { external: { election: { candidates: unknown; summary: { updated: string } } } };
      expect(typeof first.external.election.candidates).toBe('string');
      expect(JSON.parse(first.external.election.candidates as string)).toMatchObject({ schemaRevision: 1, revision: 1 });
      expect(first.external.election.summary.updated).toBe('20:14');

      const outputSlug = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.outputSlug ?? null, showId);
      const output = await context.newPage();
      await output.setViewportSize({ width: 1280, height: 720 });
      await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}`);
      const on = (title: string, sel: string) => output.frameLocator(`iframe[title="${title}"]`).locator(sel);
      // A capture of the browser output at every step, kept with the run's results.
      const capture = async (name: string) => {
        const file = info.outputPath(`output-${name}.png`);
        await output.screenshot({ path: file });
        await info.attach(`output-${name}`, { path: file, contentType: 'image/png' });
      };

      await take(page, 'Party totals');
      await expect(on('Party totals', '#f8'), 'votes through the recipe').toHaveText('225,000', WIRE);
      await take(page, 'Count status');
      await expect(on('Count bug', '#f4'), 'the time through the recipe').toHaveText('20:14', WIRE);
      await take(page, 'Headlines');
      await expect(on('Ticker', '.tk-crawl')).toContainText('Polls have closed', WIRE);
      await take(page, 'Aino Example');
      await expect(on('Candidate card', '#f2')).toHaveText('3,500', WIRE);
      await capture('count-01');

      // Each provider step, timed from the move to the picture, and bounded: a step that moves a bound
      // field reaches air within 10 s (2 s poll, 5 s revision gap, the row at once); one that moves
      // only the candidates within 13 s (add the page's own 5 s read).
      const timings: Record<string, number> = {};
      const step = async (i: number, name: string, limitMs: number, check: () => Promise<void>) => {
        const started = Date.now();
        replay.at(i);
        await check();
        timings[name] = Date.now() - started;
        expect(timings[name], `${name} took ${timings[name]} ms`).toBeLessThan(limitMs);
        await capture(name);
      };
      await step(1, 'count-increase', 10_000, async () => {
        await expect(on('Party totals', '#f8')).toHaveText('228,000', WIRE);
        await expect(on('Count bug', '#f2')).toHaveText('61 of 100 areas counted', WIRE);
        await expect(on('Candidate card', '#f2')).toHaveText('3,700', WIRE);
      });
      // The duplicate is unchanged; it reads as a receipt (at most every 15 s), never a revision.
      await step(2, 'duplicate', 25_000, async () => {
        await expect.poll(state, { timeout: 25_000 }).toBe('unchanged');
        expect(await accepted()).toBe(2);
      });
      await step(3, 'correction-down', 10_000, async () => {
        await expect(on('Candidate card', '#f2')).toHaveText('3,650', WIRE);
        await expect(on('Party totals', '#f8')).toHaveText('224,100', WIRE);
      });
      const corrected = await updates(showId, 'Candidate card');
      // Each card update is one whole record from one revision.
      expect(corrected.slice(-2)).toEqual([
        expect.objectContaining({ f0: 'Aino Example', f1: 'National Coalition · Uusimaa', f2: '3,700', f3: 'Counting', f5: '#2F6FD6' }),
        expect.objectContaining({ f0: 'Aino Example', f1: 'National Coalition · Uusimaa', f2: '3,650', f3: 'Counting', f5: '#2F6FD6' }),
      ]);
      // An older revision and malformed input: held by the agent, nothing moves.
      await step(4, 'older', 10_000, async () => expect.poll(state, WIRE).toBe('stale'));
      await step(5, 'malformed', 10_000, async () => expect.poll(state, WIRE).toBe('invalid'));
      expect(await accepted()).toBe(3);
      expect(await updates(showId, 'Candidate card')).toEqual(corrected);
      // Revision 4 changes the candidates alone: Sara is deleted, and Aino is corrected again with
      // nothing a field binds moving, so the page hears it at its own read. The aired card follows
      // Aino on the output; Sara's cue is not ready to Take.
      await step(6, 'person-deleted', 13_000, async () => {
        await expect(on('Candidate card', '#f2')).toHaveText('3,640', WIRE);
        expect(await accepted()).toBe(4);
        await select(page, 'Sara Example');
        await expect(page.getByTestId('verb-take')).toHaveAttribute('title', /revision 4 has no district "02", candidate 103/, WIRE);
        await expect(page.getByTestId('verb-take')).toBeDisabled();
      });
      // A valid empty list: Aino stays on air, the hold and its age said off air.
      await step(7, 'empty-collection', 13_000, async () => {
        await expect.poll(accepted, WIRE).toBe(5);
        await expect(page.getByTestId('selection-hold')).toContainText('revision 5 holds no candidates', WIRE);
      });
      await expect(on('Candidate card', '#f0')).toHaveText('Aino Example');
      await expect(on('Candidate card', '#f2')).toHaveText('3,640');
      // After revision 3: one whole record at revision 4, and nothing from the empty revision 5.
      expect((await updates(showId, 'Candidate card')).slice(corrected.length)).toEqual([{ ...corrected.at(-1), f2: '3,640' }]);
      for (const graphic of ELECTION_GRAPHICS) {
        const logged = await rows(showId, graphic);
        // No provider step took, advanced, reset or cleared anything: the only transport is the Take.
        expect(logged.filter((r) => MOVES.has(r.t)).map((r) => r.t), graphic).toEqual(['play']);
        // No update row ever carried the collection: outputs receive resolved values only.
        expect(JSON.stringify(logged.filter((r) => r.t === 'update')), graphic).not.toContain('schemaRevision');
      }
      expect(log).not.toContain(token);
      expect(log).not.toContain(dataKey);
      info.annotations.push({ type: 'replay timings (ms, provider move to picture)', description: JSON.stringify(timings) });
      console.log(`E7.2b replay timings (ms): ${JSON.stringify(timings)}`);
      await output.close();
    } finally {
      if (agent && agent.exitCode === null) {
        const gone = new Promise((resolve) => agent!.once('exit', resolve));
        agent.kill('SIGTERM');
        await gone;
      }
      await replay.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

