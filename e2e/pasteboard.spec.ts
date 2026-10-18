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
    // The composer's own style tags, read apart from the template CSS: Hairline clips in its own
    // CSS too, so only these tags show what the composer adds.
    const styleOf = (doc: string, id: string) =>
      new DOMParser().parseFromString(doc, 'text/html').getElementById(id)?.textContent ?? null;
    // The preview/export composition WITHOUT authoring keeps the canvas clip and no pasteboard;
    // an authoring margin is the composer's option, so any non-zero pad shows the difference.
    const exportDoc = composeDocument(tpl);
    const authoringDoc = composeDocument(tpl, { authoring: { padX: 200, padY: 0 } });
    return {
      resolution: tpl.resolution,
      exportBase: styleOf(exportDoc, 'spx-base-style'),
      exportAuthoring: styleOf(exportDoc, 'spx-authoring-style'),
      authoring: styleOf(authoringDoc, 'spx-authoring-style'),
      // Everything persisted lives in the template — serialize it whole and search for the pad.
      serialized: JSON.stringify(tpl),
    };
  });

  // Semantic, not numeric: the persisted template carries no authoring/pad concept at all.
  expect(probe.serialized).not.toContain('pasteboard');
  expect(probe.serialized).not.toContain('padX');
  expect(probe.serialized).not.toContain('spx-authoring-style');
  // The exported/on-air document clips to the true canvas; only the authoring preview opts in.
  const { width, height } = probe.resolution;
  expect(probe.exportBase).toContain(`html, body { width: ${width}px; height: ${height}px; overflow: hidden; }`);
  expect(probe.exportAuthoring).toBeNull();
  expect(probe.authoring).toMatch(/body \{[^}]*overflow: visible !important;[^}]*margin: 0px 200px !important;/);
});
