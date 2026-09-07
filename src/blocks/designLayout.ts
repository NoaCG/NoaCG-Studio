// Design-position placement — the text lines that sit ON an imported design's artwork.
//
// The imported-design assembler (templates/importedDesign/shared.ts) writes each line's
// position as a CSS rule on the line's WRAPPER: `#fwN { left/top: calc(Npx * var(--scale)) }`.
// That position is a DESIGN decision, not motion — which is why the canvas drag for these
// lines patches this rule instead of writing x/y keyframes the way the layer drag does on
// every other data-block element.
//
// The gate is code-derived, never category-derived (the house rule — the timeline dock picks
// its surface the same way): a line is "placed" when its parent carries an id whose CSS rule
// holds readable left+top px values. That is exactly the shape the assembler emits, and
// equally a shape a pro can hand-write to opt any template's line into placement dragging.
//
// This module also owns the OTHER placed-line design decisions: adding a brand-new placed
// line (the Data panel's add-field on an imported design — element + rule + SPX DataField in
// one transform) and the line's text size (the canvas resize handle's read/write pair).

import type { SpxTemplate } from '../model/types';
import { FONTS, fontById, fontFaceCss, fontStack } from '../model/fonts';
import { SVG_TEXT_FIT_MARKER, TEXT_FIT_HOOK, TEXT_FIT_MARKER, TEXT_FIT_RUNTIME_JS } from '../templates/shared/textFit';
import { addFieldToDefinition, addLayer, appendCss, appendJs, nextFieldId, setCssDeclaration } from './edit';

export interface LinePlacement {
  /** The positioned wrapper's element id (e.g. "fw0"). */
  wrapperId: string;
  /** Design px from the artwork's top-left (before --scale is applied). */
  x: number;
  y: number;
  /** True for the assembler's `calc(Npx * var(--scale))` form; false for plain `Npx`.
   *  Writes mirror what the rule already uses, so a drag never rewrites the author's idiom. */
  scaled: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The value of `prop` in `selector`'s rule, as design px. Reads the position idioms AND the
// stretch-mode idiom `calc((Npx + var(--stretch-x, 0px)) * var(--scale))` — the base number
// comes back with `stretch: true` so a write can mirror the term instead of dropping it. The
// prop boundary is "not an identifier char" rather than `;`/`{`: generated declarations carry
// trailing comments, so the previous line often ends in a comment close, not `;`.
function readPx(
  css: string,
  selector: string,
  prop: string,
): { value: number; scaled: boolean; stretch?: boolean } | null {
  const rule = css.match(new RegExp(`${escapeRe(selector)}\\s*\\{([^}]*)\\}`));
  if (!rule) return null;
  const stretchCalc = rule[1].match(
    new RegExp(
      `(?:^|[^-\\w])${prop}\\s*:\\s*calc\\(\\s*\\(\\s*(-?[\\d.]+)px\\s*\\+\\s*var\\(--stretch-x[^)]*\\)\\s*\\)\\s*\\*\\s*var\\(--scale\\)\\s*\\)`,
    ),
  );
  if (stretchCalc) return { value: parseFloat(stretchCalc[1]), scaled: true, stretch: true };
  const calc = rule[1].match(
    new RegExp(`(?:^|[^-\\w])${prop}\\s*:\\s*calc\\(\\s*(-?[\\d.]+)px\\s*\\*\\s*var\\(--scale\\)\\s*\\)`),
  );
  if (calc) return { value: parseFloat(calc[1]), scaled: true };
  const plain = rule[1].match(new RegExp(`(?:^|[^-\\w])${prop}\\s*:\\s*(-?[\\d.]+)px`));
  return plain ? { value: parseFloat(plain[1]), scaled: false } : null;
}

/** The CSS value a placement writes (and the live drag previews) for a design-px coordinate.
 *  `stretch` mirrors the stretch-mode slot idiom — the value grows with the design's
 *  --stretch-x — and is only ever true for values readPx reported it on (or a new slot on a
 *  stretch design), so writes never rewrite the author's idiom. */
export function placementCss(value: number, scaled: boolean, stretch = false): string {
  if (stretch) {
    return scaled
      ? `calc((${value}px + var(--stretch-x, 0px)) * var(--scale))`
      : `calc(${value}px + var(--stretch-x, 0px))`;
  }
  return scaled ? `calc(${value}px * var(--scale))` : `${value}px`;
}

/**
 * Every placed line in the template, `#fN` → its wrapper + current position. Derived from
 * the code on every call (like getTemplateParts): hand edits can change or remove a
 * placement, but they can never make this map stale.
 */
export function placedLines(html: string, css: string): Record<string, LinePlacement> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Record<string, LinePlacement> = {};
  for (const el of Array.from(doc.querySelectorAll('[id]'))) {
    if (!/^f\d+$/.test(el.id)) continue;
    const wrapperId = el.parentElement?.id;
    if (!wrapperId) continue;
    const x = readPx(css, `#${wrapperId}`, 'left');
    const y = readPx(css, `#${wrapperId}`, 'top');
    if (!x || !y) continue;
    out[`#${el.id}`] = { wrapperId, x: x.value, y: y.value, scaled: x.scaled && y.scaled };
  }
  return out;
}

