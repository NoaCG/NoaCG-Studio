// covers: src/blocks/**, src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}
// covers: src/components/editorFoundation/{EditorFoundation.tsx,operations.ts,session.ts,Inspector.tsx}

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openWorkingGraphicInEditor } from './_create';
import { editorPreview, mountWorkingDocument } from './_frame';

// "Add template graphic" (Assets panel ✚): insert a catalog graphic INTO the current
// project — namespaced classes, renumbered fields, the donor's :root scoped onto the
// inserted root, its In/Out merged into the host's timeline, its machine dropped — as ONE
// undo step, never replacing the project. blocks/templateInsert.ts is the merge under test.

async function openInsertDialog(page: Page) {
  await page.getByRole('button', { name: /^Project [▾▸]$/ }).click();
  await page.getByTestId('assets-insert-template').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeVisible();
  await expect(page.getByTestId('insert-tpl-close')).toBeFocused();
}

const state = (page: Page) =>
  page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { getTemplateParts, countLines } = await import('/src/model/structure.ts');
    const t = useTemplateStore.getState().template;
    const data = parseAnimData(t.js);
    return {
      template: t,
      anim: data,
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootstrapGraphic(page, 'Hairline');
  await openWorkingGraphicInEditor(page);
  const before = await state(page);

  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await expect(page.getByTestId('insert-tpl-card-card01')).toBeVisible();
  for (const card of (await page.locator('.insert-tpl-card').all()).slice(0, 6)) await expect(card.locator('iframe').contentFrame().locator('.info-card')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/lean-insert-picker.png' });
  await page.getByTestId('insert-tpl-card-card01').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeHidden();
  await expect(editorPreview(page).locator('.info-card-2-box')).toHaveCount(1);
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
  const frame = editorPreview(page);
  await expect(frame.locator('.lower-third-box')).toHaveCount(1);
  await expect(frame.locator('.info-card-2-box')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/lean-insert-editor.png' });

  // The merged document still passes the export gate.
  const validation = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    return validateTemplate(useTemplateStore.getState().template).errors;
  });
  expect(validation).toEqual([]);

  // ONE undo removes the whole insertion.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await state(page)).html).not.toContain('info-card-2');
  const restored = await state(page);
  expect(restored.fields.length).toBe(before.fields.length);
  expect(restored.css).not.toContain(`#${gfxId}`);
  expect(restored.template).toEqual(before.template);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await state(page)).template).toEqual(after.template);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await state(page)).template).toEqual(before.template);
});

test('insert as a NEW NEXT STEP — a named step reveals the graphic, retargetable afterwards', async ({ page }) => {
  await bootstrapGraphic(page, 'Hairline');
  await openWorkingGraphicInEditor(page);
  const before = await state(page);

  await openInsertDialog(page);
  await page.getByTestId('insert-tpl-placement').selectOption('new-step');
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await page.getByTestId('insert-tpl-card-card01').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeHidden();
  await expect(editorPreview(page).locator('.info-card-2-box')).toHaveCount(1);

  const after = await state(page);
  const gfxSel = after.selected!;
  // A new step on the default path, named after the variant, revealing the inserted root.
  expect(after.steps!.length).toBe(before.steps!.length + 1);
  const step = after.steps![after.steps!.length - 2];
  expect(step.reveals).toContain(gfxSel);
  expect(after.spxSteps).toBe('2');

  // The selected inserted graphic keeps an appearance choice in the current Inspector.
  const appears = page.getByRole('combobox', { name: 'Appears', exact: true });
  await expect(appears).toBeVisible();
  await expect(appears).toHaveValue('0');
  const emitted = await mountWorkingDocument(page);
  await emitted.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect(emitted.locator(gfxSel)).toHaveCSS('opacity', '0');
  await emitted.locator('body').evaluate(() => (window as unknown as { next: () => void }).next());
  await expect(emitted.locator(gfxSel)).toHaveCSS('opacity', '1');
  await appears.selectOption('-1');
  await expect
    .poll(async () => (await state(page)).steps!.every((s) => !s.reveals.includes(gfxSel)))
    .toBe(true);
  await expect(appears).toHaveValue('-1');
  const retargeted = await state(page);
  expect(retargeted.anim!.steps.length).toBe(before.anim!.steps.length);
  for (const [selector, tracks] of Object.entries(after.anim!.steps[1].layers)) {
    if (selector !== gfxSel) expect(retargeted.anim!.steps[0].layers[selector]).toEqual(tracks);
  }
  const replay = await mountWorkingDocument(page);
  await replay.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect(replay.locator(gfxSel)).toHaveCSS('opacity', '1');
  // The emptied press went away, but Play must still be retargetable to a new named step.
  await expect(appears.locator('option', { hasText: 'New step' })).toHaveCount(1);
  await appears.selectOption({ label: 'New step' });
  await expect(appears).toHaveValue('0');
  const recreated = await state(page);
  expect(recreated.anim!.steps.length).toBe(before.anim!.steps.length + 1);
  expect(recreated.anim!.steps[1].reveals).toContain(gfxSel);
  for (const selector of Object.keys(after.anim!.steps[1].layers)) {
    if (selector !== gfxSel) expect(recreated.anim!.steps[1].layers[selector]).toEqual(retargeted.anim!.steps[0].layers[selector]);
  }
  const nextAgain = await mountWorkingDocument(page);
  await nextAgain.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect(nextAgain.locator(gfxSel)).toHaveCSS('opacity', '0');
  await nextAgain.locator('body').evaluate(() => (window as unknown as { next: () => void }).next());
  await expect(nextAgain.locator(gfxSel)).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await state(page)).template).toEqual(retargeted.template);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await state(page)).template).toEqual(recreated.template);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await state(page)).template).toEqual(after.template);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await state(page)).template).toEqual(before.template);
});

