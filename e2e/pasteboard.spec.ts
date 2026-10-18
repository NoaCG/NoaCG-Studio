// covers: src/preview/composeDocument.ts

import { test, expect } from '@playwright/test';
import { bootstrapGraphic } from './_create';

// The off-canvas pasteboard (the retired code editor's working margin) was deleted on 2026-10-17
// with the four cases that drove it. What is left is the invariant that outlived it: no pad ever
// enters persisted state, and an exported document stays clipped to the canvas while only the
// composer's authoring option opens a margin.

test('the pasteboard pad never enters persisted state; export stays clipped to the canvas', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });

  const probe = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const tpl = useTemplateStore.getState().template;
    return {
      // The preview/export composition WITHOUT authoring keeps the canvas clip and no pasteboard;
      // an authoring margin is the composer's option, so any non-zero pad shows the difference.
      exportDoc: composeDocument(tpl),
      authoringDoc: composeDocument(tpl, { authoring: { padX: 200, padY: 0 } }),
      // Everything persisted lives in the template — serialize it whole and search for the pad.
      serialized: JSON.stringify(tpl),
    };
  });

  // Semantic, not numeric: the persisted template carries no authoring/pad concept at all.
  expect(probe.serialized).not.toContain('pasteboard');
  expect(probe.serialized).not.toContain('padX');
  expect(probe.serialized).not.toContain('spx-authoring-style');
  // The exported/on-air document clips to the true canvas; only the authoring preview opts in.
  expect(probe.exportDoc).toContain('overflow: hidden');
  expect(probe.exportDoc).not.toContain('spx-authoring-style');
  expect(probe.authoringDoc).toContain('spx-authoring-style');
});
