// MEASURE A CUE THAT IS NOT ON PREVIEW (docs/work-specs/playout-adjustments/spec.md, "Where the box
// lives"): the graphic composed in a hidden frame of its own resolution, settled with the cue's
// values and measured twice 250 ms apart (preview/settleGraphic.ts `measureGraphic`, qualified by
// control/cueAdjust.ts `qualifyStep`). The browser half of control/adjustGeometry.ts `createMeasurer`.
//
// The frame is sandboxed like every preview surface and scaled to a speck in a corner (below).

import { composeDocument } from './composeDocument';
import { postPreviewCmd, PREVIEW_BOX_TYPE } from './previewProtocol';
import { qualifyStep, readMeasurement, QUALIFY_GAP_MS, type Measurement } from '../control/cueAdjust';
import type { SpxTemplate } from '../model/types';

/** How long one cue may take before it has no measurement. */
const MEASURE_CAP_MS = 5_000;

let serial = 0;

export function measureCue(template: SpxTemplate, values: Record<string, string>): Promise<Measurement | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    // IN THE VIEWPORT, scaled to a speck, never outside it or hidden: Chromium throttles a
    // cross-origin frame that does not intersect the viewport, and a design that comes to rest on
    // its own clock would then never settle. Layout is at the graphic's own resolution.
    iframe.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `width:${template.resolution.width}px`,
      `height:${template.resolution.height}px`,
      'transform:scale(0.001)',
      'transform-origin:0 0',
      'z-index:-1',
      'border:0',
      'pointer-events:none',
    ].join(';');
    let first: Measurement | null = null;
    let tries = 0;
    let asked = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (m: Measurement | null) => {
      clearTimeout(cap);
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      resolve(m);
    };
    const cap = setTimeout(() => done(null), MEASURE_CAP_MS);
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const msg = ev.data as { type?: string; id?: number } | undefined;
      if (!msg || msg.type !== PREVIEW_BOX_TYPE || msg.id !== asked) return;
      const m = readMeasurement(msg);
      if (!m) return done(null);
      const step = qualifyStep(first, m, tries);
      if ('done' in step) return done(step.done);
      if ('giveUp' in step) return done(null);
      first = step.again;
      tries = step.tries;
      timer = setTimeout(() => {
        asked = ++serial;
        postPreviewCmd(iframe.contentWindow, { cmd: 'measure', id: asked });
      }, QUALIFY_GAP_MS);
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => {
      asked = ++serial;
      postPreviewCmd(iframe.contentWindow, { cmd: 'settle', data: JSON.stringify(values), id: asked });
    });
    iframe.srcdoc = composeDocument(template, { liveControl: true });
    document.body.appendChild(iframe);
  });
}
