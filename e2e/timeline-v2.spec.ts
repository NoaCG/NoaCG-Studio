// covers: src/blocks/**, src/templates/**

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The old step timeline (src/components/timeline/StepTimeline.tsx, the dock behind the retired
// code editor) was deleted on 2026-10-17 with the twenty-four cases that drove it; the new editor
// has its own timeline, pinned by e2e/editor-*.spec.ts. What is left here is the one case whose
// subject is the RUNTIME, not the dock: it still boots through the retired helper and skips until
// it is rewritten onto a composed preview (issue #800).

/** Parse the live template's animation data in the page (null when not a data block). */
async function animData(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js);
  });
}

test('v2: scoreboards create as data blocks — the score pop keeps working around the region', async ({ page }) => {
  await createProject(page, { category: 'Scoreboards', name: 'Match Strip' });
  // The step timeline outright; scoreboards never step (Enter + Out only).
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0);
  const data = await animData(page);
  expect(data!.steps).toHaveLength(2);
  // The scoreboard-owned runtime OUTSIDE the region survived the conversion verbatim.
  // Drive the REAL SPX contract (the editor's simulator owns the builders directly and
  // never sets onAir): play(), then update() with a changed score — the pop scales the
  // mask up briefly, exactly as before the flip.
  const frame = page.frameLocator('iframe.preview-frame');
  await frame.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect
    .poll(async () => frame.locator('.scoreboard').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  // The pop is a 0.4 s spring from 1.35 back to 1, so polling for it from OUTSIDE the page is
  // a race: one slow round-trip and the sampling starts after it is over, reading a settled 1
  // forever. Sample from inside the page instead and report the PEAK - the assertion then
  // means "the score popped" rather than "the runner happened to look in time".
  const peakScale = await frame.locator('body').evaluate(async () => {
    const el = document.getElementById('f1')!.parentElement!;
    const read = () => {
      const m = getComputedStyle(el).transform.match(/matrix\(([\d.]+)/);
      return m ? Number(m[1]) : 1;
    };
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f1: '7' }));
    let peak = read();
    for (let i = 0; i < 60; i++) {
      peak = Math.max(peak, read());
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return peak;
  });
  expect(peakScale).toBeGreaterThan(1.05);
});
