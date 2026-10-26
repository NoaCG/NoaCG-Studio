// MEASURE A CUE THAT IS NOT ON PREVIEW (docs/work-specs/playout-adjustments/spec.md, "Where the box
// lives"): the graphic composed in a hidden frame of its own resolution, settled with the cue's
// values and measured twice 250 ms apart (preview/settleGraphic.ts `measureGraphic`, qualified by
// control/cueAdjust.ts `qualify`). The browser half of control/adjustGeometry.ts `createMeasurer`.
//
// The frame is never on screen: fixed, outside the viewport, sandboxed like every preview surface.

import { composeDocument } from './composeDocument';
import { postPreviewCmd, PREVIEW_BOX_TYPE } from './previewProtocol';
import { qualify, readMeasurement, type Measurement } from '../control/cueAdjust';
import type { SpxTemplate } from '../model/types';

/** How long one cue may take before it has no measurement. */
const MEASURE_CAP_MS = 5_000;
/** The gap between the two answers that must agree. */
export const QUALIFY_GAP_MS = 250;

let serial = 0;

export function measureCue(template: SpxTemplate, values: Record<string, string>): Promise<Measurement | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = [
      'position:fixed',
      `left:${-template.resolution.width - 200}px`,
      'top:0',
      `width:${template.resolution.width}px`,
      `height:${template.resolution.height}px`,
      'border:0',
      'pointer-events:none',
    ].join(';');
    let first: Measurement | null = null;
    let tries = 0;
    let settleId = -1;
    let measureId = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (m: Measurement | null) => {
      clearTimeout(cap);
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      resolve(m);
    };
    const cap = setTimeout(() => done(null), MEASURE_CAP_MS);
    const ask = () => {
      measureId = ++serial;
      postPreviewCmd(iframe.contentWindow, { cmd: 'measure', id: measureId });
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const msg = ev.data as { type?: string; id?: number } | undefined;
      if (!msg || msg.type !== PREVIEW_BOX_TYPE || (msg.id !== settleId && msg.id !== measureId)) return;
      const m = readMeasurement(msg);
      if (!m) return done(null);
      if (!first) {
        first = m;
        timer = setTimeout(ask, QUALIFY_GAP_MS);
        return;
      }
      const q = qualify(first, m);
      tries += 1;
      if ((q.info || q.paint) || tries >= 3) return done(q.info || q.paint ? q : null);
      first = m;
      timer = setTimeout(ask, QUALIFY_GAP_MS);
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => {
      settleId = ++serial;
      postPreviewCmd(iframe.contentWindow, { cmd: 'settle', data: JSON.stringify(values), id: settleId });
    });
    iframe.srcdoc = composeDocument(template, { liveControl: true });
    document.body.appendChild(iframe);
  });
}
