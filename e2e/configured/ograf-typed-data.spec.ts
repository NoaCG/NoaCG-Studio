// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend carries a typed command through the log.
//
// TYPED OGRAF DATA, THE WRITER (docs/work-specs/playout-ograf-contract/spec.md, E1.2a; AC-2's
// persistence, binding and command-log part, AC-3's wire, AC-4's runtime): a cue over a graphic
// whose stranger's manifest declares an integer turns its typed data on, survives a reload, takes
// with its envelope on the real command log (types as declared, native `data` empty), connects an
// E5 source whose number reaches the tree as a number (migration 0104) and the next Update as one,
// and keeps going after the output reconnects. An output that does not say it reads typed data is
// sent none, and the page says so in one line. Off gives the values back as text. The renderer's
// own round trip, replay and baseline are E1.2b's.
// covers: src/model/ografTyped.ts, src/components/home/CueEditor.tsx, src/control/graphicVerbs.ts
// covers: src/output/main.ts, src/output/stage.ts, src/control/livePath.ts
// covers: supabase/migrations/0104_typed_source_values.sql, api/data/?...path?.ts

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { publishProduction } from '../_publish';
import { bootstrapGraphic } from '../_create';
import { awaitDurableReady, settleDurableWrites } from '../_durable';
import { clearPublishedShows, haveCreds, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';
import { ANON_KEY } from './_panel';

test.skip(!haveCreds || !SERVICE_ROLE_KEY || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY and the anon key unset - configured-mode spec');

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** A stranger's manifest for the Hairline's two fields: a line of text and a whole number. */
const MANIFEST = {
  id: 'stranger-hairline',
  name: 'Hairline',
  main: 'graphic.mjs',
  supportsRealTime: true,
  supportsNonRealTime: false,
  schema: { type: 'object', required: ['f0'], properties: { f0: { type: 'string', maxLength: 40 }, f1: { type: 'integer', minimum: 0 } } },
};

type Row = { id: number; graphic: string; msg: { t: string; data?: Record<string, unknown>; typed?: { v: number; kind: string; values: Record<string, unknown> }; src?: string } };

async function updates(showId: string): Promise<Row[]> {
  const { data, error } = await admin().from('control_events').select('id, graphic, msg').eq('show_id', showId).order('id');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).filter((r) => r.msg?.t === 'update');
}

const storedTyped = (page: Page, showId: string) =>
  page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const cue = loadShows().find((s) => s.id === id)?.cues?.[0];
    return cue ? { typed: cue.typed ? JSON.stringify(cue.typed) : null, values: cue.values } : null;
  }, showId);

