import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { composeDocument } from '../../preview/composeDocument';
import { postPreviewCmd, PREVIEW_BOX_TYPE, type PreviewCmd } from '../../preview/previewProtocol';
import {
  CANVAS_MARK,
  CANVAS_RECTS_TYPE,
  postCanvasCmd,
  type CanvasFrame,
  type CanvasRect,
  type CanvasRectsMessage,
} from '../../preview/canvasControlProtocol';
import type { SpxTemplate } from '../../model/types';
import { hasMeasuredMotion, parseAnimData } from '../../blocks/animData';

/** Screen px of breathing room between a highlighted layer and its box. */
const HL_PAD = 4;

/**
 * TEXT AND ITS BOX, SHOWN ON THE CANVAS (docs/TEXT_BOX_BINDING.md, "the preview overlay").
 *
 * The mapping step's checklist says which box a line lives in; this is the same sentence drawn
 * on the artwork, so a reader can see it rather than take the checklist's word for it. Four
 * parts, and each one answers a different question a student would ask out loud:
 *
 *  - THE BOX, washed amber - "which shape is this?" Painted by the shape itself, through the
 *    canvas channel's `'mark'` command, so it lights up as the shape the designer drew however
 *    they turned it. Nothing here draws it.
 *  - THE INSIDE, a dashed rectangle at the margins the fit keeps, with the two figures - "how
 *    much room is there?"
 *  - THE TEXT BOUNDS, a thin line round the block as it stands right now - and the gap between
 *    that line and the dashed one is how much room is left.
 *  - THE ALIGNMENT CARET under the block at its anchor, with the word - "which way does a
 *    longer value fill?"
 *
 * EVERYTHING BUT THE WASH IS DRAWN IN THE LINE'S OWN FRAME, which is the frame the runtime
 * measures the fit in (`svgAlignOf` and `svgLocalBox`, importedDesign/svg.ts). Text and plate
 * almost always carry the same rotation, so that frame IS the plate turned; where they differ it
 * is the reading direction, which is the direction a longer value fills. Drawing the room square
 * to the plate instead would show a rectangle the ladder is not using.
 *
 * The box, the insets and the alignment are MEASURED BY THE STEP on its own render of the
 * artwork, because they are facts about the drawing rather than about whatever value is on air
 * here this second (`MapSvgFieldsStep.boxFitOf`). They arrive in the line's own units, and land
 * on this canvas unchanged: `getBBox` leaves out every transform and the mapping between two
 * elements is a ratio of their matrices, so a uniform page scale cancels and one canvas can
 * measure what the other draws.
 */
export interface PreviewBoxOverlay {
  /** The shape the hovered line lives in - a selector inside the running document. The only
   *  part of this the app does not draw: the shape washes ITSELF, through the canvas channel's
   *  `'mark'` command, so the wash is the shape whatever the designer did to it. */
  selector: string;
  /** That shape's room, in the LINE's own units. */
  box: { x: number; y: number; width: number; height: number };
  /** The margin the fit keeps on each axis, in the same units - the gap the designer left,
   *  mirrored, except on an axis the block is centred on, where that gap is half the centring
   *  rather than a margin and a typographic one stands in for it (`MapSvgFieldsStep.boxFitOf`). */
  insetX: number;
  insetY: number;
  /** How they aligned the block in that box, in the words the reader is shown. */
  align: { h: 'left' | 'centred' | 'right'; v: 'top' | 'middle' | 'bottom' };
}

/** How long the demo holds the settled graphic before taking it off, and how long it stays off
 *  before coming back. Viewing rhythm rather than motion, so these stay fixed: the MOTION is
 *  what the speed knob has to change, and a hold that scaled with it would cancel that out. */
const DEMO_HOLD_MS = 900;
const DEMO_GAP_MS = 350;

/** When the lifecycle demo should stop and replay, from the template's own animation data.
 *  Falls back to the fixed pair this used to hard-code for a template whose region does not
 *  parse (a legacy or hand-rewritten one), which is the honest answer when the clock is
 *  unreadable. */
function demoCycle(js: string): { stopAt: number; replayAt: number } {
  const data = parseAnimData(js);
  const steps = data?.steps ?? [];
  if (!data || steps.length < 2) return { stopAt: 1700, replayAt: 2800 };
  const speed = data.speed || 1;
  const inMs = ((steps[0].duration || 0) / speed) * 1000;
  const outMs = ((steps[steps.length - 1].duration || 0) / speed) * 1000;
  const stopAt = Math.round(inMs + DEMO_HOLD_MS);
  return { stopAt, replayAt: Math.round(stopAt + outMs + DEMO_GAP_MS) };
}

