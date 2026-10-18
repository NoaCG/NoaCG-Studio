// covers: none - disposable eighth independent leave-editor check (Phase 2, check 8); never land
//
// Adversarial challenges written by the eighth checker against repair-8 (#1414, the reservation's
// owner). Repair-8's matrix presses two tabs and a duplicate AFTER the second tab's mirror has
// adopted the first tab's record, a crash after a double refusal, and an unmarked slot, all
// through the topbar Save. These press what it leaves out:
//
//   - another tab's write landing in the library-mirror lag the repair names as a trap (the
//     second tab's BroadcastChannel delivery of the library write is held, as on a busy or
//     throttled tab, so its autosave still names the record, unmarked), then a reload or none,
//     answered through the leave dialog with Save & continue or Discard;
//   - a crash while the record write is unconfirmed, after an edit made during the save
//     (the mint mark is then the only evidence that the newer draft is the record's);
//   - a duplicate tab that edits while the minting tab's leave dialog shows a refused link
//     write, then both tabs answer their own leave;
//   - a slot left by an older build naming another draft's record, answered with Discard.
//
// The cross-DEVICE form of the same pointer (the working slot syncs as a singleton, so a second
// device boots the first device's reservation) is in e2e/configured/leave-eighth-device.spec.ts.
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { install, arm, acted, releasable, library, link, flush, body, newAsks, commandEdit } from './_saveMatrix';

const LIB = 'spx-gfx-graphics';
const out = (name: string, value: unknown) => writeFileSync(test.info().outputPath(name), JSON.stringify(value, null, 2));
const dialog = (page: Page) => page.getByTestId('confirm-switch');
const rawSlot = (page: Page) => page.evaluate(async () => JSON.parse((await import('/src/model/durableStore.ts')).durable.getItem('spx-gfx-project') ?? 'null'));
/** The slot as it is ON DISK (not this tab's mirror). */
const diskSlot = (page: Page) => page.evaluate(() => new Promise<Record<string, unknown> | null>((resolve, reject) => {
  const request = indexedDB.open('noacg-studio');
  request.onsuccess = () => {
    const tx = request.result.transaction('kv', 'readonly'), get = tx.objectStore('kv').get('spx-gfx-project');
    tx.oncomplete = () => { const v = get.result; request.result.close(); resolve(v === undefined ? null : JSON.parse(String(v))); };
    tx.onerror = () => reject(tx.error);
  };
  request.onerror = () => reject(request.error);
}));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A second tab on the same draft. `lag`: its delivery of other tabs' LIBRARY writes can be held
 *  (the mirror lag), released with `catchUp`. `duplicate`: the browser's Duplicate tab, which
 *  copies sessionStorage. */
async function secondTab(page: Page, how: 'tab' | 'duplicate', lag = false) {
  const other = await page.context().newPage();
  if (how === 'duplicate') {
    const session = await page.evaluate(() => JSON.stringify(Object.entries(sessionStorage)));
    await other.addInitScript(session => {
      if (window.top === window && !sessionStorage.length) for (const [k, v] of JSON.parse(session) as [string, string][]) sessionStorage.setItem(k, v);
    }, session);
  }
  if (lag) {
    await other.addInitScript(key => {
      if (window.top !== window) return;
      const w = window as unknown as { __lag: { hold: boolean; held: (() => void)[]; heldKeys: string[] } };
      w.__lag = { hold: true, held: [], heldKeys: [] };
      const Original = window.BroadcastChannel;
      class Lagged extends Original {
        set onmessage(handler: ((event: MessageEvent) => void) | null) {
          super.onmessage = handler && ((event: MessageEvent) => {
            if (w.__lag.hold && event.data?.key === key) { w.__lag.held.push(() => handler.call(this, event)); w.__lag.heldKeys.push(String(event.data.key)); }
            else handler.call(this, event);
          });
        }
        get onmessage() { return super.onmessage; }
      }
      window.BroadcastChannel = Lagged;
    }, LIB);
  }
  await other.goto(page.url()); await expect(other.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  return other;
}
const catchUp = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __lag: { hold: boolean; held: (() => void)[] } };
  w.__lag.hold = false; const n = w.__lag.held.length; w.__lag.held.splice(0).forEach(deliver => deliver()); return n;
});
/** Home -> the leave dialog asks -> Save & continue -> a name -> Home. Returns whether each asked. */
async function leaveSaving(page: Page, name: string) {
  await page.getByTestId('open-home').click();
  await expect(dialog(page).or(page.getByTestId('home-page')).first()).toBeVisible();
  const asked = await dialog(page).count();
  if (!asked) return { asked, named: 0 };
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('save-name').or(page.getByTestId('home-page')).first()).toBeVisible();
  const named = await page.getByTestId('save-name').count();
  if (named) { await page.getByTestId('save-name').fill(name); await page.getByTestId('save-confirm').click(); }
  await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page);
  return { asked, named };
}
/** After the leave: New asks nothing at Home, before or after a reload. */
async function nothingAsks(page: Page, facts: Record<string, unknown>, prefix = '') {
  facts[`${prefix}newAsked`] = await newAsks(page);
  if (facts[`${prefix}newAsked`]) await page.getByTestId('switch-cancel').click();
  await settleDurableWrites(page);
  await page.goto('/app#/home'); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  facts[`${prefix}newAskedAfterReload`] = await newAsks(page);
  if (facts[`${prefix}newAskedAfterReload`]) await page.getByTestId('switch-cancel').click();
}
/** A first Save of the open never-saved draft through the leave dialog, as A does in each case. */
async function alphaFrom(page: Page, name: string) {
  await draw(page, .52); await flush(page); await settleDurableWrites(page);
  const leave = await leaveSaving(page, name);
  expect(leave, 'A\'s never-saved draft: Home asks and the first Save asks for a name').toEqual({ asked: 1, named: 1 });
  const alpha = (await library(page)).find(g => g.name === name)!;
  expect(alpha, 'A\'s Save minted its record').toBeTruthy();
  return alpha;
}

