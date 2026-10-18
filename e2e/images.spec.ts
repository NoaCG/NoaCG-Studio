// covers: src/components/{fields/**,SampleDataPanel.tsx,ControlPanel.tsx,HostedControlPage.tsx}
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

// Image support: the logo fields on credits / corner bug, and the import door that shrinks an
// oversized picture. (The Data panel's add-field row went with the old editor; the export
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

/** Upload a png through the image field's own door (by field label): the same two writes the
 *  live field row makes (components/fields/SpxFieldRow.tsx), the asset shrunk at the door by
 *  importImageFile and the field's value set to the asset's path. */
async function uploadImage(page: Page, fieldLabel: string, fileName: string, buffer: Buffer = PNG_1PX) {
  await page.evaluate(
    async ([label, name, base64]) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { importImageFile } = await import('/src/assets/imageImport.ts');
      const { uniqueAssetPath } = await import('/src/assets/assetUtils.ts');
      const s = useTemplateStore.getState();
      const field = s.template.fields.find((f) => f.title === label);
      if (!field) throw new Error(`no field titled ${label}`);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const file = new File([bytes], name, { type: 'image/png' });
      const path = uniqueAssetPath(file.name, s.template.assets);
      s.addAsset({ path, data: (await importImageFile(file)).data });
      useTemplateStore.getState().setSampleValue(field.field, path);
    },
    [fieldLabel, fileName, buffer.toString('base64')] as const,
  );
}

test('end credits: uploading a logo through the Logo field puts it in the end block', async ({ page }) => {
  await createFrom(page, 'Credits', 'Classic Roll');
  await create(page);
  // Placeholder first — no logo picked yet.
  await expect((await mounted(page)).locator('.credits-end .credits-logo-slot')).toBeAttached();
  await uploadImage(page, 'Logo', 'my_logo.png');
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
  await createFrom(page, 'Bugs & corner logos', 'Glass Mark');
  await create(page);
  await expect((await mounted(page)).locator('.corner-bug-mark')).toBeVisible();
  await uploadImage(page, 'Logo', 'channel_mark.png');
  const doc = await mounted(page);
  await expect(doc.locator('.corner-bug-media.has-image')).toBeAttached();
  await expect(doc.locator('.corner-bug-mark')).toBeHidden();
  await expect
    .poll(async () => doc.locator('img.corner-bug-logo').evaluate((el) => (el as HTMLImageElement).src.slice(0, 5)))
    .toBe('data:');
});
