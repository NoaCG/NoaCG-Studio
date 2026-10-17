// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/components/save/StorageAlertDialog.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 7): a leave started while Ctrl+S is still
// writing (#1392), the same rows as save-transaction-leave.spec.ts runs through the topbar Save.
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { source } from './_layerProperty';
import { LEAVES, OUTCOMES, arm, body, errors, leave, left, library, link, nothingAsks, prepare, release, releasable, saved, stayed } from './_saveMatrix';

// Ctrl+S leaves the editor usable while it writes, like the topbar Save: the leave asks over the
// editor, says the save is running, and answers with the save's own answer. The body is the
// topbar file's; one door per file keeps each file under a shard's budget (e2e/_saveMatrix.ts).
for (const door of ['ctrl+s'] as ('topbar' | 'ctrl+s')[]) for (const how of LEAVES) for (const outcome of OUTCOMES) {
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
