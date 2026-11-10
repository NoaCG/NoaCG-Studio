/** Source-owned transform convention for newly created SVG groups and their carriers. */
export const SVG_GROUP_PIVOT_ATTRIBUTE = 'data-noacg-group-pivot';
export const SVG_GROUP_PIVOT_VERSION = 'frame-v1';
export const SVG_GROUP_PIVOT_SELECTOR = `[${SVG_GROUP_PIVOT_ATTRIBUTE}="${SVG_GROUP_PIVOT_VERSION}"]`;

// The literal's existing three decimal places keep up to nine places in artwork
// pixels. The editor and generated runtime convert at the boundary.
export const SVG_GROUP_PIVOT_UNITS = 1_000_000;
export const SVG_GROUP_TRACK_CSS = {
  x: '--noacg-group-x', y: '--noacg-group-y', rotation: '--noacg-group-rotation',
  scale: '--noacg-group-scale', scaleX: '--noacg-group-scale-x', scaleY: '--noacg-group-scale-y',
} as const;

const motion = SVG_GROUP_TRACK_CSS;
export const SVG_GROUP_TRACK_DEFAULTS = {
  [motion.x]: '0', [motion.y]: '0', [motion.rotation]: '0', [motion.scale]: '1',
  [motion.scaleX]: `var(${motion.scale})`, [motion.scaleY]: `var(${motion.scale})`,
} as const;
export const SVG_GROUP_TRANSFORM = `translate(calc(var(--base-x) + var(${motion.x}) * 1px), calc(var(--base-y) + var(${motion.y}) * 1px)) rotate(calc((var(--base-rotation) + var(${motion.rotation})) * 1deg)) scale(calc(var(--base-scale-x) * var(${motion.scaleX})), calc(var(--base-scale-y) * var(${motion.scaleY})))`;

export function svgGroupOrigin(x: number, y: number): string {
  return `calc(var(--base-anchor-x) + ${x}px) calc(var(--base-anchor-y) + ${y}px)`;
}

export function svgGroupTransformCss(origin: string): string {
  const tracks = Object.entries(SVG_GROUP_TRACK_DEFAULTS).map(([property, value]) => `${property}: ${value};`);
  return 'transform-box: view-box; transform-origin: ' + origin + ';\n' +
    '  --base-x: 0px; --base-y: 0px; --base-rotation: 0; --base-scale-x: 1; --base-scale-y: 1;\n' +
    '  ' + tracks.slice(0, 4).join(' ') + '\n  ' + tracks.slice(4).join(' ') + '\n' +
    '  transform: ' + SVG_GROUP_TRANSFORM + ';';
}