interface Props {
  template: SpxTemplate;
  /** Bumping this replays the animation (used when the user changes the animation). */
  replayKey?: number;
  /** Demo the full lifecycle — in, hold, out, back in — after each (re)play. */
  demoOut?: boolean;
  /** Import graphic's Prepare step: override the FIRST field's pushed value, so the
   *  content-width slider drives the emitted stretch runtime live. Null = the samples. */
  demoText?: string | null;
  /**
   * The SVG mapping step's hover highlight (docs/SVG_IMPORT_PLAN.md §6a step 1): a CSS
   * selector inside the running document to outline, or null for none. The preview is that
   * step's ONE canvas — it is the only surface carrying the emitted fit runtime, so it is the
   * only one that can answer "what does this value actually look like" — and this is how a
   * checklist row still says which layer it means. Setting it installs composeDocument's
   * `canvasControl` channel, which pushes the tracked rect every frame; nothing reaches into
   * the iframe (it carries no allow-same-origin, like every other preview surface).
   */
  highlightSelector?: string | null;
  /**
   * TEXT AND ITS BOX (see `PreviewBoxOverlay`): the box the highlighted line lives in, with the
   * room the designer left round it and the alignment they drew. Null for a line with no box -
   * text sitting straight on the artwork has no room to show and nothing to be aligned in, so
   * the plain outline is the whole truthful answer there.
   */
  boxOverlay?: PreviewBoxOverlay | null;
  /**
   * ADD A FIELD BY DRAWING ONE (docs/SVG_IMPORT_PLAN.md §6a step 3). A selector inside the
   * running document: the space a drawn box is reported IN, as fractions of that element's own
   * rect, so this component never learns what a design px is.
   *
   * It is passed for the whole step, not only while the marquee is armed, because the rect
   * arrives on the document's next FRAME — arming it at the moment of the gesture would leave
   * the first drag after the button with nothing to measure against, and a field the reader
   * drew would silently not appear.
   */
  drawIn?: string | null;
  /** Arm the marquee. `drawIn` says where a box lands; this says the reader is drawing one. */
  drawing?: boolean;
  /** The drawn box, as fractions (0..1) of `drawIn`'s rect. */
  onDraw?: (box: { x: number; y: number; w: number; h: number }) => void;
  /**
   * THE CANVAS AS A CONTROL SURFACE (docs/SVG_IMPORT_PLAN.md §6a step 5): the selectors the
   * reader may point at. Tracked like everything else, and hit-tested HERE rather than in the
   * document - the iframe carries no allow-same-origin, so nothing can reach in and ask what is
   * under a pointer. It does not need to: the rect channel already pushes every tracked
   * selector's box each frame, and the candidate list is the app's own
   * (`preview/canvasControlProtocol.ts` states this as its core design move).
   */
  pickable?: string[];
  /** The layer under the pointer, or null. Lets the checklist point back at the canvas. */
  onPickHover?: (selector: string | null) => void;
  /**
   * A layer the reader picked. `drag` is the dominant direction of a click-DRAG on it, or null
   * for a plain click - which is how "drag its direction" says which way a panel grows without
   * a second control to find.
   */
  onPick?: (selector: string, drag: 'x' | 'y' | null) => void;
  /**
   * This step is ABOUT the motion (the Animation step), so the entrance is played from zero
   * on every rebuild even when that means watching a credit roll travel for eighteen seconds -
   * which is exactly what the reader asked to see there.
   *
   * Off it, a graphic whose motion is MEASURED settles instead (blocks/animData.ts
   * `hasMeasuredMotion`). Measured motion is content-length motion and starts with its content
   * off-stage, so playing it on the Fields or Style step answers "what does this design look
   * like" with an empty box for the first second and a half - measured on cr01, which is not
   * recognisably a credit roll until about twelve. ▶ Replay still plays it on any step.
   */
  rehearse?: boolean;
}

/**
 * The wizard's persistent live preview: the real composed template in a scaled iframe.
 * The entrance plays automatically on every (debounced) rebuild so each choice is felt
 * immediately; Replay / Out let the user test the motion at any time.
 *
 * The brief behind a template can be an AI prompt or an imported file, so this iframe carries no
 * `allow-same-origin` like every other preview surface — a generated document must never be able
 * to read the app's own origin (a stored provider key, a signed-in session) through
 * `parent.localStorage`. There is therefore no reaching in (`contentWindow.play()`,
 * `contentDocument` reads): every command goes through composeDocument's `liveControl` channel
 * (`postCmd` below posts `{ type: 'spx-preview-cmd', cmd, data? }`) and the document reports its
 * own box back (`spx-preview-box`) after any command that can move it — the same wire shape
 * GraphicThumb and MiniPreview read for their settle-once cards.
 */