/** Re-place one line: the wrapper rule's left/top, as one deterministic CSS patch. */
export function placeLine(
  template: SpxTemplate,
  wrapperId: string,
  x: number,
  y: number,
  scaled: boolean,
): SpxTemplate {
  let css = template.css;
  css = setCssDeclaration(css, `#${wrapperId}`, 'left', placementCss(x, scaled));
  css = setCssDeclaration(css, `#${wrapperId}`, 'top', placementCss(y, scaled));
  return { ...template, css };
}

// ── The line's TEXT SIZE — the canvas resize handle's read/write pair ────────────────────

/** A placed line's font-size in design px (from its `#fN` rule), in either idiom. */
export function lineFontSize(css: string, fieldId: string): { value: number; scaled: boolean } | null {
  return readPx(css, `#${fieldId}`, 'font-size');
}

/** Resize one line's text: its `#fN` rule's font-size, as one deterministic CSS patch. */
export function setLineFontSize(
  template: SpxTemplate,
  fieldId: string,
  px: number,
  scaled: boolean,
): SpxTemplate {
  return { ...template, css: setCssDeclaration(template.css, `#${fieldId}`, 'font-size', placementCss(px, scaled)) };
}

// ── The slot's BOX SIZE — the resize pair for a placed IMAGE slot (no font-size rule) ────

/** A placed image slot's box size in design px (from its wrapper's rule), in either idiom. */
export function slotSize(
  css: string,
  wrapperId: string,
): { width: number; height: number; scaled: boolean } | null {
  const w = readPx(css, `#${wrapperId}`, 'width');
  const h = readPx(css, `#${wrapperId}`, 'height');
  return w && h ? { width: w.value, height: h.value, scaled: w.scaled && h.scaled } : null;
}

/** Resize one slot's box: its wrapper rule's width/height, as one deterministic CSS patch. */
export function setSlotSize(
  template: SpxTemplate,
  wrapperId: string,
  width: number,
  height: number,
  scaled: boolean,
): SpxTemplate {
  let css = template.css;
  css = setCssDeclaration(css, `#${wrapperId}`, 'width', placementCss(width, scaled));
  css = setCssDeclaration(css, `#${wrapperId}`, 'height', placementCss(height, scaled));
  return { ...template, css };
}

// ── The line's TEXT LOOK — the Inspector's Style section (read/write pairs) ──────────────
//
// A placed line's typography is a DESIGN decision written in its own `#fN` rule (and its
// alignment in the wrapper's transform), exactly like its position and size above. The
// Inspector's Style section reads these back and patches them one declaration at a time —
// the same idiom the assembler emits, so hand edits and generated code stay one language.

export interface LineTextStyle {
  /** The `#fN` rule's font-size, in design px (the canvas corner handle's value). */
  fontSize: { value: number; scaled: boolean } | null;
  /** A bundled font id; null = the design font (--font-heading); 'custom' = a hand-written
   *  family the bundled list doesn't know (shown as-is, never silently rewritten). */
  fontId: string | null | 'custom';
  /** The raw font-family value, for showing a 'custom' family honestly. */
  family: string | null;
  weight: number | null;
  color: string | null;
  /** Which edge of the text sits at the placement x (the wrapper's translateX shift). */
  align: 'left' | 'center' | 'right';
  /** Unitless line-height; null = the browser's normal. */
  lineHeight: number | null;
  /** Letter-spacing in design px; null = normal. */
  letterSpacing: number | null;
}

/** What the wrapper's transform means: the assembler expresses alignment as a shift of the
 *  shrink-to-fit box (text-align would do nothing on a box that hugs its content). */
function alignOf(css: string, wrapperId: string): 'left' | 'center' | 'right' {
  const t = readDecl(css, `#${wrapperId}`, 'transform') ?? '';
  if (t.includes('-100%')) return 'right';
  if (t.includes('-50%')) return 'center';
  return 'left';
}

