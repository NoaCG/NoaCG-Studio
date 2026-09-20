// Bundled open-source fonts (SIL Open Font License). The files live in public/fonts/ (served at
// /fonts/<file> in dev) and are copied into exported packages under fonts/<file>, so templates are
// fully offline at playout. Generated CSS contains a visible @font-face rule referencing the
// relative path "fonts/<file>" — teachable and 1:1 with the export.

/**
 * The style families. 'noacg' is the house family — the product's own on-air look
 * (dark control-room panels, one amber accent, mono technical labels).
 *
 * 'editorial' and 'cinematic' are the two on-air voices the first four could not cover:
 * - **editorial** — the magazine/newsroom voice. Rules instead of panels, wide-tracked small-caps
 *   kickers, a printed-page hierarchy. Where minimal removes everything, editorial ORGANISES:
 *   a hairline rule and a kicker are structure, not decoration.
 * - **cinematic** — the documentary/title-card voice. No panel edge at all; text sits on a soft
 *   scrim and carries its own shadow, set in light, widely tracked caps. It is the one family
 *   whose display type OPENS UP (positive tracking) instead of tightening.
 *
 * Both are full families: they carry a FAMILY_TOKENS row (model/themeTokens.ts), palettes, font
 * affinities, and wizard filter chips, exactly like the original four.
 *
 * 'sticker', 'showtime' and 'arcade' are the three GAME-SHOW families (2026-09-19). Each ships a
 * quiz board, a two-player score strip and a lower third, so a quiz show can be built in one
 * look, and they are drawn to be as far from each other as from the six above:
 * - **sticker** - the neo-brutal voice. A flat light panel, a thick ink outline and a hard
 *   offset shadow with no blur; rows tilt a fraction of a degree like stuck-on labels.
 * - **showtime** - the theatre marquee. Deep warm pills inside a cream keyline, a row of
 *   bulbs along the edge, and a high-contrast serif for the words.
 * - **arcade** - the cabinet screen. Stair-stepped pixel corners, a neon rim, scanlines, and
 *   a squared technical face with mono labels.
 * One kit resolves into them, the Quiz Show kit (templates/packs.ts): eight graphic types ship a
 * design in each, which is a whole two-player show. Every other pack reaches for types these
 * families do not draw, so the kit picker offers them for that one kit and no other.
 */
export type StyleTag =
  | 'minimal' | 'sport' | 'glass' | 'noacg' | 'editorial' | 'cinematic'
  | 'sticker' | 'showtime' | 'arcade';

export interface BundledFont {
  id: string;
  /** CSS font-family name used in generated code. */
  family: string;
  /** File name under public/fonts/ (dev) and fonts/ (export). */
  file: string;
  /** Variable-font weight range covered by the file, e.g. [400, 800]. */
  weights: [number, number];
  /** Which style tags this font suits (used to order the wizard's font picker). */
  styleTags: StyleTag[];
  /** Fallback stack appended after the family in generated CSS. */
  fallback: string;
  /** Short flavor line shown in the wizard. */
  blurb: string;
  /**
   * Whether this face renders EQUAL-WIDTH digits under `font-variant-numeric: tabular-nums`
   * - either because it carries the `tnum` feature or because its figures are already even.
   *
   * MEASURED, never declared by hand: `node scripts/numerals.mjs --fonts` renders each digit
   * at 200 px and reports the spread. Six of the bundled faces fail it - Oswald, Playfair
   * Display, Libre Franklin, Anton, Big Shoulders, DM Sans - and on those a `tabular-nums`
   * declaration is a silent no-op (DM Sans's digits vary by 41% of the em). That is the whole
   * reason this flag exists rather than a blanket declaration: see `numericFontStack`.
   *
   * Measured ACROSS THE WEIGHT RANGE, and that is not a detail. A variable face can be even at
   * one weight and uneven at another: Oswald's digits are perfectly even at 400 and span 16% of
   * the em at 700. Measuring only the default weight called it tabular while every scoreboard
   * in the catalog - Oswald is the sport family's display face, set at 700 - still jiggled.
   */
  tabularFigures: boolean;
  /**
   * The bundled face this one's LIVE NUMBERS are set in, when its own digits cannot hold a
   * width. Declared only on the six faces that need it (`tabularFigures: false`).
   *
   * Paired by hand rather than derived, because the useful pairing is a judgement a heuristic
   * gets wrong: the nearest match by registry order gives a scoreboard the wrong width, and
   * the nearest by fallback stack gives Oswald a face that only exists at weight 400. Each
   * pairing below shares a style family with its partner and keeps its voice — a serif stays
   * a serif, a condensed sport face stays condensed.
   *
   * A face with no pairing (an imported one) falls back to {@link MONO_STACK}: numbers that
   * cannot jiggle, in a typeface nobody chose. That is the last resort, not the rule — a
   * monospaced code face on a sport slab reads as a terminal, and JetBrains Mono's slashed
   * zero cannot be turned off (measured: no `zero`/`ss19`/`ss20` setting changes the glyph).
   */
  numericFallbackId?: string;
}

