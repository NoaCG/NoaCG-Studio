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

import { hostTagFor, ografHostDocument, OGRAF_CALL_TIMEOUT_MS, OGRAF_PORT_TYPE, type OgrafCall } from '../control/ografHost';
import type { ControlMessage } from '../control/controlModel';
import { ografCallFor } from '../control/ografContract';
import { ografOk, ografStepAfter, ografStepFor, type OgrafStepAt, type OgrafStepOp } from '../control/ografSteps';
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

/**
 * WHAT ONE CALL CAME TO, AS FAR AS IT IS KNOWN (E2.2, AC-3). Only `done` is a success: a 2xx the
 * Graphic itself answered for this instance. `rejected` is its own refusal (4xx/5xx), `timeout`
 * no answer in time (the host's 504, or the page's own deadline when the frame answers nothing),
 * `gone` the instance was replaced or removed while the call was out, so whatever it does now is
 * not this instance's, and `refused` a step this page judged out of range and never sent.
 */
export type OgrafAnswer =
  | { status: 'done'; statusCode: number; statusMessage?: string; currentStep?: number }
  | { status: 'rejected'; statusCode: number; statusMessage?: string }
  | { status: 'timeout'; statusMessage?: string }
  | { status: 'gone' }
  | { status: 'refused'; reason: string };

export interface ForeignOgrafLayer {
  /** This mount's own id, unique per instance: written on its frame as `data-instance`, so a
   *  replacement is a different instance and nothing it says is mistaken for the one it replaced. */
  instance: string;
  /** Called with every settled answer, after `position()` has taken it in. `newest`: no later Take,
   *  step or Out was sent before it settled, so a play or stop answer still says where it is. */
  onAnswer(cb: (call: OgrafCall, answer: OgrafAnswer, newest: boolean) => void): void;
  /** Route one ControlMessage. Anything with no OGraf meaning (`snap`, `hello`) is dropped. */
  send(msg: ControlMessage): void;
  /** The same, answered: what the Graphic said to this call, or null for a message with no OGraf
   *  meaning, which is sent nowhere. */
  call(msg: ControlMessage): Promise<OgrafAnswer> | null;
  /** One step (ografSteps.ts), judged against the declared count and the last answer first. */
  step(op: OgrafStepOp): Promise<OgrafAnswer>;
  /** Where the Graphic is by its answers, and the count its manifest declares. */
  position(): { at: OgrafStepAt; declared: unknown };
  /** Take the Graphic off air or back, from inside its document (see `offair` in ografHost.ts). */
  setOffAir(off: boolean): void;
  /** Every reply in arrival order, the most recent RETURNS_KEPT only. */
  returns: readonly OgrafReturn[];
  /** Resolves once the host document has loaded and been handed the port, with `load()` and
   *  every call sent so far waiting on it (or the layer was destroyed first). */
  loaded: Promise<void>;
  destroy(): void;
}

/** Options a harness may set; production uses the defaults. */
export interface ForeignOgrafOptions {
  /** The host's 504 deadline per call (ografHost.ts OGRAF_CALL_TIMEOUT_MS). */
  callTimeoutMs?: number;
}

/** Past the host's own deadline by this much, the page stops waiting for a frame that answers
 *  nothing at all (one that navigated away, or whose bridge died). */
const ANSWER_GRACE_MS = 2_000;
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
  if (typeof p.currentStep === 'number' && Number.isInteger(p.currentStep) && p.currentStep >= 0) out.currentStep = p.currentStep;
  return out;
}

/** A believed reply as the operator may be told it: only a 2xx is done, and a 504 is a timeout. */
function answerOf(r: OgrafReturn): OgrafAnswer {
  const said = r.statusMessage ? { statusMessage: r.statusMessage } : {};
  if (ografOk(r.statusCode)) return { status: 'done', statusCode: r.statusCode, ...said, ...(r.currentStep !== undefined ? { currentStep: r.currentStep } : {}) };
  if (r.statusCode === 504) return { status: 'timeout', ...said };
  return { status: 'rejected', statusCode: r.statusCode, ...said };
}

/** Build one foreign Graphic's frame into `parent` (the stage) at the production resolution.
 *  Throws, before touching the page, on a package base the network policy cannot express. */
