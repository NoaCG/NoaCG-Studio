// Derived asset metadata for the Assets panel's info section. The template model stores
// only { path, data } — everything here (dimensions, alpha, aspect, Lottie timing) is
// probed on demand from the data URL and cached, never written into the template.

import type { AssetFile, SpxTemplate } from '../model/types';
import { extOf, isDataUrl, isFontAsset, isImageAsset, isLottieAsset, isVideoAsset, parseDataUrl } from './assetUtils';
import { splitOrganizationHtml } from '../model/editorOrganization';

export interface AssetInfo {
  kind: 'image' | 'lottie' | 'font' | 'video' | 'other';
  /** Mime type from the data URL (empty when unknown). */
  mime: string;
  /** Payload size in bytes (decoded from the base64 length, or the Blob size). */
  bytes: number;
  /** Natural pixel size (images) or the authored composition size (Lottie). */
  width?: number;
  height?: number;
  /** Reduced ratio like "16:9", or a decimal like "1.85:1" for odd sizes. */
  aspect?: string;
  /** true/false from a pixel scan; 'vector' for SVG and Lottie (alpha by nature). */
  hasAlpha?: boolean | 'vector';
  /** Lottie timing (frames = out point - in point). */
  frames?: number;
  fps?: number;
  durationS?: number;
}

/** Real payload bytes of an asset (a data URL's base64 overhead removed). */
export function assetBytes(asset: AssetFile): number {
  if (typeof asset.data !== 'string') return asset.data.size;
  const parsed = parseDataUrl(asset.data);
  if (parsed) return Math.round(parsed.base64.length * 0.75);
  return asset.data.length;
}

/** "16:9" for clean ratios, "1.85:1" otherwise. */
function aspectOf(w: number, h: number): string | undefined {
  if (!w || !h) return undefined;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
  return `${(w / h).toFixed(2)}:1`;
}

/** Decode a base64 data URL to text (UTF-8). Used for Lottie JSON probing. */
function dataUrlToText(dataUrl: string): string | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    const bin = atob(parsed.base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Scan a downscaled render of the image for any non-opaque pixel. */
function probeAlpha(img: HTMLImageElement): boolean {
  const w = Math.max(1, Math.min(64, img.naturalWidth));
  const h = Math.max(1, Math.min(64, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
  return false;
}

function probeImage(asset: AssetFile, base: AssetInfo): Promise<AssetInfo> {
  if (typeof asset.data !== 'string' || !isDataUrl(asset.data)) return Promise.resolve(base);
  const ext = extOf(asset.path);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const info: AssetInfo = {
        ...base,
        width: img.naturalWidth,
        height: img.naturalHeight,
        aspect: aspectOf(img.naturalWidth, img.naturalHeight),
      };
      if (ext === 'svg') info.hasAlpha = 'vector';
      else if (ext === 'jpg' || ext === 'jpeg') info.hasAlpha = false; // JPEG can't carry alpha
      else {
        try {
          info.hasAlpha = probeAlpha(img);
        } catch {
          info.hasAlpha = undefined; // canvas readback failed — leave it unknown
        }
      }
      resolve(info);
    };
    img.onerror = () => resolve(base);
    img.src = asset.data as string;
  });
}

function probeLottie(asset: AssetFile, base: AssetInfo): AssetInfo {
  if (typeof asset.data !== 'string') return base;
  const text = isDataUrl(asset.data) ? dataUrlToText(asset.data) : asset.data;
  if (!text) return base;
  try {
    const data = JSON.parse(text) as { w?: number; h?: number; fr?: number; ip?: number; op?: number };
    const frames = data.op != null && data.ip != null ? Math.round(data.op - data.ip) : undefined;
    return {
      ...base,
      width: typeof data.w === 'number' ? data.w : undefined,
      height: typeof data.h === 'number' ? data.h : undefined,
      aspect: typeof data.w === 'number' && typeof data.h === 'number' ? aspectOf(data.w, data.h) : undefined,
      hasAlpha: 'vector',
      frames,
      fps: typeof data.fr === 'number' ? data.fr : undefined,
      durationS: frames != null && data.fr ? Math.round((frames / data.fr) * 100) / 100 : undefined,
    };
  } catch {
    return base;
  }
}

