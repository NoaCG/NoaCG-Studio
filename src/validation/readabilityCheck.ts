// THE READABILITY INSTRUMENT - is painted text big enough, heavy enough, contrasted enough
// and inside the safe area, per the CANONICAL rules module?
//
// Lived in src/ai/spike/ while it was bench-only; moved here in R4 (docs/DESIGN_RULES_PLAN.md
// §5) so the PRODUCT validator and the spike runners measure through the SAME code - the
// spike scripts import it from this path now. The first version carried its own fixed 18px
// floor, calibrated to the catalog's smallest line - and the owner's blind read named exactly
// that as escape class 3 (docs/NOACG_PRO_PLAN.md §22.1): "18px let through text the owner
// calls unreadable for broadcast". The floors come from `src/model/designRules.ts` (the
// owner's ratified table - roles x mode x viewing profile, as % of the reference size); this
// file only classifies and measures. Nothing here copies a number.
//
// The `detail` strings are the LOOP's teaching copy (fed back to a model in a repair round)
// and stay as they calibrated. Product surfaces read the STRUCTURED fields on each finding
// and phrase their own plain-language warnings (designRulesWarnings.ts).
//
// ROLE CLASSIFICATION (designRules' stated limitation, restated where it runs): field-bound
// text (an `#fN` element or its descendants) is informational ALWAYS; standalone static text
// is informational when it renders at or above STATIC_INFORMATIONAL_MIN_RATIO of the
// reference, else it is classed decorative WITH a finding saying so rather than silently.
// The largest informational reading is the primary role; everything else informational is
// secondary. `fine` is reserved for callers that know better - this classifier cannot tell a
// source line from a caption.
//
// HONEST LIMITS, stated rather than papered over:
// - Contrast is measured against the nearest ancestor's solid background-color, or against a
//   SLAB PAINTED ON THAT ANCESTOR'S ::before / ::after (resolveBacking below states exactly
//   which pseudo-layers count and which do not). A url() image or a fully transparent stack
//   (text straight over footage) is UNKNOWABLE here, so no ratio is reported - instead the
//   PROTECTION rule asks whether such text carries a panel, gradient scrim, text-shadow or
//   stroke detectable from computed style (WARN in v1: the owner passed a panel-free
//   minimalist anchor, so a hard fail would flag it on day one).
// - The safe-area check reads the LAYOUT box and skips any side an ancestor clips - where a
//   mask cut the text, the edge position is the mask's design and the overflow instruments
//   own that question.

import {
  checkTextSize,
  contrastFloor,
  weightFloor,
  safeAreaInset,
  strokeFloorPx,
  referenceSize,
  STATIC_INFORMATIONAL_MIN_RATIO,
  type LegibilityMode,
  type ViewingTarget,
  type TextRole,
} from '../model/designRules';

export interface ReadabilityReading {
  /** First characters of the text, for the finding and the calibration table. */
  snippet: string;
  fontPx: number;
  weight: number;
  role: TextRole;
  /** WCAG contrast ratio against the resolved backing, when one resolves. */
  contrast: number | null;
  el: string;
}

export interface ReadabilityFinding {
  code: string;
  /** 'block' feeds the loop as a contract; 'advise' rides with a judgement note. */
  severity: 'block' | 'advise';
  detail: string;
  /** Structured measurement behind the sentence, for surfaces that phrase their own copy
   *  (the product validator's plain-language warnings). Absent on grouped findings. */
  snippet?: string;
  el?: string;
  role?: TextRole;
  fontPx?: number;
  /** The composed hard floor (size findings) in px. */
  floorPx?: number;
  /** The warning-band top (size warnings) in px. */
  warnPx?: number;
  /** Measured contrast ratio and its floor (contrast findings). */
  ratio?: number;
  ratioFloor?: number;
}

export interface ReadabilityOptions {
  mode?: LegibilityMode;
  target?: ViewingTarget;
  /** Frame size the rules scale off. Defaults to the document's viewport. */
  width?: number;
  height?: number;
  /** The brand mark's field id, when the graphic carries one - held to the safe area. */
  markFieldId?: string | null;
  /**
   * What the graphic IS, which decides what its lead line must reach (owner ruling 2026-09-08;
   * the bands are `PRIMARY_BAND_RATIO` and the two category lists in designRules).
   *
   * Absent is not exempt: an unnamed graphic takes the CARD band, the middle of the three. A
   * caller that knows the category should pass it - `template.type` on the AI lanes, the wizard
   * category on the product ones - because a persistent graphic held to a card's floor is the
   * false positive this ruling exists to remove.
   */
  category?: string | null;
}

