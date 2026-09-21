import { test, expect } from '@playwright/test';
import { switchToAdvancedMode } from './_create';

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

async function stubGoogle(page: import('@playwright/test').Page) {
  await page.route('https://fonts.googleapis.com/**', (route) => {
    const url = route.request().url();
    if (!/family=Montserrat/.test(url)) return route.fulfill({ status: 400, body: 'Bad Request' });
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: `@font-face {
  font-family: 'Montserrat';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/montserrat/v29/stub.woff2) format('woff2');
}`,
    });
  });
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: WOFF2 }),
  );
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

  await switchToAdvancedMode(page);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 30_000 });

  const built = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return {
      all: t.assets.map((a) => a.path),
      fonts: t.assets.map((a) => a.path).filter((p) => p.startsWith('fonts/')),
      face: t.css.includes('font-family: "Montserrat"'),
      // The whole point: nothing in the emitted graphic reaches for Google at play time.
      google: [t.css, t.html, t.js].some((part) => /googleapis|gstatic/.test(part)),
    };
  });
  expect(built.fonts, JSON.stringify(built.all)).toEqual(['fonts/montserrat-400.woff2']);
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
