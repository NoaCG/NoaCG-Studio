// covers: none - no source path selected this spec when coverage moved into spec headers
// (2026-09-27); it runs when edited, on a full escalation and at night

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dropSvg } from './_svg-import';

// THE FIELDS STEP AND THE GRAPHIC READ THE ALIGNMENT FROM THE FACE THE TITLE IS DRAWN IN. The
// example title is centred by position alone, in Oswald, which loads lazily on first layout;
// measured only in the wider fallback it read as right-aligned - on the step (MapSvgFieldsStep,
// `fontKey`) and in the runtime, which wrote that anchor onto the title (svg.ts, svgRereadAlign).
const EXAMPLE_TITLE = fileURLToPath(
  new URL('../docs/tutorials/svg-examples/SVG/title.svg', import.meta.url),
);

test('svg import: a centred title reads centred on the Fields step, as the graphic centres it', async ({ page, baseURL }) => {
  // THE FACE ARRIVES LATE ON EVERY MACHINE. Oswald is held back, and the family name is claimed
  // by that same held-back file in every document, so a copy installed on the machine cannot
  // stand in for it: the first layout is in the default face, as on a runner without Oswald.
  await page.route('**/fonts/oswald.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.addInitScript((origin) => {
    document.fonts.add(new FontFace('Oswald', `url(${origin}/fonts/oswald.woff2)`, { weight: '200 700' }));
  }, new URL(baseURL!).origin);
  await page.goto('/app');
  await dropSvg(page, EXAMPLE_TITLE);

  // Title is t0, Subtitle t1: both drawn centred in their plates, and both read so.
  for (const row of ['t0', 't1']) {
    await expect(page.getByTestId(`map-svg-align-${row}`).locator('.map-svg-align-now')).toHaveText(
      'centred, middle',
    );
    await expect(page.getByTestId(`map-svg-align-${row}-middle-middle`)).toHaveAttribute(
      'title',
      'centred, middle - read from your drawing',
    );
  }

  // The same geometry as the graphic's own runtime, read inside the settled preview document:
  // its answer, and the anchor it wrote onto the title.
  const stage = page.locator('.wz-side .wz-stage');
  await expect(stage).not.toHaveAttribute('data-doc-pending', '1', { timeout: 20_000 });
  const frame = page.frameLocator('.wz-side iframe');
  const title = frame.locator('#f0');
  await expect(title).toContainText('THE WEEKLY SHOW');
  await expect
    .poll(() =>
      title.evaluate((el) => {
        const w = el.ownerDocument.defaultView as unknown as { svgFitAlign?: Record<string, { h: string }> };
        return `${w.svgFitAlign?.f0?.h} ${el.getAttribute('text-anchor')}`;
      }),
    )
    .toBe('middle middle');
});
