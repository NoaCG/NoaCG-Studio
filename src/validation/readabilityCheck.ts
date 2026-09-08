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
// - Contrast is measured against the nearest ancestor's solid background-color. A url()
//   image or a fully transparent stack (text straight over footage) is UNKNOWABLE here, so no
//   ratio is reported - instead the PROTECTION rule asks whether such text carries a panel,
//   gradient scrim, text-shadow or stroke detectable from computed style (WARN in v1: the
//   owner passed a panel-free minimalist anchor, so a hard fail would flag it on day one).
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

/** The nearest ancestor (or self) painting a solid-enough background-color. A url() IMAGE
 *  makes the backing unknowable (the image wins the paint); a GRADIENT also stops the walk
 *  but is remembered as protection - a scrim behind text is the treatment the rule asks for. */
function resolveBacking(el: Element, win: Window): Backing {
  let node: Element | null = el;
  while (node && node !== el.ownerDocument.documentElement) {
    const cs = win.getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      return { color: null, gradient: /gradient\(/.test(cs.backgroundImage) };
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a >= 0.5) return { color: bg, gradient: false };
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
    const backing = ink && ink.a >= 0.1 ? resolveBacking(c.el, win) : { color: null, gradient: false };
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
