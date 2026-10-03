// covers: src/components/home/{ProductionPage,ActionArranger}.tsx, src/components/HostedControlPage.tsx
// covers: src/styles/playout-dashboard.css
// focus

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { settleDurableWrites } from './_durable';

// LIVE ACTIONS FIRST (docs/research/control-surfaces-review-2026-10-02 slice 4; the AC of the
// backlog item it closed, "the Playout page buries live actions"). A graphic that declares
// ⚡ actions is operated through them, so on the Playout page they sit straight under the monitors
// and the setup fields come after them, foldable. Measured at the laptop size the backlog item
// was filed at, 1600x900, where the hockey scorebug's clock and goal buttons used to sit below
// twelve inputs and the answer board's Reveal row was cut by the fold under eight.
//
// COMPACT (owner, 2026-10-03: "use the space efficiently, so we don't get long vertical pages ...
// the button texts should be short and to the point"). The block has no sentence under its head and
// one on-air status, and its sections sit side by side, so its HEIGHT is pinned here: the duel
// score and the quiz in one row of buttons, the twelve-action hockey scorebug in two.

test.use({ viewport: { width: 1600, height: 900 } });

/** A production holding one catalog graphic, opened on its Playout page. */
async function catalogProduction(page: Page, variant: string, name: string): Promise<void> {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const id = await page.evaluate(
    async ({ variant, name }) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { createGraphic } = await import('/src/model/library.ts');
      const shows = await import('/src/model/shows.ts');
      const tpl = variantById(variant)!.create({});
      const { doc, error } = createGraphic(tpl, { name });
      if (error) throw new Error(error);
      const show = shows.createShowNamed(`${name} show`);
      shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
      return show.id;
    },
    { variant, name },
  );
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
}

/** How many rows the block's buttons sit in, and how tall the block is. */
async function blockRows(page: Page): Promise<{ rows: number; height: number }> {
  return page.getByTestId('cue-actions').evaluate((el) => {
    const tops = new Set([...el.querySelectorAll('.pd-actions-groups button')].map((b) => Math.round(b.getBoundingClientRect().top)));
    return { rows: tops.size, height: el.getBoundingClientRect().height };
  });
}

/** Where each action button sits, by event. */
async function slots(page: Page): Promise<Record<string, { x: number; y: number; width: number }>> {
  return page.getByTestId('cue-actions').evaluate((el) =>
    Object.fromEntries(
      [...el.querySelectorAll<HTMLElement>('button[data-testid^="cue-action-"]')].map((b) => {
        const r = b.getBoundingClientRect();
        return [b.dataset.testid!, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width) }];
      }),
    ),
  );
}

/** Whether the element is wholly on screen, inside the control area's scroller too. */
async function onScreen(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeInViewport({ ratio: 1 });
}

test('the hockey scorebug: its clock and goal buttons show without scrolling, above the setup fields', async ({ page }) => {
  test.setTimeout(90_000);
  // The benchmark's agent-made package (cj-bench 2026-10-02, b2-hockey), imported the way a user
  // brings an agent's zip in: Import graphics, then straight into a new production.
  await page.goto('/app#/new');
  await page.getByText('Import graphics', { exact: true }).first().click();
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'hockey-scorebug.zip',
    mimeType: 'application/zip',
    buffer: readFileSync('e2e/fixtures/agent-made/hockey-scorebug.zip'),
  });
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByPlaceholder('Untitled production').fill('Hockey night');
  await page.getByText('Add to the production and go live').click();
  await page.getByRole('button', { name: 'Add it and go there' }).click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 15_000 });

  // THE ORDER: the ⚡ block before the editor, in the one scroller, with nothing scrolled.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toBeVisible();
  const area = page.getByTestId('control-area');
  expect(await area.evaluate((el) => el.scrollTop)).toBe(0);
  const actionsTop = (await actions.boundingBox())!.y;
  const editorTop = (await page.getByTestId('cue-editor').boundingBox())!.y;
  expect(actionsTop, 'the live actions come before the setup fields').toBeLessThan(editorTop);

  // THE AC: the buttons pressed all game, wholly on screen at 1600x900.
  for (const id of ['clockStart', 'clockStop', 'goalA', 'goalB']) await onScreen(page, `cue-action-${id}`);
  // COMPACT: four sections side by side, twelve buttons in two rows, and no sentence in the block.
  const hockey = await blockRows(page);
  expect(hockey.rows, 'the twelve hockey actions sit in two rows').toBe(2);
  expect(hockey.height).toBeLessThan(140);
  await expect(actions.locator('p')).toHaveCount(0);

  // Take it, start the clock, score: the presses work from where they now sit.
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('cue-action-clockStart')).toBeEnabled();
  await page.getByTestId('cue-action-clockStart').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText(/running/i);

  // THE SETUP FOLD: folded, the fields are gone from the column and the bar reads back what is
  // set; unfolded, they are back with their values.
  const fold = page.getByTestId('cue-fields-fold');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('cue-field-f0')).toBeVisible();
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('cue-field-f0')).toHaveCount(0);
  await expect(page.getByTestId('cue-fields-summary')).toContainText('HOME');
  await fold.click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('HOME');
});

