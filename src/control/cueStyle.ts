// TYPE AND COLOUR, FROM RECORD TO AIR (docs/work-specs/playout-adjustments/spec.md, phase 2).
//
// The style half of a cue's adjustment: `:root` variables in the brand vocabulary and the heading
// face by identity (model/adjust.ts), folded cue over graphic key by key (control/cueAdjust.ts
// `effectiveAdjust`) and resolved here into the style an applied appearance carries: the variables
// to set on the document's root, `--font-heading` and the `--font-numeric` it implies included,
// and a declaration for every face they name. Never font bytes: each surface reads a declaration's
// `src` from its own asset road (`facesCss`), the bundled files beside the document, an imported
// face from the production's own copies.
//
// Pure and Node-tested (scripts/cue-adjust.test.mjs).

import { readAdjust, type AdjustPatch, type FontRef } from '../model/adjust.ts';
import { cssPaintsWith } from '../model/cssVars.ts';
import type { AssetFile } from '../model/types.ts';
import {
  FONTS,
  LATIN_EXT_RANGE,
  customFontFaceCss,
  ensureFontFace,
  fontFormatForExt,
  fontStack,
  fontWeights,
  latinExtFile,
  numericFaceFor,
  numericFontStack,
  type BundledFont,
} from '../model/fonts.ts';
import type { AppearanceStyle, EffectiveAdjust, FontDeclaration } from './cueAdjust.ts';

/** An imported face a pool graphic of the production ships: what the Type row offers beside the
 *  bundled faces, and what an `{ family, assetPath }` reference resolves to. */
export interface ImportedFace {
  family: string;
  assetPath: string;
  /** Measured at import (model/fonts.ts `CustomFont.tabularFigures`); absent reads as cannot. */
  tabularFigures?: boolean;
}

/** What a cue's style resolves against: the imported faces the production ships. */
export interface StyleContext {
  imported: readonly ImportedFace[];
}

export const NO_STYLE_CONTEXT: StyleContext = { imported: [] };

/** The style context of a production: every imported face its pool ships. */
export function styleContextFor(pool: readonly { css: string; assets: readonly { path: string }[] }[]): StyleContext {
  return { imported: importedFacesOf(pool) };
}

/** An imported face's bytes by asset path, read from the production's own copies. */
export function assetDataIn(pool: readonly { assets: readonly { path: string; data?: unknown }[] }[]): (src: string) => string | null {
  return (src) => {
    for (const t of pool) {
      const a = t.assets.find((x) => x.path === src);
      if (a && typeof a.data === 'string') return a.data;
    }
    return null;
  };
}

/**
 * EVERY FACE A PACKAGE'S APPEARANCES NAME SHIPS IN IT (the font closure, spec "Capability matrix"):
 * the graphic's default and each of its cues may name a face its own CSS never declares, and a
 * package has no asset road but its own files. So the face goes into the template's CSS, a bundled
 * one through `ensureFontFace` (both files, the export copies or inlines them as it does any
 * `fonts/` reference) and an imported one as its own `@font-face` with its bytes taken from the
 * production's copy of the file. Declared here once, the runtime then only sets the variables.
 */
export function withAppearanceFaces<T extends { css: string; assets: AssetFile[] }>(
  template: T,
  fonts: readonly FontDeclaration[],
  pool: readonly { assets: readonly AssetFile[] }[],
): T {
  let css = template.css;
  let assets = template.assets;
  for (const f of fonts) {
    const bundled = FONTS.find((b) => f.src === `fonts/${b.file}` || f.src === `fonts/${latinExtFile(b)}`);
    if (bundled) {
      css = ensureFontFace(css, bundled, 'A production adjustment sets this graphic in this face, so its files ship with it.');
      continue;
    }
    if (css.includes(f.src)) continue;
    const asset = pool.flatMap((t) => t.assets).find((a) => a.path === f.src);
    if (!asset) continue;
    const ext = f.src.split('.').pop() ?? 'woff2';
    css = `${customFontFaceCss({ family: f.family, format: fontFormatForExt(ext), asset })}\n\n${css}`;
    if (!assets.some((a) => a.path === f.src)) assets = [...assets, asset];
  }
  return css === template.css && assets === template.assets ? template : { ...template, css, assets };
}