export interface ReadabilityReport {
  findings: ReadabilityFinding[];
  readings: ReadabilityReading[];
}

function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function luminance(c: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

interface Backing {
  color: { r: number; g: number; b: number } | null;
  /** A gradient anywhere on the way up counts as a protective scrim. */
  gradient: boolean;
}

/** What an element's (or pseudo-element's) own paint contributes, or null for "see through
 *  me, keep walking". A url() IMAGE makes the backing unknowable (the image wins the paint);
 *  a GRADIENT also stops the walk but is remembered as protection - a scrim behind text is the
 *  treatment the rule asks for. `alphaScale` folds in a pseudo-layer's own opacity.
 *
 *  A backing that clears the threshold is then measured AS IF IT WERE SOLID, and for a panel
 *  between 0.86 and 0.96 - where nine of the fourteen curated palettes put `--panel-bg` - that
 *  is optimistic by a percent or two. For the two cinematic palettes at 0.55 it is optimistic
 *  by a lot. That is a PRE-EXISTING property of this walk, it predates pseudo-elements being
 *  read at all, and changing it moves 14 shipped designs across the blocking contrast floor -
 *  so it is written down rather than fixed in passing:
 *  `https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/a-translucent-panel-is-measured-as-if-it-were-solid.md` carries the
 *  measurement and the severity question it turns on. */
function paintOf(cs: CSSStyleDeclaration, alphaScale = 1): Backing | null {
  if (cs.backgroundImage && cs.backgroundImage !== 'none') {
    return { color: null, gradient: /gradient\(/.test(cs.backgroundImage) };
  }
  const bg = parseColor(cs.backgroundColor);
  if (bg && bg.a * alphaScale >= 0.5) return { color: bg, gradient: false };
  return null;
}

/** A parallelogram in viewport pixels - what a transformed box actually paints over. */
type Quad = { x: number; y: number }[];

/** The six numbers of a computed 2D `transform`, or null when it is 3D or unparseable - we
 *  do not model a 3D matrix, and guessing at one is how a check goes blind. */
function matrix2d(value: string): number[] | null {
  if (!value || value === 'none') return [1, 0, 0, 1, 0, 0];
  const m = /^matrix\(([^)]+)\)$/.exec(value);
  if (!m) return null;
  const n = m[1].split(',').map((p) => parseFloat(p));
  return n.length === 6 && n.every((v) => Number.isFinite(v)) ? n : null;
}

/** A computed `transform` that only MOVES its box - identity or a translation. Everything
 *  else (skew, rotate, scale) changes the mapping from an element's local coordinates into
 *  viewport ones, which is what the pseudo-element placement below relies on being a shift. */
function translationOnly(value: string): boolean {
  const m = matrix2d(value);
  return !!m && m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;
}

/** `box` after its own 2D transform, as four corners. `origin` is the transform origin in the
 *  SAME (viewport) coordinates as the box, not an offset inside it - the box handed in here has
 *  already been inset for corner rounding, and an offset would drag the origin along with it. */
function paintedQuad(
  box: { left: number; top: number; width: number; height: number },
  m: number[],
  origin: { x: number; y: number },
): Quad {
  const { x: ox, y: oy } = origin;
  const map = (x: number, y: number) => {
    const dx = x - ox;
    const dy = y - oy;
    return { x: ox + m[0] * dx + m[2] * dy + m[4], y: oy + m[1] * dx + m[3] * dy + m[5] };
  };
  return [
    map(box.left, box.top),
    map(box.left + box.width, box.top),
    map(box.left + box.width, box.top + box.height),
    map(box.left, box.top + box.height),
  ];
}

/**
 * Is every corner of `r` inside the convex quad `q`? (Same sign on every edge cross-product;
 * a mirrored matrix flips the winding consistently, so the sign is read, not assumed.)
 *
 * The text rect is shrunk by SLACK first, for the same reason `clippedSides` below allows a
 * pixel: every length in this catalog comes out of `calc(Npx * var(--scale))`, so a descender,
 * a last glyph carrying letter-spacing or a sub-pixel layout under a fractional scale routinely
 * puts a corner a fraction of a pixel past a slab that plainly backs it. Without the slack one
 * such corner discards the whole backing and reinstates the exact false positive this file was
 * changed to remove - silently, and differently at 1080p and 720p.
 */
const SLACK = 1;

function quadCoversRect(q: Quad, r: DOMRect): boolean {
  const x0 = r.left + SLACK;
  const y0 = r.top + SLACK;
  const x1 = Math.max(r.right - SLACK, x0);
  const y1 = Math.max(r.bottom - SLACK, y0);
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  let sign = 0;
  for (const p of corners) {
    for (let i = 0; i < 4; i += 1) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (Math.abs(cross) < 1e-6) continue; // exactly on the edge - counts as covered
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return sign !== 0; // a degenerate (zero-area) quad covers nothing
}

/**
 * THE SLAB A PSEUDO-ELEMENT PAINTS BEHIND `textRect`, or null.
 *
 * Why this exists: the house chassis paints its panel on a ::before, because a preset tweens
 * the element itself and the design's lean has to live on a layer no preset can flatten
 * (src/templates/scoreboards/sb01.ts). A pseudo-element is not in the DOM ancestor chain, so
 * before this the walk read every ancestor as transparent and warned that text on an opaque
 * near-black slab "sits straight over the picture with no panel" - twice, on a design we ship.
 *
 * WHAT COUNTS, and why each condition is there. A pseudo has no containment relation to the
 * text the way an ancestor element does, so every guarantee an ancestor gets for free has to
 * be re-established here:
 *
 *  1. It generates a box and paints one - `content` other than none/normal, not display:none
 *     or visibility:hidden. An empty pseudo backs nothing.
 *  2. `position: absolute` inside a POSITIONED host. That pins its containing block to the
 *     host's padding box, which is the only reason we can say where it lands. A static or
 *     relative pseudo is an in-flow box BESIDE the content, not under it.
 *  3. A NEGATIVE `z-index`. This is what puts it behind the host's in-flow text. An
 *     out-of-flow pseudo on layer 0 or above paints ON TOP of the words - accepting one would
 *     measure contrast against a slab the reader never sees through, and score a hidden line
 *     as perfectly legible.
 *  4. Nothing from the host up to the root is transformed beyond a translation, so the host's
 *     viewport rect places the pseudo's local box exactly. (A rotate or scale up the chain
 *     maps both boxes, and we have only measured one of them.)
 *  5. Its painted quad - the border box, inset for any corner rounding and carried through its
 *     OWN 2D transform - contains the whole text rect. This is the condition that keeps a
 *     decorative sliver, an accent edge down one side of a panel, from passing as the panel,
 *     and it is why the -8deg skew is applied rather than ignored: a skewed slab uncovers its
 *     own top and bottom corners by tan(8deg) x half its height, and text parked there is not
 *     backed.
 *
 * HOW THE CORNER ROUNDING IS HANDLED, since a pill slab is a real shape here (`border-radius:
 * 999px` appears across the glass families): the quad is inset HORIZONTALLY by the largest
 * corner radius. That sub-rectangle is exactly the part of a rounded rect no curve can bite,
 * so it is sound rather than approximate, and on the square slabs this function was written for
 * it takes nothing at all.
 *
 * STATED LIMIT. A `position: fixed` pseudo resolves against the viewport rather than its host,
 * and is refused rather than special-cased - as is anything whose box will not resolve to px.
 * Those refusals warn where a human would not; that is the safe direction, because a check that
 * goes blind is worse than one that is occasionally fussy.
 */
function pseudoBacking(
  host: Element,
  which: '::before' | '::after',
  textRect: DOMRect,
  win: Window,
): { z: number; paint: Backing } | null {
  const cs = win.getComputedStyle(host, which);
  if (!cs) return null;
  if (cs.content === 'none' || cs.content === 'normal') return null;      // (1) no box at all
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  const opacity = parseFloat(cs.opacity);
  const alpha = Number.isFinite(opacity) ? opacity : 1;
  if (alpha < 0.5) return null;
  if (cs.position !== 'absolute') return null;                            // (2) placeable ...
  const hostCs = win.getComputedStyle(host);
  if (hostCs.position === 'static') return null;                          // ... against its host
  const z = parseFloat(cs.zIndex);
  if (!(z < 0)) return null;                                              // (3) behind the text

  // What the pseudo paints, before asking where. A transparent layer is not a backing, and a
  // url() image over the text is unknowable - both answers are the same as "no slab here".
  const paint = paintOf(cs, alpha);
  if (!paint) return null;

  // (4) The host's rect is the pseudo's containing block only while every transform between
  // the host and the root is a shift.
  for (let n: Element | null = host; n; n = n.parentElement) {
    if (!translationOnly(win.getComputedStyle(n).transform)) return null;
  }

  // (5) The painted BORDER box, in viewport pixels. `left`/`top` place the margin edge inside
  // the containing block (the host's padding box); the background paints over the border box,
  // which is the content box plus padding and border unless box-sizing already counted them.
  const hostRect = host.getBoundingClientRect();
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const bdX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const bdY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const counted = cs.boxSizing === 'border-box'; // width/height already include padding + border
  const box = {
    left: hostRect.left + parseFloat(hostCs.borderLeftWidth) + parseFloat(cs.left) + parseFloat(cs.marginLeft),
    top: hostRect.top + parseFloat(hostCs.borderTopWidth) + parseFloat(cs.top) + parseFloat(cs.marginTop),
    width: parseFloat(cs.width) + (counted ? 0 : padX + bdX),
    height: parseFloat(cs.height) + (counted ? 0 : padY + bdY),
  };
  if (!Object.values(box).every((v) => Number.isFinite(v))) return null;  // an `auto` we cannot resolve

  // The transform origin, pinned in viewport coordinates BEFORE the box is inset below.
  const [originX, originY] = cs.transformOrigin.split(' ').map(parseFloat);
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) return null;
  const origin = { x: box.left + originX, y: box.top + originY };

  // Corner rounding: inset horizontally by the largest radius, which leaves the strip no curve
  // can reach. A percentage radius resolves against the box's own width, near enough for an
  // inset whose only job is to be conservative.
  const radius = (v: string) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return v.includes('%') ? (n / 100) * box.width : n;
  };
  const round = Math.min(
    Math.max(
      radius(cs.borderTopLeftRadius), radius(cs.borderTopRightRadius),
      radius(cs.borderBottomLeftRadius), radius(cs.borderBottomRightRadius),
    ),
    box.width / 2,
  );
  box.left += round;
  box.width -= round * 2;

  const m = matrix2d(cs.transform);
  if (!m) return null;
  return quadCoversRect(paintedQuad(box, m, origin), textRect) ? { z, paint } : null;
}

