// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/components/save/StorageAlertDialog.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts
// covers: src/backend/storage.ts, src/backend/sync.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 6): a write REFUSED once, then the door pressed
// again or the page reloaded, and the reservation and link both refused (#1383, sixth check S6);
// then whose the reservation is, across two tabs, a duplicated tab and a new tab (#1402, repair 8),
// and across devices: a pulled reservation, a pull over this device's own, a sync conflict (#1443, repair 9);
// then a Save that loses a sync conflict, which moves the draft to its conflicted copy (#1466, repair 10).
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { draw, open, source } from './_layerProperty';
import { type Door, type Write, acted, arm, body, editFor, errors, flush, install, landed, leave, left, library, link, newAsks, nothingAsks, prepare, press, refusedHere, retry, saved, settledClean, writesOf } from './_saveMatrix';

// ── Refuse once, then retry ──────────────────────────────────────────────────────────────────

for (const door of ['topbar', 'leave', 'first-named', 'first-kept', 'save-as'] as Door[]) for (const w of writesOf(door)) {
  test(`matrix refuse+retry: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'refuse');
    await press(page, door, editFor(door, w));
    await expect.poll(() => acted(page)).toEqual([`refuse ${w}`]);
    if (w === 'F' || w === 'R') {
      // F carries what K already made durable, and K names the record R reserved: either
      // refusal loses nothing, so the save stands and nothing is announced.
      await landed(page, door);
    } else {
      await refusedHere(page, door);
      expect(await errors(page), 'the refusal was announced by the app as well as the dialog').toBe(0);
      const mid = await library(page);
      expect(mid, w === 'K' ? 'the record landed before its link' : 'nothing landed').toHaveLength(before.length + (w === 'K' && !['topbar', 'leave'].includes(door) ? 1 : 0));
      await retry(page, door);
      await landed(page, door);
    }
    const requested = await source(page);
    const record = await saved(page, door, before);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── Refuse, then reload without retrying ─────────────────────────────────────────────────────

for (const [door, w] of [['leave', 'L'], ['leave', 'K'], ['leave', 'F'], ['first-named', 'R'], ['first-named', 'L'], ['first-named', 'K'], ['first-kept', 'K'], ['save-as', 'K']] as [Door, Write][]) {
  test(`matrix refuse+reload: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'refuse');
    await press(page, door, editFor(door, w));
    await expect.poll(() => acted(page)).toEqual([`refuse ${w}`]);
    const stands = w === 'F' || w === 'R';
    if (stands) await landed(page, door); else await refusedHere(page, door);
    const requested = await source(page);
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('editor-foundation').or(page.getByTestId('home-page')).first()).toBeVisible();
    if (stands) {
      const record = await saved(page, door, before);
      expect(body(record.template)).toEqual(body(requested));
      expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: false });
      expect(await newAsks(page)).toBe(0);
      return;
    }
    // The draft came back as the refusal left it, and the next save writes the record it has.
    const minted = door !== 'leave' && w === 'K' ? (await library(page)).find(g => !before.some(b => b.id === g.id))! : null;
    expect(await link(page), 'after a reload the draft is linked to the record its save minted').toMatchObject({ graphicId: minted?.id ?? (door === 'leave' ? before[0].id : null), dirty: true });
    if (door === 'save-as') {
      await page.getByTestId('save-graphic').click();
      if (!minted) await page.getByTestId('save-confirm').click();
      await landed(page, door);
    } else {
      await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
      if (await page.getByTestId('save-dialog').count()) await page.getByTestId('save-confirm').click();
      await expect(page.getByTestId('home-page')).toBeVisible();
    }
    const record = await saved(page, door, before);
    if (minted) expect(record.id).toBe(minted.id);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── The reservation and the link write both refused, then a reload (#1383, sixth check S6) ─────

for (const door of ['first-kept', 'first-named', 'save-as'] as Door[]) {
  test(`matrix double refusal: ${door} / R and K refused, reload, save again`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, 'R', 'refuse');
    await arm(page, 'K', 'refuse');
    await press(page, door);
    await expect.poll(() => acted(page)).toEqual(['refuse R', 'refuse K']);
    await refusedHere(page, door);
    const minted = (await library(page)).find(g => !before.some(b => b.id === g.id))!;
    expect(minted, 'the record landed before both slot writes were refused').toBeTruthy();
    const requested = await source(page);
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await link(page), 'the reload found the record by the reservation earlier writes carried').toMatchObject({ graphicId: minted.id, dirty: true });
    if (door === 'save-as') { await page.getByTestId('save-graphic').click(); await landed(page, 'save-as'); }
    else { await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible(); }
    const all = await library(page);
    expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
    expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(requested));
    await settledClean(page, door, minted.id);
  });
}

