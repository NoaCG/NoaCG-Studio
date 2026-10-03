// Deterministic asset transforms for the Assets panel. Pure (template) => template,
// like every block: the caller makes them real (and undoable) via ONE applyTemplate.

import type { SpxTemplate } from '../model/types';
import { splitAssetPath } from '../assets/assetUtils';
import { addLayer, appendCss, insertGraphicHtml } from './edit';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Settle a target path against the existing assets: -1/-2 suffix on collision. */
function dedupePath(want: string, template: SpxTemplate, ignore: string): string {
  const taken = (p: string) => template.assets.some((a) => a.path === p && a.path !== ignore);
  if (!taken(want)) return want;
  const dot = want.lastIndexOf('.');
  const stem = dot >= 0 ? want.slice(0, dot) : want;
  const ext = dot >= 0 ? want.slice(dot) : '';
  let n = 1;
  while (taken(`${stem}-${n}${ext}`)) n++;
  return `${stem}-${n}${ext}`;
}

/**
 * Move/rename an asset: settle a unique new path, then rewrite EVERY reference to the old
 * path across html/css/js with an exact-string replace. That covers <img src>, CSS url(...),
 * the SPX definition's filelist value (the definition lives inside the HTML), and runtime JS
 * references — the same verbatim-path convention the preview's inlineAssetRefs relies on.
 *
 * The exact-string rewrite would false-match a path that strictly prefixes another
 * (images/a.png vs images/a.png.map), but uniqueAssetPath can never mint such a pair:
 * every path ends in its own dot-extension.
 *
 * Returns the transformed template and the settled path (identical input paths are a no-op).
 */
/** Unique element id from an asset's file name: img-<stem>, -2/-3… while taken. */
function uniqueImageId(html: string, assetPath: string): string {
  const { file } = splitAssetPath(assetPath);
  const stem = file.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const base = `img-${stem}`; // never matches /^f\d+$/, so it can't collide with field ids
  let id = base;
  let n = 2;
  while (new RegExp(`\\bid=["']${id}["']`).test(html)) id = `${base}-${n++}`;
  return id;
}

/**
 * Insert a clean, commented, absolutely positioned <img> for an uploaded asset, centred on
 * a canvas point (the Assets panel's drag-to-canvas drop). The element is tagged data-gfx
 * with a unique id, so it registers as a selectable, animatable part automatically.
 * Returns the transformed template and the new element's selector.
 */