/**
 * The monospaced fallback for figures - the same stack the house family uses for its labels.
 * A number set in it can never jiggle, whatever the heading typeface does.
 */
export const MONO_STACK = '"JetBrains Mono", Consolas, "Courier New", monospace';

/** What a caller has to know about a typeface to work out its numbers. */
export interface NumericSource {
  tabularFigures?: boolean;
  numericFallbackId?: string;
}

/**
 * The BUNDLED face a graphic's live numbers must be set in, or null when the heading face can
 * hold a width itself and the numbers simply follow it.
 *
 * A non-null answer means a second `@font-face` has to ship with the graphic, exactly as the
 * house family's label face already does - `templates/shared/base.ts` emits it and the export
 * writers pick it up from the `url("fonts/…")` reference like any other bundled file.
 */
export function numericFaceFor(font: NumericSource): BundledFont | null {
  if (font.tabularFigures) return null;
  if (!font.numericFallbackId) return null;
  return FONTS.find((f) => f.id === font.numericFallbackId) ?? null;
}

/**
 * What `--font-numeric` resolves to for a chosen heading face.
 *
 * A live number must hold its width as it changes (docs/DESIGN_LANGUAGE.md §1). Three answers,
 * in order of how much of the design's voice they keep:
 *
 * 1. **The heading face**, where its own digits are already even. The numbers belong to the
 *    design and nothing is added to the export.
 * 2. **Its paired sibling** (`numericFallbackId`) - a bundled face that shares a style family,
 *    keeps the voice, and can hold a width. Costs one more woff2 in the package.
 * 3. **The mono stack**, only when there is no pairing to reach for - an imported typeface
 *    nobody has measured against a partner. Numbers that cannot jiggle, in a face nobody
 *    chose; a monospaced code face on a sport slab reads as a terminal, so this is the last
 *    resort rather than the rule.
 *
 * Call this EVERYWHERE `--font-heading` is written. A look or a typeface swap applied after
 * creation that updates one without the other silently reverts the numerals.
 */
/**
 * A family name reduced to what it IDENTIFIES — lowercase letters and digits only. Two spellings
 * of one family have to compare equal: a design app writes "JetBrainsMono" where the library says
 * "JetBrains Mono", and no amount of word-splitting can know that "JetBrains" is one word. Use it
 * for LOOKING UP a face, never for declaring one — an `@font-face` still has to carry the exact
 * name the CSS asking for it wrote.
 */
