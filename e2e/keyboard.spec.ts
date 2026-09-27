// StepTimeline owns the Space-plays handler - one half of a two-surface key contract whose other
// half sits in PreviewFrame, which is CORE.
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}
//
// WHO OWNS A KEY (src/components/spaceKey.ts).
//
// Several components listen for the same keys on `window`. They are siblings on one node, so
// stopPropagation cannot separate them and the order they fire in is only the order they
// subscribed - which means a guard that works today can break because an unrelated effect
// gained a dependency. The contract is therefore that each surface ASKS who owns the key rather
// than claiming it, and these tests assert the surfaces that should NOT act stayed quiet.
//
// Every case here is written the hard way round: not "the intended thing happened" but "the
// unintended second thing did not". A spec of the first kind passed for months while holding
// Space to pan also replayed the graphic on every OS key-repeat.

import { test, expect } from '@playwright/test';
import { createProject } from './_create';
import { countPlays, holdKeyRepeats, parkFocusOffControls, playCount, stampTimeline, timelineState } from './_keys';

test('a held Space over the timeline plays ONCE, not once per key-repeat', async ({ page }) => {
  await createProject(page);
  await page.keyboard.press('Escape');
  await countPlays(page);

  // Pointer off the stage, so the timeline owns Space. Holding it is one press, not thirty.
  await page.mouse.move(4, 4);
  await page.keyboard.down(' ');
  await holdKeyRepeats(page, 8);
  await page.keyboard.up(' ');

  expect(await playCount(page)).toBe(1);
});

// Space over the STAGE is one key with two meanings, split by the gesture rather than by the
// surface (src/components/spaceKey.ts). The pair below is written the hard way round in both
// directions: the tap test fails if the pan ALSO answers (two plays instead of one) and the hold
// test fails if play answers a gesture that belongs to the pan.
test('a Space TAP over the stage plays, exactly like one over the timeline', async ({ page }) => {
  await createProject(page);
  await page.keyboard.press('Escape');
  await parkFocusOffControls(page);
  await countPlays(page);

  // The pointer over the preview hands Space to the canvas - which used to mean the key did
  // nothing at all, because a pan needs a DRAG and a tap never provides one.
  await page.getByTestId('preview-stage').hover();
  await page.keyboard.press(' ');
  await page.waitForTimeout(250);

  expect(await playCount(page)).toBe(1);
});

test('a HELD Space over the stage stays a pan and never plays', async ({ page }) => {
  await createProject(page);
  await page.keyboard.press('Escape');
  await parkFocusOffControls(page);
  await countPlays(page);

  // Real OS auto-repeat is the whole gesture: `keyboard.down` alone sends one keydown, which is
  // indistinguishable from a tap and would pass this test without exercising anything.
  await page.getByTestId('preview-stage').hover();
  await page.keyboard.down(' ');
  await holdKeyRepeats(page, 8);
  await page.keyboard.up(' ');
  await page.waitForTimeout(250);

  expect(await playCount(page)).toBe(0);
});

test('Space on a focused button activates the button instead of playing', async ({ page }) => {
  await createProject(page);
  await page.keyboard.press('Escape');
  await countPlays(page);
  await stampTimeline(page);

  // Space is the button key. Taking it globally leaves the editor unusable without a mouse.
  const btn = page.getByTestId('toggle-code');
  await btn.focus();
  await page.keyboard.press(' ');

  expect(await playCount(page)).toBe(0);
  expect(await timelineState(page)).not.toBe('fresh');
});

test('a modal takes the editor shortcuts: Delete behind the wizard changes nothing', async ({ page }) => {
  await createProject(page);
  await page.keyboard.press('Escape');

  // Select a layer so Delete has something it could act on, then open the wizard over it.
  await page.locator('.tlv2-labels .timeline-label').first().click();
  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().openGallery();
  });
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  expect(after).toBe(before); // the document behind a dialog is not the dialog's to edit
});

test('Ctrl+C yields to a live text selection instead of swallowing the copy', async ({ page }) => {
  await createProject(page);
  await page.keyboard.press('Escape');

  // With a keyframe set selected the timeline wants Ctrl+C for its own copy - but the browser's
  // copy only exists while something is highlighted, so a live selection has to win.
  const diamond = page.locator('.tlv2-kf').first();
  if (await diamond.count()) await diamond.click();

  // Highlight some text, then watch whether anything preventDefaults the copy. A swallowed
  // Ctrl+C is silent - the clipboard just keeps its old contents - so the only honest probe is
  // the event's own defaultPrevented, read in the BUBBLE phase after every handler has run.
  await page.evaluate(() => {
    const el = document.querySelector('.tlv2-labels .timeline-label');
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    const w = window as unknown as { __copyPrevented?: boolean };
    w.__copyPrevented = undefined;
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey)) w.__copyPrevented = e.defaultPrevented;
    });
  });
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(200);

  expect(await page.evaluate(() => (window as unknown as { __copyPrevented?: boolean }).__copyPrevented))
    .toBe(false);
});