export function insertImageElement(
  template: SpxTemplate,
  opts: { assetPath: string; x: number; y: number; naturalW: number; naturalH: number },
): { template: SpxTemplate; selector: string } {
  const { assetPath, x, y } = opts;
  const naturalW = Math.max(1, Math.round(opts.naturalW));
  const naturalH = Math.max(1, Math.round(opts.naturalH));
  const res = template.resolution;
  const { file } = splitAssetPath(assetPath);
  const id = uniqueImageId(template.html, assetPath);

  // Display size: natural, capped at a quarter of the canvas width (floor 48px), keeping
  // the aspect ratio. Deterministic whole-pixel numbers only.
  const width = Math.max(48, Math.min(naturalW, Math.round(res.width / 4)));
  const height = Math.max(1, Math.round((width * naturalH) / naturalW));
  const left = Math.round(Math.min(Math.max(x - width / 2, 0), Math.max(res.width - width, 0)));
  const top = Math.round(Math.min(Math.max(y - height / 2, 0), Math.max(res.height - height, 0)));

  const htmlSnippet = `  <!-- Image: ${file} (placed from the Assets panel — position/size in the CSS rule for #${id}) -->
  <img id="${id}" data-gfx src="${assetPath}" alt="${file.replace(/\.[^.]*$/, '')}" />`;

  const cssBody = `#${id} {
  position: absolute;   /* place freely on the canvas */
  left: ${left}px;         /* distance from the left edge */
  top: ${top}px;          /* distance from the top edge */
  width: ${width}px;        /* display width (natural ${naturalW}px) */
  height: auto;         /* keep the image's aspect ratio */
}`;

  let next: SpxTemplate = {
    ...template,
    html: insertGraphicHtml(template.html, htmlSnippet),
    css: appendCss(template.css, `Image: ${file}`, cssBody),
  };
  next = addLayer(next, {
    id,
    type: 'image',
    label: file,
    styles: { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px` },
  });
  return { template: next, selector: `#${id}` };
}

/** Unique element id from a video asset's file name: vid-<stem>, -2/-3… while taken. */
function uniqueVideoId(html: string, assetPath: string): string {
  const { file } = splitAssetPath(assetPath);
  const stem = file.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
  const base = `vid-${stem}`; // never matches /^f\d+$/, so it can't collide with field ids
  let id = base;
  let n = 2;
  while (new RegExp(`\\bid=["']${id}["']`).test(html)) id = `${base}-${n++}`;
  return id;
}

/**
 * Insert a muted, looping <video> for an uploaded video asset, centred on a canvas point
 * (the Assets panel's drag-to-canvas drop). Muted + playsinline is what lets it autoplay in
 * every playout browser; a .webm with alpha keeps its transparency. Tagged data-gfx with a
 * unique id, so it registers as a selectable, animatable part like any inserted element.
 */
export function insertVideoElement(
  template: SpxTemplate,
  opts: { assetPath: string; x: number; y: number; naturalW: number; naturalH: number },
): { template: SpxTemplate; selector: string } {
  const { assetPath, x, y } = opts;
  const naturalW = Math.max(1, Math.round(opts.naturalW));
  const naturalH = Math.max(1, Math.round(opts.naturalH));
  const res = template.resolution;
  const { file } = splitAssetPath(assetPath);
  const id = uniqueVideoId(template.html, assetPath);

  // Display size: natural, capped at a third of the canvas width (floor 96px), keeping
  // the aspect ratio. Deterministic whole-pixel numbers only.
  const width = Math.max(96, Math.min(naturalW, Math.round(res.width / 3)));
  const height = Math.max(1, Math.round((width * naturalH) / naturalW));
  const left = Math.round(Math.min(Math.max(x - width / 2, 0), Math.max(res.width - width, 0)));
  const top = Math.round(Math.min(Math.max(y - height / 2, 0), Math.max(res.height - height, 0)));

  const htmlSnippet = `  <!-- Video: ${file} (placed from the Assets panel — plays muted on a loop; position/size in the CSS rule for #${id}) -->
  <video id="${id}" data-gfx src="${assetPath}" autoplay muted loop playsinline></video>`;

  const cssBody = `#${id} {
  position: absolute;   /* place freely on the canvas */
  left: ${left}px;         /* distance from the left edge */
  top: ${top}px;          /* distance from the top edge */
  width: ${width}px;        /* display width (natural ${naturalW}px) */
  height: auto;         /* keep the video's aspect ratio */
}`;

  let next: SpxTemplate = {
    ...template,
    html: insertGraphicHtml(template.html, htmlSnippet),
    css: appendCss(template.css, `Video: ${file}`, cssBody),
  };
  next = addLayer(next, {
    id,
    type: 'container',
    label: file,
    styles: { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px` },
  });
  return { template: next, selector: `#${id}` };
}

export function moveAsset(
  template: SpxTemplate,
  fromPath: string,
  toPath: string,
): { template: SpxTemplate; newPath: string } {
  const asset = template.assets.find((a) => a.path === fromPath);
  if (!asset || fromPath === toPath) return { template, newPath: fromPath };
  const newPath = dedupePath(toPath, template, fromPath);

  // ./-prefixed references are covered automatically (the bare path is a substring).
  const re = new RegExp(escapeRe(fromPath), 'g');
  const rewrite = (code: string) => code.replace(re, newPath);

  return {
    template: {
      ...template,
      html: rewrite(template.html),
      css: rewrite(template.css),
      js: rewrite(template.js),
      fields: template.fields.map(field => typeof field.value === 'string' ? { ...field, value: rewrite(field.value) } : field),
      assets: template.assets.map((a) => (a.path === fromPath ? { ...a, path: newPath } : a)),
    },
    newPath,
  };
}