export function fontNameKey(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function numericFontStack(font: NumericSource): string {
  if (font.tabularFigures) return 'var(--font-heading)';
  const face = numericFaceFor(font);
  return face ? fontStack(face) : MONO_STACK;
}

export const FONTS: BundledFont[] = [
  {
    id: 'inter',
    family: 'Inter',
    file: 'inter.woff2',
    weights: [400, 800],
    styleTags: ['minimal', 'glass', 'cinematic'],
    fallback: 'Arial, sans-serif',
    blurb: 'Neutral, crisp UI classic — never wrong.',
    tabularFigures: true,
  },
  {
    id: 'space-grotesk',
    family: 'Space Grotesk',
    file: 'space-grotesk.woff2',
    weights: [400, 700],
    styleTags: ['noacg', 'minimal', 'glass', 'sticker'],
    fallback: 'Arial, sans-serif',
    blurb: 'Modern grotesque with a technical edge — the NoaCG house display face.',
    tabularFigures: true,
  },
  {
    id: 'jetbrains-mono',
    family: 'JetBrains Mono',
    file: 'jetbrains-mono.woff2',
    weights: [400, 700],
    styleTags: ['noacg', 'arcade'],
    fallback: 'Consolas, "Courier New", monospace',
    blurb: 'Technical monospace — labels, data, timecode (the NoaCG house label face).',
    tabularFigures: true,
  },
  {
    id: 'manrope',
    family: 'Manrope',
    file: 'manrope.woff2',
    weights: [400, 800],
    styleTags: ['glass', 'minimal', 'cinematic'],
    fallback: 'Arial, sans-serif',
    blurb: 'Soft, rounded, friendly — social/stream feel.',
    tabularFigures: true,
  },
  {
    id: 'archivo',
    family: 'Archivo',
    file: 'archivo.woff2',
    weights: [400, 900],
    styleTags: ['sport', 'minimal', 'editorial', 'sticker'],
    fallback: 'Arial, sans-serif',
    blurb: 'Sturdy grotesque; heavy weights hit hard.',
    tabularFigures: true,
  },
  {
    id: 'oswald',
    family: 'Oswald',
    file: 'oswald.woff2',
    weights: [400, 700],
    styleTags: ['sport', 'editorial', 'showtime'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'Condensed broadcast workhorse — big names, tight space.',
    tabularFigures: false,
    numericFallbackId: 'saira',  // the sport family's data face — semi-condensed like Oswald, and 400-900 so a heavy scoreline still has a weight to reach
  },
  {
    id: 'bebas-neue',
    family: 'Bebas Neue',
    file: 'bebas-neue.woff2',
    weights: [400, 400],
    styleTags: ['sport', 'cinematic'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'All-caps display impact; pair with a quiet body font.',
    tabularFigures: true,
  },
  // ── The 2026-08 growth set (docs/GOALS_ARCHIVE.md "Student release" step 5): every style family
  // gets at least three strong faces, and the catalog gains its first serifs. All variable
  // latin-subset woff2 from Google Fonts, OFL 1.1 - each copyright line is appended to
  // src/assets/OFL.txt (the licence follows the bytes, src/export/AGENTS.md).
  {
    id: 'playfair-display',
    family: 'Playfair Display',
    file: 'playfair-display.woff2',
    weights: [400, 900],
    styleTags: ['editorial', 'cinematic', 'showtime'],
    fallback: 'Georgia, "Times New Roman", serif',
    blurb: 'Editorial display serif — mastheads, culture, title cards.',
    tabularFigures: false,
    numericFallbackId: 'source-serif-4',  // the editorial serif that can hold a width — a serif design keeps a serif number
  },
  {
    id: 'source-serif-4',
    family: 'Source Serif 4',
    file: 'source-serif-4.woff2',
    weights: [400, 700],
    styleTags: ['editorial'],
    fallback: 'Georgia, "Times New Roman", serif',
    blurb: 'Readable text serif — printed-page warmth for longer lines.',
    tabularFigures: true,
  },
  {
    id: 'ibm-plex-sans',
    family: 'IBM Plex Sans',
    file: 'ibm-plex-sans.woff2',
    weights: [100, 700],
    styleTags: ['minimal', 'editorial'],
    fallback: 'Arial, sans-serif',
    blurb: 'Engineered grotesque — corporate clarity without coldness.',
    tabularFigures: true,
  },
  {
    id: 'libre-franklin',
    family: 'Libre Franklin',
    file: 'libre-franklin.woff2',
    weights: [400, 800],
    styleTags: ['editorial', 'minimal'],
    fallback: 'Arial, sans-serif',
    blurb: 'American newsroom grotesque — headlines with heritage.',
    tabularFigures: false,
    numericFallbackId: 'archivo',  // the same grotesque voice one notch sturdier; shares editorial and minimal
  },
  {
    id: 'sora',
    family: 'Sora',
    file: 'sora.woff2',
    weights: [400, 800],
    styleTags: ['noacg', 'glass'],
    fallback: 'Arial, sans-serif',
    blurb: 'Geometric with a tech pulse — esports and product.',
    tabularFigures: true,
  },
  {
    id: 'outfit',
    family: 'Outfit',
    file: 'outfit.woff2',
    weights: [400, 900],
    styleTags: ['glass', 'minimal'],
    fallback: 'Arial, sans-serif',
    blurb: 'Clean geometric rounds — the modern stream look.',
    tabularFigures: true,
  },
  {
    id: 'anton',
    family: 'Anton',
    file: 'anton.woff2',
    weights: [400, 400],
    styleTags: ['sport', 'cinematic'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'One heavy condensed shout — scorelines and stings.',
    tabularFigures: false,
    numericFallbackId: 'saira',  // Anton exists at one weight only, so its numbers borrow the sport family's data face
  },
  {
    id: 'big-shoulders',
    family: 'Big Shoulders',
    file: 'big-shoulders.woff2',
    weights: [400, 900],
    styleTags: ['cinematic', 'sport'],
    fallback: '"Arial Narrow", Arial, sans-serif',
    blurb: 'Condensed display with attitude — posters and openers.',
    tabularFigures: false,
    numericFallbackId: 'saira',  // condensed display paired with the condensed data face beside it
  },
  {
    id: 'saira',
    family: 'Saira',
    file: 'saira.woff2',
    weights: [400, 900],
    styleTags: ['sport', 'arcade'],
    fallback: 'Arial, sans-serif',
    blurb: 'Semi-condensed technical family — sport data and names.',
    tabularFigures: true,
  },
  {
    id: 'dm-sans',
    family: 'DM Sans',
    file: 'dm-sans.woff2',
    weights: [400, 900],
    styleTags: ['minimal', 'glass'],
    fallback: 'Arial, sans-serif',
    blurb: 'Friendly geometric — quiet, current, versatile.',
    tabularFigures: false,
    numericFallbackId: 'outfit',  // the geometric sibling — shares glass and minimal, and the same round voice
  },
];

export function fontById(id: string): BundledFont {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** The visible @font-face rule generated into template CSS (exports 1:1). */
export function fontFaceCss(font: BundledFont): string {
  return `/* Bundled open-source font (the file ships with the export — no internet at playout). */
@font-face {
  font-family: "${font.family}";
  src: url("fonts/${font.file}") format("woff2");
  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

/** Full font-family value for CSS (family + fallback stack). */
export function fontStack(font: BundledFont): string {
  return `"${font.family}", ${font.fallback}`;
}

/**
 * A design-owned SECOND typeface (e.g. the NoaCG house label mono). Deliberately worded
 * differently from fontFaceCss: the Style panel / looks swap the FIRST "Bundled open-source
 * font" block (the heading face), and this comment keeps a label face out of that match.
 */
export function labelFontFaceCss(font: BundledFont): string {
  return `/* Design-owned label font (bundled OFL file — ships with the export, offline at playout).
   The Style panel's font picker swaps the heading face above; this one belongs to the design. */
@font-face {
  font-family: "${font.family}";
  src: url("fonts/${font.file}") format("woff2");
  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

/**
 * The `@font-face` for a graphic's NUMERIC face — the third kind of bundled face, beside the
 * heading one and a family's design-owned label face.
 *
 * Worded differently from both on purpose: the Style panel swaps the FIRST "Bundled
 * open-source font" block, and neither the label face nor this one may be caught by that
 * match. This one is derived, not chosen — swapping the heading typeface can change it.
 */
export function numericFontFaceCss(font: BundledFont): string {
  return supportingFontFaceCss(
    font,
    `The graphic's own typeface cannot hold a digit's width, so its live numbers are set in
   this one instead. Change --font-numeric below to overrule it.`,
  );
}

/**
 * A SUPPORTING bundled face — one the graphic uses beside its heading typeface, because a
 * variable points at it. `why` says which variable and what for, so the generated CSS explains
 * its own second font file.
 */
export function supportingFontFaceCss(font: BundledFont, why: string): string {
  return `/* Supporting face (bundled OFL file — ships with the export, offline at playout).
   ${why} */
@font-face {
  font-family: "${font.family}";
  src: url("fonts/${font.file}") format("woff2");
  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

/**
 * The bundled face a `font-family` VALUE names, or null for one we did not bundle.
 *
 * Matches the family name inside the stack, so it reads back a value this app wrote
 * (`"Saira", Arial, sans-serif`) as well as one somebody typed by hand.
 */
export function fontByStack(value: string): BundledFont | null {
  const family = (/^\s*"([^"]+)"/.exec(value) ?? /^\s*([^,]+)/.exec(value))?.[1]?.trim();
  if (!family) return null;
  return FONTS.find((f) => f.family === family) ?? null;
}

/**
 * Make sure a stylesheet carries the `@font-face` for a bundled face it now references.
 *
 * THE RULE THIS EXISTS FOR: every path that can point a variable at a typeface has to ship
 * that typeface's bytes. Pointing at one whose file never lands is the dangling-reference
 * failure that degrades SILENTLY — the export carries a `url("fonts/…")` nothing wrote,
 * `font-display: swap` quietly renders the fallback stack, and the graphic only comes up in
 * the wrong typeface at playout, where nobody is watching the CSS. Idempotent: a face already
 * referenced is left alone.
 */
export function ensureFontFace(
  css: string,
  face: BundledFont | null,
  why = 'A style variable points at this face, so its file ships with the graphic.',
): string {
  if (!face || css.includes(`fonts/${face.file}`)) return css;
  return `${supportingFontFaceCss(face, why)}\n\n${css}`;
}

/** The same guarantee for whatever `--font-numeric` resolved to. */
export function ensureNumericFontFace(css: string, font: NumericSource): string {
  return ensureFontFace(css, numericFaceFor(font));
}

// The OFL itself, vendored at src/assets/OFL.txt and imported here so the licence TRAVELS with
// the fonts rather than being linked. OFL §2 requires each redistributed copy of the Font
// Software to CONTAIN the copyright notice and this licence — as a stand-alone text file, a
// human-readable header, or readable metadata. A URL pointing at the licence satisfies none of
// those, and §2 is triggered by redistribution, not by sale, so shipping the product free does
// not retire the obligation.
//
// It lives in src/assets/ and not beside the fonts in public/ because Vite refuses to let
// JavaScript import out of the public directory ("Assets in public directory cannot be imported
// from JavaScript") — it serves such an import today but warns on every request. src/assets is
// where the other bundled-and-inlined sources already live (gsap.min.js, lottie.min.js).
import oflLicenseText from '../assets/OFL.txt?raw';

/** The full OFL 1.1 text plus every bundled font's copyright line. */
export const OFL_TEXT = oflLicenseText;

/** License note written into exported packages that bundle a font, as a stand-alone file
 *  (OFL §2's first permitted form). */
export const FONT_LICENSE_NOTE = `# Font licenses

The fonts under fonts/ that came from this builder's bundled set are licensed under the
SIL Open Font License, Version 1.1. They may be bundled, embedded, redistributed and used
commercially, but not sold on their own. The complete licence and the copyright notice for
every bundled font follow.

Fonts you imported yourself are NOT covered by any of this and are governed by their own
licences — make sure you have the right to embed and distribute them before sharing a
package that contains one.

----------------------------------------------------------------------

${oflLicenseText}`;

/**
 * The same notice as a comment block, for the surfaces that have nowhere to put a separate
 * file: a single-file export is one .html by contract, and an inlined page cannot ship a
 * sibling. OFL §2 names exactly this form — "human-readable headers".
 *
 * `open`/`close` differ per host language: `/* … *\/` inside CSS, `<!-- … -->` in HTML.
 */
export function fontLicenseComment(syntax: 'html' | 'css'): string {
  const body = `Bundled fonts — SIL Open Font License 1.1\n\n${oflLicenseText}`;
  // A comment cannot contain its own terminator. The OFL text has neither sequence, but
  // guarding here means an edit to the licence file can never produce a broken document.
  const safe = body.replace(/--!?>/g, '-- >').replace(/\*\//g, '* /');
  return syntax === 'html' ? `<!--\n${safe}\n-->` : `/*\n${safe}\n*/`;
}

// ── User-imported fonts (embedded in the template + its export) ───────────────

import type { AssetFile } from './types';

export interface CustomFont {
  /** CSS font-family name (derived from the file name, user-editable). */
  family: string;
  /** @font-face format() string: woff2 | woff | truetype | opentype. */
  format: string;
  /** The font file as a data-URL asset at fonts/<file> — ships inside the export. */
  asset: AssetFile;
  /**
   * Whether this face renders equal-width digits — the imported counterpart of
   * `BundledFont.tabularFigures`, measured by `measureTabularFigures` when the file lands.
   *
   * Optional because it is ADDITIVE: a template saved before this existed carries no flag, and
   * an absent flag reads as "unknown". `numericFontStack` treats unknown as "cannot", so an
   * older project's numbers fall back to the mono stack rather than silently jiggling.
   */
  tabularFigures?: boolean;
}

/**
 * Measure whether a loaded font family renders equal-width digits. Browser-side and cheap
 * (ten layout reads on a detached element), so every import surface can afford to ask.
 *
 * The face must already be registered with `document.fonts` — call `registerAppFont` first, or
 * this measures the fallback and reports its figures instead of the imported one's.
 */
export function measureTabularFigures(family: string): boolean {
  try {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // At BOTH weights the catalog sets numbers in. Evenness is weight-dependent on a variable
    // face - Oswald's digits are perfectly even at 400 and span 16% of the em at 700 - so a
    // single-weight probe reports a face as tabular that visibly is not.
    let even = true;
    for (const weight of [400, 700]) {
      el.style.cssText =
        'position:fixed;left:-9999px;top:0;font-size:200px;white-space:pre;' +
        `font-variant-numeric:tabular-nums;font-weight:${weight};font-family:"${family}"`;
      const widths: number[] = [];
      for (let d = 0; d <= 9; d++) {
        el.textContent = String(d);
        widths.push(el.getBoundingClientRect().width);
      }
      // Half a pixel at 200px type is layout rounding, not a visible jiggle.
      if (Math.max(...widths) - Math.min(...widths) > 0.5) even = false;
    }
    el.remove();
    return even;
  } catch {
    // No DOM (a test runner, a server build): unknown, which numericFontStack reads as "cannot".
    return false;
  }
}

/** Map a font file extension to its @font-face format() string. */
export function fontFormatForExt(ext: string): string {
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext.toLowerCase()] ?? 'woff2';
}

/**
 * THE safe relative asset path for an imported font file: `fonts/<sanitized>.<ext>`. The one
 * path builder every import surface uses (wizard Style step, FontPicker upload, Local Font
 * Access embed, the editor's Style panel) - a space or unicode in a filename used to ride
 * verbatim into the asset path and the emitted url(), which three hand-rolled builders
 * agreed on only by luck.
 */
export function fontAssetPath(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base =
    (dot >= 0 ? fileName.slice(0, dot) : fileName).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : 'woff2';
  return `fonts/${base}.${ext}`;
}

/** A readable family name from a font file name ("Neue-Machina_Bold.otf" -> "Neue Machina Bold"). */
export function familyFromFileName(name: string): string {
  const base = name.replace(/\.(woff2|woff|ttf|otf)$/i, '');
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'My Font';
}

/** The visible @font-face rule for an imported font (the file ships with the export). */
export function customFontFaceCss(font: CustomFont): string {
  return `/* Imported font (your file — embedded in the template and its export). */
@font-face {
  font-family: "${font.family}";
  src: url("${font.asset.path}") format("${font.format}");
  font-display: swap;          /* show fallback text until the font loads */
  /* Single file: the browser synthesizes bold/italic. Add more @font-face rules
     with their own files for true weights. */
}`;
}

export function customFontStack(font: CustomFont): string {
  return `"${font.family}", Arial, sans-serif`;
}

/**
 * Make an imported font renderable in the builder UI itself (pickers, live preview host).
 * Best-effort; the template preview works regardless because it inlines the asset.
 */
export function registerAppFont(family: string, dataUrl: string): Promise<void> {
  try {
    const face = new FontFace(family, `url(${dataUrl})`);
    return face
      .load()
      .then((f) => {
        (document as Document & { fonts: FontFaceSet }).fonts.add(f);
      })
      .catch(() => {
        /* non-fatal — UI falls back to the default font */
      });
  } catch {
    return Promise.resolve();
  }
}

/**
 * Register an imported font AND measure its figures in one step - the shape every import
 * surface wants. Awaiting the registration matters: `measureTabularFigures` called before the
 * face is in `document.fonts` measures the FALLBACK and reports its digits as the import's.
 */
export async function registerAndMeasureFont(family: string, dataUrl: string): Promise<boolean> {
  await registerAppFont(family, dataUrl);
  return measureTabularFigures(family);
}