/** The nearest ancestor (or self) painting a solid-enough background behind `textRect` -
 *  either on the element itself, or on a ::before / ::after slab it paints (pseudoBacking
 *  above holds the rules for those). The pseudo-layers are asked FIRST at each step, because
 *  a pseudo paints over its own host's background and so is the nearer surface; between the
 *  two, the one on the higher layer wins, and ::after breaks a tie by painting last. */
function resolveBacking(el: Element, textRect: DOMRect, win: Window): Backing {
  let node: Element | null = el;
  while (node && node !== el.ownerDocument.documentElement) {
    // ::after is asked second so that, on an equal layer, it wins - it paints last.
    let nearest: { z: number; paint: Backing } | null = null;
    for (const which of ['::before', '::after'] as const) {
      const layer = pseudoBacking(node, which, textRect, win);
      if (layer && (!nearest || layer.z >= nearest.z)) nearest = layer;
    }
    if (nearest) return nearest.paint;
    const own = paintOf(win.getComputedStyle(node));
    if (own) return own;
    node = node.parentElement;
  }
  return { color: null, gradient: false };
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${el.classList[0]}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/** Field-bound: the element IS an `#fN` field or lives inside one (the field -> DOM
 *  convention: each field fN maps to one element id="fN"). */
function isFieldBound(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (/^f\d+$/.test(node.id)) return true;
  }
  return false;
}

