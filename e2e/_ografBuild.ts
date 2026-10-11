// OGRAF PACKAGES BUILT IN THE APP PAGE, by the real exporter from templates the real generators
// made: what the OGraf specs, the parity harness (e2e/_ografParity.ts) and the two renderer walks
// (scripts/ograf-external-walk.mjs, scripts/ograf-spx-walk.mjs) mount. A spec that exports through
// the dialog downloads the same package; these build it without the dialog, from any source.

import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import type { GraphicUsage } from '../src/export/registry';

/** An export intent as the export dialog labels it. */
export type OgrafUsageLabel = 'Live' | 'Post-production' | 'Both';

/** A package as package-relative files, or why it could not be built. */
export type OgrafFiles = Map<string, Buffer> | string;

declare global {
  /**
   * The template's OGraf package as a base64 zip laid out as the export dialog's download is
   * (`<slug>/...`), or the error that stopped it. Callable on the app's origin.
   */
  function ografZip(template: unknown, opts?: { usage?: GraphicUsage }): Promise<{ b64: string } | { error: string }>;
}

/** Defines `ografZip` in a page: the OGraf target's own build. */
const OGRAF_ZIP_SCRIPT = `globalThis.ografZip = async (template, { usage = 'live' } = {}) => {
  const { ografTarget } = await import('/src/export/targets/ograf.ts');
  try {
    const zip = await ografTarget.build(template, { graphicUsage: usage });
    return { b64: await zip.generateAsync({ type: 'base64' }) };
  } catch (err) {
    return { error: String((err && err.message) || err).slice(0, 300) };
  }
};`;

const installed = new WeakSet<Page>();

/** Define `ografZip` in the page's current document and in every document it opens next. */
export async function installOgrafZip(page: Page): Promise<void> {
  if (!installed.has(page)) {
    installed.add(page);
    await page.addInitScript(OGRAF_ZIP_SCRIPT);
  }
  await page.evaluate(OGRAF_ZIP_SCRIPT);
}

/** A base64 zip's files, the enclosing project folder taken off their paths. */
export async function unzip(b64: string): Promise<Map<string, Buffer>> {
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.slice(name.indexOf('/') + 1), await zip.file(name)!.async('nodebuffer'));
  }
  return files;
}

/** `template`'s OGraf package, built in the app page, as base64 zip bytes; throws what stopped it. */
export async function ografZipBase64(page: Page, template: unknown, usage: GraphicUsage = 'live'): Promise<string> {
  await installOgrafZip(page);
  const zip = await page.evaluate(({ template, usage }) => ografZip(template, { usage }), { template, usage });
  if (!('b64' in zip)) throw new Error(zip.error);
  return zip.b64;
}

/** `template`'s OGraf package, built in the app page, as files or the error that stopped it. */
export async function ografFiles(page: Page, template: unknown, usage: GraphicUsage = 'live'): Promise<OgrafFiles> {
  try {
    return await unzip(await ografZipBase64(page, template, usage));
  } catch (err) {
    return `build: ${(err as Error).message}`;
  }
}

/** What a spec builds a graphic from, always through the real generators, in the app page. */
export type GraphicSource =
  /** A catalog design exactly as it ships. */
  | { kind: 'design'; id: string }
  /** An imported SVG design, built the way the import road builds one, its text layers bound as
   *  fields and named as the Finish step names it. */
  | { kind: 'svg'; name: string; source: string }
  /** The Hairline with a probe added to its markup, stylesheet, code and assets; `stretch` appends
   *  the importer's stretch runtime for a `probe` design instead of `js`. */
  | { kind: 'probe'; name: string; html: string; css: string; js?: string; stretch?: boolean; assets?: Array<{ path: string; data: string }> }
  /** The Hairline with a masked Lottie animation placed the way the editor places one. */
  | { kind: 'lottie' };

/** One solid Lottie layer with a mask over its left half. */
const LOTTIE_JSON = JSON.stringify({
  v: '5.7.0', fr: 30, ip: 0, op: 60, w: 512, h: 512, nm: 'burst', ddd: 0, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 1, nm: 'solid', sr: 1,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [256, 256, 0] }, a: { a: 0, k: [256, 256, 0] }, s: { a: 0, k: [100, 100, 100] } },
    hasMask: true,
    masksProperties: [{ inv: false, mode: 'a', pt: { a: 0, k: { i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]], v: [[0, 0], [256, 0], [256, 512], [0, 512]], c: true } }, o: { a: 0, k: 100 }, x: { a: 0, k: 0 }, nm: 'Mask 1' }],
    sw: 512, sh: 512, sc: '#ff0000', ip: 0, op: 60, st: 0,
  }],
});

/** `source`'s template, made in the app page by the real generators and answered as plain data. */
export async function graphicTemplate(page: Page, source: GraphicSource): Promise<unknown> {
  return page.evaluate(async ({ source, lottieJson }) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    if (source.kind === 'design') return variantById(source.id)!.create({} as never);
    if (source.kind === 'svg') {
      const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
      const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
      const svg = importSvgMarkup(source.source);
      const fields = svg.candidates.filter((c) => !c.outsideCanvas).map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: false }));
      const designSvg = { markup: svg.markup, width: svg.width, height: svg.height, fields, images: [], outlines: [], fonts: [] };
      return { ...IMPORTED_SVG.create({ designSvg } as never), name: source.name };
    }
    const base = variantById('lt01')!.create({} as never);
    if (source.kind === 'lottie') {
      const { insertLottieElement } = await import('/src/blocks/lottieInsert.ts');
      const withAsset = { ...base, name: 'Lottie Probe', assets: [...base.assets, { path: 'lottie/burst.json', data: `data:application/json;base64,${btoa(lottieJson)}` }] };
      return insertLottieElement(withAsset as never, { assetPath: 'lottie/burst.json', x: 960, y: 540, naturalW: 512, naturalH: 512 }).template;
    }
    const { stretchRuntimeJs } = await import('/src/templates/importedDesign/stretch.ts');
    const js = source.stretch ? stretchRuntimeJs('probe') : source.js ?? '';
    return {
      ...base,
      name: source.name,
      html: base.html.replace(/<body([^>]*)>/i, (open: string) => open + source.html),
      css: `${base.css}\n${source.css}`,
      js: `${base.js}\n${js}`,
      assets: [...base.assets, ...(source.assets ?? [])],
    };
  }, { source, lottieJson: LOTTIE_JSON });
}
