// Shapes the game-show families draw with `clip-path`, shared so the three graphics of a family
// cut the same corner and the same star (docs/DESIGN_LANGUAGE.md section 8).
//
// Both are emitted into a design's stylesheet as plain CSS values - nothing here ships at runtime.

/**
 * A rectangle with one square step cut out of each corner - the ARCADE family's pixel corner.
 * `px` is the step at the 1080p reference; it follows `--scale` like every other length.
 *
 * A clip-path cuts away any box-shadow, so a design that wants a rim draws TWO clipped layers
 * (the rim colour underneath, the ground inset on top) and takes its glow from a drop-shadow
 * filter, which is applied after the clip and so follows the steps.
 */
export function pixelCorners(px: number): string {
  const s = `calc(${px}px * var(--scale))`;
  const e = `calc(100% - ${px}px * var(--scale))`;
  return `polygon(0 ${s}, ${s} ${s}, ${s} 0, ${e} 0, ${e} ${s}, 100% ${s}, 100% ${e}, ${e} ${e}, ${e} 100%, ${s} 100%, ${s} ${e}, 0 ${e})`;
}

/** A five-point star cut from a square - the SHOWTIME family's accent. */
export const STAR_CLIP = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
