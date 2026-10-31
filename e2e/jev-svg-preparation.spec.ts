// covers: src/components/wizard/import/{MapSvgFieldsStep.tsx,draft.ts}
//
// PREPARED FIELDS ARE INSPECTABLE AND A CORRECTION STAYS (docs/work-specs/jev-svg-import/spec.md,
// row 6, AC-20). The mapping step is the existing surface: a row shows the field's editable
// label, its type and its sample, and selecting it lights the exact layer it binds on the
// preview. The artwork here has two plates drawn alike, so a correction that slid to the twin
// layer would read as kept. A later analysis reaches the draft only through the proposal door
// (`svgDraftWithProposal`), dropping the same artwork again keeps the draft, and the walk is then
// saved into a production and reopened.

import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropSvg, intoProduction } from './_svg-import';
import { awaitDurableReady } from './_durable';
import { addToProductionFromFinish } from './_create';

/** Two guests, two plates, the same words in the same places: only the position tells them apart. */
const TWO_GUESTS = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="240" viewBox="0 0 1280 240" font-family="sans-serif" fill="#fff">
  <rect x="0" y="0" width="1280" height="240" fill="#122036"/>
  <rect x="40" y="60" width="560" height="140" fill="#243b5a" rx="12"/>
  <rect x="680" y="60" width="560" height="140" fill="#243b5a" rx="12"/>
  <text x="70" y="118" font-size="36" id="name">Guest name</text>
  <text x="70" y="166" font-size="22" id="role">Guest role</text>
  <text x="710" y="118" font-size="36" id="name-2">Guest name</text>
  <text x="710" y="166" font-size="22" id="role-2">Guest role</text>
  <text x="1200" y="40" font-size="20" id="count">12</text>
