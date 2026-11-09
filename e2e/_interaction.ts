import { expect, type Locator, type Page } from '@playwright/test';

// THE INTERACTION TAB's question list and its folded "More ways in", the way an operator reaches
// them (docs/work-specs/interaction/spec.md, "Screens"). Shared by the journeys that put a question
// live: the audience walk, chat intake, an imported vote board and the configured live walk.

/** A question's row in the list, by its exact text. */
export function questionRow(ws: Page, text: string): Locator {
  return ws.locator('.pd-aud-q').filter({ has: ws.getByTestId('question-row-text').getByText(text, { exact: true }) });
}

/** Write a question through "+ Question": the type first, then the words. */
export async function addQuestion(ws: Page, type: 'open' | 'choice', text: string, options: string[] = []): Promise<Locator> {
  await ws.getByTestId('question-add').click();
  await ws.getByTestId(type === 'open' ? 'question-type-open' : 'question-type-choice').click();
  await ws.getByTestId('question-text').fill(text);
  if (type === 'choice') await ws.getByTestId('question-options').fill(options.join('\n'));
  await ws.getByTestId('question-save').click();
  const row = questionRow(ws, text);
  await expect(row).toHaveCount(1);
  return row;
}

/** Put a question live on phones and wait for the mark. */
export async function goLive(ws: Page, text: string): Promise<void> {
  const row = questionRow(ws, text);
  await row.getByTestId('question-go-live').click();
  await expect(row.getByTestId('question-live')).toBeVisible();
}

/** Stop the live question. */
export async function stopLive(ws: Page, text: string): Promise<void> {
  const row = questionRow(ws, text);
  await row.getByTestId('question-stop').click();
  await expect(row.getByTestId('question-live')).toHaveCount(0);
}

/** Open the folded "More ways in": the chat sources, the message Sheet and Simulate. */
export async function moreWaysIn(ws: Page): Promise<void> {
  const more = ws.getByTestId('interaction-more');
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click();
}

/** Rehearsal arrivals, as the local provider simulates them. */
export async function simulateArrivals(ws: Page): Promise<void> {
  await moreWaysIn(ws);
  await ws.getByTestId('audience-simulate').click();
}
