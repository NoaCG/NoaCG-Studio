/**
 * Park a composed graphic at its SETTLED on-air state inside a preview iframe.
 *
 * A graphic is hidden until `play()` runs, so any surface that shows one WITHOUT a playback
 * gesture - a Home card's thumbnail, the operator panel's preview before the first take - must
 * drive it to rest itself, or it reads as an empty black frame. This is that one recipe, shared
 * so those surfaces share one render path. The retired editor simulator used the same recipe.
 *
 * The recipe: write the data, jump the house entrance builder to the end of its FINITE
 * motion, write the data AGAIN, and jump again. The second `update()` is load-bearing - the
 * seek suppresses GSAP callbacks, so anything a callback writes (a counter's digits, a bar's
 * fill) would otherwise be left at its pre-entrance value while the layout around it sits at
 * the end state.
 *
 * THE SECOND JUMP IS LOAD-BEARING TOO, and for the opposite reason: a design whose `update()`
 * RE-RENDERS its own rows throws the settled frame away with the elements it was written on. The
 * credits family is the worked example (templates/endCredits/shared.ts `rebuildCredits` assigns
 * `track.innerHTML`), and both of its failure modes were on the Browse grid on 2026-08-26:
 *
 *   - the one-pager design came back with EVERY page at its CSS opacity, so all six sections
 *     drew on top of each other - the "mess" the owner reported;
 *   - the roll, the crawl and the repeating reel kept the travel transform on the surviving
 *     track while its content was replaced, parking a full list off-screen: a blank card.
 *
 * Re-deriving the jump over whatever `update()` just built fixes both, and costs nothing on a
 * design that does not rebuild: the builder is measured from the same DOM and writes the same
 * end values onto the same elements.
 *
 * A template with no builder (blank, hand-written, foreign import) has no entrance to jump, so
 * it gets its own `play()` and is allowed to come to rest on its own clock.
 *
 * ── WHY "THE END OF THE FINITE MOTION" AND NOT `progress(1)` ──
 *
 * An ENDLESS track has no end, and one endless child is enough to take the whole timeline's
 * end with it: GSAP reports the duration of a timeline containing a `repeat: -1` child as its
 * infinity sentinel, 1e10 seconds. `progress(1)` on that seeks to t = 1e10, which is not "the
 * end" of anything - it is an arbitrary phase of whatever is still looping there.
 *
 * That is not a hypothetical. EVERY end-credits design carries an ambient background drift
 * (`.credits-ambient`, `repeat: -1, yoyo`), so every one of them reports a duration of 1e10.
 * Measured over the thirteen of them on 2026-08-26, viewport coverage of the settled frame:
 *
 *                                    cr06   cr08   cr01
 *   one jump, progress(1)              0%     0%    69%
 *   one jump, the finite end          51%    69%    69%
 *   two jumps, the finite end        100%   100%    69%
 *
 * The two `credits-loop` reels settled to a COMPLETELY EMPTY frame - on every Home card,
 * every library thumbnail and every operator preview - and each of the two fixes above
 * repairs that on its own. **The second jump is the one that carries it**; the finite end is
 * the narrower correctness fix beside it, and on a roll (cr01, whose travel IS finite) it
 * changes nothing at all. It earns its place anyway, because seeking ten billion seconds in
 * and landing on a full frame is luck: it holds only because a reel clones enough copies to
 * cover the viewport at ANY phase. The next endless travel that does not will not be lucky.
 *
 * So: a settled graphic is parked at the end of the motion that HAS an end. An endless track
 * is left wherever the finite motion put it, because "the end" of a thing that never ends is
 * not a place.
 *
 * A ROLL still settles on its own designed rest pose (the logo and year centred), because a
 * roll's travel IS finite - it is the reel and the marquee that have no end. What a preview
 * must never do is show the empty frame a travelling graphic starts from; that is the same
 * fault seen from the other side, and it is why the wizard's preview settles a measured
 * graphic instead of playing it (components/wizard/WizardPreview.tsx).
 */

