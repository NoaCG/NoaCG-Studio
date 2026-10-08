// The output STAGE (docs/CLOUD_PLAYOUT.md §3): one fixed-size surface at the production
// resolution, CSS-scaled to the viewport, holding ONE sandboxed iframe per published graphic —
// all built at load (preload), each composed through the same composeDocument the editor
// previews with. Templates start invisible by the SPX contract, so an idle stacked graphic
// shows nothing.
//
// Every graphic is a LAYER, and payload order is the stack: index 0 furthest back, the last
// entry on top. Several layers are on air at once by design — a bug, a lower third and a
// ticker are three graphics, so taking a cue on one of them leaves the other two exactly as
// they were. Nothing here decides that; the stage stays dumb and the log says who plays.
//
// The stage is deliberately DUMB: it routes ControlMessages to the right iframe as
// previewProtocol commands and reports back what it forwarded. Which cue airs, and stopping the
// previously-live graphic, are the CONTROL surfaces' decisions — they ride the log as ordinary
// commands, whoever wrote them (an operator today, a data connector later).

import { composeDocument } from '../preview/composeDocument';
import {
  postPreviewCmd,
  FRAME_HOLD_CAP_MS,
  PREVIEW_ERROR_TYPE,
  PREVIEW_HELD_TYPE,
  PREVIEW_READY_TYPE,
  PREVIEW_STATE_TYPE,
  type PreviewErrorMessage,
  type PreviewHeldMessage,
  type PreviewCmd,
  type PreviewMachineState,
  type PreviewReadyMessage,
  type PreviewStateMessage,
} from '../preview/previewProtocol';
import type { ControlEventRow, OutputGraphicSpec, OutputPayload } from '../control/hostedControl';
import type { ControlMessage } from '../control/controlModel';
import { mountForeignOgraf, type ForeignOgrafLayer, type ForeignOgrafSpec, type OgrafReturn } from './foreignOgraf';
import type { SpxTemplate, SoundAssetRef } from '../model/types';
import { soundBlob, soundBytes } from '../assets/soundAssets';
import { DEFAULT_SETTINGS } from '../model/types';
import { createSoundBudget } from '../assets/soundBudget';

export interface SoundStatus { n: number; of: number; bytes: number; error: string | null }
let soundStageId = 0;

/** Rebuild a renderable SpxTemplate from the published snapshot. Fields/settings/layers are
 *  parsed views the composer never reads — the html/css/js carry the truth, as always. */
function templateFromSpec(spec: OutputGraphicSpec): SpxTemplate {
  return {
    name: spec.key,
    type: 'blank',
    resolution: spec.resolution,
    fps: spec.fps,
    html: spec.html,
    css: spec.css,
    js: spec.js,
    fields: [],
    settings: DEFAULT_SETTINGS,
    assets: spec.assets.map((a) => ({ ...a })),
    layers: [],
  };
}

