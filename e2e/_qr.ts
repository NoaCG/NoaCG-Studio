// Read a QR code the way a phone would: from pixels. jsQR (Apache-2.0, a dev dependency) decodes in
// a page of its own, so the page being read can stay offline and unchanged.

import { createRequire } from 'node:module';
import type { Browser, Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const JSQR = require.resolve('jsqr/dist/jsQR.js');

/** A blank page that can decode PNGs. Close it when done. */
export async function qrReader(browser: Browser): Promise<{ read: (png: Buffer) => Promise<string | null>; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.addScriptTag({ path: JSQR });
  return {
    read: (png) =>
      page.evaluate(async (b64) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const jsQR = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
        return jsQR(data, width, height)?.data ?? null;
      }, png.toString('base64')),
    close: () => context.close(),
  };
}