test('a typed cue saves, reloads, takes and updates with its envelope on the log, takes an E5 number as a number, and an old output is sent none', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });

  // The graphic carries the manifest it was imported with (model/importTemplate.ts keeps a
  // stranger's), as a pool copy of its own: no library record lends it another template.
  const showId = await page.evaluate(async (manifest) => {
    const { createShowNamedChecked, addGraphicToShow, updateShowCueChecked, loadShows } = await import('/src/model/shows.ts');
    const { deleteGraphic, loadGraphics } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { useRouter } = await import('/src/app/router.ts');
    const { template } = useTemplateStore.getState();
    for (const g of loadGraphics()) deleteGraphic(g.id);
    const { show, error } = createShowNamedChecked(`Typed ${Date.now()}`);
    if (error) throw new Error(error);
    addGraphicToShow(show.id, { ...template, ograf: { v: 1, manifest } });
    const cue = loadShows().find((s) => s.id === show.id)!.cues![0];
    updateShowCueChecked(show.id, cue.id, { values: { f0: 'Anna', f1: '2' } });
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    useRouter.getState().navigate({ view: 'production', id: show.id });
    await new Promise((resolve) => setTimeout(resolve));
    return show.id;
  }, MANIFEST);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  await page.keyboard.press('Escape');

  // ON: the cue's strings read through the schema; the stored envelope holds a number.
  const toggle = page.getByTestId('cue-typed-toggle');
  await toggle.check();
  await expect(toggle).toBeChecked();
  const saved = await storedTyped(page, showId);
  expect(JSON.parse(saved!.typed!).values).toEqual({ f0: 'Anna', f1: 2 });
  await expect(page.getByTestId('cue-candidate-f1')).toBeVisible();

  // SAVE AND RELOAD: the same bytes, still on.
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await awaitDurableReady(page);
  await expect(page.getByTestId('cue-typed-toggle')).toBeChecked();
  expect((await storedTyped(page, showId))!.typed).toBe(saved!.typed);

  // The output of this build says it reads typed data; the Take carries the envelope, `data` empty.
  const { data: row } = await admin().from('control_shows').select('output_slug, data_key').eq('id', showId).single();
  const output = await context.newPage();
  const refusals: string[] = [];
  output.on('console', (m) => m.text().includes('typed data refused') && refusals.push(m.text()));
  await output.goto(`/output?production=${encodeURIComponent(row!.output_slug)}`);
  await expect(page.getByTestId('verb-take')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('verb-take').click();
  await expect.poll(async () => (await updates(showId)).filter((r) => r.msg.typed).length, { timeout: 20_000 }).toBe(1);
  const take = (await updates(showId)).find((r) => r.msg.typed)!;
  expect(take.msg.data).toEqual({});
  expect(take.msg.typed).toMatchObject({ v: 1, kind: 'values', values: { f0: 'Anna', f1: 2 } });
  expect(typeof take.msg.typed!.values.f1).toBe('number');

  // CONNECT E5: f1 follows a source; the agent's number reaches the tree as a number (0104).
  const connected = await page.evaluate(async (id) => {
    const { connectShowSource } = await import('/src/model/shows.ts');
    const source = { id: 'e1', kind: 'external' as const, label: 'Results', config: { v: 1, configRevision: 1, endpoint: 'https://127.0.0.1/results' } };
    return connectShowSource(id, source, [{ graphic: 'Hairline', fieldId: 'f1', path: 'external.e1.home.score' }]).error;
  }, showId);
  expect(connected).toBeNull();
  await expect.poll(async () => ((await admin().from('control_shows').select('sources').eq('id', showId).single()).data?.sources ?? []).length, { timeout: 15_000 }).toBe(1);
  const agent = (body: object) =>
    page.request.post(`${baseURL}/api/data/source`, { headers: { authorization: `Bearer ${row!.data_key}` }, data: { v: 1, sourceId: 'e1', configRevision: 1, ...body } });
  const claimed = await (await agent({ op: 'claim', claim: null })).json();
  expect(claimed.ok).toBe(true);
  const reported = await agent({
    op: 'report',
    claim: claimed.claim,
    acquisition: { v: 1, sourceId: 'e1', configRevision: 1, ownerEpoch: claimed.ownerEpoch, acceptedRevision: claimed.acceptedRevision + 1, checkedAt: new Date().toISOString(), status: 'changed', payload: { home: { score: 5 } } },
  });
  expect(reported.status()).toBe(200);
  await expect.poll(async () => (await admin().from('control_shows').select('data').eq('id', showId).single()).data?.data?.external?.e1?.home?.score, { timeout: 15_000 }).toBe(5);
  // The page reads it (the bound field reads out), and ✎ Update carries it as a number.
  await expect(page.getByTestId('cue-bound-f1').locator('input')).toHaveValue('5', { timeout: 20_000 });
  const before = (await updates(showId)).length;
  await page.getByTestId('verb-update').click();
  await expect.poll(async () => (await updates(showId)).slice(before).find((r) => r.msg.typed)?.msg.typed?.values, { timeout: 20_000 }).toEqual({ f0: 'Anna', f1: 5 });

  // RECONNECT: the output reloads, reads the log again and refuses nothing; Update still goes.
  await output.reload();
  const afterReload = (await updates(showId)).length;
  await expect(page.getByTestId('verb-update')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('verb-update').click();
  await expect.poll(async () => (await updates(showId)).slice(afterReload).filter((r) => r.msg.typed).length, { timeout: 20_000 }).toBe(1);
  expect(refusals).toEqual([]);

  // AN OLDER OUTPUT on the live topic (no `typed` in its entry): nothing typed is sent, one line says why.
  const old = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const channel = old.channel(`live-${showId}`, { config: { private: true, presence: { key: 'oldoutput01', enabled: true } } });
  await new Promise<void>((resolve, reject) => channel.subscribe((status) => (status === 'SUBSCRIBED' ? resolve() : status === 'CHANNEL_ERROR' ? reject(new Error(status)) : undefined)));
  await channel.track({ kind: 'output', id: 'oldoutput01', engine: 'CasparCG · Chromium 71', build: 'old', proto: 1, surface: 'output', log: true, cmd: true, at: Date.now(), name: 'Old output' });
  try {
    const quiet = (await updates(showId)).length;
    await expect(async () => {
      await page.getByTestId('verb-update').click();
      await expect(page.getByTestId('production-note')).toContainText('Reload Old output: it cannot read typed data yet.', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    expect((await updates(showId)).length).toBe(quiet);
  } finally {
    await channel.untrack();
    await old.removeAllChannels();
  }

  // OFF: the values come back as text and the envelope goes.
  await page.getByTestId('cue-typed-toggle').uncheck();
  await expect.poll(async () => (await storedTyped(page, showId))?.typed, { timeout: 10_000 }).toBeNull();
  expect((await storedTyped(page, showId))!.values).toMatchObject({ f0: 'Anna', f1: '2' });
  await clearPublishedShows(page);
});
