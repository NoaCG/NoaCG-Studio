// Import an EXISTING template to edit or convert: a single .html file, or an SPX-style
// zip (index.html + css/ + js/ + images/ + fonts/). The file is split into the editor's
// three panes; the SPX definition (if any) stays in the HTML, exactly like generated
// templates. Foreign templates rarely follow the house contracts — the Style panel and the
// Inspector's motion side degrade gracefully, validation shows what's missing, and the AI
// panel's "Make it playout-ready" is the guided fix path. Converting to SPX / CasparCG / OGraf after
// import is just the normal Export tab.

import JSZip from 'jszip';
import { ensureExternalRefs } from './externalRefs';
import { parseDefinition } from './spxDefinition';
import { sourceHash } from './contentHash';
import {
  DEFAULT_SETTINGS,
  TEMPLATE_TYPE_LABELS,
  type AssetFile,
  type SpxTemplate,
  type TemplateType,
} from './types';
import {
  DEFAULT_GRAPHICS_FORMAT,
  projectFormatForResolution,
  resolutionForSelection,
  type Resolution,
} from './projectFormat';

const ASSET_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported template';
}

export interface AuthoredFormatDetection {
  resolution: Resolution | null;
  fps: number | null;
  certain: boolean;
  messages: string[];
}

/**
 * What a NoaCG-made package says about itself, read off the `v_noacg` vendor block of an OGraf
 * manifest shipped beside the sources (export/noacgPackage.ts - the dual package). Null for
 * a plain .html or a foreign zip. `stale` is true when the package's generated OGraf half was
 * written from OTHER sources than the ones in the zip (somebody edited the html/css/js and did
 * not regenerate) - a hint for the reader, never a refusal: the sources are the truth.
 */
export interface NoacgPackageInfo {
  type: TemplateType | null;
  sourceHash: string | null;
  stale: boolean;
}

export interface ImportedTemplateResult {
  template: SpxTemplate;
  detection: AuthoredFormatDetection;
  /** Present when the zip carried a NoaCG `v_noacg` block (see NoacgPackageInfo). */
  noacg?: NoacgPackageInfo | null;
}