export function mountForeignOgraf(parent: HTMLElement, spec: ForeignOgrafSpec, resolution: Resolution, options: ForeignOgrafOptions = {}): ForeignOgrafLayer {
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
    callTimeoutMs: options.callTimeoutMs,
  });
  const deadline = (options.callTimeoutMs ?? OGRAF_CALL_TIMEOUT_MS) + ANSWER_GRACE_MS;
  const src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', spec.key);
  frame.dataset.layer = String(spec.layer);
  frame.dataset.ograf = 'foreign';
  frame.dataset.instance = suffix;
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
  /** Each call still out: what it was, and how to settle its answer once (the reply, the page's
   *  deadline, or the instance going, whichever is first). */
  const pending = new Map<number, { call: OgrafCall; walk: number; before: OgrafStepAt; settle: (answer: OgrafAnswer) => void }>();
  let nextId = 1;
  let gone = false;
  /** Where the Graphic is, by its answers to `playAction` (ografSteps.ts). Calls can now answer out
   *  of order, so only the answer to the newest play or stop moves it (`walk`). */
  let at: OgrafStepAt = null;
  let walk = 0;
  /** `load()`'s answer, however it came: every later call's deadline starts from it. */
  let loadAnswered: Promise<unknown> = Promise.resolve();
  const answerCbs: ((call: OgrafCall, answer: OgrafAnswer, newest: boolean) => void)[] = [];
  // Posted at once: a port holds what it is sent until the far end starts listening, so nothing
  // waits on the frame's load here, and `load()` is the first call the Graphic sees.
  const post = (call: OgrafCall, args: unknown[]): Promise<OgrafAnswer> => {
    if (gone) return Promise.resolve({ status: 'gone' });
    const callId = nextId++;
    // A Take restarts the walk, an Out ends it and a step moves it: until this call's answer,
    // where it is is not known, and only the newest such call's answer says (`walk`). A refusal
    // moved nothing, so its answer puts back where it was before (`before`).
    const before = at;
    if (call === 'play' || call === 'stop') {
      walk += 1;
      at = null;
    }
    const answered = new Promise<OgrafAnswer>((resolve) => {
      if (call === 'offair') return resolve({ status: 'done', statusCode: 200 });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (answer: OgrafAnswer) => {
        if (!pending.has(callId)) return;
        pending.delete(callId);
        clearTimeout(timer);
        resolve(answer);
      };
      pending.set(callId, { call, walk, before, settle });
      // The host starts a call's own deadline only once load() has answered, so this page's
      // fallback does the same: a slow load never eats into the answer window of the calls behind it.
      const arm = () => {
        if (pending.has(callId)) timer = setTimeout(() => settle({ status: 'timeout', statusMessage: 'the graphic answered nothing' }), deadline);
      };
      if (call === 'mount') arm();
      else void loadAnswered.then(arm);
    });
    // A Graphic that never answers cannot grow the book forever: the oldest call is given up.
    if (pending.size > PENDING_KEPT) pending.get(pending.keys().next().value as number)?.settle({ status: 'timeout', statusMessage: 'too many calls unanswered' });
    channel.port1.postMessage({ id: callId, call, args });
    const sentAt = walk;
    if (call !== 'offair') void answered.then((answer) => { for (const cb of answerCbs) cb(call, answer, sentAt === walk); });
    return answered;
  };
  loadAnswered = post('mount', [spec.data ?? {}, { resolution: { width: resolution.width, height: resolution.height } }]);

  channel.port1.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { id?: unknown; payload?: unknown } | null;
    if (!data || typeof data.id !== 'number') return;
    const out = pending.get(data.id);
    if (!out) return;
    const told = believe(out.call, data.payload);
    returns.push(told);
    if (returns.length > RETURNS_KEPT) returns.splice(0, returns.length - RETURNS_KEPT);
    if (out.walk === walk) {
      if (out.call === 'play') at = ografStepAfter(out.before, told);
      // A stop that went ends the walk; one the Graphic refused moved nothing, as a refused step.
      else if (out.call === 'stop') at = ografOk(told.statusCode) ? null : ografStepAfter(out.before, told);
    }
    out.settle(answerOf(told));
  };
  /** Every call still out, settled as gone: its instance is no longer the one on the layer. */
  const leave = () => {
    gone = true;
    for (const out of [...pending.values()]) out.settle({ status: 'gone' });
  };
  const call = (msg: ControlMessage): Promise<OgrafAnswer> | null => {
    const mapped = ografCallFor(msg);
    if (!mapped) return null;
    return post(mapped.call, mapped.args);
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
      resolveLoaded();
    },
    { once: true },
  );
  frame.src = src;
  parent.appendChild(frame);

  return {
    instance: suffix,
    onAnswer: (cb) => void answerCbs.push(cb),
    send: (msg) => void call(msg),
    call,
    step: (op) => {
      const judged = ografStepFor(op, { declared: manifest.stepCount, at });
      if (!judged.ok) return Promise.resolve({ status: 'refused', reason: judged.refusal });
      return post('play', [judged.params]);
    },
    position: () => ({ at, declared: manifest.stepCount }),
    setOffAir: (off) => void post('offair', [off]),
    returns,
    loaded,
    destroy: () => {
      leave();
      channel.port1.close();
      URL.revokeObjectURL(src);
      frame.remove();
      resolveLoaded();
    },
  };
}