/** A placed TEXT line's current look, read from its rules. Null for a non-text placed
 *  field (an image slot has no font-size rule) or an unplaced selector. */
export function lineTextStyle(html: string, css: string, fieldId: string): LineTextStyle | null {
  const place = placedLines(html, css)[`#${fieldId}`];
  if (!place) return null;
  const fontSize = lineFontSize(css, fieldId);
  if (!fontSize) return null; // not a text line
  const family = readDecl(css, `#${fieldId}`, 'font-family');
  const known = family ? FONTS.find((f) => family.startsWith(`"${f.family}"`)) : undefined;
  const weightRaw = readDecl(css, `#${fieldId}`, 'font-weight');
  const lineHeightRaw = readDecl(css, `#${fieldId}`, 'line-height');
  const spacing = readPx(css, `#${fieldId}`, 'letter-spacing');
  return {
    fontSize,
    fontId: family === 'var(--font-heading)' || !family ? null : known ? known.id : 'custom',
    family,
    weight: weightRaw && /^\d+$/.test(weightRaw) ? parseInt(weightRaw, 10) : null,
    color: readDecl(css, `#${fieldId}`, 'color'),
    align: alignOf(css, place.wrapperId),
    lineHeight: lineHeightRaw && /^[\d.]+$/.test(lineHeightRaw) ? parseFloat(lineHeightRaw) : null,
    letterSpacing: spacing?.value ?? null,
  };
}

export interface LineTextPatch {
  /** A bundled font id, or null for the design font (--font-heading). */
  fontId?: string | null;
  /** Design px (written in the rule's own idiom, like the corner handle). */
  fontSize?: number;
  weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  /** Design px. */
  letterSpacing?: number;
}

/**
 * Restyle a placed TEXT line: each given property becomes one declaration patch on the
 * line's own `#fN` rule (alignment on its wrapper), in the idiom the rule already uses.
 * Picking a bundled font also makes sure its @font-face ships in the CSS — the same
 * visible, commented rule the assembler emits, deduped — so the preview and every export
 * render it without any manual step. Returns null when the selector is not a placed text
 * line (the caller simply doesn't offer the controls then).
 */
export function setLineTextStyle(
  template: SpxTemplate,
  fieldId: string,
  patch: LineTextPatch,
): SpxTemplate | null {
  const place = placedLines(template.html, template.css)[`#${fieldId}`];
  if (!place) return null;
  const font = lineFontSize(template.css, fieldId);
  if (!font) return null; // not a text line
  let css = template.css;
  const sel = `#${fieldId}`;

  if (patch.fontId !== undefined) {
    if (patch.fontId) {
      const bundled = fontById(patch.fontId);
      css = setCssDeclaration(css, sel, 'font-family', fontStack(bundled));
      // The face must ship with the template (offline-first). Deduped by the emitted rule,
      // so re-picking a font — or picking the heading font — adds nothing.
      const face = fontFaceCss(bundled);
      if (!css.includes(face)) css = `${css.replace(/\s*$/, '')}\n\n${face}\n`;
    } else {
      css = setCssDeclaration(css, sel, 'font-family', 'var(--font-heading)');
    }
  }
  if (patch.fontSize !== undefined) {
    css = setCssDeclaration(css, sel, 'font-size', placementCss(patch.fontSize, font.scaled));
  }
  if (patch.weight !== undefined) css = setCssDeclaration(css, sel, 'font-weight', String(patch.weight));
  if (patch.color !== undefined) css = setCssDeclaration(css, sel, 'color', patch.color);
  if (patch.lineHeight !== undefined) css = setCssDeclaration(css, sel, 'line-height', String(patch.lineHeight));
  if (patch.letterSpacing !== undefined) {
    css = setCssDeclaration(css, sel, 'letter-spacing', placementCss(patch.letterSpacing, font.scaled));
  }
  if (patch.align !== undefined) {
    const shift =
      patch.align === 'center' ? 'translateX(-50%)' : patch.align === 'right' ? 'translateX(-100%)' : 'none';
    css = setCssDeclaration(css, `#${place.wrapperId}`, 'transform', shift);
  }
  return { ...template, css };
}

// ── The line's FIT — how a long operator value answers the room the design gives it ──────
//
// The bug this exists for: a placed line was `white-space: nowrap` with no width cap, so a
// long name ran clean off the artwork (and off the frame). The wrapper's `max-width` is the
// slot; the MODE is how the text responds when the value outgrows it. See
// templates/shared/textFit.ts for the contract and the shrink runtime.

export type LineFitMode = 'overflow' | 'wrap' | 'shrink';