/** The colour roles the Colour row offers, in its order. */
export const COLOUR_VARS = ['accent', 'text-color', 'text-dim', 'panel-bg'] as const;

/** The faces a set of templates ships as imported files (their `/* Imported font` blocks whose
 *  file is one of the template's own assets), each once. */
export function importedFacesOf(templates: readonly { css: string; assets: readonly { path: string }[] }[]): ImportedFace[] {
  const out: ImportedFace[] = [];
  for (const t of templates) {
    for (const m of t.css.matchAll(/\/\* Imported font[^*]*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
      const family = /font-family:\s*"([^"]+)"/.exec(m[1])?.[1];
      const assetPath = /url\("?(fonts\/[^")]+)"?\)/.exec(m[1])?.[1];
      if (!family || !assetPath || !t.assets.some((a) => a.path === assetPath)) continue;
      if (!out.some((f) => f.family === family && f.assetPath === assetPath)) out.push({ family, assetPath });
    }
  }
  return out;
}

/** The two declarations of a bundled face under `family`: its latin file, and its latin-ext file
 *  limited to that range (model/fonts.ts `bundledFaceRules`). A static face declares 100-900, so a
 *  heavier request is never a synthesised bold. */
export function bundledDeclarations(face: BundledFont, family = face.family): FontDeclaration[] {
  const weight: [number, number] = face.weights[0] === face.weights[1] ? [100, 900] : [face.weights[0], face.weights[1]];
  return [
    { family, src: `fonts/${face.file}`, weight },
    { family, src: `fonts/${latinExtFile(face)}`, weight, unicodeRange: LATIN_EXT_RANGE },
  ];
}

/** What a face reference resolves to, or null when this build cannot find it (a bundled id it does
 *  not ship, an imported face no pool graphic carries any more). */
export function faceOf(ref: FontRef | 'designed' | undefined, imported: readonly ImportedFace[]): { bundled: BundledFont } | { imported: ImportedFace } | null {
  if (!ref || ref === 'designed') return null;
  if ('fontId' in ref) {
    const bundled = FONTS.find((f) => f.id === ref.fontId);
    return bundled ? { bundled } : null;
  }
  const found = imported.find((f) => f.family === ref.family && f.assetPath === ref.assetPath);
  return found ? { imported: found } : null;
}

/** The `--font-heading` value of a face reference, or null. */
export function headingStackOf(ref: FontRef | 'designed' | undefined, imported: readonly ImportedFace[]): string | null {
  const face = faceOf(ref, imported);
  if (!face) return null;
  return 'bundled' in face ? fontStack(face.bundled) : `"${face.imported.family}", Arial, sans-serif`;
}

/**
 * RESOLVE THE STYLE OF A FOLD: the variables to set and the faces they name, or null when it sets
 * nothing. An empty variable or a 'designed' face sets nothing (it is "as designed" at its scope).
 * The heading weight goes as written, never clamped to the face: it also weights the numbers a
 * sibling face draws (Saira under Oswald reaches 900), and a static or imported face declares
 * every weight, so no value is drawn as a synthesised bold. Collisions, two faces of one family from different files,
 * are refused at the fold: the first declaration wins.
 */
export function resolveStyle(
  eff: Pick<EffectiveAdjust, 'vars' | 'font'>,
  imported: readonly ImportedFace[],
): AppearanceStyle | null {
  const vars: Record<string, string> = {};
  const fonts: FontDeclaration[] = [];
  const declare = (d: FontDeclaration[]) => {
    for (const f of d) {
      const clash = fonts.find((x) => x.family === f.family && (x.unicodeRange ?? '') === (f.unicodeRange ?? ''));
      if (!clash) fonts.push(f);
    }
  };
  for (const [k, v] of Object.entries(eff.vars ?? {})) if (v !== '') vars[k] = v;
  const face = faceOf(eff.font, imported);
  if (face && 'bundled' in face) {
    vars['font-heading'] = fontStack(face.bundled);
    vars['font-numeric'] = numericFontStack(face.bundled);
    declare(bundledDeclarations(face.bundled));
    const sibling = numericFaceFor(face.bundled);
    if (sibling) declare(bundledDeclarations(sibling));
  } else if (face) {
    vars['font-heading'] = `"${face.imported.family}", Arial, sans-serif`;
    vars['font-numeric'] = numericFontStack(face.imported);
    declare([{ family: face.imported.family, src: face.imported.assetPath, weight: [100, 900] }]);
  }
  if (Object.keys(vars).length === 0 && fonts.length === 0) return null;
  return { ...(Object.keys(vars).length > 0 ? { vars } : {}), ...(fonts.length > 0 ? { fonts } : {}) };
}