// ── Another tab's autosave lands in the library-mirror lag ─────────────────────────────────────

for (const [how, reload, answer] of [
  ['tab', true, 'save'], ['duplicate', true, 'save'], ['tab', false, 'save'], ['tab', true, 'discard'],
] as const) {
  test(`eighth L-${how}-${reload ? 'reload' : 'no-reload'}-${answer}: B's autosave lands while B's mirror has not adopted A's first Save; B ${reload ? 'reloads, ' : ''}leaves with ${answer === 'save' ? 'Save & continue' : 'Discard'}`, async ({ page }) => {
    test.setTimeout(150_000);
    await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
    const b = await secondTab(page, how, true);
    const alpha = await alphaFrom(page, `Eighth L ${how} ${reload} ${answer} Alpha`);
    const facts: Record<string, unknown> = { alphaId: alpha.id };
    // B, still on the draft as B opened it, edits while its mirror does not yet hold Alpha.
    facts.bMirrorHasAlpha = (await library(b)).some(g => g.id === alpha.id);
    await draw(b, .40); await flush(b); await settleDurableWrites(b);
    const bSlot = await diskSlot(b);
    Object.assign(facts, { bSlotReservation: bSlot?.reservedGraphicId, bSlotMark: bSlot?.mintingReserved ?? null, bSlotLinked: bSlot?.graphicId ?? null });
    // The case is the trap only if B's write really named Alpha's record, unmarked.
    expect(facts.bMirrorHasAlpha, 'precondition: B\'s mirror had already adopted Alpha').toBe(false);
    expect(facts.bSlotReservation, 'precondition: B\'s write did not land in the lag (it does not name Alpha)').toBe(alpha.id);
    facts.delivered = await catchUp(b);
    await expect.poll(async () => (await library(b)).some(g => g.id === alpha.id)).toBe(true);
    if (reload) { await b.reload(); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 }); }
    facts.bLink = await link(b);
    const bSource = await source(b);
    await b.getByTestId('open-home').click();
    await expect(dialog(b).or(b.getByTestId('home-page')).first()).toBeVisible();
    facts.bAsked = await dialog(b).count();
    facts.bQuestion = facts.bAsked ? (await dialog(b).locator('p').allTextContents()).join(' | ') : null;
    if (answer === 'save') {
      if (facts.bAsked) await b.getByTestId('switch-save').click();
      await expect(b.getByTestId('save-name').or(b.getByTestId('home-page')).first()).toBeVisible();
      facts.bNamed = await b.getByTestId('save-name').count();
      if (facts.bNamed) { await b.getByTestId('save-name').fill(`Eighth L ${how} Beta`); await b.getByTestId('save-confirm').click(); }
    } else if (facts.bAsked) await b.getByTestId('switch-discard').click();
    await expect(b.getByTestId('home-page')).toBeVisible();
    await settleDurableWrites(b);
    const all = await library(b);
    const alphaNow = all.find(g => g.id === alpha.id);
    const bRecord = all.find(g => g.id !== alpha.id && same(body(g.template), body(bSource)));
    Object.assign(facts, { records: all.map(g => ({ id: g.id, name: g.name })), alphaUnchanged: same(alphaNow, alpha), alphaNowHoldsB: same(body(alphaNow?.template ?? {}), body(bSource)), bRecord: bRecord && { id: bRecord.id, name: bRecord.name }, bSlotAfter: await diskSlot(b).then(s => s && { graphicId: s.graphicId, reservedGraphicId: s.reservedGraphicId, dirty: s.dirty, mark: s.mintingReserved ?? null }) });
    await nothingAsks(b, facts, 'b.');
    facts.bLinkAfterReload = await link(b);
    out(`l-${how}-${reload}-${answer}.json`, facts);
    expect(facts.bLink, 'B\'s draft is linked to a graphic B never saved').toMatchObject({ graphicId: null });
    expect(facts.bAsked, 'B\'s never-saved edited draft left without the question').toBe(1);
    expect(facts.alphaUnchanged, 'Alpha is not byte-equal to what A saved').toBe(true);
    if (answer === 'save') {
      expect(facts.bNamed, 'B\'s first Save did not ask for a name').toBe(1);
      expect(bRecord, 'B\'s source is in no record of its own').toBeTruthy();
      expect(all, 'Alpha and B\'s record').toHaveLength(2);
    } else {
      expect(all, 'Discard created or removed a graphic').toHaveLength(1);
      expect((facts.bLinkAfterReload as { graphicId: string | null }).graphicId, 'after Discard and a reload B\'s draft is linked to Alpha').toBeNull();
    }
    expect(facts['b.newAsked'], 'New asked at Home').toBe(0);
    expect(facts['b.newAskedAfterReload'], 'New asked at Home after a reload').toBe(0);
  });
}

