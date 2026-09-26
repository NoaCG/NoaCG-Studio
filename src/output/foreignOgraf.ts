// A FOREIGN OGraf package on the output stage: a stranger's executable Web Component, played
// behind the isolation boundary of docs/OGRAF_ECOSYSTEM.md §3.
//
//   - ONE FRAME PER GRAPHIC, `sandbox="allow-scripts"` and never `allow-same-origin`: the frame's
//     origin is opaque, so it reads no cookie, no storage and no DOM of the app or of its parent.
//   - THE HOST DOCUMENT IS THE ADAPTER (`ografHostDocument` with `sandbox`): it alone imports the
//     package, registers the element and calls the lifecycle. It is loaded from a blob URL, not
//     `srcdoc`, because a srcdoc document's base URL is its PARENT'S URL, and the output page's
//     URL carries the production's output capability. `referrerpolicy="no-referrer"` keeps the
//     same URL out of `document.referrer`.
//   - THE NETWORK POLICY rides in that document (`ografNetworkPolicy`): every load and fetch is
//     confined to the package's base URL, so neither the internet nor `../` is reachable.
//   - THE BRIDGE IS ONE MessagePort, handed to the host document on the frame's first load, before
//     any package code has run. Only the calls `ografCallFor` maps a ControlMessage to travel on
//     it, and a reply is believed only for a call still waiting, reduced to the ReturnPayload's
//     three fields. The port reaches that document alone: a sibling frame cannot speak on it, and
//     a frame that navigates itself away leaves it behind, so nothing more reaches the frame.
//
// The package itself is served by whoever owns it (a library entry, later) from a dedicated scope;
// §3 lists what that server owes.

import { hostTagFor, ografHostDocument, OGRAF_PORT_TYPE, type OgrafCall } from '../control/ografHost';
import type { ControlMessage } from '../control/controlModel';
import { ografCallFor } from '../control/ografContract';
import type { Resolution } from '../model/types';

/** One foreign package placed on a layer of the stage. */
export interface ForeignOgrafSpec {
  key: string;
  /** The operator's layer number, as for a NoaCG graphic. */
  layer: number;
  /** Absolute http(s) URL the package is served from (see §3 for what that scope owes). */
  packageBase: string;
  /** The package's `.ograf.json`, already read. Only `id` and `main` are consulted here. */
  manifest: unknown;
  /** The data `load()` starts from. */
  data?: Record<string, string>;
}

/** What a Graphic answered, as far as the page will believe it. */
export interface OgrafReturn {
  call: OgrafCall;
  statusCode: number;
  statusMessage?: string;
  currentStep?: number;
}

export interface ForeignOgrafLayer {
  frame: HTMLIFrameElement;
  /** Route one ControlMessage. Anything with no OGraf meaning (`snap`, `hello`) is dropped. */
  send(msg: ControlMessage): void;
  /** Take the Graphic off air or back, from inside its document (see `offair` in ografHost.ts). */
  setOffAir(off: boolean): void;
  /** Every reply in arrival order, the most recent RETURNS_KEPT only. */
  returns: readonly OgrafReturn[];
  /** Resolves once the host document has loaded and been handed `load()` and the queued calls
   *  (or the layer was destroyed first). */
  loaded: Promise<void>;
  destroy(): void;
}

const RETURNS_KEPT = 50;
/** Calls a frame has not answered yet. A Graphic that never resolves cannot grow this forever. */
const PENDING_KEPT = 64;
const MESSAGE_MAX = 200;

/** A reply reduced to what a ReturnPayload may say. A malformed status is a failure, not a 200. */
function believe(call: OgrafCall, payload: unknown): OgrafReturn {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  const code = p.statusCode;
  const out: OgrafReturn = {
    call,
    statusCode: typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599 ? code : 500,
  };
  if (typeof p.statusMessage === 'string' && p.statusMessage) out.statusMessage = p.statusMessage.slice(0, MESSAGE_MAX);
  if (typeof p.currentStep === 'number' && Number.isInteger(p.currentStep)) out.currentStep = p.currentStep;
  return out;
}

/** Build one foreign Graphic's frame into `parent` (the stage) at the production resolution.
 *  Throws, before touching the page, on a package base the network policy cannot express. */
export function mountForeignOgraf(parent: HTMLElement, spec: ForeignOgrafSpec, resolution: Resolution): ForeignOgrafLayer {
  const manifest = (typeof spec.manifest === 'object' && spec.manifest !== null ? spec.manifest : {}) as Record<string, unknown>;
  const main = typeof manifest.main === 'string' && manifest.main ? manifest.main : 'graphic.mjs';
  const id = typeof manifest.id === 'string' ? manifest.id : spec.key;
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
  const html = ografHostDocument({
    packageBase: spec.packageBase,
    main,
    tag: hostTagFor(id, suffix),
    width: resolution.width,
    height: resolution.height,
    sandbox: true,
  });
  const src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', spec.key);
  frame.dataset.layer = String(spec.layer);
  frame.dataset.ograf = 'foreign';
  frame.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    `width:${resolution.width}px`,
    `height:${resolution.height}px`,
    `z-index:${spec.layer}`,
    'border:0',
    'background:transparent',
    // Hidden until loaded, for the same white-canvas reason as a NoaCG layer (stage.ts).
    'visibility:hidden',
  ].join(';');

  const channel = new MessageChannel();
  const returns: OgrafReturn[] = [];
  const pending = new Map<number, OgrafCall>();
  const queue: { call: OgrafCall; args: unknown[] }[] = [];
  let nextId = 1;
  let ready = false;
  const post = (call: OgrafCall, args: unknown[]) => {
    const callId = nextId++;
    if (call !== 'offair') pending.set(callId, call);
    if (pending.size > PENDING_KEPT) pending.delete(pending.keys().next().value as number);
    channel.port1.postMessage({ id: callId, call, args });
  };
  const call = (name: OgrafCall, args: unknown[]) => (ready ? post(name, args) : queue.push({ call: name, args }));

  channel.port1.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { id?: unknown; payload?: unknown } | null;
    if (!data || typeof data.id !== 'number') return;
    const answered = pending.get(data.id);
    if (!answered) return;
    pending.delete(data.id);
    returns.push(believe(answered, data.payload));
    if (returns.length > RETURNS_KEPT) returns.splice(0, returns.length - RETURNS_KEPT);
  };

  let resolveLoaded: () => void = () => {};
  const loaded = new Promise<void>((resolve) => {
    resolveLoaded = resolve;
  });
  frame.addEventListener(
    'load',
    () => {
      URL.revokeObjectURL(src);
      frame.style.visibility = 'visible';
      // The host document, and nothing else yet: the package is imported only by `mount`.
      frame.contentWindow?.postMessage({ type: OGRAF_PORT_TYPE }, '*', [channel.port2]);
      ready = true;
      post('mount', [spec.data ?? {}, { resolution: { width: resolution.width, height: resolution.height } }]);
      for (const q of queue.splice(0)) post(q.call, q.args);
      resolveLoaded();
    },
    { once: true },
  );
  frame.src = src;
  parent.appendChild(frame);

  return {
    frame,
    send: (msg) => {
      const mapped = ografCallFor(msg);
      if (mapped) call(mapped.call, mapped.args);
    },
    setOffAir: (off) => call('offair', [off]),
    returns,
    loaded,
    destroy: () => {
      channel.port1.close();
      URL.revokeObjectURL(src);
      frame.remove();
      resolveLoaded();
    },
  };
}
