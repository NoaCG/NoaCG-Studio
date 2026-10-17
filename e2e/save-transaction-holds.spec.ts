// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/components/save/StorageAlertDialog.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 6): a write HELD while the user edits, replaces
// the document or presses the door again, an autosave between the reservation and the link, and an
// autosave already in flight when the Save starts.
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { open, draw, source, ready } from './_layerProperty';
import { type Door, type Write, FIRST, NAME, acted, arm, body, commandEdit, editFor, errors, flush, install, landed, leaves, library, link, prepare, press, refusedHere, release, releasable, saved, settledClean } from './_saveMatrix';

// ── Hold a write, edit meanwhile ─────────────────────────────────────────────────────────────

for (const [door, w] of [['leave', 'L'], ['leave', 'K'], ['leave', 'F'], ['first-named', 'R'], ['first-named', 'L'], ['first-named', 'K'], ['first-named', 'F'], ['save-as', 'L'], ['save-as', 'K'], ['topbar', 'K']] as [Door, Write][]) {
  test(`matrix hold+edit: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'hold');
    await press(page, door, editFor(door, w));
    await releasable(page);
    const requested = await source(page);
    await commandEdit(page); await ready(page);
    const newer = await source(page);
    await release(page);
    // The save answered for the source it was asked to write; the newer edit keeps the draft unsaved.
    if (door === 'leave') await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while saving');
    else if (FIRST.includes(door)) { await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('confirm-switch')).toBeVisible(); }
    else { await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes'); }
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    const record = await saved(page, door, before);
    expect(body(record.template), 'the record holds what the save was asked to write').toEqual(body(requested));
    expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: true });
    expect(await errors(page)).toBe(0);
    // The next save writes the newer edit into the same record.
    if (leaves(door)) await page.getByTestId('switch-save').click(); else await page.getByTestId('save-graphic').click();
    await landed(page, leaves(door) ? 'leave' : 'topbar');
    const again = await saved(page, door, before);
    expect(again.id).toBe(record.id); expect(body(again.template)).toEqual(body(newer));
    await settledClean(page, leaves(door) ? 'leave' : 'topbar', record.id);
  });
}

// ── An autosave that fires between the reservation and the link, then K refused and a reload ──

// The kept name: a new name's adoption schedules a later autosave that relinks on its own.
for (const door of ['first-kept'] as Door[]) {
  test(`matrix reservation kept: ${door} / L held, an autosave fires, K refused, reload`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, 'L', 'hold');
    await arm(page, 'K', 'refuse');
    await press(page, door);
    await releasable(page);
    // An edit while the record waits: its 800 ms autosave fires before the link write is made.
    const slotPuts = () => page.evaluate(() => performance.getEntriesByName('matrix-slot').length);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) { if (key === 'spx-gfx-project') performance.mark('matrix-slot'); return put.call(this, value, key); };
    });
    await commandEdit(page);
    await expect.poll(slotPuts, { timeout: 5000 }).toBeGreaterThan(0);
    await release(page);
    await expect.poll(() => acted(page)).toEqual(['hold L', 'refuse K']);
    await refusedHere(page, door);
    const minted = (await library(page)).find(g => !before.some(b => b.id === g.id))!;
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await link(page), 'the autosave dropped the reservation, so the reload lost the minted record').toMatchObject({ graphicId: minted.id, dirty: true });
    const newer = await source(page);
    await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
    await expect(page.getByTestId('home-page')).toBeVisible();
    const all = await library(page);
    expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
    expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(newer));
  });
}

// ── Replace the document while a topbar Save waits (the only door that leaves the editor usable) ──
// Since repair 7 the replacement cannot start mid-save: Open asks while the save writes (#1392),
// and the other graphic opens only once the user continues after it landed.

for (const w of ['K', 'F'] as Write[]) {
  test(`matrix replace: topbar / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .22);
    await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Matrix other');
    await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
    const [other] = await library(page);
    await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
    await page.getByTestId('save-name').fill(NAME); await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await draw(page, .52); await flush(page); await settleDurableWrites(page);
    await install(page);
    await arm(page, w, 'hold');
    await press(page, 'topbar', w === 'F');
    await releasable(page);
    const requested = await source(page), record = (await library(page)).find(g => g.name === NAME)!;
    await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
    await expect(page.getByTestId('confirm-switch'), 'Open asked while the save was writing').toContainText('Saving');
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    await release(page);
    await expect(page.getByTestId('confirm-switch')).toContainText('is saved');
    await page.getByTestId('switch-save').click();
    await page.locator('.lib-row', { hasText: 'Matrix other' }).getByTestId('open-graphic').click();
    await page.getByTestId('control-open-editor').click();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
    const all = await library(page);
    expect(all).toHaveLength(2);
    expect(body(all.find(g => g.id === record.id)!.template), 'the replaced save still holds its source').toEqual(body(requested));
    expect(await link(page), 'the opened graphic owns the link').toMatchObject({ graphicId: other.id, dirty: false });
    expect(await errors(page)).toBe(0);
    await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await link(page)).toMatchObject({ graphicId: other.id });
  });
}

// ── Double submission while a write is held ──────────────────────────────────────────────────

for (const [door, w] of [['topbar', 'L'], ['leave', 'L'], ['first-named', 'R'], ['first-named', 'L'], ['save-as', 'L']] as [Door, Write][]) {
  test(`matrix double: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'hold');
    await press(page, door);
    await releasable(page);
    const requested = await source(page);
    // Press again every way the door offers while the first press waits.
    if (door === 'topbar') { await page.getByTestId('save-graphic').click(); await page.keyboard.press('Control+s'); }
    else if (door === 'leave') await page.getByTestId('switch-save').click({ force: true, timeout: 2000 }).catch(() => undefined);
    else {
      await page.getByTestId('save-name').press('Enter', { timeout: 2000 }).catch(() => undefined);
      await page.getByTestId('save-confirm').click({ force: true, timeout: 2000 }).catch(() => undefined);
    }
    await release(page);
    await landed(page, door);
    const record = await saved(page, door, before);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── An autosave already in flight when the Save starts, refused late ─────────────────────────

for (const door of ['leave', 'first-named'] as Door[]) {
  test(`matrix in-flight: ${door} / I`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, 'I', 'late');
    await commandEdit(page);
    // The edit's own timer fires and its put stays open: in flight when the save starts.
    await releasable(page);
    await press(page, door);
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    await release(page);
    await landed(page, door);
    const requested = await source(page);
    const record = await saved(page, door, before);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}