export interface LineFit {
  mode: LineFitMode;
  /** The slot width in design px, or null when the line is uncapped ('overflow'). */
  maxWidth: number | null;
  scaled: boolean;
  /** True when the slot carries the stretch-mode `+ var(--stretch-x)` term — it grows with
   *  the design. Writes must mirror it (placementCss's third argument) or the slot stops
   *  growing the moment its width is edited. */
  stretch: boolean;
}

/** True when the field's element carries `data-fit="shrink"` (the runtime's marker). */
function hasShrinkMark(html: string, fieldId: string): boolean {
  const tag = html.match(new RegExp(`<[a-zA-Z][^>]*\\bid=["']${escapeRe(fieldId)}["'][^>]*>`));
  return !!tag && /\bdata-fit\s*=\s*["']shrink["']/.test(tag[0]);
}

/** Add or remove `data-fit="shrink"` on the field's own tag (nothing else is touched). */
function setShrinkMark(html: string, fieldId: string, on: boolean): string {
  return html.replace(
    new RegExp(`<[a-zA-Z][^>]*\\bid=["']${escapeRe(fieldId)}["'][^>]*>`),
    (tag) => {
      const stripped = tag.replace(/\s*\bdata-fit\s*=\s*["'][^"']*["']/, '');
      if (!on) return stripped;
      return stripped.replace(/\s*(\/?)>$/, ` data-fit="shrink"$1>`);
    },
  );
}

/**
 * A placed line's fit, derived from the code like every other reader here: the cap comes
 * from the wrapper's `max-width`, and the mode from the field's own markup/CSS. No cap (or
 * an explicit `none`) means the line is uncapped, which is exactly the pre-fit behaviour —
 * so a template saved before this contract reads as 'overflow' and nothing changes under it.
 */
export function lineFit(html: string, css: string, fieldId: string): LineFit | null {
  const place = placedLines(html, css)[`#${fieldId}`];
  if (!place) return null;
  const cap = readPx(css, `#${place.wrapperId}`, 'max-width');
  if (!cap) return { mode: 'overflow', maxWidth: null, scaled: place.scaled, stretch: false };
  return {
    mode: hasShrinkMark(html, fieldId) ? 'shrink' : 'wrap',
    maxWidth: cap.value,
    scaled: cap.scaled,
    stretch: cap.stretch ?? false,
  };
}

/**
 * Emit the shrink runtime into a template's JS, once. Idempotent (the shared-bootstrap
 * pattern blocks/lottieInsert.ts uses): the block is appended only when absent, and the
 * shared update()'s optional hook is added only when the template predates it — a project
 * created before the fit contract still gets working shrink, with no other line touched.
 *
 * An IMPORTED SVG is the one design that already has a fit: its ladder measures placed lines
 * too (docs/SVG_IMPORT_PLAN.md §6b), so a template carrying it is left exactly as it is — one
 * fit per graphic, and the ladder is the one that can report a value as too long.
 */
export function ensureTextFitRuntime(template: SpxTemplate): SpxTemplate {
  if (template.js.includes(SVG_TEXT_FIT_MARKER)) return template;
  let js = template.js;
  if (!js.includes(TEXT_FIT_MARKER)) {
    js = appendJs(js, 'Fit placed text to its slot (design-owned — the timeline never touches this).', TEXT_FIT_RUNTIME_JS);
  }
  if (!js.includes('typeof fitPlacedText')) {
    // The generated update()'s exact shape (templates/shared/base.ts runtimeJs). A
    // hand-rewritten update() simply keeps its own behaviour: the DOM-ready pass still
    // fits the design's own sample text, and the author can call fitPlacedText() himself.
    js = js.replace(
      /(if \(el\) setFieldValue\(el, fields\[key\]\);\n {2}\}\n)\}/,
      `$1${TEXT_FIT_HOOK}\n}`,
    );
  }
  return js === template.js ? template : { ...template, js };
}

/**
 * Set a placed line's fit. One deterministic patch per decision: the wrapper's cap, the
 * line's wrapping, and the shrink marker — plus the runtime when shrink first appears.
 * Returns null when the selector is not a placed text line.
 */
