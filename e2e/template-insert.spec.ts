// covers: src/blocks/**, src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import { awaitPreviewRebuild } from './_preview';

// "Add template graphic" (Assets panel ✚): insert a catalog graphic INTO the current
// project — namespaced classes, renumbered fields, the donor's :root scoped onto the
// inserted root, its In/Out merged into the host's timeline, its machine dropped — as ONE
// undo step, never replacing the project. blocks/templateInsert.ts is the merge under test.

async function openInsertDialog(page: Page) {
  await page.getByTestId('dock-tab-assets').click();
  await page.getByTestId('assets-insert-template').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeVisible();
}

const state = (page: Page) =>
  page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { getTemplateParts, countLines } = await import('/src/model/structure.ts');
    const t = useTemplateStore.getState().template;
    const data = parseAnimData(t.js);
    return {
      html: t.html,
      css: t.css,
      fields: t.fields.map((f) => ({ field: f.field, title: f.title })),
      steps: data?.steps.map((s) => ({ name: s.name, reveals: s.reveals ?? [], layers: Object.keys(s.layers) })) ?? null,
      spxSteps: t.settings.steps,
      selected: useTemplateStore.getState().selectedPart,
      lines: getTemplateParts(t.html, t.fields)
        .filter((p) => p.kind === 'line')
        .map((p) => ({ selector: p.selector, label: p.label, inserted: p.inserted === true })),
      countLines: countLines(t.html),
    };
  });

test('insert an info card into a lower third — project preserved, everything namespaced, one undo', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const before = await state(page);

  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await awaitPreviewRebuild(page, () => page.getByTestId('insert-tpl-card-card01').click());
  await expect(page.getByTestId('insert-tpl-dialog')).toBeHidden();

  const after = await state(page);
  // The host graphic survives untouched: its root, its fields, its steps.
  expect(after.html).toContain('class="lower-third');
  for (const f of before.fields) {
    expect(after.fields.map((x) => x.field)).toContain(f.field);
  }
  // The inserted graphic arrived namespaced: a data-gfx root, prefix rewritten, fields
  // renumbered after the host's and marked with the variant's name.
  expect(after.selected).toMatch(/^#gfx-/);
  const gfxId = after.selected!.slice(1);
  expect(after.html).toContain(`id="${gfxId}" data-gfx`);
  expect(after.html).toContain('info-card-2');
  const newFields = after.fields.slice(before.fields.length);
  expect(newFields.length).toBeGreaterThan(0);
  expect(newFields[0].field).toBe(`f${before.fields.length}`);
  expect(newFields[0].title).toContain('(');
  // The donor's style contract is SCOPED onto the inserted root, not the document.
  expect(after.css).toContain(`#${gfxId} {`);
  expect((after.css.match(/:root \{/g) ?? []).length).toBe((before.css.match(/:root \{/g) ?? []).length);
  // No second reset block.
  expect((after.css.match(/html,\s*body \{/g) ?? []).length).toBe(1);
  // Its In/Out merged into the host's entrance/exit (placement: from the start).
  expect(after.steps!.length).toBe(before.steps!.length);
  expect(after.steps![0].layers.some((k) => k.includes('info-card-2'))).toBe(true);
  expect(after.steps![after.steps!.length - 1].layers.some((k) => k.includes('info-card-2'))).toBe(true);

  // Both graphics render in the preview.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.lower-third-box')).toHaveCount(1);
  await expect(frame.locator('.info-card-2-box')).toHaveCount(1);

  // The merged document still passes the export gate.
  const validation = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    return validateTemplate(useTemplateStore.getState().template).errors;
  });
  expect(validation).toEqual([]);

  // ONE undo removes the whole insertion.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).html).not.toContain('info-card-2');
  const restored = await state(page);
  expect(restored.fields.length).toBe(before.fields.length);
  expect(restored.css).not.toContain(`#${gfxId}`);
});

test('insert as a NEW NEXT STEP — a named step reveals the graphic, retargetable afterwards', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const before = await state(page);

  await openInsertDialog(page);
  await page.getByTestId('insert-tpl-placement').selectOption('new-step');
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await awaitPreviewRebuild(page, () => page.getByTestId('insert-tpl-card-card01').click());

  const after = await state(page);
  const gfxSel = after.selected!;
  // A new step on the default path, named after the variant, revealing the inserted root.
  expect(after.steps!.length).toBe(before.steps!.length + 1);
  const step = after.steps![after.steps!.length - 2];
  expect(step.reveals).toContain(gfxSel);
  expect(after.spxSteps).toBe('2');

  // Participation stays a live choice: the inserted graphic is a normal part, so the
  // canvas chip can send it back to "appears with ▶ Play".
  const appears = page.getByTestId('canvas-appears');
  await expect(appears).toBeVisible();
  await expect(appears).toHaveValue('0');
  await appears.selectOption('-1');
  await expect
    .poll(async () => (await state(page)).steps!.every((s) => !s.reveals.includes(gfxSel)))
    .toBe(true);
});