/** A settled timeline: the house entrance builder's return value. */
interface SettleTimeline {
  pause: () => void;
  /** Seconds on the timeline's own clock; the flag suppresses callbacks, as `progress` does. */
  time: (value: number, suppressEvents?: boolean) => void;
  /** Direct children, in the order added. `false` = do not descend into nested timelines. */
  getChildren?: (nested: boolean) => { startTime: () => number; totalDuration: () => number }[];
  progress: (value: number, suppressEvents?: boolean) => void;
}

/** The template globals this drives: the SPX contract plus the house entrance builder. */
export interface SettleWindow {
  update?: (json: string) => void;
  play?: () => void;
  buildInTimeline?: () => SettleTimeline;
}

/**
 * Settle `win` with `data` (a JSON string, the shape `update()` takes). Best-effort by design:
 * a template that throws still leaves its surface standing, because a preview is never worth
 * taking a page down for.
 *
 * SELF-CONTAINED ON PURPOSE, like `reportGraphicBox` below: this function is never called in
 * the module that defines it - every call site takes its `.toString()` and embeds the source in
 * a preview document's own script (composeDocument.ts). A reference to a module-level helper or
 * constant would compile here and throw `ReferenceError` there, so `finiteEnd` lives inside.
 */
export function settleGraphic(win: SettleWindow | null | undefined, data: string): void {
  if (!win) return;

  // The last moment at which anything with an END is still moving. GSAP reports a `repeat: -1`
  // child's total duration as its infinity sentinel (1e10 s) and a timeline inherits it, so
  // "the end" of a timeline holding one is not a place - see the note at the top of this file.
  const finiteEnd = (tl: SettleTimeline): number => {
    let end = 0;
    const children = tl.getChildren?.(false) ?? [];
    for (const child of children) {
      const total = child.totalDuration();
      if (Number.isFinite(total) && total < 1e9) end = Math.max(end, child.startTime() + total);
    }
    return end;
  };

  // Build the entrance and park it at its end. Declared here rather than inlined twice so the
  // two jumps can never drift into doing different things.
  const jump = () => {
    const tl = win.buildInTimeline?.();
    if (!tl) return;
    tl.pause();
    // `time`, not `progress`: an endless child makes `progress(1)` seek to 1e10 seconds,
    // which is a phase of the loop rather than the end of the entrance.
    if (typeof tl.getChildren === 'function' && typeof tl.time === 'function') {
      tl.time(finiteEnd(tl), true);
    } else {
      tl.progress(1, true);
    }
  };

  try {
    win.update?.(data);
    if (typeof win.buildInTimeline === 'function') {
      jump();
      win.update?.(data);
      jump();
    } else {
      win.play?.();
    }
  } catch {
    /* best-effort: a broken template still gets its frame */
  }
}

/**
 * Report this document's graphic box back to `parent` (`{ type: 'spx-preview-box', x, y, w, h }`
 * — preview/previewProtocol.ts's `PREVIEW_BOX_TYPE`, spelled out as a literal here on purpose:
 * this function is never called directly — every call site takes its `.toString()` and embeds
 * the source in a document's own script (composeDocument.ts's settle and live-control
 * bootstraps), so a reference to an imported binding would compile here but throw
 * `ReferenceError` there, where no such import exists).
 * Shared by both bootstraps so the two scripts serialized into a preview document never drift on
 * the wire shape a caller (preview/frameGraphic.ts) reads.
 */
export function reportGraphicBox(win: Window): void {
  try {
    const root = win.document.body?.querySelector('div');
    const r = root?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
      win.parent.postMessage({ type: 'spx-preview-box', x: r.left, y: r.top, w: r.width, h: r.height }, '*');
    }
  } catch {
    /* best-effort: a broken template still gets its frame */
  }
}

