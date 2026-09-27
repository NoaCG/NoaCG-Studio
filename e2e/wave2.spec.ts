// covers: src/templates/**

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { createProject } from './_create';

// Wave-2 categories: starting-soon, game timer, scoreboard, corner bug, infographic, quiz.
// One create + play + behavior spec per category.

async function createFrom(page: Page, categoryName: string, variantName: string) {
  await createProject(page, { category: categoryName, name: variantName });
}

function frame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
}

test('starting soon: holds on screen and the countdown ticks', async ({ page }) => {
  await createFrom(page, 'Holding', 'Quiet Hold');
  const clock = frame(page).locator('.starting-soon-clock');
  await expect(clock).toHaveText('5:00'); // idle paint shows the full duration
  await page.getByRole('button', { name: '▶ Play' }).click();
  // startClock() fires after the entrance, so give the first tick a wide window.
  await expect(clock).not.toHaveText('5:00', { timeout: 6000 });
  await expect(clock).toHaveText(/^\d+:\d{2}$/);
});

test('game timer: label binds and the clock runs', async ({ page }) => {
  await createFrom(page, 'Timers', 'Clean Clock');
  await expect(frame(page).locator('#f0')).toHaveText('ROUND 1');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect(frame(page).locator('.game-timer-clock')).not.toHaveText('3:00', { timeout: 6000 });
});

test('scoreboard: all four fields bind and a score change lands', async ({ page }) => {
  await createFrom(page, 'Scoreboards', 'Match Strip');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame(page).locator('.scoreboard').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  // Change Score A in the Data panel and push it with ⟳ Update.
  await page.getByTestId('dock-tab-data').click();
  // Score A is a number field: the stepper renders a value box AND an operator step-size box,
  // so name the value one rather than relying on which comes first in the DOM.
  const scoreInput = page.locator('.panel-body .field-row', { hasText: 'Score A' })
    .locator('input.ctl-num:not(.ctl-num-step)');
  await scoreInput.fill('5');
  await page.locator('.panel-body').getByRole('button', { name: '⟳ Update' }).click();
  await expect(frame(page).locator('#f1')).toHaveText('5');
  await expect(frame(page).locator('#f2')).toHaveText('AWAY');
});

test('corner bug: plays with the placeholder mark', async ({ page }) => {
  await createFrom(page, 'corner logos', 'Glass Mark');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame(page).locator('.corner-bug').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(frame(page).locator('#f0')).toHaveText('LIVE');
});

test('infographic: the stat counts up to its value', async ({ page }) => {
  await createFrom(page, 'Statistics', 'Big Stat');
  const value = frame(page).locator('#f0');
  await expect(value).toHaveText('87%');
  await page.getByRole('button', { name: '▶ Play' }).click();
  // Mid-count the text is a smaller number; it must settle back on the target.
  await expect(value).toHaveText('87%', { timeout: 8000 });
  await expect
    .poll(async () => frame(page).locator('.infographic').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('quiz: options bind and Next reveals the correct answer', async ({ page }) => {
  await createFrom(page, 'quizzes', 'Arena Quiz');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect(frame(page).locator('#f2')).toHaveText('Mars');
  await expect(frame(page).locator('.quiz-correct')).toHaveCount(0); // no reveal before next()
  await page.getByRole('button', { name: '» Next' }).click();
  const correct = frame(page).locator('.quiz-option.quiz-correct');
  await expect(correct).toHaveCount(1);
  await expect(correct.locator('#f2')).toHaveText('Mars'); // f5 default 'B' -> option 2
  await expect(frame(page).locator('.quiz-dim')).toHaveCount(3);
});
