// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts, src/components/wizard/shell/doors.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repairs 6 and 7): the leave continues once the save
// lands (#1386), and a leave started while a topbar Save or Ctrl+S is still writing (#1392).
// One of the five save-transaction*.spec.ts files: the fault injector, the doors and the case
// list's home are in e2e/_saveMatrix.ts (and why the matrix is split across files).
import { test, expect } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { open, draw, source } from './_layerProperty';
import { LEAVES, OUTCOMES, acted, arm, body, errors, install, leave, left, library, link, nothingAsks, prepare, release, releasable, saved, stayed } from './_saveMatrix';

// ── The leave continues once the save lands, however it was asked for (#1386) ──────────────

for (const how of ['hash', 'back', 'back without the Navigation API'] as const) {
  test(`matrix leave replay: ${how} -> first Save under a new name -> leaves`, async ({ page }) => {
    test.setTimeout(120_000);
    // Browsers without `window.navigation` replay Back by counting, then check it arrived.
    if (how !== 'hash' && how !== 'back') await page.addInitScript(() => { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); });
    await open(page); await draw(page, .3); await settleDurableWrites(page);
    const editorUrl = page.url();
    if (how === 'hash') await page.evaluate(() => { location.hash = '#/home'; });
    // Back first walks the preview frame's own entries (no route event), then reaches the app route.
    else for (let i = 0; i < 6 && !(await page.getByTestId('confirm-switch').count()); i++) {
      await page.evaluate(() => history.back()); await page.waitForTimeout(400);
    }
    await expect(page.getByTestId('confirm-switch')).toBeVisible();
    await page.getByTestId('switch-save').click(); await page.getByTestId('save-name').fill('Matrix replay');
    await install(page);
    // Hold the link write until the name adoption has rebuilt the preview: its frame navigation
    // inserts a history entry while the guard waits, which is what lost the replayed traversal.
    await page.locator('iframe[title="Foundation graphic preview"]').evaluate(f => {
      Object.assign(window, { frameLoads: 0 });
      f.addEventListener('load', () => { (window as unknown as { frameLoads: number }).frameLoads++; });
    });
    await arm(page, 'K', 'hold');
    await page.getByTestId('save-confirm').click(); await releasable(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { frameLoads: number }).frameLoads)).toBeGreaterThan(0);
    await release(page);
    await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
    expect(page.url()).not.toBe(editorUrl);
    if (how === 'hash') await expect(page).toHaveURL(/#\/home$/);
    expect(await library(page)).toHaveLength(1);
  });
}

// The topbar Save and Ctrl+S leave the editor usable while they write: the leave asks over the
// editor, says the save is running, and answers with the save's own answer.
for (const door of ['topbar', 'ctrl+s'] as const) for (const how of LEAVES) for (const outcome of OUTCOMES) {
  test(`matrix in-flight leave: ${door} / K ${outcome}, ${how}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, 'topbar');
    await arm(page, 'K', outcome === 'held' ? 'hold' : 'late');
    if (door === 'topbar') await page.getByTestId('save-graphic').click();
    else await page.keyboard.press('Control+s');
    await releasable(page);
    const requested = await source(page);
    await leave(page, how);
    const ask = page.getByTestId('confirm-switch');
    await expect(ask, 'the leave asked while the save was writing').toBeVisible();
    await expect(ask).toContainText('Saving');
    await stayed(page);
    await release(page);
    if (outcome === 'held') {
      // Landed: the dialog says so and waits for the user, who continues.
      await expect(ask).toContainText('is saved');
      await stayed(page);
      await page.getByTestId('switch-save').click();
    } else {
      // Refused: the failure is shown where the user is, and nothing left.
      await expect(ask.locator('.status-bad')).toBeVisible();
      await stayed(page);
      expect(await errors(page), 'the refusal was announced by the app as well as the dialog').toBe(0);
      expect(await link(page)).toMatchObject({ graphicId: before[0].id, dirty: true, status: 'failed' });
      if (outcome === 'refused') {
        await page.getByTestId('switch-cancel').click();
        await expect(ask).toHaveCount(0);
        await stayed(page);
        await expect(page.getByTestId('save-status')).toHaveText('Save failed');
        await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
        expect(await library(page), 'nothing minted').toHaveLength(1);
        expect(await link(page), 'the reload tells the truth: linked, unsaved').toMatchObject({ graphicId: before[0].id, dirty: true });
        expect(body(await source(page))).toEqual(body(requested));
        return;
      }
      await page.getByTestId('switch-save').click();
    }
    await left(page, how);
    const record = await saved(page, 'topbar', before);
    expect(body(record.template)).toEqual(body(requested));
    await nothingAsks(page, record.id);
  });
}

// A Save of a graphic with nothing unsaved, its record write refused while the leave asks: the
// refusal leaves `dirty` false, and must not read as landed (review on #1397).
test('matrix in-flight leave: topbar / L refused on a clean graphic, home, then retry', async ({ page }) => {
  test.setTimeout(120_000);
  const { before } = await prepare(page, 'topbar');
  await page.getByTestId('save-graphic').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  const requested = await source(page);
  await arm(page, 'L', 'late');
  await page.getByTestId('save-graphic').click();
  await releasable(page);
  await leave(page, 'home');
  const ask = page.getByTestId('confirm-switch');
  await expect(ask).toContainText('Saving');
  await release(page);
  await expect(ask.locator('.status-bad')).toBeVisible();
  await expect(ask, 'a refused save read as landed').not.toContainText('is saved');
  await expect(page.getByTestId('switch-save')).toHaveText('Save & continue');
  await stayed(page);
  expect(await errors(page)).toBe(0);
  await page.getByTestId('switch-save').click();
  await left(page, 'home');
  expect(await acted(page), 'the retry wrote the record again').toEqual(['late L']);
  const record = await saved(page, 'topbar', before);
  expect(body(record.template)).toEqual(body(requested));
  await nothingAsks(page, record.id);
});
