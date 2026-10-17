// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/components/save/StorageAlertDialog.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 6): a write REFUSED once, then the door pressed
// again or the page reloaded, and the reservation and link both refused (#1383, sixth check S6);
// then whose the reservation is, across two tabs, a duplicated tab and a new tab (#1402, repair 8).
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { draw, open, source } from './_layerProperty';
import { type Door, type Write, acted, arm, body, editFor, errors, flush, install, landed, library, link, newAsks, prepare, press, refusedHere, retry, saved, settledClean, writesOf } from './_saveMatrix';

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
