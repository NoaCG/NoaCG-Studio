// The @font-face blocks of a Google Fonts css2 response, and which one a single-file embed
// carries. Kept apart from googleFonts.ts, which reaches the DOM and the bundled-font helpers,
// so a Node test (scripts/google-fonts-css.test.mjs) can load this file on its own.

/** One `@font-face` block of a Google css2 stylesheet, as far as the embed needs to know it. */
export interface GoogleFontFace {
  /** The subset label Google writes in a comment above each block ('latin', 'cyrillic-ext');
   *  '' when a block has none. */
  subset: string;
  /** The fonts.gstatic.com file the block's `src` names. */
  url: string;
  /** The block's `unicode-range`, or '' when it covers everything. */
  unicodeRange: string;
}

/**
 * The `@font-face` blocks of a css2 response, in the order Google wrote them.
 *
 * Google serves a modern browser one block PER SUBSET, each with its own file and a
 * `unicode-range` that limits it to that alphabet - cyrillic-ext, cyrillic, vietnamese,
 * latin-ext, latin for Montserrat - and lists `latin` LAST, for every family checked (Roboto,
 * Oswald, Bebas Neue, even Noto Sans Devanagari). Pure so a Node test can hold it to that shape.
 */
export function parseGoogleFontCss(css: string): GoogleFontFace[] {
  const faces: GoogleFontFace[] = [];
  const block = /(?:\/\*\s*([^*]*?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  for (const match of css.matchAll(block)) {
    const body = match[2];
    const url = body.match(/url\(['"]?(https:\/\/fonts\.gstatic\.com\/[^)'"\s]+)['"]?\)/)?.[1];
    if (!url) continue;
    faces.push({
      subset: match[1] ?? '',
      url,
      unicodeRange: body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() ?? '',
    });
  }
  return faces;
}

/**
 * The one file a single-file embed carries: the LATIN subset.
 *
 * `CustomFont` holds one asset and emits one `@font-face` with no `unicode-range`, so whichever
 * file is chosen here becomes the family's ONLY glyphs. Until 2026-10-24 this took the first
 * `url()` in the sheet, which is the cyrillic-ext file for Montserrat and Roboto and the
 * latin-ext file for Bebas Neue: a face with no ASCII at all that nevertheless claims the
 * family name, so every letter fell through to Arial in the editor and on air. The latin block
 * covers U+0000-00FF - ASCII and the Western European accents (å ä ö é ü) - which is what
 * broadcast text in this product is set in.
 *
 * Why not a second face for latin-ext (Polish, Czech, Turkish letters): it would need
 * `CustomFont` to carry more than one asset and the @font-face emit, the AI scaffold's asset
 * list and the spec validator to learn about ranges, for letters the bundled seventeen faces do
 * not promise either. A sheet with no latin block - one unlabelled face that covers everything,
 * or labelled blocks for other scripts only - falls back to its first file, so the family still
 * arrives rather than failing.
 */
export function pickGoogleFontFile(faces: GoogleFontFace[]): GoogleFontFace | undefined {
  return faces.find((f) => f.subset === 'latin') ?? faces[0];
}
