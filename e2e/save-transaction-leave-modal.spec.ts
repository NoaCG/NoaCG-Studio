// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/components/save/StorageAlertDialog.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 7): a browser leave (a hash change, Back) under
// Save As, the first Save's naming dialog and Discard while they write (#1392).
// Row map and shared helpers: e2e/_saveMatrix.ts.
import { test, expect } from '@playwright/test';
import { source } from './_layerProperty';
import { type Leave, type Write, OUTCOMES, arm, body, errors, landed, leave, left, library, nothingAsks, prepare, press, release, releasable, saved, settledClean, stayed } from './_saveMatrix';

// Save As, the first Save's naming dialog and Discard are modal while they write: a browser leave
// (a hash change, Back) is absorbed, the address stays on the editor, and only the leave the user
// had chosen before (first Save's and Discard's Home) goes on, once, after the answer.
type ModalDoor = 'save-as' | 'first-named' | 'discard';
for (const door of ['save-as', 'first-named', 'discard'] as ModalDoor[]) for (const how of ['hash', 'back'] as Leave[]) for (const outcome of OUTCOMES) {
  test(`matrix in-flight leave: ${door} / ${door === 'discard' ? 'D' : 'K'} ${outcome}, ${how}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door === 'discard' ? 'leave' : door);
    const w: Write = door === 'discard' ? 'D' : 'K';
    if (door === 'discard') {
      await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
      await arm(page, w, outcome === 'held' ? 'hold' : 'late');
      await page.getByTestId('switch-discard').click();
    } else {
      await arm(page, w, outcome === 'held' ? 'hold' : 'late');
      await press(page, door);
    }
    await releasable(page);
    const requested = await source(page);
    const editorUrl = page.url();
    await leave(page, how);
    await page.waitForTimeout(300);
    await stayed(page);
    expect(page.url(), 'the address stayed on the editor').toBe(editorUrl);
    await release(page);
    const modal = page.getByTestId(door === 'discard' ? 'confirm-switch' : 'save-dialog');
    if (outcome !== 'held') {
      await expect(modal.locator('.status-bad')).toBeVisible();
      await stayed(page);
      expect(await errors(page)).toBe(0);
      if (outcome === 'refused') {
        await modal.getByRole('button', { name: 'Cancel' }).click();
        await expect(modal).toHaveCount(0);
        await stayed(page);
        expect(await library(page), 'nothing minted twice').toHaveLength(before.length + (door === 'discard' ? 0 : 1));
        return;
      }
      if (door === 'discard') await page.getByTestId('switch-discard').click(); else await page.getByTestId('save-confirm').click();
    }
    if (door === 'save-as') {
      await landed(page, 'save-as');
      await stayed(page);
      const record = await saved(page, 'save-as', before);
      expect(body(record.template)).toEqual(body(requested));
      await settledClean(page, 'save-as', record.id);
      return;
    }
    await left(page, 'home');
    if (door === 'discard') {
      expect(await library(page), 'Discard wrote no library copy').toEqual(before);
      await nothingAsks(page, before[0].id);
      return;
    }
    const record = await saved(page, 'first-named', before);
    expect(body(record.template)).toEqual(body(requested));
    await nothingAsks(page, record.id);
  });
}
