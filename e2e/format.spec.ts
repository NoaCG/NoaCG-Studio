// covers: src/templates/**, src/format/**
// focus

import { test, expect } from '@playwright/test';
import { finishIntoNewEditor } from './_create';
import { chooseType } from './_browse';

// The Prettier formatting layer (src/format/formatCode.ts). Its pure functions, the three
// formatters, the animation-region refusal and formatTemplate's defaults, run in Node
// (scripts/format-code.test.mjs); this file keeps the journey that needs the app, format-on-create.
// The service is house-aware on purpose: it formats HTML freely, but it must NEVER silently
// rewrite the right-aligned CSS comment style or the timeline's JS animation region.

// ── Format-on-create: every generated project starts from a Prettier-tidied HTML baseline ──

test('a newly created project starts from a Prettier-formatted HTML baseline', async ({ page }) => {
  // The wizard's Create, which routes through applyGenerated: the first lower third, then
  // Finish's editor door, which builds the graphic into the working document.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await page.locator('.wz-variant').first().click();
  await finishIntoNewEditor(page);

  const result = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { formatHtml } = await import('/src/format/formatCode.ts');
    const t = useTemplateStore.getState().template;
    return {
      // Already-formatted HTML is a fixed point of formatHtml - so re-formatting is a no-op.
      alreadyFormatted: (await formatHtml(t.html)) === t.html,
      // The SPX definition survived the format-on-create re-parse: fields are intact.
      fieldCount: t.fields.length,
    };
  });

  expect(result.alreadyFormatted).toBe(true); // format-on-create left the HTML tidy at birth
  expect(result.fieldCount).toBeGreaterThan(0); // the definition parsed back to real fields
});
