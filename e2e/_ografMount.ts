// THE TWO WAYS AN EXPORTED NOACG GRAPHIC MOUNTS, for as long as both exist.
//
// Phase 2 of docs/work-specs/ograf-shadow-root/spec.md builds the shadow-root mount behind an
// internal option, `addOgrafPackage(..., { mount: 'shadow' })`, and the OGraf specs run in both
// mounts until the flip makes the shadow root the only one (decision 4). The export dialog has no
// mount, so a shadow run builds the same template in the page through that option (`ografZips`),
// and a light run keeps building it the way it always did.
//
// At the flip, the `for (const mount of OGRAF_MOUNTS)` prefixes, `inMount` and this file go.

import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import type { GraphicUsage } from '../src/export/registry';
import type { OgrafMount } from '../src/export/targets/ograf';

export type { OgrafMount };
export const OGRAF_MOUNTS: readonly OgrafMount[] = ['light', 'shadow'];

/** An export intent as the export dialog labels it. */
export type OgrafUsageLabel = 'Live' | 'Post-production' | 'Both';

/** One mount's package as package-relative files, or why it could not be built. */
export type OgrafFiles = Map<string, Buffer> | string;

declare global {
  /**
   * The template's OGraf package for each of `mounts`, as a base64 zip laid out as the export
   * dialog's download is (`<slug>/...`), or the error that stopped it. Callable on the app's origin.
   */
  function ografZips(
    template: unknown,
    opts?: { usage?: GraphicUsage; mounts?: OgrafMount[] },
  ): Promise<Partial<Record<OgrafMount, { b64: string } | { error: string }>>>;
}

/**
 * Defines `ografZips` in a page. The light package is the target's own build; the shadow one is the
 * same zip with the package written again by the target's own writer, told the mount, which
 * replaces every file the mount changes and keeps the rest (page JS cannot import JSZip by name to
 * start an empty zip). So one target build serves both mounts.
 */
const OGRAF_ZIPS_SCRIPT = `globalThis.ografZips = async (template, { usage = 'live', mounts = ['light'] } = {}) => {
  const { ografTarget, addOgrafPackage } = await import('/src/export/targets/ograf.ts');
  const { slug } = await import('/src/model/slug.ts');
  const fail = (err) => ({ error: String((err && err.message) || err).slice(0, 300) });
  const out = {};
  let zip;
  try {
    zip = await ografTarget.build(template, { graphicUsage: usage });
  } catch (err) {
    for (const mount of mounts) out[mount] = fail(err);
    return out;
  }
  if (mounts.includes('light')) out.light = { b64: await zip.generateAsync({ type: 'base64' }) };
  if (mounts.includes('shadow')) {
    try {
      await addOgrafPackage(zip.folder(slug(template.name)), template, usage, { mount: 'shadow' });
      out.shadow = { b64: await zip.generateAsync({ type: 'base64' }) };
    } catch (err) {
      out.shadow = fail(err);
    }
  }
  return out;
};`;

const installed = new WeakSet<Page>();

/** Define `ografZips` in the page's current document and in every document it opens next. */
export async function installOgrafZips(page: Page): Promise<void> {
  if (!installed.has(page)) {
    installed.add(page);
    await page.addInitScript(OGRAF_ZIPS_SCRIPT);
  }
  await page.evaluate(OGRAF_ZIPS_SCRIPT);
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

/** `template`'s OGraf packages for `mounts`, built in the app page, each as files or an error. */
export async function ografPackages(
  page: Page,
  template: unknown,
  mounts: OgrafMount[],
  usage: GraphicUsage = 'live',
): Promise<Partial<Record<OgrafMount, OgrafFiles>>> {
  await installOgrafZips(page);
  const zips = await page.evaluate(({ template, usage, mounts }) => ografZips(template, { usage, mounts }), { template, usage, mounts });
  const out: Partial<Record<OgrafMount, OgrafFiles>> = {};
  for (const mount of mounts) {
    const zip = zips[mount];
    out[mount] = zip && 'b64' in zip ? await unzip(zip.b64) : `build: ${zip?.error ?? 'nothing built'}`;
  }
  return out;
}

/**
 * The shadow package of the graphic open in the editor, for the intent the export dialog calls
 * `label`: the specs that download through the dialog in the light mount build this one in the
 * page, the dialog having no mount.
 */
export async function shadowOgraf(page: Page, label: OgrafUsageLabel = 'Live'): Promise<JSZip> {
  await installOgrafZips(page);
  const zip = await page.evaluate(async (usage) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return (await ografZips(useTemplateStore.getState().template, { usage, mounts: ['shadow'] })).shadow;
  }, label.toLowerCase() as GraphicUsage);
  if (!zip || !('b64' in zip)) throw new Error(`the shadow package did not build: ${zip?.error}`);
  return JSZip.loadAsync(zip.b64, { base64: true });
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

/**
 * A test's title in `mount`: the light run keeps the title it always had, the shadow run says so.
 * Declared at the spec's own line, so a test's location stays its spec:
 *
 *   for (const mount of OGRAF_MOUNTS) test(inMount('the title', mount), async ({ page }) => {
 */
export function inMount(title: string, mount: OgrafMount): string {
  return mount === 'light' ? title : `${title} [shadow mount]`;
}
