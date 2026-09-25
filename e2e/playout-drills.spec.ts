import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent, openWorkingGraphicInEditor } from './_create';
import { parkFocusOffControls } from './_keys';
import { armStorageFailure, fillStorage, freeStorage } from './_storage';

// Recovery drills (docs/GOALS_ARCHIVE.md "Student release" step 10 — the agent-automatable half).
// Each drill is a classroom failure that must be OBSERVED handled, not assumed: the ones
// needing the real backend/hardware (renderer reboot, boot recovery on /output, republish
// payload swap) live on the owner checklist (docs/STUDENT_RELEASE_ACCEPTANCE.md) and the
// live-verify list (docs/CLOUD_PLAYOUT.md §8); wrong-take → Out / All out is pinned in
// productions.spec.ts; expired-session recovery in configured/account.spec.ts. What runs
// here is the one drill that is fully offline: storage exhaustion.

test('storage full: a save fails LOUDLY, the library keeps the last good copy, freeing space recovers', async ({ page }) => {
  await armStorageFailure(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);

  // Save once — the baseline copy that must survive everything below.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Quota victim');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // From here the browser refuses every durable write — the classroom failure is a device
  // already stuffed with graphics and fonts (e2e/_storage.ts explains why this is injected
  // rather than provoked now that the documents live in IndexedDB).
  await fillStorage(page);

  // Edit, then try to save. The status must say FAILED — a silent failure is the one outcome
  // this drill exists to rule out — and the stored record must still be the last good copy,
  // not a torn write. That second half is what the durable store's mirror rollback buys: the
  // write is taken optimistically and confirmed a moment later, so without the rollback the
  // library would go on serving an edit that never reached the disk.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* mid-crisis edit */\n/*' + 'y'.repeat(256 * 1024) + '*/\n' });
  });
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveText('Save failed');

  const stored = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const doc = loadGraphics().find((g) => g.name === 'Quota victim');
    return { exists: !!doc, carriesEdit: doc?.template.css.includes('mid-crisis edit') ?? false };
  });
  expect(stored.exists).toBe(true);
  expect(stored.carriesEdit).toBe(false); // the last GOOD copy, not a torn write

  // Freeing space recovers without a reload: the same Ctrl+S lands the edit. (An earlier
  // refusal must never latch — a "the store is full" flag that short-circuits the next write
  // would deadlock exactly the write that would clear it.)
  await freeStorage(page);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const after = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().find((g) => g.name === 'Quota victim')?.template.css.includes('mid-crisis edit') ?? false;
  });
  expect(after).toBe(true);
});

/** Air a graphic from a fresh production and land on its dashboard. */
async function productionOnAir(page: import('@playwright/test').Page, name: string): Promise<void> {
  await openProductionWithCurrent(page, name);
}

test('SPACE puts the selected cue on air and takes it off again, and 0 still means Out', async ({ page }) => {
  // Acceptance pass, 2026-08-06: "you take with space and go out with — is it zero? It should
  // be take. Put something on and take takes it off. It should go in and out with space."
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionOnAir(page, 'Space Toggle');

  const chip = page.getByTestId('live-cue-chip');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(chip).not.toContainText('nothing on air');
  // THE BUTTON IS THE KEY (operator feedback 2026-08-07: SPACE took a live cue off while the
  // button beside it re-took). The primary control now says what the press will do, and it is
  // the same thing either way round.
  await expect(page.getByTestId('verb-take')).toContainText('TAKE OFF');
  await expect(page.getByTestId('verb-take')).toContainText('SPACE');
  await expect(page.getByTestId('verb-out')).not.toContainText('SPACE');

  await page.keyboard.press(' ');
  await expect(chip).toContainText('nothing on air');
  await expect(page.getByTestId('verb-take')).toContainText('TAKE');
  await expect(page.getByTestId('verb-take')).not.toContainText('TAKE OFF');
  // Re-take is greyed on a cue that is off air — there is nothing to replay. It stays in
  // place rather than disappearing, so no verb ever moves under a finger.
  await expect(page.getByTestId('verb-retake')).toBeDisabled();

  // 0 keeps working, from either state — the toggle ADDS a gesture, it replaces none.
  await page.keyboard.press(' ');
  await expect(chip).not.toContainText('nothing on air');
  await page.keyboard.press('0');
  await expect(chip).toContainText('nothing on air');

  // RE-TAKE is a SECONDARY control with its own key. It replays the entrance and leaves the
  // cue on air — which is what tells it apart from the toggle beside it.
  await page.keyboard.press(' ');
  const retake = page.getByTestId('verb-retake');
  await expect(retake).toBeEnabled();
  await retake.click();
  await expect(chip).not.toContainText('nothing on air');
  await parkFocusOffControls(page);
  await page.keyboard.press('r');
  await expect(chip).not.toContainText('nothing on air');
  // …and the toggle still turns it off, right after a re-take.
  await page.keyboard.press(' ');
  await expect(chip).toContainText('nothing on air');
});

test('the rundown walks with the arrow keys, so a cue can be played out from the keyboard alone', async ({ page }) => {
  // Operator feedback 2026-08-07: a Stream Deck is a keyboard emulator, so arrow keys plus the
  // existing verbs ARE Stream Deck support — but only if the selection itself is reachable.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionOnAir(page, 'Arrows');

  // A second cue, so there is somewhere to walk to.
  await page.getByTestId('add-cue').click();
  await expect(page.locator('.pd-cue')).toHaveCount(2);

  await parkFocusOffControls(page);
  await page.keyboard.press('ArrowDown');
  const selected = page.locator('.pd-cue.selected');
  await expect(selected).toHaveCount(1);
  const second = await selected.textContent();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.pd-cue.selected')).not.toHaveText(second ?? '');

  // The ends hold rather than wrapping: an operator pressing up at the top must not land on
  // the last item of the rundown and take THAT.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.pd-cue').first()).toHaveClass(/selected/);

  // And the keyboard alone airs it.
  await page.keyboard.press(' ');
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('nothing on air');
});

test('an edit to the cue that is on air says it has not been sent yet', async ({ page }) => {
  // Acceptance pass, 2026-08-06: "there needs to be an alert when something changes and you
  // need to send that update. I had problems with my CasparCG output but only because I hadn't
  // sent an update, and the dashboard doesn't prompt me."
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionOnAir(page, 'Unsent');

  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  const unsent = page.getByTestId('cue-unsent');
  await expect(unsent).toContainText('changes push live on');

  // Type into the live cue: air is now behind the screen, and the surface says so.
  await page.getByTestId('cue-field-f0').fill('Not sent yet');
  await expect(unsent).toContainText('not on air yet');
  await expect(page.getByTestId('verb-update')).toHaveClass(/pd-unsent/);
  // …and it is telling the truth — air still shows the previous value.
  await expect(program.locator('#f0')).not.toHaveText('Not sent yet');

  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f0')).toHaveText('Not sent yet');
  await expect(unsent).toContainText('changes push live on');
  await expect(page.getByTestId('verb-update')).not.toHaveClass(/pd-unsent/);
});
