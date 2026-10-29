import { randomUUID } from 'node:crypto';
import { FRAME_READY_TYPE } from './protocol.mjs';
import { readFile } from 'node:fs/promises';
import { launchBrowser, newBenchContext, withTimeout } from './dist/browser.mjs';

// Reuse the CLI's no-credential browser and deadline. Package scripts and metadata
// evaluation run only there, with no Node bindings or trusted host origin.
export async function capture(source, operations = []) {
  const viewId = randomUUID();
  const bench = await newBenchContext(await launchBrowser(), 'https://preview.invalid');
  try {
    return await withTimeout((async () => {
      const page = await bench.newPage();
      const runtime = await readFile(new URL('./dist/runtime.js', import.meta.url), 'utf8');
      const script = `<script id="noacg-preview-runtime">${runtime.replace(/<\/script/gi, '<\\/script')}</script>`;
      const document = source.document + script;
      await page.setContent(script);
      const size = await page.evaluate((html) => NoacgPreviewRuntime.authoredSize(html), source.document);
      await page.setViewportSize(size);
      await page.setContent(document, { waitUntil: 'load' });
      const details = await page.evaluate(({ operations, assetUrls }) => NoacgPreviewRuntime.rehearse(operations, assetUrls), { operations, assetUrls: source.assetUrls });
      const image = (await page.screenshot({ type: 'png', omitBackground: true })).toString('base64');
      // The app accepts only a view-bound render acknowledgement from this frame;
      // graphic-origin tool calls and conversation messages are never forwarded.
      const replay = `<script>NoacgPreviewRuntime.rehearse(${JSON.stringify(operations).replaceAll('<', '\\u003c')}, ${JSON.stringify(source.assetUrls ?? {}).replaceAll('<', '\\u003c')}).then(() => parent.postMessage({ type: '${FRAME_READY_TYPE}', viewId: '${viewId}' }, '*'), error => parent.postMessage({ type: '${FRAME_READY_TYPE}', viewId: '${viewId}', error: String(error.message).slice(0, 2000) }, '*'));</script>`;
      if (Buffer.byteLength(document + replay) > 24 * 1024 * 1024) throw new Error('Expanded package document exceeds the trial limit.');
      const { assetUrls, ...identity } = source;
      return { ...identity, document: document + replay, ...details, image, viewId };
    })(), 10000, 'Preview package capture', () => bench.close());
  } finally { await bench.close(); }
}
