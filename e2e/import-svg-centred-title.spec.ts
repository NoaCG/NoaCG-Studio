import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dropSvg } from './_svg-import';

// THE FIELDS STEP READS THE ALIGNMENT FROM THE FACE THE GRAPHIC IS DRAWN IN.
//
// The classroom show intro centres "QUIZ NIGHT" in its yellow plate with no `text-anchor`, only
// the position Illustrator wrote. Its face (Oswald) is a bundled family whose @font-face loads
// lazily, on the step's own first layout, so the step's first measurement is taken in a wider
// fallback that puts the title's centre right of its plate's. The runtime re-fits once the fonts
// are ready and centres the title on air at every length, so a step that never measured again
// told a student "right" about a title that behaves centred.
const SHOW_INTRO = fileURLToPath(
  new URL('../docs/tutorials/classroom-package/SVG/show-intro.svg', import.meta.url),
);

test('svg import: a centred title reads centred on the Fields step, as the graphic centres it', async ({ page }) => {
  await page.goto('/app');
  await dropSvg(page, SHOW_INTRO);

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

  // The same geometry as the graphic's own runtime, read inside the preview document.
  const frame = page.frameLocator('.wz-side iframe');
  const title = frame.locator('#f0');
  await expect(title).toContainText('QUIZ NIGHT');
  await expect
    .poll(() =>
      title.evaluate((el) => {
        const w = el.ownerDocument.defaultView as unknown as { svgFitAlign?: Record<string, { h: string }> };
        return w.svgFitAlign?.f0?.h;
      }),
    )
    .toBe('middle');
});