export function setLineFit(
  template: SpxTemplate,
  fieldId: string,
  patch: { mode?: LineFitMode; maxWidth?: number },
): SpxTemplate | null {
  const current = lineFit(template.html, template.css, fieldId);
  const place = placedLines(template.html, template.css)[`#${fieldId}`];
  if (!current || !place || !lineFontSize(template.css, fieldId)) return null;

  const mode = patch.mode ?? current.mode;
  const scaled = current.scaled || place.scaled;
  // Switching away from 'overflow' needs a slot to fit into: keep the one that is there,
  // else fall back to the room between the line and the artwork's right edge.
  const boxWidth = designBoxInfo(template.html, template.css)?.boxWidth ?? 1920;
  const maxWidth =
    patch.maxWidth ?? current.maxWidth ?? Math.max(64, Math.round(boxWidth - place.x - boxWidth * 0.04));

  let html = template.html;
  let css = template.css;
  const wrap = `#${place.wrapperId}`;
  const sel = `#${fieldId}`;

  // A slot that grew with the design keeps growing (mirror the idiom, as with `scaled`); a
  // NEW cap on a stretch design's line left of the right cap gets the growing idiom too —
  // that is a driver's slot by construction.
  const stretchInfo = designStretchInfo(template.html, template.css);
  const stretchSlot = current.stretch || (!!stretchInfo && place.x < stretchInfo.right);

  if (mode === 'overflow') {
    css = setCssDeclaration(css, wrap, 'max-width', 'none');
    css = setCssDeclaration(css, sel, 'white-space', 'nowrap');
    html = setShrinkMark(html, fieldId, false);
  } else {
    css = setCssDeclaration(css, wrap, 'max-width', placementCss(maxWidth, scaled, stretchSlot));
    if (mode === 'wrap') {
      css = setCssDeclaration(css, sel, 'white-space', 'normal');
      css = setCssDeclaration(css, sel, 'overflow-wrap', 'break-word');
    } else {
      css = setCssDeclaration(css, sel, 'white-space', 'nowrap');
    }
    html = setShrinkMark(html, fieldId, mode === 'shrink');
  }

  const next: SpxTemplate = { ...template, html, css };
  return mode === 'shrink' ? ensureTextFitRuntime(next) : next;
}

// ── Adding a placed line — the Data panel's add-field on an imported design ──────────────

/**
 * The placed-design shape, code-derived like everything here: a standard-contract box whose
 * design unit carries a `<prefix>-art` element (the imported-design contract — the artwork IS
 * the design, docs/IMPORT_MVP.md). Returns the prefix and the box's design-px width (the
 * space line positions are measured in), or null when the template has no such shape.
 */
export function designBoxInfo(html: string, css: string): { prefix: string; boxWidth: number } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const box = doc.querySelector('[class*="-box"]');
  const boxClass = box ? Array.from(box.classList).find((c) => c.endsWith('-box')) : undefined;
  if (!box || !boxClass) return null;
  const prefix = boxClass.slice(0, -'-box'.length);
  if (!doc.querySelector(`.${prefix}-art`)) return null;
  const width = readPx(css, `.${boxClass}`, 'width');
  return { prefix, boxWidth: width?.value ?? 1920 };
}

/** The horizontal 9-slice guides of a stretch-mode design, in design px from the artwork's
 *  left edge: `left` = where the left cap ends, `right` = where the right cap starts. */
export interface DesignStretchInfo {
  left: number;
  right: number;
}

/**
 * A design's stretch mode + guides, derived from the WORKING declarations the assembler
 * emits (never stored beside them): a `.{prefix}-art` rule carrying a `border-image-slice`
 * and readable cap widths IS stretch mode; anything else — including every template saved
 * before the mode existed — reads as fixed (null), and nothing changes under it.
 */
export function designStretchInfo(html: string, css: string): DesignStretchInfo | null {
  const box = designBoxInfo(html, css);
  if (!box) return null;
  const art = `.${box.prefix}-art`;
  if (!readDecl(css, art, 'border-image-slice')) return null;
  const capLeft = readPx(css, art, 'border-left-width');
  const capRight = readPx(css, art, 'border-right-width');
  if (!capLeft || !capRight) return null;
  return { left: capLeft.value, right: box.boxWidth - capRight.value };
}

/** The reference line a new one inherits its look from: the LOWEST placed line (the design
 *  reads top-down, so the newest line stacks under it and matches its supporting-text look). */
function referenceLine(
  placed: Record<string, LinePlacement>,
): { place: LinePlacement; fieldId: string } | null {
  let best: { place: LinePlacement; fieldId: string } | null = null;
  for (const [selector, place] of Object.entries(placed)) {
    if (!best || place.y > best.place.y) best = { place, fieldId: selector.slice(1) };
  }
  return best;
}

