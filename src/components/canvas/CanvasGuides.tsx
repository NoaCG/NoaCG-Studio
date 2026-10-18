interface Props {
  /** On-screen size of the SVG, in CSS pixels. In pasteboard mode this is the whole padded
   *  document (canvas + pad); otherwise it is the canvas itself. */
  width: number;
  height: number;
  /** Show the broadcast safe-area rectangles (title-safe / action-safe). */
  safeAreas: boolean;
  /** Show the rule-of-thirds grid + centre cross. */
  grid: boolean;
  /** The canvas box within the SVG, in the same screen px. Defaults to the full SVG — the
   *  video preview passes nothing and the canvas fills the overlay. A caller that insets the
   *  canvas passes its rect, and the region outside it is dimmed as a pasteboard. */
  canvasRect?: { left: number; top: number; width: number; height: number };
}

// Broadcast safe-area insets (fraction of each edge).
const ACTION_SAFE = 0.035; // ~3.5%
const TITLE_SAFE = 0.05; // ~5%

/**
 * Overlay drawn over the preview's on-screen rect. Always shows the canvas outline so the
 * 16:9 (or chosen aspect) bounds are visible; optionally shows broadcast safe-area rectangles
 * and a rule-of-thirds grid. In pasteboard mode the SVG spans the padded document and the
 * guides are drawn relative to the inset canvas box (`canvasRect`), with the surrounding
 * pasteboard dimmed so the true output bounds read clearly. Sized in screen pixels (not
 * scaled) so the lines stay crisp at any zoom. Purely visual — never part of the exported
 * template. Shared by the SPX preview and the video (Remotion) preview.
 */
export default function CanvasGuides({ width, height, safeAreas, grid, canvasRect }: Props) {
  if (width <= 0 || height <= 0) return null;

  // The canvas box within the SVG. Without a canvasRect the canvas fills the overlay (the
  // pre-pasteboard behaviour, still used by the video preview).
  const cx = canvasRect?.left ?? 0;
  const cy = canvasRect?.top ?? 0;
  const cw = canvasRect?.width ?? width;
  const ch = canvasRect?.height ?? height;
  const inset = canvasRect !== undefined && (cw < width - 0.5 || ch < height - 0.5);

  const ax = cw * ACTION_SAFE;
  const ay = ch * ACTION_SAFE;
  const tx = cw * TITLE_SAFE;
  const ty = ch * TITLE_SAFE;

  return (
    <svg
      className="canvas-guides"
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {/* Pasteboard dim — everything outside the real canvas box (even-odd punches the hole). */}
      {inset && (
        <path
          d={`M0 0H${width}V${height}H0Z M${cx} ${cy}H${cx + cw}V${cy + ch}H${cx}Z`}
          fillRule="evenodd"
          fill="rgba(0,0,0,0.28)"
        />
      )}

      {/* Canvas outline — always visible; marks the true output bounds. */}
      <rect
        data-testid="canvas-bounds"
        x={cx + 0.5}
        y={cy + 0.5}
        width={cw - 1}
        height={ch - 1}
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={1}
      />

      {grid && (
        <g stroke="rgba(255,255,255,0.22)" strokeWidth={1}>
          {/* Rule of thirds */}
          <line x1={cx + cw / 3} y1={cy} x2={cx + cw / 3} y2={cy + ch} />
          <line x1={cx + (cw * 2) / 3} y1={cy} x2={cx + (cw * 2) / 3} y2={cy + ch} />
          <line x1={cx} y1={cy + ch / 3} x2={cx + cw} y2={cy + ch / 3} />
          <line x1={cx} y1={cy + (ch * 2) / 3} x2={cx + cw} y2={cy + (ch * 2) / 3} />
          {/* Center cross */}
          <line x1={cx + cw / 2} y1={cy} x2={cx + cw / 2} y2={cy + ch} stroke="rgba(255,255,255,0.32)" />
          <line x1={cx} y1={cy + ch / 2} x2={cx + cw} y2={cy + ch / 2} stroke="rgba(255,255,255,0.32)" />
        </g>
      )}

      {safeAreas && (
        <g fill="none" strokeWidth={1} strokeDasharray="6 5">
          {/* Action-safe (~93%) */}
          <rect x={cx + ax} y={cy + ay} width={cw - ax * 2} height={ch - ay * 2} stroke="rgba(120,200,255,0.85)" />
          {/* Title-safe (~90%) */}
          <rect x={cx + tx} y={cy + ty} width={cw - tx * 2} height={ch - ty * 2} stroke="rgba(255,210,70,0.9)" />
        </g>
      )}
    </svg>
  );
}