function positiveNumber(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function importedResolution(width: number, height: number): Resolution {
  const preset = projectFormatForResolution({ width, height });
  return preset
    ? { width: preset.width, height: preset.height, label: preset.label }
    : { width, height, label: `Imported (${width}×${height})` };
}

/**
 * Detect format only from explicit metadata or an unambiguous root canvas declaration.
 * Missing timing is not guessed: SPX itself does not define a universal frame-rate field.
 */
export function detectAuthoredFormat(html: string, css = '', js = ''): AuthoredFormatDetection {
  const meta = html.match(
    /<meta\b(?=[^>]*\bname=["']noacg-project-format["'])[^>]*>/i,
  )?.[0];
  const metaContent = meta?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
  if (metaContent) {
    const values = Object.fromEntries(
      metaContent.split(';').map((part) => part.split('=').map((value) => value.trim())),
    );
    const width = positiveNumber(values.width);
    const height = positiveNumber(values.height);
    const fps = positiveNumber(values.fps);
    if (width && height && fps) {
      return {
        resolution: importedResolution(width, height),
        fps,
        certain: true,
        messages: ['Read exact authored width, height, and frame rate from NoaCG project metadata.'],
      };
    }
  }

  const candidates = new Map<string, { width: number; height: number }>();
  const sources = [css, ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])];
  for (const source of sources) {
    for (const match of source.matchAll(/(?:^|})\s*(?:html\s*,\s*body|body\s*,\s*html|html|body|#root)\s*\{([^}]*)\}/gi)) {
      const width = positiveNumber(match[1].match(/\bwidth\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1]);
      const height = positiveNumber(match[1].match(/\bheight\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1]);
      if (width && height) candidates.set(`${width}x${height}`, { width, height });
    }
  }

  const fpsCandidates = new Set<number>();
  for (const source of [html, js]) {
    for (const match of source.matchAll(/\b(?:data-fps\s*=\s*["']|gsap\.ticker\.fps\s*\()\s*(\d+(?:\.\d+)?)/gi)) {
      const fps = positiveNumber(match[1]);
      if (fps) fpsCandidates.add(fps);
    }
  }

  const canvas = candidates.size === 1 ? [...candidates.values()][0] : null;
  const fps = fpsCandidates.size === 1 ? [...fpsCandidates][0] : null;
  const messages: string[] = [];
  if (canvas) messages.push(`Detected a ${canvas.width}×${canvas.height} root canvas.`);
  else if (candidates.size > 1) messages.push('Found conflicting root canvas dimensions.');
  else messages.push('Could not find an unambiguous authored canvas size.');
  if (fps) messages.push(`Detected ${fps} fps timing.`);
  else if (fpsCandidates.size > 1) messages.push('Found conflicting frame-rate declarations.');
  else messages.push('Could not detect the authored frame rate. SPX does not define one universal FPS field.');

  return {
    resolution: canvas ? importedResolution(canvas.width, canvas.height) : null,
    fps,
    certain: Boolean(canvas && fps),
    messages,
  };
}

/** Split a single HTML document into the html/css/js panes. */
export function importHtmlTemplate(
  fileName: string,
  raw: string,
  extra?: { css?: string; js?: string; assets?: AssetFile[]; type?: TemplateType },
): ImportedTemplateResult {
  const styles: string[] = [];
  const scripts: string[] = [];

  // Inline <style> blocks move to the CSS pane.
  let html = raw.replace(/[ \t]*<style\b[^>]*>([\s\S]*?)<\/style>\s*/gi, (_m, body: string) => {
    if (body.trim()) styles.push(body.trim());
    return '';
  });

  // Inline <script> blocks move to the JS pane — except the SPX definition (it belongs in
  // the HTML, like our own templates) and a bundled GSAP (ours is re-added at export/preview).
  html = html.replace(/[ \t]*<script\b([^>]*)>([\s\S]*?)<\/script>\s*/gi, (full: string, attrs: string, body: string) => {
    if (/\bsrc\s*=/i.test(attrs)) return full; // external reference — keep in place
    if (/SPXGCTemplateDefinition/.test(body)) return full;
    // A module script must keep its tag: import/export only parse as a module, so moving
    // the body into the classic JS pane manufactures a syntax error (real SPX packs ship
    // <script type="module"> templates - the HKO lineage in the reference corpus).
    if (/\btype\s*=\s*["']module["']/i.test(attrs)) return full;
    // Our own injected control receiver is re-added at export time — drop it on import so
    // a round-trip stays faithful (same as we drop a bundled GSAP blob below).
    if (/spx-control-receiver/.test(attrs)) return '';
    // The flex-gap shim likewise: every composer and exporter re-adds it, so it is stripped by
    // its id here rather than recognised by its size or wording.
    if (/noacg-flex-gap/.test(attrs)) return '';
    const trimmed = body.trim();
    if (!trimmed) return '';
    if (trimmed.length > 12000 && /gsap|GreenSock/i.test(trimmed.slice(0, 400))) return '';
    scripts.push(trimmed);
    return '';
  });

  // Standard external refs (css/template.css, js/gsap.min.js, js/template.js) so the
  // exported package works — no-ops when they already exist or there is no <head>.
  html = ensureExternalRefs(html);

  const name = (raw.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || baseName(fileName);
  const parsed = parseDefinition(html);
  const detection = detectAuthoredFormat(raw, [extra?.css, ...styles].filter(Boolean).join('\n\n'), [extra?.js, ...scripts].filter(Boolean).join('\n\n'));
  const fallback = resolutionForSelection(DEFAULT_GRAPHICS_FORMAT);

  return {
    template: {
      name,
      // A foreign file carries no NoaCG type, so it lands as the neutral `blank` (which loses
      // nothing at playout - docs/CONTROL_LAYER.md). A NoaCG dual package says its type in the
      // manifest's `v_noacg` block, and importZipTemplate passes it through.
      type: extra?.type ?? 'blank',
      resolution: detection.resolution ?? fallback,
      fps: detection.fps ?? DEFAULT_GRAPHICS_FORMAT.fps,
      html,
      css: [extra?.css, ...styles].filter(Boolean).join('\n\n'),
      js: [extra?.js, ...scripts].filter(Boolean).join('\n\n'),
      fields: parsed?.fields ?? [],
      settings: parsed?.settings ?? { ...DEFAULT_SETTINGS, description: name },
      assets: extra?.assets ?? [],
      layers: [],
    },
    detection,
  };
}

function toDataUrl(mime: string, bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Import an SPX-style zip: locate the html, pull in css/js files and binary assets. */
export async function importZipTemplate(fileName: string, data: ArrayBuffer): Promise<ImportedTemplateResult> {
  const zip = await JSZip.loadAsync(data);
  // Entry names are read with '/' separators whatever the archiver wrote. Windows PowerShell
  // 5.1's Compress-Archive writes BACKSLASHES into zip entry names (a known quirk, fixed in
  // PowerShell 7); Explorer's "Compressed folder", zip, 7-Zip and every exporter here write '/'.
  // A student zipping a graphic package with either has to land the same way - found walking
  // the agent door's package through this door on Windows (2026-08-22). The original name is
  // kept only to read the entry.
  const stored = new Map<string, string>();
  for (const name of Object.keys(zip.files)) stored.set(name.replace(/\\/g, '/'), name);
  const entryOf = (n: string) => zip.file(stored.get(n) ?? n);
  const files = [...stored.keys()].filter((n) => !zip.files[stored.get(n)!].dir);

  // The entry point: prefer an index.html anywhere (shallowest first), else any .html —
  // never a bundled operator page. Our own packages name the template after the graphic
  // (hairline/hairline.html) and ship controlpanel.html beside it, so without the exclusion
  // a round-tripped package could import its control panel as the template.
  const htmls = files
    .filter((n) => n.toLowerCase().endsWith('.html'))
    .filter((n) => !/(^|\/)(show_)?controlpanel\.html$/i.test(n))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  const entry = htmls.find((n) => n.toLowerCase().endsWith('index.html')) ?? htmls[0];
  if (!entry) throw new Error('No .html file found in the zip.');
  const base = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  const inBase = (n: string) => n.startsWith(base) && n !== entry;
  const rel = (n: string) => n.slice(base.length);

  const read = (n: string) => entryOf(n)!.async('string');
  const html = await read(entry);

  // CSS files referenced the standard way (any others are concatenated too).
  const cssFiles = files.filter((n) => inBase(n) && n.toLowerCase().endsWith('.css'));

  // JS is taken in the order the ENTRY page loads it, and only what it actually loads. A
  // vendor pack ships one folder holding several templates plus every library any of them
  // uses, so "concatenate every .js under the folder" merged three sibling designs'
  // animation files into one pane - each declaring the same top-level names, an instant
  // redeclaration SyntaxError - on top of ~1.6 MB of jQuery, lodash, axios and both its
  // minified twin. The corpus sweep measured 9 such templates importing clean as a dropped
  // .html and broken as a zip (docs/SPX_EXAMPLES_CORPUS.md, scripts/spx-corpus-sweep.mjs).
  // The all-files behaviour survives as a FALLBACK for a page that references no local
  // script at all, so a template that wires its code up some other way is not emptied.
  const localJs = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1];
    if (/^(?:https?:)?\/\//i.test(src)) continue; // CDN reference - not in the zip
    localJs.add(`${base}${src.replace(/^\.\//, '')}`.toLowerCase());
  }
  const importableJs = (n: string) =>
    inBase(n) && n.toLowerCase().endsWith('.js') && !/gsap\.min\.js$|spx_interface\.js$/i.test(n);
  const referencedJs = files.filter((n) => importableJs(n) && localJs.has(n.toLowerCase()));
  const jsFiles = referencedJs.length
    ? [...localJs].map((ref) => referencedJs.find((n) => n.toLowerCase() === ref)).filter((n): n is string => Boolean(n))
    : files.filter(importableJs);
  // The packaged stylesheet ships one level down (css/template.css), so the exporter gave
  // its asset refs a ../ hop (export/targets/spxStarter.ts cssForSubfolder). In the editor
  // the css is root-relative — undo the hop so a round-tripped export is byte-identical.
  const cssFromSubfolder = (text: string) =>
    text.replace(/url\(\s*(['"]?)\.\.\/(images|fonts|lottie|assets)\//g, 'url($1$2/');
  const css = cssFromSubfolder((await Promise.all(cssFiles.map(read))).join('\n\n'));
  // An ES module cannot join the classic JS pane. The inline case is handled above (the
  // <script type="module"> tag stays in the HTML); here the module is a FILE, and it lands
  // in the pane as bare `import`/`export`, making the whole template a syntax error. The
  // corpus sweep measured 23 templates that import cleanly as a dropped .html and failed
  // only as a zip for this. Dropping it loses nothing that worked: relative `import` paths
  // cannot survive the flattening into one HTML/CSS/JS document either way. Kept alongside
  // the reference filter above because a page can load a module ENTRY file by tag, which
  // the reference filter would happily keep.
  const isEsModule = (text: string) => /^[ \t]*(?:import|export)[\s{*]/m.test(text);
  const js = (await Promise.all(jsFiles.map(read))).filter((text) => !isEsModule(text)).join('\n\n');

  // Binary assets keep their relative paths (images/…, fonts/…, assets/…).
  const assets: AssetFile[] = [];
  for (const n of files) {
    const ext = n.split('.').pop()?.toLowerCase() ?? '';
    if (inBase(n) && ASSET_MIME[ext]) {
      assets.push({ path: rel(n), data: toDataUrl(ASSET_MIME[ext], await entryOf(n)!.async('uint8array')) });
    }
  }

  // A NoaCG dual package (export/noacgPackage.ts) ships an OGraf manifest beside the sources,
  // and its `v_noacg` block is the ONE place the graphic's TYPE travels - the SPX files have no
  // slot for it. Read it when present; everything else above stays exactly as it was, so a
  // foreign zip (no manifest, or somebody else's manifest with no `v_noacg`) imports as before.
  const noacg = await readNoacgBlock((n) => entryOf(n)?.async('string') ?? null, files, base);

  return {
    ...importHtmlTemplate(fileName.replace(/\.zip$/i, '') || rel(entry), html, {
      css, js, assets, ...(noacg?.type ? { type: noacg.type } : {}),
    }),
    noacg,
  };
}

/** The `v_noacg` block of the shallowest `*.ograf.json` beside the entry page, or null. */
async function readNoacgBlock(
  readText: (name: string) => Promise<string> | null,
  files: string[],
  base: string,
): Promise<NoacgPackageInfo | null> {
  const manifests = files
    .filter((n) => n.startsWith(base) && n.toLowerCase().endsWith('.ograf.json'))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  if (!manifests.length) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse((await readText(manifests[0])) ?? '');
  } catch {
    return null;
  }
  if (!isRecord(manifest) || !isRecord(manifest.v_noacg)) return null;
  const block = manifest.v_noacg;
  const type = typeof block.type === 'string' && block.type in TEMPLATE_TYPE_LABELS ? (block.type as TemplateType) : null;
  const declared = typeof block.sourceHash === 'string' ? block.sourceHash : null;
  // Staleness: hash the source FILES the block points at, exactly as the writer did.
  let stale = false;
  if (declared && isRecord(block.source)) {
    const readSource = async (key: 'html' | 'css' | 'js') => {
      const path = block.source && typeof (block.source as Record<string, unknown>)[key] === 'string'
        ? `${base}${(block.source as Record<string, string>)[key]}`
        : null;
      return path ? ((await readText(path)) ?? '') : '';
    };
    const [h, c, j] = await Promise.all([readSource('html'), readSource('css'), readSource('js')]);
    stale = sourceHash({ html: h, css: c, js: j }) !== declared;
  }
  return { type, sourceHash: declared, stale };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Dispatch a dropped/browsed file to the right importer. */
export async function importTemplateFile(file: File): Promise<ImportedTemplateResult> {
  if (file.name.toLowerCase().endsWith('.zip')) {
    return importZipTemplate(file.name, await file.arrayBuffer());
  }
  return importHtmlTemplate(file.name, await file.text());
}

/** True when a file is a template import (vs an image for the graphics flow). */
export function isTemplateFile(file: File): boolean {
  return /\.(html?|zip)$/i.test(file.name);
}