export interface OutputStage {
  sounds: ReadonlyMap<string, SoundStatus>;
  onSound(cb: (graphic: string) => void): void;
  /** Mute catch-up execution without changing the picture; restore current loops once. */
  setSoundQuiet(quiet: boolean): void;
  /** Route one command to its graphic's document. Unknown graphics and the log's status rows
   *  ('cue'/'staged'/'live') are ignored, so a caller can feed rows straight through. */
  apply(graphic: string, msg: ControlEventRow['msg']): void;
  /** Ask a graphic's document for its machine state (answers arrive via onState). */
  requestState(graphic: string): void;
  /** The latest machine state each document reported (null = none / not machine-bearing). */
  states: ReadonlyMap<string, PreviewMachineState | null>;
  /** The field ids each document last reported as TOO LONG to fit (`noacgTextOverflow()`, see
   *  PreviewStateMessage.overflow). Empty for a graphic that fits, and for every template that
   *  answers no such question. */
  overflow: ReadonlyMap<string, string[]>;
  /** How far each document's animations had run at its last state reply, in milliseconds
   *  (PreviewStateMessage.motion). Updated by the same poll as `states`. A caller asks twice and
   *  compares: the same number twice means that graphic stood still in between. */
  motion: ReadonlyMap<string, number>;
  /** How many state replies each document has sent. A document runs ONE command at a time, so
   *  an ask made while it is mid-burst is answered only when that burst ends: without this, an
   *  unanswered ask reads exactly like an answer that nothing has moved. A caller comparing two
   *  `motion` readings must check this went UP between them, or it is comparing silence. */
  replies: ReadonlyMap<string, number>;
  /** Called whenever a document reports a state OR an overflow set that differs from the last
   *  one seen. Both ride the one reply, so one callback carries both. */
  onState(cb: (graphic: string, state: PreviewMachineState | null, overflow: string[]) => void): void;
  /** The PUBLISHED graphic keys the stage hosts, in LAYER order — furthest back first. Foreign
   *  packages are not listed: they answer no state request, which the boot catch-up waits on
   *  (catchUp.ts). Their keys are `ografReturns`'. */
  graphics: string[];
  /** What each FOREIGN OGraf Graphic has answered, in arrival order (foreignOgraf.ts). A foreign
   *  Graphic reports no machine state, so this is all a caller hears back from one. */
  ografReturns: ReadonlyMap<string, readonly OgrafReturn[]>;
  /** Take the WHOLE stage off or back on air — the renderer's own surface, never the graphics'
   *  own state. Boot catch-up replays missed commands as commands, so their animations run;
   *  airing that replay would put the outage's history on screen. Off air it settles unseen and
   *  the return shows the finished picture (docs/CLOUD_PLAYOUT.md §3). */
  setVisible(visible: boolean): void;
  /** Resolves once EVERY graphic's document has loaded and been handed the commands queued for
   *  it. Until then nothing sent to the stage has run, so a caller timing how long a burst of
   *  commands takes to play out starts its clock here, not when it sent them. */
  whenLoaded(): Promise<void>;
  /** Graphics released to air before their document finished loading: a font (or another
   *  subresource) had not answered `FRAME_HOLD_CAP_MS` after the document was parsed, so the
   *  graphic runs its commands on its fallback faces. `fonts` is what it was waiting for;
   *  `late` turns true when the document finally loads (the font answered or failed), and the
   *  entry stays so the debug line can still say the graphic was released early. `heldLine`
   *  words it. */
  held: ReadonlyMap<string, { fonts: string[]; late: boolean }>;
  /** Called whenever `held` changes. */
  onHeld(cb: () => void): void;
  /** The first error each document reported on the load-time channel (`window.onerror` and
   *  unhandled rejections, composeDocument's capture script), from the moment it began parsing.
   *  READY reads one that arrived before the graphic's warm pass as "not prepared". */
  errors: ReadonlyMap<string, string>;
  /** Called whenever `errors` gains an entry. */
  onError(cb: (graphic: string) => void): void;
  /** Called once per graphic, the moment its document is released to air (loaded, or held back
   *  by a font past the cap) and handed the commands queued for it. */
  onLoaded(cb: (graphic: string) => void): void;
  /**
   * THE WARM PASS AND READY CHECK (previewProtocol.ts 'warm'): hand the graphic `data` as an
   * off-air `update` in its command queue (none: check only), then resolve with what the document
   * reports about its fonts, images and the update. Resolves null when no answer came within
   * `WARM_ANSWER_MS` of the document loading (a document too busy or broken to answer). Queued
   * like any command until the document loads.
   */
  warm(graphic: string, data: Record<string, string> | null): Promise<PreviewReadyMessage | null>;
  /** Re-measure the fit box and rescale. The stage does this on every window resize; a host
   *  whose box changes for other reasons (a panel resize) calls it itself. */
  rescale(): void;
  /**
   * PER-GRAPHIC REPLACEMENT (docs/work-specs/per-graphic-replacement/spec.md D1): build `spec` in
   * a hidden frame beside the graphic's running one. It loads and answers a warm pass like any
   * frame, but no command reaches it and nothing of it reaches air until `swapIn`.
   */
  prepare(spec: OutputGraphicSpec, options?: { loadSound?: (asset: SoundAssetRef) => Promise<Blob> }): StagedFrame;
  /** Make a prepared, loaded frame its graphic's frame: `data` is written into it, it shows, and
   *  the frame it replaces is removed. Its graphic joins `graphics` if the stage did not host it. */
  swapIn(frame: StagedFrame, data: Record<string, string> | null): void;
  /** Add a graphic the stage did not host, the way a boot builds one: commands queue until its
   *  document loads, and `onLoaded` fires for it. */
  add(spec: OutputGraphicSpec): void;
  /** Take a graphic and its frame off the stage. */
  remove(graphic: string): void;
  destroy(): void;
}

/** A frame `prepare` built: hidden, and not its graphic's frame until `swapIn`. */
export interface StagedFrame {
  readonly key: string;
  readonly spec: OutputGraphicSpec;
  /** Resolves once its document has loaded, or has been released on a fallback face. */
  whenLoaded: Promise<void>;
  /** The warm pass and READY check, as `OutputStage.warm`. */
  warm(data: Record<string, string> | null): Promise<PreviewReadyMessage | null>;
  /** The first error its document reported while loading, or null. */
  error(): string | null;
  /** Remove it without swapping it in. */
  discard(): void;
}

