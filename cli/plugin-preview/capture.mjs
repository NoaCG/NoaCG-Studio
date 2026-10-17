import { launchBrowser, newBenchContext, withTimeout } from './dist/browser.mjs';

// Reuse the CLI's isolated, no-credential browser and hard deadline. The document's CSP
// refuses every network request as well; it has no host bridge or filesystem capability.
export async function capture(source) {
  const bench = await newBenchContext(await launchBrowser(), 'https://preview.invalid');
  try {
    return await withTimeout((async () => {
      const page = await bench.newPage();
      await page.setViewportSize(source.size);
      await page.setContent(source.document, { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const details = await page.evaluate(() => ({
        targets: [...document.querySelectorAll('[data-preview-target][id]')].map((element) => {
          const b = element.getBoundingClientRect();
          return { id: element.id, label: element.getAttribute('data-preview-target'), bounds: { x: b.x, y: b.y, width: b.width, height: b.height } };
        }),
        sampleValues: Object.fromEntries(['f0', 'f1'].map((key) => [key, document.getElementById(key)?.textContent ?? ''])),
      }));
      const image = (await page.screenshot({ type: 'png', omitBackground: true })).toString('base64');
      return { ...source, ...details, image };
    })(), 10000, 'Preview fixture capture', () => bench.close());
  } finally { await bench.close(); }
}
