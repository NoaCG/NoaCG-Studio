// Compose the RENDER document — the fully self-contained HTML a renderer rasterizes.
//
// Same philosophy as preview/composeDocument (inline CSS + bundled GSAP + template JS +
// asset data URLs), with the render-specific differences:
//   - the virtual-time runtime (__noacgRender) is injected FIRST, before GSAP, and a detach
//     snippet right after GSAP hands the clock to the runtime (see runtimeScript.ts)
//   - bundled fonts (url("fonts/x.woff2") in the CSS) are fetched from /fonts and inlined
//     as data URLs — the document must render with zero network
//   - the marked LIVE DATA / SHOW CHAT / REMOTE CONTROL polling blocks are stripped (their
//     network is stubbed anyway, but dead code should not run at all)
//   - no parent-postMessage error capture (the runtime collects errors via getErrors())
//   - color-scheme defaults to LIGHT and must match the Remotion host page — mismatched
//     schemes make Chromium paint the iframe opaque and silently kill alpha (the same
//     Chromium behavior the preview works around with 'dark')
//
// Browser-only (fetches /fonts/*); the output travels to the renderer inside the manifest.

import gsapSource from '../assets/gsap.min.js?raw';
import lottieSource from '../assets/lottie.min.js?raw';
import { inlineAssetRefs, isDataUrl } from '../assets/assetUtils';
import { templateUsesLottie } from '../assets/lottieSupport';
import { flexGapShimTag } from '../assets/flexGapSupport';
import { stripLocalAssetTags } from '../preview/composeDocument';
import { stripLiveData } from '../control/liveData';
import { stripChatGraphic } from '../showchat/chatGraphicBlock';
import { stripRealtimeControl } from '../control/realtimeControl';
import { GSAP_DETACH_JS, RENDER_RUNTIME_JS } from './runtimeScript';
import type { SpxTemplate } from '../model/types';

export interface ComposeRenderOptions {
  /** Must match the host page's color scheme (Remotion host sets light). */
  colorScheme?: 'light' | 'dark';
}

/** Bundled-font refs in a stylesheet — the same pattern export/common.ts bundles from. */
export function fontRefsInCss(css: string): string[] {
  const refs = [...css.matchAll(/url\(["']?fonts\/([\w.-]+\.(?:woff2|woff|ttf|otf))["']?\)/gi)].map((m) => m[1]);
  return [...new Set(refs)];
}

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

/** Inline the builder-bundled fonts (served at /fonts) as data URLs. Imported fonts
 *  already live in template.assets and were inlined by inlineAssetRefs. */
async function inlineBundledFonts(css: string): Promise<string> {
  let out = css;
  for (const file of fontRefsInCss(out)) {
    const dataUrl = await fetchAsDataUrl(`/fonts/${file}`);
    if (!dataUrl) continue; // offline dev edge case — fallback fonts still render
    out = out.split(`fonts/${file}`).join(dataUrl); // replaceAll needs ES2021; lib is ES2020
  }
  return out;
}

/** The preview's runtime image shim, unchanged: update() writes relative images/<file>
 *  paths into <img> src at runtime, which cannot resolve inside a srcdoc document — swap
 *  known paths for their data URLs the moment they appear. The swap is a microtask, so it
 *  settles before the host screenshots (the host awaits microtasks + double rAF). */
function assetShimTag(template: SpxTemplate): string {
  const runtimeAssets = Object.fromEntries(
    template.assets.filter((a) => isDataUrl(a.data)).map((a) => [a.path, a.data as string]),
  );
  if (Object.keys(runtimeAssets).length === 0) return '';
  return `<script id="noacg-render-assets">
(function () {
  var MAP = ${JSON.stringify(runtimeAssets)};
  function fix(img) {
    var src = img.getAttribute('src');
    if (!src) return;
    var clean = src.replace(/^\\.\\//, '');
    if (MAP[clean]) img.src = MAP[clean];
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'attributes' && m.target.tagName === 'IMG') fix(m.target);
      if (m.addedNodes) m.addedNodes.forEach(function (n) {
        if (n.tagName === 'IMG') fix(n);
        else if (n.querySelectorAll) n.querySelectorAll('img').forEach(fix);
      });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
})();
</script>\n`;
}

/** Compose the self-contained render document for a template. */
export async function composeRenderDocument(
  template: SpxTemplate,
  opts: ComposeRenderOptions = {},
): Promise<string> {
  const colorScheme = opts.colorScheme ?? 'light';

  // Polling blocks are for live operation, not rendering — remove them whole.
  const js = stripRealtimeControl(stripChatGraphic(stripLiveData(template.js)));

  let html = stripLocalAssetTags(inlineAssetRefs(template.html, template.assets));
  const css = await inlineBundledFonts(inlineAssetRefs(template.css, template.assets));

  const { width, height } = template.resolution;
  const baseStyle = `html, body { width: ${width}px; height: ${height}px; overflow: hidden; margin: 0; background: transparent; }`;

  const headInjection = [
    `<meta name="color-scheme" content="${colorScheme}">`,
    `<script id="noacg-render-runtime">\n${RENDER_RUNTIME_JS}\n</script>`,
    assetShimTag(template),
    // Inert on the render's Chromium; carried so a rendered frame is composed from the same
    // document a playout engine gets.
    flexGapShimTag(),
    `<script id="noacg-gsap">\n${gsapSource}\n</script>`,
    `<script id="noacg-gsap-detach">\n${GSAP_DETACH_JS}\n</script>`,
    // The bundled Lottie player, only when used. Loaded AFTER the runtime, so it captures
    // the virtualized rAF — its playback advances at frame boundaries like everything else;
    // the template's bootstrap decodes the inlined data: URL, never touching the fetch stub.
    ...(templateUsesLottie(template) ? [`<script id="noacg-lottie">\n${lottieSource}\n</script>`] : []),
    `<style id="noacg-base-style">\n${baseStyle}\n</style>`,
    `<style id="noacg-inline-css">\n${css}\n</style>`,
  ].join('\n') + '\n';

  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${headInjection}</head>`);
  else html = headInjection + html;

  const jsTag = `<script id="noacg-template-js">\n${js}\n</script>`;
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${jsTag}\n</body>`);
  else html = html + jsTag;

  return html;
}