/** A declaration's raw value inside a rule (for inheriting a sibling's color/weight). */
function readDecl(css: string, selector: string, prop: string): string | null {
  const rule = css.match(new RegExp(`${escapeRe(selector)}\\s*\\{([^}]*)\\}`));
  if (!rule) return null;
  const m = rule[1].match(new RegExp(`(?:^|[^-\\w])${prop}\\s*:\\s*([^;}]+)`));
  return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim() : null;
}

export interface NewPlacedLineSpec {
  /** The operator-facing field title, e.g. "Sponsor". */
  title: string;
  /** The single-line field kinds a placed text element can carry. */
  ftype: 'textfield' | 'number';
  /** Where the line's wrapper lands, in design px from the artwork's top-left. Absent =
   *  the stacking default (under the lowest line, or the lower-left of a bare design).
   *  The canvas text tools pass the clicked / dragged point here. */
  at?: { x: number; y: number };
  /** The initial shown text (markup + DataField value). Absent = the title (the Data
   *  panel's add); '' = born empty (the T tool — the user types the first value). */
  text?: string;
  /** Explicit design font-size in px (the Prepare step's erased-region field, sized from
   *  the text the user marked). Absent = inherit from the reference line / the default. */
  fontSize?: number;
  /** Explicit slot width in design px. Absent = the room to the artwork's right edge. */
  maxWidth?: number;
  /** Explicit text colour (the erased-region field contrasts against its sampled fill).
   *  Absent = inherit from the reference line / the design default. */
  color?: string;
  /** Which edge of the text sits at `at.x` — the assembler's anchor idiom (a translateX
   *  shift of the shrink-to-fit box). Absent = 'left', the stacking default. */
  align?: 'left' | 'center' | 'right';
  /** A unitless line-height on the span. Absent = the browser's normal. The Prepare step's
   *  seeded field pins it to 1 so its box is exactly one em tall, which is what lets the
   *  placement put the new text where the erased text actually sat. */
  lineHeight?: number;
}

/**
 * The HTML line a new placed element is inserted AFTER: the last mask (or the artwork), so
 * the design unit keeps its top-down reading order. The artwork may be an inlined `<svg>`
 * spanning many lines (templates/importedDesign/svg.ts) — its class sits on the OPENING tag,
 * and inserting right after that line would put HTML inside the SVG; so for an svg art the
 * answer is the line its `</svg>` closes on. The class test tolerates other classes beside
 * ours (an SVG root keeps whatever class the designer gave it; ours is appended). -1 when the
 * template has no design unit at all.
 */
function placedInsertIndex(lines: string[], prefix: string): number {
  const inBoxRe = new RegExp(`class="[^"]*\\b${escapeRe(prefix)}-(?:mask|art)\\b[^"]*"`);
  let insertAt = -1;
  lines.forEach((l, i) => {
    if (!inBoxRe.test(l)) return;
    insertAt = i;
    if (/<svg\b/i.test(l) && !/<\/svg>/i.test(l)) {
      const close = lines.findIndex((m, j) => j > i && /<\/svg>/i.test(m));
      if (close !== -1) insertAt = close;
    }
  });
  return insertAt;
}

/**
 * Add a NEW placed text line to an imported design — the Data panel's add-field made real.
 * One pure transform emits everything a field needs to exist end to end: the mask wrapper +
 * `#fN` span in the design unit (which makes it a registry `line` part — selectable,
 * animatable, a timeline row), the wrapper's placement rule + the span's type rule in the
 * assembler's own idiom (so the canvas drag and resize handle read it back), and the SPX
 * DataField (which the shared runtime's update() already binds by id — no JS changes).
 *
 * The new line lands stacked under the lowest existing line, inheriting its look; the first
 * line of a bare design starts in the artwork's lower-left, the lower-third convention.
 * Returns null when the template is not a placed-design shape, which sends the caller on to
 * addCatalogLine and, failing that, to REFUSING the add with the reason.
 */