test('a STEPPED donor keeps its middle steps — the run joins the host path after the placement', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const before = await state(page);
  expect(before.steps!.length).toBe(2); // Enter + Out — the host has no presses of its own

  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await page.getByTestId('insert-tpl-steps').selectOption('stepped');
  await awaitPreviewRebuild(page, () => page.getByTestId('insert-tpl-card-card01').click());

  const after = await state(page);
  // The card's own line-by-line reveal survived as REAL steps of this project's path —
  // contiguous, right after the entrance the graphic arrived with.
  expect(after.steps!.length).toBe(before.steps!.length + 2);
  const middles = after.steps!.slice(1, -1);
  expect(middles.map((s) => s.name)).toEqual(['Hairline Card 2', 'Hairline Card 3']);
  // Each step still reveals the donor's line, through the SAME renumbering the fields got.
  const newFields = after.fields.slice(before.fields.length).map((f) => f.field);
  expect(middles[0].reveals).toEqual([`#${newFields[1]}`]);
  expect(middles[1].reveals).toEqual([`#${newFields[2]}`]);
  // The SPX Continue contract follows the path it actually has.
  expect(after.spxSteps).toBe('3');

  // Those steps are the timeline's, like any other: the presses exist on the strip.
  await expect(page.getByTestId('timeline-v2').getByText('Hairline Card 2')).toBeVisible();

  // And behaviorally, on air: the guest's last line is parked out of its mask until its own
  // press arrives — the merged data drives the host's runtime exactly like a native step.
  const lastLine = page.frameLocator('iframe.preview-frame').locator(`#${newFields[2]}`);
  const slid = () =>
    lastLine.evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return m.m42 > el.getBoundingClientRect().height / 2;
    });
  await expect.poll(slid).toBe(true);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.waitForTimeout(1100);
  await expect.poll(slid).toBe(true);
  await page.getByRole('button', { name: '» Next' }).click(); // press 1: the guest's line 1
  await page.getByRole('button', { name: '» Next' }).click(); // press 2: this line
  await expect.poll(slid).toBe(false);

  const validation = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    return validateTemplate(useTemplateStore.getState().template).errors;
  });
  expect(validation).toEqual([]);

  // Still ONE undo step, steps and all.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).steps!.length).toBe(before.steps!.length);
});

test('an inserted graphic\'s own text lines are selectable parts, without inflating the host design', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const before = await state(page);

  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await awaitPreviewRebuild(page, () => page.getByTestId('insert-tpl-card-card01').click());

  const after = await state(page);
  // The guest's masked lines joined the registry — named by their (marked) field titles,
  // and flagged as the guest's.
  const guests = after.lines.filter((l) => l.inserted);
  expect(guests.length).toBeGreaterThan(0);
  expect(guests[0].label).toContain('(Hairline Card)');
  expect(after.lines.filter((l) => !l.inserted).map((l) => l.selector)).toEqual(
    before.lines.map((l) => l.selector),
  );
  // …but "how many lines does THIS design have" is unchanged: a guest is not the host's shape.
  expect(after.countLines).toBe(before.countLines);

  // Every consumer of the registry sees them: a timeline row whose label is a selection
  // handle, naming the guest's field exactly as the canvas chip would.
  const guestSel = guests[0].selector;
  const row = page.locator(`.tlv2-labels .timeline-label[data-part="${guestSel}"]`);
  await expect(row).toContainText('(Hairline Card)');
  await row.click();
  await expect.poll(async () => (await state(page)).selected).toBe(guestSel);
});

test('after an insertion the Data panel still adds a REAL line to the HOST design', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await awaitPreviewRebuild(page, () => page.getByTestId('insert-tpl-card-card01').click());
  const after = await state(page);

  // The guest's lines carry their own prefix; the add belongs to the host, and must not
  // silently fall back to the definition-only path (a field no element answers).
  await page.getByTestId('dock-tab-data').click();
  await page.getByPlaceholder(/Label the operator sees/).fill('Sponsor');
  await awaitPreviewRebuild(page, () => page.getByRole('button', { name: '+ Add' }).click());
  const added = await state(page);
  const newField = added.fields[added.fields.length - 1].field;
  expect(added.html).toMatch(new RegExp(`<span id="${newField}" class="lower-third-[a-z]+">Sponsor</span>`));
  expect(added.countLines).toBe(after.countLines + 1);
  await expect(page.frameLocator('iframe.preview-frame').locator(`#${newField}`)).toHaveText('Sponsor');
});

test('the canvas context menu opens the same insert flow', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const canvas = page.getByTestId('canvas-layer');
  await canvas.click({ button: 'right', position: { x: 200, y: 120 } });
  const menu = page.getByTestId('canvas-context-menu');
  await expect(menu).toBeVisible();
  await page.getByTestId('canvas-ctx-insert-template').click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeVisible();
  // Insert from here works end to end.
  await awaitPreviewRebuild(page, () => page.getByTestId('insert-tpl-card-lt02').click());
  await expect.poll(async () => (await state(page)).selected).toMatch(/^#gfx-/);
  // A plain left click closes an open menu without picking anything.
  await canvas.click({ button: 'right', position: { x: 200, y: 120 } });
  await expect(page.getByTestId('canvas-context-menu')).toBeVisible();
  await canvas.click({ position: { x: 400, y: 300 } });
  await expect(page.getByTestId('canvas-context-menu')).toBeHidden();
});

test('templates that need their own runtime are greyed with the reason, not hidden', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Tickers' }).click();
  const card = page.getByTestId('insert-tpl-card-tk01');
  await expect(card).toHaveClass(/blocked/);
  await card.click({ force: true });
  await expect(page.getByTestId('insert-tpl-error')).toContainText(/runtime|measured/);
  // The project was NOT touched.
  const st = await state(page);
  expect(st.html).not.toContain('ticker');
});