/**
 * MEASURE THIS DOCUMENT'S GRAPHIC for place and size (docs/work-specs/playout-adjustments/spec.md,
 * "What is measured, honestly"), and post it back as an `spx-preview-box` carrying `id` (the
 * request's) and three answers beside the old box:
 *
 * - `info`: the union of the document's information, its text ranges and its pictures;
 * - `paint`: the union of everything it paints, decoration included (a band, a scrim);
 * - `minText`: the smallest text it draws, in px as it appears (its transforms included).
 *
 * Both rectangles are clipped to every overflow-clipping ancestor and to the frame, since a Range's
 * rectangle is not clipped by `overflow: hidden` and every ticker is a window over a wider track.
 * The caller qualifies them (control/cueAdjust.ts `qualify`: two answers 250 ms apart agreeing).
 * Serialized like `reportGraphicBox`, so it refers to nothing outside itself.
 */
export function measureGraphic(win: Window, id: number): void {
  try {
    const doc = win.document;
    const W = win.innerWidth;
    const H = win.innerHeight;
    type R = { l: number; t: number; r: number; b: number };
    const cut = (a: R, b: R): R | null => {
      const o = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) };
      return o.r - o.l > 0.5 && o.b - o.t > 0.5 ? o : null;
    };
    const join = (a: R | null, b: R): R => (a ? { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) } : b);
    const of = (d: DOMRect): R => ({ l: d.left, t: d.top, r: d.right, b: d.bottom });
    const clips = new Map<Element, R | null>();
    // The window an element's painting is seen through: the frame cut by each clipping ancestor.
    const clipOf = (el: Element | null): R | null => {
      if (!el || el === doc.documentElement) return { l: 0, t: 0, r: W, b: H };
      const known = clips.get(el);
      if (known !== undefined) return known;
      const above = clipOf(el.parentElement);
      let own = above;
      if (above && el !== doc.body) {
        const cs = win.getComputedStyle(el);
        const clipping = (v: string) => v !== 'visible';
        if (clipping(cs.overflowX) || clipping(cs.overflowY) || cs.clipPath !== 'none') own = cut(above, of(el.getBoundingClientRect()));
      }
      clips.set(el, own);
      return own;
    };
    const seen = (el: Element) => {
      const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
      return check ? check.call(el, { opacityProperty: true, visibilityProperty: true }) : win.getComputedStyle(el).visibility !== 'hidden';
    };
    let info: R | null = null;
    let paint: R | null = null;
    let minText = 0;
    const walker = doc.createTreeWalker(doc.body, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || !(n.nodeValue || '').trim() || !seen(parent)) continue;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const window_ = clipOf(parent);
      if (!window_) continue;
      const range = doc.createRange();
      range.selectNodeContents(n);
      let any = false;
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const c = cut(window_, of(rects[i]));
        if (!c) continue;
        info = join(info, c);
        paint = join(paint, c);
        any = true;
      }
      if (any) {
        const box = parent.getBoundingClientRect();
        const he = parent as HTMLElement;
        const ratio = he.offsetHeight > 0 ? box.height / he.offsetHeight : 1;
        const px = parseFloat(win.getComputedStyle(parent).fontSize) * (ratio > 0 ? ratio : 1);
        if (px > 0 && (minText === 0 || px < minText)) minText = px;
      }
    }
    const all = doc.body.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || !seen(el)) continue;
      const picture = tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'svg' || tag === 'SVG';
      const cs = win.getComputedStyle(el);
      const paints =
        picture ||
        (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
        cs.backgroundImage !== 'none' ||
        cs.boxShadow !== 'none' ||
        parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) > 0;
      if (!paints) continue;
      const window_ = clipOf(el.parentElement);
      const c = window_ && cut(window_, of(el.getBoundingClientRect()));
      if (!c) continue;
      paint = join(paint, c);
      if (picture) info = join(info, c);
    }
    const rect = (r: R | null) => (r ? { x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t } : null);
    const root = doc.body.querySelector('div');
    const old = root ? root.getBoundingClientRect() : null;
    win.parent.postMessage(
      {
        type: 'spx-preview-box',
        id,
        x: old ? old.left : 0,
        y: old ? old.top : 0,
        w: old ? old.width : 0,
        h: old ? old.height : 0,
        info: rect(info),
        paint: rect(paint),
        minText: minText > 0 ? Math.round(minText * 10) / 10 : null,
      },
      '*',
    );
  } catch {
    /* best-effort: a broken template answers nothing, and has no measurement */
  }
}
