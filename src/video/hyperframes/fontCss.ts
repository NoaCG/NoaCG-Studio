// The bundled broadcast fonts as inlinable @font-face CSS for HyperFrames documents.
//
// Parity, not decoration: src/video/videoFonts.ts is the ONE source of the seven faces the
// video world ships, and the Remotion side injects them into both its surfaces (the player
// host inlines them at build time; the render worker imports generated CSS). A HyperFrames
// composition is composed at RUNTIME in the browser, so it fetches the same woff2 files
// from /fonts once and caches the resulting data-URL CSS for the session - after which
// every composed document (preview and render alike) carries the identical @font-face
// block, and what you preview is what renders.
//
// Data URLs are mandatory, not an optimization: the preview iframe is sandboxed WITHOUT
// allow-same-origin, so its opaque origin turns any served font URL into a cross-origin
// request no static host answers - and the render document must work with zero network.
//
// Browser-only (fetches /fonts/*), like render/composeRenderDocument.ts, whose inlining
// pattern this mirrors.

import { videoFontFaceCss, videoLatinExtFile, VIDEO_FONTS } from '../videoFonts';

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Resolved once per session - the bytes never change, and every compose reuses them. */
let cached: Promise<string> | null = null;

/**
 * The @font-face CSS with every bundled face embedded as a data URL. A font that fails to
 * load is DROPPED rather than left pointing at an unreachable URL: the composition then
 * falls back to its declared stack, which is the honest degradation (and only happens in
 * an offline dev edge case).
 */
export function loadHyperframesFontCss(): Promise<string> {
  cached ??= (async () => {
    const urls = new Map<string, string>();
    await Promise.all(
      VIDEO_FONTS.flatMap((f) => [f.file, videoLatinExtFile(f.file)]).map(async (file) => {
        const dataUrl = await fetchAsDataUrl(`/fonts/${file}`);
        if (dataUrl) urls.set(file, dataUrl);
      }),
    );
    // A face ships with both its files (latin, and latin-ext for Š Ž) or not at all.
    const available = VIDEO_FONTS.filter((f) => urls.has(f.file) && urls.has(videoLatinExtFile(f.file)));
    if (available.length === 0) return '';
    return videoFontFaceCss((file) => urls.get(file) ?? '', available);
  })();
  return cached;
}
