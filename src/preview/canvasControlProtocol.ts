/**
 * The postMessage protocol for CanvasInteraction.tsx — the editor canvas's direct-manipulation
 * layer (drag/scale/rotate handles, hit-testing, inline text editing). Distinct from
 * previewProtocol.ts's `PreviewCmd` channel: this one needs a continuous RECT STREAM (for
 * hit-testing and live position tracking) and correlated request/reply QUERIES (for GSAP-
 * resolved values a rect can't carry), neither of which the simpler play/stop/settle commands
 * need. composeDocument.ts's `canvasControl` option installs the document side.
 *
 * THE CORE DESIGN MOVE: every hit-test and measurement CanvasInteraction used to perform via
 * `contentDocument.querySelector(...).getBoundingClientRect()` reduces to "the rect of a known
 * selector" — and the set of candidate selectors (every registered template part, every field,
 * every placed-line wrapper) is already known on the app side. So instead of round-tripping a
 * query on every pointermove (the hover hit-test fires on literally every mouse-move over the
 * canvas), the document PUSHES a full rect map every animation frame (`CanvasRectsMessage`), and
 * CanvasInteraction keeps 100% of its hit-test/selection MATH unchanged, now reading a local
 * cache instead of the DOM directly. `depth` rides along with each rect (the document already has
 * to walk `parentElement` to compute it) so the innermost-first tie-break in the hit-test
 * fallback still works without a live DOM walk.
 *
 * ONE TRADE-OFF worth naming: the original hit-test tried `elementFromPoint` first (true paint-
 * order stacking) and fell back to rect-containment + depth/area tie-break only for templates
 * opting out of pointer hit-testing. The rect-push design can only offer the fallback algorithm
 * (a rect has no paint-order information), so CanvasInteraction now uses it universally. This
 * only differs from the old primary path when two rendered elements' rects overlap AND their
 * real paint order disagrees with depth/area — narrow, and the fallback was already
 * production-tested for a real class of templates.
 *
 * The few things that genuinely can't be answered from a rect — a GSAP-resolved transform value,
 * an element's live text content — go through `queryCanvas`, a correlated request/reply pair.
 * These only fire at GESTURE START (once per drag) or on a low-frequency gesture (double-click),
 * never per pointermove, so the round trip costs nothing observable.
 *
 * AND TWO THINGS A RECTANGLE IS THE WRONG SHAPE FOR, both added for the wizard's box overlay
 * (docs/TEXT_BOX_BINDING.md) and both general: a rect that comes out of the document is
 * axis-aligned, so on artwork drawn on an angle it describes a box around the wrong thing.
 * `CanvasFrame` sends the element's OWN box and its matrix instead, which lets a caller draw in
 * the element's space and let CSS do the turning; `'mark'` sends a CLASS the other way, so the
 * element paints itself and the shape is exactly whatever the designer drew. Nothing about
 * either is specific to that overlay - the frame is what any caller drawing ON a rotated layer
 * needs, and the mark is how any surface says "this one" without a rectangle.
 */

export const CANVAS_CMD_TYPE = 'spx-canvas-cmd';
export const CANVAS_QUERY_TYPE = 'spx-canvas-query';
export const CANVAS_REPLY_TYPE = 'spx-canvas-reply';
export const CANVAS_RECTS_TYPE = 'spx-canvas-rects';

/** A tracked selector's rect, in the iframe's own doc px (the same space
 *  `getBoundingClientRect()` reports in) — `null` when the selector currently resolves to
 *  nothing rendered (`getClientRects().length === 0`, mirroring `partScreenEl`'s convention: a
 *  hidden source div, an empty image slot before its wrapper fallback applies, a detached node).
 *  `depth` is the element's ancestor-chain length, computed by the document since only it can
 *  walk `parentElement` — the parent-side hit-test's innermost-first tie-break reads it instead
 *  of re-deriving it from a live DOM walk it no longer has access to. */
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
  depth: number;
}

/**
 * THE ELEMENT'S OWN FRAME - its untransformed box, and the matrix that puts that box on the
 * document. What a `CanvasRect` cannot say: a plate turned three degrees has a bounding
 * rectangle bigger than the plate, so anything drawn from that rectangle is drawn around the
 * wrong thing (docs/TEXT_BOX_BINDING.md, "the preview overlay"). A caller with the frame can
 * place any rectangle IN the element's own space - an inset, a caret, an outline that hugs the
 * tilt - by handing `m` straight to a CSS `matrix()`.
 *
 * `box` is `getBBox()`: the element's own user units, with every transform above it left out,
 * which is why the SAME numbers describe it on any canvas rendering the same markup. `m` is
 * `getScreenCTM()` - that space to document px, the space `CanvasRect` already reports in.
 *
 * An element with neither (any plain HTML node) answers with its client rect and the identity
 * matrix, which is exactly true for it and needs no branch in the caller.
 *
 * Pushed only for the selectors the `'track'` command names in `frames`, because the editor
 * canvas tracks hundreds and wants none of them: it hit-tests with rectangles.
 */
