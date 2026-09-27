// covers: none - no source path selected this spec when coverage moved into spec headers
// (2026-09-27); it runs when edited, on a full escalation and at night

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { SCORE_SVG, dropSvg, intoProduction } from './_svg-import';

// A SCORE TRACKER OFFERS A BOARD VERB ONLY WHEN ITS ARTWORK DRAWS THE MOMENT (the classroom walk
// of 2026-09-24). The classroom package's score tracker draws a flash per team and deliberately no
// Full time, and it used to get a Full time button anyway: a press moved the state chip to Final
// and nothing changed on air. The recipe now follows the quiz's rule (behaviours/score.ts): Full
// time exists only on a board that draws it, and Clear flash only on one that draws a flash.

const CLASSROOM_SCORE = fileURLToPath(new URL('../docs/tutorials/classroom-package/SVG/score-tracker.svg', import.meta.url));

/** The ⚡ buttons the production page renders for the selected cue, by event id. */
async function actionEvents(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="cue-action-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('cue-action-', '')));
}

test('a tracker without a Full time layer offers no Full time, and one with it does', async ({ page }) => {
  test.slow(); // two imports, two productions

  // The classroom board: two teams, two flashes, no Full time.
  await page.goto('/app');
  await dropSvg(page, CLASSROOM_SCORE);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('score');
  await intoProduction(page, 'Class score', 'Class score night');
  const plain = await actionEvents(page);
  expect(plain).not.toContain('final');
  expect(plain).toEqual(expect.arrayContaining(['score1', 'unscore1', 'score2', 'unscore2', 'clearFlag', 'newGame']));
  await expect(page.getByTestId('cue-actions')).not.toContainText('Full time');

  // The board still runs: a point lands with its flash, and New game zeroes it.
  await page.getByTestId('verb-take').click();
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('cue-action-score1').click();
  await expect(air.locator('[data-noacg-role~="team.flash/1"]')).toHaveClass(/imported-design-on/);
  await page.getByTestId('cue-action-clearFlag').click();
  await expect(air.locator('[data-noacg-role~="team.flash/1"]')).not.toHaveClass(/imported-design-on/);

  // The corpus board draws Full time, so it keeps the button and the press lights the plate.
  await page.goto('/app');
  await dropSvg(page, SCORE_SVG);
  await expect(page.getByTestId('map-svg-score-final').locator('option:checked')).toHaveText('Full time (hidden)');
  await intoProduction(page, 'Four teams', 'Four teams night');
  expect(await actionEvents(page)).toEqual(expect.arrayContaining(['clearFlag', 'final', 'newGame']));
  await page.getByTestId('verb-take').click();
  await page.getByTestId('cue-action-final').click();
  await expect(air.locator('[data-noacg-role~="final"]')).toHaveClass(/imported-design-on/);
});