/** A text-shadow or text-stroke that would rescue text over an unknowable backing. */
function carriesProtection(cs: CSSStyleDeclaration): boolean {
  if (cs.textShadow && cs.textShadow !== 'none') return true;
  const stroke = parseFloat(cs.getPropertyValue('-webkit-text-stroke-width'));
  return Number.isFinite(stroke) && stroke > 0;
}

/** Which sides of the element's layout box an ancestor's overflow actually clips - the
 *  safe-area check skips those sides (the mask's edge is design, not text placement). */
function clippedSides(el: Element, win: Window): Set<'left' | 'right' | 'top' | 'bottom'> {
  const r = el.getBoundingClientRect();
  const cut = new Set<'left' | 'right' | 'top' | 'bottom'>();
  for (let a = el.parentElement; a; a = a.parentElement) {
    const s = win.getComputedStyle(a);
    const clipsX = s.overflowX !== 'visible';
    const clipsY = s.overflowY !== 'visible';
    if (!clipsX && !clipsY) continue;
    const ar = a.getBoundingClientRect();
    if (clipsX) {
      if (r.left < ar.left - 1) cut.add('left');
      if (r.right > ar.right + 1) cut.add('right');
    }
    if (clipsY) {
      if (r.top < ar.top - 1) cut.add('top');
      if (r.bottom > ar.bottom + 1) cut.add('bottom');
    }
  }
  return cut;
}