export interface CanvasFrame {
  box: { x: number; y: number; width: number; height: number };
  m: [number, number, number, number, number, number];
}

/**
 * THE CLASSES THE DOCUMENT KNOWS HOW TO PAINT, for the `'mark'` command below. A caller may
 * mark with any class name it likes; these are the ones composeDocument ships a rule for.
 *
 * `LIT` is a 12% amber wash over the marked element's own pixels - the box under a text field,
 * lit while the reader points at that field. It is a class rather than an app-side box because
 * the wash then rides the element's own transform and its own outline: a rotated plate, a
 * rounded one, a freehand path all light up as the shape the designer drew.
 */
export const CANVAS_MARK = { LIT: 'noacg-canvas-lit' } as const;

/** Fire-and-forget commands into the document — no reply, safe to send on every pointermove. */
export type CanvasCmd =
  /** Which selectors to measure and push every frame (composeDocument's `canvasControl` rAF
   *  loop). Re-sent whenever the app's set of trackable selectors changes (a template edit adds/
   *  removes parts, fields, or placed lines). `frames` is the subset that ALSO wants a
   *  `CanvasFrame`; it need not be a subset of `selectors`, and a caller that only draws in an
   *  element's own space may name it here and nowhere else. */
  | { cmd: 'track'; selectors: string[]; frames?: string[] }
  /** Live GSAP preview during a keyframe/layer-transform drag — `gsap.set(selector, vars)`. */
  | { cmd: 'gsap-set'; selector: string; vars: Record<string, number> }
  /** Live inline style preview during a placement/line-size drag, or its Escape/cancel revert
   *  (an empty string in `props` clears that property, exactly like `el.style.prop = ''`). */
  | { cmd: 'set-style'; selector: string; props: Record<string, string> }
  /** The root `--scale` corner-drag preview; `value: null` removes the inline override
   *  (Escape/cancel/commit — the real commit patches `template.css` separately). */
  | { cmd: 'set-scale-var'; value: number | null }
  /** Type-on-canvas: mirror the inline editor's live value into the rendered element (or, on
   *  cancel, restore the field's original text). */
  | { cmd: 'set-text'; selector: string; text: string }
  /** CARRY A CLASS IN. Every element wearing `className` loses it and every element matching
   *  `selectors` gains it, so one command is the whole state of that mark and a caller never
   *  has to remember what it lit last. An empty `selectors` clears it.
   *
   *  This is the one thing the rect stream structurally cannot do. A rect comes OUT of the
   *  document axis-aligned, so anything the app draws from it is a rectangle on the screen's
   *  axes; a class goes IN and is painted by the element itself, so it follows the rotation,
   *  the corner radius and the outline of whatever the designer actually drew. See
   *  `CANVAS_MARK` for the classes composeDocument paints. */
  | { cmd: 'mark'; className: string; selectors: string[] };

export function postCanvasCmd(win: Window | null | undefined, msg: CanvasCmd): void {
  win?.postMessage({ type: CANVAS_CMD_TYPE, ...msg }, '*');
}

/** A single read `queryCanvas` batches into one round trip. 'gsap-prop' resolves through GSAP
 *  (the only way to read a value GSAP itself is animating/has set, short of decomposing a CSS
 *  transform matrix by hand); 'text' reads live `textContent` (a double-click's seed value,
 *  which can differ from the last-known sample data). */
export type CanvasReadRequest =
  | { kind: 'gsap-prop'; selector: string; prop: string }
  | { kind: 'text'; selector: string };

interface CanvasReplyMessage {
  type: typeof CANVAS_REPLY_TYPE;
  reqId: number;
  values: (number | string | null)[];
}

export interface CanvasRectsMessage {
  type: typeof CANVAS_RECTS_TYPE;
  rects: Record<string, CanvasRect | null>;
  /** Only the selectors the last `'track'` named in `frames`; absent where none were asked for. */
  frames?: Record<string, CanvasFrame | null>;
}

let nextReqId = 0;

/**
 * Send a batch of reads and resolve with their values in the same order, correlated by a
 * one-shot `reqId` (a fresh listener per call, cleaned up on reply or timeout — there is only
 * ever one editor canvas, so no shared pending-request map is needed). Resolves an all-`null`
 * array if the document never answers (a torn-down/reloading iframe) rather than hanging a
 * gesture forever; mirrors composeDocument.ts's `waitFonts` cap in spirit.
 */
export function queryCanvas(
  win: Window | null | undefined,
  requests: CanvasReadRequest[],
  timeoutMs = 300,
): Promise<(number | string | null)[]> {
  if (!win || requests.length === 0) return Promise.resolve(requests.map(() => null));
  const reqId = ++nextReqId;
  return new Promise((resolve) => {
    let done = false;
    const finish = (values: (number | string | null)[]) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(values);
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== win) return;
      const msg = ev.data as CanvasReplyMessage | undefined;
      if (msg && msg.type === CANVAS_REPLY_TYPE && msg.reqId === reqId) finish(msg.values);
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(requests.map(() => null)), timeoutMs);
    win.postMessage({ type: CANVAS_QUERY_TYPE, reqId, requests }, '*');
  });
}