export interface OutputStageOptions {
  sound?: 'program';
  soundQuiet?: boolean;
  soundBudget?: ReturnType<typeof createSoundBudget>;
  loadSound?: (asset: SoundAssetRef) => Promise<Blob>;
  /** The box the stage scales itself into. Defaults to the VIEWPORT, which is what the /output
   *  page wants — its root fills the window and a browser source is the window. The production
   *  page's rehearsal embed passes its own panel's size instead, so one stage implementation
   *  serves both and a rehearsal cannot drift from what airs. Call `rescale()` on the returned
   *  stage after the box changes; the stage listens to window resizes either way. */
  fit?: () => { width: number; height: number };
  /** FOREIGN OGraf packages to place on the stage beside the published graphics, each in its
   *  own isolated frame (foreignOgraf.ts, docs/OGRAF_ECOSYSTEM.md §3). The published graphics
   *  load exactly as they do without it. */
  foreign?: ForeignOgrafSpec[];
}

/** How long a warm pass waits for the document's answer once it has loaded: the document caps its
 *  own wait at FRAME_HOLD_CAP_MS, so this only catches a document that answers nothing at all. */
export const WARM_ANSWER_MS = FRAME_HOLD_CAP_MS + 5_000;

/** The output's debug line for `OutputStage.held`, or null when every document loaded in time. */
export function heldLine(held: OutputStage['held']): string | null {
  if (held.size === 0) return null;
  return [...held]
    .map(([graphic, { fonts, late }]) => {
      const what = fonts.length ? fonts.join(', ') : 'a resource';
      return late
        ? `${graphic} released on a fallback face (${what} was late)`
        : `${graphic} released on a fallback face, still waiting for ${what}`;
    })
    .join('; ');
}

