import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { expectMachineState } from './_stage';
import { openWorkspace } from './_workspace';
import { settleDurableWrites } from './_durable';

// THE QUIZ PILOT (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 3): the controlled sequence a student
// production runs — question on air, a HIDDEN contestant pick locked without showing, the
// choice revealed as its own beat, the verdict, the audience percentages, and the next
// question loaded from the production's own bank. All from the production dashboard, all
// deliberate; data never airs itself.

async function productionFor(page: Page, name: string): Promise<void> {
  await openProductionWithCurrent(page, name);
}

test('the hidden-pick quiz sequence: seal, reveal choice, verdict, audience result — then the next question from the bank', async ({ page }) => {
  test.setTimeout(120_000);
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  // ── The question bank, authored on the Data tab - which opens in its OWN browser tab now,
  //    so Playout stays up on `page` while the bank is typed on `data`. ──
  const data = await openWorkspace(page, 'data');
  await data.getByTestId('add-dataset').click();
  const dataset = data.locator('.pd-dataset');
  const fill = async (rowIndex: number, cells: string[]) => {
    const row = dataset.locator('tbody tr').nth(rowIndex);
    for (let i = 0; i < cells.length; i++) await row.locator('td input').nth(i).fill(cells[i]);
  };
  await fill(0, ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Pluto', 'Titan', 'B']);
  await data.getByTestId('add-row').click();
  await fill(1, ['Which ocean is the largest?', 'Atlantic', 'Indian', 'Pacific', 'Arctic', 'C']);
  // The bank has to be DURABLE before the Playout tab reads it: the workspace tab writes, the
  // durable store announces, and only then does this tab's mirror hold the rows.
  await settleDurableWrites(data);
  await data.close();
  await expect(page.getByTestId('production-verbs')).toBeVisible();

  const chip = page.getByTestId('machine-state-chip');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');

  // ↷ Next with nothing loaded yet = the bank's FIRST question, into the draft.
  await page.getByTestId('cue-load-next').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which planet is known as the Red Planet?');

  // ── On air. ──
  await page.getByTestId('verb-take').click();
  await expectMachineState(page, 'Question');

  // The contestant says "B". The operator records it as DATA — the segmented row, then a
  // live ✎ Update — and NOTHING paints: the pick is in the graphic, invisible.
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f6')).toHaveText('B');
  await expect(program.locator('.quiz-option.quiz-sel')).toHaveCount(0);

  // Lock it — straight from the question. The board shows LOCKED, still not which answer.
  await page.getByTestId('cue-action-lock').click();
  await expect(chip).toHaveText('Locked, choice hidden');
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);
  await expect(program.locator('.quiz-option.quiz-sel')).toHaveCount(0);
  // A late change is structurally impossible: select's arrows leave question/selected only.
  await expect(page.getByTestId('cue-action-select')).toBeDisabled();

  // Reveal the choice — its own deliberate beat. NOW the pick shows, still locked.
  await page.getByTestId('cue-action-revealChoice').click();
  await expect(chip).toHaveText('Locked in');
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);

  // The verdict. B is correct — the picked row lights as the winner.
  await page.getByTestId('cue-action-judge').click();
  await expect(chip).toHaveText('Reveal');
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-correct/);

  // Audience result: type the percentages, fire the beat — the chips appear on the rows.
  // The numbers were DATA the whole time; the state is what shows them.
  await page.getByTestId('cue-field-f7').fill('12 | 61 | 18 | 9');
  await page.getByTestId('cue-action-audience').click();
  await expect(chip).toHaveText('Audience result');
  await expect(program.locator('.quiz-aud')).toHaveCount(4);
  await expect(program.locator('.quiz-aud').nth(1)).toHaveText('61%');

  // THE ANSWER KEY IS CORRECTABLE ON AIR, in this state too (acceptance pass, 2026-08-06:
  // "it shows the wrong correct answer"). The audience state repainted its verdict only when
  // one was MISSING, so a corrected letter left the mark on the old row while the field said
  // otherwise. A percentage edit must still leave the verdict alone — that is why the guard
  // exists — so both halves are pinned here.
  await page.getByTestId('cue-field-f5-opt-D').click();
  await page.getByTestId('verb-update').click();
  await expect(program.locator('.quiz-option').nth(3)).toHaveClass(/quiz-correct/);
  await expect(program.locator('.quiz-option.quiz-correct')).toHaveCount(1);
  await expect(program.locator('.quiz-aud').nth(1)).toHaveText('61%');
  await page.getByTestId('cue-field-f7').fill('12 | 55 | 18 | 15');
  await page.getByTestId('verb-update').click();
  await expect(program.locator('.quiz-aud').nth(1)).toHaveText('55%');
  await expect(program.locator('.quiz-option').nth(3)).toHaveClass(/quiz-correct/);
  // Put the key back so the bank walk below starts from the authored answer.
  await page.getByTestId('cue-field-f5-opt-B').click();
  await page.getByTestId('verb-update').click();

  // ── The NEXT question: ↷ Next loads row 2 into the DRAFT (air untouched), Take airs it
  // clean — a fresh entrance is the reset, both halves at once. ──
  await page.getByTestId('cue-load-next').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which ocean is the largest?');
  await expect(program.locator('#f0')).not.toHaveText('Which ocean is the largest?');
  // RE-TAKE, not TAKE: the primary control is a toggle, so on a layer that is already live it
  // means "take it off" (and says so). Airing the next question over a live one is a re-take —
  // it sends the loaded values and replays the entrance, which is the reset both halves need.
  await page.getByTestId('verb-retake').click();
  await expect(program.locator('#f0')).toHaveText('Which ocean is the largest?');
  await expectMachineState(page, 'Question');
  await expect(program.locator('.quiz-option.quiz-correct')).toHaveCount(0);
  await expect(program.locator('.quiz-aud')).toHaveCount(0);
  // The bank is exhausted — ↷ Next says so instead of wrapping silently.
  await expect(page.getByTestId('cue-load-next')).toBeDisabled();
});

test('the TV-style flow still stands: select paints immediately, lock follows, verdict tells the wrong pick apart', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'House Quiz' });
  await productionFor(page, 'Studio Quiz');

  const chip = page.getByTestId('machine-state-chip');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expectMachineState(page, 'Question');

  // Select C on air (the millionaire drama: the pick shows the moment it is made)…
  await page.getByTestId('cue-field-f6-opt-C').click();
  await page.getByTestId('cue-action-select').click();
  await expect(chip).toHaveText('Answer selected');
  await expect(program.locator('.quiz-option').nth(2)).toHaveClass(/quiz-sel/);

  // …lock, judge: C was wrong (B is correct) — the two rows wear different treatments.
  await page.getByTestId('cue-action-lock').click();
  await expect(chip).toHaveText('Locked in');
  await page.getByTestId('cue-action-judge').click();
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-correct/);
  await expect(program.locator('.quiz-option').nth(2)).toHaveClass(/quiz-wrong/);
});
