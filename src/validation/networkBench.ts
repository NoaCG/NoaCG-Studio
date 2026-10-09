// THE NETWORK BENCH - the observed-request refusal of community packs
// (docs/work-specs/community-packs/spec.md D5, slice-4-research.md). A graphic is loaded with every
// outside request refused, played through update, play, Continue and stop, and every request it
// made is named. Blocking first means nothing leaves the machine while it is observed, and a URL
// built at runtime, which the static share screen cannot read, is caught all the same.
//
// WHY NOT INSIDE benchTemplateRuntime. That bench measures layout, so it runs the template in a
// SAME-ORIGIN iframe it can reach into. That is fine for one's own graphics, and wrong for this
// check's other caller: an admin reviewing a stranger's pack would run the stranger's code with
// the admin's session one `parent.` away. This bench needs no measurement, so it drives the
// graphic over the preview's postMessage channel in a sandboxed frame with an opaque origin, the
// way every other preview of someone else's design is shown.
//
// Browser-only. Saving, exporting and playing out are unaffected: live data blocks may fetch,
// and only a community pack has to carry everything it shows.

import { composeDocument } from '../preview/composeDocument';
import { PREVIEW_BOX_TYPE, PREVIEW_CMD_TYPE, type PreviewCmd } from '../preview/previewProtocol';
import type { SpxTemplate } from '../model/types';
import { isRequest, NETWORK_READY_TYPE, NETWORK_REQUEST_TYPE, withNetworkGuard, type ObservedRequest } from './networkGuard';

export type { ObservedRequest } from './networkGuard';

/** GSAP runs this many times faster, so an entrance settles in tens of milliseconds. */
const TIME_SCALE = 20;
/** Real time per phase; at TIME_SCALE it is seconds of animation, and a request made inside a
 *  phase is reported within it. */
const PHASE_MS = 250;
/** Continue presses: as many as the steps a graphic declares, at least one, and capped. */
const MAX_CONTINUES = 8;
/** A frame that never loads is reported as a bench failure, not waited on. */
const LOAD_MS = 8_000;
/** Play waits for the fonts (up to 400 ms inside the frame) before it runs; this is how long
 *  the bench waits for it to say it played before moving on regardless. */
const PLAYED_MS = 1_500;
/** After Out, for a request the graphic makes once it has left the air. */
const AFTER_OUT_MS = 750;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The graphic's own field defaults, as the live channel's update takes them (the runtime
 *  bench's default payload). */
function defaults(template: SpxTemplate): string {
  return JSON.stringify(Object.fromEntries(template.fields.map((f) => [f.field, f.value ?? ''])));
}

/**
 * Every request the graphic made while it loaded, took its data, played, continued and went out,
 * once per URL in the order first seen. Throws when there is no browser or the frame never loads,
 * so a caller can refuse rather than pass a graphic nobody watched.
 */
export async function observeRequests(template: SpxTemplate): Promise<ObservedRequest[]> {
  if (typeof document === 'undefined') throw new Error('The request check needs a browser.');
  const fontBase = new URL('fonts/', document.baseURI).href;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('sandbox', 'allow-scripts');
  const { width, height } = template.resolution;
  // In the viewport but unseen: a cross-origin frame placed off screen has its frames throttled,
  // and a graphic whose animation never ticks never reaches the callback that makes its request.
  iframe.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;` +
    'opacity:0;pointer-events:none;transform:scale(0.05);transform-origin:0 0;z-index:-1;';

  const seen = new Map<string, ObservedRequest>();
  // The guard says when the graphic's document has loaded; play answers with the graphic's box
  // once it has run, so Continue is never pressed before it.
  let ready: () => void = () => {};
  let played: () => void = () => {};
  const onMessage = (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    const m = ev.data as Partial<ObservedRequest> & { type?: string };
    if (m?.type === NETWORK_READY_TYPE) ready();
    if (m?.type === PREVIEW_BOX_TYPE) played();
    if (!m || m.type !== NETWORK_REQUEST_TYPE || typeof m.url !== 'string' || !isRequest(m.url)) return;
    if (!seen.has(m.url)) seen.set(m.url, { url: m.url, directive: String(m.directive ?? ''), phase: String(m.phase ?? '') });
  };
  window.addEventListener('message', onMessage);
  const send = (cmd: PreviewCmd) => iframe.contentWindow?.postMessage({ type: PREVIEW_CMD_TYPE, ...cmd }, '*');
  // A hidden tab stops a graphic's animation frames, and a request made on one would go unseen:
  // a check that ran hidden is no check, so it says so rather than passing.
  let hidden = document.hidden;
  const onVisibility = () => {
    if (document.hidden) hidden = true;
  };
  document.addEventListener('visibilitychange', onVisibility);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The request check could not load the graphic.')), LOAD_MS);
      ready = () => {
        clearTimeout(timer);
        resolve();
      };
      iframe.srcdoc = withNetworkGuard(composeDocument(template, { liveControl: true }), fontBase, TIME_SCALE);
      document.body.appendChild(iframe);
    });
    await wait(PHASE_MS);
    const data = defaults(template);
    send({ cmd: 'update', data });
    await wait(PHASE_MS);
    await Promise.race([new Promise<void>((resolve) => { played = resolve; send({ cmd: 'play', data }); }), wait(PLAYED_MS)]);
    await wait(PHASE_MS);
    const steps = Number.parseInt(template.settings.steps, 10);
    const continues = Math.min(Math.max(Number.isFinite(steps) ? steps : 1, 1), MAX_CONTINUES);
    for (let i = 0; i < continues; i++) {
      send({ cmd: 'next' });
      await wait(PHASE_MS);
    }
    send({ cmd: 'stop' });
    await wait(AFTER_OUT_MS);
  } finally {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisibility);
    iframe.remove();
  }
  if (hidden) throw new Error('The check could not watch it: keep this tab in front while a pack is checked, then try again.');
  return [...seen.values()];
}