// A reload before the first Save: the reservation the slot already holds is the one the mint
// takes, so the double refusal still relinks (review on #1397).
test('matrix double refusal after a reload: first-kept / R and K refused, reload, save again', async ({ page }) => {
  test.setTimeout(120_000);
  const { before } = await prepare(page, 'first-kept');
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await install(page);
  await arm(page, 'R', 'refuse');
  await arm(page, 'K', 'refuse');
  await press(page, 'first-kept');
  await expect.poll(() => acted(page)).toEqual(['refuse R', 'refuse K']);
  await refusedHere(page, 'first-kept');
  const minted = (await library(page)).find(g => !before.some(b => b.id === g.id))!;
  const requested = await source(page);
  await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
  await settleDurableWrites(page); await page.reload();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await link(page), 'the reload found the record by the reservation the slot held before the first reload').toMatchObject({ graphicId: minted.id, dirty: true });
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const all = await library(page);
  expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
  expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(requested));
  await settledClean(page, 'first-kept', minted.id);
});

// ── Whose reservation it is: two tabs, a reload, a duplicated tab, a new tab after a crash (#1402) ──
//
// A reservation names a record that does not exist yet, and every tab on the draft resumes it from
// the slot. Once one tab mints it, another tab's writes must stop naming it, and a reload links a
// draft to it only when the slot was written by the save minting it, or holds exactly its source.
// A browser "Duplicate tab" copies sessionStorage, which is replayed here; nothing about the
// reservation may hang on it.

/** A second tab on the page's draft: opened fresh, or as a duplicate carrying its sessionStorage. */
async function secondTab(page: Page, how: 'tab' | 'duplicate') {
  const other = await page.context().newPage();
  if (how === 'duplicate') {
    const session = await page.evaluate(() => JSON.stringify(Object.entries(sessionStorage)));
    await other.addInitScript(session => {
      if (window.top === window && !sessionStorage.length) for (const [k, v] of JSON.parse(session) as [string, string][]) sessionStorage.setItem(k, v);
    }, session);
  }
  await other.goto(page.url()); await expect(other.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  return other;
}
const slotOf = (page: Page) => page.evaluate(async () => JSON.parse((await import('/src/model/durableStore.ts')).durable.getItem('spx-gfx-project') ?? 'null'));
async function firstSaveNamed(page: Page, name: string) {
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
}

for (const how of ['tab', 'duplicate'] as const) for (const reload of [false, true]) {
  test(`matrix reservation owner: ${how}; A first-saves the draft B has open; B edits${reload ? ', reloads' : ''} and saves`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
    const b = await secondTab(page, how);
    // A edits after B opened, then first-saves.
    await draw(page, .52); await flush(page); await settleDurableWrites(page);
    await firstSaveNamed(page, 'Alpha');
    const alpha = (await library(page))[0];
    // B adopts A's record, then edits; its autosave lands.
    await expect.poll(async () => (await library(b)).length).toBe(1);
    await draw(b, .40); await flush(b); await settleDurableWrites(b);
    expect((await slotOf(b)).reservedGraphicId, 'B\'s slot write names the record A minted').not.toBe(alpha.id);
    if (reload) { await b.reload(); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 }); }
    expect(await link(b), 'B\'s draft is linked to a graphic it never saved').toMatchObject({ graphicId: null });
    const bSource = await source(b);
    // B's draft was never saved: its Save asks for a name and mints a record of its own.
    await firstSaveNamed(b, 'Beta');
    const all = await library(b);
    expect(all, 'Alpha and Beta').toHaveLength(2);
    expect(JSON.stringify(all.find(g => g.id === alpha.id)), 'Alpha byte-equal to what A saved').toBe(JSON.stringify(alpha));
    expect(body(all.find(g => g.id !== alpha.id)!.template), 'Beta holds B\'s source').toEqual(body(bSource));
  });
}

