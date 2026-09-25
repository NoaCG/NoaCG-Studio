import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { lowerThirdPng } from './_png';
import { chooseType, pickDesign } from './_browse';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Image support: the "Image" field type (SPX filelist), logo fields on credits / corner bug,
// and the export folder structure ([TemplatesFolder]/your_project/index.html + images/...).

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

async function createFrom(page: Page, categoryName: string, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, categoryName);
  await pickDesign(page, variantName);
}

async function create(page: Page) {
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
}

function frame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
}

/** Upload a png through the Data panel's image field control (by field label). */
async function uploadImage(page: Page, fieldLabel: string, fileName: string, buffer: Buffer = PNG_1PX) {
  await page.getByTestId('dock-tab-data').click();
  const row = page.locator('.panel-body .field-row', { hasText: fieldLabel });
  await row.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'image/png',
    buffer,
  });
  // Adding the asset recomposes the preview (debounced) — let the frame settle before
  // sending an update, or the update lands in the document that is about to be replaced.
  await awaitPreviewRebuild(page);
}

test('data panel: the add-field types are the broadcast set, and an unanswerable add is refused', async ({ page }) => {
  await createFrom(page, 'Lower thirds', 'Hairline');
  await create(page);
  await page.getByTestId('dock-tab-data').click();
  const addSection = page.locator('.panel-section', { hasText: 'Add a field' });
  const select = addSection.locator('select');
  await expect(select.locator('option')).toHaveText(['Text', 'Long text', 'Number', 'Image']);
  // An Image field has nowhere to land on a catalog lower third (no placed-design slot),
  // so the add is REFUSED with the reason - the old behavior appended a definition-only
  // filelist no element answered, the silent on-air no-op (docs/GOALS_ARCHIVE.md "Student release" step 5).
  await select.selectOption('filelist');
  await addSection.getByRole('button', { name: '+ Add' }).click();
  await expect(page.getByTestId('add-field-refused')).toContainText('no place for a Image field');
  const html = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.html;
  });
  expect(html).not.toContain('"ftype": "filelist"');
});

test('end credits: uploading a logo through the Logo field puts it in the end block', async ({ page }) => {
  await createFrom(page, 'Credits', 'Classic Roll');
  await create(page);
  // Placeholder first — no logo picked yet.
  await expect(frame(page).locator('.credits-end .credits-logo-slot')).toBeAttached();
  await uploadImage(page, 'Logo', 'my_logo.png');
  await page.locator('.panel-body').getByRole('button', { name: '⟳ Update' }).click();
  const logo = frame(page).locator('.credits-end img.credits-logo');
  await expect(logo).toBeAttached();
  // The preview shim resolves the relative path to the in-memory data URL.
  await expect
    .poll(async () => logo.evaluate((el) => (el as HTMLImageElement).src.slice(0, 5)))
    .toBe('data:');
});

test('an oversized logo is shrunk to the frame at the door, and a small one is left alone', async ({ page }) => {
  // The library filled after about ten graphics in real use, and an uploaded picture is the
  // reason: base64 (+33%), UTF-16 in localStorage (×2) and the saved Reset baseline (×2) turn
  // a press-kit crest into most of a browser quota. Nothing past the frame's own long edge can
  // ever be drawn, so it is dropped here rather than carried through every save and sync.
  await createFrom(page, 'Credits', 'Classic Roll');
  await create(page);

  const stored = () =>
    page.evaluate(async () => {
      const store = await import('/src/store/templateStore.ts');
      const asset = store.useTemplateStore.getState().template.assets.find((a) => a.path.includes('huge_logo'));
      if (!asset || typeof asset.data !== 'string') return null;
      const size = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = asset.data as string;
      });
      return { ...size, chars: (asset.data as string).length };
    });

  // A PHOTO-shaped image, built in the page as noise so it cannot compress away: this is the
  // case the fix is for, and a flat synthetic PNG is not (a hand-rolled deflate of one solid
  // block beats any canvas re-encode, and the rule below then correctly keeps the original).
  const shrunk = await page.evaluate(async () => {
    const { shrinkImageDataUrl } = await import('/src/assets/imageImport.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 3840;
    canvas.height = 2160;
    const ctx = canvas.getContext('2d')!;
    const noise = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < noise.data.length; i += 4) {
      noise.data[i] = (i * 7) % 255;
      noise.data[i + 1] = (i * 13) % 255;
      noise.data[i + 2] = (i * 29) % 255;
      noise.data[i + 3] = 255;
    }
    ctx.putImageData(noise, 0, 0);
    const before = canvas.toDataURL('image/png');
    const after = await shrinkImageDataUrl(before);
    const size = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = after.data;
    });
    return { ...size, beforeChars: before.length, afterChars: after.data.length, note: after.note };
  });
  expect(shrunk.w).toBe(1920);
  expect(shrunk.h).toBe(1080);
  expect(shrunk.afterChars).toBeLessThan(shrunk.beforeChars);
  expect(shrunk.note).not.toBeNull();

  // …and whatever the door decides, what lands in the template is NEVER bigger than the file
  // that was picked. A resize that grew a file would be a bug wearing an optimisation's
  // clothes — and a flat design PNG is exactly where a canvas re-encode would do it.
  const flat = lowerThirdPng(3840, 2160);
  await uploadImage(page, 'Logo', 'huge_logo.png', flat);
  const kept = await stored();
  expect(kept?.chars).toBeLessThanOrEqual(`data:image/png;base64,${flat.toString('base64')}`.length);

  // An image that already fits the frame is stored byte for byte.
  const small = lowerThirdPng(400, 200);
  await uploadImage(page, 'Logo', 'small_logo.png', small);
  const untouched = await page.evaluate(async () => {
    const store = await import('/src/store/templateStore.ts');
    const asset = store.useTemplateStore.getState().template.assets.find((a) => a.path.includes('small_logo'));
    return typeof asset?.data === 'string' ? asset.data.length : 0;
  });
  expect(untouched).toBe(`data:image/png;base64,${small.toString('base64')}`.length);
});

test('corner bug: the logo field replaces the placeholder mark', async ({ page }) => {
  await createFrom(page, 'corner logos', 'Glass Mark');
  await create(page);
  await expect(frame(page).locator('.corner-bug-mark')).toBeVisible();
  await uploadImage(page, 'Logo', 'channel_mark.png');
  await page.locator('.panel-body').getByRole('button', { name: '⟳ Update' }).click();
  await expect(frame(page).locator('.corner-bug-media.has-image')).toBeAttached();
  await expect(frame(page).locator('.corner-bug-mark')).toBeHidden();
  await expect
    .poll(async () => frame(page).locator('img.corner-bug-logo').evaluate((el) => (el as HTMLImageElement).src.slice(0, 5)))
    .toBe('data:');
});

test('export: the zip is [project]/[project].html with images under [project]/images/', async ({ page }) => {
  await createFrom(page, 'Credits', 'Classic Roll');
  await create(page);
  await uploadImage(page, 'Logo', 'station_logo.png');
  await page.getByTestId('dock-tab-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const names = Object.keys(zip.files);
  expect(names).toContain('classic_roll/classic_roll.html');
  expect(names).toContain('classic_roll/images/station_logo.png');
  expect(names).toContain('classic_roll/js/template.js');
  expect(names).toContain('classic_roll/js/gsap.min.js');
  // The image is a real binary, not a data URL dump.
  const png = await zip.file('classic_roll/images/station_logo.png')!.async('nodebuffer');
  expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});
