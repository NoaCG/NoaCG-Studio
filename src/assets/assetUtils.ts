// Asset helpers. Uploaded images/fonts are stored as base64 data URLs in template.assets[]
// (path + data). The preview inlines them; the exporter decodes them back into real files
// with relative paths. This keeps the app fully offline with no backend.
//
// Path convention (matches how SPX / CasparCG projects are laid out on disk):
//   images/<file>   uploaded images — next to the template, exported as YourProject/images/
//   fonts/<file>    imported fonts
//   lottie/<file>   imported Lottie animations (.json)
//   videos/<file>   imported video loops (.webm/.mp4, size-capped)
//   assets/<file>   anything else (legacy uploads keep working)
// The Assets panel may add ONE optional user folder inside a bucket (images/logos/<file>);
// every consumer (preview inlining, export zips, the runtime img shim) keys the full path
// verbatim, so deeper paths flow through unchanged.

import type { AssetFile } from '../model/types';

/** Read a File (from an <input type="file">) into a base64 data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** True if a string looks like a base64 data URL ("data:...;base64,...."). */
export function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:[^;]*;base64,/.test(value);
}

/** Split a base64 data URL into its mime type and raw base64 payload. */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:([^;]*);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];
const FONT_EXT = ['woff', 'woff2', 'ttf', 'otf'];
const VIDEO_EXT = ['webm', 'mp4'];
const AUDIO_EXT = ['wav', 'mp3', 'ogg', 'm4a'];

export function isAudioAsset(path: string): boolean { return AUDIO_EXT.includes(extOf(path)); }

/** Hard per-video size cap: video assets ride the template JSON as data URLs, so a large
 *  file would bloat every save/sync/share of the whole graphic. Matches the video editor's
 *  per-asset budget. */
export const MAX_VIDEO_ASSET_BYTES = 3 * 1024 * 1024;

export function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i + 1).toLowerCase() : '';
}

export function isImageAsset(path: string): boolean {
  return IMAGE_EXT.includes(extOf(path));
}

export function isFontAsset(path: string): boolean {
  return FONT_EXT.includes(extOf(path));
}

/** True for a video asset (.webm — the alpha-capable broadcast choice — or .mp4). */
export function isVideoAsset(path: string): boolean {
  return VIDEO_EXT.includes(extOf(path));
}

/** True for a Lottie animation asset. Imports only accept .json files that pass
 *  looksLikeLottie(), so the extension is a reliable signal afterwards. */
export function isLottieAsset(path: string): boolean {
  return extOf(path) === 'json';
}

/** Import gate for .json files: does the text carry the Lottie signature
 *  (a version string, a layers array, and numeric width/height)? */
export function looksLikeLottie(jsonText: string): boolean {
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    return (
      typeof data === 'object' && data !== null &&
      typeof data.v === 'string' && Array.isArray(data.layers) &&
      typeof data.w === 'number' && typeof data.h === 'number'
    );
  } catch {
    return false;
  }
}

/** Sanitize a user-typed folder name to one safe path segment ('' when nothing survives). */
export function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Split an asset path into its bucket, optional user folder, and file name. */
export function splitAssetPath(path: string): { bucket: string; folder?: string; file: string } {
  const parts = path.split('/');
  if (parts.length >= 3) return { bucket: parts[0], folder: parts[1], file: parts.slice(2).join('/') };
  if (parts.length === 2) return { bucket: parts[0], file: parts[1] };
  return { bucket: '', file: path };
}

/**
 * A safe, unique relative asset path, sorted into images/ | fonts/ | lottie/ | assets/
 * by type. `folder` optionally nests the file one level inside the bucket
 * (images/logos/<file>) — the Assets panel's user folders.
 */
export function uniqueAssetPath(name: string, existing: AssetFile[], folder?: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  const bucket = IMAGE_EXT.includes(ext)
    ? 'images'
    : FONT_EXT.includes(ext)
      ? 'fonts'
      : VIDEO_EXT.includes(ext)
        ? 'videos'
        : AUDIO_EXT.includes(ext)
          ? 'sounds'
          : ext === 'json'
          ? 'lottie'
          : 'assets';
  const sub = folder ? sanitizeFolderName(folder) : '';
  const dir = sub ? `${bucket}/${sub}` : bucket;
  const make = (n: number) => `${dir}/${base}${n ? '-' + n : ''}${ext ? '.' + ext : ''}`;
  let n = 0;
  while (existing.some((a) => a.path === make(n))) n++;
  return make(n);
}

/**
 * Replace references to `assets/<file>` (and `./assets/<file>`) in a code string with the
 * asset's data URL, so the live preview can render uploaded media without a server.
 * Used for both HTML (src/href) and CSS (url(...)).
 */
export function inlineAssetRefs(code: string, assets: AssetFile[]): string {
  let out = code;
  for (const asset of assets) {
    if (!isDataUrl(asset.data)) continue;
    // Match the relative path, optionally prefixed with ./ , inside quotes or url().
    const rel = asset.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(\\.\\/)?${rel}`, 'g');
    out = out.replace(re, asset.data);
  }
  return out;
}