test('matrix reservation owner: a duplicate tab is open; the minting tab\'s R and K refused, reload, save again', async ({ page }) => {
  test.setTimeout(120_000);
  const { before } = await prepare(page, 'first-kept');
  const b = await secondTab(page, 'duplicate');
  await arm(page, 'R', 'refuse');
  await arm(page, 'K', 'refuse');
  await press(page, 'first-kept');
  await expect.poll(() => acted(page)).toEqual(['refuse R', 'refuse K']);
  await refusedHere(page, 'first-kept');
  const minted = (await library(page)).find(g => !before.some(old => old.id === g.id))!;
  const requested = await source(page);
  await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
  await settleDurableWrites(page); await page.reload();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await link(page), 'the reloaded tab keeps its own reservation').toMatchObject({ graphicId: minted.id, dirty: true });
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const all = await library(page);
  expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
  expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(requested));
  expect(await link(b), 'the idle duplicate took nothing').toMatchObject({ graphicId: null });
  await settledClean(page, 'first-kept', minted.id);
});

/** Close the tab without its unload work (a crash), and open the editor again in a new one. */
async function restoreInNewTab(page: Page, url: string) {
  await settleDurableWrites(page);
  const context = page.context();
  await page.close();
  const tab = await context.newPage();
  await tab.goto(url); await expect(tab.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  return tab;
}

test('matrix reservation owner: R and K refused, the tab crashes, the draft opens in a new tab and saves into its record', async ({ page }) => {
  test.setTimeout(120_000);
  const { before } = await prepare(page, 'first-kept');
  const url = page.url();
  await arm(page, 'R', 'refuse');
  await arm(page, 'K', 'refuse');
  await press(page, 'first-kept');
  await expect.poll(() => acted(page)).toEqual(['refuse R', 'refuse K']);
  await refusedHere(page, 'first-kept');
  const minted = (await library(page)).find(g => !before.some(old => old.id === g.id))!;
  const requested = await source(page);
  const tab = await restoreInNewTab(page, url);
  expect(await link(tab), 'the restored draft holds exactly the record\'s source: it is that record').toMatchObject({ graphicId: minted.id, dirty: true });
  await tab.getByTestId('open-home').click(); await tab.getByTestId('switch-save').click(); await expect(tab.getByTestId('home-page')).toBeVisible();
  const all = await library(tab);
  expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
  expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(requested));
});

// A slot written before this repair (or by another tab before it learnt of the record) names a
// record without saying the save minting it wrote it. Only its source decides.
for (const holds of ['other work', 'its own source'] as const) {
  test(`matrix reservation owner: a restored slot names a record holding ${holds}, with no mint mark`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
    const url = page.url();
    await firstSaveNamed(page, 'Alpha');
    const alpha = (await library(page))[0];
    if (holds === 'other work') { await draw(page, .52); await flush(page); await settleDurableWrites(page); }
    const draft = await source(page);
    await page.evaluate(async id => {
      const { durable } = await import('/src/model/durableStore.ts');
      const { mintingReserved: _, ...slot } = JSON.parse(durable.getItem('spx-gfx-project')!);
      durable.setItem('spx-gfx-project', JSON.stringify({ ...slot, graphicId: null, reservedGraphicId: id }));
    }, alpha.id);
    const tab = await restoreInNewTab(page, url);
    if (holds === 'its own source') {
      expect(await link(tab), 'a draft holding exactly the record\'s source is that record').toMatchObject({ graphicId: alpha.id, dirty: true });
      await tab.getByTestId('save-graphic').click(); await expect(tab.getByTestId('save-status')).toHaveText('Saved');
      await expect(tab.getByTestId('save-dialog')).toHaveCount(0);
      await settleDurableWrites(tab);
      const all = await library(tab);
      expect(all, 'a second record was minted for the same work').toHaveLength(1);
      expect(body(all[0].template)).toEqual(body(draft));
      return;
    }
    expect(await link(tab), 'a draft that does not match the record is not linked to it').toMatchObject({ graphicId: null });
    await firstSaveNamed(tab, 'Beta');
    const all = await library(tab);
    expect(all, 'Alpha and Beta').toHaveLength(2);
    expect(JSON.stringify(all.find(g => g.id === alpha.id)), 'Alpha byte-equal to what was saved').toBe(JSON.stringify(alpha));
    expect(body(all.find(g => g.id !== alpha.id)!.template)).toEqual(body(draft));
  });
}

