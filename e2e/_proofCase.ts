import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// THE PROOF CASE'S PRODUCTION, installed from the pack two agents authored for it
// (`e2e/fixtures/agent-made/README.md`): the vote-show votes board and totals board, a cue
// each, ready to operate. Two specs drive it now — the in-app combined controls and the hosted
// page's resolution — so the import lives here rather than in whichever one wrote it first.
//
// It is a PACK rather than a seeded record on purpose: what these cases claim is that a
// production somebody actually built operates, and a show record written by a test proves nothing
// about the one the import flow produces.

const PROOF_PACK = readFileSync(
  fileURLToPath(new URL('./fixtures/agent-made/vote-show.noacgpack.json', import.meta.url)),
  'utf8',
);

/** The two pool graphics the pack installs, by the name every wire key uses. */
export const PROOF_VOTES = 'Votes board';
export const PROOF_TOTALS = 'Totals board';

/** Install the proof-case pack and land on its production page. */
export async function importProofCase(page: Page): Promise<void> {
  await page.goto('/app#/home/productions');
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible();
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'vote-show.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(PROOF_PACK),
  });
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);
}