/**
 * THE ASSET ROAD, ONE STEP: the `@font-face` rules a document needs for an appearance's faces. A
 * bundled file is referenced as `fonts/<file>`, which resolves beside the document on every
 * surface NoaCG serves and in every package (the export copies or inlines what its CSS names); an
 * imported face takes the bytes `assetData` finds for its path (a data URL), and is left out when
 * none can be found, so the document keeps its own face rather than declaring a dead one.
 */
export function facesCss(fonts: readonly FontDeclaration[] | undefined, assetData: (src: string) => string | null = () => null): string {
  const rules: string[] = [];
  const bundled = new Set(FONTS.flatMap((f) => [`fonts/${f.file}`, `fonts/${latinExtFile(f)}`]));
  for (const f of fonts ?? []) {
    const url = bundled.has(f.src) ? f.src : assetData(f.src);
    if (!url) continue;
    const range = f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : '';
    rules.push(`@font-face { font-family: "${f.family}"; src: url("${url}"); font-weight: ${f.weight[0]} ${f.weight[1]}; font-style: ${f.style ?? 'normal'}; font-display: swap;${range} }`);
  }
  return rules.join('\n');
}

/** What a graphic's stylesheet paints with, which decides the rows drawn: the typeface, the heading
 *  weight, and each colour role (model/cssVars.ts `cssPaintsWith`), so a dead control is never
 *  drawn. */
export interface StyleReach {
  family: boolean;
  weight: boolean;
  colours: (typeof COLOUR_VARS)[number][];
}

export function styleReach(css: string): StyleReach {
  return {
    family: cssPaintsWith(css, 'font-heading'),
    weight: cssPaintsWith(css, 'display-weight'),
    colours: COLOUR_VARS.filter((v) => cssPaintsWith(css, v)),
  };
}

export const reachesAny = (r: StyleReach) => r.family || r.weight || r.colours.length > 0;

/**
 * "AS DESIGNED" ON A ROW, as one patch at the scope shown. The graphic's default: the row's members
 * are removed. A cue's exception: where the graphic still sets one, the cue masks it (an empty
 * variable, a 'designed' face), so the cue shows the design while the graphic's other cues keep
 * theirs; where it does not, the cue's own is removed. Either way `keepStyle` is written, which
 * keeps a production look off this scope (phase 3); a reset removes it with the record.
 */
export function asDesignedPatch(row: 'type' | 'colour', scope: 'cue' | 'graphic', graphicRaw: unknown, reach: StyleReach): AdjustPatch {
  const g = readAdjust(graphicRaw);
  const graphicVars = g.status === 'ok' ? (g.record.vars ?? {}) : {};
  const graphicFont = g.status === 'ok' ? g.record.font : undefined;
  const masks = (set: boolean) => (scope === 'cue' && set ? '' : null);
  const vars: Record<string, string | null> = {};
  for (const k of row === 'type' ? ['display-weight'] : reach.colours) vars[k] = masks(!!graphicVars[k]);
  const patch: AdjustPatch = { vars, keepStyle: true };
  if (row === 'type') patch.font = scope === 'cue' && graphicFont !== undefined && graphicFont !== 'designed' ? 'designed' : null;
  return patch;
}

/** The weights the Type row offers for the face in effect: the face's real ones (Regular alone for
 *  a static or an imported face). */
export function weightsFor(heading: string, imported: readonly ImportedFace[]): { value: number; label: string }[] {
  return fontWeights(heading, imported.map((f) => f.family));
}