export default function WizardPreview({
  template,
  replayKey = 0,
  demoOut = false,
  demoText = null,
  highlightSelector,
  boxOverlay = null,
  drawIn,
  drawing = false,
  onDraw,
  pickable,
  onPickHover,
  onPick,
  rehearse = false,
}: Props) {
  // A surface that never asks for a highlight pays nothing: the rect channel is installed only
  // for one that does (the prop present at all, even as null, is the step saying so). The box
  // overlay is deliberately NOT one of these: it is drawn in the highlighted line's own frame,
  // so a surface asking for one is already asking for the other - and a prop that changes on
  // every hover must never decide what the DOCUMENT is composed with, or pointing at a row
  // would rebuild the graphic underneath it.
  const tracking = highlightSelector !== undefined || drawIn !== undefined || pickable !== undefined;
  // The box overlay's own selector, as a stable value to depend on (the object is fresh each
  // render of the step above, exactly like `pickable`).
  const boxSel = boxOverlay?.selector ?? '';
  // The pickable set as a stable KEY: the prop is a fresh array on every render of the step
  // above, and depending on the array itself would re-post the `track` command each time.
  const pickKey = (pickable ?? []).join('|');
  const picking = pickKey.length > 0;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [srcdoc, setSrcdoc] = useState('');
  // Zoom-to-graphic: default shows the whole canvas; the toggle reframes the view onto
  // just the graphic so small formats (corner bugs, tickers) are actually inspectable.
  const [zoomed, setZoomed] = useState(false);
  // The graphic's layout box in canvas px, reported by the document itself (postMessage) rather
  // than measured here — mid-animation reports still give the settled box, since the entrance's
  // GSAP motion never transforms the root itself (presets move the box and lines inside it).
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Pending lifecycle-demo timers (out + back in) — cleared on any new play/stop.
  const demoTimers = useRef<number[]>([]);
  const clearDemo = useCallback(() => {
    demoTimers.current.forEach((t) => clearTimeout(t));
    demoTimers.current = [];
  }, []);
  useEffect(() => clearDemo, [clearDemo]);
  // The latest template, for pushing field values: the srcdoc lags the prop by the
  // debounce, and onLoad/demo timers fire from older closures — the ref never lies.
  const templateRef = useRef(template);
  templateRef.current = template;
  const demoTextRef = useRef(demoText);
  demoTextRef.current = demoText;
  // Bumped every time a new srcdoc is actually committed — an onLoad's deferred play() checks
  // this before firing, so a stale timer from a document the debounce has since replaced can
  // never send a command to whatever the iframe went on to load next.
  const docGenRef = useRef(0);

  /** Post a command into the live document (no-op if the iframe hasn't loaded one yet). */
  const postCmd = useCallback((msg: PreviewCmd) => {
    postPreviewCmd(frameRef.current?.contentWindow, msg);
  }, []);

  /** The values a push sends: the template's samples, with the demo override on field 1. */
  const pushValues = (tpl: SpxTemplate) => {
    const values = Object.fromEntries(tpl.fields.map((f) => [f.field, f.value]));
    const demo = demoTextRef.current;
    if (demo != null && tpl.fields.length) values[tpl.fields[0].field] = demo;
    return values;
  };

  // ── THE LIFECYCLE DEMO'S CLOCK (measured 2026-08-26; GOALS goal 6) ─────────────────────────
  // The owner reported that Speed and Easing did nothing on a FADE. Both reach the render: the
  // emitted NOACG_ANIM carries speed 0.6/1/1.8, the built entrance measures 1.333/0.800/0.444s,
  // and the four curves offered on a fade produce four measurably different opacity ramps. What
  // hid them was THIS loop, whose stop and replay were 1700ms and 2800ms whatever the graphic
  // did - so every speed played inside one fixed 2.8s beat, and the faster the setting the
  // LONGER the graphic then sat still (367ms of hold at Slower, 1256ms at Faster: the cadence
  // moved the wrong way). A slide survived it because travel gives a second cue - a distance
  // covered in a time - which is exactly the cue a fade does not have.
  //
  // So the beat follows the animation: entrance, a moment to read it, exit, a moment of black.
  // A ±80% speed step then changes the loop's own rhythm by well over a second, which is what
  // makes it visible across separate replays. Read off the template's own data, so a preset or
  // a speed the wizard has not been told about still gets an honest cycle.
  const demoCycleRef = useRef({ stopAt: 1700, replayAt: 2800 });
  demoCycleRef.current = useMemo(() => demoCycle(template.js), [template.js]);

  const { width, height } = template.resolution;

  // Track the stage size (the fit scale and the zoom framing both derive from it).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setStage({ w: r.width, h: r.height });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Every tracked selector's box in the document's own px, keyed by the selector that asked
  // for it (see the highlight block below). Two things want one: the hover highlight, and the
  // draw marquee, which needs the ARTWORK's box to report a drag relative to it.
  const [rects, setRects] = useState<Record<string, CanvasRect | null>>({});
  // And the FRAME of the one selector the box overlay draws in - that element's own box and the
  // matrix that puts it on the canvas. Asked for separately from the rects because the editor
  // canvas tracks hundreds of selectors and wants none of them (canvasControlProtocol.ts).
  const [frames, setFrames] = useState<Record<string, CanvasFrame | null>>({});
  // The layer under the pointer while picking (plan §6a step 5), and the grab a drag started
  // from. Declared here with the other rect state because the highlight below reads them.
  const [pickHover, setPickHover] = useState<string | null>(null);
  const pickFrom = useRef<{ x: number; y: number; sel: string } | null>(null);
  // What the highlight box is drawn around. A layer under the POINTER wins over one a checklist
  // row is pointing at: the reader's hand is the more recent statement of what they mean.
  const hoverRect = pickHover ? rects[pickHover] ?? null : highlightSelector ? rects[highlightSelector] ?? null : null;
  // THE OUTLINE IN THE LAYER'S OWN FRAME, whenever the document has answered with one: the same
  // box, turned the way the artwork is turned. A pointer on the canvas is answered with the
  // rectangle instead - it names WHICH layer is under the hand, and no frame is asked for the
  // fifty selectors that would need.
  const outlineFrame = pickHover ? null : highlightSelector ? frames[highlightSelector] ?? null : null;
  // The box the highlighted line lives in, carried WITH the frame it is stated in - the line's
  // own. There is nothing to draw until that frame has arrived, and nothing to say while a
  // pointer is picking, so the canvas makes one statement at a time.
  const room = boxOverlay && outlineFrame ? { ...boxOverlay, frame: outlineFrame } : null;
  const drawRect = drawIn ? rects[drawIn] ?? null : null;
  // The marquee being dragged, in canvas px; null when no drag is in flight.
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // A finished drag the ARTWORK HAS NOT BEEN MEASURED FOR YET (see onDrawUp). Held in canvas
  // px, exactly as the marquee was, until a rect turns up to report it against.
  const [heldBox, setHeldBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  // Whichever pointer layer is mounted - draw or pick, never both. Pointer positions become
  // canvas px against ITS box, so the two share one ref rather than one each.
  const canvasLayerRef = useRef<HTMLDivElement>(null);

  // Rebuild (debounced) when the template changes; auto-play the entrance on load.
  // Committing a new srcdoc also cancels any pending demo timers — a stop()/play()
  // scheduled against the previous document must never hit the reloading one (it
  // would blank the preview right after the user's change).
  const doc = useMemo(
    () => composeDocument(template, { liveControl: true, ...(tracking ? { canvasControl: true } : {}) }),
    [template, tracking],
  );
  // Whether this graphic's motion is measured rather than keyframed - read off the emitted
  // animation data, so it is known before the document exists (see `showFirstFrame`). A
  // template with no readable region (blank, hand-written, foreign import) has no measured
  // motion to find and plays, exactly as it always did.
  const measured = useMemo(() => {
    const data = parseAnimData(template.js);
    return !!data && hasMeasuredMotion(data);
  }, [template.js]);
  useEffect(() => {
    // A rebuild is OWED from this moment, set before the debounce even starts - the half of the
    // stamp that separates "has not started yet" from "already finished" (see the onLoad below).
    if (stageRef.current) stageRef.current.dataset.docPending = '1';
    const t = setTimeout(() => {
      clearDemo();
      docGenRef.current += 1;
      // The old document's last rects describe a layout that no longer exists — drop them
      // rather than leaving a box hanging over the new one until its first frame arrives.
      setRects({});
      setFrames({});
      setSrcdoc(doc);
    }, 220);
    return () => clearTimeout(t);
  }, [doc, clearDemo]);

  // The document's own box, reported after any command that can move it (composeDocument's
  // liveControl channel) — never read via contentDocument, since this iframe carries no
  // allow-same-origin.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== frameRef.current?.contentWindow) return;
      const msg = ev.data;
      if (msg && typeof msg === 'object' && msg.type === PREVIEW_BOX_TYPE) {
        setBox({ x: msg.x, y: msg.y, w: msg.w, h: msg.h });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ── The tracked highlight (preview/canvasControlProtocol.ts) ──
  // One selector, one rect, pushed every frame by the document — so the box follows the layer
  // through the entrance animation and through a fit that has just re-wrapped it, neither of
  // which a one-shot measurement could see. The rect arrives in the document's own px, which
  // IS canvas px (the iframe is the project's resolution and the stage scales it), so the
  // overlay wears the frame's transform and needs no maths of its own.
  useEffect(() => {
    if (!tracking) return;
    const onRects = (ev: MessageEvent) => {
      if (ev.source !== frameRef.current?.contentWindow) return;
      const msg = ev.data as CanvasRectsMessage | undefined;
      if (!msg || msg.type !== CANVAS_RECTS_TYPE) return;
      setRects(msg.rects);
      setFrames(msg.frames ?? {});
    };
    window.addEventListener('message', onRects);
    return () => window.removeEventListener('message', onRects);
  }, [tracking]);

  // Re-sent on every selector change AND on every new document (the `track` list lives in the
  // document, so a rebuilt one starts with nothing tracked until it is told again).
  const trackSelector = useCallback(() => {
    if (!tracking) return;
    const selectors = [...new Set([highlightSelector, drawIn, ...pickKey.split('|')])].filter(
      (s): s is string => !!s,
    );
    // Only the highlighted LINE wants a frame - the box overlay is stated in that line's units
    // and the wash is painted by the shape itself, so no second frame is asked for. Everything
    // else is hit-tested and outlined from a rectangle, which is what a rectangle is good for.
    const framed = [highlightSelector].filter((f): f is string => !!f);
    postCanvasCmd(frameRef.current?.contentWindow, { cmd: 'track', selectors, frames: framed });
    // THE BOX IS PAINTED BY THE SHAPE ITSELF. A rect coming out of the document is axis-aligned,
    // so a wash drawn from one would sit over the wrong thing on a plate drawn on an angle -
    // which is the defect this overlay exists to fix. Sent every time the tracking is, including
    // after a rebuild, because a fresh document wears no marks.
    postCanvasCmd(frameRef.current?.contentWindow, {
      cmd: 'mark',
      className: CANVAS_MARK.LIT,
      selectors: boxSel ? [boxSel] : [],
    });
    if (selectors.length === 0) setRects({});
    if (framed.length === 0) setFrames({});
    // The pickable set is depended on as a KEY, not as the array: a fresh array identity every
    // render would re-post `track` on every render of the step above.
  }, [tracking, highlightSelector, boxSel, drawIn, pickKey]);
  useEffect(trackSelector, [trackSelector]);

  const playIn = useCallback(() => {
    clearDemo();
    postCmd({ cmd: 'play', data: JSON.stringify(pushValues(templateRef.current)) });
    if (demoOut) {
      // Show the exit too, then come back on air so the preview isn't left empty. The two
      // moments follow the graphic's OWN clock (demoCycleRef), never a fixed pair of numbers.
      const { stopAt, replayAt } = demoCycleRef.current;
      demoTimers.current.push(
        window.setTimeout(() => postCmd({ cmd: 'stop' }), stopAt),
        window.setTimeout(() => postCmd({ cmd: 'play' }), replayAt),
      );
    }
  }, [clearDemo, demoOut, postCmd]);

  /**
   * The first frame after a rebuild: the graphic as it looks ON AIR.
   *
   * Usually that means playing the entrance, because an entrance is under a second and seeing
   * it is half of what the reader is judging. MEASURED motion is the exception, and it is a
   * different kind of thing: its length comes from the operator's text and it starts with that
   * text off-stage, so playing it from zero answers a question about the design with an empty
   * frame. Those settle instead - the parked pose the thumbnails and the operator preview
   * already use (preview/settleGraphic.ts, which carries the other half of this note).
   *
   * ▶ Replay and the Animation step (`rehearse`) always play: both are the reader asking for
   * the motion rather than for the picture.
   */
  const showFirstFrame = useCallback(() => {
    if (rehearse || !measured) { playIn(); return; }
    clearDemo();
    postCmd({ cmd: 'settle', data: JSON.stringify(pushValues(templateRef.current)) });
  }, [rehearse, measured, playIn, clearDemo, postCmd]);

  // Replay when the parent asks (e.g. animation preset changed but srcdoc identical).
  useEffect(() => {
    if (replayKey > 0) playIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);

  // Push the demo text live (no replay): the slider drives the emitted stretch runtime in
  // the running document — the user watches the REAL mechanism, not a wizard imitation.
  useEffect(() => {
    if (demoText == null) return;
    postCmd({ cmd: 'update', data: JSON.stringify(pushValues(templateRef.current)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- postCmd is stable; pushValues reads live refs
  }, [demoText]);

  // ── The draw marquee (plan §6a step 3) ──
  // The layer is laid out in CANVAS px and painted through the frame's own transform, so a
  // pointer position becomes canvas px by the ratio between the two — no zoom maths of its
  // own, the same trick the highlight overlay uses.
  const pointToCanvas = (ev: React.PointerEvent): { x: number; y: number } | null => {
    const el = canvasLayerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    return { x: ((ev.clientX - r.left) * width) / r.width, y: ((ev.clientY - r.top) * height) / r.height };
  };

  // ── The pick hit-test (plan §6a step 5) ──
  // WHICH LAYER IS UNDER THIS POINT, answered from the pushed rect map. A rect carries no paint
  // order, so the tie-break is the editor canvas's own: innermost first (greatest ancestor
  // depth), then the smallest box - a word inside a panel wins over the panel it sits on, which
  // is what someone pointing at it means.
  const pickAt = (p: { x: number; y: number }): string | null => {
    let best: { sel: string; depth: number; area: number } | null = null;
    for (const sel of pickKey ? pickKey.split('|') : []) {
      const r = rects[sel];
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      if (p.x < r.left || p.x > r.left + r.width || p.y < r.top || p.y > r.top + r.height) continue;
      const area = r.width * r.height;
      if (!best || r.depth > best.depth || (r.depth === best.depth && area < best.area)) {
        best = { sel, depth: r.depth, area };
      }
    }
    return best?.sel ?? null;
  };

  const onPickDown = (ev: React.PointerEvent) => {
    const p = pointToCanvas(ev);
    const sel = p && pickAt(p);
    if (!p || !sel) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pickFrom.current = { ...p, sel };
  };

  const onPickMove = (ev: React.PointerEvent) => {
    const p = pointToCanvas(ev);
    if (!p) return;
    // While a drag is in flight the highlight stays on what was grabbed, so the box does not
    // flicker between layers the pointer crosses on its way.
    const sel = pickFrom.current ? pickFrom.current.sel : pickAt(p);
    if (sel !== pickHover) {
      setPickHover(sel);
      onPickHover?.(sel);
    }
  };

  const onPickUp = (ev: React.PointerEvent) => {
    const from = pickFrom.current;
    pickFrom.current = null;
    if (!from || !onPick) return;
    const p = pointToCanvas(ev);
    // A DRAG says a direction, a click says none. The threshold is in canvas px, so it means the
    // same thing at every zoom - and the dominant axis wins, because a drag meant as "rightwards"
    // is never perfectly horizontal.
    const dx = p ? p.x - from.x : 0;
    const dy = p ? p.y - from.y : 0;
    const DRAG_MIN = 24;
    const drag =
      Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_MIN ? null : Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    onPick(from.sel, drag);
  };

  const onPickLeave = () => {
    if (pickFrom.current) return;
    setPickHover(null);
    onPickHover?.(null);
  };

  const onDrawDown = (ev: React.PointerEvent) => {
    const p = pointToCanvas(ev);
    if (!p) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragFrom.current = p;
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onDrawMove = (ev: React.PointerEvent) => {
    const from = dragFrom.current;
    const p = from && pointToCanvas(ev);
    if (!from || !p) return;
    setMarquee({
      x: Math.min(from.x, p.x),
      y: Math.min(from.y, p.y),
      w: Math.abs(p.x - from.x),
      h: Math.abs(p.y - from.y),
    });
  };

  // Reported RELATIVE TO THE ARTWORK, as fractions of its box: the step knows what a design
  // px is and this component deliberately does not. Clamped to the artwork because a placed
  // field is positioned inside the design unit — a box half outside it would be authored at
  // a coordinate the emitted rule cannot express.
  const reportDrawnBox = useCallback(
    (box: { x: number; y: number; w: number; h: number }, rect: CanvasRect) => {
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      const x0 = clamp((box.x - rect.left) / rect.width);
      const y0 = clamp((box.y - rect.top) / rect.height);
      const x1 = clamp((box.x + box.w - rect.left) / rect.width);
      const y1 = clamp((box.y + box.h - rect.top) / rect.height);
      onDraw?.({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    },
    [onDraw],
  );

  // A DROP IS NEVER THROWN AWAY, even when there is nothing yet to measure it against. The
  // artwork's rect arrives from INSIDE the document — a `track` post, then a frame, then a
  // message back — and every rebuild clears the whole map outright, so a reader who arms the
  // tool and drags straight away can finish the gesture in a window where `drawRect` is null.
  // This used to `return` here: the marquee vanished, no field appeared, and nothing anywhere
  // said why. It is also what red-mained CI on 2026-08-24 (issue #40) and then cleared its own
  // alarm without a fix - unreproducible in 20 local runs, and exact on the first run with the
  // rect delivery delayed by 4s. Holding the box costs a frame or two and cannot lose it.
  const onDrawUp = () => {
    const box = marquee;
    dragFrom.current = null;
    setMarquee(null);
    if (!box || !onDraw) return;
    if (drawRect && drawRect.width > 0 && drawRect.height > 0) reportDrawnBox(box, drawRect);
    else setHeldBox(box);
  };

  // The held drop, placed the moment the artwork reports a box. The rect describes the artwork,
  // which does not move while the step is open, so a box measured a frame late lands where it
  // was drawn rather than where the artwork drifted to.
  useEffect(() => {
    if (!heldBox || !drawRect || !onDraw) return;
    if (!(drawRect.width > 0) || !(drawRect.height > 0)) return;
    setHeldBox(null);
    reportDrawnBox(heldBox, drawRect);
  }, [heldBox, drawRect, onDraw, reportDrawnBox]);

  // Disarming — cancelling, or leaving the step — drops anything still held. A field appearing
  // in a graphic nobody is mapping any more is worse than the gesture that was lost.
  useEffect(() => {
    if (!drawing) setHeldBox(null);
  }, [drawing]);

  // The view: whole canvas by default; zoomed reframes onto the graphic's box.
  const fitScale = Math.min(stage.w / width, stage.h / height) || 0.2;
  let z = fitScale;
  let tx = 0;
  let ty = 0;
  if (zoomed && box) {
    const M = 48; // canvas-px breathing room around the framed graphic
    const contain = Math.min(stage.w / (box.w + M), stage.h / (box.h + M));
    // A near-canvas-wide (ticker) or -tall (credits) graphic barely gains from a
    // contain fit — fill the other axis instead and crop: that IS the detail view.
    z = contain >= fitScale * 1.3 ? contain : Math.max(stage.w / (box.w + M), stage.h / (box.h + M));
    z = Math.min(Math.max(z, fitScale), 3);
    tx = width / 2 - (box.x + box.w / 2);
    ty = height / 2 - (box.y + box.h / 2);
  }

  // ── DRAWING IN A LAYER'S OWN FRAME ──
  // Both helpers hand the element's matrix to CSS rather than doing the trigonometry here: a
  // rectangle stated in the layer's own units, transformed by the layer's own matrix, lands
  // exactly where that layer is however the artwork was turned. `transform-origin: 0 0` and
  // `box-sizing: border-box` come from the stylesheet, so these only ever compute geometry.
  //
  // ONE LOCAL UNIT IS `k` CANVAS PX, and the stage scales canvas px by `z`. So anything drawn
  // FOR THE READER rather than for the artwork - the rule's own thickness, the breathing room
  // round a block - is divided back out of both, exactly as the plain highlight divides out the
  // zoom: at the default fit a 2px rule would otherwise paint a fraction of a pixel.
  const inFrame = (f: CanvasFrame, r: { x: number; y: number; w: number; h: number }, pad: number) => {
    const k = Math.hypot(f.m[0], f.m[1]) || 1;
    const p = pad / (k * z);
    return {
      left: 0,
      top: 0,
      width: r.w + 2 * p,
      height: r.h + 2 * p,
      borderWidth: Math.max(1, 2 / z) / k,
      transform: `matrix(${f.m.join(',')}) translate(${r.x - p}px, ${r.y - p}px)`,
    };
  };
  /**
   * A point in a layer's own units, as canvas px - for a label, which must stay level and stay
   * the same size whatever the artwork does.
   *
   * `place` says which side of the point the label hangs on, and every value here keeps it OFF
   * THE WORDS: a margin on real artwork is a few units wide and a legible chip is a dozen
   * screen px, so a figure centred in the gap it measures would cover the line it is measuring
   * (seen on this board's answer plates, whose margins are 34 units at a third of a px each).
   * So the two figures sit just outside the box on the side they belong to, and only the caret
   * hangs inside - it is pointing at a place in the block, which is the one thing that has to be
   * read against the words themselves.
   */
  const atPoint = (
    f: CanvasFrame,
    x: number,
    y: number,
    place: 'under' | 'left-of' | 'above' = 'under',
  ) => ({
    left: f.m[0] * x + f.m[2] * y + f.m[4],
    top: f.m[1] * x + f.m[3] * y + f.m[5],
    transform:
      place === 'left-of'
        ? `translate(calc(-100% - 5px), -50%) scale(${1 / z})`
        : place === 'above'
          ? `translate(-50%, calc(-100% - 5px)) scale(${1 / z})`
          : `translate(-50%, 3px) scale(${1 / z})`,
    transformOrigin: place === 'left-of' ? 'right center' : place === 'above' ? 'bottom center' : 'top center',
  });

  return (
    <div className="wz-preview">
      {/* The stage is the PROJECT's own frame, not whatever space is left over: a 16:9 (or
          9:16, or 1:1) screen centred in the column, so what the reader judges has the shape
          it will air in. The aspect comes from the template because the format is the user's
          choice — CSS cannot know it (re-design/handoff.md §2). */}
      <div className="wz-stage" ref={stageRef} style={{ aspectRatio: `${width} / ${height}` }}>
        {/* A NEW IFRAME PER DOCUMENT, never a new `srcdoc` on the same one. Replacing an
            existing frame's srcdoc is a NAVIGATION, and a subframe navigation joins the page's
            session history — so every rebuild (every keystroke on the Fields step, every colour
            on Style) quietly added an entry, and the reader's Back button filled up with
            presses that did nothing. A frame that is INSERTED with its document already set
            loads it as its initial document instead, which costs no entry at all. That is what
            makes browser Back walk the wizard's steps rather than its rebuilds.
            Keyed on the same generation counter the commit bumps, and not rendered until there
            is a document to give it, so `srcdoc` is never assigned to a live frame. */}
        {srcdoc && <iframe
          key={docGenRef.current}
          ref={frameRef}
          title="Wizard live preview"
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          onLoad={() => {
            const gen = docGenRef.current;
            // THE REVISION LANDS ON THE STAGE, not on the frame: a rebuild REPLACES the frame
            // (see the note above), so a stamp on the frame is gone exactly when a waiter needs
            // to read the old one. Same contract as PreviewFrame's - `data-doc-rev` says a
            // rebuild finished, `data-doc-pending` says one is owed, and only the two together
            // can tell "not started" from "already done" (e2e/_preview.ts).
            if (stageRef.current) {
              stageRef.current.dataset.docRev = String(gen);
              delete stageRef.current.dataset.docPending;
            }
            trackSelector(); // a fresh document tracks nothing until it is told again
            setTimeout(() => {
              if (docGenRef.current === gen) showFirstFrame(); // else a newer document has since loaded
            }, 60);
          }}
          style={{ width, height, transform: `translate(-50%, -50%) scale(${z}) translate(${tx}px, ${ty}px)` }}
        />}
        {/* The highlight rides a layer wearing the FRAME's own transform, so a rect in canvas
            px lands where the reader sees that layer at any zoom. The border and the breathing
            room around the layer are the two things corrected back OUT of that scale, because
            they are drawn for the reader rather than for the artwork: at the default fit a 2px
            rule would paint half a pixel and a 4px gap would close to one. */}
        {(hoverRect || outlineFrame || drawing || picking) && (
          <div
            className="wz-stage-overlay"
            style={{ width, height, transform: `translate(-50%, -50%) scale(${z}) translate(${tx}px, ${ty}px)` }}
          >
            {/* THE INSIDE: the room the designer left, at the drawn insets mirrored, with the
                two figures. Drawn in the LINE's own frame, which is the frame the ladder measures
                the fit in - so on a plate turned three degrees under text turned with it, this is
                the plate's inside rather than a rectangle around it. The gap between this line
                and the text bounds below is how much room is left. */}
            {room && (
              <>
                <div
                  className="wz-stage-framed wz-stage-inside"
                  data-testid="wz-preview-inside"
                  style={inFrame(
                    room.frame,
                    {
                      x: room.box.x + room.insetX,
                      y: room.box.y + room.insetY,
                      w: Math.max(0, room.box.width - 2 * room.insetX),
                      h: Math.max(0, room.box.height - 2 * room.insetY),
                    },
                    0,
                  )}
                />
                {/* The two figures, each just outside the edge it measures, level and the same
                    size at any zoom - a number turned three degrees is a number nobody reads. */}
                <div
                  className="wz-stage-figure"
                  data-testid="wz-preview-inset-x"
                  style={atPoint(room.frame, room.box.x, room.box.y + room.box.height / 2, 'left-of')}
                >
                  {Math.round(room.insetX)}
                </div>
                <div
                  className="wz-stage-figure"
                  data-testid="wz-preview-inset-y"
                  style={atPoint(room.frame, room.box.x + room.box.width / 2, room.box.y, 'above')}
                >
                  {Math.round(room.insetY)}
                </div>
              </>
            )}
            {/* THE TEXT BOUNDS: the block as it stands right now, in its own frame where the
                document has answered with one and as a plain rectangle where it has not (a
                pointer on the canvas, an entrance still mid-flight). One element either way, so
                every surface that reads this box reads the same one. */}
            {outlineFrame ? (
              <div
                className="wz-stage-framed wz-stage-highlight"
                data-testid="wz-preview-highlight"
                style={inFrame(outlineFrame, {
                  x: outlineFrame.box.x,
                  y: outlineFrame.box.y,
                  w: outlineFrame.box.width,
                  h: outlineFrame.box.height,
                }, HL_PAD)}
              />
            ) : hoverRect ? (
              <div
                className="wz-stage-highlight"
                data-testid="wz-preview-highlight"
                style={{
                  left: hoverRect.left - HL_PAD / z,
                  top: hoverRect.top - HL_PAD / z,
                  width: hoverRect.width + (2 * HL_PAD) / z,
                  height: hoverRect.height + (2 * HL_PAD) / z,
                  borderWidth: Math.max(1, 2 / z),
                }}
              />
            ) : null}
            {/* THE ALIGNMENT CARET, under the block at the anchor a longer value fills from,
                with the word. Placed off the BLOCK rather than off the box, because the anchor
                is where the text actually stands - which is the thing the reader is checking. */}
            {room && (
              <div
                className="wz-stage-caret"
                data-testid="wz-preview-caret"
                style={atPoint(
                  room.frame,
                  room.frame.box.x +
                    (room.align.h === 'left'
                      ? 0
                      : room.align.h === 'centred'
                        ? room.frame.box.width / 2
                        : room.frame.box.width),
                  room.frame.box.y + room.frame.box.height,
                  'under',
                )}
              >
                <span className="wz-stage-caret-mark" aria-hidden="true">
                  ▲
                </span>
                <span>
                  {room.align.h}, {room.align.v}
                </span>
              </div>
            )}
            {/* THE PICK SURFACE. Drawing wins when both are armed: a reader who just asked to
                draw a box means the drag to make one, not to pick what is under it. */}
            {picking && !drawing && (
              <div
                ref={canvasLayerRef}
                className="wz-stage-pick"
                data-testid="wz-preview-pick"
                onPointerDown={onPickDown}
                onPointerMove={onPickMove}
                onPointerUp={onPickUp}
                onPointerCancel={onPickLeave}
                onPointerLeave={onPickLeave}
              />
            )}
            {/* The draw surface takes pointer events back (the overlay above it has none), so
                the marquee is drawn on the one canvas that is showing the real graphic. */}
            {drawing && (
              <div
                ref={canvasLayerRef}
                className="wz-stage-draw"
                data-testid="wz-preview-draw"
                // Whether the artwork has reported a box yet. A drop before it has is HELD
                // rather than lost (onDrawUp), and this is how that window is observable —
                // from a spec, and to anyone reading the DOM to work out why a drag paused.
                data-measured={drawRect && drawRect.width > 0 && drawRect.height > 0 ? 'true' : 'false'}
                onPointerDown={onDrawDown}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawUp}
                onPointerCancel={onDrawUp}
              >
                {marquee && (
                  <div
                    className="wz-stage-marquee"
                    data-testid="wz-preview-marquee"
                    style={{
                      left: marquee.x,
                      top: marquee.y,
                      width: marquee.w,
                      height: marquee.h,
                      borderWidth: Math.max(1, 2 / z),
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="wz-preview-bar">
        <span className="muted">
          Project {width}×{height} · {template.fps} fps
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={zoomed ? 'active' : ''}
            disabled={!box}
            onClick={() => { if (!zoomed) postCmd({ cmd: 'measure' }); setZoomed(!zoomed); }}
            title={zoomed ? 'Show the whole canvas again' : 'Zoom the preview to just the graphic'}
          >
            {zoomed ? '▭ Whole canvas' : '⌖ Zoom to graphic'}
          </button>
          <button onClick={playIn} title={demoOut ? 'Replay the animation (in, then out)' : 'Replay the entrance animation'}>▶ Replay</button>
          <button onClick={() => { clearDemo(); postCmd({ cmd: 'stop' }); }} title="Play the exit animation">■ Out</button>
        </div>
      </div>
    </div>
  );
}