</svg>`;

/** A routine lower third from the development corpus, named the way an ordinary export is. */
const LOWER_THIRD = fileURLToPath(new URL('./fixtures/jev-svg/dev/lower-third-1.svg', import.meta.url));

/** Where the preview's highlight sits: the centre of its box, in page pixels. */
async function highlightAt(page: Page): Promise<number> {
  const highlight = page.getByTestId('wz-preview-highlight');
  await expect(highlight).toHaveCount(1);
  const box = await highlight.boundingBox();
  if (!box) throw new Error('the highlight has no box');
  return Math.round(box.x + box.width / 2);
}

test('a prepared field is selected, corrected, reanalysed and reopened on the layer it names', async ({ page }, info) => {
  const file = info.outputPath('two-guests.svg');
  writeFileSync(file, TWO_GUESTS);
  await page.goto('/app');
  await dropSvg(page, file);

  // THE EXISTING SURFACE SAYS WHAT EACH FIELD IS: its editable label and sample, one row per
  // layer with both twins offered, and its type, which a number layer states on its own row.
  for (const id of ['t0', 't2']) {
    await expect(page.getByTestId(`map-svg-title-${id}`)).toBeEditable();
    await expect(page.getByTestId(`map-svg-sample-${id}`)).toHaveValue('Guest name');
    await expect(page.getByTestId(`map-svg-row-${id}`)).not.toContainText('(number)');
  }
  await expect(page.getByTestId('map-svg-row-t4')).toContainText('Text (number)');

  // Where each twin's name layer is, measured by hovering it.
  await page.getByTestId('map-svg-row-t0').hover();
  const first = await highlightAt(page);
  await page.getByTestId('map-svg-row-t2').hover();
  const second = await highlightAt(page);
  expect(second - first, 'the two name layers are a plate apart').toBeGreaterThan(100);

  // SELECTING THE SECOND TWIN LIGHTS ITS OWN LAYER, and keeps it lit once the pointer leaves for
  // the preview: the selection is focus in the row, not the hover.
  await page.getByTestId('map-svg-title-t2').click();
  await page.mouse.move(5, 5);
  await expect.poll(() => highlightAt(page)).toBe(second);
  // A hover elsewhere answers while it lasts, then hands back to the selection.
  await page.getByTestId('map-svg-row-t0').hover();
  await expect.poll(() => highlightAt(page)).toBe(first);
  await page.mouse.move(5, 5);
  await expect.poll(() => highlightAt(page)).toBe(second);
  // Moving through the row by keyboard keeps it selected: Shift+Tab lands on its own tick box.
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('map-svg-row-t2').locator('input[type="checkbox"]')).toBeFocused();
  await expect.poll(() => highlightAt(page)).toBe(second);

  // THE DELIBERATE CORRECTION, on the second twin only: its label and its sample.
  await page.getByTestId('map-svg-title-t2').fill('Second guest');
  await page.getByTestId('map-svg-sample-t2').fill('Bo Lind');
  // Leaving the row ends the selection.
  await page.getByTestId('map-svg-fields').locator('h3').first().click();
  await expect(page.getByTestId('wz-preview-highlight')).toHaveCount(0);

  // THE SAME ARTWORK DROPPED AGAIN on the Design step keeps the draft: every answer stays on the
  // layer it was given to, and the twin is untouched.
  await page.locator('.wz-modal').getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await expect(page.getByTestId('map-svg-title-t2')).toHaveValue('Second guest');
  await expect(page.getByTestId('map-svg-sample-t2')).toHaveValue('Bo Lind');
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('name');
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('Guest name');

  // SAVE AND REOPEN: into a production, then a cold reload of that page.
  await intoProduction(page, 'Two guests', 'Guest night');
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await awaitDurableReady(page);
  const saved = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const g = loadGraphics().find((d) => d.name === 'Two guests');
    if (!g) return null;
    const doc = new DOMParser().parseFromString(g.template.html, 'text/html');
    return {
      fields: g.template.fields.map((f) => `${f.field} ${f.title} ${f.value ?? ''}`),
      // Where each field's text sits on the artwork: the first plate starts at 70, the second at 710.
      x: Object.fromEntries(['f0', 'f2'].map((id) => [id, doc.getElementById(id)?.getAttribute('x') ?? null])),
    };
  });
  expect(saved?.fields).toEqual(['f0 name Guest name', 'f1 role Guest role', 'f2 Second guest Bo Lind', 'f3 role-2 Guest role', 'f4 count 12']);
  expect(saved?.x).toEqual({ f0: '70', f2: '710' });
});

test('a reanalysis through the proposal door keeps a correction on the twin it was made on', async ({ page }) => {
  // The pure half of the walk above, on the draft functions the step uses: no UI asks for a new
  // analysis yet (rows 35 and 36 add the proposer), and this is the door every one goes through.
  await page.goto('/app');
  const result = await page.evaluate(async (markup) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const D = await import('/src/components/wizard/import/draft.ts');
    const drop = {
      ...D.svgDraftFromImport(importSvgMarkup(markup), { resolution: { width: 1920, height: 1080 }, previous: { name: '', designSvg: null } }),
      designKeepBakedText: false,
    };
    const titles = (d: typeof drop) => d.svgFields.map((f) => `${f.candidateId} ${f.title}`);
    // The author renames the second twin; the first keeps the reader's name.
    const corrected = { ...drop, svgFields: drop.svgFields.map((f) => (f.candidateId === 't2' ? { ...f, title: 'Second guest' } : f)) };
    // An analysis that names both look-alike layers the same.
    const base = D.svgProposalOfDraft(drop)!.proposal;
    const proposal = { ...base, fields: base.fields.map((f) => (f.layer === 't0' || f.layer === 't2' ? { ...f, title: 'Guest' } : f)) };
    const once = D.svgDraftWithProposal(corrected, proposal);
    if (!once.ok) return { errors: once.errors };
    const next = { ...corrected, ...once.patch };
    const twice = D.svgDraftWithProposal(next, proposal);
    return {
      titles: titles(next),
      kept: once.kept,
      again: twice.ok ? titles({ ...next, ...twice.patch }) : null,
    };
  }, TWO_GUESTS);
  expect(result.titles).toEqual(['t0 Guest', 't1 role', 't2 Second guest', 't3 role-2', 't4 count']);
  expect(result.kept?.some((k: string) => k.includes('t2'))).toBe(true);
  expect(result.again).toEqual(result.titles);
});

test('a routine lower third reaches a working graphic with no mapping stop', async ({ page }) => {
  await page.goto('/app');
  await dropSvg(page, LOWER_THIRD);
  // From the mapping step straight to Finish: nothing on the checklist has to be answered.
  await page.getByTestId('wz-skip-to-finish').click();
  await expect(page.getByTestId('wz-stepcount')).toContainText('5');
  await page.getByTestId('wz-finish-name').fill('Routine strap');
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Routine show');
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await awaitDurableReady(page);
  const fields = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().find((d) => d.name === 'Routine strap')?.template.fields.map((f) => f.title) ?? null;
  });
  expect(fields).toEqual(['presenter', 'role', 'score']);
});