test('a STEPPED donor keeps its middle steps — the run joins the host path after the placement', async ({ page, context }) => {
  await bootstrapGraphic(page, 'Hairline');
  await openWorkingGraphicInEditor(page);
  const before = await state(page);
  expect(before.steps!.length).toBe(2); // Enter + Out — the host has no presses of its own

  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await page.getByTestId('insert-tpl-steps').selectOption('stepped');
  await page.getByTestId('insert-tpl-card-card01').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeHidden();
  await expect(editorPreview(page).locator('.info-card-2-box')).toHaveCount(1);

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
  await expect(page.getByRole('button', { name: 'Hairline Card 2 flag', exact: true })).toBeVisible();

  // And behaviorally, on air: the guest's last line is parked out of its mask until its own
  // press arrives — the merged data drives the host's runtime exactly like a native step.
  // The authoring preview deliberately displays artwork at rest. Exercise the emitted
  // graphic's play/next API separately, keeping the authoring session available for Undo.
  const html = await page.evaluate(async () => {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return composeDocument(useTemplateStore.getState().template);
  });
  const runtime = await context.newPage();
  await runtime.route('**/merged-template-proof.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await runtime.goto('/merged-template-proof.html');
  const lastLine = runtime.locator(`#${newFields[2]}`);
  const slid = () => lastLine.evaluate(el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return m.m42 > el.getBoundingClientRect().height / 2;
  });
  const idle = () => runtime.evaluate(() => !(window as unknown as {
    gsap: { globalTimeline: { getChildren: () => { isActive: () => boolean }[] } };
  }).gsap.globalTimeline.getChildren().some(child => child.isActive()));
  await expect(runtime.locator(after.selected!)).toHaveCSS('opacity', '0');
  await runtime.evaluate(() => (window as unknown as { play: () => void }).play());
  await expect.poll(idle).toBe(true);
  await expect(runtime.locator(after.selected!)).toHaveCSS('opacity', '1');
  await expect.poll(slid).toBe(true);
  await runtime.evaluate(() => (window as unknown as { next: () => void }).next());
  await expect.poll(idle).toBe(true);
  await expect.poll(slid).toBe(true);
  await runtime.evaluate(() => (window as unknown as { next: () => void }).next());
  await expect.poll(slid).toBe(false);
  await expect(lastLine).toBeVisible();
  await runtime.evaluate(() => (window as unknown as { stop: () => void }).stop());
  await expect(runtime.locator(after.selected!)).toHaveCSS('opacity', '0');
  await runtime.evaluate(() => (window as unknown as { play: () => void }).play());
  await expect.poll(idle).toBe(true);
  await expect(runtime.locator(after.selected!)).toHaveCSS('opacity', '1');
  await expect.poll(slid).toBe(true); // replay re-arms the donor's later lines
  await runtime.close();

  const validation = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    return validateTemplate(useTemplateStore.getState().template).errors;
  });
  expect(validation).toEqual([]);

  // Still ONE undo step, steps and all.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await state(page)).steps!.length).toBe(before.steps!.length);
});

