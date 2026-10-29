// The fonts bundled into the AI VIDEO world - so a generated composition can set real
// broadcast type instead of only the OS system stack (the video world's typography
// ceiling was the reason premium output looked generic). Single source of truth: the SAME
// seven OFL faces the SPX side bundles (model/fonts.ts), re-shaped for video with a genre
// hint the motion skills teach.
//
// The @font-face CSS is built HERE and injected IDENTICALLY into both worlds so what you
// preview is what renders (parity is the whole point):
//   - preview: scripts/build-player-host.mjs inlines these as data-URL @font-face into the
//     player host page at build time (the host iframe has an opaque origin, so a served
//     font URL would be a cross-origin CORS request every static server refuses - the
//     bytes must be embedded, exactly like the host's inlined JS);
//   - render: scripts/gen-video-font-css.mjs emits the same data-URL CSS as a module the
//     render worker imports and injects, behind a delayRender font-load gate.
// This module carries only metadata + the CSS builder (never the base64), so it stays
// cheap to import from the app (the AI contract reads the family list), from the render
// worker, and from the Node build scripts. It is deliberately SELF-CONTAINED (no import of
// model/fonts.ts): the two injectors run under different module resolvers (Node's native
// TS loader, the render worker's webpack), and a self-contained data table resolves
// everywhere with no extension/resolution friction. The files mirror model/fonts.ts (the
// SPX bundle) - the video world curates its own subset here; the build scripts read the
// actual woff2 by these names, so a stale name fails the build loudly rather than silently.

export interface VideoFont {
  /** CSS font-family name a composition uses (e.g. "Bebas Neue"). */
  family: string;
  /** Fallback stack appended after the family. */
  fallback: string;
  /** woff2 file under public/fonts (dev/build) - the data source both injectors read. */
  file: string;
  /** Variable-font weight range the single file covers. */
  weights: [number, number];
  /**
   * MEASURED average glyph advance per character, in em, for uppercase text at the face's
   * heaviest weight - measured in Chromium off the bundled woff2, not estimated. The AI
   * needs this to size hero type: the faces differ by nearly 2x (Archivo 0.74, Bebas Neue
   * 0.38), so one generic "~0.6 per character" guess simultaneously overflows the wide
   * faces and leaves the narrow ones timid and under-scale. Both were observed before this
   * existed - a fixture line clipped at both frame edges, and titles spanning a third of
   * the frame - from the same single wrong constant.
   */
  capAdvance: number;
  /** One-line genre hint the AI reads (which look each face suits). */
  hint: string;
}

export const VIDEO_FONTS: VideoFont[] = [
  {
    family: 'Inter',
    fallback: 'Arial, sans-serif',
    file: 'inter.woff2',
    weights: [400, 800],
    capAdvance: 0.68,
    hint: 'neutral workhorse sans - clean captions, body, UI-style labels',
  },
  {
    family: 'Space Grotesk',
    fallback: 'Arial, sans-serif',
    file: 'space-grotesk.woff2',
    weights: [400, 700],
    capAdvance: 0.61,
    hint: 'modern technical grotesque - the NoaCG display face, tech/product feel',
  },
  {
    family: 'Archivo',
    fallback: 'Arial, sans-serif',
    file: 'archivo.woff2',
    weights: [400, 900],
    capAdvance: 0.74,
    hint: 'sturdy grotesque; heavy weights hit hard - sport, bold confident titles',
  },
  {
    family: 'Oswald',
    fallback: '"Arial Narrow", Arial, sans-serif',
    file: 'oswald.woff2',
    weights: [400, 700],
    capAdvance: 0.52,
    hint: 'condensed uppercase - big names in tight space, sport/news straps',
  },
  {
    family: 'Bebas Neue',
    fallback: '"Arial Narrow", Arial, sans-serif',
    file: 'bebas-neue.woff2',
    weights: [400, 400],
    capAdvance: 0.38,
    hint: 'tall all-caps display - poster impact, hero title cards',
  },
  {
    family: 'Manrope',
    fallback: 'Arial, sans-serif',
    file: 'manrope.woff2',
    weights: [400, 800],
    capAdvance: 0.65,
    hint: 'soft rounded sans - social, streaming, friendly/approachable titles',
  },
  {
    family: 'JetBrains Mono',
    fallback: 'Consolas, "Courier New", monospace',
    file: 'jetbrains-mono.woff2',
    weights: [400, 700],
    capAdvance: 0.60,
    hint: 'monospace - data, timecode, scores, technical small-caps labels',
  },
];

/**
 * All @font-face rules, given a resolver from a woff2 file name to a URL (a data: URL for
 * the embedded injectors, or a served path). font-display: block avoids a fallback flash;
 * with data URLs there is no network, so the block period is negligible, and the render
 * worker additionally gates on document.fonts before capturing any frame.
 *
 * `fonts` narrows the set - the HyperFrames injector (hyperframes/fontCss.ts) fetches the
 * files at runtime and emits rules only for the ones that actually resolved, so a missing
 * file degrades to the composition's own fallback stack instead of a dead url().
 */
export function videoFontFaceCss(
  resolve: (file: string) => string,
  fonts: VideoFont[] = VIDEO_FONTS,
): string {
  return fonts.map((f) => {
    // A static file (Bebas Neue: one weight) declares every weight, as model/fonts.ts
    // `faceWeightLine` does, so a heavier request draws the file as it is, never a synthesised bold.
    const weight = f.weights[0] === f.weights[1] ? '100 900' : `${f.weights[0]} ${f.weights[1]}`;
    const latin = `@font-face {
  font-family: "${f.family}";
  src: url("${resolve(f.file)}") format("woff2");
  font-weight: ${weight};
  font-display: block;
}`;
    // A latin-ext file the resolver could not supply (an empty URL) is left out, not left dead.
    const ext = resolve(videoLatinExtFile(f.file));
    return ext ? `${latin}
@font-face {
  font-family: "${f.family}";
  src: url("${ext}") format("woff2");
  font-weight: ${weight};
  font-display: block;
  unicode-range: ${LATIN_EXT_RANGE};
}` : latin;
  }).join('\n');
}

/**
 * Each file is Google's `latin` subset; Š Ž Ł ő ğ live in its `latin-ext` twin beside it, declared
 * second and limited to this range so a name like "Šimon Žáková" sets in the face. The same
 * range and file name as model/fonts.ts (`LATIN_EXT_RANGE`, `latinExtFile`), copied rather than
 * imported because model/fonts.ts imports `../assets/OFL.txt?raw`, which Node's native loader
 * (scripts/gen-video-font-css.mjs, build-player-host.mjs) cannot resolve. Pinned equal by
 * scripts/font-upgrade.test.mjs.
 */
export const LATIN_EXT_RANGE =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';

/** The latin-ext file beside a face's latin `file` under public/fonts. */
export function videoLatinExtFile(file: string): string {
  return file.replace(/\.woff2$/, '-latin-ext.woff2');
}

/**
 * The bundled families as a list for the AI contract/skills: name, how to use each, and the
 * MEASURED width per character. The width is there because the model cannot see the fonts -
 * without it, it estimates, and a face 23% wider than the estimate (Archivo) overflows the
 * frame while one 37% narrower (Bebas Neue) lands far short of it.
 */
export function videoFontFamiliesDoc(): string {
  return VIDEO_FONTS.map(
    (f) =>
      `  - "${f.family}" (weights ${f.weights[0]}-${f.weights[1]}, ~${f.capAdvance.toFixed(2)} em wide per uppercase character): ${f.hint}`,
  ).join('\n');
}