// ── Whose device the reservation is (#1443, repair 9) ──────────────────────────────────────────
//
// The working slot syncs to the account's other devices, reservation included, and a device learns
// of another's record only on its next sync pass. So a reservation is honoured only on the device
// that made it: a pulled one is never resumed or relinked, and a pull never replaces the device's
// own. A pull is replayed through the sync engine's own local write (LocalStorageProvider.put), and
// a sync conflict through runSync against a cloud that holds another device's record.

/** This browser as a device with no draft of its own, as a device signing in fresh is. */
const noDraft = (page: Page) => page.evaluate(async () => {
  const { LocalStorageProvider } = await import('/src/backend/storage.ts');
  await new LocalStorageProvider().remove('project', '');
});
/** A sync pull of one record, written as the sync engine writes it. */
const pull = (page: Page, kind: 'project' | 'graphic', body: { id: string; updatedAt?: string }) => page.evaluate(async ({ kind, body }) => {
  const { LocalStorageProvider } = await import('/src/backend/storage.ts');
  await new LocalStorageProvider().put({ kind, id: body.id, updatedAt: body.updatedAt ?? new Date().toISOString(), body });
}, { kind, body });
/** Another device's first Save of `template` under `id`, as it arrives here by a pull. */
const otherDevicesRecord = (page: Page, id: string, name: string, template: unknown) => page.evaluate(async ({ id, name, template }) => {
  const { newGraphicDoc } = await import('/src/model/graphicDoc.ts');
  const { prepareOutRuntime } = await import('/src/blocks/animMigration.ts');
  const { LocalStorageProvider } = await import('/src/backend/storage.ts');
  const t = template as { js: string };
  const doc = newGraphicDoc({ ...t, js: prepareOutRuntime(t.js) } as never, { id, name });
  await new LocalStorageProvider().put({ kind: 'graphic', id, updatedAt: doc.updatedAt, body: doc });
}, { id, name, template });
const record = async (page: Page, id: string) => JSON.stringify((await library(page)).find(g => g.id === id));

test('matrix device reservation: a pulled draft names another device\'s reservation; this device saves before it learns of that record', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  const url = page.url();
  const elsewhere = crypto.randomUUID();
  const slot = await slotOf(page);
  // Device A's never-saved draft arrives, naming A's reservation, on a device with no draft.
  await noDraft(page);
  await pull(page, 'project', { ...slot, updatedAt: new Date().toISOString(), reservedGraphicId: elsewhere });
  await settleDurableWrites(page); await page.reload();
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  expect(await link(page)).toMatchObject({ graphicId: null });
  // B leaves and saves the draft, before A's record reaches B's library.
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Beta'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('home-page')).toBeVisible(); await settleDurableWrites(page);
  const beta = (await library(page)).find(g => g.name === 'Beta')!;
  expect(beta.id, 'this device minted the id another device reserved').not.toBe(elsewhere);
  // A's first Save of that draft arrives.
  await otherDevicesRecord(page, elsewhere, 'Alpha', slot.template);
  const alpha = await record(page, elsewhere);
  await page.goto(url); await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  expect(await link(page), 'B is its own graphic').toMatchObject({ graphicId: beta.id });
  await draw(page, .40); await flush(page);
  await page.getByTestId('save-graphic').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await settleDurableWrites(page);
  const all = await library(page);
  expect(all, 'Alpha and Beta').toHaveLength(2);
  expect(await record(page, elsewhere), 'Alpha byte-equal to what A saved').toBe(alpha);
  expect(body(all.find(g => g.id === beta.id)!.template), 'Beta holds B\'s source').toEqual(body(await source(page)));
});

