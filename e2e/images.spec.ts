// covers: src/components/{fields/**,HostedControlPage.tsx}
// covers: src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}, src/assets/**
//
// This spec CREATES catalog variants and asserts on the markup they emit (Classic Roll's logo
// slot), so a design's markup changing under it is a real templates dependency; unmapped, a renamed
// credits row got past a local affected run and red-mained CI on 2026-08-26.
// covers: src/templates/**

import { finishIntoNewEditor } from './_create';
import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { mountWorkingDocument, updateWorkingDocument } from './_frame';
import { lowerThirdPng } from './_png';
import { chooseType, pickDesign } from './_browse';

// Image support: the logo fields on credits / corner bug, uploaded through the Fields step's own
// logo door, and that door shrinking an oversized picture. (The Data panel's add-field row went with the old editor; the export
// folder structure is editor-images's.)

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

async function createFrom(page: Page, categoryName: string, variantName: string) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, categoryName);
  await pickDesign(page, variantName);
}

/** Finish into the new editor: the walk's graphic becomes the working document. */
async function create(page: Page) {
  await finishIntoNewEditor(page);
}

/** The working graphic mounted the way playout composes it, fed the store's sample data: the
 *  document whose <img> resolves the asset the field names (the composition inlines it). */
async function mounted(page: Page): Promise<FrameLocator> {
  const doc = await mountWorkingDocument(page);
  const sample = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().sampleData as Record<string, string>;
  });
  await updateWorkingDocument(doc, sample);
  return doc;
}

/** Upload a png through the Fields step's own logo door ("Upload a logo"), from the design
 *  step the walk stands on: the file input a person picks a file with, the shrink at the door
 *  (assets/imageImport.ts) and the slot pointed at the picked file, all FieldsStep's own. */
async function toFields(page: Page) {
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByRole('button', { name: '⬆ Upload a logo…' })).toBeVisible();
}

/** The Fields step's own live preview: the step mounts each composed document in a fresh frame. */
function stepPreview(page: Page): FrameLocator {
  return page.locator('.wz-stage-live iframe').last().contentFrame();
}

async function uploadLogo(page: Page, fileName: string, buffer: Buffer = PNG_1PX) {
  const logo = page.locator('.panel-section', { has: page.getByRole('heading', { name: 'Logo' }) });
  await logo.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: 'image/png', buffer });
  // The step names the slot's file once the door has stored it.
  await expect(logo.locator('.hint', { hasText: fileName })).toBeVisible();
}

test('end credits: uploading a logo through the Logo field puts it in the end block', async ({ page }) => {
  await createFrom(page, 'Credits', 'Classic Roll');
  await toFields(page);
  // Placeholder first — no logo picked yet.
  await expect(stepPreview(page).locator('.credits-end .credits-logo-slot')).toBeAttached();
  await uploadLogo(page, 'my_logo.png');
  await create(page);
  const logo = (await mounted(page)).locator('.credits-end img.credits-logo');
  await expect(logo).toBeAttached();
  // The composition resolves the relative path to the in-memory data URL.
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
  await toFields(page);

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
  await uploadLogo(page, 'huge_logo.png', flat);
  // An image that already fits the frame is stored byte for byte.
  const small = lowerThirdPng(400, 200);
  await uploadLogo(page, 'small_logo.png', small);
  await create(page);

  const kept = await stored();
  expect(kept?.chars).toBeLessThanOrEqual(`data:image/png;base64,${flat.toString('base64')}`.length);

  const untouched = await page.evaluate(async () => {
    const store = await import('/src/store/templateStore.ts');
    const asset = store.useTemplateStore.getState().template.assets.find((a) => a.path.includes('small_logo'));
    return typeof asset?.data === 'string' ? asset.data.length : 0;
  });
  expect(untouched).toBe(`data:image/png;base64,${small.toString('base64')}`.length);
});

test('corner bug: the logo field replaces the placeholder mark', async ({ page }) => {
  await createFrom(page, 'Bugs & corner logos', 'Glass Mark');
  await toFields(page);
  await expect(stepPreview(page).locator('.corner-bug-mark')).toBeVisible();
  await uploadLogo(page, 'channel_mark.png');
  await create(page);
  const doc = await mounted(page);
  await expect(doc.locator('.corner-bug-media.has-image')).toBeAttached();
  await expect(doc.locator('.corner-bug-mark')).toBeHidden();
  await expect
    .poll(async () => doc.locator('img.corner-bug-logo').evaluate((el) => (el as HTMLImageElement).src.slice(0, 5)))
    .toBe('data:');
});
