// covers: none - disposable ninth independent leave-editor check (Phase 2, check 9); never land
//
// Adversarial challenges written by the ninth checker against repair-9 (#1455, the device
// reservation). Repair-9's matrix replays a pull through the sync engine's own local write and a
// conflict through runSync against an in-page cloud. These press what it leaves out, in one
// browser, the same way:
//
//   - a conflict pass whose cloud ALSO holds a newer working slot (the other device's draft,
//     linked to the record that won), so the same pass pulls the slot after the unlink; then this
//     tab and a second tab reload, and the draft is saved again;
//   - a first Save whose record write a conflict pass overlaps (the mint-overlap read);
//   - the device-local lists in another shape: a newer version of `spx-gfx-superseded` (and the
//     same list refused by localStorage) when a conflict must reach a second tab, and a newer
//     version of `spx-gfx-reservations`, a corrupt one and a missing one under the double refusal
//     (#1383 S6).
//
// The two-device forms run on a local Supabase stack in e2e/configured/leave-ninth-device.spec.ts.
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { install, arm, acted, prepare, press, refusedHere, releasable, release, library, link, flush, body } from './_saveMatrix';

const out = (name: string, value: unknown) => writeFileSync(test.info().outputPath(name), JSON.stringify(value, null, 2));
const slotOf = (page: Page) => page.evaluate(async () => JSON.parse((await import('/src/model/durableStore.ts')).durable.getItem('spx-gfx-project') ?? 'null'));
const record = async (page: Page, id: string) => JSON.stringify((await library(page)).find(g => g.id === id));
async function secondTab(page: Page) {
  const other = await page.context().newPage();
  await other.goto(page.url()); await expect(other.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  return other;
}
async function firstSaveNamed(page: Page, name: string) {
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
}
/** This device last synced a minute ago (so a record changed on both sides is a true conflict). */
const syncedAMinuteAgo = (page: Page) => page.evaluate(() => localStorage.setItem('spx-gfx-sync', JSON.stringify({ lastSyncedAt: new Date(Date.now() - 60_000).toISOString(), pendingPush: [], pendingConflict: [] })));
type Row = { kind: string; id: string; updatedAt: string; body: unknown };
/** One sync pass against an in-page cloud holding `rows` (the engine's own runSync). */
const passAgainst = (page: Page, rows: Row[]) => page.evaluate(async rows => {
  const { runSync } = await import('/src/backend/sync.ts');
  const { LocalStorageProvider } = await import('/src/backend/storage.ts');
  const map = new Map(rows.map(r => [`${r.kind}:${r.id}`, r]));
  const cloud = {
    list: async (kind: string) => [...map.values()].filter(r => r.kind === kind),
    get: async (kind: string, id: string) => map.get(`${kind}:${id}`) ?? null,
    put: async (r: Row) => { map.set(`${r.kind}:${r.id}`, r); },
    remove: async (kind: string, id: string) => { map.delete(`${kind}:${id}`); },
  };
  const result = await runSync(new LocalStorageProvider(), cloud as never);
  await new Promise(r => setTimeout(r));
  return { conflicts: result.conflicts, failures: result.failures.map(f => `${f.op} ${f.kind}`), cloud: [...map.values()] };
}, rows);
/** Another device's "Alpha" under `id`, a moment newer than this device's record. */
function alphaOf(beta: { id: string; template: { css: string } }, at: string) {
  const template = { ...beta.template, name: 'Alpha', css: `${beta.template.css}\n/* another device */` };
  return { kind: 'graphic', id: beta.id, updatedAt: at, body: { ...beta, name: 'Alpha', template, createdAt: at, updatedAt: at } };
}
/** Save from the topbar: whether a name was asked (then given), and the answer shown. */
async function topbarSave(page: Page, name: string) {
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-name').or(page.getByTestId('save-status').filter({ hasText: /^Saved$/ })).first()).toBeVisible();
  const named = await page.getByTestId('save-name').count();
  if (named) { await page.getByTestId('save-name').fill(name); await page.getByTestId('save-confirm').click(); }
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  return named;
}
const css = async (page: Page) => (await source(page)).css;

test('ninth C-pull: the conflict pass also pulls a newer working slot (the other device\'s draft, linked to the record that won); both tabs reload and save again', async ({ page }) => {
  test.setTimeout(180_000);
  const facts: Record<string, unknown> = {};
  try {
    await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
    await syncedAMinuteAgo(page);
    await firstSaveNamed(page, 'Beta');
    const beta = (await library(page))[0];
    const bSource = await source(page);
    const other = await secondTab(page);
    expect(await link(other)).toMatchObject({ graphicId: beta.id });
    const at = new Date(Date.now() + 1000).toISOString(), slotAt = new Date(Date.now() + 2000).toISOString();
    const alpha = alphaOf(beta, at);
    const mine = await slotOf(page);
    const cloudSlot = { ...mine, id: crypto.randomUUID(), template: alpha.body.template, baseline: alpha.body.template, graphicId: beta.id, dirty: false, updatedAt: slotAt, reservedGraphicId: crypto.randomUUID() };
    delete (cloudSlot as { mintingReserved?: boolean }).mintingReserved;
    const pass = await passAgainst(page, [alpha, { kind: 'project', id: cloudSlot.id, updatedAt: slotAt, body: cloudSlot }]);
    await settleDurableWrites(page);
    const afterPass = await slotOf(page);
    Object.assign(facts, {
      conflicts: pass.conflicts, failures: pass.failures,
      linkAfterPass: await link(page),
      slotAfterPass: { graphicId: afterPass.graphicId, dirty: afterPass.dirty, holdsOtherDevice: afterPass.template.css.includes('another device'), reservedIsOwnBefore: afterPass.reservedGraphicId === mine.reservedGraphicId },
      library: (await library(page)).map(g => ({ id: g.id, name: g.name })),
    });
    await expect.poll(async () => (await link(other)).graphicId, { timeout: 10_000 }).toBeNull().catch(() => {});
    facts.otherLinkAfterPass = await link(other);
    const alphaLocal = await record(page, beta.id);
    // This tab reloads.
    await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    Object.assign(facts, { linkAfterReload: await link(page), editorHoldsOtherDevice: (await css(page)).includes('another device'), editorHoldsMine: JSON.stringify(body(await source(page))) === JSON.stringify(body(bSource)) });
    // The second tab reloads.
    await other.reload(); await expect(other.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    facts.otherLinkAfterReload = await link(other);
    // This tab edits and saves.
    await draw(page, .40); await flush(page);
    facts.saveNamed = await topbarSave(page, 'Beta again');
    const all = await library(page);
    Object.assign(facts, {
      libraryFinal: all.map(g => ({ id: g.id, name: g.name })),
      alphaUnchanged: (await record(page, beta.id)) === alphaLocal,
      alphaHoldsMine: (all.find(g => g.id === beta.id)?.template.css ?? '').includes('another device') === false,
      copyHoldsMine: JSON.stringify(body(all.find(g => g.name === 'Beta (conflicted copy)')?.template ?? {})) === JSON.stringify(body(bSource)),
    });
    expect(pass.conflicts).toBe(1);
    expect(facts.linkAfterPass, 'the draft stayed linked to the other device\'s record').toMatchObject({ graphicId: null });
    expect(facts.copyHoldsMine, 'this device\'s save is in no record').toBe(true);
    expect(facts.alphaHoldsMine, 'this device\'s conflicted work was written over the other device\'s record').toBe(false);
    if (facts.saveNamed === 0) {
      // Saved into the record with no name asked: the editor must have held the other device's
      // draft (the pulled slot), never this device's conflicted work.
      expect(facts.editorHoldsOtherDevice, 'a Save with no name wrote this device\'s work into the other device\'s record').toBe(true);
    }
  } finally {
    out('c-pull.json', facts);
  }
});

test('ninth C-overlap: a conflict pass runs while a first Save\'s record write is unconfirmed; the Save must not link to the other device\'s record', async ({ page }) => {
  test.setTimeout(180_000);
  const facts: Record<string, unknown> = {};
  try {
    await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
    await syncedAMinuteAgo(page);
    const reserved = (await slotOf(page)).reservedGraphicId as string;
    await install(page);
    await arm(page, 'L', 'hold');
    await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Beta'); await page.getByTestId('save-confirm').click();
    await releasable(page);
    // The record is in this tab's mirror, its write unconfirmed; the pass finds another device's under its id.
    const local = (await library(page)).find(g => g.name === 'Beta');
    facts.mirrorHasBeta = !!local; facts.betaIsReserved = local?.id === reserved;
    const at = new Date(Date.now() + 1000).toISOString();
    const pass = await passAgainst(page, [alphaOf(local!, at)]);
    await release(page);
    await expect(page.getByTestId('save-dialog')).toHaveCount(0);
    await settleDurableWrites(page);
    Object.assign(facts, { conflicts: pass.conflicts, failures: pass.failures, acted: await acted(page), status: await page.getByTestId('save-status').textContent(), linkAfterSave: await link(page), slot: (({ graphicId, dirty }) => ({ graphicId, dirty }))(await slotOf(page)), library: (await library(page)).map(g => ({ id: g.id, name: g.name })) });
    await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
    facts.linkAfterReload = await link(page);
    await draw(page, .40); await flush(page);
    const alphaBefore = await record(page, local!.id);
    facts.saveNamed = await topbarSave(page, 'Beta again');
    facts.alphaUnchanged = (await record(page, local!.id)) === alphaBefore;
    facts.libraryFinal = (await library(page)).map(g => ({ id: g.id, name: g.name }));
    expect(pass.conflicts).toBe(1);
    expect(facts.linkAfterSave, 'the first Save linked to the other device\'s record').toMatchObject({ graphicId: null });
    expect(facts.linkAfterReload, 'after a reload the draft is linked to the other device\'s record').toMatchObject({ graphicId: null });
    expect(facts.saveNamed, 'the next Save asked no name').toBe(1);
    expect(facts.alphaUnchanged, 'the next Save wrote over the other device\'s record').toBe(true);
  } finally {
    out('c-overlap.json', facts);
  }
});

for (const shape of ['newer version', 'refused by localStorage'] as const) {
  test(`ninth V-superseded ${shape}: a conflict must reach a second tab of this browser`, async ({ page }) => {
    test.setTimeout(180_000);
    const facts: Record<string, unknown> = { shape };
    try {
      await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
      await syncedAMinuteAgo(page);
      await firstSaveNamed(page, 'Beta');
      const beta = (await library(page))[0];
      const other = await secondTab(page);
      expect(await link(other)).toMatchObject({ graphicId: beta.id });
      if (shape === 'newer version') await page.evaluate(() => localStorage.setItem('spx-gfx-superseded', JSON.stringify({ version: 2, ids: [] })));
      else await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key: string, value: string) {
          if (key === 'spx-gfx-superseded') throw new DOMException('Quota', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      });
      const pass = await passAgainst(page, [alphaOf(beta, new Date(Date.now() + 1000).toISOString())]);
      await settleDurableWrites(page);
      const alpha = await record(page, beta.id);
      facts.conflicts = pass.conflicts;
      facts.linkHere = await link(page);
      await expect.poll(async () => (await link(other)).graphicId, { timeout: 10_000 }).toBeNull().catch(() => {});
      facts.otherLink = await link(other);
      // The second tab edits and saves.
      await draw(other, .40); await flush(other);
      facts.otherSaveNamed = await topbarSave(other, 'Beta from the other tab');
      facts.alphaUnchanged = (await record(other, beta.id)) === alpha;
      facts.libraryFinal = (await library(other)).map(g => ({ id: g.id, name: g.name }));
      expect(pass.conflicts).toBe(1);
      expect(facts.linkHere).toMatchObject({ graphicId: null });
      expect(facts.otherLink, 'the other tab stayed linked to the other device\'s record').toMatchObject({ graphicId: null });
      expect(facts.alphaUnchanged, 'the other tab\'s Save wrote over the other device\'s record').toBe(true);
    } finally {
      out(`v-superseded-${shape.replace(/ /g, '-')}.json`, facts);
    }
  });
}

for (const shape of ['newer version', 'corrupt', 'missing'] as const) {
  test(`ninth V-reservations ${shape}: R and K refused, the list is a ${shape} one, reload, save again`, async ({ page }) => {
    test.setTimeout(180_000);
    const facts: Record<string, unknown> = { shape };
    try {
      // A newer build's list is there before this draft reserves anything; corrupt and missing
      // happen to the list after it recorded the reservation.
      if (shape === 'newer version') {
        await page.goto('/app#/home'); await expect(page.getByTestId('home-page').or(page.getByTestId('creation-wizard')).first()).toBeVisible();
        await page.evaluate(() => localStorage.setItem('spx-gfx-reservations', JSON.stringify({ version: 2, ids: ['kept-by-a-newer-build'] })));
      }
      const { before } = await prepare(page, 'first-kept');
      await arm(page, 'R', 'refuse');
      await arm(page, 'K', 'refuse');
      await press(page, 'first-kept');
      await expect.poll(() => acted(page)).toEqual(['refuse R', 'refuse K']);
      await refusedHere(page, 'first-kept');
      const minted = (await library(page)).find(g => !before.some(old => old.id === g.id))!;
      const requested = await source(page);
      await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
      await settleDurableWrites(page);
      if (shape === 'corrupt') await page.evaluate(() => localStorage.setItem('spx-gfx-reservations', '{"version":1,"ids":['));
      if (shape === 'missing') await page.evaluate(() => localStorage.removeItem('spx-gfx-reservations'));
      facts.listBeforeReload = await page.evaluate(() => localStorage.getItem('spx-gfx-reservations'));
      await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
      facts.linkAfterReload = await link(page);
      await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
      await expect(page.getByTestId('home-page').or(page.getByTestId('save-name')).first()).toBeVisible();
      facts.named = await page.getByTestId('save-name').count();
      if (facts.named) { await page.getByTestId('save-name').fill('Second'); await page.getByTestId('save-confirm').click(); }
      await expect(page.getByTestId('home-page')).toBeVisible();
      await settleDurableWrites(page);
      const all = await library(page);
      Object.assign(facts, {
        records: all.length - before.length,
        mintedHoldsRequested: JSON.stringify(body(all.find(g => g.id === minted.id)!.template)) === JSON.stringify(body(requested)),
        newerListKept: shape === 'newer version' ? await page.evaluate(() => localStorage.getItem('spx-gfx-reservations')) : undefined,
      });
      expect(facts.mintedHoldsRequested, 'the minted record lost the requested source').toBe(true);
      expect(facts.records, 'a second record was minted for the same work').toBe(1);
    } finally {
      out(`v-reservations-${shape.replace(/ /g, '-')}.json`, facts);
    }
  });
}