test('matrix device reservation: an older build\'s synced draft carries its reservation and mint mark, and that record holds exactly its source', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  const elsewhere = crypto.randomUUID();
  const slot = await slotOf(page);
  await otherDevicesRecord(page, elsewhere, 'Alpha', slot.template);
  const alpha = await record(page, elsewhere);
  await noDraft(page);
  await pull(page, 'project', { ...slot, updatedAt: new Date().toISOString(), graphicId: null, reservedGraphicId: elsewhere, mintingReserved: true });
  await settleDurableWrites(page); await page.reload();
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  expect(await link(page), 'a draft is linked to a record another device minted').toMatchObject({ graphicId: null });
  await firstSaveNamed(page, 'Beta');
  const all = await library(page);
  expect(all, 'Alpha and Beta').toHaveLength(2);
  expect(all.find(g => g.name === 'Beta')!.id).not.toBe(elsewhere);
  expect(await record(page, elsewhere), 'Alpha byte-equal to what A saved').toBe(alpha);
});

test('matrix device reservation: this device\'s own reservation survives a pull of another device\'s draft and a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  const slot = await slotOf(page);
  const own = slot.reservedGraphicId as string;
  await pull(page, 'project', { ...slot, template: { ...slot.template, name: 'Elsewhere' }, updatedAt: new Date().toISOString(), reservedGraphicId: crypto.randomUUID(), mintingReserved: true });
  await settleDurableWrites(page);
  const pulled = await slotOf(page);
  expect(pulled.template.name, 'the pull wrote the other device\'s draft').toBe('Elsewhere');
  expect(pulled.reservedGraphicId, 'the pull replaced this device\'s reservation').toBe(own);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  expect(await link(page)).toMatchObject({ graphicId: null });
  await firstSaveNamed(page, 'Mine');
  expect((await library(page))[0].id, 'the first Save minted this device\'s own reservation').toBe(own);
});

test('matrix device reservation: R and K refused, then a pull brings this draft back as an older build pushed it; reload relinks, Save writes into the record', async ({ page }) => {
  test.setTimeout(120_000);
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
  const { reservedGraphicId: _, mintingReserved: __, ...withoutFields } = await slotOf(page);
  await pull(page, 'project', { ...withoutFields, updatedAt: new Date().toISOString() });
  await settleDurableWrites(page); await page.reload();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await link(page), 'this device\'s reservation did not survive the pull').toMatchObject({ graphicId: minted.id, dirty: true });
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const all = await library(page);
  expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
  expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(requested));
  await settledClean(page, 'first-kept', minted.id);
});

// ── A Save that loses a sync conflict (#1466, repair 10) ───────────────────────────────────────
//
// The engine keeps the cloud's version under the record's id and writes this device's as a
// "(conflicted copy)". The draft moves to that copy, the record holding its saved work: clean when
// it holds exactly that, so nothing asks at Home, New, Open or after a reload, and never linked to
// the record that won. Every tab of the browser moves, also when the device-local list of
// superseded records cannot be written.

/** This device last synced a minute ago, so a record changed on both sides is a true conflict. */
const syncedAMinuteAgo = (page: Page) => page.evaluate(() => localStorage.setItem('spx-gfx-sync', JSON.stringify({ lastSyncedAt: new Date(Date.now() - 60_000).toISOString(), pendingPush: [], pendingConflict: [] })));
/** One sync pass (the engine's own runSync) against a cloud holding another device's "Alpha"
 *  under `mine`'s id, a moment newer. Answers the conflicts and what the cloud holds after. */
