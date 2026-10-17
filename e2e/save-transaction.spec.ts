// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/components/save/StorageAlertDialog.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 6): a write REFUSED once, then the door pressed
// again or the page reloaded, and the reservation and link both refused (#1383, sixth check S6).
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { source } from './_layerProperty';
import { type Door, type Write, acted, arm, body, editFor, errors, install, landed, library, link, newAsks, prepare, press, refusedHere, retry, saved, settledClean, writesOf } from './_saveMatrix';

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