test('the answer board quiz: every answer action shows without scrolling', async ({ page }) => {
  // qz02, the "Pick, then lock" answer board: the review's shot of it at 1600x900 had its Reveal
  // row cut by the fold under eight setup fields.
  await catalogProduction(page, 'qz02', 'House Quiz');
  for (const id of ['cue-action-select', 'cue-action-lock', 'cue-action-judge']) await onScreen(page, id);
  const quiz = await blockRows(page);
  expect(quiz.rows, 'the five quiz actions sit in one row').toBe(1);
  expect(quiz.height).toBeLessThan(100);
  const actionsTop = (await page.getByTestId('cue-actions').boundingBox())!.y;
  const editorTop = (await page.getByTestId('cue-editor').boundingBox())!.y;
  expect(actionsTop).toBeLessThan(editorTop);
  // Snap is recovery, folded closed at the foot of the block rather than beside its title.
  await expect(page.getByTestId('machine-snap')).toBeHidden();
  await page.getByTestId('cue-actions-recovery').locator('summary').click();
  await expect(page.getByTestId('machine-snap')).toBeVisible();
});

test('a graphic with no actions keeps today\'s panel: the editor first, no fold, no actions block', async ({ page }) => {
  await catalogProduction(page, 'lt01', 'Hairline');
  await expect(page.getByTestId('cue-editor')).toBeVisible();
  await expect(page.getByTestId('cue-actions')).toHaveCount(0);
  await expect(page.getByTestId('cue-fields-fold')).toHaveCount(0);
  // The editor is the first block of the control area, right under the monitors.
  const first = await page.getByTestId('control-area').evaluate((el) => (el.firstElementChild as HTMLElement | null)?.dataset.testid);
  expect(first).toBe('cue-editor');
});

test('» Next names its target: the answer board at Question reads Reveal correct, and last step once revealed', async ({ page }) => {
  // The 2026-09-30 finding that Next on a quiz "jumps to the last step", explained rather than
  // changed: the answer board's default path goes Question, then Reveal, by declaration (slice 2
  // of the control-surfaces review). The button now says so before it is pressed.
  await catalogProduction(page, 'qz02', 'House Quiz');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  await expect(page.getByTestId('verb-next-target')).toHaveText('Reveal correct');
  await expect(page.getByTestId('verb-next')).toHaveAttribute('title', /next step: Reveal correct/);
  await page.getByTestId('cue-action-judge').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Reveal');
  await expect(page.getByTestId('verb-next-target')).toHaveText('last step');
  await expect(page.getByTestId('verb-next')).toBeDisabled();
});