export function addPlacedLine(
  template: SpxTemplate,
  spec: NewPlacedLineSpec,
): { template: SpxTemplate; fieldId: string } | null {
  const info = designBoxInfo(template.html, template.css);
  if (!info) return null;
  const { prefix, boxWidth } = info;

  const fieldId = nextFieldId(template.fields);
  const wrapperId = `fw${fieldId.slice(1)}`;
  // A hand-edited template could already use this wrapper id for something else — a duplicate
  // id would break the placement contract, so bail rather than write a broken placement.
  if (new RegExp(`\\bid=["']${wrapperId}["']`).test(template.html)) return null;

  // Where the line starts life, and what it looks like: stacked under the LOWEST existing
  // line, matching its size/weight/color (siblings read as one design); on a bare design,
  // the artwork's lower-left — every value is a starting point the user drags and restyles.
  const placed = placedLines(template.html, template.css);
  const ref = referenceLine(placed);
  const refFont = ref ? lineFontSize(template.css, ref.fieldId) : null;
  const fontSize = spec.fontSize ?? refFont?.value ?? Math.max(14, Math.round(boxWidth * 0.016));
  const scaled = ref ? ref.place.scaled : true;
  // An explicit position (the canvas text tools' click / drag point) wins; otherwise the
  // stacking default keeps the Data panel's add reading top-down like the design does.
  const x = spec.at
    ? Math.round(spec.at.x)
    : ref ? Math.min(...Object.values(placed).map((p) => p.x)) : Math.round(boxWidth * 0.06);
  const y = spec.at
    ? Math.round(spec.at.y)
    : ref ? Math.round(ref.place.y + fontSize * 1.6) : Math.round(boxWidth * (9 / 16) * 0.74);
  const weight = (ref && readDecl(template.css, `#${ref.fieldId}`, 'font-weight')) ?? '400';
  const color =
    spec.color ?? (ref && readDecl(template.css, `#${ref.fieldId}`, 'color')) ?? 'var(--text-color)';

  const sample = spec.text ?? (spec.ftype === 'number' ? '0' : spec.title);
  // Alignment is a SHIFT of the shrink-to-fit box, not a text-align (which would do nothing
  // on a box that hugs its content) — the assembler's own idiom, and what lineTextStyle's
  // `align` reads back for the Inspector.
  const anchorShift =
    spec.align === 'center' ? 'translateX(-50%)' : spec.align === 'right' ? 'translateX(-100%)' : null;

  // The markup, in the assembler's exact shape: the wrapper carries the POSITION (and the
  // mask an entrance can slide the text inside); the span carries the TYPE. Inserted after
  // the last mask (or the artwork), so the design unit keeps its top-down reading order.
  const lines = template.html.split('\n');
  const insertAt = placedInsertIndex(lines, prefix);
  if (insertAt === -1) return null;
  // The new line FITS by default: it keeps one row and condenses if the operator's value
  // outgrows the room between it and the artwork's right edge (or the explicit slot the
  // caller measured — the erased region's width). Without a cap a long name runs off the
  // design (and off the frame) - the fit contract exists for exactly that.
  //
  // On a STRETCH design, a line left of the right cap DRIVES the stretch: its wrapper is
  // marked data-stretch (the runtime measures those), its default slot runs to where the
  // right cap starts, and the slot carries the growing idiom so the fit runtime sees the
  // room the stretch opened. Lines in the right cap (and every fixed design) are unchanged.
  const stretchInfo = designStretchInfo(template.html, template.css);
  const driver = !!stretchInfo && x < stretchInfo.right;
  // The room the design gives this line, measured from its ANCHOR outwards: to the right for
  // a left-anchored line, both ways for a centred one, leftwards for a right-anchored one.
  const roomRight = driver && stretchInfo ? stretchInfo.right - x : boxWidth - x - boxWidth * 0.04;
  const maxWidth =
    spec.maxWidth ??
    Math.max(
      64,
      Math.round(
        spec.align === 'center' ? 2 * Math.min(x - boxWidth * 0.04, roomRight)
        : spec.align === 'right' ? x - boxWidth * 0.04
        : roomRight,
      ),
    );

  lines.splice(
    insertAt + 1,
    0,
    `    <!-- ${spec.title} (${fieldId}) — SPX writes this field's value straight into the element. -->`,
    `    <div class="${prefix}-mask" id="${wrapperId}"${driver ? ' data-stretch' : ''}><span id="${fieldId}" data-fit="shrink">${escapeHtml(sample)}</span></div>`,
  );
  const html = lines.join('\n');

  // The rules, in the assembler's idiom — which is exactly what placedLines/lineFontSize
  // read back, so the canvas drag, nudge, and resize handle work on the new line unchanged.
  const css = appendCss(
    template.css,
    `${spec.title} (${fieldId}) — drag it on the canvas to move it.`,
    `#${wrapperId} {
  position: absolute;
  left: ${placementCss(x, scaled)};   /* measured from the artwork's left edge */
  top: ${placementCss(y, scaled)};    /* …and from its top edge */${
    anchorShift
      ? `\n  transform: ${anchorShift};  /* ${spec.align === 'center' ? 'centred' : 'right-aligned'} on that point — the box hugs its text, so the shift is the alignment */`
      : ''
  }
  max-width: ${placementCss(maxWidth, scaled, driver)};  /* the slot: how much room the design gives this line */
  overflow: hidden;                 /* the line's mask — an entrance can slide the text within it */
}
#${fieldId} {
  display: inline-block;            /* so the line can move inside its mask */
  white-space: nowrap;              /* one row — data-fit="shrink" condenses a long value instead of reflowing */
  font-family: var(--font-heading);
  font-size: ${placementCss(fontSize, scaled)};
  font-weight: ${weight};${spec.lineHeight != null ? `\n  line-height: ${spec.lineHeight};` : ''}
  color: ${color};
}`,
  );

  // The SPX DataField (update() binds it by id — the shared runtime needs no change) and the
  // layer metadata, matching what the assembler records at create.
  let next = addFieldToDefinition({ ...template, html, css }, {
    field: fieldId,
    ftype: spec.ftype,
    title: spec.title,
    value: sample,
  });
  next = addLayer(next, {
    id: fieldId,
    type: 'text',
    label: spec.title,
    fieldId,
    text: sample,
    styles: {},
  });
  // The shrink marker above needs its runtime (idempotent — later lines add nothing).
  next = ensureTextFitRuntime(next);
  return { template: next, fieldId };
}

