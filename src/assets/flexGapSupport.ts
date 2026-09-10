// THE FLEX-GAP SHIM'S ONE HOME for everyone who ships it. The script itself is
// src/assets/flexGapShim.js (plain ES5, read as text here); this module owns how it travels:
//
//   - INLINE, as one tag with a fixed id, in every document the studio composes (the preview,
//     the output page, the render) and in every single-file export (CasparCG, H2R, HTML overlay);
//   - as a SIBLING FILE, `js/flex-gap-shim.js` beside `js/gsap.min.js`, in every folder package
//     (SPX, the show and dual packages), referenced by one line in the html - so the html a
//     person reads keeps one reference rather than a 14 KB blob, exactly as GSAP does;
//   - as `lib/flex-gap-shim.js` in the OGraf package, loaded the way its GSAP is.
//
// The id matters: the importer strips the inline tag BY THIS ID on the way back in (like the
// control receiver), so a round trip never carries two copies, and nothing depends on the
// script's size or wording to recognise it.

import flexGapShimSource from './flexGapShim.js?raw';

/** The id on the inline tag - what the importer strips, and what a test can find. */
export const FLEX_GAP_SHIM_ID = 'noacg-flex-gap';

/** The sibling file a folder package carries, next to js/gsap.min.js. */
export const FLEX_GAP_SHIM_FILE = 'js/flex-gap-shim.js';

export { flexGapShimSource };

/** The shim inlined as one script tag, for a document that has no sibling files. */
export function flexGapShimTag(): string {
  return `<script id="${FLEX_GAP_SHIM_ID}">\n${flexGapShimSource}\n</script>`;
}

/** The reference line a folder package's html carries, pointing at the sibling file. */
export function flexGapShimRef(file: string = FLEX_GAP_SHIM_FILE): string {
  return `<script src="${file}"></script>`;
}

/**
 * Make sure a package html references the sibling file - a no-op when the reference is there
 * (a re-exported import keeps it) or when there is no head to put it in. It goes at the END of
 * the head, after the template's own references and after the charset meta, the way every
 * other injected tag is placed; the shim does not need to run first, it fits whatever the page
 * has laid out once the document is ready.
 */
export function ensureFlexGapShimRef(html: string, file: string = FLEX_GAP_SHIM_FILE): string {
  const has = new RegExp(`src=["'](?:\\./)?${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
  if (has.test(html) || !/<\/head>/i.test(html)) return html;
  return html.replace(/<\/head>/i, `  ${flexGapShimRef(file)}\n</head>`);
}
