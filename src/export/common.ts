// Shared helpers for SPX exporters. Exporters transform the editor template into a packaged
// folder structure WITHOUT changing how the graphic behaves.

import type JSZip from 'jszip';
import gsapSource from '../assets/gsap.min.js?raw';
import lottieSource from '../assets/lottie.min.js?raw';
import flexGapShimSource from '../assets/flexGapShim.js?raw';
import { isFontAsset, parseDataUrl } from '../assets/assetUtils';
import { templateUsesLottie } from '../assets/lottieSupport';
import { fetchBundledFont, referencedFontFiles } from './bundledFonts';
import { FONT_LICENSE_NOTE } from '../model/fonts';
import type { SpxTemplate } from '../model/types';
import type { ControlEntry } from '../model/library';
import { controlChannelName } from '../control/controlModel';
import { controlReceiverScript } from '../control/receiverScript';
import { renderControlPanelHtml } from '../control/controlPanelHtml';
import { hasRealtimeControl, remoteControlConfig } from '../control/realtimeControl';

import { slug } from '../model/slug';

/** Machine-readable authored format for round-trip imports. This metadata does not resize,
 * stretch, or crop the template - it records the canonical SpxTemplate settings in the package. */
export function injectProjectFormatMeta(html: string, template: SpxTemplate): string {
  const tag =
    `<meta name="noacg-project-format" content="width=${template.resolution.width};` +
    `height=${template.resolution.height};fps=${template.fps}" />`;
  const existing = /<meta\b(?=[^>]*\bname=["']noacg-project-format["'])[^>]*>/i;
  if (existing.test(html)) return html.replace(existing, tag);
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `  ${tag}\n</head>`) : `${tag}\n${html}`;
}

export function projectFormatReadme(template: SpxTemplate): string {
  return `${template.resolution.width}×${template.resolution.height} at ${template.fps} fps`;
}

/**
 * Bundle any fonts the template references (url("fonts/<file>.woff2") in its CSS) into the zip.
 * The files live in public/fonts/ (served at /fonts/<file> in dev and production builds), so we
 * fetch them at export time and write them under fonts/ with the same relative path the CSS uses.
 */
export async function addReferencedFonts(zip: JSZip, template: SpxTemplate): Promise<void> {
  const unique = referencedFontFiles(template.css);
  // The licence has to follow the BYTES, not the stylesheet. Keying the whole function off the
  // CSS match alone meant a package could carry a font the regex had not seen — an imported
  // face written by the assets loop — and ship no FONT_LICENSES.md with it.
  const importedFonts = template.assets.filter((a) => isFontAsset(a.path));
  if (unique.length === 0 && importedFonts.length === 0) return;
  // Imported fonts already live in template.assets (written by the assets loop);
  // only the builder-bundled files need fetching from /fonts.
  const assetPaths = new Set(template.assets.map((a) => a.path));
  for (const file of unique) {
    if (assetPaths.has(`fonts/${file}`)) continue;
    const buffer = await fetchBundledFont(file);
    // A missing file leaves the reference dangling, but a FOLDER package can still be repaired
    // by dropping the font in by hand; the single-file inliner throws instead, because nothing
    // can be dropped in beside a one-file export.
    if (buffer) zip.file(`fonts/${file}`, buffer);
  }
  // BESIDE THE BYTES, not at the package root. OFL 1.1 §2 binds the licence to the redistributed
  // font software, so the copy that matters is the one a person finds when they look at the
  // fonts — and a folder that travels on its own (someone lifts fonts/ into another project)
  // takes its licence with it. It is also where tooling looks: the ograf.dev package checker's
  // S-07/A-03 both scan for a `fonts/**/*license*` path and cannot see a root file at all, so a
  // package with a perfectly good root FONT_LICENSES.md read as an unlicensed font drop.
  zip.file('fonts/FONT_LICENSES.md', FONT_LICENSE_NOTE);
}

/** Write the bundled GSAP, fonts, and any template assets into the zip (relative paths). */
export async function addSharedAssets(zip: JSZip, template: SpxTemplate): Promise<void> {
  zip.file('js/gsap.min.js', gsapSource);
  // The Lottie player ships only when the template uses it (its <head> tag references
  // js/lottie.min.js, mirroring the GSAP tag).
  if (templateUsesLottie(template)) zip.file('js/lottie.min.js', lottieSource);
  await addReferencedFonts(zip, template);
  for (const asset of template.assets) {
    if (typeof asset.data === 'string') {
      const parsed = parseDataUrl(asset.data);
      if (parsed) {
        // Decode the base64 data URL back into a real binary file.
        zip.file(asset.path, parsed.base64, { base64: true });
      } else {
        // Plain text asset (e.g. a stylesheet or SVG source).
        zip.file(asset.path, asset.data);
      }
    } else {
      // A Blob.
      zip.file(asset.path, asset.data);
    }
  }
}

/**
 * Append `block` at the end of the document body, or at the end of the string when there is no
 * body close tag to find.
 *
 * THE LAST OCCURRENCE, never the first. Every packager that adds a script this way scans for
 * the same closing tag, so each one lands after the last, and a closing body tag written inside
 * an EARLIER injected block - in its markup or, as happened on 2026-09-04, inside one of its
 * comments - would otherwise capture the next packager's insertion point and swallow whatever it
 * was adding. That put the whole of a template's JS inside a comment in the control receiver and
 * took nine specs red at once, with the only visible symptom `window.update is not a function`.
 * "The end of the body" is the last one by definition, so this is also the honest reading.
 */
export function appendToBody(html: string, block: string): string {
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at === -1 ? html + block : `${html.slice(0, at)}${block}\n${html.slice(at)}`;
}

/**
 * The flex-gap shim as one inline script tag (src/assets/flexGapShim.js). Every HTML a playout
 * engine can load carries it: CasparCG 2.3.x renders on Chromium 71, where flex `gap` is parsed
 * and ignored, and the shim puts the gap back as margins there. On any newer engine it returns
 * at its first line. Inline rather than a sibling file so the template's own HTML - the code the
 * person reads and edits - keeps its plain `gap:` lines and its three script references, and a
 * project saved before the shim existed still exports with it.
 */
export function flexGapShimTag(): string {
  return `<script>/* Flex gap on older playout engines (CasparCG 2.3): see the note inside. */\n${flexGapShimSource}</script>`;
}

/** The exported page with the shim at the top of its head, before the template's own scripts. */
export function injectFlexGapShim(html: string): string {
  const head = /<head[^>]*>/i;
  return head.test(html) ? html.replace(head, (m) => `${m}\n  ${flexGapShimTag()}`) : `${flexGapShimTag()}\n${html}`;
}

/**
 * Inject the control receiver at the end of the body so a standalone control panel on the same
 * machine can drive the graphic live (BroadcastChannel). SPX/CasparCG still call the
 * globals directly; this only adds a listener.
 */
export function injectControlReceiver(html: string, template: SpxTemplate): string {
  return appendToBody(html, controlReceiverScript(template.name, controlChannelName(template.name)));
}

/** The same template with the receiver already in its html - what a SINGLE-FILE target hands to
 *  composeSelfContainedHtml, which then appends the template's own JS after it. */
export function withControlReceiver(template: SpxTemplate): SpxTemplate {
  return { ...template, html: injectControlReceiver(template.html, template) };
}

/** Bundle the generated controlpanel.html next to the graphic. When the graphic has the remote-
 *  control block, the panel also gets the Supabase Realtime send path (same project + topic).
 *  `entries` (resolved from the library by the caller) bake into the panel as a data switcher. */
export function addControlPanel(
  root: JSZip,
  template: SpxTemplate,
  opts?: { inlineAssets?: boolean; entries?: ControlEntry[] },
): void {
  const remote = hasRealtimeControl(template.js) ? remoteControlConfig(template.name) : null;
  root.file('controlpanel.html', renderControlPanelHtml(template, remote, opts));
}

/** A short README explaining how to deploy the package in SPX. */
export function spxReadme(template: SpxTemplate, fileName?: string): string {
  const file = fileName ?? `${slug(template.name)}.html`;
  return `# ${template.name} — SPX template

Generated by NoaCG Studio.

Authored project format: ${projectFormatReadme(template)}. Package playback preserves this
canvas and timing metadata without output scaling or aspect-ratio reflow.

## Install
Extract the zip into your SPX / CasparCG templates folder — it already contains the
project folder, so you get:

    [TemplatesFolder]/${slug(template.name)}/${file}
    [TemplatesFolder]/${slug(template.name)}/images/...

(For SPX that is typically ASSETS/templates/<company>/${slug(template.name)}/.)
Then select the template in an SPX rundown.

## Files
- ${file}  The template (loads css/js below).
- css/template.css  Styles.
- js/template.js    Runtime: play(), stop(), update(data).
- js/gsap.min.js    Bundled GSAP animation library (no internet required).
${templateUsesLottie(template) ? '- js/lottie.min.js  Bundled Lottie player (MIT) — included because this graphic uses a Lottie animation.\n' : ''}${template.assets.length ? '- images/...        Images used by the template (image fields list this folder).\n' : ''}- controlpanel.html An operator page auto-built from the fields (see below).

## Data fields
${template.fields.map((f) => `- ${f.field} (${f.ftype}): ${f.title}`).join('\n') || '- (none)'}

## Operating it live (controlpanel.html)
The panel drives the graphic over a same-origin browser channel, so BOTH pages must be opened
from the same web address (http:// or https://, same host and port) in the same browser — for
example SPX's own template server, or any local web server. Opening the files straight from
disk (file://) does NOT connect them: browsers give every local file its own private origin.
It also cannot reach a graphic loaded inside OBS/vMix/CasparCG — those run their own browser
engine; use the host's own controls there (or an OBS Custom Browser Dock beside a same-origin
graphic). In an SPX rundown you drive the template the usual way and do not need the panel.
${hasRealtimeControl(template.js) ? `
## Remote control (enabled)
This graphic also listens on a Supabase Realtime channel, so controlpanel.html can drive it from
ANOTHER device — not just the same browser. The channel topic is a shared secret baked into both
files; anyone who has it plus the publishable key can control the graphic, so keep it private. The
render host must be allowed to reach wss://*.supabase.co. Delete the marked "REMOTE CONTROL" block
in js/template.js for a pure-offline graphic.
` : ''}
All paths are relative, so the package is plug-and-play.
`;
}