const losingPass = (page: Page, mine: { id: string }) => page.evaluate(async mine => {
  const { runSync } = await import('/src/backend/sync.ts');
  const { LocalStorageProvider } = await import('/src/backend/storage.ts');
  const doc = mine as { id: string; template: { css: string } };
  const at = new Date(Date.now() + 1000).toISOString();
  const alpha = { ...doc, name: 'Alpha', template: { ...doc.template, name: 'Alpha', css: `${doc.template.css}\n/* another device */` }, createdAt: at, updatedAt: at };
  type Row = { kind: string; id: string; updatedAt: string; body: unknown };
  const rows = new Map<string, Row>([[`graphic:${doc.id}`, { kind: 'graphic', id: doc.id, updatedAt: at, body: alpha }]]);
  const cloud = {
    list: async (kind: string) => [...rows.values()].filter(r => r.kind === kind),
    get: async (kind: string, id: string) => rows.get(`${kind}:${id}`) ?? null,
    put: async (r: Row) => { rows.set(`${r.kind}:${r.id}`, r); },
    remove: async (kind: string, id: string) => { rows.delete(`${kind}:${id}`); },
  };
  const result = await runSync(new LocalStorageProvider(), cloud as never);
  await new Promise(r => setTimeout(r));
  return { conflicts: result.conflicts, cloud: [...rows.values()] as Row[] };
}, mine);
/** After the pass: the cloud's version holds the id, this device's save is the conflicted copy. */
async function afterLoss(page: Page, id: string, name: string, mine: unknown) {
  await settleDurableWrites(page);
  const all = await library(page);
  expect(all.find(g => g.id === id)!.name, 'the cloud\'s record won the id').toBe('Alpha');
  const copy = all.find(g => g.name === `${name} (conflicted copy)`)!;
  expect(body(copy.template), 'this device\'s save lives on as the conflicted copy').toEqual(body(mine as { name?: string }));
  return { copy, alpha: await record(page, id) };
}
/** A saved graphic "Gamma", edited and saved again from the topbar: the Save that will lose. */
async function savedTwice(page: Page) {
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  await firstSaveNamed(page, 'Gamma');
  await syncedAMinuteAgo(page);
  await draw(page, .40); await flush(page);
  await page.getByTestId('save-graphic').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await settleDurableWrites(page);
  return { gamma: (await library(page))[0], saved: await source(page) };
}

test('matrix device reservation: the id a first Save minted turns out to be taken (a sync conflict); the draft moves to its conflicted copy, clean, in every tab', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  await syncedAMinuteAgo(page);
  await firstSaveNamed(page, 'Beta');
  const beta = (await library(page))[0];
  const bSource = await source(page);
  // A second tab has the same draft open, linked to Beta.
  const other = await secondTab(page, 'tab');
  expect(await link(other)).toMatchObject({ graphicId: beta.id });
  // The next pass finds another device's "Alpha" under that id in the cloud.
  expect((await losingPass(page, beta)).conflicts).toBe(1);
  const { copy, alpha } = await afterLoss(page, beta.id, 'Beta', bSource);
  expect(await link(page), 'the draft is not linked to the record holding its saved work').toMatchObject({ graphicId: copy.id, dirty: false });
  expect((await slotOf(page)).graphicId, 'the slot is not linked to the conflicted copy').toBe(copy.id);
  await expect.poll(async () => link(other), { message: 'the other tab did not move to the conflicted copy' }).toMatchObject({ graphicId: copy.id, dirty: false });
  await other.close();
  // An edit after that is saved into the conflicted copy; each device's work keeps a record of its own.
  await draw(page, .40); await flush(page);
  await page.getByTestId('save-graphic').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await settleDurableWrites(page);
  const all = await library(page);
  expect(all, 'Alpha and the conflicted copy').toHaveLength(2);
  expect(await record(page, beta.id), 'Alpha byte-equal to the other device\'s').toBe(alpha);
  expect(body(all.find(g => g.id === copy.id)!.template)).toEqual(body(await source(page)));
  await nothingAsks(page, copy.id);
});