/** Probe a video's natural size + duration off a detached <video> element's metadata. */
function probeVideo(asset: AssetFile, base: AssetInfo): Promise<AssetInfo> {
  if (typeof asset.data !== 'string' || !isDataUrl(asset.data)) return Promise.resolve(base);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        ...base,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        aspect: video.videoWidth && video.videoHeight ? aspectOf(video.videoWidth, video.videoHeight) : undefined,
        durationS: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : undefined,
      });
    };
    video.onerror = () => resolve(base);
    video.src = asset.data as string;
  });
}

// One probe per asset version. Keyed by path + byte length: data never changes in place
// (a re-upload de-dupes to a new path), and the byte length breaks a same-path collision.
const probeCache = new Map<string, Promise<AssetInfo>>();

/** Probe an asset's metadata (async, cached). Cheap to call repeatedly. */
export function probeAsset(asset: AssetFile): Promise<AssetInfo> {
  const bytes = assetBytes(asset);
  const key = `${asset.path}:${bytes}`;
  const cached = probeCache.get(key);
  if (cached) return cached;

  const mime = typeof asset.data === 'string' ? (parseDataUrl(asset.data)?.mime ?? '') : asset.data.type;
  const kind: AssetInfo['kind'] = isImageAsset(asset.path)
    ? 'image'
    : isLottieAsset(asset.path)
      ? 'lottie'
      : isFontAsset(asset.path)
        ? 'font'
        : isVideoAsset(asset.path)
          ? 'video'
          : 'other';
  const base: AssetInfo = { kind, mime, bytes };

  const result =
    kind === 'image'
      ? probeImage(asset, base)
      : kind === 'video'
        ? probeVideo(asset, base)
        : Promise.resolve(kind === 'lottie' ? probeLottie(asset, base) : base);
  probeCache.set(key, result);
  return result;
}

// ── The BRAND MARK probe ─────────────────────────────────────────────────────────────
//
// What a logo IS, as the thing that has to place it needs to know: its shape bucket, whether it
// brings its own background, and - when it does not - whether its ink is light or dark. Those
// three facts decide whether a given catalog slot can carry it, and all three are free
// (docs/AI_LITE_PLAN.md §7.5). It lives beside probeAsset because it is the same one-image,
// one-canvas read, and reusing that machinery is what keeps them from disagreeing about, say,
// what an SVG's natural size is.
//
// It answers about the mark, never about the picture: one downscaled pass, three scalars out,
// and no pixels leave the caller.

/** Alpha at or above this counts as ink for the luminance mean - a soft edge is not the mark. */
const INK_ALPHA = 128;
/** Below this share of fully-opaque pixels the mark is treated as transparent-backed. A logo
 *  flattened onto a white tile (every JPEG mark) is opaque and DOES bring its own field. */
const OWN_FIELD_OPACITY = 0.98;

export interface MarkProbe {
  /** naturalWidth / naturalHeight. */
  aspect: number;
  backing: 'own-field' | 'transparent';
  /** Alpha-weighted mean relative luminance of the ink, 0-1. Only meaningful when the mark is
   *  transparent-backed; on an own-field mark the "ink" includes its own background. */
  inkLuminance: number;
  /**
   * How far the ink's luminance SPREADS around that mean - the alpha-weighted standard
   * deviation, 0-1. Additive and optional, so nothing that already builds a probe moves.
   *
   * WHY IT EXISTS. A mean alone cannot tell a single-ink KNOCKOUT wordmark from a full-colour
   * logo, and the two want opposite treatment: a monogram in one dark ink genuinely vanishes on
   * a dark surface, while a coloured roundel whose mean happens to land mid-tone reads perfectly
   * well. Measured on the Pro Phase A round (docs/NOACG_PRO_PLAN.md §15.8): the mean flagged
   * three marks, the owner's eye and a rendered A/B agreed with only one of them, and the two
   * false positives were the same coloured roundel. A single ink has a spread near zero
   * whatever its hue; several inks do not.
   *
   * Alpha-WEIGHTED for the same reason the mean is: an anti-aliased edge pixel is a fraction of
   * an ink, and counting it whole would give every mark a spread it does not have.
   */
  inkSpread?: number;
}

