// WHAT COUNTS AS A PAINTED SURFACE - one answer for every instrument that asks (#893).
//
// The ticker check looks for the band, the device check for the box a line sits in, the spacing
// check for a panel's padding, and the runtime bench for the panel behind a line of text. Each
// used to decide "painted" on its own, and they drifted: two counted a frosted glass panel and two
// did not, three cut a faint fill at 15% alpha and one at 5%. A glass lower third was a panel to
// one check and bare video to the next. They share this predicate now, as `paints` in
// ai/spike/brand.ts is shared for "visible".

/** A flat fill at or under this alpha is a tint, not a surface: over footage the viewer does not
 *  see a 10% wash as a box. Glass is the exception, counted by its backdrop blur instead. */
const SURFACE_MIN_ALPHA = 0.15;

/** The alpha of a computed colour: `rgba(r, g, b, a)`, the slash form of the newer colour
 *  functions (`none` there is 0), and 1 for a colour that states no alpha. */
function alphaOf(color: string): number {
  if (color === 'transparent') return 0;
  const legacy = /^rgba\([^,]*,[^,]*,[^,]*,\s*([\d.]+)\s*\)$/.exec(color);
  if (legacy) return Number(legacy[1]);
  const slash = /\/\s*([\d.]+%?|none)\s*\)$/.exec(color);
  if (slash) return slash[1] === 'none' ? 0 : parseFloat(slash[1]) / (slash[1].endsWith('%') ? 100 : 1);
  return 1;
}

/** A backdrop filter that does something: `blur(0px)`, which a panel-blur slider at zero
 *  leaves behind, frosts nothing. */
function frosts(filter: string): boolean {
  return Boolean(filter) && filter !== 'none' && !/^blur\(0(px)?\)$/.test(filter);
}

/** Whether this computed style paints a surface: a gradient or image, a frosted glass panel
 *  (a backdrop blur reads as the panel however faint its tint), or a fill above
 *  `SURFACE_MIN_ALPHA`. Visibility and opacity are the caller's question. */
export function paintsSurface(style: CSSStyleDeclaration): boolean {
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;
  if (frosts(style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'))) return true;
  const bg = style.backgroundColor;
  return Boolean(bg) && alphaOf(bg) > SURFACE_MIN_ALPHA;
}
