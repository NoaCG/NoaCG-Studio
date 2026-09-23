import { useEffect, useMemo, useRef, useState } from 'react';
import { composeDocument } from '../../preview/composeDocument';
import { frameGraphic, framingTransform, type GraphicBox } from '../../preview/frameGraphic';
import { fieldDescriptors } from '../../control/controlModel';
import type { TemplateVariant } from '../../model/wizard';
import type { SpxTemplate } from '../../model/types';
import type { Palette } from '../../model/templateVocabulary';

/**
 * A small settled-state render for picker cards.
 * Loads the real template and jumps the entrance timeline to its end (no animation),
 * so every card shows the true on-air look without ten timelines running at once.
 *
 * FRAMED ON THE GRAPHIC, not on the canvas — the shared recipe in preview/frameGraphic.ts, so a
 * picker card, Home's library card and the big preview's "⌖ Zoom to graphic" (WizardPreview.tsx)
 * all agree about what a design looks like.
 *
 * Two sources, one render. A `variant` is BUILT here and only once the card scrolls into view,
 * because Browse can put the whole catalog on one grid. A `template` is already built — the AI
 * step's three alternatives — and is shown as-is. Sharing this component is what makes an AI
 * alternative and a catalog design look like the same kind of choice.
 *
 * A picker card shows a design nobody has vetted yet — an AI alternative, or any catalog
 * variant before it is chosen — so like GraphicThumb it settles ITSELF (composeDocument's
 * settleWithData) and reports its box back over postMessage rather than being read via
 * contentDocument.
 */

/** `lazy` forces the intersection gate onto a ready-made `template` too. The kit tray is the
 *  one caller that needs it: a 36-graphic kit is 36 built templates in one horizontally
 *  scrolling strip, which is exactly the page-long stall the gate exists to prevent. */
type Props = (
  | {
      variant: TemplateVariant;
      /** Build the design in this palette instead of its own default - a KIT's row shows the
       *  graphic in the kit's Style, which is what the kit will actually build. */
      palette?: Palette;
      template?: never;
    }
  | { template: SpxTemplate; variant?: never; palette?: never }
) & {
  lazy?: boolean;
};

export default function MiniPreview({ variant, palette, template: built, lazy }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Mount the iframe only once the card scrolls into view (the GraphicThumb recipe): the
  // Browse step can show the whole catalog at once, and building + parsing GSAP for every
  // off-screen tile would make opening it a page-long stall.
  //
  // A ready-made `template` skips that gate. There are only ever a few of them, they cost no
  // build, and they sit below the fold of a scrolling step — waiting for an intersection
  // there means the cards a user scrolls down TO ARE the reason they scrolled, shown empty.
  const [visible, setVisible] = useState(Boolean(built) && !lazy);
  useEffect(() => {
    if (built && !lazy) return;
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [built, lazy]);
  const template = useMemo(
    () => (visible ? (built ?? variant?.create(palette ? { palette } : undefined) ?? null) : null),
    [built, variant, palette, visible],
  );
  // The card shows the design's own field defaults — a picker has no operator data to overlay.
  const data = useMemo(() => {
    if (!template) return '{}';
    const merged: Record<string, string> = {};
    for (const d of fieldDescriptors(template.fields, { includeHidden: true })) {
      merged[d.key] = String(d.defaultValue ?? '');
    }
    return JSON.stringify(merged);
  }, [template]);
  const doc = useMemo(
    () => (template ? composeDocument(template, { settleWithData: data }) : ''),
    [template, data],
  );
  const { width, height } = template?.resolution ?? { width: 1920, height: 1080 };
  const [box, setBox] = useState<GraphicBox | null>(null);
  // The card's own size, MEASURED: the grid reflows with the wizard's width, and a hard-coded
  // guess here silently mis-frames every tile the day the layout changes.
  const [card, setCard] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setCard({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== ref.current?.contentWindow) return;
      const msg = ev.data;
      if (msg && typeof msg === 'object' && msg.type === 'spx-preview-box') {
        setBox({ x: msg.x, y: msg.y, w: msg.w, h: msg.h });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [visible]);

  const framing = frameGraphic(box, { width, height }, card);

  return (
    <div className="wz-mini" ref={cardRef}>
      {visible && (
        <iframe
          ref={ref}
          title={`${built?.name ?? variant?.name ?? 'Design'} preview`}
          sandbox="allow-scripts"
          srcDoc={doc}
          tabIndex={-1}
          style={{ width, height, transform: framingTransform(framing) }}
        />
      )}
    </div>
  );
}