test('matrix lost conflict: a saved graphic\'s Save loses a sync conflict; the draft moves to the conflicted copy, clean, and nothing asks at Home, New, Open or after a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const { gamma, saved: mine } = await savedTwice(page);
  const url = page.url();
  const pass = await losingPass(page, gamma);
  expect(pass.conflicts).toBe(1);
  const { copy, alpha } = await afterLoss(page, gamma.id, 'Gamma', mine);
  expect(await link(page), 'the draft is not linked, clean, to the record holding its saved work').toMatchObject({ graphicId: copy.id, dirty: false });
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  // The pass shares the rewritten draft, never the one it listed, linked to the record that won.
  expect((pass.cloud.find(r => r.kind === 'project')?.body as { graphicId?: string } | undefined)?.graphicId, 'the pass shared a draft linked to the record that won').toBe(copy.id);
  await leave(page, 'home'); await left(page, 'home');
  expect(await newAsks(page), 'New asked about the graphic just saved').toBe(0);
  await page.goto(url); await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  await leave(page, 'open'); await left(page, 'open');
  await nothingAsks(page, copy.id);
  expect(await library(page), 'Gamma and the conflicted copy').toHaveLength(2);
  expect(await record(page, gamma.id), 'the other device\'s Gamma byte-equal').toBe(alpha);
});

test('matrix lost conflict: an edit made between the Save and the pass stays unsaved; Home asks and Save & continue writes it into the conflicted copy', async ({ page }) => {
  test.setTimeout(120_000);
  const { gamma, saved: mine } = await savedTwice(page);
  await draw(page, .55); await flush(page); await settleDurableWrites(page);
  expect((await losingPass(page, gamma)).conflicts).toBe(1);
  const { copy, alpha } = await afterLoss(page, gamma.id, 'Gamma', mine);
  expect(await link(page), 'the edit made after the Save reads saved').toMatchObject({ graphicId: copy.id, dirty: true });
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await page.getByTestId('save-name').count(), 'the Save asked for a name').toBe(0);
  await settleDurableWrites(page);
  const all = await library(page);
  expect(all, 'Gamma and the conflicted copy').toHaveLength(2);
  expect(await record(page, gamma.id), 'the other device\'s Gamma byte-equal').toBe(alpha);
  const edited = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  expect(body(all.find(g => g.id === copy.id)!.template), 'the edit is not in the conflicted copy').toEqual(body(edited));
  await nothingAsks(page, copy.id);
});

test('matrix lost conflict: a second tab of the losing device moves to the conflicted copy when the superseded list cannot be written, and its Save writes there', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  await syncedAMinuteAgo(page);
  await firstSaveNamed(page, 'Beta');
  const beta = (await library(page))[0];
  const bSource = await source(page);
  const other = await secondTab(page, 'tab');
  expect(await link(other)).toMatchObject({ graphicId: beta.id });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === 'spx-gfx-superseded') throw new DOMException('Quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  expect((await losingPass(page, beta)).conflicts).toBe(1);
  const { copy, alpha } = await afterLoss(page, beta.id, 'Beta', bSource);
  await expect.poll(async () => link(other), { message: 'the other tab stayed linked to the record that won' }).toMatchObject({ graphicId: copy.id, dirty: false });
  await draw(other, .40); await flush(other);
  await other.getByTestId('save-graphic').click(); await expect(other.getByTestId('save-status')).toHaveText('Saved');
  await expect(other.getByTestId('save-dialog')).toHaveCount(0);
  await settleDurableWrites(other);
  const all = await library(other);
  expect(all, 'Alpha and the conflicted copy').toHaveLength(2);
  expect(await record(other, beta.id), 'the other tab\'s Save wrote over the other device\'s record').toBe(alpha);
  expect(body(all.find(g => g.id === copy.id)!.template)).toEqual(body(await source(other)));
});