test('the duel score: one compact row, and its point buttons name the players ON AIR', async ({ page }) => {
  test.setTimeout(60_000);
  // sb26, the two-player score whose long labels ("Take one back from player 1") the owner looked
  // at on 2026-10-03.
  await catalogProduction(page, 'sb26', 'Duel');
  const actions = page.getByTestId('cue-actions');
  const chip = page.getByTestId('machine-state-chip');
  const pointA = page.getByTestId('cue-action-pointA');
  const pointB = page.getByTestId('cue-action-pointB');

  // ONE status, the chip: no "act on air" beside it and no sentence under the head.
  await expect(chip).toHaveText('not on air');
  await expect(actions).not.toContainText('act on air');
  await expect(actions.locator('p')).toHaveCount(0);
  // Nothing on air yet: the buttons read the fallbacks, never the editor's names.
  await expect(pointA).toHaveText('⚡ +1 P1');
  await expect(pointB).toHaveText('⚡ +1 P2');

  await page.getByTestId('verb-take').click();
  await expect(chip).toContainText('Live');
  // Short, P1 then P2 left to right, every section in one row of the 1600-wide page.
  await expect(actions.locator('.pd-actions-groups button')).toHaveText(['⚡ +1 ALEX', '⚡ +1 SAM', '⚡ −1 ALEX', '⚡ −1 SAM', '⚡ Final', '⚡ Reset 0-0']);
  const duel = await blockRows(page);
  expect(duel.rows).toBe(1);
  expect(duel.height).toBeLessThan(100);
  const before = await slots(page);
  expect(before['cue-action-pointA'].x).toBeLessThan(before['cue-action-pointB'].x);
  // The hover still says what the press does, with the name whole.
  await expect(pointA).toHaveAttribute('title', /\+1 ALEX on the live graphic and moves Score 1 with it/);

  // AN UNSENT EDIT IS NEVER READ: the audience still sees ALEX, so the button still says ALEX.
  const name1 = page.getByTestId('cue-field-f0');
  await name1.fill('ALEXANDRA THE GREAT');
  await expect(page.getByTestId('cue-unsent')).toBeVisible();
  await expect(pointA).toHaveText('⚡ +1 ALEX');
  // Sent, it reads the new name at once, and NOTHING MOVES: the slot is fixed, the long name
  // truncates on one line and the hover carries it whole.
  await page.getByTestId('verb-update').click();
  await expect(pointA).toHaveText('⚡ +1 ALEXANDRA THE GREAT');
  await expect(pointA).toHaveAttribute('title', /ALEXANDRA THE GREAT/);
  expect(await slots(page)).toEqual(before);
  expect(await pointA.evaluate((b) => b.scrollWidth > b.clientWidth), 'the long name truncates in its slot').toBe(true);

  // Two players with one name stay apart: P1 SAM and P2 SAM.
  await name1.fill('SAM');
  await page.getByTestId('verb-update').click();
  await expect(pointA).toHaveText('⚡ +1 P1 SAM');
  await expect(pointB).toHaveText('⚡ +1 P2 SAM');
  await expect(page.getByTestId('cue-action-undoB')).toHaveText('⚡ −1 P2 SAM');
  // An empty name on air reads its fallback.
  await name1.fill('');
  await page.getByTestId('verb-update').click();
  await expect(pointA).toHaveText('⚡ +1 P1');
  await expect(pointB).toHaveText('⚡ +1 SAM');
  expect(await slots(page)).toEqual(before);

  // The press still scores the player it names.
  await pointB.click();
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('1');

  // A RENAME IN ARRANGE WINS: the operator's word stays when the name on air changes.
  await page.getByTestId('cue-actions-arrange').click();
  await page.getByTestId('arrange-name-pointB').fill('Goal right');
  await page.getByTestId('arrange-name-pointB').press('Enter');
  await page.getByTestId('cue-actions-arrange').click();
  await expect(pointB).toHaveText('⚡ Goal right');
  await page.getByTestId('cue-field-f2').fill('BEA');
  await page.getByTestId('verb-update').click();
  await expect(page.getByTestId('cue-action-undoB')).toHaveText('⚡ −1 BEA');
  await expect(pointB).toHaveText('⚡ Goal right');
});
