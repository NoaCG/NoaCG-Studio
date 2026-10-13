// THE FONT CSS of an imported SVG: every family the artwork names, as the `@font-face` block the
// template ships - a bundled face (under the artwork's own name where the two differ), an
// embedded one, or a comment naming what playout must supply. Pure text from the import's font
// matches, tested in Node (scripts/svg-font-css.test.mjs).

import { customFontFaceCss, fontFaceCss, FONTS, type BundledFont } from '../../model/fonts';
import type { DesignSvg } from '../../model/wizard';

/**
 * Every @font-face the template ships (plan §4): a bundled face whose family name matches
 * what the SVG references, or a fetched/uploaded face embedded as an asset. An UNRESOLVED
 * family is stated in a comment - never blocked, because the designer may know the playout
 * machine has the face installed; the wizard already warned out loud.
 */
/** A bundled face declared under the name the artwork asks for - same file, second name. The
 *  comment says which face it really is, so the emitted CSS is readable rather than mysterious. */
function aliasFontFaceCss(font: BundledFont, family: string, weight?: number): string {
  // THE NAME IS THE ONLY PLACE ILLUSTRATOR STATES THE WEIGHT. It writes `font-family:
  // 'Archivo-Black'` and no font-weight at all, because in its world that name IS one static
  // file. Ours is a variable file covering 400-900, so declared with its whole range the artwork's
  // weight-less text asks for the default and renders REGULAR - a Black headline arrives thin,
  // with nothing reporting it. Declaring the alias as the ONE weight its name states pins it: a
  // request is clamped into the face's declared range, and a range of one value has one answer.
  const pinned = weight === undefined ? null : Math.min(font.weights[1], Math.max(font.weights[0], weight));
  const weightLine = pinned === null
    ? `  font-weight: ${font.weights[0]} ${font.weights[1]};  /* variable font: covers this weight range */`
    : `  font-weight: ${pinned};            /* the name says this one weight, and the artwork states no other: pin the variable file to it */`;
  return `/* Bundled open-source font (the file ships with the export - no internet at playout).
   Declared as "${family}" because that is the name this artwork's own CSS asks for; the file is ${font.family}. */
@font-face {
  font-family: "${family}";
  src: url("fonts/${font.file}") format("woff2");
${weightLine}
  font-display: swap;          /* show fallback text until the font loads */
}`;
}

export function svgFontCss(svg: DesignSvg): string {
  const blocks: string[] = [];
  const unresolved: string[] = [];
  for (const font of svg.fonts) {
    const bundled = font.fontId ? FONTS.find((f) => f.id === font.fontId) : undefined;
    if (bundled) {
      // A face is declared under the name the ARTWORK asks for. Illustrator writes PostScript
      // names ("Archivo-Bold"), which the import matches to the bundled family they plainly are
      // - but a `@font-face` declared as "Archivo" answers nothing in an SVG whose own CSS says
      // `font-family: Archivo-Bold`, so the alias is the whole point of the match.
      blocks.push(
        bundled.family === font.family ? fontFaceCss(bundled) : aliasFontFaceCss(bundled, font.family, font.weight),
      );
    } else if (font.customFont) blocks.push(customFontFaceCss(font.customFont));
    else unresolved.push(font.family);
  }
  if (unresolved.length > 0) {
    blocks.push(
      `/* UNRESOLVED ${unresolved.length === 1 ? 'FONT' : 'FONTS'}: ${unresolved.join(', ')} - the SVG references ${unresolved.length === 1 ? 'this family' : 'these families'} but no file ships
   with the template, so playout falls back to whatever the machine has installed. If the
   playout machine has the ${unresolved.length === 1 ? 'font' : 'fonts'}, this is fine; otherwise import the file in the Style panel. */`,
    );
  }
  return blocks.join('\n\n');
}