/** Build the stage into `root` and keep it scaled to its fit box (the viewport by default). */
export function createOutputStage(
  root: HTMLElement,
  payload: OutputPayload,
  options: OutputStageOptions = {},
): OutputStage {
  const { width, height } = payload.resolution;
  const stage = document.createElement('div');
  stage.style.cssText = [
    `width:${width}px`,
    `height:${height}px`,
    'position:absolute',
    'left:50%',
    'top:50%',
    'transform-origin:0 0',
    'background:transparent',
  ].join(';');
  root.appendChild(stage);

  // Predictable broadcast scaling: the stage is always resolution-exact design pixels, centred
  // and uniformly scaled to fit its box (a 1920×1080 production fills a 1920×1080 browser
  // source 1:1; any other size letterboxes transparently).
  const fit = options.fit ?? (() => ({ width: window.innerWidth, height: window.innerHeight }));
  const rescale = () => {
    const box = fit();
    const scale = Math.min(box.width / width, box.height / height);
    // transform-origin 0 0 + a translate by half the SCALED size: the stage stays centred
    // without percentage translates compounding with the scale.
    stage.style.transform = `translate(${(-width * scale) / 2}px, ${(-height * scale) / 2}px) scale(${scale})`;
  };
  rescale();
  window.addEventListener('resize', rescale);

  /**
   * ONE DOCUMENT. A graphic's frame is normally the one the boot built for it; per-graphic
   * replacement (docs/work-specs/per-graphic-replacement/spec.md) builds a second one beside it,
   * hidden, and swaps it in once it has passed READY's checks. So everything a document owns
   * lives here, and the per-graphic maps below speak for each graphic's CURRENT frame only.
   */
  interface Frame {
    /** This stage's serial for the document, unique across every frame it ever builds. */
    id: number;
    key: string;
    spec: OutputGraphicSpec;
    iframe: HTMLIFrameElement;
    /** Its graphic's frame (as opposed to one prepared beside it). */
    current: boolean;
    loaded: boolean;
    /** Commands waiting for the document to load. */
    queue: PreviewCmd[];
    /** Warm passes asked for before the document loaded: their answer clocks start at the load. */
    armOnLoad: (() => void)[];
    /** Warm passes waiting for the document's answer, oldest first. */
    warming: ((answer: PreviewReadyMessage | null) => void)[];
    /** What a prepared frame reported before it became current (copied over at the swap). */
    error: string | null;
    hold: { fonts: string[]; late: boolean } | null;
    sound: SoundStatus | null;
    loadSound?: (asset: SoundAssetRef) => Promise<Blob>;
    /** Its sound budget allocations, released with it. */
    budgetKeys: Set<string>;
    onRelease: () => void;
    whenLoaded: Promise<void>;
  }

  /** Each graphic's current frame, by key. */
  const frames = new Map<string, Frame>();
  /** Frames prepared beside a graphic's current one. */
  const staged = new Set<Frame>();
  /** The graphics in LAYER order, furthest back first: one array, kept in place, so a reader
   *  holding `stage.graphics` sees graphics join and leave. */
  const graphics: string[] = [];
  const layers = new Map<string, number>();
  const states = new Map<string, PreviewMachineState | null>();
  const overflow = new Map<string, string[]>();
  const motion = new Map<string, number>();
  const replies = new Map<string, number>();
  const stateCbs: ((graphic: string, state: PreviewMachineState | null, overflow: string[]) => void)[] = [];
  // Commands QUEUE until the iframe's document has loaded its command listener — a
  // postMessage into an unloaded srcdoc is silently lost, which is exactly what ate the boot
  // recovery burst on a renderer refresh (live commands worked; the restore did not).
  let resolveLoaded: () => void = () => {};
  const allLoaded = new Promise<void>((resolve) => {
    resolveLoaded = resolve;
  });
  /** The frames the boot built: `whenLoaded` waits for these. */
  const bootFrames = new Set<Frame>();
  // A payload with no graphics has nothing to wait for (every `load` below checks the same).
  if (payload.graphics.length === 0) resolveLoaded();
  const held = new Map<string, { fonts: string[]; late: boolean }>();
  const heldCbs: (() => void)[] = [];
  const errors = new Map<string, string>();
  const errorCbs: ((graphic: string) => void)[] = [];
  const loadedCbs: ((graphic: string) => void)[] = [];
  /** The document behind each StagedFrame handed out. */
  const stagedFrames = new WeakMap<StagedFrame, Frame>();
  const encoded = new Map<string, Promise<Blob>>();
  const soundDeadlines = new Set<ReturnType<typeof setTimeout>>();
  const sounds = new Map<string, SoundStatus>(), soundCbs: ((graphic: string) => void)[] = [];
  const budget = options.soundBudget ?? createSoundBudget(), budgetId = ++soundStageId;
  let frameSerial = 0;
  let destroyed = false;

  const release = (frame: Frame) => {
    if (frame.loaded) return;
    frame.loaded = true;
    // A prepared frame stays hidden: it reaches air only through `swapIn`.
    if (frame.current) frame.iframe.style.visibility = 'visible';
    const queue = frame.queue;
    frame.queue = [];
    for (const cmd of queue) postPreviewCmd(frame.iframe.contentWindow, cmd);
    if (bootFrames.has(frame) && [...bootFrames].every((f) => f.loaded)) resolveLoaded();
    for (const arm of frame.armOnLoad) arm();
    frame.armOnLoad = [];
    frame.onRelease();
    if (frame.current) for (const cb of loadedCbs) cb(frame.key);
  };
  const postTo = (frame: Frame, cmd: PreviewCmd) => {
    if (!frame.loaded) frame.queue.push(cmd);
    else postPreviewCmd(frame.iframe.contentWindow, cmd);
  };
  const post = (graphic: string, cmd: PreviewCmd) => {
    const frame = frames.get(graphic);
    if (frame) postTo(frame, cmd);
  };

  /** The OPERATOR'S layer number (docs/PLAYOUT_DASHBOARD.md §5) — the same one the exported
   *  package declares, so a production stacks identically in the browser output and on a
   *  CasparCG server. A payload published before the field falls back to the graphic's array
   *  position, which is what this used to be. */
  const layerOf = (spec: OutputGraphicSpec, index: number) => (Number.isFinite(spec.layer) ? Number(spec.layer) : index + 1);
  /** …and for a graphic joining or replacing one later: a replacement without a layer keeps the
   *  place of the frame it replaces, a newcomer goes on top. */
  const laterLayerOf = (spec: OutputGraphicSpec) =>
    Number.isFinite(spec.layer) ? Number(spec.layer) : (layers.get(spec.key) ?? graphics.length + 1);

  /** Build a document for `spec` into the stage: last, or right after the frame `after` (moving
   *  an iframe later would load its document again). */
  const makeFrame = (spec: OutputGraphicSpec, layer: number, current: boolean, loadSound?: Frame['loadSound'], after?: HTMLIFrameElement): Frame => {
    const iframe = document.createElement('iframe');
    frameSerial += 1;
    // The same sandbox posture as every preview surface: published template code must never
    // reach the app origin (no allow-same-origin, ever — see preview/previewProtocol.ts).
    iframe.setAttribute('sandbox', 'allow-scripts');
    // Program sounds are played by this output's audio context. Delegate autoplay to its
    // sandboxed children; monitor/preparation stages still remain silent by construction.
    iframe.setAttribute('allow', 'autoplay');
    iframe.setAttribute('title', spec.key);
    // The layer number the production authored, stated rather than implied. An explicit
    // z-index makes the stack a property of the LAYER instead of a property of the append
    // loop, which is what a production changing a graphic's layer is entitled to rely on.
    iframe.dataset.layer = String(layer);
    // A frame prepared beside its graphic's running one says so until it takes over.
    if (!current) iframe.dataset.prepared = '';
    iframe.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      `width:${spec.resolution.width}px`,
      `height:${spec.resolution.height}px`,
      `z-index:${layer}`,
      'border:0',
      'background:transparent',
      // HIDDEN UNTIL ITS DOCUMENT HAS LOADED. Until `load` the frame holds a document that is
      // only partly read: composeDocument puts the color-scheme meta at the END of the
      // template's head, and the template CSS that hides its layers after that. Chromium paints
      // a frame whose document declares no color-scheme inside this dark-scheme page with an
      // OPAQUE WHITE canvas (measured: a full-frame white layer), and every frame here is
      // full-resolution, so that window is a whole-output flash waiting for a slow machine.
      // Hidden, the frame paints nothing at all. By `load` its scripts have run and the
      // template sits in its invisible start state, which is exactly what air should show, and
      // nothing sent to it can have run earlier anyway because commands queue until then.
      'visibility:hidden',
    ].join(';');
    let onRelease: () => void = () => {};
    const whenLoaded = new Promise<void>((resolve) => {
      onRelease = resolve;
    });
    const frame: Frame = {
      id: frameSerial,
      key: spec.key,
      spec,
      iframe,
      current,
      loaded: false,
      queue: [],
      armOnLoad: [],
      warming: [],
      error: null,
      hold: null,
      sound: null,
      loadSound,
      budgetKeys: new Set(),
      onRelease,
      whenLoaded,
    };
    // `load` is the normal release. A document that a font request holds back from `load`
    // releases itself earlier instead (PREVIEW_HELD_TYPE, handled in onMessage below): by then it
    // is fully parsed, so the reasons above for hiding it no longer apply.
    iframe.addEventListener('load', () => {
      release(frame);
      const hold = frame.current ? held.get(frame.key) : frame.hold;
      if (hold && !hold.late) {
        hold.late = true;
        if (frame.current) for (const cb of heldCbs) cb();
      }
    });
    iframe.srcdoc = composeDocument(templateFromSpec(spec), { liveControl: true, sound: options.sound, soundQuiet: options.soundQuiet });
    if (after) after.insertAdjacentElement('afterend', iframe);
    else stage.appendChild(iframe);
    return frame;
  };

  /** The per-graphic answers start over for a frame that has just become its graphic's. The
   *  machine state is left as the last frame said it, so a new frame's first reply reports only
   *  if it differs. */
  const adopt = (frame: Frame, layer: number, append = false) => {
    frames.set(frame.key, frame);
    layers.set(frame.key, layer);
    if (graphics.indexOf(frame.key) < 0) {
      // The boot keeps the payload's order; a graphic joining later goes in by its layer, in front
      // of any already on the same layer.
      let at = graphics.length;
      while (!append && at > 0 && (layers.get(graphics[at - 1]) ?? 0) > layer) at -= 1;
      graphics.splice(at, 0, frame.key);
    }
    if (!states.has(frame.key)) states.set(frame.key, null);
    overflow.set(frame.key, []);
    motion.set(frame.key, 0);
    if (!replies.has(frame.key)) replies.set(frame.key, 0);
  };

  /** Take a frame off the stage for good: its document, its waits and its sound budget. */
  const dispose = (frame: Frame) => {
    staged.delete(frame);
    // A boot frame that goes before it ever loaded must not hold `whenLoaded` for good.
    if (bootFrames.delete(frame) && [...bootFrames].every((f) => f.loaded)) resolveLoaded();
    for (const settle of frame.warming.slice()) settle(null);
    frame.budgetKeys.forEach((key) => budget.release(key));
    frame.budgetKeys.clear();
    frame.iframe.remove();
  };

  payload.graphics.forEach((spec, index) => {
    const layer = layerOf(spec, index);
    const frame = makeFrame(spec, layer, true);
    bootFrames.add(frame);
    adopt(frame, layer, true);
  });

  // A stranger's package never goes through composeDocument: its own frame, its own bridge.
  const foreign = new Map<string, ForeignOgrafLayer>();
  // One bad package is that package's problem: the rest of the stage still airs.
  for (const spec of options.foreign ?? []) {
    if (frames.has(spec.key) || foreign.has(spec.key)) {
      console.error(`output stage: foreign package "${spec.key}" skipped, its key is already on the stage`);
      continue;
    }
    try {
      foreign.set(spec.key, mountForeignOgraf(stage, spec, payload.resolution));
    } catch (err) {
      console.error(`output stage: foreign package "${spec.key}" skipped:`, err);
    }
  }

  /** The document that sent `ev`, current or prepared, or null. */
  const senderOf = (ev: MessageEvent): Frame | null => {
    for (const frame of frames.values()) if (frame.iframe.contentWindow === ev.source) return frame;
    for (const frame of staged) if (frame.iframe.contentWindow === ev.source) return frame;
    return null;
  };

  // State replies carry no graphic name — the SOURCE window identifies the sender.
  const onMessage = (ev: MessageEvent) => {
    const type = (ev.data as { type?: unknown } | undefined)?.type;
    if (type === 'noacg-sound-status' && options.sound === 'program') {
      const frame = senderOf(ev), s = ev.data.status;
      if (frame === null || !s || !Number.isInteger(s.n) || !Number.isInteger(s.of) || !Number.isInteger(s.bytes) || s.n < 0 || s.n > s.of || s.bytes < 0) return;
      const status = { n: s.n, of: s.of, bytes: s.bytes, error: typeof s.error === 'string' ? s.error : null };
      if (!frame.current) {
        frame.sound = status;
        return;
      }
      sounds.set(frame.key, status);
      for (const cb of soundCbs) cb(frame.key);
      return;
    }
    if (type === 'noacg-sound-retain' && options.sound === 'program') {
      const frame = senderOf(ev);
      if (frame === null || !frame.spec.assets.some(a=>a.path === ev.data.path && a.audio)) return;
      const allocation = `${budgetId}:${frame.id}:${ev.data.path}`;
      let error: string | undefined;
      try { budget.retain(allocation,ev.data.bytes); frame.budgetKeys.add(allocation); }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      frame.iframe.contentWindow?.postMessage({ type: 'noacg-sound-bytes', id: ev.data.id, error },'*');
      return;
    }
    if (type === 'noacg-sound-load' && options.sound === 'program') {
      const frame = senderOf(ev);
      const asset = frame?.spec.assets.find(a => a.path === ev.data.path)?.audio;
      if (!asset || frame === null) return;
      const loadSound = frame.loadSound ?? options.loadSound;
      let prepared = encoded.get(asset.hash);
      if (!prepared) {
        // Reject before the frame bridge's 15 s deadline, so retry gets a fresh request.
        let timeout: ReturnType<typeof setTimeout>;
        prepared = new Promise<Blob>((resolve,reject)=>{
          timeout = setTimeout(()=>reject(new Error('Sound preparation timed out. Retry Prepare.')),14_000);
          soundDeadlines.add(timeout);
          void soundBlob(asset, loadSound ? () => loadSound(asset) : undefined).then(resolve,reject);
        }).finally(()=>{ clearTimeout(timeout); soundDeadlines.delete(timeout); });
        encoded.set(asset.hash, prepared);
        const pending = prepared;
        void prepared.catch(() => { if (encoded.get(asset.hash) === pending) encoded.delete(asset.hash); });
      }
      void prepared.then(soundBytes).then(bytes => {
        if (!destroyed) frame.iframe.contentWindow?.postMessage({ type: 'noacg-sound-bytes', id: ev.data.id, bytes }, '*', [bytes]);
      }, error => {
        if (!destroyed) frame.iframe.contentWindow?.postMessage({ type: 'noacg-sound-bytes', id: ev.data.id, error: String(error.message ?? error) }, '*');
      });
      return;
    }
    if (type === PREVIEW_ERROR_TYPE) {
      const frame = senderOf(ev);
      if (frame === null) return;
      const message = String((ev.data as PreviewErrorMessage).message ?? 'error').slice(0, 200);
      if (!frame.current) {
        if (frame.error === null) frame.error = message;
        return;
      }
      if (errors.has(frame.key)) return;
      errors.set(frame.key, message);
      console.warn(`output stage: "${frame.key}" reported an error: ${message}`);
      for (const cb of errorCbs) cb(frame.key);
      return;
    }
    if (type === PREVIEW_READY_TYPE) {
      const settle = senderOf(ev)?.warming[0];
      if (settle) settle(ev.data as PreviewReadyMessage);
      return;
    }
    const heldMsg = ev.data as PreviewHeldMessage | undefined;
    if (heldMsg?.type === PREVIEW_HELD_TYPE) {
      const frame = senderOf(ev);
      if (frame === null || frame.loaded) return;
      const fonts = Array.isArray(heldMsg.fonts) ? heldMsg.fonts.map(String) : [];
      console.warn(
        `output stage: "${frame.key}" released on a fallback face after ${FRAME_HOLD_CAP_MS} ms, still waiting for ${fonts.join(', ') || 'a resource'}`,
      );
      if (frame.current) held.set(frame.key, { fonts, late: false });
      else frame.hold = { fonts, late: false };
      release(frame);
      if (frame.current) for (const cb of heldCbs) cb();
      return;
    }
    const data = ev.data as PreviewStateMessage | undefined;
    if (!data || data.type !== PREVIEW_STATE_TYPE) return;
    const frame = senderOf(ev);
    if (frame === null || !frame.current) return;
    const key = frame.key;
    const next = data.state ?? null;
    const nextOver = Array.isArray(data.overflow) ? data.overflow.map(String) : [];
    // Kept OUT of the `moved` test below: an animation playhead changes many times a second
    // and says nothing about applied truth, so it must never schedule a report. It is
    // recorded for whoever is waiting for the picture to stand still.
    motion.set(key, typeof data.motion === 'number' ? data.motion : 0);
    replies.set(key, (replies.get(key) ?? 0) + 1);
    const moved =
      JSON.stringify(next) !== JSON.stringify(states.get(key) ?? null) ||
      nextOver.join(',') !== (overflow.get(key) ?? []).join(',');
    if (moved) {
      states.set(key, next);
      overflow.set(key, nextOver);
      for (const cb of stateCbs) cb(key, next, nextOver);
    }
  };
  window.addEventListener('message', onMessage);

  const apply = (graphic: string, msg: ControlEventRow['msg']) => {
    // A status row has no OGraf meaning either; ografCallFor drops whatever it cannot map.
    const foreignLayer = foreign.get(graphic);
    if (foreignLayer) return foreignLayer.send(msg as ControlMessage);
    if (!frames.has(graphic)) return;
    switch (msg.t) {
      case 'update':
        post(graphic, { cmd: 'update', data: JSON.stringify(msg.data ?? {}) });
        break;
      case 'play':
        post(graphic, { cmd: 'play' });
        break;
      case 'stop':
        post(graphic, { cmd: 'stop', sound: msg.sound });
        break;
      case 'next':
        post(graphic, { cmd: 'next' });
        break;
      case 'event':
        // `at` rides along: a graphic that runs its own clock anchors it to the row's instant
        // rather than to this renderer's Date.now(), so every renderer agrees (controlModel.ts).
        post(graphic, { cmd: 'dispatch', event: msg.event, payload: msg.payload, at: msg.at });
        break;
      case 'snap':
        // Recovery semantics stated explicitly — the wire field means opposite things to the
        // editor simulator (parked design view, timers off) and to a renderer (timers arm).
        post(graphic, { cmd: 'snap', assignments: msg.snap, timers: true });
        break;
      default:
        return; // 'hello' and status rows ('cue'/'staged'/'live') are not renderer commands
    }
    post(graphic, { cmd: 'state' });
  };

  /** THE WARM PASS AND READY CHECK, on any document, current or prepared. */
  const warmFrame = (frame: Frame, data: Record<string, string> | null) =>
    new Promise<PreviewReadyMessage | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (answer: PreviewReadyMessage | null) => {
        const at = frame.warming.indexOf(settle);
        if (at < 0) return;
        frame.warming.splice(at, 1);
        clearTimeout(timer);
        resolve(answer);
      };
      // The clock starts when the document has loaded: until then the command waits in the
      // queue, and that wait is the load itself, which READY already counts as preparing.
      const arm = () => {
        if (timer === undefined) timer = setTimeout(() => settle(null), WARM_ANSWER_MS);
      };
      frame.warming.push(settle);
      postTo(frame, data ? { cmd: 'warm', data: JSON.stringify(data) } : { cmd: 'warm' });
      if (frame.loaded) arm();
      else frame.armOnLoad.push(arm);
    });

  return {
    sounds,
    onSound: cb=>soundCbs.push(cb),
    setSoundQuiet: (quiet) => {
      for (const key of frames.keys()) post(key, { cmd: 'sound-quiet', on: quiet });
    },
    apply,
    requestState: (graphic) => {
      // Polls are droppable pre-load — queueing them would just replay stale asks.
      if (frames.get(graphic)?.loaded) post(graphic, { cmd: 'state' });
    },
    states,
    overflow,
    motion,
    replies,
    onState: (cb) => stateCbs.push(cb),
    graphics,
    ografReturns: new Map([...foreign].map(([key, layer]) => [key, layer.returns])),
    // FROM INSIDE EACH DOCUMENT, never by hiding the stage from out here. This used to set the
    // stage's own opacity to 0, on the reasoning that the documents would keep compositing and
    // their timelines keep ticking. They do not: Chromium throttles the rendering of an iframe
    // whose embedder has made it invisible, and every graphic is a sandboxed (cross-origin)
    // frame. Measured on a real CasparCG 2.5.0 on 2026-09-22 — behind an opacity-0 stage a
    // replayed entrance advanced about 0.03 s per second, and the moment the stage came back
    // the rest of it, and the exit behind it, played out ON AIR. That is the whole-output flash
    // an operator sees when a browser source loads. Off air from the inside, the frame stays
    // visible to the compositor, keeps its frame rate, and finishes the replay unseen.
    setVisible: (visible) => {
      for (const key of frames.keys()) post(key, { cmd: 'offair', on: !visible });
      for (const layer of foreign.values()) layer.setOffAir(!visible);
    },
    held,
    onHeld: (cb) => heldCbs.push(cb),
    errors,
    onError: (cb) => errorCbs.push(cb),
    onLoaded: (cb) => loadedCbs.push(cb),
    warm: (graphic, data) => {
      const frame = frames.get(graphic);
      return frame ? warmFrame(frame, data) : Promise.resolve(null);
    },
    whenLoaded: () =>
      foreign.size ? Promise.all([allLoaded, ...[...foreign.values()].map((l) => l.loaded)]).then(() => undefined) : allLoaded,
    rescale,
    prepare: (spec, prepOptions = {}) => {
      // Beside the frame it may replace, at the same place in the stack, so a swap moves nothing.
      const frame = makeFrame(spec, laterLayerOf(spec), false, prepOptions.loadSound, frames.get(spec.key)?.iframe);
      staged.add(frame);
      const handle: StagedFrame = {
        key: frame.key,
        spec,
        whenLoaded: frame.whenLoaded,
        warm: (data) => warmFrame(frame, data),
        error: () => frame.error,
        discard: () => dispose(frame),
      };
      stagedFrames.set(handle, frame);
      return handle;
    },
    swapIn: (handle, data) => {
      const frame = stagedFrames.get(handle);
      if (!frame || !staged.has(frame)) return;
      staged.delete(frame);
      const old = frames.get(frame.key);
      frame.current = true;
      delete frame.iframe.dataset.prepared;
      adopt(frame, Number(frame.iframe.dataset.layer));
      // Its graphic's values reach it before any Take can, and showing it paints nothing: its
      // document sits in its invisible start state.
      if (data && Object.keys(data).length > 0) postTo(frame, { cmd: 'update', data: JSON.stringify(data) });
      // Not before its document has loaded (see `makeFrame`): until then `release` shows it.
      if (frame.loaded) frame.iframe.style.visibility = 'visible';
      if (frame.error !== null) errors.set(frame.key, frame.error);
      else errors.delete(frame.key);
      if (frame.hold) held.set(frame.key, frame.hold);
      else held.delete(frame.key);
      if (frame.sound) sounds.set(frame.key, frame.sound);
      else sounds.delete(frame.key);
      if (old) dispose(old);
      postTo(frame, { cmd: 'state' });
      for (const cb of heldCbs) cb();
      if (frame.sound) for (const cb of soundCbs) cb(frame.key);
    },
    add: (spec) => {
      if (frames.has(spec.key)) return;
      const layer = laterLayerOf(spec);
      adopt(makeFrame(spec, layer, true), layer);
    },
    remove: (graphic) => {
      const frame = frames.get(graphic);
      if (!frame) return;
      frames.delete(graphic);
      const at = graphics.indexOf(graphic);
      if (at >= 0) graphics.splice(at, 1);
      for (const map of [states, overflow, motion, replies, held, errors, sounds, layers] as Map<string, unknown>[]) map.delete(graphic);
      dispose(frame);
    },
    destroy: () => {
      destroyed = true; encoded.clear(); soundDeadlines.forEach(clearTimeout); soundDeadlines.clear();
      for (const frame of frames.values()) frame.budgetKeys.forEach((key) => budget.release(key));
      for (const frame of staged) frame.budgetKeys.forEach((key) => budget.release(key));
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', rescale);
      for (const layer of foreign.values()) layer.destroy();
      stage.remove();
    },
  };
}
