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
import { frameCss, isIdentity, readAppearance, styleKey, type AppliedAppearance } from '../control/cueAdjust';
import { facesCss } from '../control/cueStyle';
import { readTypedWire, typedValuesOf } from '../model/ografTyped';
import { mountForeignOgraf, type ForeignOgrafLayer, type ForeignOgrafOptions, type ForeignOgrafSpec, type OgrafReturn } from './foreignOgraf';
import { ografLoadData, type OgrafOutcome } from '../control/ografOutcome';
import { UNKNOWN_REMOUNTED } from '../control/ografRecovery';
import { ografCallFor } from '../control/ografContract';
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
  /** The place and size each graphic holds applied (playout adjustments): the last `update` that
   *  carried an `appearance`, kept across a stop, a rebuilt document and a swap. Absent: none. */
  appearances: ReadonlyMap<string, AppliedAppearance>;
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
  /** A FOREIGN Graphic's layer, for its answered calls and its step controls (foreignOgraf.ts
   *  `call`, `step`, E2.2). A NoaCG graphic has none: it steps by » Next and recovers by Snap,
   *  and neither is ever offered as an OGraf step. */
  foreignLayer(key: string): ForeignOgrafLayer | undefined;
  /** What each PUBLISHED foreign package (a payload graphic with `ograf`, E3.2a) last came to on
   *  this stage, by key: its instance and its last answered call, or why it is not mounted. This
   *  is the output's own word, what its report carries; nothing here is the controller's. */
  ografOutcomes: ReadonlyMap<string, OgrafOutcome>;
  /** Called whenever an entry of `ografOutcomes` changes. */
  onOgraf(cb: (graphic: string) => void): void;
  /** Resolves once every call sent to every package so far has settled. */
  ografSettled(): Promise<void>;
  /** A published package whose state a restart could not prove (control/ografRecovery.ts): its
   *  outcome says so, with `why`, until the operator's next Take or Out of it. */
  markUnknown(key: string, why: string): void;
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
  /** Add a graphic the stage did not host, the way a boot builds one: commands queue until its
   *  document loads, and `onLoaded` fires for it. `version` is the publication it comes from, which
   *  an imported package's base is asked with (`ografBase`). */
  add(spec: OutputGraphicSpec, version?: string): void;
  /** Take a graphic and its frame off the stage. */
  remove(graphic: string): void;
  destroy(): void;
}

/** A frame `prepare` built: hidden, and not its graphic's frame until `swapIn`. */
export interface StagedFrame {
  readonly spec: OutputGraphicSpec;
  /** Resolves once its document has loaded, or has been released on a fallback face. */
  whenLoaded: Promise<void>;
  /** The warm pass and READY check, as `OutputStage.warm`. */
  warm(data: Record<string, string> | null): Promise<PreviewReadyMessage | null>;
  /** The first error its document reported while loading, or null. */
  error(): string | null;
  /** Make it its graphic's frame, once loaded: `data` is written into it, it shows, and the frame
   *  it replaces leaves. Its graphic joins `graphics` if the stage did not host it. */
  swapIn(data: Record<string, string> | null): void;
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
  /** How those packages are driven (foreignOgraf.ts); a harness shortens the call deadline. */
  ograf?: ForeignOgrafOptions;
  /** THE BASE A PUBLISHED PACKAGE IS SERVED FROM (E3.2a): a payload graphic with `ograf` mounts from
   *  the URL this answers (the /output page asks the server, api/_lib/outputOgraf.ts), or, answered
   *  null, is not mounted and says why. Absent (the production page's monitors, which serve no
   *  package), each such graphic draws a plate saying it is not shown here while it is up. */
  ografBase?: (spec: OutputGraphicSpec, version?: string) => Promise<string | null>;
  /** The instance this output's previous document had mounted for each package (E3.2b): a package's
   *  first mount here names it as the instance it replaced, so its late word is refused. */
  ografReplaced?: Record<string, string>;
  /** An imported face's bytes this stage's payload does not hold, by path, read when a style names
   *  it: the production page's PROGRAM monitor, whose payload is built once per pool, hands the
   *  production look's own face in here, so a look turned on later reaches it with no rebuild. */
  faceAsset?: (src: string) => string | null;
}

/** How long a warm pass waits for the document's answer once it has loaded: the document caps its
 *  own wait at FRAME_HOLD_CAP_MS, so this only catches a document that answers nothing at all. */
