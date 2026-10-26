// A SINGLE-WEIGHT OR IMPORTED FACE IS NEVER DRAWN AS A SYNTHESISED BOLD (playout-adjustments spec,
// "Typography reliability" item 2).
// covers: src/model/fonts.ts, public/fonts/*.woff2
//
// A blank page at a root path, so `url("fonts/<file>")` resolves to `/fonts/<file>` as beside
// /output, holding the generated `@font-face` of Bebas Neue (one static weight) and of an imported
// face (one file, no declared weight), then the same word at weight 400 and at 800. Chromium
// smears a bold onto a face whose declared range tops out below 600, so the two pictures differed;
// with the face declared over 100-900 they are the same pixels. Archivo, a variable face, is the
// control: its 800 must still differ from its 400, or the comparison would prove nothing.

import { test, expect, type Page } from '@playwright/test';

const WORD = 'JAKE MORRISON';

async function pictures(page: Page, kind: 'bundled' | 'imported', fontId: string) {
  return page.evaluate(async ({ kind, fontId, word }) => {
    const { fontById, fontFaceCss, customFontFaceCss } = await import('/src/model/fonts.ts');
    const face = fontById(fontId);
    const family = kind === 'bundled' ? face.family : 'Brand Import';
    const css =
      kind === 'bundled'
        ? fontFaceCss(face)
        : customFontFaceCss({ family, format: 'woff2', asset: { path: `fonts/${face.file}`, name: face.file, mime: 'font/woff2', data: '' } } as never);
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    await document.fonts.load(`400 80px "${family}"`, word);
    const draw = (weight: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 120;
      const ctx = canvas.getContext('2d')!;
      ctx.font = `${weight} 80px "${family}"`;
      ctx.fillText(word, 10, 95);
      return canvas.toDataURL();
    };
    await document.fonts.load(`800 80px "${family}"`, word);
    return { regular: draw(400), heavy: draw(800), loaded: document.fonts.check(`400 80px "${family}"`, word) };
  }, { kind, fontId, word: WORD });
}

test('Bebas Neue and an imported face draw 800 exactly as 400; a variable face still has its bold', async ({ page }) => {
  await page.route('**/bundled-font-weights-probe', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' }));
  await page.goto('/bundled-font-weights-probe');

  const bebas = await pictures(page, 'bundled', 'bebas-neue');
  expect(bebas.loaded, 'Bebas Neue loaded').toBe(true);
  expect(bebas.heavy === bebas.regular, 'Bebas Neue at 800 is drawn as the file is, no synthesised bold').toBe(true);

  const imported = await pictures(page, 'imported', 'anton');
  expect(imported.loaded, 'the imported face loaded').toBe(true);
  expect(imported.heavy === imported.regular, 'an imported face at 800 is drawn as the file is').toBe(true);

  const archivo = await pictures(page, 'bundled', 'archivo');
  expect(archivo.heavy === archivo.regular, 'Archivo, a variable face, really draws a heavier 800').toBe(false);
});
