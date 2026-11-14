import type { Resolution } from './types';

export interface CompositionValues { x: number; y: number; scale: number }
const MARK = '\n\n/* Whole graphic placement; artwork and playback motion remain intact. */\n';
const unsupported = (): never => { throw new Error('The saved graphic placement is not a supported source rule; source is preserved.'); };

/** Values actually emitted into CSS are the values used to derive its fixed output crop. */
export function normalizedComposition(values: CompositionValues): CompositionValues {
  if (!Object.values(values).every(Number.isFinite) || Math.abs(values.x) > 100000 || Math.abs(values.y) > 100000 || values.scale < .01 || values.scale > 100) throw new Error('Graphic position must be within 100000 pixels and scale between 1% and 10000%.');
  const fine = (value: number) => Math.round(value * 1e6) / 1e6;
  return { x: fine(values.x), y: fine(values.y), scale: fine(values.scale) };
}
function cropLine(values: CompositionValues, resolution: Pick<Resolution, 'width' | 'height'>) {
  const { x, y, scale } = values, { width, height } = resolution;
  const inset = [-y / scale, width - (width - x) / scale, height - (height - y) / scale, -x / scale];
  if (![width, height, ...inset].every(Number.isFinite) || width <= 0 || height <= 0) unsupported();
  // Keep Number's round-trip precision: local-space rounding would be magnified by scale.
  return '  clip-path: inset(' + inset.map(value => value + 'px').join(' ') + ');\n';
}
export function compositionPlacementRule(input: CompositionValues, resolution: Pick<Resolution, 'width' | 'height'>): string {
  const values = normalizedComposition(input), { x, y, scale } = values;
  if (x === 0 && y === 0 && scale === 1) return '';
  return MARK + 'body {\n  translate: ' + x + 'px ' + y + 'px;\n  scale: ' + scale + ';\n  transform-origin: 0 0;\n  overflow: visible !important;\n' + cropLine(values, resolution) + '}\n';
}

/** An owner must begin at a complete top-level rule boundary, outside CSS literals. */
function ruleBoundary(css: string): boolean {
  let quote = '', comment = false, braces = 0, parens = 0, brackets = 0, boundary = true;
  for (let index = 0; index < css.length; index++) {
    const char = css[index], next = css[index + 1];
    if (comment) { if (char === '*' && next === '/') { comment = false; index++; } continue; }
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
    if (char === '/' && next === '*') { comment = true; index++; continue; }
    if (char === '\\') { index++; if (!braces) boundary = false; continue; }
    if (char === '"' || char === "'") { quote = char; if (!braces) boundary = false; continue; }
    if (char === '(') { parens++; if (!braces) boundary = false; continue; }
    if (char === ')') { if (--parens < 0) return false; continue; }
    if (char === '[') { brackets++; if (!braces) boundary = false; continue; }
    if (char === ']') { if (--brackets < 0) return false; continue; }
    if (parens || brackets) continue;
    if (char === '{') { braces++; boundary = false; }
    else if (char === '}') { if (--braces < 0) return false; if (!braces) boundary = true; }
    else if (!braces && char === ';') boundary = true;
    else if (!braces && !/\s/.test(char)) boundary = false;
  }
  return !quote && !comment && !braces && !parens && !brackets && boundary;
}

/** Decode source, never a second persisted model. A forged/nested owner is not adopted. */
export function readCompositionPlacement(css: string, resolution: Pick<Resolution, 'width' | 'height'>) {
  if (!ruleBoundary(css)) unsupported();
  const at = css.indexOf(MARK);
  if (at < 0) return { css, values: { x: 0, y: 0, scale: 1 }, owned: null };
  if (css.indexOf(MARK, at + MARK.length) >= 0 || !ruleBoundary(css.slice(0, at))) unsupported();
  const start = at + MARK.length;
  const match = /^body \{\n {2}translate: (\S+)px (\S+)px;\n {2}scale: (\S+);\n[\s\S]*?\n\}\n/.exec(css.slice(start));
  if (!match) unsupported();
  const values = normalizedComposition({ x: Number(match![1]), y: Number(match![2]), scale: Number(match![3]) });
  const block = MARK + match![0];
  if (compositionPlacementRule(values, resolution) !== block) unsupported();
  return { css: css.slice(0, at) + css.slice(start + match![0].length), values, owned: { at, block, crop: cropLine(values, resolution) } };
}

/** Only explicit pasteboard composition removes our exact crop, on its transient CSS copy. */
export function authoringCompositionCss(css: string, resolution: Pick<Resolution, 'width' | 'height'>): string {
  try {
    const { owned } = readCompositionPlacement(css, resolution);
    if (!owned) return css;
    return css.slice(0, owned.at) + owned.block.replace(owned.crop, '') + css.slice(owned.at + owned.block.length);
  } catch { return css; }
}