export const WARM_ANSWER_MS = FRAME_HOLD_CAP_MS + 5_000;
/** A document that has not loaded after this long never will, as far as READY is concerned: it is
 *  not prepared (§5.2 measured 1.4 to 3 s from open to ready). */
export const FRAME_LOAD_MS = 20_000;

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
    /** The operator's layer it paints at. */
    layer: number;
    /** Its graphic's frame (as opposed to one prepared beside it). */
    current: boolean;
    /** Built by the boot and not loaded yet: `whenLoaded` waits for it. */
    boot: boolean;
    loaded: boolean;
    /** Commands waiting for the document to load. */
    queue: PreviewCmd[];
    /** Warm passes asked for before the document loaded: their answer clocks start at the load. */
    armOnLoad: (() => void)[];
    /** Warm passes waiting for the document's answer, oldest first. */
    warming: ((answer: PreviewReadyMessage | null) => void)[];
    /** What the document reported, mirrored into the per-graphic maps while it is current. */
    error: string | null;
    hold: { fonts: string[]; late: boolean } | null;
    sound: SoundStatus | null;
    loadSound?: (asset: SoundAssetRef) => Promise<Blob>;
    /** Its sound budget allocations, released with it. */
    budgetKeys: Set<string>;
    onRelease: () => void;
    whenLoaded: Promise<void>;
    /** The style its document was last told (control/cueAdjust.ts `styleKey`), '' for none. */
    styled?: string;
  }

  /** Each graphic's current frame, by key. */
  const frames = new Map<string, Frame>();
  /** Frames prepared beside a graphic's current one. */
  const staged = new Set<Frame>();
  /** The graphics in LAYER order, furthest back first: one array, kept in place, so a reader
   *  holding `stage.graphics` sees graphics join and leave. */
  const graphics: string[] = [];
  const states = new Map<string, PreviewMachineState | null>();
  const appearances = new Map<string, AppliedAppearance>();
  /** THE FRAME TRANSFORM (playout adjustments): place and size live on the frame NoaCG owns, never
   *  in the document, so no template code, reset or snap can undo them. The applied record is
   *  written on the frame as `data-appearance`, what a test reads; the identity writes nothing. */
  const paintAppearance = (iframe: HTMLIFrameElement, graphic: string) => {
    const look = appearances.get(graphic);
    const css = frameCss(look);
    iframe.style.transform = css.transform;
    iframe.style.transformOrigin = css.origin;
    if (look) iframe.dataset.appearance = JSON.stringify(look);
    else delete iframe.dataset.appearance;
  };
  /** An imported face's bytes, for a declaration's `src`: the graphic's own copy of the file first,
   *  then any graphic of this production that ships it (the production holds a face once). */
  const assetData = (graphic: string, src: string): string | null => {
    const own = frames.get(graphic)?.spec.assets.find((a) => a.path === src);
    if (own) return own.data;
    for (const f of frames.values()) {
      const found = f.spec.assets.find((a) => a.path === src);
      if (found) return found.data;
    }
    return options.faceAsset?.(src) ?? null;
  };
  /** TYPE AND COLOUR (phase 2): unlike the frame transform, style lives in the document, so it is
   *  told to the graphic's current document whenever it changes and to each new one it moves to. */
  /** `alone`: no data update rides with this style (a send to on-air graphics, phase 3), so the
   *  document refits with the values it airs instead of waiting for one. */
  const paintStyle = (frame: Frame, alone = false) => {
    const look = appearances.get(frame.key);
    const key = styleKey(look);
    if ((frame.styled ?? '') === key) return;
    frame.styled = key;
    postTo(frame, { cmd: 'style', vars: look?.vars ?? null, faces: facesCss(look?.fonts, (src) => assetData(frame.key, src)), ...(alone ? { alone: true } : {}) });
  };
  const overflow = new Map<string, string[]>();
  const motion = new Map<string, number>();
  const replies = new Map<string, number>();
  const stateCbs: ((graphic: string, state: PreviewMachineState | null, overflow: string[]) => void)[] = [];
  let resolveLoaded: () => void = () => {};
  const allLoaded = new Promise<void>((resolve) => {
    resolveLoaded = resolve;
  });
  /** The payload's NoaCG graphics; a published foreign package (`ograf`) is never composed. */
  const isNative = (spec: OutputGraphicSpec) => spec.ograf === undefined;
  /** Boot frames not loaded yet; a payload with no graphics has nothing to wait for. */
  let bootPending = payload.graphics.filter(isNative).length;
  if (bootPending === 0) resolveLoaded();
  const bootSettled = (frame: Frame) => {
    if (!frame.boot) return;
    frame.boot = false;
    if ((bootPending -= 1) === 0) resolveLoaded();
  };
  const held = new Map<string, { fonts: string[]; late: boolean }>();
  const heldCbs: (() => void)[] = [];
  const errors = new Map<string, string>();
  const errorCbs: ((graphic: string) => void)[] = [];
  const loadedCbs: ((graphic: string) => void)[] = [];
  const encoded = new Map<string, Promise<Blob>>();
  const soundDeadlines = new Set<ReturnType<typeof setTimeout>>();
  const sounds = new Map<string, SoundStatus>(), soundCbs: ((graphic: string) => void)[] = [];
  const budget = options.soundBudget ?? createSoundBudget(), budgetId = ++soundStageId;
  let frameSerial = 0;
  let destroyed = false;
  /** The whole stage off air (`setVisible(false)`) and its sounds quiet (`setSoundQuiet(true)`):
   *  a frame that joins later is told the same before it can be seen or heard. */
  let offAir = false;
  let quiet = false;

  const release = (frame: Frame) => {
    if (frame.loaded) return;
    frame.loaded = true;
    // A prepared frame stays hidden: it reaches air only through `swapIn`.
    if (frame.current) frame.iframe.style.visibility = 'visible';
    const queue = frame.queue;
    frame.queue = [];
    for (const cmd of queue) postPreviewCmd(frame.iframe.contentWindow, cmd);
    bootSettled(frame);
    for (const arm of frame.armOnLoad) arm();
    frame.armOnLoad = [];
    frame.onRelease();
    if (frame.current) for (const cb of loadedCbs) cb(frame.key);
  };
  const postTo = (frame: Frame, cmd: PreviewCmd) => {
    if (!frame.loaded) frame.queue.push(cmd);
    else postPreviewCmd(frame.iframe.contentWindow, cmd);
  };
  // Commands QUEUE until the iframe's document has loaded its command listener — a
  // postMessage into an unloaded srcdoc is silently lost, which is exactly what ate the boot
  // recovery burst on a renderer refresh (live commands worked; the restore did not).
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
    Number.isFinite(spec.layer) ? Number(spec.layer) : (frames.get(spec.key)?.layer ?? graphics.length + 1);

  /** Build a document for `spec` into the stage: last, or right after the frame `after` (moving
   *  an iframe later would load its document again). */
  const makeFrame = (spec: OutputGraphicSpec, layer: number, current: boolean, loadSound?: Frame['loadSound'], after?: HTMLIFrameElement): Frame => {
    const iframe = document.createElement('iframe');
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
      id: ++frameSerial,
      key: spec.key,
      spec,
      iframe,
      layer,
      current,
      boot: false,
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
      const hold = frame.hold;
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

  /** A frame becomes its graphic's. Its overflow and playhead start over; the machine state is
   *  left as the last frame said it, so a new frame's first reply reports only if it differs, and
   *  the reply count keeps counting, so a wait for stillness never reads a reset as an answer. A
   *  frame joining a stage that is off air or quiet is told so before it can be seen or heard. */
  const adopt = (frame: Frame, append = false) => {
    frames.set(frame.key, frame);
    if (graphics.indexOf(frame.key) < 0) {
      // The boot keeps the payload's order; a graphic joining later goes in by its layer, in front
      // of any already on the same layer.
      let at = graphics.length;
      while (!append && at > 0 && (frames.get(graphics[at - 1])?.layer ?? 0) > frame.layer) at -= 1;
      graphics.splice(at, 0, frame.key);
    }
    if (!states.has(frame.key)) states.set(frame.key, null);
    overflow.set(frame.key, []);
    motion.set(frame.key, 0);
    if (!replies.has(frame.key)) replies.set(frame.key, 0);
    if (offAir) postTo(frame, { cmd: 'offair', on: true });
    if (quiet) postTo(frame, { cmd: 'sound-quiet', on: true });
  };

  /** Take a frame off the stage for good: its document, its waits and its sound budget. */
  const dispose = (frame: Frame) => {
    staged.delete(frame);
    // A boot frame that goes before it ever loaded must not hold `whenLoaded` for good.
    bootSettled(frame);
    for (const settle of frame.warming.slice()) settle(null);
    frame.budgetKeys.forEach((key) => budget.release(key));
    frame.budgetKeys.clear();
    frame.iframe.remove();
  };

  payload.graphics.forEach((spec, index) => {
    if (!isNative(spec)) return;
    const frame = makeFrame(spec, layerOf(spec, index), true);
    frame.boot = true;
    adopt(frame, true);
  });

  // A stranger's package never goes through composeDocument: its own frame, its own bridge.
  const foreign = new Map<string, ForeignOgrafLayer>();
  const ografReturns = new Map<string, readonly OgrafReturn[]>();
  /** Every foreign layer's load, and every published package's mount (or its failure). */
  const ografLoads: Promise<void>[] = [];
  /** `again`: a re-cue's mount, which nothing waiting for the stage's first load waits on. */
  const mountSpec = (spec: ForeignOgrafSpec, again = false): boolean => {
    try {
      const layer = mountForeignOgraf(stage, spec, payload.resolution, options.ograf);
      foreign.set(spec.key, layer);
      ografReturns.set(spec.key, layer.returns);
      if (!again) ografLoads.push(layer.loaded);
      // A layer that joins a stage already off air (a boot's catch-up) is told so before anything
      // it was sent meanwhile can play: the replay settles unseen, as for a NoaCG frame (`adopt`).
      if (offAir) layer.setOffAir(true);
      return true;
    } catch (err) {
      console.error(`output stage: foreign package "${spec.key}" skipped:`, err);
      return false;
    }
  };
  // One bad package is that package's problem: the rest of the stage still airs.
  for (const spec of options.foreign ?? []) {
    if (frames.has(spec.key) || foreign.has(spec.key)) {
      console.error(`output stage: foreign package "${spec.key}" skipped, its key is already on the stage`);
      continue;
    }
    mountSpec(spec);
  }

  // ── PUBLISHED FOREIGN PACKAGES (E3.2a) ──────────────────────────────────────────────────────
  const ografOutcomes = new Map<string, OgrafOutcome>();
  const ografCbs: ((graphic: string) => void)[] = [];
  const notify = (key: string) => {
    for (const cb of ografCbs) cb(key);
  };
  const told = (key: string, outcome: OgrafOutcome) => {
    ografOutcomes.set(key, outcome);
    notify(key);
  };
  /** Commands that reached a package whose base is still being asked for, in order. Bounded: a
   *  base that never answers cannot grow it, and what it held is lost with the mount anyway. */
  const waitingOgraf = new Map<string, ControlMessage[]>();
  const WAITING_KEPT = 200;
  /** A package this stage cannot mount: a plate on its layer says so while it is up, so a monitor
   *  never shows an empty picture as the package's. */
  const plates = new Map<string, HTMLDivElement>();
  const plateFor = (spec: OutputGraphicSpec, layer: number, why: string) => {
    const plate = document.createElement('div');
    plate.dataset.layer = String(layer);
    plate.dataset.ograf = 'unavailable';
    plate.dataset.testid = 'ograf-unavailable';
    plate.title = why;
    plate.textContent = `${spec.key} · not shown here`;
    plate.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'transform:translate(-50%,-50%)',
      'max-width:90%',
      `z-index:${layer}`,
      'padding:32px 56px',
      'border-radius:24px',
      'background:rgba(15,17,21,0.82)',
      'color:#e8eaed',
      'font:600 112px/1.2 system-ui,sans-serif',
      'text-align:center',
      'display:none',
    ].join(';');
    stage.appendChild(plate);
    plates.set(spec.key, plate);
  };
  /** RECOVERY (E3.2b, AC-3), per published package: where it is served from, so a re-cue can mount
   *  it again; the values it holds, merged, so a new instance gets them before its Take; whether
   *  its instance stopped answering or never loaded (`lost`); and why its state is not proven after
   *  a restart (`unknown`, until the operator's next Take or Out). */
  const servedFrom = new Map<string, { layer: number; spec: OutputGraphicSpec; base: string }>();
  const ografData = new Map<string, Record<string, unknown>>();
  const lost = new Set<string>();
  const unknownWhy = new Map<string, string>();
  /** The operator's Take or Out sent to the current instance and not yet answered by it. */
  const sentCall = new Map<string, 'play' | 'stop'>();
  /** The instance an output's earlier document had mounted, by key (output/main.ts reads it from
   *  the tab's session): the first mount here names it as the one it replaced. */
  const replacedOnBoot = new Map(Object.entries(options.ografReplaced ?? {}));
  /** Mount a package from its base and say what it does from its `load()` answer on. */
  const attach = (key: string, layer: number, spec: OutputGraphicSpec, base: string, was: string | undefined, again = false): boolean => {
    // `load()` starts from the defaults its schema declares, so a Graphic that builds itself from
    // its data in `load()` has what its manifest says it starts with; a cue's values follow on Take.
    if (!mountSpec({ key, layer, packageBase: base, manifest: spec.ograf?.manifest, data: ografLoadData(spec.ograf?.manifest) }, again)) return false;
    servedFrom.set(key, { layer, spec, base });
    lost.delete(key);
    sentCall.delete(key);
    const layerNow = foreign.get(key)!;
    paintAppearance(layerNow.frame, key);
    let on = false;
    acts.set(key, 0);
    // Nothing is said until the Graphic answers its `load()`: a frame built is not a package loaded.
    layerNow.onAnswer((call, answer, newest) => {
      // LATE WORD FROM AN OLD INSTANCE (E3.2b): one replaced or removed says nothing more here.
      if (foreign.get(key) !== layerNow) return;
      // Only the newest Take, step or Out says whether it is up: an older one answering late
      // (a Take that settles after the Out pressed behind it) moves nothing.
      if (answer.status === 'done' && newest) {
        if (call === 'play') on = true;
        else if (call === 'stop') on = false;
      }
      // Refused by the Graphic, an action changed nothing. Counted back only while no Take, step or
      // Out was sent after it (`newest`): past one, it stays counted, which errs towards not known.
      if (call === 'custom' && answer.status === 'rejected' && newest) acts.set(key, Math.max(0, (acts.get(key) ?? 0) - 1));
      // The newest Take, step or Out answered (accepted or refused): `on` says where it is again.
      if (newest && (call === 'play' || call === 'stop') && (answer.status === 'done' || answer.status === 'rejected')) sentCall.delete(key);
      // An instance that answered nothing at all (its document or bridge is gone), or never loaded,
      // is not trusted with the next Take: that Take mounts the package again (`apply`). A Graphic
      // the host timed out is alive and only slow: it keeps its instance and what its actions built.
      if ((answer.status === 'timeout' && answer.unanswered) || (call === 'mount' && answer.status !== 'done')) lost.add(key);
      const at = layerNow.position().at;
      const why = unknownWhy.get(key);
      told(key, {
        i: layerNow.instance,
        call,
        status: answer.status,
        ...('statusCode' in answer ? { code: answer.statusCode } : {}),
        ...('statusMessage' in answer && answer.statusMessage ? { msg: answer.statusMessage } : 'reason' in answer ? { msg: answer.reason } : {}),
        step: at,
        on,
        ...((acts.get(key) ?? 0) > 0 ? { acted: true as const } : {}),
        ...(why ? { unknown: why } : {}),
        ...(was ? { was } : {}),
        ...(sentCall.has(key) ? { sent: sentCall.get(key) } : {}),
      });
    });
    return true;
  };
  /** Per mounted package, the actions its instance was sent that the Graphic did not refuse: their
   *  effect is in the Graphic alone, no restart repeats them, and OGraf promises no Take or Out
   *  undoes them, so they count for the instance's whole life (a new instance starts at none). */
  const acts = new Map<string, number>();
  const mountPublished = (spec: OutputGraphicSpec, layer: number, version?: string) => {
    const key = spec.key;
    if (frames.has(key) || foreign.has(key) || waitingOgraf.has(key) || plates.has(key)) return;
    const ask = options.ografBase;
    if (!ask) {
      plateFor(spec, layer, 'An imported OGraf package plays on the outputs; this monitor does not load it.');
      told(key, { i: null, status: 'unmounted', msg: 'not loaded on this monitor', on: false });
      return;
    }
    waitingOgraf.set(key, []);
    ografLoads.push(
      ask(spec, version)
        .catch(() => null)
        .then(async (base) => {
          const held = waitingOgraf.get(key);
          waitingOgraf.delete(key);
          if (destroyed || !held) return;
          const was = replacedOnBoot.get(key);
          replacedOnBoot.delete(key);
          if (base === null || !attach(key, layer, spec, new URL(base, location.href).href, was)) {
            told(key, { i: null, status: 'unmounted', msg: 'its package could not be reached', on: false });
            return;
          }
          const layerNow = foreign.get(key)!;
          for (const msg of held) send(key, layerNow, msg);
          await layerNow.loaded;
        }),
    );
  };
  /**
   * AN EXPLICIT RE-CUE OF A LOST INSTANCE (E3.2b, AC-3): its frame stopped answering (a dropped
   * host or bridge) or its `load()` failed (an asset gone), so the Take mounts the package again
   * as a new instance, which names the one it replaced. The old one's calls still out read `gone`
   * and nothing it says reaches this stage again. The new one is given the values held, then the
   * Take. Nothing else mounts again by itself: a restart repeats no call on its own.
   */
  const remount = (key: string): ForeignOgrafLayer | undefined => {
    const from = servedFrom.get(key);
    const old = foreign.get(key);
    if (!from || !old) return old;
    old.destroy();
    foreign.delete(key);
    ografReturns.delete(key);
    if (!attach(key, from.layer, from.spec, from.base, old.instance, true)) {
      told(key, { i: null, status: 'unmounted', msg: 'its package could not be reached', on: false });
      return undefined;
    }
    // Until the new instance answers its `load()`, its word is that nothing about it is known: the
    // old instance's would ride a report banked meanwhile, whose cursor already counts the Take and
    // any action sent to the new one, and a restart would read the old state as proven. Off, at no
    // known step, so the Take that follows is said as `sent` and a restart reads it unconfirmed; the
    // page says it is not known, and its load answer replaces this word. Not a load answer, so READY
    // waits for the real one (`ografCheck`).
    const layerNow = foreign.get(key)!;
    const prev = ografOutcomes.get(key);
    ografOutcomes.set(key, { i: layerNow.instance, call: 'play', status: 'gone', step: null, on: false, unknown: UNKNOWN_REMOUNTED, ...(prev?.i ? { was: prev.i } : {}) });
    const data = ografData.get(key);
    if (data && Object.keys(data).length > 0) layerNow.send({ t: 'update', data } as ControlMessage);
    return layerNow;
  };
  /** One message to a mounted package, with the bookkeeping recovery reads. */
  const send = (key: string, layer: ForeignOgrafLayer, msg: ControlMessage) => {
    const call = ografCallFor(msg)?.call;
    if (call === 'custom') acts.set(key, (acts.get(key) ?? 0) + 1);
    layer.send(msg);
    // Said at once, not with the answer: a report banked meanwhile counts the row as applied, so a
    // restart before the answer must read an action as `acted` and a Take, step or Out as no known
    // step, never the state before it.
    // A Take or Out leaves `on` as it was until its answer, so it is said as `sent` meanwhile.
    const sent = msg.t === 'play' || msg.t === 'stop' ? msg.t : null;
    if (sent && foreign.get(key) === layer) sentCall.set(key, sent);
    const now = ografOutcomes.get(key);
    if (!now || now.i !== layer.instance) return;
    const acted = call === 'custom' && !now.acted;
    const moved = (call === 'play' || call === 'stop') && (now.step !== null || (sent !== null && now.sent !== sent));
    if (acted || moved) told(key, { ...now, ...(acted ? { acted: true as const } : {}), ...(moved ? { step: null, ...(sent ? { sent } : {}) } : {}) });
  };
  payload.graphics.forEach((spec, index) => {
    if (!isNative(spec)) mountPublished(spec, layerOf(spec, index));
  });


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
      frame.sound = { n: s.n, of: s.of, bytes: s.bytes, error: typeof s.error === 'string' ? s.error : null };
      if (!frame.current) return;
      sounds.set(frame.key, frame.sound);
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
      if (frame.error !== null) return;
      const message = (frame.error = String((ev.data as PreviewErrorMessage).message ?? 'error').slice(0, 200));
      if (!frame.current) return;
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
      frame.hold = { fonts, late: false };
      if (frame.current) held.set(frame.key, frame.hold);
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

  /** Graphics whose data on this stage is a typed envelope's (E1.2a). */
  const typedAiring = new Set<string>();
  const apply = (graphic: string, msg: ControlEventRow['msg']) => {
    // A status row has no OGraf meaning either; ografCallFor drops whatever it cannot map.
    // TYPED DATA (E1.2a): an update's envelope values are the graphic's data as they are, never
    // strings; one this build cannot read sends no data at all (the output's gate refused it first).
    const typedMember = msg.t === 'update' && 'typed' in msg && msg.typed !== undefined;
    const typedData = typedMember ? (typedValuesOf(msg.typed)?.values ?? null) : null;
    // The output's rule (model/ografTyped.ts `typedOutputGate`), here for every stage, the page's
    // PROGRAM monitor included: on a graphic airing typed data, a data road's native update (`src`)
    // moves its look only, and an operator's native update ends the typed data.
    let dataless = typedMember && !typedData;
    if (msg.t === 'update') {
      if (typedData) typedAiring.add(graphic);
      else if (!typedMember && typedAiring.has(graphic)) {
        if ((msg as { src?: unknown }).src !== undefined) dataless = true;
        else typedAiring.delete(graphic);
      }
    }
    // A plate shows while its package is up: from a Take or a snap until an Out.
    const plate = plates.get(graphic);
    if (plate && (msg.t === 'play' || msg.t === 'snap')) plate.style.display = '';
    else if (plate && msg.t === 'stop') plate.style.display = 'none';
    let foreignLayer = foreign.get(graphic);
    const waiting = waitingOgraf.get(graphic);
    if (foreignLayer || waiting) {
      // The operator's Take or Out ends what a restart could not prove (`markUnknown`); a Take on
      // an instance that is lost mounts the package again.
      if (msg.t === 'play' || msg.t === 'stop') unknownWhy.delete(graphic);
      if (foreignLayer && msg.t === 'play' && lost.has(graphic)) foreignLayer = remount(graphic);
      const deliver = (m: ControlMessage) => {
        if (foreignLayer) send(graphic, foreignLayer, m);
        else if (waiting && waiting.length < WAITING_KEPT && ografCallFor(m)) waiting.push(m);
      };
      // PLACE AND SIZE ONLY (playout adjustments AC-10, E3.2b): a package's frame takes the frame
      // transform of the appearance, as a NoaCG graphic's does; type and colour have no hook in the
      // standard, so they reach it not at all. An update that carried nothing else ends here.
      if (msg.t === 'update' && 'appearance' in msg && msg.appearance !== undefined) {
        const look = readAppearance(msg.appearance);
        if (look) {
          if (look.frame) appearances.set(graphic, { v: 1, frame: look.frame });
          else appearances.delete(graphic);
          if (foreignLayer) paintAppearance(foreignLayer.frame, graphic);
        }
      }
      if (msg.t === 'update') {
        const values = typedData ?? (dataless ? null : msg.data);
        if (values && Object.keys(values).length > 0) ografData.set(graphic, { ...ografData.get(graphic), ...values });
      }
      if (typedData) return deliver(msg as ControlMessage);
      if (dataless) return;
      if (msg.t === 'update' && 'appearance' in msg && msg.appearance !== undefined) {
        if (Object.keys(msg.data ?? {}).length === 0) return;
        return deliver({ t: 'update', data: msg.data });
      }
      return deliver(msg as ControlMessage);
    }
    if (!frames.has(graphic)) return;
    switch (msg.t) {
      case 'update': {
        // Rule 1: an update without an appearance keeps the one applied; rule 3: one that carries
        // it replaces it. Applied at once, before the data, with no replay (a cut, as a Take is).
        const look = 'appearance' in msg && msg.appearance !== undefined ? readAppearance(msg.appearance) : null;
        // AN APPEARANCE-ONLY UPDATE (empty `data`, a send to on-air graphics) carries no values of
        // its own: its style refits at once with the values the document last took.
        const alone = !!look && !typedData && Object.keys(msg.data ?? {}).length === 0;
        if (look) {
          if (isIdentity(look)) appearances.delete(graphic);
          else appearances.set(graphic, look);
          paintAppearance(frames.get(graphic)!.iframe, graphic);
          paintStyle(frames.get(graphic)!, alone);
        }
        if (dataless) break;
        post(graphic, { cmd: 'update', data: JSON.stringify(typedData ?? msg.data ?? {}) });
        break;
      }
      case 'play':
        post(graphic, { cmd: 'play' });
        break;
      case 'stop':
        post(graphic, { cmd: 'stop', sound: msg.sound });
        break;
      case 'next':
        post(graphic, { cmd: 'next' });
        break;
      case 'event': {
        // A TYPED ACTION (E2.1): its arguments reach the graphic as the JSON they are; one this
        // build cannot read reaches it not at all (the output's gate refused it first).
        const typed = msg.typed === undefined ? null : readTypedWire(msg);
        if (msg.typed !== undefined && !(typed && 'action' in typed)) return;
        const payload = typed && 'action' in typed ? (typed.args ?? {}) : msg.payload;
        // `at` rides along: a graphic that runs its own clock anchors it to the row's instant
        // rather than to this renderer's Date.now(), so every renderer agrees (controlModel.ts).
        post(graphic, { cmd: 'dispatch', event: msg.event, payload, at: msg.at });
        break;
      }
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
    setSoundQuiet: (on) => {
      quiet = on;
      for (const key of frames.keys()) post(key, { cmd: 'sound-quiet', on });
    },
    apply,
    requestState: (graphic) => {
      // Polls are droppable pre-load — queueing them would just replay stale asks.
      if (frames.get(graphic)?.loaded) post(graphic, { cmd: 'state' });
    },
    states,
    appearances,
    overflow,
    motion,
    replies,
    onState: (cb) => stateCbs.push(cb),
    graphics,
    ografReturns,
    foreignLayer: (key) => foreign.get(key),
    ografOutcomes,
    onOgraf: (cb) => ografCbs.push(cb),
    ografSettled: () => Promise.all([...foreign.values()].map((layer) => layer.settled())).then(() => undefined),
    markUnknown: (key, why) => {
      if (!foreign.has(key) && !waitingOgraf.has(key)) return;
      unknownWhy.set(key, why);
      const now = ografOutcomes.get(key);
      if (now && now.i !== null) told(key, { ...now, unknown: why });
    },
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
      offAir = !visible;
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
    whenLoaded: () => (ografLoads.length ? Promise.all([allLoaded, ...ografLoads]).then(() => undefined) : allLoaded),
    rescale,
    prepare: (spec, prepOptions = {}) => {
      // A published package is not rebuilt beside itself, nor replaced by a NoaCG graphic of its name:
      // either changes on this output when the output loads again (E3.2b), and READY says so rather
      // than swapping in an empty document or leaving the old package driven under a new graphic.
      if (!isNative(spec) || foreign.has(spec.key) || waitingOgraf.has(spec.key) || plates.has(spec.key)) {
        const why = 'An imported OGraf package changes on this output when the output reloads.';
        return { spec, whenLoaded: Promise.resolve(), warm: () => Promise.resolve(null), error: () => why, swapIn: () => {}, discard: () => {} };
      }
      // Beside the frame it may replace, at the same place in the stack, so a swap moves nothing.
      const frame = makeFrame(spec, laterLayerOf(spec), false, prepOptions.loadSound, frames.get(spec.key)?.iframe);
      staged.add(frame);
      return {
        spec,
        whenLoaded: frame.whenLoaded,
        warm: (data) => warmFrame(frame, data),
        error: () => frame.error,
        discard: () => dispose(frame),
        swapIn: (data) => {
          if (!staged.has(frame)) return;
          staged.delete(frame);
          const old = frames.get(frame.key);
          frame.current = true;
          delete frame.iframe.dataset.prepared;
          adopt(frame);
          // The graphic's place and size go with it onto its new document.
          paintAppearance(frame.iframe, frame.key);
          paintStyle(frame);
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
          postTo(frame, { cmd: 'state' });
          if (old) {
            // Out of sight at once; its document goes a moment later, off the path of a Take that
            // is posting its entrance to the new frame right now.
            old.iframe.style.visibility = 'hidden';
            setTimeout(() => dispose(old));
          }
          if (Boolean(old && old.hold) !== Boolean(frame.hold)) for (const cb of heldCbs) cb();
          if (frame.sound) for (const cb of soundCbs) cb(frame.key);
        },
      };
    },
    add: (spec, version) => {
      if (!isNative(spec)) mountPublished(spec, laterLayerOf(spec), version);
      else if (!frames.has(spec.key)) adopt(makeFrame(spec, laterLayerOf(spec), true));
    },
    remove: (graphic) => {
      // A foreign package leaves with its instance: every call still out on it reads `gone`.
      foreign.get(graphic)?.destroy();
      foreign.delete(graphic);
      ografReturns.delete(graphic);
      waitingOgraf.delete(graphic);
      for (const map of [servedFrom, ografData, unknownWhy, acts] as Map<string, unknown>[]) map.delete(graphic);
      lost.delete(graphic);
      sentCall.delete(graphic);
      if (!frames.has(graphic)) appearances.delete(graphic);
      plates.get(graphic)?.remove();
      plates.delete(graphic);
      if (ografOutcomes.delete(graphic)) notify(graphic);
      const frame = frames.get(graphic);
      if (!frame) return;
      frames.delete(graphic);
      const at = graphics.indexOf(graphic);
      if (at >= 0) graphics.splice(at, 1);
      for (const map of [states, appearances, overflow, motion, replies, held, errors, sounds] as Map<string, unknown>[]) map.delete(graphic);
      dispose(frame);
    },
    destroy: () => {
      destroyed = true; encoded.clear(); soundDeadlines.forEach(clearTimeout); soundDeadlines.clear();
      for (const frame of [...frames.values(), ...staged]) frame.budgetKeys.forEach((key) => budget.release(key));
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', rescale);
      for (const layer of foreign.values()) layer.destroy();
      stage.remove();
    },
  };
}