test('an inserted graphic\'s own text lines are selectable parts, without inflating the host design', async ({ page }) => {
  await bootstrapGraphic(page, 'Hairline');
  await openWorkingGraphicInEditor(page);
  const before = await state(page);

  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
  await page.getByTestId('insert-tpl-card-card01').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeHidden();
  await expect(editorPreview(page).locator('.info-card-2-box')).toHaveCount(1);

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

  // The current layer list exposes the inserted text as a named selection handle.
  const guestSel = guests[0].selector;
  const row = page.locator(`.ef-track[data-selector="${guestSel}"] .ef-layer`);
  await expect(row).toContainText('(Hairline Card)');
  await row.click();
  await expect.poll(async () => (await state(page)).selected).toBe(guestSel);
});

test('templates that need their own runtime are greyed with the reason, not hidden', async ({ page }) => {
  await bootstrapGraphic(page, 'Hairline');
  await openWorkingGraphicInEditor(page);
  const before = await state(page);
  await openInsertDialog(page);
  await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Tickers' }).click();
  const card = page.getByTestId('insert-tpl-card-tk01');
  await expect(card).toHaveClass(/blocked/);
  await card.click({ force: true });
  await expect(page.getByTestId('insert-tpl-error')).toContainText(/runtime|measured/);
  // The project was NOT touched.
  const st = await state(page);
  expect(st).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('insert-tpl-dialog')).toHaveCount(0);
  await expect(page.getByTestId('assets-insert-template')).toBeFocused();
  await page.getByTestId('assets-insert-template').click();
  await expect(page.getByTestId('insert-tpl-dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('insert-tpl-dialog')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('insert-tpl-dialog')).toHaveCount(0);
  expect((await state(page)).template).toEqual(before.template);
});


test('a saved one-step graphic keeps its entrance when a template adds an Out and appearance step', async ({ page }) => {
  for (const placement of ['start', 'new-step']) {
    await bootstrapGraphic(page, 'Hairline');
    // Fixture setup: an older saved data block has its In only, with no authored machine.
    await page.evaluate(async () => {
      const { useTemplateStore, flushPendingProject } = await import('/src/store/templateStore.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { spxSteps } = await import('/src/blocks/animMachine.ts');
      const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
      const store = useTemplateStore.getState(), data = parseAnimData(store.template.js)!;
      data.steps = data.steps.slice(0, 1); delete data.machine;
      const settings = { ...store.template.settings, steps: String(spxSteps(data)) };
      store.applyTemplate({ ...store.template, settings, html: replaceDefinitionInHtml(store.template.html, settings, store.template.fields), js: writeAnimData(store.template.js, data)! }, { resetSampleData: true });
      flushPendingProject();
      const error = await commitDurableWrites(); if (error) throw new Error(error);
      await new Promise(resolve => setTimeout(resolve));
    });
    await openWorkingGraphicInEditor(page);
    const before = await state(page);
    expect(before.anim!.steps).toHaveLength(1);
    await openInsertDialog(page);
    await page.getByTestId('insert-tpl-placement').selectOption(placement);
    await page.locator('.insert-tpl-cats').getByRole('tab', { name: 'Info cards' }).click();
    await page.getByTestId('insert-tpl-card-card01').click();
    await expect(page.getByTestId('insert-tpl-dialog')).toBeHidden();
    const after = await state(page);
    expect(after.anim!.steps).toHaveLength(placement === 'start' ? 2 : 3);
    for (const [selector, tracks] of Object.entries(before.anim!.steps[0].layers)) {
      expect(after.anim!.steps[0].layers[selector]).toEqual(tracks);
    }
    const emitted = await mountWorkingDocument(page), selector = after.selected!;
    await emitted.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
    await expect(emitted.locator(selector)).toHaveCSS('opacity', placement === 'start' ? '1' : '0');
    if (placement === 'new-step') {
      await emitted.locator('body').evaluate(() => (window as unknown as { next: () => void }).next());
      await expect(emitted.locator(selector)).toHaveCSS('opacity', '1');
    }
    await emitted.locator('body').evaluate(() => (window as unknown as { stop: () => void }).stop());
    await expect(emitted.locator(selector)).toHaveCSS('opacity', '0');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await state(page)).template).toEqual(before.template);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(async () => (await state(page)).template).toEqual(after.template);
  }
});