/**
 * Measure every visible element that DIRECTLY contains text on a settled frame, against the
 * canonical design rules.
 */
export function measureReadability(doc: Document, options: ReadabilityOptions = {}): ReadabilityReport {
  const mode: LegibilityMode = options.mode ?? 'standard';
  const target: ViewingTarget = options.target ?? { profile: 'tv' };
  const win = doc.defaultView;
  const findings: ReadabilityFinding[] = [];
  const readings: ReadabilityReading[] = [];
  if (!win || !doc.body) return { findings, readings };
  const width = options.width ?? doc.documentElement.clientWidth ?? 1920;
  const height = options.height ?? doc.documentElement.clientHeight ?? 1080;
  const ref = referenceSize(width, height);
  const inset = safeAreaInset(width, height);

  interface Candidate {
    el: Element;
    cs: CSSStyleDeclaration;
    rect: DOMRect;
    snippet: string;
    fontPx: number;
    weight: number;
    fieldBound: boolean;
  }
  const candidates: Candidate[] = [];

  const walk = (el: Element) => {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (ownText.length >= 2) {
      const rect = el.getBoundingClientRect();
      const opacity = parseFloat(cs.opacity);
      // A zero-size or fully faded element paints nothing to read - the entrance/paint
      // instruments own that question, not this one.
      if (rect.width > 0 && rect.height > 0 && (Number.isNaN(opacity) || opacity >= 0.1)) {
        candidates.push({
          el,
          cs,
          rect,
          snippet: ownText.slice(0, 40),
          fontPx: parseFloat(cs.fontSize),
          weight: parseFloat(cs.fontWeight) || 400,
          fieldBound: isFieldBound(el),
        });
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(doc.body);

  // ── Role assignment ─────────────────────────────────────────────────────────────────
  const informational = (c: Candidate) =>
    c.fieldBound || c.fontPx >= STATIC_INFORMATIONAL_MIN_RATIO * ref;
  const infoSizes = candidates.filter(informational).map((c) => c.fontPx);
  const maxInfo = infoSizes.length ? Math.max(...infoSizes) : 0;
  const roleFor = (c: Candidate): TextRole => {
    if (!informational(c)) return 'decorative';
    return c.fontPx >= maxInfo - 0.5 ? 'primary' : 'secondary';
  };

  const decorativeAssumed: string[] = [];

  for (const c of candidates) {
    const role = roleFor(c);
    const ink = parseColor(c.cs.color);
    const backing = ink && ink.a >= 0.1 ? resolveBacking(c.el, c.rect, win) : { color: null, gradient: false };
    let contrast: number | null = null;
    if (ink && backing.color) {
      // Composite a translucent ink over its backing before comparing.
      const blended = ink.a >= 1 ? ink : {
        r: ink.r * ink.a + backing.color.r * (1 - ink.a),
        g: ink.g * ink.a + backing.color.g * (1 - ink.a),
        b: ink.b * ink.a + backing.color.b * (1 - ink.a),
      };
      contrast = contrastRatio(blended, backing.color);
    }
    readings.push({
      snippet: c.snippet,
      fontPx: Math.round(c.fontPx * 10) / 10,
      weight: c.weight,
      role,
      contrast: contrast === null ? null : Math.round(contrast * 100) / 100,
      el: describe(c.el),
    });

    if (role === 'decorative') {
      decorativeAssumed.push(`"${c.snippet}" at ${Math.round(c.fontPx)}px (${describe(c.el)})`);
    }

    // ── Size (the owner table, composed for this mode and profile) ────────────────────
    const size = checkTextSize(c.fontPx, role, mode, target, width, height, options.category);
    if (size.status === 'fail' && size.floor) {
      findings.push({
        code: 'text-under-size-floor',
        severity: 'block',
        detail: `"${c.snippet}" (${role}) is painted at ${Math.round(c.fontPx)}px (${describe(c.el)})`
          + ` - under the ${Math.round(size.floor.hardPx)}px broadcast floor for ${role} text`
          + ` (${mode} mode, ${target.profile} viewing)`,
        snippet: c.snippet,
        el: describe(c.el),
        role,
        fontPx: c.fontPx,
        floorPx: size.floor.hardPx,
        warnPx: size.floor.warnPx ?? undefined,
      });
    } else if (size.status === 'warn' && size.floor?.warnPx) {
      findings.push({
        code: 'text-size-warning-band',
        severity: 'advise',
        detail: `"${c.snippet}" (${role}) at ${Math.round(c.fontPx)}px sits in the warning band`
          + ` (${Math.round(size.floor.hardPx)}-${Math.round(size.floor.warnPx)}px) - prefer`
          + ` ${Math.round(size.floor.warnPx)}px+ for comfortable ${target.profile} reading`,
        snippet: c.snippet,
        el: describe(c.el),
        role,
        fontPx: c.fontPx,
        floorPx: size.floor.hardPx,
        warnPx: size.floor.warnPx,
      });
    }

    // ── Contrast + protection ─────────────────────────────────────────────────────────
    if (contrast !== null) {
      const floor = contrastFloor(c.fontPx, c.weight, width, height);
      if (contrast < floor) {
        findings.push({
          code: 'text-low-contrast',
          severity: 'block',
          detail: `"${c.snippet}" reads at ${contrast.toFixed(2)}:1 against its surface`
            + ` (${describe(c.el)}) - under the ${floor}:1 floor for on-air text`,
          snippet: c.snippet,
          el: describe(c.el),
          role,
          ratio: contrast,
          ratioFloor: floor,
        });
      }
    } else if (role !== 'decorative' && ink && ink.a >= 0.1) {
      const protectedText = backing.gradient || carriesProtection(c.cs);
      if (!protectedText) {
        findings.push({
          code: 'text-unprotected-over-video',
          severity: 'advise',
          detail: `"${c.snippet}" (${describe(c.el)}) sits on a transparent stack over the picture`
            + ' with no visible protection - add a panel, scrim gradient, text-shadow or outline'
            + ' so it survives any footage behind it',
          snippet: c.snippet,
          el: describe(c.el),
          role,
        });
      }
    }

    // ── Weight ────────────────────────────────────────────────────────────────────────
    if (role !== 'decorative') {
      const overVideo = contrast === null && !backing.gradient;
      const floor = weightFloor(c.fontPx, width, height, overVideo);
      if (c.weight < floor) {
        findings.push({
          code: 'text-under-weight-floor',
          severity: 'advise',
          detail: `"${c.snippet}" renders at weight ${c.weight} (${describe(c.el)}) - informational`
            + ` text this ${overVideo ? 'exposed' : 'small'} needs ${floor}+ to survive broadcast`,
          // The structured fields every finding beside this one already carries. They were
          // missing on this one alone, which made it the single legibility failure no surface
          // could pair with another: the taste instrument's rule 4 asks which text cleared its
          // SIZE floor and STILL failed, and that question is answerable only when both
          // findings name the same element in the same words.
          snippet: c.snippet,
          el: describe(c.el),
          role,
          fontPx: c.fontPx,
        });
      }
    }

    // ── Safe area (HARD for field-bound text; decoration exempt) ──────────────────────
    if (c.fieldBound) {
      const cut = clippedSides(c.el, win);
      const out: string[] = [];
      if (!cut.has('left') && c.rect.left < inset.x) out.push(`${Math.round(inset.x - c.rect.left)}px past the left`);
      if (!cut.has('right') && c.rect.right > width - inset.x) out.push(`${Math.round(c.rect.right - (width - inset.x))}px past the right`);
      if (!cut.has('top') && c.rect.top < inset.y) out.push(`${Math.round(inset.y - c.rect.top)}px past the top`);
      if (!cut.has('bottom') && c.rect.bottom > height - inset.y) out.push(`${Math.round(c.rect.bottom - (height - inset.y))}px past the bottom`);
      if (out.length) {
        findings.push({
          code: 'text-outside-safe-area',
          severity: 'block',
          detail: `field text "${c.snippet}" (${describe(c.el)}) leaves the ${Math.round(inset.x)}/${Math.round(inset.y)}px safe area: ${out.join(', ')} inset boundary`,
          snippet: c.snippet,
          el: describe(c.el),
        });
      }
    }
  }

  // ── Hairline functional strokes ───────────────────────────────────────────────────────
  // A rule/divider thinner than the stroke floor (~3px @1080) smears through broadcast
  // compression. ADVISE in v1, always: functional-vs-decorative is not deterministically
  // decidable and the house style ships deliberate hairlines (docs/DESIGN_LANGUAGE.md) - the
  // adjacency heuristic (within one type size of text) is what "functional" means here, and
  // it is a stated approximation.
  const strokeFloor = strokeFloorPx(width, height);
  const textRects = candidates.map((c) => c.rect);
  const typeUnit = maxInfo || 24;
  const hairlines: string[] = [];
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (el.tagName === 'IMG') continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity) < 0.1) continue;
    const bg = parseColor(cs.backgroundColor);
    if (!bg || bg.a < 0.3) continue;
    const r = el.getBoundingClientRect();
    const thin = Math.min(r.width, r.height);
    const long = Math.max(r.width, r.height);
    if (!(thin >= 0.5 && thin < strokeFloor && long >= 40)) continue;
    const nearText = textRects.some((t) => {
      const dx = Math.max(t.left - r.right, r.left - t.right, 0);
      const dy = Math.max(t.top - r.bottom, r.top - t.bottom, 0);
      return Math.max(dx, dy) <= typeUnit;
    });
    if (nearText) hairlines.push(`${describe(el)} at ${Math.round(thin * 10) / 10}px`);
  }
  if (hairlines.length) {
    findings.push({
      code: 'hairline-functional-stroke',
      severity: 'advise',
      detail: `${hairlines.length} stroke(s) beside text render under the ${Math.round(strokeFloor * 10) / 10}px`
        + ` broadcast stroke floor: ${hairlines.slice(0, 3).join('; ')}`
        + (hairlines.length > 3 ? ` (+${hairlines.length - 3} more)` : '')
        + ' - a functional divider this thin smears through compression; a deliberate decorative hairline is fine',
    });
  }

  // ── The mark inside the safe area ─────────────────────────────────────────────────────
  if (options.markFieldId) {
    const mark = doc.getElementById(options.markFieldId);
    if (mark) {
      const cs = win.getComputedStyle(mark);
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) >= 0.1;
      const r = mark.getBoundingClientRect();
      if (visible && r.width > 1 && r.height > 1) {
        const out = r.left < inset.x || r.right > width - inset.x || r.top < inset.y || r.bottom > height - inset.y;
        if (out) {
          findings.push({
            code: 'mark-outside-safe-area',
            severity: 'block',
            detail: `the brand mark (#${options.markFieldId}) leaves the ${Math.round(inset.x)}/${Math.round(inset.y)}px safe area`,
          });
        }
      }
    }
  }

  // One grouped note for the decorative assumption, never one per ornament - the
  // classification is a stated limitation, not a defect list.
  if (decorativeAssumed.length) {
    findings.push({
      code: 'text-decorative-assumed',
      severity: 'advise',
      detail: `${decorativeAssumed.length} static text element(s) classed decorative (size-exempt,`
        + ` still contrast-checked): ${decorativeAssumed.slice(0, 4).join('; ')}`
        + (decorativeAssumed.length > 4 ? ` (+${decorativeAssumed.length - 4} more)` : ''),
    });
  }

  const block = findings.filter((f) => f.severity === 'block').slice(0, 10);
  const advise = findings.filter((f) => f.severity === 'advise').slice(0, 8);
  return { findings: [...block, ...advise], readings };
}