/**
 * Probe an already-loaded image ELEMENT, wherever it lives.
 *
 * `probeMark` below answers the same question about an AssetFile the user just dropped;
 * `validation/markLegibility.ts` asks it of the `<img>` a rendered graphic actually painted,
 * because the file is not what a viewer sees - the placed mark is. One reader, so the two can
 * never disagree about what "the ink" or "own-field" means. The element must already be loaded
 * and same-origin (a data URL, which is what composeDocument inlines).
 */
export function probeMarkElement(img: HTMLImageElement): MarkProbe | null {
  if (!img.complete || !img.naturalWidth) return null;
  try {
    return readMark(img);
  } catch {
    return null;
  }
}

function readMark(img: HTMLImageElement): MarkProbe | null {
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  // The same 64px cap probeAlpha uses: a mark's tone and coverage do not need full resolution,
  // and a full-size readback of a large upload is a real pause on a slow machine.
  const w = Math.max(1, Math.min(64, img.naturalWidth));
  const h = Math.max(1, Math.min(64, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  let opaque = 0;
  let inkWeight = 0;
  let inkSum = 0;
  let inkSquareSum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const alpha = px[i + 3];
    if (alpha === 255) opaque += 1;
    if (alpha < INK_ALPHA) continue;
    const channel = (value: number): number => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * channel(px[i]) + 0.7152 * channel(px[i + 1]) + 0.0722 * channel(px[i + 2]);
    const weight = alpha / 255;
    inkSum += lum * weight;
    inkSquareSum += lum * lum * weight;
    inkWeight += weight;
  }
  const total = (px.length / 4) || 1;
  const mean = inkWeight > 0 ? inkSum / inkWeight : 0;
  // E[x²] - E[x]², clamped at zero: the two terms are near-equal for a single-ink mark, where
  // float error can push the difference a hair below it.
  const variance = inkWeight > 0 ? Math.max(0, inkSquareSum / inkWeight - mean * mean) : 0;
  return {
    aspect,
    backing: opaque / total >= OWN_FIELD_OPACITY ? 'own-field' : 'transparent',
    inkLuminance: mean,
    inkSpread: Math.sqrt(variance),
  };
}

const markCache = new Map<string, Promise<MarkProbe | null>>();

/** Probe an uploaded mark (async, cached). Null when it is not a readable image. */
export function probeMark(asset: AssetFile): Promise<MarkProbe | null> {
  if (!isImageAsset(asset.path) || typeof asset.data !== 'string' || !isDataUrl(asset.data)) {
    return Promise.resolve(null);
  }
  const key = `${asset.path}:${assetBytes(asset)}`;
  const cached = markCache.get(key);
  if (cached) return cached;
  const result = new Promise<MarkProbe | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        resolve(readMark(img));
      } catch {
        // A canvas readback can fail (an exotic codec, a hardened browser). Unknown is a
        // legitimate answer here - the caller falls back to sending no descriptor at all,
        // which is exactly the behaviour that shipped before this existed.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = asset.data as string;
  });
  markCache.set(key, result);
  return result;
}

/** How many times the template's code (html + css + js) references the asset's path. */
export function referenceCount(template: SpxTemplate, path: string): number {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  let count = 0;
  for (const code of [splitOrganizationHtml(template.html)[1], template.css, template.js]) {
    count += (code.match(re) ?? []).length;
  }
  return count;
}
