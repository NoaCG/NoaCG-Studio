import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { awaitPreviewRebuild } from './_preview';
import { previewFrame } from './_frame';
import { dropSvg, growthNow, rowLabelled } from './_svg-import';

// THE WORKED EXAMPLE the "draw it in Illustrator" guide is written around
// (docs/SVG_AUTHORING.md, "A worked example"): docs/svg-samples/sticker-lower-third.svg is the
// catalog's Sticker Strap rebuilt as a layered Illustrator export. A guide that walks a file
// nobody has imported is a guess, so this spec walks that exact file through the real wizard and
// pins the three things the guide promises about it: the layer names become the field labels,
// growth is on without being asked for, and a long name widens the panel and takes its drawn
// hard shadow with it.

const SAMPLE = fileURLToPath(new URL('../docs/svg-samples/sticker-lower-third.svg', import.meta.url));

test('the Sticker lower third sample imports with its layer names as fields, and its panel grows', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/app');
  await dropSvg(page, SAMPLE);

  // The two text layers are the two fields, labelled by the names typed in the Layers panel.
  const fields = page.getByTestId('map-svg-fields');
  expect(await fields.locator('[data-testid^="map-svg-row-"]').count()).toBe(2);
  await rowLabelled(page, /^Name$/);
  await rowLabelled(page, /^Title$/);

  // Growth is on without being asked for, and the box is the rectangle named Panel: it is the
  // smallest rectangle around the two lines, because the hard shadow is drawn as two strips that
  // never sit behind the words.
  const growth = await growthNow(page);
  expect(growth.mode).toBe('grow-xy');
  expect(growth.named).toContain('Panel');

  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });

  const frame = previewFrame(page);
  await expect(frame.locator('#f0')).toHaveText('Alex Rivera');
  // ILLUSTRATOR STATES THE WEIGHT ONLY IN THE FACE NAME ('Archivo-Black', no font-weight), and
  // the bundled Archivo is ONE variable file. Declared with its whole range the name would
  // render Regular, so each alias is pinned to the weight its name states. Two checks, because
  // the computed font-weight cannot tell them apart (it reads 400 either way): the emitted
  // face says 900, and the Black name really renders WIDER than the Bold one at one size.
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toMatch(/font-family: "Archivo-Black";[^}]*font-weight: 900;/);
  expect(css).toMatch(/font-family: "Archivo-Bold";[^}]*font-weight: 700;/);
  const lengths = await frame.locator('#f0').evaluate(async (el) => {
    const doc = el.ownerDocument;
    await doc.fonts.ready;
    await Promise.all([doc.fonts.load('50px "Archivo-Black"'), doc.fonts.load('50px "Archivo-Bold"')]);
    const node = el as unknown as SVGTextContentElement;
    const black = node.getComputedTextLength();
    const probe = node.cloneNode(true) as SVGTextContentElement;
    probe.removeAttribute('id');
    probe.removeAttribute('class');
    probe.setAttribute('style', `font-family:'Archivo-Bold';font-size:${getComputedStyle(node).fontSize};letter-spacing:${getComputedStyle(node).letterSpacing}`);
    node.parentNode!.appendChild(probe);
    const bold = probe.getComputedTextLength();
    probe.remove();
    return { black, bold };
  });
  expect(lengths.black).toBeGreaterThan(lengths.bold * 1.02);
  const widthOf = (id: string) =>
    frame.locator(`#${id}`).evaluate((el) => (el as unknown as SVGGraphicsElement).getBBox().width);
  const drawnPanel = await widthOf('Panel');
  const drawnStrip = await widthOf('Shadow_x20_bottom');
  const xOf = (id: string) => frame.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().left);
  const drawnRightStripX = await xOf('Shadow_x20_right');

  // A name the drawn label cannot hold: the panel widens, the bottom strip spans it and widens by
  // the same amount, and the right strip sits past the growing edge and travels with it.
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.panel-body .field-row', { hasText: 'Name' }).locator('input').first()
    .fill('Aleksandra Konstantinopoulou-Virtanen');
  await page.getByTestId('dock-body-right').getByRole('button', { name: '⟳ Update' }).click();
  await expect.poll(() => widthOf('Panel')).toBeGreaterThan(drawnPanel + 40);
  const grownPanel = await widthOf('Panel');
  const grownStrip = await widthOf('Shadow_x20_bottom');
  expect(Math.abs((grownStrip - drawnStrip) - (grownPanel - drawnPanel))).toBeLessThan(2);
  expect(await xOf('Shadow_x20_right')).toBeGreaterThan(drawnRightStripX + 20);
});
