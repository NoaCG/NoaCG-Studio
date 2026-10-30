// covers: src/components/wizard/**, !src/components/wizard/import/**
//
// It reaches the Import-graphic folder through the import entry and asserts on testids only it
// renders: PlaceFieldsStep's font field.
// covers: src/components/wizard/import/**

import { test, expect } from '@playwright/test';
import { finishIntoNewEditor } from './_create';

// The Google Fonts source in the typeface picker (src/model/googleFonts.ts). An imported
// design was drawn in a real typeface and NoaCG bundles seventeen, so "close enough" was the
// only answer available; now the whole library is searchable by name.
//
// THE RULE THIS SUITE EXISTS FOR: the network is the STUDIO's, never the graphic's. The file
// is fetched while designing and embedded in template.assets, so the emitted code carries no
// reference to Google at all and an exported package plays out with no internet. Both halves
// are asserted below.
//
// Google is STUBBED here, exactly like the AI routes: the offline suite must not depend on a
// third party being up, and what is under test is our end of the exchange.

/** A minimal valid woff2 (header only) — enough to travel as an asset; nothing renders it. */
const WOFF2 = Buffer.from('d9c4bd88', 'hex');

/** The woff2 stub for one subset's file, tagged so the embedded bytes say which file arrived. */
const fileFor = (subset: string) => Buffer.concat([WOFF2, Buffer.from(subset)]);

/**
 * The css2 sheet as Google serves it to a modern browser: one @font-face per SUBSET, each with
 * its own file and unicode-range, and `latin` LAST (Montserrat, Roboto, Oswald, 2026-10-24).
 * A stub with one block hid the defect this shape exposes: the first url() is a Cyrillic file
 * with no ASCII glyphs, and embedding it alone sent every letter to Arial.
 */
const SUBSETS: [subset: string, range: string][] = [
  ['cyrillic-ext', 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F'],
  ['cyrillic', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'],
  ['vietnamese', 'U+0102-0103, U+0110-0111, U+0128-0129, U+1EA0-1EF9, U+20AB'],
  ['latin-ext', 'U+0100-02BA, U+02BD-02C5, U+1E00-1E9F, U+2020, U+20A0-20AB, U+A720-A7FF'],
  ['latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+2000-206F, U+20AC, U+FFFD'],
];
const CSS2 = SUBSETS.map(
  ([subset, range]) => `/* ${subset} */
@font-face {
  font-family: 'Montserrat';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/montserrat/v31/${subset}.woff2) format('woff2');
  unicode-range: ${range};
}`,
).join('\n');

async function stubGoogle(page: import('@playwright/test').Page) {
  await page.route('https://fonts.googleapis.com/**', (route) => {
    const url = route.request().url();
    if (!/family=Montserrat/.test(url)) return route.fulfill({ status: 400, body: 'Bad Request' });
    return route.fulfill({ status: 200, contentType: 'text/css', body: CSS2 });
  });
  await page.route('https://fonts.gstatic.com/**', (route) => {
    const subset = route.request().url().match(/\/([a-z-]+)\.woff2$/)?.[1] ?? 'unknown';
    return route.fulfill({ status: 200, contentType: 'font/woff2', body: fileFor(subset) });
  });
}

/** Reach the Text step of an Import Graphic walk, with the typeface picker open. */
async function openPicker(page: import('@playwright/test').Page) {
  await page.goto('/app');
  await page.locator('[data-entry="import-graphic"]').click();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.getContext('2d')!.fillStyle = '#12203a';
    canvas.getContext('2d')!.fillRect(120, 760, 900, 190);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob!], 'strap.png', { type: 'image/png' }));
    const input = document.querySelector('.wz-drop input[type=file]') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.asset-card')).toBeVisible();
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  await expect(page.getByTestId('place-stage')).toBeVisible();
  // The auto-placed Name field is selected, so this is the field-level picker.
  await page.getByTestId('field-font').click();
  await page.getByTestId('font-google').click();
}

test('a Google typeface is searched by name and embedded in the graphic', async ({ page }) => {
  await stubGoogle(page);
  await openPicker(page);

  await page.getByTestId('font-google-search').fill('montse');
  await expect(page.getByTestId('font-google-result').first()).toContainText('Montserrat');
  await page.getByTestId('font-google-result').first().click();

  // Picked: it becomes the design typeface, so every field that inherits renders in it.
  await expect(page.getByTestId('field-font')).toContainText('Montserrat');

  // The import walk ends in the new editor through the Finish step's door.
  await finishIntoNewEditor(page);

  const built = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    const font = t.assets.find((a) => a.path.startsWith('fonts/'));
    return {
      all: t.assets.map((a) => a.path),
      fonts: t.assets.map((a) => a.path).filter((p) => p.startsWith('fonts/')),
      // The embedded bytes, decoded: the stub tags each subset's file with its name.
      bytes: typeof font?.data === 'string' ? atob(font.data.split(',')[1] ?? '') : '',
      face: t.css.includes('font-family: "Montserrat"'),
      // The whole point: nothing in the emitted graphic reaches for Google at play time.
      google: [t.css, t.html, t.js].some((part) => /googleapis|gstatic/.test(part)),
    };
  });
  expect(built.fonts, JSON.stringify(built.all)).toEqual(['fonts/montserrat-400.woff2']);
  // The one file the embed carries is the LATIN subset, not whichever block Google lists first.
  expect(built.bytes.endsWith('latin'), `embedded file tag: ${JSON.stringify(built.bytes.slice(4))}`).toBe(true);
  expect(built.face).toBe(true);
  expect(built.google).toBe(false);
});

test('a typeface Google does not have is refused by name, not silently substituted', async ({ page }) => {
  await stubGoogle(page);
  await openPicker(page);

  // A name the index does not carry offers the direct try — and the 400 comes back as words.
  await page.getByTestId('font-google-search').fill('Zzzqqx Grotesk');
  await page.getByTestId('font-google-exact').click();
  await expect(page.getByTestId('font-google-panel')).toContainText('no family called');
  await expect(page.getByTestId('field-font')).toContainText('Design typeface');
});
