// MEASURE A GRAPHIC IN A FRAME OF ITS OWN (docs/work-specs/playout-adjustments/spec.md, "What is
// measured, honestly"): a composed document at its own resolution, settled with the values and
// measured twice 250 ms apart (./settleGraphic.ts `measureGraphic`, qualified by
// control/cueAdjust.ts `qualifyStep`). Two callers: the production page's background measurer
// (components/home/measureCue.ts) and an output resolving a Take's preset against its own box
// (output/placeOnOutput.ts, live-publishing W1).
//
// The frame is sandboxed like every preview surface and scaled to a speck in a corner: IN THE
// VIEWPORT, never outside it or hidden, since Chromium throttles a cross-origin frame that does not
// intersect the viewport, and a design that comes to rest on its own clock would then never settle.
// On an output, whose window is the picture, `invisible` also gives it no opacity.

import { postPreviewCmd, PREVIEW_BOX_TYPE, PREVIEW_RESTYLED_TYPE } from './previewProtocol';

let serial = 0;

/** How two answers qualify into one measurement (control/cueAdjust.ts `readMeasurement`,
 *  `qualifyStep`, `QUALIFY_GAP_MS`), handed in by the caller: preview/ does not import control/. */
export interface Qualify<M> {
  read: (msg: unknown) => M | null;
  step: (first: M | null, m: M, tries: number) => { done: M | null } | { giveUp: true } | { again: M; tries: number };
  gapMs: number;
}

export interface MeasureDocument {
  /** The composed document (preview/composeDocument.ts with `liveControl`). */
  srcdoc: string;
  size: { width: number; height: number };
  values: Record<string, string>;
  /** The type and colour to draw in first (previewProtocol.ts `style`), or none. */
  style: { vars: Record<string, string> | null; faces: string } | null;
  /** How long the whole measurement may take before it answers null. */
  capMs: number;
  /** Paint nothing, even a speck (an output's window is the picture). */
  invisible?: boolean;
}

export function measureDocument<M>(job: MeasureDocument, qualify: Qualify<M>): Promise<M | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `width:${job.size.width}px`,
      `height:${job.size.height}px`,
      'transform:scale(0.001)',
      'transform-origin:0 0',
      'z-index:-1',
      'border:0',
      'pointer-events:none',
      ...(job.invisible ? ['opacity:0'] : []),
    ].join(';');
    let first: M | null = null;
    let tries = 0;
    let asked = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (m: M | null) => {
      clearTimeout(cap);
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      resolve(m);
    };
    const cap = setTimeout(() => done(null), job.capMs);
    const settle = () => {
      asked = ++serial;
      postPreviewCmd(iframe.contentWindow, { cmd: 'settle', data: JSON.stringify(job.values), id: asked });
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const msg = ev.data as { type?: string; id?: number } | undefined;
      if (msg && msg.type === PREVIEW_RESTYLED_TYPE && asked < 0) return settle();
      if (!msg || msg.type !== PREVIEW_BOX_TYPE || msg.id !== asked) return;
      const m = qualify.read(msg);
      if (!m) return done(null);
      const step = qualify.step(first, m, tries);
      if ('done' in step) return done(step.done);
      if ('giveUp' in step) return done(null);
      first = step.again;
      tries = step.tries;
      timer = setTimeout(() => {
        asked = ++serial;
        postPreviewCmd(iframe.contentWindow, { cmd: 'measure', id: asked });
      }, qualify.gapMs);
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => {
      // The style first, and the settle only once the document says its faces are in: its own
      // queue lets a settle through after 400 ms, and a box measured in the fallback face would be
      // stored as this style's.
      if (!job.style) return settle();
      postPreviewCmd(iframe.contentWindow, { cmd: 'style', vars: job.style.vars, faces: job.style.faces });
    });
    iframe.srcdoc = job.srcdoc;
    document.body.appendChild(iframe);
  });
}
