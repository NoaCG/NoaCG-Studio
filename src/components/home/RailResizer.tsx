import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { loadPrefs, savePrefs } from '../../model/prefs';

/**
 * THE CUE RUNDOWN'S WIDTH IS THE OPERATOR'S (docs/CLIP_PLAYBACK_PLAN.md §6.1, docs/PLAYOUT_DASHBOARD.md
 * §2). A long show wants a wide list and a graphic with twelve fields wants a wide editor, and only
 * the person running that show knows which matters tonight, so the divider between the stage
 * column and the rundown is a handle: dragged, moved with the arrow keys, and double-clicked back
 * to the default.
 *
 * The width is remembered per DEVICE (`prefs.rundownWidth`), never on the production: it is a
 * fact about this screen, and the same production is run from a 1366 laptop and a 1920 monitor.
 * What is stored is what the operator chose; the LIMITS are applied every time it is read, so a
 * width chosen on a wide window comes back when the window is wide again.
 */

/** The narrowest the rundown gets: a one-line row still shows its number, kind, name and slot. */
export const RAIL_MIN = 320;
/** The widest, as a share of the window: the stage column keeps its verbs and two monitors. */
export const RAIL_MAX_SHARE = 0.6;
/** One arrow press, and one with Shift held. */
const KEY_STEP = 20;
const KEY_STEP_BIG = 100;

/**
 * The width with nothing chosen: 23% of the window, and never under 380px - so 380 at the
 * supported floor of 1366 (the fixed column the rundown was until then, and the laptop a class
 * runs on opens exactly as it always did) and about 440 at 1920.
 *
 * NOT the plan's "about 40% at 1920" (docs/CLIP_PLAYBACK_PLAN.md §6.1), by the owner's decision of
 * 2026-09-27: 40% left the 1080p monitors 250px tall, under the 300px he had already ruled too small
 * on 2026-08-21 (pinned in e2e/productions.spec.ts). At 23% they keep 343px, and a wider rundown is
 * one drag away.
 */
export function defaultRailWidth(windowWidth: number): number {
  return Math.round(Math.max(380, 0.23 * windowWidth));
}

/** Any width, held inside the limits for this window. */
export function clampRailWidth(width: number, windowWidth: number): number {
  const max = Math.max(RAIL_MIN, Math.floor(RAIL_MAX_SHARE * windowWidth));
  return Math.round(Math.min(max, Math.max(RAIL_MIN, width)));
}

/** A stored width that is not a finite number is no choice at all: the default applies. */
function storedWidth(): number | null {
  const w = loadPrefs().rundownWidth;
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
}

/**
 * The rundown's width for the body `body`, in CSS pixels, and the three ways to change it. The
 * body's own width is measured rather than read off `window`, so the limits and the default are
 * worked out against exactly the box the grid divides.
 */
export function useRailWidth(body: RefObject<HTMLElement | null>): {
  width: number;
  max: number;
  /** A width while the handle moves, shown at once and stored only by `commit`; null ends it. */
  preview: (width: number | null) => void;
  /** Store a width, or null to go back to the default. */
  commit: (width: number | null) => void;
} {
  const [bodyWidth, setBodyWidth] = useState(() => (typeof window === 'undefined' ? 1366 : window.innerWidth));
  const [stored, setStored] = useState<number | null>(storedWidth);
  const [dragging, setDragging] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    setBodyWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setBodyWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [body]);

  const preview = useCallback((width: number | null) => setDragging(width), []);
  const commit = useCallback(
    (width: number | null) => {
      const next = width === null ? null : clampRailWidth(width, bodyWidth);
      savePrefs({ rundownWidth: next });
      setStored(next);
      setDragging(null);
    },
    [bodyWidth],
  );

  return {
    width: clampRailWidth(dragging ?? stored ?? defaultRailWidth(bodyWidth), bodyWidth),
    max: clampRailWidth(Infinity, bodyWidth),
    preview,
    commit,
  };
}

/**
 * The handle on the divider. It sits over the line between the stage column and the rundown
 * (`right: var(--pd-rail-w)` inside `.pd-body`), so dragging it LEFT widens the rundown, and the
 * arrow keys move it the same way the pointer does.
 */
export default function RailResizer({
  width,
  max,
  preview,
  commit,
}: {
  width: number;
  max: number;
  preview: (width: number | null) => void;
  commit: (width: number | null) => void;
}) {
  /** Where the drag began: the pointer's x and the width it started from. */
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  // A handle that goes away mid-drag (a workspace tab opened, the page left) must not leave the
  // whole app wearing the resize cursor with text selection off.
  useEffect(() => () => document.body.classList.remove('pd-resizing'), []);

  return (
    <div
      className="pd-rail-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-controls="pd-rundown"
      aria-label="Rundown width"
      aria-valuemin={RAIL_MIN}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      title="Drag to resize the rundown. Arrow keys move it too. Double-click for the default width."
      data-testid="rail-resizer"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width, last: width };
        document.body.classList.add('pd-resizing');
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = d.width + (d.x - e.clientX);
        preview(d.last);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        document.body.classList.remove('pd-resizing');
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        // A press with no movement is half of a double-click, not a choice of width: storing it
        // would pin the default's current value and stop it following the window.
        if (d.last !== d.width) commit(d.last);
        else preview(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        document.body.classList.remove('pd-resizing');
        preview(null);
      }}
      onDoubleClick={() => commit(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
        commit(width + (e.key === 'ArrowLeft' ? step : -step));
      }}
    />
  );
}