/**
 * Add a placed IMAGE slot to an imported design — the Data panel's Image add made real.
 * Same shape as addPlacedLine, with an `<img id="fN">` in the mask (a registry `image`
 * part) and a sized slot box on the wrapper: the empty slot shows a dashed outline (the
 * house rule — image placeholders are visible, never invisible), a chosen image fills it
 * with object-fit: contain, and the shared runtime's setFieldValue already handles the
 * `<img>` show/hide + `.has-image` toggle. The field is an SPX `filelist` listing the
 * project's images/ folder, exactly like the catalog's logo slots.
 *
 * The slot starts on the design's right, level with the topmost line (the lower-third
 * logo convention) — a starting point the user drags; the corner handle resizes the box
 * (slotSize/setSlotSize). Returns null when the template is not a placed-design shape.
 */
export function addPlacedImageSlot(
  template: SpxTemplate,
  spec: { title: string },
): { template: SpxTemplate; fieldId: string } | null {
  const info = designBoxInfo(template.html, template.css);
  if (!info) return null;
  const { prefix, boxWidth } = info;

  const fieldId = nextFieldId(template.fields);
  const wrapperId = `fw${fieldId.slice(1)}`;
  if (new RegExp(`\\bid=["']${wrapperId}["']`).test(template.html)) return null;

  const placed = placedLines(template.html, template.css);
  const entries = Object.values(placed);
  const scaled = entries.length > 0 ? entries.every((p) => p.scaled) : true;
  const size = Math.round(boxWidth * 0.0625); // 120 at 1920 — a lower-third logo size
  const x = Math.round(boxWidth * 0.8);
  const y = entries.length
    ? Math.min(...entries.map((p) => p.y))
    : Math.round(boxWidth * (9 / 16) * 0.72);

  const lines = template.html.split('\n');
  const insertAt = placedInsertIndex(lines, prefix);
  if (insertAt === -1) return null;
  lines.splice(
    insertAt + 1,
    0,
    `    <!-- ${spec.title} (${fieldId}) — an image slot: SPX fills it from the images/ folder. -->`,
    `    <div class="${prefix}-mask" id="${wrapperId}"><img id="${fieldId}" alt="" /></div>`,
  );
  const html = lines.join('\n');

  const css = appendCss(
    template.css,
    `${spec.title} (${fieldId}) — an image slot; drag it on the canvas to move it.`,
    `#${wrapperId} {
  position: absolute;
  left: ${placementCss(x, scaled)};   /* measured from the artwork's left edge */
  top: ${placementCss(y, scaled)};    /* …and from its top edge */
  width: ${placementCss(size, scaled)};    /* the slot's box — the corner handle resizes it */
  height: ${placementCss(size, scaled)};
  overflow: hidden;                 /* the slot's mask — an entrance can slide the image within it */
}
#${wrapperId}:not(.has-image) {
  outline: 2px dashed rgba(255, 255, 255, 0.35);  /* the empty slot stays visible — pick an image to fill it */
  outline-offset: -2px;
}
#${fieldId} {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;              /* the image fits the slot without distortion */
}`,
  );

  let next = addFieldToDefinition({ ...template, html, css }, {
    field: fieldId,
    ftype: 'filelist',
    title: spec.title,
    value: '',
    assetfolder: './images/',
    extension: 'png',
  });
  next = addLayer(next, {
    id: fieldId,
    type: 'image',
    label: spec.title,
    fieldId,
    styles: {},
  });
  return { template: next, fieldId };
}
