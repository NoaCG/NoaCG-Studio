import { useEffect, useMemo, useRef, useState } from 'react';
import { composeDocument } from '../../preview/composeDocument';
import { frameGraphic, framingTransform, type GraphicBox } from '../../preview/frameGraphic';
import { fieldDescriptors } from '../../control/controlModel';
import type { SpxTemplate } from '../../model/types';

/**
 * A Home card's THUMBNAIL: the real graphic, rendered small and parked at its settled on-air
 * state (docs/SAVED_CONTENT_MODEL.md §3).
 *
 * It is a LIVE render, not a stored picture. A thumbnail baked onto the GraphicDoc would be a
 * persisted-format change (with its migration) that also rides every cloud sync as a second
 * copy of the artwork — and it would go stale the moment the template is edited on another
 * device, which is exactly when a preview must be trusted. Rendering from the template instead
 * means the card cannot disagree with the graphic, and costs nothing to store or migrate.
 *
 * The price is re-rendering per Home visit, paid down two ways: the iframe mounts only once the
 * card is actually scrolled into view, and the composed document is memoized per template. Both
 * the composition (preview/composeDocument) and the settle recipe below are the editor's own —
 * there is no second render path.
 */

/**
 * FRAMED ON THE GRAPHIC, not on the canvas: preview/frameGraphic.ts, the same recipe the wizard's
 * picker cards use. At this size the whole-canvas view is not a small preview of a lower third,
 * it is an unreadable smear of one - the band occupies a fraction of a 1920×1080 frame, so the
 * card measures the graphic's own box and frames onto that.
 */

/** Card width in CSS px; the height follows the template's own aspect ratio. Sized so a band
 *  graphic (a lower third fills a fraction of the frame) still reads as its own shape. */
const THUMB_W = 144;

/** On a phone the row's text and actions need the width more than the preview does — the box
 *  shrinks and the iframe scale follows, so nothing crops. Matches the `@media (max-width: 480px)`
 *  home rules in styles.css; keep the two in sync. */
const THUMB_W_COMPACT = 96;
const COMPACT_QUERY = '(max-width: 480px)';

function useCompactThumb(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return compact;
}

/** The list table's PREVIEW column (re-design/handoff.md §5c): every row the same height,
 *  non-16:9 graphics letterboxed on the void inside it. 16:9 at the table's 100px column;
 *  keep in sync with the `--lib-cols` template in styles.css. */
const FIXED_W = 100;
const FIXED_H = 56;
const FIXED_W_COMPACT = 96;
const FIXED_H_COMPACT = 54;

/**
 * THE SAME TEMPLATE OBJECT FOR THE SAME REVISION. Home re-reads the whole library on every
 * library change, and a re-read hands every card a NEW template object for the same graphic. The
 * composed document below is memoised on that object, so without this every visible card
 * recomposed and reloaded its sandboxed iframe on every change (152 loads for about 20 cards
 * during one first sync of a 138-graphic library, measured 2026-09-30). A caller that knows the
 * graphic's revision passes it; without one, every render is a new template, as before.
 */
function useStableTemplate(template: SpxTemplate, revision: string | undefined): SpxTemplate {
  const held = useRef<{ revision: string | undefined; template: SpxTemplate } | null>(null);
  if (!held.current || revision === undefined || held.current.revision !== revision) {
    held.current = { revision, template };
  }
  return held.current.template;
}

export default function GraphicThumb({
  template: incoming,
  revision,
  values,
  label,
  fixedBox = false,
  fill = false,
}: {
  template: SpxTemplate;
  /** Changes whenever the graphic does (its id with its `updatedAt` or `savedAt`). The card
   *  recomposes only when this moves; see `useStableTemplate`. */
  revision?: string;
  /** Field values to show (an entry's row); anything missing falls back to the definition default. */
  values?: Record<string, string>;
  label: string;
  /** Fixed 16:9 box (uniform library rows) instead of following the template's aspect. */
  fixedBox?: boolean;
  /** CARD mode: a 16:9 box the caller's width decides. The framing math needs real pixels,
   *  so the box measures itself rather than being told — a card in an `auto-fill` grid has
   *  no width anyone here can know. */
  fill?: boolean;
}) {
  const template = useStableTemplate(incoming, revision);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const compact = useCompactThumb();

  const [box, setBox] = useState<GraphicBox | null>(null);

  // In `fill` mode the box's width comes from the layout, so it is MEASURED. 240 is only the
  // first-paint guess; the observer below corrects it before the iframe is framed.
  const [measured, setMeasured] = useState(240);
  useEffect(() => {
    const el = boxRef.current;
    if (!fill || !el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth || 240));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  const boxW = fill
    ? measured
    : fixedBox ? (compact ? FIXED_W_COMPACT : FIXED_W) : compact ? THUMB_W_COMPACT : THUMB_W;
  const { width, height } = template.resolution;
  const boxH = fill || fixedBox
    ? (fill ? Math.round(boxW * 9 / 16) : compact ? FIXED_H_COMPACT : FIXED_H)
    : Math.round(boxW * (height / width));

  // Mount the iframe only when the card reaches the viewport — a library of a hundred graphics
  // must not parse a hundred copies of GSAP to show the eight rows a user can actually see.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || visible) return;
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true); // no observer (older engines, some test runtimes): render eagerly
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(box);
    return () => io.disconnect();
  }, [visible]);

  // The data the thumbnail shows: the graphic's own field defaults, overlaid with whatever the
  // caller passes (the active entry) — the same merge the control panel's Play does.
  const data = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const d of fieldDescriptors(template.fields, { includeHidden: true })) {
      merged[d.key] = String(values?.[d.key] ?? d.defaultValue ?? '');
    }
    return JSON.stringify(merged);
  }, [template, values]);

  // The card renders a graphic it did not author — an AI result, an imported design, a
  // stranger's shared template — so the iframe gets no `allow-same-origin`: it settles ITSELF
  // (composeDocument's settleWithData, the shared recipe) and reports its box back over
  // postMessage instead of being reached into from here.
  const doc = useMemo(
    () => (visible ? composeDocument(template, { settleWithData: data }) : ''),
    [visible, template, data],
  );

  useEffect(() => {
    if (!visible) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== frameRef.current?.contentWindow) return;
      const msg = ev.data;
      if (msg && typeof msg === 'object' && msg.type === 'spx-preview-box') {
        setBox({ x: msg.x, y: msg.y, w: msg.w, h: msg.h });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [visible]);

  const framing = frameGraphic(box, { width, height }, { w: boxW, h: boxH });

  return (
    <div
      ref={boxRef}
      className="gfx-thumb"
      style={fill ? { width: '100%', aspectRatio: '16 / 9' } : { width: boxW, height: boxH }}
      data-testid="graphic-thumb"
      aria-hidden="true"
    >
      {visible && (
        <iframe
          ref={frameRef}
          title={`${label} preview`}
          sandbox="allow-scripts"
          srcDoc={doc}
          tabIndex={-1}
          style={{ width, height, transform: framingTransform(framing) }}
        />
      )}
    </div>
  );
}
