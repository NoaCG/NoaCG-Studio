// EVERY BUNDLED FACE SETS "Åsa Öberg-Ærø Šimon Žáková" IN ITSELF, NEVER A FALLBACK
// (playout-adjustments spec, "Typography reliability" item 1; the string is AC-5's).
// covers: src/model/fonts.ts, public/fonts/*.woff2
//
// A blank page at a root path, so `url("fonts/<file>")` resolves to `/fonts/<file>` as it does
// beside /output, holding each face's own generated `@font-face` rules and one node per face with
// the string, precomposed and with a decomposed "A + ring". Chromium's per-node platform-font
// report (`CSS.getPlatformFontsForNode`) then names every font the node's glyphs were drawn
// with: the face's own web fonts, no system face. The Node half (scripts/bundled-font-glyphs.test.mjs)
// reads the files' cmaps; this proves the browser picks them.

import { test, expect } from '@playwright/test';

const NAME = 'Åsa Öberg-Ærø Šimon Žáková';
const DECOMPOSED = 'A\u030asa'; // "Åsa" with the ring as a combining mark

test('every bundled face draws the whole name itself, Š and Ž included', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/bundled-font-glyphs-probe', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' }));
  await page.goto('/bundled-font-glyphs-probe');
  const families = await page.evaluate(async ({ name, decomposed }) => {
    const { FONTS, fontFaceCss } = await import('/src/model/fonts.ts');
    const style = document.createElement('style');
    style.textContent = FONTS.map((f: { family: string }) => fontFaceCss(f as never)).join('\n\n');
    document.head.append(style);
    for (const [i, f] of (FONTS as { family: string }[]).entries()) {
      for (const [kind, text] of [['name', name], ['decomposed', decomposed]]) {
        const node = document.createElement('div');
        node.id = `${kind}-${i}`;
        node.style.cssText = `font: 700 40px "${f.family}", monospace;`;
        node.textContent = text;
        document.body.append(node);
      }
      await document.fonts.load(`700 40px "${f.family}"`, name);
    }
    await document.fonts.ready;
    return (FONTS as { family: string }[]).map((f) => f.family);
  }, { name: NAME, decomposed: DECOMPOSED });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const used = async (selector: string) => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }));
  };
  for (const [i, family] of families.entries()) {
    for (const kind of ['name', 'decomposed']) {
      const fonts = await used(`#${kind}-${i}`);
      // The latin and latin-ext files are two web fonts of one family: every glyph must come
      // from one of them, none from a system face.
      expect(fonts.length, `${family} (${kind}): drawn at all`).toBeGreaterThan(0);
      expect(fonts.filter((f) => !f.custom), `${family} (${kind}): no glyph from a system face`).toEqual([]);
    }
  }
  await cdp.detach();
});