// ── A crash while the record write is unconfirmed, after an edit made during the save ─────────

test('eighth C-crash-edit: first Save from the leave dialog; the record write lands unconfirmed; an edit is made; the tab crashes; a new tab saves into the record', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  const url = page.url();
  await install(page);
  await arm(page, 'L', 'hold');
  await page.getByTestId('open-home').click(); await expect(dialog(page)).toBeVisible();
  await page.getByTestId('switch-save').click(); await page.getByTestId('save-name').fill('Eighth C');
  await page.getByTestId('save-confirm').click();
  await releasable(page);
  // An edit accepted while the record write waits; its autosave lands during the mint.
  await commandEdit(page); await flush(page);
  const newest = await source(page);
  await expect.poll(async () => (await diskSlot(page))?.template && same((await diskSlot(page))!.template, newest)).toBe(true);
  const facts: Record<string, unknown> = { acted: await acted(page), slotBeforeCrash: await diskSlot(page).then(s => s && { graphicId: s.graphicId, reservedGraphicId: s.reservedGraphicId, mark: s.mintingReserved ?? null }) };
  const context = page.context();
  await page.close();
  const tab = await context.newPage();
  await tab.goto(url); await expect(tab.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  const records = await library(tab);
  const minted = records.find(g => g.name === 'Eighth C');
  Object.assign(facts, { records: records.map(g => ({ id: g.id, name: g.name })), link: await link(tab), sourceKept: same(await source(tab), newest) });
  const leave = await leaveSaving(tab, 'Eighth C second');
  Object.assign(facts, leave);
  const all = await library(tab);
  facts.recordsAfter = all.map(g => ({ id: g.id, name: g.name }));
  facts.recordHoldsNewest = !!minted && same(body(all.find(g => g.id === minted.id)!.template), body(newest));
  await nothingAsks(tab, facts);
  out('c-crash-edit.json', facts);
  expect(minted, 'the record write landed before the crash').toBeTruthy();
  expect(facts.sourceKept, 'the crash lost the edit made during the save').toBe(true);
  expect(facts.link, 'the restored draft is the record it was minting').toMatchObject({ graphicId: minted!.id });
  expect(facts.named, 'the restored draft asked for a name again').toBe(0);
  expect(all, 'a second record was minted for the same work').toHaveLength(1);
  expect(facts.recordHoldsNewest, 'the record does not hold the edit made during the save').toBe(true);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

// ── A duplicate tab edits while the minting tab's leave dialog shows a refused link write ──────

test('eighth D-duplicate-refused: A\'s leave first-saves and its link write is refused; A cancels; a duplicate tab edits, reloads and leaves; A leaves again', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  const b = await secondTab(page, 'duplicate');
  await draw(page, .52); await flush(page); await settleDurableWrites(page);
  await install(page);
  await arm(page, 'K', 'refuse');
  await page.getByTestId('open-home').click(); await expect(dialog(page)).toBeVisible();
  await page.getByTestId('switch-save').click(); await page.getByTestId('save-name').fill('Eighth D Alpha');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').or(dialog(page)).locator('.status-bad').first()).toBeVisible();
  const aSource = await source(page);
  const alpha = (await library(page)).find(g => g.name === 'Eighth D Alpha')!;
  const facts: Record<string, unknown> = { acted: await acted(page), aLinkAfterRefusal: await link(page), homeDuringRefusal: await page.getByTestId('home-page').count() };
  // A cancels its leave; the editor stays.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  for (let i = 0; i < 2 && (await page.getByTestId('switch-cancel').count()); i++) await page.getByTestId('switch-cancel').click();
  await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(dialog(page)).toHaveCount(0);
  // The duplicate adopts the record, edits, reloads and leaves.
  await expect.poll(async () => (await library(b)).some(g => g.id === alpha.id)).toBe(true);
  await draw(b, .40); await flush(b); await settleDurableWrites(b);
  facts.bSlotReservation = (await diskSlot(b))?.reservedGraphicId;
  await b.reload(); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  facts.bLink = await link(b);
  const bSource = await source(b);
  facts.bLeave = await leaveSaving(b, 'Eighth D Beta');
  // A leaves again: its draft is linked to its record and the link was refused, so it asks; the Save writes into Alpha.
  facts.aLeave = await leaveSaving(page, 'Eighth D Alpha again');
  const all = await library(page);
  Object.assign(facts, { records: all.map(g => ({ id: g.id, name: g.name })), aLinkAfter: await link(page) });
  const beta = all.find(g => g.id !== alpha.id);
  facts.alphaHoldsA = same(body(all.find(g => g.id === alpha.id)!.template), body(aSource));
  facts.betaHoldsB = !!beta && same(body(beta.template), body(bSource));
  await nothingAsks(page, facts, 'a.');
  out('d-duplicate-refused.json', facts);
  expect(facts.homeDuringRefusal, 'Home mounted before the refused save was answered').toBe(0);
  expect(facts.bSlotReservation, 'the duplicate\'s write names the record A minted').not.toBe(alpha.id);
  expect(facts.bLink, 'the duplicate is linked to a graphic it never saved').toMatchObject({ graphicId: null });
  expect(facts.bLeave, 'the duplicate\'s never-saved draft: Home asks and Save asks for a name').toEqual({ asked: 1, named: 1 });
  expect(facts.aLeave, 'A\'s refused draft: Home asks and Save writes into its record').toEqual({ asked: 1, named: 0 });
  expect(all, 'Alpha and the duplicate\'s record').toHaveLength(2);
  expect(facts.alphaHoldsA, 'Alpha does not hold A\'s source').toBe(true);
  expect(facts.betaHoldsB, 'the duplicate\'s record does not hold its source').toBe(true);
  expect(facts['a.newAsked']).toBe(0);
  expect(facts['a.newAskedAfterReload']).toBe(0);
});

// ── A slot an older build left, naming another draft's record, answered with Discard ───────────

test('eighth O-old-slot-discard: an unmarked slot names a record that holds other work; the new tab asks at Home; Discard leaves the record and resets the draft', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page); await draw(page, .24); await flush(page); await settleDurableWrites(page);
  const url = page.url();
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Eighth O Alpha');
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  const alpha = (await library(page))[0];
  await draw(page, .52); await flush(page); await settleDurableWrites(page);
  await page.evaluate(async id => {
    const { durable } = await import('/src/model/durableStore.ts');
    const { mintingReserved: _, ...slot } = JSON.parse(durable.getItem('spx-gfx-project')!);
    durable.setItem('spx-gfx-project', JSON.stringify({ ...slot, graphicId: null, reservedGraphicId: id }));
  }, alpha.id);
  await settleDurableWrites(page);
  const context = page.context();
  await page.close();
  const tab = await context.newPage();
  await tab.goto(url); await expect(tab.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  const facts: Record<string, unknown> = { link: await link(tab) };
  await tab.getByTestId('open-home').click();
  await expect(dialog(tab).or(tab.getByTestId('home-page')).first()).toBeVisible();
  facts.asked = await dialog(tab).count();
  if (facts.asked) await tab.getByTestId('switch-discard').click();
  await expect(tab.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(tab);
  const all = await library(tab);
  Object.assign(facts, { records: all.length, alphaUnchanged: same(all.find(g => g.id === alpha.id), alpha), slotAfter: await rawSlot(tab).then(s => s && { graphicId: s.graphicId, reservedGraphicId: s.reservedGraphicId, dirty: s.dirty }) });
  await nothingAsks(tab, facts);
  facts.linkAfterReload = await link(tab);
  out('o-old-slot-discard.json', facts);
  expect(facts.link, 'a draft that does not match the record is linked to it').toMatchObject({ graphicId: null });
  expect(facts.asked, 'the never-saved edited draft left without the question').toBe(1);
  expect(facts.records, 'Discard created or removed a graphic').toBe(1);
  expect(facts.alphaUnchanged, 'Discard changed the record').toBe(true);
  expect((facts.slotAfter as { graphicId: string | null }).graphicId, 'the discarded draft is linked to the record').toBeNull();
  expect((facts.slotAfter as { reservedGraphicId: string }).reservedGraphicId, 'the discarded draft still names the record').not.toBe(alpha.id);
  expect((facts.linkAfterReload as { graphicId: string | null }).graphicId, 'after a reload the discarded draft is the record').toBeNull();
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});
